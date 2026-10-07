# mac-monitor 검증 기록

최종 검증일: 2026-10-07 (KST). 환경: arm64 macOS 26.5.1, 물리 16 GiB,
페이지 16 KB, 논리 10코어, Node 24, Paseo CLI/daemon 및 플러그인 SDK 0.10.2.

## 완료/남은 검증

| 항목 | 결과 |
|---|---|
| PLAN 7절 구조, manifest `>=0.10.2` | 완료 |
| 타입 검사, DOM lib 제외 | 완료 (`npm run typecheck`) |
| 계산·오류·헬퍼·호스트 전환·UI·수동 종료 테스트 | 완료 (0.4.0, 8개 파일, 57개 테스트) |
| client DOM/HTML audit | 금지 사용 0건 (`Promise<void>` 타입의 검색 결과 1건은 DOM/HTML 아님) |
| 모든 Text 색 theme 토큰 | 소스 확인 완료 |
| universal arm64/x86_64, ad-hoc 서명 | 빌드 및 `lipo`/`codesign --verify` 완료 |
| 실제 C JSON → Zod 스모크 | 완료, `v:1`, 페이지 16384, errors 없음 |
| 로컬 install/reload | 완료, `running` |
| 로컬 RPC 100개 동시 요청 | 같은 seq, 오류 없음 |
| 단일 헬퍼 및 고정 2초 간격 | 실제 RPC/프로세스 검증 완료 |
| 여러 에이전트 pill 화면을 실제로 열기 | 완료: 실제 두 화면의 값·자동 갱신 동일, 헬퍼 1개, 1999~2000ms |
| 앱 관심 30초 만료 | 테스트 및 실제 RPC에서 `off` 확인 |
| disable → 자식 종료 → enable | 완료, 헬퍼 1개로 복귀 |
| 부모 SIGKILL → 고아 헬퍼 방지 | 실제 네이티브 검증 완료 |
| prebuilt 실패 → 로컬 빌드 → Node 폴백 | 전용 임시 홈에서 실제 검증 완료 |
| 자동 감시·Luna 리뷰·자동 종료 제거 | 소스·UI·RPC·native 명령 제거, 설치된 RPC/번들 및 이전 파일 보존 확인 |
| 개별·전체 수동 종료 | 테스트 자식의 실제 SIGTERM, 시작 시각 불일치·부모/헬퍼 차단 검증 |
| 실험적 멀티 호스트 집계 제거 | 레지스트리·표·설정·serverId 파일 읽기 제거, 공식 호스트별 화면 및 오프라인 전환 테스트 완료 |
| Activity Monitor 화면 대조 | 이전 버전 대조 및 원인 확인 완료; **현재 합계는 사용자 대조 필요** |
| 실제 Paseo 데스크톱 다크 화면 | 0.4.0 시스템 수치·상위 10개·프로세스 상세·뒤로 복귀, 리뷰 버튼 제거 확인 |
| 실제 Paseo 데스크톱 라이트 화면 | 이전 RAM·고정 목록·정상/주의 색 확인; 현재 기본 모니터는 추가 확인 필요 |
| compact 실제 화면 | **추가 확인 필요**: 확대 조작으로 호스트 compact 배치를 재현하지 못함 |
| 다른 Mac 설치 / 공식 호스트 전환 | **별도 사용자 승인 및 확인 필요**: 현재 연결 호스트 1개; 실제 원격 전환은 미검증 |
| x86_64 실행 | Intel macOS 26 CI에서 커밋된 prebuilt 실행 완료; Intel의 Paseo 설치는 미검증 |

초기에는 컴퓨터 제어 접근이 시간 초과됐으나, 후속 검증에서 실제 Paseo 앱 화면을 관찰했다.
데스크톱 다크·라이트 화면과 Activity Monitor를 직접 관찰했고 두 에이전트 pill도 동시에 확인했다.
현재 기본 모니터의 라이트·compact 실제 배치와 다른 Mac의 Paseo 설치·공식 호스트 전환은 남아 있다.
다른 Mac에는 설치하지 않았고 데몬 재시작, 전역 설정 직접 변경도 하지 않았다.
아래 이전 검증 기록은 당시 버전의 결과이며 현재 동작은 다음 최종 검증을 기준으로 한다.

## 최종 후속 검증: 자동 관리 제거 (0.4.0)

2026-10-07 15:45~15:54 KST. 범위와 변경 근거는 [PLAN 15절](PLAN.md), [DECISIONS.md](DECISIONS.md)에 있다.

- `npm run typecheck` 통과. `npm test` 8개 파일/57개 통과.
  자동 관리 전용 테스트를 제거하고 메모리·CPU·압력·오류·Node 폴백·수명주기·30초 관심,
  공유 pill·화면 자동 갱신·호스트 전환·PID 재사용·수동 확인·그룹 목록 고정·부분 실패 회귀를 유지했다.
- `npm run build`, `lipo -archs`, `codesign --verify --strict` 통과. 새 prebuilt는 arm64/x86_64 universal이다.
  `test/manual/native.ts`는 실제 JSON → Zod, 상위 10개, 앱 기준점 → 최신, procs off,
  1992~2011ms 간격과 부모 SIGKILL 후 헬퍼 종료를 확인했다.
- `test/manual/native-actions.mjs`와 `group-actions.mjs`는 직접 만든 Node 자식만 사용했다.
  잘못된 시작 시각·부모/헬퍼 종료는 차단하고 개별 및 정확히 확인한 두 자식의 SIGTERM 종료를 확인했다.
  그룹 대상 하나가 달라지면 신호를 전혀 보내지 않았다. 테스트 자식·별도 헬퍼는 모두 정리했다.
- `test/manual/fallback.ts`는 별도 임시 홈에서 prebuilt 누락 → 로컬 clang 빌드와
  소스 누락 → Node 전용 모드까지 확인했다. 두 모드 모두 시스템 status ok/errors=[]였으며 Node의 목록은 미지원이다.
- 15:48:30 KST `paseo plugin reload mac-monitor` 후 running. 실제 host RPC는 version 0.4.0/native를 반환했다.
  snapshot의 automation과 process list의 path/autoAllowed가 없다. 이전 자동 관리 RPC 4개는 모두
  `does not contribute RPC`로 거절됐다. 새 설정 저장이나 모델 호출은 수행하지 않았다.
- 실제 로컬 동시 100개 snapshot 요청은 seq 11 하나였다. 앱 관심을 켜면 warming → ok로 전환했고 errors=[]였다.
  disable/enable 뒤 1회만 앱 관심을 요청하고 42초간 시스템 캐시만 읽은 별도 관찰은
  21개 샘플/seq 16~36, 간격 **1995~2005ms**, warming → ok → off였다. 마지막 값도 ok/errors=[]였다.
