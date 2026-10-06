#include <dlfcn.h>
#include <libproc.h>
#include <stdio.h>
#include <string.h>
#include <time.h>
typedef int (*rf)(int);
int main(void){
  rf f=(rf)dlsym(RTLD_DEFAULT,"responsibility_get_pid_responsible_for_pid");
  printf("dlsym responsibility_get_pid_responsible_for_pid=%p\n",(void*)f); if(!f) return 1;
  pid_t pids[8192]; int n=proc_listallpids(pids,sizeof pids); int ok=0,fail=0,diff=0;
  uint64_t t0=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  for(int i=0;i<n;i++){ int r=f(pids[i]); if(r<0) fail++; else { ok++; if(r!=pids[i]) diff++; } }
  uint64_t t1=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  printf("pids=%d ok=%d fail=%d responsible!=self=%d cost=%.3fms\n",n,ok,fail,diff,(t1-t0)/1e6);
  // examples: show a few chrome helpers / node children
  int shown=0; for(int i=0;i<n&&shown<6;i++){ char nm[256]; proc_name(pids[i],nm,sizeof nm); if(strstr(nm,"Helper")||!strcmp(nm,"node")){ int r=f(pids[i]); char rn[256]={0}; proc_name(r,rn,sizeof rn); printf("  %d %s -> %d %s\n",pids[i],nm,r,rn); shown++; } }
}
