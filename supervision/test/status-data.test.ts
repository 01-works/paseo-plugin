import { expect, it, vi } from 'vitest';
import { loadStatus } from '../client/status-data';

it('선택한 API의 SDK 호스트 ID를 사용하고 모든 페이지에서 일반 자식도 조회한다', async () => {
  const agent = { id: 'a', title: '목표', cwd: '/lane', status: 'idle', labels: { 'yw.role': 'supervisor' } };
  const list = vi.fn().mockResolvedValueOnce({ entries: [{ agent }], pageInfo: { hasMore: true, nextCursor: 'page2' } })
    .mockResolvedValueOnce({ entries: [{ agent: { ...agent, id: 'child', status: 'running', labels: { 'paseo.parent-agent-id': 'a' } } }], pageInfo: { hasMore: false, nextCursor: null } });
  const result = await loadStatus({ agents: { list }, hosts: { list: async () => ({ self: { serverId: 'sdk-server' } }) } } as never,
    async () => ({ lanes: [{ laneDir: '/lane', state: { version: 1, agentId: 'a', serverId: 'sdk-server', title: '목표', reportedAt: '2026-11-18T00:00:00Z',
      report: { items: [{ id: 'g', summary: '목표', status: 'open' }], turnEnd: { kind: 'next_action', detail: '자식에게 배정' }, decisions: [] } } }], turns: [] }));
  expect(result.serverId).toBe('sdk-server'); expect(result.rows[0].status).toBe('진행'); expect(result.rows[0].canOpen).toBe(true);
  expect(list.mock.calls[0][0].filter.labels).toBeUndefined();
  expect(list.mock.calls[1][0].page.cursor).toBe('page2');
});
