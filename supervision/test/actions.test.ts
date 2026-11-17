import { describe, expect, it, vi } from 'vitest';
import type { PluginAgentCommandContext } from '@getpaseo/plugin/client';
import { openMySupervisor, startSupervisor, supervisorConfig } from '../client/actions';
import { bindLaneRpc, createLaneRpc, runtimeRpc } from '../shared/contracts';
import { record } from './fixtures';

const supervisorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
function fixture() {
  const events: string[] = [];
  const profile = { id: 'bootstrap-supervisor', provider: 'claude', model: 'claude-opus-5-5', modeId: 'bypassPermissions',
    thinkingOptionId: 'high', featureValues: { example: false } };
  const snapshot = { id: record.origin.agentId, workspaceId: record.origin.workspaceId, labels: {} as Record<string, string>, archivedAt: null };
  const original = { refresh: vi.fn(async () => ({ agent: snapshot })) };
  const supervisor = { id: supervisorId, send: vi.fn(async () => { events.push('send'); }) };
  const agentsCreate = vi.fn(async () => { events.push('agent'); return supervisor; });
  const setTitle = vi.fn(async () => {});
  const workspacesCreate = vi.fn(async () => { events.push('workspace'); return { id: 'wks_supervisor', setTitle, agents: { create: agentsCreate } }; });
  const rpc = vi.fn(async (contract: unknown) => {
    if (contract === runtimeRpc) return { version: '0.15.4', serverId: 'srv_test' };
    if (contract === bindLaneRpc) { events.push('bind'); snapshot.labels['yw.supervisor'] = supervisorId; return { linked: true }; }
    events.push('lane'); return { name: '목표-20261117-abcd', path: '/state/yw-supervisor/목표-20261117-abcd' };
  });
  const openScreen = vi.fn();
  const config = { agentProfiles: [profile] };
  const context = {
    agent: { id: snapshot.id }, workspace: { id: snapshot.workspaceId, projectId: record.origin.projectId, directory: record.origin.directory },
    rpc, openScreen, paseo: { config: { get: async () => ({ config }) }, hosts: { list: async () => ({ self: { serverId: 'srv_test' } }) },
      providers: {}, agents: { ref: vi.fn(() => original) }, workspaces: { create: workspacesCreate } },
  } as unknown as PluginAgentCommandContext;
  return { context, config, snapshot, rpc, openScreen, original, supervisor, agentsCreate, workspacesCreate, setTitle, events, profile };
}

