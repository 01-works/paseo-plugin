import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeavyItem, HeavyResult, HeavySlot } from '../shared/heavy';

const hooks = vi.hoisted(() => ({ heavy: vi.fn(), list: vi.fn(), workspaces: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client', async importOriginal => ({ ...await importOriginal<object>(), getPaseoClient: () => ({ agents: { list: hooks.list }, workspaces: { list: hooks.workspaces } }) }));
vi.mock('../client/heavy-data', () => ({ useHeavy: hooks.heavy }));
import { CARD_INTERVAL, HeavyCard, HeavyTrailing, SIDEBAR_INTERVAL, duration, heavySummary, orderedWaiting } from '../client/heavy';

const theme = { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444', statusWarning: '#aa0' } } as never;
const item = (id: string, queued: number | null, state = 'alive', supervisor: string | null = `sup-${id}`): HeavyItem => ({ id, pid: 1, directory: null, supervisor, queued, state });
const now = 10_000_000; // 10,000초
const slot = (over: Partial<HeavySlot> = {}): HeavySlot => ({ name: 'main', running: { ...item('RUN', 1000), started: 9400 },
  waiting: [item('A1', 2500), item('B1', 9940), item('A2', null)], turns: ['B1', 'A1', 'A2'], ...over });
const ok = (slots: HeavySlot[], paused = false): HeavyResult => ({ status: 'ok', sampledAt: now, queue: { schema: 1, mode: 'round-robin', paused, slots } });
let renderer: ReactTestRenderer | undefined;
const render = async (node: React.ReactElement) => { await act(async () => { renderer = create(node); }); return renderer!; };
const texts = (r: ReactTestRenderer) => r.root.findAll(n => String(n.type) === 'Text').map(n => n.children.join(''));
beforeEach(() => { hooks.workspaces.mockResolvedValue({ entries: [] }); hooks.list.mockResolvedValue({ entries: [], subscription: { subscribe: () => {} } }); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; hooks.heavy.mockReset(); hooks.list.mockReset(); hooks.workspaces.mockReset(); });

describe('순수 함수', () => {
  it('기간', () => {
    expect([0, 59, 60, 3599, 3600, 7500, -5].map(duration)).toEqual(['1분 미만', '1분 미만', '1분', '59분', '1시간', '2시간 5분', '1분 미만']);
  });
  it('죽은 줄은 대기와 최장에서 빼고 등록 시각이 없으면 최장에서 뺀다', () => {
    const queue = ok([slot({ waiting: [item('A', 2500), item('X', 10, 'dead:esrch'), item('N', null)] })]).queue!;
    expect(heavySummary(queue, now)).toEqual({ waiting: 2, oldest: 7500 });
    expect(heavySummary(ok([slot({ waiting: [] })]).queue!, now)).toEqual({ waiting: 0, oldest: null });
  });
  it('예상 차례 순서로 두고, 차례에 없는 줄은 뒤에 둔다', () => {
    const waiting = [item('DEAD', 1, 'dead:esrch'), item('A1', 2), item('B1', 3)];
    expect(orderedWaiting(slot({ waiting, turns: ['B1', 'A1'] })).map(w => w.id)).toEqual(['B1', 'A1', 'DEAD']);
    expect(orderedWaiting(slot({ waiting, turns: null })).map(w => w.id)).toEqual(['DEAD', 'A1', 'B1']);
  });
});

describe('HeavyCard', () => {
  it('실행 중 작업·예상 차례·기다린 시간과 감독 이름을 보인다', async () => {
    hooks.list.mockResolvedValue({ entries: [{ agent: { id: 'sup-B1', title: '감독: 결제' } }], subscription: { subscribe: () => {} } });
    hooks.heavy.mockReturnValue({ data: ok([slot()], true), failed: false });
    const shown = texts(await render(<HeavyCard theme={theme} hostId="h" />));
    expect(hooks.heavy).toHaveBeenCalledWith(CARD_INTERVAL);
    for (const value of ['heavy 대기열', '대기 3 · 최장 2시간 5분', '새 제출 중지', 'RUN', '10분', '감독: 결제', 'sup-A1']) expect(shown).toContain(value);
    expect(shown.filter(v => ['A1', 'B1', 'A2'].includes(v))).toEqual(['B1', 'A1', 'A2']);
    expect(shown).not.toContain('실제 차례를 알 수 없어 등록 순서로 표시');
  });
  it('차례를 모르면 등록 순서임을 알리고, 검증 자리와 많은 줄을 구분한다', async () => {
    const many = Array.from({ length: 23 }, (_, i) => item(`W${i}`, 9000));
    hooks.heavy.mockReturnValue({ data: ok([slot({ turns: null, waiting: many }), slot({ name: 'verifier', running: null, waiting: [], turns: [] })]), failed: true });
    const shown = texts(await render(<HeavyCard theme={theme} hostId="h" />));
    for (const value of ['실제 차례를 알 수 없어 등록 순서로 표시', '외 3건', '검증 자리', '실행 중인 작업 없음', '이전 값']) expect(shown).toContain(value);
  });
  it.each([['missing', null], ['unsupported', '이 기기의 yw-heavy가 현황 조회를 지원하지 않음 · 갱신 필요'], ['error', '대기열 확인 불가']] as const)('%s', async (status, message) => {
    hooks.heavy.mockReturnValue({ data: { status, sampledAt: now, queue: null }, failed: false });
    const r = await render(<HeavyCard theme={theme} hostId="h" />);
    if (message === null) expect(r.toJSON()).toBeNull(); else expect(texts(r)).toContain(message);
    expect(hooks.list).not.toHaveBeenCalled(); expect(hooks.workspaces).not.toHaveBeenCalled();
  });
});

it('작업 폴더로 workspace 제목과 PR을 보이고 누르면 연다. 못 찾으면 폴더 이름, 폴더도 모르면 작업 ID', async () => {
  const entry = (id: string, dir: string, title: string | null, number?: number) => ({ id, workspaceDirectory: dir, projectKind: 'git', workspaceKind: 'worktree', name: `${id}-name`, title, githubRuntime: number ? { pullRequest: { number } } : null });
  hooks.workspaces.mockResolvedValue({ entries: [entry('w0', '/r', '저장소'), entry('w1', '/r/wt', '#10808 재구독 차단', 77), { ...entry('tmp', '/x', '다른 조사', 9), projectKind: 'directory', workspaceKind: 'directory' }] });
  hooks.heavy.mockReturnValue({ data: ok([slot({ turns: ['A', 'B', 'C', 'D'], waiting: [
    { ...item('A', 9000), directory: '/r/wt/apps' }, { ...item('B', 9000), directory: '/r/wt2' }, { ...item('C', 9000), directory: '/x/red-1' }, item('D', 9000)] })]), failed: false });
  const openWorkspace = vi.fn();
  const r = await render(<HeavyCard theme={theme} hostId="h" navigation={{ openAgent: vi.fn(), openWorkspace }} />);
  const shown = texts(r);
  for (const value of ['#10808 재구독 차단', 'PR #77', 'A', '저장소', 'B', 'red-1', 'C', 'D']) expect(shown).toContain(value);
  const link = r.root.findAll(n => String(n.type) === 'Pressable' && n.props.accessibilityLabel === 'workspace 열기: #10808 재구독 차단');
  expect(link).toHaveLength(1);
  link[0].props.onPress();
  expect(openWorkspace).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'w1', serverId: 'h' });
  expect(shown.filter(v => v === 'D')).toHaveLength(1);
  expect(shown).not.toContain('다른 조사'); expect(shown).not.toContain('PR #9');
});

it('같은 폴더의 workspace가 여럿이면 맞추지 않고, 다음 쪽에 있는 하위 workspace를 찾는다', async () => {
  const entry = (id: string, dir: string, number: number) => ({ id, workspaceDirectory: dir, projectKind: 'git', workspaceKind: 'worktree', name: id, title: id, githubRuntime: { pullRequest: { number } } });
  hooks.workspaces.mockImplementation(async ({ page }: { page: { cursor?: string } }) => page.cursor === 'next'
    ? { entries: [entry('깊은 곳', '/r/wt', 3), entry('둘째', '/same', 5)], pageInfo: { hasMore: false, nextCursor: null } }
    : { entries: [entry('위', '/r', 1), entry('첫째', '/same', 4)], pageInfo: { hasMore: true, nextCursor: 'next' } });
  hooks.heavy.mockReturnValue({ data: ok([slot({ turns: ['A', 'B'], waiting: [{ ...item('A', 9000), directory: '/r/wt/x' }, { ...item('B', 9000), directory: '/same' }] })]), failed: false });
  const shown = texts(await render(<HeavyCard theme={theme} hostId="h" />));
  for (const value of ['깊은 곳', 'PR #3', 'same']) expect(shown).toContain(value);
  for (const value of ['위', '첫째', '둘째', 'PR #1', 'PR #4', 'PR #5']) expect(shown).not.toContain(value);
});

it('이 호스트에서 찾은 감독만 누르면 그 세션을 열고, 이동 기능이 없으면 이름만 보인다', async () => {
  hooks.list.mockResolvedValue({ entries: [{ agent: { id: 'sup-B1', title: '감독: 결제' } }], subscription: { subscribe: () => {} } });
  hooks.heavy.mockReturnValue({ data: ok([slot()]), failed: false });
  const openAgent = vi.fn();
  const links = (r: ReactTestRenderer) => r.root.findAll(n => String(n.type) === 'Pressable');
  const r = await render(<HeavyCard theme={theme} hostId="h" navigation={{ openAgent, openWorkspace: vi.fn() }} />);
  expect(links(r).map(n => n.props.accessibilityLabel)).toEqual(['감독 세션 열기: 감독: 결제']);
  links(r)[0].props.onPress();
  expect(openAgent).toHaveBeenCalledExactlyOnceWith({ agentId: 'sup-B1', serverId: 'h' });
  await act(async () => r.update(<HeavyCard theme={theme} hostId="h" />));
  expect(links(r)).toHaveLength(0); expect(texts(r)).toContain('감독: 결제');
});

it('예상 차례에 없는 줄에는 번호를 붙이지 않고, 이름 조회가 실패해도 ID로 표시한다', async () => {
  hooks.list.mockRejectedValue(new Error('연결 안 됨'));
  hooks.heavy.mockReturnValue({ data: ok([slot({ waiting: [item('A', 9000), item('DEAD', 9000, 'dead:esrch', null)], turns: ['A'] })]), failed: false });
  const shown = texts(await render(<HeavyCard theme={theme} hostId="h" />));
  expect(shown).toContain('1'); expect(shown).not.toContain('2');
  for (const value of ['·', '끝남', 'sup-A', '감독 확인 불가']) expect(shown).toContain(value);
});

describe('HeavyTrailing', () => {
  it('대기가 있을 때만 건수와 최장을 보인다', async () => {
    hooks.heavy.mockReturnValue({ data: ok([slot()]), failed: false });
    const r = await render(<HeavyTrailing theme={theme} />);
    expect(hooks.heavy).toHaveBeenCalledWith(SIDEBAR_INTERVAL);
    expect(texts(r)).toEqual(['대기 3 · 2시간 5분']);
  });
  it('조회가 실패하면 옛 건수를 숨기고 성공하면 다시 보인다', async () => {
    hooks.heavy.mockReturnValue({ data: ok([slot()]), failed: true });
    const r = await render(<HeavyTrailing theme={theme} />);
    expect(r.toJSON()).toBeNull();
    hooks.heavy.mockReturnValue({ data: ok([slot()]), failed: false });
    await act(async () => r.update(<HeavyTrailing theme={theme} />));
    expect(texts(r)).toEqual(['대기 3 · 2시간 5분']);
  });
  it.each([[undefined], [ok([slot({ waiting: [] })])], [{ status: 'missing', sampledAt: now, queue: null } as HeavyResult]])('표시하지 않음', async data => {
    hooks.heavy.mockReturnValue({ data, failed: false });
    expect((await render(<HeavyTrailing theme={theme} />)).toJSON()).toBeNull();
  });
});
