import type { PluginTheme } from '@getpaseo/plugin';
import type { Report } from '../shared/report';
import { elapsed, type StatusRow } from '../shared/status';

// 화면 전용 순수 로직. 상태 판정은 shared/status.ts가 맡고 여기서는 배치·색·문구만 정한다.
// 구조와 수치는 Better Paseo(MIT, RoundRedDot/better-paseo) Tasks 보드의 관례를 따른다. 코드는 옮기지 않았다.
export type Status = StatusRow['status'];
export type LaneId = 'decision' | 'attention' | 'waiting' | 'running' | 'done';
export interface Lane { id: LaneId; title: string; tab: string; statuses: readonly Status[]; empty: { icon: string; title: string; hint: string } }
export const LANES: readonly Lane[] = [
  { id: 'decision', title: '사용자 결정', tab: '결정', statuses: ['사용자 결정'],
    empty: { icon: 'CircleCheck', title: '기다리는 결정 없음', hint: '감독이 사용자에게 물은 결정이 여기에 표시됩니다' } },
  { id: 'attention', title: '확인 필요', tab: '확인', statuses: ['미보고', '멈춤', '알 수 없음'],
    empty: { icon: 'CircleCheck', title: '확인할 감독 없음', hint: '미보고·멈춤·알 수 없음 감독이 여기에 표시됩니다' } },
  { id: 'waiting', title: '대기', tab: '대기', statuses: ['대기'],
    empty: { icon: 'Inbox', title: '기다리는 감독 없음', hint: 'PR 검사·하위 작업을 기다리는 감독이 여기에 표시됩니다' } },
  { id: 'running', title: '진행', tab: '진행', statuses: ['진행'],
    empty: { icon: 'CircleDashed', title: '진행 중인 감독 없음', hint: '실행 중이거나 하위 작업이 도는 감독이 여기에 표시됩니다' } },
  { id: 'done', title: '완료', tab: '완료', statuses: ['완료'],
    empty: { icon: 'Archive', title: '완료한 감독 없음', hint: '모든 항목을 끝낸 감독이 여기에 표시됩니다' } },
];

// 상태 표식: Better Paseo처럼 모양이 서로 달라 색 없이도 구분되고, 화면에는 상태 글자를 함께 쓴다.
export type Shape = 'ring' | 'running' | 'dot' | 'stopped' | 'dashed' | 'hourglass' | 'check';
type Tone = 'statusWarning' | 'statusDanger' | 'foregroundMuted' | 'accent' | 'statusSuccess';
export const TONE: Record<Status, { color: Tone; shape: Shape }> = {
  '사용자 결정': { color: 'statusWarning', shape: 'ring' }, '미보고': { color: 'statusDanger', shape: 'dot' },
  '멈춤': { color: 'statusDanger', shape: 'stopped' }, '알 수 없음': { color: 'foregroundMuted', shape: 'dashed' },
  '대기': { color: 'foregroundMuted', shape: 'hourglass' }, '진행': { color: 'accent', shape: 'running' }, '완료': { color: 'statusSuccess', shape: 'check' },
};
export const LANE_MARK: Record<LaneId, Status> = { decision: '사용자 결정', attention: '미보고', waiting: '대기', running: '진행', done: '완료' };
export const laneOf = (status: Status): LaneId => LANES.find(lane => lane.statuses.includes(status))!.id;

/** 입력 순서(rank·제목 정렬)를 유지한 채 레인별로 나눈다. 빈 레인도 돌려준다. */
export function groupLanes<Row extends Pick<StatusRow, 'status'>>(rows: readonly Row[]) {
  return LANES.map(lane => ({ ...lane, rows: rows.filter(row => lane.statuses.includes(row.status)) }));
}
/** 좁은 화면의 첫 탭: 사람이 볼 레인을 우선하고, 모두 비면 사용자 결정. */
export function defaultLane(groups: readonly { id: LaneId; rows: readonly unknown[] }[]): LaneId {
  return groups.find(group => group.rows.length)?.id ?? 'decision';
}
/** 첫 카드가 보인 갱신에서 탭을 한 번 정하고, 이후 갱신에서는 (레인이 비어도) 유지한다. */
export function keepTab(tab: LaneId | null, groups: readonly { id: LaneId; rows: readonly unknown[] }[]): LaneId | null {
  return tab ?? (groups.some(group => group.rows.length) ? defaultLane(groups) : null);
}
/** 갱신 결과에서 사라진 카드는 선택을 지워, 같은 키가 돌아와도 상세가 저절로 열리지 않게 한다. */
export const keepSelection = (key: string | null, rows: readonly { key: string }[]) => key !== null && rows.some(row => row.key === key) ? key : null;

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
const TURN_ICON: Record<Report['turnEnd']['kind'], string> = { next_action: 'ArrowRight', waiting: 'Hourglass', user_decision: 'CircleAlert', done: 'CircleCheck' };
export const RESUME: Record<NonNullable<Report['turnEnd']['resume']>['type'], string> = { child: '하위 작업', pr_check: 'PR 검사', heavy: '긴 작업', time: '시각', user: '사용자' };
export const ITEM: Record<Report['items'][number]['status'], { label: string; icon: string }> = {
  open: { label: '열림', icon: 'Circle' }, done: { label: '완료', icon: 'CircleCheck' }, deferred: { label: '연기', icon: 'CircleSlash' } };
