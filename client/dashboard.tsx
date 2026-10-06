import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useHosts, useRpc, useSettings, type PluginSurfaceProps } from '@getpaseo/plugin/client';
import { hostInfoRpc, settings, type Snapshot } from '../shared/contracts';
import { Details } from './popover';
import { displaySnapshot } from './format';
import { useSnapshot } from './data';
import { useAgentCounts } from './agents';
import { FleetRow, FleetHeader } from './fleet/row';
import { registryEntries, fleetSnapshot } from './fleet/registry';

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
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000 });
  const last = useRef<Record<HostId, Snapshot>>({});
  const fleet = useQuery({
    queryKey: ['mac-monitor', 'fleet'], refetchInterval: 2000, retry: false, enabled,
    queryFn: async () => {
      const entries = registryEntries();
      if (entries.length < 2) return [];
      return Promise.all(entries.map(async entry => {
        const id = entry.serverId ?? entry.info.hostname;
        try { const snapshot = await fleetSnapshot(entry, selected === id); last.current[id] = snapshot; return { id, info: entry.info, snapshot, error: undefined as string | undefined }; }
        catch (error) { return { id, info: entry.info, snapshot: last.current[id] as Snapshot | undefined, error: String(error) }; }
      }));
    },
  });
  const rows = (fleet.data ?? []).map(row => ({ ...row, snapshot: row.snapshot ? displaySnapshot(row.snapshot, Boolean(row.error)) : undefined }));
  const aggregated = enabled && rows.length > 1;
  const chosen = aggregated ? rows.find(row => row.id === selected) : undefined;
  useEffect(() => { if (!aggregated || (selected !== null && !rows.some(row => row.id === selected))) select(null); }, [aggregated, selected, rows.map(row => row.id).join('|')]);
  const colors = theme.colors;
  const countText = (id: string) => { const value = counts[id]; return value && !value.error ? `작업 중 ${value.running} · 대기 ${value.idle}${value.other ? ` · 기타 ${value.other}` : ''}` : '에이전트 확인 불가'; };
  return <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 16 }}>
    <Text style={{ color: colors.foreground, fontSize: layout.compact ? 20 : 24, fontWeight: '600' }}>Mac 시스템 모니터</Text>
    <Text style={{ color: colors.foregroundMuted }}>{aggregated ? '실험적 멀티호스트 집계 · 행을 눌러 상세 보기' : !enabled ? '공식 호스트 모드 · 실험 집계 꺼짐 또는 설정 확인 중' : '공식 호스트 모드로 자동 폴백 · 레지스트리에서 여러 호스트를 찾지 못했습니다. 호스트 선택기로 전환하세요.'}</Text>
    {config.status === 'ready' ? <Pressable accessibilityRole="button" disabled={config.saving} onPress={() => void config.save({ experimentalFleet: !enabled }, config.revision)} style={{ padding: 12, backgroundColor: colors.surface1, borderRadius: 8 }}><Text style={{ color: colors.foreground }}>실험적 멀티호스트 집계: {enabled ? '켜짐 (눌러 끄기)' : '꺼짐 (눌러 켜기)'}</Text></Pressable> : null}
    {config.status === 'error' || config.status === 'invalid' ? <Text style={{ color: colors.foregroundMuted }}>설정 확인 실패: {config.error} · 공식 호스트 모드 사용</Text> : null}
    {config.saveError ? <Text style={{ color: colors.foregroundMuted }}>{config.saveError}</Text> : null}
    {aggregated ? <View style={{ gap: 8 }}>
      {!layout.compact ? <FleetHeader theme={theme} /> : null}
      {rows.map(row => <FleetRow key={row.id} {...props} snapshot={row.snapshot} error={row.error}
        name={hosts.find(h => h.serverId === row.id)?.label ?? row.info.hostname}
        agentText={countText(row.id)} onPress={() => select(row.id)} />)}
    </View> : null}
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>연결된 호스트 / 에이전트</Text>
      {hosts.map(h => <View key={h.serverId} style={{ padding: 8, gap: 4 }}>
        <Text style={{ color: colors.foreground }}>{h.label} · {h.status === 'online' ? '온라인' : '연결 안 됨'} · {countText(h.serverId)}</Text>
        {!aggregated && h.serverId !== host.id ? <Text style={{ color: colors.foregroundMuted }}>CPU·메모리: 호스트 선택기로 전환</Text> : null}
      </View>)}
    </View>
    {chosen ? <>
      <Pressable accessibilityRole="button" onPress={() => select(null)}><Text style={{ color: colors.foreground }}>선택한 호스트로 돌아가기</Text></Pressable>
      <Details {...props} snapshot={chosen.snapshot} name={chosen.info.hostname} error={chosen.error} />
    </> : <Details {...props} snapshot={local.data} name={info.data?.hostname ?? host.label} error={local.error?.message} />}
  </ScrollView>;
}
