import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';
import { processSchema } from './contracts';
import { historySummarySchema } from './history';

export const CLEANUP_MODEL = 'gpt-6-luna';
export const CLEANUP_LIMIT = 16;
export const OBSERVE_MS = 12_000;
export const RESULT_TTL_MS = 10 * 60_000;
export const MIN_AGE_SECONDS = 30 * 60;
export const MAX_CPU_PERCENT = 0.1; // 시스템 표시와 같은 전 코어 합산 척도
const number = z.number().finite().nonnegative();
export const observedProcessSchema = processSchema.extend({
  ageSeconds: number, parentPid: number.int(), readBytes: number, writtenBytes: number,
});
export const inspectionSchema = z.object({ entries: z.array(observedProcessSchema).max(128), truncated: z.boolean(), ready: z.boolean().optional() });
export const metadataSchema = processSchema.pick({ pid: true, start: true, group: true, name: true }).extend({
  path: z.string().max(4096).nullable(), cwd: z.string().max(4096).nullable(),
  args: z.array(z.string().max(512)).max(32).nullable(), parentPid: number.int(),
  parentName: z.string().max(256).nullable(), protected: z.boolean(), issues: z.array(z.string()).max(8),
  cpuPercent: number.nullable(),
});
export const decisionSchema = z.enum(['candidate', 'keep', 'uncertain']);
export const reviewResultSchema = z.object({ decisions: z.array(z.object({
  key: z.string().max(80), decision: decisionSchema, reason: z.string().min(1).max(240),
}).strict()).max(CLEANUP_LIMIT) }).strict();
export const cleanupItemSchema = processSchema.extend({
  ageSeconds: number, observedSeconds: number, maxCpuPercent: number, readBytes: number, writtenBytes: number,
  observationSource: z.enum(['live', 'history']).optional(),
  command: z.string().max(2048).nullable(), cwd: z.string().max(4096).nullable(),
  parentPid: number.int(), parentName: z.string().max(256).nullable(),
  decision: decisionSchema, reason: z.string().max(240),
  history: historySummarySchema.nullable().optional(),
});
export const cleanupStateSchema = z.object({
  id: z.string().uuid(), phase: z.enum(['observing', 'reviewing', 'ready', 'error', 'cancelled']),
  observedSeconds: number, sampledAt: number.nullable(), expiresAt: number.nullable(),
  observationSource: z.enum(['live', 'history']).optional(),
  items: z.array(cleanupItemSchema).max(CLEANUP_LIMIT), truncated: z.boolean(), error: z.string().optional(),
});
const id = z.object({ id: z.string().uuid() });
const target = processSchema.pick({ pid: true, start: true });
export const cleanupStartRpc = defineRpc({ name: 'mac-monitor.cleanup.start', input: z.object({}), output: cleanupStateSchema });
export const cleanupGetRpc = defineRpc({ name: 'mac-monitor.cleanup.get', input: id, output: cleanupStateSchema });
export const cleanupCancelRpc = defineRpc({ name: 'mac-monitor.cleanup.cancel', input: id, output: z.object({ cancelled: z.boolean() }) });
export const cleanupTerminateRpc = defineRpc({ name: 'mac-monitor.cleanup.terminate', input: id.extend({
  targets: z.array(target).min(1).max(CLEANUP_LIMIT).refine(items => new Set(items.map(processKey)).size === items.length, '중복 대상'),
}), output: z.object({ results: z.array(target.extend({ sent: z.boolean(), error: z.string().optional() })) }) });
export function processKey(process: { pid: number; start: string }): string { return `${process.pid}:${process.start}`; }
export type ObservedProcess = z.infer<typeof observedProcessSchema>;
export type Inspection = z.infer<typeof inspectionSchema>;
export type ProcessMetadata = z.infer<typeof metadataSchema>;
export type CleanupItem = z.infer<typeof cleanupItemSchema>;
export type CleanupState = z.infer<typeof cleanupStateSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
