import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

// yw-heavy status --json (schema 1). 모르는 필드는 버린다.
const text = z.string().max(8192);
const seconds = z.number().int().nonnegative().nullable();
// pid는 yw-heavy가, directory는 이 플러그인 서버가 pid의 작업 폴더로 채운다.
export const heavyItemSchema = z.object({ id: text.nullable(), pid: z.number().int().positive().nullable().default(null).catch(null),
  directory: z.string().max(8192).nullable().default(null), supervisor: text.nullable(), queued: seconds, state: text });
export const heavySlotSchema = z.object({
  name: text, running: heavyItemSchema.extend({ started: seconds }).nullable(),
  waiting: z.array(heavyItemSchema).max(2048), turns: z.array(text).max(2048).nullable(),
});
export const heavyQueueSchema = z.object({ schema: z.literal(1), mode: text, paused: z.boolean(), slots: z.array(heavySlotSchema).min(1).max(8) });
export const heavyResultSchema = z.object({
  // missing: yw-heavy 없음, unsupported: --json을 모르는 구버전
  status: z.enum(['ok', 'missing', 'unsupported', 'error']), sampledAt: z.number().nonnegative(), queue: heavyQueueSchema.nullable(),
});
export const heavyRpc = defineRpc({ name: 'mac-monitor.heavy.get', input: z.object({}), output: heavyResultSchema });
export type HeavyItem = z.infer<typeof heavyItemSchema>;
export type HeavySlot = z.infer<typeof heavySlotSchema>;
export type HeavyQueue = z.infer<typeof heavyQueueSchema>;
export type HeavyResult = z.infer<typeof heavyResultSchema>;
