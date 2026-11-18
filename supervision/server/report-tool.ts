import { defineAgentTool, type PluginServerContext } from '@getpaseo/plugin/server';
import { reportInputSchema, reportSchema, listReportsRpc } from '../shared/report';
import { ReportStore } from './reports';

export function contributeReports(server: PluginServerContext) {
  const store = new ReportStore();
  const tool = defineAgentTool({
    name: 'supervision_report',
    description: '감독의 턴 종료 전에 누적 목표 항목, 종료 상태·재개 조건, 미결 사용자 결정을 보고합니다. 매번 전체 상태를 대체합니다. 완료 항목에는 evidence, 사용자 연기에는 deferredBy가 필요합니다.',
    input: reportInputSchema,
    async execute(input, { agent, paseo, signal }) {
      const { self } = await paseo.hosts.list();
      const state = await store.write(agent.cwd, input.laneDir, { version: 1, agentId: agent.id, serverId: self.serverId,
        title: (agent.title?.replace(/^감독 · /, '') || input.items[0].summary).slice(0, 4000),
        reportedAt: new Date().toISOString(), report: reportSchema.parse(input) }, signal);
      return { text: `감독 상태를 기록했습니다: ${state.report.turnEnd.kind}`, structuredContent: { reportedAt: state.reportedAt } };
    },
  });
  const remove = server.addHook('agent.open.before', async ({ request }) => {
    if (request.purpose !== 'interactive' || request.labels['yw.role'] !== 'supervisor') return;
    return { ...request, tools: [...request.tools, tool] };
  });
  server.handle(listReportsRpc, () => store.list());
  return remove;
}
