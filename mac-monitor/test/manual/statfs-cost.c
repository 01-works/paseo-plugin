#include <sys/mount.h>
#include <mach/mach_time.h>
#include <stdio.h>
#include <stdlib.h>
static int cmp(const void *a,const void *b) { double x=*(const double*)a,y=*(const double*)b;return (x>y)-(x<y); }
int main(void) {
  mach_timebase_info_data_t tb;mach_timebase_info(&tb);struct statfs fs;double times[500],sum=0;
  for(int i=0;i<500;i++) {
    uint64_t start=mach_absolute_time();if(statfs("/System/Volumes/Data",&fs)!=0) return 1;
    times[i]=(mach_absolute_time()-start)*(long double)tb.numer/tb.denom/1000;sum+=times[i];
  }
  qsort(times,500,sizeof(double),cmp);
  printf("{\"calls\":500,\"averageMicroseconds\":%.3f,\"p95Microseconds\":%.3f,\"maxMicroseconds\":%.3f}\n",sum/500,times[474],times[499]);return 0;
}
