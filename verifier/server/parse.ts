import type { CurrentRun, Deferral, Lane, Run } from '../shared/contracts';

// verifier가 남기는 텍스트 형식을 읽는 순수 함수들. 형식 근거는 01-software의
// scripts/release/verifier-loop.mjs(summary)와 nightly-local-check.mjs(lane 표시)다.

export interface PreflightItem {
  item: string;
  ready: boolean;
  measurement?: string;
  reason?: string;
}

export interface SummaryEntry {
  at: string;
  log: string;
  sha: string;
  exit: number | null;
  status: 'success' | 'failure' | 'none';
  runSeconds: number | null;
  preflight: PreflightItem[];
}

function field(line: string, key: string): string | undefined {
  return new RegExp(`(?:^| )${key}=(\\S+)`).exec(line)?.[1];
}

function numberField(line: string, key: string): number | null {
  const value = field(line, key);
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}

function jsonField(line: string, key: string): unknown {
  // 값은 공백 없는 JSON이고 다음 ` key=` 또는 줄 끝에서 끝난다.
  const match = new RegExp(`(?:^| )${key}=(.*?)(?= [a-z_]+=|$)`).exec(line);
  if (!match) return undefined;
  try {
    return JSON.parse(match[1]);
  } catch {
    return undefined;
  }
}

export function parseSummaryLine(line: string): SummaryEntry | null {
  const at = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) /.exec(line)?.[1];
  const log = field(line, 'log');
  const sha = field(line, 'sha');
  const status = field(line, 'status');
  if (!at || !log || !sha || (status !== 'success' && status !== 'failure' && status !== 'none')) return null;
  const preflight = jsonField(line, 'preflight');
  return {
    at,
    log,
    sha,
    exit: numberField(line, 'exit'),
    status,
    runSeconds: numberField(line, 'run_s'),
    preflight: Array.isArray(preflight)
      ? preflight.filter((item): item is PreflightItem => typeof item?.item === 'string' && typeof item?.ready === 'boolean')
      : [],
  };
}

export function parseSummary(text: string): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  for (const line of text.split('\n')) {
    const entry = parseSummaryLine(line.trim());
    if (entry) entries.push(entry);
  }
  return entries;
}

export interface RunLog {
  startedAt: string | null;
  sha: string | null;
  waitingLock: boolean;
  order: string[] | null;
  lanes: Map<string, { state: Lane['state']; seconds: number | null }>;
  failedLanes: string[] | null;
}

export function parseRunLog(text: string): RunLog {
  const result: RunLog = { startedAt: null, sha: null, waitingLock: false, order: null, lanes: new Map(), failedLanes: null };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const stamped = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z) (.*)$/.exec(line);
    if (stamped) {
      result.startedAt ??= stamped[1];
      const body = stamped[2];
      const target = /^Target \w+ ([0-9a-f]{40})/.exec(body);
      if (target) result.sha = target[1];
      if (/^Waiting for /.test(body)) result.waitingLock = true;
      if (/^Heavy authority acquired/.test(body)) result.waitingLock = false;
      continue;
    }
    const order = /^Lane order summary: (\{.*\})$/.exec(line);
    if (order) {
      try {
        const parsed = JSON.parse(order[1]);
        if (Array.isArray(parsed?.order) && parsed.order.every((name: unknown) => typeof name === 'string')) result.order = parsed.order;
      } catch {
        // 깨진 줄은 건너뛴다.
      }
      continue;
    }
    const lane = /^\[([a-z0-9-]+)\] (start|passed|failed)(?: in (\d+)s)?/.exec(line);
    if (lane) {
      const [, name, event, seconds] = lane;
      result.lanes.set(name, {
        state: event === 'start' ? 'running' : event,
        seconds: seconds === undefined ? null : Number(seconds),
      } as { state: Lane['state']; seconds: number | null });
      continue;
    }
    const total = /^Total \d+s; (success|failure)(?:: (.*))?$/.exec(line);
    if (total) {
      const failed = total[1] === 'failure' ? /^Failed: (.*)$/.exec(total[2] ?? '')?.[1] : undefined;
      result.failedLanes = failed ? failed.split(',').map(name => name.trim()).filter(Boolean) : [];
    }
  }
  return result;
}

