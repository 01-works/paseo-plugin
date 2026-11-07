import { expect, it } from 'vitest';
import { normalizeAgent } from '../client/normalize';
import { collapseLineage, continuedFrom, lineageRoots } from '../shared/lineage';
import { raw } from './fixtures';

const u = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const make = (id: string, patch: Parameters<typeof raw>[1] = {}) => normalizeAgent(raw(id, patch), 'h');

it('이전 대화는 라벨 순서대로 읽고, 없으면 제목의 다른 대화 ID를 쓰며 자기 ID와 빈 라벨은 무시', () => {
  expect(continuedFrom('x', 't', { 'handoff.from': 'h', 'zerosub.continued-from': 'z' })).toBe('z');
  expect(continuedFrom('x', 't', { 'agent-list.continued-from': ' l ' })).toBe('l');
  expect(continuedFrom(u(1), `${u(1)} 말고 ${u(2).toUpperCase()} 이어서`, { 'agent-list.continued-from': '' })).toBe(u(2));
  expect(continuedFrom('x', '재개', { 'handoff.from': 'x' })).toBeNull();
  // 제목의 ID는 이어가기 요청일 때만 근거로 쓴다.
  expect(continuedFrom('x', `yw-supervisor: ${u(4)} 결과 리뷰`, {})).toBeNull();
  expect(continuedFrom('x', `${u(5)} 에이전트 작업이 유령상태`, {})).toBeNull();
  expect(continuedFrom('x', `${u(6)} 인계받아 재개`, {})).toBe(u(6));
  // 이름 정리로 제목이 바뀌어도 원래 제목 라벨의 ID로 묶음을 유지한다.
  expect(continuedFrom('x', '카드 결제 간헐 실패 조사', { 'agent-list.original-title': `${u(3)} 에이전트 이어서 해줘` })).toBe(u(3));
});
it('보관·다른 workspace에서 끊고 순환은 한 묶음으로 모은다', () => {
  const agents = [make('a'), make('b', { labels: { 'zerosub.continued-from': 'a' } }), make('c', { labels: { 'handoff.from': 'b' } }),
    make('gone', { archivedAt: '2026-01-02T00:00:00Z' }), make('after-gone', { labels: { 'handoff.from': 'gone' } }),
    make('foreign', { workspaceId: 'other' }), make('after-foreign', { labels: { 'handoff.from': 'foreign' } }),
    make('y', { labels: { 'handoff.from': 'z' } }), make('z', { labels: { 'handoff.from': 'y' } })];
  const roots = lineageRoots(agents, 'w');
  expect(Object.fromEntries(roots)).toEqual({ a: 'a', b: 'a', c: 'a', 'after-gone': 'after-gone', 'after-foreign': 'after-foreign', y: 'y', z: 'y' });
});
it('정렬 순서대로 묶음마다 한 줄로 접고, 현재 대화가 묶음에 있으면 현재 대화를 대표로', () => {
  const agents = [make('c', { labels: { 'handoff.from': 'b' } }), make('solo'), make('b', { labels: { 'handoff.from': 'a' } }), make('a')];
  const roots = lineageRoots(agents, 'w');
  expect(collapseLineage(agents, roots).map(row => [row.agent.id, row.members.length])).toEqual([['c', 3], ['solo', 1]]);
  expect(collapseLineage(agents, roots, 'a').map(row => row.agent.id)).toEqual(['a', 'solo']);
});
