import { describe, expect, it, vi } from 'vitest';
import { createVerifierTool, describeStatus } from '../server/agent-tool';
import { createRepoMatcher } from '../server/workspace-match';
import type { VerifierStatus } from '../shared/contracts';

const status: VerifierStatus = {
  collectedAt: '2026-11-15T07:30:00.000Z',
  agent: null,
  source: { kind: 'ssh', target: 'verifier-box' },
  current: {
    sha: 'c'.repeat(40), subject: 'feat: x (#1)', startedAt: '2026-11-15T07:00:00.000Z', lanesStartedAt: '2026-11-15T07:00:10.000Z', phase: 'lanes', failures: [],
    lanes: [{ name: 'install', state: 'passed', seconds: 10, note: null }, { name: 'packages', state: 'running', seconds: null, note: null }],
  },
  recent: [{ endedAt: '2026-11-15T06:00:00.000Z', sha: 'b'.repeat(40), subject: null, status: 'failure', runSeconds: 6000, failedLanes: ['app-packages'], lanes: [{ name: 'install', state: 'passed', seconds: 10, note: null }],
    failures: [{ lane: 'app-packages', classification: 'unknown', reason: 'failure-unidentified', signature: 'e9180834cb4f70717e51', streak: 3, firstSha: 'a'.repeat(40), firstAt: '2026-11-15T01:00:00.000Z' }] }],
  laneMedians: { packages: 1000 },
  beats: [],
  redSince: '2026-11-15T06:00:00.000Z',
  stats: [{ hours: 24, runs: 10, successes: 6, failures: 4, deferrals: 2, medianRunSeconds: 5000, longestRedSeconds: 3600 }],
  repoUrl: 'https://github.com/acme/repo',
  lastSuccess: null,
  failureStreak: 1,
  deferral: null,
  typicalRunSeconds: 5000,
  disk: { availableKib: 41735836, minimumKib: 10485760, measuredAt: '2026-11-15T06:00:00.000Z' },
  host: null,
  github: null,
  githubError: 'HTTP 401',
  errors: [],
};

describe('verifier_status tool', () => {
  it('summarizes the state an agent needs before heavy work', () => {
    const text = describeStatus(status, Date.parse('2026-11-15T07:30:00.000Z'));
    expect(text).toContain('verifier: 실행 중 1/2 · ccccccc');
    expect(text).toContain('source: remote verifier-box');
    expect(text).toContain('host: unavailable (remote SSH mode)');
    expect(text).toContain('started: 2026-11-15 07:00Z (30분 ago)');
    expect(text).toContain('lanes: 1/2 done; install=passed(10s), packages=running(~1780s)');
    expect(text).toContain('heavy lock');
    expect(text).toContain('failed=app-packages');
    expect(text).toContain('failure app-packages: unknown/failure-unidentified signature=e9180834cb4f');
    expect(text).toContain('red since 2026-11-15 06:00Z (1시간 30분)');
    expect(text).toContain('github: unavailable (HTTP 401)');
    expect(text).toMatch(/disk free 39\.8 GiB .* as of /);
  });

  it('includes one host line with readings, warning, container names and manual guidance', () => {
    const local = { ...status, source: { kind: 'local' as const, target: null }, host: {
      measuredAt: status.collectedAt, swapUsedMib: 11980, fseventsdRssKib: 5.3 * 1024 * 1024,
      leftoverContainers: { measuredAt: status.collectedAt, count: 1, names: ['console-12345678-1234-4234-8234-123456789abc-ecommerce-test'] },
    } };
    const lines = describeStatus(local).split('\n').filter(line => line.startsWith('host:'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('WARNING swap 11.7 GiB');
    expect(lines[0]).toContain('WARNING fseventsd RSS 5.3 GiB');
    expect(lines[0]).toContain('남은 lane 컨테이너 1개');
    expect(lines[0]).toContain('names=console-');
    expect(lines[0]).toContain('sudo killall fseventsd');
    const healthy = describeStatus({ ...local, host: { ...local.host, swapUsedMib: 1536, fseventsdRssKib: 1024, leftoverContainers: null } });
    expect(healthy).toContain('host: swap 1.5 GiB');
    expect(healthy).not.toContain('WARNING');
    expect(healthy).not.toContain('조치:');
  });

  it('returns text only and reports read failures as tool errors', async () => {
    const tool = createVerifierTool(async () => status);
    const result = await tool.execute({}, {} as never);
    expect(result.isError).toBeUndefined();
    // structuredContent가 있으면 Claude는 텍스트 대신 JSON을 보여 준다.
    expect(result).not.toHaveProperty('structuredContent');
    expect(result.text).toContain('3 runs in a row since aaaaaaaaaaaa');
    const failing = createVerifierTool(async () => { throw new Error('ssh down'); });
    expect(await failing.execute({ includeGithub: true }, {} as never)).toMatchObject({ isError: true, text: expect.stringContaining('ssh down') });
  });
});

describe('repo matcher', () => {
  it('matches clones and worktrees of the same GitHub repository once per directory', async () => {
    const exec = vi.fn(async (_command: string, args: string[]) => args[1] === '/work/01-software'
      ? { code: 0, stdout: 'git@github.com:Acme/Repo.git\n', stderr: '' }
      : { code: 128, stdout: '', stderr: 'not a git repository' });
    const matches = createRepoMatcher(exec);
    expect(await matches('/work/01-software', 'acme/repo')).toBe(true);
    expect(await matches('/work/01-software', 'acme/repo')).toBe(true);
    expect(await matches('/tmp/other', 'acme/repo')).toBe(false);
    expect(exec).toHaveBeenCalledTimes(2);
  });
});

describe('verifier_status red issues', () => {
  const github = { fetchedAt: status.collectedAt, devSha: 'b'.repeat(40), mainSha: 'd'.repeat(40), devAheadOfMain: 1, candidate: null, redIssuesError: null };
  it('appends the linked open red issue to failure lines', () => {
    const text = describeStatus({ ...status, githubError: null, github: { ...github, redIssues: { e9180834cb4f70717e51: 10196 } } });
    expect(text).toContain('failure app-packages: unknown/failure-unidentified signature=e9180834cb4f, 3 runs in a row since aaaaaaaaaaaa (2026-11-15 01:00Z), red issue #10196');
  });
  it('says when no open issue matches, and stays silent when issues were not read', () => {
    expect(describeStatus({ ...status, githubError: null, github: { ...github, redIssues: {} } })).toContain(', no open red issue');
    const unread = describeStatus({ ...status, githubError: null, github: { ...github, redIssues: null, redIssuesError: 'HTTP 401' } });
    expect(unread).not.toContain('red issue #');
    expect(unread).toContain('red issues: unavailable (HTTP 401)');
  });
});
