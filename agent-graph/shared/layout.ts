import { visibleRows } from './forest';
import type { AgentKey, Forest } from './types';
export const NODE_WIDTH = 176, NODE_HEIGHT = 80, SIBLING_GAP = 16, LEVEL_GAP = 32, PADDING = 24;
export type Position = { key: AgentKey; x: number; y: number; depth: number };
export type Segment = { x: number; y: number; width: number; height: number };
export type GraphLink = { source: AgentKey; target: AgentKey; x1: number; y1: number; x2: number; y2: number };
export type GraphLayout = { positions: Map<AgentKey, Position>; edges: Segment[]; width: number; height: number; truncated: boolean;
  direction: 'down' | 'right' | 'force'; links?: GraphLink[] };
export function layoutForest(forest: Forest, collapsed: ReadonlySet<AgentKey>, limit = 2000): GraphLayout {
  const { rows, truncated } = visibleRows(forest, collapsed, limit);
  const visible = new Set(rows.map(row => row.key)), widths = new Map<AgentKey, number>();
  const childrenOf = (key: AgentKey) => collapsed.has(key) ? [] : forest.nodes.get(key)!.children.filter(child => visible.has(child));
  // 넓은 관계는 세로 스크롤로 탐색한다. 깊은 체인은 기존 아래 방향을 유지한다.
  const direction = rows.filter(row => !childrenOf(row.key).length).length > 8 ? 'right' : 'down';
  const crossSize = direction === 'right' ? NODE_HEIGHT : NODE_WIDTH;
  for (let i = rows.length - 1; i >= 0; i--) {
    const children = childrenOf(rows[i].key);
    widths.set(rows[i].key, Math.max(crossSize, children.reduce((sum, key) => sum + widths.get(key)!, 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP));
  }
  const positions = new Map<AgentKey, Position>(), edges: Segment[] = [];
  let left = PADDING, width = PADDING * 2, height = PADDING * 2;
  const queue: { key: AgentKey; left: number; depth: number }[] = [];
  for (const key of forest.roots.filter(key => visible.has(key))) {
    queue.push({ key, left, depth: 0 }); left += widths.get(key)! + SIBLING_GAP;
  }
  for (let index = 0; index < queue.length; index++) {
    const row = queue[index];
    const cross = row.left + (widths.get(row.key)! - crossSize) / 2;
    const position = { key: row.key, x: direction === 'right' ? PADDING + row.depth * (NODE_WIDTH + LEVEL_GAP) : cross,
      y: direction === 'right' ? cross : PADDING + row.depth * (NODE_HEIGHT + LEVEL_GAP), depth: row.depth };
    width = Math.max(width, position.x + NODE_WIDTH + PADDING);
    positions.set(row.key, position); height = Math.max(height, position.y + NODE_HEIGHT + PADDING);
    let childLeft = row.left;
    for (const key of childrenOf(row.key)) {
      queue.push({ key, left: childLeft, depth: row.depth + 1 }); childLeft += widths.get(key)! + SIBLING_GAP;
    }
  }
  for (const parent of positions.values()) {
    const children = childrenOf(parent.key).map(key => positions.get(key)).filter(child => child !== undefined);
    if (!children.length) continue;
    if (direction === 'right') {
      const py = parent.y + NODE_HEIGHT / 2, ys = children.map(child => child.y + NODE_HEIGHT / 2);
      const start = parent.x + NODE_WIDTH, middle = start + LEVEL_GAP / 2;
      const top = Math.min(py, ...ys), bottom = Math.max(py, ...ys);
      edges.push({ x: start, y: py, width: LEVEL_GAP / 2, height: 1 },
        { x: middle, y: top, width: 1, height: Math.max(1, bottom - top) },
        ...ys.map(y => ({ x: middle, y, width: LEVEL_GAP / 2, height: 1 })));
      continue;
    }
    const px = parent.x + NODE_WIDTH / 2;
    const xs = children.map(child => child.x + NODE_WIDTH / 2);
    const start = parent.y + NODE_HEIGHT, middle = start + LEVEL_GAP / 2;
    const left = Math.min(px, ...xs), right = Math.max(px, ...xs);
    edges.push({ x: px, y: start, width: 1, height: LEVEL_GAP / 2 },
      { x: left, y: middle, width: Math.max(1, right - left), height: 1 },
      ...xs.map(x => ({ x, y: middle, width: 1, height: LEVEL_GAP / 2 })));
  }
  return { positions, edges, width: Math.max(NODE_WIDTH + PADDING * 2, width), height, truncated, direction };
}
export const fitZoom = (layout: GraphLayout, width: number, height: number) =>
  Math.max(layout.direction === 'force' ? 0.03 : 0.75, Math.min(1, width / layout.width, height / layout.height));
