import type { Snapshot } from '../shared/contracts';
import { gib, percent, pressureLabels, statusLabels } from './format';

// 렌더에 사용한 값만 복사한다. 별도 측정이나 RPC를 호출하지 않는다.
export function snapshotText(s: Snapshot, name: string, error?: string): string {
  const lines = [name,
    `측정 시각: ${s.sampledAt === null ? '없음' : new Date(s.sampledAt).toLocaleString('ko-KR')}`,
    `CPU: ${percent(s.cpu?.total)} (사용자 ${percent(s.cpu?.user)} · 시스템 ${percent(s.cpu?.system)})`,
    `메모리: ${gib(s.memory?.used)} / ${gib(s.memory?.total)}`,
    `앱 ${gib(s.memory?.app)} · 와이어드 ${gib(s.memory?.wired)} · 압축 ${gib(s.memory?.compressed)}`,
    `캐시된 파일: ${gib(s.memory?.cached)}`,
    `메모리 압력: ${pressureLabels[s.pressure]} · 가용 비율 ${s.memoryLevel === null ? '—' : `${s.memoryLevel}%`}`,
    `스왑: ${gib(s.swap?.used)} / ${gib(s.swap?.total)}`,
  ];
  if (s.status !== 'ok') lines.splice(2, 0, `상태: ${statusLabels[s.status]}`);
  const processState = { off: '측정 중', warming: '측정 중', ok: '최신', stale: '지연', error: '확인 불가', unsupported: '미지원' } as const;
  lines.push(`앱 목록: ${s.status !== 'ok' && s.processesStatus === 'ok' ? '이전 값' : processState[s.processesStatus]}`);
  if (s.processes) {
    for (const [title, groups] of [['CPU 상위 앱', s.processes.topCpu], ['메모리 상위 앱', s.processes.topMemory]] as const) {
      lines.push('', title);
      groups.forEach((g, i) => lines.push(`${i + 1}. ${g.name} · CPU ${percent(g.cpuPercent)} · ${gib(g.memoryBytes)} · 프로세스 ${g.processCount}개`));
    }
    lines.push(`제외 root ${s.processes.excludedRoot} · 권한 ${s.processes.excludedPermission} · 읽기 오류 ${s.processes.otherErrors}`);
  }
  if (error) lines.push(`RPC 연결 오류: ${error}`);
  lines.push(...s.errors.map(message => `측정 오류: ${message}`));
  return lines.join('\n');
}
