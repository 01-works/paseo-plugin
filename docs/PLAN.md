# mac-monitor 구현 계획

작성: 2026-10-06 · 대상 Paseo 0.10.2 (`@getpaseo/plugin` 0.10.2 = 0.10.3 dist 동일)

## 0. 목적

사용자의 전용 Mac에서, Paseo 호스트로 연결된 여러 Mac의 CPU·메모리 상태를 보고
**어느 Mac이 쉬고 있고 어느 Mac이 작업 중인지**, 그리고 **무엇이(Chrome, codex, claude 등) 자원을 많이 쓰는지**
파악한다. 무엇보다 **측정 자체가 부하를 주지 않아야** 한다.

기존 `paseo-top`(npm `@xpufx/paseo-top` 0.4.3, 플러그인 id `top`)과 독립적으로 동작한다.
플러그인 id는 `mac-monitor`.

## 1. 확정된 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 멀티호스트 | **공식 호스트 선택기만 사용.** 2026-10-07 사용자가 실험적 집계 제거를 승인했다. 5.4절·14절 참조 |
| 앱별 상위 목록 | **첫 버전에 포함.** CPU 순·메모리 순 상위 5개 앱 그룹을 팝오버/대시보드에만 표시 |
| 프로젝트 위치 | `~/dev/mac-monitor` (별도 git 저장소) |

## 2. 범위

포함
- CPU 전체 사용률 (사용자 + 시스템, 전 코어 합산 0~100%)
- 메모리: Activity Monitor 기준 사용된 메모리, 앱·와이어드·압축, 캐시된 파일, 전체 용량
- 메모리 압력: 정상 / 주의 / 위험 / 확인 불가
- 스왑 사용량 (전체는 RPC·대조 CLI에서 제공)
- 앱 그룹별 상위 CPU·메모리 (상위 5개)
- 호스트별 에이전트 작업 중/대기 수 (공식 SDK `agents`)

제외: 토큰·비용·세션 통계·사용자 정의 셸 명령·GPU·디스크·네트워크.

## 3. 리서치 요약 (상세: `docs/research/`)

- `report-native.md` — macOS 측정 API 실측 (이 Mac: arm64, macOS 26.5.1, 16 GiB, 16 KB 페이지, 10코어)
- `report-paseo-api.md` — Paseo 0.10.2 플러그인 API, 멀티호스트 제약
- `report-paseo-top.md` — paseo-top 0.4.3 분석 (반면교사 + 재사용 패턴)
- `prototypes/` — 실측에 쓴 C/Swift/Node 테스트 코드 (`sys.c`, `procs.c`가 핵심 참고)

핵심 수치
- 시스템 샘플 1회(vm + cpu + sysctl): **3.7 µs**
- 전체 pid 스캔(~1,800개, `proc_pid_rusage` V4): **3.5 ms** (경로 포함 4.5 ms, 경로는 캐시)
- 상주 헬퍼 2초 간격: 코어 1개의 **0.2~0.4%**, RSS ~3 MB
- 비교: `ps -axo` 매번 실행 4.5%, `top -l 1` 1.63 s → 사용 금지
- root 소유 프로세스(WindowServer 등)는 root 없이 프로세스별 수치를 읽을 수 없음 (EPERM 208/1,800)

## 4. 측정 설계

### 4.1 메모리 (`host_statistics64(HOST_VM_INFO64)`, 페이지 크기는 `host_page_size`)

| 표시 항목 | 계산식 | 비고 |
|---|---|---|
| 앱 메모리 | (internal_page_count − purgeable_count) × page | |
| 와이어드 메모리 | wire_count × page | |
| 압축 메모리 | compressor_page_count × page | `total_uncompressed_pages_in_compressor` 쓰지 말 것 (압축 전 크기, 실측 55 GiB) |
| **사용된 메모리** | hw.memsize − (free_count − speculative_count + external_page_count) × page | 이 Mac의 Activity Monitor 합계 식 |
| 캐시된 파일 | (external_page_count + purgeable_count) × page | 사용량과 일부 중첩하므로 구성 막대에 더하지 않음 |
| 물리 메모리 | `hw.memsize` | |

