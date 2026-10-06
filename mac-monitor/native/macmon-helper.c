// macOS 전용. 시스템 카운터는 원시값, 앱 목록만 여기서 집계한다.
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <libproc.h>
#include <sys/sysctl.h>
#include <sys/resource.h>
#include <sys/mount.h>
#include <sys/select.h>
#include <errno.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#include <signal.h>
#define TOP_GROUPS 10

typedef struct { pid_t pid; uint64_t start, cpu, foot; double percent; int valid_cpu; char name[256], process_name[256], path[512]; } Proc;
typedef struct { char name[256]; double cpu; uint64_t foot; int count, valid_cpu, selected; } Group;
static Proc *previous; static size_t previous_n; static uint64_t previous_time;
static mach_timebase_info_data_t tb;
static mach_port_t host; static int cores=0, active=0; static volatile sig_atomic_t stopped=0;
static struct statfs disk;static uint64_t disk_next=0;static double disk_time=0;static int disk_ok=0;
static uint64_t mono_ns(void) { return mach_absolute_time() * (long double)tb.numer / tb.denom; }
static void stop_signal(int sig) { (void)sig; stopped=1; }
static void json_string(const char *s) {
  putchar('"'); for (const unsigned char *p=(const unsigned char*)s; *p; p++) {
    if (*p=='"'||*p=='\\') { putchar('\\'); putchar(*p); }
    else if (*p<32) printf("\\u%04x",*p); else putchar(*p);
  } putchar('"');
}
static int cmp_pid(const void *a,const void *b) { pid_t x=((const Proc*)a)->pid,y=((const Proc*)b)->pid; return (x>y)-(x<y); }
static int cmp_mem(const void *a,const void *b) { uint64_t x=((const Group*)a)->foot,y=((const Group*)b)->foot; return (x<y)-(x>y); }
static int cmp_cpu(const void *a,const void *b) {
  const Group *ga=a,*gb=b; if(!!ga->valid_cpu!=!!gb->valid_cpu) return ga->valid_cpu?-1:1;
  double x=((const Group*)a)->cpu,y=((const Group*)b)->cpu; return (x<y)-(x>y); }
