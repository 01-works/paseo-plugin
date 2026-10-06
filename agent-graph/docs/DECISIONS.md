# 구현 결정

2026-10-06, 0.1.0. 사용자의 구현 요청과 후속 그래프·ID 복사·시각 구성 요청을 반영했다. 최초 계획의 제안값 중 실제 API·화면으로 확정한 내용이다.

## 1. 전체 필터 update와 구독 한 개

0.10.2 서버의 [`session.ts`](https://github.com/getpaseo/paseo/blob/v0.10.2/packages/server/src/server/session.ts)에서 구독은 filter만 받아 시작하고, sort/page는 초기 목록 조회에만 적용한다.
[`agent-updates-service.ts`](https://github.com/getpaseo/paseo/blob/v0.10.2/packages/server/src/server/session/agent-updates/agent-updates-service.ts)의 발행은 초기 페이지 밖에서도 filter를 적용한다.
따라서 directory에 owned subscription 하나를 두고 이후 페이지는 구독 없이 읽는다. 실제 로컬 목록 296개를 2페이지로 읽었고 구독은 한 개였다.
200개 밖의 update·삭제는 자동 테스트로 검증했다. 각 pill에서 조회하거나 이벤트마다 전체 목록을 다시 받지 않는다.

초기·복구 페이지 조회 중의 update는 journal에 보관하고 마지막에 병합한다. 삭제는 tombstone으로 처리하며 오래된 응답으로 되살리지 않는다.
최대 2,000개 모델·10페이지·4,000개 journal을 넘기면 부분 결과로 표시한다. 수동 재시도 역시 single-flight다.

원시 데이터의 key는 호스트별 플러그인 인스턴스의 namespace와 ID를 조합한다. 뷰 상태·대화 이동에는 실제 UI host ID를 사용한다.
다른 호스트 인스턴스의 자료를 모으거나 연결하지 않는다.

## 2. 연결과 정리

`client.paseo`는 borrowed `PaseoApi`이며 연결 상태 API를 별도로 제공하지 않는다. 구독의 공개 `subscriptionId`가 null인지 로컬에서 확인한다.
뷰가 보일 때만 1초 타이머를 유지하며 네트워크 호출은 없다. 재연결 snapshot이 오면 기존 캐시를 유지하면서 페이지를 채운다.
구독 오류·초기 조회 실패는 마지막 구조/확인 불가로 표시한다. 연결 단절을 에이전트 완료·정상·0개 실행으로 바꾸지 않는다.
dispose는 조회를 취소하고 observer·timer·owned lease를 정리한다. borrowed Paseo 연결은 닫지 않는다. 재시도 release 중 dispose도 기다린다.

## 3. 그래프 배치 상한과 시각 구성

제안한 176×64는 두 줄 기본 글자와 상태가 좁아 **176×80**으로 확정했다. 간격은 가로 16, 세대 32, 바깥 24다.
관계선은 React Native View의 `left/top`으로 배치한다. 같은 부모의 겹치는 연결선을 하나의 가로 연결선으로 합쳐 불필요한 뷰와 진한 중첩을 줄인다.

최초 제안의 ‘펼친 노드 200개 이후 목록 전환’은 실제 209개 구조를 열자마자 목록으로 바꾸어 사용자 목적에 맞지 않았다.
**배치 좌표는 모델 상한 2,000개까지, 실제 노드 뷰는 viewport 주변에서 최대 200개**로 바꿨다. 2,000개 전체 펼침의 순수 모델·배치 중앙값은 약 2.65ms였다.
200개 초과 구조도 기본 그래프를 유지한다. 너무 넓은 직계 자손은 가로 스크롤이나 접이식 목록을 사용한다. force layout·노드 드래그·미니맵은 추가하지 않았다.

상태·제목은 topology signature에서 제외하므로 좌표가 변하지 않는다. 배율·관계 변경은 선택 노드 위치를 보정한다.
모달과 패널은 상태를 공유하되 스크롤을 각각 저장한다. 처음 패널을 열 때 실제 viewport가 측정된 뒤 현재 선택 노드를 중심으로 표시한다.

mac-monitor를 참고해 기본 글자 크기, 테마 기반 상태 점, 배경 카드, 작은 버튼, 8/12의 여백을 사용한다.
상세와 범위 선택은 카드로 구분하고, 반복 설명이나 애니메이션을 추가하지 않았다.

## 4. 모달 높이와 클릭

0.10.2의 `Modal.Content scrollable={false}`는 내부적으로 데스크톱 높이를 85%로 고정한다. 실제 큰 화면에서 과한 빈 공간이 생겼다.
모달은 기본 scrollable 설정으로 자연스러운 높이를 사용하고, 그래프 영역만 360(compact 300)으로 확보한다. 상세는 184(compact 168) 높이의 내부 스크롤이다.
패널에서는 그래프가 남은 영역을 채운다. 모달 헤더·compact 시트·Escape는 호스트가 담당한다.

mac-monitor와 같은 바깥 Pressable guard로 React portal의 클릭이 pill action을 재실행하지 않게 한다.
실제 모달과 React DOM portal 재현에서 노드·확대·ID 복사·본문 클릭 뒤 열린 상태와 배율이 유지됐다.

## 5. ID 복사와 범위

공개 `copyText` API로 선택한 에이전트의 실제 ID만 복사한다. 상세 카드 상단의 **ID 복사**는 키보드로도 접근 가능한 명시적 버튼이다.
노드·목록 행의 `onLongPress`도 같은 복사 경로를 사용한다. 성공·실패는 호스트 toast로 표시한다.
0.10.2에는 공개 context menu API가 없어 우클릭 메뉴는 넣지 않았다. DOM 이벤트나 클립보드 전역 접근으로 우회하지 않는다.

작업 제어·provider 내부 수집·타임라인 읽기·다른 호스트 설치는 추가하지 않았다. 로컬 설치와 검증만 수행하고 GitHub push는 하지 않는다.