- `os.freemem()`은 사용하지 않는다 (libuv = free_count × page, 실측 0.12 GiB → "99% 사용"이 나오는 원인).
- 출처: xnu `vm_statistics.h`, exelban/Stats, htop/btop darwin (URL은 `report-native.md`).
- Activity Monitor와 완전히 같다고 단정하지 않는다. 실측 대조 결과를 `docs/VALIDATION.md`에 기록한 뒤에만 "대조 완료"로 표현.
- 2026-10-06 후속 개선 지시에 따라 최초 `앱 + 와이어드 + 압축` 합계를 위 식으로 변경한다. 원인은 [합계 차이 조사](research/report-memory-accounting.md), 변경 근거와 UI·폴백 처리는 [결정 기록](DECISIONS.md)의 "Activity Monitor 기준 메모리 합계 개선" 절에 있다.
- `free_count`에는 speculative이 포함돼 있다. Node 폴백의 `vm_stat` "Pages free"는 이미 speculative을 제외하므로 둘을 더해 원시 카운터를 복원한다. 누락·역행·음수 또는 안전한 정수 범위를 벗어난 계산 결과는 `null`과 오류다.
- 메모리 막대는 사용량/물리 메모리 비율만 표시하며 OS 압력 색을 사용한다. 앱·와이어드·압축 값은 아래에 유지한다. 합계와 세부 항목 합이 다르다고 임의의 보정 상수를 더하거나 별도 메모리 영역을 추측하지 않는다.

### 4.2 메모리 압력 — 색상의 유일한 기준

- `sysctl kern.memorystatus_vm_pressure_level`: 1 → 정상, 2 → 주의, 4 → 위험, 그 외/읽기 실패 → **확인 불가**.
- 보조: `kern.memorystatus_level`(가용 %)은 세부 화면에만 참고값으로 표시.
- RAM 사용률이 높다는 이유만으로, 또는 스왑이 존재한다는 이유만으로 위험 색을 쓰지 않는다.
- (선택) `DISPATCH_SOURCE_TYPE_MEMORYPRESSURE`는 레벨 변화 시 즉시 샘플을 트리거하는 보조로만.

### 4.3 스왑

- `sysctl vm.swapusage` (`struct xsw_usage`: xsu_total, xsu_used). 스왑 값은 정보로만 표시하고 상태 색에 쓰지 않는다.
- 상세·호스트 표에는 사용량만 표시한다. 전체는 현재 할당된 스왑 공간이며 고정 최대 용량이 아니므로 사용률 바나 경고 기준으로 쓰지 않는다. RPC·대조 CLI에는 전체 값도 유지한다. 표시 변경 근거는 [DECISIONS.md](DECISIONS.md)의 스왑 표시 검토에 기록한다.

### 4.4 CPU

- `host_statistics(HOST_CPU_LOAD_INFO)` 누적 tick(user, system, idle, nice)의 **2초 간격 차이**.
- 사용률 = (Δuser + Δnice + Δsystem) / Δtotal × 100. 사용자(= user + nice)와 시스템을 따로도 제공.
- 첫 샘플은 기준점이 없으므로 **"측정 중"** 표시.
- 측정 간격은 헬퍼의 고정 타이머만 결정한다. 클라이언트 요청 수·에이전트 수와 무관.
- Activity Monitor 하단 "사용자 + 시스템"과 비교 (그쪽 갱신 주기 기본 5초 → 차이 원인으로 기록).

### 4.5 앱 그룹별 상위

- `proc_listallpids` + `proc_pid_rusage(RUSAGE_INFO_V4)`.
  - 메모리: `ri_phys_footprint` (Activity Monitor "메모리" 열과 같은 값)
  - CPU 시간: `ri_user_time + ri_system_time` (mach absolute 단위 → `mach_timebase_info` 변환 필수; 이 Mac 125/3)
- 그룹 키: 실행 경로(`proc_pidpath`)의 **가장 바깥 `.app` 번들 이름** (Chrome Helper → Google Chrome).
  - 예외 규칙: 경로에 `/claude/versions/` → `claude`; 그 외 `.app` 밖 실행 파일은 실행 파일 이름 (codex, node 등).
  - 경로는 (pid, 시작 시각) 키로 캐시.
