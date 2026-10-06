import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginButton, PluginButtonIconProps, PluginClientContext } from '@getpaseo/plugin/client';
import type { PaseoApi, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { AgentDirectory } from '../client/directory';
import { GraphViews } from '../client/view-state';
import { page, raw } from './fixtures';

vi.mock('react-native', async () => {
  const { createElement, useLayoutEffect } = await import('react');
  return { View: (props: { children?: React.ReactNode; onLayout?: (event: unknown) => void }) => {
    useLayoutEffect(() => { props.onLayout?.({ nativeEvent: { layout: { width: 320, height: 360 } } }); }, []);
    return createElement('View', props, props.children);
  }, Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'web' },
    PanResponder: { create: (handlers: Record<string, unknown>) => ({ panHandlers: {
      onMoveShouldSetResponderCapture: handlers.onMoveShouldSetPanResponderCapture,
      onResponderGrant: handlers.onPanResponderGrant, onResponderMove: handlers.onPanResponderMove,
      onResponderRelease: handlers.onPanResponderRelease,
    } }) } };
});
vi.mock('@getpaseo/plugin/client/react-native', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  const ScrollView = forwardRef((props: { children: React.ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ scrollTo: vi.fn() }));
    return createElement('ScrollView', props, props.children);
  });
  const FlatList = forwardRef((props: { data: unknown[]; renderItem: (input: { item: unknown }) => React.ReactNode }, ref) => {
    useImperativeHandle(ref, () => ({ scrollToIndex: vi.fn() }));
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
import { copyText } from '@getpaseo/plugin/client/react-native';
const palette = { foreground: '#eee', foregroundMuted: '#aaa', surface0: '#111', surface1: '#222', surface2: '#333', border: '#444',
  accent: '#88c', statusSuccess: '#0a0', statusWarning: '#aa0', statusDanger: '#a00' };
const props = { theme: { colors: palette }, host: { id: 'h', label: '호스트' }, layout: { compact: false, platform: 'web' }, size: 14, color: '#aaa' } as PluginButtonIconProps;
let renderer: ReactTestRenderer | undefined;
const cleanups: (() => unknown)[] = [];
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); });
afterEach(async () => {
  await act(async () => renderer?.unmount()); renderer = undefined;
  for (const cleanup of cleanups.splice(0)) await cleanup(); vi.useRealTimers();
});
async function setup(entries = [raw('a'), raw('b', { labels: { 'paseo.parent-agent-id': 'a' } })]) {
  let observer!: SubscriptionObserver<PaseoAgentListResult & { subscriptionId: string }>;
  const snapshot = page(entries);
  const release = vi.fn(async () => {});
  const lease = { subscriptionId: 's', subscribe: (value: typeof observer) => { observer = value; value.snapshot({ ...snapshot, subscriptionId: 's' }); return vi.fn(); }, release };
  const list = vi.fn(async () => ({ ...snapshot, subscription: lease }));
  const directory = new AgentDirectory({ agents: { list } } as unknown as PaseoApi, 'h');
  const views = new GraphViews();
  const buttons = new Map<string, { button: PluginButton; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }>();
  const openPanel = vi.fn();
  const client = { openPanel, addComposerPill: ({ agentId, button }: { agentId: string; button: PluginButton }) => {
    const registration = { button, update: vi.fn(), remove: vi.fn() }; buttons.set(agentId, registration); return registration;
  } } as unknown as PluginClientContext;
  cleanups.push(contributePills(client, directory, views)); cleanups.push(() => directory.dispose());
  await directory.start();
  return { directory, views, buttons, list, openPanel, observer };
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
it('compact는 확대 도구 없이 트리와 기본 텍스트를 표시', async () => {
  const h = await setup();
  await act(async () => { renderer = create(<GraphContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" />); });
  expect(renderer!.root.findAllByType(Graph)).toHaveLength(0);
  const texts = renderer!.root.findAll(n => n.type === ('Text' as React.ElementType));
  for (const text of texts) {
    expect(text.props.style.color).toBeTruthy(); expect(text.props.style.fontSize).toBeUndefined();
  }
});
it('뷰 상태는 호스트·workspace·에이전트별로 구분하며 접기와 배율을 보존', () => {
  const views = new GraphViews(), first = views.forAgent('h', 'w', 'a');
  first.toggle('child'); first.zoomTo(1.25);
  expect(views.forAgent('h', 'w', 'a')).toBe(first);
  expect(views.forAgent('other', 'w', 'a').getSnapshot().collapsed.size).toBe(0);
  expect(views.forAgent('h', 'other', 'a')).not.toBe(first);
  expect(views.forAgent('h', 'w', 'b').forceCache).toBe(first.forceCache);
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
