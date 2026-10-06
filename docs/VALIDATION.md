# mac-monitor 검증 기록

검증일: 2026-10-06 (KST). 환경: arm64 macOS 26.5.1, 물리 16 GiB,
페이지 16 KB, 논리 10코어, Node 24, Paseo CLI/daemon 및 플러그인 SDK 0.10.2.

## 완료/남은 검증

| 항목 | 결과 |
|---|---|
| PLAN 7절 구조, manifest `>=0.10.2` | 완료 |
| 타입 검사, DOM lib 제외 | 완료 (`npm run typecheck`) |
| 계산·오류·가짜 헬퍼·클라이언트/fleet 테스트 | 완료 (6개 파일, 31개 테스트) |
| client DOM/HTML audit | 0건 |
| 모든 Text 색 theme 토큰 | 소스 확인 완료 |
| universal arm64/x86_64, ad-hoc 서명 | 빌드 및 `lipo`/`codesign --verify` 완료 |
| 실제 C JSON → Zod 스모크 | 완료, `v:1`, 페이지 16384, errors 없음 |
| 로컬 install/reload | 완료, `running` |
| 로컬 RPC 100개 동시 요청 | 같은 seq, 오류 없음 |
| 단일 헬퍼 및 고정 2초 간격 | 실제 RPC/프로세스 검증 완료 |
| 여러 에이전트 pill 화면을 실제로 열기 | **사용자 확인 필요** (렌더러에서 pill 3개 공유 폴링 검증은 완료) |
| 앱 관심 30초 만료 | 테스트 및 실제 RPC에서 `off` 확인 |
| disable → 자식 종료 → enable | 완료, 헬퍼 1개로 복귀 |
| 부모 SIGKILL → 고아 헬퍼 방지 | 실제 네이티브 검증 완료 |
| prebuilt 실패 → 로컬 빌드 → Node 폴백 | 전용 임시 홈에서 실제 검증 완료 |
| Activity Monitor 화면 대조 | **사용자 대조 필요** |
| 라이트/다크, compact 실제 화면 | **사용자 확인 필요** |
| 다른 Mac 설치 / 실제 fleet 집계 | **별도 사용자 승인 및 확인 필요** |
| x86_64 실행 | Intel/Rosetta 환경에서 확인 필요 |

컴퓨터 제어 도구의 Paseo 앱 접근이 시간 초과되어 실제 화면을 관찰하지 못했다.
따라서 실제 pill 표시·테마·좁은 화면·Activity Monitor 수치 일치를 확인했다고 표현하지 않는다.
다른 Mac에는 설치하지 않았고 데몬 재시작, 전역 설정 직접 변경도 하지 않았다.

## 자동 검사

```sh
npm run typecheck
npm test
rg -n 'document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=' client/
lipo -archs bin/macmon-helper
codesign --verify --verbose bin/macmon-helper
```

audit는 일치 항목이 없어 종료 코드 1을 반환한다(실패가 아닌 0건 결과).
React Native 기본 요소만 사용하고, tsconfig의 lib는 `ES2023`이다.
스캐폴드의 DOM 사용 웹 예제는 제거했다.

최종 결과: `npm run typecheck` 통과, `npm test` 6개 파일 / 31개 테스트 통과.

자동 테스트 범위:

- 메모리 공식, 압축 실제 점유 페이지, 누락/역행 카운터, CPU 기준점·동일/0 Δtotal,
  사용자+nice 합산, 압력 1/2/4/기타/null 및 신선도 5초/15초 경계.
- 가짜 Node 헬퍼 정상 스트림, 잘못된 JSON/스키마, 부분 측정 실패, 시계 조정,
  중단 후 지수 백오프, 종료 뒤 자식 0개, SIGTERM 무시 자식 강제 정리.
- RPC 100개가 샘플을 만들지 않음, 프로세스 관심 on 단 한 번/30초 후 off/재개 측정 중.
- GiB/상대 시각/compact 라벨, pill 3개 공유 타이머 및 숨김 시 폴링 중단,
  라벨 변경 시만 update, 동시 요청 single-flight와 세부 요청 직렬화.
- fleet 버전 불일치 폴백, cleanup 이후 늦은 등록 차단, 등록 교체 시 소유권,
  3초 타임아웃 후에도 실제 RPC가 끝날 때까지 single-flight 유지.

React 테스트 렌더러는 deprecated 안내를 출력하지만 테스트는 통과한다.
화면 배치의 시각적 검증을 대신하지 않는다.

## 실제 헬퍼 및 로컬 RPC

`test/manual/live-rpc.mjs`는 검증 전용으로 0.10.2 CLI와 같은 내부 DaemonClient 전송을 사용한다.
제품 `client/`는 이 내부 API를 가져오지 않는다. 인증 값은 출력하거나 결과 파일에 저장하지 않는다.
로컬 루프백 데몬만 호출한다.

