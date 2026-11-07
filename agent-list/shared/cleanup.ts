import { agentChangedTime } from './list';
import { lineageRoots } from './lineage';
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
    agentChangedTime(agent) > 0 && agentChangedTime(agent) <= scope.cutoff);
}

/** 이어진 대화는 한 작업이라 묶음 전체가 대상일 때만 정리한다. 하나라도 최근이거나 작업 중이면 묶음을 남긴다. */
export function lineageReady(agents: readonly Agent[], scope: CleanupScope): (id: string) => boolean {
  const roots = lineageRoots(agents, scope.workspaceId), blocked = new Set<string>();
  for (const agent of agents) {
    const root = roots.get(agent.id);
    if (root && !isCleanupCandidate(agent, scope)) blocked.add(root);
  }
  return id => !blocked.has(roots.get(id) ?? id);
}

/** 하위부터 보관한다. 제외된 자손·다른 workspace·순환 관계가 있는 상위와, 일부만 남는 이어진 묶음은 계획에 넣지 않는다. */
export function createCleanupPlan(agents: readonly Agent[], workspaceId: string, currentAgentId: string,
  days: CleanupDays, now = Date.now()): CleanupPlan {
  const scope = { workspaceId, currentAgentId, cutoff: now - days * 86400000 };
  const active = agents.filter(agent => !agent.archived);
  const roots = lineageRoots(active, workspaceId), ready = lineageReady(active, scope);
  const excluded = new Set<string>();
  for (;;) {
    const queue = childFirst(active, active.filter(agent => isCleanupCandidate(agent, scope) && ready(agent.id) &&
      !excluded.has(roots.get(agent.id) ?? agent.id)));
    // 하위 조건으로 묶음의 일부가 빠지면 묶음 전체를 빼고 다시 계산한다.
    const planned = new Set(queue.map(agent => agent.id)), before = excluded.size;
    const plannedRoots = new Set(queue.map(agent => roots.get(agent.id) ?? agent.id));
    for (const agent of active) {
      const root = roots.get(agent.id);
      if (root && !planned.has(agent.id) && plannedRoots.has(root)) excluded.add(root);
    }
    if (excluded.size === before) return { ...scope, days, agents: queue };
  }
}

function childFirst(active: readonly Agent[], candidates: readonly Agent[]): Agent[] {
  const eligible = new Map(candidates.map(agent => [agent.id, agent]));
  const children = new Map<string, number>();
  for (const agent of active) if (agent.parentId) children.set(agent.parentId, (children.get(agent.parentId) ?? 0) + 1);
  const queue = [...eligible.values()].filter(agent => !children.get(agent.id))
    .sort((a, b) => agentChangedTime(a) - agentChangedTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let index = 0; index < queue.length; index++) {
    const parentId = queue[index].parentId;
    if (!parentId) continue;
    const remaining = (children.get(parentId) ?? 0) - 1;
    children.set(parentId, remaining);
    const parent = eligible.get(parentId);
    if (remaining === 0 && parent) queue.push(parent);
  }
  return queue;
}
