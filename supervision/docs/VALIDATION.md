# Supervision 0.1.0 검증

## 실제 Git 설치와 GUI 검증 (`f11e0d3`)

2026-11-18 00:53~01:11 KST에 `f11e0d37d41073d07faa7383cf39da2cb90f6d6f`를 검증했습니다. bootstrap #104가 머지되고 이 호스트의 스킬에 마크다운 기록 계약이 적용된 상태입니다. 에이전트 Chrome Beta의 **Paseo 웹앱 0.16.1**, 연결 **데몬·CLI 0.15.4**를 사용했습니다. 앱 정보 화면에서도 두 버전을 확인했습니다. 설치된 macOS 앱은 0.15.4지만 네이티브 GUI 검증에는 사용하지 않았습니다.

### 배포 결함과 수정

`61440cb`는 배포 불가로 제외합니다. 해당 커밋의 깨끗한 snapshot을 데몬 0.15.4에서 설치했으나 `Could not resolve type dependency "@getpaseo/client"`로 번들에 실패했습니다. 설치된 Paseo의 Git 소스 획득 코드는 clone·고정 ref checkout 후 manifest의 build 명령만 실행하며 npm 의존성을 자동 준비하지 않습니다. 따라서 같은 소스는 bootstrap의 Git 설치 경로에서도 실패합니다.

`f11e0d3`는 런타임 코드의 직접 SDK 타입 import 두 곳을 제거하고 경계 검사에 재유입 차단을 추가했습니다. 별도 npm 준비나 build 명령은 추가하지 않았습니다. 수동 npm 재시도 대기는 실행 전 정상 취소했습니다. Git 설치 첫 시도는 이전 failed 항목과 ID가 충돌해 거부됐으며, 해당 항목을 제거하고 목록에서 사라진 것을 확인한 뒤 다시 설치했습니다.

