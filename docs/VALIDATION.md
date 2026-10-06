# mac-monitor 검증 기록

검증일: 2026-10-06 (KST). 환경: arm64 macOS 26.5.1, 물리 16 GiB,
페이지 16 KB, 논리 10코어, Node 24, Paseo CLI/daemon 및 플러그인 SDK 0.10.2.

## 완료/남은 검증

| 항목 | 결과 |
|---|---|
| PLAN 7절 구조, manifest `>=0.10.2` | 완료 |
| 타입 검사, DOM lib 제외 | 완료 (`npm run typecheck`) |
| 계산·오류·가짜 헬퍼·클라이언트/fleet·UI 테스트 | 완료 (8개 파일, 48개 테스트) |
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
| 실제 Paseo 데스크톱 다크 화면 | 완료: 통합 카드·앱 순위·개별 PID·디스크·자동 갱신 확인 |
| 라이트, compact 실제 화면 | **사용자 확인 필요** |
| 다른 Mac 설치 / 실제 fleet 집계 | **별도 사용자 승인 및 확인 필요** |
| x86_64 실행 | Intel/Rosetta 환경에서 확인 필요 |

초기에는 컴퓨터 제어 접근이 시간 초과됐으나, 후속 검증에서 실제 Paseo 앱 화면을 관찰했다.
데스크톱 다크 화면의 pill·통합 카드·개별 프로세스 목록을 확인했다. 라이트·compact·Activity Monitor 대조는 남아 있다.
다른 Mac에는 설치하지 않았고 데몬 재시작, 전역 설정 직접 변경도 하지 않았다.
아래 이전 검증 기록은 당시 버전의 결과이며 현재 동작은 다음 최종 검증을 기준으로 한다.

## 최종 후속 검증: 전체 종료와 앱 상세 이동

- `npm run typecheck` 통과, 테스트 8개 파일/48개 통과. 전체 종료 확인 전 RPC 없음·취소·대상 고정,
  다른 그룹/시작 시각/누락 PID/중복 PID/오래된 값 차단, 응답 순서가 다른 부분 성공·실패를 검증했다.
- 앱 상세 진입 시 좌상단 ‹ 뒤로·앱 이름, 시스템 화면에서 분리된 프로세스 목록,
  복귀 시 메모리 정렬 기준 유지도 테스트했다. DOM 클릭 회귀 검증은 자동 갱신·Modal 재마운트 방지를 통과했다.
- `node --import tsx test/manual/group-actions.mjs`: 스크립트가 만든 테스트 자식 두 개만 대상으로 했다.
  시작 시각 하나가 불일치하면 둘 다 전송하지 않고 살아 있음을 확인했다. 유효한 목록은 두 자식 모두 SIGTERM으로 종료했다.
  검증 종료 시 Collector와 추가 헬퍼를 정리했다. 네이티브 측정·보호 로직과 바이너리는 이번 변경에서 그대로 사용한다.
- 16:44 KST plugin reload 후 running. 16:45 실제 Paseo 데스크톱 다크 화면에서 각 행의 전체 종료,
  claude 상세의 좌상단 뒤로/앱 이름, codex 전체 종료 확인의 25개/PID 목록을 확인했다.
  전체 종료 확인은 취소했고 상위 목록으로 복귀했다. 기존 사용자 프로세스를 종료하지 않았다.
- compact 버튼 배치 보완 후 16:47 KST 타입 검사·48개 테스트가 통과했고 plugin reload 후 running을 확인했다.
  최종 로그에 오류가 없고 상주 헬퍼 PID는 33629다. client DOM/HTML·fontSize audit와 git diff --check도 통과했다.
- 라이트·compact 실제 화면, Activity Monitor 대조, 다른 Mac 검증은 앞서 기록한 사용자 확인 항목으로 남아 있다.

## 이전 후속 검증: 통합 화면·자동 갱신·개별 종료·디스크

- `npm run typecheck` 통과, `npm test` 8개 파일/44개 테스트 통과.
  초기 pill 값 즉시 표시, 2초 자동 읽기 중 ScrollView 인스턴스 유지·닫기 후 중단,
  확인 전 종료 RPC 없음·확인 대상의 시작 시각 유지·오류 표시를 검증했다.
- `test/manual/click-preview.mjs --verify`: 본문·정렬 클릭 시 pill action/Modal mount 횟수는 1을 유지한다.
  자동 읽기는 별도로 1→2로 증가하고 정상 화면에는 복사·새로고침 버튼이 없다. 닫은 뒤 자동 읽기는 멈춘다.
