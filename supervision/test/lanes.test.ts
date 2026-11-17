import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LaneStore } from '../server/lanes';
import { record } from './fixtures';

const paths: string[] = [];
async function temporary() { const path = await mkdtemp(join(tmpdir(), 'supervision-')); paths.push(path); return path; }
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('lane 파일 생성', () => {
  it('목표가 경로여도 상태 폴더 아래에만 쓴다', async () => {
    const root = await temporary();
    const store = new LaneStore(root, () => 'abcd', vi.fn());
    const lane = await store.create({ ...record, goal: '../../이탈' }, new Date(2026, 10, 17));
    expect(lane.path).toContain('/yw-supervisor/이탈-20261117-abcd');
    expect((await stat(lane.path)).mode & 0o777).toBe(0o700);
    expect((await stat(join(lane.path, 'tasks.md'))).mode & 0o777).toBe(0o600);
  });
  it('충돌한 폴더를 덮어쓰지 않고 재추첨한다', async () => {
    const root = await temporary();
    const suffix = vi.fn().mockReturnValueOnce('aaaa').mockReturnValueOnce('bbbb');
    await mkdir(join(root, 'yw-supervisor', '기존-대화-감독-전환-20261117-aaaa'), { recursive: true });
    const store = new LaneStore(root, suffix, vi.fn());
    expect((await store.create(record, new Date(2026, 10, 17))).name).toMatch(/-bbbb$/);
    expect(suffix).toHaveBeenCalledTimes(2);
  });
  it('무한 충돌과 상대 XDG_STATE_HOME을 거부한다', async () => {
    const root = await temporary();
    const store = new LaneStore(root, () => 'aaaa', vi.fn());
    await store.create(record);
    await expect(store.create(record)).rejects.toThrow('충돌');
    await expect(new LaneStore('../escape').create(record)).rejects.toThrow('절대 경로');
  });
  it('실제 소유 ID를 기록하고 원 대화에만 감독 링크를 단다', async () => {
    const root = await temporary();
    const link = vi.fn();
    const store = new LaneStore(root, () => 'a123', link);
    const lane = await store.create(record);
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    await store.bind(lane.name, id);
    expect((await readFile(join(lane.path, 'tasks.md'), 'utf8')).split('\n')[0]).toContain(id);
    expect(link).toHaveBeenCalledWith(record.origin.agentId, id);
    await expect(store.bind(lane.name, record.origin.agentId)).rejects.toThrow('다른 감독');
    await expect(store.bind('../escape', id)).rejects.toThrow('이 실행');
  });
  it('심볼릭 링크로 바뀐 lane에는 쓰지 않는다', async () => {
    const root = await temporary(); const outside = await temporary();
    const store = new LaneStore(root, () => 'abcd', vi.fn());
    const lane = await store.create(record);
    await rm(lane.path, { recursive: true });
    await symlink(outside, lane.path);
    await expect(store.bind(lane.name, record.origin.agentId)).rejects.toThrow('경로가 바뀌어');
  });
  it('중복 bind가 감독의 진행 기록을 덮어쓰지 않는다', async () => {
    const root = await temporary(); const link = vi.fn();
    const store = new LaneStore(root, () => 'abcd', link);
    const lane = await store.create(record);
    await store.bind(lane.name, record.origin.agentId);
    await writeFile(join(lane.path, 'tasks.md'), '감독이 갱신한 진행 기록');
    await store.bind(lane.name, record.origin.agentId);
    expect(await readFile(join(lane.path, 'tasks.md'), 'utf8')).toBe('감독이 갱신한 진행 기록');
    expect(link).toHaveBeenCalledTimes(1);
  });
});
