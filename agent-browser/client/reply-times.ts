import type { Agent } from '../shared/types';
import type { PaseoApi } from './paseo-types';

type Timeline = ReturnType<PaseoApi['agents']['ref']>['timeline'];
type Page = Awaited<ReturnType<Timeline['refetch']>>;
type Entry = {
  revision: string; at: string | null; status: 'pending' | 'ready' | 'error';
  version: number; dirty: boolean; fetching: boolean;
  stop?: ReturnType<Timeline['subscribe']>; streamFailed?: boolean;
};
const validTime = (at: string) => Number.isFinite(Date.parse(at));

/** 목록을 연 workspace만 읽는다. 포커스·읽음·이름 변경은 캐시를 무효화하지 않는다. */
export function createReplyTimes(api: PaseoApi, changed: () => void) {
  const cache = new Map<string, Entry>(), viewers = new Map<string, number>();
  let agents: readonly Agent[] = [], connected = false, disposed = false, active = 0;
  const wanted = (agent: Agent) => connected && !agent.archived && Boolean(agent.workspaceId && viewers.get(agent.workspaceId));
  const invalidate = (entry: Entry) => {
    entry.version++; entry.dirty = true; entry.status = 'pending'; entry.streamFailed = false;
  };
  const stopStream = (entry: Entry) => { entry.stop?.(); entry.stop = undefined; };
  function watchStream(agent: Agent, entry: Entry) {
    if (!agent.working || !wanted(agent)) { stopStream(entry); return; }
    if (entry.stop || entry.streamFailed) return;
    try {
      const stop = api.agents.ref(agent.id).timeline.subscribe(message => {
        if (disposed || cache.get(agent.id) !== entry || entry.stop !== stop) return;
        const event = message.event;
        if (event.type === 'replacement' || event.type === 'subscription_restored') {
          if (event.type === 'replacement') entry.at = null;
          invalidate(entry); pump(); changed();
        } else if (event.type === 'error') {
          entry.streamFailed = true; stopStream(entry); entry.status = 'error'; changed();
        } else if (event.type === 'timeline' && event.item.type === 'assistant_message' && event.item.text.trim()) {
          const at = 'timestamp' in message ? message.timestamp : '';
          if (!validTime(at)) return;
          if (!entry.at || Date.parse(at) > Date.parse(entry.at)) { entry.at = at; changed(); }
        }
      });
      entry.stop = stop;
      void stop.ready.catch(() => {
        if (disposed || entry.stop !== stop) return;
        entry.streamFailed = true; stopStream(entry); entry.status = 'error'; changed();
      });
    } catch { entry.streamFailed = true; entry.status = 'error'; }
  }
  async function read(id: string, current: () => boolean): Promise< string | null | undefined> {
    const timeline = api.agents.ref(id).timeline;
    let cursor: Page['startCursor'] = null, epoch: string | undefined;
    const seen = new Set< string>();
    while (current()) {
      const page = await timeline.refetch({ direction: cursor ? 'before' : 'tail', ...(cursor ? { cursor } : {}), limit: 100 });
      if (!current()) return undefined;
      if (page.error || page.gap || page.staleCursor || (epoch && epoch !== page.epoch)) throw new Error('답변 시각 조회 실패');
      epoch = page.epoch;
      // 페이지는 오래된 순서다. 사용자·도구·추론·빈 답변은 제외한다.
      for (let i = page.entries.length - 1; i >= 0; i--) {
        const row = page.entries[i];
        if (row.item.type !== 'assistant_message' || !row.item.text.trim()) continue;
        if (!validTime(row.timestamp)) throw new Error('답변 시각 확인 불가');
        return row.timestamp;
      }
      if (!page.hasOlder) return null;
      cursor = page.startCursor;
      const key = JSON.stringify(cursor);
      if (!cursor || seen.has(key)) throw new Error('답변 이력 페이지 확인 불가');
      seen.add(key);
    }
    return undefined;
  }
  function pump() {
    if (disposed) return;
    for (const agent of agents) {
      if (active >= 3) break;
      const entry = cache.get(agent.id);
      if (!wanted(agent) || !entry?.dirty || entry.fetching) continue;
      entry.dirty = false; entry.fetching = true; active++;
      const version = entry.version;
      const previousAt = entry.at;
      const current = () => !disposed && cache.get(agent.id) === entry && entry.version === version &&
        agents.some(value => value.id === agent.id && wanted(value));
      void Promise.resolve(entry.stop?.ready).catch(() => {}).then(() => read(agent.id, current)).then(at => {
        if (!current() || at === undefined) return;
        // 조회 중 도착한 새 답변을 오래된 페이지로 되돌리지 않는다.
        entry.at = entry.at && entry.at !== previousAt && (!at || Date.parse(entry.at) > Date.parse(at)) ? entry.at : at;
        entry.status = entry.streamFailed ? 'error' : 'ready';
      }).catch(() => { if (current()) entry.status = 'error'; }).finally(() => {
        entry.fetching = false; active--;
        if (!disposed) { changed(); pump(); }
      });
    }
  }
  function sync(values: readonly Agent[], online: boolean) {
    if (disposed) return;
    agents = values; connected = online;
    const ids = new Set(agents.map(agent => agent.id));
    for (const [id, entry] of cache) if (!ids.has(id)) { stopStream(entry); cache.delete(id); }
    for (const agent of agents) {
      let entry = cache.get(agent.id);
      if (!entry && wanted(agent)) {
        entry = { revision: agent.replyRevision, at: null, status: 'pending', version: 0, dirty: true, fetching: false };
        cache.set(agent.id, entry);
      }
      if (!entry) continue;
      if (entry.revision !== agent.replyRevision) { entry.revision = agent.replyRevision; invalidate(entry); }
      if (!wanted(agent) && entry.fetching) invalidate(entry);
      watchStream(agent, entry);
    }
    pump();
  }
  return {
    sync,
    observe(agent: Agent) {
      const entry = cache.get(agent.id);
      if (entry && entry.revision !== agent.replyRevision) { entry.revision = agent.replyRevision; invalidate(entry); }
    },
    reset() { for (const entry of cache.values()) invalidate(entry); },
    decorate: (agent: Agent): Agent => {
      const entry = cache.get(agent.id);
      return { ...agent, lastReplyAt: entry?.at ?? null, replyStatus: entry?.status ?? 'pending' };
    },
    watch(workspaceId: string) {
      const alreadyWatching = Boolean(viewers.get(workspaceId));
      viewers.set(workspaceId, (viewers.get(workspaceId) ?? 0) + 1);
      for (const agent of agents) if (!alreadyWatching && agent.workspaceId === workspaceId) {
        const entry = cache.get(agent.id);
        if (entry && (entry.status === 'error' || agent.working)) invalidate(entry);
      }
      sync(agents, connected); changed();
      return () => {
        const count = (viewers.get(workspaceId) ?? 1) - 1;
        if (count) viewers.set(workspaceId, count); else viewers.delete(workspaceId);
        sync(agents, connected);
      };
    },
    retry(workspaceId?: string) {
      for (const agent of agents) if (!workspaceId || agent.workspaceId === workspaceId) {
        const entry = cache.get(agent.id);
        if (entry) invalidate(entry);
      }
      sync(agents, connected); changed();
    },
    dispose() {
      disposed = true;
      for (const entry of cache.values()) stopStream(entry);
      cache.clear(); viewers.clear(); agents = [];
    },
  };
}