공용 heavy 차례에서 아래 명령으로 설치했습니다. 실제 관리 checkout의 SHA가 지정 ref와 일치하고 `node_modules`가 없는 상태에서 `running`과 `Plugin ready`를 확인했습니다. 수동 npm 단계는 실행하지 않았습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:supervision --ref f11e0d37d41073d07faa7383cf39da2cb90f6d6f
```

### 자동 검사와 GUI

SDK 0.15.4·0.16.1의 [빌드·타입·경계 검사와 각 5개 파일·47개 테스트](https://github.com/01-works/paseo-plugin/actions/runs/44112079417)가 통과했습니다. [최신 SDK 검사](https://github.com/01-works/paseo-plugin/actions/runs/44112079013)도 통과했습니다. 문서 반영판의 최신 상태는 [PR checks](https://github.com/01-works/paseo-plugin/pull/16/checks)에서 확인합니다.

첫 확인 목표는 실제 구현·코드 변경·외부 게시·스케줄을 금지하고, 감독이 읽기 전용 작업자 1개를 만들어 lane 기록만 확인·보고하도록 했습니다. 재생성 목표는 작업자도 추가하지 않고 기록만 읽어 응답하도록 제한했습니다.

| 실제 UI 확인 | 결과 | 스크린샷 파일 |
|---|---|---|
| 원 대화의 `/supervise` | `paseo-plugin` 코드 프로젝트(`prj_3d723d21175723bc`) 아래 local workspace·감독 생성 및 실제 대화 열림 | `gui-supervisor-opened.png` |
| 원 대화의 ⌘K → 내 감독으로 이동 | 명시적 복귀 링크의 감독 열림 | `gui-original-returned.png` |
| 감독이 만든 작업자 대화의 ⌘K → 내 감독으로 이동 | `paseo.parent-agent-id`를 따라 감독 열림 | `gui-worker-conversation.png`, `gui-worker-returned-supervisor.png` |
| 원 대화의 `/my-supervisor` | 실제 감독 대화 열림 | `gui-my-supervisor-returned.png` |
| 살아 있는 감독에서 `/supervise` 재실행 | 기존 링크 보호 안내, 새 감독 생성 없음 | `gui-live-supervisor-rejected.png` |
| 웹 브라우저 뒤로 가기 | 감독으로 자동 재이동 없음 | `gui-back-no-bounce.png` |
| 후손 정리·감독 archive 후 ⌘K | archive 안내, 감독 열지 않음 | `gui-archived-supervisor-notice.png` |
| archive 후 `/supervise` 재실행 | 새 감독 생성·열림, 원 대화 링크를 새 ID로 갱신 | `gui-replacement-opened.png` |
| 앱·호스트 버전 | 웹앱 0.16.1 / 데몬 0.15.4 | `gui-web-app-version.png` |

스크린샷과 설치 전·중·후 목록, 소스 SHA·시각·안전 점검 readback은 이 Mac의 `~/.local/state/paseo-plugin-validation/f11e0d3/`에 보존합니다. 다른 대화의 사이드바 정보가 포함될 수 있어 스크린샷은 공개 저장소에 올리지 않았습니다.

공유 브라우저의 각 호출 시작에 current target을 확인하고 own 탭만 조작한 뒤 원래 target으로 복귀했습니다. 종료 시 own 탭 `46E6748005F94232E454FF803CC918DF`을 current가 아닌 상태에서 닫았고, current `B26FAEB2456F505B1884DEFCD5104584`를 보존했습니다. 다른 탭은 읽거나 조작하지 않았습니다. 배경 탭의 키 입력에는 임시 focus emulation을 사용하고 같은 호출에서 해제했습니다.

### 정리와 복원

검증 대화는 원 대화 `85830053-6840-4c4a-8d28-389394108ea2`, 첫 감독 `4eec3df0-114b-47fd-9d33-5dc22d7d5d46`, 감독이 만든 작업자 `84f993ed-fb60-4da1-a813-da757efe6a47`, 재생성 감독 `272a31f6-3bc2-43ff-82d6-7a060a30fd17`입니다. 작업자를 먼저 정리하고 감독의 활성 후손 0개를 확인했습니다. 원 임시 폴더는 비어 있었고 lane 두 곳에는 `tasks.md`만 있었으며 세 cwd 모두 Git 저장소가 아니어서 미커밋 코드 변경이 없었습니다.

대화 4개와 workspace 3개(`wks_8013fd843538889a`, `wks_a330b4485c789a3e`, `wks_4402aa486076b9d8`)를 archive하고 readback으로 활성 workspace 잔여 0개를 확인했습니다. lane 2개·원 임시 폴더·이전 실패 snapshot을 제거했습니다. `paseo plugin remove supervision` 후 개발본·failed 항목·관리 Git 소스가 사라졌음을 확인했습니다. 일회성 검증 프로세스도 종료했습니다.

| ID | 설치 전 | 설치 중 | 제거 후 | 유지된 revision |
|---|---|---|---|---|
| better-paseo | running | running | running | `d4c85ccafe6d5dfc4abcef85667eca0b3cc3bb2e` |
| mac-monitor | running | running | running | `c9eb48e0a812aa5e6d70366075fa77cb6df16823` |
| zerosub | running | running | running | `1.5.1` |
| supervision | 미설치 | running | 미설치 | `f11e0d37d41073d07faa7383cf39da2cb90f6d6f` 임시 설치 |

기존 3개 플러그인의 전체 상태·revision은 설치 전 기록과 동일했습니다. 설치·제거 후 오류 상태 에이전트는 0개였으며, 데몬 PID와 시작 시각이 같아 재시작 없이 진행했음을 확인했습니다. 강제 업그레이드와 bootstrap 고정 목록 변경은 하지 않았습니다.

**미확인:** 0.16.1 데몬의 실제 설치, 네이티브 macOS·모바일 GUI, compact·테마 전환, 복귀 링크 실패 경고의 실제 발생은 이번 GUI 범위에 포함하지 않았습니다. 경고의 성공 처리와 일회용 이동 요청은 단위 검사로 확인합니다. 위 뒤로 가기 결과는 웹 브라우저에서 확인한 범위입니다.

## 독립 리뷰 반영판

재리뷰 N1~N3 반영판은 archive·조회 불가 링크 복구, 줄 머리 구조 표식만 처리하는 원문 기록, 링크 경고 시 슬래시 명령 성공 처리를 검사합니다. 클라이언트와 서버의 기존 링크 보호·갱신을 함께 검사합니다.

PR #16 리뷰 후 `tasks.md`를 bootstrap #104의 마크다운 한 항목으로 줄이고 원 대화를 맥락 출처로만 전달하도록 변경했습니다. features·버전 호환 분기와 두 단계 소유 기록을 제거했습니다. 지정 ID 생성, 링크 경고, 진단 로그, 일회용 이동 요청과 명시적 링크 우선 동작을 회귀 검사에 포함합니다. CI는 SDK 0.15.4·0.16.1·최신 버전의 빌드·타입·경계·단위 검사를 실행하며 최신 결과는 [PR checks](https://github.com/01-works/paseo-plugin/pull/16/checks)에서 확인합니다.

**수정판의 실제 Git 설치·GUI 확인·제거는 위 기록처럼 완료했습니다.** 설치·확인·제거 절차는 PR 본문에 제공합니다. 아래 실제 RPC·설치·복원 결과는 리뷰 전 구현 `c661b60`의 과거 검증이며 현재 수정판의 동작 근거로 간주하지 않습니다. 리뷰 전 시점의 GUI는 미확인이었습니다.

2026-11-17, 개발 브랜치 `feat/supervision-plugin`, 구현 커밋 `c661b60`을 검증했습니다.

## 리뷰 전 자동 검사

| SDK | 빌드·타입·모듈 경계 | Vitest |
|---|---|---|
| 0.15.4 | 통과 | 4개 파일·36개 테스트 통과 |
| 0.16.1 | 통과 | 4개 파일·36개 테스트 통과 |

[두 버전 검사 실행 기록](https://github.com/01-works/paseo-plugin/actions/runs/44075340316).
[최신 SDK 검사](https://github.com/01-works/paseo-plugin/actions/runs/44075340411)의 supervision 작업도 통과했습니다.
로컬 Node 24.22.0에서도 0.15.4 타입 검사와 경계 검사를 통과했습니다.
처음 경계 검사에서 TypeScript `Set<string>`을 HTML로 잘못 판정하여 검사 정규식을 수정했습니다.

## 리뷰 전 실제 데몬과 GUI

로컬 데몬·CLI는 0.15.4, 에이전트 Chrome에서 연 Paseo 웹앱은 0.16.1입니다.
SDK의 실제 `hosts.list` 연결과 `config.get().config.agentProfiles` 읽기도 통과했습니다.
현재 Supervisor는 `claude/claude-opus-5-5`, `bypassPermissions`, `high`이며 features는 비어 있습니다.

공용 heavy 차례에서 별도 고정 경로의 소스 snapshot을 `paseo plugin install <snapshot>/supervision --json`으로 로컬 설치했습니다. `running`과 `Plugin ready` 로그를 확인했습니다. Paseo는 로컬 디렉터리 소스도 설치 시 번들하므로 차례 밖에서 설치하지 않았습니다. 개발 의존성 설치·전체 검사는 반복하지 않았습니다.

설치된 서버 RPC에 연결한 실제 SDK 문맥에서 `client/actions.ts`의 시작·복귀 함수를 실행했습니다. 첫 요청에는 기록 확인만 수행하고 자식·스케줄·코드 변경·외부 메시지를 만들지 않도록 명시했습니다.

| 확인 항목 | 결과 |
|---|---|
| lane·`tasks.md` 생성 | 정규화된 목표·날짜·임의 접미사 폴더 생성, 목표 원문·소유 ID·원 대화 주소 readback 일치 |
| local workspace | 코드 프로젝트 `prj_3d723d21175723bc` 아래 생성, `감독 · ` 제목과 lane cwd 일치 |
| Supervisor 생성 | 실제 프로필의 model·mode·thinking 적용, `yw.role=supervisor` 검증 후 연결 |
| 원 대화 | `yw.supervisor` readback 일치, 기존 대화는 `idle` 유지 |
| 첫 요청 | 감독이 오류 없이 응답 완료(`idle`) |
| 감독 찾기 | 시작·복귀의 화면 열기 콜백이 같은 감독 주소를 선택 |
| 오류 경로 | 연결 없음 안내, archive 후 감독 열기 차단 확인 |
| 다른 에이전트 | 설치·제거 전후 기존 에이전트의 새 `error` 상태 없음 |

검증용 원 대화는 `a913bc7e-8b40-4d04-b2f3-1e45b8dcf3b1`, 감독은 `4610831e-f9b2-4d26-b6e0-d8736349026f`였습니다. 자식 0개·실행 중 아님·원 폴더 비어 있음·두 cwd 모두 Git 저장소가 아님을 확인했습니다. lane에는 `tasks.md`만 있었습니다. 두 에이전트와 workspace(`wks_60f014844b59c48b`, `wks_21b1e7987d856ccd`)를 archive하고 lane·원 폴더·설치 snapshot을 제거한 뒤 해당 경로가 사라졌는지 확인했습니다.

HTTPS 웹앱에서 직접 로컬 연결은 시간 초과되어 기존 릴레이 페어링을 사용했습니다. 사용자가 호스트 연결을 승인한 뒤 프로젝트·실행 중인 플러그인 표시와 검증용 원 대화 열기를 확인했습니다. 설치 후에는 공유 브라우저의 current target이 조율된 인계 탭에서 다른 세션의 탭으로 바뀌었습니다. 감독 지시에 따라 GUI 조작을 시작하지 않았습니다. own 탭은 current를 바꾸지 않고 닫았으며 다른 세션의 current를 보존했습니다.

**리뷰 전 `c661b60`의 GUI 동작은 미확인(공유 브라우저 사용 중)이었습니다.** composer의 `/supervise` 실행·Command Center 선택·실제 `navigation.openAgent` 렌더링과 스크린샷, compact·테마 전환은 검증하지 못했습니다. 위 콜백 검증은 GUI 검증을 대신하지 않습니다. 0.16.1은 SDK 빌드·단위 검사만 수행했으며 해당 데몬의 실제 설치는 미확인입니다. 비어 있지 않은 features 프로필도 단위 검사로 확인했습니다. `/감독`은 두 버전의 명령 이름 제한으로 사용할 수 없습니다.

## 리뷰 전 설치·제거 상태

설치 전·설치 중·제거 후 `paseo plugin ls --json`을 각각 저장해 대조했습니다. 기존 플러그인의 path·enabled·installation·source·remote·commit이 동일하고 모두 `running`인 것을 확인했습니다. 전역 활성화 설정과 bootstrap 고정 목록은 변경하지 않았습니다.

| ID | 설치 전 | 설치 중 | 제거 후 | 유지된 revision |
|---|---|---|---|---|
| better-paseo | running | running | running | `d4c85ccafe6d5dfc4abcef85667eca0b3cc3bb2e` |
| mac-monitor | running | running | running | `c9eb48e0a812aa5e6d70366075fa77cb6df16823` |
| zerosub | running | running | running | `1.5.1` |
| supervision | 미설치 | running | 미설치 | 임시 로컬 소스 제거 |
