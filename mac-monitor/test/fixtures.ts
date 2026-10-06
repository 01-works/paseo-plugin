import type { RawSample } from '../shared/contracts';
export const raw: RawSample = { v: 1, seq: 0, t: 1000, mono: 1000,
  sys: { pageSize: 16384, memsize: 16 * 1024 ** 3, vm: { internal: 100, purgeable: 20, wire: 30, compressor: 40, external: 50, free: 10, speculative: 4 },
    cpu: { user: 100, nice: 10, system: 50, idle: 200 }, swap: { total: 4 * 1024 ** 3, used: 1024 ** 3 }, pressureLevel: 1, memoryLevel: 35 }, procs: null, errors: [] };
