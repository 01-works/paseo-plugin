import type { CpuTicks, RawSample, Snapshot } from './contracts';

export function computeMemory(sys: RawSample['sys']): Snapshot['memory'] {
  const { vm, pageSize, memsize } = sys;
  if (!vm || pageSize === null || pageSize <= 0 || memsize === null || memsize <= 0 || vm.speculative === null
    || vm.free < vm.speculative || vm.internal < vm.purgeable) return null;
  const app = (vm.internal - vm.purgeable) * pageSize;
  const wired = vm.wire * pageSize;
  const compressed = vm.compressor * pageSize;
  // Activity Monitor 합계. free_count에는 speculative이 이미 들어 있으므로 중복 제외하지 않는다.
  const used = memsize - (vm.free - vm.speculative + vm.external) * pageSize;
  const memory = { app, wired, compressed, cached: (vm.external + vm.purgeable) * pageSize, used, total: memsize };
  if (!Number.isSafeInteger(pageSize) || Object.values(memory).some(value => !Number.isSafeInteger(value) || value < 0)) return null;
  return memory;
}
export function computeCpu(current: CpuTicks | null, previous: CpuTicks | null): Snapshot['cpu'] {
  if (!current || !previous) return null;
  const keys = ['user', 'nice', 'system', 'idle'] as const;
  const d = keys.map(key => current[key] - previous[key]);
  if (d.some(value => value < 0)) return null; // 리셋/32비트 tick 역행: 새 기준점 필요
  const total = d.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  const user = (d[0] + d[1]) / total * 100;
  const system = d[2] / total * 100;
  return { total: Math.min(100, user + system), user, system };
}
export function pressure(level: number | null): Snapshot['pressure'] {
  return level === 1 ? 'normal' : level === 2 ? 'warning' : level === 4 ? 'critical' : 'unknown';
}
export function sampleStatus(ageMs: number | null, alive: boolean, hasCpu: boolean, unsupported = false): Snapshot['status'] {
  if (unsupported) return 'unsupported';
  if (!alive || (ageMs !== null && ageMs > 15_000)) return 'error';
  if (ageMs !== null && ageMs > 5_000) return 'stale';
  return hasCpu ? 'ok' : 'warming';
}
export function emptySnapshot(mode: Snapshot['helperMode']): Snapshot {
  return { seq: null, sampledAt: null, ageMs: null, status: mode === 'unsupported' ? 'unsupported' : 'warming', helperMode: mode,
    cpu: null, memory: null, pressure: 'unknown', memoryLevel: null, swap: null, processes: null,
    processesStatus: mode === 'native' ? 'off' : 'unsupported', errors: [] };
}
