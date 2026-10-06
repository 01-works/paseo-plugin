import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { stateLabels, type AgentState } from '../shared/types';
export function Button({ theme, children, onPress, active = false, disabled = false, label }: {
  theme: PluginTheme; children: ReactNode; onPress: () => void; active?: boolean; disabled?: boolean; label?: string;
}) {
  const c = theme.colors;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({
      minHeight: 44, minWidth: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 8,
      backgroundColor: active || pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.45 : 1,
    })}>
    <Text style={{ color: active ? c.accent : c.foreground }}>{children}</Text>
  </Pressable>;
}
export const stateColor = (state: AgentState, theme: PluginTheme, stale = false) => {
  if (stale) return theme.colors.foregroundMuted;
  if (state === 'error' || state === 'unavailable') return theme.colors.statusDanger;
  if (state === 'permission') return theme.colors.statusWarning;
  if (state === 'running' || state === 'starting') return theme.colors.accent;
  if (state === 'ready') return theme.colors.statusSuccess;
  return theme.colors.foregroundMuted;
};
export function Status({ state, theme, stale }: { state: AgentState; theme: PluginTheme; stale: boolean }) {
  const color = stateColor(state, theme, stale);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    <Text selectable={false} numberOfLines={1} style={{ color }}>{stateLabels[state]}</Text>
  </View>;
}
