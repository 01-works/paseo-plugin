import { describe, expect, it } from 'vitest';
import {
  currentRunFrom,
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
    expect(log.lanes.get('release-prepare-dry-run')).toEqual({ state: 'passed', seconds: 229 });
  });

  it('reads multiple failed lanes and success totals', () => {
    expect(parseRunLog('Total 6000s; failure: Failed: console-unit-integration-a11y, console-ci').failedLanes).toEqual(['console-unit-integration-a11y', 'console-ci']);
    expect(parseRunLog('Total 6000s; success: All nightly local lanes passed').failedLanes).toEqual([]);
  });

  it('builds the in-progress lane list from the announced order', () => {
    const current = currentRunFrom(parseRunLog(runningLog), 'fallback');
    expect(current).toEqual({
      sha: SHA_C,
      startedAt: '2026-11-15T07:01:31.167Z',
      phase: 'lanes',
      lanes: [
        { name: 'install', state: 'passed', seconds: 13 },
        { name: 'app-packages', state: 'running', seconds: null },
        { name: 'release-prepare-dry-run', state: 'pending', seconds: null },
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
  const run = (status: 'success' | 'failure') => ({ endedAt: '', sha: SHA_A, status, runSeconds: 1, failedLanes: [] });
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
