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
  await mkdir(lane, { recursive: true }); await writeFile(join(lane, 'tasks.md'), '감독: codex/test supervisor @ local\n'); return { root, base, lane, store: new ReportStore(root) };
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
    expect(() => new ReportStore('relative')).not.toThrow();
  });
  it('원자적으로 대체하며 제한된 권한으로 저장한다', async () => {
    const f = await fixture(); const path = join(f.lane, 'supervision-state.json');
    await f.store.write(f.lane, undefined, state());
    const writes = Array.from({ length: 12 }, (_, i) => f.store.write(f.lane, undefined, { ...state(), title: `목표 ${i}` }));
    for (let i = 0; i < 15; i++) expect(JSON.parse(await readFile(path, 'utf8')).version).toBe(1);
    await Promise.all(writes);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(f.lane)).sort()).toEqual(['supervision-state.json', 'tasks.md']);
    expect((await f.store.list())[0].state?.title).toMatch(/목표 \d+/);
  });
  it('취소·유효하지 않은 보고는 기존 상태를 보존하고 임시 파일을 지운다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    const controller = new AbortController(); controller.abort();
    await expect(f.store.write(f.lane, undefined, { ...state(), title: '변경' }, controller.signal)).rejects.toThrow();
    await expect(f.store.write(f.lane, undefined, { ...state(), report: { ...report(), turnEnd: { kind: 'done', detail: '끝' } } })).rejects.toThrow('열린 항목');
    expect((await f.store.list())[0].state?.title).toBe('목표');
    expect((await readdir(f.lane)).sort()).toEqual(['supervision-state.json', 'tasks.md']);
  });
  it('손상·파일 symlink는 오류 행으로 남기고 다른 lane은 계속 읽는다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    const broken = join(f.base, 'broken'); const linked = join(f.base, 'linked');
    await mkdir(broken); await mkdir(linked);
    await writeFile(join(broken, 'supervision-state.json'), '{');
    await symlink(join(f.lane, 'supervision-state.json'), join(linked, 'supervision-state.json'));
    const rows = await f.store.list();
    expect(rows).toHaveLength(3); expect(rows.filter(row => row.error)).toHaveLength(2);
  });
  it('최상위 전용 파일만 읽고 하위 cwd는 첫 경로 조각의 lane에 쓴다', async () => {
    const f = await fixture(); expect(await f.store.list()).toEqual([]);
    expect(await new ReportStore(join(f.root, 'absent')).list()).toEqual([]);
    const child = join(f.lane, 'child'); await mkdir(child);
    await f.store.write(child, undefined, state());
    expect((await f.store.list())[0].laneDir).toBe(f.lane);
    expect(await readdir(child)).toEqual([]);
  });
  it('최상위의 일반 state.json과 하위 파일을 읽지 않는다', async () => {
    const f = await fixture();
    await writeFile(join(f.lane, 'state.json'), '{');
    const child = join(f.lane, 'nested'); await mkdir(child);
    await writeFile(join(child, 'supervision-state.json'), '{');
    expect(await f.store.list()).toEqual([]);
  });
  it('소유 불일치를 거부하고 tasks.md 감독 줄 교체에 따른 인계만 허용한다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    await expect(f.store.write('/code', f.lane, { ...state(), agentId: 'other' })).rejects.toThrow('소유');
    await writeFile(join(f.lane, 'tasks.md'), '감독: codex/test other @ local\n');
    await f.store.write('/code', f.lane, { ...state(), agentId: 'other' });
    await expect(f.store.write(f.lane, undefined, state())).rejects.toThrow('소유');
  });
  it('완료·열린 항목 누락은 거부하고 먼저 사용자 연기를 보고한 항목만 제거한다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    const next = { ...state(), report: { ...report(), items: [{ id: 'new', summary: '새 항목', status: 'open' as const }] } };
    await expect(f.store.write(f.lane, undefined, next)).rejects.toThrow('goal');
    await f.store.write(f.lane, undefined, { ...state(), report: { ...report(), items: [
      { id: 'goal', summary: '목표', status: 'done', evidence: 'commit abc' }] } });
    await expect(f.store.write(f.lane, undefined, next)).rejects.toThrow('goal');
    await f.store.write(f.lane, undefined, { ...state(), report: { ...report(), items: [
      { id: 'goal', summary: '목표', status: 'deferred', deferredBy: '사용자 결정 #1' }] } });
    await f.store.write(f.lane, undefined, next);
    expect((await f.store.list())[0].state?.report.items[0].id).toBe('new');
  });
  it('tasks.md가 없어도 기존 상태의 소유 감독은 쓰지만 소유 근거가 없으면 거부한다', async () => {
    const f = await fixture(); await f.store.write(f.lane, undefined, state());
    await rm(join(f.lane, 'tasks.md')); await f.store.write(f.lane, undefined, state());
    await rm(join(f.lane, 'supervision-state.json'));
    await expect(f.store.write(f.lane, undefined, state())).rejects.toThrow('소유');
  });

  it('손상 상태는 소유 확인 후 다음 쓰기에서 격리하고 새 보고를 저장한다', async () => {
    const f = await fixture(); const path = join(f.lane, 'supervision-state.json');
    await writeFile(path, '{');
    await expect(f.store.write(f.lane, undefined, { ...state(), agentId: 'other' })).rejects.toThrow('소유');
    expect(await readFile(path, 'utf8')).toBe('{');
    await f.store.write(f.lane, undefined, state());
    const quarantined = (await readdir(f.lane)).filter(name => name.endsWith('.corrupt'));
    expect(quarantined).toHaveLength(1); expect(await readFile(join(f.lane, quarantined[0]), 'utf8')).toBe('{');
    expect((await f.store.list())[0].state?.agentId).toBe('supervisor');
  });

});
