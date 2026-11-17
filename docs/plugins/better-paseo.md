# Better Paseo 사용 안내

Better Paseo는 Paseo의 채팅 화면을 다시 그리고 호스트 전체 에이전트를 한 보드에 모으는 [RoundRedDot의 커뮤니티 플러그인](https://paseo.sh/plugins/roundreddot/better-paseo)입니다.
이 저장소의 [기본 설치 목록](../../README.md#기본-설치-목록)에 포함되며, 이전의 자체 플러그인 agent-list를 대체합니다.

| 항목 | 값 |
|---|---|
| 공식 목록·설치 식별자 | `roundreddot/better-paseo` |
| 관리 ID | `better-paseo` |
| 배포 형태 | 레지스트리가 검토한 Git 커밋 (`paseo plugin update --check`의 `target.commit`) |
| 제작자 저장소 | [RoundRedDot/better-paseo](https://github.com/RoundRedDot/better-paseo) (MIT) |
| 문서 확인 기준 | 2026-11-17, 레지스트리 검토 커밋 `d4c85cc` (package.json 1.6.1) |
| 최소 Paseo 버전 | `>=0.14.0` (해당 커밋의 manifest) |

## 기능

- **채팅 타임라인:** 도구 호출·추론·답변·체크리스트·오류를 접힌 한 줄로 보여 줍니다. 셸 명령과 MCP 서비스별 아이콘, Shiki 하이라이트, Mermaid 렌더링, 블록 상세 패널을 제공합니다.
- **Tasks 보드:** 호스트의 모든 에이전트를 대기·실행·검토·완료·보관 칸으로 나눕니다. 카드에서 열기·Stop·읽음 처리·보관·권한 Allow/Deny를 할 수 있고, 검색·필터와 수동 또는 모델 생성 제목을 지원합니다.
- **기기별 레이아웃:** 폰·패드·데스크톱 레이아웃이 따로 있습니다. 설정은 데몬에 저장되어 같은 호스트의 앱끼리 공유합니다.

agent-list에 있던 이어진 대화 묶기, 오래된 대화 일괄 정리, 작업 이름 정리는 없습니다.
정리는 bootstrap의 `yw-paseo-cleanup` 스킬을 씁니다.

## 설치와 관리

```sh
paseo plugin add roundreddot/better-paseo
paseo plugin ls
```

설치 때 데몬에서 `npm ci --omit=dev`와 클라이언트 빌드(`scripts/build-client.mjs`)가 실행됩니다.
bootstrap 기기는 `agents/paseo-plugins.json`의 검토 커밋으로 맞추므로 직접 설치하지 않습니다.
`paseo plugin remove better-paseo`는 데몬에 저장된 설정도 지웁니다.

## 데이터 흐름 (d4c85cc 소스 기준)

- **외부 통신:** 업데이트 확인으로 `plugins.paseo.sh`의 레지스트리 정보와 제작자 assets 저장소(`raw.githubusercontent.com/RoundRedDot/better-paseo-assets`)의 버전·릴리스 노트를 읽습니다. provider CLI 업데이트 확인은 npm registry의 dist-tags를 읽습니다.
- **터미널 열기:** 업데이트 명령을 macOS 터미널의 zsh 입력줄에 넣기만 하고 실행하지 않습니다(`osascript`).
- **파일:** 데스크톱의 파일 링크는 시스템 기본 앱이나 편집기로 열거나 Finder에서 보여 줍니다. 이미지 미리보기는 확장자 허용 목록과 3 MB 제한 안에서 데몬 디스크의 이미지를 읽습니다.
- **권한:** 권한 요청을 자동 승인하지 않습니다. 보드의 Allow/Deny는 사용자가 누를 때만 응답합니다.
- **사용량 기록:** 최근 턴의 시간·토큰·오류를 데몬의 플러그인 데이터에 남기고, 실행 중 토큰 수를 위해 provider 세션 파일을 읽습니다.

### 제목 생성

제목 생성은 이 호스트의 provider로 실제 Paseo 에이전트(helper)를 잠깐 만들어 실행합니다. 별도 API 키나 외부 서버는 쓰지 않고, 사용량은 그 provider 계정에서 나갑니다.

- helper는 플러그인 데이터의 `title-helper` 폴더에 임시 workspace를 만들어 실행하고, 끝나면 workspace를 보관하고 helper를 지웁니다. 원래 프로젝트의 설정 스크립트와 지침 파일은 읽지 않습니다.
- 수동 생성은 첫 라운드와 최근 4라운드의 사용자·에이전트 메시지(각각 4000자·2000자까지)를 보냅니다. 자동 생성은 첫 프롬프트 1000자만 보냅니다. 도구 결과는 보내지 않습니다.
- 시스템 프롬프트로 도구 사용을 금지하지만 권한 모드는 지정하지 않습니다. provider의 기본 권한으로 실행되므로 샌드박스가 아닙니다.

| 설정 | 기본값 | 의미 |
|---|---|---|
| 자동 생성 (`afterFirstReply`) | 꺼짐 | 켜면 첫 턴이 시작될 때 제목을 만듭니다 |
| 별도 모델 (`customModel`) | 꺼짐 | 꺼져 있으면 대상 에이전트와 같은 provider·모델을 씁니다 |
| 추론 끄기 (`disableThinking`) | 켜짐 | 모델이 지원하는 가장 낮은 추론 단계를 고릅니다 |

별도 모델을 꺼 두면 고성능 모델 대화의 제목도 같은 모델이 만듭니다.

**bootstrap 기기의 값:** 자동 생성 켬, 별도 모델 켬(Codex `gpt-6-luna`), 추론 끄기 켬. 이름 없이 시작한 대화의 제목을 첫 턴에 GPT-6-Luna의 가장 낮은 추론 단계(`low`)로 만듭니다. 이 값은 bootstrap의 [플러그인 설정](https://github.com/01-works/bootstrap/blob/main/agents/paseo.md#플러그인-설정)이 모든 기기에 맞추므로, 바꾸려면 앱이 아니라 bootstrap 목록을 고칩니다. 프롬프트처럼 목록에 없는 설정은 앱에서 바꿔도 유지됩니다.

## 제약

- 성능 수치는 제작자가 Paseo 0.13.0에서 잰 값이며 이후 버전에서 다시 재지 않았습니다.
- 키보드 단축키·호버 미리보기 등 일부 기능은 웹·데스크톱 전용입니다.
- 2026-11-17 확인 범위: 데몬 설치와 `running`, 데몬 로그의 오류 없음, 위 소스 검토, 설정 RPC로 위 제목 설정 저장. 앱 화면은 사용자가 데스크톱 앱에서 확인했습니다. GPT-6-Luna로 실제 제목이 생성되는지는 확인하지 않았습니다.

출처: [공식 소개 페이지](https://paseo.sh/plugins/roundreddot/better-paseo), [제작자 README](https://github.com/RoundRedDot/better-paseo#readme), 제작자 저장소의 `server/tasks/title-generation.ts`·`server/update-check.ts`·`server/open-terminal.ts`.
