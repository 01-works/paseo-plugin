import { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import type { AgentDirectory } from './directory';
import type { GraphViews } from './view-state';
import type { AgentNavigation } from './navigation';
import { GraphContent } from './content';
type SurfaceError = string | null;
export function AgentSurface(props: PluginSurfaceProps & { directory: AgentDirectory; views: GraphViews; agentNavigation: AgentNavigation }) {
  const { agentNavigation, directory, host, theme, layout } = props;
  const context = useSyncExternalStore(agentNavigation.subscribe, agentNavigation.getSnapshot);
  const [error, setError] = useState<SurfaceError>(null);
  useEffect(() => {
    if (!context) return;
    setError(null);
    if (context.serverId !== host.id) { setError('원래 호스트에서 다시 열어 주세요'); return; }
    const id = agentNavigation.takeTarget(context);
    if (!id) return;
    if (!props.navigation) { setError('이 Paseo에서는 대화 이동을 지원하지 않습니다'); return; }
    const targetWorkspace = context.targetWorkspaceId === undefined ? context.workspaceId : context.targetWorkspaceId;
    if (!directory.getSnapshot().agents.some(agent => agent.id === id && !agent.archived && agent.workspaceId === targetWorkspace)) {
      setError('선택한 에이전트가 원래 워크스페이스에 없습니다'); return;
    }
    try { props.navigation.openAgent({ agentId: id, serverId: host.id }); }
    catch { setError('대화를 열지 못했습니다. 목록에서 다시 선택해 주세요'); }
  }, [context, host.id, agentNavigation, directory, props.navigation]);
  return <View style={{ flex: 1, minHeight: 0, padding: layout.compact ? 12 : 16, backgroundColor: theme.colors.surface0, gap: 8 }}>
    {error ? <Text style={{ color: theme.colors.foregroundMuted }}>{error}</Text> : null}
    {context && context.serverId === host.id ? <GraphContent {...props} workspaceId={context.workspaceId} agentId={context.agentId}
      surface="panel" onNavigate={props.navigation ? id => props.navigation!.openAgent({ agentId: id, serverId: host.id }) : undefined} /> :
      <Text style={{ color: theme.colors.foregroundMuted }}>에이전트 pill에서 현재 워크스페이스의 탐색을 열어 주세요.</Text>}
  </View>;
}
