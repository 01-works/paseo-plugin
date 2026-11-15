import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginSidebarItemProps } from '@getpaseo/plugin/client';
import { SidebarRow } from '@getpaseo/plugin/client/ui';
import { View } from 'react-native';
import { headline, type Tone } from '../shared/summary';
import { useStatus, type StatusStore } from './store';

export const SCREEN_ID = 'main';

export function toneColor(theme: PluginTheme, tone: Tone): string {
  switch (tone) {
    case 'success':
      return theme.colors.statusSuccess;
    case 'warning':
      return theme.colors.statusWarning;
    case 'danger':
      return theme.colors.statusDanger;
    case 'accent':
      return theme.colors.accent;
    default:
      return theme.colors.foregroundMuted;
  }
}

export function sidebarLabel(state: ReturnType<typeof useStatus>): { label: string; tone: Tone } {
  if (state.data) {
    const { label, tone } = headline(state.data);
    return { label: `Verifier · ${label}`, tone };
  }
  if (state.error) return { label: 'Verifier · 읽기 실패', tone: 'danger' };
  return { label: 'Verifier', tone: 'muted' };
}

export function VerifierSidebarItem({ store, theme, currentScreen, openScreen }: PluginSidebarItemProps & { store: StatusStore }) {
  const state = useStatus(store, false);
  const { label, tone } = sidebarLabel(state);
  const dot = <View accessibilityElementsHidden style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: toneColor(theme, tone) }} />;
  return (
    <SidebarRow
      icon="ShieldCheck"
      label={label}
      active={currentScreen?.screenId === SCREEN_ID}
      onPress={() => openScreen({ screenId: SCREEN_ID })}
      trailing={dot}
    />
  );
}
