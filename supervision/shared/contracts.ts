import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const goalSchema = z.string().min(1).max(4000).refine(value => value.trim().length > 0, '목표를 입력하세요.');
const identifier = z.string().min(1).max(256).regex(/^[\p{L}\p{N}_.:/-]+$/u);
const originInput = z.object({ agentId: z.uuid(), workspaceId: identifier, projectId: identifier });
const originSchema = originInput.extend({ serverId: identifier, directory: z.string().min(1).max(4096) });
export type Origin = z.infer<typeof originSchema>;

export const createLaneRpc = defineRpc({
  name: 'lane.create',
  input: z.object({ goal: goalSchema, origin: originInput, provider: z.string().min(1).max(256).regex(/^[^\r\n\u0000]+$/) }),
  output: z.object({ name: z.string(), path: z.string(), agentId: z.uuid(), origin: originSchema }),
});
export const linkOriginRpc = defineRpc({
  name: 'origin.link', input: z.object({ name: z.string().min(1).max(160) }), output: z.object({ linked: z.literal(true) }),
});
export const reportLaneRpc = defineRpc({
  name: 'lane.report', input: z.object({ name: z.string().min(1).max(160), detail: z.string().max(8192) }), output: z.object({}),
});
