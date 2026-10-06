import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const AUTO_MODEL = 'gpt-6-luna';
export const automaticTargetSchema = z.object({
  pid: z.number().int().positive(), start: z.string().max(20).regex(/^\d+$/),
  group: z.string().max(256), name: z.string().max(256), path: z.string().max(511),
});
export const automationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  pressure: z.enum(['warning', 'critical']).default('critical'),
  sustainedSeconds: z.number().int().min(60).max(600).default(120),
});
export const automationEventSchema = z.object({
  at: z.number(), kind: z.enum(['review', 'skipped', 'sent', 'exited', 'still-running', 'error']),
  message: z.string().max(500), pid: z.number().int().positive().optional(),
});
export const automationStatusSchema = z.object({
  enabled: z.boolean(), phase: z.enum(['off', 'idle', 'watching', 'sampling', 'reviewing', 'cooldown', 'error']),
  model: z.literal(AUTO_MODEL), targetCount: z.number().int().nonnegative(),
  lastEvent: automationEventSchema.nullable(),
});
export const automationReportSchema = z.object({
  config: automationConfigSchema, targets: z.array(automaticTargetSchema).max(32),
  status: automationStatusSchema, events: z.array(automationEventSchema).max(20),
});
export const automationReportRpc = defineRpc({ name: 'mac-monitor.automation.get', input: z.object({}), output: automationReportSchema });
export const automationConfigureRpc = defineRpc({ name: 'mac-monitor.automation.configure', input: automationConfigSchema, output: automationReportSchema });
export const automationTargetRpc = defineRpc({ name: 'mac-monitor.automation.target',
  input: z.object({ pid: z.number().int().positive(), start: z.string().max(20).regex(/^\d+$/), group: z.string().max(256), allow: z.boolean() }),
  output: z.object({ changed: z.boolean(), error: z.string().optional() }) });
export const reviewResultSchema = z.object({
  decisions: z.array(z.object({ key: z.string().max(80), decision: z.enum(['normal', 'observe', 'terminate']), reason: z.string().min(1).max(240) }).strict()).max(4),
}).strict();
export type AutomationConfig = z.infer<typeof automationConfigSchema>;
export type AutomaticTarget = z.infer<typeof automaticTargetSchema>;
export type AutomationEvent = z.infer<typeof automationEventSchema>;
export type AutomationStatus = z.infer<typeof automationStatusSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export const processKey = (p: { pid: number; start: string }) => `${p.pid}:${p.start}`;

export function automaticProtection(p: { group: string; name: string; path?: string | null }): string | null {
  if (!p.path || !p.path.startsWith('/') || p.path.length > 511 || p.path.includes('\0')) return '실행 경로 확인 불가';
  if (/\.app\//i.test(p.path) || /^\/(system|usr\/libexec|usr\/sbin|sbin)\//i.test(p.path)) return '앱·시스템 프로세스 보호';
  if (/(paseo|codex|claude|macmon-helper|chrome|safari|firefox|terminal|iterm|warp)/i.test(`${p.group}\n${p.name}\n${p.path}`)) return '작업·브라우저·터미널 보호';
  return null;
}
