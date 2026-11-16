# verifier

01-software verifier(`local.01-software.verifier-loop`)의 현황을 Paseo 사이드바와 화면, 그리고 에이전트 도구로 보여 주는 플러그인입니다. **Paseo SDK 0.15.4 · 플러그인 0.4.0** 기준이며, 지원 범위는 `>=0.15.0`입니다.

verifier 기기에서는 로그를 직접 읽고, 다른 기기(작업 기기)에서는 verifier 기기의 읽기 전용 SSH로 읽습니다. verifier를 보는 기기에만 의미가 있어서 [기본 설치 목록](../README.md#기본-설치-목록)에는 넣지 않습니다. 필요한 기기에만 따로 설치합니다.

## 설치·업데이트

```sh
paseo plugin install github:01-works/paseo-plugin:verifier
paseo plugin update verifier
```

설치하면 사이드바 아래쪽에 **Verifier** 행이 생깁니다. 행을 누르면 상세 화면이 열립니다.

## 설정

**Settings → Verifier**(host별)에서 정합니다. verifier가 그 기기에서 돈다면 모두 비워 둡니다.

| 항목 | 내용 |
|---|---|
| 원격 verifier SSH 대상 | 다른 기기의 verifier를 읽을 때 쓰는 SSH 대상입니다. ssh config의 `Host` 이름을 권장합니다. 비우면 이 기기를 읽습니다 |
| 01-software clone 경로 | 커밋 제목과 GitHub 저장소를 읽을 clone입니다. 비우면 verifier checkout 기본 위치(`~/.local/share/01-software-verifier`)입니다. 작업 기기에서는 그 기기의 clone 경로를 넣습니다 |
| 에이전트에게 verifier_status 도구 제공 | 기본 켬. 아래 [에이전트 도구](#에이전트-도구) 참고 |

### 작업 기기에서 원격으로 보기

verifier 기기의 [bootstrap verifier role](https://github.com/01-works/bootstrap#verifier)이 만든 읽기 전용 SSH(`verifier-logs`)를 씁니다. 그 키로 접속하면 어떤 명령을 보내도 로그 폴더의 `ls`·`tail`·`cat`만 실행됩니다.

1. verifier 기기에서 작업 기기의 공개키를 등록합니다: `./bootstrap.sh role add verifier --ssh-key <공개키 파일>`
2. 작업 기기의 `~/.ssh/config`에 그 키를 쓰는 `Host`를 둡니다. 플러그인은 `ssh -o BatchMode=yes`로 접속하므로 비밀번호·확인 질문 없이 접속돼야 합니다.
3. 작업 기기에 이 플러그인을 설치하고, 설정에 그 `Host` 이름과 작업 기기의 01-software clone 경로를 넣습니다.

원격에서는 LaunchAgent 상태와 지금 디스크 여유, 기기 상태(`host: null`)를 읽을 수 없습니다. 지금 실행 여부는 요약에 아직 없는 최근 실행 로그(12시간 이내)로 판단하고, 디스크는 마지막 preflight 기록 값을 그 시각과 함께 보여 줍니다.

## 사용

- **사이드바 행:** 상태 점과 한 줄 요약입니다. 우선순위는 `LaunchAgent 꺼짐` → `실행 중 n/전체`(실패 lane이 있으면 노란색) 또는 `lock 대기` → `기기 점검 필요 · 항목` → `연기 · 사유` → `실패 N연속` → `대기 · 통과`입니다.

상세 화면은 상태 페이지(전체 상태 → 진행 중인 문제 → 기록)와 GitHub Actions·Buildkite 실행 화면(머리글 요약, 단계 진행 막대, 펼치면 상세)을 참고해 위에서 아래로 네 부분입니다.

### 1. 요약 (항상 보임)

- **전체 상태:** 상태 점과 한 줄입니다. 마지막으로 끝난 실행 기준으로 `통과 · b09aa18` 또는 `dev 실패 13시간째 · console-ci`(red 지속 시간과 실패 lane)입니다. red 지속 시간은 통과 뒤 처음 실패한 실행이 끝난 시각(`redSince`)부터 셉니다. LaunchAgent가 꺼져 있으면 `LaunchAgent 꺼짐`이 먼저입니다.
- **지금 실행:** SHA, lane 수만큼의 진행 막대(초록 통과·빨강 실패·파랑 진행·회색 대기), `n/전체`, 예상 종료입니다. heavy lock을 기다리는 중이면 `heavy lock 대기`만 보여 줍니다. 막대를 누르면 커밋 제목, 시작 시각과 경과, lane별 시간·평소 시간·시간 초과·진행 중 lane의 추정 경과가 펼쳐집니다.
  - 도는 lane의 경과 시간은 로그에 lane 시작 시각이 없어서 heavy lock을 잡은 시각에서 끝난 lane 시간을 빼서 냅니다. `failed (timed out) in Ns`로 끝난 lane은 `시간 초과`로 표시하고 그 시간도 계산에 넣습니다.
  - 예상 종료는 남은 lane의 평소 시간(최근 20회 중 통과한 lane 시간의 중앙값)을 더해 냅니다. 기록이 없는 lane이 있으면 최근 10회 전체 실행 시간의 중앙값으로 내고 `(전체 중앙값 기준)`으로 표시합니다.
- **승격 후보:** main에 아직 없는 마지막 verifier 통과 SHA와 main보다 앞선 커밋 수, dev 끝 SHA와 그 검증 상태(통과·검증 중·실패·아직 검증 안 됨), dev가 main보다 앞선 커밋 수를 한 줄로 보여 줍니다. GitHub 정보가 없으면 이 줄은 숨깁니다. 마이그레이션 여부와 승격 절차는 판단하지 않습니다.
- **새로고침:** 로컬 상태를 바로 다시 읽고, GitHub 정보는 30초 넘게 지났으면 다시 읽습니다. 기기 상태는 수동 새로고침에서도 별도의 60초 캐시를 따릅니다.

### 2. 확인할 것 (문제가 있을 때만)

항목이 없으면 `확인할 것 없음` 한 줄만 보입니다. 순서는 실패 → 기기 → 디스크 → 연기 → GitHub 조회 실패 → 읽기 경고입니다.

- **실패:** 지금 실행과 마지막으로 끝난 실행(실패일 때)의 실패를 signature별로 한 줄씩 묶습니다. lane, `N회 연속`/`이번에 처음`, 어느 실행에서 나왔는지, 처음 나온 SHA와 시각, 그 커밋 제목의 PR 링크, 연결된 red 이슈, verifier 분류(`classification`, `reason`, `signature` 앞 12자)를 보여 줍니다.
  - 같은 lane이 같은 signature로 연달아 실패한 횟수입니다. 그 lane이 통과했거나 다른 signature로 실패한 실행에서 연속이 끊기고, 최근 20회 안에서만 셉니다. 지금 실행이 마지막 실행의 실패를 이어 가면 큰 쪽(지금 실행) 횟수를 씁니다. 처음 나온 SHA가 원인이 들어온 범위의 끝입니다.
  - **red 이슈:** 01-software의 자동 red 이슈(라벨 `nightly-local-red`, 본문의 `<!-- nightly-red-signature:<64자 hex> -->`)를 signature로 맞춰 `#번호`를 링크합니다. 맞는 열린 이슈가 없으면 `없음`, 이슈 목록을 아직 못 읽었거나 조회에 실패했으면 `확인 안 됨`입니다.
  - 분류 줄이 없는 실패 lane은 `실패 분류 기록 없음`으로 따로 한 줄을 둡니다.
- **기기(로컬만):** swap **80% 이상**, `fseventsd` RSS **2 GiB 이상**, 남은 lane 컨테이너 **1개 이상** 중 기준을 넘은 것만 한 항목으로 모아, 컨테이너 이름과 수동 조치 안내(run 사이에 loop를 내리고, 남은 컨테이너를 지운 뒤 `sudo killall fseventsd`), 측정 시각을 함께 보여 줍니다. 플러그인은 조치를 실행하지 않습니다.
  - 컨테이너는 verifier 실행이 없고 실행 여부를 읽는 데 문제가 없을 때만 확인하며, 이름이 `console-<UUID>`(선택적 접미사 포함)이고 현재 가동 시간이 **2시간 초과**인 것만 셉니다. 생성 시각 대신 시작 시각을 써서 재시작한 컨테이너를 잘못 세지 않습니다. 실행 중에는 캐시에 있는 잔여 컨테이너 경고도 숨깁니다. 읽기 실패는 0으로 처리하지 않고 읽기 경고에 남깁니다.
- **디스크:** verifier preflight와 같은 `df -Pk <verifier checkout>` 여유 공간이 실행 최소 기준의 1.5배보다 적을 때 나옵니다(기준 아래면 빨간 점). 기준은 최근 preflight 기록에서 읽고, 없으면 10 GiB를 씁니다. 원격은 마지막 preflight 기록 값과 그 시각입니다.
- **실행 연기:** 마지막 실제 실행 뒤 preflight가 실행을 미룬 사유와 시작 시각, 횟수입니다. 예: `실행 연기 · disk low-space 9.7GiB`.
- **GitHub 조회 실패·red 이슈 조회 실패:** 마지막으로 읽은 값이 있으면 그 값을 계속 보여 줍니다. red 이슈 조회가 실패해도 승격 정보는 그대로입니다.
- **읽기 경고:** 로그·명령을 읽다 생긴 문제(`errors`)입니다. 로그 형식이 바뀌면 여기에 나타납니다.

### 3. 기록 (탭 하나만 펼침)

- **최근:** 요약 로그의 최근 30개 기록을 얇은 막대로 보여 줍니다(Uptime Kuma 방식). 초록은 통과, 빨강은 실패, 회색은 연기, 마지막 파랑은 지금 실행이고, 막대를 누르면 시각·SHA·시간이나 연기 사유가 나옵니다. 아래에 마지막 통과 SHA와 그 뒤의 연속 실패 수, 최근 10회 실행 목록이 있습니다. 목록 행은 ✓/✗, 시각, SHA, 시간, 실패 lane이고, 누르면 커밋 제목과 실패 분류(연결된 red 이슈 포함)가 펼쳐집니다.
- **lane 표:** lane을 행, 최근 20회 실행을 열(최근이 왼쪽)로 둔 표입니다(Apache Airflow Grid view 방식). 열 위 막대는 실행 전체 시간이고, 칸을 누르면 그 lane의 시간·평소 시간·커밋·실패 분류가 나옵니다. 칸은 걸린 분이며 실패는 빨강, 평소보다 1.5배 넘게(그리고 1분 넘게) 걸린 통과는 노랑입니다. 실패 lane은 다음 실행에서 앞으로 옮겨지므로 순서가 아니라 이름으로 맞춥니다.
- **통계:** 지금 red가 이어진 시간, 최근 24시간과 7일의 실행 수·통과·실패·성공률·실행 시간 중앙값·연기 횟수·가장 긴 red입니다. red는 통과 뒤 처음 실패한 실행이 끝난 시각부터 다음 통과가 끝난 시각까지로, 커밋 시각이 아니라 verifier가 관측한 시각 기준입니다. 경고가 없을 때도 기기 자원 값(swap·RSS·남은 컨테이너)과 측정 시각을 여기서 볼 수 있습니다.

### 4. 맨 아래 한 줄

작은 회색 글씨로 디스크 여유와 실행 최소 기준, 기준 시각만 보여 줍니다. LaunchAgent가 꺼지면 맨 위 상태 줄이 알립니다. 원격 모드는 원격 대상과 마지막 preflight 디스크 기록입니다.

화면에 설명 문장은 따로 두지 않습니다. 기기 점검 항목에만 조치 안내 한 줄을 붙입니다.

**링크:** SHA는 GitHub 커밋, 커밋 제목 끝의 `#번호`는 PR, red 이슈의 `#번호`는 이슈를 엽니다.

## 에이전트 도구

설정이 켜져 있으면 01-software 저장소(clone·worktree의 GitHub origin이 같은 저장소)에서 여는 에이전트 세션에 `verifier_status` 도구를 붙입니다. 다른 저장소의 에이전트에는 붙이지 않습니다.

- 지금 실행과 lane, 예상 종료, 연기 사유, 마지막 결과와 실패 분류·반복 여부, red 지속 시간, 24시간·7일 요약, 디스크와 기기 상태(`host:` 한 줄)를 짧은 텍스트로만 돌려줍니다. `includeGithub: true`면 승격 후보와 열린 red 이슈도 함께 읽고, 실패 줄 끝에 `red issue #번호`(맞는 이슈가 없으면 `no open red issue`)를 붙입니다. 구조화된 결과(structuredContent)는 보내지 않습니다. 보내면 Claude가 텍스트 대신 큰 JSON을 보여 줍니다.
- `host:`에는 swap·RSS·남은 컨테이너의 값, 경고, 측정 시각과 컨테이너 이름을 넣습니다. 원격 모드는 기기 상태를 읽을 수 없다고 표시합니다. 읽기 실패·실행 중이라 확인하지 않은 컨테이너는 미확인으로 표시합니다.
- 무거운 로컬 작업이나 push 전에 verifier가 heavy lock을 잡고 있는지, dev가 red인지 확인하는 용도입니다. 로그를 직접 읽는 셸 명령을 대신합니다.
- 플러그인을 설치·다시 불러오거나 이 설정을 바꾸면, 열린 에이전트 세션은 실행 중인 턴을 끊지 않고 다음 입력 전에 다시 열립니다(Paseo 동작).

## 읽는 것과 부하

읽기 전용입니다. verifier를 실행·중단하거나 lock·로그를 수정하지 않고, Docker 컨테이너를 생성·중단·삭제하지 않습니다.

| 출처 | 내용 |
|---|---|
| `launchctl print gui/<uid>/local.01-software.verifier-loop` | 로드·실행 여부, 누적 실행 수, 확인 간격 |
| `~/.local/state/verifier/logs/01-software-summary.log` 끝 1 MiB | 실행별 결과·시간·preflight, 기간 요약 |
| 같은 폴더의 `01-software-run-*.log` | 지금 실행의 lane 진행, 최근 20회의 lane 시간과 실패 분류 |
| `git show -s` (verifier checkout) | 커밋 제목 |
| `df -Pk ~/.local/share/01-software-verifier` | 디스크 여유 |
| `sysctl vm.swapusage` (로컬만) | swap 전체·사용량으로 사용률 계산 |
| `ps -axo rss=,comm=` (로컬만) | 이름이 `fseventsd`인 프로세스의 RSS 합계(KiB). 명령 인자 전체는 읽지 않습니다 |
| `docker ps --format` → `docker inspect --type container --format` (로컬만, verifier 실행 없음) | 실행 중 컨테이너의 ID·이름 목록에서 UUID lane만 고르고, 이름·가동 여부·시작 시각만 확인. 환경 변수 등은 읽지 않습니다. 명령이 없거나 실패하면 `null`과 읽기 경고 |
| `ssh -o BatchMode=yes <대상> ls·tail·cat` (원격 모드) | 위 로그 파일들. LaunchAgent·`df`·`sysctl`·`ps`·Docker는 읽지 않습니다 |
| `git -C <에이전트 작업 디렉터리> remote get-url origin` | 에이전트 도구를 붙일지 판단. 디렉터리별로 한 번 |
| `gh api` (화면이 열려 있을 때만) | dev·main 끝과 비교 결과. 저장소는 verifier checkout의 origin에서 읽습니다 |
| `gh issue list --label nightly-local-red --state open --json number,title,body --limit 200` (화면이 열려 있을 때만) | 열린 자동 red 이슈 본문의 signature marker → 이슈 번호. 실패해도 나머지 GitHub 정보는 그대로 보여 줍니다 |

사이드바 행이나 화면이 보일 때만 30초마다 읽습니다. 서버는 로컬 결과를 5초, 기기 자원과 잔여 컨테이너 확인을 각각 60초, GitHub 결과를 10분 캐시합니다. 기기 상태의 실패 결과도 60초 캐시하며, verifier 실행 중에는 Docker를 조회하지 않습니다. 경고 기준과 컨테이너 가동 시간 기준은 [`shared/host.ts`](shared/host.ts)의 `HOST_WARNING_THRESHOLDS`에 모아 두었습니다. bootstrap verifier 점검도 이 상수의 값과 단위를 기준으로 맞춥니다. 끝난 실행의 로그와 커밋 제목은 바뀌지 않으므로 플러그인 프로세스가 살아 있는 동안 한 번만 읽습니다(실측: 첫 수집 약 100ms, 이후 수 ms). GitHub 조회는 한 번에 `gh api` 4회와 `gh issue list` 1회이고, 실패하면 마지막 값과 오류를 함께 보여 줍니다. 상세 lane 출력(`*-lanes.log`)은 읽지 않습니다.

설정을 비워 두면 환경 변수 `VERIFIER_SSH_TARGET`, `VERIFIER_CHECKOUT`과 `VERIFIER_STATE_DIR`, `VERIFIER_LAUNCH_LABEL`, `VERIFIER_PROJECT`를 씁니다. Paseo 데몬 프로세스의 환경에서 읽습니다.

첫 응답과 읽기 문제의 변화는 `paseo plugin logs verifier`에 남습니다.

## 한계

- 로그 형식은 01-software의 `scripts/release/verifier-loop.mjs`와 `nightly-local-check.mjs`에 맞춰 읽습니다. 형식이 바뀌면 해당 항목이 비거나 `읽기 경고`에 나타납니다.
- 알림을 보내지 않습니다. verifier 정지 감시는 01-software #8501(dead-man's switch)이 맡습니다.
- 예상 종료와 lane 경과 시간은 추정값입니다. DB lane이 느린 날에는 늦어질 수 있습니다.
- 기간 요약은 요약 로그 끝 1 MiB(지금 기준 몇 주)만 읽습니다. 그보다 오래된 기록은 세지 않습니다.
- 커밋이 verifier checkout에 없으면 제목을 비워 둡니다.

## 개발·검증

```sh
cd verifier
npm ci
npm run typecheck
npm test
npm run audit
```

로컬 소스로 설치해 확인할 때는 `paseo plugin install "$PWD"`, 수정 뒤에는 `paseo plugin reload verifier`를 씁니다.
