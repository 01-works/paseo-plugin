import type { PluginServerContext } from '@getpaseo/plugin/server';
import { createLaneRpc, bindLaneRpc, runtimeRpc } from './shared/contracts';
import { LaneStore } from './server/lanes';
import { daemonRuntime } from './server/cli';

export default function contribute(server: PluginServerContext) {
  const lanes = new LaneStore();
  server.handle(runtimeRpc, daemonRuntime);
  server.handle(createLaneRpc, async (input, { paseo }) => {
    const { self } = await paseo.hosts.list();
    if (self.serverId !== input.origin.serverId) throw new Error('선택한 호스트와 원 대화의 호스트가 다릅니다.');
    const original = await paseo.agents.ref(input.origin.agentId).refresh();
    if (!original || original.agent.archivedAt || original.agent.workspaceId !== input.origin.workspaceId) {
      throw new Error('원 대화의 workspace가 일치하지 않습니다.');
    }
    const workspace = await paseo.workspaces.ref(input.origin.workspaceId).refresh();
    if (!workspace || workspace.projectId !== input.origin.projectId) throw new Error('원 대화의 코드 프로젝트가 일치하지 않습니다.');
    return lanes.create({ ...input, recordedAt: new Date().toISOString() });
  });
  server.handle(bindLaneRpc, async ({ name, agentId }, { paseo }) => {
    const path = lanes.pathFor(name);
    const supervisor = await paseo.agents.ref(agentId).refresh();
    if (!supervisor || supervisor.agent.archivedAt || supervisor.agent.cwd !== path || supervisor.agent.labels['yw.role'] !== 'supervisor') {
      throw new Error('이 lane에 생성된 감독 대화가 아닙니다.');
    }
    return lanes.bind(name, agentId);
  });
  return () => {};
}
