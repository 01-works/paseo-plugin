import type { Agent } from './types';
export type AgentSort = 'updated' | 'created';
const stamp = (value: string) => { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 0; };
export const agentTime = (agent: Agent, sort: AgentSort) => sort === 'created'
  ? stamp(agent.createdAt) : Math.max(stamp(agent.updatedAt), stamp(agent.createdAt));
export function workspaceAgents(agents: readonly Agent[], workspaceId: string, sort: AgentSort, query = '') {
  if (!workspaceId.trim()) return [];
  const term = query.trim().toLocaleLowerCase();
  return agents.filter(agent => !agent.archived && agent.workspaceId === workspaceId &&
    (!term || agent.title.toLocaleLowerCase().includes(term) || agent.id.toLocaleLowerCase().includes(term)))
    .map(agent => ({ agent, time: agentTime(agent, sort), created: stamp(agent.createdAt) }))
    .sort((a, b) => b.time - a.time || b.created - a.created ||
      (a.agent.id < b.agent.id ? -1 : a.agent.id > b.agent.id ? 1 : 0))
    .map(row => row.agent);
}
export function browserTime(value: number, compact = false, now = Date.now()) {
  if (!value) return '시각 확인 불가';
  const date = new Date(value), pad = (n: number) => String(n).padStart(2, '0');
  if (compact) {
    return date.toDateString() === new Date(now).toDateString()
      ? pad(date.getHours()) + ':' + pad(date.getMinutes())
      : pad(date.getMonth() + 1) + '/' + pad(date.getDate());
  }
  return pad(date.getMonth() + 1) + '/' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}
