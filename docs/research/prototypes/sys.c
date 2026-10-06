// System sample: memory (Activity Monitor mapping), pressure, swap, CPU ticks. Timed.
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <sys/sysctl.h>
#include <stdio.h>
#include <stdint.h>
#include <unistd.h>
#include <time.h>
#include <sys/resource.h>
static uint64_t now_ns(void){ return clock_gettime_nsec_np(CLOCK_UPTIME_RAW); }
typedef struct { uint64_t app,wired,compressed,cached,free_,used,total, uncomp, swap_used, swap_total; int pressure, level; uint64_t ticks[4]; } sample_t;
static mach_port_t host;
static vm_size_t pg;
static int sample(sample_t *s){
  vm_statistics64_data_t vm; mach_msg_type_number_t c = HOST_VM_INFO64_COUNT;
  if (host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &c)!=KERN_SUCCESS) return -1;
  s->app = ((uint64_t)vm.internal_page_count - vm.purgeable_count) * pg;
  s->wired = (uint64_t)vm.wire_count * pg;
  s->compressed = (uint64_t)vm.compressor_page_count * pg;
  s->uncomp = (uint64_t)vm.total_uncompressed_pages_in_compressor * pg;
  s->cached = ((uint64_t)vm.external_page_count + vm.purgeable_count) * pg;
  s->free_ = (uint64_t)vm.free_count * pg;
  s->used = s->app + s->wired + s->compressed;
  size_t l = sizeof(s->total); sysctlbyname("hw.memsize", &s->total, &l, NULL, 0);
  struct xsw_usage sw; l = sizeof sw;
  if (sysctlbyname("vm.swapusage", &sw, &l, NULL, 0)==0){ s->swap_used=sw.xsu_used; s->swap_total=sw.xsu_total; }
  l = sizeof(int); sysctlbyname("kern.memorystatus_vm_pressure_level", &s->pressure, &l, NULL, 0);
  l = sizeof(int); sysctlbyname("kern.memorystatus_level", &s->level, &l, NULL, 0);
  host_cpu_load_info_data_t cpu; c = HOST_CPU_LOAD_INFO_COUNT;
  if (host_statistics(host, HOST_CPU_LOAD_INFO, (host_info_t)&cpu, &c)!=KERN_SUCCESS) return -2;
  for(int i=0;i<4;i++) s->ticks[i]=cpu.cpu_ticks[i];
  return 0;
}
#define G(x) ((double)(x)/1073741824.0)
int main(int argc, char**argv){
  host = mach_host_self();
  host_page_size(host, &pg);
  printf("host_page_size=%lu vm_kernel_page_size=%lu vm_page_size=%lu getpagesize=%d\n",(unsigned long)pg,(unsigned long)vm_kernel_page_size,(unsigned long)vm_page_size,getpagesize());
  vm_statistics64_data_t vm; mach_msg_type_number_t c = HOST_VM_INFO64_COUNT;
  host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &c);
  printf("raw pages: free=%u active=%u inactive=%u speculative=%u wired=%u purgeable=%u external=%u internal=%u compressor=%u uncompressed_in_compressor=%llu throttled=%u\n",
    vm.free_count, vm.active_count, vm.inactive_count, vm.speculative_count, vm.wire_count, vm.purgeable_count, vm.external_page_count, vm.internal_page_count, vm.compressor_page_count, vm.total_uncompressed_pages_in_compressor, vm.throttled_count);
  sample_t a,b;
  int N=10000; uint64_t t0=now_ns(); for(int i=0;i<N;i++) sample(&a); uint64_t t1=now_ns();
  printf("full sample cost: %.2f us avg over %d\n", (t1-t0)/1000.0/N, N);
  // individual costs
  t0=now_ns(); for(int i=0;i<N;i++){ c=HOST_VM_INFO64_COUNT; host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &c);} t1=now_ns();
  printf("  host_statistics64 VM: %.2f us\n",(t1-t0)/1000.0/N);
  host_cpu_load_info_data_t cpu;
  t0=now_ns(); for(int i=0;i<N;i++){ c=HOST_CPU_LOAD_INFO_COUNT; host_statistics(host, HOST_CPU_LOAD_INFO, (host_info_t)&cpu, &c);} t1=now_ns();
  printf("  host_statistics CPU: %.2f us\n",(t1-t0)/1000.0/N);
  struct xsw_usage sw; size_t l;
  t0=now_ns(); for(int i=0;i<N;i++){ l=sizeof sw; sysctlbyname("vm.swapusage",&sw,&l,NULL,0);} t1=now_ns();
  printf("  sysctl vm.swapusage: %.2f us\n",(t1-t0)/1000.0/N);
  int pl;
  t0=now_ns(); for(int i=0;i<N;i++){ l=sizeof pl; sysctlbyname("kern.memorystatus_vm_pressure_level",&pl,&l,NULL,0);} t1=now_ns();
  printf("  sysctl pressure_level: %.2f us\n",(t1-t0)/1000.0/N);
  sample(&a); sleep(2); sample(&b);
  double d[4]; double tot=0; for(int i=0;i<4;i++){ d[i]=(double)(b.ticks[i]-a.ticks[i]); tot+=d[i]; }
  printf("MEM total=%.2fG used=%.2fG (app=%.2fG wired=%.2fG compressed=%.2fG [uncompressed-in-compressor=%.2fG]) cached=%.2fG free=%.2fG\n",
    G(b.total),G(b.used),G(b.app),G(b.wired),G(b.compressed),G(b.uncomp),G(b.cached),G(b.free_));
  printf("SWAP used=%.2fG total=%.2fG  PRESSURE level=%d memorystatus_level=%d%%\n", G(b.swap_used),G(b.swap_total),b.pressure,b.level);
  printf("CPU 2s: user=%.1f%% system=%.1f%% idle=%.1f%% nice=%.1f%% (ticks total=%.0f)\n", 100*d[0]/tot,100*d[1]/tot,100*d[2]/tot,100*d[3]/tot,tot);
  struct rusage ru; getrusage(RUSAGE_SELF,&ru);
  printf("self rusage: user=%ld.%06ld sys=%ld.%06ld maxrss=%ld\n",(long)ru.ru_utime.tv_sec,(long)ru.ru_utime.tv_usec,(long)ru.ru_stime.tv_sec,(long)ru.ru_stime.tv_usec,ru.ru_maxrss);
  return 0;
}
