import React, { StrictMode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { CleanupState } from '../shared/cleanup';
import { item, history } from './cleanup-fixtures';

const rpc = vi.hoisted(() => ({ start: vi.fn(), get: vi.fn(), cancel: vi.fn(), terminate: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: (contract: { name: string }) => rpc[contract.name.split('.').at(-1) as keyof typeof rpc] }));
import { CleanupPanel } from '../client/cleanup';
const theme = { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444', statusDanger: '#a00', accent: '#0af', accentForeground: '#111' } } as PluginHostProps['theme'];
const initial: CleanupState = { id: '10000000-0000-4000-a000-000000000001', phase: 'observing', observedSeconds: 0, sampledAt: null, expiresAt: null, items: [], truncated: false };
const ready: CleanupState = { ...initial, phase: 'ready', observedSeconds: 12, items: [{ ...item, decision: 'candidate', reason: '테스트 잔여 실행 정황' }, { ...item, pid: 124, decision: 'keep', reason: '계속 쓰는 서비스' }] };
let renderer: ReactTestRenderer | undefined;
const clients: QueryClient[] = [];
function tree(hostId = 'a') {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }); clients.push(client);
  return <QueryClientProvider client={client}><CleanupPanel key={hostId} hostId={hostId} name={`Mac ${hostId}`} theme={theme} onBack={() => {}} /></QueryClientProvider>;
}
const text = () => JSON.stringify(renderer!.toJSON());
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rpc.start.mockResolvedValue(initial); rpc.get.mockResolvedValue(ready); rpc.cancel.mockResolvedValue({ cancelled: true });
  rpc.terminate.mockResolvedValue({ results: [{ pid: item.pid, start: item.start, sent: true }] });
});
afterEach(async () => { if (renderer) await act(async () => { renderer!.unmount(); await flush(); }); renderer = undefined; clients.splice(0).forEach(c => c.clear()); vi.resetAllMocks(); vi.useRealTimers(); });

