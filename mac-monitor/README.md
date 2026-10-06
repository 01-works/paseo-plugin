# mac-monitor

macOS 전용 Paseo 시스템 모니터 플러그인입니다. CPU·메모리·OS 메모리 압력·스왑과
SSD 용량·앱 그룹별 CPU/메모리 상위 10개를 보여줍니다. 지속 압력의 Luna 리뷰와 허용한 worker의 자동 관리도 제공합니다.
Paseo 0.10.2 API를 사용하며 `paseo-top`과 독립적입니다.

## 설치·업데이트·제거

사용할 Mac의 Paseo 데몬에서 플러그인 사용이 활성화되어 있어야 합니다.
Paseo 0.10.2에서 검증했으며, 다른 버전의 호환성은 별도 확인이 필요합니다.

```sh
paseo plugin install github:01-works/paseo-plugin:mac-monitor
paseo plugin ls mac-monitor
paseo plugin logs mac-monitor
```

Git 설치의 업데이트는 다음 명령을 사용합니다.

```sh
paseo plugin update mac-monitor
paseo plugin logs mac-monitor
```

기존 로컬 설치를 Git 설치로 바꾸려면 먼저 `paseo plugin remove mac-monitor`를 실행한 뒤
위 설치 명령을 사용합니다. 로컬 소스 파일은 보존됩니다.

`bin/macmon-helper`는 ad-hoc 서명된 arm64/x86_64 universal 바이너리로 저장소에 포함됩니다.
로컬 디렉터리 설치는 manifest의 build를 실행하지 않습니다. 직접 다시 빌드하려면 `npm run build`를 사용합니다.
Git 소스 설치의 build는 CLT가 있으면 universal 바이너리를 다시 만들고, CLT가 없으면 prebuilt를 유지합니다.

소스를 수정하려면 저장소를 복제해 `mac-monitor/`에서 개발합니다. 개발·검증 환경은 Node 24입니다.

```sh
git clone https://github.com/01-works/paseo-plugin.git
cd paseo-plugin/mac-monitor
npm ci
npm run typecheck
npm test
paseo plugin install "$PWD"
```

로컬 소스를 업데이트한 뒤에는 플러그인만 reload합니다. 데몬 재시작은 필요하지 않습니다.

```sh
git pull
npm ci
npm run typecheck
npm test
paseo plugin reload mac-monitor
paseo plugin logs mac-monitor
```

```sh
paseo plugin disable mac-monitor
paseo plugin enable mac-monitor
paseo plugin remove mac-monitor
```

제거는 로컬 소스 저장소를 지우지 않으며 Git 설치의 관리 복사본은 삭제합니다.
실행 실패 시 생성된 로컬 빌드 캐시는
`$PASEO_HOME/mac-monitor/macmon-helper`(기본 `~/.paseo/mac-monitor/`)에 있을 수 있습니다.
다른 Mac에서도 해당 Mac의 데몬에 별도로 설치해야 합니다.
원격 관리 명령의 예시는 `paseo plugin install <소스> --host <해당 Mac 연결 주소>`입니다.

## 화면과 측정 주기

각 에이전트 composer의 pill은 `23% · 14.1G`(CPU / 사용 메모리)를 표시합니다.
`G`는 GiB의 축약입니다. Paseo 0.10.2의 pill 최대 폭 160px에 맞춰 전체 용량은 상세에 표시합니다.
pill을 누르면 데스크톱에서는 중앙 모달, compact 화면에서는 시트로 세부 메모리와 앱 상위 목록을 볼 수 있습니다.
상세는 기본 글자 크기로 CPU·메모리를 한 카드에 표시하며 메모리 구성·압력·캐시·스왑 사용량을 함께 보여줍니다.
스왑은 보조 수치로 표시합니다. 전체는 현재 할당된 공간이므로 화면에서는 사용량만 보여주며 상태 색은 메모리 압력을 따릅니다.
상위 앱은 이름·CPU·메모리를 한 행에 표시합니다. CPU/메모리 열 제목을 누르면 해당 기준의 상위 10개로 정렬하며 목록 내부에서 스크롤합니다. 앱 CPU는 소수 첫째 자리까지 표시하며 0보다 크고 0.1% 미만이면 `<0.1%`로 구분합니다.
열면 pill이 받은 시스템 값을 즉시 표시하고, 앱 목록만 초기 수집 결과를 기다립니다.
목록은 높이 320을 고정하여 최초 로딩·측정 중·결과 표시·오류에서도 같은 공간을 유지합니다.
열린 상세와 대시보드는 2초마다 캐시를 읽어 자동 갱신합니다. 화면 전체를 다시 열거나 스크롤 위치를 초기화하지 않습니다.
복사·수동 새로고침 버튼과 root/권한 제외 통계는 화면에서 제거했습니다. 연결 오류 때만 재시도 버튼을 제공합니다.
화면에는 수치·상태를 중심으로 표시하고 단위·계산 기준 설명은 이 문서에 둡니다.
CPU·디스크 바는 사용량 구간에 따라 색을 바꾸고, 메모리 바는 총 사용량 비율과 OS 압력 색을 표시합니다.
앱·와이어드·압축의 세부 수치는 메모리 바 아래에 표시합니다.
디스크는 사용량/전체 용량과 남은 공간을 표시하며 30초마다 갱신합니다.

