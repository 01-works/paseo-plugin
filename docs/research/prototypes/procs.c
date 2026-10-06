// Per-process scan: proc_listallpids + proc_pid_rusage(V4) + proc_pidpath, group by outermost .app bundle.
#include <libproc.h>
#include <sys/resource.h>
#include <mach/mach_time.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <time.h>
#define MAXP 8192
typedef struct { pid_t pid; uint64_t cpu_abs, foot; char group[256]; int ok; } P;
static uint64_t now_ns(void){ return clock_gettime_nsec_np(CLOCK_UPTIME_RAW); }
static void group_of(pid_t pid, char *out){
  char path[PROC_PIDPATHINFO_MAXSIZE];
  if (proc_pidpath(pid, path, sizeof path) <= 0){ // fallback: proc_name
    char nm[64]={0}; if (proc_name(pid,nm,sizeof nm)<=0) strcpy(nm,"?"); snprintf(out,256,"[%s]",nm); return; }
  char *app = strstr(path, ".app/"); // outermost bundle: first ".app/"
  if (app){ *app=0; char *s=strrchr(path,'/'); snprintf(out,256,"%s.app", s?s+1:path); return; }
  char *s=strrchr(path,'/'); snprintf(out,256,"%s", s?s+1:path);
}
static int scan(P *ps, int *eperm, int *other, int with_path){
  static pid_t pids[MAXP];
  int n = proc_listallpids(pids, sizeof pids); // returns count
  int k=0; *eperm=0; *other=0;
  for(int i=0;i<n;i++){
    if(pids[i]==0) { /* kernel_task: pid 0 */ }
    struct rusage_info_v4 ri;
    P *p=&ps[k]; p->pid=pids[i]; p->ok=0;
    if (proc_pid_rusage(pids[i], RUSAGE_INFO_V4, (rusage_info_t*)&ri)!=0){ if(errno==EPERM) (*eperm)++; else (*other)++; continue; }
    p->cpu_abs = ri.ri_user_time + ri.ri_system_time; p->foot=ri.ri_phys_footprint; p->ok=1;
    if (with_path) group_of(pids[i], p->group); else p->group[0]=0;
    k++;
  }
  return k;
}
typedef struct { char name[256]; double foot, cpu; int n; } Grp;
static int cmpf(const void*a,const void*b){ double x=((Grp*)a)->foot,y=((Grp*)b)->foot; return x<y?1:x>y?-1:0; }
static int cmpc(const void*a,const void*b){ double x=((Grp*)a)->cpu,y=((Grp*)b)->cpu; return x<y?1:x>y?-1:0; }
int main(void){
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  printf("mach_timebase numer/denom = %u/%u, uid=%d\n", tb.numer, tb.denom, getuid());
  static P a[MAXP], b[MAXP]; int ep, ot;
  // timing: no path
  uint64_t t0=now_ns(); int R=50; int na=0; for(int r=0;r<R;r++) na=scan(a,&ep,&ot,0); uint64_t t1=now_ns();
  printf("scan (rusage only): %.3f ms avg, listed ok=%d eperm=%d other_err=%d\n", (t1-t0)/1e6/R, na, ep, ot);
  t0=now_ns(); for(int r=0;r<R;r++) na=scan(a,&ep,&ot,1); t1=now_ns();
  printf("scan (rusage+pidpath+group): %.3f ms avg\n", (t1-t0)/1e6/R);
  static pid_t pids[MAXP]; int total=proc_listallpids(pids,sizeof pids);
  int pathfail=0; char pth[PROC_PIDPATHINFO_MAXSIZE]; for(int i=0;i<total;i++) if(proc_pidpath(pids[i],pth,sizeof pth)<=0) pathfail++;
  printf("total pids=%d, proc_pidpath failures=%d\n", total, pathfail);
  // EPERM detail: which uids are denied
  int denied_root=0, denied_other=0, ok_root=0;
  for(int i=0;i<total;i++){ struct proc_bsdshortinfo si; int okinfo = proc_pidinfo(pids[i], PROC_PIDT_SHORTBSDINFO, 0, &si, sizeof si)==sizeof si;
    struct rusage_info_v4 ri; int r=proc_pid_rusage(pids[i],RUSAGE_INFO_V4,(rusage_info_t*)&ri);
    if(okinfo){ if(r!=0){ if(si.pbsi_uid==0) denied_root++; else denied_other++; } else if(si.pbsi_uid==0) ok_root++; } }
  printf("rusage denied: uid0=%d otheruid=%d; rusage ok for uid0 procs=%d\n", denied_root, denied_other, ok_root);
  na=scan(a,&ep,&ot,1); uint64_t ta=now_ns(); sleep(2); int nb=scan(b,&ep,&ot,1); uint64_t tbn=now_ns();
  double dt=(tbn-ta)/1e9;
  Grp g[MAXP]; int ng=0;
  for(int i=0;i<nb;i++){ double cpu=0; for(int j=0;j<na;j++) if(a[j].pid==b[i].pid){ cpu=(double)(b[i].cpu_abs-a[j].cpu_abs)*tb.numer/tb.denom/1e9/dt*100; break; }
    int f=-1; for(int j=0;j<ng;j++) if(!strcmp(g[j].name,b[i].group)){f=j;break;}
    if(f<0){ f=ng++; strcpy(g[f].name,b[i].group); g[f].foot=0; g[f].cpu=0; g[f].n=0; }
    g[f].foot+=b[i].foot; g[f].cpu+=cpu; g[f].n++; }
  qsort(g,ng,sizeof(Grp),cmpf); printf("Top 8 by footprint (GiB):\n"); for(int i=0;i<8&&i<ng;i++) printf("  %-40s %6.2f GiB  cpu=%5.1f%%  n=%d\n",g[i].name,g[i].foot/1073741824.0,g[i].cpu,g[i].n);
  qsort(g,ng,sizeof(Grp),cmpc); printf("Top 8 by CPU%% (2s):\n"); for(int i=0;i<8&&i<ng;i++) printf("  %-40s %6.1f%%  foot=%.2f GiB n=%d\n",g[i].name,g[i].cpu,g[i].foot/1073741824.0,g[i].n);
  double s=0; for(int i=0;i<ng;i++) s+=g[i].foot; printf("sum footprint of visible procs=%.2f GiB, groups=%d\n", s/1073741824.0, ng);
  return 0;
}
