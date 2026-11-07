import type { Agent } from './types';

/** 이어받은 대화가 이전 대화 ID를 남기는 라벨. 한도 전환(ZeroSub), 인계(handoff 스킬), 이름 정리 도우미 순. */
export const continuedFromLabels = ['zerosub.continued-from', 'handoff.from', 'agent-list.continued-from'] as const;
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// 제목의 ID는 이어가기 요청일 때만 근거로 쓴다("<ID> 결과 리뷰"·"<ID> 유령 상태" 같은 언급은 제외).
const continuing = /이어|재개|인계|넘겨받|인수|continue|resume|take ?over|pick up/i;

/**
 * 라벨, 없으면 이어가기를 요청한 제목(사용자가 연 대화는 첫 메시지)에 적힌 다른 대화 ID. 빈 라벨은 연결 해제로 보고 제목을 본다.
 * 이름 정리로 제목이 바뀌어도 묶음이 풀리지 않도록 원래 제목 라벨도 본다.
 */
export function continuedFrom(id: string, title: string, labels: Readonly<Record<string, string>> | undefined): string | null {
  for (const key of continuedFromLabels) {
    const value = labels?.[key]?.trim().toLowerCase();
    if (value && value !== id.toLowerCase()) return value;
  }
  for (const text of [title, labels?.['agent-list.original-title'] ?? '']) {
    if (!continuing.test(text)) continue;
    for (const match of text.matchAll(uuid)) {
      const value = match[0].toLowerCase();
      if (value !== id.toLowerCase()) return value;
    }
  }
  return null;
}

/** 같은 workspace의 미보관 대화마다 이어진 묶음의 기준 ID(가장 앞 대화). 보관된 대화에서 끊기며 순환은 가장 작은 ID로 모은다. */
export function lineageRoots(agents: readonly Agent[], workspaceId: string): Map<string, string> {
  const live = new Map(agents.filter(agent => !agent.archived && agent.workspaceId === workspaceId)
    .map(agent => [agent.id.toLowerCase(), agent]));
  const roots = new Map<string, string>();
  for (const agent of live.values()) {
    const path: string[] = [];
    let current = agent, root: string | undefined;
    for (;;) {
      const key = current.id.toLowerCase();
      const known = roots.get(current.id);
      if (known) { root = known; break; }
      path.push(key);
      const previous = current.continuedFrom ? live.get(current.continuedFrom) : undefined;
      if (!previous) { root = current.id; break; }
      const loop = path.indexOf(previous.id.toLowerCase());
      if (loop >= 0) { root = live.get(path.slice(loop).sort()[0])!.id; break; }
      current = previous;
    }
    for (const key of path) roots.set(live.get(key)!.id, root);
  }
  return roots;
}

export type LineageRow = { agent: Agent; members: readonly Agent[] };
/** 정렬된 목록을 묶음마다 한 줄로 접는다. 대표는 정렬상 첫 대화이며, 현재 대화가 묶음에 있으면 현재 대화. */
export function collapseLineage(sorted: readonly Agent[], roots: ReadonlyMap<string, string>, currentId?: string): LineageRow[] {
  const groups = new Map<string, Agent[]>();
  for (const agent of sorted) {
    const key = roots.get(agent.id) ?? agent.id;
    const members = groups.get(key);
    if (members) members.push(agent); else groups.set(key, [agent]);
  }
  return [...groups.values()].map(members => ({ agent: members.find(agent => agent.id === currentId) ?? members[0], members }));
}
