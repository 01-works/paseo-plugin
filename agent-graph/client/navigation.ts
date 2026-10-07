import type { PluginClientContext } from '@getpaseo/plugin/client';
export const browserSurfaceId = 'agent-browser';
export type BrowserContext = {
  serverId: string; workspaceId: string; agentId: string; targetId: string; sequence: number;
};
// pill에는 navigation props가 없다. 공개 surface로 이동 의도만 넘기고 그곳에서 openAgent를 호출한다.
export function createAgentNavigation(client: Pick<PluginClientContext, 'openSurface'>) {
  let context: BrowserContext | null = null, sequence = 0, consumed = 0;
  const listeners = new Set<() => void>();
  const getSnapshot = () => context;
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  const open = (input: Omit<BrowserContext, 'sequence'>) => {
    const previous = context;
    context = { ...input, sequence: ++sequence };
    try { client.openSurface(browserSurfaceId); }
    catch (error) { context = previous; throw error; }
    for (const listener of listeners) listener();
  };
  const takeTarget = (current: BrowserContext) => {
    if (current.sequence !== context?.sequence || consumed >= current.sequence) return null;
    consumed = current.sequence;
    return current.targetId;
  };
  const dispose = () => { context = null; consumed = sequence; listeners.clear(); };
  return { getSnapshot, subscribe, open, takeTarget, dispose };
}
export type AgentNavigation = ReturnType< typeof createAgentNavigation>;
