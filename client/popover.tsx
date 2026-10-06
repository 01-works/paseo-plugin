import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRpc, type PluginHostProps } from '@getpaseo/plugin/client';
import { hostInfoRpc, type Snapshot } from '../shared/contracts';
import { useSnapshot } from './data';
import { gib, percent, relativeTime, pressureLabels, statusLabels, displaySnapshot } from './format';

export function pressureColor(s: Snapshot | null | undefined, theme: PluginHostProps['theme']): string {
  if (!s || s.status !== 'ok') return theme.colors.foregroundMuted;
  return s.pressure === 'normal' ? theme.colors.statusSuccess : s.pressure === 'warning' ? theme.colors.statusWarning : s.pressure === 'critical' ? theme.colors.statusDanger : theme.colors.foregroundMuted;
}
export function Details({ snapshot, theme, layout, name, error }: PluginHostProps & { snapshot?: Snapshot; name: string; error?: string }) {
  const colors = theme.colors;
  const s = snapshot ? displaySnapshot(snapshot, Boolean(error)) : undefined;
  const row = (label: string, value: string, key = label) => <View key={key} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><Text style={{ color: colors.foregroundMuted, flexShrink: 1 }}>{label}</Text><Text style={{ color: colors.foreground, flexShrink: 1 }}>{value}</Text></View>;
  if (!s) return <Text style={{ color: colors.foregroundMuted }}>{name} · {error ? `연결 오류: ${error}` : '측정 중'}</Text>;
  return <View style={{ gap: layout.compact ? 8 : 12, minWidth: 0, width: '100%' }}>
    <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: '600' }}>{name}</Text>
    <Text style={{ color: colors.foregroundMuted }}>{statusLabels[s.status]} · {relativeTime(s.ageMs)}{s.sampledAt !== null ? ` · ${new Date(s.sampledAt).toLocaleString('ko-KR')}` : ''}</Text>
    {error ? <Text style={{ color: colors.foregroundMuted }}>RPC 연결 오류 · 아래는 마지막 수신 값: {error}</Text> : null}
    {row('CPU (전 코어 0~100%)', percent(s.cpu?.total))}
    {row('사용자 / 시스템', `${percent(s.cpu?.user)} / ${percent(s.cpu?.system)}`)}
    {row('사용된 메모리 / 전체', `${gib(s.memory?.used)} / ${gib(s.memory?.total)}`)}
    {row('앱 메모리', gib(s.memory?.app))}{row('와이어드', gib(s.memory?.wired))}{row('압축', gib(s.memory?.compressed))}{row('캐시된 파일', gib(s.memory?.cached))}
    <View style={{ flexDirection: 'row', gap: 12 }}><Text style={{ color: colors.foregroundMuted }}>메모리 압력</Text><Text style={{ color: error ? colors.foregroundMuted : pressureColor(s, theme) }}>{pressureLabels[s.pressure]}</Text></View>
    {row('가용 비율 (OS 참고값)', s.memoryLevel === null ? '확인 불가' : `${s.memoryLevel}%`)}
    {row('스왑 사용 / 전체', `${gib(s.swap?.used)} / ${gib(s.swap?.total)}`)}
    <Text style={{ color: colors.foregroundMuted }}>상위 앱 · CPU는 전 코어 합산 기준 · 메모리는 footprint</Text>
    {s.processesStatus === 'unsupported' ? <Text style={{ color: colors.foregroundMuted }}>{s.helperMode === 'node' ? 'Node 폴백 모드: 앱 상위 목록 미지원' : 'macOS 전용: 앱 상위 목록 미지원'}</Text> : s.processesStatus !== 'ok' ? <Text style={{ color: colors.foregroundMuted }}>앱 목록: {({ off: '측정 중', warming: '측정 중', stale: '지연', error: '확인 불가' } as const)[s.processesStatus]}</Text> : null}
    {s.processes ? <>
      <Text style={{ color: colors.foregroundMuted }}>root 프로세스 {s.processes.excludedRoot}개 제외 · 권한 제외 전체 {s.processes.excludedPermission}개 · 기타 읽기 실패 {s.processes.otherErrors}개</Text>
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>CPU 상위 5</Text>
      {s.processes.topCpu.map((g, i) => row(`${g.name} (${g.processCount})`, `${percent(g.cpuPercent)} · ${gib(g.memoryBytes)}`, `cpu-${i}`))}
      <Text style={{ color: colors.foreground, fontWeight: '600' }}>메모리 상위 5</Text>
      {s.processes.topMemory.map((g, i) => row(`${g.name} (${g.processCount})`, gib(g.memoryBytes), `memory-${i}`))}
    </> : null}
    {s.errors.map((message, i) => <Text key={i} style={{ color: colors.foregroundMuted }}>{message}</Text>)}
    <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>1 GiB = 1024³ bytes. Activity Monitor의 GB 표시도 같은 기준. 앱 footprint 합은 물리 RAM보다 클 수 있습니다.</Text>
  </View>;
}
export function MonitorContent(props: PluginHostProps) {
  const query = useSnapshot();
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000 });
  return <Details {...props} snapshot={query.data} name={info.data?.hostname ?? props.host.label} error={query.error?.message} />;
}