- 실제 Paseo 데스크톱 다크 화면: 16:29:27에 앱 측정 중에도 pill의 시스템 값이 즉시 표시됨을 관찰했다.
  16:34:49에는 CPU·메모리·디스크·상위 10개가 보였다. 16:35:13 codex를 눌러 PID별 CPU·메모리·종료 버튼과
  내부 스크롤 영역을 확인했다. 16:36:05 뒤로 이동해 목록이 복원되고 시스템 시각·수치가 자동으로 바뀌었음을 확인했다.
  기존 사용자 프로세스의 종료 확인은 실행하지 않았다.
- `node --import tsx test/manual/native-actions.mjs`: 검증 스크립트가 만든 자식만 SIGTERM으로 종료했다.
  시작 시각 불일치, 부모, 헬퍼 자신에 대한 요청은 차단됐다. 정상 JSON과 디스크 용량도 확인했다.
  서버 테스트는 다른 그룹·시작 시각·오래된 값 차단 및 제어 응답과 측정 스트림 분리를 확인한다.
- 최종 universal 바이너리 빌드·서명 완료. 16:28:17 플러그인 reload 후 running, 서버 로그 오류 없음,
  별도 검증 헬퍼 종료 뒤 설치 헬퍼 PID 45868 한 개를 확인했다. 데몬 재시작 명령은 사용하지 않았다.
  16:38 KST 최종 재검사도 typecheck·44개 테스트·DOM/커스텀 fontSize audit 0건,
  arm64/x86_64 및 서명 검증, running·로그 오류 없음·헬퍼 한 개로 통과했다.

최종 헬퍼 자체 부하 (`python3 test/manual/helper-cost.py`): 앱 관심을 켠 별도 헬퍼를 60.0036초 관찰했다.
30개 샘플의 CPU 시간 0.066903초, 코어 하나 기준 **0.111498%** (10코어 환산 0.011150%),
RSS **2.703125 MiB**였다. 간격은 **1990.985~2007.545ms**, 디스크 값의 측정 시각은 2회 바뀌었고
출력한 개별 프로세스 수의 최대값은 253개였다. 종료 후 추가 헬퍼는 남지 않았다.
Paseo·Node 서버·RPC·화면 렌더링 비용은 포함하지 않는다. 이전 120초 측정과 작업량이 달라 개선 비율로 비교하지 않는다.

디스크 API 자체 비용 (`test/manual/statfs-cost.c`): 같은 Data 볼륨 statfs를 500회 호출하여
평균 **0.571µs**, p95 **0.667µs**, 최대 **2.250µs**였다. 제품에서는 30초마다 읽는다.
파일 트리 순회·SSD 전체 스캔은 없다. [Apple statfs 필드 정의](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/statfs.2.html)를 사용한다.
APFS 공유 공간, purgeable 및 스냅샷의 처리 기준 때문에 시스템 설정 저장 공간 수치와 차이가 날 수 있다.
시스템 설정과 디스크 값의 직접 화면 대조는 미완료다.

## 자동 검사

```sh
npm run typecheck
npm test
rg -n --pcre2 'document\.|window\.|localStorage|navigator\.|<(?!void\b|string\b)[a-z]+[ >]|className=|onClick=|fontSize' client/
lipo -archs bin/macmon-helper
codesign --verify --verbose bin/macmon-helper
```

audit는 일치 항목이 없어 종료 코드 1을 반환한다(실패가 아닌 0건 결과).
HTML 패턴에서 TypeScript의 `Promise<void>`와 `useState<string | null>` 타입 인수는 제외한다.
React Native 기본 요소만 사용하고, tsconfig의 lib는 `ES2023`이다.
스캐폴드의 DOM 사용 웹 예제는 제거했다.

최종 결과: `npm run typecheck` 통과, `npm test` 8개 파일 / 48개 테스트 통과.

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

## 이전 UI 검증 기록 및 사용자 확인 항목

아래 기록은 시간순 변경 이력이다. 수동 갱신·복사·제외 통계는 최종 사용자 요청으로 제거됐다.

2026-10-06 상세 클릭으로 인한 재마운트 수정·“샘플” 제거:

- 정상 상태의 “샘플” 배지를 제거하고 측정 시각만 유지했다. 오류·지연·미지원 표시는 유지한다.
- typecheck·40개 테스트 통과, client DOM/HTML·커스텀 fontSize audit 0건.
- 실제 pill/상세 컴포넌트와 React 19.1.0·React Native Web 0.21.0을 사용하는 DOM 실행 회귀 검증을 추가했다.
  `node test/manual/click-preview.mjs --verify`는 jsdom 26.1.0으로 실행한다. 테스트 의존성은
  `/tmp/mac-monitor-click-check`에만 설치했고 프로젝트 package.json/lockfile은 변경하지 않았다.
