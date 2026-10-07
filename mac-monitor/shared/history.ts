import { z } from 'zod';

export const HISTORY_INTERVAL_MS = 60_000;
export const HISTORY_RETENTION_MS = 60 * HISTORY_INTERVAL_MS;
export const HISTORY_PROCESS_LIMIT = 512;
export const HISTORY_FRAME_LIMIT = 61;
export const HISTORY_MAX_GAP_MS = 90_000;
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const percent = z.number().finite().nonnegative().max(100);
const start = z.string().regex(/^\d{1,20}$/).refine(value => /^\d{1,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) < 2n ** 64n);
export const historyFrameSchema = z.object({
  coreCount: z.number().int().positive().max(1024), truncated: z.boolean(),
  entries: z.array(z.object({ pid: z.number().int().positive().max(2 ** 31 - 1), start,
    cpuTimeMs: z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER),
    memoryBytes: bytes, readBytes: bytes, writtenBytes: bytes,
  })).max(HISTORY_PROCESS_LIMIT).refine(items => new Set(items.map(p => p.pid)).size === items.length, '중복 PID'),
});
export const historySummarySchema = z.object({
  sampledAt: z.number().finite().nonnegative(), observedSeconds: z.number().finite().positive(),
  sampleCount: z.number().int().min(2).max(HISTORY_FRAME_LIMIT),
  averageCpuPercent: percent, maxMinuteCpuPercent: percent,
  memoryDeltaBytes: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  peakMemoryBytes: bytes, readBytes: bytes, writtenBytes: bytes, limited: z.boolean(),
});
export type HistoryFrame = z.infer<typeof historyFrameSchema>;
export type HistorySummary = z.infer<typeof historySummarySchema>;