앱 이름을 누르면 개별 프로세스 화면으로 전환합니다. 좌상단의 **‹ 뒤로** 옆에 앱 이름이 표시되며, 돌아오면 정렬 기준을 유지합니다.
개별 목록에는 이름·PID·CPU·메모리와 **종료** 버튼이 나옵니다.
대상을 선택하고 확인하면 해당 프로세스 하나에 SIGTERM을 보냅니다. 저장하지 않은 작업은 잃을 수 있습니다.
서버는 캐시의 그룹·PID·시작 시각을 확인하고, 헬퍼가 현재 소유자와 시작 시각을 다시 검사합니다.
root·다른 사용자·헬퍼 자신·Paseo 서버 및 그 상위 프로세스는 차단합니다. 강제 종료는 제공하지 않습니다.
상위 CPU·메모리 목록의 각 행에는 **전체 종료**도 있습니다. 확인 화면의 대상 개수·PID 목록을 보고 실행하면
그 목록에만 SIGTERM을 보냅니다. 같은 그룹의 다른 작업도 포함될 수 있습니다. 확인 후 새로 생성된 프로세스는 추가하지 않습니다.
compact 화면에서는 전체 종료 버튼을 다음 줄에 배치해 CPU·메모리 숫자의 공간을 확보합니다.
대상 PID·시작 시각이 서버 캐시와 다르면 요청 전체를 차단합니다. 실제 신호 전송에서 일부가 거절되면 성공 개수와 PID별 실패 사유를 표시합니다.
신호 전송 성공이 즉시 종료를 보장하지는 않으며 앱이 신호를 무시하거나 프로세스를 다시 실행할 수 있습니다.
PID 확인과 신호 전송 사이의 짧은 경합을 완전히 원자적으로 차단하는 API는 사용하지 않습니다.
실험적 fleet에서 다른 호스트의 행을 선택한 화면은 조회만 제공합니다. 종료하려면 공식 호스트 선택기로 전환합니다.

사이드바의 **Mac 모니터**에는 선택한 호스트 상세와 연결된 호스트의 작업 중/대기 에이전트 수가 나옵니다.

호스트별 플러그인 서버는 C 헬퍼 하나만 유지합니다. 헬퍼가 고정 2초 간격으로 샘플을 내보내며,
RPC는 캐시를 읽습니다. 여러 pill이나 RPC 요청이 측정 간격을 바꾸지 않습니다.
보이는 pill만 공유 타이머 하나로 갱신하며, 같은 라벨은 다시 업데이트하지 않습니다.
상세 모달·대시보드·개별 프로세스 목록의 2초 읽기는 화면을 닫으면 중단합니다. 포커스/재연결에 따른 추가 읽기는 없습니다.
앱 스캔을 막 켰다면 첫 CPU 기준점 다음 샘플을 위해 최초 읽기에서만 최대 두 주기(약 4.4초) 기다립니다.

앱 스캔은 세부 목록 요청 이후 30초 동안만 활성화됩니다. 다시 켠 첫 주기는 CPU 기준점이 없어
**측정 중**입니다. CLI 대조 도구는 플러그인과 별도의 헬퍼를 잠시 띄우므로 실행 중에는 헬퍼가 추가로 보입니다.

## 측정 기준·공식·단위

모든 용량은 **GiB = 1024³ bytes**, 소수 1자리입니다. 0보다 크고 0.1 GiB 미만인 값은 `<0.1 GiB`로 표시해 실제 0과 구분합니다.
Activity Monitor는 같은 이진 단위를 `GB`라고 표시합니다.

