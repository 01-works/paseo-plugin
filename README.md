# mac-monitor

macOS 전용 Paseo 시스템 모니터 플러그인입니다. CPU·메모리·OS 메모리 압력·스왑과
앱 그룹별 CPU/메모리 상위 5개를 보여줍니다. Paseo 0.10.2 API를 사용하며 `paseo-top`과 독립적입니다.

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

각 에이전트 composer의 pill은 `CPU 23% · 14.1/16 GiB`를 표시합니다.
compact 화면은 `23% · 14.1G`로 축약합니다. pill을 누르면 세부 메모리와 앱 상위 목록을 볼 수 있습니다.
사이드바의 **Mac 모니터**에는 선택한 호스트 상세와 연결된 호스트의 작업 중/대기 에이전트 수가 나옵니다.

호스트별 플러그인 서버는 C 헬퍼 하나만 유지합니다. 헬퍼가 고정 2초 간격으로 샘플을 내보내며,
RPC는 캐시를 읽습니다. 여러 pill이나 RPC 요청이 측정 간격을 바꾸지 않습니다.
보이는 pill만 공유 타이머 하나로 갱신하며, 같은 라벨은 다시 업데이트하지 않습니다.
팝오버·대시보드는 열려 있는 동안만 2초 폴링합니다.

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
| 앱 그룹 메모리 | `proc_pid_rusage(RUSAGE_INFO_V4).ri_phys_footprint` 합계 |
| 앱 그룹 CPU | 같은 PID·시작 시각의 CPU 누적 차이를 timebase 변환 후 시간·코어 수로 나눔 |

`host_statistics64(HOST_VM_INFO64)`와 `host_statistics(HOST_CPU_LOAD_INFO)`를 사용합니다.
`os.freemem()`이나 압축 전 페이지 수는 사용하지 않습니다.
가장 바깥 `.app` 번들 이름으로 그룹화하고, 그 밖의 실행 파일은 basename으로 표시합니다.
`/claude/versions/` 경로는 `claude`로 묶습니다. 앱 메모리 footprint에는 압축/스왑 분이 포함되어
그룹 합이 물리 RAM보다 클 수 있으므로 RAM 점유율로 환산하지 않습니다.

출처: [Apple 메모리 용어](https://support.apple.com/guide/activity-monitor/actmntr1004/mac),
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
집계 폴링은 대시보드가 보일 때만 수행하며 호스트별 single-flight, 응답 대기 3초 제한을 적용합니다.
Paseo 업데이트로 비공식 동작이 바뀔 수 있습니다. 관련 코드는 `client/fleet/`에 격리되어 있습니다.

## 부하와 검증

이 Mac(arm64 macOS 26.5.1, 16 GiB, 논리 10코어)에서 각각 120초 관찰했습니다.
CPU는 코어 1개 기준이며, 전체 10코어 기준 사용률은 아래 값을 10으로 나눕니다.

| 수집 모드 | 코어 1개 CPU | RSS |
|---|---:|---:|
| 시스템 지표만 | 0.104% | 1.97 MiB |
| 시스템 + 앱 스캔 | 0.346% | 1.64 MiB |

Node 폴백의 자체 부하는 이 구현에서 별도로 측정하지 않았습니다. 프로세스 수와 머신 부하에 따라 비용은 달라집니다.
테스트·네이티브 스모크·로컬 설치/RPC·부하 측정 결과는 [docs/VALIDATION.md](docs/VALIDATION.md)에 있습니다.

Activity Monitor 화면과의 직접 대조는 **사용자 대조 필요**입니다. “일치 확인”을 완료했다고 주장하지 않습니다.

```sh
npm run compare                 # Ctrl+C로 종료
npm run compare -- --samples=3   # CPU 샘플 3회 기록 후 종료
```

## 알려진 한계

- root 및 다른 사용자 프로세스 일부는 권한 때문에 상위 목록에서 제외됩니다. 제외 수를 화면에 표시합니다.
- 앱 CPU는 종료된 프로세스의 마지막 구간 및 새 프로세스의 첫 구간을 포함하지 못해 시스템 CPU 합계와 다를 수 있습니다.
- Activity Monitor 갱신 간격(기본 5초)·읽는 시각·반올림·압력 그래프의 내부 기준 때문에 차이가 날 수 있습니다.
- x86_64 슬라이스는 빌드·서명만 확인했고 실제 Intel/Rosetta 실행은 미검증입니다.
- 라이트/다크·compact 실제 화면과 다른 Mac에서의 집계/폴백은 사용자 확인이 남아 있습니다.
- 서버 설치 경로는 0.10.2의 설치 설정에서 읽습니다. 다른 ID로 설치하는 `--id` 별칭은 지원하지 않습니다.
- ad-hoc 바이너리가 quarantine으로 차단되면 로컬 빌드/Node 폴백을 사용합니다.