- 그룹 CPU% = Δ(CPU 시간 합) / Δ실시간. **전체 코어 합산 기준으로 정규화(÷코어 수)**해 시스템 CPU와 같은 0~100% 척도로 표시하고, 단위를 명시.
- 앱 메모리 합계를 "RAM 점유율"로 표시하지 않는다 (footprint는 압축/스왑분 포함, 실측 합계 55 GiB > 16 GiB). 절대값(GiB)만 표시.
- 읽지 못한 프로세스 수(EPERM)를 함께 내보내고 화면에 "root 프로세스 N개 제외"로 표시.
- **부하 절감:** 프로세스 스캔은 최근 30초 안에 상위 목록을 요청한 클라이언트가 있을 때만 수행 (팝오버/대시보드가 열려 있을 때). 그 외에는 시스템 지표만 수집. 스캔 재개 직후 첫 주기는 "측정 중". 후속 사용자 요청으로 승인된 자동 관리의 제한된 조사 예외는 13절을 따른다.

## 5. 아키텍처

```
[각 Mac 데몬]
  plugin server subprocess (데몬당 1개, Paseo가 보장)
    └─ Collector (모듈 싱글턴)
         └─ macmon-helper (C 상주 프로세스, 1개)
              stdout: 2초마다 JSON 한 줄
              stdin : "procs on" / "procs off"
    └─ 최신 스냅샷 캐시 ← RPC는 캐시만 읽음 (측정 트리거 없음)

[보는 Mac의 Paseo 앱]
  호스트별 클라이언트 번들 (플러그인이 설치된 호스트마다 따로 평가됨)
    ├─ composer pill (에이전트별) → 그 에이전트의 호스트 RPC
    ├─ 사이드바 대시보드 (호스트 선택기 자동)
```

### 5.1 네이티브 헬퍼 (`native/macmon-helper.c`)

- 단일 C 파일, 외부 의존성 없음. Swift보다 빌드가 빠르고(universal 0.17 s) 오버헤드가 작음.
- 고정 간격 타이머(mach 절대 시간 기준, 드리프트 누적 없음) 2초.
- **원시 카운터를 출력**하고 계산은 TS에서 한다 (계산 로직을 TS 단위 테스트로 검증하기 위해). 단, 프로세스 그룹 집계와 그룹별 Δ는 헬퍼에서 계산(1,800개 원시값 전송 회피) 후 상위 N개만 출력.
- 출력 예 (스키마 버전 필드 필수):
  ```json
  {"v":1,"seq":42,"t":1791261760004,"mono":123456789,
   "sys":{"pageSize":16384,"memsize":17179869184,
          "vm":{"internal":0,"purgeable":0,"wire":0,"compressor":0,"external":0,"free":0,"speculative":0},
          "cpu":{"user":0,"system":0,"idle":0,"nice":0},
          "swap":{"total":0,"used":0},"pressureLevel":2,"memoryLevel":35},
   "procs":null,
   "errors":[]}
  ```
  각 필드는 읽기 실패 시 `null` + `errors`에 사유. 0으로 대체하지 않는다.
  speculative이 없는 이전 v1 헬퍼의 누락 필드는 `null`로 해석해 CPU 등 다른 값을 유지하고 메모리를 확인 불가로 표시한다.
- 부모 종료 감지: stdin EOF 또는 `getppid()` 변화 시 즉시 종료 (고아 프로세스 방지).
- `--once` 모드: 한 번 출력 후 종료 (검증·폴백용).

### 5.2 서버 (`index.server.ts`, `server/`)

