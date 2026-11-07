import { afterEach, expect, it, vi } from 'vitest';
import type { PaseoApi, PaseoAgent, PaseoAgentListOptions, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { createAgentDirectory, type AgentDirectory } from '../client/directory';
import { normalizeAgent } from '../client/normalize';
import { createCleanupPlan } from '../shared/cleanup';
import { page, raw } from './fixtures';

const now = Date.parse('2026-10-10T12:00:00Z'), day = 86400000;
const old = (id: string, patch: Partial<PaseoAgent> = {}) => raw(id, {
  createdAt: new Date(now - 60 * day).toISOString(), updatedAt: new Date(now - 8 * day).toISOString(), ...patch,
});
const plan = (entries: PaseoAgent[], days: 7 | 14 | 30 = 7) =>
  createCleanupPlan(entries.map(agent => normalizeAgent(agent, 'h')), 'w', 'current', days, now);
const ids = (entries: PaseoAgent[], days: 7 | 14 | 30 = 7) => plan(entries, days).agents.map(agent => agent.id);
const directories: AgentDirectory[] = [];
afterEach(async () => { for (const directory of directories.splice(0)) await directory.dispose(); vi.useRealTimers(); });

it('7·14·30일 경계는 최근 변경과 생성 중 최신 시각을 사용하고 잘못된 시각은 제외', () => {
  const entries = [old('boundary', { updatedAt: new Date(now - 7 * day).toISOString() }),
    old('recent', { updatedAt: new Date(now - 7 * day + 1).toISOString() }),
    old('15-days', { updatedAt: new Date(now - 15 * day).toISOString() }),
    old('31-days', { updatedAt: new Date(now - 31 * day).toISOString() }),
    old('newly-created', { createdAt: new Date(now - day).toISOString() }),
    old('bad-update', { updatedAt: 'bad' }), old('bad-create', { createdAt: 'bad' }),
    old('future', { updatedAt: new Date(now + day).toISOString() })];
  expect(new Set(ids(entries))).toEqual(new Set(['boundary', '15-days', '31-days']));
  expect(new Set(ids(entries, 14))).toEqual(new Set(['15-days', '31-days']));
  expect(ids(entries, 30)).toEqual(['31-days']);
});
it('현재 대화·다른 workspace·보관·실행·초기화·권한·진행 중 턴은 표시 상태와 무관하게 제외', () => {
  expect(ids([old('current'), old('foreign', { workspaceId: 'other' }),
    old('archived', { archivedAt: new Date(now - day).toISOString() }),
    old('running', { status: 'running', requiresAttention: true, attentionReason: 'error' }),
    old('starting', { status: 'initializing' }),
    old('permission', { status: 'closed', requiresAttention: true, attentionReason: 'permission' }),
    old('active-turn', { activeTurn: { turnId: 'turn', startedAt: new Date(now - day).toISOString() } }),
    old('idle'), old('finished', { requiresAttention: true, attentionReason: 'finished' })])).toEqual(['finished', 'idle']);
});
it('진행 중이거나 최근인 자손과 현재 대화·다른 workspace가 있는 상위는 함께 제외', () => {
  const entries = [old('grandparent'), old('parent', { labels: { 'paseo.parent-agent-id': 'grandparent' } }),
    old('running-child', { status: 'running', labels: { 'paseo.parent-agent-id': 'parent' } }),
    old('recent-parent'), old('recent-child', { updatedAt: new Date(now - day).toISOString(), labels: { 'paseo.parent-agent-id': 'recent-parent' } }),
    old('current-parent'), old('current', { labels: { 'paseo.parent-agent-id': 'current-parent' } }),
    old('foreign-parent'), old('foreign-child', { workspaceId: 'other', labels: { 'paseo.parent-agent-id': 'foreign-parent' } })];
  expect(ids(entries)).toEqual([]);
});
it('안전한 트리는 하위부터 처리하며 이미 보관된 자손·고아 관계와 순환을 구분', () => {
  const entries = [old('root'), old('child', { labels: { 'paseo.parent-agent-id': 'root' } }),
    old('archived-child', { archivedAt: new Date(now).toISOString(), labels: { 'paseo.parent-agent-id': 'root' } }),
    old('orphan', { labels: { 'paseo.parent-agent-id': 'missing' } }),
    old('cycle-a', { labels: { 'paseo.parent-agent-id': 'cycle-b' } }),
    old('cycle-b', { labels: { 'paseo.parent-agent-id': 'cycle-a' } })];
  expect(ids(entries)).toEqual(['child', 'orphan', 'root']);
});

const recent = (id: string, patch: Partial<PaseoAgent> = {}) => old(id, { updatedAt: new Date(now - day).toISOString(), ...patch });
const continued = (from: string) => ({ 'zerosub.continued-from': from });
it('이어진 대화는 묶음 전체가 오래됐을 때만 함께 정리하고 하나라도 최근·작업 중·현재면 묶음을 남김', () => {
  const entries = [old('a'), old('b', { labels: continued('a') }), old('c', { title: 'b 에이전트 이어서 진행' }), // 제목 속 ID는 UUID만 인정
    old('r1'), recent('r2', { labels: { 'handoff.from': 'r1' } }),
    old('x1'), old('x2', { status: 'running', labels: continued('x1') }),
    old('p1'), old('current', { labels: continued('p1') }),
    old('solo')];
  expect(new Set(ids(entries))).toEqual(new Set(['a', 'b', 'c', 'solo']));
});
it('하위 대화 때문에 묶음 일부가 계획에서 빠지면 묶음 전체를 뺌', () => {
  const entries = [old('a'), old('b', { labels: continued('a') }), recent('c', { labels: { 'paseo.parent-agent-id': 'b' } }), old('solo')];
  expect(ids(entries)).toEqual(['solo']);
});
it('제목에 적힌 대화 ID와 도우미 묶음 라벨도 같은 작업으로 보고, 빈 라벨은 묶지 않음', () => {
  const u1 = '11111111-1111-4111-8111-111111111111', u2 = '22222222-2222-4222-8222-222222222222';
  const entries = [old(u1), recent(u2, { title: u1 + ' 에이전트 이어서 진행' }),
    old('l1'), recent('l2', { labels: { 'agent-list.continued-from': 'l1' } }),
    old('e1'), recent('e2', { labels: { 'agent-list.continued-from': ' ' } })];
  expect(ids(entries)).toEqual(['e1']);
});

async function setup(entries = [old('current'), old('target')], first = page(entries)) {
  let observer!: SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>;
  const lease = { subscriptionId: 's' as string | null,
    subscribe: (value: typeof observer) => { observer = value; value.snapshot({ ...first, subscriptionId: 's' }); return () => {}; },
    release: async () => {} };
  const list = vi.fn(async (options: PaseoAgentListOptions) => {
    if (options.subscribe) return { ...first, subscription: lease };
    if (options.page?.cursor) throw new Error('다음 페이지 실패');
    return page(entries.filter(agent => !agent.archivedAt &&
      Object.entries(options.filter?.labels ?? {}).every(([key, value]) => agent.labels[key]?.trim() === value)));
  });
  const refresh = vi.fn(async (id: string) => {
    const agent = entries.find(agent => agent.id === id); return agent ? { agent, project: {} } : null;
  });
  const archive = vi.fn(async (id: string) => {
    const agent = entries.find(agent => agent.id === id)!;
    agent.archivedAt = new Date(now).toISOString();
    return { archivedAt: agent.archivedAt };
  });
  const ref = vi.fn((id: string) => ({ refresh: () => refresh(id), archive: () => archive(id) }));
  const directory = createAgentDirectory({ agents: { list, ref } } as unknown as PaseoApi, 'h');
  directories.push(directory); await directory.start();
  return { directory, entries, list, refresh, archive, ref, lease, observer };
}
it('확인한 대상만 하위부터 보관하고 각 보관 직전 공개 조회와 refresh를 실행', async () => {
  const entries = [old('current'), old('root'), old('child', { labels: { 'paseo.parent-agent-id': 'root' } })];
  const h = await setup(entries), approved = plan(entries), progress = vi.fn();
  entries.push(old('not-approved'));
  const result = await h.directory.cleanup(approved, { onProgress: progress });
  expect(h.archive.mock.calls.map(([id]) => id)).toEqual(['child', 'root']);
  expect(result.outcomes.map(outcome => outcome.status)).toEqual(['archived', 'archived']);
  expect(result.stopped).toBe(false); expect(progress).toHaveBeenCalledTimes(2);
  expect(h.list).toHaveBeenLastCalledWith(expect.objectContaining({ filter: {
    includeArchived: false, labels: { 'paseo.parent-agent-id': 'root' },
  }, page: { limit: 1 } }));
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['current']);
});
it.each([
  { status: 'running' as const },
  { updatedAt: new Date(now - day).toISOString() },
  { workspaceId: 'other' },
  { archivedAt: new Date(now).toISOString() },
])('확인 후 %j 상태로 바뀐 대상은 보관하지 않음', async patch => {
  const h = await setup(), approved = plan(h.entries);
  Object.assign(h.entries[1], patch);
  const result = await h.directory.cleanup(approved);
  expect(result.outcomes[0].status).toBe('skipped'); expect(h.archive).not.toHaveBeenCalled();
});
it('확인 후 새 하위가 생긴 상위와 오래된 조회 응답 이후 실행 중으로 바뀐 대상은 보관하지 않음', async () => {
  const h = await setup(), approved = plan(h.entries);
  h.entries.push(old('new-child', { labels: { 'paseo.parent-agent-id': 'target' } }));
  expect((await h.directory.cleanup(approved)).outcomes[0].status).toBe('skipped');
  expect(h.refresh).not.toHaveBeenCalled(); expect(h.archive).not.toHaveBeenCalled();
  const live = await setup();
  live.refresh.mockImplementationOnce(async id => {
    live.observer.update({ type: 'agent_update', payload: { kind: 'upsert',
      agent: old(id, { status: 'running', updatedAt: new Date(now).toISOString() }), project: {} } } as Parameters<typeof live.observer.update>[0]);
    return { agent: old(id), project: {} };
  });
  expect((await live.directory.cleanup(plan(live.entries))).outcomes[0].status).toBe('skipped');
  expect(live.archive).not.toHaveBeenCalled();
});
it('확인 후 이어진 대화가 최근이 되면 묶음의 오래된 대화도 보관하지 않음', async () => {
  const entries = [old('current'), old('src'), old('next', { labels: continued('src') })];
  const h = await setup(entries), approved = plan(entries);
  expect(new Set(approved.agents.map(agent => agent.id))).toEqual(new Set(['src', 'next']));
  h.observer.update({ type: 'agent_update', payload: { kind: 'upsert',
    agent: { ...entries[2], updatedAt: new Date(now).toISOString() }, project: {} } } as Parameters<typeof h.observer.update>[0]);
  await vi.waitFor(() => expect(h.directory.getSnapshot().agents.find(agent => agent.id === 'next')?.updatedAt).toBe(new Date(now).toISOString()));
  const result = await h.directory.cleanup(approved);
  expect(result.outcomes.map(outcome => outcome.status)).toEqual(['skipped', 'skipped']);
  expect(h.archive).not.toHaveBeenCalled();
});
it('실행 중 묶음의 한 대화를 보관하지 못하면 같은 묶음의 남은 대화도 보관하지 않음', async () => {
  const entries = [old('current'), old('src', { updatedAt: new Date(now - 9 * day).toISOString() }), old('next', { labels: continued('src') })];
  const h = await setup(entries), approved = plan(entries);
  expect(approved.agents.map(agent => agent.id)).toEqual(['src', 'next']);
  h.archive.mockImplementationOnce(async () => { throw new Error('보관 실패'); });
  const result = await h.directory.cleanup(approved);
  expect(result.outcomes.map(outcome => [outcome.id, outcome.status])).toEqual([['src', 'failed'], ['next', 'skipped']]);
  expect(h.archive).toHaveBeenCalledOnce();
});
it('하위 보관이 실패한 상위는 건너뛰고 독립된 대상은 계속 처리', async () => {
  const entries = [old('current'), old('parent'), old('child', { labels: { 'paseo.parent-agent-id': 'parent' } }), old('other')];
  const h = await setup(entries);
  h.archive.mockImplementationOnce(async () => { throw new Error('보관 실패'); });
  const result = await h.directory.cleanup(plan(entries));
  expect(result.outcomes.map(outcome => [outcome.id, outcome.status])).toEqual([
    ['child', 'failed'], ['other', 'archived'], ['parent', 'skipped'],
  ]);
  expect(h.archive.mock.calls.map(([id]) => id)).toEqual(['child', 'other']);
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['current', 'parent', 'child']);
});
it('하위 조회 이후 도착한 새 하위 이벤트와 공백이 있는 상위 label도 보관을 막음', async () => {
  const h = await setup();
  h.refresh.mockImplementationOnce(async id => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert',
      agent: old('new-child', { status: 'running', labels: { 'paseo.parent-agent-id': ' target ' } }),
      project: {} } } as Parameters<typeof h.observer.update>[0]);
    return { agent: old(id), project: {} };
  });
  expect((await h.directory.cleanup(plan(h.entries))).outcomes[0].status).toBe('skipped');
  expect(h.archive).not.toHaveBeenCalled();
});
it('보관 요청 이후 응답이 끊기면 미처리로 단정하지 않고 결과 확인 실패로 기록', async () => {
  const h = await setup([old('current'), old('a'), old('b')]);
  h.archive.mockImplementationOnce(async () => { h.lease.subscriptionId = null; throw new Error('연결 끊김'); });
  const result = await h.directory.cleanup(plan(h.entries));
  expect(result.outcomes.map(outcome => [outcome.id, outcome.status])).toEqual([['a', 'failed']]);
  expect(result.stopped).toBe(true); expect(h.archive).toHaveBeenCalledOnce();
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['current', 'a', 'b']);
});
it.each(['abort', 'disconnect', 'dispose'])('재검증 중 %s 이후 보관을 보내지 않고 일괄·개별 작업의 동시 실행도 차단', async interruption => {
  const h = await setup(), controller = new AbortController();
  let finish!: (value: Awaited<ReturnType<typeof h.refresh>>) => void;
  h.refresh.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const running = h.directory.cleanup(plan(h.entries), { signal: controller.signal });
  await vi.waitFor(() => expect(h.refresh).toHaveBeenCalledOnce());
  await expect(h.directory.cleanup(plan(h.entries))).rejects.toThrow('진행 중');
  await expect(h.directory.archive('target', 'w')).rejects.toThrow('진행 중');
  if (interruption === 'abort') controller.abort();
  if (interruption === 'disconnect') h.lease.subscriptionId = null;
  if (interruption === 'dispose') await h.directory.dispose();
  finish({ agent: old('target'), project: {} });
  const result = await running;
  expect(result.stopped).toBe(true); expect(result.outcomes).toEqual([]); expect(h.archive).not.toHaveBeenCalled();
});
it('일부 목록과 하위 존재 조회 실패에서 보관을 보내지 않음', async () => {
  const entries = [old('current'), old('target')];
  const partial = await setup(entries, page(entries, 'next'));
  await expect(partial.directory.cleanup(plan(entries))).rejects.toThrow('목록을 모두');
  expect(partial.archive).not.toHaveBeenCalled();
  const h = await setup();
  h.list.mockRejectedValueOnce(new Error('하위 조회 실패'));
  expect((await h.directory.cleanup(plan(h.entries))).outcomes[0].status).toBe('failed');
  expect(h.ref).not.toHaveBeenCalled(); expect(h.archive).not.toHaveBeenCalled();
});
