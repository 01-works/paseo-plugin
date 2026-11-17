# Supervision

작업 대화에서 감독 대화를 시작하고 자기 감독으로 돌아가는 Paseo UI 플러그인입니다. 운영 규칙은 `yw-supervisor` 스킬이 맡습니다.

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

## 설치와 설정

앱·데몬 **0.15.4 이상**, 호스트 PATH의 `paseo` CLI, [bootstrap #104](https://github.com/01-works/bootstrap/pull/104)의 마크다운 기록·에스컬레이션 계약을 적용한 `yw-supervisor` 스킬, Supervisor 프로필(`bootstrap-supervisor`)이 필요합니다. 명령은 기존 agent 컨텍스트에만 나타납니다.

프로필의 provider/model·mode·thinking·native options를 사용합니다. provider/model이 없거나 읽을 수 없으면 오류를 표시합니다. **비어 있지 않은 legacy features(`featureValues`)는 명확히 거부**하며 버전별 변환은 하지 않습니다. 새 감독에는 deprecated `featureValues`를 보내지 않습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:supervision
paseo plugin ls
```

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

RPC는 lane 생성, 복귀 라벨 연결, 진단 로그 기록을 담당합니다. 기존 agent 라벨 수정은 두 버전의 공개 SDK에 없어 `paseo agent update --label`을 셸 없이 실행합니다. 절대 경로 `PASEO_HOME`을 확인할 수 없으면 링크 경고로 처리합니다.

부분 생성 오류와 링크 경고의 상세 경로·예정 감독 ID·확인된 workspace ID는 **`paseo plugin logs supervision`**에 남깁니다. 시작 실패 toast는 짧은 요약과 로그 위치만 안내하고, 시작 후 링크 경고는 이동 화면에서 표시합니다. 진단 RPC까지 실패하면 이미 만든 `tasks.md` 위치를 안내하며, 그 머리말에는 예정 감독 ID가 있습니다. 원 대화에 오류 메시지를 보내지 않습니다. 자동 삭제·재전송은 하지 않으며, 재실행 전에 남은 리소스를 확인해야 합니다. 정상 workspace를 archive해도 lane 기록은 보존합니다.

## 호환성과 검증

SDK는 0.15.4에 고정하고 0.16.1도 CI에서 검사합니다. manifest `>=0.15.4`는 확인한 최소 버전이며 자동 업그레이드를 막지 않습니다. 두 버전 모두 `addSlashCommand`, `addCommandCenterItem`, `config.get`, `workspaces.create`의 directory/projectId, `setTitle`, workspace의 `agents.create({agentId})`, `send`, 화면 `navigation.openAgent`를 지원합니다. SDK 타입과 구현에서 지정 ID 전달을 대조했고 CI에서 실제 SDK를 통한 전달도 검사합니다. local workspace의 CLI 대체와 버전 조회는 필요 없습니다.

자동 검사와 이전 실제 검증의 범위는 [검증 기록](docs/VALIDATION.md)을 확인하세요. 현재 수정판은 GUI를 재시도하거나 로컬 설치하지 않습니다. 운영 규칙·hook·권한 자동 응답·후속 지시·사이드바 감독 보드는 추가하지 않습니다.

계약 근거: [플러그인 reference](https://paseo.sh/docs/plugins/reference.md), [SDK reference](https://paseo.sh/docs/sdk/reference.md), [bootstrap #104](https://github.com/01-works/bootstrap/pull/104).