- `Collector` 싱글턴: 헬퍼 spawn 1회, 줄 단위 파싱(zod로 검증), 최신 스냅샷 + 직전 CPU 카운터 보관.
- 신선도: 마지막 성공 샘플 기준 `> 5 s` → `stale`(지연), `> 15 s` 또는 헬퍼 종료 → `error`. 응답에 `sampledAt`, `ageMs`, `status` 포함. 이전 값은 유지하되 지연 상태로 표시.
- 헬퍼 재시작: 지수 백오프(1 s → 최대 60 s), 동시에 2개 이상 실행되지 않도록 상태 머신으로 보호.
- 헬퍼 실행 실패 시 단계적 폴백:
  1. 저장소에 커밋된 prebuilt universal 바이너리 (`bin/macmon-helper`)
  2. 실행 불가 시 CLT가 있으면 `clang`으로 플러그인 데이터 디렉터리에 빌드
  3. 둘 다 실패 → **Node 전용 모드**: CPU는 `os.cpus()` 차이, 메모리는 2초마다 `vm_stat`/`sysctl` 실행 (실측 0.11%). 상위 목록은 미지원으로 표시.
- macOS가 아니면(`process.platform !== "darwin"`) 헬퍼를 띄우지 않고 `unsupported` 상태 반환.
- 정리 함수: 타이머 해제, 헬퍼 stdin 닫기 → SIGTERM → 1 s 후 SIGKILL. Paseo의 shutdown(2 s 후 SIGTERM)보다 먼저 끝나야 함.
- 로그: 시작/재시작/폴백 전환만 기록, 샘플마다 로그 금지.

RPC (`shared/contracts.ts`, 모두 zod)
- `mac-monitor.snapshot.get` `{ includeProcesses: boolean }` → 스냅샷. `includeProcesses: true`면 프로세스 스캔 "관심" 타임스탬프를 갱신(30 s 유지).
- `mac-monitor.host.info` → `{ hostname, platform, helperMode: "native"|"node"|"unsupported", version }`

### 5.3 클라이언트 (`index.client.tsx`, `client/`)

공통
- 모든 색은 `theme.colors` (`statusSuccess`/`statusWarning`/`statusDanger`/`foregroundMuted`), 레이아웃은 `layout.compact`.
- React Native 기본 요소만. `rg -n "document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=" client/` 결과 0건.
- 용량 단위는 **GiB(1024³)**로 통일하고 소수 1자리. (Activity Monitor의 "GB"도 실제로는 1024³ — README와 화면 각주에 명시)

composer pill (에이전트별)
- `client.paseo.agents.list({ subscribe: {}, signal })`로 에이전트 목록을 구독해 에이전트마다 `addComposerPill({ id, workspaceId, agentId, button })` 등록 (`plugin-examples/local-plugin` 방식). cleanup에서 abort + 전부 remove.
- `button.label`: `CPU 23% · 14.1/16 GiB` (좁으면 `23% · 14.1G`). 측정 중/확인 불가/미지원/지연은 텍스트로 구분.
- `button.icon`: 컴포넌트 아이콘 — 메모리 압력 색 점(라벨 문자열은 색을 못 가지므로 색은 아이콘이 담당).
- `behavior: { kind: "popover", Content }`: CPU(사용자/시스템), 메모리 세부(앱/와이어드/압축/캐시), 메모리 압력, 스왑, 앱 상위 5, 호스트 이름, 마지막 갱신 시각(상대 + 절대), 지연 상태.
- 갱신: 화면에 보이는 pill만 공유 타이머 하나(2 s)로 RPC 1회 → 값이 바뀐 경우에만 `update({label})`. 보이는 pill 판정은 아이콘 컴포넌트 mount/unmount 카운트 (paseo-top `pill.tsx:346-378` 패턴). 팝오버는 열려 있는 동안 `useQuery({ refetchInterval: 2000 })`.
- 동일 호스트의 여러 pill은 하나의 in-flight 요청을 공유 (single-flight).

사이드바 대시보드 (`addSurface` + `addSidebarItem`)
- 공식 모드: 선택된 호스트의 상세 + `useHosts()` 전체 목록과 각 호스트의 에이전트 작업 중/대기 수 (`getPaseoClient(serverId).agents` 구독). 다른 호스트의 CPU·메모리 칸은 "호스트 선택기로 전환" 안내.

### 5.4 제거된 실험: 멀티호스트 레지스트리

