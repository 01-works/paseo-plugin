import type { AgentSort } from '../shared/list';
import type { CleanupDays } from '../shared/cleanup';
type Listener = () => void;
export type ListState = { listSort: AgentSort; listQuery: string; cleanupDays: CleanupDays };

// 0.10.2의 모바일 번들에서도 미변환 클래스 문법을 남기지 않는다.
export function createListViewState() {
  let state: ListState = { listSort: 'updated', listQuery: '', cleanupDays: 7 };
  const listeners = new Set<Listener>();
  const listScroll = { modal: 0 };
  const getSnapshot = () => state;
  const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const set = (patch: Partial<ListState>) => {
    if (Object.entries(patch).every(([key, value]) => state[key as keyof ListState] === value)) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  return { listScroll, getSnapshot, subscribe, set };
}
export type ListViewState = ReturnType< typeof createListViewState>;
export function createListViews() {
  const states = new Map<string, ListViewState>();
  const forAgent = (hostId: string, workspaceId: string, agentId: string) => {
    const key = JSON.stringify([hostId, workspaceId, agentId]);
    let state = states.get(key);
    if (!state) { state = createListViewState(); states.set(key, state); }
    return state;
  };
  const dispose = () => { states.clear(); };
  return { forAgent, dispose };
}
export type ListViews = ReturnType< typeof createListViews>;
