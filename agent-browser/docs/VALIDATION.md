# agent-browser 검증 기록

기준: 0.2.0 · 2026-10-08. 환경: arm64 macOS 26.5.1, Node 24, Paseo CLI/daemon/SDK 0.10.2.

## 범위

폴더·패키지·설치 ID·pill ID·이동 surface·CI·검증 도구 이름을 새 이름으로 변경한다. 기존 이름의 호환 경로를 남기지 않는다. 목록·검색·대화 이동·ID 복사·닫기·공유 구독·기본 폰트·간격은 유지한다.

이름 변경 전의 실제 화면·좁은 화면 미리보기·부하와 Hermes 결과는 [이력](history/VALIDATION.md)에 당시 값과 설치 이름 그대로 보존했다. 새 설치의 검증 결과는 아래에 별도로 기록한다.

## 새 설치 검증

2026-10-08에 다음을 직접 검증했다.

| 항목 | 결과 |
|---|---|
| 타입 검사 | `npm run typecheck` 통과 |
| 자동 테스트 | 7개 파일·58개 테스트 통과. web/iOS의 새 pill ID, 공개 이동 surface, 검색·복사·닫기·공유 구독·portal 경계 회귀 포함 |
| client audit | `npm run audit` 0건 |
| 의존성 | lockfile의 루트 이름·버전 외 변경 없음 |
| 로컬 설치 | 이전 ID 제거 후 `/Users/yw/dev/paseo-plugin/agent-browser` 설치. 03:32:14 KST에 ready, enabled/running |
| 설치 catalog | 새 ID 존재·이전 ID 부재 확인 |
| 설치 번들 | 48,394 bytes. 데몬이 제공한 실제 번들 전체를 Hermes로 컴파일해 종료 코드 0 확인 |
| 플러그인 로그 | loading·ready 2개, stderr 0개 |
| 실제 목록·구독 | 에이전트 105개를 목록 조회 1회·owned lease 1개로 수신. 정상 연결 5초 동안 추가 목록 조회 0회 |
| 문서·차이 검사 | 상대 파일 링크 오류 0개, `git diff --check` 통과 |
| mac-monitor 보존 | 플러그인 파일·workflow 변경 없음. 기존 로컬 설치 running 유지 |

GitHub Actions는 새 폴더의 타입 검사·58개 테스트·제품 entry의 Hermes 컴파일·client audit를 실행한다. 배포 workflow와 cache 경로도 새 이름으로 통일했다.

## 화면 검증 범위

이름 변경 뒤의 실제 Paseo 화면 확인은 컴퓨터 제어 도구가 앱 이름과 bundle ID로 모두 시간 초과되어 완료하지 못했다. UI 컴포넌트·간격·기능은 이전과 같고, 등록 ID 변경은 자동 테스트로 확인했다. 이름 변경 전의 실화면 확인을 새 설치의 실화면 확인으로 대체하지 않는다.

실제 iPhone의 pill·시트·키보드·길게 누르기·VoiceOver·Dynamic Type과 다른 호스트 설치는 미검증이다. 미리보기·Hermes 결과를 실제 iPhone 화면 검증으로 주장하지 않는다.
