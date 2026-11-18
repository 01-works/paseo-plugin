import { defineAgentTool, type PluginServerContext, type PluginHookAgent, type PluginHookContext } from '@getpaseo/plugin/server';
import { reportInputSchema, reportSchema, listReportsRpc } from '../shared/report';
import { ReportStore } from './reports';
import { TurnStore } from './turns';
import { SerialFiles } from './files';

export function contributeReports(server: PluginServerContext) {
  const store = new ReportStore();
  const turns = new TurnStore();
  const events = new SerialFiles();
  const tool = defineAgentTool({
    name: 'supervision_report',
    description: '감독의 턴 종료 상태·누적 항목·미결 결정을 추가로 기록합니다. next_action=배정한 다음 조치(감독 자신이 바로 할 일이면 턴을 끝내지 말 것), waiting=외부 재개 조건 대기, user_decision=사용자 결정 대기, done=미결정 없이 목표 완료. 기존 항목은 유지하며 완료에는 evidence, 사용자 연기에는 deferredBy가 필요합니다. headline에는 사용자가 화면에서 먼저 읽을 현황 한 문장(어디까지 왔고 다음은 무엇인지, 예: "#10221 머지 끝, 스테이징 관찰 중. 내일 오전 승격 판단")을 씁니다.',
    input: reportInputSchema,
    async execute(input, { agent, paseo, signal }) {
      const { self } = await paseo.hosts.list();
      const state = await store.write(agent.cwd, input.laneDir, { version: 1, agentId: agent.id, serverId: self.serverId,
        title: (agent.title?.replace(/^감독 · /, '') || input.items[0].summary).slice(0, 4000),
        reportedAt: new Date().toISOString(), report: reportSchema.parse(input) }, signal);
      return { text: `감독 상태를 기록했습니다: ${state.report.turnEnd.kind}`, structuredContent: { reportedAt: state.reportedAt } };
    },
  });
  const removes = [server.addHook('agent.open.before', async ({ request }) => {
    if (request.purpose !== 'interactive' || request.labels['yw.role'] !== 'supervisor') return;
    return { ...request, tools: [...request.tools, tool] };
  })];
  for (const phase of ['before', 'after'] as const) removes.push(server.addHook(`agent.turn.${phase}`, async ({ agent }: { agent: PluginHookAgent }, { paseo }: PluginHookContext) => {
    const at = new Date().toISOString();
    await events.run(agent.id, async () => {
      const snapshot = await paseo.agents.ref(agent.id).refresh();
      if (snapshot?.agent.labels['yw.role'] === 'supervisor') await turns.record(agent.id, phase, at);
    });
  }));
  server.handle(listReportsRpc, async () => {
    const [lanes, records] = await Promise.all([store.list(), turns.list()]);
    return { lanes, turns: records };
  });
  return () => { for (const remove of removes) remove(); };
}
