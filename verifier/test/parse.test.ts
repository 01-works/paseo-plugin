import { describe, expect, it } from 'vitest';
import {
  currentRunFrom,
  laneMediansFrom,
  redPeriodsFrom,
  windowStatsFrom,
  withRecurrence,
  deferralFrom,
  failureStreakFrom,
  median,
  minimumKibFrom,
  parseDfAvailableKib,
  parseLaunchctl,
  parseRunLog,
  parseSummary,
} from '../server/parse';
import { dfOutput, finishedFailureLog, launchctlRunning, LOW_DISK, runningLog, SHA_A, SHA_B, SHA_C, summaryLine, waitingLog } from './fixtures';

describe('summary log', () => {
  it('reads status, duration and preflight of each run', () => {
    const entries = parseSummary([
      summaryLine('2026-11-15T03:00:00.000Z', 'run-a.log', SHA_A, 'success', 6000),
      'garbage line',
      summaryLine('2026-11-15T04:41:41.522Z', 'run-n.log', SHA_B, 'none', 1, LOW_DISK),
    ].join('\n'));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ sha: SHA_A, status: 'success', runSeconds: 6000, exit: 0, log: 'run-a.log' });
    expect(entries[1].preflight.find(item => item.item === 'disk')).toMatchObject({ ready: false, reason: 'low-space' });
    expect(minimumKibFrom(entries)).toBe(10485760);
  });

  it('keeps old entries without preflight', () => {
    const [entry] = parseSummary(`2026-11-05T16:05:44.129Z log=x.log kind=tip mode=full sha=${SHA_A} runner=${SHA_A} exit=2 status=none queue_wait_s=0 run_s=2 peak_rss_kib=-`);
    expect(entry).toMatchObject({ status: 'none', exit: 2, preflight: [] });
    expect(deferralFrom([entry])).toMatchObject({ count: 1, reason: 'exit=2' });
  });

  it('reports consecutive deferrals only after the last real run', () => {
    const entries = parseSummary([
      summaryLine('2026-11-15T03:00:00.000Z', 'a.log', SHA_A, 'success', 6000),
      summaryLine('2026-11-15T04:26:00.000Z', 'n1.log', SHA_B, 'none', 1, LOW_DISK),
      summaryLine('2026-11-15T04:41:00.000Z', 'n2.log', SHA_B, 'none', 1, LOW_DISK),
    ].join('\n'));
    expect(deferralFrom(entries)).toEqual({ since: '2026-11-15T04:26:00.000Z', count: 2, reason: 'disk low-space 9.7GiB' });
    expect(deferralFrom(entries.slice(0, 1))).toBeNull();
  });
});

describe('run log', () => {
  it('reads lane outcomes and failed lanes of a finished run', () => {
    const log = parseRunLog(finishedFailureLog);
    expect(log.sha).toBe(SHA_B);
    expect(log.failedLanes).toEqual(['app-packages']);
    expect(log.lanes.get('release-prepare-dry-run')).toEqual({ state: 'passed', seconds: 229, note: null });
    expect(log.failures).toEqual([{ lane: 'app-packages', classification: 'unknown', reason: 'failure-unidentified', signature: 'e918' }]);
    expect(log.lanesStartedAt).toBe('2026-11-15T05:11:51.300Z');
  });

  it('reads multiple failed lanes and success totals', () => {
    expect(parseRunLog('Total 6000s; failure: Failed: console-unit-integration-a11y, console-ci').failedLanes).toEqual(['console-unit-integration-a11y', 'console-ci']);
    expect(parseRunLog('Total 6000s; success: All nightly local lanes passed').failedLanes).toEqual([]);
  });

  it('builds the in-progress lane list from the announced order', () => {
    const current = currentRunFrom(parseRunLog(runningLog), 'fallback');
    expect(current).toEqual({
      sha: SHA_C,
      subject: null,
      startedAt: '2026-11-15T07:01:31.167Z',
      lanesStartedAt: '2026-11-15T07:01:31.300Z',
      phase: 'lanes',
      failures: [],
      lanes: [
        { name: 'install', state: 'passed', seconds: 13, note: null },
        { name: 'app-packages', state: 'running', seconds: null, note: null },
        { name: 'release-prepare-dry-run', state: 'pending', seconds: null, note: null },
      ],
    });
  });

  it('shows a run still waiting for the heavy lock', () => {
    expect(currentRunFrom(parseRunLog(waitingLog), 'x')).toMatchObject({ phase: 'waiting-lock', lanes: [] });
  });
});

describe('host probes', () => {
  it('reads only top-level launchctl fields', () => {
    expect(parseLaunchctl(launchctlRunning, 0)).toEqual({ loaded: true, running: true, runs: 751, intervalSeconds: 300 });
    expect(parseLaunchctl(launchctlRunning.replace('state = running', 'state = not running'), 0).running).toBe(false);
    expect(parseLaunchctl('Could not find service', 113)).toEqual({ loaded: false, running: false, runs: null, intervalSeconds: null });
  });

  it('reads available KiB like the verifier preflight', () => {
    expect(parseDfAvailableKib(dfOutput)).toBe(38545204);
    expect(parseDfAvailableKib('nonsense')).toBeNull();
  });
});

describe('aggregates', () => {
  const run = (status: 'success' | 'failure') => ({ endedAt: '', sha: SHA_A, subject: null, status, runSeconds: 1, failedLanes: [], lanes: [], failures: [] });
  it('counts the trailing failure streak', () => {
    expect(failureStreakFrom([run('failure'), run('success'), run('failure'), run('failure')])).toBe(2);
    expect(failureStreakFrom([run('failure'), run('success')])).toBe(0);
  });
  it('takes the median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(3);
  });
});

