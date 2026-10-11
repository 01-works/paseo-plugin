import { agentTime } from './browser';
import type { Agent } from './types';

export const cleanupPeriods = [7, 14, 30] as const;
export type CleanupDays = (typeof cleanupPeriods)[number];
export type CleanupScope = { workspaceId: string; currentAgentId: string; cutoff: number };
export type CleanupPlan = CleanupScope & { days: CleanupDays; agents: readonly Agent[] };
export type CleanupOutcome = { id: string; title: string; status: 'archived' | 'skipped' | 'failed'; message?: string };
export type CleanupResult = { outcomes: readonly CleanupOutcome[]; stopped: boolean };

export function isCleanupCandidate(agent: Agent, scope: CleanupScope) {
  return Boolean(scope.workspaceId.trim() && scope.currentAgentId && Number.isFinite(scope.cutoff) &&
    !agent.archived && agent.workspaceId === scope.workspaceId && agent.id !== scope.currentAgentId && agent.cleanupSafe &&
    Number.isFinite(Date.parse(agent.createdAt)) && Number.isFinite(Date.parse(agent.updatedAt)) &&
    agentTime(agent, 'updated') > 0 && agentTime(agent, 'updated') <= scope.cutoff);
}

/** 하위부터 보관한다. 제외된 자손·다른 workspace·순환 관계가 있는 상위는 계획에 넣지 않는다. */
export function createCleanupPlan(agents: readonly Agent[], workspaceId: string, currentAgentId: string,
  days: CleanupDays, now = Date.now()): CleanupPlan {
  const scope = { workspaceId, currentAgentId, cutoff: now - days * 86400000 };
  const active = agents.filter(agent => !agent.archived);
  const eligible = new Map(active.filter(agent => isCleanupCandidate(agent, scope)).map(agent => [agent.id, agent]));
  const children = new Map<string, number>();
  for (const agent of active) if (agent.parentId) children.set(agent.parentId, (children.get(agent.parentId) ?? 0) + 1);
  const queue = [...eligible.values()].filter(agent => !children.get(agent.id))
    .sort((a, b) => agentTime(a, 'updated') - agentTime(b, 'updated') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let index = 0; index < queue.length; index++) {
    const parentId = queue[index].parentId;
    if (!parentId) continue;
    const remaining = (children.get(parentId) ?? 0) - 1;
    children.set(parentId, remaining);
    const parent = eligible.get(parentId);
    if (remaining === 0 && parent) queue.push(parent);
  }
  return { ...scope, days, agents: queue };
}
