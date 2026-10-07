import { ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useHosts, useRpc, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { hostInfoRpc } from '../shared/contracts';
import { Details } from './popover';
import { useSnapshot } from './data';
import { useAgentCounts } from './agents';
import { Badge, Card } from './visuals';

export function Dashboard(props: PluginSurfaceProps) {
  return <SelectedHost key={props.host.id} {...props} />;
}

// 호스트 전환 시 이전 화면의 선택과 요청 상태도 함께 정리한다.
function SelectedHost(props: PluginSurfaceProps) {
  const { theme, layout, host } = props;
  const hosts = useHosts();
  const counts = useAgentCounts(hosts);
  const sample = useSnapshot();
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host', host.id], queryFn: () => infoRpc({}), staleTime: 60_000,
    refetchOnWindowFocus: false, refetchOnReconnect: false });
  const c = theme.colors;
  return <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}>
    <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 }}>
      <Details key={host.id} {...props} snapshot={sample.data} name={info.data?.hostname ?? host.label}
        error={sample.error?.message} refreshing={sample.isFetching} onRefresh={sample.error ? () => void sample.refetch() : undefined} />
      {hosts.length > 1 ? <Text style={{ color: c.foregroundMuted }}>기기 전환은 상단 선택기에서 · 각 Mac에 mac-monitor 설치 필요</Text> : null}
      <Card theme={theme}>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>연결된 호스트 / 에이전트</Text>
        {hosts.map(h => {
          const value = counts[h.serverId];
          const label = value && !value.error ? `작업 중 ${value.running} · 대기 ${value.idle}${value.other ? ` · 기타 ${value.other}` : ''}` : '에이전트 확인 불가';
          return <View key={h.serverId} style={{ paddingVertical: 8, gap: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, flex: 1 }}>
                <Text style={{ color: c.foreground, fontWeight: '600', flexShrink: 1 }}>{h.label}</Text>
                {h.serverId === host.id ? <Badge theme={theme} label="현재 기기" /> : null}
              </View>
              <Badge theme={theme} label={h.status === 'online' ? '온라인' : '연결 안 됨'} />
            </View>
            <Text style={{ color: c.foregroundMuted }}>{label}</Text>
          </View>;
        })}
      </Card>
    </View>
  </ScrollView>;
}