| 항목 | 기준 |
|---|---|
| 앱 메모리 | `(internal_page_count − purgeable_count) × host_page_size` |
| 와이어드 | `wire_count × host_page_size` |
| 압축 | `compressor_page_count × host_page_size` |
| 사용된 메모리 | `hw.memsize − (free_count − speculative_count + external_page_count) × host_page_size` |
| 캐시된 파일 | `(external_page_count + purgeable_count) × host_page_size` |
| 물리 메모리 | `sysctl hw.memsize` |
| CPU 전체 | `Δ(user + nice + system) / Δ전체 tick × 100`, 전 코어 합산 0~100% |
| 압력 | `kern.memorystatus_vm_pressure_level`: 1 정상 / 2 주의 / 4 위험 / 기타 확인 불가 |
| 가용 비율 | `kern.memorystatus_level`, 세부 참고값 |
| 스왑 | `vm.swapusage`의 used. total은 RPC·대조 CLI에서 제공 |
| 디스크 | Data 볼륨 `statfs`: 전체 `f_blocks × f_bsize`, 사용 `(f_blocks − f_bfree) × f_bsize`, 여유 `f_bavail × f_bsize` |
| 앱 그룹 메모리 | `proc_pid_rusage(RUSAGE_INFO_V4).ri_phys_footprint` 합계 |
| 앱 그룹 CPU | 같은 PID·시작 시각의 CPU 누적 차이를 timebase 변환 후 시간·코어 수로 나눔 |

`host_statistics64(HOST_VM_INFO64)`와 `host_statistics(HOST_CPU_LOAD_INFO)`를 사용합니다.
`os.freemem()`이나 압축 전 페이지 수는 사용하지 않습니다.
사용된 메모리는 이 Mac의 Activity Monitor 합계 식을 적용합니다. `free_count`에는 speculative이 포함되어
실제 빈 페이지로 보정합니다. 앱·와이어드·압축의 합과 총 사용량은 다를 수 있으며 캐시와 사용량도 일부 중첩합니다.
합계의 예약 영역 등을 세부 항목에 임의로 배분하지 않습니다. 메모리 바는 총 사용량/물리 메모리만 표시합니다.
Node 폴백은 `vm_stat`의 "Pages free"와 "Pages speculative"을 더해 Mach 카운터를 복원하고 같은 식을 씁니다.
필수 값 누락이나 유효하지 않은 계산은 확인 불가로 표시합니다.
가장 바깥 `.app` 번들 이름으로 그룹화하고, 그 밖의 실행 파일은 basename으로 표시합니다.
`/claude/versions/` 경로는 `claude`로 묶습니다. 앱 메모리 footprint에는 압축/스왑 분이 포함되어
그룹 합이 물리 RAM보다 클 수 있으므로 RAM 점유율로 환산하지 않습니다.

디스크는 `/System/Volumes/Data`가 공유하는 APFS 공간입니다. 파일별 크기를 합산하거나 SSD를 스캔하지 않습니다.
물리 SSD의 판매 용량과 같다고 해석하지 않으며 purgeable 공간·스냅샷 등의 처리 때문에 macOS 저장 공간 화면과 차이가 날 수 있습니다.

