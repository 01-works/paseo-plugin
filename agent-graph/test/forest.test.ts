import { describe, expect, it } from 'vitest';
import { agentKey } from '../shared/types';
import { buildForest, scopeForest, countForest, visibleRows, initialCollapse, descendantCounts } from '../shared/forest';
import { normalizeAgent } from '../client/normalize';
import { agent, raw } from './fixtures';
const key = (id: string) => agentKey('h', id);
describe('관계와 범위', () => {
  it('다른 workspace 자손을 포함하고 관계 없는 루트를 제외한다', () => {
    const f = buildForest([agent('a'), agent('b', 'a', 'other'), agent('c', 'b'), agent('x')], 'h');
    const group = scopeForest(f, key('b'), 'other', 'group');
    expect([...group.nodes.keys()].sort()).toEqual(['a','b','c'].map(key).sort());
    expect(countForest(group)).toEqual({ total: 3, running: 0 });
  });
  it('workspace는 필요한 외부 조상만 문맥으로 남기고 외부 형제를 제외한다', () => {
    const f = buildForest([agent('a', undefined, 'other'), agent('b', 'a'), agent('c', 'a', 'other'), agent('d', 'b', 'other')], 'h');
    const scoped = scopeForest(f, key('b'), 'w', 'workspace');
    expect(scoped.nodes.has(key('c'))).toBe(false); expect(scoped.nodes.get(key('a'))?.context).toBe(true);
    expect(countForest(scoped).total).toBe(2);
  });
  it('없는/보관된 부모는 문맥 노드로 표시하고 집계에서 제외한다', () => {
    const archived = { ...agent('a'), archived: true };
    const f = buildForest([archived, agent('b', 'a')], 'h');
    expect(f.nodes.size).toBe(2); expect(f.nodes.get(f.roots[0])?.issue).toBe('부모 정보 없음');
    expect(countForest(f).total).toBe(1);
  });
  it('자기 참조와 긴 순환을 끊고 모든 노드가 한 번씩 탐색된다', () => {
    const f = buildForest([agent('a', 'b'), agent('b', 'c'), agent('c', 'a'), agent('self', 'self')], 'h');
    const rows = visibleRows(f, new Set()).rows;
    expect(new Set(rows.map(r => r.key)).size).toBe(4); expect(rows).toHaveLength(4);
    expect([...f.nodes.values()].every(n => n.issue === '순환 관계')).toBe(true);
  });
  it('2,000개 깊은 체인도 재귀 없이 접기·자손 집계를 계산한다', () => {
    const f = buildForest(Array.from({ length: 2000 }, (_, i) => agent(String(i), i ? String(i - 1) : undefined)), 'h');
    expect(visibleRows(f, new Set()).rows).toHaveLength(2000);
    expect(descendantCounts(f).get(key('0'))).toBe(1999);
    expect(initialCollapse(f, key('1999')).size).toBe(0);
    expect(visibleRows(f, new Set([key('0')])).rows).toHaveLength(1);
  });
  it('누락된 현재 에이전트는 빈 그룹으로 남긴다', () => {
    expect(scopeForest(buildForest([agent('a')], 'h'), key('missing'), 'w', 'group').nodes.size).toBe(0);
  });
});
describe('부모와 상태 해석', () => {
  it('first-class null은 stale label을 되살리지 않는다', () => {
    expect(normalizeAgent(raw('b', { labels: { 'paseo.parent-agent-id': 'a' }, parentAgentId: null }), 'h').parentId).toBeNull();
    expect(normalizeAgent(raw('b', { labels: { 'paseo.parent-agent-id': 'a' } }), 'h').parentId).toBe('a');
  });
  it.each([
    [{ status: 'closed', requiresAttention: true, attentionReason: 'permission' }, 'closed'],
    [{ status: 'running', lastError: 'old', attentionReason: 'finished', requiresAttention: false }, 'running'],
    [{ status: 'idle' }, 'idle'],
    [{ status: 'idle', requiresAttention: true, attentionReason: 'finished' }, 'ready'],
    [{ status: 'running', requiresAttention: true, attentionReason: 'permission' }, 'permission'],
    [{ status: 'initializing' }, 'starting'],
    [{ providerUnavailable: true }, 'unavailable'],
    [{ status: 'error' }, 'error'],
  ] as const)('현재 상태를 과거 플래그와 구분: %j', (patch, expected) => {
    expect(normalizeAgent(raw('a', patch), 'h').state).toBe(expected);
  });
});
