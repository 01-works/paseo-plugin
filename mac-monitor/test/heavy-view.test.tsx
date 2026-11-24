import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HeavyItem, HeavyResult, HeavySlot } from '../shared/heavy';

const hooks = vi.hoisted(() => ({ heavy: vi.fn(), names: {} as Record<string, string> }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text' }));
vi.mock('@getpaseo/plugin/client', () => ({ useAgent: (id: string, select: (agent: { title: string }) => unknown) => hooks.names[id] ? select({ title: hooks.names[id] }) : null }));
vi.mock('../client/heavy-data', () => ({ useHeavy: hooks.heavy }));
import { CARD_INTERVAL, HeavyCard, HeavyTrailing, SIDEBAR_INTERVAL, duration, heavySummary, orderedWaiting } from '../client/heavy';

const theme = { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444', statusWarning: '#aa0' } } as never;
const item = (id: string, queued: number | null, state = 'alive', supervisor: string | null = `sup-${id}`): HeavyItem => ({ id, supervisor, queued, state });
const now = 10_000_000; // 10,000초
const slot = (over: Partial<HeavySlot> = {}): HeavySlot => ({ name: 'main', running: { ...item('RUN', 1000), started: 9400 },
  waiting: [item('A1', 2500), item('B1', 9940), item('A2', null)], turns: ['B1', 'A1', 'A2'], ...over });
const ok = (slots: HeavySlot[], paused = false): HeavyResult => ({ status: 'ok', sampledAt: now, queue: { schema: 1, mode: 'round-robin', paused, slots } });
let renderer: ReactTestRenderer | undefined;
const render = async (node: React.ReactElement) => { await act(async () => { renderer = create(node); }); return renderer!; };
const texts = (r: ReactTestRenderer) => r.root.findAll(n => String(n.type) === 'Text').map(n => n.children.join(''));
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; hooks.heavy.mockReset(); hooks.names = {}; });

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
    hooks.names = { 'sup-B1': '감독: 결제' };
    hooks.heavy.mockReturnValue({ data: ok([slot()], true), failed: false });
    const shown = texts(await render(<HeavyCard theme={theme} />));
    expect(hooks.heavy).toHaveBeenCalledWith(CARD_INTERVAL);
    for (const value of ['heavy 대기열', '대기 3 · 최장 2시간 5분', '새 제출 중지', 'RUN', '10분', '감독: 결제', 'sup-A1']) expect(shown).toContain(value);
    expect(shown.filter(v => ['A1', 'B1', 'A2'].includes(v))).toEqual(['B1', 'A1', 'A2']);
    expect(shown).not.toContain('실제 차례를 알 수 없어 등록 순서로 표시');
  });
  it('차례를 모르면 등록 순서임을 알리고, 검증 자리와 많은 줄을 구분한다', async () => {
    const many = Array.from({ length: 23 }, (_, i) => item(`W${i}`, 9000));
    hooks.heavy.mockReturnValue({ data: ok([slot({ turns: null, waiting: many }), slot({ name: 'verifier', running: null, waiting: [], turns: [] })]), failed: true });
    const shown = texts(await render(<HeavyCard theme={theme} />));
    for (const value of ['실제 차례를 알 수 없어 등록 순서로 표시', '외 3건', '검증 자리', '실행 중인 작업 없음', '이전 값']) expect(shown).toContain(value);
  });
  it.each([['missing', null], ['unsupported', '이 기기의 yw-heavy가 현황 조회를 지원하지 않음 · 갱신 필요'], ['error', '대기열 확인 불가']] as const)('%s', async (status, message) => {
    hooks.heavy.mockReturnValue({ data: { status, sampledAt: now, queue: null }, failed: false });
    const r = await render(<HeavyCard theme={theme} />);
    if (message === null) expect(r.toJSON()).toBeNull(); else expect(texts(r)).toContain(message);
  });
});

describe('HeavyTrailing', () => {
  it('대기가 있을 때만 건수와 최장을 보인다', async () => {
    hooks.heavy.mockReturnValue({ data: ok([slot()]), failed: false });
    const r = await render(<HeavyTrailing theme={theme} />);
    expect(hooks.heavy).toHaveBeenCalledWith(SIDEBAR_INTERVAL);
    expect(texts(r)).toEqual(['대기 3 · 2시간 5분']);
  });
  it.each([[undefined], [ok([slot({ waiting: [] })])], [{ status: 'missing', sampledAt: now, queue: null } as HeavyResult]])('표시하지 않음', async data => {
    hooks.heavy.mockReturnValue({ data, failed: false });
    expect((await render(<HeavyTrailing theme={theme} />)).toJSON()).toBeNull();
  });
});
