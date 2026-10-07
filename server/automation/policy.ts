import { automaticProtection, processKey, type AutomationConfig, type AutomaticTarget } from '../../shared/automation';
import type { ProcessInfo, Snapshot } from '../../shared/contracts';
import { GiB } from '../../shared/units';

export const POLICY = { historyMs: 60_000, growthBytes: 128 * 1024 ** 2, growthRatio: 0.1, minBytes: GiB, scanMs: 150_000,
  cooldownMs: 15 * 60_000, dailyReviews: 6, maxCandidates: 4, maxHistories: 24 } as const;
export type Point = { t: number; memoryBytes: number; cpuPercent: number | null };
export type Candidate = { process: ProcessInfo; points: Point[]; growthBytes: number; approved: boolean };
export function healthy(s: Snapshot) {
  return s.helperMode === 'native' && s.status === 'ok' && s.ageMs !== null && s.ageMs <= 5000 && s.memory !== null
    && s.pressure !== 'unknown';
}
export function abovePressure(s: Snapshot, config: AutomationConfig) {
  return healthy(s) && (s.pressure === 'critical' || (config.pressure === 'warning' && s.pressure === 'warning'));
}
export function reviewHeadroom(s: Snapshot, now: number) {
  return Boolean(s.disk && now - s.disk.sampledAt <= 60_000 && s.disk.available >= GiB
    && s.memoryLevel !== null && s.memoryLevel >= 3 && s.cpu && s.cpu.total < 85);
}
export function sameTarget(p: Pick<ProcessInfo, 'pid' | 'start' | 'path' | 'group' | 'name'>, t: AutomaticTarget) {
  return processKey(p) === processKey(t) && p.path === t.path && p.group === t.group && p.name === t.name;
}
export function growing(p: ProcessInfo, points: Point[]) {
  const first = points[0], last = points.at(-1);
  if (!first || !last || last.t - first.t < POLICY.historyMs - 2500 || points.some((x, i) => i > 0 && (x.t <= points[i - 1].t || x.t - points[i - 1].t > 5000))) return false;
  const growth = last.memoryBytes - first.memoryBytes;
  const recent = points.find(x => x.t >= last.t - 10_000)!;
  return p.memoryBytes >= POLICY.minBytes && p.memoryBytes === last.memoryBytes
    && last.memoryBytes > recent.memoryBytes && last.memoryBytes >= points[points.length - 2].memoryBytes
    && growth >= Math.max(POLICY.growthBytes, first.memoryBytes * POLICY.growthRatio);
}
export function canAutomaticallyTerminate(p: ProcessInfo, c: Candidate, targets: AutomaticTarget[]) {
  return !automaticProtection(p) && targets.some(t => sameTarget(p, t)) && sameTarget(p, { ...c.process, path: c.process.path ?? '' })
    && p.cpuPercent !== null && p.cpuPercent < 5 && p.memoryBytes >= c.process.memoryBytes * 0.9;
}