출처: [Apple statfs](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/statfs.2.html),
[Apple 메모리 용어](https://support.apple.com/guide/activity-monitor/actmntr1004/mac),
[Apple CPU 보기](https://support.apple.com/guide/activity-monitor/actmntr43452/mac),
[XNU VM 카운터](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/vm_statistics.h),
[XNU 압력 레벨](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_memorystatus_notify.c),
[Stats RAM 구현](https://github.com/exelban/stats/blob/master/Modules/RAM/readers.swift),
[htop Darwin 구현](https://github.com/htop-dev/htop/blob/main/darwin/Platform.c).
합계 식의 실행 파일 추적·원시 값 대조는 [메모리 합계 조사](docs/research/report-memory-accounting.md),
폴백의 빈 페이지 기준은 [Apple vm_stat 구현](https://github.com/apple-oss-distributions/system_cmds/blob/main/vm_stat/vm_stat.c#L126)에 있습니다.
API 호환성 기준은 [Paseo v0.10.2 플러그인 문서](https://github.com/getpaseo/paseo/blob/v0.10.2/public-docs/plugins/reference.md)와 설치된 0.10.2 타입입니다.
자세한 조사와 실측은 [docs/research](docs/research/)에 있습니다.

## 상태 표시

pill 상태 점과 메모리 바·압력 표시는 **OS 메모리 압력**을 기준으로 삼습니다.
RAM 사용률이나 스왑 양으로 위험 색을 부여하지 않습니다. CPU·디스크 바에는 사용량 강조 색을 별도로 적용합니다.
모든 색은 Paseo theme의 색 토큰을 사용하며 숫자와 문구도 함께 표시합니다.

| 바 | 기본 강조색 | 중간 강조 (`statusWarning`) | 높은 사용량 (`statusDanger`) |
|---|---|---|---|
| CPU | 50% 미만 | 50% 이상~80% 미만 | 80% 이상 |
| 디스크 사용량 | 85% 미만 | 85% 이상~95% 미만 | 95% 이상 |

이 구간은 화면에서 높은 사용량을 구분하기 위한 기준이며 OS 경고·온도·시스템 이상 판정이 아닙니다.
지연·오류·연결 실패 때는 이전 값의 색을 중립색으로 바꾸고 흐리게 표시합니다. 누락 값은 —로 유지합니다.

| 상태 | 표시 |
|---|---|
| 첫 CPU 기준점 없음 | 측정 중, CPU — |
| 성공 샘플 5초 이내 | 최신 값 + 압력 색 |
| 5초 초과~15초 | 이전 값 + 지연 + 마지막 시각, 흐린 색 |
| 15초 초과 또는 헬퍼 중단 | 이전 값이 있으면 유지 + 오류 + 마지막 시각 |
| 개별 API 실패 | 해당 값 — 또는 확인 불가, 원인 텍스트 |
| 압력 읽기 실패 | 압력 확인 불가, 회색 |
| macOS 이외 | macOS 전용 — 이 호스트는 미지원 |

prebuilt 실행 실패 → CLT 로컬 빌드 → Node 전용 모드 순으로 폴백합니다.
Node 모드도 2초 타이머가 CPU 차이와 `vm_stat`/`sysctl`을 수집하고, 앱 상위 목록은 미지원입니다.
헬퍼 중단 시 1초에서 최대 60초까지 지수 백오프하며, 종료 정리는 stdin EOF·SIGTERM·1초 후 SIGKILL을 사용합니다.

## 실험적 멀티호스트 집계

Paseo 0.10.2 공개 API에는 다른 호스트의 플러그인 RPC가 없습니다. 공식 모드에서는 Paseo의
호스트 선택기로 상세를 전환하고, 다른 호스트의 에이전트 수만 공식 SDK로 읽습니다.

추가로 호스트별 번들이 같은 JS realm에서 평가되는 비공식 동작을 이용하여 모든 호스트 지표를 집계합니다.
기본 설정 `experimentalFleet: true`이며, **Mac 모니터 대시보드의 “실험적 멀티호스트 집계” 버튼**으로 끌 수 있습니다.
설정은 해당 설치의 host scope에 저장됩니다. 선택된 설치에서 끄면 공식 모드만 사용합니다.
레지스트리 버전이 다르거나 여러 설치를 찾지 못하면 자동으로 공식 모드로 폴백하고 화면에 안내합니다.
집계는 대시보드가 보일 때 2초마다 읽으며 호스트별 single-flight, 응답 대기 3초 제한을 적용합니다.
Paseo 업데이트로 비공식 동작이 바뀔 수 있습니다. 관련 코드는 `client/fleet/`에 격리되어 있습니다.

## 선택적 메모리 자동 관리

신규 설치에서는 꺼져 있습니다. 상세의 **자동 관리**에서 켜거나 끌 수 있습니다.
기본은 OS 압력이 **위험(critical)으로 120초 지속**될 때만 조사합니다. 앱 footprint가 1 GiB 이상이고
약 60초 동안 `128 MiB`와 최초 사용량의 `10%` 중 큰 값 이상 증가하며 최근에도 증가해야 리뷰 후보가 됩니다.
정상 상태에서 추가 프로세스 스캔이나 AI 호출은 없으며 조건을 충족한 조사만 최대 150초 진행합니다.
상위 CPU·메모리 그룹에 포함된 최대 24개 프로세스를 관찰하므로 모든 프로세스의 누수를 탐지하는 기능은 아닙니다.

리뷰에는 로그인된 **Codex CLI**와 `gpt-6-luna`를 사용합니다. CLI 0.160.0에서 검증했습니다.
[비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode)의 읽기 전용·일회성 모드로 이름과 사용량/추세만 전송하며
전체 실행 경로·명령행·파일·작업 내용은 전송하지 않습니다. 셸·MCP·웹·앱·훅·서브에이전트·이미지/컴퓨터 제어는 사용하지 않습니다.
Codex 사용량 한도를 소비하며 모델 접근·로그인·CLI 옵션 지원에 실패하면 오류를 기록하고 종료하지 않습니다.
Luna의 normal/observe/terminate 결정은 보조 판단이며 정상적인 큰 작업과 메모리 누수를 확정할 수 없습니다.

처음에는 **허용 대상 0개로 리뷰만** 사용하는 것을 권합니다. 자동 종료가 필요하면 버려도 되는 독립 개발 worker를
상위 앱 → 개별 프로세스 → **자동 관리** → **허용**으로 지정하세요. Node/Python 전체나 앱 그룹 전체를 허용하지 않습니다.
PID·시작 시각·경로·그룹·이름이 같은 해당 실행 인스턴스만 허용되며 재실행된 PID에는 이어지지 않습니다.
확인 화면의 경로·이름을 서버에서 대조하며, 허용 도중 대상이 바뀌면 다시 선택해야 합니다.
앱 번들·시스템·브라우저·터미널·Paseo·Codex·Claude와 작업/보호 트리의 자식은 네이티브 검증에서 거절합니다.
완료 후 남은 독립 worker처럼 종료해도 작업 손실이 없는 대상을 선택하세요.

모델이 terminate를 제안해도 코드가 압력·최근 추세·최신 측정·대상의 현재 CPU 5% 미만(전체 코어 기준)·사용량·허용을 재검사합니다.
네이티브가 소유자·시작 시각·실행 경로·부모를 다시 확인한 뒤 **리뷰당 최대 1개에 SIGTERM**만 보냅니다.
한 번의 시도 전에 허용을 소비하므로 다음 시도는 직접 다시 지정해야 합니다. 자동 종료도 저장하지 않은 작업을 잃을 수 있습니다.
10초 후 해당 PID를 조회해 결과를 기록하며 강제 종료나 자동 재시도는 하지 않습니다.
플러그인이 먼저 종료되면 아직 확인하지 못한 결과를 기록합니다. 이미 시작한 조회는 완료한 결과를 남깁니다.

리뷰는 동시 1개·45초 제한, 15분 대기·24시간 최대 6회입니다. 실패도 횟수에 포함합니다.
가용 수준 3% 미만/미확인·CPU 85% 이상·디스크 여유 1 GiB 미만/미확인이면 조사/리뷰를 보류하고 진행 중 리뷰도 취소합니다.
상태와 최근 기록은 자동 관리 화면에서 볼 수 있으며 대상의 **허용 해제** 또는 전체 **꺼짐**으로 중지할 수 있습니다.
설정·허용·기록·호출 예산은 `$PASEO_HOME/mac-monitor/automation.json`(기본 `~/.paseo/mac-monitor/`, 권한 0600)에 저장합니다.
상세 로그는 같은 폴더의 **`automatic-actions.jsonl`**에 남깁니다. 대상 PID·시작 시각·경로, Luna 판단 근거,
전후 압력/메모리, 신호 전송과 실제 종료 확인을 구별해 기록합니다. 256 KiB마다 교체하며 이전 파일 `.1` 하나만 보관합니다.
리뷰·종료 사건이 있을 때만 쓰고, 종료 예정 기록을 저장하지 못하면 자동 조치를 멈춥니다.
`pressure`는 `critical`(기본)/`warning`, `sustainedSeconds`는 120(기본)/60~600을 지원합니다.
직접 파일을 수정할 때는 플러그인을 disable한 뒤 설정을 바꾸고 enable하세요. Paseo·Codex 전역 설정은 변경하지 않습니다.
플러그인 제거 뒤에도 전용 기록은 남을 수 있습니다. 필요하면 해당 설정·로그 파일만 직접 지우세요.

디스크는 기존 30초 용량 조회로 여유 2 GiB 미만일 때 **공간 부족**을 표시합니다.
공간 소비 주체·작업 저장 상태를 알 수 없어 디스크 부족으로 에이전트를 중단하거나 파일을 자동 삭제하지 않습니다.

## 부하와 검증

이 Mac(arm64 macOS 26.5.1, 16 GiB, 논리 10코어)에서 최종 헬퍼를 60초 관찰했습니다.
0.2.1의 상위 10개·개별 프로세스 경로·디스크 조회를 포함한 앱 스캔 활성 모드의 CPU 시간은 0.255661초,
**코어 하나의 약 0.426%**, RSS는 **4.50 MiB**였습니다. 전체 10코어 환산은 약 0.0426%입니다.
30개 샘플 간격은 1990.380~2009.616ms였고 디스크는 2회 읽었습니다.

`statfs` 500회 별도 실측은 평균 **0.571µs**, p95 0.667µs, 최대 2.250µs였습니다.
30초 간격의 용량 조회 비용은 이 관찰에서 매우 작았습니다. 부하가 0이라고 보장하지는 않습니다.
이 값은 C 헬퍼 자체 비용이며 Paseo·Node 서버·화면 렌더링은 포함하지 않습니다.
이전 0.1.1의 60초 앱 활성 관찰은 코어 하나의 약 0.264%, RSS 2.77 MiB였습니다.
실행 중인 프로세스 수와 작업량이 달라 두 관찰을 변경의 비용 증가율로 해석하지 않습니다.
이전 상위 5개 버전의 120초 관찰은 시스템 전용 0.104%, 앱 활성 0.346%였으며
시점·프로세스 수가 다른 측정이므로 성능 개선 비율로 비교하지 않습니다.
Node 폴백의 자체 부하는 이 구현에서 별도로 측정하지 않았습니다. 프로세스 수와 머신 부하에 따라 비용은 달라집니다.
가상 후보로 실제 Luna 리뷰를 한 번 검증한 시간은 약 **5.2초**였습니다. 검증 명령의 CPU 시간은 0.61초,
최대 단일 프로세스 RSS는 약 **104 MiB**였으며 동시 프로세스의 메모리 합계는 아닙니다.
리뷰 비용은 요청마다 달라질 수 있으므로 정상 압력에서는 실행하지 않고, 임계 상황에서도 호출 예산과 자원 여유를 확인합니다.
테스트·네이티브 스모크·로컬 설치/RPC·부하 측정 결과는 [docs/VALIDATION.md](docs/VALIDATION.md)에 있습니다.
0.2.1의 다각도 리뷰에서 재현한 자동 종료 경계와 수정 근거는 [docs/REVIEW.md](docs/REVIEW.md)에 있습니다.

개선 전 Activity Monitor 화면을 직접 대조했습니다. 앱·와이어드·압축·캐시·스왑은 가까운 두 관찰에서
항목별 0.02 GiB 미만의 차이를 보였지만, **총 사용량은 Activity Monitor가 약 0.56 GiB 더 높았습니다.**
후속 조사에서 이 Mac의 Activity Monitor 합계는 `물리 RAM − 실제 빈 페이지 − 파일 기반 페이지`로 확인했습니다.
0.1.1부터 해당 식을 적용하여 같은 원시 카운터의 차이를 해결합니다. 추가 측정 호출은 없습니다.
실행 파일 추적과 100회 원시 값 대조는 [합계 차이 조사](docs/research/report-memory-accounting.md)에 기록했습니다.
새 버전의 Activity Monitor 화면 대조는 사용자 대조가 필요하며 읽는 시각·갱신 간격에 따른 차이는 남습니다.
시각별 수치와 CPU 비교의 한계는 [검증 기록](docs/VALIDATION.md)에 남겼습니다.

```sh
npm run compare                 # Ctrl+C로 종료
npm run compare -- --samples=3   # CPU 샘플 3회 기록 후 종료
```

## 알려진 한계

- root 및 다른 사용자 프로세스 일부는 권한 때문에 상위 목록에서 제외됩니다. 제외 수는 RPC 데이터에 남기되 화면에서는 숨깁니다.
- 앱 CPU는 종료된 프로세스의 마지막 구간 및 새 프로세스의 첫 구간을 포함하지 못해 시스템 CPU 합계와 다를 수 있습니다.
- 합계 식은 macOS 26.5.1의 Activity Monitor에서 확인했습니다. 다른 OS 버전의 내부 합계·압력 그래프 기준은 같다고 보장하지 않습니다. 갱신 간격·읽는 시각·반올림도 차이를 만들 수 있습니다.
- 커밋된 헬퍼는 arm64·Intel macOS 26 CI에서 실행·스키마 검증을 통과했습니다. Intel의 실제 Paseo 설치·화면은 미검증입니다.
- 실제 Paseo 다크·라이트 화면과 두 에이전트 pill 동시 갱신을 확인했습니다. compact 실제 배치와 다른 Mac의 집계는 확인이 남아 있습니다.
- 서버 설치 경로는 0.10.2의 설치 설정에서 읽습니다. 다른 ID로 설치하는 `--id` 별칭은 지원하지 않습니다.
- ad-hoc 바이너리가 quarantine으로 차단되면 로컬 빌드/Node 폴백을 사용합니다.
