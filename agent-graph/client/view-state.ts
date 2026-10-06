import type { AgentKey, Scope } from '../shared/types';
import type { GraphLayout } from '../shared/layout';
type Listener = () => void;
export type ViewState = {
  scope: Scope; mode: 'graph' | 'tree'; selected: AgentKey | null; collapsed: ReadonlySet<AgentKey>;
  zoom: number; initialized: boolean; message: string | null; focus: number; forceFitted: boolean;
};
// 함수와 closure를 사용해 모바일에 전달되는 번들에도 미변환 클래스 문법을 남기지 않는다.
export function createGraphViewState(forceCache = new Map<string, GraphLayout>()) {
  let state: ViewState = { scope: 'group', mode: 'graph', selected: null, collapsed: new Set(), zoom: 1, initialized: false, message: null, focus: 0, forceFitted: false };
  const listeners = new Set<Listener>();
  const scroll = { modal: { x: 0, y: 0 }, panel: { x: 0, y: 0 } };
  const scrollInitialized = { modal: false, panel: false };
  const getSnapshot = () => state;
  const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const set = (patch: Partial<ViewState>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const toggle = (key: AgentKey) => {
    const collapsed = new Set(state.collapsed);
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    set({ collapsed });
  };
  const zoomTo = (value: number) => set({ zoom: Math.max(0.03, Math.min(1.5, value)), forceFitted: true });
  return { forceCache, scroll, scrollInitialized, getSnapshot, subscribe, set, toggle, zoomTo };
}
export type GraphViewState = ReturnType< typeof createGraphViewState>;
export function createGraphViews() {
  const states = new Map<AgentKey, GraphViewState>();
  const forceCache = new Map<string, GraphLayout>();
  const forAgent = (hostId: string, workspaceId: string, agentId: string) => {
    const key = JSON.stringify([hostId, workspaceId, agentId]);
    let state = states.get(key);
    if (!state) { state = createGraphViewState(forceCache); states.set(key, state); }
    return state;
  };
  const dispose = () => { states.clear(); forceCache.clear(); };
  return { forAgent, dispose };
}
export type GraphViews = ReturnType< typeof createGraphViews>;
