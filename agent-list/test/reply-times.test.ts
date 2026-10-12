import { afterEach, expect, it, vi } from 'vitest';
import type { PaseoApi } from '../client/paseo-types';
import { createReplyTimes } from '../client/reply-times';
import { normalizeAgent } from '../client/normalize';
import { raw, timelinePage } from './fixtures';

type Timeline = ReturnType<PaseoApi['agents']['ref']>['timeline'];
type Page = Awaited<ReturnType<Timeline['refetch']>>;
type Event = Parameters<Parameters<Timeline['subscribe']>[0]>[0];
const at = '2026-03-01T00:00:00Z', later = '2026-04-01T00:00:00Z';
const make = (id: string, patch: Parameters<typeof raw>[1] = {}) => normalizeAgent(raw(id, patch), 'h');
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(stop => stop()); });
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
function setup(values = [make('a')]) {
  const handlers = new Map<string, (event: Event) => void>();
  const stops: ReturnType<typeof vi.fn>[] = [];
  const refetch = vi.fn(async (_id: string, _options?: Parameters<Timeline['refetch']>[0]): Promise<Page> => timelinePage(at));
  const subscribe = vi.fn((id: string, handler: (event: Event) => void) => {
    handlers.set(id, handler);
    const stop = Object.assign(vi.fn(() => { handlers.delete(id); }), { ready: Promise.resolve() });
    stops.push(stop); return stop;
  });
  const cache = createReplyTimes({ agents: { ref: (id: string) => ({ timeline: {
    refetch: (options?: Parameters<Timeline['refetch']>[0]) => refetch(id, options),
    subscribe: (handler: (event: Event) => void) => subscribe(id, handler),
  } }) } } as unknown as PaseoApi, vi.fn());
  cleanups.push(cache.dispose); cache.sync(values, true);
  return { cache, refetch, subscribe, handlers, stops, get: (agent = values[0]) => cache.decorate(agent) };
}
it('열린 workspace만 조회하고 여러 창·재열기는 캐시와 요청을 공유', async () => {
  const h = setup([make('a'), make('other', { workspaceId: 'other' })]);
  expect(h.refetch).not.toHaveBeenCalled();
  const off1 = h.cache.watch('w'), off2 = h.cache.watch('w'); await flush();
  expect(h.refetch).toHaveBeenCalledOnce(); expect(h.refetch.mock.calls[0][0]).toBe('a');
  expect(h.get()).toMatchObject({ lastReplyAt: at, replyStatus: 'ready' });
  off1(); off2(); h.cache.watch('w'); await flush();
  expect(h.refetch).toHaveBeenCalledOnce(); expect(h.subscribe).not.toHaveBeenCalled();
});
it('읽음·포커스·이름·설정 변경에는 재조회 없이 답변 시각을 유지', async () => {
  const h = setup([make('a', { requiresAttention: true, attentionReason: 'finished' })]);
  h.cache.watch('w'); await flush();
  h.cache.sync([make('a', { updatedAt: later, title: '이름 변경', model: 'other', requiresAttention: false })], true);
  await flush(); expect(h.refetch).toHaveBeenCalledOnce(); expect(h.get().lastReplyAt).toBe(at);
});
it('새 턴·턴 완료·재연결은 답변 시각을 다시 확인', async () => {
  const h = setup(); h.cache.watch('w'); await flush();
  h.refetch.mockResolvedValue(timelinePage(later));
  h.cache.sync([make('a', { status: 'running', activeTurn: { turnId: 't', startedAt: at } })], true); await flush();
  expect(h.get().lastReplyAt).toBe(later); expect(h.subscribe).toHaveBeenCalledOnce();
  h.cache.sync([make('a')], true); await flush();
  expect(h.stops[0]).toHaveBeenCalledOnce(); expect(h.refetch).toHaveBeenCalledTimes(3);
  h.cache.reset(); h.cache.sync([make('a')], true); await flush();
  expect(h.refetch).toHaveBeenCalledTimes(4);
});
it('도구·사용자·추론·빈 답변 뒤의 이전 페이지에서 마지막 답변을 찾음', async () => {
  const h = setup();
  const page: Page = { ...timelinePage(), hasOlder: true, entries: [
    { ...timelinePage(later).entries[0], item: { type: 'reasoning', text: '생각' } },
    { ...timelinePage(later).entries[0], item: { type: 'user_message', text: '질문' } },
    { ...timelinePage(later).entries[0], item: { type: 'assistant_message', text: '  ' } },
  ] };
  h.refetch.mockResolvedValueOnce(page).mockResolvedValueOnce(timelinePage(at));
  h.cache.watch('w'); await flush();
  expect(h.refetch).toHaveBeenCalledTimes(2);
  expect(h.refetch.mock.calls[1][1]).toMatchObject({ direction: 'before', cursor: page.startCursor });
  expect(h.get().lastReplyAt).toBe(at);
});
it('답변 없는 이력은 확인 완료로 표시하고 생성시각 폴백용 null을 반환', async () => {
  const h = setup(); h.refetch.mockResolvedValue(timelinePage()); h.cache.watch('w'); await flush();
  expect(h.get()).toMatchObject({ lastReplyAt: null, replyStatus: 'ready' });
});
it.each(['error', 'gap', 'stale', 'invalid', 'cursor'])('조회 %s는 답변 없음으로 오인하지 않고 명시적 재시도로 복구', async kind => {
  const h = setup();
  const page: Page = kind === 'invalid' ? timelinePage('bad') : timelinePage();
  if (kind === 'error') page.error = 'offline';
  if (kind === 'gap') page.gap = true;
  if (kind === 'stale') page.staleCursor = true;
  if (kind === 'cursor') page.hasOlder = true;
  h.refetch.mockResolvedValue(page); h.cache.watch('w'); await flush();
  expect(h.get().replyStatus).toBe('error');
  const count = h.refetch.mock.calls.length; await flush(); expect(h.refetch).toHaveBeenCalledTimes(count);
  h.refetch.mockResolvedValue(timelinePage(at)); h.cache.retry('w'); await flush();
  expect(h.get()).toMatchObject({ lastReplyAt: at, replyStatus: 'ready' });
});
it('동시 조회는 3개이며 창을 닫으면 대기 목록·추가 페이지·늦은 응답을 중단', async () => {
  const h = setup(Array.from({ length: 8 }, (_, i) => make(String(i))));
  let finish!: (page: Page) => void;
  const pending = new Promise<Page>(resolve => { finish = resolve; });
  h.refetch.mockReturnValue(pending); const off = h.cache.watch('w'); await flush();
  expect(h.refetch).toHaveBeenCalledTimes(3);
  off(); finish({ ...timelinePage(), hasOlder: true }); await flush();
  expect(h.refetch).toHaveBeenCalledTimes(3); expect(h.get().lastReplyAt).toBeNull();
  h.refetch.mockResolvedValue(timelinePage(at)); h.cache.watch('w'); await flush();
  expect(h.get().lastReplyAt).toBe(at); expect(h.refetch).toHaveBeenCalledTimes(11);
});
it('조회 중 삭제·dispose 뒤의 응답은 캐시를 되살리지 않음', async () => {
  const h = setup(); let finish!: (page: Page) => void;
  h.refetch.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  h.cache.watch('w'); await flush(); h.cache.sync([], true); h.cache.dispose(); finish(timelinePage(at)); await flush();
  expect(h.get().lastReplyAt).toBeNull(); expect(h.refetch).toHaveBeenCalledOnce();
});
it('새 턴 도중 도착한 과거 조회는 버리고 최신 시각을 재조회', async () => {
  const h = setup(); let finish!: (page: Page) => void;
  h.refetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  h.cache.watch('w'); await flush();
  h.cache.sync([make('a', { lastUserMessageAt: later })], true);
  h.refetch.mockResolvedValue(timelinePage(later)); finish(timelinePage(at)); await flush();
  expect(h.get().lastReplyAt).toBe(later); expect(h.refetch).toHaveBeenCalledTimes(2);
});
it('실행 중 새 답변만 스트림 시각으로 반영하며 과거 조회가 이를 덮지 않음', async () => {
  const h = setup([make('a', { status: 'running' })]); let finish!: (page: Page) => void;
  h.refetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const off = h.cache.watch('w'); await flush();
  const send = (type: 'assistant_message' | 'user_message', timestamp: string) => h.handlers.get('a')!({
    agentId: 'a', event: { type: 'timeline', provider: 'codex', item: { type, text: '메시지' } }, timestamp,
  });
  send('user_message', later); expect(h.get().lastReplyAt).toBeNull();
  send('assistant_message', later); finish(timelinePage(at)); await flush();
  expect(h.get().lastReplyAt).toBe(later); expect(h.refetch).toHaveBeenCalledOnce();
  off(); expect(h.stops[0]).toHaveBeenCalledOnce();
});
it('타임라인 교체와 과거 답변으로 되감기는 이전 최대 시각을 고정하지 않음', async () => {
  const h = setup([make('a', { status: 'running' })]);
  h.refetch.mockResolvedValue(timelinePage(later)); h.cache.watch('w'); await flush();
  h.refetch.mockResolvedValue(timelinePage(at));
  h.handlers.get('a')!({ agentId: 'a', event: { type: 'replacement', epoch: 'new' } }); await flush();
  expect(h.get().lastReplyAt).toBe(at);
});
it('배치 사이에 짧은 턴이 시작·종료해도 캐시를 갱신', async () => {
  const h = setup(); h.cache.watch('w'); await flush();
  h.cache.observe(make('a', { status: 'running' })); h.cache.observe(make('a'));
  h.refetch.mockResolvedValue(timelinePage(later)); h.cache.sync([make('a')], true); await flush();
  expect(h.get().lastReplyAt).toBe(later); expect(h.refetch).toHaveBeenCalledTimes(2);
});
it('연결 단절은 스트림을 해제하고 복구 때만 누락된 답변을 다시 확인', async () => {
  const agents = [make('a', { status: 'running' })], h = setup(agents);
  h.cache.watch('w'); await flush(); h.cache.sync(agents, false);
  expect(h.stops[0]).toHaveBeenCalledOnce();
  h.cache.reset(); await flush(); expect(h.refetch).toHaveBeenCalledOnce();
  h.refetch.mockResolvedValue(timelinePage(later)); h.cache.sync(agents, true); await flush();
  expect(h.refetch).toHaveBeenCalledTimes(2); expect(h.get().lastReplyAt).toBe(later);
});
it('스트림 오류는 재시도할 때만 새 구독을 만들고 과거 콜백은 무시', async () => {
  const h = setup([make('a', { status: 'running' })]); h.cache.watch('w'); await flush();
  const old = h.handlers.get('a')!;
  old({ agentId: 'a', event: { type: 'error', error: 'offline' } }); await flush();
  expect(h.get().replyStatus).toBe('error'); expect(h.stops[0]).toHaveBeenCalledOnce();
  h.cache.retry('w'); await flush(); expect(h.subscribe).toHaveBeenCalledTimes(2);
  old({ agentId: 'a', timestamp: later, event: { type: 'timeline', provider: 'codex', item: { type: 'assistant_message', text: '늦은 답변' } } });
  expect(h.get()).toMatchObject({ lastReplyAt: at, replyStatus: 'ready' });
});
