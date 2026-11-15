import type { PluginTheme } from '@getpaseo/plugin';
import { openExternalUrl, type PluginScreenProps } from '@getpaseo/plugin/client';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Beat, Failure, Lane, Run, VerifierStatus, WindowStats } from '../shared/contracts';
import { estimateRun, formatDuration, formatGiB, headline, isSlow, prNumber, shortSha } from '../shared/summary';
import { toneColor } from './sidebar';
import { useStatus, type StatusStore } from './store';

const RECENT_LIST = 10;
const BAR_MAX_HEIGHT = 28;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function formatClock(iso: string | number, now = Date.now()): string {
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return new Date(now).toDateString() === date.toDateString() ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

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
  };
}

type Styles = ReturnType<typeof makeStyles>;

function Card({ styles, title, children }: { styles: Styles; title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

function Sha({ sha, repoUrl, styles }: { sha: string; repoUrl: string | null; styles: Styles }) {
  if (!repoUrl) return <Text style={styles.mono}>{shortSha(sha)}</Text>;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`커밋 ${shortSha(sha)}를 GitHub에서 열기`} onPress={() => void openExternalUrl(`${repoUrl}/commit/${sha}`)}>
      <Text style={styles.link}>{shortSha(sha)}</Text>
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
      {pr && repoUrl ? (
        <Pressable accessibilityRole="link" accessibilityLabel={`PR ${pr}를 GitHub에서 열기`} onPress={() => void openExternalUrl(`${repoUrl}/pull/${pr}`)}>
          <Text style={styles.link}>#{pr}</Text>
        </Pressable>
      ) : null}
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

function FailureLines({ failures, styles }: { failures: Failure[]; styles: Styles }) {
  if (failures.length === 0) return null;
  return (
    <>
      {failures.map(failure => (
        <Text key={`${failure.lane}-${failure.signature}`} style={styles.muted} selectable>
          {failure.lane}: {failure.classification} · {failure.reason} · {failure.signature.slice(0, 12)} · {failure.streak > 1 ? `${failure.streak}회 연속 (처음 ${shortSha(failure.firstSha)}${failure.firstAt ? ` ${formatClock(failure.firstAt)}` : ''})` : '이번에 처음'}
        </Text>
      ))}
    </>
  );
}

function CurrentRunCard({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const current = status.current;
  if (!current) return null;
  const started = current.startedAt ? Date.parse(current.startedAt) : NaN;
  const estimate = estimateRun(status);
  return (
    <Card styles={styles} title="지금 실행">
      <View style={styles.row}>
        <Sha sha={current.sha} repoUrl={status.repoUrl} styles={styles} />
        {Number.isFinite(started) ? <Text style={styles.muted}>{formatClock(started)} 시작 · {formatDuration((Date.now() - started) / 1000)}째</Text> : null}
        {estimate.endAt ? <Text style={styles.muted}>· 예상 종료 {formatClock(estimate.endAt)}{estimate.perLane ? '' : ' (전체 중앙값 기준)'}</Text> : null}
      </View>
      <Subject subject={current.subject} repoUrl={status.repoUrl} styles={styles} />
      {current.phase === 'waiting-lock' ? <Text style={styles.muted}>heavy lock을 기다리는 중입니다.</Text> : null}
      {current.lanes.map(lane => {
        const median = status.laneMedians[lane.name];
        const slow = isSlow(lane.state === 'running' ? estimate.runningLaneSeconds : lane.seconds, median);
        const usual = median !== undefined ? `평소 ${formatDuration(median)}` : null;
        let detail: string | null = null;
        if (lane.state === 'running') detail = [estimate.runningLaneSeconds !== null ? `약 ${formatDuration(estimate.runningLaneSeconds)}째` : null, usual].filter(Boolean).join(' · ');
        else if (lane.seconds !== null) detail = [lane.note === 'timed out' ? '시간 초과' : lane.note, formatDuration(lane.seconds), slow && usual ? usual : null].filter(Boolean).join(' · ');
        else if (lane.state === 'pending') detail = usual;
        return (
          <View key={lane.name} style={styles.row}>
            <Text style={{ color: laneColor(theme, lane.state) }}>{LANE_MARK[lane.state]}</Text>
            <Text style={lane.state === 'pending' ? styles.muted : styles.text}>{lane.name}</Text>
            {detail ? <Text style={{ color: slow ? theme.colors.statusWarning : theme.colors.foregroundMuted }}>{detail}</Text> : null}
          </View>
        );
      })}
      <FailureLines failures={current.failures} styles={styles} />
    </Card>
  );
}

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
      </View>
      {beat ? (
        <View style={styles.row}>
          <Text style={{ color: beatColor(theme, beat.status) }}>{BEAT_LABEL[beat.status]}</Text>
          <Text style={styles.muted}>{formatClock(beat.at)}</Text>
          <Sha sha={beat.sha} repoUrl={status.repoUrl} styles={styles} />
          {beat.status === 'none' ? <Text style={styles.muted}>{beat.reason}</Text> : beat.runSeconds !== null ? <Text style={styles.muted}>{formatDuration(beat.runSeconds)}</Text> : null}
        </View>
      ) : (
        <Text style={styles.muted}>막대를 누르면 그 기록을 보여 줍니다.</Text>
      )}
    </View>
  );
}

function StatsCard({ status, styles }: { status: VerifierStatus; styles: Styles }) {
  if (status.stats.length === 0) return null;
  const label = (stats: WindowStats) => (stats.hours % 24 === 0 && stats.hours > 24 ? `${stats.hours / 24}일` : `${stats.hours}시간`);
  return (
    <Card styles={styles} title="기간 요약">
      {status.redSince ? <Text style={styles.text}>지금 red: {formatClock(status.redSince)}부터 {formatDuration((Date.now() - Date.parse(status.redSince)) / 1000)}째 (verifier 관측 기준)</Text> : null}
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
    </Card>
  );
}

/** lane을 행, 실행을 열(최근이 왼쪽)로 둔 표. 칸은 걸린 분이고, 평소보다 오래 걸린 통과는 경고색이다. */
function LaneMatrixCard({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const [selected, setSelected] = useState<{ key: string; lane: string } | null>(null);
  const runs = [...status.recent].reverse();
  if (runs.length === 0) return null;
  // 실패 lane이 다음 실행에서 앞으로 옮겨지므로 순서가 아니라 이름으로 맞춘다.
  const names: string[] = [];
  for (const run of [...runs].reverse()) for (const lane of run.lanes) if (!names.includes(lane.name)) names.push(lane.name);
  const laneOf = (run: Run, name: string) => run.lanes.find(lane => lane.name === name);
  const longest = Math.max(1, ...runs.map(run => run.runSeconds ?? 0));
  const selectedRun = selected ? runs.find(run => `${run.endedAt}-${run.sha}` === selected.key) : undefined;
  const selectedLane = selectedRun && selected ? laneOf(selectedRun, selected.lane) : undefined;
  return (
    <Card styles={styles} title={`lane 이력 (최근 ${runs.length}회)`}>
      <Text style={styles.muted}>위 막대는 실행 전체 시간, 칸은 lane이 걸린 분입니다. 빨강은 실패, 노랑은 평소보다 1.5배 넘게 걸린 통과, –는 기록 없음입니다. 칸을 누르면 자세히 보여 줍니다.</Text>
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
          <FailureLines failures={selectedRun.failures.filter(failure => failure.lane === selected.lane)} styles={styles} />
        </View>
      ) : null}
    </Card>
  );
}

