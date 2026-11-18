# Supervision 0.3.0 감독 보드 화면 검증

2026-11-18 KST, `feat/supervision-board-ui` 개발본의 자동 검사입니다. 상태 판정·보고·서버 코드(`shared/status.ts`, `shared/report.ts`, `server/*`, `client/status-data.ts`)는 바꾸지 않고 화면만 교체했습니다.

- **자동 검사:** 로컬 SDK 0.15.4·0.16.1(현재 latest와 같음)에서 타입·경계 검사와 14개 파일 112개 테스트를 통과했습니다(기존 103개 + 신규 9개). 신규 `test/board-model.test.ts`는 모든 상태의 단일 레인 귀속, 확인 필요 레인의 묶음, 입력 정렬 유지와 레인별 개수, 첫 탭 선택, 표식의 모양·색 조합 구분, 진행 막대의 완료·연기 비율과 라벨, 턴 종료·재개 문구, 탭 전환·사이드바/시트 폭 경계와 레인 폭(260~340)을 검사합니다.
- **화면 구성:** React Native 기본 요소와 host `@getpaseo/plugin/client/ui`의 `Icon`·`Modal`·`SidebarRow`만 사용합니다. 세 요소는 SDK 0.15.4에도 있습니다. 색은 `theme.colors`만 쓰고 상태는 표식 모양과 글자를 함께 표시합니다. 카드 본문·열기 버튼·탭·닫기 버튼에 접근성 역할과 라벨을 두었습니다. 데스크톱 키보드는 기본 포커스 이동과 Enter/Space(카드 선택·버튼 실행)에 의존하며 단축키는 추가하지 않았습니다.
- **미확인:** 저장소에 화면 렌더링 하네스가 없고, 설치본 교체는 열린 세션 전체를 stale 처리하므로 설치하지 않았습니다. 넓은 창·좁은 창·모바일의 실제 렌더링(가로 스크롤 안 세로 스크롤, 시트 표시, 탭 전환, 테마별 대비)은 **설치 후 사용자 확인이 필요**합니다.

# Supervision 0.2.0 상태 보고 검증

2026-11-18 KST, `feat/supervision-status-report` 개발본의 자동 검사와 승인 후 0.16.1 실제 검증입니다. 아래 0.1.0 기록은 과거 버전의 실제 설치·GUI 검증이며 새 목록 화면을 검증한 것으로 취급하지 않습니다.

## 0단계: 도구·reload 계약 확인