2026-10-07 후속 사용자 승인으로 비공식 globalThis 레지스트리, 교차 호스트 지표 폴링,
`client/fleet/`, `experimentalFleet` 설정과 등록을 제거한다. Paseo 기본 호스트 선택기로 선택한
호스트의 지표만 조회·종료하며 공식 SDK의 연결 호스트/에이전트 수 표시는 유지한다.
기존 데몬 전역 설정 파일의 남은 설정은 직접 수정하지 않으며 더 이상 읽거나 사용하지 않는다.

## 6. 오류·상태 표시 규칙

| 상태 | 조건 | 표시 |
|---|---|---|
| 측정 중 | CPU 기준점 없음 / 프로세스 스캔 첫 주기 | "측정 중", 값 대신 — |
| 정상 | 최신 샘플 5 s 이내 | 값 + 압력 색 |
| 지연 | 5~15 s | 이전 값 + "N초 전" + 지연 표시(흐린 색) |
| 오류 | 15 s 초과 / 헬퍼 중단 | 이전 값(있으면) + 마지막 갱신 시각 + 오류 |
| 확인 불가 | 압력 sysctl 실패 | 압력만 "확인 불가"(회색) |
| 미지원 | macOS 아님 | "macOS 전용 — 이 호스트는 미지원" |

실패한 측정을 0 또는 정상으로 표시하지 않는다.

## 7. 프로젝트 구조

```
mac-monitor/
  paseo-plugin.json      { "id": "mac-monitor", "requirements": { "paseo": ">=0.10.2" } }
  package.json           devDeps: @getpaseo/plugin 0.10.2, react, react-native, zod, typescript, vitest
  tsconfig.json          (paseo plugin init 스캐폴드 기반, DOM lib 금지)
  index.client.tsx
  index.server.ts
  client/  pill.tsx, popover.tsx, dashboard.tsx, format.ts, automation.tsx
  server/  collector.ts, helper-process.ts, node-fallback.ts, host-info.ts
  shared/  contracts.ts, compute.ts (메모리/CPU/상태 계산 순수 함수), units.ts
  native/  macmon-helper.c, build.sh
  bin/     macmon-helper (prebuilt universal, ad-hoc 서명, 커밋)
  test/    compute.test.ts, collector.test.ts (가짜 헬퍼 프로세스), format.test.ts
  docs/    PLAN.md, VALIDATION.md, research/
  README.md
```

- `paseo plugin init`으로 스캐폴드를 만든 뒤 위 구조로 정리할 것 (init이 만드는 tsconfig·의존성 버전을 기준으로).
- 빌드: `clang -O2 -arch arm64 -arch x86_64 -mmacosx-version-min=11.0 -o bin/macmon-helper native/macmon-helper.c && codesign -s - -f bin/macmon-helper`
- 로컬 디렉터리 설치는 manifest `build`를 실행하지 않음 → prebuilt 바이너리 커밋이 기본 경로. git 소스 설치용으로 `build: [["/bin/sh","native/build.sh"]]`를 두되, `build.sh`는 CLT가 없으면 prebuilt를 유지하고 성공 종료.

## 8. 테스트

- `npm run typecheck`
- `compute.test.ts`: 고정 카운터 → 메모리 항목, CPU Δ(카운터 동일/역행/0 Δtotal), 압력 매핑(1/2/4/기타/null), 첫 샘플 "측정 중".
- 메모리 후속 회귀: 실제 VM 카운터의 Activity Monitor 식, 4/16 KiB 페이지, speculative 중복 제외·누락·역행, 음수/정밀도 손실, Node의 빈 페이지 복원, 이전 헬퍼의 부분 실패, 합계와 같은 막대 비율.
- `collector.test.ts`: 가짜 헬퍼(node 스크립트)로 정상 스트림, 잘못된 JSON 줄, 중단 → 재시작 백오프, 지연/오류 전환, 동시 RPC 100개가 측정을 트리거하지 않음, cleanup 후 자식 프로세스 0개.
- `format.test.ts`: GiB 표기, 상대 시각, 라벨 축약.
- 헬퍼: `bin/macmon-helper --once | node -e`로 스키마 검증 스모크 테스트.

## 9. 검증 (완료 조건)

