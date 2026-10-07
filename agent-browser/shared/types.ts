export type AgentKey = string;
export type AgentState = 'closed' | 'error' | 'unavailable' | 'permission' | 'running' | 'starting' | 'ready' | 'idle' | 'unknown';
export type Agent = {
  key: AgentKey; id: string; workspaceId: string | null;
  title: string;
  createdAt: string; updatedAt: string; state: AgentState; archived: boolean;
};
export const agentKey = (hostId: string, agentId: string): AgentKey => JSON.stringify([hostId, agentId]);
export const stateLabels: Record<AgentState, string> = {
  closed: '닫힘', error: '오류', unavailable: '제공자 사용 불가', permission: '입력 필요',
  running: '실행 중', starting: '시작 중', ready: '결과 확인', idle: '대기', unknown: '확인 불가',
};
