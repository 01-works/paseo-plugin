import { afterEach, expect, it, vi } from 'vitest';
import type { PaseoApi, PaseoAgent, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { createAgentDirectory, type AgentDirectory } from '../client/directory';
import { page, raw } from './fixtures';
const directories: AgentDirectory[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await directory.dispose(); vi.useRealTimers(); });
async function setup(first = page([raw('a'), raw('b')]), next?: () => Promise<PaseoAgentListResult>) {
  const refresh = vi.fn(async (): Promise<{ agent: PaseoAgent; project: {} } | null> => ({ agent: raw('a'), project: {} }));
  const archive = vi.fn(async () => ({ archivedAt: '2026-10-07T07:00:00Z' }));
  const ref = vi.fn(() => ({ refresh, archive }));
  const lease = { subscriptionId: 's' as string | null, subscribe: (observer: SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>) => {
    observer.snapshot({ ...first, subscriptionId: 's' }); return () => {};
  }, release: async () => {} };
  const list = vi.fn(async (options: { subscribe?: {} }) => options.subscribe ? { ...first, subscription: lease } : await next!());
  const directory = createAgentDirectory({ agents: { list, ref } } as unknown as PaseoApi, 'h');
  directories.push(directory); await directory.start();
  return { directory, refresh, archive, ref, lease, list };
}
it('닫기는 대상을 다시 확인하고 중복 클릭을 합치며 성공 응답 뒤 목록에서 제거', async () => {
  const h = await setup(); let finish!: () => void;
  h.archive.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ archivedAt: '2026-10-07T07:00:00Z' }); }));
  const first = h.directory.archive('a', 'w'), second = h.directory.archive('a', 'w');
  expect(first).toBe(second);
  await vi.waitFor(() => expect(h.archive).toHaveBeenCalledOnce());
  expect(h.ref).toHaveBeenCalledExactlyOnceWith('a'); expect(h.refresh).toHaveBeenCalledOnce();
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['a', 'b']);
  finish(); await first;
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['b']);
  expect(h.list).toHaveBeenCalledOnce();
});
it('현재 워크스페이스에 없는 대화는 조회나 보관 요청을 보내지 않음', async () => {
  const h = await setup();
  await expect(h.directory.archive('a', 'other')).rejects.toThrow('현재 워크스페이스');
  await expect(h.directory.archive('missing', 'w')).rejects.toThrow('현재 워크스페이스');
  expect(h.ref).not.toHaveBeenCalled();
});
it.each([
  ['workspace 이동', raw('a', { workspaceId: 'other' })],
  ['다른 ID', raw('other')],
  ['이미 보관됨', raw('a', { archivedAt: '2026-10-07T06:00:00Z' })],
  ['삭제됨', null],
])('확인 중 %s 상태로 바뀐 대화는 닫지 않음', async (_, agent) => {
  const h = await setup();
  h.refresh.mockResolvedValueOnce(agent ? { agent, project: {} } : null);
  await expect(h.directory.archive('a', 'w')).rejects.toThrow('현재 워크스페이스');
  expect(h.archive).not.toHaveBeenCalled();
});
it('조회·보관 실패는 성공으로 지우지 않으며 다음 요청은 다시 실행 가능', async () => {
  const h = await setup();
  h.refresh.mockRejectedValueOnce(new Error('조회 실패'));
  await expect(h.directory.archive('a', 'w')).rejects.toThrow('조회 실패');
  expect(h.archive).not.toHaveBeenCalled();
  h.archive.mockRejectedValueOnce(new Error('보관 실패'));
  await expect(h.directory.archive('a', 'w')).rejects.toThrow('보관 실패');
  expect(h.directory.getSnapshot().agents).toHaveLength(2);
  await h.directory.archive('a', 'w');
  expect(h.archive).toHaveBeenCalledTimes(2); expect(h.directory.getSnapshot().agents).toHaveLength(1);
});
it('단절 뒤 닫기를 차단하고 확인 도중 dispose되어도 보관 요청을 보내지 않음', async () => {
  vi.useFakeTimers(); const h = await setup(); const off = h.directory.watch();
  h.lease.subscriptionId = null; await vi.advanceTimersByTimeAsync(1000);
  await expect(h.directory.archive('a', 'w')).rejects.toThrow('연결 상태');
  expect(h.ref).not.toHaveBeenCalled(); off();
  const live = await setup(); let finish!: (value: { agent: PaseoAgent; project: {} }) => void;
  live.refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = live.directory.archive('a', 'w');
  const failed = expect(pending).rejects.toThrow('연결 상태');
  await live.directory.dispose(); finish({ agent: raw('a'), project: {} });
  await failed; expect(live.archive).not.toHaveBeenCalled();
});
it('닫기 성공 후 늦은 페이지에 같은 대화가 있어도 되살리지 않음', async () => {
  let finish!: (value: PaseoAgentListResult) => void;
  const h = await setup(page([raw('a')], 'next'), () => new Promise(resolve => { finish = resolve; }));
  await h.directory.archive('a', 'w');
  finish(page([raw('a'), raw('b')]));
  await vi.waitFor(() => expect(h.directory.getSnapshot().loading).toBe(false));
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['b']);
});
