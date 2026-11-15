import { useEffect, useSyncExternalStore } from 'react';
import type { VerifierStatus } from '../shared/contracts';

type Call = (input: { includeGithub: boolean; refresh?: boolean }) => Promise<VerifierStatus>;

export interface StoreState {
  data?: VerifierStatus;
  error?: string;
  loading: boolean;
}

const POLL_MS = 30_000;

/** 사이드바와 화면이 같은 폴링 하나를 나눠 쓴다. 구독자가 없으면 멈춘다. */
export function createStatusStore(call: Call, pollMs = POLL_MS) {
  let state: StoreState = { loading: false };
  const listeners = new Set<() => void>();
  let viewers = 0;
  let githubViewers = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let flight: Promise<void> | undefined;
  let disposed = false;

  const emit = (next: StoreState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const fetchNow = (refresh = false): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (flight && !refresh) return flight;
    emit({ ...state, loading: true });
    const own = call({ includeGithub: githubViewers > 0, refresh })
      .then(data => emit({ data, loading: false }))
      .catch(error => emit({ ...state, error: error instanceof Error ? error.message : String(error), loading: false }))
      .finally(() => {
        if (flight === own) flight = undefined;
      });
    flight = own;
    return own;
  };

  const updateTimer = () => {
    if (viewers > 0 && !timer && !disposed) timer = setInterval(() => void fetchNow(), pollMs);
    if ((viewers === 0 || disposed) && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** 화면·행 하나가 보이는 동안 폴링을 유지한다. GitHub 정보는 화면만 요청한다. */
    attach(github: boolean) {
      viewers++;
      if (github) githubViewers++;
      updateTimer();
      const needsGithub = github && !state.data?.github && !state.data?.githubError;
      if (!state.data || needsGithub) void fetchNow();
      return () => {
        viewers--;
        if (github) githubViewers--;
        updateTimer();
      };
    },
    refresh: () => fetchNow(true),
    dispose() {
      disposed = true;
      updateTimer();
      listeners.clear();
    },
  };
}

export type StatusStore = ReturnType<typeof createStatusStore>;

export function useStatus(store: StatusStore, github: boolean): StoreState {
  useEffect(() => store.attach(github), [store, github]);
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
