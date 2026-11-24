import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeavyReader } from '../server/heavy';
import { heavyResultSchema } from '../shared/heavy';
import { createHeavyStore } from '../client/heavy-data';

export const queueJson = { schema: 1, mode: 'round-robin', paused: false, slots: [{ name: 'main',
  running: { id: 'RUN', supervisor: 'sup-run', queued: 100, started: 200, state: 'alive' },
  waiting: [{ id: 'A1', supervisor: 'sup-a', queued: 300, state: 'alive' }], turns: ['A1'] }] };
const fail = (code: unknown) => Object.assign(new Error('실패'), { code });

describe('HeavyReader', () => {
  it('JSON을 읽고 모르는 필드는 버린다', async () => {
    const reader = new HeavyReader(async () => JSON.stringify({ ...queueJson, extra: 'x' }), () => 5000);
    const result = await reader.get();
    expect(result).toEqual({ status: 'ok', sampledAt: 5000, queue: queueJson });
    expect(heavyResultSchema.parse(result)).toEqual(result);
  });
  it.each([
    ['없음', async () => { throw fail('ENOENT'); }, 'missing'],
    ['모르는 인수로 거절', async () => { throw fail(2); }, 'unsupported'],
    ['시간 초과', async () => { throw fail(null); }, 'error'],
    ['구버전의 사람용 문장', async () => '모드: round-robin, 신규 제출: 허용\n', 'unsupported'],
    ['다른 schema', async () => JSON.stringify({ ...queueJson, schema: 2 }), 'unsupported'],
  ])('%s', async (_name, run, status) => {
    expect(await new HeavyReader(run as () => Promise<string>, () => 1).get()).toEqual({ status, sampledAt: 1, queue: null });
  });
  it('동시 요청을 합치고 10초 동안 재사용한 뒤 다시 읽는다', async () => {
    let now = 1000;
    const run = vi.fn(async () => JSON.stringify(queueJson));
    const reader = new HeavyReader(run, () => now);
    await Promise.all([reader.get(), reader.get()]);
    now += 9_999; await reader.get();
    expect(run).toHaveBeenCalledTimes(1);
    now += 1; await reader.get();
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('createHeavyStore', () => {
  afterEach(() => vi.useRealTimers());
  it('가장 짧은 구독 간격 하나로 읽고, 구독이 없으면 멈춘다', async () => {
    vi.useFakeTimers();
    const call = vi.fn(async () => ({ status: 'ok' as const, sampledAt: 1, queue: null }));
    const store = createHeavyStore(call);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(call).not.toHaveBeenCalled();
    const offSidebar = store.subscribe(() => {}, 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(call).toHaveBeenCalledTimes(2);
    const offCard = store.subscribe(() => {}, 15_000);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(call).toHaveBeenCalledTimes(5);
    offCard(); offSidebar();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(call).toHaveBeenCalledTimes(5);
  });
  it('실패하면 마지막 값을 유지하고 stop 뒤에는 바뀌지 않는다', async () => {
    vi.useFakeTimers();
    const data = { status: 'ok' as const, sampledAt: 1, queue: null };
    const call = vi.fn().mockResolvedValueOnce(data).mockRejectedValue(new Error('끊김'));
    const store = createHeavyStore(call);
    store.subscribe(() => {}, 15_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get()).toEqual({ data, failed: false });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(store.get()).toEqual({ data, failed: true });
    store.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