- 실제 다크 Paseo에서 리뷰 버튼이 없는 시스템 화면·CPU/메모리 열·상위 10개를 확인했다.
  codex 프로세스 상세에는 수동 종료만 표시됐고 뒤로 이동해 목록으로 복귀했다.
  사용자 프로세스의 종료 버튼은 실행하지 않았다. 현재 라이트·compact 화면은 직접 확인하지 않았다.
- 15:52:37 KST disable 후 `pgrep -fl macmon-helper`는 0개였다.
  enable 후 **PID 88094 한 개**로 복귀했다. 최종 로컬 snapshot은 ok/processes off/errors=[]이고
  플러그인 로그에는 시작·정리 외 stderr·오류·실패가 없었다. agent-graph는 계속 running이었다.
  CLI 실행기의 기존 Electron codesign ENOENT 메시지는 일부 명령에 표시됐지만 플러그인 로그의 오류는 아니다.
- 기존 자동 관리 설정 파일의 SHA-256은 반영 전후 동일했다. 없던 상세 자동 조치 로그도 새로 생성되지 않았다.
  실제 전역 설정을 직접 수정하거나 이전 기록을 삭제하지 않았다.
- 설치된 클라이언트 번들 **59,711 bytes**에서 자동 관리 RPC·모델·허용 버튼과 실험 집계 문자열이 없다.
  React Native 제공 Hermes의 바이트코드 컴파일을 통과했다. 이는 실제 모바일 화면/터치 확인을 대신하지 않는다.
  client AST의 HTML JSX·DOM API/속성·fontSize·색 없는 Text는 0건이며 Text 색은 모두 theme 토큰이다.

`python3 test/manual/helper-cost.py`는 새 헬퍼의 앱 스캔을 켠 상태로 **60.0025초** 관찰했다.
CPU 시간 0.206477초, **코어 하나의 0.344114%**(10코어 환산 0.034411%), 최대 RSS **2.765625 MiB**였다.
30개 샘플, 간격 1995.701~2004.317ms, 디스크 조회 2회, 최대 전송 멤버 334개였다.
별도 측정 헬퍼는 종료했으며 최종 상주 헬퍼는 하나다. 이는 Paseo/Node/UI 전체 부하가 아니며
프로세스 수·부하가 다른 이전 측정과 성능 개선 비율로 비교하지 않는다.

`npm run compare -- --samples=3`는 정상 CPU 샘플 3개와 메모리·압력·스왑·앱 데이터를 errors=[]로 출력한 뒤 종료했다.
**현재 Activity Monitor 화면 대조는 사용자 대조 필요**이며 일치한다고 단정하지 않는다.
실제 라이트·compact/모바일과 다른 Mac 설치·공식 호스트 전환도 확인이 남아 있다.
이번 검증에서는 데몬 재시작·다른 Mac 조작·실제 사용자 프로세스 종료를 하지 않았다.
아래 자동 관리 검증과 당시 미검증 흐름은 제거 전 버전의 변경 이력이다.

## 이전 후속 검증: 리뷰 후보 확인 종료·실험 집계 제거 (0.3.0)

2026-10-07. 로컬 플러그인 검증은 14:56~15:01 KST에 수행했다.
승인 범위·호스트 전환 결함 재현과 검토 결과는 [DECISIONS.md](DECISIONS.md), [REVIEW.md](REVIEW.md)에 있다.

- `npm run typecheck` 통과, `npm test` 11개 파일/162개 통과.
  최근 후보 보존·이전 v1 파일 호환, normal/observe/terminate와 만료,
  확인 전 RPC 없음·취소·화면 자동 갱신 중 선택 고정, 전체 식별자/리뷰 시각 변경,
  동시 중복 요청·저장/로그 실패·비동기 대기 중 변경·shutdown·통신 실패와 재시작 후 unknown을 검증했다.
  기존 자동 종료의 보호·예산·압력·증가 추세·취소·최종 검사 테스트도 통과했다.
- 공식 호스트 전환 테스트에서 이전 hostname이 남는 실패를 재현했다.
  화면 수명주기와 host-info 캐시를 호스트별로 분리한 뒤 전환·오프라인 선택 테스트가 통과했다.
  `client/fleet/`, 등록·정리 로직, 실험 설정, 서버의 server-id 파일 읽기를 제거했다.
  공식 SDK의 연결 호스트/에이전트 수는 유지하며 다른 호스트의 플러그인 RPC 집계는 하지 않는다.
- `./node_modules/.bin/tsx test/manual/confirmed-actions.mjs`:
  검증 스크립트가 만든 Node 자식과 합성 리뷰를 사용했다. 실제 C 헬퍼가 읽은 PID·시작 시각·경로에 대해
  경로 불일치와 중복 요청은 거절하고 정확한 확인에 SIGTERM을 **1회** 보냈다.
  실제 자식 종료와 10초 후 직접 PID 조회를 확인했으며 `planned → sent → exited`, `mode: confirmed`,
  로그 권한 0600을 확인했다. 자체 자식·별도 헬퍼·임시 파일은 모두 정리했다.
  실제 메모리 압력이나 Luna 호출을 유발한 시험은 아니다.
- `paseo plugin reload mac-monitor` 후 running.
  `node test/manual/automation-rpc.mjs --check-confirm`에서 새 리뷰 목록 계약과 존재하지 않는 리뷰의 거절을 확인했다.
  호스트 정보는 version 0.3.0이며 serverId를 반환하지 않는다. 기존 설정 enabled/critical 120초와 대상 0개를 보존했다.
- 설치된 클라이언트 번들 81,307 bytes에서 새 확인 RPC와 실험 설정/레지스트리 제거를 확인했다.
  React Native 제공 Hermes의 바이트코드 컴파일은 오류 없이 통과했다. 실제 모바일 화면·터치 검증을 대신하지 않는다.
- 실제 로컬 `node test/manual/live-rpc.mjs --seconds=42`: 동시 100개 요청은 seq 13 하나였다.
  21개 관찰은 seq 13~33, 간격 **1996~2005ms**, status ok/압력 normal/errors 없음이었다.
  닫힌 화면에서는 앱 스캔 off였고 실제 패널을 연 뒤 warming → ok로 전환했다. 별도 측정 헬퍼를 만들지 않았다.
- 실제 다크 Paseo에서 시스템 값·단일 메모리 바·CPU/메모리 열·상위 10개를 확인했다.
  자동 리뷰 화면은 기본 폰트·고정 스크롤 높이·켜짐·감시·검토한 후보 없음으로 표시됐고 뒤로 복귀했다.
  실험 집계/설정은 보이지 않았다. 자연 발생 후보가 없어 실제 후보의 확인 화면은 단위 렌더링 검증만 수행했다.
- 15:01:28 KST disable 뒤 `pgrep -fl macmon-helper` 결과는 0개였다.
  enable 뒤 PID 9000 한 개로 복귀했으며 자동 리뷰 설정·대상 0개·후보 0개가 보존됐다.
  실제 snapshot은 ok/normal/processes off였고 서버 로그 154개에 stderr·오류·실패가 없었다.
