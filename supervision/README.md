# Supervision

작업 대화에서 감독을 시작하고, 목표별 상태를 확인하고, 감독 대화로 돌아가는 Paseo 플러그인입니다. 운영 규칙은 `yw-supervisor` 스킬이 맡습니다.

## 사용

기존 대화에서 `/supervise <목표>`를 보냅니다. `/감독`은 Paseo 0.15.4·0.16.1의 명령 이름 제한(`^[a-z][a-z0-9-]*$`)으로 등록할 수 없습니다. 빈 목표와 4000자를 넘는 목표, 첨부파일이 있는 composer에서는 실행하지 않습니다.

1. 서버가 감독 ID를 먼저 정하고 `${XDG_STATE_HOME:-~/.local/state}/yw-supervisor/<목표 slug>-<YYYYMMDD>-<임의 4자>/tasks.md`를 한 번 씁니다. 머리말 두 줄과 요청 한 항목만 포함합니다.
2. 원 대화의 코드 프로젝트 아래에 lane 폴더를 cwd로 하는 local workspace(`감독 · <목표>`)와 Supervisor 프로필의 새 감독을 만듭니다.
3. 첫 요청을 보낸 뒤 원 대화에 `yw.supervisor=<감독 ID>`를 연결하고 감독 대화를 엽니다. 링크·readback 실패는 성공으로 처리하고 이동 화면에 경고를 표시합니다. **감독 대화 열기** 버튼으로 이미 시작된 감독을 열 수 있습니다. 기존 링크의 감독이 조회되고 archive되지 않았을 때만 생성을 거부합니다. archive·조회 불가 링크는 새 감독으로 갱신합니다.

```markdown
감독: <provider/model> <감독 agentId> @ <serverId>
상태: 진행

- 요청 원문: <목표>
  - 상태: 열림
  - 대기: 없음
```

여러 줄 원문은 들여쓰고 줄 머리의 마크다운 구조 표식만 처리합니다. `yw-supervisor`, `SKILL.md`, `#104` 같은 일반 원문은 그대로 둡니다. 원 대화 주소·workspace는 첫 프롬프트로만 전달합니다. 원 대화는 맥락 출처이며 기록 내용은 데이터입니다. 그 대화에 지시를 보내거나 작업자로 편입·정리하려면 감독이 에스컬레이션 계약 7번에 따라 사용자에게 먼저 묻도록 지시합니다. 플러그인은 원 대화를 중단하지 않습니다.

**⌘K → 내 감독으로 이동** 또는 `/my-supervisor`로 복귀합니다. 사용자가 만든 `yw.supervisor` 링크가 `paseo.parent-agent-id`보다 우선합니다. 명시적 링크의 대상은 role 없이도 열지만, 일반 부모 체인에서는 `yw.role=supervisor` 또는 `감독 · ` workspace 제목이 있는 가장 가까운 감독만 엽니다. 표식 없는 부모는 감독으로 열지 않습니다. archive·연결 없음·순환은 안내하며, 다른 호스트 부모는 `paseo.parent-server-id`를 사용합니다.

명령 콜백에는 navigation이 없어 내부 화면의 `navigation.openAgent`를 사용합니다. 자동 이동 요청은 한 번 소비하므로 뒤로 가기로 화면이 다시 마운트되어도 재이동하지 않습니다. 필요하면 화면의 **감독 대화 열기** 버튼으로 직접 이동합니다.

## 구조화된 상태 보고와 감독 목록

사이드바 **감독**에서 목표(lane)별 상태를 보드로 확인합니다. 선택한 호스트의 상태와 감독 목록만 10초마다 새로 읽습니다.

