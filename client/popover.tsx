import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRpc, type PluginHostProps } from '@getpaseo/plugin/client';
import { copyText, ScrollView } from '@getpaseo/plugin/client/react-native';
import { hostInfoRpc, type Snapshot } from '../shared/contracts';
import { emptySnapshot } from '../shared/compute';
import { useSnapshot } from './data';
import { gib, percent, pressureLabels, statusLabels, displaySnapshot } from './format';
import { Badge, Bar, Card, Legend, barPercent, type Theme } from './visuals';
import { snapshotText } from './copy';

export function pressureColor(s: Snapshot | null | undefined, theme: Theme): string {
  if (!s || s.status !== 'ok') return theme.colors.foregroundMuted;
  return s.pressure === 'normal' ? theme.colors.statusSuccess : s.pressure === 'warning' ? theme.colors.statusWarning : s.pressure === 'critical' ? theme.colors.statusDanger : theme.colors.foregroundMuted;
}

function AppRanking({ snapshot: s, theme }: { snapshot: Snapshot; theme: Theme }) {
  const [tab, setTab] = useState<'cpu' | 'memory'>('cpu');
  const c = theme.colors;
  const groups = (tab === 'cpu' ? s.processes?.topCpu : s.processes?.topMemory) ?? [];
  const largest = Math.max(0, ...groups.map(g => g.memoryBytes));
  const muted = s.status !== 'ok' || s.processesStatus !== 'ok';
  const processState = { off: '측정 중', warming: '측정 중', ok: '최신', stale: '지연', error: '확인 불가', unsupported: '미지원' } as const;
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>상위 앱</Text>
      <Badge theme={theme} label={muted && s.processesStatus === 'ok' ? '이전 값' : s.processesStatus === 'ok' ? `${groups.length}개` : processState[s.processesStatus]} />
    </View>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surface2, padding: 3, borderRadius: 10, gap: 3 }}>
      {(['cpu', 'memory'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)}
        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === key ? c.surface1 : c.surface2 }}>
        <Text style={{ color: tab === key ? c.foreground : c.foregroundMuted, fontWeight: '600' }}>{key === 'cpu' ? 'CPU' : '메모리'}</Text>
      </Pressable>)}
    </View>
    <Text selectable style={{ color: c.foregroundMuted }}>{tab === 'cpu' ? '전 코어 기준' : '앱 간 상대 크기'}</Text>
    <ScrollView accessibilityLabel="앱 사용 순위 목록" nestedScrollEnabled showsVerticalScrollIndicator
      style={{ height: 320, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 8, flexGrow: 1 }}>
    {!groups.length ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text selectable style={{ color: c.foregroundMuted }}>{s.processesStatus === 'unsupported' ? '앱 목록 미지원' : s.processesStatus === 'ok' ? '앱 없음' : processState[s.processesStatus]}</Text>
    </View> : null}
    {groups.map((g, i) => <View key={g.name} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 5 }}>
      <View style={{ width: 24, paddingTop: 1, alignItems: 'center' }}>
        <Text selectable style={{ color: c.foregroundMuted, fontWeight: '600' }}>{i + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <Text selectable style={{ color: c.foreground, fontWeight: '600', flexShrink: 1 }}>{g.name}</Text>
          <Text selectable style={{ color: muted ? c.foregroundMuted : c.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{tab === 'cpu' ? percent(g.cpuPercent) : gib(g.memoryBytes)}</Text>
        </View>
        <Bar theme={theme} value={tab === 'cpu' ? barPercent(g.cpuPercent) : barPercent(g.memoryBytes, largest)} muted={muted} label={`${g.name} ${tab === 'cpu' ? percent(g.cpuPercent) : gib(g.memoryBytes)}`} height={5} />
        <Text selectable style={{ color: c.foregroundMuted }}>프로세스 {g.processCount}개 · {tab === 'cpu' ? gib(g.memoryBytes) : `CPU ${percent(g.cpuPercent)}`}</Text>
      </View>
    </View>)}
    {s.processes ? <Text selectable style={{ color: c.foregroundMuted }}>제외 root {s.processes.excludedRoot} · 권한 {s.processes.excludedPermission} · 읽기 오류 {s.processes.otherErrors}</Text> : null}
    </ScrollView>
  </Card>;
}

