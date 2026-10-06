# macOS 네이티브 통계 수집기 조사 (Paseo 플러그인용)

**후속 정정:** 아래 최초 조사의 `사용 = 앱 + 와이어드 + 압축`은 제품의 최초 승인 공식이며,
이 Mac의 Activity Monitor 총 사용량 식과 다르다. 0.1.1부터 확인한 Activity Monitor 식으로 변경했다. 실행 파일과 원시 카운터로 확인한
[합계 차이 조사](report-memory-accounting.md)를 함께 읽는다. 아래 최초 측정 기록은 보존한다.

## 환경 (측정값)
- `uname -m`: arm64 / macOS 26.5.1 (25F80) / Darwin 25.5.0
- hw.memsize=17179869184 (16 GiB), hw.pagesize=vm.pagesize=16384, hw.ncpu=10, perflevel0(P)=4, perflevel1(E)=6
- host_page_size = vm_kernel_page_size = vm_page_size = getpagesize() = 16384 (이 머신에서는 전부 일치)
- 툴체인: CLT만 설치 (`xcode-select -p` = /Library/Developer/CommandLineTools), swiftc 6.2.4, Apple clang 17.0.0, Node v24.18.0 (libuv 1.52.1). Rosetta 미설치.
- 이 머신은 측정 시점에 **메모리 압박이 심한 상태**였음 (pid 약 1,800개, swap 23.5/24 GiB, pressure=warn). 수치는 그 상태 기준임.

테스트 코드 (전부 /tmp/macmon-research/native/):
- `sys.c`: 시스템 샘플 + 마이크로벤치마크
- `procs.c`: pid 스캔, EPERM 집계, 그룹별 상위 8개
- `taskinfo.c`: PROC_PIDTASKINFO 접근 여부, 시간 단위 확인
- `resp.c`: responsibility API
- `macmon.swift`: 프로토타입 상주 헬퍼, JSON 줄 출력
- `node-test.mjs`, `spawncost.mjs`: Node 대안 측정

## 1. Activity Monitor 메모리 매핑 (검증됨)
host_statistics64(HOST_VM_INFO64) 기준이며 page는 host_page_size(16K)를 씀:
- App Memory = (internal_page_count − purgeable_count)·page
- Wired = wire_count·page
- Compressed = **compressor_page_count**·page. 압축기가 실제 차지한 페이지 수임. total_uncompressed_pages_in_compressor(이 머신에서 55 GiB)는 압축 전 크기라서 쓰면 안 됨.
- Memory Used = App + Wired + Compressed
- Cached Files = (external_page_count + purgeable_count)·page
- Swap Used = sysctl vm.swapusage 값 (struct xsw_usage의 xsu_used)

측정값 (GiB):
| 항목 | 값 |
|---|---|
| Used | 13.65–14.13 |
| App | 3.6–4.5 |
| Wired | 3.8–4.0 |
| Compressed | 5.7–6.2 |
| Cached | 1.3–1.9 |
| Free | 0.14–0.26 |
| Swap | 23.3–23.7 / 24.0 used |
| kern.memorystatus_level | 33–37% |

- 교차 검증: 같은 순간에 `top`이 `PhysMem: 15G used (4017M wired, 5832M compressor), 203M unused`를 보고했고, 우리 계산은 wired 3.88 GiB, compressed 5.73 GiB였음. 즉 top의 "used"는 total−free이고 cached를 포함함.
- 동치 관계: 측정 시 active+inactive+speculative = internal+external = 308,084 페이지로 정확히 일치했음. 따라서 exelban/Stats 공식인 `used = active+inactive+speculative+wired+compressed−purgeable−external` 및 `app = used−wired−compressed`는 위 공식과 같은 값이 나옴 (throttled=0일 때).
- 참고 구현:
  - exelban/Stats https://github.com/exelban/stats/blob/master/Modules/RAM/readers.swift (cache=purgeable+external, compressed=compressor_page_count, pressure sysctl, vm.swapusage)
  - htop https://github.com/htop-dev/htop/blob/main/darwin/Platform.c (active=internal−purgeable, compressed=compressor_page_count)
  - btop https://github.com/aristocratos/btop/blob/main/src/osx/btop_collect.cpp (프로세스 메모리 쪽에 같은 식. 시스템 "used"는 active+wire라 AM과 다름)
  - xnu https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/vm_statistics.h ("compressor_page_count: # of pages used by the compressed pager to hold all the compressed data"; internal=anonymous, external=file-backed)
  - Apple 용어 정의: https://support.apple.com/guide/activity-monitor/actmntr1004/mac
