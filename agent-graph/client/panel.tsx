import { View } from 'react-native';
import type { PluginAgentPanelProps } from '@getpaseo/plugin/client';
import type { AgentDirectory } from './directory';
import type { GraphViews } from './view-state';
import { GraphContent } from './content';
export function GraphPanel(props: PluginAgentPanelProps & { directory: AgentDirectory; views: GraphViews }) {
  return <View style={{ flex: 1, minHeight: 0, padding: props.layout.compact ? 12 : 16, backgroundColor: props.theme.colors.surface0 }}>
    <GraphContent {...props} surface="panel" onNavigate={props.navigation
      ? id => props.navigation!.openAgent({ agentId: id, serverId: props.host.id }) : undefined} />
  </View>;
}
