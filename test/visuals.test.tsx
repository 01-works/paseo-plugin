import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { emptySnapshot } from '../shared/compute';
import { processesSchema, TOP_APP_LIMIT, type Snapshot } from '../shared/contracts';
import { GiB } from '../shared/units';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readAppSample, useStableQuery } from '../client/data';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: () => vi.fn(async () => ({ status: 'ok', entries: [] })) }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView', copyText: vi.fn(async () => {}) }));
import { Details, pressureColor } from '../client/popover';
import { Bar, barPercent, usageColor } from '../client/visuals';

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
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; vi.useRealTimers(); });
it('누락값을 0%로 바꾸지 않고 footprint 비교를 물리 RAM으로 나누지 않음', () => {
  expect(barPercent(null)).toBeNull(); expect(barPercent(undefined)).toBeNull(); expect(barPercent(NaN)).toBeNull();
  expect(barPercent(0)).toBe(0); expect(barPercent(1, 0)).toBeNull(); expect(barPercent(200)).toBe(100);
  expect(barPercent(8 * GiB, 32 * GiB)).toBe(25);
});
it('CPU·메모리를 같은 행에 표시하고 열 제목으로 순위를 전환', async () => {
  await act(async () => { renderer = create(<Details {...props} snapshot={sample} name="Mac" />); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('codex');
  const tabs = renderer!.root.findAll(node => String(node.props.accessibilityLabel).endsWith('순위로 정렬'));
  await act(async () => tabs[1].props.onPress());
  expect(JSON.stringify(renderer!.toJSON())).toContain('Google Chrome');
  const row = renderer!.root.find(node => node.props.accessibilityLabel === '1위 Google Chrome, 프로세스 12개');
  expect(row.findAll(node => String(node.type) === 'Text').map(node => node.children.join(''))).toEqual(['Google Chrome', '4.0%', '32.0 GiB', '전체 종료']);
  expect(JSON.stringify(renderer!.toJSON())).toContain('—');
  expect(tabs[1].props.accessibilityState.selected).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('1 GiB =');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('샘플');
  const diskBar = renderer!.root.findAllByType(Bar).find(node => node.props.label.startsWith('디스크'))!;
  expect(diskBar.props.label).toBe('디스크 — / —'); expect(diskBar.props.value).toBeNull();
});
it('RAM 사용률이 높아도 상태 색은 OS 압력만 기준', () => {
  expect(pressureColor(sample, props.theme)).toBe(props.theme.colors.statusSuccess);
  expect(pressureColor({ ...sample, pressure: 'unknown' }, props.theme)).toBe(props.theme.colors.foregroundMuted);
  expect(pressureColor({ ...sample, status: 'error' }, props.theme)).toBe(props.theme.colors.foregroundMuted);
});
it('CPU·디스크 강조 기준의 경계를 구분하고 누락·지연 값은 중립색 사용', () => {
  const c = props.theme.colors;
  for (const [resource, warning, high] of [['cpu', 50, 80], ['disk', 85, 95]] as const) {
    expect(usageColor(0, props.theme, resource)).toBe(c.accent);
    expect(usageColor(warning - 0.01, props.theme, resource)).toBe(c.accent);
    expect(usageColor(warning, props.theme, resource)).toBe(c.statusWarning);
    expect(usageColor(high - 0.01, props.theme, resource)).toBe(c.statusWarning);
    expect(usageColor(high, props.theme, resource)).toBe(c.statusDanger);
    expect(usageColor(100, props.theme, resource, true)).toBe(c.foregroundMuted);
    expect(usageColor(null, props.theme, resource)).toBe(c.foregroundMuted);
    expect(usageColor(NaN, props.theme, resource)).toBe(c.foregroundMuted);
  }
});
it('높은 CPU·디스크 사용률과 RAM 압력을 독립적으로 표현하고 오래된 값은 색을 제거', async () => {
  const c = props.theme.colors;
  const stressed: Snapshot = { ...sample, sampledAt: Date.now(), cpu: { total: 90, user: 75, system: 15 },
    disk: { total: 100 * GiB, used: 96 * GiB, available: 4 * GiB, sampledAt: Date.now() } };
  await act(async () => { renderer = create(<Details {...props} snapshot={stressed} name="Mac" />); });
  const memoryBar = () => renderer!.root.find(node => String(node.type) === 'View' && (node.props.accessibilityLabel ?? '').startsWith('메모리 '));
  const bars = () => renderer!.root.findAllByType(Bar);
  expect(bars().map(bar => bar.props.color)).toEqual([c.statusDanger, c.statusSuccess, c.statusDanger]);
  expect(memoryBar().findAll(node => String(node.type) === 'View')[1].props.style.backgroundColor).toBe(c.statusSuccess);
  await act(async () => renderer!.update(<Details {...props} snapshot={{ ...stressed, pressure: 'critical' }} name="Mac" />));
  expect(memoryBar().findAll(node => String(node.type) === 'View')[1].props.style.backgroundColor).toBe(c.statusDanger);
  await act(async () => renderer!.update(<Details {...props} snapshot={{ ...stressed, sampledAt: Date.now() - 6000, status: 'stale' }} name="Mac" />));
  expect(bars().map(bar => bar.props.color)).toEqual([c.foregroundMuted, c.foregroundMuted, c.foregroundMuted]);
  expect(memoryBar().findAll(node => String(node.type) === 'View').slice(1).every(node => node.props.style.backgroundColor === c.foregroundMuted)).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain('90%');
});
it('메모리 막대는 구성 항목 합이나 캐시를 더하지 않고 표시한 총 사용량과 같은 비율', async () => {
  const memory = { ...sample.memory!, used: 15.5 * GiB, cached: 2 * GiB };
  await act(async () => { renderer = create(<Details {...props} snapshot={{ ...sample, memory }} name="Mac" />); });
  const memoryBar = () => renderer!.root.findAllByType(Bar).find(node => node.props.label.startsWith('메모리 '))!;
  expect(memoryBar().props.value).toBe(96.875);
  expect(memoryBar().props.label).toBe('메모리 15.5 GiB / 16.0 GiB');
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain('앱'); expect(text).toContain('8.0 GiB'); expect(text).not.toContain('기타');
  await act(async () => renderer!.update(<Details {...props} snapshot={{ ...sample, memory: null, status: 'error' }} name="Mac" />));
  expect(memoryBar().props.value).toBeNull();
  expect(memoryBar().props.label).toBe('메모리 — / —');
});
it('앱 상세는 좌상단 뒤로·앱 이름으로 진입을 표시하고 돌아오면 정렬 기준 유지', async () => {
  const client = new QueryClient();
  await act(async () => { renderer = create(<QueryClientProvider client={client}><Details {...props} snapshot={sample} name="Mac" /></QueryClientProvider>); });
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '메모리 순위로 정렬' }).props.onPress());
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: 'Google Chrome 프로세스 보기' }).props.onPress());
  const texts = renderer!.root.findAll(node => String(node.type) === 'Text').map(node => node.children.join(''));
  expect(texts.slice(0, 2)).toEqual(['‹ 뒤로', 'Google Chrome']);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('메모리 압력');
  await act(async () => renderer!.root.findByProps({ accessibilityLabel: '상위 앱으로 돌아가기' }).props.onPress());
  expect(renderer!.root.findByProps({ accessibilityLabel: '메모리 순위로 정렬' }).props.accessibilityState.selected).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain('Google Chrome');client.clear();
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
  const appRows = renderer!.root.findAll(node => /^\d+위 앱 /.test(node.props.accessibilityLabel ?? ''));
  expect(appRows).toHaveLength(TOP_APP_LIMIT);
  expect(appRows[9].findAll(node => String(node.type) === 'Text').map(node => node.children.join(''))).toEqual(['앱 10', '1.0%', '1.0 GiB', '전체 종료']);
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
    const query = useStableQuery({ queryKey: ['manual-test'], queryFn: rpc });
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

