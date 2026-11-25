import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeavyReader, parseDirectories } from '../server/heavy';
import { heavyResultSchema } from '../shared/heavy';
import { createHeavyStore } from '../client/heavy-data';

export const queueJson = { schema: 1, mode: 'round-robin', paused: false, slots: [{ name: 'main',
  running: { id: 'RUN', pid: 11, supervisor: 'sup-run', queued: 100, started: 200, state: 'alive' },
  waiting: [{ id: 'A1', pid: 12, supervisor: 'sup-a', queued: 300, state: 'alive' }], turns: ['A1'] }] };
const fail = (code: unknown) => Object.assign(new Error('실패'), { code });

describe('HeavyReader', () => {
  it('JSON을 읽고 모르는 필드는 버린다', async () => {
    const reader = new HeavyReader(async () => JSON.stringify({ ...queueJson, extra: 'x' }), () => 5000, async () => new Map());
    const result = await reader.get();
    expect(result).toMatchObject({ status: 'ok', sampledAt: 5000, queue: queueJson });
    expect(result.queue).not.toHaveProperty('extra');
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
  it('살아 있는 프로세스의 작업 폴더만 붙이고, 조회가 실패하거나 pid가 없어도 나머지를 보인다', async () => {
    const item = (id: string, pid: number | undefined, state = 'alive') => ({ id, pid, supervisor: null, queued: 1, state });
    const json = JSON.stringify({ ...queueJson, slots: [{ ...queueJson.slots[0], waiting: [item('A', 21), item('D', 22, 'dead:esrch'), item('OLD', undefined)] }] });
    const asked: number[][] = [];
    const ok = await new HeavyReader(async () => json, () => 1, async pids => { asked.push(pids); return new Map([[11, '/run'], [21, '/a b']]); }).get();
    expect(asked).toEqual([[11, 21]]);
    expect([ok.queue!.slots[0].running!.directory, ...ok.queue!.slots[0].waiting.map(w => w.directory)]).toEqual(['/run', '/a b', null, null]);
    const failed = await new HeavyReader(async () => json, () => 1, async () => { throw new Error('lsof 없음'); }).get();
    expect(failed.status).toBe('ok'); expect(failed.queue!.slots[0].waiting.map(w => w.directory)).toEqual([null, null, null]);
  });
  it('잘못된 pid 하나가 전체 현황을 가리지 않는다', async () => {
    const json = JSON.stringify({ ...queueJson, slots: [{ ...queueJson.slots[0], waiting: [{ id: 'Z', pid: 0, supervisor: null, queued: 1, state: 'unknown' }] }] });
    const result = await new HeavyReader(async () => json, () => 1, async () => new Map()).get();
    expect(result.status).toBe('ok'); expect(result.queue!.slots[0].waiting[0].pid).toBeNull();
  });
  it('lsof -Fpn 출력에서 폴더만 읽는다', () => {
    expect([...parseDirectories('p42\nfcwd\nn/repo')]).toEqual([]);
    expect([...parseDirectories('p11\nfcwd\nn/a b/c\np12\nfcwd\nnpermission denied\n\n')]).toEqual([[11, '/a b/c']]);
  });
  it('동시 요청을 합치고 10초 동안 재사용한 뒤 다시 읽는다', async () => {
    let now = 1000;
    const run = vi.fn(async () => JSON.stringify(queueJson));
    const reader = new HeavyReader(run, () => now, async () => new Map());
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
