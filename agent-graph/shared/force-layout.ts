import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { visibleRows } from './forest';
import { NODE_HEIGHT, NODE_WIDTH, PADDING, type GraphLayout } from './layout';
import type { AgentKey, Forest } from './types';
type ForceNode = SimulationNodeDatum & { key: AgentKey; depth: number; x: number; y: number };
export const FORCE_TICKS = 120;

// D3는 이 함수가 만든 사본만 변경한다. 서버 DTO와 forest는 수정하지 않는다.
// 내부 자동 타이머는 즉시 stop한다. 호출자는 제한된 tick을 나눠 실행한다.
export function createForceLayout(forest: Forest, collapsed: ReadonlySet<AgentKey>, previous?: GraphLayout) {
  const { rows, truncated } = visibleRows(forest, collapsed);
  const nodes: ForceNode[] = rows.map((row, index) => {
    const old = previous?.positions.get(row.key);
    const radius = Math.sqrt(index) * 145, angle = index * Math.PI * (3 - Math.sqrt(5));
    return { ...row, x: old ? old.x + NODE_WIDTH / 2 : radius * Math.cos(angle),
      y: old ? old.y + NODE_HEIGHT / 2 : radius * Math.sin(angle) };
  });
  const keys = new Set(rows.map(row => row.key));
  const pairs = rows.flatMap(row => {
    const parent = forest.nodes.get(row.key)?.parent;
    return parent && keys.has(parent) && !collapsed.has(parent) ? [{ source: parent, target: row.key }] : [];
  });
  const sim = forceSimulation(nodes).stop().alphaDecay(0.055).velocityDecay(0.5)
    .force('charge', forceManyBody<ForceNode>().strength(-180))
    .force('collision', forceCollide<ForceNode>(100).strength(1).iterations(2))
    .force('links', forceLink<ForceNode, { source: string; target: string }>(pairs.map(pair => ({ ...pair })))
      .id(node => node.key).distance(220).strength(0.04))
    .force('x', forceX<ForceNode>(0).strength(0.008)).force('y', forceY<ForceNode>(0).strength(0.008));
  let ticks = 0;
  const result = (): GraphLayout => {
    const minX = nodes.length ? Math.min(...nodes.map(node => node.x - NODE_WIDTH / 2)) : 0;
    const minY = nodes.length ? Math.min(...nodes.map(node => node.y - NODE_HEIGHT / 2)) : 0;
    const positions = new Map(nodes.map(node => [node.key, { key: node.key, depth: node.depth,
      x: node.x - NODE_WIDTH / 2 - minX + PADDING, y: node.y - NODE_HEIGHT / 2 - minY + PADDING }]));
    const links = pairs.map(pair => {
      const source = positions.get(pair.source)!, target = positions.get(pair.target)!;
      return { ...pair, x1: source.x + NODE_WIDTH / 2, y1: source.y + NODE_HEIGHT / 2,
        x2: target.x + NODE_WIDTH / 2, y2: target.y + NODE_HEIGHT / 2 };
    });
    return { positions, links, edges: [], direction: 'force', truncated,
      width: Math.max(NODE_WIDTH + PADDING * 2, ...[...positions.values()].map(node => node.x + NODE_WIDTH + PADDING)),
      height: Math.max(NODE_HEIGHT + PADDING * 2, ...[...positions.values()].map(node => node.y + NODE_HEIGHT + PADDING)) };
  };
  return {
    get done() { return nodes.length < 2 || ticks >= FORCE_TICKS; },
    tick() { if (ticks < FORCE_TICKS) { sim.tick(); ticks++; } }, result,
    stop() { sim.stop(); },
  };
}
