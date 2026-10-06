// 헬퍼 부하 검증: ps/top 없이 libproc 시작/끝 두 번만 읽는다.
#include <libproc.h>
#include <mach/mach_time.h>
#include <sys/resource.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <time.h>
int main(int argc,char **argv) {
  if(argc!=3) return 2;
  int pid=atoi(argv[1]),seconds=atoi(argv[2]);
  struct rusage_info_v4 a,b;struct proc_taskinfo task;
  mach_timebase_info_data_t tb;mach_timebase_info(&tb);
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t*)&a)) return 3;
  uint64_t start=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  sleep(seconds);
  uint64_t end=clock_gettime_nsec_np(CLOCK_UPTIME_RAW);
  if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t*)&b)) return 4;
  if(proc_pidinfo(pid,PROC_PIDTASKINFO,0,&task,sizeof task)!=sizeof task) return 5;
  double elapsed=(end-start)/1e9;
  double cpu=(b.ri_user_time+b.ri_system_time-a.ri_user_time-a.ri_system_time)*(long double)tb.numer/tb.denom/1e9;
  printf("{\"pid\":%d,\"elapsedSeconds\":%.3f,\"cpuSeconds\":%.6f,\"oneCorePercent\":%.6f,\"rssMiB\":%.3f,\"footprintMiB\":%.3f}\n",pid,elapsed,cpu,cpu/elapsed*100,task.pti_resident_size/1048576.,b.ri_phys_footprint/1048576.);
}
