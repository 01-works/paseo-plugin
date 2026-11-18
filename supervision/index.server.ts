import type { PluginServerContext } from '@getpaseo/plugin/server';
import { randomUUID } from 'node:crypto';
import { createLaneRpc, linkOriginRpc, reportLaneRpc } from './shared/contracts';
import { hasLiveSupervisor } from './shared/find-supervisor';
import { LaneStore } from './server/lanes';
import { runPaseo } from './server/cli';
import { contributeReports } from './server/report-tool';

export default function contribute(server: PluginServerContext) {
  const removeReports = contributeReports(server);
  const lanes = new LaneStore();
  server.handle(createLaneRpc, async (input, { paseo }) => {
    const [{ self }, original, workspace] = await Promise.all([paseo.hosts.list(),
      paseo.agents.ref(input.origin.agentId).refresh(), paseo.workspaces.ref(input.origin.workspaceId).refresh()]);
    if (!original || original.agent.archivedAt || original.agent.workspaceId !== input.origin.workspaceId || workspace?.projectId !== input.origin.projectId) {
      throw new Error('원 대화의 workspace 또는 코드 프로젝트가 일치하지 않습니다.');
    }
    if (await hasLiveSupervisor(paseo, original.agent.labels['yw.supervisor'])) throw new Error('살아 있는 감독이 연결되어 있습니다. 내 감독으로 이동을 사용하세요.');
    const origin = { ...input.origin, serverId: self.serverId, directory: original.agent.cwd };
    return { ...await lanes.create({ goal: input.goal, provider: input.provider, serverId: self.serverId,
      agentId: randomUUID(), originId: origin.agentId }), origin };
  });
  server.handle(linkOriginRpc, async ({ name }, { paseo }) => {
    const { path, record } = lanes.get(name);
    const [supervisor, original] = await Promise.all([paseo.agents.ref(record.agentId).refresh(), paseo.agents.ref(record.originId).refresh()]);
    if (!supervisor || supervisor.agent.archivedAt || supervisor.agent.cwd !== path || supervisor.agent.labels['yw.role'] !== 'supervisor') throw new Error('이 lane의 감독 대화가 아닙니다.');
    if (!original || original.agent.archivedAt) throw new Error('원 대화를 확인할 수 없습니다.');
    if (original.agent.labels['yw.supervisor'] !== record.agentId && await hasLiveSupervisor(paseo, original.agent.labels['yw.supervisor'])) throw new Error('기존 감독 링크를 덮어쓰지 않습니다.');
    await runPaseo(['agent', 'update', record.originId, '--label', `yw.supervisor=${record.agentId}`]);
    return { linked: true as const };
  });
  server.handle(reportLaneRpc, async ({ name, detail }) => {
    const { path, record } = lanes.get(name);
    console.warn('감독 시작 진단', { path, agentId: record.agentId, detail });
    return {};
  });
  return () => { removeReports(); };
}
