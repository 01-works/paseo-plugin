import type { usePaseo } from '@getpaseo/plugin/client';
import type { LaneState, TurnState } from '../shared/report';
import { statusRows, type Supervisor } from '../shared/status';

export async function loadStatus(paseo: ReturnType<typeof usePaseo>, read: () => Promise<{ lanes: LaneState[]; turns: TurnState[] }>) {
  const listAgents = async (filter: { includeArchived: boolean; labels?: Record<string, string>; statuses?: 'running'[] }) => {
    const agents: Supervisor[] = [];
    let cursor: string | undefined;
    do {
      const options = { filter: { ...filter, includeBackground: true }, includeBackground: true, page: { limit: 100, cursor } };
      const result = await paseo.agents.list(options);
      agents.push(...result.entries.map(({ agent }) => agent));
      cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor ?? undefined : undefined;
    } while (cursor);
    return agents;
  };
  const [data, supervisors, children, { self }] = await Promise.all([read(),
    listAgents({ labels: { 'yw.role': 'supervisor' }, includeArchived: true }),
    listAgents({ includeArchived: false, statuses: ['running'] }), paseo.hosts.list()]);
  const agents = [...new Map([...children, ...supervisors].map(agent => [agent.id, agent])).values()];
  return { rows: statusRows(data.lanes, agents, self.serverId, data.turns), serverId: self.serverId, now: Date.now() };
}