static void name_of(pid_t pid,char *out,char *executable) {
  char path[PROC_PIDPATHINFO_MAXSIZE]={0};
  if(proc_pidpath(pid,path,sizeof path)<=0) {
    if(proc_name(pid,out,256)<=0) snprintf(out,256,"pid %d",pid); return;
  }
  if(strlen(path)<512) strcpy(executable,path);
  if(strstr(path,"/claude/versions/")) { strcpy(out,"claude"); return; }
  char *app=strstr(path,".app/");
  if(app) { *app=0; char *base=strrchr(path,'/'); snprintf(out,256,"%s",base?base+1:path); return; }
  char *base=strrchr(path,'/'); snprintf(out,256,"%s",base?base+1:path);
}
static void print_groups(Group *g,size_t n,int ready) {
  putchar('['); for(size_t i=0;i<n&&i<TOP_GROUPS;i++) {
    if(i) putchar(','); printf("{\"name\":"); json_string(g[i].name);
    printf(",\"memoryBytes\":%"PRIu64",\"processCount\":%d,\"cpuPercent\":",g[i].foot,g[i].count);
    if(ready&&g[i].valid_cpu) printf("%.6f",g[i].cpu); else printf("null"); putchar('}');
  } putchar(']');
}
static int print_procs(uint64_t now) {
  if(!active) { printf("null"); return 0; }
  if(cores<=0) { printf("null"); return -1; }
  int cap=proc_listallpids(NULL,0);
  if(cap<=0) { printf("null"); return -1; }
  cap+=512;
  pid_t *pids=calloc((size_t)cap,sizeof(pid_t));
  Proc *current=calloc((size_t)cap,sizeof(Proc)); Group *groups=calloc((size_t)cap,sizeof(Group));
  if(!pids||!current||!groups) { free(pids);free(current);free(groups);printf("null");return -1; }
  int listed=proc_listallpids(pids,cap*(int)sizeof(pid_t));
  if(listed<=0||listed>=cap) { free(pids);free(current);free(groups);printf("null");return -1; }
  size_t n=0,ng=0; int denied=0,root=0,other=0,ready=previous_time>0&&now>previous_time;
  double elapsed=(now-previous_time)/1e9;
  for(int i=0;i<listed;i++) {
    struct rusage_info_v4 ri;
    if(proc_pid_rusage(pids[i],RUSAGE_INFO_V4,(rusage_info_t*)&ri)!=0) {
      if(errno==EPERM||errno==EACCES) {
        denied++; struct proc_bsdshortinfo si;
        if(proc_pidinfo(pids[i],PROC_PIDT_SHORTBSDINFO,0,&si,sizeof si)==sizeof si&&si.pbsi_uid==0) root++;
      } else other++;
      continue;
    }
    Proc *p=&current[n++]; p->pid=pids[i];p->start=ri.ri_proc_start_abstime;
    p->cpu=ri.ri_user_time+ri.ri_system_time;p->foot=ri.ri_phys_footprint;
    Proc *old=previous_n?bsearch(p,previous,previous_n,sizeof(Proc),cmp_pid):NULL;
    if(old&&old->start==p->start) { strcpy(p->name,old->name);strcpy(p->process_name,old->process_name);strcpy(p->path,old->path); }
    else { name_of(p->pid,p->name,p->path);if(proc_name(p->pid,p->process_name,sizeof p->process_name)<=0) strcpy(p->process_name,p->name); }
    double cpu=0;
    int valid_cpu=ready&&old&&old->start==p->start&&p->cpu>=old->cpu;
    if(valid_cpu)
      cpu=(p->cpu-old->cpu)*(long double)tb.numer/tb.denom/1e9/elapsed*100/cores;
    p->percent=cpu;p->valid_cpu=valid_cpu;
    size_t j=0; for(;j<ng;j++) if(!strcmp(groups[j].name,p->name)) break;
    if(j==ng) { strcpy(groups[ng].name,p->name);ng++; }
    groups[j].foot+=p->foot;groups[j].cpu+=cpu;groups[j].count++;groups[j].valid_cpu+=valid_cpu;
  }
  if(!n) { free(pids);free(current);free(groups);printf("null");return -1; }
  printf("{\"ready\":%s,\"sampledAt\":%.0f,\"excludedPermission\":%d,\"excludedRoot\":%d,\"otherErrors\":%d,\"coreCount\":%d,\"topCpu\":",ready?"true":"false",clock_gettime_nsec_np(CLOCK_REALTIME)/1e6,denied,root,other,cores);
  qsort(groups,ng,sizeof(Group),cmp_cpu); print_groups(groups,ng,ready);
  for(size_t i=0;i<ng&&i<TOP_GROUPS;i++) groups[i].selected=1;
  printf(",\"topMemory\":"); qsort(groups,ng,sizeof(Group),cmp_mem);print_groups(groups,ng,ready);
  for(size_t i=0;i<ng&&i<TOP_GROUPS;i++) groups[i].selected=1;
  printf(",\"members\":[");int first=1;
  for(size_t i=0;i<n;i++) {
    Proc *p=&current[i];size_t j=0;for(;j<ng;j++) if(groups[j].selected&&!strcmp(groups[j].name,p->name)) break;
    if(j==ng) continue;
    if(!first) putchar(',');first=0;
    printf("{\"pid\":%d,\"start\":\"%"PRIu64"\",\"group\":",p->pid,p->start);json_string(p->name);
    printf(",\"path\":");if(p->path[0]) json_string(p->path);else printf("null");
    printf(",\"name\":");json_string(p->process_name);printf(",\"memoryBytes\":%"PRIu64",\"cpuPercent\":",p->foot);
    if(p->valid_cpu) printf("%.6f",p->percent);else printf("null");putchar('}');
  }
  printf("]}");
  qsort(current,n,sizeof(Proc),cmp_pid);free(previous);previous=current;previous_n=n;previous_time=now;
  free(groups);free(pids);return 0;
}
static void sample(uint64_t seq) {
  const char *errors[16]; int ne=0; size_t len; uint64_t mem; vm_size_t page;
  printf("{\"v\":1,\"seq\":%"PRIu64",\"t\":%.0f,\"mono\":%.3f,\"sys\":{\"pageSize\":",seq,clock_gettime_nsec_np(CLOCK_REALTIME)/1e6,mono_ns()/1e6);
  if(host_page_size(host,&page)==KERN_SUCCESS) printf("%lu",(unsigned long)page);else { printf("null");errors[ne++]="host_page_size 실패"; }
  printf(",\"memsize\":");len=sizeof mem;
  if(sysctlbyname("hw.memsize",&mem,&len,NULL,0)==0) printf("%"PRIu64,mem);else {printf("null");errors[ne++]="hw.memsize 실패";}
  vm_statistics64_data_t vm;mach_msg_type_number_t count=HOST_VM_INFO64_COUNT;
  printf(",\"vm\":");
  if(host_statistics64(host,HOST_VM_INFO64,(host_info64_t)&vm,&count)==KERN_SUCCESS)
    printf("{\"internal\":%u,\"purgeable\":%u,\"wire\":%u,\"compressor\":%u,\"external\":%u,\"free\":%u,\"speculative\":%u}",vm.internal_page_count,vm.purgeable_count,vm.wire_count,vm.compressor_page_count,vm.external_page_count,vm.free_count,vm.speculative_count);
  else {printf("null");errors[ne++]="HOST_VM_INFO64 실패";}
  host_cpu_load_info_data_t cpu; count=HOST_CPU_LOAD_INFO_COUNT;printf(",\"cpu\":");
  if(host_statistics(host,HOST_CPU_LOAD_INFO,(host_info_t)&cpu,&count)==KERN_SUCCESS)
    printf("{\"user\":%u,\"system\":%u,\"idle\":%u,\"nice\":%u}",cpu.cpu_ticks[CPU_STATE_USER],cpu.cpu_ticks[CPU_STATE_SYSTEM],cpu.cpu_ticks[CPU_STATE_IDLE],cpu.cpu_ticks[CPU_STATE_NICE]);
  else {printf("null");errors[ne++]="HOST_CPU_LOAD_INFO 실패";}
  struct xsw_usage swap;len=sizeof swap;printf(",\"swap\":");
  if(sysctlbyname("vm.swapusage",&swap,&len,NULL,0)==0) printf("{\"total\":%"PRIu64",\"used\":%"PRIu64"}",swap.xsu_total,swap.xsu_used);
  else {printf("null");errors[ne++]="vm.swapusage 실패";}
  const char *keys[]={"kern.memorystatus_vm_pressure_level","kern.memorystatus_level"};
  const char *fields[]={"pressureLevel","memoryLevel"};
  for(int i=0;i<2;i++) { int value;len=sizeof value;printf(",\"%s\":",fields[i]);
    if(sysctlbyname(keys[i],&value,&len,NULL,0)==0) printf("%d",value);else {printf("null");errors[ne++]=keys[i];}
  }
  if(mono_ns()>=disk_next) {
    disk_ok=statfs("/System/Volumes/Data",&disk)==0&&disk.f_bsize>0&&disk.f_blocks>=disk.f_bfree&&disk.f_bavail<=disk.f_bfree;
    disk_next=mono_ns()+30000000000ULL;disk_time=clock_gettime_nsec_np(CLOCK_REALTIME)/1e6;
  }
  printf(",\"disk\":");
  if(disk_ok) printf("{\"total\":%"PRIu64",\"used\":%"PRIu64",\"available\":%"PRIu64",\"sampledAt\":%.0f}",(uint64_t)disk.f_blocks*disk.f_bsize,(uint64_t)(disk.f_blocks-disk.f_bfree)*disk.f_bsize,(uint64_t)disk.f_bavail*disk.f_bsize,disk_time);
  else {printf("null");errors[ne++]="Data 볼륨 용량 읽기 실패";}
  printf("},\"procs\":"); if(print_procs(mono_ns())!=0) { errors[ne++]="프로세스 스캔 실패";free(previous);previous=NULL;previous_n=0;previous_time=0; }
  printf(",\"errors\":[");for(int i=0;i<ne;i++) {if(i) putchar(',');json_string(errors[i]);}printf("]}\n");fflush(stdout);
}
static int protected_path(const char *file,int ancestor) {
  char lower[PROC_PIDPATHINFO_MAXSIZE];size_t n=strlen(file);if(n>=sizeof lower) return 1;
  for(size_t i=0;i<=n;i++) lower[i]=(file[i]>='A'&&file[i]<='Z')?file[i]+('a'-'A'):file[i];
  if(strstr(lower,"paseo")||strstr(lower,"codex")||strstr(lower,"claude")||strstr(lower,"macmon-helper")
    ||strstr(lower,"chrome")||strstr(lower,"safari")||strstr(lower,"firefox")) return 1;
  return !ancestor&&(strstr(lower,".app/")||!strncmp(lower,"/system/",8)||!strncmp(lower,"/usr/libexec/",13)
    ||!strncmp(lower,"/usr/sbin/",10)||!strncmp(lower,"/sbin/",6)||strstr(lower,"terminal")||strstr(lower,"iterm")||strstr(lower,"warp"));
}
static const char *terminate_one(pid_t pid,uint64_t start,const char *expected_path,int send_signal) {
  if(pid<=1||pid==getpid()) return "보호된 프로세스";
  pid_t protected_ancestors[64];size_t ancestor_n=0;
  for(pid_t parent=getppid();parent>1;) {
    if(pid==parent) return "Paseo 및 상위 프로세스는 종료할 수 없습니다";
    if(expected_path) {
      if(ancestor_n>=64) return "상위 프로세스 깊이 확인 실패";
      protected_ancestors[ancestor_n++]=parent;
    }
    struct proc_bsdshortinfo ancestor;
    if(proc_pidinfo(parent,PROC_PIDT_SHORTBSDINFO,0,&ancestor,sizeof ancestor)!=sizeof ancestor) return "상위 프로세스 확인 실패";
    if((pid_t)ancestor.pbsi_ppid==parent) return "상위 프로세스 확인 실패";
    parent=ancestor.pbsi_ppid;
  }
  struct proc_bsdshortinfo si;struct rusage_info_v4 ri;
  if(proc_pidinfo(pid,PROC_PIDT_SHORTBSDINFO,0,&si,sizeof si)!=sizeof si) return "대상 프로세스가 없습니다";
  if(si.pbsi_uid==0||si.pbsi_uid!=geteuid()) return "현재 사용자 프로세스만 종료할 수 있습니다";
  Proc key={.pid=pid};Proc *known=previous_n?bsearch(&key,previous,previous_n,sizeof(Proc),cmp_pid):NULL;
  if(!active||!known||known->start!=start) return "대상 측정값이 변경되었습니다";
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t*)&ri)!=0) return "대상 확인 권한이 없습니다";
  if(ri.ri_proc_start_abstime!=start) return "PID가 다른 프로세스로 바뀌었습니다";
  if(expected_path) {
    char executable[PROC_PIDPATHINFO_MAXSIZE];
    if(proc_pidpath(pid,executable,sizeof executable)<=0||strcmp(executable,expected_path)) return "실행 경로가 변경되었습니다";
    if(protected_path(executable,0)) return "자동 종료 보호 대상";
    pid_t ancestor=si.pbsi_ppid;int depth=0;
    for(;ancestor>1&&depth<64;depth++) {
      for(size_t i=0;i<ancestor_n;i++) if(ancestor==protected_ancestors[i]) return "작업·Paseo 하위 프로세스 보호";
      struct proc_bsdshortinfo parent_info;
      if(proc_pidinfo(ancestor,PROC_PIDT_SHORTBSDINFO,0,&parent_info,sizeof parent_info)!=sizeof parent_info
        ||proc_pidpath(ancestor,executable,sizeof executable)<=0) return "작업 상위 프로세스 확인 실패";
      if(protected_path(executable,1)) return "작업·브라우저 하위 프로세스 보호";
      if((pid_t)parent_info.pbsi_ppid==ancestor) return "상위 프로세스 확인 실패";
      ancestor=parent_info.pbsi_ppid;
    }
    if(ancestor>1) return "상위 프로세스 깊이 확인 실패";
  }
  if(send_signal&&kill(pid,SIGTERM)!=0) return "종료 신호를 보내지 못했습니다";
  return NULL;
}
static int decode_path(const char *encoded,char *out,size_t cap) {
  size_t len=strlen(encoded);if(!len||len%2||len/2>=cap) return 0;
  for(size_t i=0;i<len;i+=2) {
    unsigned value=0;
    for(size_t j=i;j<i+2;j++) {
      char c=encoded[j];int digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;
      if(digit<0) return 0;
      value=value*16+(unsigned)digit;
    }
    if(!value) return 0;out[i/2]=(char)value;
  }
  out[len/2]=0;return out[0]=='/';
}
static const char *inspect_one(pid_t pid,uint64_t start,const char *expected_path) {
  if(pid<=1) return "unknown";
  struct rusage_info_v4 ri;
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t*)&ri)!=0) {
    // 권한 실패를 종료 완료로 오인하지 않는다. kill(0)은 신호를 보내지 않는다.
    return kill(pid,0)!=0&&errno==ESRCH?"exited":"unknown";
  }
  if(ri.ri_proc_start_abstime!=start) return "exited";
  char executable[PROC_PIDPATHINFO_MAXSIZE];
  if(proc_pidpath(pid,executable,sizeof executable)<=0||strcmp(executable,expected_path)) return "unknown";
  return "running";
}
int main(int argc,char **argv) {
  mach_timebase_info(&tb);host=mach_host_self();size_t len=sizeof cores;
  if(sysctlbyname("hw.logicalcpu",&cores,&len,NULL,0)!=0||cores<1) cores=0;
  signal(SIGTERM,stop_signal);signal(SIGINT,stop_signal);signal(SIGPIPE,stop_signal);
  setvbuf(stdout,NULL,_IOLBF,0);
  if(argc==2&&!strcmp(argv[1],"--once")) {sample(0);return 0;}
  pid_t parent=getppid(); uint64_t seq=0,next=mono_ns(); char command[1200];size_t used=0;
  while(!stopped&&getppid()==parent) {
    uint64_t now=mono_ns();
    if(now>=next) { sample(seq++);next+=2000000000ULL;while(next<=mono_ns()) next+=2000000000ULL; }
    now=mono_ns();uint64_t wait=next>now?next-now:0;if(wait>1000000000ULL) wait=1000000000ULL;
    struct timeval tv={wait/1000000000ULL,(wait%1000000000ULL)/1000};fd_set fds;FD_ZERO(&fds);FD_SET(STDIN_FILENO,&fds);
    int result=select(STDIN_FILENO+1,&fds,NULL,NULL,&tv);
    if(result>0) {
      char bytes[128];ssize_t n=read(STDIN_FILENO,bytes,sizeof bytes);if(n<=0) break;
      for(ssize_t i=0;i<n;i++) {
        if(bytes[i]=='\n') {command[used]=0;
          if(!strcmp(command,"procs on")) active=1;
          if(!strcmp(command,"procs off")) {active=0;free(previous);previous=NULL;previous_n=0;previous_time=0;}
          unsigned id;int pid;uint64_t start;char extra;
          if(sscanf(command,"terminate %u %d %"SCNu64" %c",&id,&pid,&start,&extra)==3) {
            const char *error=terminate_one(pid,start,NULL,1);
            printf("{\"action\":\"terminate\",\"id\":%u,\"sent\":%s",id,error?"false":"true");
            if(error) {printf(",\"error\":");json_string(error);}printf("}\n");fflush(stdout);
          }
          char encoded[1023];
          if(sscanf(command,"terminate-auto %u %d %"SCNu64" %1022s %c",&id,&pid,&start,encoded,&extra)==4) {
            char expected[512];
            const char *error=decode_path(encoded,expected,sizeof expected)?terminate_one(pid,start,expected,1):"자동 종료 경로 형식 오류";
            printf("{\"action\":\"terminate\",\"id\":%u,\"sent\":%s",id,error?"false":"true");
            if(error) {printf(",\"error\":");json_string(error);}printf("}\n");fflush(stdout);
          }
          if(sscanf(command,"inspect %u %d %"SCNu64" %1022s %c",&id,&pid,&start,encoded,&extra)==4) {
            char expected[512];const char *state=decode_path(encoded,expected,sizeof expected)?inspect_one(pid,start,expected):"unknown";
            printf("{\"action\":\"inspect\",\"id\":%u,\"state\":\"%s\"}\n",id,state);fflush(stdout);
          }
          if(sscanf(command,"check-auto %u %d %"SCNu64" %1022s %c",&id,&pid,&start,encoded,&extra)==4) {
            char expected[512];const char *error=decode_path(encoded,expected,sizeof expected)?terminate_one(pid,start,expected,0):"자동 종료 경로 형식 오류";
            printf("{\"action\":\"validate\",\"id\":%u,\"allowed\":%s",id,error?"false":"true");
            if(error) {printf(",\"error\":");json_string(error);}printf("}\n");fflush(stdout);
          }
          used=0;
        } else if(used<sizeof command-1) command[used++]=bytes[i];
      }
    } else if(result<0&&errno!=EINTR) break;
  }
  free(previous);mach_port_deallocate(mach_task_self(),host);return 0;
}
