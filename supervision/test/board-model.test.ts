import { describe, expect, it } from 'vitest';
import { boardColors, boardLayout, cardFacts, groupLanes, itemProgress, keepSelection, keepTab, LANES, mix, resumeText, replyLine, SIDEBAR, TONE, workersOf, turnEndText, type Status } from '../client/board-model';
import type { Report } from '../shared/report';

const statuses: Status[] = ['사용자 결정', '미보고', '멈춤', '대기', '진행', '완료', '알 수 없음'];

describe('레인 분류', () => {
  it('모든 상태가 정확히 한 레인에 속하고 확인 필요는 미보고·멈춤·알 수 없음을 모은다', () => {
    for (const status of statuses) expect(LANES.filter(lane => lane.statuses.includes(status))).toHaveLength(1);
    expect(LANES.map(lane => lane.title)).toEqual(['사용자 결정', '확인 필요', '대기', '진행', '완료']);
    expect(groupLanes([{ status: '미보고' }, { status: '멈춤' }, { status: '알 수 없음' }])[1].rows).toHaveLength(3);
  });
  it('입력 정렬을 유지하며 레인별 개수를 세고 빈 레인도 돌려준다', () => {
    const rows = [{ key: 'a', status: '멈춤' }, { key: 'b', status: '진행' }, { key: 'c', status: '미보고' }, { key: 'd', status: '알 수 없음' }] as const;
    const groups = groupLanes(rows);
    expect(groups.map(group => [group.id, group.rows.length])).toEqual([['decision', 0], ['attention', 3], ['waiting', 0], ['running', 1], ['done', 0]]);
    expect(groups[1].rows.map(row => row.key)).toEqual(['a', 'c', 'd']);
  });
  it('좁은 화면의 첫 탭은 비어 있지 않은 첫 레인, 모두 비면 사용자 결정', () => {
    expect(keepTab(null, groupLanes([{ status: '완료' }, { status: '대기' }]))).toBe('waiting');
  });
  it('탭은 첫 카드가 보인 갱신에서 한 번 정하고, 새 사용자 결정이 생기거나 레인이 비어도 유지한다', () => {
    expect(keepTab(null, groupLanes([]))).toBeNull();
    const first = keepTab(null, groupLanes([{ status: '진행' }]));
    expect(first).toBe('running');
    expect(keepTab(first, groupLanes([{ status: '사용자 결정' }, { status: '진행' }]))).toBe('running');
    expect(keepTab(first, groupLanes([{ status: '사용자 결정' }]))).toBe('running');
  });
  it('갱신 결과에서 사라진 선택은 지워져 같은 키가 돌아와도 다시 열리지 않는다', () => {
    const rows = [{ key: '/lane/a' }, { key: '/lane/b' }];
    expect(keepSelection('/lane/a', rows)).toBe('/lane/a');
    const gone = keepSelection('/lane/a', [{ key: '/lane/b' }]);
    expect(gone).toBeNull();
    expect(keepSelection(gone, rows)).toBeNull();
  });
  it('상태 표식은 모양만으로도 서로 구분된다', () => {
    expect(new Set(statuses.map(status => TONE[status].shape)).size).toBe(statuses.length);
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

describe('카드 내용', () => {
  const state = (report: Report) => ({ version: 1 as const, agentId: 'a', serverId: 's', title: '목표', reportedAt: '2026-11-18T00:00:00Z', report });
  it('항목·연기·대기 재개 조건을 pill로, 턴 종료를 블록으로 만든다', () => {
    const facts = cardFacts({ status: '대기', state: state({ items: [{ id: 'a', summary: 'A', status: 'done', evidence: 'PR' }, { id: 'b', summary: 'B', status: 'deferred', deferredBy: '사용자' }],
      turnEnd: { kind: 'waiting', detail: 'PR 검사 대기', resume: { type: 'pr_check', ref: 'PR #18' } }, decisions: [] }) });
    expect(facts.pills.map(pill => [pill.key, pill.label, pill.tone])).toEqual([['items', '1/2', 'statusSuccess'], ['deferred', '연기 1', undefined], ['resume', 'PR 검사 · PR #18', undefined]]);
    expect(facts.turn).toEqual({ icon: 'Hourglass', text: '대기 · PR 검사 대기' });
    expect(facts.decision).toBeNull();
  });
  it('열린 항목이 있으면 항목 pill을 물들이지 않고, 대기가 아니면 재개 pill이 없다', () => {
    const facts = cardFacts({ status: '사용자 결정', state: state({ items: [{ id: 'a', summary: 'A', status: 'open' }],
      turnEnd: { kind: 'user_decision', detail: '선택 필요', resume: { type: 'child', ref: 'x' } },
      decisions: [{ question: 'Q1?', options: ['A', 'B'], recommendation: 'A', impact: 'i' }, { question: 'Q2?', options: ['A', 'B'], recommendation: 'B', impact: 'i' }] }) });
    expect(facts.pills.map(pill => [pill.key, pill.tone])).toEqual([['items', undefined]]);
    expect(facts.decision).toEqual({ question: 'Q1?', count: 2 });
  });
  it('보고가 없으면 블록 없이 비고만, 멈춤 비고는 위험 표시', () => {
    expect(cardFacts({ status: '알 수 없음', state: null, note: '시각을 알 수 없음' })).toMatchObject({ pills: [], turn: null, decision: null, note: { danger: false } });
    expect(cardFacts({ status: '멈춤', state: null, note: '감독 조회 불가' }).note).toEqual({ text: '감독 조회 불가', danger: true });
  });
});

describe('지금 하는 일', () => {
  const report = (extra: Partial<Report> = {}): Report => ({ items: [{ id: 'a', summary: 'A', status: 'open' }], turnEnd: { kind: 'next_action', detail: '배정' }, decisions: [], ...extra });
  const row = (rep: Report | null) => ({ status: '진행' as const, state: rep && { version: 1 as const, agentId: 'a', serverId: 's', title: 't', reportedAt: '2026-11-18T00:00:00Z', report: rep } });
  it('카드 현황은 headline → 마지막 응답 → 턴 종료 순', () => {
    expect(cardFacts(row(report({ headline: '머지 끝, 관찰 중' })), '응답').turn?.text).toBe('머지 끝, 관찰 중');
    expect(cardFacts(row(report()), '검증 작업자 배정함').turn).toEqual({ icon: 'MessageSquareText', text: '검증 작업자 배정함' });
    expect(cardFacts(row(report())).turn?.text).toBe('다음 조치 · 배정');
    expect(cardFacts(row(null), '응답만 있음').turn?.text).toBe('응답만 있음');
  });
  it('마지막 응답은 마크다운을 벗긴 첫 1~2줄을 120자 안으로', () => {
    expect(replyLine('## 진행 상황\n\n- **#10452** 검증 [PR](http://x) 배정\n- 세 번째 줄')).toBe('진행 상황 #10452 검증 PR 배정');
    expect(replyLine('```ts\ncode\n```\n`supervision_report` 기록 완료')).toBe('supervision_report 기록 완료');
    expect(replyLine('| a | b |\n\n')).toBeUndefined();
    expect(replyLine('가'.repeat(200))).toHaveLength(120);
  });
  it('작업자는 같은 호스트의 미보관 자식을 실행 중 → 대기 → 오류로 세고 실행 중 제목 2개를 보인다', () => {
    const child = (id: string, status: string, extra: object = {}) => ({ id, title: `#${id}`, status, labels: { 'paseo.parent-agent-id': 'sup' }, ...extra });
    const agents = [child('1', 'idle'), child('2', 'running'), child('3', 'running'), child('4', 'initializing'), child('5', 'error'),
      child('6', 'running', { archivedAt: '2026-11-18' }), child('7', 'running', { labels: { 'paseo.parent-agent-id': 'sup', 'paseo.parent-server-id': 'other' } }),
      { id: 'x', title: 'x', status: 'running', labels: {} }];
    const workers = workersOf(agents, 'sup', 'srv');
    expect(workers.line).toBe('실행 중 3 · 대기 1 · 오류 1 — #2, #3');
    expect(workers.all.map(agent => agent.id)).toEqual(['2', '3', '4', '1', '5']);
    expect(workersOf(agents, 'none', 'srv')).toEqual({ all: [], line: null });
  });
});

describe('색과 배치', () => {
  it('테마 색을 섞고, 해석할 수 없는 색은 그대로 둔다', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#fff', 'rgb(0, 0, 0)', 1)).toBe('#000000');
    expect(mix('var(--x)', '#ffffff', 0.5)).toBe('var(--x)');
  });
  it('어두운 테마는 surface2 카드와 surface1 패널, 밝은 테마는 surface0 카드와 surface1·2 사이 패널', () => {
    const base = { surface1: '#202020', surface2: '#303030', border: '#404040', foreground: '#ffffff', foregroundMuted: '#a0a0a0',
      accent: '#3080ff', accentForeground: '#ffffff', statusSuccess: '#30c060', statusWarning: '#e0a030', statusDanger: '#f05050' };
    expect(boardColors({ ...base, surface0: '#101010' })).toMatchObject({ isDark: true, card: '#303030', panel: '#202020' });
    expect(boardColors({ ...base, surface0: '#ffffff', surface1: '#fafafa', surface2: '#f0f0f0' })).toMatchObject({ isDark: false, card: '#ffffff', panel: '#f5f5f5' });
  });
  it('폰 배치는 host compact에서만, 좁은 데스크톱은 레인을 가로 스크롤한다', () => {
    expect(boardLayout(1400, true).phone).toBe(true);
    expect(boardLayout(400, false)).toMatchObject({ phone: false, laneWidth: 260 });
  });
  it('레인 폭은 300~340을 나누고, 두 레인이 들어가도록 260까지 줄며, 그보다 좁으면 220까지', () => {
    expect(boardLayout(2400, false).laneWidth).toBe(340);
    expect(boardLayout(1700, false).laneWidth).toBe(Math.floor((1700 - 24 - 32) / 5));
    expect(boardLayout(580, false).laneWidth).toBe(274);
    expect(boardLayout(300, false).laneWidth).toBe(260);
    expect(boardLayout(200, false).laneWidth).toBe(220);
  });
  it('1020 이상에서만 사이드바(380)를 열고, 그보다 좁으면 Modal', () => {
    expect(boardLayout(1019, false, true)).toMatchObject({ inline: false, sidebar: 0 });
    expect(boardLayout(1020, false, true)).toMatchObject({ inline: true, sidebar: SIDEBAR.width });
    expect(boardLayout(1700, false, true)).toMatchObject({ inline: true, sidebar: 380, laneWidth: 300 });
    expect(boardLayout(1700, false, false).sidebar).toBe(0);
  });
});
