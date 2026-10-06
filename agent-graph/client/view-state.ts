import type { AgentKey, Scope } from '../shared/types';
type Listener = () => void;
export type ViewState = {
  scope: Scope; mode: 'graph' | 'tree'; selected: AgentKey | null; collapsed: ReadonlySet<AgentKey>;
  zoom: number; initialized: boolean; message: string | null; focus: number;
};
export class GraphViewState {
  private state: ViewState = { scope: 'group', mode: 'graph', selected: null, collapsed: new Set(), zoom: 1, initialized: false, message: null, focus: 0 };
  private listeners = new Set<Listener>();
  readonly scroll = { modal: { x: 0, y: 0 }, panel: { x: 0, y: 0 } };
  readonly scrollInitialized = { modal: false, panel: false };
  getSnapshot = () => this.state;
  subscribe = (listener: Listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set = (patch: Partial<ViewState>) => { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); };
  toggle = (key: AgentKey) => {
    const collapsed = new Set(this.state.collapsed);
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    this.set({ collapsed });
  };
  zoomTo = (value: number) => this.set({ zoom: Math.max(0.75, Math.min(1.5, value)) });
}
export class GraphViews {
  private states = new Map<AgentKey, GraphViewState>();
  forAgent(hostId: string, workspaceId: string, agentId: string) {
    const key = JSON.stringify([hostId, workspaceId, agentId]);
    let state = this.states.get(key);
    if (!state) { state = new GraphViewState(); this.states.set(key, state); }
    return state;
  }
  dispose() { this.states.clear(); }
}
