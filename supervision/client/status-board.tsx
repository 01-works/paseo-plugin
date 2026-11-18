import { useQuery } from '@tanstack/react-query';
import { usePaseo, useRpc, type PluginScreenProps, type PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { SidebarRow } from '@getpaseo/plugin/client/ui';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { listReportsRpc } from '../shared/report';
import { elapsed, statusRows, type Supervisor } from '../shared/status';

export function SupervisorsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return <SidebarRow icon="ListChecks" active={currentScreen?.screenId === 'supervisors'} onPress={() => openScreen({ screenId: 'supervisors' })} />;
}
export async function listSupervisors(paseo: ReturnType<typeof usePaseo>) {
  const agents: Supervisor[] = [];
  let cursor: string | undefined;
  do {
    const filter = { labels: { 'yw.role': 'supervisor' }, includeArchived: true, includeBackground: true };
    const options = { filter, includeBackground: true, page: { limit: 100, cursor } };
    const result = await paseo.agents.list(options);
    agents.push(...result.entries.map(({ agent }) => agent));
    cursor = result.pageInfo.hasMore ? result.pageInfo.nextCursor ?? undefined : undefined;
  } while (cursor);
  return agents;
}
export function Supervisors({ theme, layout, host, navigation }: PluginScreenProps) {
  const paseo = usePaseo();
  const list = useRpc(listReportsRpc);
  const query = useQuery({ queryKey: ['supervision-state', host.id], refetchInterval: 10_000,
    queryFn: async () => {
      const [lanes, agents] = await Promise.all([list({}), listSupervisors(paseo)]);
      return { rows: statusRows(lanes, agents, host.id), now: Date.now() };
    },
  });
  const fg = theme.colors.foreground;
  const muted = theme.colors.foregroundMuted;
  const kinds = { next_action: '다음 조치', waiting: '대기', user_decision: '사용자 결정', done: '완료' };
  return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 12 }}>
    <Text style={{ color: muted, fontSize: 16 }}>{host.label} · 10초마다 갱신 · 다른 호스트는 상단에서 선택하세요.</Text>
    {query.isPending && <Text style={{ color: fg, fontSize: 16 }}>감독 상태를 불러옵니다.</Text>}
    {query.error && <Text accessibilityRole="alert" style={{ color: fg, fontSize: 16 }}>상태를 갱신하지 못했습니다: {query.error.message}</Text>}
    {query.data?.rows.length === 0 && <Text style={{ color: fg, fontSize: 16 }}>이 호스트에 감독 보고가 없습니다.</Text>}
    {query.data?.rows.map(row => {
      const report = row.state?.report;
      const done = report?.items.filter(item => item.status === 'done').length ?? 0;
      const deferred = report?.items.filter(item => item.status === 'deferred').length ?? 0;
      const end = report?.turnEnd;
      return <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.status}`}
        disabled={!navigation || !row.canOpen} onPress={() => row.agent && navigation?.openAgent({ agentId: row.agent.id, serverId: host.id })}
        style={{ padding: 16, gap: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8 }}>
        <View style={{ flexDirection: layout.compact ? 'column' : 'row', gap: 8, justifyContent: 'space-between' }}>
          <Text style={{ color: fg, fontSize: 18, flexShrink: 1 }}>{row.title}</Text>
          <Text style={{ color: fg, fontSize: 16 }}>{row.status} · 항목 {done}/{report?.items.length ?? '?'}{deferred ? ` (연기 ${deferred})` : ''}</Text>
        </View>
        <Text style={{ color: fg, fontSize: 16 }}>{end ? `${kinds[end.kind]} · ${end.detail}` : '아직 보고하지 않았습니다.'}</Text>
        {end?.resume && <Text style={{ color: muted, fontSize: 16 }}>재개: {end.resume.type} · {end.resume.ref}</Text>}
        <Text style={{ color: muted, fontSize: 16 }}>미결 결정 {report?.decisions.length ?? 0}개{report?.decisions[0] ? ` · ${report.decisions[0].question.slice(0, 120)}` : ''}</Text>
        <Text style={{ color: muted, fontSize: 16 }}>보고 {row.state ? elapsed(row.state.reportedAt, query.data!.now) : '없음'} · 감독 {row.agent?.status ?? '조회 불가'}</Text>
        {row.note && <Text style={{ color: muted, fontSize: 16 }}>{row.note}</Text>}
      </Pressable>;
    })}
  </ScrollView>;
}
