import { describe, expect, it } from 'vitest';
import type { VerifierStatus } from '../shared/contracts';
import { estimateRun, formatDuration, headline, isSlow, prNumber } from '../shared/summary';

const base: VerifierStatus = {
  collectedAt: '2026-11-15T07:00:00.000Z',
  agent: { loaded: true, running: false, runs: 1, intervalSeconds: 300 },
  current: null,
  recent: [],
  laneMedians: {},
  beats: [],
  redSince: null,
  stats: [],
  repoUrl: null,
  lastSuccess: null,
  failureStreak: 0,
  deferral: null,
  typicalRunSeconds: 6000,
  disk: null,
  github: null,
  githubError: null,
  errors: [],
};
const run = (status: 'success' | 'failure', sha: string) => ({ endedAt: '2026-11-15T06:00:00.000Z', sha, subject: null, status, runSeconds: 6000, failedLanes: [], lanes: [], failures: [] });

describe('headline', () => {
  it('orders off > running > deferred > last result', () => {
    expect(headline({ ...base, agent: { ...base.agent, loaded: false } })).toEqual({ tone: 'danger', label: 'LaunchAgent 꺼짐' });
    const current = { sha: 'c'.repeat(40), subject: null, startedAt: null, lanesStartedAt: null, failures: [], phase: 'lanes' as const, lanes: [
      { name: 'a', state: 'passed' as const, seconds: 1 }, { name: 'b', state: 'failed' as const, seconds: 1 }, { name: 'c', state: 'running' as const, seconds: null },
    ] };
    expect(headline({ ...base, current, deferral: { since: '', count: 1, reason: 'x' } })).toEqual({ tone: 'warning', label: '실행 중 2/3 · 실패 1 · ccccccc' });
    expect(headline({ ...base, current: { ...current, phase: 'waiting-lock', lanes: [] } }).label).toBe('lock 대기 · ccccccc');
    expect(headline({ ...base, deferral: { since: '', count: 2, reason: 'disk low-space 9.7GiB' }, recent: [run('success', 'a'.repeat(40))] }).label).toBe('연기 · disk low-space 9.7GiB');
    expect(headline({ ...base, recent: [run('failure', 'b'.repeat(40))], failureStreak: 3 })).toEqual({ tone: 'danger', label: '실패 3연속 · bbbbbbb' });
    expect(headline({ ...base, recent: [run('success', 'a'.repeat(40))] })).toEqual({ tone: 'success', label: '대기 · 통과 aaaaaaa' });
    expect(headline(base).label).toBe('실행 기록 없음');
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45초');
    expect(formatDuration(600)).toBe('10분');
    expect(formatDuration(6276)).toBe('1시간 44분');
    expect(formatDuration(7200)).toBe('2시간');
  });
  it('estimates the end from lane medians, else from the typical run time', () => {
    const now = Date.parse('2026-11-15T07:30:00.000Z');
    const current = {
      sha: 'c', subject: null, startedAt: '2026-11-15T07:00:00.000Z', lanesStartedAt: '2026-11-15T07:01:00.000Z', failures: [], phase: 'lanes' as const,
      lanes: [
        { name: 'a', state: 'passed' as const, seconds: 600 },
        { name: 'b', state: 'running' as const, seconds: null },
        { name: 'c', state: 'pending' as const, seconds: null },
      ],
    };
    // b는 07:11에 시작해 19분째. 평소 30분이면 11분, c 평소 10분 → 21분 뒤
    expect(estimateRun({ ...base, current, laneMedians: { a: 600, b: 1800, c: 600 } }, now)).toEqual({ runningLaneSeconds: 1140, endAt: now + 21 * 60_000, perLane: true });
    // c의 기록이 없으면 전체 중앙값(6000초)으로 돌아간다.
    expect(estimateRun({ ...base, current, laneMedians: { b: 1800 } }, now)).toEqual({ runningLaneSeconds: 1140, endAt: Date.parse('2026-11-15T08:40:00.000Z'), perLane: false });
    expect(estimateRun(base, now)).toEqual({ runningLaneSeconds: null, endAt: null, perLane: false });
  });

  it('flags slow lanes and reads PR numbers', () => {
    expect(isSlow(2400, 1200)).toBe(true);
    expect(isSlow(100, 50)).toBe(false);
    expect(isSlow(2400, undefined)).toBe(false);
    expect(prNumber('docs(sdk): add note (#10160)')).toBe('10160');
    expect(prNumber('chore: no pr')).toBeNull();
  });
});
