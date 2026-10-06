import { Pressable, Text, View } from 'react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import type { Snapshot } from '../../shared/contracts';
import { pressureColor } from '../popover';
import { gib, percent, pressureLabels, relativeTime, statusLabels } from '../format';
const weights = [1.4, 0.7, 0.6, 1.8, 0.7, 1.4, 1.3, 1];
const titles = ['호스트', '상태', 'CPU', '사용 / 전체 메모리', '압력', '사용 / 전체 스왑', '에이전트', '갱신'];
export function FleetHeader({ theme }: Pick<PluginHostProps, 'theme'>) {
  return <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
    {titles.map((title,i) => <Text key={title} style={{ color: theme.colors.foregroundMuted, flex: weights[i], fontSize: 12 }}>{title}</Text>)}
  </View>;
}
export function FleetRow({ snapshot: s, theme, layout, name, error, agentText, onPress }: PluginHostProps & {
  snapshot?: Snapshot; name: string; error?: string; agentText: string; onPress: () => void;
}) {
  const values = [name, error ? '연결 오류' : s ? statusLabels[s.status] : '측정 중', percent(s?.cpu?.total),
    `${gib(s?.memory?.used)} / ${gib(s?.memory?.total)}`, s ? pressureLabels[s.pressure] : '확인 불가',
    `${gib(s?.swap?.used)} / ${gib(s?.swap?.total)}`, agentText, relativeTime(s?.ageMs ?? null)];
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name} 상세 보기`} onPress={onPress}
    style={{ padding: 12, borderRadius: 8, backgroundColor: theme.colors.surface1, borderWidth: 1, borderColor: theme.colors.border, gap: 8 }}>
    <View style={{ flexDirection: layout.compact ? 'column' : 'row', gap: 8 }}>
      {values.map((value,i) => <Text key={i} style={{ color: i === 4 ? pressureColor(s,theme) : theme.colors.foreground,
        flex: layout.compact ? undefined : weights[i], fontSize: layout.compact ? 14 : 13, fontWeight: i === 0 ? '600' : '400' }}>
        {layout.compact && i > 0 ? `${titles[i]}: ` : ''}{value}
      </Text>)}
    </View>
    {error ? <Text style={{ color: theme.colors.foregroundMuted }}>{error}</Text> : null}
  </Pressable>;
}
