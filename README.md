# mac-monitor

macOS 전용 Paseo 시스템 모니터 플러그인입니다. CPU·메모리·OS 메모리 압력·스왑과
SSD 용량·앱 그룹별 CPU/메모리 상위 10개를 보여줍니다. Paseo 0.10.2 API를 사용하며 `paseo-top`과 독립적입니다.

## 설치·업데이트·제거

로컬 Mac에 설치합니다. 현재 데몬의 `pluginsEnabled`는 이미 켜져 있습니다.

```sh
cd /Users/yw/dev/mac-monitor
npm ci
npm run typecheck
npm test
paseo plugin install /Users/yw/dev/mac-monitor
paseo plugin ls
paseo plugin logs mac-monitor
```

`bin/macmon-helper`는 ad-hoc 서명된 arm64/x86_64 universal 바이너리로 저장소에 포함됩니다.
로컬 디렉터리 설치는 manifest의 build를 실행하지 않습니다. 직접 다시 빌드하려면 `npm run build`를 사용합니다.
Git 소스 설치의 build는 CLT가 있으면 universal 바이너리를 다시 만들고, CLT가 없으면 prebuilt를 유지합니다.

업데이트 후에는 플러그인만 reload합니다. 데몬 재시작은 필요하지 않습니다.

```sh
git pull                    # 원격을 등록한 경우
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

제거는 로컬 소스 저장소를 지우지 않습니다. 실행 실패 시 생성된 로컬 빌드 캐시는
`$PASEO_HOME/mac-monitor/macmon-helper`(기본 `~/.paseo/mac-monitor/`)에 있을 수 있습니다.
다른 Mac에는 사용자 승인 후 각 Mac에서 소스를 복사하거나 Git 저장소를 설치하세요.
원격 관리 명령의 예시는 `paseo plugin install <소스> --host <해당 Mac 연결 주소>`입니다.
이 구현 작업에서는 다른 Mac을 설치하거나 조작하지 않았습니다.

## 화면과 측정 주기

각 에이전트 composer의 pill은 `23% · 14.1G`(CPU / 사용 메모리)를 표시합니다.
`G`는 GiB의 축약입니다. Paseo 0.10.2의 pill 최대 폭 160px에 맞춰 전체 용량은 상세에 표시합니다.
pill을 누르면 데스크톱에서는 중앙 모달, compact 화면에서는 시트로 세부 메모리와 앱 상위 목록을 볼 수 있습니다.
상세는 기본 글자 크기로 CPU·메모리를 한 카드에 표시하며 메모리 구성·압력·캐시·스왑을 함께 보여줍니다.
상위 앱은 이름·CPU·메모리를 한 행에 표시합니다. CPU/메모리 열 제목을 누르면 해당 기준의 상위 10개로 정렬하며 목록 내부에서 스크롤합니다. 앱 CPU는 소수 첫째 자리까지 표시하며 0보다 크고 0.1% 미만이면 `<0.1%`로 구분합니다.
열면 pill이 받은 시스템 값을 즉시 표시하고, 앱 목록만 초기 수집 결과를 기다립니다.
목록은 높이 320을 고정하여 최초 로딩·측정 중·결과 표시·오류에서도 같은 공간을 유지합니다.
열린 상세와 대시보드는 2초마다 캐시를 읽어 자동 갱신합니다. 화면 전체를 다시 열거나 스크롤 위치를 초기화하지 않습니다.
복사·수동 새로고침 버튼과 root/권한 제외 통계는 화면에서 제거했습니다. 연결 오류 때만 재시도 버튼을 제공합니다.
화면에는 수치·상태를 중심으로 표시하고 단위·계산 기준 설명은 이 문서에 둡니다.
막대는 테마 강조색과 중립색을 사용하며 사용률에 따라 정상·주의·위험 색으로 바뀌지 않습니다.
디스크는 사용량/전체 용량과 남은 공간을 표시하며 30초마다 갱신합니다.

앱 이름을 누르면 개별 프로세스의 이름·PID·CPU·메모리와 **종료** 버튼이 나옵니다.
대상을 선택하고 확인하면 해당 프로세스 하나에 SIGTERM을 보냅니다. 저장하지 않은 작업은 잃을 수 있습니다.
서버는 캐시의 그룹·PID·시작 시각을 확인하고, 헬퍼가 현재 소유자와 시작 시각을 다시 검사합니다.
root·다른 사용자·헬퍼 자신·Paseo 서버 및 그 상위 프로세스는 차단합니다. 강제 종료는 제공하지 않습니다.
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

모든 용량은 **GiB = 1024³ bytes**, 소수 1자리입니다. Activity Monitor는 같은 이진 단위를 `GB`라고 표시합니다.

| 항목 | 기준 |
|---|---|
| 앱 메모리 | `(internal_page_count − purgeable_count) × host_page_size` |
| 와이어드 | `wire_count × host_page_size` |
| 압축 | `compressor_page_count × host_page_size` |
| 사용된 메모리 | 앱 + 와이어드 + 압축 |
| 캐시된 파일 | `(external_page_count + purgeable_count) × host_page_size`, 사용량에서 제외 |
| 물리 메모리 | `sysctl hw.memsize` |
| CPU 전체 | `Δ(user + nice + system) / Δ전체 tick × 100`, 전 코어 합산 0~100% |
| 압력 | `kern.memorystatus_vm_pressure_level`: 1 정상 / 2 주의 / 4 위험 / 기타 확인 불가 |
| 가용 비율 | `kern.memorystatus_level`, 세부 참고값 |
| 스왑 | `vm.swapusage`의 used / total |
| 디스크 | Data 볼륨 `statfs`: 전체 `f_blocks × f_bsize`, 사용 `(f_blocks − f_bfree) × f_bsize`, 여유 `f_bavail × f_bsize` |
| 앱 그룹 메모리 | `proc_pid_rusage(RUSAGE_INFO_V4).ri_phys_footprint` 합계 |
| 앱 그룹 CPU | 같은 PID·시작 시각의 CPU 누적 차이를 timebase 변환 후 시간·코어 수로 나눔 |

`host_statistics64(HOST_VM_INFO64)`와 `host_statistics(HOST_CPU_LOAD_INFO)`를 사용합니다.
`os.freemem()`이나 압축 전 페이지 수는 사용하지 않습니다.
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
API 호환성 기준은 [Paseo v0.10.2 플러그인 문서](https://github.com/getpaseo/paseo/blob/v0.10.2/public-docs/plugins/reference.md)와 설치된 0.10.2 타입입니다.
자세한 조사와 실측은 [docs/research](docs/research/)에 있습니다.

## 상태 표시

색은 **OS 메모리 압력만** 기준으로 삼습니다. RAM 사용률이나 스왑 양으로 위험 색을 부여하지 않습니다.
모든 색은 Paseo theme의 색 토큰을 사용합니다.

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

## 부하와 검증

이 Mac(arm64 macOS 26.5.1, 16 GiB, 논리 10코어)에서 최종 헬퍼를 60초 관찰했습니다.
상위 10개·개별 프로세스 정보·디스크 조회를 포함한 앱 스캔 활성 모드의 CPU 시간은 0.066903초,
**코어 하나의 약 0.111%**, RSS는 **2.70 MiB**였습니다. 전체 10코어 환산은 약 0.0111%입니다.
30개 샘플 간격은 1991~2008ms였고 디스크는 2회 읽었습니다.

`statfs` 500회 별도 실측은 평균 **0.571µs**, p95 0.667µs, 최대 2.250µs였습니다.
30초 간격의 용량 조회 비용은 이 관찰에서 매우 작았습니다. 부하가 0이라고 보장하지는 않습니다.
이 값은 C 헬퍼 자체 비용이며 Paseo·Node 서버·화면 렌더링은 포함하지 않습니다.
이전 상위 5개 버전의 120초 관찰은 시스템 전용 0.104%, 앱 활성 0.346%였으며
시점·프로세스 수가 다른 측정이므로 성능 개선 비율로 비교하지 않습니다.
Node 폴백의 자체 부하는 이 구현에서 별도로 측정하지 않았습니다. 프로세스 수와 머신 부하에 따라 비용은 달라집니다.
테스트·네이티브 스모크·로컬 설치/RPC·부하 측정 결과는 [docs/VALIDATION.md](docs/VALIDATION.md)에 있습니다.

Activity Monitor 화면과의 직접 대조는 **사용자 대조 필요**입니다. “일치 확인”을 완료했다고 주장하지 않습니다.

```sh
npm run compare                 # Ctrl+C로 종료
npm run compare -- --samples=3   # CPU 샘플 3회 기록 후 종료
```

## 알려진 한계

- root 및 다른 사용자 프로세스 일부는 권한 때문에 상위 목록에서 제외됩니다. 제외 수는 RPC 데이터에 남기되 화면에서는 숨깁니다.
- 앱 CPU는 종료된 프로세스의 마지막 구간 및 새 프로세스의 첫 구간을 포함하지 못해 시스템 CPU 합계와 다를 수 있습니다.
- Activity Monitor 갱신 간격(기본 5초)·읽는 시각·반올림·압력 그래프의 내부 기준 때문에 차이가 날 수 있습니다.
- x86_64 슬라이스는 빌드·서명만 확인했고 실제 Intel/Rosetta 실행은 미검증입니다.
- 실제 Paseo 데스크톱 다크 화면을 확인했습니다. 라이트·compact 화면과 다른 Mac에서의 집계/폴백은 사용자 확인이 남아 있습니다.
- 서버 설치 경로는 0.10.2의 설치 설정에서 읽습니다. 다른 ID로 설치하는 `--id` 별칭은 지원하지 않습니다.
- ad-hoc 바이너리가 quarantine으로 차단되면 로컬 빌드/Node 폴백을 사용합니다.
