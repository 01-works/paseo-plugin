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

/** 지금 실행의 예상 종료 시각(ms). 시작 시각이나 최근 실행 시간이 없으면 null. */
export function estimatedEnd(status: VerifierStatus): number | null {
  const started = status.current?.startedAt ? Date.parse(status.current.startedAt) : NaN;
  if (!Number.isFinite(started) || status.typicalRunSeconds === null) return null;
  return started + status.typicalRunSeconds * 1000;
}
