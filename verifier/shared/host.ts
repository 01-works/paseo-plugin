import type { HostStatus } from './contracts';

// bootstrap(01-works/bootstrap)의 verifier 점검과 맞추는 기준. 단위까지 함께 유지한다.
export const HOST_WARNING_THRESHOLDS = {
  swapUsedPercent: 80,
  fseventsdRssKib: 2 * 1024 * 1024,
  containerAgeSeconds: 2 * 60 * 60,
  leftoverContainers: 1,
} as const;

export const HOST_REMEDIATION = 'run 사이에 loop를 내리고, 남은 컨테이너를 지운 뒤 sudo killall fseventsd';

/** 화면·사이드바·에이전트 도구가 같은 기준과 문구를 쓴다. */
export function hostIndicators(host: HostStatus) {
  return [
    {
      key: 'swap',
      label: host.swapUsedPercent === null ? 'swap 읽기 실패' : `swap ${host.swapUsedPercent.toFixed(1)}%`,
      warning: host.swapUsedPercent !== null && host.swapUsedPercent >= HOST_WARNING_THRESHOLDS.swapUsedPercent,
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
