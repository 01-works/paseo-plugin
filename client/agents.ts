import { useEffect, useState } from 'react';
import { getPaseoClient, type PluginHostSummary } from '@getpaseo/plugin/client';

type Agent = { id: string; status: string; archivedAt?: unknown };
export type AgentCounts = { running: number; idle: number; other: number; error?: string };
export function countAgents(agents: Iterable<Agent>): AgentCounts {
  const counts: AgentCounts = { running: 0, idle: 0, other: 0 };
  for (const agent of agents) { if (agent.archivedAt) continue; if (agent.status === 'running') counts.running++; else if (agent.status === 'idle') counts.idle++; else if (agent.status !== 'closed') counts.other++; }
  return counts;
}
export function useAgentCounts(hosts: readonly PluginHostSummary[]) {
  const [counts, setCounts] = useState<Record<string, AgentCounts>>({});
  const key = hosts.map(host => `${host.serverId}:${host.status}`).join('|');
  useEffect(() => {
    const lifetime = new AbortController(); let stopped = false;
    setCounts({});
    for (const host of hosts) {
      if (host.status !== 'online') continue;
      const agents = new Map<string, Agent>();
      const publish = () => { if (!stopped) setCounts(old => ({ ...old, [host.serverId]: countAgents(agents.values()) })); };
      try {
        void getPaseoClient(host.serverId).agents.list({ subscribe: {}, signal: lifetime.signal }).then(({ subscription, entries }) => {
          if (stopped) return;
          for (const { agent } of entries) agents.set(agent.id, agent); publish();
          subscription?.subscribe({
            snapshot: ({ entries }) => { agents.clear(); for (const { agent } of entries) agents.set(agent.id, agent); publish(); },
            update: message => {
              if (message.type !== 'agent_update') return;
              const value = message.payload; if (value.kind === 'remove') agents.delete(value.agentId); else agents.set(value.agent.id, value.agent); publish();
            },
          });
        }).catch(error => { if (!stopped) setCounts(old => ({ ...old, [host.serverId]: { running: 0, idle: 0, other: 0, error: String(error) } })); });
      } catch (error) { setCounts(old => ({ ...old, [host.serverId]: { running: 0, idle: 0, other: 0, error: String(error) } })); }
    }
    return () => { stopped = true; lifetime.abort(); };
  }, [key]);
  return counts;
}
