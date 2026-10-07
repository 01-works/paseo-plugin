import type { OwnedSubscription, PaseoApi, PaseoAgent, PaseoAgentListResult } from '@getpaseo/client';
import { normalizeAgent, sameAgent } from './normalize';
import type { Agent, AgentKey } from '../shared/types';

export type DirectorySnapshot = {
  agents: readonly Agent[]; loaded: boolean; loading: boolean; partial: boolean; stale: boolean; error: string | null;
};
type Listener = () => void;
type Delta = Agent | null;
type StartResult = unknown;
const MAX_AGENTS = 2000, PAGE_SIZE = 200;

/** 페이지 snapshot은 유한하지만 이 버전의 update는 전체 필터를 관찰한다. */
// 0.10.2의 client 번들은 Babel을 거치지 않는다. iOS Hermes가 읽을 수 있도록 함수로 생성한다.
export function createAgentDirectory(api: PaseoApi, hostId: string) {
  let agents = new Map<AgentKey, Agent>();
  const listeners = new Set<Listener>();
  const lifetime = new AbortController();
  let pageAbort: AbortController | undefined;
  let lease: OwnedSubscription<PaseoAgentListResult> | undefined;
  let observer: Listener | undefined;
  let starting: Promise<StartResult> | undefined;
  let retrying: Promise<StartResult> | undefined;
  let generation = 0;
  let deltas = new Map<AgentKey, Delta>();
  let hydrating = false;
  let deltaOverflow = false;
  let disposed = false;
  let viewers = 0;
  let batch: ReturnType<(typeof setTimeout)> | undefined;
  let watchTimer: ReturnType<(typeof setInterval)> | undefined;
  let snapshot: DirectorySnapshot = { agents: [], loaded: false, loading: true, partial: false, stale: false, error: null };
  const getSnapshot = () => snapshot;
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  };
  function emit(patch: Partial<DirectorySnapshot> = {}) {
    if (disposed) return;
    snapshot = { ...snapshot, ...patch, agents: [...agents.values()] };
    for (const listener of listeners) listener();
  }
  function schedule() {
    if (batch || disposed) return;
    batch = setTimeout(() => { batch = undefined; emit(); }, 250);
  }
  const watch = () => {
    viewers++;
    if (!watchTimer && !disposed) {
      // 로컬 lease 상태만 확인한다. 네트워크 조회·heartbeat를 만들지 않는다.
      watchTimer = setInterval(() => {
        if (lease && lease.subscriptionId === null && !snapshot.stale) {
          generation++; pageAbort?.abort(); hydrating = false;
          emit({ stale: true, loading: false });
        }
      }, 1000);
    }
    return () => {
      viewers = Math.max(0, viewers - 1);
      if (!viewers) { clearInterval(watchTimer); watchTimer = undefined; }
    };
  };
  const start = (): Promise<StartResult> => {
    if (disposed || starting || lease) return starting ?? Promise.resolve();
    emit({ loading: true, error: null });
    starting = api.agents.list({
      filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'desc' }],
      page: { limit: PAGE_SIZE }, subscribe: {}, signal: lifetime.signal,
    }).then(result => {
      if (disposed) { void result.subscription.release().catch(() => {}); return; }
      lease = result.subscription;
      observer = result.subscription.subscribe({
        snapshot: value => { void bootstrap(value); },
        update: message => {
          if (message.type !== 'agent_update' || disposed) return;
          const update = message.payload;
          if (update.kind === 'remove') remove(update.agentId);
          else upsert(update.agent);
        },
        error: () => { generation++; pageAbort?.abort(); hydrating = false; emit({ stale: true, loading: false, error: '목록 갱신 실패' }); },
      });
    }).catch(() => { emit({ stale: true, loading: false, error: '에이전트 목록을 읽지 못했습니다' }); })
      .finally(() => { starting = undefined; });
    return starting;
  };
  function put(target: Map<AgentKey, Agent>, agent: Agent) {
    const old = target.get(agent.key);
    if (old && old.updatedAt > agent.updatedAt) return false;
    if (agent.archived) return target.delete(agent.key);
    if (!old && target.size >= MAX_AGENTS) return false;
    target.set(agent.key, agent); return !sameAgent(old, agent);
  }
  function upsert(raw: PaseoAgent) {
    const agent = normalizeAgent(raw, hostId);
    if ((agents.get(agent.key)?.updatedAt ?? '') > agent.updatedAt) return;
    if (hydrating) recordDelta(agent.key, agent.archived ? null : agent);
    if (!agents.has(agent.key) && agents.size >= MAX_AGENTS && !agent.archived) {
      if (!snapshot.partial) emit({ partial: true });
      return;
    }
    if (put(agents, agent)) schedule();
  }
  function remove(id: string) {
    const key = JSON.stringify([hostId, id]);
    if (hydrating) recordDelta(key, null);
    if (agents.delete(key)) schedule();
  }
  function recordDelta(key: AgentKey, delta: Delta) {
    if (deltas.has(key) || deltas.size < MAX_AGENTS * 2) deltas.set(key, delta);
    else deltaOverflow = true;
  }
  async function bootstrap(first: PaseoAgentListResult) {
    const activeGeneration = ++generation;
    pageAbort?.abort(); pageAbort = new AbortController();
    const signal = pageAbort.signal;
    hydrating = true; deltas = new Map(); deltaOverflow = false;
    const collected = new Map<AgentKey, Agent>();
    let page = first, pages = 1;
    const ingest = (value: PaseoAgentListResult) => {
      for (const { agent } of value.entries) put(collected, normalizeAgent(agent, hostId));
    };
    ingest(first);
    if (!snapshot.loaded) agents = new Map(collected);
    emit({ loaded: true, loading: first.pageInfo.hasMore, stale: false, error: null,
      partial: first.pageInfo.hasMore || snapshot.partial });
    try {
      const seen = new Set<AgentKey>();
      while (page.pageInfo.hasMore && page.pageInfo.nextCursor && pages < 10) {
        const cursor = page.pageInfo.nextCursor;
        if (seen.has(cursor)) throw new Error('반복 cursor');
        seen.add(cursor);
        page = await api.agents.list({
          filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'desc' }],
          page: { limit: PAGE_SIZE, cursor }, signal,
        });
        if (disposed || activeGeneration !== generation) return;
        ingest(page); pages++;
      }
      if (disposed || activeGeneration !== generation) return;
      if (deltaOverflow) {
        hydrating = false; deltas.clear();
        emit({ loading: false, partial: true, error: '업데이트가 많아 목록 일부만 표시합니다' });
        return;
      }
      let overflow = false;
      for (const [key, delta] of deltas) {
        if (!delta) collected.delete(key);
        else if (collected.size < MAX_AGENTS || collected.has(key)) put(collected, delta);
        else overflow = true;
      }
      agents = collected; hydrating = false; deltas.clear();
      clearTimeout(batch); batch = undefined;
      emit({ loaded: true, loading: false, partial: page.pageInfo.hasMore || overflow, stale: lease?.subscriptionId === null, error: null });
    } catch {
      if (disposed || activeGeneration !== generation) return;
      // 전부 읽지 못해도 캐시를 버리지 않는다. 첫 페이지와 살아 있는 update를 병합한다.
      if (!deltaOverflow) {
        for (const [key, delta] of deltas) {
          if (!delta) collected.delete(key); else put(collected, delta);
        }
        for (const agent of collected.values()) put(agents, agent);
      }
      hydrating = false; deltas.clear();
      emit({ loading: false, partial: true, error: '목록 일부를 읽지 못했습니다' });
    }
  }
  const retry = (): Promise<StartResult> => {
    if (disposed || starting) return starting ?? Promise.resolve();
    if (retrying) return retrying;
    emit({ loading: true });
    retrying = (async () => {
      generation++; pageAbort?.abort(); observer?.(); observer = undefined;
      const oldLease = lease; lease = undefined;
      await oldLease?.release().catch(() => {});
      if (!disposed) await start();
    })().finally(() => { retrying = undefined; });
    return retrying;
  };
  const dispose = async () => {
    if (disposed) return;
    disposed = true; generation++; lifetime.abort(); pageAbort?.abort();
    clearTimeout(batch); clearInterval(watchTimer);
    observer?.(); listeners.clear();
    await lease?.release().catch(() => {});
    await retrying?.catch(() => {});
    agents.clear();
  };
  return { hostId, getSnapshot, subscribe, watch, start, retry, dispose };
}
export type AgentDirectory = ReturnType< typeof createAgentDirectory>;