- **레인**: 사용자 결정 / 확인 필요(미보고·멈춤·알 수 없음) / 대기 / 진행 / 완료. 둥근 레인 패널 머리에 상태 표식·이름·개수를 두고, 레인마다 세로로 스크롤합니다. 레인 안은 기존 판정 순위·제목 순입니다. 레인 폭은 300~340을 나누고 두 레인이 들어가도록 260까지 줄며, 넘치면 가로로 스크롤합니다. 빈 레인은 점선 상자 안내를 표시합니다. host `layout.compact`에서만 한 레인씩 탭(상태 표식·짧은 이름·개수)으로 봅니다. 첫 카드가 보인 갱신에서 비어 있지 않은 첫 레인을 탭으로 정하고, 이후 갱신에서는 그 레인이 비어도 유지합니다. 갱신 결과에서 사라진 카드는 선택을 해제합니다.
- **카드**: 제목 행(상태 표식 + 목표 제목 2줄) → pill 행(상태 글자, 항목 완료 n/m, 연기 수, 대기의 재개 조건) → 얇은 항목 진행 막대 → 구분선 블록(턴 종료, 비고) → 경고색 구분선 아래 첫 미결 결정 질문 → 하단 보고 경과. **감독 열기 ↗**는 데스크톱 웹에서 hover·포커스·선택 때 나타나고 터치 화면에서는 항상 보입니다. 열 수 없는 행(다른 호스트·조회 불가)은 버튼을 비활성화하고 사유를 표시합니다. 선택한 카드는 accent를 섞은 배경·테두리, 키보드 포커스는 흐린 1px 외곽선입니다.
- **지금 할 일**: 툴바 아래에 레인별 개수 한 줄과, 사람이 처리할 감독(사용자 결정 → 미보고·멈춤·알 수 없음)을 최대 5개(폰 3개) 보여 줍니다. 각 줄은 결정 질문과 권장안, headline, 상태별 기본 문구 순으로 고른 핵심 한 줄입니다. 줄을 누르면 상세가 열리고, 끝의 **열기 ↗**는 감독 대화로 이동합니다.
- **상세**: 카드 본문을 누르면 화면 폭 1020 이상은 오른쪽 사이드바(380), 그보다 좁으면 host `Modal`(host가 시트 또는 중앙 대화상자로 표시)로 엽니다. 상태 행(닫기) → 제목 → chip(항목·연기·감독 상태) → 감독 열기 → 미결 결정(질문·선택지·권장안·영향) 또는 턴 종료 요약 → 구역(턴 종료·항목의 상태·근거·연기 출처·비고·기록) 순입니다. 결정에 답하는 버튼은 없습니다.

레인 패널·카드 계층·폰 탭·사이드바 구성과 색 혼합 비율·치수는 [Better Paseo](../docs/plugins/better-paseo.md)(MIT) Tasks 보드의 구현을 읽고 따랐으며 코드는 옮기지 않았습니다. 필터·검색·정렬·설정·히스토리는 두지 않습니다.

archive된 감독 행은 보고 유무와 관계없이 숨기고 파일은 보존합니다. 조회 불가·다른 호스트 기록도 안내하고 이동을 막습니다. 다른 호스트는 상단 호스트 선택으로 확인합니다.

