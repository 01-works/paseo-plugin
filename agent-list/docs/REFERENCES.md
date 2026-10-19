# agent-list 레퍼런스

개발 기준은 `@getpaseo/plugin`·`@getpaseo/client` **0.12.0**입니다. 0.12.0의 plugin client 타입은 0.11.1과 같으며, 0.11.1 문서를 화면 API 기준으로 함께 사용합니다. 0.10.2 문서는 이전 화면 API의 호환 경로를 확인할 때 사용합니다.

- [Paseo 0.11.1 플러그인 API](https://github.com/getpaseo/paseo/blob/v0.11.1/public-docs/plugins/reference.md): screen·composer pill·공개 navigation·수명주기·React Native 요소.
- [Paseo 0.11.1 배포](https://github.com/getpaseo/paseo/blob/v0.11.1/public-docs/plugins/publishing.md): Git 저장소 하위 경로 설치와 manifest build.
- [Paseo 0.10.2 플러그인 API](https://github.com/getpaseo/paseo/blob/v0.10.2/public-docs/plugins/reference.md): surface API 호환 기준.
- [mac-monitor](../../mac-monitor/README.md): pill·모달·기본 글자 크기와 작은 정렬 버튼·간격의 참고 구현.
- [현재 SDK reference](https://paseo.sh/docs/sdk/reference.md), [현재 플러그인 reference](https://paseo.sh/docs/plugins/reference.md): 2026-10-10 확인. 정리는 기존 `agents.list`의 label 필터와 `ref().refresh()`·`archive()`, 호스트 `Modal`·`FlatList`를 사용합니다. 설치된 0.11.1에서 label 필터와 전체 번들을 별도로 검증했습니다.

최초 커뮤니티·그래프 라이브러리 조사는 [이력](history/REFERENCES.md)에 보존합니다.