- 클릭 전파를 차단하지 않은 경로에서 본문 클릭 후 action 실행·Modal mount·상세 RPC 횟수가
  각각 1→2로 증가함을 재현했다. 수정 경로에서는 본문·탭·복사·닫기 클릭 후 action/mount가
  각각 1로 유지되고 새로고침 버튼만 상세 RPC를 1→2로 증가시켰다. 복사 호출도 1회를 확인했다.
- 브라우저 제어는 사용 불가였다(`agent-browser` 미설치, CUA 브라우저 없음).
  위 검증은 실제 DOM 이벤트 전달 테스트이며, 실제 Paseo·모바일 터치·시스템 클립보드 검증을 대신하지 않는다.
- 15:56 KST reload 후 running, 서버 로그 오류 없음, 헬퍼 PID 58628 한 개를 확인했다.

2026-10-06 툴팁 축소·수동 갱신·복사:

- pill/모달 제목을 “모니터”로 축소했다. 0.10.2 호스트 API의 제약으로 자동 툴팁 자체는 남는다.
- typecheck와 40개 테스트 통과, client DOM/HTML·커스텀 fontSize audit 0건.
- 최초 읽기 뒤 60초 경과·다른 창의 Query 캐시 변경에도 추가 RPC가 없고 화면 수치·순위·시각이
  유지됨을 검증했다. 새로고침 때만 새 데이터 표시, 새로고침 실패 시 이전 값과 연결 오류 보존,
  표시 값 복사, Text selectable, 클립보드 실패 처리, 누락값·미지원·오류의 복사도 검증했다.
- 최초 앱 기준점 대기는 최대 두 주기이며 이후 자동 읽기가 없고 취소 시 타이머가 남지 않음을 검증했다.
- 정적 컴포넌트 미리보기 HTML을 다시 생성했다. 실제 Paseo의 선택 유지·클립보드·모바일 터치는
  **사용자 확인 필요**다. 이전 PNG 캡처는 이번 두 버튼을 포함하지 않는다.
- 15:45 KST 플러그인 reload 후 running, 서버 로그 오류 없음, 헬퍼 PID 23239 한 개를 확인했다.
  데몬 재시작 명령은 사용하지 않았다. 서버 수집과 2초 측정 간격은 변경하지 않았다.

2026-10-06 안내 문구 제거·목록 높이 고정:

- 단위/Activity Monitor/footprint 각주와 반복 설명을 화면에서 제거했다. 계산 기준은 README에 유지한다.
- typecheck와 37개 테스트 통과, DOM/커스텀 fontSize audit 0건.
- 최초 스냅샷 없음 → 앱 측정 중 → 정상 → 오류 → 미지원 전환에서 목록의 높이 320을 유지하는
  렌더링 검증을 추가했다. root/권한 제외 수는 고정 목록 내부에 표시한다.
- 플러그인 reload 후 running과 서버 로그 오류 없음을 확인했다. 모바일 실제 중첩 스크롤은 사용자 확인 필요다.

2026-10-06 기본 폰트·상위 10개 후속 수정:

- 모든 client의 `fontSize` 지정 제거. typecheck와 테스트 7개 파일/36개 통과, DOM audit 0건.
- universal 헬퍼 재빌드 후 arm64/x86_64 슬라이스와 ad-hoc 서명을 확인했다.
- 네이티브 수동 검증: CPU·메모리 상위 목록 각각 10개, 간격 2003.430 / 1997.508 / 2004.081ms,
  첫 앱 샘플 측정 중·다음 샘플 정상·스캔 끄기·부모 SIGKILL 뒤 자식 종료를 확인했다.
- **이번 reload 성공으로 직전 UI 변경의 로컬 반영 미완료 문제도 해소되었다.**
  `paseo plugin reload mac-monitor` 이후 running, 로그 오류 없음, 실제 RPC seq 22/23에서
  CPU·메모리 목록 각각 10개를 확인했다. seq 23은 `status=ok`, `processesStatus=ok`였다.
  검증 도구 종료 후 헬퍼 PID 35365 한 개를 확인했다. 데몬 재시작 명령은 사용하지 않았다.
- 목록은 최대 높이 320의 내부 스크롤 영역이다. 기본 글자 크기·10개 목록의 렌더링을 검증했고,
  모바일 실제 터치/시트 중첩 스크롤은 **사용자 확인 필요**다.

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
