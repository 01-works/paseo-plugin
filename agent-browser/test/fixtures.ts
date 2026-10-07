import type { PaseoAgent, PaseoAgentListResult } from '@getpaseo/client';
export function raw(id: string, patch: Partial<PaseoAgent> & { parentAgentId?: string | null } = {}): PaseoAgent {
  return { id, provider: 'codex', cwd: '/example/project', workspaceId: 'w', model: 'test-model', title: id,
    status: 'idle', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    labels: {}, pendingPermissions: [], ...patch } as PaseoAgent;
}
export function page(entries: PaseoAgent[], next: string | null = null): PaseoAgentListResult {
  return { requestId: 'test', entries: entries.map(agent => ({ agent, project: {} } as PaseoAgentListResult['entries'][number])),
    pageInfo: { hasMore: next !== null, nextCursor: next, prevCursor: null } };
}
