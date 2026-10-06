import type { PluginAgentPanelProps, PluginClientContext } from '@getpaseo/plugin/client';
import { createAgentDirectory } from './client/directory';
import { createGraphViews } from './client/view-state';
import { contributePills } from './client/pill';
import { GraphPanel } from './client/panel';
export default function contribute(client: PluginClientContext) {
  // client entry는 호스트 설치별로 실행된다. 이 이름 공간과 cache는 entry 밖에 공유하지 않는다.
  const directory = createAgentDirectory(client.paseo, 'installation');
  const views = createGraphViews();
  function Panel(props: PluginAgentPanelProps) { return <GraphPanel {...props} directory={directory} views={views} />; }
  const removePanel = client.addWorkspacePanel({ id: 'graph', title: '에이전트 구조', icon: 'GitFork',
    context: 'agent', locations: ['workspace'], Component: Panel });
  const removeCommand = client.addCommandCenterItem({ id: 'open-graph', title: '에이전트 구조 크게 보기', icon: 'GitFork',
    context: 'agent', onSelect: ({ openPanel }) => openPanel('graph', { location: 'workspace' }) });
  const removePills = contributePills(client, directory, views);
  void directory.start();
  return async () => { removePills(); removeCommand(); removePanel(); views.dispose(); await directory.dispose(); };
}
