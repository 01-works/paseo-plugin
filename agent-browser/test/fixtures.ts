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
export function timelinePage(at: string | null = null) {
  return { agentId: 'test', agent: null, requestId: 'test', direction: 'tail' as const, projection: 'projected' as const,
    epoch: 'e', reset: false, staleCursor: false, gap: false, error: null,
    window: { minSeq: 1, maxSeq: 1, nextSeq: 2 }, startCursor: { epoch: 'e', seq: 1 }, endCursor: { epoch: 'e', seq: 1 },
    hasOlder: false, hasNewer: false,
    entries: at ? [{ provider: 'codex', item: { type: 'assistant_message' as const, text: '답변' }, timestamp: at,
      seqStart: 1, seqEnd: 1, sourceSeqRanges: [{ startSeq: 1, endSeq: 1 }], collapsed: [] }] : [] };
}
export const emptyTimeline = () => ({ refetch: async () => timelinePage(),
  subscribe: () => Object.assign(() => {}, { ready: Promise.resolve() }) });
