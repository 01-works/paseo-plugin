# mac-monitor 측정 기준과 상태

사용·설치는 [README](../README.md), 실측 결과는 [검증 기록](VALIDATION.md)을 참고합니다.

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
합계 식의 실행 파일 추적·원시 값 대조는 [메모리 합계 조사](research/report-memory-accounting.md),
폴백의 빈 페이지 기준은 [Apple vm_stat 구현](https://github.com/apple-oss-distributions/system_cmds/blob/main/vm_stat/vm_stat.c#L126)에 있습니다.
자세한 조사와 실측은 [조사 자료](research/)에 있습니다.

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
