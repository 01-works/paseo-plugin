import type { PluginClientContext, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { SidebarRow } from '@getpaseo/plugin/client/ui';
import { Dashboard } from './client/dashboard';
import { contributePills } from './client/pill';
import { configureRequester } from './client/data';
import { snapshotRpc } from './shared/contracts';

function MonitorItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="Activity" active={currentScreen?.screenId === 'main'} onPress={() => openScreen({ screenId: 'main' })} />;
}

export default function contribute(client: PluginClientContext) {
  const clearRequester = configureRequester(input => client.rpc(snapshotRpc, input));
  const removePills = contributePills(client);
  const screens = typeof client.addScreen === 'function' && typeof client.addSidebarHeaderItem === 'function';
  const removeSurface = screens
    ? client.addScreen({ id: 'main', title: 'Mac 모니터', Component: Dashboard })
    : client.addSurface('main', Dashboard);
  const removeSidebar = screens
    ? client.addSidebarHeaderItem({ id: 'main', title: 'Mac 모니터', Component: MonitorItem })
    : client.addSidebarItem({ id: 'main', title: 'Mac 모니터', icon: 'Activity', surface: 'main' });
  return () => { removePills(); removeSidebar(); removeSurface(); clearRequester(); };
}