describe('감독 시작 액션', () => {
  it('프로필을 SDK config로 펼치며 없는 필드는 생략한다', () => {
    expect(supervisorConfig([{ id: 'bootstrap-supervisor', provider: 'codex', model: 'example' }], '0.15.4')).toEqual({ provider: 'codex/example' });
    expect(() => supervisorConfig([{ id: 'bootstrap-supervisor', provider: 'codex' }], '0.15.4')).toThrow('모델');
    expect(() => supervisorConfig(undefined, '0.15.4')).toThrow('bootstrap-supervisor');
    expect(() => supervisorConfig([{ id: 'other', provider: 'claude' }], '0.15.4')).toThrow('프로필');
  });
  it('0.16에는 deprecated featureValues를 보내지 않고 options로 합친다', () => {
    const profile = { id: 'bootstrap-supervisor', provider: 'codex', model: 'example',
      featureValues: { fast_mode: true, service_tier: 'fast' }, options: { service_tier: 'default' } };
    expect(supervisorConfig([profile], '0.16.1')).toEqual({ provider: 'codex/example', options: { fast_mode: true, service_tier: 'default' } });
    expect(supervisorConfig([profile], '0.15.4')).toHaveProperty('featureValues', profile.featureValues);
    expect(() => supervisorConfig([profile], 'unknown')).toThrow('버전');
  });
  it('lane → 같은 프로젝트 local workspace → agent → 소유 기록과 링크 → 첫 프롬프트 → 이동', async () => {
    const f = fixture();
    await startSupervisor(f.context, record.goal);
    expect(f.events).toEqual(['lane', 'workspace', 'agent', 'bind', 'send']);
    expect(f.workspacesCreate).toHaveBeenCalledWith({ source: { kind: 'directory', path: '/state/yw-supervisor/목표-20261117-abcd',
      projectId: record.origin.projectId } });
    expect(f.setTitle).toHaveBeenCalledWith(`감독 · ${record.goal}`);
    expect(f.agentsCreate).toHaveBeenCalledWith({ config: { provider: 'claude/claude-opus-5-5', modeId: 'bypassPermissions',
      thinkingOptionId: 'high', featureValues: { example: false } }, title: `감독 · ${record.goal}`, labels: { 'yw.role': 'supervisor' } });
    expect(f.supervisor.send).toHaveBeenCalledOnce();
    expect(f.supervisor.send.mock.calls[0]).toBeDefined();
    expect(f.openScreen).toHaveBeenCalledWith({ screenId: 'open-agent', params: { agentId: supervisorId, serverId: 'srv_test' } });
  });
  it('목표가 없거나 프로필을 못 읽으면 파일과 workspace를 만들지 않는다', async () => {
    const f = fixture();
    await expect(startSupervisor(f.context, ' ')).rejects.toThrow('사용법');
    f.config.agentProfiles = [];
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('프로필');
    expect(f.rpc.mock.calls.some(([contract]) => contract === createLaneRpc)).toBe(false);
    expect(f.workspacesCreate).not.toHaveBeenCalled();
  });
  it('archive되었거나 workspace가 다른 원 대화는 거부한다', async () => {
    const f = fixture(); f.snapshot.workspaceId = 'other';
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('workspace');
    expect(f.rpc.mock.calls.some(([contract]) => contract === createLaneRpc)).toBe(false);
  });
  it('링크 실패 시 생성된 리소스를 보고하고 프롬프트를 보내지 않는다', async () => {
    const f = fixture();
    f.rpc.mockImplementation(async contract => {
      if (contract === runtimeRpc) return { version: '0.15.4', serverId: 'srv_test' };
      if (contract === bindLaneRpc) throw new Error('label failed');
      return { name: '목표', path: '/state/lane' };
    });
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow(`workspace: wks_supervisor\n감독: ${supervisorId}`);
    expect(f.supervisor.send).not.toHaveBeenCalled();
    expect(f.openScreen).not.toHaveBeenCalled();
  });
  it('라벨 readback 불일치를 놓치지 않는다', async () => {
    const f = fixture();
    f.original.refresh.mockImplementation(async () => ({ agent: { ...f.snapshot, labels: {} } }));
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('readback');
    expect(f.supervisor.send).not.toHaveBeenCalled();
  });
  it('0.16 앱과 0.15 호스트 조합에서 legacy features를 조용히 유실하지 않는다', async () => {
    const f = fixture();
    Object.assign(f.context.paseo.providers, { listControls: () => {} });
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('features를 보존');
    expect(f.rpc.mock.calls.some(([contract]) => contract === createLaneRpc)).toBe(false);
  });
});

describe('내 감독 이동 액션', () => {
  it('명시적 감독 링크를 화면 navigation으로 전달한다', async () => {
    const f = fixture(); f.snapshot.labels['yw.supervisor'] = supervisorId;
    f.context.paseo.agents.ref = vi.fn(id => ({ refresh: async () => ({ agent: id === supervisorId
      ? { id: supervisorId, labels: {} } : f.snapshot }) })) as unknown as typeof f.context.paseo.agents.ref;
    await openMySupervisor(f.context);
    expect(f.openScreen).toHaveBeenCalledWith({ screenId: 'open-agent', params: { agentId: supervisorId, serverId: 'srv_test' } });
  });
  it('연결이 없으면 안내하고 화면을 열지 않는다', async () => {
    const f = fixture();
    await expect(openMySupervisor(f.context)).rejects.toThrow('찾지 못했습니다');
    expect(f.openScreen).not.toHaveBeenCalled();
  });
});
