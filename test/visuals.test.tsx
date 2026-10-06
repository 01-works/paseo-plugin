import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { emptySnapshot } from '../shared/compute';
import { processesSchema, TOP_APP_LIMIT, type Snapshot } from '../shared/contracts';
import { GiB } from '../shared/units';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: () => vi.fn() }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ ScrollView: 'ScrollView' }));
import { Details, pressureColor } from '../client/popover';
import { Bar, barPercent } from '../client/visuals';

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
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; });
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
  expect(JSON.stringify(renderer!.toJSON())).toContain('목록 내 최대값 대비');
  const bars = renderer!.root.findAllByType(Bar);
  expect(bars.find(b => b.props.label.startsWith('Google Chrome'))?.props.value).toBe(100);
  expect(bars.find(b => b.props.label.startsWith('claude'))?.props.value).toBe(25);
  expect(JSON.stringify(renderer!.toJSON())).toContain('할당된 스왑 없음');
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
  expect(scroll.props.style.maxHeight).toBe(320);
  const appBars = renderer!.root.findAllByType(Bar).filter(b => b.props.label.startsWith('앱 '));
  expect(appBars).toHaveLength(TOP_APP_LIMIT);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain('fontSize');
});
