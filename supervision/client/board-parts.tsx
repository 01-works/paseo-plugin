import type { PluginScreenProps } from '@getpaseo/plugin/client';
import { Icon } from '@getpaseo/plugin/client/ui';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Report } from '../shared/report';
import { elapsed, type StatusRow } from '../shared/status';
import { ITEM, itemProgress, resumeText, TONE, turnEndText, type Status } from './board-model';

type Theme = PluginScreenProps['theme'];
export interface CardProps {
  row: StatusRow; now: number; theme: Theme; selected?: boolean;
  onSelect?: () => void; onOpen?: () => void;
}

/** 상태 표식. Better Paseo처럼 View로 그리며 모양으로도 구분한다. 스크린 리더는 옆의 글자를 읽는다. */
export function Mark({ status, theme, size = 12 }: { status: Status; theme: Theme; size?: number }) {
  const { color, shape } = TONE[status];
  const tone = theme.colors[color];
  const round = { width: size, height: size, borderRadius: size / 2 };
  const style = shape === 'dot' ? { ...round, backgroundColor: tone }
    : shape === 'square' ? { width: size - 2, height: size - 2, borderRadius: 2, backgroundColor: tone }
    : shape === 'arc' ? { ...round, borderWidth: 2, borderColor: theme.colors.border, borderTopColor: tone, borderRightColor: tone }
    : { ...round, borderWidth: 2, borderColor: tone };
  return <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <View style={style} />
  </View>;
}

export function StatusChip({ status, theme }: { status: Status; theme: Theme }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2 }}>
    <Mark status={status} theme={theme} size={10} />
    <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{status}</Text>
  </View>;
}

export function Progress({ report, theme }: { report?: Report; theme: Theme }) {
  const value = itemProgress(report);
  return <View style={{ gap: 4 }}>
    <View accessibilityRole="progressbar" accessibilityLabel="항목 진행" accessibilityValue={{ min: 0, max: value.total, now: value.done, text: value.label }}
      style={{ height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: theme.colors.border }}>
      <View style={{ width: `${value.doneRatio * 100}%`, backgroundColor: theme.colors.statusSuccess }} />
      <View style={{ width: `${value.deferredRatio * 100}%`, backgroundColor: theme.colors.foregroundMuted }} />
    </View>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{value.label}</Text>
  </View>;
}

