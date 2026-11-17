import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { laneName, tasksMarkdown, type LaneRecord } from '../shared/lane';

export class LaneStore {
  private readonly records = new Map<string, { path: string; record: LaneRecord & { originId: string } }>();
  constructor(
    private readonly stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
    private readonly suffix = () => randomBytes(2).toString('hex'),
  ) {}
  get(name: string) {
    const entry = this.records.get(name);
    if (!entry) throw new Error('이 실행에서 만든 lane이 아닙니다.');
    return entry;
  }
  async create(record: LaneRecord & { originId: string }, now = new Date()) {
    if (!isAbsolute(this.stateHome)) throw new Error('XDG_STATE_HOME은 절대 경로여야 합니다.');
    const base = join(this.stateHome, 'yw-supervisor');
    await mkdir(base, { recursive: true, mode: 0o700 });
    for (let attempt = 0; attempt < 32; attempt++) {
      const name = laneName(record.goal, now, this.suffix());
      const path = join(base, name);
      try { await mkdir(path, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
      try { await writeFile(join(path, 'tasks.md'), tasksMarkdown(record), { flag: 'wx', mode: 0o600 }); }
      catch (error) { console.error('lane 기록 실패', { path, agentId: record.agentId }, error); throw error; }
      this.records.set(name, { path, record });
      return { name, path, agentId: record.agentId };
    }
    throw new Error('lane 이름이 반복 충돌했습니다. 다시 실행해 주세요.');
  }
}
