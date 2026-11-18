import type { PluginScreenProps } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/ui';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { StatusRow } from '../shared/status';
import { cardFacts, itemProgress, reportAge, TONE, type BoardColors, type Lane, type Status } from './board-model';

// Better Paseo 카드·레인의 치수(데스크톱/폰): 여백, 제목 14/500, 메타·pill 12/11, 블록 구분선, 버튼 26(폰 32).
export type Theme = PluginScreenProps['theme'];
const HAIR = StyleSheet.hairlineWidth;
const WEB = Platform.OS === 'web';
export const METRICS = {
  desktop: { padH: 12, padTop: 10, padBottom: 12, gap: 10, icon: 14, title: 14, line: 20, small: 12, smallLine: 16, pill: 20, pillText: 11, button: 26 },
  phone: { padH: 14, padTop: 12, padBottom: 14, gap: 12, icon: 18, title: 14, line: 20, small: 12, smallLine: 18, pill: 24, pillText: 11, button: 32 },
};
type Metrics = typeof METRICS.desktop;

/** 상태 표식(16 상자, 12 표식, 1.5 선). 진행은 Better Paseo의 회전 고리를 멈춘 모양으로 그린다. */
export function StatusIcon({ status, theme, size = 16 }: { status: Status; theme: Theme; size?: number }) {
  const { color: key, shape } = TONE[status];
  const color = theme.colors[key];
  const mark = size < 16 ? size * 0.75 : 12 + (size - 16) / 2;
  const stroke = 1.5 * mark / 12;
  const round = { width: mark, height: mark, borderRadius: mark / 2 };
  const box: ViewStyle = { width: size, height: size, alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  const body = shape === 'check' ? <Icon name="CircleCheck" size={size} color={color} />
    : shape === 'hourglass' ? <Icon name="Hourglass" size={mark} color={color} />
    : shape === 'dot' ? <View style={{ width: 8 * mark / 12, height: 8 * mark / 12, borderRadius: 4 * mark / 12, backgroundColor: color }} />
    : shape === 'stopped' ? <View style={{ ...round, backgroundColor: theme.colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: mark * 0.4, height: mark * 0.4, borderRadius: 1, backgroundColor: color }} /></View>
    : shape === 'running' ? <View style={{ ...round, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ ...round, position: 'absolute', borderWidth: stroke, borderColor: color, opacity: 0.3 }} />
        <View style={{ ...round, position: 'absolute', borderWidth: stroke, borderColor: 'transparent', borderTopColor: color, opacity: 0.9 }} />
        <View style={{ width: mark / 2, height: mark / 2, borderRadius: mark / 4, backgroundColor: color }} /></View>
    : <View style={{ ...round, borderWidth: stroke, borderColor: color, borderStyle: shape === 'dashed' ? 'dashed' : 'solid' }} />;
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={box}>{body}</View>;
}

export function Pill({ icon, label, tint, palette, theme, m }: { icon?: string; label: string; tint?: string; palette: BoardColors; theme: Theme; m: Metrics }) {
  const colors = tint ? palette.tint(tint) : { background: palette.pillFill, border: palette.pillBorder };
  const color = theme.colors.foregroundMuted;
  return <View style={{ height: m.pill, maxWidth: '100%', borderRadius: m.pill / 2, borderWidth: HAIR, borderColor: colors.border, backgroundColor: colors.background,
    paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    {icon && <Icon name={icon} size={11} color={tint ?? color} />}
    <Text numberOfLines={1} style={{ fontSize: m.pillText, lineHeight: Math.round(m.pillText * 1.25), color, flexShrink: 1, fontVariant: ['tabular-nums'] }}>{label}</Text>
  </View>;
}

/** Better Paseo의 테두리 버튼: 채우지 않고 0.5 선, 라벨 12/500, 이동 버튼은 ↗로 끝난다. */
export function OpenButton({ row, theme, palette, onOpen, height, primary, grow, onActive, label = '감독 열기' }: {
  row: StatusRow; theme: Theme; palette: BoardColors; onOpen?: () => void; height: number; primary?: boolean; grow?: boolean; label?: string;
  /** hover나 키보드 포커스가 들어오고 나갈 때. 카드는 이 동안 버튼을 숨기지 않는다. */
  onActive?: (active: boolean) => void;
}) {
  const [hovered, setHovered] = useState(false);
  if (!onOpen) return null;
  const disabled = !row.canOpen;
  const color = disabled ? theme.colors.foregroundMuted : theme.colors.foreground;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.title} 감독 열기`} accessibilityState={{ disabled }} disabled={disabled} onPress={onOpen}
    onHoverIn={() => { setHovered(true); onActive?.(true); }} onHoverOut={() => { setHovered(false); onActive?.(false); }}
    onFocus={() => onActive?.(true)} onBlur={() => onActive?.(false)}
    style={{ height, paddingHorizontal: 10, borderRadius: 6, borderWidth: 0.5, borderColor: primary && !disabled ? palette.primaryBorder : palette.buttonBorder,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: disabled ? 0.6 : 1,
      boxShadow: hovered && !disabled ? palette.shadowHover : undefined, ...(grow ? { flexGrow: 1 } : null) }}>
    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '500', color }}>{disabled ? '열 수 없음' : label}</Text>
    {!disabled && <Icon name="ArrowUpRight" size={13} color={color} />}
  </Pressable>;
}

/** 얇은 항목 진행 막대(완료 초록 + 연기 흐림). 카드와 상세가 함께 쓴다. */
export function ProgressBar({ progress, palette, theme }: { progress: ReturnType<typeof itemProgress>; palette: BoardColors; theme: Theme }) {
  if (!progress.total) return null;
  return <View accessibilityRole="progressbar" accessibilityLabel="항목 진행" accessibilityValue={{ min: 0, max: progress.total, now: progress.done, text: progress.label }}
    style={{ height: 3, marginTop: 8, borderRadius: 1.5, overflow: 'hidden', flexDirection: 'row', backgroundColor: palette.pillFill }}>
    <View style={{ width: `${progress.doneRatio * 100}%`, backgroundColor: theme.colors.statusSuccess }} />
    <View style={{ width: `${progress.deferredRatio * 100}%`, backgroundColor: theme.colors.foregroundMuted }} />
  </View>;
}
/** Better Paseo 권한 요청 구역의 머리: 양쪽 경고색 선 사이의 라벨. */
export function WarningRule({ label, palette, theme }: { label: string; palette: BoardColors; theme: Theme }) {
  const line = <View style={{ flex: 1, height: 0.5, backgroundColor: palette.rule }} />;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    {line}<Text style={{ fontSize: 11, lineHeight: 16, fontWeight: '600', color: theme.colors.statusWarning }}>{label}</Text>{line}
  </View>;
}

export interface CardProps {
  row: StatusRow; now: number; theme: Theme; palette: BoardColors; compact: boolean; selected?: boolean;
  onSelect?: () => void; onOpen?: () => void;
}
/**
 * 카드: 제목 행(상태 표식 + 제목 2줄) → 현황 한 줄(headline, 없으면 턴 종료) → pill 행 → 진행 막대 → 구분선 블록(비고)
 * → 결정 구역(경고색 구분선 + 첫 질문) → 하단(보고 경과, 데스크톱은 hover·포커스·선택 때만 감독 열기).
 */
export function Card({ row, now, theme, palette, compact, selected, onSelect, onOpen }: CardProps) {
  const m = compact ? METRICS.phone : METRICS.desktop;
  const facts = cardFacts(row);
  const { colors } = theme;
  const [hover, setHover] = useState({ body: false, foot: false, button: false });
  const [focused, setFocused] = useState(false);
  const hovered = hover.body || hover.foot || hover.button;
  const showOpen = compact || !WEB || hovered || focused || !!selected;
  const text = (size: number, line: number, color: string, weight: '400' | '500' | '600' = '400') => ({ fontSize: size, lineHeight: line, color, fontWeight: weight });
  const block: ViewStyle = { marginTop: m.gap, paddingTop: m.gap, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: 'row', gap: 6 };
  const iconCell: ViewStyle = { width: m.icon, height: m.smallLine, alignItems: 'center', justifyContent: 'center' };
  const select = (part: 'body' | 'foot') => ({
    onPress: onSelect, onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    onHoverIn: () => setHover(was => ({ ...was, [part]: true })), onHoverOut: () => setHover(was => ({ ...was, [part]: false })),
  });
  return <View style={{ borderRadius: 8, borderWidth: HAIR, backgroundColor: selected ? palette.current : palette.card,
    borderColor: selected ? palette.currentBorder : hovered ? palette.borderStrong : colors.border,
    boxShadow: hovered ? palette.shadowHover : palette.shadow,
    ...(WEB ? { outlineStyle: focused ? 'solid' : undefined, outlineWidth: 1, outlineColor: colors.foregroundMuted, outlineOffset: 2 } : null) } as ViewStyle}>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityHint="상세를 엽니다"
      accessibilityLabel={`${row.title}, ${row.status}, ${facts.progress.label}`} {...select('body')}
      style={{ paddingHorizontal: m.padH, paddingTop: m.padTop, ...(WEB ? { outlineStyle: 'none' } : null) } as ViewStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ width: m.icon, height: m.line, alignItems: 'center', justifyContent: 'center' }}><StatusIcon status={row.status} theme={theme} size={m.icon} /></View>
        <Text numberOfLines={2} style={[text(m.title, m.line, colors.foreground, '500'), { flex: 1, minWidth: 0 }]}>{row.title}</Text>
      </View>
      {facts.turn && <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        <View style={iconCell}><Icon name={facts.turn.icon} size={12} color={colors.foregroundMuted} /></View>
        <Text numberOfLines={3} style={[text(13, 18, colors.foreground), { flex: 1 }]}>{facts.turn.text}</Text>
      </View>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 6, marginTop: m.gap }}>
        <Pill label={row.status} theme={theme} palette={palette} m={m} tint={row.status === '진행' || row.status === '대기' || row.status === '알 수 없음' ? undefined : colors[TONE[row.status].color]} />
        {facts.pills.map(pill => <Pill key={pill.key} icon={pill.icon} label={pill.label} tint={pill.tone && colors[pill.tone]} theme={theme} palette={palette} m={m} />)}
      </View>
      <ProgressBar progress={facts.progress} palette={palette} theme={theme} />
      {facts.note && <View style={block}>
        <View style={iconCell}><Icon name={facts.note.danger ? 'CircleX' : 'Info'} size={12} color={facts.note.danger ? colors.statusDanger : colors.foregroundMuted} /></View>
        <Text numberOfLines={3} style={[text(m.small, m.smallLine, facts.note.danger ? colors.statusDanger : colors.foregroundMuted), { flex: 1 }]}>{facts.note.text}</Text>
      </View>}
      {facts.decision && <View style={{ marginTop: m.gap, gap: 8 }}>
        <WarningRule label={`결정 대기${facts.decision.count > 1 ? ` · ${facts.decision.count}개` : ''}`} palette={palette} theme={theme} />
        <Text numberOfLines={2} style={text(m.title, m.line, colors.foreground, '500')}>{facts.decision.question}</Text>
      </View>}
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: m.button, marginTop: m.gap - 4, paddingHorizontal: m.padH, paddingBottom: m.padBottom - 4 }}>
      <Pressable accessible={false} focusable={false} {...select('foot')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch' }}>
        <View style={{ width: m.icon, alignItems: 'center' }}><Icon name="Clock" size={12} color={colors.foregroundMuted} /></View>
        <Text style={[text(m.small, m.smallLine, colors.foregroundMuted), { fontVariant: ['tabular-nums'] }]}>{reportAge(row, now)}</Text>
      </Pressable>
      {/* 숨어 있어도 자리를 지켜 hover 때 아무것도 움직이지 않는다. */}
      <View style={{ opacity: showOpen ? 1 : 0 }} pointerEvents={showOpen ? 'auto' : 'none'}>
        <OpenButton row={row} theme={theme} palette={palette} onOpen={onOpen} height={m.button}
          onActive={value => setHover(was => ({ ...was, button: value }))} />
      </View>
    </View>
  </View>;
}

/** Better Paseo의 빈 상태: 점선 hairline 상자, 아이콘 20, 제목, 흐린 안내. */
export function LaneEmpty({ lane, theme, narrow }: { lane: Lane; theme: Theme; narrow?: boolean }) {
  const { colors } = theme;
  return <View style={{ alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: narrow ? 16 : 20, marginTop: narrow ? 28 : 12,
    borderWidth: HAIR, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8 }}>
    <Icon name={lane.empty.icon} size={20} color={colors.foregroundMuted} />
    <Text style={{ alignSelf: 'stretch', textAlign: 'center', fontSize: narrow ? 14 : 16, fontWeight: '600', color: colors.foreground }}>{lane.empty.title}</Text>
    <Text style={{ alignSelf: 'stretch', textAlign: 'center', fontSize: 12, lineHeight: 16, color: colors.foregroundMuted }}>{lane.empty.hint}</Text>
  </View>;
}
