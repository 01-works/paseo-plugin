import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReportStore } from '../server/reports';
import type { ReportState } from '../shared/report';
import { report } from './fixtures';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { force: true, recursive: true }); });
export const state = (): ReportState => ({ version: 1, agentId: 'supervisor', serverId: 'local', title: '목표',
  reportedAt: '2026-11-18T00:00:00.000Z', report: report() });
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'supervision-state-'))); roots.push(root);
  const base = join(root, 'yw-supervisor'); const lane = join(base, 'goal');
  await mkdir(lane, { recursive: true }); return { root, base, lane, store: new ReportStore(root) };
}
describe('lane 상태 파일', () => {
  it('cwd를 우선하고 기존 감독은 명시한 lane을 쓴다', async () => {
    const f = await fixture();
    expect(await f.store.lane(f.lane, '/outside')).toBe(f.lane);
    expect(await f.store.lane('/code', f.lane)).toBe(f.lane);
    await expect(f.store.lane('/code')).rejects.toThrow('laneDir');
  });
  it('상대 경로·상위 폴더·접두사 혼동·탈출·외부 symlink를 거부한다', async () => {
    const f = await fixture();
    for (const path of ['goal', f.base, `${f.base}-other`, join(f.base, '..', 'outside')]) await expect(f.store.lane('/code', path)).rejects.toThrow();
    await symlink(f.root, join(f.base, 'escape'));
    await expect(f.store.lane('/code', join(f.base, 'escape'))).rejects.toThrow('심볼릭 링크');
    await expect(new ReportStore('relative').lane(f.lane)).rejects.toThrow('절대 경로');
  });
  it('원자적으로 대체하며 제한된 권한으로 저장한다', async () => {
    const f = await fixture(); const path = join(f.lane, 'state.json');
    await f.store.write(f.lane, undefined, state());
    const writes = Array.from({ length: 12 }, (_, i) => f.store.write(f.lane, undefined, { ...state(), title: `목표 ${i}` }));
    for (let i = 0; i < 15; i++) expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1);
    await Promise.all(writes);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await readdir(f.lane)).toEqual(['state.json']);
    expect((await f.store.list())[0].state?.title).toMatch(/목표 \d+/);
  });
  it('취소·유효하지 않은 보고는 기존 상태를 보존하고 임시 파일을 지운다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    const controller = new AbortController(); controller.abort();
    await expect(f.store.write(f.lane, undefined, { ...state(), title: '변경' }, controller.signal)).rejects.toThrow();
    await expect(f.store.write(f.lane, undefined, { ...state(), report: { ...report(), turnEnd: { kind: 'done', detail: '끝' } } })).rejects.toThrow('열린 항목');
    expect((await f.store.list())[0].state?.title).toBe('목표');
    expect(await readdir(f.lane)).toEqual(['state.json']);
  });
  it('손상·파일 symlink는 오류 행으로 남기고 다른 lane은 계속 읽는다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    const broken = join(f.base, 'broken'); const linked = join(f.base, 'linked');
    await mkdir(broken); await mkdir(linked);
    await writeFile(join(broken, 'state.json'), '{');
    await symlink(join(f.lane, 'state.json'), join(linked, 'state.json'));
    const rows = await f.store.list();
    expect(rows).toHaveLength(3); expect(rows.filter(row => row.error)).toHaveLength(2);
  });
  it('미보고 lane·없는 저장 폴더는 빈 목록, 하위 cwd 보고도 찾는다', async () => {
    const f = await fixture(); expect(await f.store.list()).toEqual([]);
    expect(await new ReportStore(join(f.root, 'absent')).list()).toEqual([]);
    const child = join(f.lane, 'child'); await mkdir(child);
    await f.store.write(child, undefined, state());
    expect((await f.store.list())[0].laneDir).toBe(child);
  });
});
