/** 이름 정리 도우미 대화 표시. 도우미 자신은 이름 정리 대상에서 뺀다. */
export const renameRoleLabel = 'agent-list.role';
export const renameRole = 'rename';
/** 이름을 바꾼 대화에 남기는 원래 제목. 되돌릴 때 쓴다. */
export const originalTitleLabel = 'agent-list.original-title';

/**
 * 가벼운 요약·이름 짓기라 저렴한 모델을 쓴다. 앞에서부터 이 기기에서 쓸 수 있는 첫 모델.
 * 기본 모드는 Paseo 도구 호출 승인을 받을 수 없어(Codex auto는 승인 정책 never로 거부) 자동 검토 모드를 쓴다.
 */
export const renameModels = [
  { provider: 'codex', model: 'gpt-6.1-terra', thinkingOptionId: 'low', modeId: 'auto-review' },
  { provider: 'claude', model: 'claude-sonnet-5-5', thinkingOptionId: 'low', modeId: 'auto' },
] as const;

/** 도우미가 같은 작업으로 판단해 묶은 이전 대화 ID. 빈 값이면 묶지 않는다. */
export const linkLabel = 'agent-list.continued-from';

// 플러그인 SDK에는 에이전트 이름·라벨 변경이 없어(0.15 기준) 도우미가 Paseo 도구 update_agent로 바꾼다.
// 묶기와 이름은 라벨로 되돌릴 수 있어 묻지 않고 적용한다. 보관은 하지 않는다.
export function renamePrompt(workspaceId: string): string {
  return [
    `이 workspace(${workspaceId})의 에이전트 대화를 작업 단위로 정리한다. Paseo 도구(list_agents, get_agent_activity, update_agent)를 쓴다. 도구가 없으면 그렇다고 알리고 멈춘다.`,
    '',
    '1. list_agents(sinceHours 720, limit 200)로 이 workspace의 미보관 대화를 읽는다. 라벨 paseo.parent-agent-id가 있는 대화(감독자가 만든 작업자), running·initializing, ' + renameRoleLabel + ' 라벨이 있는 대화는 읽기만 하고 바꾸지 않는다.',
    `2. 이어진 관계: 라벨 zerosub.continued-from·handoff.from·${linkLabel}이나 제목에 적힌 다른 대화 ID가 있으면 이미 묶여 있다.`,
    `3. 묶이지 않은 대화 중 앞선 대화의 같은 작업을 이어간 것이 분명하면(예: "이어서 진행", "재개", 같은 이슈·같은 결과물) get_agent_activity(limit 20)로 확인하고 update_agent로 labels에 ${linkLabel}=<바로 앞 대화 ID>를 붙인다. 주제만 비슷하면 묶지 않고, paseo.parent-agent-id가 있는 대화(감독자 작업자)는 앞 대화로도 지정하지 않는다.`,
    `4. 작업(묶음)마다 가장 최근 대화 하나만 이름을 본다. 제목이 첫 메시지를 자른 문장·URL·에이전트 ID·"재개"처럼 내용을 알 수 없거나 "(continued)"가 붙었으면, 묶음의 활동을 보고 40자 이내 한국어 작업 이름으로 바꾸고 labels에 ${originalTitleLabel}=<원래 제목 앞 200자>를 남긴다. 이슈·PR 번호가 있으면 앞에 둔다(예: "#9117 웹훅 전달 진단"). 알맞은 제목은 그대로 둔다.`,
    '5. 사용자가 이미 승인했으므로 묻지 않고 적용한 뒤, 묶은 대화(짧은 ID → 앞 대화, 근거 한 줄)와 이름(짧은 ID, 원래 → 새, 결과) 표로 보고한다.',
    '',
    `되돌려 달라고 하면 이름은 ${originalTitleLabel} 라벨의 제목으로, 묶음은 ${linkLabel} 라벨을 빈 값으로 바꾼다. 이름·묶음 라벨 외에는 보관·메시지 전송·설정 변경 등 아무것도 하지 않는다.`,
  ].join('\n');
}