function RunRow({ run, repoUrl, styles, theme }: { run: Run; repoUrl: string | null; styles: Styles; theme: PluginTheme }) {
  const ok = run.status === 'success';
  return (
    <View style={{ gap: 2 }}>
      <View style={styles.row}>
        <Text style={{ color: ok ? theme.colors.statusSuccess : theme.colors.statusDanger }}>{ok ? '✓' : '✗'}</Text>
        <Text style={styles.muted}>{formatClock(run.endedAt)}</Text>
        <Sha sha={run.sha} repoUrl={repoUrl} styles={styles} />
        {run.runSeconds !== null ? <Text style={styles.muted}>{formatDuration(run.runSeconds)}</Text> : null}
        {run.failedLanes.length > 0 ? <Text style={{ color: theme.colors.statusDanger }}>{run.failedLanes.join(', ')}</Text> : null}
      </View>
      <Subject subject={run.subject} repoUrl={repoUrl} styles={styles} />
      {!ok ? <FailureLines failures={run.failures} styles={styles} /> : null}
    </View>
  );
}

function PromotionCard({ status, styles }: { status: VerifierStatus; styles: Styles }) {
  const { github, githubError } = status;
  if (!github) {
    return (
      <Card styles={styles} title="승격">
        <Text style={styles.muted}>{githubError ? `GitHub 조회 실패: ${githubError}` : 'GitHub에서 읽는 중…'}</Text>
      </Card>
    );
  }
  const devVerified = status.recent.some(run => run.sha === github.devSha && run.status === 'success');
  const devChecked = status.recent.find(run => run.sha === github.devSha);
  const devRunning = status.current?.sha === github.devSha;
  const devState = devVerified ? '통과' : devRunning ? '검증 중' : devChecked ? '실패' : '아직 검증 안 됨';
  return (
    <Card styles={styles} title="승격">
      <View style={styles.row}>
        <Text style={styles.muted}>main</Text>
        <Sha sha={github.mainSha} repoUrl={status.repoUrl} styles={styles} />
        <Text style={styles.muted}>· dev</Text>
        <Sha sha={github.devSha} repoUrl={status.repoUrl} styles={styles} />
        <Text style={styles.muted}>({devState}) · dev가 {github.devAheadOfMain}커밋 앞섬</Text>
      </View>
      {github.candidate ? (
        <View style={styles.row}>
          <Text style={styles.text}>후보</Text>
          <Sha sha={github.candidate.sha} repoUrl={status.repoUrl} styles={styles} />
          <Text style={styles.muted}>verifier 통과 · main보다 {github.candidate.aheadOfMain}커밋 앞섬</Text>
        </View>
      ) : (
        <Text style={styles.muted}>main에 없는 verifier 통과 SHA가 없습니다.</Text>
      )}
      <Text style={styles.muted}>마이그레이션 여부와 승격 절차는 release 세션에서 확인합니다. GitHub 정보는 {formatClock(github.fetchedAt)} 기준이며 10분마다 갱신합니다.</Text>
    </Card>
  );
}

