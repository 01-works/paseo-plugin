# agent-browser

현재 워크스페이스의 Paseo 에이전트를 최근순으로 찾아 대화로 이동하는 플러그인입니다. **Paseo SDK 0.11.1 · 플러그인 0.2.1** 기준이며, 지원 범위는 `>=0.10.2 <0.12.0`입니다.

## 설치·업데이트

Paseo 0.10.2~0.11.x의 데몬과 앱에서 플러그인 사용을 활성화한 뒤 설치합니다.

```sh
paseo plugin install github:01-works/paseo-plugin:agent-browser
paseo plugin update agent-browser
```

에이전트 입력창의 **에이전트 N** pill을 누릅니다. N은 현재 워크스페이스의 미보관 에이전트 수입니다.

비활성화·복귀는 `paseo plugin disable agent-browser`, `paseo plugin enable agent-browser`입니다. 제거는 `paseo plugin remove agent-browser`입니다.

## 사용

- **최근 목록:** 해당 워크스페이스의 미보관 에이전트만 표시합니다. 이름·상태·시각을 함께 보고, 현재 대화는 왼쪽 표시선과 `현재`로 구분합니다.
- **정렬:** 기본은 활동순입니다. `생성순`을 누르면 새로 만든 에이전트부터 표시합니다. 활동순은 `updatedAt`과 `createdAt` 중 최신 유효 시각이며, 이름·설정·상태 변경도 포함합니다. 마지막 메시지 시각과는 다를 수 있습니다.
- **검색:** 이름 또는 ID로 찾습니다. 결과가 하나일 때 Enter로 그 대화를 엽니다.
- **대화 이동:** 행을 누르면 해당 대화를 엽니다. 이미 열린 대화의 선택·포커스는 Paseo의 공개 navigation이 처리합니다.
- **ID 복사:** 행 오른쪽 복사 아이콘을 누르거나 행을 길게 누릅니다. 별도 우클릭 메뉴는 제공하지 않습니다.
- **대화 닫기:** 행의 ×를 누르고 대상 이름을 확인합니다. 보관함으로 이동하며, 실행 중인 작업과 연결된 하위 에이전트도 함께 닫힐 수 있습니다. 실패하면 목록을 유지하고 다시 시도할 수 있습니다.

검색·정렬·스크롤은 원래 대화별로 보존하며, reload·disable·앱 종료 때 초기화됩니다. 자동 갱신이 열린 창을 다시 만들지 않고 검색 중에도 목록 높이를 유지합니다. 별도 전체보기는 제공하지 않습니다.

기본 글자 크기와 Paseo 테마를 사용합니다. 아이콘·정렬 버튼에만 작은 호버 배경을 표시하고 행은 누름·키보드 포커스로 구분합니다. 좁은 화면의 아이콘은 44의 누름 영역을 갖습니다.

## 갱신·부하·한계

호스트의 기존 Paseo 연결을 사용하는 client 전용 플러그인입니다. 여러 pill·모달이 directory와 구독 하나를 공유하며 추가 서버·소켓·헬퍼·CLI 수집을 실행하지 않습니다.

처음에 200개씩 최대 10페이지를 읽고, 이벤트를 약 250ms 단위로 묶어 반영합니다. 정상 연결에서 목록을 반복 조회하지 않습니다. 보이는 뷰가 있을 때만 구독의 로컬 상태를 1초마다 확인하며 네트워크 요청을 보내지 않습니다. 목록은 FlatList로 가상화합니다.

상한은 선택한 호스트 전체의 미보관 에이전트 2,000개입니다. 상한·페이지 실패는 일부 결과로 표시하고, 연결이 끊기면 마지막 목록을 유지합니다. 오류·부분 결과에서 `다시 읽기`를 사용할 수 있습니다. 닫기를 확인할 때만 대상 조회와 보관 요청이 추가됩니다.

현재 호스트의 Paseo 등록 에이전트만 표시합니다. 다른 Mac을 합친 목록과 provider 내부에서만 생성된 하위 에이전트는 표시하지 않습니다. 상태는 색과 글자로 구분하며, `결과 확인`을 전체 작업의 성공으로 단정하지 않습니다.

동일한 목록 처리의 기존 2,000개 합성 자료 검증은 Node 중앙값 약 0.50ms·p95 0.70ms였습니다. 순수 처리 비용이며 전체 UI CPU·메모리·FPS 측정은 아닙니다. 0.11.1의 화면 등록·대화 이동과 기존 API 폴백은 자동 테스트로 확인합니다. 실제 0.11.1 앱 화면과 iPhone의 시트·키보드·길게 누르기·VoiceOver·Dynamic Type은 추가 확인이 필요합니다.

## 개발·검증

```sh
cd agent-browser
npm ci
npm run typecheck
npm test
npm run audit
paseo plugin install "$PWD"
# 로컬 소스 변경 후
paseo plugin reload agent-browser
```

`npm run bench`는 합성 자료의 목록 처리 비용을, `node --import tsx test/manual/live.mjs`는 로컬 데몬의 목록·구독을 읽기 전용으로 확인합니다. 테스트에는 제품 entry의 Hermes 컴파일, 구독 수명, 검색·정렬·복사·대화 이동·닫기 대상 검증과 portal 클릭 경계가 포함됩니다.

0.11.1에서는 공개 `addScreen`·`openScreen`을 사용합니다. 이 API가 없는 0.10.2 클라이언트에서는 `addSurface`·`openSurface`를 사용합니다. pill에는 여전히 navigation이 없어 경유 화면에서 `openAgent`를 호출합니다. API 기준은 [Paseo v0.11.1 플러그인 문서](https://github.com/getpaseo/paseo/blob/v0.11.1/public-docs/plugins/reference.md)입니다.

현재 설계는 [PLAN](docs/PLAN.md), 결정 이유는 [DECISIONS](docs/DECISIONS.md), 검증 결과는 [VALIDATION](docs/VALIDATION.md)에 있습니다. 이전 설계·실측 기록은 [이력](docs/history/VALIDATION.md)에 보존합니다.
