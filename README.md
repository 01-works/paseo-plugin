# Paseo 플러그인

Paseo용 자체 플러그인과 외부 커뮤니티 플러그인의 설치·사용 안내를 모은 저장소입니다.

## 기본 설치 목록

**“이 저장소를 설치해”, “클론해서 설치해”는 아래 목록 전체를 설치하는 요청입니다.**
앞으로 이 표에 추가된 항목도 함께 설치합니다.
특정 플러그인만 요청하면 해당 항목을 설치합니다.

| 플러그인 | 기능 | 설치 소스 | 조건·상세 |
|---|---|---|---|
| [mac-monitor](mac-monitor/README.md) | 시스템 지표·상위 앱·프로세스 종료·정리 검사 | `github:01-works/paseo-plugin:mac-monitor` | macOS, Paseo 0.10.2~0.11.x |
| [agent-browser](agent-browser/README.md) | 현재 워크스페이스의 에이전트 목록·검색·대화 이동·닫기 | `github:01-works/paseo-plugin:agent-browser` | Paseo 0.10.2~0.11.x |
| [ZeroSub](docs/plugins/zerosub.md) | Claude·ChatGPT 구독 계정 선택·한도 도달 시 전환 | `kapybara-org/zerosub` | `claude` 또는 `codex` CLI. 요구 버전·계정 설정은 [개별 안내](docs/plugins/zerosub.md) 참조 |

mac-monitor와 agent-browser는 이 저장소에서 관리하고, ZeroSub는 Kapybara가 배포하는 외부 플러그인입니다.
다른 커뮤니티 플러그인은 [커뮤니티 안내](docs/community-plugins.md)에서 찾을 수 있습니다.

## 설치

설치할 Paseo 호스트의 **Settings → Plugins → Enable plugins**가 켜져 있는지 확인합니다.
플러그인은 호스트별로 설치합니다. 이미 설치되어 정상 실행 중인 항목은 재사용합니다.

macOS에서 기본 목록을 설치하는 명령은 다음과 같습니다.

```sh
paseo plugin install github:01-works/paseo-plugin:mac-monitor
paseo plugin install github:01-works/paseo-plugin:agent-browser
paseo plugin add kapybara-org/zerosub
paseo plugin ls
```

각 항목의 상태가 `running`인지 확인합니다. 플랫폼·CLI·버전 조건이 맞지 않는 항목은
누락 이유와 필요한 준비를 남깁니다. macOS 이외의 호스트에는 mac-monitor를 설치하지 않습니다.
ZeroSub는 추가 계정 로그인에 앞서 설치하며, 로그인과 실제 계정 전환은 별도 설정·검증입니다.

## 사용·검증·관리

- mac-monitor: [사용·관리](mac-monitor/README.md), [측정 기준](mac-monitor/docs/MEASUREMENTS.md), [검증 기록](mac-monitor/docs/VALIDATION.md)
- agent-browser: [사용·관리](agent-browser/README.md), [현재 설계](agent-browser/docs/PLAN.md), [검증 기록](agent-browser/docs/VALIDATION.md)
- ZeroSub: [계정 추가·선택·전환·제거](docs/plugins/zerosub.md). 설치 후 사이드바의 **Accounts (ZeroSub)**를 엽니다.

공통 관리 명령·설치 문제 확인은 [커뮤니티 안내](docs/community-plugins.md#관리와-문제-확인)에 있습니다.

## 개발

자체 플러그인은 각 폴더에 manifest·소스·의존성·빌드를 갖습니다. Node 24에서 개발하며,
개별 README의 개발·검증 절차를 따릅니다. GitHub Actions는 각 플러그인을 별도 workflow에서 검사합니다.
