import { defineRpc, defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';

const number = z.number().finite().nonnegative();
const nullable = number.nullable();
export const cpuTicksSchema = z.object({ user: number, system: number, idle: number, nice: number });
export const groupSchema = z.object({ name: z.string(), memoryBytes: number, processCount: number.int(), cpuPercent: nullable });
export const processesSchema = z.object({
  ready: z.boolean(), sampledAt: number, excludedPermission: number.int(), excludedRoot: number.int(),
  otherErrors: number.int(), coreCount: number.int().positive(), topCpu: z.array(groupSchema).max(5), topMemory: z.array(groupSchema).max(5),
});
export const rawSchema = z.object({
  v: z.literal(1), seq: number.int(), t: number, mono: number,
  sys: z.object({
    pageSize: nullable, memsize: nullable,
    vm: z.object({ internal: number, purgeable: number, wire: number, compressor: number, external: number, free: number }).nullable(),
    cpu: cpuTicksSchema.nullable(), swap: z.object({ total: number, used: number }).nullable(),
    pressureLevel: nullable, memoryLevel: nullable,
  }),
  procs: processesSchema.nullable(), errors: z.array(z.string()),
});
export const snapshotSchema = z.object({
  seq: nullable, sampledAt: nullable, ageMs: nullable,
  status: z.enum(['warming', 'ok', 'stale', 'error', 'unsupported']),
  helperMode: z.enum(['native', 'node', 'unsupported']),
  cpu: z.object({ total: number.max(100), user: number.max(100), system: number.max(100) }).nullable(),
  memory: z.object({ app: number, wired: number, compressed: number, cached: number, used: number, total: number }).nullable(),
  pressure: z.enum(['normal', 'warning', 'critical', 'unknown']), memoryLevel: nullable,
  swap: z.object({ total: number, used: number }).nullable(),
  processes: processesSchema.nullable(), processesStatus: z.enum(['off', 'warming', 'ok', 'stale', 'error', 'unsupported']),
  errors: z.array(z.string()),
});
export const snapshotRpc = defineRpc({ name: 'mac-monitor.snapshot.get', input: z.object({ includeProcesses: z.boolean() }), output: snapshotSchema });
export const hostInfoSchema = z.object({ hostname: z.string(), serverId: z.string().optional(), platform: z.string(), helperMode: z.enum(['native', 'node', 'unsupported']), version: z.string() });
export const hostInfoRpc = defineRpc({ name: 'mac-monitor.host.info', input: z.object({}), output: hostInfoSchema });
export const settings = defineSettings({ id: 'monitor', scope: 'host', version: 1, schema: z.object({ experimentalFleet: z.boolean().default(true) }) });
export const VERSION = '0.1.0';
export type RawSample = z.infer<typeof rawSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type HostInfo = z.infer<typeof hostInfoSchema>;
export type CpuTicks = z.infer<typeof cpuTicksSchema>;
