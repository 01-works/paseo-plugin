// 자동 종료 검증이 만든 자식만 사용한다. 최대 40초 뒤 스스로 종료한다.
#include <stdio.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <stdlib.h>
#include <signal.h>
static void work(void) {
  uint64_t end=clock_gettime_nsec_np(CLOCK_MONOTONIC)+40000000000ULL;
  while(clock_gettime_nsec_np(CLOCK_MONOTONIC)<end) {
    uint64_t burst=clock_gettime_nsec_np(CLOCK_MONOTONIC)+4000000ULL;
    while(clock_gettime_nsec_np(CLOCK_MONOTONIC)<burst) {}
    usleep(80000);
  }
}
int main(int argc,char **argv) {
  if(argc==3&&!strcmp(argv[1],"--parent")) {
    pid_t child=fork();if(child<0) return 2;
    if(!child) { execl(argv[2],argv[2],"--foreground",NULL);_exit(3); }
    printf("%d\n",child);fflush(stdout);sleep(40);kill(child,SIGTERM);return 0;
  }
  if(argc==1) {
    pid_t child=fork();if(child<0) return 2;
    if(child) { printf("%d\n",child);return 0; }
    setsid();freopen("/dev/null","w",stdout);freopen("/dev/null","w",stderr);close(STDIN_FILENO);
  }
  work();return 0;
}
