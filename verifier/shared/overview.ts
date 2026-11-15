import type { Failure, VerifierStatus } from './contracts';
import { HOST_REMEDIATION, hostIndicators } from './host';
import { formatDuration, formatGiB, prNumber, shortSha, type Tone } from './summary';

// 상세 화면의 요약·확인할 것·맨 아래 줄을 만드는 순수 함수. 화면은 이 결과를 배치만 한다.

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/** 오늘이면 `HH:MM`, 아니면 `MM-DD HH:MM`(로컬 시각) */
export function formatClock(iso: string | number, now = Date.now()): string {
  const date = new Date(iso);
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return new Date(now).toDateString() === date.toDateString() ? time : `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`;
}

/** 머리글용 거친 길이. 한 시간 안은 분, 하루 안은 시간, 그 이상은 일·시간. */
export function formatAge(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 3600) return formatDuration(total);
  const hours = Math.floor(total / 3600);
  if (hours < 24) return `${hours}시간`;
  const rest = hours % 24;
  return rest > 0 ? `${Math.floor(hours / 24)}일 ${rest}시간` : `${Math.floor(hours / 24)}일`;
}

export interface Overall {
  tone: Tone;
  label: string;
}

/** 맨 위 한 줄: dev가 통과 중인지 실패 중인지. 기준은 마지막으로 끝난 실행이다. */
export function overallLine(status: VerifierStatus, now = Date.now()): Overall {
  if (status.agent && !status.agent.loaded) return { tone: 'danger', label: 'LaunchAgent 꺼짐' };
  const last = status.recent.at(-1);
  if (!last) return { tone: 'muted', label: '실행 기록 없음' };
  if (last.status === 'success') return { tone: 'success', label: `통과 · ${shortSha(last.sha)}` };
  const since = status.redSince ? Date.parse(status.redSince) : NaN;
  const length = Number.isFinite(since) ? `${formatAge((now - since) / 1000)}째` : `${Math.max(1, status.failureStreak)}회 연속`;
  const lanes = last.failedLanes.length > 0 ? ` · ${last.failedLanes.join(', ')}` : '';
  return { tone: 'danger', label: `dev 실패 ${length}${lanes}` };
}

export type DevState = '통과' | '검증 중' | '실패' | '아직 검증 안 됨';

/** GitHub dev 끝 SHA를 verifier가 어떻게 봤는지 */
export function devState(status: VerifierStatus): DevState | null {
  const dev = status.github?.devSha;
  if (!dev) return null;
  if (status.recent.some(run => run.sha === dev && run.status === 'success') || status.lastSuccess?.sha === dev) return '통과';
  if (status.current?.sha === dev) return '검증 중';
  if (status.recent.some(run => run.sha === dev)) return '실패';
  return '아직 검증 안 됨';
}

/** 그 커밋 제목 끝의 PR 번호. verifier가 본 실행에서만 찾는다. */
export function prOfSha(status: VerifierStatus, sha: string): string | null {
  if (status.current?.sha === sha) return prNumber(status.current.subject);
  const run = [...status.recent, ...(status.lastSuccess ? [status.lastSuccess] : [])].find(item => item.sha === sha);
  return run ? prNumber(run.subject) : null;
}

export interface FailureGroup {
  /** 분류 줄이 없는 실패 lane은 null이다(같은 lane끼리만 묶는다). */
  signature: string | null;
  lanes: string[];
  classification: string | null;
  reason: string | null;
  streak: number;
  firstSha: string;
  firstAt: string | null;
  firstPr: string | null;
  /** 지금 실행·마지막 끝난 실행 중 어디에서 나왔는지 */
  where: 'current' | 'last' | 'both';
  /** 연결된 열린 red 이슈 번호. 맞는 이슈가 없거나 이슈를 아직 읽지 못했으면 null */
  issue: number | null;
  /** red 이슈 목록을 읽었으면 true. false면 이슈 없음을 단정하지 않는다. */
  issueKnown: boolean;
}

/** signature에 연결된 열린 `nightly-local-red` 이슈 번호 */
export function redIssueOf(status: VerifierStatus, signature: string | null): number | null {
  if (!signature) return null;
  return status.github?.redIssues?.[signature] ?? null;
}

/**
 * 지금 실행과 마지막 끝난 실행(실패일 때)의 실패를 signature별 한 줄로 묶는다.
 * 같은 signature는 반복 횟수가 큰 쪽(지금 실행이 이어 가는 연속)을 보여 준다.
 */
