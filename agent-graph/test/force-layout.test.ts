import { expect, it } from 'vitest';
import { buildForest } from '../shared/forest';
import { createForceLayout, FORCE_TICKS } from '../shared/force-layout';
import { fitZoom, NODE_HEIGHT, NODE_WIDTH } from '../shared/layout';
import { agentKey } from '../shared/types';
import { agent } from './fixtures';

const settled = (forest: ReturnType<typeof buildForest>, collapsed = new Set<string>()) => {
  const work = createForceLayout(forest, collapsed);
  for (let i = 0; i < FORCE_TICKS; i++) work.tick();
  expect(work.done).toBe(true);
  const result = work.result(); work.tick(); expect(work.result()).toEqual(result); work.stop();
  return result;
};
it('209개 직계 자손을 겹치지 않는 유한 좌표로 배치하고 원본을 수정하지 않음', () => {
  const agents = [agent('root'), ...Array.from({ length: 208 }, (_, i) => agent('child' + i, 'root'))];
  const forest = buildForest(agents, 'h'), before = JSON.stringify([...forest.nodes]);
  const layout = settled(forest), positions = [...layout.positions.values()];
  expect(positions).toHaveLength(209); expect(layout.links).toHaveLength(208);
  expect(JSON.stringify([...forest.nodes])).toBe(before);
  for (const a of positions) {
    expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
    expect(a.x).toBeGreaterThanOrEqual(24); expect(a.y).toBeGreaterThanOrEqual(24);
    expect(a.x + NODE_WIDTH).toBeLessThan(layout.width); expect(a.y + NODE_HEIGHT).toBeLessThan(layout.height);
    for (const b of positions) if (a.key !== b.key) {
      expect(Math.abs(a.x - b.x) >= NODE_WIDTH || Math.abs(a.y - b.y) >= NODE_HEIGHT).toBe(true);
    }
  }
  const zoom = fitZoom(layout, 640, 360);
  expect(zoom).toBeLessThan(0.6);
  expect(layout.width * zoom).toBeLessThanOrEqual(640.01);
  expect(layout.height * zoom).toBeLessThanOrEqual(360.01);
});
it('같은 구조의 상태·제목 변경과 접기 복원은 좌표를 결정적으로 유지', () => {
  const entries = [agent('a'), agent('b', 'a'), agent('c', 'b')];
  const first = settled(buildForest(entries, 'h'));
  expect(settled(buildForest(entries.map(entry => ({ ...entry, state: 'running', title: '다른 이름' })), 'h'))).toEqual(first);
  const collapsed = settled(buildForest(entries, 'h'), new Set([agentKey('h', 'b')]));
  expect(collapsed.positions.has(agentKey('h', 'c'))).toBe(false);
  expect(collapsed.links).toHaveLength(1);
});
it('빈 구조·단일 노드·최대 2,000개에서 상한과 시작 좌표를 안전하게 처리', () => {
  for (const entries of [[], [agent('a')]]) {
    const work = createForceLayout(buildForest(entries, 'h'), new Set());
    expect(work.done).toBe(true); expect(work.result().positions.size).toBe(entries.length); work.stop();
  }
  const forest = buildForest(Array.from({ length: 2001 }, (_, i) => agent(String(i))), 'h');
  const work = createForceLayout(forest, new Set());
  const seed = work.result(); expect(seed.truncated).toBe(true); expect(seed.positions.size).toBe(2000);
  expect(fitZoom(seed, 640, 360)).toBeGreaterThanOrEqual(0.03); work.stop();
});
