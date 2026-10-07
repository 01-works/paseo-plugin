import path from 'node:path';
import { homedir } from 'node:os';
import { CLEANUP_LIMIT, MAX_CPU_PERCENT, MIN_AGE_SECONDS, processKey,
  type CleanupItem, type ObservedProcess, type ProcessMetadata } from '../shared/cleanup';

type Track = { first: ObservedProcess; last: ObservedProcess; since: number; points: number; maxCpu: number };
export class Observation {
  private tracks = new Map<string, Track>();
  private firstAt: number | undefined;
  private lastAt: number | undefined;
  seconds = 0;
  accept(entries: ObservedProcess[], now: number): void {
    if (this.lastAt !== undefined && now <= this.lastAt) return;
    if (this.lastAt !== undefined && now - this.lastAt > 5000) { this.tracks.clear(); this.firstAt = undefined; }
    this.lastAt = now;
    this.firstAt ??= now;
    this.seconds = (now - this.firstAt) / 1000;
    const next = new Map<string, Track>();
    for (const p of entries) {
      if (p.ageSeconds < MIN_AGE_SECONDS || p.cpuPercent === null || p.cpuPercent > MAX_CPU_PERCENT) continue;
      const key = processKey(p), old = this.tracks.get(key);
      if (old && (p.parentPid !== old.last.parentPid || p.readBytes < old.last.readBytes || p.writtenBytes < old.last.writtenBytes
        || p.name !== old.last.name || p.group !== old.last.group)) continue;
      next.set(key, old ? { ...old, last: p, points: old.points + 1, maxCpu: Math.max(old.maxCpu, p.cpuPercent) }
        : { first: p, last: p, since: now, points: 1, maxCpu: p.cpuPercent });
    }
    this.tracks = next;
  }
  candidates(): Omit<CleanupItem, 'command' | 'cwd' | 'parentName' | 'decision' | 'reason'>[] {
    const counts = new Map<string, number>();
    return [...this.tracks.values()].filter(t => t.points >= 6 && this.lastAt! - t.since >= 10_000)
      .sort((a, b) => b.last.memoryBytes - a.last.memoryBytes).filter(t => {
        const count = counts.get(t.last.group) ?? 0; counts.set(t.last.group, count + 1); return count < 2;
      }).slice(0, CLEANUP_LIMIT).map(t => ({ ...t.last, observedSeconds: (this.lastAt! - t.since) / 1000,
        maxCpuPercent: t.maxCpu, readBytes: t.last.readBytes - t.first.readBytes, writtenBytes: t.last.writtenBytes - t.first.writtenBytes }));
  }
}
export function eligibleMetadata(m: ProcessMetadata): boolean {
  if (m.protected || !m.path || !m.args || m.cpuPercent === null || m.cpuPercent > MAX_CPU_PERCENT) return false;
  if (/^(?:\/System\/|\/usr\/(?:libexec|sbin)\/)/.test(m.path)) return false;
  return !/^(?:macmon-helper|codex|claude|paseo|login|launchd)$/i.test(path.basename(m.path))
    && !/(?:^|\/)(?:Paseo|Codex|Claude|Terminal|iTerm|iTerm2)\.app\//i.test(m.path);
}
export function sameMetadata(a: ProcessMetadata, b: ProcessMetadata): boolean {
  return processKey(a) === processKey(b) && a.path === b.path && a.cwd === b.cwd && a.group === b.group && a.name === b.name
    && a.parentPid === b.parentPid && JSON.stringify(a.args) === JSON.stringify(b.args) && eligibleMetadata(b);
}
// argv는 환경 변수를 포함하지 않는다. 모델/UI용 사본에서만 비밀 값과 홈 경로를 가린다.
export function redact(value: string): string {
  return value.replaceAll(homedir(), '~').replace(/(?:sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+)/gi, '[가림]')
    .replace(/((?:token|password|passwd|secret|api[-_]?key|authorization|credential)[=:]\s*)[^\s&]+/gi, '$1[가림]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[가림]@');
}
export function publicCommand(m: ProcessMetadata): string | null {
  if (!m.args) return null;
  let secret = false;
  return m.args.map((arg, i) => {
    if (secret) { secret = false; return '[가림]'; }
    if (/^--?(?:[a-z][\w-]*[-_])?(?:token|password|passwd|secret|api[-_]?key|authorization|credential)$/i.test(arg)) secret = true;
    return redact(i === 0 ? path.basename(arg) : arg);
  }).join(' ').slice(0, 2048);
}
