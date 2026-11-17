import { describe, expect, it, vi } from 'vitest';
import { createPaseoApi } from '@getpaseo/client';
import type { PluginAgentCommandContext } from '@getpaseo/plugin/client';
import { openMySupervisor, startSupervisor, supervisorConfig } from '../client/actions';
import { consumeOpen, openAgentScreen } from '../client/navigation';
import { linkOriginRpc, createLaneRpc, reportLaneRpc } from '../shared/contracts';
import { record, origin } from './fixtures';

function fixture() {
  const events: string[] = [];
  const profile = { id: 'bootstrap-supervisor', provider: 'claude', model: 'claude-opus-5-5', modeId: 'bypassPermissions',
    thinkingOptionId: 'high', featureValues: {} as Record<string, unknown> };
  const snapshot = { id: origin.agentId, workspaceId: origin.workspaceId, labels: {} as Record<string, string> };
  const original = { refresh: vi.fn(async () => ({ agent: snapshot })) };
  const supervisor = { id: record.agentId, send: vi.fn(async (_text: string) => { events.push('send'); }) };
  const agentsCreate = vi.fn(async () => { events.push('agent'); return supervisor; });
  const setTitle = vi.fn(async () => {});
  const workspacesCreate = vi.fn(async () => { events.push('workspace'); return { id: 'wks_supervisor', setTitle, agents: { create: agentsCreate } }; });
  const rpc = vi.fn(async (contract: unknown, _input?: unknown) => {
    if (contract === reportLaneRpc) return {};
    if (contract === linkOriginRpc) { events.push('link'); snapshot.labels['yw.supervisor'] = record.agentId; return { linked: true }; }
    events.push('lane'); return { name: '목표-20261117-abcd', path: '/state/lane', agentId: record.agentId, origin };
  });
  const openScreen = vi.fn();
  const config = { agentProfiles: [profile] };
  const context = { agent: { id: snapshot.id }, workspace: { id: snapshot.workspaceId, projectId: origin.projectId }, rpc, openScreen,
    paseo: { config: { get: async () => ({ config }) }, hosts: { list: async () => ({ self: { serverId: origin.serverId } }) },
      agents: { ref: vi.fn(() => original) }, workspaces: { create: workspacesCreate } } } as unknown as PluginAgentCommandContext;
  return { context, config, snapshot, rpc, openScreen, original, supervisor, agentsCreate, workspacesCreate, setTitle, events, profile };
}