it('완료 결과를 유지하며 추가 폴링·자동 종료 없이 고정 높이로 표시', async () => {
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(text()).toContain('테스트 잔여 실행 정황'); expect(text()).not.toContain('활동 확인 중');
  expect(renderer!.root.findByProps({ accessibilityLabel: '정리 검사 결과' }).props.style.height).toBe(320);
  expect(rpc.terminate).not.toHaveBeenCalled();
  vi.useFakeTimers(); const calls = rpc.get.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); expect(rpc.get).toHaveBeenCalledTimes(calls);
});
it('정리 권장만 자동 선택하고 선택 정리 한 번에 해당 PID·시작 시각만 전송', async () => {
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'checkbox' })).toHaveLength(2);
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.accessibilityState.checked).toBe(true);
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' }).props.accessibilityState.checked).toBe(false);
  expect(rpc.terminate).not.toHaveBeenCalled();
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress());
  expect(text()).not.toContain('저장하지 않은 작업');
  expect(rpc.terminate).toHaveBeenCalledExactlyOnceWith({ id: initial.id, targets: [{ pid: item.pid, start: item.start }] }); expect(text()).toContain('종료 요청');
});
it('완료된 시작 응답도 권장 항목을 자동 선택하고 사용자가 해제한 선택을 다시 체크하지 않음', async () => {
  rpc.start.mockResolvedValue(ready);
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(rpc.get).not.toHaveBeenCalled();
  const checkbox = () => renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' });
  expect(checkbox().props.accessibilityState.checked).toBe(true);
  expect(checkbox().props.style).toMatchObject({ width: 28, height: 28 });
  expect(checkbox().props.hitSlop).toBe(8);
  await act(async () => checkbox().props.onPress());
  await act(async () => { renderer!.update(tree()); await flush(); });
  expect(checkbox().props.accessibilityState.checked).toBe(false);
  expect(renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.disabled).toBe(true);
  expect(rpc.terminate).not.toHaveBeenCalled();
});
it.each(['keep', 'uncertain'] as const)('%s 항목을 직접 추가하면 경고 확인 뒤 선택 목록 전체를 전송', async decision => {
  rpc.get.mockResolvedValue({ ...ready, items: [ready.items[0], { ...ready.items[1], decision }] });
  await act(async () => { renderer = create(tree()); await flush(); });
  const checkbox = renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' });
  expect(checkbox.props.accessibilityState.checked).toBe(false);
  await act(async () => checkbox.props.onPress());
  expect(rpc.terminate).not.toHaveBeenCalled();
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress());
  expect(rpc.terminate).not.toHaveBeenCalled();
  expect(text()).toContain('정리 권장 외 항목 '); expect(text()).toContain('저장하지 않은 작업');
  expect(text()).toContain('사용 중인 서비스'); expect(text()).toContain(decision === 'keep' ? '유지 권장' : '판단 어려움');
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 종료 확인' }).props.onPress());
  expect(rpc.terminate).toHaveBeenCalledExactlyOnceWith({ id: initial.id,
    targets: [{ pid: item.pid, start: item.start }, { pid: 124, start: item.start }], confirmNonRecommended: true });
});
it('권장 항목이 없으면 기본 선택은 비어 있고 비권장 항목의 경고 취소는 선택을 유지', async () => {
  rpc.get.mockResolvedValue({ ...ready, items: [ready.items[1], { ...ready.items[0], decision: 'uncertain' }] });
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'checkbox' }).every(p => !p.props.accessibilityState.checked)).toBe(true);
  expect(renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.disabled).toBe(true);
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' }).props.onPress());
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress());
  const cancel = renderer!.root.findAllByProps({ accessibilityRole: 'button' }).find(p => p.findAllByType(Text).some(t => t.props.children === '취소'))!;
  await act(async () => cancel.props.onPress());
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' }).props.accessibilityState.checked).toBe(true);
  expect(text()).not.toContain('저장하지 않은 작업'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('정리 요청 중 선택을 잠그고 빠른 연속 클릭도 한 번만 전송', async () => {
  let resolve!: (value: { results: { pid: number; start: string; sent: boolean }[] }) => void;
  rpc.terminate.mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(async () => { renderer = create(tree()); await flush(); });
  const press = renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress;
  await act(async () => { press(); press(); await flush(); });
  expect(rpc.terminate).toHaveBeenCalledOnce();
  expect(renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.disabled).toBe(true);
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'checkbox' }).every(p => p.props.disabled)).toBe(true);
  expect(renderer!.root.findByProps({ accessibilityLabel: '정리 검사 뒤로' }).props.disabled).toBe(true);
  await act(async () => { resolve({ results: [{ pid: item.pid, start: item.start, sent: true }] }); await flush(); });
  expect(text()).toContain('종료 요청');
});
it('즉시 정리 RPC 실패를 표시하고 기존 선택으로 재요청할 수 있음', async () => {
  rpc.terminate.mockRejectedValueOnce(new Error('기기 연결 실패'));
  await act(async () => { renderer = create(tree()); await flush(); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress());
  expect(text()).toContain('종료 요청 실패'); expect(text()).toContain('기기 연결 실패');
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.accessibilityState.checked).toBe(true);
  expect(renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.disabled).toBe(false);
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 항목 정리' }).props.onPress());
  expect(rpc.terminate).toHaveBeenCalledTimes(2); expect(text()).not.toContain('종료 요청 실패');
});
it('이력은 결과에 짧은 한 줄로 표시하고 부족한 대상에 유휴 판정을 만들지 않음', async () => {
  rpc.get.mockResolvedValue({ ...ready, items: [{ ...ready.items[0], history }, ready.items[1]] });
  await act(async () => { renderer = create(tree()); await flush(); });
  const labels = renderer!.root.findAllByType(Text).map(p => p.props.children).flat().join('');
  expect(labels).toContain('최근 20분'); expect(labels).toContain('평균 CPU <0.1%');
  expect(labels).not.toContain('이력 부족'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('타이머의 미세한 오차로 2분 이력을 1분으로 내림 표시하지 않음', async () => {
  rpc.get.mockResolvedValue({ ...ready, items: [{ ...ready.items[0], history: { ...history, observedSeconds: 119.999 } }] });
  await act(async () => { renderer = create(tree()); await flush(); });
  const labels = renderer!.root.findAllByType(Text).map(p => p.props.children).flat().join('');
  expect(labels).toContain('최근 2분'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('이력으로 대기를 생략한 결과는 현재 CPU와 이력을 표시하고 12초 관찰로 쓰지 않음', async () => {
  rpc.get.mockResolvedValue({ ...ready, observationSource: 'history', observedSeconds: 0,
    items: [{ ...ready.items[0], observationSource: 'history', observedSeconds: history.observedSeconds, history }] });
  await act(async () => { renderer = create(tree()); await flush(); });
  const labels = renderer!.root.findAllByType(Text).map(p => p.props.children).flat().join('');
  expect(labels).toContain('CPU <0.1%'); expect(labels).toContain('최근 20분');
  expect(labels).not.toContain('관찰'); expect(labels).not.toContain('CPU 최대'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('현재 기준점 확인에는 12초 대기를 표시하지 않고 이력 부족 때만 진행 시간을 표시', async () => {
  rpc.get.mockResolvedValue(initial);
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(text()).toContain('활동 확인 중'); expect(text()).not.toContain('/12초');
  await act(async () => { renderer!.unmount(); await flush(); }); renderer = undefined;
  rpc.start.mockResolvedValue({ ...initial, observationSource: 'live', observedSeconds: 2 });
  rpc.get.mockResolvedValue({ ...initial, observationSource: 'live', observedSeconds: 2 });
  await act(async () => { renderer = create(tree('b')); await flush(); });
  expect(text()).toContain('추가 활동 확인 중 · 2/12초');
});
it('StrictMode는 검사 하나만 시작하고 실제 닫기에서만 취소', async () => {
  rpc.get.mockResolvedValue(initial);
  await act(async () => { renderer = create(<StrictMode>{tree()}</StrictMode>); await flush(); });
  expect(rpc.start).toHaveBeenCalledOnce(); expect(rpc.cancel).not.toHaveBeenCalled();
  await act(async () => { renderer!.unmount(); await flush(); }); renderer = undefined;
  expect(rpc.cancel).toHaveBeenCalledExactlyOnceWith({ id: initial.id });
});
it('시작 응답 전에 닫아도 응답의 검사 ID를 취소', async () => {
  let resolve!: (s: CleanupState) => void; rpc.start.mockImplementation(() => new Promise(done => { resolve = done; }));
  await act(async () => { renderer = create(tree()); }); await act(async () => { renderer!.unmount(); }); renderer = undefined;
  await act(async () => { resolve(initial); await flush(); }); expect(rpc.cancel).toHaveBeenCalledExactlyOnceWith({ id: initial.id });
});
it('기기를 바꾸면 이전 검사·선택을 취소하고 새 기기 ID의 결과만 사용', async () => {
  await act(async () => { renderer = create(tree('a')); await flush(); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' }).props.onPress());
  const next = { ...ready, id: '20000000-0000-4000-a000-000000000001' };
  rpc.start.mockResolvedValue({ ...initial, id: next.id }); rpc.get.mockResolvedValue(next);
  await act(async () => { renderer!.update(tree('b')); await flush(); });
  expect(rpc.cancel).toHaveBeenCalledWith({ id: initial.id }); expect(rpc.get).toHaveBeenLastCalledWith({ id: next.id });
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.accessibilityState.checked).toBe(true);
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 124 정리 선택' }).props.accessibilityState.checked).toBe(false);
  expect(text()).toContain('Mac b'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('RPC 실패는 정상 빈 결과로 바꾸지 않고 폴링을 멈춤', async () => {
  rpc.get.mockRejectedValue(new Error('기기 연결 실패'));
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(text()).toContain('기기 연결 실패'); expect(text()).not.toContain('활동 확인 중');
  vi.useFakeTimers(); const calls = rpc.get.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); expect(rpc.get).toHaveBeenCalledTimes(calls);
});
