import type { PaseoAgentConfig } from '@getpaseo/client';
import type { PluginAgentCommandContext } from '@getpaseo/plugin/client';
import { bindLaneRpc, createLaneRpc, runtimeRpc, goalSchema } from '../shared/contracts';
import { supervisorPrompt } from '../shared/lane';
import { findSupervisor } from '../shared/find-supervisor';

interface Profile {
  id: string; provider: string; model?: string;
  modeId?: string; thinkingOptionId?: string; featureValues?: Record<string, unknown>;
  options?: Record<string, unknown>;
}
export function supervisorConfig(profiles: readonly Profile[] | undefined, version: string): PaseoAgentConfig {
  const profile = profiles?.find(value => value.id === 'bootstrap-supervisor');
  if (!profile?.provider) throw new Error('Supervisor 프로필(bootstrap-supervisor)을 읽을 수 없습니다. 호스트의 Agent profiles 설정을 확인하세요.');
  if (!profile.model) throw new Error('Supervisor 프로필(bootstrap-supervisor)에 모델을 지정하세요. SDK는 provider/model 선택이 필요합니다.');
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) throw new Error('대상 데몬의 버전을 확인할 수 없습니다.');
  const optionsApi = Number(match[1]) > 0 || Number(match[2]) >= 16;
  const options = optionsApi && profile.featureValues ? { ...profile.featureValues, ...profile.options } : profile.options;
  return {
    provider: `${profile.provider}/${profile.model}`,
    ...(profile.modeId !== undefined ? { modeId: profile.modeId } : {}),
    ...(profile.thinkingOptionId !== undefined ? { thinkingOptionId: profile.thinkingOptionId } : {}),
    // COMPAT: 0.15 호스트에서만 기존 featureValues를 전송한다. 0.16에는 options만 보낸다.
    ...(!optionsApi && profile.featureValues !== undefined ? { featureValues: profile.featureValues } : {}),
    ...(options !== undefined ? { options } : {}),
  };
}

export async function startSupervisor(context: PluginAgentCommandContext, goal: string) {
  const parsed = goalSchema.safeParse(goal);
  if (!parsed.success) throw new Error('사용법: /supervise <목표> (1~4000자)');
  const { paseo, rpc, agent, workspace } = context;
  // config.get은 공개 SDK의 프로필 읽기 경로다. 다른 설정 필드는 읽거나 저장하지 않는다.
  const [{ config: daemonConfig }, runtime, original] = await Promise.all([
    paseo.config.get().catch(error => { throw new Error(`Supervisor 프로필을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`); }),
    rpc(runtimeRpc, {}), paseo.agents.ref(agent.id).refresh(),
  ]);
  const config = supervisorConfig(daemonConfig.agentProfiles, runtime.version);
  // 0.16 SDK는 featureValues를 options로 접어 보내므로 0.15 호스트의 별도 features를 보존할 수 없다.
  if (config.featureValues && Object.keys(config.featureValues).length > 0 && 'listControls' in paseo.providers) {
    throw new Error('앱은 0.16 이상이고 호스트는 0.15입니다. Supervisor의 features를 보존하려면 호스트를 0.16 이상으로 업데이트하세요.');
  }
  if (!original || original.agent.archivedAt || original.agent.workspaceId !== workspace.id) {
    throw new Error('원 대화의 현재 workspace를 확인할 수 없습니다. 대화를 다시 열어 실행하세요.');
  }
  if (!workspace.projectId) throw new Error('원 대화의 코드 프로젝트를 확인할 수 없습니다.');
  const origin = { serverId: runtime.serverId, agentId: agent.id, workspaceId: workspace.id,
    projectId: workspace.projectId, directory: workspace.directory };
  const lane = await rpc(createLaneRpc, { goal, origin, provider: config.provider });
  let workspaceId: string | undefined;
  let supervisorId: string | undefined;
  try {
    const title = `감독 · ${goal.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
    // directory + projectId는 local isolation에 해당하며 두 대상 버전에서 지원한다.
    const supervisorWorkspace = await paseo.workspaces.create({
      source: { kind: 'directory', path: lane.path, projectId: workspace.projectId },
    });
    workspaceId = supervisorWorkspace.id;
    await supervisorWorkspace.setTitle(title);
    const supervisor = await supervisorWorkspace.agents.create({ config, title, labels: { 'yw.role': 'supervisor' } });
    supervisorId = supervisor.id;
    // 첫 프롬프트 전에 실제 소유 ID를 기록하고 복귀 링크를 만든다.
    await rpc(bindLaneRpc, { name: lane.name, agentId: supervisor.id });
    const readback = await paseo.agents.ref(agent.id).refresh();
    if (readback?.agent.labels['yw.supervisor'] !== supervisor.id) throw new Error('원 대화의 감독 링크 readback이 일치하지 않습니다.');
    await supervisor.send(supervisorPrompt(goal, lane.path, origin));
    context.openScreen({ screenId: 'open-agent', params: { agentId: supervisor.id, serverId: runtime.serverId } });
    return { agentId: supervisor.id, workspaceId, lanePath: lane.path };
  } catch (error) {
    // 실제 생성 여부가 불명확한 리소스를 자동 archive하거나 같은 명령을 재전송하지 않는다.
    throw new Error(`감독 전환 중 오류: ${error instanceof Error ? error.message : String(error)}\n기록: ${lane.path}\nworkspace: ${workspaceId ?? '생성 확인 필요'}\n감독: ${supervisorId ?? '생성 확인 필요'}\n위 리소스를 확인한 뒤 이어서 진행하세요. 명령을 다시 실행하면 새 lane이 만들어집니다.`);
  }
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
  context.openScreen({ screenId: 'open-agent', params: { agentId: result.agentId, serverId: result.serverId } });
}
