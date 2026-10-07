import { constants } from 'node:fs';
import { mkdir, open, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AUTO_MODEL, automaticTargetSchema } from '../../shared/automation';
import type { ProcessInfo, Snapshot } from '../../shared/contracts';
import { paseoHome } from '../host-info';

export const AUDIT_LIMIT = 256 * 1024;
const metricsSchema = z.object({ pressure: z.enum(['normal', 'warning', 'critical', 'unknown']),
  processMemoryBytes: z.number().nonnegative().nullable(), processCpuPercent: z.number().nonnegative().nullable(),
  systemMemoryUsed: z.number().nonnegative().nullable(), memoryLevel: z.number().nullable(), sampledAt: z.number().nullable(), seq: z.number().nullable() });
export const auditSchema = z.object({ v: z.literal(1), at: z.number().finite(), model: z.literal(AUTO_MODEL),
  mode: z.enum(['automatic', 'confirmed']).optional(), reviewedAt: z.number().finite().nonnegative().optional(),
  kind: z.enum(['review', 'planned', 'sent', 'refused', 'cancelled', 'exited', 'running', 'unknown']),
  target: automaticTargetSchema.extend({ path: z.string().max(511).nullable() }),
  decision: z.enum(['normal', 'observe', 'terminate']), reason: z.string().max(500),
  before: metricsSchema, after: metricsSchema.optional(), });
export type AuditRecord = z.infer<typeof auditSchema>;
export type Auditor = (record: AuditRecord) => Promise<void>;
export function auditMetrics(s: Snapshot, p?: ProcessInfo) {
  return { pressure: s.pressure, processMemoryBytes: p?.memoryBytes ?? null, processCpuPercent: p?.cpuPercent ?? null,
    systemMemoryUsed: s.memory?.used ?? null, memoryLevel: s.memoryLevel, sampledAt: s.sampledAt, seq: s.seq };
}
export function auditFile() { return path.join(paseoHome(), 'mac-monitor', 'automatic-actions.jsonl'); }
export function createAuditor(file = auditFile()): Auditor {
  let queue: Promise<void> = Promise.resolve();
  return record => {
    const line = `${JSON.stringify(auditSchema.parse(record))}\n`;
    const work = queue.catch(() => {}).then(async () => {
      await mkdir(path.dirname(file), { recursive: true });
      let size = 0;
      try { size = (await stat(file)).size; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (size + Buffer.byteLength(line) > AUDIT_LIMIT) await rename(file, `${file}.1`);
      const handle = await open(file, constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
      try { await handle.chmod(0o600); await handle.appendFile(line); await handle.sync(); }
      finally { await handle.close(); }
    });
    queue = work; return work;
  };
}
