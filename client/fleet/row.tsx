import { Pressable, Text, View } from 'react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { Snapshot } from '../../shared/contracts';
import { pressureColor } from '../popover';
import { gib, percent, pressureLabels, relativeTime, statusLabels } from '../format';
import { Badge, Bar, barPercent } from '../visuals';
const weights = [1.4, 0.7, 0.6, 1.8, 0.7, 1.4, 1.3, 1];
const titles = ['호스트', '상태', 'CPU', '사용 / 전체 메모리', '압력', '사용 / 전체 스왑', '에이전트', '갱신'];
export function FleetHeader({ theme }: Pick<PluginHostProps, 'theme'>) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
    {titles.map((title,i) => <Text key={title} style={{ color: theme.colors.foregroundMuted, flex: weights[i] }}>{title}</Text>)}
  </View>;
}
export function FleetRow({ snapshot: s, theme, layout, name, error, agentText, onPress }: PluginHostProps & {
  snapshot?: Snapshot; name: string; error?: string; agentText: string; onPress: () => void;
}) {
  const values = [name, error ? '연결 오류' : s ? statusLabels[s.status] : '측정 중', percent(s?.cpu?.total),
    `${gib(s?.memory?.used)} / ${gib(s?.memory?.total)}`, s ? pressureLabels[s.pressure] : '확인 불가',
    `${gib(s?.swap?.used)} / ${gib(s?.swap?.total)}`, agentText, relativeTime(s?.ageMs ?? null)];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name} 상세 보기`} onPress={onPress}
    style={{ padding: 16, borderRadius: 14, backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, gap: 12 }}>
    {layout.compact ? <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: '600', flexShrink: 1 }}>{name}</Text>
        <Badge theme={theme} label={values[1]} />
      </View>
      <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 100, gap: 6 }}>
          <Text style={{ color: theme.colors.foregroundMuted }}>CPU</Text>
          <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>{values[2]}</Text>
          <Bar theme={theme} value={barPercent(s?.cpu?.total)} muted={Boolean(error) || s?.status !== 'ok'} label={`CPU ${values[2]}`} />
        </View>
        <View style={{ flex: 1, minWidth: 100, gap: 6 }}>
          <Text style={{ color: theme.colors.foregroundMuted }}>메모리</Text>
          <Text style={{ color: theme.colors.foreground, fontWeight: '600' }}>{gib(s?.memory?.used)}</Text>
          <Bar theme={theme} value={barPercent(s?.memory?.used, s?.memory?.total ?? 0)} muted={Boolean(error) || s?.status !== 'ok'} label={`메모리 ${values[3]}`} />
          <Text style={{ color: theme.colors.foregroundMuted }}>전체 {gib(s?.memory?.total)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Badge theme={theme} label={`압력 ${values[4]}`} color={pressureColor(error ? undefined : s,theme)} dot />
        <Text style={{ color: theme.colors.foregroundMuted }}>스왑 {gib(s?.swap?.used)}</Text>
      </View>
      <Text style={{ color: theme.colors.foregroundMuted }}>{agentText} · {values[7]}</Text>
    </> : <View style={{ flexDirection: 'row', gap: 8 }}>
      {values.map((value,i) => <View key={i} style={{ flex: weights[i], gap: 7, minWidth: 0 }}>
        <Text style={{ color: i === 4 ? pressureColor(error ? undefined : s,theme) : theme.colors.foreground,
          fontWeight: i === 0 || i === 2 ? '600' : '400' }}>{value}</Text>
        {i === 2 || i === 3 ? <Bar theme={theme} value={i === 2 ? barPercent(s?.cpu?.total) : barPercent(s?.memory?.used, s?.memory?.total ?? 0)}
          muted={Boolean(error) || s?.status !== 'ok'} label={`${titles[i]} ${value}`} height={5} /> : null}
      </View>)}
    </View>}
    {error ? <Text style={{ color: theme.colors.foregroundMuted }}>{error}</Text> : null}
  </Pressable>;
}
