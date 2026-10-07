import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

const number = z.number().finite().nonnegative();
const nullable = number.nullable();
export const TOP_APP_LIMIT = 10;
export const diskSchema = z.object({ total: number, used: number, available: number, sampledAt: number });
export const cpuTicksSchema = z.object({ user: number, system: number, idle: number, nice: number });
export const groupSchema = z.object({ name: z.string(), memoryBytes: number, processCount: number.int(), cpuPercent: nullable });
export const processSchema = z.object({ pid: number.int().positive(), start: z.string().regex(/^\d+$/), group: z.string(), name: z.string(), memoryBytes: number, cpuPercent: nullable });
export const processesSchema = z.object({
  ready: z.boolean(), sampledAt: number, excludedPermission: number.int(), excludedRoot: number.int(),
  otherErrors: number.int(), coreCount: number.int().positive(), topCpu: z.array(groupSchema).max(TOP_APP_LIMIT), topMemory: z.array(groupSchema).max(TOP_APP_LIMIT),
});
export const rawSchema = z.object({
  v: z.literal(1), seq: number.int(), t: number, mono: number,
  sys: z.object({
    pageSize: nullable, memsize: nullable,
    vm: z.object({ internal: number.int(), purgeable: number.int(), wire: number.int(), compressor: number.int(), external: number.int(), free: number.int(),
      // 이전 헬퍼는 CPU 등 다른 값은 읽되 메모리 합계를 확인 불가로 처리한다.
      speculative: number.int().nullable().optional().default(null) }).nullable(),
    cpu: cpuTicksSchema.nullable(), swap: z.object({ total: number, used: number }).nullable(),
    pressureLevel: z.number().finite().nullable(), memoryLevel: nullable, disk: diskSchema.nullable().optional(),
  }),
  // 정리 검사의 제한된 원시 관찰은 서버 내부에서만 사용한다.
  procs: processesSchema.extend({ members: z.array(processSchema).optional(), inspection: z.unknown().optional() }).nullable(),
  history: z.unknown().optional(), errors: z.array(z.string()),
});
export const snapshotSchema = z.object({
  seq: nullable, sampledAt: nullable, ageMs: nullable,
  status: z.enum(['warming', 'ok', 'stale', 'error', 'unsupported']),
  helperMode: z.enum(['native', 'node', 'unsupported']),
  cpu: z.object({ total: number.max(100), user: number.max(100), system: number.max(100) }).nullable(),
  memory: z.object({ app: number, wired: number, compressed: number, cached: number, used: number, total: number }).nullable(),
  pressure: z.enum(['normal', 'warning', 'critical', 'unknown']), memoryLevel: nullable,
  swap: z.object({ total: number, used: number }).nullable(),
  disk: diskSchema.nullable().optional(),
  processes: processesSchema.nullable(), processesStatus: z.enum(['off', 'warming', 'ok', 'stale', 'error', 'unsupported']),
  errors: z.array(z.string()),
});
export const snapshotRpc = defineRpc({ name: 'mac-monitor.snapshot.get', input: z.object({ includeProcesses: z.boolean() }), output: snapshotSchema });
export const hostInfoSchema = z.object({ hostname: z.string(), platform: z.string(), helperMode: z.enum(['native', 'node', 'unsupported']), version: z.string() });
export const hostInfoRpc = defineRpc({ name: 'mac-monitor.host.info', input: z.object({}), output: hostInfoSchema });
export const processListRpc = defineRpc({ name: 'mac-monitor.processes.list', input: z.object({ group: z.string().max(256) }),
  output: z.object({ status: snapshotSchema.shape.processesStatus, sampledAt: nullable, entries: z.array(processSchema) }) });
export const terminateRpc = defineRpc({ name: 'mac-monitor.process.terminate', input: processSchema.pick({ pid: true, start: true, group: true }),
  output: z.object({ sent: z.boolean(), error: z.string().optional() }) });
export const terminateGroupRpc = defineRpc({ name: 'mac-monitor.group.terminate',
  input: z.object({ group: z.string().max(256), targets: z.array(processSchema.pick({ pid: true, start: true })).min(1).max(4096)
    .refine(targets => new Set(targets.map(p => p.pid)).size === targets.length, '중복 PID') }),
  output: z.object({ results: z.array(z.object({ pid: number.int().positive(), sent: z.boolean(), error: z.string().optional() })) }) });
export const VERSION = '0.6.0';
export type RawSample = z.infer<typeof rawSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type HostInfo = z.infer<typeof hostInfoSchema>;
export type CpuTicks = z.infer<typeof cpuTicksSchema>;
export type ProcessInfo = z.infer<typeof processSchema>;
