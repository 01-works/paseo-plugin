# Paseo 플러그인

Paseo용 자체 플러그인과 외부 커뮤니티 플러그인의 설치·사용 안내를 모은 저장소입니다.

## 기본 설치 목록

**“이 저장소를 설치해”, “클론해서 설치해”는 아래 목록 전체를 설치하는 요청입니다.**
앞으로 이 표에 추가된 항목도 함께 설치합니다.
특정 플러그인만 요청하면 해당 항목을 설치합니다.

| 플러그인 | 기능 | 설치 소스 | 조건·상세 |
|---|---|---|---|
| [mac-monitor](mac-monitor/README.md) | 시스템 지표·상위 앱·프로세스 종료·정리 검사 | `github:01-works/paseo-plugin:mac-monitor` | macOS, Paseo 0.10.2 이상 |
| [agent-list](agent-list/README.md) | 현재 워크스페이스의 에이전트 목록·검색·대화 이동·닫기·오래된 대화 정리 | `github:01-works/paseo-plugin:agent-list` | Paseo 0.10.2 이상 |
| [ZeroSub](docs/plugins/zerosub.md) | Claude·ChatGPT 구독 계정 선택·한도 도달 시 전환 | `kapybara-org/zerosub` | `claude` 또는 `codex` CLI. 요구 버전·계정 설정은 [개별 안내](docs/plugins/zerosub.md) 참조 |

mac-monitor와 agent-list는 이 저장소에서 관리하고, ZeroSub는 Kapybara가 배포하는 외부 플러그인입니다.
다른 커뮤니티 플러그인은 [커뮤니티 안내](docs/community-plugins.md)에서 찾을 수 있습니다.

[bootstrap](https://github.com/01-works/bootstrap)으로 세팅한 Mac은 bootstrap의
[플러그인 목록](https://github.com/01-works/bootstrap/blob/main/agents/paseo.md#플러그인)이 기준입니다.
설치할 플러그인과 버전(커밋·레지스트리 버전)을 bootstrap의 `paseo` 단계가 모든 기기에 맞춥니다.
그런 Mac에서는 아래 명령 대신 `~/dev/bootstrap/bootstrap.sh --only paseo`를 실행합니다.

## 설치

설치할 Paseo 호스트의 **Settings → Plugins → Enable plugins**가 켜져 있는지 확인합니다.
플러그인은 호스트별로 설치합니다. 이미 설치되어 정상 실행 중인 항목은 재사용합니다.

macOS에서 기본 목록을 설치하는 명령은 다음과 같습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:mac-monitor
paseo plugin install github:01-works/paseo-plugin:agent-list
paseo plugin add kapybara-org/zerosub
paseo plugin ls
```

각 항목의 상태가 `running`인지 확인합니다. 플랫폼·CLI·버전 조건이 맞지 않는 항목은
누락 이유와 필요한 준비를 남깁니다. macOS 이외의 호스트에는 mac-monitor를 설치하지 않습니다.
ZeroSub는 추가 계정 로그인에 앞서 설치하며, 로그인과 실제 계정 전환은 별도 설정·검증입니다.

## 사용·검증·관리

- mac-monitor: [사용·관리](mac-monitor/README.md), [측정 기준](mac-monitor/docs/MEASUREMENTS.md), [검증 기록](mac-monitor/docs/VALIDATION.md)
- agent-list: [사용·관리](agent-list/README.md), [현재 설계](agent-list/docs/PLAN.md), [검증 기록](agent-list/docs/VALIDATION.md)
- ZeroSub: [계정 추가·선택·전환·제거](docs/plugins/zerosub.md). 설치 후 사이드바의 **Accounts (ZeroSub)**를 엽니다.

공통 관리 명령·설치 문제 확인은 [커뮤니티 안내](docs/community-plugins.md#관리와-문제-확인)에 있습니다.

## 개발

자체 플러그인은 각 폴더에 manifest·소스·의존성·빌드를 갖습니다. Node 24에서 개발하며,
개별 README의 개발·검증 절차를 따릅니다. GitHub Actions는 각 플러그인을 별도 workflow에서 검사합니다.

### Paseo 새 버전

manifest의 `requirements.paseo`에는 최소 버전만 적습니다(`>=0.10.2`). Paseo는 설치뿐 아니라
데몬 시작·reload 때도 이 범위를 검사하므로, 다음 마이너 버전을 미리 상한으로 막으면 Paseo가
업데이트되는 순간 모든 기기에서 플러그인이 멈춥니다. 앱이 스스로 업데이트해서 시점을 정할 수도 없습니다.
최소 버전은 새 API를 쓸 때 올리고, 상한은 실제로 호환되지 않는 릴리스가 확인됐을 때만 붙입니다
([공식 기준](https://paseo.sh/docs/plugins/reference#requirements)).

대신 [Paseo 새 버전 검사](.github/workflows/paseo-next.yml)가 매일 `@getpaseo/plugin`·`@getpaseo/client`의
`latest`·`beta`로 각 플러그인의 타입 검사·테스트·audit을 돌립니다. 고정한 개발용 SDK와 같은 버전과 latest와 같은 beta는
건너뛰므로, 새 버전이 없는 날에는 ubuntu에서 버전만 확인하고 끝납니다.
실패하면 정식 배포 전에 수정하고, 고칠 수 없으면 그 버전 미만으로 상한을 붙여 배포합니다.

main에 merge해도 bootstrap 기기에는 바로 배포되지 않습니다. CI 통과를 확인한 뒤 bootstrap에서
`node scripts/paseo-plugins.mjs --bump`로 버전을 올리고 push하면 자동 갱신으로 모든 기기에 적용됩니다
([배포 절차](https://github.com/01-works/bootstrap/blob/main/agents/paseo.md#새-버전-배포)).

개발하는 기기에서는 bootstrap이 설치한 것을 지우고 고정된 클론 경로에서 폴더 설치합니다.
Paseo 작업 폴더(`~/.paseo/worktrees/…`)는 workspace를 정리하면 사라지므로 설치 경로로 쓰지 않습니다.

```sh
paseo plugin remove <id>
paseo plugin install ~/dev/paseo-plugin/<id>
```

폴더 설치는 bootstrap이 건드리지 않습니다. 개발이 끝나면 `paseo plugin remove <id>` 후
`~/dev/bootstrap/bootstrap.sh --only paseo`로 bootstrap 목록의 버전을 다시 설치합니다.
