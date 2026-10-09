# agent-browser 현재 설계

기준: **0.2.1 · Paseo SDK 0.11.1**. 설치·사용은 [README](../README.md), 변경 이유는
[DECISIONS](DECISIONS.md), 실제 검증 결과와 남은 항목은 [VALIDATION](VALIDATION.md)을 따릅니다.

## 구성과 데이터

- client 전용 플러그인입니다. manifest 지원 범위는 `>=0.10.2 <0.12.0`입니다.
- [entry](../index.client.tsx)는 `addScreen`·`openScreen`을 우선 사용합니다. 해당 API가 없는 0.10.2 앱에는 기존 surface API를 사용합니다. 새 API 호출 실패를 구 API로 재시도하지 않습니다.
- 호스트별 [directory](../client/directory.ts)를 여러 pill·모달이 공유합니다. Paseo의 기존 연결과 구독 하나를 사용하고, 플러그인이 만든 구독만 해제합니다.
- 최초 목록은 200개씩 최대 10페이지, 호스트 전체 미보관 에이전트 2,000개까지 읽습니다. 추가 페이지는 구독 없이 조회하며, 목록 표시 범위는 현재 workspace ID와 일치하는 항목입니다.
- 활동순은 유효한 `updatedAt`·`createdAt` 중 최신 값, 생성순은 `createdAt`입니다. 동률은 생성 시각·ID로 정렬하고, 잘못된 시각을 현재 시각으로 대체하지 않습니다.

## 이동과 닫기

pill에서 경유 화면을 열고 공개 `navigation.openAgent({agentId, serverId})`를 요청당 한 번 호출합니다.
[이동 상태](../client/navigation.ts)는 host·workspace·origin·target을 보관하며,
클릭과 전달 시점에 대상의 삭제·보관·workspace 변경·host 불일치를 확인합니다.
화면 열기 실패 시 원래 모달과 검색·정렬을 유지하고 오류를 표시합니다.

닫기는 확인 후 `agents.ref(id).refresh()`로 ID·workspace·미보관 조건을 다시 확인하고 `archive()`를 호출합니다.
실행 중인 세션과 연결된 하위 에이전트도 닫힐 수 있는 범위를 확인 창에 표시합니다.
동일 대상 요청은 합치고, 성공 응답 후 목록에서 제거합니다. 실패는 재시도할 수 있으며 늦은 페이지 응답이 닫힌 대화를 되살리지 않게 합니다.

## 상태와 수명

[뷰 상태](../client/view-state.ts)는 host·workspace·originAgent별 검색·정렬·스크롤을 메모리에 보관합니다.
목록 갱신은 모달을 다시 만들지 않으며, 검색 전 개수를 기준으로 목록 높이를 유지합니다.
클릭·복사·닫기는 독립된 조작 영역으로 처리하고 portal 본문 클릭이 바깥 pill을 다시 열지 않게 합니다.

이벤트는 250ms 단위로 모으고 표시값이 같으면 알림을 생략합니다. 정상 연결에서 반복 목록 조회는 없습니다.
보이는 뷰가 있을 때만 로컬 lease의 구독 ID를 1초마다 확인하며 네트워크 요청은 보내지 않습니다.
페이지와 이벤트의 경합·오래된 응답·재연결·상한 초과를 처리하고, partial·stale·error 상태에는 마지막 목록을 유지합니다.
수동 재시도는 하나의 요청으로 합칩니다. unload·disable 때 조회·타이머·observer·구독을 정리하며, 정리 뒤 늦게 받은 구독도 해제합니다.

## 검증

개발 명령은 [README](../README.md#개발검증)를 따릅니다. 자동 검증은 필터·정렬·오류·페이지 경합·구독 수명,
이동 대상과 중복 실행, 닫기 재검증·실패·취소, portal 경계·스크롤 보존과 Hermes 번들을 확인합니다.
화면 검증은 desktop·compact·테마·접근성을 별도로 확인하며, 미리보기를 실제 iPhone 검증으로 기록하지 않습니다.
