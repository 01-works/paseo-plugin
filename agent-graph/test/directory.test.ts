import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnedSubscription, PaseoApi, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { createAgentDirectory, type AgentDirectory } from '../client/directory';
import { page, raw } from './fixtures';
type Observer = SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>;
const directories: AgentDirectory[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await d.dispose(); vi.useRealTimers(); });
function harness(first = page([raw('a')]), next?: (cursor?: string) => Promise<PaseoAgentListResult>) {
  let observer: Observer;
  const release = vi.fn(async () => {});
  const lease = { subscriptionId: 's', ready: Promise.resolve({ ...first, subscriptionId: 's' }),
    subscribe: vi.fn((value: Observer) => { observer = value; value.snapshot({ ...first, subscriptionId: 's' }); return vi.fn(); }), release };
  const list = vi.fn(async (options: { subscribe?: {}; page?: { cursor?: string } }) =>
    options.subscribe ? { ...first, subscription: lease } : next ? await next(options.page?.cursor) : page([]));
  const directory = createAgentDirectory({ agents: { list } } as unknown as PaseoApi, 'h');
  directories.push(directory);
  return { directory, list, lease, release, snapshot: (value: PaseoAgentListResult) => observer.snapshot({ ...value, subscriptionId: 's' }),
    update: (agent: ReturnType<typeof raw>) => observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent, project: {} } } as Parameters<Observer['update']>[0]),
    remove: (id: string) => observer.update({ type: 'agent_update', payload: { kind: 'remove', agentId: id } }) };
}
describe('공유 directory', () => {
  it('동시 시작과 여러 observer는 lease 하나를 공유하고 idle 재조회 없음', async () => {
    vi.useFakeTimers(); const h = harness();
    h.directory.subscribe(vi.fn()); h.directory.subscribe(vi.fn()); h.directory.subscribe(vi.fn());
    await Promise.all([h.directory.start(), h.directory.start(), h.directory.start()]);
    const off = h.directory.watch(); await vi.advanceTimersByTimeAsync(60000); off();
    expect(h.list).toHaveBeenCalledOnce(); expect(h.lease.subscribe).toHaveBeenCalledOnce();
  });
  it('200개 이후 페이지와 그 밖의 update를 같은 map에 반영', async () => {
    vi.useFakeTimers();
    const h = harness(page(Array.from({ length: 200 }, (_, i) => raw(String(i))), 'next'),
      async () => page([raw('200'), raw('201')]));
    await h.directory.start(); await Promise.resolve();
    expect(h.directory.getSnapshot().agents).toHaveLength(202);
    h.update(raw('201', { status: 'running', updatedAt: '2026-02-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(250);
    expect(h.directory.getSnapshot().agents.find(a => a.id === '201')?.state).toBe('running');
    expect(h.list).toHaveBeenCalledTimes(2);
  });
  it('페이지 조회 중 remove와 upsert가 오래된 페이지로 되돌아가지 않음', async () => {
    vi.useFakeTimers(); let resolve!: (p: PaseoAgentListResult) => void;
    const h = harness(page([raw('a')], 'next'), () => new Promise(r => { resolve = r; }));
    await h.directory.start(); h.remove('a'); h.update(raw('b', { status: 'running', updatedAt: '2026-03-01T00:00:00.000Z' }));
    resolve(page([raw('a'), raw('b')])); await vi.waitFor(() => expect(h.directory.getSnapshot().loading).toBe(false));
    expect(h.directory.getSnapshot().agents.map(a => a.id)).toEqual(['b']);
    expect(h.directory.getSnapshot().agents[0].state).toBe('running');
  });
  it('재연결의 부분 snapshot은 캐시를 유지하고 전체 페이지 후 교체', async () => {
    let resolve!: (p: PaseoAgentListResult) => void;
    const h = harness(page([raw('old')]), () => new Promise(r => { resolve = r; }));
    await h.directory.start(); h.snapshot(page([raw('new')], 'next'));
    expect(h.directory.getSnapshot().agents[0].id).toBe('old');
    resolve(page([raw('tail')])); await vi.waitFor(() => expect(h.directory.getSnapshot().loading).toBe(false));
    expect(h.directory.getSnapshot().agents.map(a => a.id)).toEqual(['new','tail']);
  });
  it('오래된 세대의 페이지 응답은 재연결 뒤 반영하지 않음', async () => {
    let resolve!: (p: PaseoAgentListResult) => void;
    const h = harness(page([raw('old')], 'next'), () => new Promise(r => { resolve = r; }));
    await h.directory.start(); h.snapshot(page([raw('new')])); resolve(page([raw('zombie')]));
    await Promise.resolve(); expect(h.directory.getSnapshot().agents.map(a => a.id)).toEqual(['new']);
  });
  it('2,000개 상한과 부분 표시 유지', async () => {
    let index = 1;
    const h = harness(page(Array.from({ length: 200 }, (_, i) => raw(String(i))), '1'),
      async () => { const n = index++; return page(Array.from({ length: 200 }, (_, i) => raw(String(n * 200 + i))), String(index)); });
    await h.directory.start();
    await vi.waitFor(() => expect(h.directory.getSnapshot().loading).toBe(false));
    expect(h.directory.getSnapshot().agents).toHaveLength(2000); expect(h.directory.getSnapshot().partial).toBe(true);
    expect(h.list).toHaveBeenCalledTimes(10); h.update(raw('overflow'));
    expect(h.directory.getSnapshot().agents).toHaveLength(2000);
  });
  it('같은 표시값은 알리지 않고 상태 변경 알림을 묶음', async () => {
    vi.useFakeTimers(); const h = harness(); await h.directory.start();
    const listener = vi.fn(); h.directory.subscribe(listener);
    h.update(raw('a', { updatedAt: '2026-02-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(300); expect(listener).not.toHaveBeenCalled();
    for (let i=0;i<50;i++) h.update(raw('a', { status: 'running', updatedAt: '2026-03-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(250); expect(listener).toHaveBeenCalledOnce();
  });
  it('연결 단절은 0 대신 stale로 표시하고 watch 종료 시 타이머 정리', async () => {
    vi.useFakeTimers(); const h = harness(page([raw('a', { status: 'running' })])); await h.directory.start();
    const off = h.directory.watch();
    (h.lease as { subscriptionId: string | null }).subscriptionId = null;
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.directory.getSnapshot().stale).toBe(true); expect(h.directory.getSnapshot().agents[0].state).toBe('running');
    off(); expect(vi.getTimerCount()).toBe(0);
  });
  it('dispose 뒤 늦게 도착한 lease도 release', async () => {
    let resolve!: (value: PaseoAgentListResult & { subscription: OwnedSubscription<PaseoAgentListResult> }) => void;
    const h = harness(); h.list.mockImplementation(() => new Promise(r => { resolve = r as typeof resolve; }));
    const pending = h.directory.start(); await h.directory.dispose();
    resolve({ ...page([]), subscription: h.lease }); await pending;
    expect(h.release).toHaveBeenCalledOnce(); expect(h.lease.subscribe).not.toHaveBeenCalled();
  });
  it('페이지 실패 시 삭제된 노드를 되살리지 않고 부분 표시', async () => {
    let reject!: (reason: Error) => void;
    const h = harness(page([raw('a')], 'next'), () => new Promise((_, r) => { reject = r; }));
    await h.directory.start(); h.remove('a'); reject(new Error('network'));
    await vi.waitFor(() => expect(h.directory.getSnapshot().loading).toBe(false)); expect(h.directory.getSnapshot().agents).toHaveLength(0);
    expect(h.directory.getSnapshot().partial).toBe(true);
  });
  it('lease 해제 중 재시도를 연달아 눌러도 새 구독은 하나', async () => {
    const h = harness(); await h.directory.start();
    let finish!: () => void;
    h.release.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = h.directory.retry(), second = h.directory.retry();
    expect(first).toBe(second); expect(h.directory.getSnapshot().loading).toBe(true);
    finish(); await first;
    expect(h.list).toHaveBeenCalledTimes(2); expect(h.release).toHaveBeenCalledOnce();
  });
});
