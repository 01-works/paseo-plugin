import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { emptySnapshot } from '../shared/compute';
import { processesSchema, TOP_APP_LIMIT, type Snapshot } from '../shared/contracts';
import { GiB } from '../shared/units';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readAppSample, useManualQuery } from '../client/data';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: () => vi.fn() }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView', copyText: vi.fn(async () => {}) }));
import { copyText } from '@getpaseo/plugin/client/react-native';
import { Details, pressureColor } from '../client/popover';
import { Bar, barPercent } from '../client/visuals';
import { snapshotText } from '../client/copy';

const props = { theme: { colors: { foreground: '#eee', foregroundMuted: '#888', surface1: '#222', surface2: '#333', border: '#444',
  accent: '#aaf', statusSuccess: '#0a0', statusWarning: '#aa0', statusDanger: '#a00' } },
  layout: { compact: false, platform: 'web' }, host: { id: 'h', label: 'Mac' } } as PluginHostProps;
const sample: Snapshot = { ...emptySnapshot('native'), status: 'ok', sampledAt: Date.now(), cpu: { total: 23, user: 18, system: 5 },
  memory: { app: 8 * GiB, wired: 3 * GiB, compressed: 4 * GiB, used: 15 * GiB, cached: GiB, total: 16 * GiB }, pressure: 'normal',
  swap: { used: 0, total: 0 }, processesStatus: 'ok', processes: { ready: true, sampledAt: Date.now(), coreCount: 10, excludedRoot: 2,
    excludedPermission: 2, otherErrors: 0, topCpu: [{ name: 'codex', processCount: 2, cpuPercent: 20, memoryBytes: GiB }],
    topMemory: [{ name: 'Google Chrome', processCount: 12, cpuPercent: 4, memoryBytes: 32 * GiB },
      { name: 'claude', processCount: 3, cpuPercent: null, memoryBytes: 8 * GiB }] } };
