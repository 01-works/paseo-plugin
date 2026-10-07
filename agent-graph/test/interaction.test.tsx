import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginButton, PluginButtonIconProps, PluginClientContext } from '@getpaseo/plugin/client';
import type { PaseoApi, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { createAgentDirectory } from '../client/directory';
import { createGraphViews } from '../client/view-state';
import { page, raw } from './fixtures';
const testViewport = vi.hoisted(() => ({ width: 320, height: 360 }));
const treeScrollToIndex = vi.hoisted(() => vi.fn());

vi.mock('react-native', async () => {
  const { createElement, forwardRef, useImperativeHandle, useLayoutEffect } = await import('react');
  return { View: forwardRef((props: { children?: React.ReactNode; onLayout?: (event: unknown) => void }, ref) => {
    useImperativeHandle(ref, () => ({ measureInWindow: (callback: (x: number, y: number) => void) => callback(0, 0) }));
    useLayoutEffect(() => { props.onLayout?.({ nativeEvent: { layout: { ...testViewport } } }); }, []);
    return createElement('View', props, props.children);
  }), Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'web' },
    PanResponder: { create: (handlers: Record<string, unknown>) => ({ panHandlers: {
      onStartShouldSetResponder: handlers.onStartShouldSetPanResponder,
      onMoveShouldSetResponderCapture: handlers.onMoveShouldSetPanResponderCapture,
      onResponderGrant: handlers.onPanResponderGrant, onResponderMove: handlers.onPanResponderMove,
      onResponderRelease: handlers.onPanResponderRelease,
      onResponderStart: handlers.onPanResponderStart, onResponderEnd: handlers.onPanResponderEnd,
      onResponderTerminate: handlers.onPanResponderTerminate,
    } }) } };
});
vi.mock('@getpaseo/plugin/client/react-native', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  const ScrollView = forwardRef((props: { children: React.ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ scrollTo: vi.fn() }));
    return createElement('ScrollView', props, props.children);
  });
  const FlatList = forwardRef((props: { data: unknown[]; renderItem: (input: { item: unknown }) => React.ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ scrollToIndex: treeScrollToIndex }));
    return createElement('FlatList', props, props.data.slice(0,12).map((item, i) => createElement('Row', { key: i }, props.renderItem({ item }))));
  });
  return { ScrollView, FlatList, Icon: 'Icon', TextInput: 'TextInput',
    copyText: vi.fn(async () => {}), useToast: () => ({ show: vi.fn(), error: vi.fn() }),
    Modal: Object.assign((props: { children: React.ReactNode }) => createElement('Modal', props, props.children),
      { Content: (props: { children: React.ReactNode }) => createElement('ModalContent', props, props.children) }) };
});
import { contributePills } from '../client/pill';
import { Graph } from '../client/graph';
import { GraphContent } from '../client/content';
import { GraphModal } from '../client/modal';
import { AgentSurface } from '../client/surface';
import { createAgentNavigation, browserSurfaceId } from '../client/navigation';
import { copyText } from '@getpaseo/plugin/client/react-native';
import { Platform } from 'react-native';
const palette = { foreground: '#eee', foregroundMuted: '#aaa', surface0: '#111', surface1: '#222', surface2: '#333', border: '#444',
  accent: '#88c', statusSuccess: '#0a0', statusWarning: '#aa0', statusDanger: '#a00' };
