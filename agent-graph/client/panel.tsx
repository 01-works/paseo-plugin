import { View } from 'react-native';
import type { PluginAgentPanelProps } from '@getpaseo/plugin/client';
import type { AgentDirectory } from './directory';
import type { BrowserViews } from './view-state';
import { AgentContent } from './content';
export function AgentPanel(props: PluginAgentPanelProps & { directory: AgentDirectory; views: BrowserViews }) {
  return <View style={{ flex: 1, minHeight: 0, padding: props.layout.compact ? 12 : 16, backgroundColor: props.theme.colors.surface0 }}>
    <AgentContent {...props} surface="panel" onNavigate={props.navigation
      ? id => props.navigation!.openAgent({ agentId: id, serverId: props.host.id }) : undefined} />
  </View>;
}
