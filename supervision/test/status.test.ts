import { describe, expect, it } from 'vitest';
import { elapsed, statusRows, type Supervisor } from '../shared/status';
import type { ReportState } from '../shared/report';

const state = (id: string, kind: ReportState['report']['turnEnd']['kind'] = 'next_action'): ReportState => ({ version: 1,
  agentId: id, serverId: 'local', title: id, reportedAt: '2026-11-18T00:00:00Z', report: {
    items: [{ id: 'g', summary: '목표', status: kind === 'done' ? 'done' : 'open', ...(kind === 'done' ? { evidence: 'commit abc' } : {}) }],
    turnEnd: { kind, detail: '상태', ...(kind === 'waiting' ? { resume: { type: 'child', ref: 'child' } as const } : {}) }, decisions: [] } });
const agent = (id: string, status = 'running'): Supervisor => ({ id, cwd: `/lanes/${id}`, title: id, status,
  lastUserMessageAt: '2026-11-17T23:59:00Z', labels: { 'yw.role': 'supervisor' } });
describe('목표별 목록 판정', () => {
  it('결정 → 멈춤/미보고 → 대기 → 진행 → 완료 순으로 정렬한다', () => {
    const states = [state('complete', 'done'), state('running'), state('wait', 'waiting'), state('stopped'), state('decision')];
    states[4].report.decisions = [{ question: '선택?', options: ['A', 'B'], recommendation: 'A', impact: '구현' }];
    const rows = statusRows(states.map(s => ({ laneDir: `/lanes/${s.agentId}`, state: s })),
      [...states.map(s => agent(s.agentId, s.agentId === 'stopped' ? 'idle' : 'running')), agent('unreported', 'idle')], 'local');
    expect(rows.map(r => r.status)).toEqual(['사용자 결정', '멈춤', '미보고', '대기', '진행', '완료']);
  });
  it.each([
    ['idle', '2026-11-18T00:00:01Z', '미보고'],
    ['running', '2026-11-18T00:00:01Z', '대기'],
    ['idle', '2026-11-18T00:00:00Z', '대기'],
    ['idle', '2026-11-17T23:59:59Z', '대기'],
    ['idle', null, '대기'],
  ] as const)('새 프롬프트 %s / %s의 보고 판정은 %s다', (status, lastUserMessageAt, expected) => {
    const a = { ...agent('a', status), lastUserMessageAt };
    expect(statusRows([{ laneDir: a.cwd, state: state('a', 'waiting') }], [a], 'local')[0].status).toBe(expected);
  });
  it.each(['waiting', 'done'] as const)('같은 턴의 최종 응답·idle 전환 뒤에도 %s 보고를 유지한다', kind => {
    const a = { ...agent('a', 'idle'), updatedAt: '2026-11-18T12:00:00Z' };
    expect(statusRows([{ laneDir: a.cwd, state: state('a', kind) }], [a], 'local')[0].status).toBe(kind === 'done' ? '완료' : '대기');
  });
  it('새 턴에서 다시 보고하면 이전 프롬프트로 미보고가 되지 않는다', () => {
    const a = { ...agent('a', 'idle'), lastUserMessageAt: '2026-11-18T00:00:01Z' };
    const next = { ...state('a', 'done'), reportedAt: '2026-11-18T00:00:02Z' };
    expect(statusRows([{ laneDir: a.cwd, state: next }], [a], 'local')[0].status).toBe('완료');
  });
  it('새 턴이 보고 없이 끝나면 이전 완료 보고보다 미보고를 우선한다', () => {
    const a = { ...agent('a', 'idle'), lastUserMessageAt: '2026-11-18T00:00:01Z' };
    expect(statusRows([{ laneDir: a.cwd, state: state('a', 'done') }], [a], 'local')[0].status).toBe('미보고');
  });
  it('조회 불가·다른 호스트·archive는 명시하고 클릭을 막는다', () => {
    const archived = { ...agent('archived'), archivedAt: '2026-11-18' };
    const rows = statusRows([{ laneDir: '/missing', state: state('missing') }, { laneDir: '/foreign', state: { ...state('foreign'), serverId: 'remote' } },
      { laneDir: archived.cwd, state: state('archived', 'done') }], [archived], 'local');
    expect(rows.every(row => !row.canOpen && row.note)).toBe(true);
    expect(rows.find(row => row.agent?.id === 'archived')?.status).toBe('완료');
  });
  it('보고 없는 archive는 숨기고 보고 없는 활성 감독은 표시한다', () => {
    expect(statusRows([], [{ ...agent('old'), archivedAt: 'date' }, agent('new')], 'local').map(row => row.title)).toEqual(['new']);
  });
  it('오류 파일에 같은 cwd 감독이 있으면 행을 중복하지 않는다', () => {
    const a = agent('a'); expect(statusRows([{ laneDir: a.cwd, state: null, error: '손상' }], [a], 'local')).toHaveLength(1);
  });
  it('경과 시간은 음수가 되지 않는다', () => {
    expect(elapsed('2026-11-18T00:00:00Z', Date.parse('2026-11-18T00:02:00Z'))).toBe('2분 전');
    expect(elapsed('2026-11-18T00:00:00Z', 0)).toBe('0초 전');
  });
});
