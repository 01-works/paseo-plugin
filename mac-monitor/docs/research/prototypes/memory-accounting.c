/* 메모리 합계 차이 조사용. 기본 1회, 요청한 횟수만 2초 간격으로 조회한다. */
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <time.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static void print_sysctl(const char *name) {
  uint64_t value = 0;
  size_t size = sizeof(value);
  printf(",\"%s\":", name);
  if (sysctlbyname(name, &value, &size, NULL, 0) == 0 &&
      (size == sizeof(uint64_t) || size == sizeof(uint32_t))) {
    printf("%" PRIu64, value);
  } else {
    printf("null");
  }
}

int main(int argc, char **argv) {
  long samples = 1;
  if (argc > 2) return 64;
  if (argc == 2) {
    char *end = NULL;
    samples = strtol(argv[1], &end, 10);
    if (end == argv[1] || *end != '\0' || samples < 1 || samples > 100) return 64;
  }
  mach_port_t host = mach_host_self();
  vm_size_t page;
  if (host_page_size(host, &page) != KERN_SUCCESS) return 1;
  for (long i = 0; i < samples; i++) {
    vm_statistics64_data_t v = {0};
    mach_msg_type_number_t n = HOST_VM_INFO64_COUNT;
    if (host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&v, &n) != KERN_SUCCESS) return 2;
    host_basic_info_data_t b = {0};
    n = HOST_BASIC_INFO_COUNT;
    if (host_info(host, HOST_BASIC_INFO, (host_info_t)&b, &n) != KERN_SUCCESS) return 3;
    printf("{\"t\":%" PRIu64 ",\"page\":%lu,\"hostMaxMem\":%" PRIu64
           ",\"vm\":{\"free\":%u,\"active\":%u,\"inactive\":%u,\"speculative\":%u,"
           "\"wire\":%u,\"purgeable\":%u,\"internal\":%u,\"external\":%u,\"compressor\":%u,\"throttled\":%u}}\n",
           clock_gettime_nsec_np(CLOCK_REALTIME) / 1000000, (unsigned long)page, (uint64_t)b.max_mem,
           v.free_count, v.active_count, v.inactive_count, v.speculative_count, v.wire_count,
           v.purgeable_count, v.internal_page_count, v.external_page_count, v.compressor_page_count, v.throttled_count);
    /* sysctl과 Mach 카운터는 별도 조회이므로 같은 시각의 원자적 스냅샷으로 간주하지 않는다. */
    printf("{\"t\":%" PRIu64, clock_gettime_nsec_np(CLOCK_REALTIME) / 1000000);
    const char *names[] = {"hw.memsize", "hw.memsize_usable", "vm.pages", "vm.page_free_count",
                          "vm.page_speculative_count", "vm.page_purgeable_count", "vm.page_reusable_count",
                          "vm.page_purgeable_wired_count"};
    for (unsigned j = 0; j < sizeof(names) / sizeof(names[0]); j++) print_sysctl(names[j]);
    printf("}\n");
    fflush(stdout);
    if (i + 1 < samples) sleep(2);
  }
  mach_port_deallocate(mach_task_self(), host);
  return 0;
}