export function Details({ snapshot, theme, layout, name, error, onRefresh, refreshing = false }: PluginHostProps & { snapshot?: Snapshot; name: string; error?: string; onRefresh?: () => void; refreshing?: boolean }) {
  const c = theme.colors;
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  const s: Snapshot = useMemo(() => snapshot ? displaySnapshot(snapshot, Boolean(error)) : {
    ...emptySnapshot('native'), ...(error ? { status: 'error', processesStatus: 'error' } : {}),
  }, [snapshot, error]);
  const copy = async () => {
    setCopyState('copying');
    try { await copyText(snapshotText(s, name, error)); setCopyState('copied'); }
    catch { setCopyState('error'); }
  };
  const muted = s.status !== 'ok';
  const valueColor = muted ? c.foregroundMuted : c.foreground;
  const memoryParts = [
    { label: '앱', value: s.memory?.app, color: c.accent },
    { label: '와이어드', value: s.memory?.wired, color: c.foregroundMuted },
    { label: '압축', value: s.memory?.compressed, color: c.foreground },
  ];
  const memoryScale = s.memory ? Math.max(s.memory.total, s.memory.used) : 0;
  return <View style={{ gap: 12, minWidth: 0, width: '100%' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 100, gap: 4 }}>
        <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>{name}</Text>
        <Text selectable accessibilityLabel={s.sampledAt === null ? '아직 샘플 없음' : new Date(s.sampledAt).toLocaleString('ko-KR')} style={{ color: c.foregroundMuted }}>{s.sampledAt === null ? '아직 샘플 없음' : new Date(s.sampledAt).toLocaleTimeString('ko-KR')}</Text>
      </View>
      <Badge theme={theme} label={s.status === 'ok' ? '샘플' : statusLabels[s.status]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
      {onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel="모니터 새로고침" disabled={refreshing}
        onPress={() => { onRefresh(); setCopyState('idle'); }}
        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>{refreshing ? '읽는 중' : '새로고침'}</Text>
      </Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="모니터 값 복사" disabled={copyState === 'copying'} onPress={() => void copy()}
        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: c.surface2 }}>
        <Text style={{ color: c.foreground }}>{copyState === 'copied' ? '복사됨' : copyState === 'copying' ? '복사 중' : '복사'}</Text>
      </Pressable>
      </View>
    </View>
    {copyState === 'error' ? <Text selectable style={{ color: c.foregroundMuted }}>복사하지 못했습니다. 다시 누르거나 텍스트를 선택하세요.</Text> : null}
    {error ? <Card theme={theme}><Text selectable style={{ color: c.foregroundMuted }}>RPC 연결 오류 · 마지막 수신 값 표시: {error}</Text></Card> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Card theme={theme} style={{ flexGrow: 1, flexShrink: 1, flexBasis: layout.compact ? '100%' : '45%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text selectable style={{ color: c.foregroundMuted }}>CPU</Text>
          <Text selectable style={{ color: valueColor, fontVariant: ['tabular-nums'] }}>{percent(s.cpu?.total)}</Text>
        </View>
        <Bar theme={theme} value={barPercent(s.cpu?.total)} muted={muted} label={`CPU ${percent(s.cpu?.total)}`} height={8} />
        <Text selectable style={{ color: c.foregroundMuted }}>사용자 {percent(s.cpu?.user)} · 시스템 {percent(s.cpu?.system)}</Text>
      </Card>
      <Card theme={theme} style={{ flexGrow: 1, flexShrink: 1, flexBasis: layout.compact ? '100%' : '45%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text selectable style={{ color: c.foregroundMuted }}>메모리</Text>
          <Text selectable style={{ color: valueColor, fontVariant: ['tabular-nums'] }}>{gib(s.memory?.used)}</Text>
        </View>
        <Bar theme={theme} value={barPercent(s.memory?.used, s.memory?.total ?? 0)} muted={muted} label={`사용된 메모리 ${gib(s.memory?.used)} / ${gib(s.memory?.total)}`} height={8} />
        <Text selectable style={{ color: c.foregroundMuted }}>전체 {gib(s.memory?.total)}</Text>
      </Card>
    </View>
    <Card theme={theme}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>메모리 압력</Text>
        <Badge theme={theme} label={pressureLabels[s.pressure]} color={pressureColor(s, theme)} dot />
      </View>
      <Text selectable style={{ color: c.foregroundMuted }}>가용 비율 {s.memoryLevel === null ? '—' : `${s.memoryLevel}%`}</Text>
    </Card>
    <Card theme={theme}>
      <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>메모리 구성</Text>
      <View accessibilityLabel={`앱 ${gib(s.memory?.app)}, 와이어드 ${gib(s.memory?.wired)}, 압축 ${gib(s.memory?.compressed)}. 막대 기준 ${gib(memoryScale || null)}`} style={{ flexDirection: 'row', height: 12, width: '100%', borderRadius: 6, overflow: 'hidden', backgroundColor: c.surface2, opacity: muted ? 0.4 : 1 }}>
        {memoryParts.map(part => { const width = barPercent(part.value, memoryScale); return width === null ? null : <View key={part.label} style={{ height: '100%', width: `${width}%`, backgroundColor: part.color }} />; })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{memoryParts.map(part => <Legend key={part.label} theme={theme} label={part.label} value={gib(part.value)} color={part.color} />)}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTopWidth: 1, borderColor: c.border }}>
        <Text selectable style={{ color: c.foregroundMuted }}>캐시된 파일</Text>
        <Text selectable style={{ color: valueColor, fontWeight: '600' }}>{gib(s.memory?.cached)}</Text>
      </View>
      {s.memory && s.memory.used > s.memory.total ? <Text selectable style={{ color: c.foregroundMuted }}>구성 합계가 전체 용량을 초과해 구성 막대는 사용량 기준으로 표시합니다.</Text> : null}
    </Card>
    <Card theme={theme}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text selectable style={{ color: c.foreground, fontWeight: '600' }}>스왑</Text>
        <Text selectable style={{ color: valueColor, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{gib(s.swap?.used)}</Text>
      </View>
      {s.swap?.total === 0 ? null : <Bar theme={theme} value={barPercent(s.swap?.used, s.swap?.total ?? 0)} muted={muted} label={`스왑 ${gib(s.swap?.used)} / ${gib(s.swap?.total)}`} />}
      <Text selectable style={{ color: c.foregroundMuted }}>전체 {gib(s.swap?.total)}</Text>
    </Card>
    <AppRanking snapshot={s} theme={theme} />
    {s.errors.length ? <Card theme={theme}><Text selectable style={{ color: c.foreground, fontWeight: '600' }}>측정 오류</Text>{s.errors.map((message, i) => <Text selectable key={i} style={{ color: c.foregroundMuted }}>{message}</Text>)}</Card> : null}
  </View>;
}

export function MonitorContent(props: PluginHostProps) {
  const query = useSnapshot();
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000, refetchOnWindowFocus: false, refetchOnReconnect: false });
  return <Details {...props} snapshot={query.data} name={info.data?.hostname ?? props.host.label} error={query.error?.message}
    refreshing={query.isFetching} onRefresh={() => void query.refetch()} />;
}
