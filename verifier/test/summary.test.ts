import { describe, expect, it } from 'vitest';
import type { VerifierStatus } from '../shared/contracts';
import { estimatedEnd, formatDuration, headline } from '../shared/summary';

const base: VerifierStatus = {
  collectedAt: '2026-11-15T07:00:00.000Z',
  agent: { loaded: true, running: false, runs: 1, intervalSeconds: 300 },
  current: null,
  recent: [],
  lastSuccess: null,
  failureStreak: 0,
  deferral: null,
  typicalRunSeconds: 6000,
  disk: null,
  github: null,
  githubError: null,
  errors: [],
};
const run = (status: 'success' | 'failure', sha: string) => ({ endedAt: '2026-11-15T06:00:00.000Z', sha, status, runSeconds: 6000, failedLanes: [] });

describe('headline', () => {
  it('orders off > running > deferred > last result', () => {
    expect(headline({ ...base, agent: { ...base.agent, loaded: false } })).toEqual({ tone: 'danger', label: 'LaunchAgent 꺼짐' });
    const current = { sha: 'c'.repeat(40), startedAt: null, phase: 'lanes' as const, lanes: [
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
  it('estimates the end from the typical run time', () => {
    const current = { sha: 'c', startedAt: '2026-11-15T07:00:00.000Z', phase: 'lanes' as const, lanes: [] };
    expect(estimatedEnd({ ...base, current })).toBe(Date.parse('2026-11-15T08:40:00.000Z'));
    expect(estimatedEnd({ ...base, current, typicalRunSeconds: null })).toBeNull();
  });
});
