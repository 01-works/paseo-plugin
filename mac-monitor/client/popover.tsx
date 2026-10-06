import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRpc, type PluginHostProps } from '@getpaseo/plugin/client';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { hostInfoRpc, type Snapshot } from '../shared/contracts';
import { emptySnapshot } from '../shared/compute';
import { useSnapshot } from './data';
import { gib, percent, pressureLabels, statusLabels, displaySnapshot, appPercent } from './format';
import { Badge, Bar, Card, barPercent, usageColor, type Theme } from './visuals';
import { GroupTermination, ProcessPanel } from './processes';

const rankingColumns = {
  cpu: { width: 72, paddingHorizontal: 4, alignItems: 'flex-end' as const },
  memory: { width: 96, paddingHorizontal: 4, alignItems: 'flex-end' as const },
};

export function pressureColor(s: Snapshot | null | undefined, theme: Theme): string {
  if (!s || s.status !== 'ok') return theme.colors.foregroundMuted;
  return s.pressure === 'normal' ? theme.colors.statusSuccess : s.pressure === 'warning' ? theme.colors.statusWarning : s.pressure === 'critical' ? theme.colors.statusDanger : theme.colors.foregroundMuted;
}

function AppRanking({ snapshot: s, theme, canInspect, onSelect, tab, setTab, compact }: { snapshot: Snapshot; theme: Theme; canInspect: boolean; onSelect: (group: string, mode: 'processes' | 'terminate') => void; tab: 'cpu' | 'memory'; setTab: (tab: 'cpu' | 'memory') => void; compact: boolean }) {
  const c = theme.colors;
  const groups = (tab === 'cpu' ? s.processes?.topCpu : s.processes?.topMemory) ?? [];
  const muted = s.status !== 'ok' || s.processesStatus !== 'ok';
  const processState = { off: '측정 중', warming: '측정 중', ok: '최신', stale: '지연', error: '확인 불가', unsupported: '미지원' } as const;
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>상위 앱</Text>
      <Badge theme={theme} label={muted && s.processesStatus === 'ok' ? '이전 값' : s.processesStatus === 'ok' ? `${groups.length}개` : processState[s.processesStatus]} />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 8, borderBottomWidth: 1, borderColor: c.border }}>
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: c.foregroundMuted }}>앱</Text></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['cpu', 'memory'] as const).map(key => <View key={key} style={{ width: rankingColumns[key].width, alignItems: 'flex-end' }}>
        <Pressable accessibilityRole="button"
          accessibilityLabel={`${key === 'cpu' ? 'CPU' : '메모리'} 순위로 정렬`} accessibilityState={{ selected: tab === key }}
          onPress={() => setTab(key)} style={({ pressed }) => ({ minHeight: 32, alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: rankingColumns[key].paddingHorizontal, paddingVertical: 6,
            borderRadius: 4, backgroundColor: tab === key || pressed ? c.surface2 : undefined })}>
          <Text style={{ color: tab === key ? c.foreground : c.foregroundMuted, fontWeight: '600' }}>{key === 'cpu' ? 'CPU' : '메모리'}{tab === key ? ' ↓' : ''}</Text>
        </Pressable>
      </View>)}
      </View>
      {canInspect && !compact ? <View style={{ width: 68 }} /> : null}
    </View>
    <ScrollView accessibilityLabel="앱 사용 순위 목록" nestedScrollEnabled showsVerticalScrollIndicator
      style={{ height: 320, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ flexGrow: 1, paddingRight: 8 }}>
    {!groups.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text selectable style={{ color: c.foregroundMuted }}>{s.processesStatus === 'unsupported' ? '앱 목록 미지원' : s.processesStatus === 'ok' ? '앱 없음' : processState[s.processesStatus]}</Text>
    </View> : null}
    {groups.map((g, i) => <View key={g.name} accessibilityLabel={`${i + 1}위 ${g.name}, 프로세스 ${g.processCount}개`}
      style={{ flexDirection: 'row', flexWrap: compact ? 'wrap' : 'nowrap', gap: 8, alignItems: 'center', minHeight: 38, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${g.name} 프로세스 보기`} disabled={!canInspect || muted}
        onPress={() => onSelect(g.name, 'processes')} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 32, justifyContent: 'center',
          borderRadius: 4, backgroundColor: pressed ? c.surface2 : undefined })}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: muted ? c.foregroundMuted : c.foreground }}>{g.name}</Text>
      </Pressable>
      <View style={rankingColumns.cpu}><Text selectable style={{ color: muted ? c.foregroundMuted : c.foreground, fontWeight: tab === 'cpu' ? '600' : '400', fontVariant: ['tabular-nums'] }}>{appPercent(g.cpuPercent)}</Text></View>
      <View style={rankingColumns.memory}><Text selectable style={{ color: muted ? c.foregroundMuted : c.foreground, fontWeight: tab === 'memory' ? '600' : '400', fontVariant: ['tabular-nums'] }}>{gib(g.memoryBytes)}</Text></View>
      {canInspect ? <Pressable accessibilityRole="button" accessibilityLabel={`${g.name} 전체 종료 선택`} disabled={muted}
        onPress={() => onSelect(g.name, 'terminate')} style={({ pressed }) => ({ width: compact ? '100%' : 68, alignItems: 'flex-end',
          paddingVertical: 6, borderRadius: 4, backgroundColor: pressed ? c.surface2 : undefined })}>
        <Text style={{ color: c.foregroundMuted }}>전체 종료</Text>
      </Pressable> : null}
    </View>)}
    {s.processes && s.processes.otherErrors > 0 ? <Text selectable style={{ color: c.foregroundMuted }}>앱 정보 읽기 오류 {s.processes.otherErrors}개</Text> : null}
    </ScrollView>
  </Card>;
}

export function Details({ snapshot, theme, layout, name, error, onRefresh, refreshing = false, canInspect = true }: PluginHostProps & { snapshot?: Snapshot; name: string; error?: string; onRefresh?: () => void; refreshing?: boolean; canInspect?: boolean }) {
  const [selection, select] = useState<{ group: string; mode: 'processes' | 'terminate' } | null>(null);
  const [tab, setTab] = useState<'cpu' | 'memory'>('cpu');
  const c = theme.colors;
  const s: Snapshot = useMemo(() => snapshot ? displaySnapshot(snapshot, Boolean(error)) : {
    ...emptySnapshot('native'), ...(error ? { status: 'error', processesStatus: 'error' } : {}),
  }, [snapshot, error]);
  const muted = s.status !== 'ok';
  const valueColor = muted ? c.foregroundMuted : c.foreground;
  const cpuUsage = barPercent(s.cpu?.total);
  const diskUsage = barPercent(s.disk?.used, s.disk?.total ?? 0);
  const memoryUsage = barPercent(s.memory?.used, s.memory?.total ?? 0);
  const memoryParts = [
    { label: '앱', value: s.memory?.app },
    { label: '와이어드', value: s.memory?.wired },
    { label: '압축', value: s.memory?.compressed },
  ];
  if (selection && canInspect) return selection.mode === 'processes'
    ? <ProcessPanel group={selection.group} theme={theme} onBack={() => select(null)} />
    : <GroupTermination group={selection.group} theme={theme} onBack={() => select(null)} />;
  return <View style={{ gap: 12, minWidth: 0, width: '100%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
        <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>{name}</Text>
        <Text selectable accessibilityLabel={s.sampledAt === null ? '아직 측정값 없음' : new Date(s.sampledAt).toLocaleString('ko-KR')} style={{ color: c.foregroundMuted }}>{s.sampledAt === null ? '측정 중' : new Date(s.sampledAt).toLocaleTimeString('ko-KR')}</Text>
      </View>
      {s.status === 'ok' ? null : <Badge theme={theme} label={statusLabels[s.status]} />}
      <View style={{ flexDirection: 'row', gap: 8 }}>
      {onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel="모니터 새로고침" disabled={refreshing}
        onPress={onRefresh}
        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>새로고침</Text>
      </Pressable> : null}
      </View>
    </View>
    {error ? <Card theme={theme}><Text selectable style={{ color: c.foregroundMuted }}>RPC 연결 오류 · 마지막 수신 값 표시: {error}</Text></Card> : null}
    <Card theme={theme} style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text selectable style={{ color: c.foregroundMuted }}>CPU</Text>
          <Text selectable style={{ color: valueColor, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{percent(s.cpu?.total)}</Text>
        </View>
        <Bar theme={theme} value={cpuUsage} color={usageColor(cpuUsage, theme, 'cpu', muted)} muted={muted} label={`CPU ${percent(s.cpu?.total)}`} height={6} />
        <Text selectable style={{ color: c.foregroundMuted, fontVariant: ['tabular-nums'] }}>사용자 {percent(s.cpu?.user)} · 시스템 {percent(s.cpu?.system)}</Text>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text selectable style={{ color: c.foregroundMuted }}>메모리</Text>
          <Text selectable style={{ color: valueColor, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{gib(s.memory?.used)} / {gib(s.memory?.total)}</Text>
        </View>
        <Bar theme={theme} value={memoryUsage} color={pressureColor(s, theme)} muted={muted}
          label={`메모리 ${gib(s.memory?.used)} / ${gib(s.memory?.total)}`} height={6} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{memoryParts.map(part =>
          <Text key={part.label} selectable style={{ color: c.foregroundMuted, fontVariant: ['tabular-nums'] }}>{part.label} {gib(part.value)}</Text>)}</View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text selectable style={{ color: c.foregroundMuted }}>메모리 압력</Text>
          <Badge theme={theme} label={pressureLabels[s.pressure]} color={pressureColor(s, theme)} dot />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Text selectable style={{ color: c.foregroundMuted }}>가용 {s.memoryLevel === null ? '—' : `${s.memoryLevel}%`}</Text>
          <Text selectable style={{ color: c.foregroundMuted }}>캐시 {gib(s.memory?.cached)}</Text>
          <Text selectable style={{ color: c.foregroundMuted }}>스왑 {gib(s.swap?.used)} / {gib(s.swap?.total)}</Text>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Text selectable style={{ color: c.foregroundMuted }}>디스크</Text>
          <Text selectable style={{ color: valueColor, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{gib(s.disk?.used)} / {gib(s.disk?.total)}</Text>
        </View>
        <Bar theme={theme} value={diskUsage} color={usageColor(diskUsage, theme, 'disk', muted)} muted={muted} label={`디스크 ${gib(s.disk?.used)} / ${gib(s.disk?.total)}`} height={6} />
        <Text selectable style={{ color: c.foregroundMuted }}>여유 {gib(s.disk?.available)}</Text>
      </View>
    </Card>
    <AppRanking snapshot={s} theme={theme} canInspect={canInspect} compact={layout.compact} tab={tab} setTab={setTab} onSelect={(group, mode) => select({ group, mode })} />
    {s.errors.length ? <Card theme={theme}><Text selectable style={{ color: c.foreground, fontWeight: '600' }}>측정 오류</Text>{s.errors.map((message, i) => <Text selectable key={i} style={{ color: c.foregroundMuted }}>{message}</Text>)}</Card> : null}
  </View>;
}

export function MonitorContent(props: PluginHostProps & { initialSnapshot?: Snapshot | null }) {
  const [initial] = useState(() => props.initialSnapshot ?? undefined);
  const query = useSnapshot(true, initial);
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <Details {...props} snapshot={query.data} name={info.data?.hostname ?? props.host.label} error={query.error?.message}
    refreshing={query.isFetching} onRefresh={query.error ? () => void query.refetch() : undefined} />;
}
