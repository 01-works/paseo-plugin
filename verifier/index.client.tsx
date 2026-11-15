import type { PluginClientContext, PluginScreenProps, PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { VerifierScreen } from './client/screen';
import { VerifierSettingsScreen } from './client/settings';
import { SCREEN_ID, VerifierSidebarItem } from './client/sidebar';
import { createStatusStore } from './client/store';
import { statusRpc } from './shared/contracts';

export default function contribute(client: PluginClientContext) {
  // 설치별 client entry 하나가 폴링 하나를 소유한다.
  const store = createStatusStore(input => client.rpc(statusRpc, input));
  function Screen(props: PluginScreenProps) {
    return <VerifierScreen {...props} store={store} />;
  }
  function SidebarItem(props: PluginSidebarItemProps) {
    return <VerifierSidebarItem {...props} store={store} />;
  }
  const removeScreen = client.addScreen({ id: SCREEN_ID, title: 'Verifier', Component: Screen });
  const removeSidebar = client.addSidebarFooterItem({ id: SCREEN_ID, title: 'Verifier', Component: SidebarItem });
  const removeSettings = client.addSettingsScreen({ id: 'settings', title: 'Verifier', icon: 'ShieldCheck', Component: VerifierSettingsScreen });
  return () => {
    removeSettings();
    removeSidebar();
    removeScreen();
    store.dispose();
  };
}
