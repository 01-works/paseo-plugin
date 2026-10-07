import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { stateLabels, type AgentState } from '../shared/types';
import { spacing } from './spacing';
const CompactControls = createContext(false);
export function ControlLayout({ compact, children }: { compact: boolean; children: ReactNode }) {
  return <CompactControls.Provider value={compact}>{children}</CompactControls.Provider>;
}
function useFeedback(disabled: boolean) {
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  useEffect(() => { if (disabled) { setHovered(false); setFocused(false); } }, [disabled]);
  return {
    highlighted: !disabled && (hovered || focused), focused: !disabled && focused,
    events: {
      onHoverIn: () => { if (!disabled) setHovered(true); }, onHoverOut: () => setHovered(false),
      onFocus: () => { if (!disabled) setFocused(true); }, onBlur: () => setFocused(false),
    },
  };
}
export function Button({ theme, children, onPress, active = false, disabled = false, label, danger = false }: {
  theme: PluginTheme; children: ReactNode; onPress: () => void; active?: boolean; disabled?: boolean; label?: string; danger?: boolean;
}) {
  const c = theme.colors;
  const compact = useContext(CompactControls);
  const feedback = useFeedback(disabled);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={onPress} {...feedback.events} style={({ pressed }) => ({
      minHeight: compact ? 44 : 32, minWidth: compact ? 44 : 32, paddingHorizontal: spacing.inset,
      justifyContent: 'center', alignItems: 'center', borderRadius: spacing.gap,
      borderWidth: 1, borderColor: feedback.focused ? danger ? c.statusDanger : c.accent : 'transparent',
      outlineWidth: Platform.OS === 'web' && feedback.focused ? 0 : undefined,
      backgroundColor: active || !disabled && (pressed || feedback.highlighted) ? c.surface2 : 'transparent', opacity: disabled ? 0.45 : 1,
    })}>
    <Text style={{ color: danger ? c.statusDanger : active ? c.accent : c.foreground }}>{children}</Text>
  </Pressable>;
}
export function IconButton({ theme, name, label, hint, onPress, active = false, disabled = false, danger = false }: {
  theme: PluginTheme; name: string; label: string; hint?: string; onPress: () => void; active?: boolean; disabled?: boolean; danger?: boolean;
}) {
  const c = theme.colors;
  const compact = useContext(CompactControls);
  const feedback = useFeedback(disabled);
  const color = active ? c.accent : feedback.highlighted ? danger ? c.statusDanger : c.foreground : c.foregroundMuted;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ selected: active, disabled }}
    disabled={disabled} onPress={onPress} {...feedback.events}
    style={({ pressed }) => ({ width: compact ? 44 : 32, minHeight: compact ? 44 : 32, alignItems: 'center', justifyContent: 'center',
      borderRadius: spacing.gap, borderWidth: 1, borderColor: feedback.focused ? danger ? c.statusDanger : c.accent : 'transparent',
      outlineWidth: Platform.OS === 'web' && feedback.focused ? 0 : undefined,
      backgroundColor: active || !disabled && (pressed || feedback.highlighted) ? c.surface2 : 'transparent', opacity: disabled ? 0.45 : 1 })}>
    <Icon name={name} size={16} color={color} />
  </Pressable>;
}
export function RowButton({ theme, children, label, hint, disabled, onPress, onLongPress }: {
  theme: PluginTheme; children: ReactNode; label: string; hint: string; disabled: boolean; onPress: () => void; onLongPress: () => void;
}) {
  const c = theme.colors, feedback = useFeedback(disabled);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} disabled={disabled}
    onPress={onPress} onLongPress={onLongPress} {...feedback.events}
    style={({ pressed }) => ({ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', gap: spacing.small,
      paddingHorizontal: spacing.gap, paddingVertical: spacing.small, borderWidth: 1, borderRadius: spacing.gap,
      borderColor: feedback.focused ? c.accent : 'transparent',
      outlineWidth: Platform.OS === 'web' && feedback.focused ? 0 : undefined,
      backgroundColor: !disabled && (pressed || feedback.highlighted) ? c.surface2 : 'transparent' })}>
    {children}
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
