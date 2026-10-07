# 에이전트 탐색 구현 계획

최신 기준: **0.1.11 · 2026-10-07**. 사용자가 최근순 탐색으로 간소화한 뒤 목록에서 각 대화 닫기와 아이콘 호버 등 사용성 개선을 요청했다. Paseo의 기본 subagent 보기와 중복되는 구조 시각화는 제공하지 않고 최근 목록·검색·대화 이동·ID 복사·확인 후 닫기에 집중한다. 0.1.0~0.1.5의 그래프 계획은 이 범위로 대체하며, 이전 구현 이유는 [DECISIONS](DECISIONS.md)에 남긴다.

위치: `01-works/paseo-plugin/agent-graph/`. 기존 설치 ID `agent-graph`와 pill ID `graph`는 업데이트 호환을 위해 유지한다. 전체보기 작업 탭과 Command Center 항목은 제거한다. 화면 이름은 `에이전트`다.

## 1. 사용자 흐름

1. 현재 대화의 `에이전트 N` pill을 누른다.
2. 현재 워크스페이스의 미보관 에이전트를 최근 활동순으로 본다. 이름·상태·시각과 현재 대화 표시를 한 행에 둔다.
3. 이름·ID 검색 또는 생성순 전환으로 대상을 찾는다.
4. 행을 눌러 그 대화로 이동하거나 오른쪽 아이콘·길게 누르기로 실제 ID만 복사한다.
5. 목록이 길면 pill 안에서 스크롤하거나 이름·ID 검색으로 찾는다. 별도 전체보기 화면은 제공하지 않는다.
6. 대화를 닫으려면 해당 행의 ×를 누른다. 대상 이름과 보관·하위 에이전트 영향 안내를 확인한 뒤 실행한다. 취소하면 검색·정렬·스크롤을 그대로 유지한다.

그래프·구조 탭·관계 상세·접기·배율·드래그·핀치·D3 계산은 제거한다. 에이전트 생성·설정 변경·메시지 전송·권한 승인은 제공하지 않는다. 다른 호스트 자료를 합치거나 provider 내부 하위 에이전트를 수집하지 않는다.

## 2. 화면과 상태

- 기본 폰트와 `theme.colors`를 사용한다. 제품 client는 RN 기본 요소와 Paseo의 Icon/Modal/FlatList/TextInput만 사용한다. DOM·HTML·Canvas·SVG·전역 clipboard·미공개 라우터는 사용하지 않는다.
- 안쪽 여백 12, 가까운 요소 간격 4/8, 구역 간격 12/16을 사용한다. 검색·개수·행 제목의 왼쪽 끝선을 맞추고, 현재 표시선은 행 너비를 차지하지 않는다.
- 데스크톱 버튼은 최소 32, compact 버튼은 최소 44의 누름 영역을 사용한다. 행은 80 높이이며 이름은 최대 두 줄, 복사와 닫기는 행 이동과 별도 영역이다. compact의 오늘 항목은 시간, 그 외는 날짜만 표시하고 전체 시각은 접근성 이름에 유지한다.
- 아이콘·정렬 버튼의 호버·누름은 옅은 배경, 포커스는 테마 테두리로 표시한다. 정렬 라벨은 mac-monitor처럼 좌우 여백 4·상하 6·모서리 4이며 선택한 항목은 기본 글자색과 굵기로 구분한다. 닫기 아이콘은 평소에는 중립색이고 호버·포커스 때 위험 색을 쓴다. 테두리 공간을 미리 확보하여 레이아웃을 유지하고, 검색은 바깥 테두리 하나로 포커스를 표시한다. 비활성화된 도구에는 호버·포커스 강조를 남기지 않는다.
- 행은 누를 때만 배경을 표시하며 호버로 큰 영역을 채우지 않는다. 키보드 포커스 테두리와 현재 대화 표시는 유지한다. 행 이동 영역에는 바깥 여백 4를 두고 안쪽 좌우 8·상하 4·모서리 4를 적용한다. 행 이동 영역과 아이콘 그룹 사이에는 8, 아이콘 사이에는 4를 둔다. 구분선까지 누름 배경을 채우거나 글자를 왼쪽 경계에 붙이지 않는다.
- 데스크톱은 자연스러운 높이의 모달을 쓰고 목록 높이는 검색 전 개수 기준 160~400이다. 검색 결과가 줄어도 창 높이가 변하지 않는다. 검색창은 전체 너비를 사용하고 compact 목록은 남은 높이를 채운다.
- 검색·정렬은 host/workspace/originAgent별 메모리 상태로 유지한다. pill 모달의 스크롤 오프셋을 저장한다. reload·disable·앱 종료 때 초기화된다.
- 갱신 때문에 모달을 다시 만들거나 스크롤을 초기화하지 않는다. portal 본문 클릭이 바깥 pill action을 실행하지 않도록 Pressable 경계를 유지한다.
- 상태는 색과 텍스트로 구분한다. `closed`·현재 오류·provider 사용 불가·permission·running·initializing·현재 finished attention·idle 순으로 해석한다. 과거 오류/attention과 연결 단절을 작업 실패·완료로 단정하지 않는다.

## 3. 정렬과 이동

목록 범위는 정확한 workspace ID 일치와 미보관 조건이다. 다른 workspace의 조상·자손도 포함하지 않는다. 부모 label은 제품 모델에서 더 이상 계산하지 않는다.

기본 활동순은 유효한 `updatedAt`과 `createdAt` 중 최신 시각이다. 생성순은 `createdAt` 기준이다. 동률은 생성시각·ID로 안정적으로 정렬하고, 잘못된 시각은 현재 시각으로 만들지 않는다. `updatedAt`은 설정·이름·상태 변경도 포함하며 타임라인의 마지막 메시지 시각이라고 주장하지 않는다.

