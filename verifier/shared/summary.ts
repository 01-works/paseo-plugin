import type { VerifierStatus } from './contracts';

export type Tone = 'success' | 'warning' | 'danger' | 'accent' | 'muted';

export interface Headline {
  tone: Tone;
  label: string;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
  if (minutes > 0) return `${minutes}분`;
  return `${total}초`;
}

export function formatGiB(kib: number): string {
  return `${(kib / 1024 / 1024).toFixed(1)} GiB`;
}

/** 사이드바 한 줄과 화면 머리글에 쓰는 요약. 우선순위: 꺼짐 > 실행 중 > 연기 > 마지막 결과. */
export function headline(status: VerifierStatus): Headline {
  if (!status.agent.loaded) return { tone: 'danger', label: 'LaunchAgent 꺼짐' };
  const { current } = status;
  if (current) {
    if (current.phase === 'waiting-lock') return { tone: 'accent', label: `lock 대기 · ${shortSha(current.sha)}` };
    const done = current.lanes.filter(lane => lane.state === 'passed' || lane.state === 'failed').length;
    const failed = current.lanes.filter(lane => lane.state === 'failed').length;
    const progress = `${done}/${current.lanes.length}`;
    return failed > 0
      ? { tone: 'warning', label: `실행 중 ${progress} · 실패 ${failed} · ${shortSha(current.sha)}` }
      : { tone: 'accent', label: `실행 중 ${progress} · ${shortSha(current.sha)}` };
  }
  if (status.deferral) return { tone: 'warning', label: `연기 · ${status.deferral.reason}` };
  const last = status.recent.at(-1);
  if (!last) return { tone: 'muted', label: '실행 기록 없음' };
  if (last.status === 'failure') return { tone: 'danger', label: `실패 ${status.failureStreak}연속 · ${shortSha(last.sha)}` };
  return { tone: 'success', label: `대기 · 통과 ${shortSha(last.sha)}` };
}

export interface RunEstimate {
  /** 지금 도는 lane의 추정 경과 초. lane 시작 시각이 로그에 없어서 끝난 lane 시간을 빼서 낸다. */
  runningLaneSeconds: number | null;
  /** 예상 종료 시각(ms) */
  endAt: number | null;
  /** lane별 중앙값으로 냈으면 true, 전체 실행 시간 중앙값으로 냈으면 false */
  perLane: boolean;
}

export function estimateRun(status: VerifierStatus, now = Date.now()): RunEstimate {
  const current = status.current;
  if (!current) return { runningLaneSeconds: null, endAt: null, perLane: false };
  const base = Date.parse(current.lanesStartedAt ?? current.startedAt ?? '');
  const finished = current.lanes.reduce((sum, lane) => sum + (lane.state === 'passed' || lane.state === 'failed' ? lane.seconds ?? 0 : 0), 0);
  const running = current.lanes.find(lane => lane.state === 'running');
  const runningLaneSeconds = Number.isFinite(base) && running ? Math.max(0, Math.round((now - base) / 1000 - finished)) : null;

  const left = current.lanes.filter(lane => lane.state === 'running' || lane.state === 'pending');
  const medians = left.map(lane => status.laneMedians[lane.name]);
  if (left.length > 0 && medians.every(value => value !== undefined)) {
    const remaining = left.reduce((sum, lane, index) => {
      const median = medians[index] as number;
      return sum + (lane.state === 'running' ? Math.max(0, median - (runningLaneSeconds ?? 0)) : median);
    }, 0);
    return { runningLaneSeconds, endAt: now + remaining * 1000, perLane: true };
  }
  const started = Date.parse(current.startedAt ?? '');
  const endAt = Number.isFinite(started) && status.typicalRunSeconds !== null ? started + status.typicalRunSeconds * 1000 : null;
  return { runningLaneSeconds, endAt, perLane: false };
}

/** 평소(통과 중앙값)보다 1.5배 넘게, 그리고 1분 넘게 오래 걸렸으면 true */
export function isSlow(seconds: number | null, median: number | undefined): boolean {
  return seconds !== null && median !== undefined && seconds > median * 1.5 && seconds - median > 60;
}

export function prNumber(subject: string | null): string | null {
  return subject ? /\(#(\d+)\)\s*$/.exec(subject)?.[1] ?? null : null;
}