| 모드 | RPC 관찰 샘플 | seq/간격 |
|---|---:|---|
| 시스템 전용 | 6개 | 동시 100개 모두 seq 139; 간격 1996~2005ms, 평균 2000.6ms |
| 앱 관심 활성 | 62개 | 동시 100개 모두 seq 18; 간격 1990~2009ms, 평균 1999.93ms |

앱 활성 첫 응답 `processesStatus=warming`, 이후 `ok`.
관찰 마지막 샘플에서는 root 135개, 권한 제외 전체 212개였다.
CPU/메모리 상위 5개에 codex, claude, ChatGPT, Google Chrome for Testing 등이 포함되었다.
권한 제외 수는 실행 중인 프로세스 구성에 따라 달라진다.
관심 요청을 멈춘 뒤 30초가 지난 실제 RPC에서 `processesStatus=off`, `processes=null`을 확인했다.
모든 관찰 샘플의 errors는 빈 배열이었다.

`test/manual/native.ts`는 새 바이너리를 직접 검증했다.
단조 시계 간격은 2005.631 / 2002.419 / 1999.392ms였고,
첫 앱 주기 기준점 없음 → 다음 주기 ready → off 명령 후 null을 확인했다.
부모 프로세스를 SIGKILL해도 stdin EOF로 자식 헬퍼가 종료되었다.

`test/manual/fallback.ts`는 별도 임시 `PASEO_HOME`에서 prebuilt가 없는 경우 로컬 clang 빌드에 성공했고,
소스도 없는 경우 Node 모드로 폴백했다. 둘 다 두 번째 샘플에서 status=ok, errors=[]였다.
Node 모드의 앱 목록은 unsupported였다. 임시 홈은 검증 후 삭제했다.

```sh
node test/manual/live-rpc.mjs --seconds=12
node test/manual/live-rpc.mjs --processes --seconds=124
npx tsx test/manual/native.ts
npx tsx test/manual/fallback.ts
```

`paseo plugin disable mac-monitor`는 disabled를 반환했고 직후 `pgrep -fl macmon-helper` 결과는 0개였다.
다시 enable했을 때 running과 헬퍼 PID 11767을 확인했다.
reload/enable 로그에는 Loading/Ready/Stopping/Stopped와 수집기 시작 로그만 있었고 오류는 없었다.
최종 UI 반영 reload 뒤에도 enabled/running, 헬퍼 1개(PID 32197), RPC errors=[]를 확인했다.
데몬 PID 63070 / worker PID 63071은 초기 확인과 같아 데몬 재시작이 없었음을 확인했다.
빌드 취소 정리 보완을 반영한 마지막 reload(14:43:55 KST)도 running, 로그 errors=[],
헬퍼 1개(PID 34172)였다. 마지막 검증 후에도 플러그인은 enabled/running으로 남긴다.

## 헬퍼 자체 부하

`test/manual/measure-load.c`를 clang으로 빌드하여 각 모드를 120초 관찰했다.
`proc_pid_rusage`의 시작/종료 CPU 누적 차이를 timebase 변환하고,
종료 시 `PROC_PIDTASKINFO` RSS를 읽었다. `ps`/`top`은 주기적으로 실행하지 않았다.
측정 대상은 **C 헬퍼 자체**이며 Paseo·Node 서버·화면 렌더링 비용은 포함하지 않는다.

| 모드 | 관찰 시간 | CPU 시간 | 코어 1개 CPU | 10코어 전체 환산 | RSS | footprint |
|---|---:|---:|---:|---:|---:|---:|
| 시스템만 (PID 55691) | 120.004초 | 0.124671초 | 0.103889% | 0.010389% | 1.969 MiB | 2.453 MiB |
| 앱 스캔 활성 (PID 88970) | 120.001초 | 0.414686초 | 0.345570% | 0.034557% | 1.641 MiB | 1.500 MiB |

서로 다른 시점의 RSS이며 메모리 압력·상주 페이지 변동 때문에 앱 스캔 때 더 작게 나올 수 있다.
이 관찰값을 모든 Mac이나 프로세스 수에 대한 보장값으로 사용하지 않는다.
부하 관찰 이후 추가된 새 앱 그룹의 CPU 기준점 확인은 정수 카운터 검사이며
2초 주기·API 호출 수·스캔 방식은 동일하다. 최종 바이너리의 별도 스모크는 위에 기록했다.

```sh
clang -O2 -o /tmp/mac-monitor-measure-load test/manual/measure-load.c
/tmp/mac-monitor-measure-load <헬퍼 PID> 120
```

## Activity Monitor 대조 절차와 현재 결과

**사용자 대조 필요. Activity Monitor 화면과 직접 대조하지 않았으며 일치 확인은 미완료다.**

1. Activity Monitor CPU 하단의 사용자·시스템 값과 메모리 탭을 연다.
2. `npm run compare`를 실행한다. 자동 종료는 `npm run compare -- --samples=3`.
3. 같은 시각에 CPU(사용자+시스템), 사용된 메모리, 앱, 와이어드, 압축, 캐시, 스왑을 3회 이상 기록한다.
4. 용량은 1024³으로 통일한다. Activity Monitor CPU 기본 갱신 간격 5초와 헬퍼 2초의 차이를 기록한다.
5. 작업량·압력 변화가 적은 구간도 포함해 차이를 평가하고 이 표에 화면 값을 추가한다.

