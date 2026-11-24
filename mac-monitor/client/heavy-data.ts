import { useCallback, useSyncExternalStore } from 'react';
import type { HeavyResult } from '../shared/heavy';

export type HeavyState = { data?: HeavyResult; failed: boolean };
const EMPTY: HeavyState = { failed: false };

// 사이드바와 대시보드가 한 타이머를 공유한다. 구독이 없으면 조회하지 않는다.
export function createHeavyStore(call: () => Promise<HeavyResult>) {
  let state = EMPTY, fetching = false, stopped = false;
  let timer: ReturnType<(typeof setInterval)> | undefined, period: number | undefined;
  const listeners = new Map<() => void, number>();
  const refresh = async () => {
    if (fetching || stopped) return;
    fetching = true;
    try { const data = await call(); if (!stopped) state = { data, failed: false }; }
    catch { if (!stopped) state = { ...state, failed: true }; }
    finally { fetching = false; if (!stopped) for (const listener of listeners.keys()) listener(); }
  };
  const schedule = () => {
    const next = listeners.size ? Math.min(...listeners.values()) : undefined;
    if (next === period) return;
    clearInterval(timer); period = next;
    timer = next === undefined ? undefined : setInterval(() => void refresh(), next);
  };
  return {
    get: () => state,
    subscribe(listener: () => void, interval: number) {
      if (stopped) return () => {};
      listeners.set(listener, interval); schedule(); void refresh();
      return () => { listeners.delete(listener); schedule(); };
    },
    stop() { stopped = true; listeners.clear(); clearInterval(timer); timer = undefined; period = undefined; },
  };
}
let store: ReturnType<(typeof createHeavyStore)> | undefined;
export function configureHeavy(call: () => Promise<HeavyResult>): () => void {
  const own = createHeavyStore(call); store = own;
  return () => { own.stop(); if (store === own) store = undefined; };
}
export function useHeavy(interval: number): HeavyState {
  const own = store;
  const subscribe = useCallback((listener: () => void) => own ? own.subscribe(listener, interval) : () => {}, [own, interval]);
  return useSyncExternalStore(subscribe, () => own ? own.get() : EMPTY);
}