- client 9개 TS/TSX의 AST에서 HTML JSX 0건, DOM API/속성·fontSize 0건,
  색이 없는 Text 0건을 확인했다. 모든 Text 색은 theme 토큰이다.
  단순 `<[a-z]+[ >]` 검색의 `Promise<void>` 한 건은 타입이며 HTML이 아니다.
  `git diff --check`, 기존 universal 바이너리의 arm64/x86_64·엄격한 서명 검증도 통과했다.
- 코드 반영 공개 main `d4059ef`의 [arm64·Intel CI](https://github.com/01-works/paseo-plugin/actions/runs/37579786607)가 모두 통과했다.
  두 아키텍처에서 타입·162개 테스트·커밋된 prebuilt 실행·universal 빌드/서명·네이티브 JSON 스키마를 검증했다.
  로컬 원본과 게시된 mac-monitor 폴더의 git tree가 동일하고 다른 폴더에는 변경이 없음을 확인했다.

0.3.0은 네이티브 소스/바이너리를 변경하지 않았으므로 헬퍼 비용은 아래 0.2.1의 60초 측정을 인용한다.
이번 변경의 Paseo/Node/UI 전체 부하를 새로 측정한 값은 아니다. 정상 압력에서 추가 앱 스캔·AI 호출·파일 기록은 없다.

자연 발생 임계 압력의 전체 Luna/확인 흐름, 현재 합계의 Activity Monitor 화면 대조,
새 후보 화면의 라이트·compact/모바일, 다른 Mac의 설치·공식 호스트 전환은 남아 있다.
사용자 프로세스에는 종료 신호를 보내지 않았고 데몬 재시작·전역 설정 직접 변경·다른 Mac 조작은 하지 않았다.

## 최종 후속 검증: 자동 종료 경계의 다각도 리뷰 (0.2.1)

2026-10-06 22:07~22:29 KST. 재현 조건과 우선순위는 [REVIEW.md](REVIEW.md)에 있다.

- 수정 전 회귀 테스트에서 허용 대상 경로/이름 변경·검증 중 변경·CLI 마지막 출력·shutdown 기록 누락이
  9개 실패로 재현됐다. 네이티브 시험에서도 Codex/Paseo 조상과 분리한 Terminal 자식이 허용되어 실패했다.
- 수정 후 `npm run typecheck`, `npm test` 10개 파일/135개 통과.
  확인 화면의 경로/이름 전달, 이전 허용 입력 거절, 검증 전후 대상 대조,
  개행 없는 CLI 도구/실패/깨진 출력과 정상 출력, 전송 대기·조회 대기·미조회 상태의 shutdown 기록,
  조회 예외의 unknown 기록 및 shutdown 기록 실패의 cleanup을 확인했다.
- `npm run build`, `lipo bin/macmon-helper -verify_arch arm64 x86_64`, `codesign --verify --strict` 통과.
  `./node_modules/.bin/tsx test/manual/automatic-actions.mjs`는 독립 worker만 허용·SIGTERM·직접 종료 조회했다.
  별도 검증용 Codex·Terminal·iTerm·Warp·일반 `.app` 부모 아래 자식은 허용과 신호 전송 모두 차단됐다.
  실행 경로/시작 시각 불일치도 차단했고 자체 worker·부모·helper·임시 파일을 정리했다.
- 실제 로컬 플러그인만 reload했다. `node test/manual/consent-rpc.mjs`로
  이전 입력 형식과 경로 불일치 거절, 직접 만든 작은 orphan worker만 허용·해제를 확인했다.
  작업 프로세스는 허용/종료하지 않았고, 자동 리뷰/종료 조건이 될 수 없는 1 GiB 미만 검증용 worker만 사용했다.
  허용 목록은 0개로 복귀하고 기존 설정/사건 기록은 보존됐다.
- `node test/manual/live-rpc.mjs --seconds=42`에서 동시 100개 요청은 seq 15 하나였으며,
  21개 관찰은 seq 15~35, 간격 1996~2003ms, status ok/errors 없음이었다.
  압력은 normal/warning, 설정은 critical 120초였으므로 앱 스캔은 계속 off였다.
- 22:25:49 KST enable 전 disable 상태의 helper는 0개였다. enable 뒤 PID 10079 한 개로 복귀했다.
  자동 관리 enabled/critical 120초/대상 0개/사건 0개가 보존됐다.
  이후 실제 snapshot seq 95는 ok/normal/off였고 플러그인은 running이었다.
  서버 로그 142개는 모두 stdout이며 오류·실패·stderr가 없었다.
- client DOM/HTML/fontSize 금지 패턴 0건, 변경한 Text의 theme 토큰과 DOM 없는 tsconfig 유지,
  `git diff --check` 통과. 측정 공식·간격·정상 상태의 추가 스캔/AI/기록 구조는 변경하지 않았다.
- 재로딩 전 실제 다크 화면에서 시스템 수치·기본 폰트·단일 메모리 바·CPU/메모리 열·상위 10개·감시를 직접 관찰했다.
  0.2.1 재로딩 후 컴퓨터 제어가 시간 초과돼 화면 재확인은 완료하지 못했다.
  이번 UI 수정은 확인한 경로/이름을 RPC에 전달하는 부분이며 배치 변경은 없다.
- 공개 main `1e613e1`의 [arm64·Intel CI](https://github.com/01-works/paseo-plugin/actions/runs/37471794185)가 모두 통과했다.
  두 아키텍처에서 타입 검사·135개 테스트·커밋된 prebuilt 실행·universal 빌드/서명·JSON 스키마를 확인했다.
  로컬 원본과 게시된 mac-monitor 하위 디렉터리의 git tree가 동일함을 확인했다.

0.2.1 헬퍼 부하 (`python3 test/manual/helper-cost.py`): 앱 스캔 활성 helper를 **60.005450초** 관찰했다.
**30개 샘플**, CPU 시간 **0.255661초**, 코어 하나 **0.426063%**(10코어 환산 **0.042606%**),
최대 RSS **4.50 MiB**, 간격 **1990.380~2009.616ms**, 디스크 조회 2회, 출력 구성원 최대 354개였다.
별도 helper의 측정 중 로컬 캐시 RPC 검증도 함께 실행했다. 완료 뒤 별도 helper를 정리하고
Paseo helper 한 개만 확인했다. Paseo·Node·화면·AI 비용을 포함하지 않으며 이전 측정과 비용 증가율로 비교하지 않는다.

실제 임계 압력과 전체 자동 종료 흐름, 현재 합계의 Activity Monitor 화면 대조,
자동 관리 라이트/compact/모바일 화면, 다른 Mac 검증은 남아 있다.
압력을 인위적으로 만들거나 사용자 프로세스를 종료하지 않았으며 데몬과 전역 설정·다른 Mac은 변경하지 않았다.

## 최종 후속 검증: Luna 리뷰·개별 worker 자동 관리·종료 로그 (0.2.0)

2026-10-06 21:38 KST. PLAN 13절과 DECISIONS의 후속 사용자 요청을 구현했다.

- `npm run typecheck` 통과, `npm test` 10개 파일/120개 테스트 통과.
  압력 지속·60초 증가·회복/측정 실패·호출 예산·보류·취소·허용/대상 변경·저장 실패·최종 재검사를 확인했다.
  모델이 terminate를 반환해도 허용 대상이 없으면 신호를 보내지 않는다. SIGTERM 후 압력이 회복돼도 PID를 직접 조회한다.
- 가짜 CLI에서 도구 이벤트·스키마/대상 오류·출력 한도·시간 제한·취소·자식 정리·임시 파일 삭제를 검증했다.
  현재 CLI의 알려진 Code Mode 비활성 시작 안내만 허용하며 다른 오류는 중단한다.
- `./node_modules/.bin/tsx test/manual/automatic-actions.mjs`로 직접 만든 C worker만 검증했다.
  시작 시각/경로 불일치와 Codex 부모 아래의 자식은 거절했다. 독립 worker의 허용 검증·SIGTERM·직접 종료 조회는 통과했다.
  앱 스캔을 끈 뒤에도 inspect는 같은 PID를 조회하며, 스크립트가 만든 helper·worker·임시 폴더는 정리했다.
- `./node_modules/.bin/tsx test/manual/review.ts`의 가상 후보로 실제 `gpt-6-luna` 호출에 성공했다.
  결과는 허용되지 않았고 작업 목적이 불명확하므로 observe였다. 리뷰 실행은 5,169ms,
  `/usr/bin/time -l` 전체 검증 명령은 real 5.42초/user 0.44초/sys 0.17초, 최대 RSS 109,101,056 bytes(104.05 MiB)였다.
  최대 RSS는 단일 프로세스 최대값이며 동시 자식의 메모리 합계는 아니다. 실제 메모리 압력은 인위적으로 유발하지 않았다.
- 상세 로그는 임시 폴더에서 병렬 요청 순서·0600·256 KiB 교체·이전 파일 하나만 보존을 검증했다.
  리뷰 → 종료 예정 → 신호 전송 → 10초 후 종료 확인을 구별하며 PID·시작 시각·경로·근거·전후 수치를 기록한다.
  예정 기록 저장 실패는 신호 전송을 막는다. 조회하지 못한 측정값/seq는 null이며 정상 샘플은 파일에 쓰지 않는다.
- universal arm64/x86_64 바이너리 빌드·ad-hoc 서명과 `codesign --verify --strict` 통과.
  client DOM/HTML·fontSize 검색 0건, 신규 Text의 theme.colors 확인, `git diff --check` 통과.
- 로컬 플러그인만 reload한 뒤 전용 RPC로 리뷰를 켰다. 기본 `critical` 120초, 모델 Luna, 허용 대상 0개다.
  실제 다크 화면에서 단일 메모리 바, 자동 관리 감시/켜짐·허용 대상 0개·뒤로 복귀를 확인했다.
  Codex 개별 목록의 수동 종료 버튼은 37개, 자동 허용 버튼은 0개였다. 사용자 프로세스에는 종료/허용 요청을 보내지 않았다.
- 창을 닫은 뒤 42초 RPC 관찰에서 동시 100개 요청은 같은 seq 72, 이어서 21개 샘플은 seq 72~92였다.
  간격 1995~2004ms, status ok/압력 normal/errors 없음. 기존 UI 관심이 만료되면 `processesStatus: off`로 바뀌었다.
  자동 관리가 켜져 있어도 정상 압력에서 추가 앱 스캔이나 리뷰가 없음을 확인했다.
- 21:38:34 disable 뒤 `pgrep -fl macmon-helper`는 0개였다. 21:38:41 enable 뒤 PID 98675 한 개로 복귀했다.
  리뷰 켜짐·대상 0개가 보존됐고 `paseo plugin ls`는 enabled/running이었다. 로그 130개는 모두 stdout, 오류/실패 없음이었다.
- GitHub main `8fb8ce8`의 [arm64·Intel CI](https://github.com/01-works/paseo-plugin/actions/runs/37465234219)가 모두 통과했다.
  각 아키텍처에서 타입 검사·120개 테스트·커밋된 prebuilt 실행·universal 빌드/서명·JSON 스키마를 확인했다.
  CI에서는 로그인이나 실제 AI 호출을 사용하지 않는다. 공개 mac-monitor 트리와 로컬 원본의 git tree가 같음을 확인했다.
  배포 저장소의 다른 플러그인 작업이 진행 중이므로 별도 임시 체크아웃에서 mac-monitor 하위 변경만 게시했다.

최종 헬퍼 부하 (`python3 test/manual/helper-cost.py`): 앱 스캔을 켠 별도 helper를 60.002464초 관찰했다.
30개 샘플, CPU 시간 0.227825초, 코어 하나 **0.379693%**(10코어 환산 0.037969%), 최대 RSS **4.15625 MiB**였다.
간격은 **1993.758~2010.022ms**, 디스크 조회 시각은 2회 바뀌었고 최대 337개 개별 항목을 받았다.
초반에는 네이티브 검증용 worker/helper도 함께 실행 중이었다. Paseo·Node 서버·AI 리뷰·화면 비용은 포함하지 않으며
이전 관찰과 작업량이 달라 변경 전후 비용 증가율로 비교하지 않는다.

남은 실제 검증: 임계 압력이 자연 발생했을 때 **Paseo 플러그인 환경의** CLI 실행·로그 기록,
직접 허용한 독립 worker에 대한 전체 자동 흐름, 라이트/compact 화면, Activity Monitor의 현재 합계 대조, 다른 Mac 설치.
실제 사용자 프로세스 자동 종료나 메모리 압력 유발을 검증 목적으로 실행하지 않았다.
정상 상태여서 이 Mac의 상세 로그 파일은 아직 사건이 생기기 전이며, 로컬 파일 쓰기는 임시 폴더 테스트로 검증했다.

## 최종 후속 검증: 스왑 표시 간소화

2026-10-06 20:18 KST, 상세와 데스크톱 호스트 표의 스왑을 사용량만 표시하도록 통일했다.
수집기·RPC·대조 CLI의 스왑 used/total과 측정 주기는 변경하지 않았다.

- `npm run typecheck`, 기존 UI 테스트 14개, `git diff --check` 통과.
  client의 스왑 전체 표시·DOM/HTML 금지 요소·fontSize 지정 검색 결과는 0건이다.
- 플러그인만 reload한 뒤 `paseo plugin ls`에서 enabled/running을 확인했다.
  로그 112개는 모두 stdout이며 오류·실패 문구가 없다. 헬퍼는 PID 45802 한 개다.
- 이번에는 소스와 렌더링 테스트를 확인했다. 실제 Paseo 화면의 최신 배치·테마·compact 화면과
  Activity Monitor의 새 메모리 합계 대조는 **사용자 확인 필요**로 유지한다.

## 최종 후속 검증: Activity Monitor 기준 메모리 합계 (0.1.1)

2026-10-06 19:56~20:03 KST, 사용자의 후속 개선 지시에 따라 PLAN 4.1의 총 사용량 식을 바꿨다.
세부 항목 값은 유지하고 메모리 바는 총 사용량/물리 메모리로 간소화했다. 변경 근거는 DECISIONS.md에 있다.

- `npm run typecheck`, 8개 파일/58개 테스트, `git diff --check`를 통과했다.
  실제 원시 카운터로 이전 12.819213867 GiB 대신 확인한 Activity Monitor 식의 13.382171631 GiB를 검증했다.
  4/16 KiB 페이지·speculative 중복 제외·누락·역행·음수/정밀도 손실·유효한 0·이전 헬퍼의 부분 실패를 포함한다.
  Node의 Pages free 보정과 합계가 구성 합과 다르거나 캐시와 중첩할 때의 막대 비율도 확인했다.
- client 금지 패턴 검색은 `Promise<void>` 타입 표기 1건뿐이었다. 실제 DOM/HTML 사용과 fontSize 지정은 0건이다.
  변경한 Text는 theme 색을 사용하고 고정 목록 높이·mount 유지·2초 자동 읽기 테스트도 통과했다.
- universal 바이너리를 다시 빌드·ad-hoc 서명했다. `lipo -verify_arch arm64 x86_64`, `codesign --verify --strict`,
  실제 JSON의 speculative 필드·Zod·메모리 계산·errors 빈 배열을 확인했다.
  네이티브 4개 샘플의 간격은 2005.021/1997.017/2002.222ms, 앱 순위는 각각 10개였다.
  앱 on 첫 주기 warming·다음 ok·off 후 스캔 중단·부모 SIGKILL 후 헬퍼 종료도 통과했다.
- 전용 임시 홈에서 prebuilt 실행 실패 → 로컬 clang → Node 폴백을 실제 확인했다.
  두 모드 모두 시스템 status=ok, errors=[]였다. Node의 앱 목록은 unsupported로 구분한다.
- 플러그인만 reload하여 running을 확인했다. PID 33087 한 개로 기존 헬퍼를 교체했고 로그 100행에 오류·stderr가 없었다.
  RPC 100개 동시 요청은 seq 21 하나였다. seq 21~26의 간격은 2000/2000/1999/1997/2004ms였고 errors=[]였다.
  네이티브 수집 횟수·2초 타이머·앱 관심 30초·디스크 30초 주기는 그대로다.
- disable 뒤 `pgrep -fl macmon-helper`는 결과 없이 종료 코드 1을 반환했다. 다시 enable하여 running으로 복귀했다.
  데몬 재시작·전역 설정 변경·다른 Mac 설치는 하지 않았다.
- 0.1.1 C 헬퍼 자체를 앱 활성 상태로 60.002초 측정했다. CPU 시간 0.158157초,
  코어 하나의 0.263585%(10코어 환산 0.026359%), RSS 2.765625 MiB, 30개 샘플,
  간격 1996.780~2004.967ms, 디스크 조회 2회, 출력 구성원 최대 338개였다.
  CPU 시간은 Python RUSAGE_CHILDREN의 종료 전후 차이로 읽었다. 실제 프로세스 스캔 수는 출력 구성원 수보다 많다.
  측정 초기에 네이티브·폴백 테스트가 함께 실행됐다. 다른 시점의 이전 0.111%와 비용 증가율로 비교하지 않는다.
- `npm run compare -- --samples=3`는 20:00:55.523/57.518/59.522 KST에 사용량
  12.985/13.003/12.997 GiB, 전체 16.000 GiB, status=ok, errors=[]를 기록하고 자동 종료했다.
  이 값은 CLI 단독 결과다. 비교·부하·폴백 도구의 추가 헬퍼는 모두 종료했다.
- 새 버전의 **Activity Monitor 사용자 대조 필요**. UI 도구가 Activity Monitor를 `cgWindowNotFound`,
  Paseo를 요청 시간 초과로 읽지 못했다. 원시 값에 대한 식 검증을 실제 화면 일치로 표현하지 않는다.
  새 메모리 바의 실제 다크·라이트·compact 화면과 다른 Mac 설치/fleet도 확인이 남아 있다.
- 배포 CI는 arm64와 Intel에서 prebuilt 및 재빌드 JSON의 speculative 존재와 총 사용량 계산까지 검사하도록 강화했다.

### Intel CI에서 발견한 재시작 테스트 경합

첫 0.1.1 배포의 [CI 37454021101](https://github.com/01-works/paseo-plugin/actions/runs/37454021101)에서
arm64는 모든 검증을 통과했지만 Intel은 기존 재시작 테스트 한 개가 실패했다.
메모리·UI 계산 테스트는 통과했으며 `pause(300)` 뒤 세 번째 자식의 시작 기록이 아직 없어 `2 >= 3` 단정이 실패했다.
백오프가 끝난 시각과 Node 자식이 실제 코드를 실행한 시각을 같은 것으로 가정한 테스트 경합이다.

고정 대기 대신 파일에 남은 실제 세 번째 시작을 제한 시간 안에 기다리도록 수정했다.
100/200ms 이상 백오프, 동시에 살아 있는 자식 한 개 이하, stop 뒤 추가 시작 없음과 남은 자식 없음 검사를 유지한다.
제품 수집기·측정식·타이머를 바꾸거나 실패한 검사를 제거하지 않는다.

수정 후 [CI 37454531786](https://github.com/01-works/paseo-plugin/actions/runs/37454531786)는
arm64(37초)·Intel(45초) 모두 성공했다. 두 환경에서 타입 검사·58개 테스트·커밋된 prebuilt 실행·
universal 빌드·서명·speculative 필드와 총 사용량 계산을 통과했다.

## 이전 후속 검증: 실화면·동시 pill·Intel 실행

2026-10-06 18:07~18:32 KST, 사용자의 직접 확인 요청에 따라 로컬 화면과 공개 CI의 검증 범위를 넓혔다.
측정 공식·수집 주기·플러그인 코드는 변경하지 않았다.

- Activity Monitor 메모리·CPU 탭을 직접 열어 `npm run compare`의 같은 시각 근처 기록과 대조했다.
  아래 대조 절에 수치·시각 차이와 총 사용량 불일치를 기록했다. 비교 CLI 종료 후 추가 헬퍼가 남지 않았다.
- Paseo 라이트 테마에서 pill·모달·RAM 합계·CPU/메모리/디스크 바·상위 10개를 확인했다.
  앱 측정 중에도 목록 공간이 유지됐고, 시스템 값은 pill 캐시로 즉시 표시됐다.
  정상과 자연스럽게 발생한 주의 압력의 색을 관찰했다. 별도 메모리 부하는 만들지 않았다.
- 기존 두 에이전트 탭을 나란히 배치했다. 두 pill은 `14% · 13.3G`에서 `26% · 13.5G` 등 같은 값으로 갱신됐다.
  이 상태에서 헬퍼 PID 78692 한 개, RPC 100개 동시 요청의 seq 1421 하나,
  연속 seq 1421~1426의 간격 2000/1999/1999/2000/2000ms와 errors 빈 배열을 확인했다.
  이 RPC는 캐시 조회이며 새 헬퍼나 샘플을 만들지 않는다.
- 대시보드의 연결 호스트는 로컬 Mac 하나였다. 실험 설정을 켠 상태에서 선택한 Mac을 표시하는 공식 모드 폴백을 확인했다.
  다른 Mac의 지표 집계는 이 환경에서 검증하지 못했다.
- 창 크기·화면 확대 조작으로 compact 배치를 확인하려 했으나 실제 호스트의 compact 전환을 재현하지 못했다.
  확대된 데스크톱 모달을 compact 검증으로 간주하지 않는다. 실제 좁은 창 또는 모바일 기기의 확인이 남아 있다.
- 검증 후 임시 분할을 제거하고 기존 탭·시스템 테마·기본 확대율을 복원했다.
  글꼴 설정은 바꾸지 않았으며 Activity Monitor도 원래 메모리 탭으로 돌렸다. 기존 프로세스를 종료하지 않았다.
- [arm64·Intel GitHub Actions](https://github.com/01-works/paseo-plugin/actions/runs/37441366916)가 모두 성공했다.
  `macos-latest` arm64와 `macos-26-intel` x86_64에서 Node 24로 타입 검사·50개 테스트·universal 빌드·서명·JSON을 확인했다.
  특히 빌드 전에 커밋된 universal prebuilt를 직접 실행하고 실행 머신의 아키텍처·메모리/페이지 크기·CPU/VM·errors를 검증했다.
  Intel 헬퍼 실행 완료이며 Intel의 Paseo 설치·화면·fleet 검증을 뜻하지 않는다.

## 이전 후속 검증: GitHub 공개 배포

2026-10-06 17:57~18:00 KST, [01-works/paseo-plugin](https://github.com/01-works/paseo-plugin)을
공개 저장소로 생성하고 `main`에 올렸다. 플러그인은 `mac-monitor/`에 있으며 원본 커밋 이력을 subtree로 보존했다.
원본 HEAD의 tree와 배포 저장소의 `mac-monitor` tree가 같고 기존 커밋이 배포 HEAD의 조상임을 확인했다.

- [GitHub Actions 검증](https://github.com/01-works/paseo-plugin/actions/runs/37439677680) 성공.
  macOS 26 arm64 runner의 Node 24에서 의존성 설치·타입 검사·8개 파일/50개 테스트·
  universal 빌드·arm64/x86_64 슬라이스·서명·네이티브 JSON 스키마를 통과했다.
- 인증 정보 없이 HTTPS로 새 복사본을 내려받았다. `mac-monitor/`에서 manifest의 준비 명령을 실행하고
  universal·서명을 확인했다. `--once` 샘플의 `v:1`, errors 빈 배열, 물리 메모리·디스크 값도 확인했다.
  검증용 복사본은 종료 시 정리했다. 다운로드와 빌드 준비 검증이며 실제 데몬의 Git 설치 전환은 수행하지 않았다.
- 기존 플러그인은 `/Users/yw/dev/mac-monitor` 설치를 유지한다. 데몬 재시작·전역 설정 변경·다른 Mac 설치는 하지 않았다.
  공개 문서는 Git 하위 경로 설치와 Git/로컬 설치별 업데이트 방법을 제공한다.
- Activity Monitor 대조·라이트/compact 실제 화면·여러 pill 실제 동시 화면·다른 Mac/fleet·x86_64 실행은 남아 있다.
  CI의 arm64 네이티브 스모크를 Intel 실행이나 다른 Mac의 Paseo 설치 검증으로 간주하지 않는다.

## 이전 후속 검증: 공개 배포 준비

2026-10-06 17:48~17:54 KST, GitHub 공개 배포 전 코드·문서·빌드 구성을 검토했다.
이번 검토 범위에서 배포를 막는 추가 기능 오류는 발견하지 않았다.
README의 개인 개발 경로를 제거하고 `01-works/paseo-plugin:mac-monitor` Git 설치·업데이트와 로컬 개발 절차로 정리했다.

- `npm run typecheck`, 8개 파일/50개 테스트 통과. client DOM/HTML·fontSize audit 0건, `git diff --check` 통과.
- `npm run build` 성공. 빌드한 universal 바이너리는 기존 커밋과 동일했으며 arm64/x86_64 및 엄격한 ad-hoc 서명 검증을 통과했다.
- `node --import tsx test/manual/native.ts` 성공. 네이티브 JSON 스키마·CPU/메모리 상위 10개·관심 on/off·
  최초 앱 CPU 기준점과 후속 결과를 확인했다. 4개 샘플 간격은 2002.765/2007.264/2000.010ms였다.
  테스트 부모 SIGKILL 뒤 테스트 헬퍼가 종료됨도 확인했다.
- 로컬 플러그인은 기존 경로에서 running, 최신 로그 오류 없음, 테스트 종료 뒤 헬퍼 PID 78692 한 개를 확인했다.
  이번 변경은 배포 문서이며 수집·종료·화면 코드를 바꾸지 않았다.
- 현재 파일과 기존 커밋 이력의 토큰·개인 키 패턴 검사에서 일치 항목은 없었다.
- Git 하위 경로 설치 지원과 해당 폴더에서의 준비 단계는 Paseo 0.10.2 CLI/소스로 확인했다.
  GitHub에서 내려받아 실제 설치하는 검증은 이 시점에 수행하지 않았다.
- Activity Monitor 대조·라이트/compact 실제 화면·여러 pill 실제 동시 화면·다른 Mac/fleet·x86_64 실행은
  앞의 완료/남은 검증 표에 있는 확인 항목으로 유지한다.

## 이전 후속 검증: 정렬 버튼 배경

앞선 여백 수정으로 제목 버튼의 배경이 열 전체 폭을 차지해 텍스트가 한쪽으로 치우쳐 보였다.
열 폭은 바깥 View에 유지하고 정렬 버튼은 라벨 크기와 대칭 패딩으로 줄였다.

- `npm run typecheck`, 8개 파일/50개 테스트 통과. client DOM/HTML·fontSize audit 0건, `git diff --check` 통과.
- 2026-10-06 17:41:30 KST plugin reload 후 running, 최신 로그 오류 없음, 헬퍼 PID 78692 한 개를 확인했다.
- 17:41~17:42 KST 실제 Paseo 데스크톱 다크 화면에서 CPU·메모리 정렬을 전환했다.
  선택 배경이 라벨 주변의 대칭 여백만 차지하고 제목·숫자의 오른쪽 끝선이 유지됨을 확인했다.
  메모리 버튼에 포인터가 놓인 화면도 확인했다. 별도의 hover 이벤트 자동화는 수행하지 않았다.
- 정렬·10개 목록·Escape 닫기는 정상이다. 측정 코드·주기는 바꾸지 않았고 라이트·compact 확인은 남아 있다.

## 이전 후속 검증: CPU·메모리 여백

이전 리뷰에서 열 제목에만 적용된 가로 패딩 차이를 놓쳤다. 사용자의 후속 지적에 따라 제목·숫자의
공통 열 스타일과 시스템 카드의 구역 간격을 보완했다. 변경 근거와 규칙은 DECISIONS.md에 기록했다.

- `npm run typecheck`, 8개 파일/50개 테스트 통과. client DOM/HTML·fontSize audit 0건, `git diff --check` 통과.
- 2026-10-06 17:34:51 KST plugin reload 후 running, 최신 로그 오류 없음, 헬퍼 PID 60406 한 개를 확인했다.
- 17:35~17:36 KST 실제 Paseo 데스크톱 다크 화면에서 CPU·메모리·디스크 구역의 일정한 간격과
  CPU/메모리 정렬 양쪽의 열 제목·숫자 끝선을 확인했다. 이름 말줄임·작은 메모리 표기·10개 목록도 유지됐다.
- 데이터·측정 간격·바이너리는 바꾸지 않았다. 라이트·compact 실제 화면의 확인 범위는 확장하지 않았다.

## 이전 후속 검증: 시각·사용성 리뷰

2026-10-06 17:20~17:29 KST, 실제 Paseo 데스크톱 다크 화면을 직접 조작하고 관찰했다.
이번 검토 범위에서 사용을 막는 결함은 발견하지 않았다. 아래 두 가지 작은 표시 문제를 보완했다.

| 검토 항목 | 확인 결과 |
|---|---|
| 정보 순서·가독성 | CPU·메모리·디스크를 먼저 보고 앱을 비교할 수 있다. 기본 폰트·합계 강조·선택한 정렬 표시가 읽히며 RAM 합계가 잘리지 않았다. |
| 로딩·갱신 | 열 때 pill의 시스템 값이 즉시 보였다. 앱 측정 중과 결과 표시에서 목록 공간이 유지됐다. 시각·수치가 자동으로 갱신됐다. |
| 정렬·스크롤·본문 클릭 | CPU/메모리 전환·목록 아래쪽 스크롤이 동작했다. 메모리 정렬에서 갱신과 본문 클릭 후 아래쪽 목록·정렬을 유지하고 모달을 다시 열지 않았다. 실시간 순위의 앱 순서는 사용량에 따라 바뀐다. |
| 앱 상세·종료 선택 | claude 상세의 좌상단 ‹ 뒤로·앱 이름을 확인했다. 아래쪽 PID 선택 시 확인 카드가 화면 안에 보였고 취소할 수 있었다. 전체 종료도 6개 대상·PID 목록을 확인한 뒤 취소했다. 종료 신호는 보내지 않았다. |
| 복귀·닫기 | 상세·전체 종료에서 돌아왔을 때 메모리 정렬을 유지했다. Escape로 모달을 닫았다. |
| 보완 1: 스크롤바 여백 | 종료 버튼에 붙던 스크롤바 옆에 오른쪽 여백 8을 확보했다. reload 후 실제 아래쪽 목록에서 간격을 확인했다. |
| 보완 2: 작은 메모리 | 작은 실제 footprint의 `0.0 GiB` 표기를 `<0.1 GiB`로 구분했다. Codex Computer Use·Activity Monitor 등의 행에서 새 표기를 확인했다. |

- `npm run typecheck`, 8개 파일/50개 테스트 통과. 기존 GiB 테스트에서 작은 양·0·누락과 0.1 GiB 경계를 추가 확인했다.
  client DOM/HTML·fontSize audit 0건, 모든 Text 색은 테마 토큰이다. `git diff --check`도 통과했다.
- 17:25:41 KST plugin reload 후 running, 로그 오류 없음, 헬퍼 PID 84057 한 개를 확인했다.
  변경은 표시 형식·여백뿐이며 측정 코드·주기·바이너리를 바꾸지 않았다. 별도 부하 재측정은 하지 않았다.
- 라이트·compact 실제 화면은 이번 검토에서 직접 확인하지 않았다. Activity Monitor 화면 대조와 다른 Mac/fleet도 미완료다.
  앞의 완료/남은 검증 표에 있는 사용자 확인 항목을 유지하며, 확인하지 않은 환경의 시각적 일치나 사용성을 완료로 간주하지 않는다.

## 이전 후속 검증: 바 색과 가독성 리뷰

- 타입 검사와 8개 파일/50개 테스트가 통과했다. CPU 50/80%, 디스크 85/95% 경계,
  누락/지연/NaN 중립색, 높은 CPU·디스크와 정상 RAM 압력의 독립성, 오래된 RAM 구성 바의 중립색을 검증했다.
- `node test/manual/click-preview.mjs --verify` 통과. 본문·정렬·닫기에 pill action/Modal mount 횟수 1 유지,
  자동 읽기 1→2 및 닫은 뒤 중단을 확인했다. client DOM/HTML·fontSize audit 0건, 모든 Text 색은 테마 토큰이다.
- 17:13 KST plugin reload 후 running, 로그 오류 없음, 헬퍼 PID 12644 한 개를 확인했다.
  측정 코드·주기·프로세스 관심·바이너리는 바꾸지 않았다. 이번 화면 변경에 대한 별도 부하 재측정은 하지 않았다.
- 실제 Paseo 데스크톱 다크 화면에서 CPU 12~15% 기본 바, 디스크 196.3/228.3 GiB(약 86%) 주황 바,
  정상 압력의 메모리 앱 구간, CPU 세부 값의 위치와 메모리 정렬 강조를 확인했다.
  claude 전체 종료 확인의 빨강 버튼·6개 대상·좌상단 뒤로를 관찰하고 취소했다. 메모리 ↓ 정렬로 복귀했고 실제 종료는 실행하지 않았다.
- 좁은 배치는 소스로 숫자 열 확보·말줄임·버튼 줄바꿈을 검토했다. 예시 HTML은 라이트/다크 × 520/360px × 정상/높음/지연의
  12개 조합으로 생성할 수 있게 보완했다. 이번 환경에 브라우저 제어가 없어 새 HTML의 시각 검증은 수행하지 못했다.
  라이트·compact 실제 화면, Activity Monitor 대조, 다른 Mac 검증은 사용자 확인 항목으로 남아 있다.

## 이전 후속 검증: 전체 종료와 앱 상세 이동

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

최종 결과: `npm run typecheck` 통과, `npm test` 8개 파일 / 50개 테스트 통과.

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

**개선 전 직접 화면 대조 완료. 0.1.1 새 합계의 화면 일치는 사용자 대조 필요.**

1. Activity Monitor CPU 하단의 사용자·시스템 값과 메모리 탭을 연다.
2. `npm run compare`를 실행한다. 자동 종료는 `npm run compare -- --samples=3`.
3. 같은 시각에 CPU(사용자+시스템), 사용된 메모리, 앱, 와이어드, 압축, 캐시, 스왑을 3회 이상 기록한다.
4. 용량은 1024³으로 통일한다. Activity Monitor CPU 기본 갱신 간격 5초와 헬퍼 2초의 차이를 기록한다.
5. 작업량·압력 변화가 적은 구간도 포함해 차이를 평가하고 이 표에 화면 값을 추가한다.

2026-10-06 18:08~18:10 KST, Activity Monitor 화면을 직접 읽고 비교 CLI의 가까운 기록과 짝지었다.
용량 표의 단위는 GiB다. 서로 다른 시각의 읽기이며 CPU 관찰 구간도 완전히 동기화하지 않았다.

| 화면/CLI 시각 KST | 출처 | 사용 | 앱 | 와이어드 | 압축 | 캐시 | 스왑 사용 |
|---|---|---:|---:|---:|---:|---:|---:|
| 18:08:59.524 | Activity Monitor | 13.44 | 5.86 | 2.91 | 4.07 | 2.31 | 5.88 |
| 18:08:58.379 | compare seq 74 | 12.834 | 5.763 | 3.004 | 4.067 | 2.323 | 5.876 |
| 18:09:35.238 | Activity Monitor | 13.61 | 5.95 | 3.12 | 3.98 | 2.28 | 5.88 |
| 18:09:34.374 | compare seq 92 | 13.052 | 5.953 | 3.125 | 3.975 | 2.283 | 5.876 |
| 18:09:48.292 | Activity Monitor | 13.64 | 6.03 | 3.09 | 3.95 | 2.29 | 5.88 |
| 18:09:48.374 | compare seq 99 | 13.084 | 6.026 | 3.105 | 3.953 | 2.293 | 5.876 |

물리 메모리는 양쪽 모두 16 GiB였다. 마지막 두 쌍의 구성 항목별 차이는 0.02 GiB 미만이지만,
총 사용량은 Activity Monitor가 0.558/0.556 GiB 높았다. Activity Monitor 화면 자체에서도
13.61 − (5.95 + 3.12 + 3.98) = 0.56, 13.64 − (6.03 + 3.09 + 3.95) = 0.57 GiB의 차이가 있다.
표시 반올림이나 읽는 시각만으로 이 합계 차이가 해소된다고 판단할 수 없다.

당시 PLAN 4.1절의 `사용 = 앱 + 와이어드 + 압축`과 각 카운터 식은 구현·단위 테스트로 확인했다.
이 직접 화면 대조 단계에서는 Activity Monitor 내부 계산식을 확정하지 못했으며 제품 식을 바꾸지 않았다.
후속 원인 조사에서 설치된 Apple 실행 파일을 추적해 `hw.memsize − (free − speculative + external) × page`를 확인했다.
18:48~18:51 KST의 원시 값 100회에서 두 식의 차이는 0.538~0.587 GiB였고,
주된 차이는 물리 RAM과 usable RAM 사이 예약 영역 0.510208 GiB였다. purgeable과 작은 카운터 잔여 차이가 더해진다.
후속 수치는 같은 원시 값에 적용한 식의 비교이며 새로운 Activity Monitor 화면 대조로 표현하지 않는다.
실행 파일 경로·재현 소스·한계는 [합계 차이 조사](research/report-memory-accounting.md)에 기록했다.
[Apple 메모리 용어](https://support.apple.com/guide/activity-monitor/actmntr1004/mac)는 항목의 의미를 설명하지만,
이 차이의 구체적인 카운터 대응은 설명하지 않는다. 원인 조사 당시의 유지 판단과 이후 0.1.1 전환은 [DECISIONS.md](DECISIONS.md)에 기록했다.

| 화면/CLI 시각 KST | 출처 | CPU 사용자 % | 시스템 % | 합계 % |
|---|---|---:|---:|---:|
| 18:09:49.673 | Activity Monitor | 10.75 | 3.63 | 14.38 |
| 18:09:48.374 | compare seq 99 | 9.150 | 3.871 | 13.022 |
| 18:10:17.316 | Activity Monitor | 8.69 | 3.68 | 12.37 |
| 18:10:16.379 | compare seq 113 | 8.225 | 3.511 | 11.735 |

CPU 합계 차이는 이 두 쌍에서 약 1.36/0.63%p였다. 약 1.30/0.94초의 시각 차이와 갱신 주기 차이가 있으므로
같은 관찰 구간의 정확한 일치를 검증한 것은 아니다. 비교 중 CPU도 변했으며 모든 차이의 원인을 확정하지 않는다.
비교 CLI는 2초마다 캐시를 읽으므로 읽기 위상에 따른 seq 누락을 헬퍼의 측정 간격 변화로 해석하지 않는다.
수집기의 2초 간격은 별도의 연속 RPC·네이티브 측정으로 검증했다.

아래는 초기 CLI 단독 기록이다. 당시에는 Activity Monitor 화면을 직접 대조하지 않았다.

| 시각 KST | CPU 사용자/시스템/합계 % | 사용 / 앱 / 와이어드 / 압축 GiB | 캐시 GiB | 스왑 사용/전체 GiB | Activity Monitor |
|---|---|---|---:|---|---|
| 14:30:27 | 17.24 / 58.44 / 75.68 | 13.997 / 3.684 / 3.947 / 6.366 | 1.367 | 24.447 / 25.000 | 사용자 대조 필요 |
| 14:30:29 | 14.75 / 55.95 / 70.70 | 13.954 / 3.975 / 3.873 / 6.106 | 1.452 | 24.416 / 25.000 | 사용자 대조 필요 |
| 14:30:31 | 12.59 / 16.81 / 29.40 | 13.926 / 3.896 / 3.861 / 6.169 | 1.487 | 24.416 / 25.000 | 사용자 대조 필요 |

모두 pressure=warning이었다. CPU 변동의 원인은 이 기록만으로 확정하지 않는다.
초기 기록만으로는 차이의 크기와 일치를 판단할 수 없었다. 대조 시 고려할 차이 요인은 다음과 같다.

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
- 다른 Mac 설치는 별도 승인 후 진행한다. 공식 호스트 선택기로 수치·앱·리뷰의 범위가 선택한 Mac으로
  바뀌는지와 오프라인 오류를 확인한다. 실험 집계는 0.3.0에서 제거했다.