CLI 실행·3회 출력·종료 정리는 확인했다. 아래는 CLI 값만의 기록이며 Activity Monitor 값은 없다.

| 시각 KST | CPU 사용자/시스템/합계 % | 사용 / 앱 / 와이어드 / 압축 GiB | 캐시 GiB | 스왑 사용/전체 GiB | Activity Monitor |
|---|---|---|---:|---|---|
| 14:30:27 | 17.24 / 58.44 / 75.68 | 13.997 / 3.684 / 3.947 / 6.366 | 1.367 | 24.447 / 25.000 | 사용자 대조 필요 |
| 14:30:29 | 14.75 / 55.95 / 70.70 | 13.954 / 3.975 / 3.873 / 6.106 | 1.452 | 24.416 / 25.000 | 사용자 대조 필요 |
| 14:30:31 | 12.59 / 16.81 / 29.40 | 13.926 / 3.896 / 3.861 / 6.169 | 1.487 | 24.416 / 25.000 | 사용자 대조 필요 |

모두 pressure=warning이었다. CPU 변동의 원인은 이 기록만으로 확정하지 않는다.
화면 대조 전에는 차이의 크기와 일치 여부를 판단할 수 없다. 예상 차이 요인은 다음과 같다.

- 두 화면의 샘플 시각 및 CPU 관찰 구간 차이(2초 대 기본 5초).
- 1자리 표시 반올림, Node 폴백 스왑 텍스트의 MB 반올림.
- Activity Monitor 압력 그래프의 내부 계산 기준은 공개된 단순 sysctl 레벨과 완전히 동일하다고 단정할 수 없음.
- 권한 제외 프로세스 및 종료/생성 경계 때문에 앱 CPU 합계와 전체 CPU의 차이.
- footprint가 압축/스왑을 포함하므로 앱 합계와 물리 메모리 사용량의 차이.

## 사용자가 확인할 화면/다른 Mac

2026-10-06 시각적 UI 개선 검증:

- `npm run typecheck` 통과, 테스트 7개 파일/35개 통과, client DOM audit 0건.
- 누락값과 0의 구별, footprint 상대 비교, 앱 탭 전환, OS 압력만 상태 색으로 사용,
  RPC 실패 시 이전 값을 흐리게 표시하는 규칙을 추가 검증했다.
- `node test/manual/ui-preview.mjs`로 실제 컴포넌트 트리를 정적 HTML로 생성하고 Chrome으로 캡처했다.
  예시 데이터/예시 테마를 사용하는 520px 데스크톱·360px compact, 라이트/다크 배치를 검토했다.
  출력: `/tmp/mac-monitor-ui/{dark,light}-{desktop,compact}.{html,png}`.
  이 검토는 RN 요소를 CSS로 옮긴 정적 레이아웃 검토다. 실제 Paseo의 테마·모달 스크롤·터치 동작은 **사용자 확인 필요**다.
- **이번 변경의 로컬 반영은 미완료다.** `paseo plugin reload mac-monitor`를 두 번 시도했지만
  `Cannot connect to daemon ... Connection timed out`으로 끝났다. logs도 같은 연결 오류였다.
  `paseo daemon status`는 기존 PID 63070의 `localDaemon: running`, `connectedDaemon: unreachable`을 반환했다.
  로컬 `127.0.0.1:6767` HTTP 읽기 확인도 5초 시간 초과였다.
  기존 헬퍼(PID 52807) 1개가 유지된다. 금지된 데몬 재시작이나 다른 호스트 조작은 하지 않았다.
  연결이 회복되면 `paseo plugin reload mac-monitor`로 이번 UI를 반영해야 한다.

2026-10-06 UI 후속 수정: pill 폭 160px에 맞춰 라벨을 축약하고 상세를 공식 Modal로 변경했다.
typecheck, 기존 31개 테스트(모달 열기/닫기·에이전트별 분리 확인 추가), DOM audit 0건을 확인했다.
14:49 KST 플러그인 reload 후 running, 서버 로그 오류 없음, 헬퍼 1개를 확인했다.
실제 화면에서 RAM 잘림 해소·중앙 모달·compact 시트의 사용성은 **사용자 확인 필요**다.

- 같은 호스트의 여러 에이전트 화면에서 pill이 보일 때, 별도 compare/검증 CLI를 종료한 상태로
  `pgrep -fl macmon-helper`가 1개인지 확인한다.
- 라이트/다크에서 모든 텍스트, 압력 점과 세부 내용을 확인한다.
- 창을 좁혀 pill 축약·상세 모달/시트·카드 목록의 줄바꿈과 스크롤을 확인한다.
- 다른 Mac 설치는 별도 승인 후 진행한다. 각 호스트의 serverId 매칭, fleet 행 상세,
  오프라인 오류·마지막 값, 실험 설정 끄기·호스트 선택기 폴백을 확인한다.