export function failureGroups(status: VerifierStatus): FailureGroup[] {
  const sources: Array<{ where: 'current' | 'last'; sha: string; at: string | null; failures: Failure[]; failedLanes: string[] }> = [];
  if (status.current) {
    sources.push({
      where: 'current',
      sha: status.current.sha,
      at: status.current.startedAt,
      failures: status.current.failures,
      failedLanes: status.current.lanes.filter(lane => lane.state === 'failed').map(lane => lane.name),
    });
  }
  const last = status.recent.at(-1);
  if (last?.status === 'failure') sources.push({ where: 'last', sha: last.sha, at: last.endedAt, failures: last.failures, failedLanes: last.failedLanes });

  const issueKnown = Boolean(status.github?.redIssues);
  const groups = new Map<string, FailureGroup>();
  const add = (key: string, where: 'current' | 'last', next: Omit<FailureGroup, 'where' | 'firstPr' | 'issue' | 'issueKnown'>) => {
    const found = groups.get(key);
    if (!found) {
      groups.set(key, { ...next, where, firstPr: prOfSha(status, next.firstSha), issue: redIssueOf(status, next.signature), issueKnown });
      return;
    }
    for (const lane of next.lanes) if (!found.lanes.includes(lane)) found.lanes.push(lane);
    if (found.where !== where) found.where = 'both';
    if (next.streak > found.streak) Object.assign(found, { streak: next.streak, firstSha: next.firstSha, firstAt: next.firstAt, firstPr: prOfSha(status, next.firstSha) });
  };
  for (const source of sources) {
    for (const failure of source.failures) {
      add(`s:${failure.signature}`, source.where, {
        signature: failure.signature,
        lanes: [failure.lane],
        classification: failure.classification,
        reason: failure.reason,
        streak: failure.streak,
        firstSha: failure.firstSha,
        firstAt: failure.firstAt,
      });
    }
    // 분류 줄이 없는 실패 lane(로그가 끊긴 경우 등)도 빠뜨리지 않는다.
    for (const lane of source.failedLanes) {
      if (source.failures.some(failure => failure.lane === lane)) continue;
      add(`l:${lane}`, source.where, { signature: null, lanes: [lane], classification: null, reason: null, streak: 1, firstSha: source.sha, firstAt: source.at });
    }
  }
  return [...groups.values()];
}

export type AttentionItem =
  | { kind: 'failure'; key: string; tone: Tone; group: FailureGroup }
  | { kind: 'notice'; key: string; tone: Tone; title: string; lines: string[] };

/** 문제가 있을 때만 항목을 만든다. 순서는 실패 → 기기 → 디스크 → 연기 → GitHub → 읽기 경고. */
export function attentionItems(status: VerifierStatus, now = Date.now()): AttentionItem[] {
  const items: AttentionItem[] = failureGroups(status).map(group => ({ kind: 'failure', key: `failure:${group.signature ?? group.lanes.join(',')}`, tone: 'danger', group }));

  const host = status.host;
  const warnings = host ? hostIndicators(host).filter(item => item.warning) : [];
  if (host && warnings.length > 0) {
    const lines: string[] = [];
    if (warnings.some(item => item.key === 'containers') && host.leftoverContainers) {
      lines.push(`남은 컨테이너: ${host.leftoverContainers.names.join(', ')} (${formatClock(host.leftoverContainers.measuredAt, now)} 확인 · 가동 2시간 초과)`);
    }
    lines.push(`조치: ${HOST_REMEDIATION}`);
    lines.push(`${formatClock(host.measuredAt, now)} 측정 · 플러그인은 조치를 실행하지 않습니다.`);
    items.push({ kind: 'notice', key: 'host', tone: 'warning', title: `기기 점검 필요 · ${warnings.map(item => item.label).join(' · ')}`, lines });
  }

  const disk = status.disk;
  if (disk && disk.availableKib < disk.minimumKib * 1.5) {
    const below = disk.availableKib < disk.minimumKib;
    items.push({
      kind: 'notice',
      key: 'disk',
      tone: below ? 'danger' : 'warning',
      title: `디스크 여유 ${formatGiB(disk.availableKib)} · 실행 최소 ${formatGiB(disk.minimumKib)}`,
      lines: [
        below ? '최소 기준보다 적어 verifier가 실행을 미룹니다.' : '최소 기준의 1.5배보다 적습니다.',
        ...(disk.measuredAt ? [`${formatClock(disk.measuredAt, now)} preflight 기록`] : []),
      ],
    });
  }

  if (status.deferral) {
    items.push({
      kind: 'notice',
      key: 'deferral',
      tone: 'warning',
      title: `실행 연기 · ${status.deferral.reason}`,
      lines: [`${formatClock(status.deferral.since, now)}부터 ${status.deferral.count}회 연속 미뤄졌습니다. 원인이 해소되면 다음 확인에서 다시 시작합니다.`],
    });
  }

  if (status.githubError) {
    items.push({ kind: 'notice', key: 'github', tone: 'muted', title: 'GitHub 조회 실패', lines: [status.githubError, ...(status.github ? ['마지막으로 읽은 값을 보여 줍니다.'] : [])] });
  }
  if (status.github?.redIssuesError) {
    items.push({ kind: 'notice', key: 'red-issues', tone: 'muted', title: 'red 이슈 조회 실패', lines: [status.github.redIssuesError] });
  }

  if (status.errors.length > 0) {
    items.push({ kind: 'notice', key: 'errors', tone: 'muted', title: `읽기 경고 ${status.errors.length}건`, lines: status.errors });
  }
  return items;
}

/** 맨 아래 작은 회색 한 줄 */
export function footerLine(status: VerifierStatus, now = Date.now()): string {
  const parts: string[] = [];
  if (status.agent) {
    parts.push(`LaunchAgent ${status.agent.loaded ? (status.agent.running ? '실행 중' : '대기') : '꺼짐'}`);
    if (status.agent.intervalSeconds) parts.push(`${Math.round(status.agent.intervalSeconds / 60)}분마다 확인`);
    if (status.agent.runs !== null) parts.push(`누적 ${status.agent.runs}회`);
  } else {
    parts.push(`원격 ${status.source.target ?? ''}`.trim(), 'LaunchAgent 상태 알 수 없음');
  }
  if (status.disk) parts.push(`디스크 여유 ${formatGiB(status.disk.availableKib)}${status.disk.measuredAt ? ` (${formatClock(status.disk.measuredAt, now)} preflight)` : ''}`);
  parts.push(`${formatClock(status.collectedAt, now)} 기준`);
  return parts.join(' · ');
}
