# 검증 기록

검증일: 2026-10-06 KST. 환경: arm64 macOS 26.5.1, Node 24.18.0, Paseo CLI/daemon/SDK 0.10.2, 플러그인 0.1.0.

## 자동 검증

최종 결과: `npm run typecheck` 통과, `npm test` **5개 파일·38개 테스트 통과**, `npm run audit` **0건**. `git diff --check`도 통과했다.

| 범위 | 확인 내용 |
|---|---|
| 모델 | label 폴백·first-class null 우선, 없는 부모·여러 루트·workspace 자손/조상 문맥, 순환·자기 참조, 깊이 2,000, 상태 우선순위 |
| 배치 | 상태·긴 제목 변경 시 좌표 유지, 형제 간 겹침 없음, 명시적 상한·부분 결과, 209개 구조의 전체 배치, 현재 경로 초기 펼침 |
| directory | 단일 lease/single-flight, 200개 밖 update, 페이지/update/remove 경합, reconnect 캐시·세대 검사, 2,000 상한, 알림 묶기, stale·타이머 정리, 늦은 lease release, 실패 뒤 삭제 유지, 연속 재시도 |
| React 상호작용 | pill 3개도 공유 조회, 모달·선택·배율·geometry 유지, 큰 보기 context, compact 트리, 기본 Text 크기·색, host/workspace별 뷰 상태, ID 복사와 길게 누르기 |
| React DOM portal | 노드·확대·ID 복사·본문 클릭 후 바깥 pill action 1회 유지, 배율·선택·모달 유지 |

UI 단위 테스트는 React Native·Paseo 호스트 요소를 mock한다. portal 검증은 JSDOM에서 실제 React DOM portal의 이벤트 경계를 확인한다. 실제 Paseo UI 전체의 대체 검증은 아니다.
제품 client에는 DOM/HTML·Canvas/SVG·React Flow·직접 clipboard 접근이 없다. DOM은 portal 테스트 파일에서만 사용한다. TypeScript lib에는 DOM이 없다.

## 실제 로컬 API

`node --import tsx test/manual/live.mjs`는 별도의 검증용 로컬 연결을 만들며 제품의 `AgentDirectory`를 실행한다. 종료 시 그 검증용 연결만 닫는다. 에이전트를 생성하거나 수정하지 않는다.

- 전체 296개, 부모 label이 있는 에이전트 228개를 읽었다.
- 초기 200개와 다음 페이지: 목록 조회 2회, owned subscription 1개.
- 초기 완료 뒤 5초: 추가 목록 조회 0회.
- 가장 큰 현재 관계 209개를 확인했다. 다른 workspace 자손도 포함했다.
- 기존 에이전트의 상태 이벤트를 받는 동안 자료를 유지했다. 실제 단절·재연결은 데몬을 조작하지 않고 자동 fixture로 검증했다.

## 실제 화면

Paseo 데스크톱 다크 화면에서 직접 조작하고 스크린샷·접근성 상태를 확인했다.

- 단일 에이전트: pill → 모달. 캐시를 표시하고 전체 화면 로딩으로 교체하지 않았다.
- workspace의 독립 에이전트 3개 범위와 현재 구조 범위 전환.
- 실제 209개 관계의 그래프: 부모 위/자식 아래, 직각 연결선, 현재 노드 테두리, 화면 주변 노드만 표시.
- 가지 접기 `+208` 및 펼치기, 125% 확대, 모달 내부 클릭으로 열린 상태 유지.
- `크게 보기`: workspace 패널에서 동일 배율·선택·범위를 유지. 첫 패널에서 루트가 보이도록 위치 보정.
- 하위 노드 선택: 상세의 provider·부모·ID가 해당 항목으로 바뀜.
- 하위 에이전트 `ID 복사`: 실제 `에이전트 ID 복사됨` toast 확인.
- 패널 `대화 열기`: 선택한 하위 에이전트의 기존 workspace·대화로 이동.

라이트 테마, 실제 compact/iOS/Android 터치, 키보드 전체 탐색, 여러 pill 동시 표시, 실제 네트워크 재연결은 직접 검증하지 않았다.
compact·복수 pill 공유·재연결은 자동 테스트 범위다. 우클릭 메뉴는 구현하지 않았고, 길게 누르기는 자동 이벤트 테스트로 검증했다.

## 순수 처리 비용

`npm run bench`로 각 경우 100회 실행했다. 정규화된 2,000개 합성 모델에서 관계 구성·범위·자손 집계·배치까지 포함한다.

| 모델 | 좌표 수 | 중앙값 ms | p95 ms |
|---|---:|---:|---:|
| 가까운 경로만 펼침 | 21 | 1.97 | 2.73 |
| 전체 펼침 | 2,000 | 2.65 | 2.92 |
| 직계 자손 1,999 | 2,000 | 2.19 | 2.57 |
| 깊은 체인 | 2,000 | 1.99 | 2.26 |

이 값은 Node의 순수 처리 시간이다. 브라우저 렌더링 시간, Paseo 전체 CPU, 플러그인의 추가 RSS를 측정한 결과가 아니다.
bench가 출력하는 processHeapMiB는 테스트 런타임과 여러 합성 자료를 포함하며 플러그인 전용 메모리 부하로 해석하지 않는다.
실제 209개 그래프를 조작해 응답을 확인했지만 FPS·UI 렌더링 시간은 계측하지 않았다.

## 설치·수명·배포

`paseo plugin install /Users/yw/dev/paseo-plugin/agent-graph`와 후속 reload가 enabled/running으로 완료됐다. server entry가 없는 client 전용이다.
기존 mac-monitor 소스·설치 경로는 변경하지 않았으며 데몬 restart/stop을 실행하지 않았다.
최종 수명 검증(21:22 KST): `agent-graph`만 disable하여 disabled와 실제 pill 제거를 확인했다. 다시 enable하여 enabled/running과 실제 pill 복귀를 확인했다. 플러그인 로그는 `Plugin ready`이며 stderr·오류 항목이 없다.
데몬 PID 65843·worker PID 65844는 유지됐다. mac-monitor는 running이고 기존 헬퍼는 한 개다. 다른 플러그인 reload·소스 수정·데몬 재시작은 수행하지 않았다.
검증으로 이동한 대화에서 원래 mac-monitor 워크스페이스의 에이전트 구조 작업 탭으로 복귀했다.

GitHub workflow 파일을 추가했지만 아직 push하지 않아 원격 CI 결과는 없다. 다른 호스트 설치·0.11 호환성은 미검증이다.
