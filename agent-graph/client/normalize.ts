import type { PaseoAgent } from '@getpaseo/client';
import { agentKey, type Agent, type AgentState } from '../shared/types';

export function normalizeAgent(raw: PaseoAgent & { parentAgentId?: string | null }, hostId: string): Agent {
  const attention = raw.requiresAttention === true ? raw.attentionReason : null;
  let state: AgentState = 'unknown';
  if (raw.status === 'closed') state = 'closed';
  else if (raw.status === 'error' || attention === 'error') state = 'error';
  else if (raw.providerUnavailable) state = 'unavailable';
  else if (raw.pendingPermissions?.length || attention === 'permission') state = 'permission';
  else if (raw.status === 'running') state = 'running';
  else if (raw.status === 'initializing') state = 'starting';
  else if (attention === 'finished') state = 'ready';
  else if (raw.status === 'idle') state = 'idle';
  const parent = Object.prototype.hasOwnProperty.call(raw, 'parentAgentId')
    ? raw.parentAgentId : raw.labels?.['paseo.parent-agent-id'];
  return {
    key: agentKey(hostId, raw.id), id: raw.id, parentId: typeof parent === 'string' && parent.trim() ? parent.trim() : null,
    workspaceId: raw.workspaceId ?? null, title: raw.title?.trim() || raw.provider + ' · ' + raw.id.slice(0, 8),
    provider: raw.provider, model: raw.model, cwd: raw.cwd, createdAt: raw.createdAt, updatedAt: raw.updatedAt,
    state, archived: Boolean(raw.archivedAt),
  };
}
export const sameAgent = (a: Agent | undefined, b: Agent) => a !== undefined &&
  a.key === b.key && a.parentId === b.parentId && a.workspaceId === b.workspaceId && a.title === b.title &&
  a.provider === b.provider && a.model === b.model && a.cwd === b.cwd && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt &&
  a.state === b.state && a.archived === b.archived;
