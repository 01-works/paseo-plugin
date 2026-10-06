import { visibleRows } from './forest';
import type { AgentKey, Forest } from './types';
export const NODE_WIDTH = 176, NODE_HEIGHT = 80, SIBLING_GAP = 16, LEVEL_GAP = 32, PADDING = 24;
export type Position = { key: AgentKey; x: number; y: number; depth: number };
export type Segment = { x: number; y: number; width: number; height: number };
export type GraphLayout = { positions: Map<AgentKey, Position>; edges: Segment[]; width: number; height: number; truncated: boolean };
export function layoutForest(forest: Forest, collapsed: ReadonlySet<AgentKey>, limit = 2000): GraphLayout {
  const { rows, truncated } = visibleRows(forest, collapsed, limit);
  const visible = new Set(rows.map(row => row.key)), widths = new Map<AgentKey, number>();
  for (let i = rows.length - 1; i >= 0; i--) {
    const children = forest.nodes.get(rows[i].key)!.children.filter(key => visible.has(key));
    widths.set(rows[i].key, Math.max(NODE_WIDTH, children.reduce((sum, key) => sum + widths.get(key)!, 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP));
  }
  const positions = new Map<AgentKey, Position>(), edges: Segment[] = [];
  let left = PADDING, height = PADDING * 2;
  const queue: { key: AgentKey; left: number; depth: number }[] = [];
  for (const key of forest.roots.filter(key => visible.has(key))) {
    queue.push({ key, left, depth: 0 }); left += widths.get(key)! + SIBLING_GAP;
  }
  for (let index = 0; index < queue.length; index++) {
    const row = queue[index];
    const position = { key: row.key, x: row.left + (widths.get(row.key)! - NODE_WIDTH) / 2, y: PADDING + row.depth * (NODE_HEIGHT + LEVEL_GAP), depth: row.depth };
    positions.set(row.key, position); height = Math.max(height, position.y + NODE_HEIGHT + PADDING);
    let childLeft = row.left;
    for (const key of forest.nodes.get(row.key)!.children.filter(key => visible.has(key))) {
      queue.push({ key, left: childLeft, depth: row.depth + 1 }); childLeft += widths.get(key)! + SIBLING_GAP;
    }
  }
  for (const parent of positions.values()) {
    const children = forest.nodes.get(parent.key)!.children.map(key => positions.get(key)).filter(child => child !== undefined);
    if (!children.length) continue;
    const px = parent.x + NODE_WIDTH / 2;
    const xs = children.map(child => child.x + NODE_WIDTH / 2);
    const start = parent.y + NODE_HEIGHT, middle = start + LEVEL_GAP / 2;
    const left = Math.min(px, ...xs), right = Math.max(px, ...xs);
    edges.push({ x: px, y: start, width: 1, height: LEVEL_GAP / 2 },
      { x: left, y: middle, width: Math.max(1, right - left), height: 1 },
      ...xs.map(x => ({ x, y: middle, width: 1, height: LEVEL_GAP / 2 })));
  }
  return { positions, edges, width: Math.max(NODE_WIDTH + PADDING * 2, left - SIBLING_GAP + PADDING), height, truncated };
}
export const fitZoom = (layout: GraphLayout, width: number, height: number) =>
  Math.max(0.75, Math.min(1, width / layout.width, height / layout.height));
