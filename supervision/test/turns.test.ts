import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TurnStore } from '../server/turns';

const roots: string[] = [];
const before = '2026-11-18T00:00:01.000Z';
const after = '2026-11-18T00:00:02.000Z';
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'supervision-turns-')); roots.push(root); return { root, store: new TurnStore(root) }; }
describe('영속 턴 시각', () => {
  it('플러그인 재시작 중에도 현재 시작과 마지막 종료 턴의 시작을 보존한다', async () => {
    const { root, store } = await fixture();
    await store.record('a', 'before', before);
    await new TurnStore(root).record('a', 'after', after);
    expect(await new TurnStore(root).list()).toEqual([{ agentId: 'a', lastEndedStartedAt: before }]);
    expect((await stat(join(root, 'paseo-supervision', 'turns', 'a.json'))).mode & 0o777).toBe(0o600);
  });
  it('끝난 턴 시각은 after 시각이 아니며 다음 시작만으로 바뀌지 않는다', async () => {
    const { store } = await fixture();
    await store.record('a', 'before', before); await store.record('a', 'after', after);
    await store.record('a', 'before', after);
    expect((await store.list())[0].lastEndedStartedAt).toBe(before);
  });
  it('시작을 관측하지 못한 종료·손상·누락은 알 수 없음으로 읽는다', async () => {
    const { root, store } = await fixture(); expect(await store.list()).toEqual([]);
    await store.record('a', 'after', after); expect((await store.list())[0].lastEndedStartedAt).toBeNull();
    await writeFile(join(root, 'paseo-supervision', 'turns', 'a.json'), '{');
    expect((await new TurnStore(root).list())[0].lastEndedStartedAt).toBeNull();
  });
  it('연속 알림을 직렬 저장하고 경로 탈출을 거부한다', async () => {
    const { store } = await fixture();
    await Promise.all([store.record('a', 'before', before), store.record('a', 'after', after)]);
    expect((await store.list())[0].lastEndedStartedAt).toBe(before);
    await expect(store.record('../escape', 'before', before)).rejects.toThrow('ID');
  });
  it('손상된 턴 파일은 다음 기록에서 격리하고 새 before/after로 복구한다', async () => {
    const { root, store } = await fixture(); await store.record('a', 'before', before);
    const directory = join(root, 'paseo-supervision', 'turns');
    await writeFile(join(directory, 'a.json'), '{}');
    await store.record('a', 'before', before); await store.record('a', 'after', after);
    expect((await store.list())[0].lastEndedStartedAt).toBe(before);
    const quarantined = (await readdir(directory)).filter(name => name.endsWith('.corrupt'));
    expect(quarantined).toHaveLength(1); expect(await readFile(join(directory, quarantined[0]), 'utf8')).toBe('{}');
  });

});
