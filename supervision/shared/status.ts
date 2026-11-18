import type { LaneState, ReportState } from './report';

export interface Supervisor {
  id: string; cwd: string; title: string | null; status: string; lastActivityAt: string;
  archivedAt?: string | null; labels: Record<string, string>;
}
export interface StatusRow {
  key: string; title: string; state: ReportState | null; agent?: Supervisor;
  status: '사용자 결정' | '미보고' | '멈춤' | '대기' | '진행' | '완료';
  rank: number; note?: string; canOpen: boolean;
}
export function statusRows(lanes: LaneState[], agents: Supervisor[], serverId: string): StatusRow[] {
  const rows: StatusRow[] = [];
  const represented = new Set<string>();
  const add = (key: string, state: ReportState | null, agent?: Supervisor, error?: string) => {
    if (agent) represented.add(agent.id);
    const foreign = !!state && state.serverId !== serverId;
    const missingReport = !state || (!!agent && agent.status === 'idle' && Date.parse(agent.lastActivityAt) > Date.parse(state.reportedAt));
    const stopped = !!error || foreign || !agent || !!agent.archivedAt || ['error', 'closed'].includes(agent.status) || (agent.status === 'idle' && state?.report.turnEnd.kind === 'next_action');
    const kind = state?.report.turnEnd.kind;
    const status = state?.report.decisions.length || kind === 'user_decision' ? '사용자 결정'
      : missingReport ? '미보고' : kind === 'done' ? '완료' : stopped ? '멈춤' : kind === 'waiting' ? '대기' : '진행';
    const rank = { '사용자 결정': 0, '미보고': 1, '멈춤': 1, '대기': 2, '진행': 3, '완료': 4 }[status];
    rows.push({ key, title: state?.title || agent?.title?.replace(/^감독 · /, '') || key.split('/').pop() || key,
      state, agent, status, rank, canOpen: !!agent && !agent.archivedAt && !foreign,
      note: error || (foreign ? '다른 호스트의 기록입니다. 해당 호스트에서 확인하세요.' : !agent ? '감독 조회 불가' : agent.archivedAt ? 'archive된 감독' : undefined) });
  };
  for (const lane of lanes) {
    const agent = lane.state?.serverId === serverId ? agents.find(value => value.id === lane.state?.agentId)
      : !lane.state ? agents.find(value => value.cwd === lane.laneDir) : undefined;
    add(lane.laneDir, lane.state, agent, lane.error);
  }
  for (const agent of agents) {
    if (agent.labels['yw.role'] === 'supervisor' && !agent.archivedAt && !represented.has(agent.id)) add(agent.id, null, agent);
  }
  return rows.sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
}
export function elapsed(reportedAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(reportedAt)) / 1000));
  return seconds < 60 ? `${seconds}초 전` : seconds < 3600 ? `${Math.floor(seconds / 60)}분 전` : seconds < 86400 ? `${Math.floor(seconds / 3600)}시간 전` : `${Math.floor(seconds / 86400)}일 전`;
}
