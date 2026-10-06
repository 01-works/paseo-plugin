import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRpc, type PluginHostProps } from '@getpaseo/plugin/client';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { hostInfoRpc, TOP_APP_LIMIT, type Snapshot } from '../shared/contracts';
import { useSnapshot } from './data';
import { gib, percent, relativeTime, pressureLabels, statusLabels, displaySnapshot } from './format';
import { Badge, Bar, Card, Legend, barPercent, type Theme } from './visuals';

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
      <Text style={{ color: c.foreground, fontWeight: '600' }}>상위 앱</Text>
      <Badge theme={theme} label={`상위 ${TOP_APP_LIMIT} · ${muted && s.processesStatus === 'ok' ? '마지막 수신 값' : processState[s.processesStatus]}`} />
    </View>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: c.surface2, padding: 3, borderRadius: 10, gap: 3 }}>
      {(['cpu', 'memory'] as const).map(key => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)}
        style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: tab === key ? c.surface1 : c.surface2 }}>
        <Text style={{ color: tab === key ? c.foreground : c.foregroundMuted, fontWeight: '600' }}>{key === 'cpu' ? 'CPU' : '메모리'}</Text>
      </Pressable>)}
    </View>
    <Text style={{ color: c.foregroundMuted }}>{tab === 'cpu' ? '전체 코어 합산 · 막대 기준 100%' : 'footprint · 막대는 목록 내 최대값 대비'}</Text>
    {s.processesStatus === 'unsupported' ? <Text style={{ color: c.foregroundMuted }}>{s.helperMode === 'node' ? 'Node 폴백 모드: 앱 목록 미지원' : 'macOS 전용: 앱 목록 미지원'}</Text> : null}
    {!groups.length && s.processesStatus !== 'unsupported' ? <Text style={{ color: c.foregroundMuted }}>{s.processesStatus === 'ok' ? '읽을 수 있는 앱이 없습니다.' : `앱 목록 ${processState[s.processesStatus]}`}</Text> : null}
    {groups.length ? <ScrollView accessibilityLabel="앱 사용 순위 목록" nestedScrollEnabled showsVerticalScrollIndicator
      style={{ maxHeight: 320, flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
    {groups.map((g, i) => <View key={g.name} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 5 }}>
      <View style={{ width: 24, paddingTop: 1, alignItems: 'center' }}>
        <Text style={{ color: c.foregroundMuted, fontWeight: '600' }}>{i + 1}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
          <Text style={{ color: c.foreground, fontWeight: '600', flexShrink: 1 }}>{g.name}</Text>
          <Text style={{ color: muted ? c.foregroundMuted : c.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{tab === 'cpu' ? percent(g.cpuPercent) : gib(g.memoryBytes)}</Text>
        </View>
        <Bar theme={theme} value={tab === 'cpu' ? barPercent(g.cpuPercent) : barPercent(g.memoryBytes, largest)} muted={muted} label={`${g.name} ${tab === 'cpu' ? percent(g.cpuPercent) : gib(g.memoryBytes)}`} height={5} />
        <Text style={{ color: c.foregroundMuted }}>프로세스 {g.processCount}개 · {tab === 'cpu' ? gib(g.memoryBytes) : `CPU ${percent(g.cpuPercent)}`}</Text>
      </View>
    </View>)}
    </ScrollView> : null}
    {s.processes ? <Text style={{ color: c.foregroundMuted }}>root {s.processes.excludedRoot}개 제외 · 권한 제외 전체 {s.processes.excludedPermission}개 · 기타 읽기 실패 {s.processes.otherErrors}개</Text> : null}
  </Card>;
}

export function Details({ snapshot, theme, layout, name, error }: PluginHostProps & { snapshot?: Snapshot; name: string; error?: string }) {
  const c = theme.colors;
  const s = snapshot ? displaySnapshot(snapshot, Boolean(error)) : undefined;
  if (!s) return <Card theme={theme}><Text style={{ color: c.foreground, fontWeight: '600' }}>{name}</Text><Text style={{ color: c.foregroundMuted }}>{error ? `연결 오류: ${error}` : '측정 중'}</Text></Card>;
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
        <Text style={{ color: c.foreground, fontWeight: '600' }}>{name}</Text>
        <Text style={{ color: c.foregroundMuted }}>{relativeTime(s.ageMs)} 갱신 · 2초 간격</Text>
      </View>
      <Badge theme={theme} label={statusLabels[s.status]} />
    </View>
    {error ? <Card theme={theme}><Text style={{ color: c.foregroundMuted }}>RPC 연결 오류 · 마지막 수신 값 표시: {error}</Text></Card> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <Card theme={theme} style={{ flexGrow: 1, flexShrink: 1, flexBasis: layout.compact ? '100%' : '45%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ color: c.foregroundMuted }}>CPU</Text>
          <Text style={{ color: valueColor, fontVariant: ['tabular-nums'] }}>{percent(s.cpu?.total)}</Text>
        </View>
        <Bar theme={theme} value={barPercent(s.cpu?.total)} muted={muted} label={`CPU ${percent(s.cpu?.total)}`} height={8} />
        <Text style={{ color: c.foregroundMuted }}>사용자 {percent(s.cpu?.user)} · 시스템 {percent(s.cpu?.system)}</Text>
        <Text style={{ color: c.foregroundMuted }}>전 코어 합산 0~100%</Text>
      </Card>
      <Card theme={theme} style={{ flexGrow: 1, flexShrink: 1, flexBasis: layout.compact ? '100%' : '45%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <Text style={{ color: c.foregroundMuted }}>메모리</Text>
          <Text style={{ color: valueColor, fontVariant: ['tabular-nums'] }}>{gib(s.memory?.used)}</Text>
        </View>
        <Bar theme={theme} value={barPercent(s.memory?.used, s.memory?.total ?? 0)} muted={muted} label={`사용된 메모리 ${gib(s.memory?.used)} / ${gib(s.memory?.total)}`} height={8} />
        <Text style={{ color: c.foregroundMuted }}>전체 {gib(s.memory?.total)}</Text>
        <Text style={{ color: c.foregroundMuted }}>앱 + 와이어드 + 압축</Text>
      </Card>
    </View>
    <Card theme={theme}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>메모리 압력</Text>
        <Badge theme={theme} label={pressureLabels[s.pressure]} color={pressureColor(s, theme)} dot />
      </View>
      <Text style={{ color: c.foregroundMuted }}>OS 압력 기준 · 가용 비율 {s.memoryLevel === null ? '확인 불가' : `${s.memoryLevel}% (참고값)`}</Text>
    </Card>
    <Card theme={theme}>
      <Text style={{ color: c.foreground, fontWeight: '600' }}>메모리 구성</Text>
      <View accessibilityLabel={`앱 ${gib(s.memory?.app)}, 와이어드 ${gib(s.memory?.wired)}, 압축 ${gib(s.memory?.compressed)}. 막대 기준 ${gib(memoryScale || null)}`} style={{ flexDirection: 'row', height: 12, width: '100%', borderRadius: 6, overflow: 'hidden', backgroundColor: c.surface2, opacity: muted ? 0.4 : 1 }}>
        {memoryParts.map(part => { const width = barPercent(part.value, memoryScale); return width === null ? null : <View key={part.label} style={{ height: '100%', width: `${width}%`, backgroundColor: part.color }} />; })}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{memoryParts.map(part => <Legend key={part.label} theme={theme} label={part.label} value={gib(part.value)} color={part.color} />)}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 10, borderTopWidth: 1, borderColor: c.border }}>
        <Text style={{ color: c.foregroundMuted }}>캐시된 파일</Text>
        <Text style={{ color: valueColor, fontWeight: '600' }}>{gib(s.memory?.cached)}</Text>
      </View>
      <Text style={{ color: c.foregroundMuted }}>캐시는 사용량 막대에서 제외됩니다.</Text>
      {s.memory && s.memory.used > s.memory.total ? <Text style={{ color: c.foregroundMuted }}>구성 합계가 전체 용량을 초과해 구성 막대는 사용량 기준으로 표시합니다.</Text> : null}
    </Card>
    <Card theme={theme}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>스왑</Text>
        <Text style={{ color: valueColor, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{gib(s.swap?.used)}</Text>
      </View>
      {s.swap?.total === 0 ? null : <Bar theme={theme} value={barPercent(s.swap?.used, s.swap?.total ?? 0)} muted={muted} label={`스왑 ${gib(s.swap?.used)} / ${gib(s.swap?.total)}`} />}
      <Text style={{ color: c.foregroundMuted }}>전체 {gib(s.swap?.total)} · {s.swap?.total === 0 ? '할당된 스왑 없음' : '압력 상태 색과 무관'}</Text>
    </Card>
    <AppRanking snapshot={s} theme={theme} />
    {s.errors.length ? <Card theme={theme}><Text style={{ color: c.foreground, fontWeight: '600' }}>측정 오류</Text>{s.errors.map((message, i) => <Text key={i} style={{ color: c.foregroundMuted }}>{message}</Text>)}</Card> : null}
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.foregroundMuted }}>마지막 샘플 · {s.sampledAt === null ? '없음' : new Date(s.sampledAt).toLocaleString('ko-KR')}</Text>
      <Text style={{ color: c.foregroundMuted }}>1 GiB = 1024³ bytes. Activity Monitor의 GB도 같은 기준입니다. 앱 footprint 합은 물리 RAM보다 클 수 있습니다.</Text>
    </View>
  </View>;
}

export function MonitorContent(props: PluginHostProps) {
  const query = useSnapshot();
  const infoRpc = useRpc(hostInfoRpc);
  const info = useQuery({ queryKey: ['mac-monitor', 'host'], queryFn: () => infoRpc({}), staleTime: 60_000 });
  return <Details {...props} snapshot={query.data} name={info.data?.hostname ?? props.host.label} error={query.error?.message} />;
}