- npm SDK 0.15.4·0.16.1의 `server/agent-tools.d.ts`에 `defineAgentTool`과 동일한 실행 문맥(`agent`, `paseo`, `signal`)이 있습니다. 두 버전의 `PluginSessionOpenRequest`에 `labels`, `tools`, `purpose`가 있어 최소 지원 `>=0.15.4`를 유지합니다. 개발 SDK 고정은 0.16.1로 올렸습니다.
- [0.16.1 hook 문서](https://github.com/getpaseo/paseo/blob/v0.16.1/public-docs/plugins/hooks.md#attach-tools-to-agents), [도구 transport 등록](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/tools/plugin-tools.ts), [agent manager](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/agent-manager.ts)를 대조했습니다. 붙인 도구는 provider가 지원하는 MCP/native 경로로 같은 콜백에 연결됩니다. [Claude](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/providers/claude/agent.ts)·[Codex](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/providers/codex-app-server-agent.ts)는 모두 `supportsMcpServers: true`입니다. 승인 후 Claude·Codex의 실제 호출 성공은 아래 설치 검증에 기록했습니다. Paseo 도구를 끄거나 provider tool policy로 막은 환경에서는 이 도구도 사용할 수 없습니다.
- [상류 0.16.1 회귀 테스트](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/plugins/agent-tools.e2e.test.ts)는 plugin reload 시 기존 attachment 폐기, idle의 다음 프롬프트에서 한 번 reopen, busy 턴 interrupt 0회, 명시적 SDK reload의 interrupt 1회를 검사합니다. 이 프로젝트에서 상류 테스트를 실행한 것은 아닙니다. 현재 [공식 hook 문서](https://paseo.sh/docs/plugins/hooks.md)와 설치된 공식 스킬도 같은 stale 계약을 설명합니다.
- session-open hook을 가진 플러그인을 시작·중지·업데이트/reload하면 데몬 전체의 열린 세션이 stale이 되고 다음 유휴 프롬프트 전에 다시 열립니다. 실행 중 턴은 유지하지만 이전 도구 연결은 폐기되므로 reload 직후 실행 중 턴이 호출하는 도구도 실패할 수 있습니다. 재열기에 실패하면 그 프롬프트도 실패합니다. 명시적 `agent.reload()`는 실행 중 턴을 끊으므로 이번 개발에서 호출하지 않습니다.

## 자동 검사

CI는 SDK 0.15.4·0.16.1·latest에 각각 빌드(타입·경계)와 전체 단위 검사를 실행합니다. 기존 daily latest/beta 검사도 유지합니다. 로컬 SDK 0.15.4·0.16.1에서 타입·경계 검사와 13개 파일 103개 테스트를 통과했습니다(기존 47개 + 신규 56개). `latest`가 현재 0.16.1을 가리키므로 현재 두 행은 같은 SDK를 검사하되 향후 릴리스부터 분리됩니다.

새 검사는 완료의 열린 항목 안내, 완료/연기 근거, 대기 재개 조건, 중복 ID·빈 근거, JSON schema 변환, Claude·Codex 라벨/interactive 선별, 신뢰된 호출자 ID·호스트 저장, 읽기 전용 RPC, 경로 탈출·접두사 혼동·외부 symlink, 동시 쓰기 중 완전한 JSON, 파일 0600, 취소 시 이전 상태·임시 파일 정리, 손상·symlink 파일 격리, 미보고·정렬·호스트·archive 판정을 포함합니다. 파일 검사는 임시 디렉터리만 사용합니다.

목록은 React Native 기본 요소·테마 색상·compact 세로 배치를 사용합니다. lane 최상위 `supervision-state.json`만 읽고 하위 cwd는 첫 경로 조각의 lane으로 귀속합니다. 일반 `state.json`과 하위 폴더의 전용 파일은 읽거나 자동 이관하지 않습니다. 순회 중 폴더가 소멸하거나 파일이 손상되어도 다른 lane을 반환하는 테스트가 있습니다. 파일 소유 검증은 tasks.md 첫 감독 줄을 우선하고, 없으면 전용 상태 파일의 agentId를 사용합니다. 인계 줄 교체 없이 다른 감독이 덮어쓰는 것을 거부합니다. 기존 항목 누락은 거부하며, 이전 보고에서 사용자 결정 출처와 deferred를 먼저 남긴 항목만 제외합니다.

## 독립 리뷰 반영: 미보고와 현재 상태

`lastUserMessageAt`은 에이전트 메시지·자식 알림·heartbeat를 놓치므로 사용하지 않습니다. [0.16.1 envelope](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/agent-messages/envelope.ts)의 `projectAgentMessages`는 이 입력을 `tool_call`로 바꾸며 사용자 메시지 시각을 갱신하지 않습니다.

두 SDK에 공통인 `agent.turn.before/after`에서 시각을 기록합니다. 영속 위치는 `${XDG_STATE_HOME:-~/.local/state}/paseo-supervision/turns/<agentId>.json`이며 파일 0600·원자 교체입니다. before는 현재 시작 시각을 기록하고 after는 그 값을 마지막 종료 턴의 시작 시각으로 옮깁니다. 콜백 도착 때 잡은 시작 시각을 사용하며 ID 비교나 사용자 메시지 시각을 사용하지 않습니다. 에이전트별로 알림 처리를 직렬화합니다. 재시작 사이의 before/after와 완료된 기록 보존을 테스트합니다. after만 관측했거나 파일이 없거나 손상된 경우 시작 시각은 null, 화면은 “알 수 없음”입니다.

소스 emit 확인: [0.16.1 lifecycle](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/plugins/lifecycle/index.ts)의 `publishAgentStream`은 `turn_started`를 before, `turn_completed/failed/canceled`를 after로 전달합니다. [0.15.4 lifecycle](https://github.com/getpaseo/paseo/blob/v0.15.4/packages/server/src/server/plugins/lifecycle/index.ts)도 같습니다. 양 버전 [agent manager](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/agent/agent-manager.ts)의 accepted-turn 경계는 프롬프트 출처와 무관하게 turn_started를 발행하며, `dispatchStream`은 internal이 아닌 에이전트의 비-timeline 이벤트를 lifecycle로 전달합니다. 따라서 에이전트 메시지로 새 턴이 시작된 경우도 같은 emit 경로입니다. **한계:** 실행 중인 턴에 steer된 입력은 새로운 턴 시작을 만들지 않습니다. 보고 이후 입력이 추가되어도 같은 턴 안에서 처리되면 미보고를 탐지하지 못할 수 있습니다. 승인 후 Claude·Codex의 에이전트 메시지 입력으로 시작한 턴과 보고 호출은 실제 확인했습니다. 자식 완료 알림·heartbeat 각각의 실제 발화는 별도로 검증하지 않았습니다.

마지막 종료 턴 시작이 보고보다 늦으면 idle·closed 상태의 미보고입니다. 미보고는 이전 보고의 사용자 결정·자식 진행보다 우선합니다. 같은 턴의 최종 응답·도구 결과·idle 전환으로는 뒤집히지 않습니다. running은 결정·waiting 보고보다 우선해 진행, closed는 idle과 같은 판정·순위를 적용합니다. 결정 rank는 idle·closed에만 적용합니다. next_action은 같은 호스트의 자식이 running일 때 진행, 아니면 멈춤입니다. archive 감독은 행에서 제외하고 파일은 유지합니다. 감독은 라벨 필터(includeArchived=true)로만, 자식 실행은 includeArchived=false·statuses=running으로만 페이지 조회합니다. archive 전체 목록을 요청하지 않는 계약을 테스트합니다. 원격 호스트 자식은 판정하지 않습니다.

호스트 확인: 상류 [surface-screen](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/app/src/plugins/surface-screen.tsx)은 `host.id = serverId`로 만듭니다. 구현은 표시용 host.id를 가정하지 않고 선택된 API의 SDK `hosts.list().self.serverId`를 상태 판정·이동에 사용하며, 페이지 조회와 자식 판정도 이 값을 쓰는 테스트가 있습니다. 실제 앱에서 두 값을 동시에 readback하는 검증은 미확인입니다.

reload는 [runtime의 notifySessionOpenChange](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/plugins/runtime.ts)에서 agent 필터 없이 session-open 변경을 통지하므로 영향 범위는 데몬 전체입니다. 실행 중 턴을 interrupt하지 않는다는 것은 기존 attachment를 계속 쓸 수 있다는 뜻이 아닙니다. 기존 도구 연결이 폐기된 뒤 호출은 실패할 수 있고 다음 유휴 프롬프트에서 재열립니다.

## 환경·손상 파일 복구

모든 저장소(LaneStore·ReportStore·TurnStore)는 같은 XDG 경로 검증을 사용합니다. 상대 경로·NUL 포함·기존 비디렉터리·stat 오류는 `~/.local/state`로 대체하며 없는 절대 경로는 생성 가능한 경로로 유지합니다. 잘못된 설정으로 contribute나 `/supervise`가 함께 실패하지 않는지 임시 home으로 검사합니다. OS 환경 변수는 NUL에서 잘리므로 NUL 검사는 helper 직접 입력으로 수행합니다.

손상된 JSON·스키마는 다음 쓰기에 `.UUID.corrupt`로 격리하고 새 보고·턴 기록을 시작합니다. 읽기 RPC는 그대로 오류/알 수 없음을 반환하고 파일을 변경하지 않습니다. 보고 복구는 tasks.md 소유 확인 이후에만 수행하며, 소유가 다른 호출은 손상 원본도 바꾸지 않습니다. 격리 원문 보존과 다음 before/after 복구를 테스트합니다.

## 실제 검증 경계

아래 승인 후 검증에서 bootstrap 고정 `supervision`만 교체했습니다. bootstrap 고정 목록·실제 스킬 설치·전역 스위치는 변경하지 않았고 데몬·기존 감독을 명시적으로 재시작·interrupt하지 않았습니다. 도구 부착은 reopen부터 적용되므로 이미 열린 세션에 즉시 생겼다고 판단하지 않습니다. 앱 목록 화면·행 이동, compact·모바일·테마 전환은 아래처럼 **미확인**으로 구분합니다.


## 승인 후 실제 설치·호출 검증 (`b606ee2`)

2026-11-18 16:45~16:49 KST, 데몬·CLI **0.16.1**에서 사용자 설치 승인(열린 세션의 stale 영향 수용) 후 `b606ee2b66b87f31a20d6fbe2baba4466f26ecdc`를 검증했습니다. 설치 소스는 `github:01-works/paseo-plugin:supervision`입니다. 0.16.1의 [installSource](https://github.com/getpaseo/paseo/blob/v0.16.1/packages/server/src/server/plugins/index.ts)는 기존 ID를 거부하므로, 현재 설치의 Git remote·pluginPath가 요청 소스와 같은지 확인한 뒤 기존 버전 복구 경로를 가진 update를 사용했습니다. 교체 명령은 약 3.4초에 끝났고 `Plugin ready`와 관리 checkout의 정확한 revision을 확인했습니다.

```sh
paseo plugin update supervision --ref b606ee2b66b87f31a20d6fbe2baba4466f26ecdc --json
```

감독의 추가 지시에 따라 작은 플러그인 하나의 수 초짜리 esbuild 번들 설치를 heavy 대상에서 제외했고, 자기 대기 항목 `supervision-install-b606ee2`만 TERM으로 정상 취소(종료 143·cancel/TERM)한 뒤 실행했습니다. 다른 대기 항목·실행 lock은 변경하지 않았으며 npm install·전체 빌드·테스트는 실행하지 않고 CI로 대체했습니다.

| 항목 | 설치 직전 | 설치 후·정리 후 |
|---|---|---|
| supervision | running · `cea05dbd7658b3bef063a6b4e2bb7ce8b1ce5e27` | running · `b606ee2b66b87f31a20d6fbe2baba4466f26ecdc` (유지) |
| better-paseo | running · `d4c85ccafe6d5dfc4abcef85667eca0b3cc3bb2e` | 상태·revision·설치 메타데이터 동일 |
| mac-monitor | running · `c9eb48e0a812aa5e6d70366075fa77cb6df16823` | 상태·revision·설치 메타데이터 동일 |
| zerosub | running · `1.5.1` | 상태·revision·설치 메타데이터 동일 |
| 비보관 오류 에이전트(백그라운드 포함) | 0 | 설치 직후·검증 후·정리 후 모두 0 |
| 데몬 | 0.16.1 · PID 45488 · worker 45727 | 동일, 시작 시각 `2026-11-18T05:07:57.112Z` 유지 |

확인용 lane·local workspace 두 곳만 만들고 구현·위임·외부 전송·스케줄·명령 실행·파일 직접 수정을 금지했습니다. 알려진 ID로 만든 에이전트에게 검증자가 `send_agent_prompt`를 보내 새 턴을 시작했습니다. 타임라인에도 `agent_message`가 남고 `lastUserMessageAt`은 모든 확인 턴에서 null이었습니다. 보고 JSON은 실제 도구만 썼습니다.

| 실제 확인 | 결과 |
|---|---|
| Claude `claude-opus-5-5` | `mcp__paseo__supervision_report` 성공, 전용 보고 파일 0600 |
| Codex `gpt-6.1-sol` | `paseo.supervision_report` 성공, 전용 보고·턴 파일 기록 |
| Claude 같은 턴의 최종 응답·idle 전환 | 첫 보고 `07:45:57.342Z` 후에도 목록 판정은 **대기** |
| 다음 에이전트 메시지 턴에서 보고 생략 | 마지막 종료 턴 시작 `07:46:33.221Z`가 기존 보고보다 늦음, **미보고** |
| 열린 항목으로 done 호출 | 실제 도구 거부: `열린 항목이 남았습니다: probe (무해한 도구 연결 확인)` |
| evidence 없이 done 항목 호출 | 실제 도구 거부: `완료 근거(evidence)가 필요합니다: probe` |
| 정상 완료 재보고 | 보고 `07:47:15.180Z`가 해당 턴 시작 `07:47:04.656Z`보다 늦음, **완료**로 해소 |
| before/after 영속 기록 | Claude 3턴의 시작 값과 종료 후 이동을 파일 관측 6건으로 확인. 별도 SDK 연결에서 읽기 RPC로 다시 읽음 |
| 목록 RPC·클라이언트 판정 | 실제 `state.list` 응답과 SDK 에이전트 목록으로 화면의 `loadStatus`를 실행해 대기→미보고→완료 및 Codex 대기를 검증 |

위 시각은 UTC입니다. 재시작 자체는 실행하지 않았으므로 실제 프로세스 재시작을 통한 보존 검증으로 확대하지 않습니다. 재시작 보존은 자동 검사 범위입니다.

**GUI는 사용자 직접 확인 필요:** 설치 대기 중 에이전트 Chrome 접속을 준비하며 default 연결을 재사용했고, 호출 시작마다 current target을 확인했습니다. 초기 target `B26FAEB2456F505B1884DEFCD5104584`이 작업 탭을 만들려는 호출에서 `D5B9D1C93E16DF9641D65B5A1CB79D57`로 바뀌어 조작 없이 1회 시도를 중단했습니다. 새 탭·스크린샷은 만들지 않았고 다른 탭도 조작하지 않았습니다. RPC 검증은 실제 사이드바 렌더링·행 클릭을 대신하지 않습니다.

기존 라벨 감독 6개에는 프롬프트·reload를 보내지 않았습니다. 16:54 KST의 후속 읽기 전용 조회에서 기존 감독 1개의 로컬 로그에 `2026-11-18T07:49:25.852Z`의 `deferred_tools_delta.addedNames = ["mcp__paseo__supervision_report"]`가 기록된 것을 확인했습니다. 설치 전과 같은 native session ID이며, 도구 목록 변경 로그로 **기존 감독의 후속 턴 도구 부착을 확인**했습니다. API 요청의 선택된 도구 목록은 지연 로딩 도구를 생략할 수 있어 그 목록만으로 미부착을 판단하지 않았습니다. 해당 감독의 영속 턴 파일에서도 종료 턴 시작 시각을 읽었습니다. 기존 세션의 대화 내용·요청 본문은 결과물에 복제하지 않고 도구 이름·시각·세션 식별자만 로컬 증거로 남겼습니다.

정리 전 두 감독의 idle·미결 권한 없음·자식 0개·백그라운드 작업 0개·터미널 0개, workspace별 소유 에이전트 1개, lane의 파일 두 개(`tasks.md`, `supervision-state.json`)와 소유 ID를 대조했습니다. 감독·workspace를 archive한 뒤 readback으로 확인하고 두 lane과 검증용 턴 파일만 제거했습니다. 확인용 ID는 Claude `a4e31a26-27b5-4716-904d-7a6240236249`, Codex `761a6e9c-3aa2-4465-a9cf-6ea815176d38`, workspace는 `wks_113200ff1d913963`·`wks_022466d7732c81ae`입니다. 파일 관측 프로세스도 종료했습니다. 새 플러그인은 설치된 채로 유지하며 bootstrap 고정 ref 변경과 머지는 하지 않았습니다.

설치 전·직전·후·정리 후 목록, 보고·턴 관측·검증 타임라인·정리 대조 기록은 이 Mac의 `~/.local/state/paseo-plugin-validation/b606ee2/`에 보존합니다. 로컬 타임라인은 공개 저장소에 올리지 않았습니다. 이 검증에서 소프트웨어 코드는 변경하지 않았습니다. CI 결과는 [PR #17 checks](https://github.com/01-works/paseo-plugin/pull/17/checks)에서 확인합니다.

---

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
