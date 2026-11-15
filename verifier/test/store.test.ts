import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStatusStore } from '../client/store';

afterEach(() => vi.useRealTimers());

describe('status store', () => {
  it('polls only while viewed and asks GitHub only for screen viewers', async () => {
    vi.useFakeTimers();
    const call = vi.fn(async (input: { includeGithub: boolean }) => ({ input }) as never);
    const store = createStatusStore(call, 1000);
    const detachRow = store.attach(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenLastCalledWith({ includeGithub: false, refresh: false });
    const detachScreen = store.attach(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenLastCalledWith({ includeGithub: true, refresh: false });
    await vi.advanceTimersByTimeAsync(1000);
    expect(call).toHaveBeenCalledTimes(3);
    detachScreen();
    detachRow();
    await vi.advanceTimersByTimeAsync(5000);
    expect(call).toHaveBeenCalledTimes(3);
    store.dispose();
  });

  it('keeps the last data when a poll fails', async () => {
    let fail = false;
    const store = createStatusStore(async () => {
      if (fail) throw new Error('rpc down');
      return { collectedAt: 'x' } as never;
    });
    await store.refresh();
    fail = true;
    await store.refresh();
    expect(store.getState()).toMatchObject({ data: { collectedAt: 'x' }, error: 'rpc down', loading: false });
    store.dispose();
  });
});
