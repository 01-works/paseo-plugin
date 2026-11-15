import type { PluginTheme } from '@getpaseo/plugin';
import { openExternalUrl, type PluginScreenProps } from '@getpaseo/plugin/client';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Beat, Failure, Lane, Run, VerifierStatus, WindowStats } from '../shared/contracts';
import { hostIndicators } from '../shared/host';
import { attentionItems, devState, footerLine, formatClock, overallLine, redIssueOf, type AttentionItem, type FailureGroup } from '../shared/overview';
import { estimateRun, formatDuration, isSlow, prNumber, shortSha } from '../shared/summary';
import { toneColor } from './sidebar';
import { useStatus, type StatusStore, type StoreState } from './store';

export { formatClock } from '../shared/overview';

const RECENT_LIST = 10;
const BAR_MAX_HEIGHT = 28;

function makeStyles(theme: PluginTheme, compact: boolean) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.surface0 },
    content: { padding: compact ? 16 : 24, gap: compact ? 12 : 16 },
    card: { backgroundColor: theme.colors.surface1, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, padding: compact ? 12 : 16, gap: 8 },
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, flexWrap: 'wrap' as const },
    title: { color: theme.colors.foreground, fontWeight: '600' as const },
    text: { color: theme.colors.foreground },
    muted: { color: theme.colors.foregroundMuted },
    mono: { color: theme.colors.foreground, fontFamily: 'Menlo' },
    link: { color: theme.colors.accent, fontFamily: 'Menlo' },
    button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface2 },
    buttonText: { color: theme.colors.foreground },
    cell: { width: 44, height: 26, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 4, backgroundColor: theme.colors.surface2 },
    laneName: { color: theme.colors.foreground, width: compact ? 150 : 210 },
    progressCell: { width: compact ? 10 : 12, height: 14, borderRadius: 2 },
    tab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    tip: { position: 'absolute' as const, top: 22, left: -8, width: compact ? 240 : 320, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2, zIndex: 10, elevation: 6 },
  };
}

type Styles = ReturnType<typeof makeStyles>;

