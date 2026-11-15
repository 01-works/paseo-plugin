import type { PluginTheme } from '@getpaseo/plugin';
import type { PluginScreenProps } from '@getpaseo/plugin/client';
import { useMemo, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Lane, Run, VerifierStatus } from '../shared/contracts';
import { estimatedEnd, formatDuration, formatGiB, headline, shortSha } from '../shared/summary';
import { toneColor } from './sidebar';
import { useStatus, type StatusStore } from './store';

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
    button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.surface2 },
    buttonText: { color: theme.colors.foreground },
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

const LANE_MARK: Record<Lane['state'], string> = { passed: '✓', failed: '✗', running: '●', pending: '○' };

function laneColor(theme: PluginTheme, state: Lane['state']) {
  if (state === 'passed') return theme.colors.statusSuccess;
  if (state === 'failed') return theme.colors.statusDanger;
  if (state === 'running') return theme.colors.accent;
  return theme.colors.foregroundMuted;
}

function CurrentRunCard({ status, styles, theme }: { status: VerifierStatus; styles: Styles; theme: PluginTheme }) {
  const current = status.current;
  if (!current) return null;
  const started = current.startedAt ? Date.parse(current.startedAt) : NaN;
  const end = estimatedEnd(status);
  return (
    <Card styles={styles} title="지금 실행">
      <View style={styles.row}>
        <Text style={styles.mono}>{shortSha(current.sha)}</Text>
        {Number.isFinite(started) ? <Text style={styles.muted}>{formatClock(started)} 시작 · {formatDuration((Date.now() - started) / 1000)}째</Text> : null}
        {end ? <Text style={styles.muted}>· 예상 종료 {formatClock(end)}</Text> : null}
      </View>
      {current.phase === 'waiting-lock' ? <Text style={styles.muted}>heavy lock을 기다리는 중입니다.</Text> : null}
      {current.lanes.map(lane => (
        <View key={lane.name} style={styles.row}>
          <Text style={{ color: laneColor(theme, lane.state) }}>{LANE_MARK[lane.state]}</Text>
          <Text style={lane.state === 'pending' ? styles.muted : styles.text}>{lane.name}</Text>
          {lane.seconds !== null ? <Text style={styles.muted}>{formatDuration(lane.seconds)}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

function RunRow({ run, styles, theme }: { run: Run; styles: Styles; theme: PluginTheme }) {
  const ok = run.status === 'success';
  return (
    <View style={styles.row}>
      <Text style={{ color: ok ? theme.colors.statusSuccess : theme.colors.statusDanger }}>{ok ? '✓' : '✗'}</Text>
      <Text style={styles.muted}>{formatClock(run.endedAt)}</Text>
      <Text style={styles.mono}>{shortSha(run.sha)}</Text>
      {run.runSeconds !== null ? <Text style={styles.muted}>{formatDuration(run.runSeconds)}</Text> : null}
      {run.failedLanes.length > 0 ? <Text style={{ color: theme.colors.statusDanger }}>{run.failedLanes.join(', ')}</Text> : null}
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
        <Text style={styles.mono}>{shortSha(github.mainSha)}</Text>
        <Text style={styles.muted}>· dev</Text>
        <Text style={styles.mono}>{shortSha(github.devSha)}</Text>
        <Text style={styles.muted}>({devState}) · dev가 {github.devAheadOfMain}커밋 앞섬</Text>
      </View>
      {github.candidate ? (
        <View style={styles.row}>
          <Text style={styles.text}>후보</Text>
          <Text style={styles.mono}>{shortSha(github.candidate.sha)}</Text>
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
            LaunchAgent {status.agent.loaded ? (status.agent.running ? '실행 중' : '대기') : '꺼짐'}
            {status.agent.intervalSeconds ? ` · ${Math.round(status.agent.intervalSeconds / 60)}분마다 확인` : ''}
            {status.agent.runs !== null ? ` · 누적 ${status.agent.runs}회` : ''} · {formatClock(status.collectedAt)} 기준
          </Text>

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
              </Text>
            </Card>
          ) : null}

          <PromotionCard status={status} styles={styles} />

          <Card styles={styles} title="최근 실행">
            {status.lastSuccess ? (
              <Text style={styles.muted}>마지막 통과 {shortSha(status.lastSuccess.sha)} · {formatClock(status.lastSuccess.endedAt)}{status.failureStreak > 0 ? ` · 그 뒤 ${status.failureStreak}회 연속 실패` : ''}</Text>
            ) : null}
            {status.recent.length === 0 ? <Text style={styles.muted}>기록이 없습니다.</Text> : null}
            {[...status.recent].reverse().map(run => (
              <RunRow key={`${run.endedAt}-${run.sha}`} run={run} styles={styles} theme={theme} />
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