export function VerifierScreen({ store, theme, layout }: PluginScreenProps & { store: StatusStore }) {
  const state = useStatus(store, true);
  const styles = useMemo(() => makeStyles(theme, layout.compact), [theme, layout.compact]);
  const status = state.data;
  const top = status ? headline(status) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        {top ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: toneColor(theme, top.tone) }} /> : null}
        <Text accessibilityRole="header" style={[styles.title, { flex: 1 }]}>{top?.label ?? (state.error ? '읽기 실패' : '불러오는 중…')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="지금 다시 읽기"
          disabled={state.loading}
          onPress={() => void store.refresh()}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{state.loading ? '읽는 중…' : '새로고침'}</Text>
        </Pressable>
      </View>
      {state.error ? <Text style={{ color: theme.colors.statusDanger }}>{state.error}</Text> : null}
      {status ? (
        <>
          <Text style={styles.muted}>
            {status.agent
              ? `LaunchAgent ${status.agent.loaded ? (status.agent.running ? '실행 중' : '대기') : '꺼짐'}${status.agent.intervalSeconds ? ` · ${Math.round(status.agent.intervalSeconds / 60)}분마다 확인` : ''}${status.agent.runs !== null ? ` · 누적 ${status.agent.runs}회` : ''}`
              : `원격 ${status.source.target ?? ''}에서 읽음 · LaunchAgent 상태는 알 수 없음`}
            {` · ${formatClock(status.collectedAt)} 기준`}
          </Text>

          <BeatStrip status={status} styles={styles} theme={theme} />

          <CurrentRunCard status={status} styles={styles} theme={theme} />

          {status.deferral ? (
            <Card styles={styles} title="실행 연기">
              <Text style={styles.text}>{status.deferral.reason}</Text>
              <Text style={styles.muted}>{formatClock(status.deferral.since)}부터 {status.deferral.count}회 연속 미뤄졌습니다. 원인이 해소되면 다음 확인에서 다시 시작합니다.</Text>
            </Card>
          ) : null}

          {status.disk ? (
            <Card styles={styles} title="디스크">
              <Text style={{ color: status.disk.availableKib < status.disk.minimumKib ? theme.colors.statusDanger : status.disk.availableKib < status.disk.minimumKib * 1.5 ? theme.colors.statusWarning : theme.colors.foreground }}>
                여유 {formatGiB(status.disk.availableKib)} · 실행 최소 {formatGiB(status.disk.minimumKib)}
                {status.disk.measuredAt ? ` (${formatClock(status.disk.measuredAt)} preflight 기록)` : ''}
              </Text>
            </Card>
          ) : null}

          <PromotionCard status={status} styles={styles} />

          <StatsCard status={status} styles={styles} />

          <LaneMatrixCard status={status} styles={styles} theme={theme} />

          <Card styles={styles} title="최근 실행">
            {status.lastSuccess ? (
              <View style={styles.row}>
                <Text style={styles.muted}>마지막 통과</Text>
                <Sha sha={status.lastSuccess.sha} repoUrl={status.repoUrl} styles={styles} />
                <Text style={styles.muted}>{formatClock(status.lastSuccess.endedAt)}{status.failureStreak > 0 ? ` · 그 뒤 ${status.failureStreak}회 연속 실패` : ''}</Text>
              </View>
            ) : null}
            {status.recent.length === 0 ? <Text style={styles.muted}>기록이 없습니다.</Text> : null}
            {[...status.recent].reverse().slice(0, RECENT_LIST).map(run => (
              <RunRow key={`${run.endedAt}-${run.sha}`} run={run} repoUrl={status.repoUrl} styles={styles} theme={theme} />
            ))}
          </Card>

          {status.errors.length > 0 ? (
            <Card styles={styles} title="읽기 경고">
              {status.errors.map(error => (
                <Text key={error} style={styles.muted}>{error}</Text>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
