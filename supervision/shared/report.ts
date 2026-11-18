import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

const text = z.string().trim().min(1).max(4000);
export const reportSchema = z.object({
  items: z.array(z.object({
    id: z.string().trim().min(1).max(128), summary: text,
    status: z.enum(['open', 'done', 'deferred']), evidence: text.optional(), deferredBy: text.optional(),
  })).min(1).max(200),
  turnEnd: z.object({
    kind: z.enum(['next_action', 'waiting', 'user_decision', 'done']), detail: text,
    resume: z.object({ type: z.enum(['child', 'pr_check', 'heavy', 'time', 'user']), ref: text }).optional(),
  }),
  decisions: z.array(z.object({ question: text, options: z.array(text).min(2).max(20), recommendation: text, impact: text })).max(50),
}).superRefine((report, ctx) => {
  const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: 'custom', message, path });
  const ids = new Set<string>();
  report.items.forEach((item, index) => {
    if (ids.has(item.id)) issue(`항목 ID가 중복됩니다: ${item.id}`, ['items', index, 'id']);
    ids.add(item.id);
    if (item.status === 'done' && !item.evidence) issue(`완료 근거(evidence)가 필요합니다: ${item.id}`, ['items', index, 'evidence']);
    if (item.status === 'deferred' && !item.deferredBy) issue(`사용자 연기 결정 출처(deferredBy)가 필요합니다: ${item.id}`, ['items', index, 'deferredBy']);
  });
  if (report.turnEnd.kind === 'waiting' && !report.turnEnd.resume) issue('대기에는 재개 조건(resume)이 필요합니다.', ['turnEnd', 'resume']);
  const open = report.items.filter(item => item.status === 'open');
  if (report.turnEnd.kind === 'done' && open.length) issue(`열린 항목이 남았습니다: ${open.map(item => `${item.id} (${item.summary})`).join(', ')}`, ['turnEnd', 'kind']);
});
export const reportInputSchema = z.object({
  ...reportSchema.shape,
  laneDir: z.string().min(1).max(4096).optional().describe('기존 감독의 cwd가 lane 밖일 때만 지정하는 yw-supervisor 아래 lane 절대 경로'),
}).superRefine((input, ctx) => {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
});
export const stateSchema = z.object({
  version: z.literal(1), agentId: z.string().min(1), serverId: z.string().min(1), title: text,
  reportedAt: z.iso.datetime(), report: reportSchema,
});
export type Report = z.infer<typeof reportSchema>;
export type ReportState = z.infer<typeof stateSchema>;
export const laneStateSchema = z.object({ laneDir: z.string(), state: stateSchema.nullable(), error: z.string().optional() });
export type LaneState = z.infer<typeof laneStateSchema>;
export const listReportsRpc = defineRpc({ name: 'state.list', input: z.object({}), output: z.array(laneStateSchema) });