Paseo 0.10.2 pill props에는 navigation이 없다. 인스턴스 내부에 host/workspace/origin/target을 저장하고 공개 `agent-browser` surface를 열어 `navigation.openAgent({agentId, serverId})`를 한 번 호출한다. 이 surface는 대화 이동만 수행하며 별도 에이전트 목록을 표시하지 않는다. private router·globalThis·새 소켓·RPC를 추가하지 않는다.

클릭 시점과 전달 시점에 대상의 삭제·보관·workspace 이동과 host 불일치를 확인한다. 새 렌더링이나 화면 재방문이 과거 이동 요청을 반복하지 않게 한다. 대화 이동을 지원하지 않는 앱은 경유 화면에서 오류를 알린다. pill의 ID 복사는 유지한다. 이동 경유 화면을 열지 못하면 현재 pill 모달·검색·정렬을 유지하고 오류를 알린다.

닫기는 공개 `agents.ref(id).refresh()`로 ID·workspace·미보관 조건을 다시 확인한 뒤 `archive()`를 호출한다. 확인 중 대상이 바뀌거나 연결이 끊기면 차단한다. API는 대화를 보관하고 실행 중인 세션을 닫으며 연결된 하위 에이전트도 함께 보관할 수 있다. 이 범위를 확인 창에 표시하고 하위 에이전트의 처리는 Paseo에 맡긴다. 비공개 탭 닫기 API를 사용하지 않는다. 같은 대상 요청은 호스트 directory에서 합치며 성공 응답 후에만 목록에서 제거한다. 실패 시 재시도를 허용하고 늦은 페이지가 닫힌 대화를 되살리지 않도록 기존 delta 처리를 유지한다.

## 4. 공유 구독·수명·부하

client 전용 플러그인이며 SDK와 manifest는 `0.10.2`, `>=0.10.2 <0.11.0`을 유지한다. 기존 `client.paseo`를 빌려 사용하고 그 연결 자체를 닫지 않는다.

호스트별 인스턴스에서 여러 pill·모달이 directory와 owned subscription 하나를 공유한다. 최초 200개씩 최대 10페이지/2,000개를 읽는다. 0.10.2 서버의 구독 update는 전체 filter를 대상으로 하므로 추가 페이지는 구독 없이 조회한다. 정상 상태의 반복 목록 폴링은 없다.

이벤트 알림은 250ms 단위로 묶고 같은 표시값이면 생략한다. 업데이트 시각 변경은 최근순에 반영한다. 뷰가 보일 때만 로컬 lease의 subscriptionId를 1초마다 확인하며 네트워크 요청을 보내지 않는다.

페이지 조회와 update/remove 경합, 오래된 세대 응답, 재연결 snapshot, 상한 초과를 처리한다. partial/stale/error를 정상 전체 결과로 만들지 않고 마지막 목록을 유지한다. 오류·부분 결과의 수동 재시도는 single-flight다.

unload/disable 때 조회 취소·timer·observer·owned lease를 정리한다. dispose 뒤 늦게 받은 lease도 release한다. 그래프 관계 모델·좌표 캐시·배치 타이머와 D3 런타임 의존성은 제거한다.

## 5. 파일 구조

```text
agent-graph/
├── index.client.tsx
├── paseo-plugin.json
├── package.json
├── README.md
├── client/
│   ├── directory.ts / normalize.ts
│   ├── view-state.ts / navigation.ts
│   ├── pill.tsx / modal.tsx / surface.tsx
│   └── content.tsx / browser.tsx / controls.tsx / spacing.ts
├── shared/
│   └── types.ts / browser.ts
├── test/
│   ├── normalize.test.ts / browser.test.ts / directory.test.ts
│   ├── actions.test.ts
│   ├── interaction.test.tsx / portal.test.mjs / client-bundle.test.mjs
│   └── manual/
└── docs/
    └── PLAN.md / REFERENCES.md / DECISIONS.md / VALIDATION.md
```

## 6. 검증과 완료 기준

- 타입 검사와 client DOM/HTML·기본 폰트 audit, 차이 공백 검사 통과.
- 현재 workspace·archive 필터, 정렬·검색·오류·시각과 상태 정규화 검증.
- 공유 구독·2,000 상한·페이지 경합·단절·재연결·취소·lease 정리 검증.
- pill 클릭·portal 경계·복사와 이동 분리·검색 Enter·이동 화면 열기 실패·스크롤/상태 보존 검증.
- 공개 navigation의 host/ID·한 번 실행·잘못된 대상 차단 검증.
- 닫기 대상의 재검증·중복 요청·조회/보관 실패·늦은 페이지 경합, 확인·취소의 상태 유지와 portal 클릭 경계 검증. 실제 사용자 대화는 검증 과정에서 닫지 않는다.
- 제품 entry와 실제 설치 bundle의 Hermes 컴파일 통과.
- 실제 Paseo 데스크톱에서 검색·ID 붙여넣기·기존 대화 탭 focus·전체보기 제거 확인.
- 합성 자료의 라이트/다크·320/390px 목록과 갱신 전후 스크롤 확인. 미리보기를 실제 iPhone 검증으로 주장하지 않기.
- agent-graph만 로컬 reload하고 로그와 running 확인. 데몬 재시작, mac-monitor 변경, 원격 호스트 설치·GitHub push는 하지 않기.

실제 iPhone의 시트·키보드·길게 누르기·VoiceOver·Dynamic Type과 0.11 이상 지원은 미검증 항목으로 남긴다. 구체적인 결과와 범위는 [VALIDATION](VALIDATION.md)에 기록한다.
