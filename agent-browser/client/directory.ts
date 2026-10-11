import type { AgentSubscription, PaseoApi, PaseoAgent, PaseoAgentListResult } from './paseo-types';
import { normalizeAgent, sameAgent } from './normalize';
import type { Agent, AgentKey } from '../shared/types';
import { isCleanupCandidate, type CleanupPlan, type CleanupOutcome, type CleanupResult } from '../shared/cleanup';

export type DirectorySnapshot = {
  agents: readonly Agent[]; loaded: boolean; loading: boolean; partial: boolean; stale: boolean; error: string | null;
};
type Listener = () => void;
type Delta = Agent | null;
type StartResult = unknown;
const MAX_AGENTS = 2000, PAGE_SIZE = 200;
const actionError = (message: string) => Object.assign(new Error(message), { name: 'AgentActionError' });

/** 페이지 snapshot은 유한하지만 이 버전의 update는 전체 필터를 관찰한다. */
// 0.10.2의 client 번들은 Babel을 거치지 않는다. iOS Hermes가 읽을 수 있도록 함수로 생성한다.
export function createAgentDirectory(api: PaseoApi, hostId: string) {
  let agents = new Map<AgentKey, Agent>();
  const listeners = new Set<Listener>();
  const lifetime = new AbortController();
  let pageAbort: AbortController | undefined;
  let lease: AgentSubscription | undefined;
  let observer: Listener | undefined;
  let starting: Promise<StartResult> | undefined;
  let retrying: Promise<StartResult> | undefined;
  let startRetryTimer: ReturnType<(typeof setTimeout)> | undefined;
  let startRetryDelay = 1000;
  let generation = 0;
  let deltas = new Map<AgentKey, Delta>();
  let hydrating = false;
  let deltaOverflow = false;
  let disposed = false;
  let viewers = 0;
  let batch: ReturnType<(typeof setTimeout)> | undefined;
  let watchTimer: ReturnType<(typeof setInterval)> | undefined;
  let snapshot: DirectorySnapshot = { agents: [], loaded: false, loading: true, partial: false, stale: false, error: null };
  const archiving = new Map< string, Promise< void>>();
  let cleanupTask: Promise<CleanupResult> | undefined;
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
  function clearStartRetry() {
    clearTimeout(startRetryTimer); startRetryTimer = undefined;
  }
  function scheduleStartRetry() {
    if (disposed || lease || startRetryTimer !== undefined) return;
    // 첫 목록을 받기 전에는 pill도 없다. 구독 수립 실패만 늦춰 재시도한다.
    startRetryTimer = setTimeout(() => { startRetryTimer = undefined; void start(); }, startRetryDelay);
    startRetryDelay = Math.min(startRetryDelay * 2, 30000);
  }
  const startAttempt = (): Promise<StartResult> => {
    if (disposed || starting || lease) return starting ?? Promise.resolve();
    clearStartRetry();
    emit({ loading: true, error: null });
    starting = api.agents.list({
      filter: { includeArchived: false }, sort: [{ key: 'created_at', direction: 'desc' }],
      page: { limit: PAGE_SIZE }, subscribe: {}, signal: lifetime.signal,
    }).then(result => {
      if (disposed) return result.subscription.release().catch(() => {});
      lease = result.subscription;
      startRetryDelay = 1000;
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
      .finally(() => { starting = undefined; scheduleStartRetry(); });
    return starting;
  };
  const start = (): Promise<StartResult> => retrying ?? startAttempt();
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
    clearStartRetry();
    emit({ loading: true });
    retrying = (async () => {
      generation++; pageAbort?.abort(); observer?.(); observer = undefined;
      const oldLease = lease; lease = undefined;
      await oldLease?.release().catch(() => {});
      if (!disposed) await startAttempt();
    })().finally(() => { retrying = undefined; });
    return retrying;
  };
  // 닫기는 기존 연결의 공개 보관 API를 쓴다. 캐시만 믿고 다른 workspace의 대화를 닫지 않는다.
  const archive = (id: string, workspaceId: string): Promise< void> => {
    if (cleanupTask) return Promise.reject(actionError('오래된 에이전트 정리가 진행 중입니다'));
    const active = agents.get(JSON.stringify([hostId, id]));
    if (disposed || !snapshot.loaded || snapshot.stale) return Promise.reject(actionError('연결 상태를 확인한 뒤 다시 시도해 주세요'));
    if (!active || active.archived || active.workspaceId !== workspaceId) return Promise.reject(actionError('이 대화는 현재 워크스페이스에 없습니다'));
    const pending = archiving.get(id);
    if (pending) return pending;
    const task = (async () => {
      const handle = api.agents.ref(id);
      const result = await handle.refresh();
      const current = result?.agent;
      if (disposed || snapshot.stale) throw actionError('연결 상태를 확인한 뒤 다시 시도해 주세요');
      if (!current || current.id !== id || current.workspaceId !== workspaceId || current.archivedAt) {
        throw actionError('이 대화는 현재 워크스페이스에 없습니다');
      }
      await handle.archive();
      if (!disposed) { remove(id); clearTimeout(batch); batch = undefined; emit(); }
    })().finally(() => { archiving.delete(id); });
    archiving.set(id, task);
    return task;
  };
  const cleanupAvailable = () => !disposed && snapshot.loaded && !snapshot.loading && !snapshot.partial &&
    !snapshot.stale && !snapshot.error && lease?.subscriptionId !== null;
  const cleanup = (plan: CleanupPlan, options: {
    signal?: AbortSignal; onProgress?: (outcomes: readonly CleanupOutcome[]) => void;
  } = {}): Promise<CleanupResult> => {
    if (!cleanupAvailable()) return Promise.reject(actionError('목록을 모두 읽고 연결 상태를 확인한 뒤 다시 시도해 주세요'));
    if (cleanupTask || archiving.size) return Promise.reject(actionError('진행 중인 대화 정리가 끝난 뒤 다시 시도해 주세요'));
    const targets = [...new Map(plan.agents.map(agent => [agent.id, agent])).values()];
    const available = () => cleanupAvailable() && !options.signal?.aborted;
    const hasLinkedChild = (id: string) => [...agents.values()].some(agent => !agent.archived && agent.parentId === id);
    cleanupTask = (async () => {
      const outcomes: CleanupOutcome[] = [];
      const report = (target: Agent, status: CleanupOutcome['status'], message?: string) => {
        outcomes.push({ id: target.id, title: target.title, status, ...(message ? { message } : {}) });
        options.onProgress?.([...outcomes]);
      };
      for (const target of targets) {
        if (!available()) break;
        const cached = agents.get(target.key);
        if (!cached || !isCleanupCandidate(cached, plan)) {
          report(target, 'skipped', '상태나 최근 활동이 바뀌어 제외했습니다'); continue;
        }
        if (hasLinkedChild(target.id)) {
          report(target, 'skipped', '연결된 하위 대화가 남아 있어 제외했습니다'); continue;
        }
        let archiveRequested = false;
        try {
          // 하위를 먼저 보관한 뒤 남은 연결이 없는지 서버에서 확인한다.
          // 새로 생긴 하위·실패한 하위·다른 workspace의 하위도 상위 보관을 막는다.
          const children = await api.agents.list({
            filter: { includeArchived: false, labels: { 'paseo.parent-agent-id': target.id } },
            page: { limit: 1 }, signal: options.signal ?? lifetime.signal,
          });
          if (!available()) break;
          if (children.entries.length || children.pageInfo.hasMore) {
            report(target, 'skipped', '연결된 하위 대화가 남아 있어 제외했습니다'); continue;
          }
          const handle = api.agents.ref(target.id);
          const result = await handle.refresh();
          if (!available()) break;
          const current = result?.agent;
          if (!current || current.id !== target.id) {
            report(target, 'skipped', '이 대화를 찾을 수 없어 제외했습니다'); continue;
          }
          upsert(current);
          const latest = agents.get(target.key);
          if (!isCleanupCandidate(normalizeAgent(current, hostId), plan) || !latest || !isCleanupCandidate(latest, plan)) {
            report(target, 'skipped', '상태나 최근 활동이 바뀌어 제외했습니다'); continue;
          }
          if (hasLinkedChild(target.id)) {
            report(target, 'skipped', '연결된 하위 대화가 남아 있어 제외했습니다'); continue;
          }
          archiveRequested = true;
          await handle.archive();
          if (!disposed) { remove(target.id); clearTimeout(batch); batch = undefined; emit(); }
          report(target, 'archived');
        } catch {
          if (archiveRequested) {
            report(target, 'failed', '보관 결과를 확인하지 못했습니다. 대상을 다시 확인해 주세요');
            if (!available()) break;
            continue;
          }
          if (!available()) break;
          report(target, 'failed', '보관하지 못했습니다. 대상을 다시 확인한 뒤 재시도해 주세요');
        }
      }
      return { outcomes, stopped: outcomes.length < targets.length };
    })().finally(() => { cleanupTask = undefined; });
    return cleanupTask;
  };
  const dispose = async () => {
    if (disposed) return;
    disposed = true; generation++; lifetime.abort(); pageAbort?.abort();
    clearStartRetry();
    clearTimeout(batch); clearInterval(watchTimer);
    observer?.(); listeners.clear();
    await lease?.release().catch(() => {});
    await retrying?.catch(() => {});
    agents.clear();
  };
  return { hostId, getSnapshot, subscribe, watch, start, retry, archive, cleanup, dispose };
}
export type AgentDirectory = ReturnType< typeof createAgentDirectory>;
