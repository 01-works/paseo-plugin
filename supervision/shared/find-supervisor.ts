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
  let fallback: { agent: AgentNode; workspace: WorkspaceNode | null; serverId: string } | undefined;
  // 부모가 있으면 부모를 우선하고, 부모가 없을 때만 명시적 감독 링크를 따른다.
  for (let depth = 0; depth < 64; depth++) {
    const parent = node.labels['paseo.parent-agent-id'];
    const id = parent || node.labels['yw.supervisor'];
    if (!id) break;
    const nextServerId = parent ? node.labels['paseo.parent-server-id'] || nodeServerId : nodeServerId;
    const address = `${nextServerId}/${id}`;
    if (visited.has(address)) return { status: 'cycle' };
    visited.add(address);
    const next = await getAgent(id, nextServerId);
    if (!next) break;
    const workspace = next.workspaceId ? await getWorkspace(next.workspaceId, nextServerId) : null;
    fallback ??= { agent: next, workspace, serverId: nextServerId };
    const title = workspace?.title ?? workspace?.name ?? '';
    if (next.labels['yw.role'] === 'supervisor' || title.startsWith('감독 · ')) {
      return { status: next.archivedAt || workspace?.archivingAt ? 'archived' : 'found', agentId: next.id, serverId: nextServerId };
    }
    node = next;
    nodeServerId = nextServerId;
    if (depth === 63) return { status: 'limit' };
  }
  if (!fallback) return { status: 'missing' };
  return { status: fallback.agent.archivedAt || fallback.workspace?.archivingAt ? 'archived' : 'found', agentId: fallback.agent.id, serverId: fallback.serverId };
}
