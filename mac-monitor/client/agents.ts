import { useEffect, useState } from 'react';
import { getPaseoClient, type PluginHostSummary } from '@getpaseo/plugin/client';

type Agent = { id: string; status: string; archivedAt?: unknown };
type Named = { id: string; title?: string | null };
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

// 선택한 호스트의 에이전트 이름. useAgent는 workspace 패널 밖(화면)에서 예외를 던지므로 쓰지 않는다.
export function useAgentNames(serverId: string): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const lifetime = new AbortController(); let stopped = false;
    setNames({});
    const known = new Map<string, string>();
    const add = (agent: Named) => { if (agent.title) known.set(agent.id, agent.title); };
    const publish = () => { if (!stopped) setNames(Object.fromEntries(known)); };
    try {
      void getPaseoClient(serverId).agents.list({ subscribe: {}, includeBackground: true, page: { limit: 200 }, signal: lifetime.signal }).then(({ subscription, entries }) => {
        if (stopped) return;
        for (const { agent } of entries) add(agent); publish();
        subscription?.subscribe({
          snapshot: ({ entries }) => { known.clear(); for (const { agent } of entries) add(agent); publish(); },
          update: message => {
            if (message.type !== 'agent_update') return;
            const value = message.payload; if (value.kind === 'remove') known.delete(value.agentId); else add(value.agent); publish();
          },
        });
      }).catch(() => {}); // 이름을 못 읽으면 ID로 표시한다.
    } catch { /* 연결되지 않은 호스트 */ }
    return () => { stopped = true; lifetime.abort(); };
  }, [serverId]);
  return names;
}
