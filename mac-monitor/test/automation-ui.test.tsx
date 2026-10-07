import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { AutomationStatus, ReviewedProcess } from '../shared/automation';
const rpc = vi.hoisted(() => ({ get: vi.fn(), configure: vi.fn(), target: vi.fn(), confirm: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: (contract: { name: string }) => rpc[contract.name.split('.').at(-1) as keyof typeof rpc] }));
import { AutomationPanel } from '../client/automation';

const theme = { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444', statusDanger: '#a00' } } as PluginHostProps['theme'];
const status: AutomationStatus = { enabled: true, phase: 'cooldown', model: 'gpt-6-luna', targetCount: 0, lastEvent: null };
const review = (): ReviewedProcess => ({ at: Date.now(), target: { pid: 123, start: '90071992547409999', group: 'worker', name: 'worker', path: '/opt/worker' },
  decision: 'observe', reason: '증가하고 있으나 작업 목적을 확인해야 합니다.', memoryBytes: 2 * 1024 ** 3, growthBytes: 300 * 1024 ** 2, outcome: 'pending' });
const report = (reviews = [review()]) => ({ config: { enabled: true, pressure: 'critical', sustainedSeconds: 120 }, status, targets: [], events: [], reviews });
let renderer: ReactTestRenderer | undefined;
let client: QueryClient;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
});
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; client.clear(); vi.resetAllMocks(); vi.useRealTimers(); });
const render = async () => { await act(async () => { renderer = create(<QueryClientProvider client={client}><AutomationPanel theme={theme} status={status} onBack={() => {}} /></QueryClientProvider>); }); };

it('후보 이유를 표시하고 선택은 신호를 보내지 않으며 자동 갱신 뒤에도 확인한 대상을 고정', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-07T06:00:00Z'));
  const initial = report(); rpc.get.mockResolvedValue(initial); rpc.confirm.mockResolvedValue({ sent: true });
  await render();
  expect(JSON.stringify(renderer!.toJSON())).toContain(initial.reviews[0].reason);
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'PID 123 리뷰 종료 선택' }).props.onPress());
  expect(rpc.confirm).not.toHaveBeenCalled();
  rpc.get.mockResolvedValue(report([{ ...initial.reviews[0], at: Date.now() + 2000, target: { ...initial.reviews[0].target, start: '1234' } }]));
  await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'PID 123 리뷰 종료 확인' }).props.onPress());
  expect(rpc.confirm).toHaveBeenCalledExactlyOnceWith({ ...initial.reviews[0].target, reviewedAt: initial.reviews[0].at });
  expect(JSON.stringify(renderer!.toJSON())).toContain('종료 요청을 보냈습니다');
});
it('확인을 취소하면 신호가 없으며 서버 거절을 완료로 표시하지 않음', async () => {
  rpc.get.mockResolvedValue(report()); rpc.confirm.mockResolvedValue({ sent: false, error: '대상 경로 변경' });
  await render();
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'PID 123 리뷰 종료 선택' }).props.onPress());
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '리뷰 종료 취소' }).props.onPress());
  expect(rpc.confirm).not.toHaveBeenCalled();
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'PID 123 리뷰 종료 선택' }).props.onPress());
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'PID 123 리뷰 종료 확인' }).props.onPress());
  expect(JSON.stringify(renderer!.toJSON())).toContain('대상 경로 변경');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('종료 요청을 보냈습니다');
});
it('정상·만료·전송된 후보는 확인 버튼이 없으며 기본 폰트와 고정 스크롤 높이를 유지', async () => {
  const r = review();
  rpc.get.mockResolvedValue(report([{ ...r, decision: 'normal' }, { ...r, at: Date.now() - 16 * 60_000, target: { ...r.target, pid: 124 } },
    { ...r, outcome: 'sent', target: { ...r.target, pid: 125 } }]));
  await render();
  expect(renderer!.root.findAll(node => String(node.props.accessibilityLabel).endsWith('리뷰 종료 선택'))).toHaveLength(0);
  expect(renderer!.root.findByProps({ accessibilityLabel: '자동 리뷰 후보와 기록' }).props.style.height).toBe(320);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('fontSize');
  for (const text of renderer!.root.findAll(node => String(node.type) === 'Text')) expect(Object.values(theme.colors)).toContain(text.props.style.color);
});
it('후보가 없는 로딩 상태와 응답 후에도 같은 높이이며 기존 설정으로 켜기/끄기', async () => {
  let finish!: (r: ReturnType<typeof report>) => void;
  rpc.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); rpc.get.mockResolvedValue(report([])); rpc.configure.mockResolvedValue(report([]));
  await render();
  expect(renderer!.root.findByProps({ accessibilityLabel: '자동 리뷰 후보와 기록' }).props.style.height).toBe(320);
  await act(async () => finish(report([])));
  expect(JSON.stringify(renderer!.toJSON())).toContain('검토한 후보 없음');
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '메모리 자동 리뷰' }).props.onPress());
  expect(rpc.configure).toHaveBeenCalledExactlyOnceWith({ enabled: false, pressure: 'critical', sustainedSeconds: 120 });
  expect(rpc.confirm).not.toHaveBeenCalled();
});
