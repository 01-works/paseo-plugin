import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const goalSchema = z.string().min(1).max(4000).refine(value => value.trim().length > 0, '목표를 입력하세요.');
const identifier = z.string().min(1).max(256).regex(/^[\p{L}\p{N}_.:/-]+$/u);
export const originSchema = z.object({
  serverId: identifier,
  agentId: z.uuid(),
  workspaceId: identifier,
  projectId: identifier,
  directory: z.string().min(1).max(4096),
});
export type Origin = z.infer<typeof originSchema>;

export const runtimeRpc = defineRpc({
  name: 'runtime.get',
  input: z.object({}),
  output: z.object({ serverId: identifier, version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+].*)?$/) }),
});

export const createLaneRpc = defineRpc({
  name: 'lane.create',
  input: z.object({ goal: goalSchema, origin: originSchema, provider: z.string().min(1).max(256).regex(/^[^\r\n\u0000]+$/) }),
  output: z.object({ name: z.string(), path: z.string() }),
});
export const bindLaneRpc = defineRpc({
  name: 'lane.bind',
  input: z.object({ name: z.string().min(1).max(160), agentId: z.uuid() }),
  output: z.object({ linked: z.literal(true) }),
});
