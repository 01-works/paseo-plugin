import { Icon } from '@getpaseo/plugin/client/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { StatusRow } from '../shared/status';
import { ITEM, itemProgress, reportAge, resumeText, turnEndText, type BoardColors } from './board-model';
import { OpenButton, StatusIcon, type Theme } from './board-parts';

const HAIR = StyleSheet.hairlineWidth;
const PAD = 12;

/** 머리 아래 구역: hairline 구분선, 12/500 흐린 제목과 오른쪽 요약(Better Paseo 상세 구역의 머리). 접기는 두지 않는다. */
function Section({ title, summary, theme, children }: { title: string; summary?: string; theme: Theme; children: ReactNode }) {
  const muted = theme.colors.foregroundMuted;
  return <View>
    <View style={{ height: HAIR, marginHorizontal: PAD, backgroundColor: theme.colors.border }} />
    <View style={{ paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 10, gap: 6 }}>
      <View style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: 12, fontWeight: '500', color: muted }}>{title}</Text>
        <View style={{ flex: 1 }} />
        {summary && <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, color: muted, fontVariant: ['tabular-nums'] }}>{summary}</Text>}
      </View>
      {children}
    </View>
  </View>;
}

/**
 * 상세 카드: 상태 행(표식·상태·보고 경과·닫기) → 제목 14/600 → chip 행 → 감독 열기 → 주 블록
 * (미결 결정이 있으면 경고색 구분선 아래 결정, 없으면 턴 종료 요약) → 구역(턴 종료·항목·비고·기록).
 * 사이드바에서는 둥근 12 카드로 감싸고, host Modal 안에서는 틀 없이 그린다. 결정 응답 버튼은 범위 밖.
 */
export function Detail({ row, now, theme, palette, onOpen, onClose, framed }: {
  row: StatusRow; now: number; theme: Theme; palette: BoardColors; onOpen?: () => void; onClose?: () => void; framed?: boolean;
}) {
  const { colors } = theme;
  const report = row.state?.report;
  const progress = itemProgress(report);
  const resume = resumeText(report);
  const body = { fontSize: 12, lineHeight: 18, color: colors.foreground };
  const muted = { fontSize: 12, lineHeight: 16, color: colors.foregroundMuted };
  const chip = (label: string, icon?: string) => <View key={label} style={{ height: 20, borderRadius: 10, borderWidth: HAIR, borderColor: palette.pillBorder,
    backgroundColor: palette.pillFill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    {icon && <Icon name={icon} size={11} color={colors.foregroundMuted} />}
    <Text numberOfLines={1} style={{ fontSize: 11, color: colors.foregroundMuted, fontVariant: ['tabular-nums'] }}>{label}</Text>
  </View>;
  const turn = <View style={{ gap: 4 }}>
    <Text selectable style={body}>{turnEndText(report)}</Text>
    {resume && <Text selectable style={muted}>재개 조건: {resume}</Text>}
  </View>;
  const decisions = report?.decisions ?? [];
  const frame: ViewStyle = framed ? { backgroundColor: palette.card, borderWidth: HAIR, borderColor: colors.border, borderRadius: 12, boxShadow: palette.shadow } : {};
  return <View style={[frame, { paddingBottom: 4 }]}>
    <View style={{ paddingHorizontal: PAD, paddingTop: 8 }}>
      <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StatusIcon status={row.status} theme={theme} size={14} />
        <Text style={{ fontSize: 12, fontWeight: '500', color: colors.foreground }}>{row.status}</Text>
        <Text style={muted}>· {reportAge(row, now)}</Text>
        <View style={{ flex: 1 }} />
        {onClose && <Pressable accessibilityRole="button" accessibilityLabel="상세 닫기" onPress={onClose}
          style={({ pressed }) => ({ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? palette.pillFill : 'transparent' })}>
          <Icon name="X" size={16} color={colors.foregroundMuted} />
        </Pressable>}
      </View>
      <Text selectable style={{ marginTop: 2, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.foreground }}>{row.title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {chip(`항목 ${progress.done}/${progress.total}`, 'ListTodo')}
        {progress.deferred > 0 && chip(`연기 ${progress.deferred}`, 'CircleSlash')}
        {chip(`감독 ${row.agent?.status ?? '조회 불가'}`, 'Bot')}
      </View>
      {onOpen && <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <OpenButton row={row} theme={theme} palette={palette} onOpen={onOpen} height={34} primary grow />
      </View>}
      <View style={{ marginTop: 12, marginBottom: 10 }}>
        {decisions.length ? <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: palette.rule }} />
            <Text style={{ fontSize: 11, lineHeight: 16, fontWeight: '600', color: colors.statusWarning }}>미결 결정 {decisions.length}개</Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: palette.rule }} />
          </View>
          {decisions.map((decision, index) => <View key={index} style={{ gap: 4 }}>
            <Text selectable style={{ fontSize: 14, lineHeight: 20, fontWeight: '500', color: colors.foreground }}>{decision.question}</Text>
            {decision.options.map((option, at) => <Text key={at} selectable style={body}>
              · {option}{option === decision.recommendation ? <Text style={{ color: colors.statusWarning }}> (권장)</Text> : null}
            </Text>)}
            <Text selectable style={muted}>권장안: {decision.recommendation}</Text>
            <Text selectable style={muted}>영향: {decision.impact}</Text>
          </View>)}
        </View> : <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: palette.panel, paddingVertical: 7, paddingHorizontal: 12 }}>{turn}</View>}
      </View>
    </View>
    {decisions.length > 0 && <Section title="턴 종료" theme={theme}>{turn}</Section>}
    <Section title="항목" summary={progress.label} theme={theme}>
      {progress.total > 0 && <View accessibilityRole="progressbar" accessibilityLabel="항목 진행"
        accessibilityValue={{ min: 0, max: progress.total, now: progress.done, text: progress.label }}
        style={{ height: 3, borderRadius: 1.5, overflow: 'hidden', flexDirection: 'row', backgroundColor: palette.pillFill, marginBottom: 4 }}>
        <View style={{ width: `${progress.doneRatio * 100}%`, backgroundColor: colors.statusSuccess }} />
        <View style={{ width: `${progress.deferredRatio * 100}%`, backgroundColor: colors.foregroundMuted }} />
      </View>}
      {report?.items.map(item => <View key={item.id} style={{ flexDirection: 'row', gap: 6, minHeight: 30, paddingVertical: 4 }}>
        <View style={{ width: 14, height: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={ITEM[item.status].icon} size={12} color={item.status === 'done' ? colors.statusSuccess : colors.foregroundMuted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text selectable style={body}><Text style={{ color: colors.foregroundMuted }}>{ITEM[item.status].label} · </Text>{item.summary}</Text>
          <Text selectable style={muted}>{item.id}{item.evidence ? ` · 근거: ${item.evidence}` : ''}{item.deferredBy ? ` · 연기 출처: ${item.deferredBy}` : ''}</Text>
        </View>
      </View>)}
      {!report && <Text style={muted}>항목 보고 없음</Text>}
    </Section>
    {row.note && <Section title="비고" theme={theme}><Text selectable style={{ ...body, color: row.status === '멈춤' ? colors.statusDanger : colors.foreground }}>{row.note}</Text></Section>}
    <Section title="기록" theme={theme}><Text selectable style={muted}>{row.key}</Text></Section>
  </View>;
}
