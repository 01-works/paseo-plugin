// 파싱 경계만 검사한다. 호스트 프로세스나 실제 환경 변수는 읽지 않는다.
#define main helper_main
#include "../../native/macmon-helper.c"
#undef main
#include <assert.h>
static size_t fixture(char *buffer,int is64,int argc,const char **args) {
  memset(buffer,0,4096);memcpy(buffer,&argc,sizeof argc);
  char *base=buffer+sizeof argc;strcpy(base,"/tmp/test-node");
  size_t alignment=is64?8:4,offset=(strlen(base)+1+alignment-1)&~(alignment-1);
  char *cursor=base+offset;
  for(int i=0;i<argc;i++){strcpy(cursor,args[i]);cursor+=strlen(args[i])+1;}
  strcpy(cursor,"DO_NOT_EMIT=environment-marker");cursor+=strlen(cursor)+1;
  return (size_t)(cursor-buffer);
}
int main(void) {
  char buffer[4096];const char *result[32];
  for(int is64=0;is64<=1;is64++) {
    const char *args[]={"node","","test.js"};size_t size=fixture(buffer,is64,3,args);
    assert(read_arguments(buffer,size,is64,result)==3);assert(!strcmp(result[0],"node"));assert(!strcmp(result[1],""));assert(!strcmp(result[2],"test.js"));
    const char *empty[]={"","test.js"};size=fixture(buffer,is64,2,empty);
    assert(read_arguments(buffer,size,is64,result)==2);assert(!strcmp(result[0],""));assert(!strcmp(result[1],"test.js"));
    assert(read_arguments(buffer,3,is64,result)==0);
    size=fixture(buffer,is64,3,args);assert(read_arguments(buffer,(size_t)(result[0]-buffer),is64,result)==0);
    char longarg[514];memset(longarg,'x',513);longarg[513]=0;const char *longargs[]={"node",longarg};size=fixture(buffer,is64,2,longargs);
    assert(read_arguments(buffer,size,is64,result)==0);
    const char *many[33];for(int i=0;i<33;i++)many[i]="x";size=fixture(buffer,is64,33,many);assert(read_arguments(buffer,size,is64,result)==0);
  }
  puts("인자 32/64비트 정렬·빈 argv[0]·환경 영역 제외·크기/누락 제한 통과");return 0;
}
