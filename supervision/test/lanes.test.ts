import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LaneStore } from '../server/lanes';
import { record, origin } from './fixtures';

const paths: string[] = [];
async function temporary() { const path = await mkdtemp(join(tmpdir(), 'supervision-')); paths.push(path); return path; }
afterEach(async () => { for (const path of paths.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('lane 파일 생성', () => {
  it('목표가 경로여도 상태 폴더 아래에만 쓴다', async () => {
    const root = await temporary();
    const store = new LaneStore(root, () => 'abcd');
    const lane = await store.create({ ...record, originId: origin.agentId, goal: '../../이탈' }, new Date(2026, 10, 17));
    expect(lane.path).toContain('/yw-supervisor/이탈-20261117-abcd');
    expect((await stat(lane.path)).mode & 0o777).toBe(0o700);
    expect((await stat(join(lane.path, 'tasks.md'))).mode & 0o777).toBe(0o600);
  });
  it('충돌한 폴더를 덮어쓰지 않고 재추첨한다', async () => {
    const root = await temporary();
    const suffix = vi.fn().mockReturnValueOnce('aaaa').mockReturnValueOnce('bbbb');
    await mkdir(join(root, 'yw-supervisor', '기존-대화-감독-전환-20261117-aaaa'), { recursive: true });
    const store = new LaneStore(root, suffix);
    expect((await store.create({ ...record, originId: origin.agentId }, new Date(2026, 10, 17))).name).toMatch(/-bbbb$/);
    expect(suffix).toHaveBeenCalledTimes(2);
  });
  it('무한 충돌은 거부하고 상대 XDG_STATE_HOME으로 로드해도 예외가 없다', async () => {
    const root = await temporary();
    const store = new LaneStore(root, () => 'aaaa');
    await store.create({ ...record, originId: origin.agentId });
    await expect(store.create({ ...record, originId: origin.agentId })).rejects.toThrow('충돌');
    expect(() => new LaneStore('../escape')).not.toThrow();
  });
  it('예정 소유 ID로 처음부터 기록하고 등록되지 않은 이름은 거부한다', async () => {
    const store = new LaneStore(await temporary(), () => 'a123');
    const lane = await store.create({ ...record, originId: origin.agentId });
    expect(lane.agentId).toBe(record.agentId);
    expect((await readFile(join(lane.path, 'tasks.md'), 'utf8')).split('\n')[0]).toContain(record.agentId);
    expect(store.get(lane.name).record.originId).toBe(origin.agentId);
    expect(() => store.get('../escape')).toThrow('이 실행');
  });
});
