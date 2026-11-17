import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import contribute from '../index.server';
import { runPaseo } from '../server/cli';
import { createLaneRpc, linkOriginRpc } from '../shared/contracts';
import { origin, record } from './fixtures';

vi.mock('../server/cli', () => ({ runPaseo: vi.fn(async () => '') }));
const paths: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); vi.clearAllMocks(); for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const path = await mkdtemp(join(tmpdir(), 'supervision-server-')); paths.push(path); vi.stubEnv('XDG_STATE_HOME', path);
  type Handler = (input: unknown, context: unknown) => Promise<unknown>;
  const handlers = new Map<unknown, Handler>();
  contribute({ handle: (contract: unknown, handler: Handler) => { handlers.set(contract, handler); } } as never);
  const old = { id: 'existing', workspaceId: 'wks_existing', archivedAt: null as string | null };
  const oldWorkspace = { archivingAt: null as string | null };
  const lookup = vi.fn(async (): Promise<{ agent: typeof old } | null> => ({ agent: old }));
  const original = { id: origin.agentId, workspaceId: origin.workspaceId, cwd: origin.directory, labels: { 'yw.supervisor': old.id } };
  let lane: { name: string; path: string; agentId: string };
  const context = { paseo: { hosts: { list: async () => ({ self: { serverId: origin.serverId } }) },
    agents: { ref: (id: string) => ({ refresh: async () => id === origin.agentId ? { agent: original }
      : id === lane?.agentId ? { agent: { id, cwd: lane.path, labels: { 'yw.role': 'supervisor' } } } : lookup() }) },
    workspaces: { ref: (id: string) => ({ refresh: async () => id === origin.workspaceId ? { projectId: origin.projectId } : oldWorkspace }) } } };
  const create = async () => lane = await handlers.get(createLaneRpc)!({ goal: record.goal, provider: record.provider,
    origin: { agentId: origin.agentId, workspaceId: origin.workspaceId, projectId: origin.projectId } }, context) as typeof lane;
  const link = async () => handlers.get(linkOriginRpc)!({ name: lane.name }, context);
  return { old, oldWorkspace, lookup, create, link };
}
describe('서버의 기존 감독 링크 보호와 복구', () => {
  it('살아 있는 감독 링크가 있으면 생성하지 않는다', async () => {
    const f = await fixture(); await expect(f.create()).rejects.toThrow('살아 있는 감독');
  });
  it.each(['archived', 'missing', 'unavailable', 'workspace-archived'])('%s 링크는 새 감독으로 갱신한다', async state => {
    const f = await fixture();
    if (state === 'archived') f.old.archivedAt = '2026-11-17';
    if (state === 'missing') f.lookup.mockResolvedValue(null);
    if (state === 'unavailable') f.lookup.mockRejectedValue(new Error('unavailable'));
    if (state === 'workspace-archived') f.oldWorkspace.archivingAt = '2026-11-17';
    const lane = await f.create(); await expect(f.link()).resolves.toEqual({ linked: true });
    expect(runPaseo).toHaveBeenCalledWith(['agent', 'update', origin.agentId, '--label', `yw.supervisor=${lane.agentId}`]);
  });
  it('생성 뒤 다른 감독이 살아 있으면 링크를 덮어쓰지 않는다', async () => {
    const f = await fixture(); f.old.archivedAt = '2026-11-17'; await f.create(); f.old.archivedAt = null;
    await expect(f.link()).rejects.toThrow('덮어쓰지'); expect(runPaseo).not.toHaveBeenCalled();
  });
});
