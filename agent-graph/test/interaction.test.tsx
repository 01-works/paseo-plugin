import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginButton, PluginButtonIconProps, PluginClientContext } from '@getpaseo/plugin/client';
import type { PaseoApi, PaseoAgentListResult, SubscriptionObserver } from '@getpaseo/client';
import { createAgentDirectory } from '../client/directory';
import { createBrowserViews } from '../client/view-state';
import { page, raw } from './fixtures';
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'web' } }));
vi.mock('@getpaseo/plugin/client/react-native', async () => {
  const { createElement } = await import('react');
  const FlatList = (props: { data: { key: string }[]; renderItem: (input: { item: unknown }) => React.ReactNode }) =>
    createElement('FlatList', props, props.data.slice(0, 12).map(item => createElement('Row', { key: item.key }, props.renderItem({ item }))));
  return { FlatList, Icon: 'Icon', TextInput: 'TextInput',
    copyText: vi.fn(async () => {}), useToast: () => ({ show: vi.fn(), error: vi.fn() }),
    Modal: Object.assign((props: { children: React.ReactNode }) => createElement('Modal', props, props.children),
      { Content: (props: { children: React.ReactNode }) => createElement('ModalContent', props, props.children) }) };
});
import { contributePills } from '../client/pill';
import { AgentContent } from '../client/content';
import { AgentModal } from '../client/modal';
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
});
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
  const archive = vi.fn(async () => ({ archivedAt: '2026-10-07T07:00:00Z' }));
  const ref = vi.fn((id: string) => ({ refresh: async () => {
    const agent = entries.find(entry => entry.id === id);
    return agent ? { agent, project: {} } : null;
  }, archive }));
  const directory = createAgentDirectory({ agents: { list, ref } } as unknown as PaseoApi, 'h');
  const views = createBrowserViews();
  const buttons = new Map<string, { button: PluginButton; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }>();
  const openPanel = vi.fn(), openSurface = vi.fn();
  const client = { openPanel, openSurface, addComposerPill: ({ agentId, button }: { agentId: string; button: PluginButton }) => {
    const registration = { button, update: vi.fn(), remove: vi.fn() }; buttons.set(agentId, registration); return registration;
  } } as unknown as PluginClientContext;
  const agentNavigation = createAgentNavigation(client);
  cleanups.push(contributePills(client, directory, views, agentNavigation)); cleanups.push(() => directory.dispose()); cleanups.push(() => agentNavigation.dispose());
  await directory.start();
  return { directory, views, buttons, list, openPanel, openSurface, agentNavigation, observer, ref, archive };
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
it('본문 클릭 guard와 상태 갱신은 모달·검색·정렬·스크롤을 유지', async () => {
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.set({ browserSort: 'created', browserQuery: 'b' }));
  const before = renderer!.root.findByType('FlatList' as React.ElementType);
  await act(async () => before.props.onScroll({ nativeEvent: { contentOffset: { y: 80 } } }));
  const stopPropagation = vi.fn();
  const guard = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.focusable === false);
  await act(async () => guard.props.onPress({ stopPropagation }));
  expect(stopPropagation).toHaveBeenCalledOnce();
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('b', {
      status: 'running', updatedAt: '2026-02-01T00:00:00.000Z',
    }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(renderer!.root.findByType('FlatList' as React.ElementType)).toBe(before);
  expect(store.getSnapshot()).toMatchObject({ browserSort: 'created', browserQuery: 'b' });
  expect(store.browserScroll.modal).toBe(80);
  expect(before.props.data[0].state).toBe('running');
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(1);
  expect(h.list).toHaveBeenCalledOnce();
});
it('크게 보기는 현재 context로 패널을 열고 표시 상태를 넘김', async () => {
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const content = renderer!.root.findByType(AgentContent);
  await act(async () => content.props.onLarge());
  expect(h.openPanel).toHaveBeenCalledWith('graph', { workspaceId: 'w', agentId: 'a', location: 'workspace' });
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(0);
});
it('compact도 목록·검색을 바로 표시하고 모든 텍스트는 테마 색·기본 크기를 사용', async () => {
  Platform.OS = 'ios';
  const h = await setup();
  await act(async () => { renderer = create(<AgentContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" onNavigate={vi.fn()} />); });
  expect(renderer!.root.findAllByType('FlatList' as React.ElementType)).toHaveLength(1);
  expect(renderer!.root.findByType('TextInput' as React.ElementType).props.accessibilityLabel).toBe('워크스페이스 에이전트 검색');
  const texts = renderer!.root.findAllByType('Text' as React.ElementType);
  for (const text of texts) {
    expect(Object.values(palette)).toContain(text.props.style.color);
    expect(text.props.style.fontSize).toBeUndefined();
  }
  expect(texts.map(text => text.props.children)).not.toContain('구조');
});
it('iOS에서도 pill을 등록하고 탭하면 compact 모달의 최근 목록을 즉시 표시', async () => {
  Platform.OS = 'ios';
  const h = await setup(), registration = h.buttons.get('a')!;
  const Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  const ios = { ...props, layout: { compact: true, platform: 'ios' as const } };
  await act(async () => { renderer = create(<Icon {...ios} />); });
  expect(registration.update).toHaveBeenLastCalledWith({ label: '에이전트 2' });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(1);
  expect(renderer!.root.findAll(n => n.type === ('FlatList' as React.ElementType))).toHaveLength(1);
  expect(renderer!.root.findByType('ModalContent' as React.ElementType).props.scrollable).toBe(false);
  expect(h.list).toHaveBeenCalledOnce();
});
it('첫 진입은 현재 workspace 탐색이고 iOS 행 탭은 공개 surface를 거쳐 대화 focus를 요청', async () => {
  Platform.OS = 'ios';
  const h = await setup([raw('a'), raw('b', { title: '최근 작업', updatedAt: '2026-02-01T00:00:00Z' }),
    raw('foreign', { workspaceId: 'other', labels: { 'paseo.parent-agent-id': 'a' }, updatedAt: '2026-03-01T00:00:00Z' })]);
  const registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  const ios = { ...props, layout: { compact: true, platform: 'ios' as const } };
  await act(async () => { renderer = create(<Icon {...ios} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); await vi.advanceTimersByTimeAsync(1000); });
  expect(registration.update).toHaveBeenLastCalledWith({ label: '에이전트 2' });
  expect(renderer!.root.findByType('FlatList' as React.ElementType).props.data.map((agent: { id: string }) => agent.id)).toEqual(['b', 'a']);
  const target = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === '최근 작업');
  await act(async () => target.props.onLongPress()); expect(copyText).toHaveBeenLastCalledWith('b');
  expect(h.openSurface).not.toHaveBeenCalled();
  await act(async () => target.props.onPress());
  expect(h.openSurface).toHaveBeenCalledWith(browserSurfaceId);
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(0);
  const openAgent = vi.fn();
  await act(async () => renderer!.update(<AgentSurface {...ios} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).toHaveBeenCalledExactlyOnceWith({ agentId: 'b', serverId: 'h' });
  await act(async () => renderer!.update(<AgentSurface {...ios} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).toHaveBeenCalledOnce(); expect(h.list).toHaveBeenCalledOnce();
});
it('탐색 정렬·검색·시각 업데이트는 현재 workspace 안에서 동작하고 조회를 늘리지 않음', async () => {
  const h = await setup([raw('a', { createdAt: '2026-02-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z' }), raw('b')]);
  await act(async () => { renderer = create(<AgentContent {...props} directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" onNavigate={vi.fn()} />); });
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
  await act(async () => { renderer!.unmount(); renderer = create(<AgentContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" onNavigate={vi.fn()} />); });
  expect(ids()).toEqual(['b']); expect(h.views.forAgent('h', 'w', 'a').browserScroll.modal).toBe(92);
  expect(h.list).toHaveBeenCalledOnce();
});
it('검색 제출은 결과가 하나일 때만 대화를 열고 복사·지우기는 이동하지 않음', async () => {
  const h = await setup([raw('a', { title: 'API 검토' }), raw('b', { title: '문서 정리' })]);
  const onNavigate = vi.fn();
  await act(async () => { renderer = create(<AgentContent {...props} directory={h.directory} views={h.views}
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
it('행 닫기는 확인만 열고 취소하면 검색·정렬·스크롤·목록을 유지', async () => {
  const h = await setup(), onNavigate = vi.fn();
  await act(async () => { renderer = create(<AgentContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" onNavigate={onNavigate} />); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.set({ browserQuery: 'b', browserSort: 'created' }));
  const list = renderer!.root.findByType('FlatList' as React.ElementType);
  await act(async () => list.props.onScroll({ nativeEvent: { contentOffset: { y: 80 } } }));
  const button = (label: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  await act(async () => button('b 대화 닫기').props.onPress());
  expect(renderer!.root.findByType('Modal' as React.ElementType).props.title).toBe('대화 닫기');
  expect(h.ref).not.toHaveBeenCalled(); expect(h.archive).not.toHaveBeenCalled();
  const cancel = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) &&
    n.findAllByType('Text' as React.ElementType).some(text => text.props.children === '취소'));
  await act(async () => cancel.props.onPress());
  expect(renderer!.root.findAllByType('Modal' as React.ElementType)).toHaveLength(0);
  expect(renderer!.root.findByType('FlatList' as React.ElementType)).toBe(list);
  expect(store.getSnapshot()).toMatchObject({ browserQuery: 'b', browserSort: 'created' });
  expect(store.browserScroll.modal).toBe(80); expect(list.props.data.map((agent: { id: string }) => agent.id)).toEqual(['b']);
  expect(onNavigate).not.toHaveBeenCalled(); expect(h.archive).not.toHaveBeenCalled();
});
it('닫기 확인의 중복 클릭은 한 번 실행하고 성공 뒤에만 선택한 행을 제거', async () => {
  const h = await setup(), onNavigate = vi.fn(); let finish!: () => void;
  h.archive.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ archivedAt: '2026-10-07T07:00:00Z' }); }));
  await act(async () => { renderer = create(<AgentContent {...props} directory={h.directory} views={h.views}
    workspaceId="w" agentId="a" surface="modal" onNavigate={onNavigate} />); });
  const button = (label: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  await act(async () => button('b 대화 닫기').props.onPress());
  const confirm = button('선택한 대화 닫기 확인');
  await act(async () => { confirm.props.onPress(); confirm.props.onPress(); });
  expect(h.ref).toHaveBeenCalledExactlyOnceWith('b'); expect(h.archive).toHaveBeenCalledOnce();
  expect(button('선택한 대화 닫기 확인').props.disabled).toBe(true);
  expect(renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) &&
    n.findAllByType('Text' as React.ElementType).some(text => text.props.children === '취소')).props.disabled).toBe(true);
  await act(async () => renderer!.root.findByType('Modal' as React.ElementType).props.onOpenChange(false));
  expect(renderer!.root.findAllByType('Modal' as React.ElementType)).toHaveLength(1);
  expect(h.directory.getSnapshot().agents).toHaveLength(2);
  await act(async () => finish());
  expect(renderer!.root.findAllByType('Modal' as React.ElementType)).toHaveLength(0);
  expect(renderer!.root.findByType('FlatList' as React.ElementType).props.data.map((agent: { id: string }) => agent.id)).toEqual(['a']);
  expect(onNavigate).not.toHaveBeenCalled(); expect(h.list).toHaveBeenCalledOnce();
});
it('compact 닫기 실패는 목록과 확인창을 유지하고 재시도하며 다른 대화로 이동하지 않음', async () => {
  const h = await setup(), onNavigate = vi.fn();
  h.archive.mockRejectedValueOnce(new Error('연결 오류'));
  await act(async () => { renderer = create(<AgentContent {...props} layout={{ compact: true, platform: 'ios' }}
    directory={h.directory} views={h.views} workspaceId="w" agentId="a" surface="modal" onNavigate={onNavigate} />); });
  const button = (label: string) => renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === label);
  await act(async () => button('b 대화 닫기').props.onPress());
  await act(async () => button('선택한 대화 닫기 확인').props.onPress());
  expect(renderer!.root.find(n => n.type === ('Text' as React.ElementType) && n.props.accessibilityRole === 'alert').props.children)
    .toContain('대화를 닫지 못했습니다');
  expect(h.directory.getSnapshot().agents).toHaveLength(2); expect(button('선택한 대화 닫기 확인').props.disabled).toBe(false);
  await act(async () => button('선택한 대화 닫기 확인').props.onPress());
  expect(h.archive).toHaveBeenCalledTimes(2); expect(renderer!.root.findAllByType('Modal' as React.ElementType)).toHaveLength(0);
  expect(h.directory.getSnapshot().agents.map(agent => agent.id)).toEqual(['a']); expect(onNavigate).not.toHaveBeenCalled();
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
  await act(async () => { renderer = create(<AgentContent {...props} directory={directory} views={createBrowserViews()}
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
  const h = await setup(undefined), registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const store = h.views.forAgent('h', 'w', 'a');
  await act(async () => store.set({ browserSort: 'created', browserQuery: 'a' }));
  h.openPanel.mockImplementationOnce(() => { throw new Error('panel unavailable'); });
  await act(async () => renderer!.root.findByType(AgentContent).props.onLarge());
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(1);
  await act(async () => renderer!.root.findByType(AgentContent).props.onLarge());
  expect(h.openPanel).toHaveBeenLastCalledWith('graph', { workspaceId: 'w', agentId: 'a', location: 'workspace' });
  expect(store.getSnapshot()).toMatchObject({ browserSort: 'created', browserQuery: 'a' });
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(0); expect(h.openSurface).not.toHaveBeenCalled();
});
it('compact 탐색 크게 보기는 현재 workspace context로 열며 surface 실패는 pill을 닫지 않음', async () => {
  const h = await setup(undefined), registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} layout={{ compact: true, platform: 'ios' }} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const content = renderer!.root.findByType(AgentContent);
  h.openSurface.mockImplementationOnce(() => { throw new Error('route unavailable'); });
  await act(async () => content.props.onLarge());
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(1); expect(h.agentNavigation.getSnapshot()).toBeNull();
  await act(async () => content.props.onLarge());
  expect(h.agentNavigation.getSnapshot()).toMatchObject({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: null });
  expect(h.openPanel).not.toHaveBeenCalled(); expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(0);
});
it('이동 도중 archive된 에이전트와 다른 호스트 context는 navigation을 호출하지 않음', async () => {
  const h = await setup(undefined), openAgent = vi.fn(), navigation = { openAgent, openWorkspace: vi.fn() };
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
  const h = await setup(undefined); h.agentNavigation.open({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: 'b' });
  await act(async () => { renderer = create(<AgentSurface {...props} agentNavigation={h.agentNavigation} directory={h.directory} views={h.views} />); });
  const row = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'b');
  expect(row.props.disabled).toBe(true);
  const copy = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'b ID 복사');
  await act(async () => copy.props.onPress()); expect(copyText).toHaveBeenLastCalledWith('b');
  expect(h.agentNavigation.takeTarget(h.agentNavigation.getSnapshot()!)).toBeNull();
});
it('다른 workspace로 바뀐 대상은 목록·pill·공개 surface에서 이동을 차단', async () => {
  const h = await setup([raw('a'), raw('foreign')]);
  const registration = h.buttons.get('a')!, Icon = registration.button.icon as React.ComponentType<PluginButtonIconProps>;
  await act(async () => { renderer = create(<Icon {...props} />); });
  if (registration.button.behavior.kind !== 'action') throw new Error('action 필요');
  const action = registration.button.behavior;
  await act(async () => { await action.onPress(); });
  const onPress = renderer!.root.find(n => n.type === ('Pressable' as React.ElementType) && n.props.accessibilityLabel === 'foreign').props.onPress;
  await act(async () => {
    h.observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: raw('foreign', {
      workspaceId: 'other', updatedAt: '2026-04-01T00:00:00Z',
    }), project: {} } } as Parameters<typeof h.observer.update>[0]);
    await vi.advanceTimersByTimeAsync(250);
  });
  await act(async () => onPress());
  expect(() => renderer!.root.findByType(AgentContent).props.onNavigate('foreign')).toThrow('에이전트 확인 불가');
  expect(h.agentNavigation.getSnapshot()).toBeNull();
  expect(renderer!.root.findAllByType(AgentModal)).toHaveLength(1);
  h.agentNavigation.open({ serverId: 'h', workspaceId: 'w', agentId: 'a', targetId: 'foreign' });
  const openAgent = vi.fn();
  await act(async () => renderer!.update(<AgentSurface {...props} directory={h.directory} views={h.views} agentNavigation={h.agentNavigation}
    navigation={{ openAgent, openWorkspace: vi.fn() }} />));
  expect(openAgent).not.toHaveBeenCalled();
});
it('검색·정렬은 호스트·workspace·에이전트별로 구분하고 모달·패널 스크롤을 따로 보존', () => {
  const views = createBrowserViews(), first = views.forAgent('h', 'w', 'a');
  expect(first.getSnapshot()).toEqual({ browserSort: 'updated', browserQuery: '', message: null });
  first.set({ browserSort: 'created', browserQuery: '검토' }); first.browserScroll.modal = 160;
  expect(views.forAgent('h', 'w', 'a')).toBe(first);
  expect(first.browserScroll.panel).toBe(0);
  for (const other of [views.forAgent('other', 'w', 'a'), views.forAgent('h', 'other', 'a'), views.forAgent('h', 'w', 'b')]) {
    expect(other).not.toBe(first); expect(other.getSnapshot().browserQuery).toBe('');
  }
});
