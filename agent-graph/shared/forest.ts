import { agentKey, type Agent, type AgentKey, type Forest, type ForestNode, type Scope } from './types';

function finish(nodes: Map<AgentKey, ForestNode>): Forest {
  const compare = (a: AgentKey, b: AgentKey) =>
    (nodes.get(a)?.agent?.createdAt ?? '').localeCompare(nodes.get(b)?.agent?.createdAt ?? '') || a.localeCompare(b);
  const roots: AgentKey[] = [];
  for (const node of nodes.values()) {
    node.children = []; if (node.parent && !nodes.has(node.parent)) node.parent = null;
  }
  for (const node of nodes.values()) {
    if (node.parent) nodes.get(node.parent)!.children.push(node.key); else roots.push(node.key);
  }
  roots.sort(compare);
  for (const node of nodes.values()) node.children.sort(compare);
  // 상태·제목은 포함하지 않는다. 관계와 표시 범위가 바뀔 때만 좌표를 다시 계산한다.
  const signature = JSON.stringify([...nodes.values()].sort((a, b) => a.key.localeCompare(b.key))
    .map(n => [n.key, n.parent, n.context, n.children]));
  return { nodes, roots, signature };
}

export function buildForest(agents: readonly Agent[], hostId: string): Forest {
  const nodes = new Map<AgentKey, ForestNode>();
  for (const agent of agents) if (!agent.archived) {
    nodes.set(agent.key, { key: agent.key, agent, parent: null, children: [], context: false, issue: null });
  }
  for (const node of [...nodes.values()]) {
    if (!node.agent?.parentId) continue;
    const parentKey = agentKey(hostId, node.agent.parentId);
    if (nodes.has(parentKey)) node.parent = parentKey;
    else {
      const missingKey = 'missing:' + parentKey;
      if (!nodes.has(missingKey)) nodes.set(missingKey, {
        key: missingKey, agent: null, parent: null, children: [], context: true, issue: '부모 정보 없음',
      });
      node.parent = missingKey;
    }
  }
  const done = new Set<AgentKey>();
  for (const start of nodes.keys()) {
    const path: AgentKey[] = [], visiting = new Map<AgentKey, number>();
    let key: AgentKey | null = start;
    while (key && !done.has(key)) {
      if (visiting.has(key)) {
        const cycle = path.slice(visiting.get(key));
        const cut = [...cycle].sort()[0];
        nodes.get(cut)!.parent = null;
        for (const member of cycle) nodes.get(member)!.issue = '순환 관계';
        break;
      }
      visiting.set(key, path.length); path.push(key); key = nodes.get(key)?.parent ?? null;
    }
    for (const member of path) done.add(member);
  }
  return finish(nodes);
}

export function scopeForest(full: Forest, origin: AgentKey, workspaceId: string, scope: Scope): Forest {
  const active = new Set<AgentKey>(), included = new Set<AgentKey>();
  if (scope === 'group') {
    let root = full.nodes.get(origin);
    while (root?.parent) root = full.nodes.get(root.parent);
    if (root) collect(full, [root.key], included);
    for (const key of included) if (full.nodes.get(key)?.agent) active.add(key);
  } else {
    const seeds = [...full.nodes.values()].filter(n => n.agent?.workspaceId === workspaceId).map(n => n.key);
    collect(full, seeds, active);
    for (const key of active) included.add(key);
    for (const key of active) {
      let parent = full.nodes.get(key)?.parent;
      while (parent && !included.has(parent)) { included.add(parent); parent = full.nodes.get(parent)?.parent; }
    }
  }
  const nodes = new Map<AgentKey, ForestNode>();
  for (const key of included) {
    const node = full.nodes.get(key)!;
    nodes.set(key, { ...node, children: [], context: !node.agent || !active.has(key) });
  }
  return finish(nodes);
}
function collect(forest: Forest, seeds: AgentKey[], target: Set<AgentKey>) {
  const stack = [...seeds];
  while (stack.length) {
    const key = stack.pop()!;
    if (target.has(key)) continue;
    target.add(key); stack.push(...(forest.nodes.get(key)?.children ?? []));
  }
}
export function countForest(forest: Forest) {
  let total = 0, running = 0;
  for (const node of forest.nodes.values()) if (node.agent && !node.context) {
    total++; if (node.agent.state === 'running') running++;
  }
  return { total, running };
}
export type TreeRow = { key: AgentKey; depth: number };
export function visibleRows(forest: Forest, collapsed: ReadonlySet<AgentKey>, limit = 2000) {
  const rows: TreeRow[] = [];
  const stack = forest.roots.slice().reverse().map(key => ({ key, depth: 0 }));
  while (stack.length && rows.length < limit) {
    const row = stack.pop()!; rows.push(row);
    if (collapsed.has(row.key)) continue;
    const children = forest.nodes.get(row.key)?.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push({ key: children[i], depth: row.depth + 1 });
  }
  return { rows, truncated: stack.length > 0 };
}
export function descendantCounts(forest: Forest): Map<AgentKey, number> {
  const all = visibleRows(forest, new Set(), forest.nodes.size).rows;
  const counts = new Map<AgentKey, number>();
  for (let i = all.length - 1; i >= 0; i--) {
    const row = all[i], node = forest.nodes.get(row.key)!;
    counts.set(row.key, node.children.reduce((sum, key) =>
      sum + (forest.nodes.get(key)?.agent && !forest.nodes.get(key)?.context ? 1 : 0) + (counts.get(key) ?? 0), 0));
  }
  return counts;
}
export function initialCollapse(forest: Forest, origin: AgentKey): Set<AgentKey> {
  const collapsed = new Set<AgentKey>();
  for (const row of visibleRows(forest, new Set()).rows) {
    if (row.depth >= 1 && forest.nodes.get(row.key)?.children.length) collapsed.add(row.key);
  }
  let node = forest.nodes.get(origin);
  while (node) { collapsed.delete(node.key); node = node.parent ? forest.nodes.get(node.parent) : undefined; }
  return collapsed;
}
