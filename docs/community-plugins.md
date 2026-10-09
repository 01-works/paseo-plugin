# 커뮤니티 플러그인 사용하기

[Paseo 플러그인 목록](https://paseo.sh/plugins)에서 외부 제작자의 플러그인을 찾아 사용할 수 있습니다.
외부 플러그인의 배포와 업데이트는 각 제작자가 관리합니다.
저장소 전체 설치의 대상은 [README의 기본 설치 목록](../README.md#기본-설치-목록)을 따릅니다.

## 사용 목적에 따라 찾기

| 하고 싶은 일 | 플러그인 | 제작자 | 안내 |
|---|---|---|---|
| Claude·ChatGPT 구독 계정을 여러 개 추가하고 에이전트별로 지정하거나 한도 도달 시 전환 | [ZeroSub](https://paseo.sh/plugins/kapybara-org/zerosub) | [Kapybara](https://github.com/kapybara-org) | [설치·계정 추가·전환](plugins/zerosub.md) |

예를 들어 “Claude 계정을 하나 더 쓰고 싶다”, “Codex 계정별로 에이전트를 나누고 싶다”는 요청에는 ZeroSub가 맞습니다.
다른 목적의 플러그인은 공식 목록에서 기능과 제작자 안내를 확인한 뒤 같은 방법으로 설치합니다.

## 소개 페이지에서 설치하기

공식 소개 페이지와 제작자 소스에서 배포 버전·요구 조건을 확인합니다.
소개 페이지에 표시된 설치 식별자를 CLI나 앱의 입력란에 넣습니다. ZeroSub의 식별자는 `kapybara-org/zerosub`입니다.

앱에서는 다음 순서로 진행합니다.

1. 설치할 호스트를 선택하고 **Settings → Plugins**를 엽니다.
2. 플러그인 기능이 꺼져 있다면 **Enable plugins**를 켭니다. 플러그인은 데몬 사용자의 권한으로 실행되므로 제작자와 배포 소스를 먼저 확인합니다.
3. **Plugin source**에 설치 식별자를 입력하고 **Install plugin**을 누릅니다.
4. `running` 상태를 확인하고 개별 안내의 사용 진입점을 엽니다.

터미널에서는 `paseo plugin add <설치 식별자>`로 설치하고 `paseo plugin ls`로 확인합니다.
`add`와 `install`은 같은 명령입니다. CLI가 가리키는 데몬은 `paseo daemon status --json`으로 확인하고,
다른 호스트를 지정하려면 관리 명령에 `--host <호스트>`를 붙입니다.

## 설치 소스와 플러그인 ID

| 입력 형식 | 가져오는 곳 |
|---|---|
| `owner/slug` | Paseo 레지스트리에 지정된 배포 파일 |
| `npm:패키지@버전` | 지정한 npm 패키지 버전 |
| `github:owner/repo` 또는 `git:owner/repo` | Git 저장소 |
| 절대 경로 | 데몬 호스트의 로컬 플러그인 폴더 |

외부 플러그인은 공식 목록의 `owner/slug`를 우선합니다. 레지스트리를 지원하지 않는 호스트에서는
목록에 지정된 동일 npm 버전 등 확인한 배포 파일을 사용합니다. Git 소스는 목록의 배포 버전과 다를 수 있습니다.
소개 페이지의 웹 주소 자체는 설치 소스로 전달하지 않습니다.

## 관리와 문제 확인

업데이트·재시작·제거에는 설치 소스 대신 manifest의 플러그인 ID를 사용합니다.
ZeroSub의 설치 소스는 `kapybara-org/zerosub`, 관리 ID는 `zerosub`입니다.

| 작업 | 명령 |
|---|---|
| 상태·로그 | `paseo plugin ls`, `paseo plugin logs <ID>` |
| 설치된 소스 다시 로드 | `paseo plugin reload <ID>` |
| 비활성화·복귀 | `paseo plugin disable <ID>`, `paseo plugin enable <ID>` |
| 배포 업데이트·제거 | `paseo plugin update <ID>`, `paseo plugin remove <ID>` |

`reload`는 설치된 소스를 다시 로드하며, `update`는 배포 업데이트를 가져옵니다.
현재 CLI에서는 `paseo plugin update <ID> --check`로 변경 제안을 먼저 볼 수 있습니다.
이전 CLI의 옵션은 `paseo plugin update --help`로 확인하세요.
계정이나 별도 데이터를 보관하는 플러그인은 제거 전에 제작자의 정리 절차도 확인합니다.

- `paseo plugin ls`에서 상태와 오류를 확인합니다. `failed`라면 `paseo plugin logs <ID>` 또는 앱의 **Logs**를 확인합니다.
- 설치한 호스트를 앱에서 보고 있는지, 전역 **Enable plugins**와 개별 플러그인이 모두 활성화되어 있는지 확인합니다.
- manifest의 `requirements.paseo`는 데몬과 앱 양쪽의 호환성을 확인하는 기준입니다. 설치가 요구하는 버전을 충족하는지 확인합니다.
- 초기화가 실패하면 `paseo --version`과 `paseo daemon status --json`의 버전도 대조합니다. 필요한 재시작은 실행 중인 작업과 영향을 확인한 뒤 진행합니다.
- 계정 로그인 등 기능별 설정은 개별 플러그인 안내를 따릅니다.

## 안내 추가하기

새 안내의 구성과 기본 설치 목록에 추가하는 절차는 [문서 관리 규칙](../AGENTS.md#문서-관리)을 따릅니다.
개별 안내에는 확인한 버전·날짜와 실제 검증 범위를 기록합니다.

출처: [공식 설치 안내](https://paseo.sh/docs/plugins), [설치 소스와 관리 명령](https://paseo.sh/docs/plugins/reference#plugin-sources),
[레지스트리 배포 안내](https://paseo.sh/docs/plugins/publishing#plugin-registry).
