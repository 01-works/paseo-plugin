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
  const list = vi.fn(async (options: { subscribe?: {}; page?: { cursor?: string }; signal?: AbortSignal }) =>
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
  it('구독 수립 실패는 1·2·4초부터 최대 30초 간격으로 재시도하고 성공 뒤 멈춤', async () => {
    vi.useFakeTimers(); const h = harness();
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const _ of delays) h.list.mockRejectedValueOnce(new Error('offline'));
    await h.directory.start();
    expect(h.directory.getSnapshot()).toMatchObject({ loaded: false, loading: false, stale: true });
    for (const [index, delay] of delays.entries()) {
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(h.list).toHaveBeenCalledTimes(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(h.list).toHaveBeenCalledTimes(index + 2);
    }
    expect(h.directory.getSnapshot()).toMatchObject({ loaded: true, loading: false, stale: false, error: null });
    expect(h.lease.subscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(8);
  });
  it.each(['start', 'retry'] as const)('예약 중 %s는 즉시 재시도하고 동시 요청·기존 타이머를 합침', async method => {
    vi.useFakeTimers(); const h = harness();
    let finish!: (result: PaseoAgentListResult & { subscription: typeof h.lease }) => void;
    h.list.mockRejectedValueOnce(new Error('offline'));
    h.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await h.directory.start();
    const requested = h.directory[method](), started = h.directory.start(), retried = h.directory.retry();
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    finish({ ...page([raw('a')]), subscription: h.lease });
    await Promise.all([requested, started, retried]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(2); expect(h.lease.subscribe).toHaveBeenCalledOnce();
  });
  it('dispose는 예약된 재시도를 취소하고 이후 start·retry도 요청하지 않음', async () => {
    vi.useFakeTimers(); const h = harness(); h.list.mockRejectedValueOnce(new Error('offline'));
    await h.directory.start(); expect(vi.getTimerCount()).toBe(1);
    await h.directory.dispose();
    await Promise.all([h.directory.start(), h.directory.retry()]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['resolve', 'reject'])('자동 재시도 도중 dispose는 요청을 abort하고 늦은 %s 뒤 재시도하지 않음', async result => {
    vi.useFakeTimers(); const h = harness();
    let finish!: (value: PaseoAgentListResult & { subscription: typeof h.lease }) => void;
    let fail!: (reason: Error) => void;
    h.list.mockRejectedValueOnce(new Error('offline'));
    h.list.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    await h.directory.start(); await vi.advanceTimersByTimeAsync(1000);
    const pending = h.directory.start(), signal = h.list.mock.calls[1][0].signal;
    expect(signal?.aborted).toBe(false);
    await h.directory.dispose(); expect(signal?.aborted).toBe(true);
    if (result === 'resolve') finish({ ...page([raw('a')]), subscription: h.lease });
    else fail(new Error('aborted'));
    await pending; await vi.advanceTimersByTimeAsync(60000);
    expect(h.list).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
    expect(h.lease.subscribe).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledTimes(result === 'resolve' ? 1 : 0);
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
    h.update(raw('a'));
    await vi.advanceTimersByTimeAsync(300); expect(listener).not.toHaveBeenCalled();
    for (let i=0;i<50;i++) h.update(raw('a', { status: 'running', updatedAt: '2026-03-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(250); expect(listener).toHaveBeenCalledOnce();
  });
  it('시각만 바뀌어도 최근 목록에 반영하고 재조회 없이 알림', async () => {
    vi.useFakeTimers(); const h = harness(); await h.directory.start();
    const listener = vi.fn(); h.directory.subscribe(listener);
    h.update(raw('a', { updatedAt: '2026-02-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(250);
    expect(h.directory.getSnapshot().agents[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(listener).toHaveBeenCalledOnce();
    expect(h.list).toHaveBeenCalledOnce();
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
    const started = h.directory.start(); expect(started).toBe(first);
    expect(h.list).toHaveBeenCalledOnce();
    finish(); await first;
    expect(h.list).toHaveBeenCalledTimes(2); expect(h.release).toHaveBeenCalledOnce();
  });
});