export function currentRunFrom(log: RunLog, fallbackSha: string): CurrentRun {
  const names = log.order ?? [...log.lanes.keys()];
  const lanes: Lane[] = names.map(name => {
    const seen = log.lanes.get(name);
    return { name, state: seen?.state ?? 'pending', seconds: seen?.seconds ?? null };
  });
  // 순서 요약에 없던 lane도 버리지 않는다.
  for (const [name, seen] of log.lanes) if (!names.includes(name)) lanes.push({ name, ...seen });
  return {
    sha: log.sha ?? fallbackSha,
    startedAt: log.startedAt,
    phase: log.waitingLock && log.lanes.size === 0 ? 'waiting-lock' : 'lanes',
    lanes,
  };
}

export interface LaunchAgent {
  loaded: boolean;
  running: boolean;
  runs: number | null;
  intervalSeconds: number | null;
}

export function parseLaunchctl(text: string, exitCode: number): LaunchAgent {
  if (exitCode !== 0) return { loaded: false, running: false, runs: null, intervalSeconds: null };
  // 최상위 속성은 탭 하나로 들여쓴다. 더 깊은 state(소켓 등)는 무시한다.
  const top = (key: string) => new RegExp(`^\\t${key} = (.+)$`, 'm').exec(text)?.[1]?.trim();
  const runs = top('runs');
  const interval = top('run interval');
  return {
    loaded: true,
    running: top('state') === 'running',
    runs: runs && /^\d+$/.test(runs) ? Number(runs) : null,
    intervalSeconds: interval ? Number(/^(\d+)/.exec(interval)?.[1] ?? NaN) || null : null,
  };
}

export function parseDfAvailableKib(text: string): number | null {
  // verifier preflight와 같은 `df -Pk` 출력의 마지막 줄 4번째 열
  const available = text.trim().split('\n').at(-1)?.trim().split(/\s+/)[3];
  return available && /^\d+$/.test(available) ? Number(available) : null;
}

export function minimumKibFrom(entries: SummaryEntry[]): number | null {
  for (let index = entries.length - 1; index >= 0; index--) {
    const disk = entries[index].preflight.find(item => item.item === 'disk');
    const minimum = disk?.measurement ? /minimum_kib=(\d+)/.exec(disk.measurement)?.[1] : undefined;
    if (minimum) return Number(minimum);
  }
  return null;
}

export function deferralReason(entry: SummaryEntry): string {
  const blocked = entry.preflight.filter(item => !item.ready);
  if (blocked.length === 0) return `exit=${entry.exit ?? '?'}`;
  return blocked
    .map(item => {
      const kib = item.item === 'disk' ? /available_kib=(\d+)/.exec(item.measurement ?? '')?.[1] : undefined;
      const detail = kib ? ` ${(Number(kib) / 1024 / 1024).toFixed(1)}GiB` : '';
      return `${item.item} ${item.reason ?? 'not-ready'}${detail}`;
    })
    .join(', ');
}

/** 마지막 실제 실행 이후 연달아 미뤄진 기록. 마지막 기록이 실제 실행이면 null. */
export function deferralFrom(entries: SummaryEntry[]): Deferral | null {
  let count = 0;
  let index = entries.length - 1;
  while (index >= 0 && entries[index].status === 'none') {
    count++;
    index--;
  }
  if (count === 0) return null;
  const latest = entries[entries.length - 1];
  return { since: entries[index + 1].at, count, reason: deferralReason(latest) };
}

export function failureStreakFrom(runs: Run[]): number {
  let streak = 0;
  for (let index = runs.length - 1; index >= 0 && runs[index].status === 'failure'; index--) streak++;
  return streak;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
