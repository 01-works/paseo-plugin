import type { PluginCommandCapabilities } from '@getpaseo/plugin/client';

let sequence = 0;
const pending = new Set<string>();
export function openAgentScreen(context: PluginCommandCapabilities, serverId: string, agentId: string) {
  const requestId = `${Date.now()}-${++sequence}`;
  pending.add(requestId);
  context.openScreen({ screenId: 'open-agent', params: { serverId, agentId, requestId } });
}
export const consumeOpen = (requestId?: string) => !!requestId && pending.delete(requestId);