describe('history', () => {
  const lane = (name: string, state: 'passed' | 'failed', seconds: number) => ({ name, state, seconds, note: null });
  const run = (endedAt: string, status: 'success' | 'failure', lanes: ReturnType<typeof lane>[] = []) => ({ endedAt, sha: SHA_A, subject: null, status, runSeconds: 100, failedLanes: [], lanes, failures: [] });

  it('takes lane medians from passed lanes only', () => {
    const medians = laneMediansFrom([
      run('2026-11-15T01:00:00.000Z', 'success', [lane('a', 'passed', 10), lane('b', 'passed', 100)]),
      run('2026-11-15T02:00:00.000Z', 'failure', [lane('a', 'passed', 30), lane('b', 'failed', 5)]),
    ]);
    expect(medians).toEqual({ a: 20, b: 100 });
  });

  it('measures red from the first failure after a success to the next success', () => {
    const periods = redPeriodsFrom([
      run('2026-11-15T01:00:00.000Z', 'success'),
      run('2026-11-15T02:00:00.000Z', 'failure'),
      run('2026-11-15T03:00:00.000Z', 'failure'),
      run('2026-11-15T05:00:00.000Z', 'success'),
      run('2026-11-15T06:00:00.000Z', 'failure'),
    ]);
    expect(periods).toEqual([
      { start: Date.parse('2026-11-15T02:00:00.000Z'), end: Date.parse('2026-11-15T05:00:00.000Z') },
      { start: Date.parse('2026-11-15T06:00:00.000Z'), end: null },
    ]);
  });

  it('counts window stats including deferrals and clipped red time', () => {
    const entries = parseSummary([
      summaryLine('2026-11-13T00:00:00.000Z', 'old.log', SHA_A, 'failure', 50),
      summaryLine('2026-11-14T20:00:00.000Z', 'a.log', SHA_A, 'success', 100),
      summaryLine('2026-11-15T02:00:00.000Z', 'b.log', SHA_B, 'failure', 300),
      summaryLine('2026-11-15T03:00:00.000Z', 'n.log', SHA_B, 'none', 1, LOW_DISK),
    ].join('\n'));
    const now = Date.parse('2026-11-15T12:00:00.000Z');
    expect(windowStatsFrom(entries, 24, now)).toEqual({ hours: 24, runs: 2, successes: 1, failures: 1, deferrals: 1, medianRunSeconds: 200, longestRedSeconds: 10 * 3600 });
    // 7일 창에는 11-13 실패부터 11-14 성공까지의 red도 들어간다.
    expect(windowStatsFrom(entries, 24 * 7, now)).toMatchObject({ runs: 3, failures: 2, longestRedSeconds: 44 * 3600 });
  });
});

describe('remote listing', async () => {
  const { parseRemoteListing } = await import('../server/source');
  it('keeps only top-level files of ls -lAR', () => {
    const listing = 'total 16\n-rw-------  1 yw  staff  10 Nov 15 16:01 p-summary.log\ndrwx------  3 yw  staff  96 Nov 15 16:01 sub\n-rw-------  1 yw  staff  10 Nov 15 16:01 p-run-a.log\n\n./sub:\ntotal 0\n-rw-------  1 yw  staff  1 Nov 1 00:00 nested.log\n';
    expect(parseRemoteListing(listing)).toEqual(['p-summary.log', 'p-run-a.log']);
  });
});

describe('timed-out lanes and recurrence', () => {
  it('keeps the duration and note of a timed-out lane so the estimate stays right', () => {
    const log = parseRunLog(`2026-11-15T11:36:32.693Z Target tip ${SHA_C}; runner code origin/dev ${SHA_C}
2026-11-15T11:36:32.830Z Heavy authority acquired via local after 0s
Lane order summary: {"order":["ecommerce-db","migration-exec"],"source":null}
[ecommerce-db] start
[ecommerce-db] failed (timed out) in 1803s (exit 1)
[ecommerce-db] classification=unknown reason=failure-unidentified signature=1cbe
[migration-exec] start
`);
    expect(log.lanes.get('ecommerce-db')).toEqual({ state: 'failed', seconds: 1803, note: 'timed out' });
    expect(log.lanes.get('migration-exec')).toEqual({ state: 'running', seconds: null, note: null });
  });

  it('counts consecutive same-signature failures per lane and remembers where they started', () => {
    const f = (lane: string, signature: string) => ({ lane, classification: 'unknown', reason: 'x', signature });
    const result = withRecurrence([
      { sha: 'a', at: '1', failures: [f('packages', 'p1')] },
      { sha: 'b', at: '2', failures: [f('packages', 'p1'), f('ci', 'c1')] },
      { sha: 'c', at: '3', failures: [] },
      { sha: 'd', at: '4', failures: [f('packages', 'p1'), f('ci', 'c2')] },
      { sha: 'e', at: null, failures: [f('packages', 'p1'), f('ci', 'c2')] },
    ]);
    expect(result[1].map(x => [x.lane, x.streak, x.firstSha])).toEqual([['packages', 2, 'a'], ['ci', 1, 'b']]);
    // 통과한 실행(c)이 연속을 끊는다. 다른 signature도 새 실패다.
    expect(result[3].map(x => [x.lane, x.streak, x.firstSha])).toEqual([['packages', 1, 'd'], ['ci', 1, 'd']]);
    expect(result[4].map(x => [x.lane, x.streak, x.firstSha, x.firstAt])).toEqual([['packages', 2, 'd', '4'], ['ci', 2, 'd', '4']]);
  });
});
