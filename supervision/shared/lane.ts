import type { Origin } from './contracts';

export function goalSlug(goal: string): string {
  const normalized = goal.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return Array.from(normalized).slice(0, 48).join('').replace(/-+$/g, '') || 'goal';
}

export function laneName(goal: string, now: Date, suffix: string): string {
  if (!/^[a-z0-9]{4}$/.test(suffix)) throw new Error('lane 접미사는 영숫자 4자여야 합니다.');
  if (!Number.isFinite(now.getTime())) throw new Error('기록 시각이 올바르지 않습니다.');
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${goalSlug(goal)}-${date}-${suffix}`;
}

export interface LaneRecord {
  goal: string;
  origin: Origin;
  provider: string;
  recordedAt: string;
}

export function tasksMarkdown(record: LaneRecord, agentId?: string): string {
  const ledger = {
    목표버전: 1,
    승인: [],
    항목: [{ id: 'G1', 원문: record.goal, 시각: record.recordedAt,
      출처: `대화 ${record.origin.serverId}/${record.origin.agentId}`, 상태: '열림', 대기: '없음' }],
  };
  // 원문에 코드 펜스가 있어도 JSON 블록을 닫지 못하게 한다. JSON.parse는 원문을 복원한다.
  const json = JSON.stringify(ledger, null, 2).replace(/`/g, '\\u0060');
  return `감독: ${record.provider} ${agentId ?? '<대화 생성 후 ID 기록>'} @ ${record.origin.serverId}\n상태: 진행\n\n\`\`\`json\n${json}\n\`\`\`\n\n## 기존 작업자\n\n\`\`\`json\n${JSON.stringify(record.origin, null, 2).replace(/`/g, '\\u0060')}\n\`\`\`\n\n원 대화는 계속 유지합니다. 감독이 맥락과 실제 작업 상태를 읽고 작업표를 갱신합니다.\n`;
}

export function supervisorPrompt(goal: string, path: string, origin: Origin): string {
  return `yw-supervisor 스킬로 다음 목표를 총괄해 주세요. 직접 구현하지 말고 작업자 배정·검증·완료를 관리하세요.\n\n목표 원문:\n${goal}\n\n감독 lane 폴더(cwd, tasks.md 위치): ${path}\n시작할 때 tasks.md를 읽고 머리말의 소유 ID와 yw.role=supervisor 라벨을 확인·readback하세요.\n전환을 요청한 원 대화와 workspace를 기존 작업자로 기록하세요:\n${JSON.stringify(origin, null, 2)}\n필요하면 위 {serverId, agentId}의 대화 기록을 직접 읽으세요. 원 대화에 이미 있는 맥락을 사용자에게 다시 묻지 마세요. 기존 작업자를 중단하거나 중복 생성하지 마세요.\n감독 운영 규칙과 권한 판단은 yw-supervisor 스킬을 따르세요.`;
}
