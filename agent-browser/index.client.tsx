import type { PluginClientContext, PluginSurfaceProps } from '@getpaseo/plugin/client';
import { createAgentDirectory } from './client/directory';
import { createBrowserViews } from './client/view-state';
import { contributePills } from './client/pill';
import { navigationSurfaceId, createAgentNavigation } from './client/navigation';
import { AgentSurface } from './client/surface';
export default function contribute(client: PluginClientContext) {
  // client entry는 호스트 설치별로 실행된다. 이 이름 공간과 cache는 entry 밖에 공유하지 않는다.
  const directory = createAgentDirectory(client.paseo, 'installation');
  const views = createBrowserViews();
  const agentNavigation = createAgentNavigation(client);
  // 0.10.2 pill에는 navigation이 없어 대화 이동에만 공개 surface를 사용한다.
  function Surface(props: PluginSurfaceProps) { return <AgentSurface {...props} directory={directory} agentNavigation={agentNavigation} />; }
  const removeSurface = client.addSurface(navigationSurfaceId, Surface);
  const removePills = contributePills(client, directory, views, agentNavigation);
  void directory.start();
  return async () => { removePills(); removeSurface(); agentNavigation.dispose(); views.dispose(); await directory.dispose(); };
}
