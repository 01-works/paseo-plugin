import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import { emptySnapshot } from '../shared/compute';
const hooks = vi.hoisted(() => ({ sample: vi.fn(), info: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', ScrollView: 'ScrollView' }));
vi.mock('@getpaseo/plugin/client', () => ({ useHosts: () => [{ serverId: 'a', label: 'Mac A', status: 'online' }, { serverId: 'b', label: 'Mac B', status: 'offline' }], useRpc: () => hooks.info }));
vi.mock('../client/data', () => ({ useSnapshot: hooks.sample }));
vi.mock('../client/agents', () => ({ useAgentCounts: () => ({ a: { running: 1, idle: 2, other: 0 } }) }));
vi.mock('../client/popover', () => ({ Details: (props: Record<string, unknown>) => React.createElement('Details', props) }));
import { Dashboard } from '../client/dashboard';

const props = { theme: { colors: { foreground: '#eee', foregroundMuted: '#888', surface0: '#111', surface1: '#222', surface2: '#333', border: '#444' } },
  layout: { compact: false, platform: 'web' }, host: { id: 'a', label: 'Mac A' } } as PluginSurfaceProps;
let renderer: ReactTestRenderer | undefined;
const clients: QueryClient[] = [];
const client = () => { const c = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } }); clients.push(c); return c; };
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (renderer) await act(async () => renderer!.unmount()); renderer = undefined; clients.splice(0).forEach(c => c.clear()); vi.resetAllMocks(); });

it('선택한 호스트의 스냅샷 하나만 표시하며 호스트 전환은 Paseo의 별도 캐시에 맡김', async () => {
  const first = { ...emptySnapshot('native'), seq: 11 }, second = { ...emptySnapshot('native'), seq: 22 };
  hooks.sample.mockReturnValue({ data: first, error: null, isFetching: false }); hooks.info.mockResolvedValue({ hostname: 'Mac A' });
  await act(async () => { renderer = create(<QueryClientProvider client={client()}><Dashboard {...props} /></QueryClientProvider>); });
  expect(renderer!.root.findAllByType('Details' as React.ElementType)).toHaveLength(1);
  expect(renderer!.root.findByType('Details' as React.ElementType).props.snapshot).toBe(first);
  hooks.sample.mockReturnValue({ data: second, error: null, isFetching: false }); hooks.info.mockResolvedValue({ hostname: 'Mac B' });
  await act(async () => renderer!.update(<QueryClientProvider client={client()}><Dashboard {...props} host={{ id: 'b', label: 'Mac B' }} /></QueryClientProvider>));
  const details = renderer!.root.findByType('Details' as React.ElementType);
  expect(details.props.snapshot).toBe(second); expect(details.props.host.id).toBe('b'); expect(details.props.name).toBe('Mac B');
  expect(hooks.info).toHaveBeenCalledTimes(2);
  const current = renderer!.root.findAll(node => String(node.type) === 'Text' && node.children.join('') === '현재 기기');
  expect(current).toHaveLength(1);
});
it('오프라인 선택 호스트는 다른 Mac의 값으로 대체하지 않으며 공식 에이전트 수만 표시', async () => {
  hooks.sample.mockReturnValue({ data: undefined, error: new Error('선택한 호스트 연결 안 됨'), isFetching: false, refetch: vi.fn() });
  hooks.info.mockResolvedValue({ hostname: 'Mac B' });
  await act(async () => { renderer = create(<QueryClientProvider client={client()}><Dashboard {...props} host={{ id: 'b', label: 'Mac B' }} /></QueryClientProvider>); });
  const details = renderer!.root.findByType('Details' as React.ElementType);
  expect(details.props.snapshot).toBeUndefined(); expect(details.props.error).toBe('선택한 호스트 연결 안 됨');
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain('작업 중 1 · 대기 2'); expect(text).toContain('에이전트 확인 불가');
  expect(text).not.toContain('실험적'); expect(text).not.toContain('Mac 시스템 모니터');
});
