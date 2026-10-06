import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';

export type Theme = PluginHostProps['theme'];

// 막대는 표현 범위만 제한한다. 누락된 측정을 0%로 바꾸지 않는다.
export function barPercent(value: number | null | undefined, total = 100): number | null {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, value / total * 100));
}

export function Card({ theme, children, style }: { theme: Theme; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ padding: 16, gap: 12, borderRadius: 16, backgroundColor: theme.colors.surface1,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 0 }, style]}>{children}</View>;
}

export function Badge({ theme, label, color, dot = false }: { theme: Theme; label: string; color?: string; dot?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: theme.colors.surface2, maxWidth: '100%' }}>
    {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color ?? theme.colors.foregroundMuted }} /> : null}
    <Text style={{ color: color ?? theme.colors.foregroundMuted, fontSize: 12, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
  </View>;
}

export function Bar({ theme, value, label, muted = false, height = 7 }: { theme: Theme; value: number | null; label: string; muted?: boolean; height?: number }) {
  return <View accessibilityLabel={`${label}${value === null ? ' · 확인 불가' : ''}`} style={{ height, borderRadius: height,
    backgroundColor: theme.colors.surface2, overflow: 'hidden', width: '100%', opacity: muted ? 0.4 : 1,
    borderWidth: value === null ? 1 : 0, borderStyle: 'dashed', borderColor: theme.colors.border }}>
    {value !== null ? <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
      borderRadius: height, backgroundColor: theme.colors.accent }} /> : null}
  </View>;
}

export function Legend({ theme, label, value, color }: { theme: Theme; label: string; value: string; color: string }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{label}</Text>
    <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
  </View>;
}
