import { expect, it } from 'vitest';
import { buildForest, initialCollapse } from '../shared/forest';
import { fitZoom, layoutForest, NODE_HEIGHT, NODE_WIDTH } from '../shared/layout';
import { agentKey } from '../shared/types';
import { agent } from './fixtures';
it('상태와 긴 제목 변경은 signature와 좌표를 바꾸지 않는다', () => {
  const agents = [agent('root'), agent('a', 'root'), agent('b', 'root')];
  const first = buildForest(agents, 'h');
  const second = buildForest(agents.map(a => ({ ...a, state: 'running', title: '긴 제목'.repeat(50) })), 'h');
  expect(first.signature).toBe(second.signature);
  expect(layoutForest(first, new Set())).toEqual(layoutForest(second, new Set()));
});
it('형제는 겹치지 않고 자식은 부모 아래에 배치된다', () => {
  const f = buildForest([agent('root'), agent('a', 'root'), agent('b', 'root'), agent('c', 'a')], 'h');
  const positions = [...layoutForest(f, new Set()).positions.values()];
  for (const a of positions) for (const b of positions) if (a.key !== b.key && a.depth === b.depth) {
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(NODE_WIDTH);
  }
  expect(positions.find(p => p.key === agentKey('h', 'c'))!.y).toBeGreaterThan(NODE_HEIGHT);
});
it('노드 상한으로 잘린 그래프를 전체 자료로 표시하지 않음', () => {
  const f = buildForest(Array.from({ length: 210 }, (_, i) => agent(String(i))), 'h');
  const l = layoutForest(f, new Set(), 200);
  expect(l.positions.size).toBe(200); expect(l.truncated).toBe(true);
  expect(fitZoom(l, 300, 200)).toBe(0.75);
});
it('200개가 넘는 관계도 기본 그래프 배치는 전체를 유지', () => {
  const f = buildForest([agent('root'), ...Array.from({ length: 208 }, (_, i) => agent(String(i), 'root'))], 'h');
  const l = layoutForest(f, new Set());
  expect(l.positions.size).toBe(209); expect(l.truncated).toBe(false); expect(l.edges.length).toBe(208 + 2);
});
it('현재 노드로 이어지는 경로는 초기 접기에서 제외', () => {
  const f = buildForest([agent('a'), agent('b', 'a'), agent('c', 'b'), agent('x', 'a'), agent('y', 'x')], 'h');
  const collapsed = initialCollapse(f, agentKey('h', 'c'));
  expect(collapsed.has(agentKey('h', 'b'))).toBe(false); expect(collapsed.has(agentKey('h', 'x'))).toBe(true);
});
