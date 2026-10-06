# Activity Monitor 메모리 합계 차이 조사

2026-10-06, PLAN 4.1절의 메모리 식과 Activity Monitor 직접 대조에서 발견한 약 0.56 GiB 차이를 추적했다.
**이 Mac의 Activity Monitor는 `앱 + 와이어드 + 압축`을 합계로 쓰지 않는다.**
설치된 Apple 실행 파일의 계산 경로와 공개 VM 카운터로 차이가 발생하는 식을 확인했다.
원인 조사 당시 제품 코드는 최초 승인 식을 유지했다. 이후 사용자의 개선 요청으로 0.1.1부터 아래 Activity Monitor 식을 적용한다.

## 확인한 두 계산식

`P`는 `host_page_size`, `F`는 `HOST_VM_INFO64.free_count`, `S`는 `speculative_count`,
`E`는 `external_page_count`, `Q`는 `purgeable_count`, `I`는 `internal_page_count`,
`W`는 `wire_count`, `C`는 `compressor_page_count`, `T`는 `hw.memsize`다.

```text
mac-monitor 0.1.0 사용량 = (I − Q + W + C) × P
이 Mac의 Activity Monitor 사용량 = T − (F − S + E) × P
양쪽의 캐시된 파일 = (E + Q) × P
```

