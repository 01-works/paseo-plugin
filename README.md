# Paseo 플러그인

Paseo용 플러그인과 사용 안내를 모은 저장소입니다. 자체 플러그인은 독립된 폴더에 manifest·소스·의존성·빌드를 갖습니다.
외부 커뮤니티 플러그인도 [커뮤니티 플러그인 안내](docs/community-plugins.md)에서 찾아 설치하고 사용할 수 있습니다.

| 플러그인 | 기능 | 검증 환경 |
|---|---|---|
| [mac-monitor](mac-monitor/README.md) | 저부하 macOS 시스템 모니터. CPU·메모리·압력·스왑·SSD 용량, 상위 앱 10개와 프로세스 종료 | Paseo SDK 0.11.1, arm64 macOS 26.5.1 |
| [agent-browser](agent-browser/README.md) | pill에서 현재 워크스페이스의 최근 목록·검색·대화 이동·ID 복사·확인 후 닫기 | Paseo SDK 0.11.1, Hermes·0.10.2 실화면 검증 이력 |

## 설치

Paseo 0.10.2~0.11.x의 데몬과 앱에서 플러그인 사용을 활성화한 뒤 사용할 플러그인을 설치합니다. mac-monitor는 macOS 전용입니다.
두 플러그인은 SDK 0.11.1로 개발하며, 새 화면 API를 우선 사용하고 0.10.2 클라이언트에서는 기존 API를 사용합니다.

```sh
paseo plugin install github:01-works/paseo-plugin:mac-monitor
paseo plugin install github:01-works/paseo-plugin:agent-browser
```

업데이트는 `paseo plugin update mac-monitor`, 제거는 `paseo plugin remove mac-monitor`를 사용합니다.
측정 기준·자체 부하·알려진 한계는 [플러그인 README](mac-monitor/README.md),
직접 수행한 검증과 남은 확인 항목은 [검증 기록](mac-monitor/docs/VALIDATION.md)에 있습니다.

agent-browser는 `paseo plugin update agent-browser`로 업데이트하고 `paseo plugin remove agent-browser`로 제거합니다.
사용법과 실제 iPhone 등 남은 확인 항목은 [에이전트 탐색 안내](agent-browser/README.md)에 있습니다.

## 커뮤니티 플러그인

Claude·ChatGPT 구독 계정을 여러 개 사용하거나 한도에 도달했을 때 계정을 전환하려면
[ZeroSub 사용 안내](docs/plugins/zerosub.md)를 참고하세요. Kapybara가 관리하는 외부 플러그인입니다.

```sh
paseo plugin add kapybara-org/zerosub
```

설치 후 사이드바의 **Accounts (ZeroSub)**에서 계정을 추가합니다.
다른 외부 플러그인을 찾는 방법, 앱에서 설치하는 방법과 관리 명령은 [커뮤니티 플러그인 안내](docs/community-plugins.md)에 있습니다.

## 개발

Node 24를 사용해 해당 플러그인 폴더에서 검증합니다.

```sh
cd mac-monitor
npm ci
npm run typecheck
npm test
npm run build
```

GitHub Actions는 arm64·Intel macOS에서 타입 검사·단위 테스트·커밋된 헬퍼 실행·universal 빌드·서명·JSON을 확인합니다.
agent-browser는 별도 workflow에서 타입 검사·단위 테스트·Hermes 번들 컴파일·React Native 경계를 검사합니다.
로컬 Activity Monitor 대조 결과와 남은 compact·다른 Mac 설치 검증은 [검증 기록](mac-monitor/docs/VALIDATION.md)에 공개합니다.
