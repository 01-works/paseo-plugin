import type { HostStatus } from './contracts';

// bootstrap(01-works/bootstrap)의 verifier 점검과 맞추는 기준. 단위까지 함께 유지한다.
// swap은 비율이 아니라 사용량으로 본다. macOS는 swap 총량을 필요할 때 늘렸다 줄여서, 총량이 작으면 정상이어도
// 비율이 80%를 넘는다(2.6/3.0 GiB). 저하 실측은 11.7 GiB(RAM 16 GiB)였다(01-software #10193, #10321).
export const HOST_WARNING_THRESHOLDS = {
  swapUsedMib: 8 * 1024,
  fseventsdRssKib: 2 * 1024 * 1024,
  containerAgeSeconds: 2 * 60 * 60,
  leftoverContainers: 1,
} as const;

export const HOST_REMEDIATION = 'run 사이에 loop를 내리고, 남은 컨테이너를 지운 뒤 sudo killall fseventsd. swap이 colima VM 쪽이면 brew services restart colima';

/** 화면·사이드바·에이전트 도구가 같은 기준과 문구를 쓴다. */
export function hostIndicators(host: HostStatus) {
  return [
    {
      key: 'swap',
      label: host.swapUsedMib === null ? 'swap 읽기 실패' : `swap ${(host.swapUsedMib / 1024).toFixed(1)} GiB`,
      warning: host.swapUsedMib !== null && host.swapUsedMib >= HOST_WARNING_THRESHOLDS.swapUsedMib,
    },
    {
      key: 'fseventsd',
      label: host.fseventsdRssKib === null ? 'fseventsd RSS 읽기 실패' : `fseventsd RSS ${(host.fseventsdRssKib / 1024 / 1024).toFixed(1)} GiB`,
      warning: host.fseventsdRssKib !== null && host.fseventsdRssKib >= HOST_WARNING_THRESHOLDS.fseventsdRssKib,
    },
    {
      key: 'containers',
      label: host.leftoverContainers === null ? '남은 lane 컨테이너 확인 안 됨' : `남은 lane 컨테이너 ${host.leftoverContainers.count}개`,
      warning: host.leftoverContainers !== null && host.leftoverContainers.count >= HOST_WARNING_THRESHOLDS.leftoverContainers,
    },
  ];
}