`F`에는 이미 speculative 페이지가 포함돼 있다. `F − S`가 실제 빈 페이지이며,
파일 기반 페이지와 함께 빼야 speculative 페이지를 중복 제외하지 않는다.
[해당 XNU 버전의 VM 필드 정의](https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.121.6/osfmk/mach/vm_statistics.h),
[host 카운터 구현](https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.121.6/osfmk/kern/host.c#L851).

Activity Monitor 합계 식은 `Q`를 추가로 빼지 않는다. 앱 구성 항목은 `(I − Q) × P`이므로
화면의 세 구성 항목 합과 총 사용량이 다를 수 있다. 캐시 값에는 `Q`가 들어가지만 총 사용량에서도
모두 제외되는 것은 아니어서, 캐시와 사용량을 상호 배타적인 구간으로 해석할 수 없다.
이 식은 캐시를 포함한 단순 `total − free`와 다르다.

## 설치된 실행 파일에서 확인한 경로

환경은 arm64 macOS 26.5.1, 빌드 25F80, XNU `12377.121.6`, 16 GiB, 페이지 16 KiB다.
Activity Monitor는 앱 버전 10.14, 번들 빌드 1040이다.

읽기 전용 정적 분석에 사용한 명령:

```sh
dyld_info -arch arm64e -disassemble \
  '/System/Applications/Utilities/Activity Monitor.app/Contents/MacOS/Activity Monitor'
otool -arch arm64e -tvV /usr/libexec/sysmond
```

Apple 실행 파일이나 디스어셈블 결과는 저장소에 배포하지 않는다. 다음 주소는 이 빌드의 파일 내 주소이며
다른 OS에서는 달라질 수 있다. x86_64 슬라이스도 같은 계산 경로를 확인했다.

| 경로 | 이 빌드의 위치 | 확인 내용 |
|---|---|---|
| `sysmond` 물리 페이지 초기화 | `0x10000373C`~`0x10000379C` | `hw.memsize / vm_kernel_page_size` |
| `sysmond` 시스템 VM 조회 | `0x100003410` | `host_statistics64(HOST_VM_INFO64)` |
| 시스템 속성 `0x26` | `0x1000035E0`~`0x1000035F8` | 물리 페이지 수 − `(free_count − speculative_count)` |
| 시스템 속성 `0x21` | `0x100003574`~`0x100003580` | `external_page_count` |
| 시스템 속성 `0x0E` | `0x1000034F4`~`0x100003500` | `purgeable_count` |
| Activity Monitor 합계 설정 | `0x100012CCC`~`0x100012D04` | 속성 `0x26 − 0x21`에 페이지 크기를 곱해 `setUsedMemorySize:`에 전달 |
| Activity Monitor 캐시 설정 | `0x100012D14`~`0x100012D4C` | 속성 `0x21 + 0x0E`에 페이지 크기를 곱함 |

Activity Monitor의 `SMStatisticsManager.processSystemSysmonTable:`에서 속성별 byref 변수와
메인 큐 블록의 전달 관계를 추적했다. 단순히 selector 이름이나 수치 유사성만으로 식을 추정하지 않았다.
`libsysmon`의 `sysmon_row_apply`가 속성 ID를 콜백에 전달하는 것도 읽기 전용으로 확인했다.
제품 수집기에 비공개 `libsysmon` 호출을 넣거나 실행 중인 앱에 디버거를 연결하지 않았다.

SHA-256:

```text
Activity Monitor: 9b056c81c22bfd3f93b63e8ff2cf5171a72a0f712a2ec325ea148a5726c16df6
sysmond:          0b2c0f44eb02f358432ff5941e211559a91f42b6fb561a42127562cea8a7b8b7
```

## 차이의 주된 원인: 물리 RAM과 usable RAM

이 Mac의 읽기 전용 sysctl 값:

| 항목 | bytes | GiB |
|---|---:|---:|
| `hw.memsize` | 17,179,869,184 | 16.000000 |
| `hw.memsize_usable` | 16,632,037,376 | 15.489792 |
| 차이 | 547,831,808 | **0.510208** |

해당 XNU 버전에서 macOS의 `hw.memsize`는 실제 물리 크기인 `max_mem_actual`,
`hw.memsize_usable`은 carveout을 제외한 `max_mem`을 반환한다.
VM의 초기 wired 계산도 `max_mem`을 기준으로 한다.
[sysctl 구현](https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.121.6/bsd/kern/kern_mib.c#L987),
[초기 wired 계산](https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.121.6/osfmk/vm/vm_resident.c#L2359).

Activity Monitor는 전체 물리 크기에서 빈 페이지와 파일 기반 페이지를 빼므로 이 예약 차이가 합계에 남는다.
세 VM 구성 항목의 합만 사용하는 이전 플러그인에는 이 영역이 추가되지 않았다.
이는 root/다른 사용자 프로세스 제외와 무관하다. 해당 제외는 앱 순위에만 적용한다.

## 원시 값 100회로 재현

18:48:34.353~18:51:53.084 KST에 별도의 작은 C 조사 프로그램으로 2초 간격, 총 100회 읽었다.
`host_statistics64`와 sysctl만 조회했다. 프로세스 스캔·`top`·`ps`는 사용하지 않았다.
재현 소스는 [prototypes/memory-accounting.c](prototypes/memory-accounting.c)에 있다.

저장소 루트에서 다음과 같이 1회 조회할 수 있다. 횟수 인수는 1~100이며 기본값은 1이다.

```sh
clang -O2 -Wall -Wextra -Werror docs/research/prototypes/memory-accounting.c \
  -o /tmp/mac-monitor-memory-probe
/tmp/mac-monitor-memory-probe 1
```

아래 Activity Monitor 식의 값은 **실행 파일에서 확인한 식을 동일한 원시 VM 값에 적용한 재구성 값**이다.
이 시각에 Activity Monitor 화면을 다시 읽은 값으로 표현하지 않는다. 이번 후속 조사에서는 UI 도구가
Activity Monitor 창을 읽지 못했다(`cgWindowNotFound`). 이전 실제 화면 대조는 VALIDATION.md의 18:09 기록이다.

| 시각 KST | 이전 플러그인 식 GiB | Activity Monitor 식 재구성 GiB | 차이 GiB |
|---|---:|---:|---:|
| 18:48:34.353 | 12.819214 | 13.382172 | 0.562958 |
| 18:49:54.640 | 12.965393 | 13.525345 | 0.559952 |
| 18:51:14.950 | 12.934036 | 13.499741 | 0.565704 |

첫 행의 원시 값은 다음과 같다. 페이지 카운터이며 용량은 별도 bytes 값이다.

```json
{"page":16384,"hw.memsize":17179869184,"hw.memsize_usable":16632037376,"vm":{"free":35340,"speculative":12538,"internal":394117,"external":148760,"wire":191902,"compressor":255611,"purgeable":1510}}
```

| 100회 관찰 | 최소 GiB | 중앙값 GiB | 최대 GiB |
|---|---:|---:|---:|
| 두 식의 차이 | 0.538254 | 0.554321 | 0.587387 |
| purgeable | 0.013107 | 0.024971 | 0.051178 |
| usable과 VM 카운터 합의 잔여 차이 | 0.011688 | 0.019730 | 0.029709 |

차이는 다음 식으로 분해된다.

```text
VM 카운터 합 = (F − S + I + E + W + C) × P
잔여 = hw.memsize_usable − VM 카운터 합
두 사용량 식의 차이 = (hw.memsize − hw.memsize_usable) + Q × P + 잔여
```

첫 샘플에서는 `0.510208 + 0.023041 + 0.029709 = 0.562958 GiB`다.
전체 차이의 발생 경로는 확인했지만 작은 잔여 차이까지 특정 커널 영역으로 분류한 것은 아니다.
예약 영역이 언제나 0.510208 GiB라고 일반화하거나 0.56 GiB를 상수로 더하면 안 된다.
AM와 헬퍼의 조회 시각 차이는 별도로 남는다.

## 원인 조사 당시의 적용 판단

이번 요청은 원인 조사이므로 PLAN 4.1절의 제품 계산식은 바꾸지 않았다.
Activity Monitor 기준으로 총 수치를 맞추려면 합계를 `T − (F − S + E) × P`로 바꾸고,
합계와 구성 바의 관계·측정 실패·Node 폴백을 함께 검토해야 한다.
필요한 speculative 카운터는 기존 `HOST_VM_INFO64` 응답에 있으므로 추가 스캔이나 비공개 API는 필요하지 않다.
현재 구성 항목을 유지하면서 합계만 바꾸면 구성 항목의 합과 사용량이 달라진다는 점을 UI에서도 처리해야 한다.

기록한 재현 소스는 `clang -O2 -Wall -Wextra -Werror` 빌드와 1회 실제 조회·JSON 파싱을 통과했다.
조사용 프로그램은 모두 종료됐고 설치된 `macmon-helper`는 기존 PID의 1개를 유지했다.
제품 코드 변경과 플러그인 reload·데몬 재시작은 없었다.

## 후속 개선 적용

사용자의 후속 개선 요청에 따라 0.1.1에서 총 사용량을 확인한 Activity Monitor 식으로 변경했다.
앱·와이어드·압축 값은 그대로 두고 메모리 막대는 총 사용량/물리 메모리를 표시한다.
speculative은 기존 조회에 포함된 값을 내보내므로 추가 VM 조회나 스캔은 없다.
Node 폴백의 vm_stat "Pages free"는 이미 speculative을 뺀 값이므로 둘을 더해 Mach 카운터를 복원한다.
[Apple vm_stat 구현](https://github.com/apple-oss-distributions/system_cmds/blob/main/vm_stat/vm_stat.c#L126).
변경 근거는 [DECISIONS.md](../DECISIONS.md), 적용 후 검증 범위는 [VALIDATION.md](../VALIDATION.md)에 기록한다.
