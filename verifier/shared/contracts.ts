import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const laneSchema = z.object({
  name: z.string(),
  state: z.enum(['pending', 'running', 'passed', 'failed']),
  seconds: z.number().nullable(),
});

export const currentRunSchema = z.object({
  sha: z.string(),
  startedAt: z.string().nullable(),
  // heavy lock을 아직 못 잡았으면 waiting-lock이다.
  phase: z.enum(['waiting-lock', 'lanes']),
  lanes: z.array(laneSchema),
});

export const runSchema = z.object({
  endedAt: z.string(),
  sha: z.string(),
  status: z.enum(['success', 'failure']),
  runSeconds: z.number().nullable(),
  failedLanes: z.array(z.string()),
});

export const deferralSchema = z.object({
  since: z.string(),
  count: z.number(),
  reason: z.string(),
});

export const githubSchema = z.object({
  fetchedAt: z.string(),
  devSha: z.string(),
  mainSha: z.string(),
  devAheadOfMain: z.number(),
  // main에 아직 없는, verifier를 통과한 가장 최근 SHA
  candidate: z.object({ sha: z.string(), aheadOfMain: z.number() }).nullable(),
});

export const statusSchema = z.object({
  collectedAt: z.string(),
  agent: z.object({
    loaded: z.boolean(),
    running: z.boolean(),
    runs: z.number().nullable(),
    intervalSeconds: z.number().nullable(),
  }),
  current: currentRunSchema.nullable(),
  recent: z.array(runSchema),
  lastSuccess: runSchema.nullable(),
  failureStreak: z.number(),
  deferral: deferralSchema.nullable(),
  typicalRunSeconds: z.number().nullable(),
  disk: z.object({ availableKib: z.number(), minimumKib: z.number() }).nullable(),
  github: githubSchema.nullable(),
  githubError: z.string().nullable(),
  errors: z.array(z.string()),
});

export type Lane = z.infer<typeof laneSchema>;
export type CurrentRun = z.infer<typeof currentRunSchema>;
export type Run = z.infer<typeof runSchema>;
export type Deferral = z.infer<typeof deferralSchema>;
export type GithubStatus = z.infer<typeof githubSchema>;
export type VerifierStatus = z.infer<typeof statusSchema>;

export const statusRpc = defineRpc({
  name: 'verifier.status',
  input: z.object({ includeGithub: z.boolean(), refresh: z.boolean().optional() }),
  output: statusSchema,
});

// verifier preflight의 고정 기준(nightly-local-check.mjs)과 같은 값이다.
export const DISK_MINIMUM_KIB = 10 * 1024 * 1024;
