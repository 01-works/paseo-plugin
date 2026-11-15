import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Collector, type Exec } from '../server/collect';
import { dfOutput, finishedFailureLog, launchctlRunning, LOW_DISK, runningLog, SHA_A, SHA_B, SHA_C, summaryLine } from './fixtures';

let root: string;
let logs: string;
const calls: string[] = [];

function fakeExec(options: { running: boolean; gh?: Record<string, string>; ghFails?: boolean; subjects?: Record<string, string> }): Exec {
  return async (command, args) => {
    calls.push([command, ...args].join(' '));
    if (command === 'launchctl') return { code: 0, stdout: options.running ? launchctlRunning : launchctlRunning.replace('state = running', 'state = not running'), stderr: '' };
    if (command === 'df') return { code: 0, stdout: dfOutput, stderr: '' };
    if (command === 'git' && args.includes('remote')) return { code: 0, stdout: 'https://github.com/acme/repo.git\n', stderr: '' };
    if (command === 'git' && args.includes('show')) {
      const shas = args.slice(args.indexOf('--format=%H%x1f%s') + 1);
      if (shas.some(sha => !options.subjects?.[sha])) return { code: 128, stdout: '', stderr: 'bad object' };
      return { code: 0, stdout: shas.map(sha => `${sha}\x1f${options.subjects?.[sha]}`).join('\n') + '\n', stderr: '' };
    }
    if (command === 'gh') {
      if (options.ghFails) return { code: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' };
      const endpoint = args[1].replace('repos/acme/repo/', '');
      const value = options.gh?.[endpoint];
      return value === undefined ? { code: 1, stdout: '', stderr: `unexpected ${endpoint}` } : { code: 0, stdout: `${value}\n`, stderr: '' };
    }
    return { code: 127, stdout: '', stderr: 'unknown' };
  };
}

// bootstrap verifier role의 verifier-logs(ls -lAR·tail -n N·cat)를 흉내 낸다.
function fakeVerifierLogs(base: Exec): Exec {
  return async (command, args, timeout) => {
    if (command !== 'ssh') return base(command, args, timeout);
    calls.push(['ssh', ...args].join(' '));
    const remote = args.slice(args.indexOf('verifier-box') + 1);
    if (remote[0] === 'ls') {
      const names = await readdir(logs);
      return { code: 0, stdout: `total 8\n${names.map(name => `-rw-------  1 yw  staff  10 Nov 15 16:01 ${name}`).join('\n')}\n\n./sub:\n-rw------- 1 yw staff 1 Nov 1 00:00 p-run-hidden.log\n`, stderr: '' };
    }
    const file = path.join(logs, remote.at(-1) ?? '');
    const text = await readFile(file, 'utf8').catch(() => null);
    if (text === null) return { code: 2, stdout: '', stderr: 'verifier-logs: 거부: 없는 경로' };
    if (remote[0] === 'tail') return { code: 0, stdout: text.split('\n').slice(-Number(remote[2]) - 1).join('\n'), stderr: '' };
    return { code: 0, stdout: text, stderr: '' };
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
    expect(status.recent[1].lanes.map(lane => [lane.name, lane.state, lane.seconds])).toEqual([['install', 'passed', 13], ['app-packages', 'failed', 118], ['release-prepare-dry-run', 'passed', 229]]);
    expect(status.recent[1].failures[0]).toMatchObject({ lane: 'app-packages', reason: 'failure-unidentified' });
    expect(status.laneMedians).toEqual({ install: 13, 'release-prepare-dry-run': 229 });
    expect(status.redSince).toBe('2026-11-15T06:56:28.669Z');
    expect(status.repoUrl).toBe('https://github.com/acme/repo');
    expect(status.stats.map(stats => stats.hours)).toEqual([24, 168]);
    expect(status.lastSuccess?.sha).toBe(SHA_A);
    expect(status.failureStreak).toBe(1);
    expect(status.typicalRunSeconds).toBe(6138);
    expect(status.disk).toEqual({ availableKib: 38545204, minimumKib: 10485760, measuredAt: null });
    expect(status.source).toEqual({ kind: 'local', target: null });
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

  it('reads commit subjects once and tolerates missing commits', async () => {
    const instance = collector(fakeExec({ running: false, subjects: { [SHA_A]: 'feat: a (#1)' } }));
    const status = await instance.status({ includeGithub: false });
    expect(status.recent.map(run => run.subject)).toEqual(['feat: a (#1)', null]);
    const shows = calls.filter(call => call.includes(' show ')).length;
    await instance.status({ includeGithub: false, refresh: true });
    expect(calls.filter(call => call.includes(' show ')).length).toBe(shows);
  });

  it('reads a remote verifier through the read-only SSH channel', async () => {
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    await writeFile(path.join(logs, 'p-run-20261115-160131-tip-full-cccccccccccc.log'), runningLog.replace(/2026-11-15T07:01:31\.\d+Z/g, startedAt));
    const exec = fakeVerifierLogs(fakeExec({ running: false }));
    const remote = new Collector({ project: 'p', stateDir: '/nonexistent', checkout: root, launchLabel: 'unused', sshTarget: 'verifier-box' }, exec);
    const status = await remote.status({ includeGithub: false });
    expect(status.source).toEqual({ kind: 'ssh', target: 'verifier-box' });
    expect(status.agent).toBeNull();
    expect(status.current).toMatchObject({ sha: SHA_C, phase: 'lanes' });
    expect(status.recent.map(run => run.status)).toEqual(['success', 'failure']);
    expect(status.recent[1].failedLanes).toEqual(['app-packages']);
    // 원격에서는 df를 못 하므로 마지막 preflight 기록을 쓴다.
    expect(status.disk).toEqual({ availableKib: 41735836, minimumKib: 10485760, measuredAt: '2026-11-15T06:56:28.669Z' });
    expect(status.errors).toEqual([]);
    expect(calls.some(call => call.startsWith('launchctl') || call.startsWith('df'))).toBe(false);
    expect(calls.filter(call => call.startsWith('ssh')).every(call => call.includes('BatchMode=yes'))).toBe(true);
  });

  it('reports an unreachable remote as a warning', async () => {
    const exec: Exec = async (command, args) => (command === 'ssh' ? { code: 255, stdout: '', stderr: 'ssh: connect to host verifier-box: Connection refused' } : fakeExec({ running: false })(command, args));
    const status = await new Collector({ project: 'p', stateDir: '/x', checkout: root, launchLabel: 'x', sshTarget: 'verifier-box' }, exec).status({ includeGithub: false });
    expect(status.recent).toEqual([]);
    expect(status.errors.join(' ')).toContain('Connection refused');
  });

  it('reports deferrals after the last real run', async () => {
    await writeFile(path.join(logs, 'p-summary.log'), summaryLine('2026-11-15T07:00:00.000Z', 'p-run-n.log', SHA_C, 'none', 1, LOW_DISK) + '\n', { flag: 'a' });
    const status = await collector(fakeExec({ running: false })).status({ includeGithub: false });
    expect(status.deferral).toMatchObject({ count: 1, reason: 'disk low-space 9.7GiB' });
    expect(status.beats.map(beat => [beat.status, beat.reason])).toEqual([['success', null], ['failure', null], ['none', 'disk low-space 9.7GiB']]);
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
