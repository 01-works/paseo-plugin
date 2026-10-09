# ZeroSub 사용 안내

ZeroSub는 여러 Claude·ChatGPT(Codex) 구독 계정을 Paseo에서 함께 사용하는 [Kapybara의 커뮤니티 플러그인](https://paseo.sh/plugins/kapybara-org/zerosub)입니다.
계정을 앱에서 추가하고 에이전트별로 선택할 수 있으며, 사용 한도에 도달하면 다른 계정으로 전환합니다.
이 저장소의 [기본 설치 목록](../../README.md#기본-설치-목록)에 포함됩니다.

| 항목 | 값 |
|---|---|
| 공식 목록·설치 식별자 | `kapybara-org/zerosub` |
| 관리 ID | `zerosub` |
| npm 패키지 | `@kapybara/zerosub` |
| 제작자 저장소 | [kapybara-org/zerosub](https://github.com/kapybara-org/zerosub) |
| 문서 확인 기준 | 2026-10-09, 공식 목록의 npm 배포 `1.2.1` |
| 최소 Paseo 버전 | `>=0.9.1` (해당 배포의 manifest) |

## 설치

데몬이 실행되는 컴퓨터에 `claude` 또는 `codex` CLI가 설치되어 있어야 합니다.
**Settings → Plugins → Enable plugins**가 켜진 호스트에서 설치합니다.

```sh
paseo plugin add kapybara-org/zerosub
paseo plugin ls
```

앱에서도 **Settings → Plugins → Plugin source**에 `kapybara-org/zerosub`를 입력하고 **Install plugin**을 누르면 됩니다.
설치 후 사이드바의 **Accounts (ZeroSub)**를 엽니다.

레지스트리 식별자를 지원하지 않는 호스트에서는 확인한 동일 배포 버전을 명시해 설치할 수 있습니다.

```sh
paseo plugin install npm:@kapybara/zerosub@1.2.1
```

이 버전은 문서 확인 시점의 공식 목록 기준입니다. 나중에 설치할 때는 목록의 현재 버전과 요구 조건을 다시 확인합니다.

## 계정 추가

1. **Accounts (ZeroSub)**를 엽니다. 기존 Claude·Codex CLI 로그인은 기본 계정으로 표시됩니다.
2. Claude 또는 **ChatGPT (Codex)** 아래의 **Add account**를 누릅니다.
3. **Open sign-in page**에서 추가할 계정으로 로그인합니다.
4. 원격 호스트나 휴대폰에서는 **Use a code instead**를 사용합니다. Claude는 로그인 페이지가 보여 준 코드를 Paseo에 붙여 넣고, ChatGPT는 Paseo의 코드를 로그인 페이지에 입력합니다.

브라우저 로그인은 데몬 컴퓨터에 도달할 수 있어야 완료됩니다. 같은 컴퓨터에서 로그인할 때는 브라우저 방식이 편합니다.
ChatGPT 코드 로그인은 해당 계정의 **Settings → Security**에서 활성화되어 있어야 합니다.
계정과 로그인은 호스트별로 관리되므로 여러 호스트에서는 각 호스트에서 따로 로그인합니다.

## 일상적인 사용

같은 제공자에 계정이 두 개 이상 생기면 해당 Claude·Codex 에이전트의 입력창에 계정 버튼이 나타납니다.
버튼을 눌러 그 에이전트의 계정을 바꾸거나 입력창에서 다음 명령을 실행합니다.

```text
/account work
/account default
```

`work`는 Accounts 화면에서 지정한 실제 계정 이름으로 바꿉니다.
`/account default`는 기본 계정을 따르는 설정으로 돌아갑니다.
Accounts의 **Make default**는 새 에이전트와 기본 계정을 따르는 에이전트에 적용됩니다.
⌘K에서도 **Make … the default**를 찾을 수 있습니다.

설정은 Accounts 화면 또는 **Settings → Plugins → zerosub → ZeroSub preferences**에서 조절합니다.

| 설정 | 기본값 | 동작 |
|---|---|---|
| Automatic switching | 켜짐 | CLI가 사용 한도를 알리면 같은 제공자의 여유 있는 계정으로 전환 |
| 전환 후 자동 계속 (`autoContinue`) | 켜짐 | 전환 후 후속 프롬프트를 보내 중단된 작업을 이어감 |
| 새 에이전트 분산 (`balanceNewAgents`) | 꺼짐 | 기본 계정 대신 여유가 가장 많은 계정에서 새 에이전트를 시작 |
| Use banked resets when every account is out | 꺼짐 | 제공자의 모든 계정이 한도에 도달하면 보유한 리셋을 자동 사용 |
| When every account is out, fork the chat to the other provider | 꺼짐 | Claude↔ChatGPT 사이에서 대화를 새 에이전트로 이어감 |

사용량 표시는 참고 정보이며, 자동 전환은 CLI가 보고한 한도에 반응합니다.
작업 중인 에이전트는 현재 턴이 끝난 뒤 전환하고, 전환 결과는 타임라인에 표시됩니다.

## Claude와 Codex의 전환 차이

| 제공자 | 이미 진행한 대화에서 다른 계정을 선택할 때 |
|---|---|
| Claude | 같은 에이전트에서 세션을 다시 열어 대화 기록을 이어감 |
| ChatGPT (Codex) | 기존 스레드를 다른 계정으로 옮길 수 있어 같은 워크스페이스에 후속 에이전트를 생성하고, 이전 대화 내용을 전달 |

Codex에서 새 에이전트가 생기는 것은 플러그인의 정상 동작입니다. 기존 스레드는 원래 계정에 남습니다.
추가 계정의 이름을 정한 뒤 새 에이전트에서 계정 버튼을 확인하면 처음 사용하기 쉽습니다.

## 알아둘 점

- 계정이 하나뿐이면 보통 계정 버튼이 없습니다. **Accounts (ZeroSub)**에서 두 번째 계정을 추가하세요.
- 계정 로그인은 공식 CLI를 통해 처리됩니다. 추가 계정의 인증 홈은 `$PASEO_HOME/zerosub/homes/`에 따로 있고, 설정·스킬·대화 기록은 주 CLI 홈과 공유합니다.
- Claude 사용량 조회를 위해 플러그인이 해당 계정의 OAuth 토큰을 읽어 `api.anthropic.com`에 전송합니다. Codex 조회는 `codex app-server`를 사용합니다. Claude의 OAuth 기반 MCP 서버는 계정마다 로그인해야 할 수 있습니다.
- 1.2.1은 CLI가 제공한 로그인 URL의 도메인을 검사하지 않습니다. 로그인할 때 브라우저의 실제 주소가 공식 제공자의 로그인 페이지인지 확인합니다. [로그인 URL 처리](https://github.com/kapybara-org/zerosub/blob/2354700ad8749bebc3cff142190c37e1a7bd8999/server/claude.ts#L298)
- Claude 공용 설정에 `apiKeyHelper`나 API 키 환경 설정이 있으면 구독 대신 그 키가 사용될 수 있습니다.
- 유휴 Claude 계정의 사용량은 이전 값일 수 있고 조회 제한도 있습니다. 필요한 경우 화면에서 새로고침합니다.
- 암호로 보호된 데몬에서는 계정 전환에 쓰는 `paseo agent reload`가 인증할 수 없어 다음 세션 시작 때 적용될 수 있습니다.
- **Use reset**은 보유한 리셋을 소모합니다. 수동 실행은 확인 창을 거치지만 자동 리셋 설정을 켜면 건별 확인 없이 소모합니다.
- 제작자는 macOS에서 검증했고 Windows는 미검증으로 안내합니다. 다른 플랫폼에서는 제작자의 최신 문서를 확인하세요.

## 관리와 제거

상태·로그·업데이트·비활성화 등 공통 명령은 [관리 안내](../community-plugins.md#관리와-문제-확인)를 따릅니다. 관리 ID는 `zerosub`입니다.

제거하려면 Accounts 화면에서 추가 계정을 먼저 삭제해 로그아웃한 뒤 실행합니다.
Codex 대화가 남아 있는 계정은 해당 대화를 보관하거나 다른 곳에서 이어간 뒤 삭제할 수 있습니다.

```sh
paseo plugin remove zerosub
```

플러그인 제거와 `$PASEO_HOME/zerosub/`의 계정 데이터 정리는 별개입니다.
데이터 폴더 정리는 [제작자의 제거 절차](https://github.com/kapybara-org/zerosub#uninstall)에 따라 필요할 때 별도로 수행합니다.

## 출처와 검증 기준

설치·사용 설명은 [공식 플러그인 소개](https://paseo.sh/plugins/kapybara-org/zerosub)와
[1.2.1 배포 README·소스](https://www.npmjs.com/package/@kapybara/zerosub/v/1.2.1)를 기준으로 작성했습니다.
최신 변경과 이슈는 [제작자 저장소](https://github.com/kapybara-org/zerosub)에서 확인합니다.

### 로컬 설치 검증 (2026-10-09)

macOS에서 CLI·앱·데몬 `0.11.1`을 기준으로 확인했습니다.

| 확인 항목 | 결과 |
|---|---|
| 공식 목록의 배포 파일 | npm `1.2.1`의 SHA-512가 목록에 표시된 무결성 값과 일치 |
| 전역 플러그인 기능 | 이미 활성화되어 있음 |
| 설치 경로 | `paseo plugin add kapybara-org/zerosub`, 레지스트리 출처와 `currentRevision: 1.2.1` 확인 |
| 실행 상태·로그 | `running`, `Plugin ready`, 초기화 오류 없음 |
| 상태 RPC (`zerosub.state`) | 기존 Claude·Codex CLI 계정이 각각 기본 계정으로 인식되고 둘 다 `ready`, 경고 0개 |
| 클라이언트 배포 | 플러그인 카탈로그에 클라이언트 번들이 포함됨 |
| 실제 앱 화면 | 앱 자동화 연결이 시간 초과되어 화면 검증은 완료하지 못함 |
| 추가 로그인·계정 전환·한도 대응 | 미검증. 추가 계정 로그인 후 확인 필요 |

첫 시도에서는 앱 `0.11.1`과 실행 중인 데몬 `0.10.2`의 플러그인 시작 규약이 달라 초기화가 시간 초과되었습니다.
데몬이 `0.11.1`로 갱신된 상태에서 재설치하자 정상적으로 시작했습니다.
최소 버전을 만족하더라도 업데이트된 앱의 런타임과 실행 중인 데몬의 버전이 다르면 이 문제가 생길 수 있습니다.
