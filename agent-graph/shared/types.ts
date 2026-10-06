export type AgentKey = string;
export type AgentState = 'closed' | 'error' | 'unavailable' | 'permission' | 'running' | 'starting' | 'ready' | 'idle' | 'unknown';
export type Scope = 'group' | 'workspace';
export type Agent = {
  key: AgentKey; id: string; parentId: string | null; workspaceId: string | null;
  title: string; provider: string; model: string | null; cwd: string;
  createdAt: string; updatedAt: string; state: AgentState; archived: boolean;
};
export type ForestNode = {
  key: AgentKey; agent: Agent | null; parent: AgentKey | null;
  children: AgentKey[]; context: boolean; issue: string | null;
};
export type Forest = { nodes: Map<AgentKey, ForestNode>; roots: AgentKey[]; signature: string };
export const agentKey = (hostId: string, agentId: string): AgentKey => JSON.stringify([hostId, agentId]);
export const stateLabels: Record<AgentState, string> = {
  closed: '닫힘', error: '오류', unavailable: '제공자 사용 불가', permission: '입력 필요',
  running: '실행 중', starting: '시작 중', ready: '결과 확인', idle: '대기', unknown: '확인 불가',
};