it('pill의 받은 값을 요청 완료 전에 바로 표시하고 이후 pill 갱신은 상세를 바꾸지 않음', async () => {
  let resolve!: (value: Snapshot) => void;
  const rpc = vi.fn(() => new Promise<Snapshot>(done => { resolve = done; }));
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  function Monitor({ seed }: { seed: Snapshot }) {
    const query = useStableQuery({ queryKey: ['seed-test'], queryFn: rpc, initialData: seed });
    return <Details {...props} snapshot={query.data} name="Mac" />;
  }
  await act(async () => { renderer = create(<QueryClientProvider client={client}><Monitor seed={sample} /></QueryClientProvider>); });
  expect(JSON.stringify(renderer!.toJSON())).toContain('23%');
  expect(JSON.stringify(renderer!.toJSON())).toContain('15.0 GiB');
  const fixed = JSON.stringify(renderer!.toJSON());
  await act(async () => renderer!.update(<QueryClientProvider client={client}><Monitor seed={{ ...sample, cpu: { total: 99, user: 99, system: 0 } }} /></QueryClientProvider>));
  expect(JSON.stringify(renderer!.toJSON())).toEqual(fixed);
  await act(async () => { resolve(sample); });
  expect(rpc).toHaveBeenCalledOnce();
  client.clear();
});

it('자동 갱신은 창·목록 mount를 유지하고 숨기면 RPC를 중단', async () => {
  vi.useFakeTimers();
  const rpc = vi.fn(async () => sample);
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  function Monitor({ enabled = true }: { enabled?: boolean }) {
    const query = useStableQuery({ queryKey: ['auto-test'], queryFn: rpc, initialData: sample, refreshInterval: 2000, enabled });
    return <Details {...props} snapshot={query.data} name="Mac" />;
  }
  await act(async () => { renderer = create(<QueryClientProvider client={client}><Monitor /></QueryClientProvider>); });
  const list = renderer!.root.find(node => node.props.accessibilityLabel === '앱 사용 순위 목록');
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(rpc).toHaveBeenCalledTimes(4);
  expect(renderer!.root.find(node => node.props.accessibilityLabel === '앱 사용 순위 목록')).toBe(list);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('모니터 값 복사');
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('제외 root');
  await act(async () => renderer!.update(<QueryClientProvider client={client}><Monitor enabled={false} /></QueryClientProvider>));
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(rpc).toHaveBeenCalledTimes(4);
  client.clear();
});
