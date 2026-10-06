import type { ReactNode } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';

export type Theme = PluginHostProps['theme'];

// 막대는 표현 범위만 제한한다. 누락된 측정을 0%로 바꾸지 않는다.
export function barPercent(value: number | null | undefined, total = 100): number | null {
  if (value == null || !Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return null;
  return Math.max(0, Math.min(100, value / total * 100));
}

// 사용량 강조 기준이다. OS의 메모리 압력이나 시스템 이상 판정과 별개다.
export function usageColor(value: number | null, theme: Theme, resource: 'cpu' | 'disk', muted = false): string {
  if (muted || value === null || !Number.isFinite(value)) return theme.colors.foregroundMuted;
  const [warning, high] = resource === 'cpu' ? [50, 80] : [85, 95];
  return value >= high ? theme.colors.statusDanger : value >= warning ? theme.colors.statusWarning : theme.colors.accent;
}

export function Card({ theme, children, style }: { theme: Theme; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ padding: 12, gap: 8, borderRadius: 8, backgroundColor: theme.colors.surface1,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 0 }, style]}>{children}</View>;
}

export function Badge({ theme, label, color, dot = false }: { theme: Theme; label: string; color?: string; dot?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: theme.colors.surface2, maxWidth: '100%' }}>
    {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color ?? theme.colors.foregroundMuted }} /> : null}
    <Text selectable style={{ color: color ?? theme.colors.foregroundMuted, fontWeight: '600', flexShrink: 1 }}>{label}</Text>
  </View>;
}

export function Bar({ theme, value, label, color, muted = false, height = 7 }: { theme: Theme; value: number | null; label: string; color?: string; muted?: boolean; height?: number }) {
  return <View accessibilityLabel={`${label}${value === null ? ' · 확인 불가' : ''}`} style={{ height, borderRadius: height,
    backgroundColor: theme.colors.surface2, overflow: 'hidden', width: '100%', opacity: muted ? 0.4 : 1,
    borderWidth: value === null ? 1 : 0, borderStyle: 'dashed', borderColor: theme.colors.border }}>
    {value !== null ? <View style={{ height: '100%', width: `${Math.max(0, Math.min(100, value))}%`,
      borderRadius: height, backgroundColor: muted ? theme.colors.foregroundMuted : color ?? theme.colors.accent }} /> : null}
  </View>;
}

export function Legend({ theme, label, value, color, muted = false }: { theme: Theme; label: string; value: string; color: string; muted?: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
    <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: muted ? theme.colors.foregroundMuted : color }} />
    <Text selectable style={{ color: theme.colors.foregroundMuted }}>{label}</Text>
    <Text selectable style={{ color: muted ? theme.colors.foregroundMuted : theme.colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{value}</Text>
  </View>;
}
