import React, { StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { CleanupState } from '../shared/cleanup';
import { item } from './cleanup-fixtures';

const rpc = vi.hoisted(() => ({ start: vi.fn(), get: vi.fn(), cancel: vi.fn(), terminate: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: (contract: { name: string }) => rpc[contract.name.split('.').at(-1) as keyof typeof rpc] }));
import { CleanupPanel } from '../client/cleanup';
const theme = { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444', statusDanger: '#a00', accent: '#0af' } } as PluginHostProps['theme'];
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
it('후보 선택은 신호를 보내지 않고 확인 한 번 뒤 해당 PID·시작 시각만 전송', async () => {
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(renderer!.root.findAllByProps({ accessibilityRole: 'checkbox' })).toHaveLength(1);
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.onPress());
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 정리 후보 종료 선택' }).props.onPress());
  expect(rpc.terminate).not.toHaveBeenCalled(); expect(text()).toContain('저장하지 않은 작업');
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '선택한 정리 후보 종료 확인' }).props.onPress());
  expect(rpc.terminate).toHaveBeenCalledExactlyOnceWith({ id: initial.id, targets: [{ pid: item.pid, start: item.start }] }); expect(text()).toContain('종료 요청');
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
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.onPress());
  const next = { ...ready, id: '20000000-0000-4000-a000-000000000001' };
  rpc.start.mockResolvedValue({ ...initial, id: next.id }); rpc.get.mockResolvedValue(next);
  await act(async () => { renderer!.update(tree('b')); await flush(); });
  expect(rpc.cancel).toHaveBeenCalledWith({ id: initial.id }); expect(rpc.get).toHaveBeenLastCalledWith({ id: next.id });
  expect(renderer!.root.findByProps({ accessibilityLabel: 'node PID 123 정리 선택' }).props.accessibilityState.checked).toBe(false);
  expect(text()).toContain('Mac b'); expect(rpc.terminate).not.toHaveBeenCalled();
});
it('RPC 실패는 정상 빈 결과로 바꾸지 않고 폴링을 멈춤', async () => {
  rpc.get.mockRejectedValue(new Error('기기 연결 실패'));
  await act(async () => { renderer = create(tree()); await flush(); });
  expect(text()).toContain('기기 연결 실패'); expect(text()).not.toContain('활동 확인 중');
  vi.useFakeTimers(); const calls = rpc.get.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); expect(rpc.get).toHaveBeenCalledTimes(calls);
});
