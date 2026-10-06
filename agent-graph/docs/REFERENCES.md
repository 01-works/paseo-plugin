# agent-graph 레퍼런스 검토

조사일: 2026-10-06

목적: Paseo 에이전트의 부모·자식 구조를 pill에서 자주 확인할 새 플러그인의 계획 근거를 남긴다.

구현 계획: [PLAN.md](PLAN.md)

## 1. Agent Crew

가장 가까운 공개 레퍼런스는 [omercnet/paseo-plugins의 Agent Crew](https://github.com/omercnet/paseo-plugins/tree/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew)다.
검토한 package 버전은 1.2.0, 소스 커밋은 `a479d4ab7c15f91dd37c2f30c102c0ed4b063f68`이다.

| 검토 소스 | 확인 내용 |
|---|---|
| [README](https://github.com/omercnet/paseo-plugins/blob/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew/README.md) | Explorer에서 부모·자식 구조, 상태, 검색과 필터, 대화 이동을 제공한다. provider 내부 하위 에이전트는 대상에 포함하지 않는다. |
| [client/crew.ts](https://github.com/omercnet/paseo-plugins/blob/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew/client/crew.ts) | first-class 부모 ID와 legacy label 처리, workspace 범위의 자손·조상 구성, 순환 방어, 상태 분류를 확인했다. |
| [client/main.tsx](https://github.com/omercnet/paseo-plugins/blob/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew/client/main.tsx) | 목록 200개씩 최대 10페이지, 구독 이벤트 뒤 debounce 재조회, 30초 보조 갱신, 검색·접기·상세 동작을 확인했다. |
| [index.client.tsx](https://github.com/omercnet/paseo-plugins/blob/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew/index.client.tsx) | 작업 패널·Command Center 진입 등록을 확인했다. |
| [LICENSE](https://github.com/omercnet/paseo-plugins/blob/a479d4ab7c15f91dd37c2f30c102c0ed4b063f68/agent-crew/LICENSE) | MIT, Omer Cohen의 저작권 고지. 상당량을 재사용하면 고지를 보존해야 한다. |

채택할 패턴은 관계의 출처를 분리하는 정규화, 같은 호스트의 다른 workspace 자손 포함,
필요한 외부 조상을 문맥으로 남기는 방식, 불완전한 자료의 표시다.

이 플러그인은 그래프 좌표가 안정적이어야 하므로 상태 우선 형제 정렬을 가져오지 않는다.
이벤트 뒤 전체 재조회와 30초 보조 폴링도 그대로 복제하지 않고, 0.10.2 구독 범위를 먼저 검증한다.
Agent Crew의 중단·nudge·archive·permission 작업은 이번 첫 버전 범위에 넣지 않는다.

Agent Crew는 접이식 계층 목록의 레퍼런스다. 확대 가능한 자유 노드 캔버스나 pill 모달의 구현이 이미 검증됐다고 해석하지 않는다.

## 2. mac-monitor

이 저장소의 기존 플러그인을 pill 진입과 모달 수명 관리의 레퍼런스로 사용한다.
검토 시점의 모음 저장소 커밋은 `c0abd105ed8c0a9ede4263e7ebaf0648aae2dc9e`다.

- [client/pill.tsx](https://github.com/01-works/paseo-plugin/blob/c0abd105ed8c0a9ede4263e7ebaf0648aae2dc9e/mac-monitor/client/pill.tsx):
  여러 pill의 데이터 공유, 값이 달라질 때만 라벨 갱신, 열린 모달 상태와 라벨 상태 분리.
- [검증 기록](https://github.com/01-works/paseo-plugin/blob/c0abd105ed8c0a9ede4263e7ebaf0648aae2dc9e/mac-monitor/docs/VALIDATION.md):
  portal의 클릭이 바깥 pill에 전달되어 모달이 재생성되었던 회귀와 수정, 실제 화면 검증 범위.

새 플러그인에서 유지할 규칙:

1. 캐시가 있으면 모달을 바로 열고, 갱신 중에도 기존 화면을 유지한다.
2. pill 라벨 변경이 모달을 닫거나 재등록하지 않게 한다.
3. 모달 클릭 전파를 막고, 노드·접기·확대·상세 클릭으로 pill action이 재실행되지 않는지 검증한다.
4. 짧은 라벨과 기본 폰트·theme.colors를 사용한다.

mac-monitor의 고정 2초 측정 타이머는 시스템 수집 목적이다.
agent-graph는 이미 존재하는 에이전트 directory 이벤트를 활용하므로 이 타이머나 native helper를 가져오지 않는다.

## 3. Paseo 0.10.2 API

공식 문서의 기준은 [v0.10.2 plugin reference](https://github.com/getpaseo/paseo/blob/v0.10.2/public-docs/plugins/reference.md)다.
설치된 0.10.2 타입과 해당 태그 소스를 함께 읽었다.
[현재 공개 문서](https://paseo.sh/docs/plugins/reference/)는 업데이트될 수 있으므로 새 기능을 0.10.2에서 사용할 수 있다고 가정하지 않는다.

| 로컬 확인 위치 — mac-monitor의 node_modules 기준 | 계획에 반영한 사실 |
|---|---|
| `@getpaseo/plugin/dist/client/buttons.d.ts` | composer pill 등록과 update/remove. 아이콘·content props에는 navigation이 없다. |
| `@getpaseo/plugin/dist/client/contracts.d.ts` | agent-context 작업 패널, workspace 위치, openPanel. 탐색 가능한 패널의 navigation은 선택적이다. |
| `@getpaseo/plugin/dist/client/react-native.d.ts` | Modal의 open/onOpenChange와 Content의 scrollable. 공개 크기·전체 화면 prop은 없다. |
| `@getpaseo/client/dist/index.d.ts`, `connection/` 타입 | 구독 옵션을 가진 agents.list와 owned subscription, observer·release 수명. |
| `@getpaseo/protocol` 및 태그의 `packages/protocol/src/messages.ts` | 원시 AgentSnapshotPayload의 labels·status·attention·archive, 목록 페이지 크기 상한 200. |
| 태그의 `packages/app/src/plugins/buttons/view.tsx` | pill 최대 폭 160, popover 폭 280~420. 작은 popover 대신 Modal을 선택한 근거. |
| 태그의 `packages/app/src/plugins/react-native/modal.tsx` | desktop 모달과 compact 시트를 호스트가 결정한다. |

0.10.2 원시 에이전트 목록에는 first-class parentAgentId가 없으며,
`labels["paseo.parent-agent-id"]`를 해석해야 한다. plugin 정규화 DTO의 필드와 원시 payload를 구분한다.
navigation은 모든 UI props에 공통으로 제공되지 않는다. 모달에서 패널을 여는 동작과 패널의 대화 이동을 분리한다.

타입에서 API 존재는 확인했지만 **200개 이후 구독 window의 의미, compact의 패널 전환, 확대 후 실제 스크롤**은
agent-graph 구현에서 직접 검증해야 한다. 이 문서는 실행 검증 완료를 뜻하지 않는다.

구현 후 확인: 전체 filter update와 296개 목록의 단일 lease, 확대·패널·ID 복사는 [DECISIONS](DECISIONS.md), [VALIDATION](VALIDATION.md)에 기록했다.
실제 compact 패널·라이트 테마·모바일 터치는 미검증이다. 공개 `copyText`와 `useToast`를 ID 복사에 사용하며 공개 context menu는 없어 우클릭 메뉴를 추가하지 않았다.

## 4. 다른 커뮤니티 후보

초기 조사에서 Agent Monitor·Gas City·Uppidi Fleet 계열도 비교했다.
각각 전체 에이전트 현황 정리, 외부 supervisor 연동, 별도 자율 오케스트레이션에 초점이 있어
이번의 작은 관계 뷰에는 Agent Crew를 주 레퍼런스로 선택했다.
이 후보의 현재 유지보수·설치 호환성을 검증하거나 설치하지 않았으므로 설치 권장 목록으로 사용하지 않는다.

## 5. 적용 원칙

커뮤니티 소스는 UI·데이터 처리의 참고 자료다. 실제 계약은 설치 대상 Paseo 버전의 공개 타입으로 확인한다.
관계 표시와 제어 기능, 읽기 쉬운 트리와 고급 그래프 편집기를 구분해 첫 버전 범위를 유지한다.
참조한 커밋 이후의 변경은 별도로 검토하고, 구현 중 발견한 제약은 DECISIONS와 VALIDATION에 기록한다.

## 6. 정적 D3 배치와 이동 — 0.1.1

- [d3-force simulation](https://d3js.org/d3-force/simulation): 생성 시 자동 타이머가 시작되므로 `stop()` 후 수동 `tick()`으로 정적 좌표를 계산한다. tick은 자동 렌더링 이벤트를 보내지 않는다.
- [many-body](https://d3js.org/d3-force/many-body), [collide](https://d3js.org/d3-force/collide), [link](https://d3js.org/d3-force/link): 점들의 반발·카드 충돌 회피·실제 부모 링크를 좌표 계산에 사용한다.
- [React Native PanResponder](https://reactnative.dev/docs/panresponder), [ScrollView](https://reactnative.dev/docs/scrollview): 공개 RN gesture와 scrollTo로 화면 이동을 구현한다.

D3를 DOM·SVG 렌더링 라이브러리로 사용하지 않는다. 플러그인의 관계 모델과 RN 표시 방식은 유지하며, 물리 계산은 종료와 캐시가 있는 초기 작업으로 한정한다.