1. `paseo plugin install ~/dev/mac-monitor` → `paseo plugin ls`에서 `running`, `paseo plugin logs mac-monitor` 오류 없음. **데몬 재시작 금지** (변경 반영은 `paseo plugin reload mac-monitor`).
2. 여러 에이전트 화면을 연 상태에서 `pgrep -fl macmon-helper` 결과 1개, 수집 간격이 2 s로 유지되는지 로그/seq로 확인.
3. 헬퍼 자체 부하 측정 (`ps -o %cpu,rss -p <pid>` 수 분 관찰) → 결과를 README에 기록.
4. Activity Monitor 대조: `npm run compare`(같은 시각 값 출력 CLI)와 Activity Monitor 화면을 나란히 놓고 CPU(사용자+시스템), 사용된 메모리·앱·와이어드·압축·캐시, 스왑을 3회 이상 기록. 차이와 원인(샘플링 시각·간격, 단위, 계산 기준)을 `docs/VALIDATION.md`에 기록. 화면 대조는 사용자 확인이 필요할 수 있음 — 확인 전까지 "일치"라고 쓰지 않는다.
5. 테마 전환(라이트/다크), 좁은 창(compact)에서 pill·팝오버·대시보드 확인.
6. 플러그인 disable → 헬퍼 프로세스 종료 확인.
7. 다른 Mac 호스트에 설치 후 공식 호스트 선택기 동작 확인 (다른 호스트 설치는 사용자 승인 후).

## 10. README에 쓸 것

설치(로컬 경로, 다른 호스트 `--host`/git), 업데이트(`git pull` + `paseo plugin reload`), 제거(`paseo plugin remove mac-monitor`), 측정 기준과 계산식·출처, 단위(GiB), 상태 규칙, 공식 호스트 선택기, 알려진 한계(root 프로세스, Activity Monitor와의 차이), 측정된 자체 부하.

## 11. 하지 말 것

- 기존 `paseo-top` 또는 다른 프로젝트 수정 (`~/.paseo/top/pills` 잔여 파일 포함)
- 데몬 재시작
- `ps`/`top`을 주기적으로 실행
- 클라이언트 요청으로 측정 트리거
- 사용자 승인 없이 다른 호스트에 설치하거나 플러그인 전역 설정 변경

## 12. 미해결·구현 시 확인할 것

- 플러그인 서버 subprocess에서 데몬 홈 경로를 얻는 방법 (자동 관리 전용 파일에 사용)
- pill 아이콘 컴포넌트가 받는 props에서 theme 접근 방식 (타입 정의 `dist/client/buttons.d.ts`)
- x86_64 슬라이스 실행 검증 (Rosetta 없음 → Intel Mac 호스트가 있으면 그때)
- 0.11 업그레이드 시 `addScreen` 등 API 변경 대응 (지금은 0.10.2 API만 사용)

## 13. 후속 승인: 지속 압력의 Luna 리뷰와 제한된 자동 종료 (0.2.0)

사용자가 지속적인 압력이 임계치를 넘으면 Luna 리뷰 뒤 검증한 대상을 자동 종료하도록 요청했다.
자동 종료 대상의 제안을 요청했으므로 첫 범위는 **직접 허용한 독립 실행 개발 worker의 개별 프로세스**로 정한다.
기본 허용 목록은 비어 있다. 공개 신규 설치는 꺼짐이며, 이번 사용자의 로컬 설치는 요청에 따라 리뷰를 켠다.
브라우저·터미널·Paseo·Codex·Claude·시스템을 임의로 허용하거나 실제 사용자 작업을 테스트로 종료하지 않는다.

- 정상 시: 기존 2초 시스템 샘플만 관찰. 추가 프로세스 스캔·리뷰·별도 감시 타이머 없음.
- 기본 조건: OS `critical` 120초 연속. 설정은 `warning` 이상 또는 `critical`, 지속 시간 60~600초를 지원.
  측정 지연 5초 초과·실패·압력 미확인·Node 모드·압력 회복이면 연속 시간을 초기화한다.
- 조건 충족 후 단일 헬퍼의 앱 스캔을 최대 150초 빌린다. UI의 기존 30초 관심과 독립적으로 유지하며
  동일한 2초 간격을 사용한다. 24개 PID의 약 60초 이력만 보존하며 CPU/메모리 상위 그룹 밖의 항목은 조사하지 않는다.
