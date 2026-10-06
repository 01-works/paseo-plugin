import type { OwnedSubscription, PaseoApi, PaseoAgent, PaseoAgentListResult } from '@getpaseo/client';
import { normalizeAgent, sameAgent } from './normalize';
import type { Agent, AgentKey } from '../shared/types';
import { buildForest } from '../shared/forest';

export type DirectorySnapshot = {
  agents: readonly Agent[]; loaded: boolean; loading: boolean; partial: boolean; stale: boolean; error: string | null;
};
type Listener = () => void;
type Delta = Agent | null;
type StartResult = unknown;
const MAX_AGENTS = 2000, PAGE_SIZE = 200;

/** 페이지 snapshot은 유한하지만 이 버전의 update는 전체 필터를 관찰한다. */
export class AgentDirectory {
  private agents = new Map<AgentKey, Agent>();
  private listeners = new Set<Listener>();
  private lifetime = new AbortController();
  private pageAbort: AbortController | undefined;
  private lease: OwnedSubscription<PaseoAgentListResult> | undefined;
  private observer: Listener | undefined;
  private starting: Promise<StartResult> | undefined;
  private retrying: Promise<StartResult> | undefined;
  private generation = 0;
  private deltas = new Map<AgentKey, Delta>();
  private hydrating = false;
  private deltaOverflow = false;
  private disposed = false;
  private viewers = 0;
  private batch: ReturnType<(typeof setTimeout)> | undefined;
  private watchTimer: ReturnType<(typeof setInterval)> | undefined;
  private snapshot: DirectorySnapshot = { agents: [], loaded: false, loading: true, partial: false, stale: false, error: null };
  private forestAgents: readonly Agent[] | undefined;
  private forest = buildForest([], '');
  constructor(private api: PaseoApi, readonly hostId: string) {}
  getSnapshot = () => this.snapshot;
  getForest = () => {
    if (this.forestAgents !== this.snapshot.agents) {
      this.forestAgents = this.snapshot.agents; this.forest = buildForest(this.snapshot.agents, this.hostId);
    }
    return this.forest;
  };
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private emit(patch: Partial<DirectorySnapshot> = {}) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch, agents: [...this.agents.values()] };
    for (const listener of this.listeners) listener();
  }
  private schedule() {
    if (this.batch || this.disposed) return;
    this.batch = setTimeout(() => { this.batch = undefined; this.emit(); }, 250);
  }
  watch = () => {
    this.viewers++;
    if (!this.watchTimer && !this.disposed) {
      // 로컬 lease 상태만 확인한다. 네트워크 조회·heartbeat를 만들지 않는다.
      this.watchTimer = setInterval(() => {
        if (this.lease && this.lease.subscriptionId === null && !this.snapshot.stale) {
          this.generation++; this.pageAbort?.abort(); this.hydrating = false;
          this.emit({ stale: true, loading: false });
        }
      }, 1000);
    }
    return () => {
      this.viewers = Math.max(0, this.viewers - 1);
      if (!this.viewers) { clearInterval(this.watchTimer); this.watchTimer = undefined; }
    };
  };
  start = () => {
    if (this.disposed || this.starting || this.lease) return this.starting ?? Promise.resolve();
    this.emit({ loading: true, error: null });
    this.starting = this.api.agents.list({
      filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'desc' }],
      page: { limit: PAGE_SIZE }, subscribe: {}, signal: this.lifetime.signal,
    }).then(result => {
      if (this.disposed) { void result.subscription.release().catch(() => {}); return; }
      this.lease = result.subscription;
      this.observer = result.subscription.subscribe({
        snapshot: value => { void this.bootstrap(value); },
        update: message => {
          if (message.type !== 'agent_update' || this.disposed) return;
          const update = message.payload;
          if (update.kind === 'remove') this.remove(update.agentId);
          else this.upsert(update.agent);
        },
        error: () => { this.generation++; this.pageAbort?.abort(); this.hydrating = false; this.emit({ stale: true, loading: false, error: '목록 갱신 실패' }); },
      });
    }).catch(() => { this.emit({ stale: true, loading: false, error: '에이전트 목록을 읽지 못했습니다' }); })
      .finally(() => { this.starting = undefined; });
    return this.starting;
  };
  private put(target: Map<AgentKey, Agent>, agent: Agent) {
    const old = target.get(agent.key);
    if (old && old.updatedAt > agent.updatedAt) return false;
    if (agent.archived) return target.delete(agent.key);
    if (!old && target.size >= MAX_AGENTS) return false;
    target.set(agent.key, agent); return !sameAgent(old, agent);
  }
  private upsert(raw: PaseoAgent) {
    const agent = normalizeAgent(raw, this.hostId);
    if ((this.agents.get(agent.key)?.updatedAt ?? '') > agent.updatedAt) return;
    if (this.hydrating) this.recordDelta(agent.key, agent.archived ? null : agent);
    if (!this.agents.has(agent.key) && this.agents.size >= MAX_AGENTS && !agent.archived) {
      if (!this.snapshot.partial) this.emit({ partial: true });
      return;
    }
    if (this.put(this.agents, agent)) this.schedule();
  }
  private remove(id: string) {
    const key = JSON.stringify([this.hostId, id]);
    if (this.hydrating) this.recordDelta(key, null);
    if (this.agents.delete(key)) this.schedule();
  }
  private recordDelta(key: AgentKey, delta: Delta) {
    if (this.deltas.has(key) || this.deltas.size < MAX_AGENTS * 2) this.deltas.set(key, delta);
    else this.deltaOverflow = true;
  }
  private async bootstrap(first: PaseoAgentListResult) {
    const generation = ++this.generation;
    this.pageAbort?.abort(); this.pageAbort = new AbortController();
    const signal = this.pageAbort.signal;
    this.hydrating = true; this.deltas = new Map(); this.deltaOverflow = false;
    const collected = new Map<AgentKey, Agent>();
    let page = first, pages = 1;
    const ingest = (value: PaseoAgentListResult) => {
      for (const { agent } of value.entries) this.put(collected, normalizeAgent(agent, this.hostId));
    };
    ingest(first);
    if (!this.snapshot.loaded) this.agents = new Map(collected);
    this.emit({ loaded: true, loading: first.pageInfo.hasMore, stale: false, error: null,
      partial: first.pageInfo.hasMore || this.snapshot.partial });
    try {
      const seen = new Set<AgentKey>();
      while (page.pageInfo.hasMore && page.pageInfo.nextCursor && pages < 10) {
        const cursor = page.pageInfo.nextCursor;
        if (seen.has(cursor)) throw new Error('반복 cursor');
        seen.add(cursor);
        page = await this.api.agents.list({
          filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'desc' }],
          page: { limit: PAGE_SIZE, cursor }, signal,
        });
        if (this.disposed || generation !== this.generation) return;
        ingest(page); pages++;
      }
      if (this.disposed || generation !== this.generation) return;
      if (this.deltaOverflow) {
        this.hydrating = false; this.deltas.clear();
        this.emit({ loading: false, partial: true, error: '업데이트가 많아 목록 일부만 표시합니다' });
        return;
      }
      let overflow = false;
      for (const [key, delta] of this.deltas) {
        if (!delta) collected.delete(key);
        else if (collected.size < MAX_AGENTS || collected.has(key)) this.put(collected, delta);
        else overflow = true;
      }
      this.agents = collected; this.hydrating = false; this.deltas.clear();
      clearTimeout(this.batch); this.batch = undefined;
      this.emit({ loaded: true, loading: false, partial: page.pageInfo.hasMore || overflow, stale: this.lease?.subscriptionId === null, error: null });
    } catch {
      if (this.disposed || generation !== this.generation) return;
      // 전부 읽지 못해도 캐시를 버리지 않는다. 첫 페이지와 살아 있는 update를 병합한다.
      if (!this.deltaOverflow) {
        for (const [key, delta] of this.deltas) {
          if (!delta) collected.delete(key); else this.put(collected, delta);
        }
        for (const agent of collected.values()) this.put(this.agents, agent);
      }
      this.hydrating = false; this.deltas.clear();
      this.emit({ loading: false, partial: true, error: '목록 일부를 읽지 못했습니다' });
    }
  }
  retry = () => {
    if (this.disposed || this.starting) return this.starting ?? Promise.resolve();
    if (this.retrying) return this.retrying;
    this.emit({ loading: true });
    this.retrying = (async () => {
      this.generation++; this.pageAbort?.abort(); this.observer?.(); this.observer = undefined;
      const lease = this.lease; this.lease = undefined;
      await lease?.release().catch(() => {});
      if (!this.disposed) await this.start();
    })().finally(() => { this.retrying = undefined; });
    return this.retrying;
  };
  dispose = async () => {
    if (this.disposed) return;
    this.disposed = true; this.generation++; this.lifetime.abort(); this.pageAbort?.abort();
    clearTimeout(this.batch); clearInterval(this.watchTimer);
    this.observer?.(); this.listeners.clear();
    await this.lease?.release().catch(() => {});
    await this.retrying?.catch(() => {});
    this.agents.clear();
  };
}