function Card({ styles, title, trailing, children }: { styles: Styles; title: string; trailing?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>{title}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

/**
 * 설명을 화면에 늘 띄우지 않고 ⓘ 아이콘 뒤에 둔다. 데스크톱·웹은 마우스를 올리면, 터치 기기는 누르면 보인다.
 * 말풍선은 아이콘 아래에 겹쳐 띄워 주변 배치를 밀지 않는다.
 */
export function InfoTip({ text, styles, theme }: { text: string; styles: Styles; theme: PluginTheme }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || pinned;
  return (
    <View style={{ position: 'relative', zIndex: open ? 10 : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="설명"
        accessibilityHint={text}
        accessibilityState={{ expanded: open }}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onPress={() => setPinned(!pinned)}
        hitSlop={8}
      >
        <Text style={{ color: open ? theme.colors.accent : theme.colors.foregroundMuted }}>ⓘ</Text>
      </Pressable>
      {open ? (
        <View style={styles.tip} pointerEvents="none">
          <Text style={styles.text}>{text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <View accessibilityElementsHidden style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

function Sha({ sha, repoUrl, styles }: { sha: string; repoUrl: string | null; styles: Styles }) {
  if (!repoUrl) return <Text style={styles.mono}>{shortSha(sha)}</Text>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`커밋 ${shortSha(sha)}를 GitHub에서 열기`} onPress={() => void openExternalUrl(`${repoUrl}/commit/${sha}`)}>
      <Text style={styles.link}>{shortSha(sha)}</Text>
    </Pressable>
  );
}

function GithubLink({ kind, number, repoUrl, styles }: { kind: 'pull' | 'issues'; number: string | number; repoUrl: string | null; styles: Styles }) {
  const label = kind === 'pull' ? `PR ${number}` : `이슈 ${number}`;
  if (!repoUrl) return <Text style={styles.mono}>#{number}</Text>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${label}를 GitHub에서 열기`} onPress={() => void openExternalUrl(`${repoUrl}/${kind}/${number}`)}>
      <Text style={styles.link}>#{number}</Text>
    </Pressable>
  );
}

/** 커밋 제목. 끝의 `(#123)`은 PR 링크로 따로 보여 준다. */
function Subject({ subject, repoUrl, styles }: { subject: string | null; repoUrl: string | null; styles: Styles }) {
  if (!subject) return null;
  const pr = prNumber(subject);
  const title = pr ? subject.replace(/\s*\(#\d+\)\s*$/, '') : subject;
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { flexShrink: 1 }]} numberOfLines={1}>{title}</Text>
      {pr ? <GithubLink kind="pull" number={pr} repoUrl={repoUrl} styles={styles} /> : null}
    </View>
  );
}

const LANE_MARK: Record<Lane['state'], string> = { passed: '✓', failed: '✗', running: '●', pending: '○' };

function laneColor(theme: PluginTheme, state: Lane['state']) {
  if (state === 'passed') return theme.colors.statusSuccess;
  if (state === 'failed') return theme.colors.statusDanger;
  if (state === 'running') return theme.colors.accent;
  return theme.colors.foregroundMuted;
}

function recurrence(streak: number, firstSha: string, firstAt: string | null) {
  return streak > 1 ? `${streak}회 연속 (처음 ${shortSha(firstSha)}${firstAt ? ` ${formatClock(firstAt)}` : ''})` : '이번에 처음';
}

/** 기록 안에서 펼친 실행의 실패 분류. 연결된 red 이슈가 있으면 함께 보여 준다. */
function FailureLines({ failures, status, styles }: { failures: Failure[]; status: VerifierStatus; styles: Styles }) {
  if (failures.length === 0) return null;
  return (
    <>
      {failures.map(failure => {
        const issue = redIssueOf(status, failure.signature);
        return (
          <View key={`${failure.lane}-${failure.signature}`} style={styles.row}>
            <Text style={[styles.muted, { flexShrink: 1 }]} selectable>
              {failure.lane}: {failure.classification} · {failure.reason} · {failure.signature.slice(0, 12)} · {recurrence(failure.streak, failure.firstSha, failure.firstAt)}
            </Text>
            {issue !== null ? <GithubLink kind="issues" number={issue} repoUrl={status.repoUrl} styles={styles} /> : null}
          </View>
        );
      })}
    </>
  );
}

// ── 1. 요약 ───────────────────────────────────────────────────────────

function LaneProgress({ lanes, styles, theme }: { lanes: Lane[]; styles: Styles; theme: PluginTheme }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {lanes.map(lane => (
        <View
          key={lane.name}
          style={[
            styles.progressCell,
            lane.state === 'pending'
              ? { backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border }
              : { backgroundColor: laneColor(theme, lane.state) },
          ]}
        />
      ))}
    </View>
  );
}

function CurrentLaneDetails({ status, now, styles, theme }: { status: VerifierStatus; now: number; styles: Styles; theme: PluginTheme }) {
  const current = status.current;
  if (!current) return null;
  const started = current.startedAt ? Date.parse(current.startedAt) : NaN;
  const estimate = estimateRun(status, now);
  return (
    <View style={{ gap: 4, paddingLeft: 4 }}>
      <Subject subject={current.subject} repoUrl={status.repoUrl} styles={styles} />
      {Number.isFinite(started) ? (
        <Text style={styles.muted}>
          {formatClock(started, now)} 시작 · {formatDuration((now - started) / 1000)}째
        </Text>
      ) : null}
      {current.lanes.map(lane => {
        const median = status.laneMedians[lane.name];
        const slow = isSlow(lane.state === 'running' ? estimate.runningLaneSeconds : lane.seconds, median);
        const usual = median !== undefined ? `평소 ${formatDuration(median)}` : null;
        let detail: string | null;
        if (lane.state === 'running') detail = [estimate.runningLaneSeconds !== null ? `약 ${formatDuration(estimate.runningLaneSeconds)}째` : null, usual].filter(Boolean).join(' · ');
        else if (lane.state === 'pending') detail = usual;
        // 끝난 lane: 시간이 없어도 괄호 설명(시간 초과 등)은 보여 준다.
        else detail = [lane.note === 'timed out' ? '시간 초과' : lane.note, lane.seconds !== null ? formatDuration(lane.seconds) : null, slow && usual ? usual : null].filter(Boolean).join(' · ') || null;
        return (
          <View key={lane.name} style={styles.row}>
            <Text style={{ color: laneColor(theme, lane.state) }}>{LANE_MARK[lane.state]}</Text>
            <Text style={lane.state === 'pending' ? styles.muted : styles.text}>{lane.name}</Text>
            {detail ? <Text style={{ color: slow ? theme.colors.statusWarning : theme.colors.foregroundMuted }}>{detail}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function CurrentRunLine({ status, now, styles, theme }: { status: VerifierStatus; now: number; styles: Styles; theme: PluginTheme }) {
  const [open, setOpen] = useState(false);
  const current = status.current;
  if (!current) return <Text style={styles.muted}>지금 실행 없음</Text>;
  if (current.phase === 'waiting-lock') {
    return (
      <View style={styles.row}>
        <Text style={styles.text}>지금</Text>
        <Sha sha={current.sha} repoUrl={status.repoUrl} styles={styles} />
        <Text style={styles.muted}>heavy lock 대기{current.startedAt ? ` · ${formatClock(current.startedAt, now)}부터` : ''}</Text>
      </View>
    );
  }
  const done = current.lanes.filter(lane => lane.state === 'passed' || lane.state === 'failed').length;
  const estimate = estimateRun(status, now);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <Text style={styles.text}>지금</Text>
        <Sha sha={current.sha} repoUrl={status.repoUrl} styles={styles} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`lane 진행 ${done}/${current.lanes.length}, 누르면 lane별 상세를 ${open ? '접습니다' : '펼칩니다'}`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          hitSlop={6}
          style={styles.row}
        >
          <LaneProgress lanes={current.lanes} styles={styles} theme={theme} />
          <Text style={styles.text}>{done}/{current.lanes.length}</Text>
          <Text style={styles.muted}>{open ? '▾' : '▸'}</Text>
        </Pressable>
        {estimate.endAt ? <Text style={styles.muted}>예상 종료 {formatClock(estimate.endAt, now)}</Text> : null}
        {estimate.endAt ? (
          <InfoTip
            styles={styles}
            theme={theme}
            text={estimate.perLane
              ? '남은 lane의 평소 시간(최근 20회 통과 시간의 중앙값)을 더한 값입니다. 진행 막대를 누르면 lane별 상세가 펼쳐집니다.'
              : 'lane별 기록이 부족해 최근 실행 전체 시간의 중앙값으로 냈습니다. 진행 막대를 누르면 lane별 상세가 펼쳐집니다.'}
          />
        ) : null}
      </View>
      {open ? <CurrentLaneDetails status={status} now={now} styles={styles} theme={theme} /> : null}
    </View>
  );
}

function PromotionLine({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const github = status.github;
  if (!github) return null;
  return (
    <View style={styles.row}>
      {github.candidate ? (
        <>
          <Text style={styles.text}>승격 후보</Text>
          <Sha sha={github.candidate.sha} repoUrl={status.repoUrl} styles={styles} />
          <Text style={styles.muted}>main보다 {github.candidate.aheadOfMain}커밋 앞섬 ·</Text>
        </>
      ) : (
        <Text style={styles.muted}>승격 후보 없음 ·</Text>
      )}
      <Text style={styles.muted}>dev</Text>
      <Sha sha={github.devSha} repoUrl={status.repoUrl} styles={styles} />
      <Text style={styles.muted}>{devState(status)} · main보다 {github.devAheadOfMain}커밋 앞섬</Text>
      <InfoTip styles={styles} theme={theme} text={`승격 후보는 main에 아직 없는, verifier를 통과한 가장 최근 SHA입니다. 마이그레이션 여부와 승격 절차는 release 세션에서 판단합니다. GitHub 정보는 ${formatClock(github.fetchedAt)} 기준이며 10분마다 갱신합니다.`} />
    </View>
  );
}

function SummaryCard({ state, status, now, onRefresh, styles, theme }: { state: StoreState; status: VerifierStatus | undefined; now: number; onRefresh: () => void; styles: Styles; theme: PluginTheme }) {
  const overall = status ? overallLine(status, now) : null;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {overall ? <Dot color={toneColor(theme, overall.tone)} /> : null}
        <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>{overall?.label ?? (state.error ? '읽기 실패' : '불러오는 중…')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="지금 다시 읽기" disabled={state.loading} onPress={onRefresh} style={styles.button}>
          <Text style={styles.buttonText}>{state.loading ? '읽는 중…' : '새로고침'}</Text>
        </Pressable>
      </View>
      {state.error ? <Text style={{ color: theme.colors.statusDanger }}>{state.error}</Text> : null}
      {status ? (
        <>
          <CurrentRunLine status={status} now={now} styles={styles} theme={theme} />
          <PromotionLine status={status} styles={styles} theme={theme} />
        </>
      ) : null}
    </View>
  );
}

// ── 2. 확인할 것 ──────────────────────────────────────────────────────

const WHERE_LABEL: Record<FailureGroup['where'], string> = { current: '지금 실행', last: '마지막 실행', both: '지금·마지막 실행' };

function FailureItem({ group, status, styles, theme }: { group: FailureGroup; status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
        <Dot color={theme.colors.statusDanger} size={8} />
        <Text style={styles.title}>{group.lanes.join(', ')}</Text>
        <Text style={styles.text}>{group.streak > 1 ? `${group.streak}회 연속` : '이번에 처음'}</Text>
        <Text style={styles.muted}>· {WHERE_LABEL[group.where]}</Text>
      </View>
      <View style={[styles.row, { paddingLeft: 16 }]}>
        <Text style={styles.muted}>처음</Text>
        <Sha sha={group.firstSha} repoUrl={status.repoUrl} styles={styles} />
        {group.firstAt ? <Text style={styles.muted}>{formatClock(group.firstAt)}</Text> : null}
        {group.firstPr ? <GithubLink kind="pull" number={group.firstPr} repoUrl={status.repoUrl} styles={styles} /> : null}
        <Text style={styles.muted}>· red 이슈</Text>
        {group.issue !== null ? (
          <GithubLink kind="issues" number={group.issue} repoUrl={status.repoUrl} styles={styles} />
        ) : (
          <Text style={styles.muted}>{group.issueKnown ? '없음' : '확인 안 됨'}</Text>
        )}
      </View>
      <Text style={[styles.muted, { paddingLeft: 16 }]} selectable>
        {group.classification ? `${group.classification} · ${group.reason} · ${group.signature?.slice(0, 12)}` : '실패 분류 기록 없음'}
      </Text>
    </View>
  );
}

function NoticeItem({ item, styles, theme }: { item: Extract<AttentionItem, { kind: 'notice' }>; styles: Styles; theme: PluginTheme }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
        <Dot color={toneColor(theme, item.tone)} size={8} />
        <Text style={[styles.text, { flexShrink: 1 }]}>{item.title}</Text>
        {item.help ? <InfoTip text={item.help} styles={styles} theme={theme} /> : null}
      </View>
      {item.lines.map(line => (
        <Text key={line} style={[styles.muted, { paddingLeft: 16 }]} selectable>{line}</Text>
      ))}
    </View>
  );
}

function AttentionCard({ status, now, styles, theme }: { status: VerifierStatus; now: number; styles: Styles; theme: PluginTheme }) {
  const items = attentionItems(status, now);
  return (
    <Card styles={styles} title="확인할 것" trailing={items.length > 0 ? <Text style={styles.muted}>{items.length}건</Text> : null}>
      {items.length === 0 ? <Text style={styles.muted}>확인할 것 없음</Text> : null}
      {items.map(item =>
        item.kind === 'failure'
          ? <FailureItem key={item.key} group={item.group} status={status} styles={styles} theme={theme} />
          : <NoticeItem key={item.key} item={item} styles={styles} theme={theme} />,
      )}
    </Card>
  );
}

// ── 3. 기록 ───────────────────────────────────────────────────────────

function beatColor(theme: PluginTheme, status: Beat['status'] | 'running') {
  if (status === 'success') return theme.colors.statusSuccess;
  if (status === 'failure') return theme.colors.statusDanger;
  if (status === 'running') return theme.colors.accent;
  return theme.colors.foregroundMuted;
}

const BEAT_LABEL: Record<Beat['status'], string> = { success: '통과', failure: '실패', none: '연기' };

/** 최근 요약 기록을 얇은 막대 줄로 보여 준다(Uptime Kuma 방식). 회색은 연기, 마지막 파랑은 지금 실행이다. */
function BeatStrip({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  // 새 기록이 들어와도 고른 막대가 바뀌지 않게 시각으로 기억한다.
  const [selected, setSelected] = useState<string | null>(null);
  if (status.beats.length === 0 && !status.current) return null;
  const beat = selected !== null ? status.beats.find(item => item.at === selected) : undefined;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        {status.beats.map((item, index) => (
          <Pressable
            key={`${item.at}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`${formatClock(item.at)} ${BEAT_LABEL[item.status]} ${shortSha(item.sha)}`}
            onPress={() => setSelected(selected === item.at ? null : item.at)}
            hitSlop={4}
          >
            <View style={{ width: 8, height: 22, borderRadius: 2, backgroundColor: beatColor(theme, item.status), opacity: !beat || beat.at === item.at ? 1 : 0.45 }} />
          </Pressable>
        ))}
        {status.current ? <View accessibilityLabel="지금 실행" style={{ width: 8, height: 22, borderRadius: 2, backgroundColor: beatColor(theme, 'running') }} /> : null}
        <Text style={styles.muted}> 최근 {status.beats.length}회</Text>
        <InfoTip styles={styles} theme={theme} text="요약 로그의 최근 기록입니다. 초록은 통과, 빨강은 실패, 회색은 연기, 마지막 파랑은 지금 실행입니다. 막대를 누르면 그 기록을 보여 줍니다." />
      </View>
      {beat ? (
        <View style={styles.row}>
          <Text style={{ color: beatColor(theme, beat.status) }}>{BEAT_LABEL[beat.status]}</Text>
          <Text style={styles.muted}>{formatClock(beat.at)}</Text>
          <Sha sha={beat.sha} repoUrl={status.repoUrl} styles={styles} />
          {beat.status === 'none' ? <Text style={styles.muted}>{beat.reason}</Text> : beat.runSeconds !== null ? <Text style={styles.muted}>{formatDuration(beat.runSeconds)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

function RunRow({ run, status, styles, theme }: { run: Run; status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const [open, setOpen] = useState(false);
  const ok = run.status === 'success';
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${formatClock(run.endedAt)} ${ok ? '통과' : '실패'} ${shortSha(run.sha)}, 누르면 ${open ? '접습니다' : '펼칩니다'}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.row}
      >
        <Text style={{ color: ok ? theme.colors.statusSuccess : theme.colors.statusDanger }}>{ok ? '✓' : '✗'}</Text>
        <Text style={styles.muted}>{formatClock(run.endedAt)}</Text>
        <Text style={styles.mono}>{shortSha(run.sha)}</Text>
        {run.runSeconds !== null ? <Text style={styles.muted}>{formatDuration(run.runSeconds)}</Text> : null}
        {run.failedLanes.length > 0 ? <Text style={{ color: theme.colors.statusDanger }}>{run.failedLanes.join(', ')}</Text> : null}
      </Pressable>
      {open ? (
        <View style={{ gap: 2, paddingLeft: 16 }}>
          <View style={styles.row}>
            <Sha sha={run.sha} repoUrl={status.repoUrl} styles={styles} />
            <Text style={styles.muted}>{formatClock(run.endedAt)} 종료</Text>
          </View>
          {run.subject ? <Subject subject={run.subject} repoUrl={status.repoUrl} styles={styles} /> : <Text style={styles.muted}>커밋 제목 없음</Text>}
          {!ok ? <FailureLines failures={run.failures} status={status} styles={styles} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function RecentTab({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  return (
    <View style={{ gap: 8 }}>
      <BeatStrip status={status} styles={styles} theme={theme} />
      {status.lastSuccess ? (
        <View style={styles.row}>
          <Text style={styles.muted}>마지막 통과</Text>
          <Sha sha={status.lastSuccess.sha} repoUrl={status.repoUrl} styles={styles} />
          <Text style={styles.muted}>{formatClock(status.lastSuccess.endedAt)}{status.failureStreak > 0 ? ` · 그 뒤 ${status.failureStreak}회 연속 실패` : ''}</Text>
        </View>
      ) : null}
      {status.recent.length === 0 ? <Text style={styles.muted}>기록이 없습니다.</Text> : null}
      {[...status.recent].reverse().slice(0, RECENT_LIST).map(run => (
        <RunRow key={`${run.endedAt}-${run.sha}`} run={run} status={status} styles={styles} theme={theme} />
      ))}
    </View>
  );
}

/** lane을 행, 실행을 열(최근이 왼쪽)로 둔 표. 칸은 걸린 분이고, 평소보다 오래 걸린 통과는 경고색이다. */
function LaneMatrixTab({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const [selected, setSelected] = useState<{ key: string; lane: string } | null>(null);
  const runs = [...status.recent].reverse();
  if (runs.length === 0) return <Text style={styles.muted}>기록이 없습니다.</Text>;
  // 실패 lane이 다음 실행에서 앞으로 옮겨지므로 순서가 아니라 이름으로 맞춘다.
  const names: string[] = [];
  for (const run of [...runs].reverse()) for (const lane of run.lanes) if (!names.includes(lane.name)) names.push(lane.name);
  const laneOf = (run: Run, name: string) => run.lanes.find(lane => lane.name === name);
  const longest = Math.max(1, ...runs.map(run => run.runSeconds ?? 0));
  const selectedRun = selected ? runs.find(run => `${run.endedAt}-${run.sha}` === selected.key) : undefined;
  const selectedLane = selectedRun && selected ? laneOf(selectedRun, selected.lane) : undefined;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Text style={styles.muted}>최근 {runs.length}회</Text>
        <InfoTip styles={styles} theme={theme} text="열 위 막대는 실행 전체 시간, 칸은 lane이 걸린 분입니다. 빨강은 실패, 노랑은 평소보다 1.5배 넘게 걸린 통과, –는 기록 없음입니다. 칸을 누르면 자세히 보여 줍니다." />
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.muted, { height: BAR_MAX_HEIGHT + 4 + 34 }]}> </Text>
          {names.map(name => (
            <Text key={name} style={[styles.laneName, { height: 26, lineHeight: 26 }]} numberOfLines={1}>{name}</Text>
          ))}
        </View>
        <ScrollView horizontal contentContainerStyle={{ gap: 4 }}>
          {runs.map(run => (
            <View key={`${run.endedAt}-${run.sha}`} style={{ gap: 4, alignItems: 'center' }}>
              <View style={{ height: BAR_MAX_HEIGHT, justifyContent: 'flex-end' }} accessibilityLabel={run.runSeconds !== null ? `실행 시간 ${formatDuration(run.runSeconds)}` : '실행 시간 없음'}>
                <View style={{ width: 20, height: Math.max(2, Math.round(((run.runSeconds ?? 0) / longest) * BAR_MAX_HEIGHT)), borderRadius: 2, backgroundColor: run.status === 'success' ? theme.colors.statusSuccess : theme.colors.statusDanger, opacity: 0.7 }} />
              </View>
              <View style={{ height: 34, alignItems: 'center' }}>
                <Text style={{ color: run.status === 'success' ? theme.colors.statusSuccess : theme.colors.statusDanger }}>{run.status === 'success' ? '✓' : '✗'}</Text>
                <Text style={styles.muted}>{formatClock(run.endedAt).slice(-5)}</Text>
              </View>
              {names.map(name => {
                const lane = laneOf(run, name);
                const slow = lane?.state === 'passed' && isSlow(lane.seconds, status.laneMedians[name]);
                const color = !lane || lane.seconds === null ? theme.colors.foregroundMuted : lane.state === 'failed' ? theme.colors.statusDanger : slow ? theme.colors.statusWarning : theme.colors.foreground;
                const minutes = lane?.seconds != null ? String(Math.max(1, Math.round(lane.seconds / 60))) : '–';
                const key = `${run.endedAt}-${run.sha}`;
                const isSelected = selected?.key === key && selected.lane === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatClock(run.endedAt)} ${name} ${lane ? `${lane.state} ${minutes}분` : '기록 없음'}`}
                    onPress={() => setSelected(isSelected ? null : { key, lane: name })}
                    style={[
                      styles.cell,
                      lane?.state === 'failed' ? { borderWidth: 1, borderColor: theme.colors.statusDanger } : null,
                      isSelected ? { borderWidth: 2, borderColor: theme.colors.accent } : null,
                    ]}
                  >
                    <Text style={{ color }}>{minutes}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
      {selectedRun && selected ? (
        <View style={{ gap: 4, paddingTop: 4 }}>
          <View style={styles.row}>
            <Text style={styles.title}>{selected.lane}</Text>
            <Text style={{ color: selectedLane ? laneColor(theme, selectedLane.state) : theme.colors.foregroundMuted }}>
              {selectedLane ? `${LANE_MARK[selectedLane.state]} ${selectedLane.seconds !== null ? formatDuration(selectedLane.seconds) : ''}${selectedLane.note === 'timed out' ? ' · 시간 초과' : selectedLane.note ? ` · ${selectedLane.note}` : ''}` : '기록 없음'}
            </Text>
            {status.laneMedians[selected.lane] !== undefined ? <Text style={styles.muted}>평소 {formatDuration(status.laneMedians[selected.lane])}</Text> : null}
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>{formatClock(selectedRun.endedAt)} 종료</Text>
            <Sha sha={selectedRun.sha} repoUrl={status.repoUrl} styles={styles} />
            {selectedRun.runSeconds !== null ? <Text style={styles.muted}>전체 {formatDuration(selectedRun.runSeconds)}</Text> : null}
          </View>
          <Subject subject={selectedRun.subject} repoUrl={status.repoUrl} styles={styles} />
          <FailureLines failures={selectedRun.failures.filter(failure => failure.lane === selected.lane)} status={status} styles={styles} />
        </View>
      ) : null}
    </View>
  );
}

function StatsTab({ status, now, styles, theme }: { status: VerifierStatus; now: number; styles: Styles; theme: PluginTheme }) {
  const label = (stats: WindowStats) => (stats.hours % 24 === 0 && stats.hours > 24 ? `${stats.hours / 24}일` : `${stats.hours}시간`);
  const host = status.host;
  return (
    <View style={{ gap: 8 }}>
      {status.redSince ? <Text style={styles.text}>지금 red: {formatClock(status.redSince, now)}부터 {formatDuration((now - Date.parse(status.redSince)) / 1000)}째 (verifier 관측 기준)</Text> : null}
      {status.stats.length === 0 ? <Text style={styles.muted}>기록이 없습니다.</Text> : null}
      {status.stats.map(stats => {
        const rate = stats.runs > 0 ? `${Math.round((stats.successes / stats.runs) * 100)}%` : '-';
        return (
          <View key={stats.hours} style={styles.row}>
            <Text style={[styles.title, { width: 48 }]}>{label(stats)}</Text>
            <Text style={styles.text}>실행 {stats.runs} (통과 {stats.successes} · 실패 {stats.failures}) · 성공률 {rate}</Text>
            <Text style={styles.muted}>
              {stats.medianRunSeconds !== null ? `중앙 ${formatDuration(stats.medianRunSeconds)}` : ''}
              {stats.deferrals > 0 ? ` · 연기 ${stats.deferrals}` : ''}
              {stats.longestRedSeconds !== null ? ` · 가장 긴 red ${formatDuration(stats.longestRedSeconds)}` : ''}
            </Text>
          </View>
        );
      })}
      <View style={styles.row}>
        <Text style={[styles.title, { width: 48 }]}>기기</Text>
        {host ? (
          <>
            {hostIndicators(host).map(item => (
              <Text key={item.key} style={{ color: item.warning ? theme.colors.statusWarning : theme.colors.foreground }}>{item.label}</Text>
            ))}
            <InfoTip
              styles={styles}
              theme={theme}
              text={`${formatClock(host.measuredAt, now)} 측정, 60초마다 다시 읽습니다.${host.leftoverContainers ? ` 컨테이너는 ${formatClock(host.leftoverContainers.measuredAt, now)}에 확인했습니다.` : status.current ? ' 실행 중에는 남은 컨테이너를 확인하지 않습니다.' : ''} 경고 기준: swap 80%, fseventsd 2 GiB, verifier가 쉬는 동안 2시간 넘게 남은 lane 컨테이너.`}
            />
          </>
        ) : (
          <Text style={styles.muted}>원격 SSH 모드에서는 기기 상태를 읽을 수 없습니다.</Text>
        )}
      </View>
    </View>
  );
}

type HistoryTab = 'recent' | 'lanes' | 'stats';
const TABS: Array<{ id: HistoryTab; label: string }> = [
  { id: 'recent', label: '최근' },
  { id: 'lanes', label: 'lane 표' },
  { id: 'stats', label: '통계' },
];

function HistoryCard({ status, now, styles, theme }: { status: VerifierStatus; now: number; styles: Styles; theme: PluginTheme }) {
  const [tab, setTab] = useState<HistoryTab>('recent');
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>기록</Text>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4 }}>
          {TABS.map(item => {
            const active = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => setTab(item.id)}
                style={[styles.tab, active ? { backgroundColor: theme.colors.surface2 } : null]}
              >
                <Text style={active ? styles.text : styles.muted}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {tab === 'recent' ? <RecentTab status={status} styles={styles} theme={theme} /> : null}
      {tab === 'lanes' ? <LaneMatrixTab status={status} styles={styles} theme={theme} /> : null}
      {tab === 'stats' ? <StatsTab status={status} now={now} styles={styles} theme={theme} /> : null}
    </View>
  );
}

// ── 화면 ──────────────────────────────────────────────────────────────

export interface VerifierViewProps {
  state: StoreState;
  theme: PluginTheme;
  compact: boolean;
  onRefresh: () => void;
  now?: number;
}

/** 요약 → 확인할 것 → 기록 → 맨 아래 한 줄. 데이터 구독 없이 그리기만 해서 렌더 테스트가 쓴다. */
export function VerifierView({ state, theme, compact, onRefresh, now = Date.now() }: VerifierViewProps) {
  const styles = useMemo(() => makeStyles(theme, compact), [theme, compact]);
  const status = state.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SummaryCard state={state} status={status} now={now} onRefresh={onRefresh} styles={styles} theme={theme} />
      {status ? (
        <>
          <AttentionCard status={status} now={now} styles={styles} theme={theme} />
          <HistoryCard status={status} now={now} styles={styles} theme={theme} />
          <Text style={styles.muted} selectable>{footerLine(status, now)}</Text>
        </>
      ) : null}
    </ScrollView>
  );
}

export function VerifierScreen({ store, theme, layout }: PluginScreenProps & { store: StatusStore }) {
  const state = useStatus(store, true);
  return <VerifierView state={state} theme={theme} compact={layout.compact} onRefresh={() => void store.refresh()} />;
}
