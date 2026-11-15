import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const laneSchema = z.object({
  name: z.string(),
  state: z.enum(['pending', 'running', 'passed', 'failed']),
  seconds: z.number().nullable(),
  // 결과 뒤 괄호 안 설명. 예: `failed (timed out) in 1803s` → "timed out"
  note: z.string().nullable(),
});

export const failureSchema = z.object({
  lane: z.string(),
  classification: z.string(),
  reason: z.string(),
  signature: z.string(),
  // 같은 lane·signature 실패가 이 실행까지 연달아 나온 횟수와, 그 연속의 첫 실행(최근 기록 안에서)
  streak: z.number(),
  firstSha: z.string(),
  firstAt: z.string().nullable(),
});

export const currentRunSchema = z.object({
  sha: z.string(),
  subject: z.string().nullable(),
  startedAt: z.string().nullable(),
  // heavy lock을 잡은 시각. lane 경과 시간 추정의 기준이다.
  lanesStartedAt: z.string().nullable(),
  // heavy lock을 아직 못 잡았으면 waiting-lock이다.
  phase: z.enum(['waiting-lock', 'lanes']),
  lanes: z.array(laneSchema),
  failures: z.array(failureSchema),
});

export const runSchema = z.object({
  endedAt: z.string(),
  sha: z.string(),
  subject: z.string().nullable(),
  status: z.enum(['success', 'failure']),
  runSeconds: z.number().nullable(),
  failedLanes: z.array(z.string()),
  lanes: z.array(laneSchema),
  failures: z.array(failureSchema),
});

export const windowStatsSchema = z.object({
  hours: z.number(),
  runs: z.number(),
  successes: z.number(),
  failures: z.number(),
  deferrals: z.number(),
  medianRunSeconds: z.number().nullable(),
  longestRedSeconds: z.number().nullable(),
});

// 요약 로그 한 줄. 연기된 확인(none)도 포함한다.
export const beatSchema = z.object({
  at: z.string(),
  sha: z.string(),
  status: z.enum(['success', 'failure', 'none']),
  runSeconds: z.number().nullable(),
  reason: z.string().nullable(),
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
  // 원격(SSH)에서 읽으면 LaunchAgent를 볼 수 없어 null이다.
  agent: z
    .object({
      loaded: z.boolean(),
      running: z.boolean(),
      runs: z.number().nullable(),
      intervalSeconds: z.number().nullable(),
    })
    .nullable(),
  source: z.object({ kind: z.enum(['local', 'ssh']), target: z.string().nullable() }),
  current: currentRunSchema.nullable(),
  // 오래된 것부터 최근 순서. 화면의 lane 표와 최근 목록이 함께 쓴다.
  recent: z.array(runSchema),
  // 최근 통과 lane 시간의 중앙값(초)
  laneMedians: z.record(z.string(), z.number()),
  // 최근 요약 기록(오래된 것부터). 연기를 포함한 막대 줄에 쓴다.
  beats: z.array(beatSchema),
  // 마지막 통과 뒤 처음 실패가 관측된 시각. 지금 red가 아니면 null.
  redSince: z.string().nullable(),
  stats: z.array(windowStatsSchema),
  repoUrl: z.string().nullable(),
  lastSuccess: runSchema.nullable(),
  failureStreak: z.number(),
  deferral: deferralSchema.nullable(),
  typicalRunSeconds: z.number().nullable(),
  // measuredAt이 있으면 지금 잰 값이 아니라 그 시각 preflight 기록이다(원격).
  disk: z.object({ availableKib: z.number(), minimumKib: z.number(), measuredAt: z.string().nullable() }).nullable(),
  github: githubSchema.nullable(),
  githubError: z.string().nullable(),
  errors: z.array(z.string()),
});

export type Lane = z.infer<typeof laneSchema>;
export type Failure = z.infer<typeof failureSchema>;
export type Beat = z.infer<typeof beatSchema>;
export type WindowStats = z.infer<typeof windowStatsSchema>;
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
