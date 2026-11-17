# Supervision

일반 작업 대화에서 감독 대화를 시작하고, 작업자 대화에서 자기 감독으로 돌아가는 Paseo UI 플러그인입니다. 감독 운영은 설치된 `yw-supervisor` 스킬이 맡습니다.

## 사용

기존 에이전트 대화에서 `/supervise <목표>`를 보냅니다. 원 대화는 계속 유지하며 다음 작업을 수행합니다.

1. `${XDG_STATE_HOME:-~/.local/state}/yw-supervisor/<목표 slug>-<YYYYMMDD>-<임의 4자>/tasks.md`에 목표 원문과 원 대화 주소·workspace를 기록합니다.
2. 원 대화의 코드 프로젝트 아래에 기록 폴더를 cwd로 하는 local workspace(`감독 · <목표>`)를 만듭니다.
3. **Supervisor** 프로필(`bootstrap-supervisor`)의 provider/model·mode·thinking·features로 새 감독을 만듭니다. 프로필이 없거나 모델을 지정하지 않았거나 읽히지 않으면 생성을 시작하지 않습니다.
4. 소유 ID를 기록하고 원 대화에 `yw.supervisor=<감독 ID>`를 설정한 뒤, 새 감독에게 스킬 실행과 기존 맥락 읽기를 요청하고 그 대화를 엽니다.

Paseo 0.15.4·0.16.1은 명령 이름을 `^[a-z][a-z0-9-]*$`로 제한하여 `/감독`을 등록할 수 없습니다. `/supervise`를 사용하세요. 빈 목표와 4000자를 넘는 목표는 거부합니다. 첨부파일이 있는 composer에서는 Paseo가 플러그인 명령을 실행하지 않습니다.

작업자 대화에서 **⌘K → 내 감독으로 이동** 또는 `/my-supervisor`를 실행합니다. `paseo.parent-agent-id`를 우선하고, 부모가 없으면 `yw.supervisor`를 따라갑니다. 위로 올라가며 가장 가까운 `yw.role=supervisor` 또는 `감독 · ` workspace를 선택합니다. 표식이 없으면 첫 연결 대화도 열 수 있습니다. archive된 감독, 없는 연결, 순환 연결은 안내하고 열지 않습니다. 다른 호스트의 부모는 `paseo.parent-server-id`와 함께 따라가며, 연결 불가 시 오류를 표시합니다.

## 설치와 설정

