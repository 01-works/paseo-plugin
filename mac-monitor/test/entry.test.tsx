import { expect, it, vi } from 'vitest';
import type { PluginClientContext, PluginSidebarItemContribution, PluginSidebarItemProps, PluginScreenContribution } from '@getpaseo/plugin/client';
import { createElement } from 'react';

vi.mock('react-native', () => ({ Pressable: 'Pressable', View: 'View' }));
vi.mock('@getpaseo/plugin/client/react-native', () => ({ Modal: 'Modal' }));
vi.mock('@getpaseo/plugin/client/ui', () => ({ SidebarRow: 'SidebarRow' }));
vi.mock('../client/dashboard', () => ({ Dashboard: () => null }));
vi.mock('../client/popover', () => ({ MonitorContent: () => null, pressureColor: () => '' }));
import contribute from '../index.client';
import { requestSnapshot } from '../client/data';

it.each([false, true])('사이드바에서 모니터를 열고 entry 해제 시 RPC·구독을 정리 (신 API: %s)', async modern => {
  const subscribe = vi.fn(), list = vi.fn(async (_options: { signal: AbortSignal }) => ({ subscription: { subscribe } }));
  const removeScreen = vi.fn(), removeSidebar = vi.fn();
  const addSurface = vi.fn(() => removeScreen), addSidebarItem = vi.fn(() => removeSidebar);
  const addScreen = vi.fn((_input: PluginScreenContribution) => removeScreen);
  const addSidebarHeaderItem = vi.fn((_input: PluginSidebarItemContribution) => removeSidebar);
  const client = { paseo: { agents: { list } }, rpc: vi.fn(), addSurface, addSidebarItem,
    ...(modern ? { addScreen, addSidebarHeaderItem } : {}),
  } as unknown as PluginClientContext;
  const cleanup = contribute(client);
  try {
    await Promise.resolve();
    if (modern) {
      expect(addScreen).toHaveBeenCalledWith(expect.objectContaining({ id: 'main', title: 'Mac 모니터' }));
      expect(addSurface).not.toHaveBeenCalled(); expect(addSidebarItem).not.toHaveBeenCalled();
      const Item = addSidebarHeaderItem.mock.calls[0][0].Component as (props: PluginSidebarItemProps) => ReturnType<typeof createElement>;
      const openScreen = vi.fn();
      const hostProps: Omit<PluginSidebarItemProps, 'currentScreen'> = {
        host: { id: 'h', label: 'Mac' }, layout: { compact: false, platform: 'web' }, openPopover: vi.fn(), openScreen,
        theme: { colors: { surface0: '#111', surface1: '#222', surface2: '#333', border: '#444', foreground: '#eee',
          foregroundMuted: '#aaa', accent: '#88c', accentForeground: '#111', statusSuccess: '#0a0', statusWarning: '#aa0', statusDanger: '#a00' } },
      };
      const row = Item({ ...hostProps, currentScreen: { screenId: 'main', params: {} } });
      const props = row.props as { active: boolean; icon: string; onPress: () => void };
      expect(props.active).toBe(true); expect(props.icon).toBe('Activity');
      props.onPress(); expect(openScreen).toHaveBeenCalledExactlyOnceWith({ screenId: 'main' });
      const inactive = Item({ ...hostProps, currentScreen: null });
      expect((inactive.props as { active: boolean }).active).toBe(false);
    } else {
      expect(addSurface).toHaveBeenCalledWith('main', expect.any(Function));
      expect(addSidebarItem).toHaveBeenCalledWith({ id: 'main', title: 'Mac 모니터', icon: 'Activity', surface: 'main' });
      expect(addScreen).not.toHaveBeenCalled(); expect(addSidebarHeaderItem).not.toHaveBeenCalled();
    }
    expect(list).toHaveBeenCalledOnce(); expect(subscribe).toHaveBeenCalledOnce();
  } finally { cleanup(); }
  expect(list.mock.calls[0][0].signal.aborted).toBe(true);
  expect(removeScreen).toHaveBeenCalledOnce(); expect(removeSidebar).toHaveBeenCalledOnce();
  await expect(requestSnapshot(false)).rejects.toThrow('호스트 RPC 연결 없음');
});
