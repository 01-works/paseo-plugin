import { expect, it, vi } from 'vitest';
import { loadStatus } from '../client/status-data';

it('감독만 archive 포함 라벨 조회하고 자식은 미보관 running 조회로 분리·페이지 처리한다', async () => {
  const agent = { id: 'a', title: '목표', cwd: '/lane', status: 'idle', labels: { 'yw.role': 'supervisor' } };
  const list = vi.fn(async (options: { filter: { labels?: Record<string, string>; includeArchived: boolean; statuses?: string[] }; page: { cursor?: string } }) => {
    if (options.filter.includeArchived) {
      expect(options.filter.labels).toEqual({ 'yw.role': 'supervisor' });
      return options.page.cursor
        ? { entries: [{ agent: { ...agent, id: 'old', archivedAt: '2026-11-18' } }], pageInfo: { hasMore: false, nextCursor: null } }
        : { entries: [{ agent }], pageInfo: { hasMore: true, nextCursor: 'supervisors2' } };
    }
    expect(options.filter.statuses).toEqual(['running']);
    expect(options.filter.labels).toBeUndefined();
    return { entries: [{ agent: { ...agent, id: 'child', status: 'running', labels: { 'paseo.parent-agent-id': 'a' } } }], pageInfo: { hasMore: false, nextCursor: null } };
  });
  const result = await loadStatus({ agents: { list }, hosts: { list: async () => ({ self: { serverId: 'sdk-server' } }) } } as never,
    async () => ({ lanes: [{ laneDir: '/lane', state: { version: 1, agentId: 'a', serverId: 'sdk-server', title: '목표', reportedAt: '2026-11-18T00:00:00Z',
      report: { items: [{ id: 'g', summary: '목표', status: 'open' }], turnEnd: { kind: 'next_action', detail: '자식에게 배정' }, decisions: [] } } }], turns: [] }));
  expect(result.serverId).toBe('sdk-server'); expect(result.rows[0].status).toBe('진행'); expect(result.rows[0].canOpen).toBe(true);
  expect(result.rows).toHaveLength(1);
  expect(list).toHaveBeenCalledTimes(3);
  expect(list.mock.calls.some(([options]) => options.page.cursor === 'supervisors2')).toBe(true);
});
