import { expect, it, vi } from 'vitest';
import { normalizeAgent } from '../client/normalize';
import { agentTime, browserTime, workspaceAgents } from '../shared/browser';
import { browserSurfaceId, createAgentNavigation } from '../client/navigation';
import { raw } from './fixtures';
const make = (id: string, patch: Parameters<typeof raw>[1] = {}) => normalizeAgent(raw(id, patch), 'h');
it('탐색은 현재 workspace만 포함하며 다른 workspace의 자손·조상과 archive를 제외', () => {
  const agents = [make('root', { workspaceId: 'other' }), make('here', { labels: { 'paseo.parent-agent-id': 'root' } }),
    make('foreign-child', { workspaceId: 'other', labels: { 'paseo.parent-agent-id': 'here' } }),
    make('archived', { archivedAt: '2026-01-02T00:00:00Z' })];
  expect(workspaceAgents(agents, 'w', 'updated').map(agent => agent.id)).toEqual(['here']);
  expect(workspaceAgents(agents, '', 'updated')).toEqual([]);
});
it('최근 활동과 생성순을 구분하고 원본 목록 순서를 바꾸지 않음', () => {
  const agents = [make('new', { createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z' }),
    make('old-active', { updatedAt: '2026-04-01T00:00:00Z' })];
  expect(workspaceAgents(agents, 'w', 'updated').map(agent => agent.id)).toEqual(['old-active', 'new']);
  expect(workspaceAgents(agents, 'w', 'created').map(agent => agent.id)).toEqual(['new', 'old-active']);
  expect(agents.map(agent => agent.id)).toEqual(['new', 'old-active']);
});
it('누락·잘못된 시각은 생성시각으로 폴백하고 동률은 ID로 안정적으로 정렬', () => {
  const agents = [make('z', { updatedAt: 'bad' }), make('a', { updatedAt: 'bad' }),
    make('invalid', { createdAt: 'bad', updatedAt: 'bad' })];
  expect(workspaceAgents(agents, 'w', 'updated').map(agent => agent.id)).toEqual(['a', 'z', 'invalid']);
  expect(agentTime(agents[0], 'updated')).toBe(Date.parse(agents[0].createdAt));
  expect(browserTime(0)).toBe('시각 확인 불가');
  expect(browserTime(agentTime(agents[0], 'updated'))).toMatch(/^01\/01 \d\d:\d\d$/);
});
it('이름·ID 검색은 대소문자와 앞뒤 공백을 무시하고 정렬을 유지', () => {
  const agents = [make('first', { title: 'API 검증', updatedAt: '2026-03-01T00:00:00Z' }),
    make('api-second', { title: '문서 정리' }), make('other', { title: '구현' })];
  expect(workspaceAgents(agents, 'w', 'updated', ' API ').map(agent => agent.id)).toEqual(['first', 'api-second']);
});
it('공개 surface로 이동 의도를 전달하고 같은 요청은 한 번만 실행', () => {
  const openSurface = vi.fn(), navigation = createAgentNavigation({ openSurface });
  const input = { serverId: 'h', workspaceId: 'w', agentId: 'origin', targetId: 'target' };
  navigation.open(input);
  expect(openSurface).toHaveBeenCalledWith(browserSurfaceId);
  const request = navigation.getSnapshot()!;
  expect(navigation.takeTarget(request)).toBe('target');
  expect(navigation.takeTarget(request)).toBeNull();
  navigation.open({ ...input, targetId: 'second' });
  expect(navigation.takeTarget(request)).toBeNull();
  expect(navigation.takeTarget(navigation.getSnapshot()!)).toBe('second');
  navigation.dispose(); expect(navigation.getSnapshot()).toBeNull();
});
it('surface 열기 실패는 이전 context를 유지하고 이동 요청을 남기지 않음', () => {
  const openSurface = vi.fn(), navigation = createAgentNavigation({ openSurface });
  navigation.open({ serverId: 'h', workspaceId: 'w', agentId: 'origin', targetId: null });
  const previous = navigation.getSnapshot();
  openSurface.mockImplementationOnce(() => { throw new Error('unavailable'); });
  expect(() => navigation.open({ ...previous!, targetId: 'target' })).toThrow();
  expect(navigation.getSnapshot()).toBe(previous);
  expect(navigation.takeTarget(previous!)).toBeNull();
});
