import { describe, expect, it } from 'vitest';
import { findSupervisor, type AgentNode, type WorkspaceNode } from '../shared/find-supervisor';

const node = (id: string, labels: Record<string, string> = {}, extra = {}): AgentNode => ({ id, labels, ...extra });
async function find(nodes: AgentNode[], workspaces: Record<string, WorkspaceNode> = {}) {
  return findSupervisor(nodes[0], 'srv_test', async id => nodes.find(value => value.id === id) ?? null,
    async id => workspaces[id] ?? null);
}
describe('내 감독 탐색', () => {
  it('가장 가까운 supervisor 부모를 선택한다', async () => {
    const result = await find([
      node('worker', { 'paseo.parent-agent-id': 'reviewer', 'yw.supervisor': 'other' }),
      node('reviewer', { 'paseo.parent-agent-id': 'supervisor' }),
      node('supervisor', { 'yw.role': 'supervisor', 'paseo.parent-agent-id': 'chief' }),
      node('chief', { 'yw.role': 'supervisor' }), node('other', { 'yw.role': 'supervisor' }),
    ]);
    expect(result).toEqual({ status: 'found', agentId: 'supervisor', serverId: 'srv_test' });
  });
  it('부모가 없으면 명시적 링크를 사용하고 role 없이도 연다', async () => {
    expect(await find([node('worker', { 'yw.supervisor': 'target' }), node('target')])).toEqual({ status: 'found', agentId: 'target', serverId: 'srv_test' });
  });
  it('workspace의 감독 제목을 인식한다', async () => {
    expect(await find([node('worker', { 'paseo.parent-agent-id': 'parent' }),
      node('parent', {}, { workspaceId: 'wks' })], { wks: { title: '감독 · 목표' } })).toEqual({ status: 'found', agentId: 'parent', serverId: 'srv_test' });
  });
  it('표식이 없는 부모도 마지막 수단으로 연다', async () => {
    expect(await find([node('worker', { 'paseo.parent-agent-id': 'parent' }), node('parent')])).toEqual({ status: 'found', agentId: 'parent', serverId: 'srv_test' });
  });
  it.each([true, false])('archive된 감독을 열지 않는다 (agent=%s)', async agentArchived => {
    const result = await find([node('worker', { 'yw.supervisor': 'supervisor' }),
      node('supervisor', { 'yw.role': 'supervisor' }, { workspaceId: 'wks', archivedAt: agentArchived ? '2026-11-17' : null })],
    { wks: { archivingAt: agentArchived ? null : '2026-11-17' } });
    expect(result.status).toBe('archived');
  });
  it('없는 부모와 연결 없음은 missing으로 안내한다', async () => {
    expect((await find([node('worker')])).status).toBe('missing');
    expect((await find([node('worker', { 'paseo.parent-agent-id': 'gone' })])).status).toBe('missing');
  });
  it('순환과 자기 참조를 중단한다', async () => {
    expect((await find([node('worker', { 'yw.supervisor': 'worker' })])).status).toBe('cycle');
    expect((await find([node('worker', { 'paseo.parent-agent-id': 'parent' }), node('parent', { 'paseo.parent-agent-id': 'worker' })])).status).toBe('cycle');
  });
  it('다른 호스트의 같은 agent ID를 주소로 구분한다', async () => {
    const worker = node('same-id', { 'paseo.parent-agent-id': 'same-id', 'paseo.parent-server-id': 'srv_other' });
    const seen: string[] = [];
    const result = await findSupervisor(worker, 'srv_test', async (id, serverId) => {
      seen.push(`${serverId}/${id}`);
      return node(id, { 'yw.role': 'supervisor' });
    }, async () => null);
    expect(result).toEqual({ status: 'found', agentId: 'same-id', serverId: 'srv_other' });
    expect(seen).toEqual(['srv_other/same-id']);
  });
  it('끝나지 않는 긴 체인을 제한한다', async () => {
    const nodes = Array.from({ length: 70 }, (_, i) => node(`${i}`, { 'paseo.parent-agent-id': `${i + 1}` }));
    expect((await find(nodes)).status).toBe('limit');
  });
});