const props = { theme: { colors: palette }, host: { id: 'h', label: '호스트' }, layout: { compact: false, platform: 'web' }, size: 14, color: '#aaa' } as PluginButtonIconProps;
let renderer: ReactTestRenderer | undefined;
const cleanups: (() => unknown)[] = [];
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Platform.OS = 'web'; vi.useFakeTimers();
  testViewport.width = 320; testViewport.height = 360;
  treeScrollToIndex.mockClear();
});
afterEach(async () => {
  await act(async () => renderer?.unmount()); renderer = undefined;
  for (const cleanup of cleanups.splice(0)) await cleanup(); vi.useRealTimers();
});
// 기존 그래프 회귀 사례는 구조 탭을 선택한 상태에서 시작한다. 첫 진입 탐색은 별도 사례로 검증한다.
async function setup(entries = [raw('a'), raw('b', { labels: { 'paseo.parent-agent-id': 'a' } })], view: 'browse' | 'structure' = 'structure') {
  let observer!: SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>;
  const snapshot = page(entries);
  const release = vi.fn(async () => {});
  const lease = { subscriptionId: 's', subscribe: (value: typeof observer) => { observer = value; value.snapshot({ ...snapshot, subscriptionId: 's' }); return vi.fn(); }, release };
  const list = vi.fn(async () => ({ ...snapshot, subscription: lease }));
  const directory = createAgentDirectory({ agents: { list } } as unknown as PaseoApi, 'h');
  const views = createGraphViews();
  for (const entry of entries) views.forAgent('h', entry.workspaceId ?? 'w', entry.id).set({ view });
  const buttons = new Map<string, { button: PluginButton; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }>();
  const openPanel = vi.fn(), openSurface = vi.fn();
  const client = { openPanel, openSurface, addComposerPill: ({ agentId, button }: { agentId: string; button: PluginButton }) => {
    const registration = { button, update: vi.fn(), remove: vi.fn() }; buttons.set(agentId, registration); return registration;
  } } as unknown as PluginClientContext;
  const agentNavigation = createAgentNavigation(client);
  cleanups.push(contributePills(client, directory, views, agentNavigation)); cleanups.push(() => directory.dispose()); cleanups.push(() => agentNavigation.dispose());
  await directory.start();
  return { directory, views, buttons, list, openPanel, openSurface, agentNavigation, observer };
}
it('보이는 pill 3개도 구독 하나를 공유하고 같은 라벨을 다시 갱신하지 않음', async () => {
  const h = await setup();
  const Icon = h.buttons.get('a')!.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<><Icon {...props} /><Icon {...props} /><Icon {...props} /></>); });
  const registration = h.buttons.get('a')!;
  expect(registration.update).toHaveBeenCalledOnce();
  h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('a'), project: {} } } as Parameters<typeof h.observer.update>[0]);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(h.list).toHaveBeenCalledOnce(); expect(registration.update).toHaveBeenCalledOnce();
});
it('본문 클릭 guard와 상태 갱신은 모달·좌표·선택·배율을 유지', async () => {
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(1);
  const before = renderer!.root.findByType(Graph).props.geometry;
  const lines = renderer!.root.findAll(n => n.type === ('View' as React.ElementType) && n.props.pointerEvents === 'none');
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line.props.style.left).toEqual(expect.any(Number)); expect(line.props.style.top).toEqual(expect.any(Number));
  }
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.zoomTo(1.25));
  const stopPropagation = vi.fn();
  const guard = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.focusable === false);
  await act(async () => guard.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledOnce();
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('b', {
      labels: { 'paseo.parent-agent-id': 'a' }, status: 'running', updatedAt: '2026-02-01T00:00:00.000Z',
    }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(renderer!.root.findByType(Graph).props.geometry).toBe(before);
  expect(store.getSnapshot().zoom).toBe(1.25); expect(store.getSnapshot().selected).not.toBeNull();
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(1);
});
it('크게 보기는 현재 context로 패널을 열고 표시 상태를 넘김', async () => {
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const content = renderer!.root.findByType(GraphContent);
  await act(async () => content.props.onLarge());
  expect(h.openPanel).toHaveBeenCalledWith('graph', { workspaceId: 'w', agentId: 'a', location: 'workspace' });
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(0);
});
it('compact는 그래프·목록을 선택하고 확대 도구와 기본 텍스트를 표시', async () => {
  Platform.OS = 'ios';
  const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(1);
  const press = (name: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) &&
    (n.props.accessibilityLabel === name || n.findAllByType('Text' as React.ElementType).some(text => text.props.children === name)));
  await act(async () => press('목록').props.onPress());
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(0);
  expect(renderer!.root.findAll(n => n.type === ('FlatList' as React.ElementType))).toHaveLength(1);
  await act(async () => press('그래프').props.onPress());
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(1);
  expect(renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === '확대').props.disabled).toBe(false);
  const texts = renderer!.root.findAll(n => n.type === ('Text' as React.ElementType));
  for (const text of texts) {
    expect(text.props.style.color).toBeTruthy(); expect(text.props.style.fontSize).toBeUndefined();
  }
});
it('iOS에서도 pill을 등록하고 탭하면 compact 모달의 그래프를 표시', async () => {
  Platform.OS = 'ios';
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  const ios = { ...props, layout: { compact: true, platform: 'ios' as const } };
  await act(async () => { renderer = create(<Icon {...ios} />); });
  expect(registration.update).toHaveBeenLastCalledWith({ label: '에이전트 2' });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(1);
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(1);
  expect(renderer!.root.findAll(n => n.type === ('FlatList' as React.ElementType))).toHaveLength(0);
  expect(renderer!.root.findByType('ModalContent' as React.ElementType).props.scrollable).toBe(false);
  expect(h.list).toHaveBeenCalledOnce();
});
it('구조 목록의 최초 위치 맞춤은 실제 높이를 기다리고 상태 갱신 중 스크롤을 반복하지 않음', async () => {
  const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" />); });
  const mode = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) &&
    n.findAllByType('Text' as React.ElementType).some(text => text.props.children === '목록'));
  await act(async () => mode.props.onPress()); expect(treeScrollToIndex).not.toHaveBeenCalled();
  const list = () => renderer!.root.findByType('FlatList' as React.ElementType);
  await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 0 } } }));
  expect(treeScrollToIndex).not.toHaveBeenCalled();
  await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 200 } } }));
  expect(treeScrollToIndex).toHaveBeenCalledExactlyOnceWith({ index: 0, animated: false, viewPosition: 0.3 });
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('a', { status: 'running' }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(treeScrollToIndex).toHaveBeenCalledOnce();
});
it('첫 진입은 현재 workspace 탐색이고 iOS 행 탭은 공개 surface를 거쳐 대화 focus를 요청', async () => {
  Platform.OS = 'ios';
  const h = await setup([raw('a'), raw('b', { title: '최근 작업', updatedAt: '2026-02-01T00:00:00Z' }),
    raw('foreign', { workspaceId: 'other', labels: { 'paseo.parent-agent-id': 'a' }, updatedAt: '2026-03-01T00:00:00Z' })], 'browse');
  const registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  const ios = { ...props, layout: { compact: true, platform: 'ios' as const } };
  await act(async () => { renderer = create(<Icon {...ios} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); await vi.advanceTimersByTimeAsync(1000); });
  expect(registration.update).toHaveBeenLastCalledWith({ label: '에이전트 2' });
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(0);
  expect(h.views.forAgent('h', 'w', 'a').forceCache.size).toBe(0);
  expect(renderer!.root.findByType('FlatList' as React.ElementType).props.data.map((agent: { id: string }) => agent.id)).toEqual(['b', 'a']);
  const target = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === '최근 작업');
  await act(async () => target.props.onLongPress()); expect(copyText).toHaveBeenLastCalledWith('b');
  expect(h.openSurface).not.toHaveBeenCalled();
  await act(async () => target.props.onPress());
  expect(h.openSurface).toHaveBeenCalledWith(browserSurfaceId);
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(0);
  const openAgent = vi.fn();
  await act(async () => renderer!.update(<AgentSurface {...ios} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).toHaveBeenCalledExactlyOnceWith({ agentId: 'b', serverId: 'h' });
  await act(async () => renderer!.update(<AgentSurface {...ios} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).toHaveBeenCalledOnce(); expect(h.list).toHaveBeenCalledOnce();
});
it('탐색 정렬·검색·시각 업데이트는 현재 workspace 안에서 동작하고 조회를 늘리지 않음', async () => {
  const h = await setup([raw('a', { createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' }), raw('b')], 'browse');
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" onNavigate={vi.fn()} />); });
  const ids = () => renderer!.root.findByType('FlatList' as React.ElementType).props.data.map((agent: { id: string }) => agent.id);
  expect(ids()).toEqual(['a', 'b']);
  const list = renderer!.root.findByType('FlatList' as React.ElementType);
  await act(async () => list.props.onScroll({ nativeEvent: { contentOffset: { y: 92 } } }));
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('b', { updatedAt: '2026-03-01T00:00:00Z' }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(ids()).toEqual(['b', 'a']); expect(h.views.forAgent('h', 'w', 'a').browserScroll.modal).toBe(92);
  const press = (name: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.findAllByType('Text' as React.ElementType).some(text => text.props.children === name));
  await act(async () => press('생성순').props.onPress()); expect(ids()).toEqual(['a', 'b']);
  await act(async () => press('생성순').props.onPress()); expect(ids()).toEqual(['a', 'b']);
  await act(async () => press('활동순').props.onPress()); expect(ids()).toEqual(['b', 'a']);
  const input = renderer!.root.findByType('TextInput' as React.ElementType);
  await act(async () => input.props.onChangeText(' B ')); expect(ids()).toEqual(['b']);
  await act(async () => press('구조').props.onPress());
  await act(async () => press('탐색').props.onPress()); expect(ids()).toEqual(['b']);
  expect(h.list).toHaveBeenCalledOnce();
});
it('검색 제출은 결과가 하나일 때만 대화를 열고 복사·지우기는 이동하지 않음', async () => {
  const h = await setup([raw('a', { title: 'API 검토' }), raw('b', { title: '문서 정리' })], 'browse');
  const onNavigate = vi.fn();
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" onNavigate={onNavigate} />); });
  const input = () => renderer!.root.findByType('TextInput' as React.ElementType);
  const button = (label: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  await act(async () => input().props.onSubmitEditing()); expect(onNavigate).not.toHaveBeenCalled();
  await act(async () => input().props.onChangeText('없음'));
  await act(async () => input().props.onSubmitEditing()); expect(onNavigate).not.toHaveBeenCalled();
  await act(async () => input().props.onChangeText('문서'));
  await act(async () => button('b ID 복사').props.onPress()); expect(copyText).toHaveBeenLastCalledWith('b');
  expect(onNavigate).not.toHaveBeenCalled();
  await act(async () => input().props.onSubmitEditing()); expect(onNavigate).toHaveBeenCalledExactlyOnceWith('b');
  await act(async () => button('검색 지우기').props.onPress());
  expect(input().props.value).toBe(''); expect(onNavigate).toHaveBeenCalledOnce(); expect(h.list).toHaveBeenCalledOnce();
});
it('첫 목록 조회 실패는 로딩으로 남지 않고 다시 읽기로 복구', async () => {
  const snapshot = page([raw('a')]);
  const lease = { subscriptionId: 'retry', release: vi.fn(async () => {}),
    subscribe: (observer: SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>) => {
      observer.snapshot({ ...snapshot, subscriptionId: 'retry' }); return vi.fn();
    } };
  const list = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ...snapshot, subscription: lease });
  const directory = createAgentDirectory({ agents: { list } } as unknown as PaseoApi, 'h');
  cleanups.push(() => directory.dispose());
  await directory.start();
  await act(async () => { renderer = create(<GraphContent {...props} directory={directory} views={createGraphViews()}
    workspaceId="w" agentId="a" surface="modal" onNavigate={vi.fn()} />); });
  const text = () => renderer!.root.findAllByType('Text' as React.ElementType).map(node => node.props.children);
  expect(text()).toContain('목록 확인 불가'); expect(text()).not.toContain('불러오는 중');
  const retry = renderer!.root.find(node => node.type === ('Pressable' as React.ElementType) &&
    node.findAllByType('Text' as React.ElementType).some(text => text.props.children === '다시 읽기'));
  await act(async () => retry.props.onPress());
  expect(directory.getSnapshot()).toMatchObject({ loaded: true, loading: false, error: null });
  expect(renderer!.root.findByType('FlatList' as React.ElementType).props.data.map((agent: { id: string }) => agent.id)).toEqual(['a']);
  expect(text()).not.toContain('목록 확인 불가'); expect(list).toHaveBeenCalledTimes(2);
});
it('데스크톱 탐색 크게 보기는 원래 workspace의 패널을 열고 열기 실패 때 모달을 유지', async () => {
  const h = await setup(undefined, 'browse'), registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.set({ browserSort: 'created', browserQuery: 'a' }));
  h.openPanel.mockImplementationOnce(() => { throw new Error('panel unavailable'); });
  await act(async () => renderer!.root.findByType(GraphContent).props.onLarge());
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(1);
  await act(async () => renderer!.root.findByType(GraphContent).props.onLarge());
  expect(h.openPanel).toHaveBeenLastCalledWith('graph', { workspaceId: 'w', agentId: 'a', location: 'workspace' });
  expect(store.getSnapshot()).toMatchObject({ view: 'browse', browserSort: 'created', browserQuery: 'a' });
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(0); expect(h.openSurface).not.toHaveBeenCalled();
});
it('compact 탐색 크게 보기는 현재 workspace context로 열며 surface 실패는 pill을 닫지 않음', async () => {
  const h = await setup(undefined, 'browse'), registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} layout={{ compact: true, platform: 'ios' }} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const content = renderer!.root.findByType(GraphContent);
  h.openSurface.mockImplementationOnce(() => { throw new Error('route unavailable'); });
  await act(async () => content.props.onLarge());
  expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(1); expect(h.agentNavigation.getSnapshot()).toBeNull();
  await act(async () => content.props.onLarge());
  expect(h.agentNavigation.getSnapshot()).toMatchObject({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: null });
  expect(h.openPanel).not.toHaveBeenCalled(); expect(renderer!.root.findAllByType(GraphModal)).toHaveLength(0);
});
it('이동 도중 archive된 에이전트와 다른 호스트 context는 navigation을 호출하지 않음', async () => {
  const h = await setup(undefined, 'browse'), openAgent = vi.fn(), navigation = { openAgent, openWorkspace: vi.fn() };
  h.agentNavigation.open({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: 'b' });
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('b', { archivedAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
    renderer = create(<AgentSurface {...props} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} navigation={navigation} />);
  });
  expect(openAgent).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType('Text' as React.ElementType).some(node => node.props.children === '선택한 에이전트가 원래 워크스페이스에 없습니다')).toBe(true);
  await act(async () => h.agentNavigation.open({ serverId: 'other', workspaceId: 'w', agentId: 'a', targetId: 'a' }));
  expect(openAgent).not.toHaveBeenCalled();
});
it('navigation이 없는 공개 surface는 이동을 가장하지 않고 ID 복사만 제공', async () => {
  const h = await setup(undefined, 'browse'); h.agentNavigation.open({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: 'b' });
  await act(async () => { renderer = create(<AgentSurface {...props} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} />); });
  const row = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'b');
  expect(row.props.disabled).toBe(true);
  const copy = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'b ID 복사');
  await act(async () => copy.props.onPress()); expect(copyText).toHaveBeenLastCalledWith('b');
  expect(h.agentNavigation.takeTarget(h.agentNavigation.getSnapshot()!)).toBeNull();
});
it('구조에서 선택한 다른 workspace의 자손은 원래 context를 유지하며 실제 대화로 이동', async () => {
  const h = await setup([raw('a'), raw('foreign', { workspaceId: 'other', labels: { 'paseo.parent-agent-id': 'a' } })]);
  const registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  await act(async () => renderer!.root.findByType(GraphContent).props.onNavigate('foreign'));
  expect(h.agentNavigation.getSnapshot()).toMatchObject({ workspaceId: 'w', targetId: 'foreign', targetWorkspaceId: 'other' });
  const openAgent = vi.fn();
  await act(async () => renderer!.update(<AgentSurface {...props} directory={h.directory} views={h.views} agentNavigation={h.agentNavigation} navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).toHaveBeenCalledExactlyOnceWith({ agentId: 'foreign', serverId: 'h' });
});
it('뷰 상태는 호스트·workspace·에이전트별로 구분하며 접기와 배율을 보존', () => {
  const views = createGraphViews(), first = views.forAgent('h', 'w', 'a');
  expect(first.getSnapshot().view).toBe('browse');
  first.toggle('child'); first.zoomTo(1.25);
  expect(views.forAgent('h', 'w', 'a')).toBe(first);
  expect(views.forAgent('other', 'w', 'a').getSnapshot().collapsed.size).toBe(0);
  expect(views.forAgent('h', 'other', 'a')).not.toBe(first);
  expect(views.forAgent('h', 'w', 'b').forceCache).toBe(first.forceCache);
});
it('compact 구조 크게 보기는 작업 패널 대신 공개 전체 화면으로 상태를 유지', async () => {
  const h = await setup(), registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  const ios = { ...props, layout: { compact: true, platform: 'ios' as const } };
  await act(async () => { renderer = create(<Icon {...ios} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  await act(async () => renderer!.root.findByType(GraphContent).props.onLarge());
  expect(h.openSurface).toHaveBeenCalledWith(browserSurfaceId); expect(h.openPanel).not.toHaveBeenCalled();
  expect(h.views.forAgent('h', 'w', 'a').getSnapshot().view).toBe('structure');
  expect(h.agentNavigation.getSnapshot()).toMatchObject({ targetId: null, workspaceId: 'w', agentId: 'a' });
});
it('상세 복사 버튼과 노드 길게 누르기는 선택한 실제 ID만 복사', async () => {
  const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" />); });
  const copy = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'a ID 복사');
  await act(async () => copy.props.onPress());
  expect(copyText).toHaveBeenLastCalledWith('a');
  const child = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'b');
  await act(async () => child.props.onLongPress());
  expect(copyText).toHaveBeenLastCalledWith('b');
});
it('큰 구조는 양방향 드래그로 이동하고 경계·선택·자동 갱신을 유지', async () => {
  const h = await setup([raw('a'), ...Array.from({ length: 30 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" />); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await act(async () => store.zoomTo(1));
  const start = { ...store.scroll.modal }, selected = store.getSnapshot().selected;
  const pan = renderer!.root.find(n => n.type === ('View' as React.ElementType) && n.props.accessibilityLabel === '에이전트 그래프 이동 영역');
  expect(pan.props.onMoveShouldSetResponderCapture({}, { dx: 1, dy: 1 })).toBe(false);
  expect(pan.props.onMoveShouldSetResponderCapture({}, { dx: -50, dy: -50 })).toBe(true);
  const preventDefault = vi.fn();
  await act(async () => {
    pan.props.onResponderGrant({ preventDefault }); pan.props.onResponderMove({ preventDefault }, { dx: -200, dy: -600 });
  });
  expect(preventDefault).toHaveBeenCalledTimes(2);
  const geometry = renderer!.root.findByType(Graph).props.geometry;
  expect(store.scroll.modal.y).toBe(Math.min(start.y + 600, geometry.height - 360));
  expect(store.scroll.modal.x).toBe(Math.min(start.x + 200, geometry.width - 320));
  // 드래그가 끝나며 생성된 click은 선택 변경이나 복사가 되어서는 안 된다.
  const node = renderer!.root.findAll(n => n.type === ('Pressable' as React.ElementType) && /^child/.test(n.props.accessibilityLabel ?? ''))[0];
  await act(async () => { node.props.onPress(); pan.props.onResponderRelease(); });
  expect(store.getSnapshot().selected).toBe(selected);
  const offset = { ...store.scroll.modal };
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('a', { status: 'running' }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(store.scroll.modal).toEqual(offset);
  const inner = renderer!.root.findAll(n => n.type === ('ScrollView' as React.ElementType) && n.props.nestedScrollEnabled)[0];
  expect(inner.props.style.flexShrink).toBe(0);
});
it('이름·ID 검색은 접힌 자손을 펼쳐 선택하고 화면 안으로 이동', async () => {
  const h = await setup([raw('a'), raw('b', { labels: { 'paseo.parent-agent-id': 'a' } }),
    ...Array.from({ length: 12 }, (_, i) => raw('hidden-' + i, { title: '검증 ' + i, labels: { 'paseo.parent-agent-id': 'b' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" />); });
  const store = h.views.forAgent('h', 'w', 'a');
  expect(renderer!.root.findByType(Graph).props.geometry.positions.has('["h","hidden-11"]')).toBe(false);
  const search = renderer!.root.findByType('TextInput' as React.ElementType);
  await act(async () => search.props.onChangeText('hidden-11'));
  await act(async () => renderer!.root.findByType('TextInput' as React.ElementType).props.onSubmitEditing());
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(store.getSnapshot().selected).toBe('["h","hidden-11"]');
  expect(store.getSnapshot().collapsed.has('["h","b"]')).toBe(false);
  const graph = renderer!.root.findByType(Graph).props;
  const position = graph.geometry.positions.get(store.getSnapshot().selected);
  expect(position.y * store.getSnapshot().zoom - store.scroll.modal.y).toBeGreaterThanOrEqual(0);
  expect((position.y + 80) * store.getSnapshot().zoom - store.scroll.modal.y).toBeLessThanOrEqual(360);
  const previousFocus = store.getSnapshot().focus;
  await act(async () => renderer!.root.findByType('TextInput' as React.ElementType).props.onChangeText('없는 에이전트'));
  await act(async () => renderer!.root.findByType('TextInput' as React.ElementType).props.onSubmitEditing());
  expect(store.getSnapshot().focus).toBe(previousFocus);
  expect(renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === '다음 검색 결과').props.disabled).toBe(true);
  await act(async () => renderer!.root.findByType('TextInput' as React.ElementType).props.onChangeText('검증'));
  await act(async () => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === '다음 검색 결과').props.onPress());
  expect(store.getSnapshot().selected).not.toBe('["h","hidden-11"]');
});
it('209개 전체 보기는 모든 점을 표시하고 상태 갱신·재열기는 배치를 재사용', async () => {
  const h = await setup([raw('a'), ...Array.from({ length: 208 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  const content = <GraphContent {...props} directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />;
  await act(async () => { renderer = create(content); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const store = h.views.forAgent('h', 'w', 'a'), geometry = renderer!.root.findByType(Graph).props.geometry;
  expect(store.getSnapshot().zoom).toBeLessThan(0.6); expect(store.forceCache.size).toBe(1);
  expect(renderer!.root.findAll(n => n.type === ('Pressable' as React.ElementType) && /^child/.test(n.props.accessibilityLabel ?? ''))).toHaveLength(208);
  const timers = vi.getTimerCount();
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('child0', {
      title: '갱신한 이름', status: 'running', labels: { 'paseo.parent-agent-id': 'a' },
    }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(renderer!.root.findByType(Graph).props.geometry).toBe(geometry);
  expect(vi.getTimerCount()).toBe(timers); expect(store.forceCache.size).toBe(1);
  await act(async () => { renderer!.unmount(); renderer = create(content); });
  expect(renderer!.root.findByType(Graph).props.geometry).toBe(geometry);
  expect(h.list).toHaveBeenCalledOnce();
  await act(async () => { renderer!.unmount(); renderer = create(<GraphContent {...props} directory={h.directory}
    views={h.views} workspaceId="w" agentId="child0" surface="modal" />); });
  expect(renderer!.root.findByType(Graph).props.geometry).toBe(geometry);
});
it('목록 전환·닫기는 진행 중 배치 작업을 멈추고 타이머를 남기지 않음', async () => {
  const h = await setup([raw('a'), ...Array.from({ length: 208 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" />); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.set({ mode: 'tree' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(store.forceCache.size).toBe(0); expect(renderer!.root.findAllByType(Graph)).toHaveLength(0);
  await act(async () => store.set({ mode: 'graph' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(store.forceCache.size).toBe(1);
  await act(async () => { renderer!.unmount(); renderer = undefined; await vi.advanceTimersByTimeAsync(1000); });
  expect(vi.getTimerCount()).toBe(0); expect(h.list).toHaveBeenCalledOnce();
});

it('iOS 한 손가락 이동과 핀치는 선택·캐시를 유지하고 끝에 배율을 저장', async () => {
  Platform.OS = 'ios';
  const h = await setup([raw('a'), ...Array.from({ length: 30 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.zoomTo(0.8));
  const geometry = renderer!.root.findByType(Graph).props.geometry, selected = store.getSnapshot().selected;
  const area = () => renderer!.root.find(n => n.type === ('View' as React.ElementType) && n.props.accessibilityLabel === '에이전트 그래프 이동 영역');
  const touch = (...points: [number, number][]) => ({ nativeEvent: { touches: points.map(([pageX, pageY]) => ({ pageX, pageY })) } });
  expect(area().props.onStartShouldSetResponder(touch([100, 100]))).toBe(false);
  expect(area().props.onStartShouldSetResponder(touch([100, 100], [200, 100]))).toBe(true);
  expect(area().props.onMoveShouldSetResponderCapture(touch([100, 100]), { dx: 3, dy: 3 })).toBe(false);
  expect(area().props.onMoveShouldSetResponderCapture(touch([100, 100]), { dx: 20, dy: 20 })).toBe(true);
  const start = { ...store.scroll.modal };
  await act(async () => {
    area().props.onResponderGrant(touch([160, 180]));
    area().props.onResponderMove(touch([60, 80]), { dx: -100, dy: -100 });
    await vi.advanceTimersByTimeAsync(16);
  });
  expect(store.scroll.modal.x).toBeCloseTo(Math.min(start.x + 100, geometry.width * 0.8 - 320));
  expect(store.scroll.modal.y).toBeCloseTo(Math.min(start.y + 100, geometry.height * 0.8 - 360));
  const beforePinch = { ...store.scroll.modal };
  await act(async () => {
    area().props.onResponderStart(touch([100, 140], [180, 140]));
    area().props.onResponderMove(touch([100, 140], [220, 140]), { dx: 0, dy: 0 });
    await vi.advanceTimersByTimeAsync(16);
  });
  expect(store.getSnapshot().zoom).toBe(0.8);
  const point = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'a · 현재 대화');
  await act(async () => point.props.onPress());
  expect(store.getSnapshot().selected).toBe(selected);
  const pinched = { ...store.scroll.modal };
  expect(pinched.x).toBeCloseTo((beforePinch.x + 140) * 1.5 - 160);
  expect(pinched.y).toBeCloseTo((beforePinch.y + 140) * 1.5 - 140);
  await act(async () => {
    area().props.onResponderEnd(touch([160, 140]));
    area().props.onResponderMove(touch([140, 120]), { dx: -20, dy: -20 });
    area().props.onResponderRelease();
  });
  expect(store.getSnapshot().zoom).toBeCloseTo(1.2);
  expect(store.scroll.modal.x).toBeCloseTo(pinched.x + 20);
  expect(store.scroll.modal.y).toBeCloseTo(pinched.y + 20);
  const offset = { ...store.scroll.modal };
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('a', { status: 'running' }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(renderer!.root.findByType(Graph).props.geometry).toBe(geometry);
  expect(store.scroll.modal).toEqual(offset); expect(h.list).toHaveBeenCalledOnce();
  await act(async () => { renderer!.unmount(); renderer = undefined; await vi.advanceTimersByTimeAsync(1000); });
  expect(vi.getTimerCount()).toBe(0);
});
it('compact 정보는 작게 시작하고 검색·상세·이름 확대·ID 복사를 따로 실행', async () => {
  Platform.OS = 'ios'; const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  expect(renderer!.root.findAllByType('TextInput' as React.ElementType)).toHaveLength(0);
  const button = (label: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  await act(async () => button('에이전트 검색').props.onPress());
  expect(renderer!.root.findAllByType('TextInput' as React.ElementType)).toHaveLength(1);
  await act(async () => button('검색 닫기').props.onPress());
  expect(renderer!.root.findAllByType('TextInput' as React.ElementType)).toHaveLength(0);
  await act(async () => button('에이전트 상세 펼치기').props.onPress());
  expect(renderer!.root.findAllByType('Text' as React.ElementType).some(text => [text.props.children].flat().join('') === 'ID · a')).toBe(true);
  await act(async () => button('a ID 복사').props.onPress());
  expect(copyText).toHaveBeenLastCalledWith('a');
  const store = h.views.forAgent('h', 'w', 'a'), focus = store.getSnapshot().focus;
  await act(async () => { store.zoomTo(0.2); button('a 위치로 확대').props.onPress(); });
  expect(store.getSnapshot().zoom).toBeGreaterThanOrEqual(0.75);
  expect(store.getSnapshot().focus).toBe(focus + 1);
});
it('낮은 compact 화면에서는 확대 도구를 펼칠 때만 표시하고 버튼 뒤 다시 접음', async () => {
  Platform.OS = 'ios'; testViewport.height = 120; const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  const buttons = (label: string) => renderer!.root.findAll(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  expect(buttons('확대')).toHaveLength(0); expect(buttons('확대 도구 열기')).toHaveLength(1);
  await act(async () => buttons('확대 도구 열기')[0].props.onPress());
  expect(buttons('확대')).toHaveLength(1);
  await act(async () => buttons('확대')[0].props.onPress());
  expect(buttons('확대')).toHaveLength(0); expect(buttons('확대 도구 열기')).toHaveLength(1);
  const frame = renderer!.root.find(n => n.type === ('View' as React.ElementType) && n.props.onLayout && n.props.style?.borderRadius === 10);
  await act(async () => frame.props.onLayout({ nativeEvent: { layout: { width: 320, height: 44 } } }));
  expect(buttons('확대 도구 열기')).toHaveLength(0);
  expect(buttons('a ID 복사')).toHaveLength(1);
});
it('초기 배치 완료가 사용자가 정한 확대율을 덮어쓰지 않음', async () => {
  const h = await setup([raw('a'), ...Array.from({ length: 208 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  const store = h.views.forAgent('h', 'w', 'a');
  expect(store.forceCache.size).toBe(0);
  await act(async () => store.zoomTo(0.9));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(store.forceCache.size).toBe(1); expect(store.getSnapshot().zoom).toBe(0.9);
});
it('초기 배치가 핀치 도중 완료되어도 현재 배율을 유지하고 이어서 확대', async () => {
  Platform.OS = 'ios';
  const h = await setup([raw('a'), ...Array.from({ length: 208 }, (_, i) => raw('child' + i, { labels: { 'paseo.parent-agent-id': 'a' } }))]);
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.zoomTo(0.8));
  expect(store.forceCache.size).toBe(0);
  const area = () => renderer!.root.find(n => n.type === ('View' as React.ElementType) && n.props.accessibilityLabel === '에이전트 그래프 이동 영역');
  const touch = (distance: number) => ({ nativeEvent: { touches: [{ pageX: 160 - distance / 2, pageY: 180 }, { pageX: 160 + distance / 2, pageY: 180 }] } });
  await act(async () => {
    area().props.onResponderGrant(touch(80));
    area().props.onResponderMove(touch(120), { dx: 0, dy: 0 });
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(store.forceCache.size).toBe(1);
  const layer = () => renderer!.root.find(n => n.type === ('View' as React.ElementType) && n.props.style?.transformOrigin === 'top left');
  expect(layer().props.style.transform[0].scale).toBeCloseTo(1.2);
  expect(store.getSnapshot().zoom).toBe(0.8);
  await act(async () => {
    area().props.onResponderMove(touch(140), { dx: 0, dy: 0 });
    await vi.advanceTimersByTimeAsync(16);
    area().props.onResponderRelease();
  });
  expect(store.getSnapshot().zoom).toBeCloseTo(1.4);
});
