# verifier

이 Mac에서 도는 01-software verifier(`local.01-software.verifier-loop`)의 현황을 Paseo 사이드바와 화면으로 보여 주는 플러그인입니다. **Paseo SDK 0.13.0 · 플러그인 0.1.0** 기준이며, 지원 범위는 `>=0.13.0`입니다.

verifier가 설치된 기기에서만 의미가 있어서 [기본 설치 목록](../README.md#기본-설치-목록)에는 넣지 않습니다. 필요한 기기에만 따로 설치합니다.

## 설치·업데이트

```sh
paseo plugin install github:01-works/paseo-plugin:verifier
paseo plugin update verifier
```

설치하면 사이드바 아래쪽에 **Verifier** 행이 생깁니다. 행을 누르면 상세 화면이 열립니다.

## 사용

- **사이드바 행:** 상태 점과 한 줄 요약입니다. 우선순위는 `LaunchAgent 꺼짐` → `실행 중 n/전체`(실패 lane이 있으면 노란색) 또는 `lock 대기` → `연기 · 사유` → `실패 N연속` → `대기 · 통과`입니다.
- **지금 실행:** SHA, 시작 시각, 경과 시간, 예상 종료(최근 10회 실행 시간의 중앙값 기준), lane별 통과·실패·진행·대기와 걸린 시간입니다.
- **실행 연기:** 마지막 실제 실행 뒤 preflight가 실행을 미룬 횟수와 사유입니다. 예: `disk low-space 9.7GiB`.
- **디스크:** verifier preflight와 같은 `df -Pk <verifier checkout>` 여유 공간과 실행 최소 기준입니다. 기준은 최근 preflight 기록에서 읽고, 없으면 10 GiB를 씁니다. 기준의 1.5배 아래면 노란색, 기준 아래면 빨간색입니다.
- **승격:** main·dev 끝, dev가 main보다 앞선 커밋 수, dev 끝의 검증 상태, main에 아직 없는 마지막 verifier 통과 SHA(후보)입니다. 마이그레이션 여부와 승격 절차는 판단하지 않습니다.
- **최근 실행:** 마지막 통과 SHA와 그 뒤의 연속 실패 수, 최근 10회의 결과·시간·실패 lane입니다.
- **새로고침:** 로컬 상태를 바로 다시 읽고, GitHub 정보는 30초 넘게 지났으면 다시 읽습니다.

## 읽는 것과 부하

읽기 전용입니다. verifier를 실행·중단하거나 lock·로그·Docker를 건드리지 않습니다.

| 출처 | 내용 |
|---|---|
| `launchctl print gui/<uid>/local.01-software.verifier-loop` | 로드·실행 여부, 누적 실행 수, 확인 간격 |
| `~/.local/state/verifier/logs/01-software-summary.log` 끝 512 KiB | 실행별 결과·시간·preflight |
| 같은 폴더의 `01-software-run-*.log` | 지금 실행의 lane 진행, 실패한 실행의 실패 lane |
| `df -Pk ~/.local/share/01-software-verifier` | 디스크 여유 |
| `gh api` (화면이 열려 있을 때만) | dev·main 끝과 비교 결과. 저장소는 verifier checkout의 origin에서 읽습니다 |

사이드바 행이나 화면이 보일 때만 30초마다 읽습니다. 서버는 로컬 결과를 5초, GitHub 결과를 10분 캐시합니다. GitHub 조회는 한 번에 `gh api` 4회이고, 실패하면 마지막 값과 오류를 함께 보여 줍니다. 상세 lane 출력(`*-lanes.log`)은 읽지 않습니다.

경로는 환경 변수 `VERIFIER_STATE_DIR`, `VERIFIER_CHECKOUT`, `VERIFIER_LAUNCH_LABEL`, `VERIFIER_PROJECT`로 바꿀 수 있습니다. Paseo 데몬 프로세스의 환경에서 읽습니다.

첫 응답과 읽기 문제의 변화는 `paseo plugin logs verifier`에 남습니다.

## 한계

- 로그 형식은 01-software의 `scripts/release/verifier-loop.mjs`와 `nightly-local-check.mjs`에 맞춰 읽습니다. 형식이 바뀌면 해당 항목이 비거나 `읽기 경고`에 나타납니다.
- 알림을 보내지 않습니다. verifier 정지 감시는 01-software #8501(dead-man's switch)이 맡습니다.
- 예상 종료는 최근 실행 시간의 중앙값일 뿐이라, DB lane이 느린 날에는 늦어질 수 있습니다.

## 개발·검증

```sh
cd verifier
npm ci
npm run typecheck
npm test
npm run audit
```

로컬 소스로 설치해 확인할 때는 `paseo plugin install "$PWD"`, 수정 뒤에는 `paseo plugin reload verifier`를 씁니다.