Paseo 앱·데몬 **0.15.4 이상**, 호스트 PATH의 `paseo` CLI, `yw-supervisor` 스킬과 `bootstrap-supervisor` 프로필이 필요합니다. 명령은 기존 agent 컨텍스트에만 나타납니다. 새 대화 초안에는 나타나지 않습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:supervision
paseo plugin ls
```

bootstrap의 고정 목록에는 아직 포함하지 않습니다. 이 변경을 머지한 뒤 별도 bootstrap PR에서 배포 여부와 revision을 정합니다. 개발 검증은 고정된 로컬 소스 폴더를 명시해 설치하고 끝나면 제거합니다.

```sh
cd supervision
npm ci
npm run build
npm test
paseo plugin install /absolute/stable/checkout/supervision
paseo plugin logs supervision
paseo plugin remove supervision
```

플러그인 서버는 현 데몬이 제공하는 절대 경로 `PASEO_HOME`을 사용하여 CLI를 호출합니다. 이를 확인할 수 없으면 라벨 수정을 중단하고 오류를 표시합니다. 전역 플러그인 스위치를 바꾸거나 데몬을 재시작할 필요가 없습니다.

## 기록·데이터·오류

프로필은 공개 SDK `config.get().config.agentProfiles`에서 매번 읽습니다. SDK의 mutable config 응답 중 프로필 외 필드나 비밀값은 읽거나 저장하지 않습니다. 현재 호스트의 agent·workspace와 부모 연결만 조회하며 별도의 네트워크 요청은 하지 않습니다. 새 감독의 첫 프롬프트는 Paseo의 기존 provider 연결로 전달됩니다.

RPC는 lane 기록과 현 데몬 버전 조회·원 대화 라벨 연결용 CLI 호출에 한정됩니다. 버전은 현 데몬 home에 `paseo status --json`을 호출해 확인합니다. goal은 경로로 받지 않고 정규화한 slug로 변환합니다. 폴더 생성 충돌 시 접미사를 다시 뽑고, 파일은 사용자 전용 권한으로 생성합니다. 갱신은 현 서버 프로세스가 생성한 lane만 허용하고 심볼릭 링크로 바뀐 폴더는 거부합니다. 요청 원문은 JSON으로 직렬화하여 코드 펜스도 보존합니다.

중간 실패는 이미 생성한 lane·workspace·감독 ID를 오류에 표시합니다. 일부 생성된 리소스를 자동으로 지우거나 첫 프롬프트를 다시 전송하지 않습니다. 표시된 리소스를 확인하여 이어서 진행하세요. 명령을 다시 실행하면 새 lane을 만듭니다. 정상 감독 workspace를 archive해도 lane 기록은 보존합니다.

이 플러그인은 시작 요청과 대화 이동만 제공합니다. 감독 운영 규칙, 권한 응답, 후속 지시, 사이드바 감독 보드는 포함하지 않습니다.

## 호환성과 검증

개발 SDK는 `@getpaseo/plugin`·`@getpaseo/client` **0.15.4**에 고정합니다. manifest는 `>=0.15.4`로 두어 확인한 최소 버전을 밝히고 자동 업그레이드를 막지 않습니다. 0.16 호스트에는 deprecated된 `config.featureValues`를 보내지 않습니다. 0.15.4는 features가 native options와 분리되어 있어, 해당 호스트에만 이전 필드를 보내는 호환 분기를 둡니다. 0.16 앱과 0.15 호스트를 섞은 경우 legacy features가 있는 프로필은 생성 전에 명확한 오류를 표시합니다. 0.16 SDK가 이를 options로 변환해 이전 호스트에서 유실할 수 있기 때문이며, 이 경우 호스트도 업데이트해야 합니다.

| 사용 API | 0.15.4 | 0.16.1 | 선택 근거 |
|---|---|---|---|
| `addSlashCommand`, `addCommandCenterItem` | 지원 | 지원 | agent 컨텍스트의 직접 사용자 동작 |
| `config.get`의 `agentProfiles` | 지원 | 지원 | 고정 ID의 실제 프로필을 읽음 |
| `workspaces.create`의 `source: {kind: 'directory', path, projectId}`와 `setTitle` | 지원 | 지원 | 코드 프로젝트 아래 local workspace 생성 가능, CLI 대체 불필요 |
| `workspace.agents.create`, `agent.send`, `agent.refresh` | 지원 | 지원 | 프로필 적용·첫 요청·라벨 readback |
| 프로필 features | `config.featureValues` | `config.options` | 0.16은 기존 프로필의 featureValues를 options로 합치며 명시적 options가 우선 |
| 기존 agent 라벨 수정 | 공개 SDK 없음 | 공개 SDK 없음 | `paseo agent update --label`을 셸 없이 argv로 실행 |
| `navigation.openAgent` | 화면에서 지원 | 화면에서 지원 | 명령 콜백에 navigation이 없어 내부 전환 화면을 거침 |

자동 검사는 두 SDK 버전에서 빌드(타입·모듈 경계 검사)와 Vitest를 실행합니다. Paseo는 TypeScript 엔트리를 설치 시 직접 번들하므로 별도 배포용 JS 산출물은 만들지 않습니다. 실제 설치·화면 검증 범위와 복구 결과는 [검증 기록](docs/VALIDATION.md)을 확인하세요.

계약 근거: [플러그인 reference](https://paseo.sh/docs/plugins/reference.md), [SDK reference](https://paseo.sh/docs/sdk/reference.md), [CLI reference](https://paseo.sh/docs/cli.md), [감독 시작 절차](https://github.com/01-works/bootstrap/blob/main/agents/paseo.md#총괄-운영-스킬). 2026-11-17에 배포된 npm 패키지 0.15.4·0.16.1의 타입과 설치 앱의 명령 이름 검증도 대조했습니다.
