import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collector, type Exec } from '../server/collect';
import { dfOutput, finishedFailureLog, launchctlRunning, LOW_DISK, runningLog, SHA_A, SHA_B, SHA_C, summaryLine } from './fixtures';

let root: string;
let logs: string;
const calls: string[] = [];

function fakeExec(options: { running: boolean; gh?: Record<string, string>; ghFails?: boolean }): Exec {
  return async (command, args) => {
    calls.push([command, ...args].join(' '));
    if (command === 'launchctl') return { code: 0, stdout: options.running ? launchctlRunning : launchctlRunning.replace('state = running', 'state = not running'), stderr: '' };
    if (command === 'df') return { code: 0, stdout: dfOutput, stderr: '' };
    if (command === 'git') return { code: 0, stdout: 'https://github.com/acme/repo.git\n', stderr: '' };
    if (command === 'gh') {
      if (options.ghFails) return { code: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' };
      const endpoint = args[1].replace('repos/acme/repo/', '');
      const value = options.gh?.[endpoint];
      return value === undefined ? { code: 1, stdout: '', stderr: `unexpected ${endpoint}` } : { code: 0, stdout: `${value}\n`, stderr: '' };
    }
    return { code: 127, stdout: '', stderr: 'unknown' };
  };
}

function collector(exec: Exec) {
  return new Collector({ project: 'p', stateDir: root, checkout: root, launchLabel: 'test.label' }, exec);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'verifier-plugin-'));
  logs = path.join(root, 'logs');
  await mkdir(logs);
  calls.length = 0;
  await writeFile(path.join(logs, 'p-run-20261115-120000-tip-full-aaaaaaaaaaaa.log'), 'Total 6000s; success: All nightly local lanes passed\n');
  await writeFile(path.join(logs, 'p-run-20261115-141151-tip-full-bbbbbbbbbbbb.log'), finishedFailureLog);
  await writeFile(path.join(logs, 'p-run-20261115-141151-tip-full-bbbbbbbbbbbb-lanes.log'), 'large lane output');
  await writeFile(path.join(logs, 'p-summary.log'), [
    summaryLine('2026-11-15T03:00:00.000Z', 'p-run-20261115-120000-tip-full-aaaaaaaaaaaa.log', SHA_A, 'success', 6000),
    summaryLine('2026-11-15T06:56:28.669Z', 'p-run-20261115-141151-tip-full-bbbbbbbbbbbb.log', SHA_B, 'failure', 6276),
  ].join('\n') + '\n');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('Collector', () => {
  it('summarizes finished runs while the agent is idle', async () => {
    const status = await collector(fakeExec({ running: false })).status({ includeGithub: false });
    expect(status.agent).toEqual({ loaded: true, running: false, runs: 751, intervalSeconds: 300 });
    expect(status.current).toBeNull();
    expect(status.recent.map(run => [run.sha, run.status, run.failedLanes])).toEqual([[SHA_A, 'success', []], [SHA_B, 'failure', ['app-packages']]]);
    expect(status.lastSuccess?.sha).toBe(SHA_A);
    expect(status.failureStreak).toBe(1);
    expect(status.typicalRunSeconds).toBe(6138);
    expect(status.disk).toEqual({ availableKib: 38545204, minimumKib: 10485760 });
    expect(status.github).toBeNull();
    expect(status.errors).toEqual([]);
    expect(calls.some(call => call.startsWith('gh'))).toBe(false);
  });

  it('reports the unsummarized latest run log as the current run', async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    await writeFile(path.join(logs, 'p-run-20261115-160131-tip-full-cccccccccccc.log'), runningLog.replace(/2026-11-15T07:01:31\.\d+Z/g, startedAt));
    const status = await collector(fakeExec({ running: true })).status({ includeGithub: false });
    expect(status.current).toMatchObject({ sha: SHA_C, phase: 'lanes', startedAt });
    expect(status.current?.lanes.map(lane => lane.state)).toEqual(['passed', 'running', 'pending']);
    expect(status.deferral).toBeNull();
  });

  it('ignores an unsummarized run log older than the run limit', async () => {
    await writeFile(path.join(logs, 'p-run-20261115-160131-tip-full-cccccccccccc.log'), runningLog.replace(/2026-11-15T07/g, '2026-11-01T07'));
    expect((await collector(fakeExec({ running: true })).status({ includeGithub: false })).current).toBeNull();
  });

  it('reports deferrals after the last real run', async () => {
    await writeFile(path.join(logs, 'p-summary.log'), summaryLine('2026-11-15T07:00:00.000Z', 'p-run-n.log', SHA_C, 'none', 1, LOW_DISK) + '\n', { flag: 'a' });
    const status = await collector(fakeExec({ running: false })).status({ includeGithub: false });
    expect(status.deferral).toMatchObject({ count: 1, reason: 'disk low-space 9.7GiB' });
  });

  it('reads promotion state from GitHub only when asked and caches it', async () => {
    const main = 'd'.repeat(40);
    const exec = fakeExec({
      running: false,
      gh: { 'branches/dev': SHA_B, 'branches/main': main, [`compare/${main}...${SHA_B}`]: '7', [`compare/${main}...${SHA_A}`]: 'ahead 5' },
    });
    const instance = collector(exec);
    const status = await instance.status({ includeGithub: true });
    expect(status.github).toMatchObject({ devSha: SHA_B, mainSha: main, devAheadOfMain: 7, candidate: { sha: SHA_A, aheadOfMain: 5 } });
    const ghCalls = calls.filter(call => call.startsWith('gh')).length;
    await instance.status({ includeGithub: true });
    expect(calls.filter(call => call.startsWith('gh')).length).toBe(ghCalls);
  });

  it('drops the candidate once it is in main', async () => {
    const main = 'd'.repeat(40);
    const exec = fakeExec({ running: false, gh: { 'branches/dev': SHA_B, 'branches/main': main, [`compare/${main}...${SHA_B}`]: '2', [`compare/${main}...${SHA_A}`]: 'behind 0' } });
    expect((await collector(exec).status({ includeGithub: true })).github?.candidate).toBeNull();
  });

  it('keeps local status when GitHub fails', async () => {
    const status = await collector(fakeExec({ running: false, ghFails: true })).status({ includeGithub: true });
    expect(status.github).toBeNull();
    expect(status.githubError).toContain('401');
    expect(status.recent).toHaveLength(2);
  });

  it('reports a missing state directory as a warning, not a crash', async () => {
    await rm(logs, { recursive: true });
    const status = await collector(fakeExec({ running: false })).status({ includeGithub: false });
    expect(status.recent).toEqual([]);
    expect(status.errors.length).toBeGreaterThan(0);
  });
});