- AM은 "GB"라고 표시하지만 실제로는 2^30 단위임 (16 GiB를 16.00 GB로 표시). 1073741824로 나누면 됨.
- 주의: Activity Monitor GUI와 화면을 직접 대조하지는 못했음 (GUI를 띄우지 않았음). 공식은 위 레퍼런스들이 AM 일치용으로 쓰는 것과 같음.

## 2. 메모리 압박 (memory pressure)
- `sysctl kern.memorystatus_vm_pressure_level`: root 없이 읽힘. 값은 2(warn)였음.
  - xnu `sysctl_memorystatus_vm_pressure_level`이 내부 레벨을 NOTE_MEMORYSTATUS_PRESSURE_*로 변환함: 1=normal, 2=warn(Warning·Urgent 포함), 4=critical.
  - macOS에서는 priv 체크가 없음 (`#if !XNU_TARGET_OS_OSX`에서만 체크).
  - 출처: https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus_notify.c
- `kern.memorystatus_level`: root 없이 읽힘. 33–37 사이였음. `memory_pressure -Q`가 출력하는 "System-wide memory free percentage"와 같은 값임. `memory_pressure -Q`는 읽기 전용이고 root가 필요 없음.
- DispatchSource.makeMemoryPressureSource는 **전이(edge)가 일어날 때만** 이벤트를 줌. 22초 동안 레벨이 계속 2였는데 이벤트는 한 번도 오지 않았음. 그래서 초기값과 매 샘플은 sysctl로 읽고, 디스패치 소스는 전이를 즉시 알리는 보조 용도로만 쓰는 게 맞음.
- AM 그래프 색과의 관계 (불확실):
  - Apple 설명은 green "using all of its RAM efficiently", yellow "might eventually need more RAM", red "needs more RAM" (https://support.apple.com/guide/activity-monitor/actmntr34865/mac).
  - 색은 pressure level 1/2/4에 대응하고, 그래프 높이는 100−memorystatus_level에 가까운 값으로 **추정**됨. Apple이 공식 문서로 밝힌 적은 없음.
  - 권장 표시: 색은 pressure level로, 막대는 (100 − kern.memorystatus_level)%로.

## 3. Swap
- vm.swapusage(struct xsw_usage)는 root 없이 읽힘. xsu_total, xsu_used, xsu_avail, xsu_encrypted 필드가 있음.
- 측정값: total 24.00G, used 23.3–23.7G. 호출 비용은 0.46 µs.

## 4. CPU
- host_statistics(HOST_CPU_LOAD_INFO)의 cpu_ticks[USER, SYSTEM, IDLE, NICE]는 누적값이므로 delta로 계산함.
- 2초 delta의 tick 합계는 2048로, 10코어 × 100Hz × 2초와 맞음.
- 측정값:
  - 2초 delta: user 3.4–11%, system 5.7–11%, idle 80–91%, nice 0.0%
  - 같은 시점 `top`: 4.75% user, 15.5% sys, 79.7% idle
- AM 하단의 User/System/Idle 정의는 https://support.apple.com/guide/activity-monitor/actmntr43452/mac 참고. Apple 문서에 nice 언급은 없음. nice는 user에 합산하면 됨 (macOS에서는 거의 항상 0이었음).
- 호출 비용 0.37 µs. Node의 os.cpus() 합산(호출당 13 µs)도 같은 비율을 줌: 2초 동안 user 9.4%, sys 10.6%, idle 80.1%.

## 5. 프로세스별 CPU·메모리 (root 없이)
- 방법: proc_listallpids → proc_pid_rusage(RUSAGE_INFO_V4).
  - 메모리는 ri_phys_footprint 사용. AM의 "Memory" 열 및 top의 MEM과 같은 값임.
  - CPU는 ri_user_time+ri_system_time이고 **mach absolute 단위**임. 이 머신의 timebase는 125/3.
    - 검증: raw 17,223,165 × 125/3 = 0.718 s로 getrusage 값 0.718 s와 일치함.
    - PROC_PIDTASKINFO의 pti_total_user도 같은 단위임.
  - pid 재사용 감지는 ri_proc_start_abstime으로 함.
- 측정 결과 (uid 501, pid 1,796–1,798개):
  - rusage만 스캔: **3.5 ms/스캔** (C, 50회 평균). 성공 1,590, **EPERM 208** (그 외 오류 0).
  - proc_pidpath로 그룹핑까지 매번 하면 4.5 ms. 경로는 (pid, start_abstime) 키로 캐시하면 됨.
  - EPERM 208개의 내역: uid0 132개, 다른 uid 76개 (WindowServer 등). **root 프로세스는 하나도 읽히지 않음.** PROC_PIDTASKINFO도 결과가 같음 (ok 1,588 / fail 208).
  - 제약: top과 ps는 setuid root라서 이런 프로세스까지 봄. AM은 권한 있는 sysmond를 통해 봄. root 없는 헬퍼에는 커널이나 root 프로세스가 보이지 않음. 단, 시스템 전체 수치는 영향 없음.
  - proc_pidpath 실패 35개 (대부분 EPERM 대상). 실패하면 proc_name으로 대체함.
- 그룹핑:
  - 실행 경로에서 가장 바깥쪽 ".app/"까지를 그룹 키로 씀 (Chrome Helper는 "Google Chrome for Testing.app"으로 묶임).
  - .app이 없으면 실행 파일 이름을 씀 (node, codex 등).
  - Claude Code는 실행 파일이 `~/.local/share/claude/versions/2.1.287`이라 그대로 두면 이름이 "2.1.287"로 나옴. `/claude/versions/`가 경로에 있으면 "claude"로 바꾸는 특례가 필요함.
- responsibility_get_pid_responsible_for_pid (비공개 API, Stats는 dlsym으로 씀):
  - dlsym으로 잡히고, 스캔 비용은 2.7 ms이며, EPERM 대상과 같은 208개에서 실패함.
  - 하지만 CLI 자식 프로세스는 전부 "Terminal"로 묶임 (예: node 24715 → 644 Terminal). 에이전트 단위로 보려는 목적에는 맞지 않음. 번들 경로 방식이 더 나음.
- 2초 delta 기준 그룹 상위 8개 (C 측정):
  - footprint 순: codex 17.59G(203), claude 8.25G(47), ChatGPT.app 5.93G(573개, node_repl 포함), com.apple.Virtualization.VirtualMachine 5.61G(2), Google Chrome for Testing.app 4.14G(96), Paseo.app 2.99G(4), codex-code-mode-host 2.70G(189), node 2.61G(203)
  - CPU% 순: claude 23.9%, loginwindow.app 9.0%, Virtualization 6.5%, codex 6.1%, claude(2.1.286) 4.2%, Chrome 1.3%, Paseo 1.1%, sharingd 1.0%
  - 보이는 프로세스의 footprint 합은 55 GiB로 RAM 16 GiB보다 큼. footprint에 압축되거나 swap된 메모리가 포함되기 때문이며 AM도 마찬가지임. 그래서 그룹 합계를 "RAM 점유율"로 표시하면 안 됨.

## 6. 샘플 비용 (측정값)
- 시스템 샘플 전체 (VM64 + CPU load + swapusage + pressure + level + memsize, sysctlbyname 사용): **3.7 µs** (10,000회 평균)
  - 개별: VM64 0.38 µs, CPU 0.37 µs, swapusage 0.46 µs, pressure 0.99 µs
  - sysctlnametomib으로 MIB를 캐시하면 더 줄일 수 있음.
  - 2초 간격이면 약 0.0002% CPU로 사실상 0임.
- 프로세스 스캔: pid당 약 2 µs. C 기준 1,800 pid에 3.5 ms.
- Swift 상주 헬퍼 실측 (2초 간격, 11샘플, 약 20초, 시스템 샘플 + 전체 pid 스캔 + 그룹핑 + JSON):
  - 자기 CPU 0.012 s에서 0.096 s로 증가 → **샘플당 약 8.4 ms, 코어 1개의 약 0.42%** (10코어 전체 기준 0.04%)
  - maxrss 약 3 MB, 바이너리 94 KB
  - Swift의 Dictionary 오버헤드 때문에 C보다 약 2배 느림
- 예상: C로 짜면 약 4 ms/샘플, 약 0.2%. pid가 수백 개인 일반 머신이면 0.05% 이하.
- 비용을 줄이는 방법: 시스템 지표는 2초마다, 프로세스 스캔은 패널이 보일 때만 하거나 4–10초 간격으로.

## 7. 패키징 비교
Node에서 실행하고 자식 프로세스 CPU까지 포함해 측정함 (`/usr/bin/time`, 50회, 빈 Node 기준선은 0.02 s):

| 방식 | 샘플당 CPU | 2초 간격 시 | 비고 |
|---|---|---|---|
| 상주 헬퍼 (stdout에 JSON 줄) | 4–8 ms (proc 스캔 포함). 시스템 지표만이면 µs 단위 | 0.2–0.4% | 프로세스 CPU% delta 가능, 압박 이벤트 push 가능, 한 번만 spawn |
| one-shot 바이너리 매 2초 | 10.4 ms | 0.5% | 프로세스 CPU% delta가 없음 (상태 파일이 필요), fork/exec 비용이 매번 듦 |
| 순수 Node (os.cpus + vm_stat/sysctl spawn) | 2.2 ms (spawn 2회) | 0.11% | 프로세스별 정보 없음. vm_stat 텍스트 파싱이 필요함 |
| `ps -axo pid,rss,%cpu,comm` spawn | 90 ms | 4.5% | setuid라 root 프로세스도 보임. RSS는 footprint가 아님 |
| `top -l 1` (Stats가 1초마다 쓰는 방식) | **1.63 s CPU** (wall 1.67 s) | 사용 불가 | 안티패턴 |

- 컴파일 시간:
  - clang 단일 파일 0.17–0.57 s. universal(`-arch arm64 -arch x86_64`)도 0.17 s, 84 KB.
  - swiftc -O arm64: 1.3–2.0 s (첫 빌드 4 s). x86_64 타깃 첫 빌드는 14.5 s (모듈 캐시가 비어 있을 때).
  - Swift 바이너리는 /usr/lib/swift의 OS 런타임에 동적 링크됨. macOS 10.14.4 이상이면 런타임 번들이 필요 없음.
- 서명과 quarantine:
  - arm64 링커가 ad-hoc 서명을 자동으로 붙임 (flags adhoc,linker-signed). lipo로 합친 뒤에는 `codesign -s - -f`로 다시 서명함.
  - 로컬에서 만들거나 git/cp/Node fs로 복사한 파일에는 com.apple.quarantine이 붙지 않음 (com.apple.provenance만 붙음). /Applications/Paseo.app에는 LSFileQuarantineEnabled가 없음.
  - 실험: quarantine xattr을 직접 붙인 ad-hoc 바이너리를 실행하자 8초 넘게 멈춰서 alarm으로 강제 종료됨. Gatekeeper가 막은 것으로 보임 (화면에 대화상자가 떴을 수 있음). quarantine이 없는 동일 바이너리는 정상 종료.
  - 따라서 브라우저로 받은 zip 안의 prebuilt 바이너리는 막힘. 설치기가 `xattr -d com.apple.quarantine`을 하거나, Developer ID 서명과 notarization을 해야 함.
- x86_64 슬라이스: 이 머신에는 Rosetta가 없어 실행 검증을 못 함 (Bad CPU type).
- **권장**:
  - 기본은 단일 C 파일(또는 Foundation 없는 Swift)로 만든 **상주 헬퍼**임. Node가 한 번 spawn하고 stdout의 JSON 줄을 읽음. 부모가 죽으면 stdin EOF나 SIGPIPE로 종료함.
  - 배포는 **prebuilt universal + ad-hoc 서명** 바이너리를 플러그인에 커밋하는 방식. 빌드는 clang `-arch arm64 -arch x86_64 -mmacosx-version-min=11` 한 줄이면 됨.
  - 대체 경로 1: 바이너리 실행이 실패하면 clang이 있을 때(CLT) 설치 시점에 빌드함.
  - 대체 경로 2: 그것도 안 되면 순수 Node 모드로 동작함 (os.cpus + `vm_stat`/`sysctl` spawn, 프로세스 목록 없음).
  - C를 권하는 이유: 컴파일이 1초 미만, Swift 런타임이나 Dictionary 비용이 없음, CLT의 clang 하나로 충분함.

## 8. Node os.freemem()
- libuv 1.52.1 darwin.c (https://github.com/libuv/libuv/blob/v1.x/src/unix/darwin.c)의 구현:
  - `uv_get_free_memory`: host_statistics(HOST_VM_INFO)의 **free_count × sysconf(_SC_PAGESIZE)**
  - `uv_get_available_memory`: (free + inactive + purgeable) × page
- 측정값:
  - os.freemem() = 0.12 GiB. 같은 시각 free_count×16K는 0.14–0.26 GiB였음.
  - process.availableMemory() = 2.25–2.42 GiB
  - 반면 AM 기준으로는 Used 13.7–14.1, Cached 1.3–1.9 GiB임.
- 결론: macOS는 RAM을 캐시와 압축으로 가득 채우므로 free_count는 항상 0에 가깝게 나옴. `totalmem − freemem`을 "used"로 쓰면 15.9 GiB(99%)가 나와 AM의 14.1 GiB와 다름. 이 값으로 AM 수치를 재현할 수 없음.
