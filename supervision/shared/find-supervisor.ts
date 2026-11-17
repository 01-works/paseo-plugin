export interface AgentNode {
  id: string;
  labels: Readonly<Record<string, string>>;
  workspaceId?: string;
  archivedAt?: string | null;
}
export interface WorkspaceNode { title?: string | null; name?: string | null; archivingAt?: string | null }
export type SupervisorResult =
  | { status: 'found' | 'archived'; agentId: string; serverId: string }
  | { status: 'missing' | 'cycle' | 'limit' };

export async function findSupervisor(
  current: AgentNode,
  serverId: string,
  getAgent: (id: string, serverId: string) => Promise<AgentNode | null>,
  getWorkspace: (id: string, serverId: string) => Promise<WorkspaceNode | null>,
): Promise<SupervisorResult> {
  const visited = new Set([`${serverId}/${current.id}`]);
  let node = current;
  let nodeServerId = serverId;
  // 사용자가 만든 명시적 링크가 부모보다 우선한다.
  for (let depth = 0; depth < 64; depth++) {
    const explicit = node.labels['yw.supervisor'];
    const id = explicit || node.labels['paseo.parent-agent-id'];
    if (!id) break;
    const nextServerId = explicit ? nodeServerId : node.labels['paseo.parent-server-id'] || nodeServerId;
    const address = `${nextServerId}/${id}`;
    if (visited.has(address)) return { status: 'cycle' };
    visited.add(address);
    const next = await getAgent(id, nextServerId);
    if (!next) break;
    const workspace = next.workspaceId ? await getWorkspace(next.workspaceId, nextServerId) : null;
    const title = workspace?.title ?? workspace?.name ?? '';
    if (explicit || next.labels['yw.role'] === 'supervisor' || title.startsWith('감독 · ')) {
      return { status: next.archivedAt || workspace?.archivingAt ? 'archived' : 'found', agentId: next.id, serverId: nextServerId };
    }
    node = next;
    nodeServerId = nextServerId;
    if (depth === 63) return { status: 'limit' };
  }
  return { status: 'missing' };
}
