import type { LaneRecord } from '../shared/lane';
export const origin = { serverId: 'srv_test', agentId: '20218122-4526-41e8-aee5-965c3850cdc1',
  workspaceId: 'wks_original', projectId: 'project_original', directory: '/code/project' };
export const record: LaneRecord = { goal: '기존 대화 감독 전환', provider: 'claude/claude-opus-5-5',
  agentId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', serverId: origin.serverId };
export const report = () => ({ headline: '검사 배정, 결과 대기', items: [{ id: 'goal', summary: '목표', status: 'open' as const }],
  turnEnd: { kind: 'next_action' as const, detail: '검사 실행' }, decisions: [] });
