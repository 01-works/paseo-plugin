#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <mach/mach_time.h>
#include <errno.h>
#include <stdio.h>
#include <unistd.h>
int main(void){
  pid_t pids[8192]; int n=proc_listallpids(pids,sizeof pids);
  int ti_ok=0, ti_fail=0, ti_root_ok=0; int si_ok=0;
  for(int i=0;i<n;i++){
    struct proc_bsdshortinfo si; if(proc_pidinfo(pids[i],PROC_PIDT_SHORTBSDINFO,0,&si,sizeof si)==sizeof si) si_ok++;
    struct proc_taskinfo ti; int r=proc_pidinfo(pids[i],PROC_PIDTASKINFO,0,&ti,sizeof ti);
    if(r==sizeof ti){ ti_ok++; if(si.pbsi_uid==0) ti_root_ok++; } else ti_fail++;
  }
  printf("pids=%d shortbsdinfo ok=%d; PROC_PIDTASKINFO ok=%d fail=%d (root ok=%d)\n",n,si_ok,ti_ok,ti_fail,ti_root_ok);
  // units check: burn CPU then compare proc_pid_rusage vs getrusage
  volatile double x=0; for(long i=0;i<300000000;i++) x+=i*0.5;
  struct rusage_info_v4 ri; proc_pid_rusage(getpid(),RUSAGE_INFO_V4,(rusage_info_t*)&ri);
  struct rusage ru; getrusage(RUSAGE_SELF,&ru);
  mach_timebase_info_data_t tb; mach_timebase_info(&tb);
  printf("ri_user_time raw=%llu -> converted=%.3fs ; getrusage user=%.3fs\n", ri.ri_user_time, ri.ri_user_time*(double)tb.numer/tb.denom/1e9, ru.ru_utime.tv_sec+ru.ru_utime.tv_usec/1e6);
  struct proc_taskinfo ti; proc_pidinfo(getpid(),PROC_PIDTASKINFO,0,&ti,sizeof ti);
  printf("pti_total_user raw=%llu (also mach abs units on arm64)\n", ti.pti_total_user);
  return 0;
}