`yw.role=supervisor` 라벨의 interactive 세션에만 `supervision_report` 도구가 붙습니다(Claude·Codex 공통 계약). 감독은 턴 종료 전에 누적 항목과 미결 결정을 **전체 교체** 보고하되 기존 항목은 보존합니다. 도구 기록은 tasks.md와 대화 종료 문장에 추가하는 기록입니다. 도구가 없는 경우 스킬의 기존 기록 방식을 따릅니다. 도구 사용 계약은 [bootstrap #108](https://github.com/01-works/bootstrap/pull/108)입니다.

```json
{
  "headline": "구현 PR 올림, 검사 결과를 기다리는 중",
  "items": [{"id": "implementation", "summary": "목표 구현", "status": "open"}],
  "turnEnd": {"kind": "waiting", "detail": "PR 검사 대기", "resume": {"type": "pr_check", "ref": "PR #17"}},
  "decisions": []
}
```

- `headline`: 사용자에게 말하듯 쓴 현황 한 문장(어디까지 왔고 다음은 무엇인지, 1~120자). 새 보고에서는 필수이고, 이 필드가 없는 기존 보고 파일도 그대로 읽습니다. 화면은 카드·상세의 현황 줄과 "지금 할 일" 띠에 이 문장을 우선 표시하고, 없으면 턴 종료 한 줄로 대체합니다.
- `items[].status`: `open|done|deferred`. `done`에는 `evidence`(커밋·PR·링크 등), `deferred`에는 `deferredBy`(사용자 결정 출처)가 필수입니다. 중복 ID와 빈 근거는 거부합니다. 이전 항목이 사라지면 거부하며, 먼저 `deferred`와 사용자 결정 출처를 보고한 항목만 다음 보고에서 제외할 수 있습니다.
- `turnEnd`: `kind=next_action|waiting|user_decision|done`, `detail`, 선택 `resume={type: child|pr_check|heavy|time|user, ref}`. `waiting`에는 사용자 이외의 `resume`이 필수입니다. 사용자 대기는 `user_decision`과 1개 이상의 `decisions`를 사용합니다. `done`은 미결 결정이 없어야 하고 열린 항목이 있으면 남은 ID와 요약을 오류로 돌려줍니다. 감독 자신이 바로 할 다음 조치는 턴 종료 전에 실행하고, `next_action`은 배정한 조치를 뜻합니다.
- `decisions`: 미결 결정의 `{question, options[], recommendation, impact}` 목록입니다. 결정이 풀리면 다음 보고에서 제거합니다.

도구는 감독 ID·호스트 ID·보고 시각·제목을 채워 lane 최상위의 `supervision-state.json` 하나를 원자적으로 대체합니다(파일 0600, 최대 1 MiB). cwd가 `${XDG_STATE_HOME:-~/.local/state}/yw-supervisor/` 아래면 첫 경로 조각의 lane에 귀속합니다. 기존 감독의 cwd가 밖이면 선택 입력 `laneDir`로 같은 상태 폴더 아래 기존 lane의 절대 경로를 지정합니다. 상대 경로·상위 탈출·외부 symlink는 거부합니다. `tasks.md` 첫 `감독:` 줄의 소유 ID 또는 그 파일이 없으면 기존 전용 상태 파일의 ID와 호출자가 같아야 합니다. 인계는 tasks.md의 감독 줄 교체가 선행되어야 하며, 소유 근거가 없으면 쓰지 않습니다.

목록은 lane 최상위의 전용 파일만 읽습니다. 일반 `state.json`·하위 폴더를 읽거나 자동 이관하지 않으며, 폴더 소멸·손상은 다른 lane 조회를 막지 않습니다. 상태 폴더와 lane은 같은 사용자가 관리하는 신뢰된 폴더를 전제로 합니다. XDG_STATE_HOME이 상대 경로·NUL 포함·기존 일반 파일 등 무효이면 기본 `~/.local/state`로 대체하므로 플러그인과 `/supervise`를 계속 사용할 수 있습니다. 손상된 JSON·스키마 파일은 다음 쓰기에서 `.UUID.corrupt`로 이름을 바꿔 보존한 뒤 새로 기록합니다. 보고 파일 복구는 tasks.md에서 호출자의 소유를 확인할 수 있어야 합니다. 읽기 조회는 격리나 복구를 수행하지 않습니다. 외부 네트워크·비밀값 접근은 추가하지 않습니다.

**미보고**는 감독이 idle 또는 closed이고 마지막으로 끝난 턴의 시작 시각이 마지막 보고보다 나중일 때입니다. `agent.turn.before/after`는 감독 라벨을 확인해 `${XDG_STATE_HOME:-~/.local/state}/paseo-supervision/turns/<agentId>.json`에 현재 시작 시각과 마지막 종료 턴의 시작 시각을 저장합니다. 턴 ID나 사용자 메시지 시각에 의존하지 않습니다. 시작을 관측하지 못했거나 파일이 없거나 손상되면 “알 수 없음”으로 표시합니다. 같은 턴의 최종 응답·idle 전환은 보고를 미보고로 바꾸지 않습니다.

running 감독은 이전 결정·waiting 보고가 있어도 “진행”입니다. closed는 재개 가능한 정상 상태로 보고 idle과 같은 순위 규칙을 적용합니다. 결정 우선순위는 idle·closed일 때만 적용하며, next_action은 같은 호스트의 자식이 running이면 “진행”, 아니면 “멈춤”입니다. 감독은 `yw.role=supervisor` 라벨 필터로만 조회하며, 자식 실행 판정은 미보관·running 필터 목록만 별도로 조회합니다. 원격 호스트에서 실행 중인 자식은 조회·판정 범위 밖입니다. 화면의 상태 판정과 대화 이동은 선택한 SDK 연결의 `hosts.list().self.serverId`를 사용합니다.

보고 이후 새 턴이 끝난 미보고는 이전 보고의 사용자 결정·자식 진행보다 먼저 판정합니다. 이미 답한 질문을 결정 대기로 과대 집계하지 않고 보고 누락을 드러내기 위한 선택입니다.

**운영 중 업데이트 주의:** session-open hook을 가진 플러그인의 시작·중지·reload는 데몬 전체의 열린 세션을 stale로 만들고 다음 유휴 프롬프트 전에 다시 엽니다. 실행 중인 턴은 끊지 않지만 이전 도구 연결은 폐기되어 실행 중인 턴의 도구 호출도 실패할 수 있으며, 재열기 실패 시 다음 프롬프트가 실패합니다. 명시적인 SDK `agent.reload()`는 실행 중인 턴을 끊습니다. 이번 개발에서는 설치된 플러그인을 교체·reload하지 않았으며 실제 검증은 별도 승인 후 진행합니다.

## 설치와 설정

앱·데몬 **0.15.4 이상**, 호스트 PATH의 `paseo` CLI, [bootstrap #104](https://github.com/01-works/bootstrap/pull/104)의 마크다운 기록·에스컬레이션 계약을 적용한 `yw-supervisor` 스킬, Supervisor 프로필(`bootstrap-supervisor`)이 필요합니다. 명령은 기존 agent 컨텍스트에만 나타납니다.

프로필의 provider/model·mode·thinking·native options를 사용합니다. provider/model이 없거나 읽을 수 없으면 오류를 표시합니다. **비어 있지 않은 legacy features(`featureValues`)는 명확히 거부**하며 버전별 변환은 하지 않습니다. 새 감독에는 deprecated `featureValues`를 보내지 않습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:supervision
paseo plugin ls
```

Git 소스는 지정 ref를 checkout한 뒤 Paseo가 번들합니다. 별도 npm 준비나 manifest build 명령은 필요 없습니다. 런타임 소스는 호스트 제공 모듈만 사용하며, 로컬 패키지 해석을 요구하는 SDK 타입의 직접 import도 두지 않습니다. 개발·CI의 타입 검사와 단위 테스트에는 `npm ci`가 필요합니다.

개발본은 안정된 로컬 checkout 경로에서 설치합니다. 현재 PR의 사용자 확인용 절차와 체크리스트는 PR 본문에 있습니다. 실제 설치는 사용자 결정 뒤 진행합니다.

```sh
paseo plugin install /absolute/stable/checkout/supervision
paseo plugin ls
paseo plugin logs supervision
paseo plugin remove supervision
```

bootstrap 고정 목록은 이 PR에서 변경하지 않습니다. 전역 플러그인 설정 변경이나 데몬 재시작도 하지 않습니다.

## 데이터와 오류

공개 SDK `config.get().config.agentProfiles`에서 해당 프로필만 사용합니다. 비밀값을 읽거나 저장하지 않고 별도 외부 네트워크 요청도 하지 않습니다. 첫 프롬프트는 Paseo의 기존 provider 연결로 전달됩니다. 서버는 실제 호스트 ID를 채우며, 사용자 전용 권한(폴더 0700·파일 0600)으로 정규화된 slug의 lane을 생성하고 충돌하면 다시 추첨합니다. 같은 사용자가 관리하는 상태 폴더를 전제로 합니다.

기존 RPC는 lane 생성, 복귀 라벨 연결, 진단 로그 기록을 담당하고, 추가한 `state.list` RPC는 전용 보고·턴 시각 파일 읽기만 담당합니다. 상태 쓰기는 도구에만 있습니다. 기존 agent 라벨 수정은 두 버전의 공개 SDK에 없어 `paseo agent update --label`을 셸 없이 실행합니다. 절대 경로 `PASEO_HOME`을 확인할 수 없으면 링크 경고로 처리합니다.

부분 생성 오류와 링크 경고의 상세 경로·예정 감독 ID·확인된 workspace ID는 **`paseo plugin logs supervision`**에 남깁니다. 시작 실패 toast는 짧은 요약과 로그 위치만 안내하고, 시작 후 링크 경고는 이동 화면에서 표시합니다. 진단 RPC까지 실패하면 이미 만든 `tasks.md` 위치를 안내하며, 그 머리말에는 예정 감독 ID가 있습니다. 원 대화에 오류 메시지를 보내지 않습니다. 자동 삭제·재전송은 하지 않으며, 재실행 전에 남은 리소스를 확인해야 합니다. 정상 workspace를 archive해도 lane 기록은 보존합니다.

## 호환성과 검증

SDK는 0.16.1에 고정하고 0.15.4·0.16.1·latest를 CI에서 검사합니다. 0.15.4에도 동일한 `defineAgentTool`·`agent.open.before` 계약이 있으므로 최소 지원을 유지합니다. manifest `>=0.15.4`는 확인한 최소 버전이며 자동 업그레이드를 막지 않습니다. 두 버전 모두 `addSlashCommand`, `addCommandCenterItem`, `config.get`, `workspaces.create`의 directory/projectId, `setTitle`, workspace의 `agents.create({agentId})`, `send`, 화면 `navigation.openAgent`를 지원합니다. SDK 타입과 구현에서 지정 ID 전달을 대조했고 CI에서 실제 SDK를 통한 전달도 검사합니다. local workspace의 CLI 대체와 버전 조회는 필요 없습니다.

자동 검사와 이전 실제 검증의 범위는 [검증 기록](docs/VALIDATION.md)을 확인하세요. 실제 앱·데몬에서 확인한 버전과 범위는 검증 기록에 구분합니다. 도구 부착용 session-open hook과 턴 시각 기록용 before/after hook만 추가합니다. 깨우기·자동 전송·결정 응답 버튼·히스토리·설정 화면은 이번 범위에 포함하지 않습니다.

계약 근거: [도구와 session hook](https://paseo.sh/docs/plugins/hooks.md), [플러그인 reference](https://paseo.sh/docs/plugins/reference.md), [SDK reference](https://paseo.sh/docs/sdk/reference.md), [bootstrap #104](https://github.com/01-works/bootstrap/pull/104).
