import { describe, expect, it } from 'vitest';
import { elapsed, statusRows, type Supervisor } from '../shared/status';
import type { ReportState } from '../shared/report';

const state = (id: string, kind: ReportState['report']['turnEnd']['kind'] = 'next_action'): ReportState => ({ version: 1,
  agentId: id, serverId: 'local', title: id, reportedAt: '2026-11-18T00:00:00Z', report: {
    items: [{ id: 'g', summary: '목표', status: kind === 'done' ? 'done' : 'open', ...(kind === 'done' ? { evidence: 'commit abc' } : {}) }],
    turnEnd: { kind, detail: '상태', ...(kind === 'waiting' ? { resume: { type: 'child', ref: 'child' } as const } : {}) }, decisions: [] } });
const agent = (id: string, status = 'running'): Supervisor => ({ id, cwd: `/lanes/${id}`, title: id, status,
  lastActivityAt: '2026-11-17T23:59:00Z', labels: { 'yw.role': 'supervisor' } });
describe('목표별 목록 판정', () => {
  it('결정 → 멈춤/미보고 → 대기 → 진행 → 완료 순으로 정렬한다', () => {
    const states = [state('complete', 'done'), state('running'), state('wait', 'waiting'), state('stopped'), state('decision')];
    states[4].report.decisions = [{ question: '선택?', options: ['A', 'B'], recommendation: 'A', impact: '구현' }];
    const rows = statusRows(states.map(s => ({ laneDir: `/lanes/${s.agentId}`, state: s })),
      [...states.map(s => agent(s.agentId, s.agentId === 'stopped' ? 'idle' : 'running')), agent('unreported', 'idle')], 'local');
    expect(rows.map(r => r.status)).toEqual(['사용자 결정', '멈춤', '미보고', '대기', '진행', '완료']);
  });
  it('보고 뒤 활동이 있는 idle만 미보고이며 동시각·running·미래 보고는 제외한다', () => {
    for (const [status, time, expected] of [['idle', '00:00:01', '미보고'], ['running', '00:00:01', '대기'],
      ['idle', '00:00:00', '대기'], ['idle', '23:59:59', '미보고']]) {
      const a = { ...agent('a', status), lastActivityAt: `2026-11-18T${time}Z` };
      expect(statusRows([{ laneDir: a.cwd, state: state('a', 'waiting') }], [a], 'local')[0].status).toBe(expected);
    }
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
