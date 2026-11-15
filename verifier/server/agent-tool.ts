import { defineAgentTool } from '@getpaseo/plugin/server';
import { z } from 'zod';
import type { Failure, Lane, VerifierStatus } from '../shared/contracts';
import { estimateRun, formatDuration, formatGiB, headline, shortSha } from '../shared/summary';
import { HOST_REMEDIATION, hostIndicators } from '../shared/host';

function clock(iso: string | number) {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

// 예: packages=failed(1572s), ecommerce-db=failed(timed out, 1803s), migration-exec=running(~840s)
function laneText(lane: Lane, runningSeconds: number | null) {
  const seconds = lane.state === 'running' ? (runningSeconds !== null ? `~${runningSeconds}s` : null) : lane.seconds !== null ? `${lane.seconds}s` : null;
  const detail = [lane.note, seconds].filter(Boolean).join(', ');
  return `${lane.name}=${lane.state}${detail ? `(${detail})` : ''}`;
}

/** 같은 실패가 반복되는지: 새 실패인지, 몇 번째인지, 처음 나온 SHA */
export function recurrenceText(failure: Failure) {
  return failure.streak > 1 ? `${failure.streak} runs in a row since ${failure.firstSha.slice(0, 12)}${failure.firstAt ? ` (${clock(failure.firstAt)})` : ''}` : 'new in this run';
}

/** 에이전트가 읽기 좋은 짧은 요약. 사용자에게 보여 줄 문장이 아니라 판단 근거다. */
export function describeStatus(status: VerifierStatus, now = Date.now()): string {
  const lines = [`verifier: ${headline(status).label}`];
  if (status.source.kind === 'ssh') lines.push(`source: remote ${status.source.target} (LaunchAgent state unknown)`);
  const indicators = status.host ? hostIndicators(status.host) : [];
  lines.push(status.host
    ? `host: ${indicators.map(item => `${item.warning ? 'WARNING ' : ''}${item.label}`).join('; ')}; as of ${clock(status.host.measuredAt)}${status.host.leftoverContainers ? `; containers as of ${clock(status.host.leftoverContainers.measuredAt)} names=${status.host.leftoverContainers.names.join(',') || 'none'}` : ''}${indicators.some(item => item.warning) ? `; 조치: ${HOST_REMEDIATION}` : ''}`
    : 'host: unavailable (remote SSH mode)');
  const current = status.current;
  if (current) {
    const estimate = estimateRun(status, now);
    const done = current.lanes.filter(lane => lane.state === 'passed' || lane.state === 'failed').length;
    lines.push(`running: ${current.sha} ${current.subject ?? ''}`.trim());
    if (current.startedAt) lines.push(`started: ${clock(current.startedAt)} (${formatDuration((now - Date.parse(current.startedAt)) / 1000)} ago)`);
    lines.push(`lanes: ${done}/${current.lanes.length} done; ${current.lanes.map(lane => laneText(lane, estimate.runningLaneSeconds)).join(', ')}`);
    if (estimate.endAt) lines.push(`estimated end: ${clock(estimate.endAt)}`);
    lines.push('note: a running verifier holds the machine heavy lock until it ends.');
    for (const failure of current.failures) lines.push(`current failure ${failure.lane}: ${failure.classification}/${failure.reason} signature=${failure.signature.slice(0, 12)}, ${recurrenceText(failure)}`);
  }
  if (status.deferral) lines.push(`deferred since ${clock(status.deferral.since)} x${status.deferral.count}: ${status.deferral.reason}`);
  const last = status.recent.at(-1);
  if (last) lines.push(`last finished: ${last.status} ${last.sha} at ${clock(last.endedAt)}${last.failedLanes.length ? ` failed=${last.failedLanes.join(',')}` : ''}`);
  if (status.lastSuccess) lines.push(`last success: ${status.lastSuccess.sha} at ${clock(status.lastSuccess.endedAt)}`);
  if (status.redSince) lines.push(`red since ${clock(status.redSince)} (${formatDuration((now - Date.parse(status.redSince)) / 1000)}), failure streak ${status.failureStreak}`);
  for (const failure of last?.failures ?? []) lines.push(`failure ${failure.lane}: ${failure.classification}/${failure.reason} signature=${failure.signature.slice(0, 12)}, ${recurrenceText(failure)}`);
  for (const stats of status.stats) {
    lines.push(`last ${stats.hours}h: ${stats.successes}/${stats.runs} passed, ${stats.deferrals} deferred${stats.longestRedSeconds !== null ? `, longest red ${formatDuration(stats.longestRedSeconds)}` : ''}`);
  }
  if (status.disk) lines.push(`disk free ${formatGiB(status.disk.availableKib)} (minimum ${formatGiB(status.disk.minimumKib)})${status.disk.measuredAt ? ` as of ${clock(status.disk.measuredAt)}` : ''}`);
  if (status.github) {
    lines.push(`github: main ${shortSha(status.github.mainSha)}, dev ${shortSha(status.github.devSha)} (+${status.github.devAheadOfMain})`);
    lines.push(status.github.candidate ? `promotion candidate: ${status.github.candidate.sha} (+${status.github.candidate.aheadOfMain} over main)` : 'promotion candidate: none');
  } else if (status.githubError) lines.push(`github: unavailable (${status.githubError})`);
  for (const error of status.errors) lines.push(`warning: ${error}`);
  return lines.join('\n');
}

export function createVerifierTool(read: (includeGithub: boolean) => Promise<VerifierStatus>) {
  return defineAgentTool({
    name: 'verifier_status',
    title: 'Verifier 현황',
    description:
      'Read-only status of the 01-software verifier (nightly-local): whether it is running and which lane, estimated end, deferral reason, last results and failed lanes with classification, how long dev has been red, disk headroom, local host health (swap, fseventsd RSS, leftover lane containers), and optionally the promotion candidate from GitHub. Use it before heavy local work or pushes, or to answer verifier/promotion questions, instead of reading verifier logs by hand.',
    input: z.object({
      includeGithub: z.boolean().optional().describe('Also read main/dev tips and the promotion candidate from GitHub (slower).'),
    }),
    async execute({ includeGithub }) {
      try {
        // 텍스트만 돌려준다. structuredContent가 있으면 일부 클라이언트(Claude)가 텍스트 대신 큰 JSON을 보여 준다.
        return { text: describeStatus(await read(includeGithub === true)) };
      } catch (error) {
        return { text: `verifier status unavailable: ${error instanceof Error ? error.message : String(error)}`, isError: true };
      }
    },
  });
}
