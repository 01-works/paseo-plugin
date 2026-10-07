import { createContext, useContext, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { stateLabels, type AgentState } from '../shared/types';
import { spacing } from './spacing';
const CompactControls = createContext(false);
export function ControlLayout({ compact, children }: { compact: boolean; children: ReactNode }) {
  return <CompactControls.Provider value={compact}>{children}</CompactControls.Provider>;
}
export function Button({ theme, children, onPress, active = false, disabled = false, label }: {
  theme: PluginTheme; children: ReactNode; onPress: () => void; active?: boolean; disabled?: boolean; label?: string;
}) {
  const c = theme.colors;
  const compact = useContext(CompactControls);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => ({
      minHeight: compact ? 44 : 32, minWidth: compact ? 44 : 32, paddingHorizontal: spacing.inset,
      justifyContent: 'center', alignItems: 'center', borderRadius: spacing.gap,
      backgroundColor: active || pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.45 : 1,
    })}>
    <Text style={{ color: active ? c.accent : c.foreground }}>{children}</Text>
  </Pressable>;
}
export function IconButton({ theme, name, label, onPress, active = false, disabled = false }: {
  theme: PluginTheme; name: string; label: string; onPress: () => void; active?: boolean; disabled?: boolean;
}) {
  const c = theme.colors;
  const compact = useContext(CompactControls);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => ({ width: compact ? 44 : 32, minHeight: compact ? 44 : 32, alignItems: 'center', justifyContent: 'center',
      borderRadius: spacing.gap, backgroundColor: active || pressed ? c.surface2 : 'transparent', opacity: disabled ? 0.45 : 1 })}>
    <Icon name={name} size={16} color={active ? c.accent : c.foregroundMuted} />
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
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}>
    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    <Text selectable={false} numberOfLines={1} style={{ color }}>{stateLabels[state]}</Text>
  </View>;
}