- 후보: footprint 1 GiB 이상, 약 60초 동안 `max(128 MiB, 최초값의 10%)` 이상 증가,
  최근 10초에도 증가하며 마지막 샘플에서 감소하지 않음. 큰 footprint 하나만으로 이상을 판정하지 않는다.
- 리뷰: 후보 최대 4개, `codex exec --model gpt-6-luna` 한 번. 동시 1개, 45초·출력 64 KiB·결과 8 KiB 제한.
  기존 CLI 인증을 사용하고 읽기 전용·일회성·빈 임시 디렉터리에서 실행한다.
  사용자 설정·규칙·MCP·훅·셸·웹·앱·서브에이전트·이미지·컴퓨터 제어는 사용하지 않는다.
  알려진 CLI 시작 알림 외 오류·도구 이벤트·알 수 없는 PID·중복 결정·스키마 위반이면 종료하지 않는다.
- 호출 예산: 15분 대기, 24시간 최대 6회. 실패 호출도 계산하고 플러그인 전용 파일에 먼저 기록한다.
  후보 없는 조사도 15분 대기. 디스크 여유 1 GiB 미만·가용 수준 3% 미만/미확인·CPU 85% 이상·
  디스크 값 미확인은 조사/리뷰를 보류한다. 리뷰 중 악화도 취소하며 자식 우선순위는 낮춘다.
- 종료: 사용자 허용의 PID·시작 시각·경로·그룹·이름과 최신 이력이 모두 동일해야 한다.
  허용 RPC는 확인 화면의 경로·이름도 전달하며, 네이티브 검증 전후에 동일한 대상인지 대조한다.
  이전 클라이언트가 경로·이름 없이 보내는 허용 요청은 거절한다. 허용 해제는 기존 식별자로 지원한다.
  현재 CPU 5% 미만(전체 코어 기준), 리뷰 시 footprint의 90% 이상, 압력·추세·실행 여유를 다시 확인한다.
  허용 단계와 실제 전송 단계에서 C 헬퍼가 현재 UID·시작 시각·경로·상위 프로세스를 재검사한다.
  앱 번들·시스템·브라우저·터미널·Codex·Claude·Paseo 및 보호된 트리의 자식은 차단한다.
  리뷰 한 번에 최대 1개, SIGTERM만 사용. 허용은 한 번의 시도 전에 소비·저장하며 새 PID에 상속하지 않는다.
  10초 후 같은 헬퍼가 해당 PID의 상태만 조회해 종료/실행 중/확인 불가를 기록한다. 목록에서 사라졌다는 이유로 성공이라 쓰지 않는다.
  플러그인이 그 전에 종료되면 대기 중인 요청을 마친 뒤 미확인을 기록한다.
  이미 시작한 조회는 결과를 기록하며 조회 실패는 미확인으로 남긴다. 종료 확인을 위해 신호를 다시 보내지 않는다.
- 로그: 사용자 후속 요청으로 리뷰·종료의 상세 기록을 추가한다. PID·시작 시각·경로·Luna 결정/근거·전후 압력/메모리·
  신호 전송·10초 후 조회 결과를 `$PASEO_HOME/mac-monitor/automatic-actions.jsonl`(0600)에 저장한다.
  정상 샘플은 기록하지 않으며 현재 파일 256 KiB와 이전 파일 하나만 보관한다. 종료 예정 기록을 디스크에 반영한 뒤
  신호를 보내며 기록 실패는 자동 조치를 중단한다. 확인 불가 수치는 null로 남긴다.
- 데이터/UI: `shared/automation.ts`, `server/automation/{policy,store,reviewer,guardian,audit}.ts`, `client/automation.tsx`에 격리.
  `mac-monitor.automation.{get,configure,target}` RPC, snapshot의 선택적 자동 관리 상태, process list의 path/autoAllowed를 사용한다.
  설정·허용·최근 20개 기록·호출 예산은 `$PASEO_HOME/mac-monitor/automation.json`(0600)에만 저장한다.
  UI는 상태 버튼과 개별 worker의 허용/해제, 고정 높이 설정/기록 화면을 제공한다. 기본 폰트·theme.colors·RN만 사용한다.
