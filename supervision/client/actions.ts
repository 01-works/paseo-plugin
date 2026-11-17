import type { PaseoAgentConfig } from '@getpaseo/client';
import type { PluginAgentCommandContext } from '@getpaseo/plugin/client';
import { linkOriginRpc, createLaneRpc, reportLaneRpc, goalSchema } from '../shared/contracts';
import { supervisorPrompt } from '../shared/lane';
import { findSupervisor } from '../shared/find-supervisor';
import { openAgentScreen } from './navigation';

interface Profile {
  id: string; provider: string; model?: string; modeId?: string; thinkingOptionId?: string;
  featureValues?: Record<string, unknown>; options?: Record<string, unknown>;
}
export function supervisorConfig(profiles: readonly Profile[] | undefined): PaseoAgentConfig {
  const profile = profiles?.find(value => value.id === 'bootstrap-supervisor');
  if (!profile?.provider || !profile.model) throw new Error('Supervisor 프로필(bootstrap-supervisor)의 provider/model을 확인하세요.');
  if (Object.keys(profile.featureValues ?? {}).length) throw new Error('Supervisor 프로필의 features는 지원하지 않습니다. features를 비운 뒤 실행하세요.');
  const { provider, model, modeId, thinkingOptionId, options } = profile;
  return { provider: `${provider}/${model}`, ...(modeId !== undefined ? { modeId } : {}),
    ...(thinkingOptionId !== undefined ? { thinkingOptionId } : {}), ...(options !== undefined ? { options } : {}) };
}

export async function startSupervisor(context: PluginAgentCommandContext, goal: string) {
  if (!goalSchema.safeParse(goal).success) throw new Error('사용법: /supervise <목표> (1~4000자)');
  const { paseo, rpc, agent, workspace } = context;
  const [{ config: daemonConfig }, original] = await Promise.all([paseo.config.get(), paseo.agents.ref(agent.id).refresh()]);
  if (!original || original.agent.archivedAt || original.agent.workspaceId !== workspace.id) throw new Error('원 대화의 현재 workspace를 확인할 수 없습니다.');
  if (original.agent.labels['yw.supervisor']) throw new Error('이미 감독 링크가 있습니다. 내 감독으로 이동을 사용하세요. 기존 링크를 덮어쓰지 않습니다.');
  if (!workspace.projectId) throw new Error('원 대화의 코드 프로젝트를 확인할 수 없습니다.');
  const config = supervisorConfig(daemonConfig.agentProfiles);
  const lane = await rpc(createLaneRpc, { goal, provider: config.provider,
    origin: { agentId: agent.id, workspaceId: workspace.id, projectId: workspace.projectId } });
  let workspaceId: string | undefined;
  let warning: string | undefined;
  const diagnose = async (detail: string) => {
    try {
      await rpc(reportLaneRpc, { name: lane.name, detail: `workspace: ${workspaceId ?? '생성 확인 필요'}\n${detail}`.slice(0, 8192) });
      return '상세: paseo plugin logs supervision';
    } catch { return `상세 로그 저장 실패. 생성 기록: ${lane.path}/tasks.md`; }
  };
  try {
    const title = `감독 · ${Array.from(goal.replace(/\s+/g, ' ').trim()).slice(0, 120).join('')}`;
    const supervisorWorkspace = await paseo.workspaces.create({ source: { kind: 'directory', path: lane.path, projectId: workspace.projectId } });
    workspaceId = supervisorWorkspace.id;
    await supervisorWorkspace.setTitle(title);
    const supervisor = await supervisorWorkspace.agents.create({ agentId: lane.agentId, config, title, labels: { 'yw.role': 'supervisor' } });
    if (supervisor.id !== lane.agentId) throw new Error(`예정한 감독 ID와 생성 결과가 다릅니다: ${supervisor.id}`);
    await supervisor.send(supervisorPrompt(goal, lane.path, lane.origin));
    try {
      await rpc(linkOriginRpc, { name: lane.name });
      if ((await paseo.agents.ref(agent.id).refresh())?.agent.labels['yw.supervisor'] !== supervisor.id) throw new Error('복귀 링크 readback 불일치');
    } catch (error) { warning = `감독은 시작됐습니다. 복귀 링크 확인 필요. ${await diagnose(`복귀 링크 경고: ${String(error)}`)}`; }
    openAgentScreen(context, lane.origin.serverId, supervisor.id);
  } catch (error) {
    throw new Error(`감독 시작 중 오류. ${await diagnose(String(error))} (lane: ${lane.name})`);
  }
  return { agentId: lane.agentId, workspaceId, lanePath: lane.path, warning };
}

export async function openMySupervisor(context: PluginAgentCommandContext) {
  const { paseo, agent } = context;
  const [{ self }, current] = await Promise.all([paseo.hosts.list(), paseo.agents.ref(agent.id).refresh()]);
  if (!current) throw new Error('현재 대화를 확인할 수 없습니다.');
  const remotes = new Map<string, Awaited<ReturnType<typeof paseo.hosts.client>>>();
  const host = async (serverId: string) => {
    if (serverId === self.serverId) return paseo;
    let remote = remotes.get(serverId);
    if (!remote) { remote = await paseo.hosts.client(serverId); remotes.set(serverId, remote); }
    return remote;
  };
  let result;
  try {
    result = await findSupervisor(current.agent, self.serverId,
      async (id, serverId) => (await (await host(serverId)).agents.ref(id).refresh())?.agent ?? null,
      async (id, serverId) => (await host(serverId)).workspaces.ref(id).refresh());
  } finally {
    await Promise.all([...remotes.values()].map(remote => remote.dispose()));
  }
  if (result.status === 'archived') throw new Error('감독 대화 또는 workspace가 archive되어 있습니다. 보관된 대화를 확인하세요.');
  if (result.status === 'cycle' || result.status === 'limit') throw new Error('부모 연결이 순환하거나 너무 깊습니다. 감독 링크를 확인하세요.');
  if (result.status !== 'found') throw new Error('연결된 감독을 찾지 못했습니다. /supervise <목표>로 감독을 시작하세요.');
  openAgentScreen(context, result.serverId, result.agentId);
}
