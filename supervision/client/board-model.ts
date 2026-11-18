import type { Report } from '../shared/report';
import type { StatusRow } from '../shared/status';

// 화면 전용 순수 로직. 상태 판정은 shared/status.ts가 맡고 여기서는 배치만 정한다.
export type Status = StatusRow['status'];
export type LaneId = 'decision' | 'attention' | 'waiting' | 'running' | 'done';
export const LANES: readonly { id: LaneId; title: string; statuses: readonly Status[] }[] = [
  { id: 'decision', title: '사용자 결정', statuses: ['사용자 결정'] },
  { id: 'attention', title: '확인 필요', statuses: ['미보고', '멈춤', '알 수 없음'] },
  { id: 'waiting', title: '대기', statuses: ['대기'] },
  { id: 'running', title: '진행', statuses: ['진행'] },
  { id: 'done', title: '완료', statuses: ['완료'] },
];
// 색만으로 구분하지 않도록 모양을 함께 바꾸고, 화면에는 항상 상태 글자를 병기한다.
export type Shape = 'ring' | 'arc' | 'dot' | 'square';
export const TONE: Record<Status, { color: 'statusWarning' | 'statusDanger' | 'foregroundMuted' | 'accent' | 'statusSuccess'; shape: Shape }> = {
  '사용자 결정': { color: 'statusWarning', shape: 'ring' }, '미보고': { color: 'statusDanger', shape: 'dot' },
  '멈춤': { color: 'statusDanger', shape: 'square' }, '알 수 없음': { color: 'foregroundMuted', shape: 'ring' },
  '대기': { color: 'foregroundMuted', shape: 'arc' }, '진행': { color: 'accent', shape: 'arc' }, '완료': { color: 'statusSuccess', shape: 'dot' },
};
export const LANE_MARK: Record<LaneId, Status> = { decision: '사용자 결정', attention: '미보고', waiting: '대기', running: '진행', done: '완료' };
export const laneOf =(status: Status): LaneId => LANES.find(lane => lane.statuses.includes(status))!.id;

/** 입력 순서(rank·제목 정렬)를 유지한 채 레인별로 나눈다. 빈 레인도 돌려준다. */
export function groupLanes<Row extends Pick<StatusRow, 'status'>>(rows: readonly Row[]) {
  return LANES.map(lane => ({ ...lane, rows: rows.filter(row => lane.statuses.includes(row.status)) }));
}

/** 좁은 화면의 첫 탭: 사람이 볼 레인을 우선하고, 모두 비면 사용자 결정. */
export function defaultLane(groups: readonly { id: LaneId; rows: readonly unknown[] }[]): LaneId {
  return groups.find(group => group.rows.length)?.id ?? 'decision';
}

export function itemProgress(report: Report | undefined) {
  const items = report?.items ?? [];
  const done = items.filter(item => item.status === 'done').length;
  const deferred = items.filter(item => item.status === 'deferred').length;
  const total = items.length;
  return { done, deferred, open: total - done - deferred, total,
    doneRatio: total ? done / total : 0, deferredRatio: total ? deferred / total : 0,
    label: total ? `완료 ${done}/${total}${deferred ? ` · 연기 ${deferred}` : ''}` : '항목 보고 없음' };
}

export const TURN_END: Record<Report['turnEnd']['kind'], string> = { next_action: '다음 조치', waiting: '대기', user_decision: '사용자 결정', done: '완료' };
export const RESUME: Record<NonNullable<Report['turnEnd']['resume']>['type'], string> = { child: '하위 작업', pr_check: 'PR 검사', heavy: '긴 작업', time: '시각', user: '사용자' };
export const ITEM: Record<Report['items'][number]['status'], string> = { open: '열림', done: '완료', deferred: '연기' };
export const turnEndText = (report?: Report) => report ? `${TURN_END[report.turnEnd.kind]} · ${report.turnEnd.detail}` : '아직 보고하지 않았습니다.';
export const resumeText = (report?: Report) => report?.turnEnd.resume ? `${RESUME[report.turnEnd.resume.type]} · ${report.turnEnd.resume.ref}` : undefined;

// Better Paseo의 폭 관례를 줄여 따른다: 레인 260~340, 두 레인이 안 들어가면 한 레인씩 탭,
// 1020 이상이면 상세를 옆 사이드바로, 그보다 좁으면 시트로 연다. 사이드바는 카드를 골랐을 때만 자리를 차지한다.
export const BOARD = { pad: 16, gap: 12, laneMin: 260, laneMax: 340, sidebar: 380, inlineMin: 1020 };
export function boardLayout(width: number | null, compact: boolean, detailOpen = false) {
  const phone = compact || width === null || width < BOARD.pad * 2 + BOARD.laneMin * 2 + BOARD.gap;
  const inline = !phone && width! >= BOARD.inlineMin;
  const lanesWidth = phone ? 0 : width! - BOARD.pad * 2 - (inline && detailOpen ? BOARD.sidebar : 0);
  const laneWidth = Math.min(BOARD.laneMax, Math.max(BOARD.laneMin, Math.floor((lanesWidth - BOARD.gap * (LANES.length - 1)) / LANES.length)));
  return { phone, inline, laneWidth };
}
