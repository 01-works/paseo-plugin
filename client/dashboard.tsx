import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useHosts, useRpc, useSettings, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { hostInfoRpc, settings, type Snapshot } from '../shared/contracts';
import { Details } from './popover';
import { readAppSample, useManualQuery, useSnapshot } from './data';
import { useAgentCounts } from './agents';
import { FleetRow, FleetHeader } from './fleet/row';
import { registryEntries, fleetSnapshot } from './fleet/registry';
import { Badge, Card } from './visuals';

type SelectedHost = string | null;
type HostId = string;
export function Dashboard(props: PluginSurfaceProps) {
  const { theme, layout, host } = props;
  const hosts = useHosts();
  const counts = useAgentCounts(hosts);
  const config = useSettings(settings);
  const enabled = config.status === 'ready' && config.values.experimentalFleet;
  const [selected, select] = useState<SelectedHost>(null);
  const local = useSnapshot(selected === null);
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const last = useRef<Record<HostId, Snapshot>>({});
  const fleet = useManualQuery({
    queryKey: ['mac-monitor', 'fleet'], enabled,
    queryFn: async signal => {
      const entries = registryEntries();
      if (entries.length < 2) return [];
      return Promise.all(entries.map(async entry => {
        const id = entry.serverId ?? entry.info.hostname;
        try { const snapshot = selected === id ? await readAppSample(signal, () => fleetSnapshot(entry, true)) : await fleetSnapshot(entry, false); last.current[id] = snapshot; return { id, info: entry.info, snapshot, error: undefined as string | undefined }; }
        catch (error) { return { id, info: entry.info, snapshot: last.current[id] as Snapshot | undefined, error: String(error) }; }
      }));
    },
  });
  const rows = (fleet.data ?? []);
  const aggregated = enabled && rows.length > 1;
  const chosen = aggregated ? rows.find(row => row.id === selected) : undefined;
  useEffect(() => { if (selected !== null) void fleet.refetch(); }, [selected, fleet.refetch]);
  useEffect(() => { if (!aggregated || (selected !== null && !rows.some(row => row.id === selected))) select(null); }, [aggregated, selected, rows.map(row => row.id).join('|')]);
  const colors = theme.colors;
  const countText = (id: string) => { const value = counts[id]; return value && !value.error ? `작업 중 ${value.running} · 대기 ${value.idle}${value.other ? ` · 기타 ${value.other}` : ''}` : '에이전트 확인 불가'; };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16 }}>
    <Text style={{ color: colors.foreground, fontWeight: '600' }}>Mac 시스템 모니터</Text>
    <Badge theme={theme} label={aggregated ? '모든 Mac · 실험적 집계' : '선택한 Mac'} />
    <Text style={{ color: colors.foregroundMuted }}>{aggregated ? '호스트를 눌러 메모리와 상위 앱을 확인하세요.' : '다른 Mac의 지표는 상단 호스트 선택기로 전환하세요.'}</Text>
    {config.status === 'ready' ? <Pressable accessibilityRole="button" disabled={config.saving} onPress={() => void config.save({ experimentalFleet: !enabled }, config.revision)} style={{ padding: 12, backgroundColor: colors.surface1, borderRadius: 8 }}><Text style={{ color: colors.foreground }}>실험적 멀티호스트 집계: {enabled ? '켜짐 (눌러 끄기)' : '꺼짐 (눌러 켜기)'}</Text></Pressable> : null}
    {config.status === 'error' || config.status === 'invalid' ? <Text style={{ color: colors.foregroundMuted }}>설정 확인 실패: {config.error} · 공식 호스트 모드 사용</Text> : null}
    {config.saveError ? <Text style={{ color: colors.foregroundMuted }}>{config.saveError}</Text> : null}
    {aggregated ? <View style={{ gap: 8 }}>
      {!layout.compact ? <FleetHeader theme={theme} /> : null}
      {rows.map(row => <FleetRow key={row.id} {...props} snapshot={row.snapshot} error={row.error}
        name={hosts.find(h => h.serverId === row.id)?.label ?? row.info.hostname}
        agentText={countText(row.id)} onPress={() => select(row.id)} />)}
    </View> : null}
    {chosen ? <>
      <Pressable accessibilityRole="button" onPress={() => select(null)}><Text style={{ color: colors.foreground }}>선택한 호스트로 돌아가기</Text></Pressable>
      <Details key={chosen.id} {...props} snapshot={chosen.snapshot} name={chosen.info.hostname} error={chosen.error}
        refreshing={fleet.isFetching} onRefresh={() => void fleet.refetch()} />
    </> : <Details key={host.id} {...props} snapshot={local.data} name={info.data?.hostname ?? host.label} error={local.error?.message}
      refreshing={local.isFetching || fleet.isFetching} onRefresh={() => { void local.refetch(); if (enabled) void fleet.refetch(); }} />}
    <Card theme={theme}>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>연결된 호스트 / 에이전트</Text>
      {hosts.map(h => <View key={h.serverId} style={{ paddingVertical: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Text style={{ color: colors.foreground, fontWeight: '600', flexShrink: 1 }}>{h.label}</Text>
          <Badge theme={theme} label={h.status === 'online' ? '온라인' : '연결 안 됨'} />
        </View>
        <Text style={{ color: colors.foregroundMuted }}>{countText(h.serverId)}</Text>
        {!aggregated && h.serverId !== host.id ? <Text style={{ color: colors.foregroundMuted }}>CPU·메모리: 호스트 선택기로 전환</Text> : null}
      </View>)}
    </Card>
  </ScrollView>;
}