export const turnEndText = (report?: Report) => report ? `${TURN_END[report.turnEnd.kind]} · ${report.turnEnd.detail}` : '아직 보고하지 않았습니다.';
export const resumeText = (report?: Report) => report?.turnEnd.resume ? `${RESUME[report.turnEnd.resume.type]} · ${report.turnEnd.resume.ref}` : undefined;
export const reportAge = (row: Pick<StatusRow, 'state'>, now: number) => row.state ? `보고 ${elapsed(row.state.reportedAt, now)}` : '보고 없음';

/**
 * 카드 한 장의 내용. Better Paseo 카드의 계층(제목 행 → pill 행 → 구분선 블록 → 하단 시각)에 감독 데이터를 맞춘다.
 * 사용자 결정은 Better Paseo의 권한 요청 구역처럼 경고색 구분선 아래에 질문을 둔다.
 */
export function cardFacts(row: Pick<StatusRow, 'state' | 'status' | 'note'>) {
  const report = row.state?.report;
  const progress = itemProgress(report);
  const pills: { key: string; icon?: string; label: string; tone?: Tone }[] = [];
  if (progress.total) pills.push({ key: 'items', icon: 'ListTodo', label: `${progress.done}/${progress.total}`, tone: progress.open ? undefined : 'statusSuccess' });
  if (progress.deferred) pills.push({ key: 'deferred', icon: 'CircleSlash', label: `연기 ${progress.deferred}` });
  const resume = report?.turnEnd.kind === 'waiting' ? report.turnEnd.resume : undefined;
  if (resume) pills.push({ key: 'resume', icon: 'Clock', label: `${RESUME[resume.type]} · ${resume.ref}` });
  const decisions = report?.decisions ?? [];
  return { progress, pills,
    turn: report ? { icon: TURN_ICON[report.turnEnd.kind], text: turnEndText(report) } : null,
    decision: decisions.length ? { question: decisions[0].question, count: decisions.length } : null,
    note: row.note ? { text: row.note, danger: row.status === '멈춤' } : null };
}

// 색: Better Paseo처럼 host 테마 색을 섞어 레인 패널·카드·pill·선택 색을 만든다.
function rgb(color: string): [number, number, number] | null {
  const value = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1] ?? /^#([0-9a-f]{3})$/i.exec(value)?.[1]?.replace(/./g, c => c + c);
  if (hex) return [0, 2, 4].map(at => Number.parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
  const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
/** from에서 to 쪽으로 t만큼 섞은 #rrggbb. 해석할 수 없는 색이면 from 그대로. */
export function mix(from: string, to: string, t: number): string {
  const a = rgb(from);
  const b = rgb(to);
  if (!a || !b) return from;
  return `#${a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
}
export function boardColors(colors: PluginTheme['colors']) {
  const value = rgb(colors.surface0);
  const isDark = value ? (0.299 * value[0] + 0.587 * value[1] + 0.114 * value[2]) / 255 < 0.5 : false;
  const card = isDark ? colors.surface2 : colors.surface0;
  return {
    isDark, card,
    panel: isDark ? colors.surface1 : mix(colors.surface1, colors.surface2, 0.5),
    borderStrong: mix(colors.border, colors.foregroundMuted, 0.35),
    pillFill: mix(card, colors.foreground, isDark ? 0.06 : 0.035),
    pillBorder: mix(colors.border, colors.foreground, isDark ? 0.08 : 0.05),
    buttonBorder: mix(colors.border, colors.foreground, isDark ? 0.2 : 0.05),
    primaryBorder: mix(card, colors.accent, isDark ? 0.55 : 0.5),
    current: mix(card, colors.accent, isDark ? 0.1 : 0.07),
    currentBorder: mix(colors.border, colors.accent, 0.45),
    rule: mix(colors.border, colors.statusWarning, 0.12),
    tint: (hue: string) => ({ background: mix(card, hue, isDark ? 0.16 : 0.1), border: mix(card, hue, isDark ? 0.34 : 0.26) }),
    // 그림자만은 테마와 무관하게 검정의 세기로 표현한다(Better Paseo와 같은 판단).
    shadow: isDark ? '0px 1px 2px rgba(0, 0, 0, 0.18)' : '0px 1px 2px rgba(0, 0, 0, 0.06)',
    shadowHover: isDark ? '0px 2px 6px rgba(0, 0, 0, 0.38)' : '0px 2px 6px rgba(0, 0, 0, 0.14)',
  };
}
export type BoardColors = ReturnType<typeof boardColors>;

// 배치: 레인은 300~340을 나눠 갖고 두 레인이 들어가도록 260까지 줄며, 그래도 넘치면 가로로 스크롤한다.
// 폰 배치(레인 탭)는 host의 compact에서만 쓴다. 상세는 1020 이상이면 오른쪽 사이드바(380), 그보다 좁으면 host Modal.
export const LANE = { min: 300, max: 340, floor: 260, narrow: 220, gap: 8, edge: 12 };
export const SIDEBAR = { width: 380, gap: 12, inlineFrom: 1020 };
export function boardLayout(width: number | null, compact: boolean, detailOpen = false) {
  const board = width ?? 0;
  const inline = !compact && board >= SIDEBAR.inlineFrom;
  const sidebar = inline && detailOpen ? SIDEBAR.width : 0;
  const viewport = board - (sidebar ? sidebar + SIDEBAR.gap : 0);
  const min = Math.max(LANE.floor, Math.min(LANE.min, (viewport - 2 * LANE.edge - LANE.gap) / 2));
  const share = (viewport - 2 * LANE.edge - (LANES.length - 1) * LANE.gap) / LANES.length;
  const laneWidth = share >= min ? Math.min(share, LANE.max) : Math.max(LANE.narrow, Math.min(min, viewport - 2 * LANE.edge));
  return { phone: compact, inline, sidebar, laneWidth: Math.floor(laneWidth) };
}
