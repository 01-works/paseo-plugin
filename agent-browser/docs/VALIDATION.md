# agent-browser 검증 기록

최신 기준: 0.2.1 · 2026-10-09. 환경: arm64 macOS 26.5.1, Node 24.18.0, Paseo 앱·CLI/SDK 0.11.1, 실행 중인 데몬 0.10.2.

## Paseo 0.11.1 호환 검증 (0.2.1)

- `@getpaseo/client`·`@getpaseo/plugin`과 관련 Paseo 패키지를 0.11.1로 갱신했다. lockfile의 다른 의존성 버전은 유지했다. manifest는 `>=0.10.2 <0.12.0`이다.
- `npm run typecheck`, **7개 파일·62개 테스트**, `npm run audit` 0건을 확인했다. 구·신 API의 entry 등록부터 pill → 경유 화면 → 대상 대화 이동과 cleanup을 검사했다. 새 화면 열기 실패는 이전 요청을 유지하며 구 API로 중복 실행하지 않는다.
- [v0.11.1의 실제 컴파일러 소스](https://github.com/getpaseo/paseo/blob/v0.11.1/packages/server/src/server/plugins/compiler.ts)로 제품 entry를 컴파일했다. runtime·shared·type import 경계 검사를 통과한 **48,308 bytes** 번들을 React Native 제공 Hermes로 컴파일해 종료 코드 0을 확인했다. 이 번들은 로컬 소스의 검증 결과이며 설치된 번들이 아니다.
- `node --import tsx test/manual/live.mjs`로 SDK 0.11.1 → 기존 데몬 0.10.2의 실제 목록·구독을 읽었다. 미보관 에이전트 **97개**, 목록 조회 **1회**, owned lease **1개**, 정상 연결 5초 동안 추가 목록 조회 **0회**, partial/stale/error 없음이었다. 실제 대화를 보관하거나 수정하지 않았다.
- 앱·CLI 0.11.1과 데몬 0.10.2의 버전 차이를 확인했다. 이 작업에서는 기존 설치 경로 교체·reload·데몬 재시작·GitHub 배포를 수행하지 않았다.

0.11.1의 실제 데스크톱 화면·모바일 터치는 확인하지 않았다. 화면 등록·대화 이동의 자동 테스트와 Hermes 컴파일 결과를 실화면 확인으로 대체하지 않는다. 아래는 0.2.0 당시의 별도 검증 기록이다.

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
| GitHub CI | 이름 변경 커밋 `8b177d4`의 [검증 실행](https://github.com/01-works/paseo-plugin/actions/runs/37668302460)이 26초에 통과. 타입 검사·58개 테스트·Hermes·audit 완료 |

당시 GitHub Actions는 새 폴더의 타입 검사·58개 테스트·제품 entry의 Hermes 컴파일·client audit를 실행했다. 배포 workflow와 cache 경로도 새 이름으로 통일했다.

## 화면 검증 범위

이름 변경 뒤의 실제 Paseo 화면 확인은 컴퓨터 제어 도구가 앱 이름과 bundle ID로 모두 시간 초과되어 완료하지 못했다. UI 컴포넌트·간격·기능은 이전과 같고, 등록 ID 변경은 자동 테스트로 확인했다. 이름 변경 전의 실화면 확인을 새 설치의 실화면 확인으로 대체하지 않는다.

실제 iPhone의 pill·시트·키보드·길게 누르기·VoiceOver·Dynamic Type과 다른 호스트 설치는 미검증이다. 미리보기·Hermes 결과를 실제 iPhone 화면 검증으로 주장하지 않는다.