let renderer: ReactTestRenderer | undefined;
beforeEach(() => { vi.mocked(copyText).mockReset().mockResolvedValue(undefined); (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); });
it('누락값을 0%로 바꾸지 않고 footprint 비교를 물리 RAM으로 나누지 않음', () => {
  expect(barPercent(null)).toBeNull(); expect(barPercent(undefined)).toBeNull(); expect(barPercent(NaN)).toBeNull();
  expect(barPercent(0)).toBe(0); expect(barPercent(1, 0)).toBeNull(); expect(barPercent(200)).toBe(100);
  expect(barPercent(8 * GiB, 32 * GiB)).toBe(25);
});
it('앱 탭 전환에서 목록과 상대 비교 기준을 유지', async () => {
  await act(async () => { renderer = create(<Details {...props} snapshot={sample} name="Mac" />); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('codex');
  const tabs = renderer!.root.findAll(node => node.props.accessibilityRole === 'tab');
  await act(async () => tabs[1].props.onPress());
  expect(JSON.stringify(renderer!.toJSON())).toContain('Google Chrome');
  expect(JSON.stringify(renderer!.toJSON())).toContain('앱 간 상대 크기');
  const bars = renderer!.root.findAllByType(Bar);
  expect(bars.find(b => b.props.label.startsWith('Google Chrome'))?.props.value).toBe(100);
  expect(bars.find(b => b.props.label.startsWith('claude'))?.props.value).toBe(25);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('1 GiB =');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('샘플');
});
it('RAM 사용률이 높아도 상태 색은 OS 압력만 기준', () => {
  expect(pressureColor(sample, props.theme)).toBe(props.theme.colors.statusSuccess);
  expect(pressureColor({ ...sample, pressure: 'unknown' }, props.theme)).toBe(props.theme.colors.foregroundMuted);
  expect(pressureColor({ ...sample, status: 'error' }, props.theme)).toBe(props.theme.colors.foregroundMuted);
});
it('연결 실패 시 그래프를 흐리게 표시하고 최신을 표시하지 않음', async () => {
  await act(async () => { renderer = create(<Details {...props} snapshot={sample} name="Mac" error="연결 끊김" />); });
  const bars = renderer!.root.findAllByType(Bar);
  expect(bars.every(b => b.props.muted)).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain('마지막 수신 값');
});
it('10개 순위를 스크롤 영역에 표시하고 기본 폰트 크기를 유지', async () => {
  const groups = Array.from({ length: TOP_APP_LIMIT }, (_, i) => ({ name: `앱 ${i + 1}`, processCount: 1, cpuPercent: 10 - i, memoryBytes: (10 - i) * GiB }));
  const processes = { ...sample.processes!, topCpu: groups, topMemory: groups };
  expect(processesSchema.safeParse(processes).success).toBe(true);
  expect(processesSchema.safeParse({ ...processes, topCpu: [...groups, groups[0]] }).success).toBe(false);
  await act(async () => { renderer = create(<Details {...props} snapshot={{ ...sample, processes }} name="Mac" />); });
  const scroll = renderer!.root.find(node => node.props.accessibilityLabel === '앱 사용 순위 목록');
  expect(scroll.props.nestedScrollEnabled).toBe(true);
  expect(scroll.props.style.height).toBe(320);
  const appBars = renderer!.root.findAllByType(Bar).filter(b => b.props.label.startsWith('앱 '));
  expect(appBars).toHaveLength(TOP_APP_LIMIT);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('fontSize');
});
it('로딩·완료·오류·미지원 모두 같은 높이의 목록을 유지', async () => {
  await act(async () => { renderer = create(<Details {...props} name="Mac" />); });
  const viewport = () => renderer!.root.find(node => node.props.accessibilityLabel === '앱 사용 순위 목록');
  expect(viewport().props.style).toMatchObject({ height: 320, flexGrow: 0, flexShrink: 0 });
  for (const next of [{ ...sample, processes: null, processesStatus: 'warming' as const }, sample, { ...sample, processes: null, processesStatus: 'error' as const }, { ...emptySnapshot('node'), processesStatus: 'unsupported' as const }]) {
    await act(async () => renderer!.update(<Details {...props} snapshot={next} name="Mac" />));
    expect(viewport().props.style).toMatchObject({ height: 320, flexGrow: 0, flexShrink: 0 });
  }
});
it('열 때 한 번만 읽고 시간 경과·공유 캐시 변경에도 화면 유지; 새로고침 버튼만 다시 읽음', async () => {
  vi.useFakeTimers();
  const rpc = vi.fn(async () => sample);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  function Monitor() {
    const query = useManualQuery({ queryKey: ['manual-test'], queryFn: rpc });
    return <Details {...props} snapshot={query.data} name="Mac" error={query.error?.message}
      refreshing={query.isFetching} onRefresh={() => void query.refetch()} />;
  }
  await act(async () => { renderer = create(<QueryClientProvider client={client}><Monitor /></QueryClientProvider>); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(rpc).toHaveBeenCalledTimes(1);
  const fixed = JSON.stringify(renderer!.toJSON());
  const next = { ...sample, seq: (sample.seq ?? 0) + 1, sampledAt: Date.now(),
    cpu: { total: 67, user: 62, system: 5 }, processes: { ...sample.processes!, topCpu: [{ ...sample.processes!.topCpu[0], name: '다른 앱' }] } };
  await act(async () => { client.setQueryData(['manual-test'], next); await vi.advanceTimersByTimeAsync(60_000); });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(renderer!.toJSON())).toEqual(fixed);
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '모니터 값 복사' }).props.onPress());
  const copied = vi.mocked(copyText).mock.calls[0][0];
  expect(copied).toContain('CPU: 23%'); expect(copied).toContain('codex');
  expect(copied).not.toContain('다른 앱');
  expect(copied).toContain(new Date(sample.sampledAt!).toLocaleString('ko-KR'));
  rpc.mockResolvedValueOnce({ ...next, sampledAt: Date.now() });
  await act(async () => { renderer!.root.findByProps({ accessibilityLabel: '모니터 새로고침' }).props.onPress(); await vi.advanceTimersByTimeAsync(10); });
  expect(rpc).toHaveBeenCalledTimes(2);
  const resumed = JSON.stringify(renderer!.toJSON());
  expect(resumed).toContain('67%'); expect(resumed).toContain('다른 앱');
  const values = renderer!.root.findAll(node => String(node.type) === 'Text' && node.children.includes('67%'));
  expect(values[0].props.selectable).toBe(true);
  rpc.mockRejectedValueOnce(new Error('연결 끊김'));
  await act(async () => { renderer!.root.findByProps({ accessibilityLabel: '모니터 새로고침' }).props.onPress(); await vi.advanceTimersByTimeAsync(10); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('연결 끊김');
  expect(JSON.stringify(renderer!.toJSON())).toContain('67%');
  client.clear();
});
it('클립보드 실패를 성공으로 표시하지 않고 누락값·미지원·오류를 그대로 복사', async () => {
  vi.mocked(copyText).mockRejectedValueOnce(new Error('denied'));
  await act(async () => { renderer = create(<Details {...props} snapshot={sample} name="Mac" />); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '모니터 값 복사' }).props.onPress());
  expect(JSON.stringify(renderer!.toJSON())).toContain('복사하지 못했습니다');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('복사됨');
  const text = snapshotText({ ...emptySnapshot('node'), errors: ['측정 실패'] }, 'Mac', '연결 실패');
  expect(text).toContain('CPU: —'); expect(text).toContain('메모리: — / —');
  expect(text).toContain('미지원'); expect(text).toContain('측정 실패'); expect(text).toContain('연결 실패');
  expect(text).not.toContain('0%'); expect(text).not.toContain('0.0 GiB');
});
it('최초 앱 기준점만 최대 두 주기 기다리고 이후 추가 읽기가 없으며 닫으면 대기 취소', async () => {
  vi.useFakeTimers();
  const read = vi.fn().mockResolvedValueOnce({ ...sample, processesStatus: 'off' })
    .mockResolvedValueOnce({ ...sample, processesStatus: 'warming' }).mockResolvedValue(sample);
  const controller = new AbortController();
  const initial = readAppSample(controller.signal, read);
  await vi.advanceTimersByTimeAsync(4400);
  expect(await initial).toBe(sample);
  expect(read).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60_000); expect(read).toHaveBeenCalledTimes(3);
  const pending = readAppSample(controller.signal, async () => ({ ...sample, processesStatus: 'warming' }));
  const rejection = expect(pending).rejects.toThrow('취소');
  await Promise.resolve(); controller.abort(); await rejection;
  expect(vi.getTimerCount()).toBe(0);
});
