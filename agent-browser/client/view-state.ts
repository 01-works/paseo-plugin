import type { AgentSort } from '../shared/browser';
type Listener = () => void;
export type BrowserState = { browserSort: AgentSort; browserQuery: string };

// 0.10.2의 모바일 번들에서도 미변환 클래스 문법을 남기지 않는다.
export function createBrowserViewState() {
  let state: BrowserState = { browserSort: 'updated', browserQuery: '' };
  const listeners = new Set<Listener>();
  const browserScroll = { modal: 0 };
  const getSnapshot = () => state;
  const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const set = (patch: Partial<BrowserState>) => {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof BrowserState] === value)) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  return { browserScroll, getSnapshot, subscribe, set };
}
export type BrowserViewState = ReturnType< typeof createBrowserViewState>;
export function createBrowserViews() {
  const states = new Map<string, BrowserViewState>();
  const forAgent = (hostId: string, workspaceId: string, agentId: string) => {
    const key = JSON.stringify([hostId, workspaceId, agentId]);
    let state = states.get(key);
    if (!state) { state = createBrowserViewState(); states.set(key, state); }
    return state;
  };
  const dispose = () => { states.clear(); };
  return { forAgent, dispose };
}
export type BrowserViews = ReturnType< typeof createBrowserViews>;
