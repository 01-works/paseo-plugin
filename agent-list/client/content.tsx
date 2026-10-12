import { useMemo } from 'react';
import { View } from 'react-native';
import { useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { AgentDirectory } from './directory';
import type { ListViews } from './view-state';
import { ControlLayout } from './controls';
import { spacing } from './spacing';
import { AgentList } from './list';

export type AgentContentProps = PluginHostProps & {
  directory: AgentDirectory; views: ListViews; workspaceId: string; agentId: string;
  onNavigate?: (id: string) => void;
};
export function AgentContent(props: AgentContentProps) {
  const toast = useToast();
  const store = useMemo(() => props.views.forAgent(props.host.id, props.workspaceId, props.agentId),
    [props.views, props.host.id, props.workspaceId, props.agentId]);
  const c = props.theme.colors;
  const navigate = props.onNavigate ? (id: string) => {
    try { props.onNavigate!(id); }
    catch { toast.error('대화를 열지 못했습니다. 다시 눌러 주세요'); }
  } : undefined;
  return <ControlLayout compact={props.layout.compact}><View style={{ flex: props.layout.compact ? 1 : undefined,
    minHeight: 0, gap: spacing.inset, backgroundColor: c.surface0, width: '100%' }}>
    <AgentList {...props} store={store} onNavigate={navigate} />
  </View></ControlLayout>;
}
