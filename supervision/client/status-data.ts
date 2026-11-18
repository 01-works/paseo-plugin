import type { usePaseo } from '@getpaseo/plugin/client';
import type { LaneState, TurnState } from '../shared/report';
import { statusRows, type Supervisor } from '../shared/status';

export async function loadStatus(paseo: ReturnType<typeof usePaseo>, read: () => Promise<{ lanes: LaneState[]; turns: TurnState[] }>) {
  const listAgents = async () => {
    const agents: Supervisor[] = [];
    let cursor: string | undefined;
    do {
      const filter = { includeArchived: true, includeBackground: true };
      const options = { filter, includeBackground: true, page: { limit: 100, cursor } };
      const result = await paseo.agents.list(options);
      agents.push(...result.entries.map(({ agent }) => agent));
      cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor ?? undefined : undefined;
    } while (cursor);
    return agents;
  };
  const [data, agents, { self }] = await Promise.all([read(), listAgents(), paseo.hosts.list()]);
  return { rows: statusRows(data.lanes, agents, self.serverId, data.turns), serverId: self.serverId, now: Date.now() };
}
