import type { PluginClientContext } from '@getpaseo/plugin/client';
import { Dashboard } from './client/dashboard';
import { contributePills } from './client/pill';
import { configureRequester } from './client/data';
import { registerFleet } from './client/fleet/registry';
import { snapshotRpc } from './shared/contracts';

export default function contribute(client: PluginClientContext) {
  const clearRequester = configureRequester(input => client.rpc(snapshotRpc, input));
  const removeFleet = registerFleet(client);
  const removePills = contributePills(client);
  const removeSurface = client.addSurface('main', Dashboard);
  const removeSidebar = client.addSidebarItem({ id: 'main', title: 'Mac 모니터', icon: 'Activity', surface: 'main' });
  return () => { removePills(); removeFleet(); removeSidebar(); removeSurface(); clearRequester(); };
}