- 디스크 작업 자동 중단은 제외한다. 공간 소비 주체를 찾는 별도 추적과 잘못된 중단의 위험에 비해
  저부하 목표에 맞지 않는다. 기존 30초 용량 값으로 여유 2 GiB 미만일 때만 공간 부족을 표시한다.
- 검증: 압력/추세/예산/저장 실패/취소/신선도/대상 변경 단위 테스트, CLI 도구·출력·시간 제한·자식 정리,
  직접 만든 네이티브 worker의 허용·보호·SIGTERM·종료 조회, 가상 데이터의 실제 Luna 호출과 비용 측정.
  실제 메모리 압력을 인위적으로 만들거나 사용자 프로세스를 자동 종료하는 실험은 하지 않는다.

## 14. 후속 승인: 리뷰 후보의 확인 종료와 공식 호스트 선택기 (0.3.0)

2026-10-07 사용자가 과도한 작업별 영구 허용 규칙을 추가하지 않고 자동 리뷰·확인 종료로 정리하며,
실험적 멀티 호스트 집계를 제거하도록 승인했다. 13절의 측정·예산·보호·일회 허용 규칙은 유지한다.

- 정상 시 기존 측정만 수행하며 작업 폴더·명령행 수집, 새 감시 타이머, 재실행 PID에 허용을 이어주는 정책은 추가하지 않는다.
- 최근 리뷰 후보 최대 4개에 정확한 PID·시작 시각·이름·경로, 리뷰 시 사용량/증가량, 이유·판정·조치 결과를 보관한다.
  기존 v1 전용 상태 파일은 새 목록 누락을 빈 목록으로 읽는다. 리뷰 화면은 320 높이 스크롤과 기본 폰트를 유지한다.
- 허용되지 않은 후보도 종료 검토 의견을 받을 수 있다. Luna 판단은 누수·작업 중요도를 확정하지 않으며 신호 권한을 만들지 않는다.
- 후보의 종료 선택은 신호를 보내지 않는다. 별도 확인 후 `mac-monitor.automation.confirm` RPC로
  화면에서 확인한 리뷰 시각·전체 대상 식별자를 보낸다. 15분 초과 리뷰, 이전 판정 교체, 대상 변경,
  측정 실패/지연, 중복 시도는 거절한다. 수동 확인은 압력 회복 후에도 최신 대상이면 가능하다.
- 확인 종료는 기존 수동 SIGTERM의 현재 UID·시작 시각·Paseo/자신/상위 프로세스 보호를 사용한다.
  앱 번들·브라우저·터미널의 자동 종료 보호는 계속 유지하며 사용자 명시 확인은 기존 개별 종료와 같은 범위다.
  최신 캐시의 이름·경로도 기록 저장 전후에 다시 대조한 뒤 신호를 요청한다.
- 시도 상태를 먼저 저장하고 예정 로그를 디스크에 반영한 뒤 1회 요청한다. 기록 실패면 신호를 보내지 않는다.
  기존 로그 파일에 자동/확인 조치를 구분하며 10초 후 직접 PID 조회로 결과를 기록한다.
  플러그인이 먼저 종료되거나 재시작된 미확인 시도는 확인 불가이며 자동으로 다시 시도하지 않는다.
- 허용한 독립 worker의 자동 종료는 기존대로 선택 사항이다. UI에서 자동 리뷰와 일회 자동 종료 허용을 구분한다.
- 5.4절의 실험 코드는 완전히 제거하며 기본 호스트 선택기에 맡긴다. 다른 Mac을 설치/조작하거나 데몬 전역 설정을 수정하지 않는다.
- 검증: 후보 보존·구버전 상태 호환, 확인 전 신호 없음, PID/경로/리뷰 교체·만료·동시 확인·기록 실패·shutdown,
  자동 종료 보호 회귀, 공식 호스트별 화면 범위, 실제 로컬 RPC의 새 계약/거절과 기존 측정 간격을 확인한다.
