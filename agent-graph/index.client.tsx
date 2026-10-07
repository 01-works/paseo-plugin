import type { PluginAgentPanelProps, PluginClientContext, PluginSurfaceProps } from '@getpaseo/plugin/client';
import { createAgentDirectory } from './client/directory';
import { createGraphViews } from './client/view-state';
import { contributePills } from './client/pill';
import { GraphPanel } from './client/panel';
import { browserSurfaceId, createAgentNavigation } from './client/navigation';
import { AgentSurface } from './client/surface';
export default function contribute(client: PluginClientContext) {
  // client entry는 호스트 설치별로 실행된다. 이 이름 공간과 cache는 entry 밖에 공유하지 않는다.
  const directory = createAgentDirectory(client.paseo, 'installation');
  const views = createGraphViews();
  const agentNavigation = createAgentNavigation(client);
  function Surface(props: PluginSurfaceProps) { return <AgentSurface {...props} directory={directory} views={views} agentNavigation={agentNavigation} />; }
  const removeSurface = client.addSurface(browserSurfaceId, Surface);
  function Panel(props: PluginAgentPanelProps) { return <GraphPanel {...props} directory={directory} views={views} />; }
  const removePanel = client.addWorkspacePanel({ id: 'graph', title: '에이전트', icon: 'GitFork',
    context: 'agent', locations: ['workspace'], Component: Panel });
  const removeCommand = client.addCommandCenterItem({ id: 'open-graph', title: '에이전트 크게 보기', icon: 'GitFork',
    context: 'agent', onSelect: ({ openPanel }) => openPanel('graph', { location: 'workspace' }) });
  const removePills = contributePills(client, directory, views, agentNavigation);
  void directory.start();
  return async () => { removePills(); removeCommand(); removePanel(); removeSurface(); agentNavigation.dispose(); views.dispose(); await directory.dispose(); };
}