export function OpenButton({ row, theme, onOpen }: { row: StatusRow; theme: Theme; onOpen?: () => void }) {
  if (!onOpen) return null;
  const disabled = !row.canOpen;
  const color = disabled ? theme.colors.foregroundMuted : theme.colors.foreground;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${row.title} 감독 열기`} accessibilityState={{ disabled }} disabled={disabled} onPress={onOpen}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
      borderWidth: 1, borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.surface2 : 'transparent', opacity: disabled ? 0.6 : 1 })}>
    <Text style={{ color, fontSize: 13 }}>{disabled ? '열 수 없음' : '감독 열기'}</Text>
    {!disabled && <Icon name="ArrowUpRight" size={14} color={color} />}
  </Pressable>;
}

const muted = (theme: Theme, size = 13) => ({ color: theme.colors.foregroundMuted, fontSize: size });

/** 카드 본문(선택)과 하단 열기 버튼을 형제로 두어 버튼이 겹치지 않게 한다. */
export function Card({ row, now, theme, selected, onSelect, onOpen }: CardProps) {
  const report = row.state?.report;
  const resume = resumeText(report);
  const decision = report?.decisions[0];
  const fg = theme.colors.foreground;
  return <View style={{ borderRadius: 8, borderWidth: 1, borderColor: selected ? theme.colors.accent : theme.colors.border, backgroundColor: theme.colors.surface1 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityHint="상세를 엽니다"
      accessibilityLabel={`${row.title}, ${row.status}, ${itemProgress(report).label}`} onPress={onSelect}
      style={({ pressed }) => ({ padding: 12, gap: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: pressed ? theme.colors.surface2 : 'transparent' })}>
      <StatusChip status={row.status} theme={theme} />
      <Text numberOfLines={2} style={{ color: fg, fontSize: 15, fontWeight: '600' }}>{row.title}</Text>
      <Progress report={report} theme={theme} />
      <Text numberOfLines={2} style={{ color: fg, fontSize: 13 }}>{turnEndText(report)}</Text>
      {report?.turnEnd.kind === 'waiting' && resume && <Text numberOfLines={1} style={muted(theme)}>재개: {resume}</Text>}
      {decision && <Text numberOfLines={2} style={{ color: fg, fontSize: 13 }}>
        결정{report!.decisions.length > 1 ? ` ${report!.decisions.length}개` : ''} · {decision.question}
      </Text>}
      {row.note && <Text numberOfLines={2} style={muted(theme, 12)}>{row.note}</Text>}
    </Pressable>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingBottom: 10 }}>
      <Text style={muted(theme, 12)}>보고 {row.state ? elapsed(row.state.reportedAt, now) : '없음'}</Text>
      <OpenButton row={row} theme={theme} onOpen={onOpen} />
    </View>
  </View>;
}

function Section({ title, theme, children }: { title: string; theme: Theme; children: ReactNode }) {
  return <View style={{ gap: 8 }}>
    <Text accessibilityRole="header" style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: '600' }}>{title}</Text>
    {children}
  </View>;
}

/** 상세 사이드바·시트 공통 본문. 결정 응답 버튼은 범위 밖이라 두지 않는다. */
export function Detail({ row, now, theme, onOpen }: Omit<CardProps, 'selected' | 'onSelect'>) {
  const report = row.state?.report;
  const resume = resumeText(report);
  const fg = { color: theme.colors.foreground, fontSize: 14 };
  return <View style={{ gap: 20 }}>
    <View style={{ gap: 8 }}>
      <StatusChip status={row.status} theme={theme} />
      <Text selectable style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: '600' }}>{row.title}</Text>
      <Text style={muted(theme)}>보고 {row.state ? elapsed(row.state.reportedAt, now) : '없음'} · 감독 {row.agent?.status ?? '조회 불가'}</Text>
      <View style={{ flexDirection: 'row' }}><OpenButton row={row} theme={theme} onOpen={onOpen} /></View>
    </View>
    <Section title="턴 종료" theme={theme}>
      <Text selectable style={fg}>{turnEndText(report)}</Text>
      {resume && <Text selectable style={muted(theme)}>재개 조건: {resume}</Text>}
    </Section>
    {!!report?.decisions.length && <Section title={`미결 결정 ${report.decisions.length}개`} theme={theme}>
      {report.decisions.map((decision, index) => <View key={index} style={{ gap: 4, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border }}>
        <Text selectable style={{ ...fg, fontWeight: '600' }}>{decision.question}</Text>
        {decision.options.map((option, at) => <Text key={at} selectable style={fg}>· {option}{option === decision.recommendation ? ' (권장)' : ''}</Text>)}
        <Text selectable style={muted(theme)}>권장안: {decision.recommendation}</Text>
        <Text selectable style={muted(theme)}>영향: {decision.impact}</Text>
      </View>)}
    </Section>}
    <Section title="항목" theme={theme}>
      <Progress report={report} theme={theme} />
      {report?.items.map(item => <View key={item.id} style={{ gap: 2 }}>
        <Text selectable style={fg}>[{ITEM[item.status]}] {item.summary}</Text>
        <Text selectable style={muted(theme, 12)}>{item.id}{item.evidence ? ` · 근거: ${item.evidence}` : ''}{item.deferredBy ? ` · 연기 출처: ${item.deferredBy}` : ''}</Text>
      </View>)}
    </Section>
    {row.note && <Section title="비고" theme={theme}><Text selectable style={fg}>{row.note}</Text></Section>}
    <Text selectable style={muted(theme, 12)}>기록: {row.key}</Text>
  </View>;
}
