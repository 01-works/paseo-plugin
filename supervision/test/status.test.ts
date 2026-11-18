import { describe, expect, it } from 'vitest';
import { elapsed, statusRows, type Supervisor } from '../shared/status';
import type { ReportState, TurnState } from '../shared/report';

const state = (id: string, kind: ReportState['report']['turnEnd']['kind'] = 'next_action'): ReportState => ({ version: 1,
  agentId: id, serverId: 'local', title: id, reportedAt: '2026-11-18T00:00:00Z', report: {
    items: [{ id: 'g', summary: '목표', status: kind === 'done' ? 'done' : 'open', ...(kind === 'done' ? { evidence: 'commit abc' } : {}) }],
    turnEnd: { kind, detail: '상태', ...(kind === 'waiting' ? { resume: { type: 'child', ref: 'child' } as const } : {}) }, decisions: [] } });
const agent = (id: string, status = 'idle'): Supervisor => ({ id, cwd: `/lanes/${id}`, title: id, status, labels: { 'yw.role': 'supervisor' } });
const turn = (id: string, at: string | null = '2026-11-17T23:59:00Z'): TurnState => ({ agentId: id, lastEndedStartedAt: at });
const decide = (s: ReportState) => { s.report.decisions = [{ question: '선택?', options: ['A', 'B'], recommendation: 'A', impact: '구현' }]; return s; };
const row = (s: ReportState, a: Supervisor, turns: TurnState[] = [turn(a.id)], others: Supervisor[] = []) =>
  statusRows([{ laneDir: a.cwd, state: s }], [a, ...others], 'local', turns)[0];

describe('목표별 목록 판정', () => {
  it('idle 결정 → 멈춤/미보고 → 대기 → 진행 → 완료 순으로 정렬한다', () => {
    const states = [state('complete', 'done'), state('running'), state('wait', 'waiting'), state('stopped'), decide(state('decision'))];
    const agents = states.map(s => agent(s.agentId, s.agentId === 'running' ? 'running' : 'idle'));
    const rows = statusRows(states.map(s => ({ laneDir: `/lanes/${s.agentId}`, state: s })),
      [...agents, agent('unreported')], 'local', [...agents.map(a => turn(a.id)), turn('unreported')]);
    expect(rows.map(r => r.status)).toEqual(['사용자 결정', '멈춤', '미보고', '대기', '진행', '완료']);
  });
  it.each([
    ['idle', '2026-11-18T00:00:01Z', '미보고'], ['running', '2026-11-18T00:00:01Z', '진행'],
    ['idle', '2026-11-18T00:00:00Z', '대기'], ['idle', '2026-11-17T23:59:59Z', '대기'], ['idle', null, '알 수 없음'],
  ] as const)('마지막 종료 턴의 시작 %s / %s → %s', (status, at, expected) => {
    expect(row(state('a', 'waiting'), agent('a', status), [turn('a', at)]).status).toBe(expected);
  });
  it.each(['waiting', 'done'] as const)('같은 턴의 최종 응답·idle 전환 뒤에도 %s 보고를 유지한다', kind => {
    const a = { ...agent('a'), updatedAt: '2026-11-18T12:00:00Z' };
    expect(row(state('a', kind), a).status).toBe(kind === 'done' ? '완료' : '대기');
  });
  it('재시작 후 기록이 없으면 사용자 메시지 시각으로 추정하지 않는다', () => {
    const a = { ...agent('a'), lastUserMessageAt: '2026-11-18T01:00:00Z' };
    expect(row(state('a', 'done'), a, []).status).toBe('알 수 없음');
  });
  it('새 턴에서 재보고하면 이전 시작 시각으로 미보고가 되지 않는다', () => {
    expect(row({ ...state('a', 'done'), reportedAt: '2026-11-18T00:00:02Z' }, agent('a'), [turn('a', '2026-11-18T00:00:01Z')]).status).toBe('완료');
  });
  it('running이면 미결 결정이나 waiting 보고가 있어도 진행이다', () => {
    expect(row(decide(state('a', 'user_decision')), agent('a', 'running')).status).toBe('진행');
    expect(row(state('a', 'waiting'), agent('a', 'running')).status).toBe('진행');
  });
  it('idle next_action은 같은 호스트의 자식이 running일 때만 진행이다', () => {
    const child = { ...agent('child', 'running'), labels: { 'paseo.parent-agent-id': 'a' } };
    expect(row(state('a'), agent('a'), [turn('a')], [child]).status).toBe('진행');
    expect(row(state('a'), agent('a'), [turn('a')], [{ ...child, status: 'idle' }]).status).toBe('멈춤');
    expect(row(state('a'), agent('a'), [turn('a')], [{ ...child, labels: { ...child.labels, 'paseo.parent-server-id': 'remote' } }]).status).toBe('멈춤');
  });
  it('archive 감독 행은 보고 유무와 무관하게 제외한다', () => {
    const a = { ...agent('a'), archivedAt: '2026-11-18' };
    expect(statusRows([{ laneDir: a.cwd, state: state('a', 'done') }], [a], 'local')).toEqual([]);
    expect(statusRows([], [a], 'local')).toEqual([]);
  });
  it('다른 호스트·조회 불가는 명시하고 클릭을 막는다', () => {
    const rows = statusRows([{ laneDir: '/missing', state: state('missing') },
      { laneDir: '/foreign', state: { ...state('foreign'), serverId: 'remote' } }], [], 'local');
    expect(rows.every(r => !r.canOpen && r.note)).toBe(true);
  });
  it('오류 파일은 다른 행을 막거나 같은 cwd의 감독을 중복하지 않는다', () => {
    const a = agent('a'); expect(statusRows([{ laneDir: a.cwd, state: null, error: '손상' }], [a], 'local')).toHaveLength(1);
  });
  it('경과 시간은 음수가 되지 않는다', () => {
    expect(elapsed('2026-11-18T00:00:00Z', Date.parse('2026-11-18T00:02:00Z'))).toBe('2분 전');
    expect(elapsed('2026-11-18T00:00:00Z', 0)).toBe('0초 전');
  });
  it.each(['idle', 'closed'])('%s의 미보고는 과거 결정 대기·자식 진행보다 우선한다', status => {
    const expired = [turn('a', '2026-11-18T00:00:01Z')];
    expect(row(decide(state('a', 'user_decision')), agent('a', status), expired).status).toBe('미보고');
    const child = { ...agent('child', 'running'), labels: { 'paseo.parent-agent-id': 'a' } };
    expect(row(state('a'), agent('a', status), expired, [child]).status).toBe('미보고');
  });
  it.each(['waiting', 'done', 'next_action', 'user_decision'] as const)('closed는 %s 순위·판정에서 idle과 같다', kind => {
    const report = kind === 'user_decision' ? decide(state('a', kind)) : state('a', kind);
    const closed = row(report, agent('a', 'closed')); const idle = row(report, agent('a'));
    expect([closed.status, closed.rank]).toEqual([idle.status, idle.rank]);
    expect(closed.canOpen).toBe(true);
  });

});