describe('감독 시작', () => {
  it('프로필을 펼치고 features·없는 프로필·모델은 거부한다', () => {
    expect(supervisorConfig([{ id: 'bootstrap-supervisor', provider: 'codex', model: 'example', options: { service_tier: 'default' } }]))
      .toEqual({ provider: 'codex/example', options: { service_tier: 'default' } });
    expect(() => supervisorConfig(undefined)).toThrow('bootstrap-supervisor');
    expect(() => supervisorConfig([{ id: 'bootstrap-supervisor', provider: 'codex' }])).toThrow('provider/model');
    expect(() => supervisorConfig([{ ...fixture().profile, featureValues: { fast: false } }])).toThrow('features');
  });
  it('서버가 정한 ID로 생성·첫 요청 후 링크하고 같은 코드 프로젝트를 사용한다', async () => {
    const f = fixture(); await startSupervisor(f.context, record.goal);
    expect(f.events).toEqual(['lane', 'workspace', 'agent', 'send', 'link']);
    expect(f.rpc).toHaveBeenCalledWith(createLaneRpc, { goal: record.goal, provider: record.provider,
      origin: { agentId: origin.agentId, workspaceId: origin.workspaceId, projectId: origin.projectId } });
    expect(f.workspacesCreate).toHaveBeenCalledWith({ source: { kind: 'directory', path: '/state/lane', projectId: origin.projectId } });
    expect(f.agentsCreate).toHaveBeenCalledWith({ agentId: record.agentId, config: { provider: record.provider,
      modeId: 'bypassPermissions', thinkingOptionId: 'high' }, title: `감독 · ${record.goal}`, labels: { 'yw.role': 'supervisor' } });
    expect(f.openScreen.mock.calls[0][0].params).toMatchObject({ agentId: record.agentId, serverId: origin.serverId });
  });
  it('빈 목표·없는 프로필·다른 workspace·기존 링크면 생성하지 않는다', async () => {
    const f = fixture(); await expect(startSupervisor(f.context, ' ')).rejects.toThrow('사용법');
    f.snapshot.labels['yw.supervisor'] = 'existing'; await expect(startSupervisor(f.context, '목표')).rejects.toThrow('덮어쓰지');
    delete f.snapshot.labels['yw.supervisor']; f.snapshot.workspaceId = 'other'; await expect(startSupervisor(f.context, '목표')).rejects.toThrow('workspace');
    f.snapshot.workspaceId = origin.workspaceId; f.config.agentProfiles = []; await expect(startSupervisor(f.context, '목표')).rejects.toThrow('프로필');
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(['link', 'readback'])('%s 실패도 첫 요청과 이동을 막지 않고 경고를 로그에 남긴다', async failure => {
    const f = fixture();
    if (failure === 'link') f.rpc.mockImplementation(async contract => { if (contract === linkOriginRpc) throw new Error('label failed');
      return contract === reportLaneRpc ? {} : { name: '목표', path: '/state/lane', agentId: record.agentId, origin }; });
    else f.original.refresh.mockImplementation(async () => ({ agent: { ...f.snapshot, labels: {} } }));
    const result = await startSupervisor(f.context, '목표');
    expect(result.warning).toContain('감독은 시작됐습니다');
    expect(f.rpc).toHaveBeenCalledWith(reportLaneRpc, expect.objectContaining({ detail: expect.stringContaining('workspace: wks_supervisor') }));
    expect(f.supervisor.send).toHaveBeenCalledOnce(); expect(f.openScreen).toHaveBeenCalledOnce();
  });
  it('부분 생성 오류의 상세는 서버 로그에 남기고 toast는 짧게 안내한다', async () => {
    const f = fixture(); f.supervisor.send.mockRejectedValueOnce(new Error('provider detail'));
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('상세: paseo plugin logs supervision');
    expect(f.rpc).toHaveBeenCalledWith(reportLaneRpc, { name: '목표-20261117-abcd', detail: 'workspace: wks_supervisor\nError: provider detail' });
    expect(f.openScreen).not.toHaveBeenCalled();
  });
  it('진단 RPC도 실패하면 이미 만들어진 tasks.md 위치를 안내한다', async () => {
    const f = fixture(); f.rpc.mockImplementation(async contract => { if (contract === reportLaneRpc) throw new Error('offline');
      return { name: '목표', path: '/state/lane', agentId: record.agentId, origin }; });
    f.supervisor.send.mockRejectedValueOnce(new Error('send failed'));
    await expect(startSupervisor(f.context, '목표')).rejects.toThrow('/state/lane/tasks.md');
  });
  it('제목은 surrogate를 자르지 않고 120 코드 포인트로 제한한다', async () => {
    const f = fixture(); await startSupervisor(f.context, '😀'.repeat(121));
    expect(f.setTitle).toHaveBeenCalledWith(`감독 · ${'😀'.repeat(120)}`);
  });
});

describe('감독 이동', () => {
  it('명시적 감독 링크를 열고 뒤로 가기 재마운트에서는 자동 이동을 재실행하지 않는다', async () => {
    const f = fixture(); f.snapshot.labels['yw.supervisor'] = record.agentId;
    f.context.paseo.agents.ref = vi.fn(id => ({ refresh: async () => ({ agent: id === record.agentId
      ? { id: record.agentId, labels: {} } : f.snapshot }) })) as unknown as typeof f.context.paseo.agents.ref;
    await openMySupervisor(f.context);
    const params = f.openScreen.mock.calls[0][0].params;
    expect(consumeOpen(params.requestId)).toBe(true); expect(consumeOpen(params.requestId)).toBe(false);
    openAgentScreen(f.context, origin.serverId, record.agentId);
    expect(consumeOpen(f.openScreen.mock.calls[1][0].params.requestId)).toBe(true);
  });
  it('연결이 없으면 안내하고 화면을 열지 않는다', async () => {
    const f = fixture(); await expect(openMySupervisor(f.context)).rejects.toThrow('찾지 못했습니다'); expect(f.openScreen).not.toHaveBeenCalled();
  });
  it('실제 SDK의 workspace agent 생성이 지정 ID를 driver에 전달한다', async () => {
    const createAgent = vi.fn(async (options: { agentId?: string }) => ({ id: options.agentId }));
    const api = createPaseoApi({ getLastServerInfoMessage: () => ({ serverId: origin.serverId }), createAgent } as never);
    try {
      const workspace = api.workspaces.ref({ id: 'wks', workspaceDirectory: '/lane' } as never);
      expect((await workspace.agents.create({ agentId: record.agentId, config: { provider: record.provider } })).id).toBe(record.agentId);
      expect(createAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: record.agentId, workspaceId: 'wks' }));
    } finally { await api.dispose(); }
  });
});
