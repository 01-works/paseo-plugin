import type { CurrentRun, Failure, Lane, Run, VerifierStatus } from '../shared/contracts';

// 화면·요약 테스트가 함께 쓰는 상태 표본. 시각은 모두 UTC다.
export const NOW = Date.parse('2026-11-16T09:00:00.000Z');
export const SIG_CI = '07a3cdbaa6b85f5997bd95c1f1d868479be1c55c3d082a340a5a12d4a536d6d6';
export const SIG_DB = '1cbe285367b81a6dc55f98acfff86cc4a99d6c2c4c75d5f4de5edd9ba93593fa';
export const PASS_SHA = 'b09aa18'.padEnd(40, '0');
export const FIRST_RED_SHA = 'f1649fa'.padEnd(40, '1');
export const RED_SHA = 'ed5fbe3'.padEnd(40, '2');
export const RUN_SHA = 'c0ffee0'.padEnd(40, '3');

export const LANE_NAMES = ['install', 'app-packages', 'console-ci', 'console-unit-integration-a11y', 'ecommerce-db', 'migration-exec', 'packages', 'sdk', 'templates', 'docs', 'release-prepare-dry-run'];

export function lanes(states: Partial<Record<string, Lane['state']>>, fallback: Lane['state'] = 'passed'): Lane[] {
  return LANE_NAMES.map(name => {
    const state = states[name] ?? fallback;
    return { name, state, seconds: state === 'passed' || state === 'failed' ? 600 : null, note: null };
  });
}

export function failure(lane: string, signature: string, streak: number, firstSha: string, firstAt: string | null): Failure {
  return { lane, classification: 'reproduced', reason: 'both-failed', signature, streak, firstSha, firstAt };
}

export function run(endedAt: string, sha: string, status: Run['status'], extra: Partial<Run> = {}): Run {
  const failedLanes = extra.failures?.map(item => item.lane) ?? [];
  return { endedAt, sha, subject: null, status, runSeconds: 6000, failedLanes, lanes: lanes(Object.fromEntries(failedLanes.map(name => [name, 'failed']))), failures: [], ...extra };
}

export const passed = run('2026-11-15T19:00:00.000Z', PASS_SHA, 'success', { subject: 'fix(console): 통과한 커밋 (#7900)' });

export const healthy: VerifierStatus = {
  collectedAt: new Date(NOW).toISOString(),
  agent: { loaded: true, running: false, runs: 751, intervalSeconds: 300 },
  source: { kind: 'local', target: null },
  current: null,
  recent: [passed],
  laneMedians: Object.fromEntries(LANE_NAMES.map(name => [name, 600])),
  beats: [{ at: passed.endedAt, sha: PASS_SHA, status: 'success', runSeconds: 6000, reason: null }],
  redSince: null,
  stats: [{ hours: 24, runs: 4, successes: 4, failures: 0, deferrals: 0, medianRunSeconds: 6000, longestRedSeconds: null }],
  repoUrl: 'https://github.com/acme/repo',
  lastSuccess: passed,
  failureStreak: 0,
  deferral: null,
  typicalRunSeconds: 6000,
  disk: { availableKib: 40 * 1024 * 1024, minimumKib: 10 * 1024 * 1024, measuredAt: null },
  host: {
    measuredAt: new Date(NOW).toISOString(),
    swapUsedPercent: 20,
    fseventsdRssKib: 1024,
    leftoverContainers: { measuredAt: new Date(NOW).toISOString(), count: 0, names: [] },
  },
  github: {
    fetchedAt: new Date(NOW).toISOString(),
    devSha: PASS_SHA,
    mainSha: 'd'.repeat(40),
    devAheadOfMain: 7,
    candidate: { sha: PASS_SHA, aheadOfMain: 7 },
    redIssues: {},
    redIssuesError: null,
  },
  githubError: null,
  errors: [],
};

/** console-ci가 두 번 연속 같은 signature로 실패. 처음 실패는 13시간 전에 관측됐다. */
const firstRed = run('2026-11-15T20:00:00.000Z', FIRST_RED_SHA, 'failure', {
  subject: 'feat(console): 원인 커밋 (#7957)',
  failures: [failure('console-ci', SIG_CI, 1, FIRST_RED_SHA, '2026-11-15T20:00:00.000Z')],
});
const secondRed = run('2026-11-16T06:00:00.000Z', RED_SHA, 'failure', {
  subject: 'chore: 다음 커밋 (#7960)',
  failures: [failure('console-ci', SIG_CI, 2, FIRST_RED_SHA, '2026-11-15T20:00:00.000Z')],
});

export const red: VerifierStatus = {
  ...healthy,
  recent: [passed, firstRed, secondRed],
  beats: [...healthy.beats, { at: firstRed.endedAt, sha: FIRST_RED_SHA, status: 'failure', runSeconds: 6000, reason: null }, { at: secondRed.endedAt, sha: RED_SHA, status: 'failure', runSeconds: 6000, reason: null }],
  redSince: firstRed.endedAt,
  failureStreak: 2,
  github: { ...healthy.github!, devSha: RED_SHA, redIssues: { [SIG_CI]: 10196 } },
};

/** red 상태에서 다음 커밋을 검증 중. console-ci는 또 실패했고 ecommerce-db가 새로 실패했다. */
export const currentRun: CurrentRun = {
  sha: RUN_SHA,
  subject: 'fix(console): 지금 커밋 (#7961)',
  startedAt: '2026-11-16T08:00:00.000Z',
  lanesStartedAt: '2026-11-16T08:00:00.000Z',
  phase: 'lanes',
  lanes: lanes({ install: 'passed', 'app-packages': 'passed', 'console-ci': 'failed', 'ecommerce-db': 'failed', 'migration-exec': 'running' }, 'pending'),
  failures: [failure('console-ci', SIG_CI, 3, FIRST_RED_SHA, '2026-11-15T20:00:00.000Z'), failure('ecommerce-db', SIG_DB, 1, RUN_SHA, '2026-11-16T08:00:00.000Z')],
};

export const running: VerifierStatus = { ...red, agent: { ...red.agent!, running: true }, current: currentRun, host: { ...red.host!, leftoverContainers: null } };

export const hostWarning: VerifierStatus = {
  ...healthy,
  host: {
    measuredAt: new Date(NOW).toISOString(),
    swapUsedPercent: 92.5,
    fseventsdRssKib: 1024,
    leftoverContainers: { measuredAt: new Date(NOW).toISOString(), count: 1, names: ['console-12345678-1234-4234-8234-123456789abc-ecommerce-test'] },
  },
  disk: { availableKib: 12 * 1024 * 1024, minimumKib: 10 * 1024 * 1024, measuredAt: null },
  deferral: { since: '2026-11-16T08:30:00.000Z', count: 2, reason: 'disk low-space 9.7GiB' },
  errors: ['docker: Cannot connect to the Docker daemon'],
};

export const remote: VerifierStatus = {
  ...red,
  agent: null,
  source: { kind: 'ssh', target: 'verifier-box' },
  host: null,
  disk: { availableKib: 40 * 1024 * 1024, minimumKib: 10 * 1024 * 1024, measuredAt: '2026-11-16T06:00:00.000Z' },
  github: null,
  githubError: null,
};
