import { describe, expect, it } from 'vitest';
import { BOARD, boardLayout, defaultLane, groupLanes, itemProgress, laneOf, LANES, resumeText, TONE, turnEndText, type Status } from '../client/board-model';
import type { Report } from '../shared/report';

const statuses: Status[] = ['사용자 결정', '미보고', '멈춤', '대기', '진행', '완료', '알 수 없음'];

describe('레인 분류', () => {
  it('모든 상태가 정확히 한 레인에 속하고 확인 필요는 미보고·멈춤·알 수 없음을 모은다', () => {
    for (const status of statuses) expect(LANES.filter(lane => lane.statuses.includes(status))).toHaveLength(1);
    expect(LANES.map(lane => lane.title)).toEqual(['사용자 결정', '확인 필요', '대기', '진행', '완료']);
    expect(['미보고', '멈춤', '알 수 없음'].map(status => laneOf(status as Status))).toEqual(['attention', 'attention', 'attention']);
  });
  it('입력 정렬을 유지하며 레인별 개수를 세고 빈 레인도 돌려준다', () => {
    const rows = [{ key: 'a', status: '멈춤' }, { key: 'b', status: '진행' }, { key: 'c', status: '미보고' }, { key: 'd', status: '알 수 없음' }] as const;
    const groups = groupLanes(rows);
    expect(groups.map(group => [group.id, group.rows.length])).toEqual([['decision', 0], ['attention', 3], ['waiting', 0], ['running', 1], ['done', 0]]);
    expect(groups[1].rows.map(row => row.key)).toEqual(['a', 'c', 'd']);
  });
  it('좁은 화면의 첫 탭은 비어 있지 않은 첫 레인, 모두 비면 사용자 결정', () => {
    expect(defaultLane(groupLanes([{ status: '완료' }, { status: '대기' }]))).toBe('waiting');
    expect(defaultLane(groupLanes([]))).toBe('decision');
  });
  it('상태 표식은 색이 같아도 모양으로 구분한다', () => {
    const marks = statuses.map(status => `${TONE[status].color}/${TONE[status].shape}`);
    expect(new Set(marks).size).toBe(statuses.length);
  });
});

describe('진행 막대', () => {
  const report = (statuses: ('open' | 'done' | 'deferred')[]): Report => ({
    items: statuses.map((status, index) => ({ id: `i${index}`, summary: '항목', status, evidence: 'PR', deferredBy: '사용자' })),
    turnEnd: { kind: 'waiting', detail: 'PR 검사 대기', resume: { type: 'pr_check', ref: 'PR #17' } }, decisions: [],
  });
  it('완료·연기 비율과 라벨을 계산한다', () => {
    expect(itemProgress(report(['done', 'done', 'open', 'deferred']))).toMatchObject({
      done: 2, deferred: 1, open: 1, total: 4, doneRatio: 0.5, deferredRatio: 0.25, label: '완료 2/4 · 연기 1' });
    expect(itemProgress(report(['open'])).label).toBe('완료 0/1');
  });
  it('보고가 없으면 0 비율과 안내 라벨', () => {
    expect(itemProgress(undefined)).toMatchObject({ total: 0, doneRatio: 0, deferredRatio: 0, label: '항목 보고 없음' });
  });
  it('턴 종료와 재개 조건을 한 줄로 만든다', () => {
    expect(turnEndText(report(['open']))).toBe('대기 · PR 검사 대기');
    expect(resumeText(report(['open']))).toBe('PR 검사 · PR #17');
    expect(turnEndText(undefined)).toBe('아직 보고하지 않았습니다.');
    expect(resumeText(undefined)).toBeUndefined();
  });
});

describe('보드 배치', () => {
  it('compact이거나 두 레인이 안 들어가면 탭, 측정 전에도 탭', () => {
    expect(boardLayout(1400, true).phone).toBe(true);
    expect(boardLayout(null, false).phone).toBe(true);
    expect(boardLayout(BOARD.pad * 2 + BOARD.laneMin * 2 + BOARD.gap - 1, false).phone).toBe(true);
    expect(boardLayout(BOARD.pad * 2 + BOARD.laneMin * 2 + BOARD.gap, false).phone).toBe(false);
  });
  it('1020 이상은 사이드바, 그보다 좁으면 시트. 레인 폭은 260~340', () => {
    expect(boardLayout(1019, false)).toMatchObject({ phone: false, inline: false, laneWidth: 260 });
    expect(boardLayout(1020, false).inline).toBe(true);
    expect(boardLayout(2400, false).laneWidth).toBe(340);
    expect(boardLayout(1700, false).laneWidth).toBe(Math.floor((1700 - 32 - 48) / 5));
    expect(boardLayout(1700, false, true).laneWidth).toBe(260);
  });
});
