import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contributeReports } from '../server/report-tool';
import type { AgentToolDefinition, PluginServerContext, PluginSessionOpenRequest } from '@getpaseo/plugin/server';
import { listReportsRpc } from '../shared/report';
import { report } from './fixtures';

const paths: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });
function setup() {
  const hooks: ((payload: { request: PluginSessionOpenRequest }) => Promise<PluginSessionOpenRequest | void>)[] = [];
  const handle = vi.fn(); const remove = vi.fn();
  const cleanup = contributeReports({ addHook: (name: string, handler: unknown) => { expect(name).toBe('agent.open.before'); hooks.push(handler as never); return remove; }, handle } as unknown as PluginServerContext);
  const request = (provider = 'codex', role = 'supervisor', purpose = 'interactive') => ({ provider, labels: { 'yw.role': role }, purpose, tools: [] } as unknown as PluginSessionOpenRequest);
  return { hook: hooks[0], request, handle, cleanup, remove };
}
describe('도구 부착·호출', () => {
  it.each(['claude', 'codex'])('%s의 감독 라벨에만 기존 도구를 보존하며 하나를 붙인다', async provider => {
    const f = setup(); const request = f.request(provider); const old = { name: 'old' } as AgentToolDefinition; request.tools.push(old);
    expect((await f.hook({ request }))?.tools.map(tool => tool.name)).toEqual(['old', 'supervision_report']);
    expect(await f.hook({ request: f.request(provider, 'worker') })).toBeUndefined();
    expect(await f.hook({ request: f.request(provider, 'supervisor', 'history') })).toBeUndefined();
    f.cleanup(); expect(f.remove).toHaveBeenCalledOnce();
  });
  it('호출자 ID·호스트·시각을 도구가 채우고 RPC는 읽기만 제공한다', async () => {
    const root = await mkdtemp(join(tmpdir(), 'supervision-tool-')); paths.push(root); vi.stubEnv('XDG_STATE_HOME', root);
    const lane = join(root, 'yw-supervisor', 'goal'); await mkdir(lane, { recursive: true });
    const f = setup(); const tool = (await f.hook({ request: f.request() }))!.tools[0];
    const context = { agent: { id: 'trusted-agent', cwd: lane, title: '감독 · 실제 목표' },
      paseo: { hosts: { list: async () => ({ self: { serverId: 'trusted-host' } }) } }, signal: new AbortController().signal };
    const result = await tool.execute(tool.input.parse(report()), context as never);
    const state = JSON.parse(await readFile(join(lane, 'state.json'), 'utf8'));
    expect(state).toMatchObject({ agentId: 'trusted-agent', serverId: 'trusted-host', title: '실제 목표' });
    expect(Number.isFinite(Date.parse(state.reportedAt))).toBe(true);
    expect(result.isError).not.toBe(true);
    expect(f.handle.mock.calls.map(call => call[0])).toEqual([listReportsRpc]);
    expect((await f.handle.mock.calls[0][1]())[0].state).toEqual(state);
  });
});
