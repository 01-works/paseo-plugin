import type { usePaseo } from '@getpaseo/plugin/client';
import type { LaneState, TurnState } from '../shared/report';
import { statusRows, type Supervisor } from '../shared/status';
import { replyLine } from './board-model';

type Paseo = ReturnType<typeof usePaseo>;
type Agent = Supervisor & { updatedAt?: string };
// 감독별 마지막 응답 첫 줄. updatedAt이 그대로면 다시 읽지 않는다.
const replies = new Map<string, { updatedAt: string; line?: string }>();

async function lastReply(paseo: Paseo, agent: Agent) {
  const cached = replies.get(agent.id);
  if (!agent.updatedAt || cached?.updatedAt === agent.updatedAt) return cached?.line;
  const page = await paseo.agents.ref(agent.id).timeline.refetch({ direction: 'tail', projection: 'projected', limit: 40 });
  const items = page.entries.map(entry => entry.item as { type: string; text?: string });
  const text = items.reverse().find(item => item.type === 'assistant_message' && item.text?.trim())?.text;
  const line = text ? replyLine(text) : undefined;
  replies.set(agent.id, { updatedAt: agent.updatedAt, line });
  return line;
}

export async function loadStatus(paseo: Paseo, read: () => Promise<{ lanes: LaneState[]; turns: TurnState[] }>) {
  const listAgents = async (filter: { includeArchived: boolean; labels?: Record<string, string> }) => {
    const agents: Agent[] = [];
    let cursor: string | undefined;
    do {
      const options = { filter: { ...filter, includeBackground: true }, includeBackground: true, page: { limit: 100, cursor } };
      const result = await paseo.agents.list(options);
      agents.push(...result.entries.map(({ agent }) => agent));
      cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor ?? undefined : undefined;
    } while (cursor);
    return agents;
  };
  // 감독은 archive 포함 라벨 조회, 자식(작업자·실행 판정)은 미보관 전체 한 번.
  const [data, supervisors, children, { self }] = await Promise.all([read(),
    listAgents({ labels: { 'yw.role': 'supervisor' }, includeArchived: true }),
    listAgents({ includeArchived: false }), paseo.hosts.list()]);
  const agents = [...new Map([...children, ...supervisors].map(agent => [agent.id, agent])).values()];
  const rows = statusRows(data.lanes, agents, self.serverId, data.turns);
  // headline이 없는 감독만 마지막 응답을 읽는다. closed 감독의 타임라인을 읽으면 세션이 재개되므로 읽지 않는다.
  const reply: Record<string, string> = {};
  await Promise.all(rows.map(async row => {
    const agent = row.agent as Agent | undefined;
    if (!agent || row.state?.report.headline || agent.status === 'closed' || agent.archivedAt) return;
    const line = await lastReply(paseo, agent).catch(() => undefined);
    if (line) reply[agent.id] = line;
  }));
  return { rows, agents, reply, serverId: self.serverId, now: Date.now() };
}
