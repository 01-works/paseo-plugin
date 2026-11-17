import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { laneName, tasksMarkdown, type LaneRecord } from '../shared/lane';
import { runPaseo } from './cli';

export type LinkOrigin = (originalId: string, supervisorId: string) => Promise<void>;

export async function linkOrigin(originalId: string, supervisorId: string): Promise<void> {
  // 공개 SDK에 기존 agent 라벨 수정이 없다. 셸을 거치지 않고 현 데몬 home을 명시한다.
  await runPaseo(['agent', 'update', originalId, '--label', `yw.supervisor=${supervisorId}`]);
}

export class LaneStore {
  private readonly records = new Map<string, { path: string; record: LaneRecord; owner?: string; linked?: boolean; binding?: boolean }>();
  constructor(
    private readonly stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
    private readonly suffix = () => randomBytes(2).toString('hex'),
    private readonly link: LinkOrigin = linkOrigin,
  ) {}

  pathFor(name: string): string {
    const entry = this.records.get(name);
    if (!entry) throw new Error('이 실행에서 만든 lane이 아닙니다. 기존 tasks.md와 대화를 확인하세요.');
    return entry.path;
  }

  async create(record: LaneRecord, now = new Date()) {
    if (!isAbsolute(this.stateHome)) throw new Error('XDG_STATE_HOME은 절대 경로여야 합니다.');
    const base = join(this.stateHome, 'yw-supervisor');
    await mkdir(base, { recursive: true, mode: 0o700 });
    const root = await realpath(base);
    for (let attempt = 0; attempt < 32; attempt++) {
      const name = laneName(record.goal, now, this.suffix());
      const path = join(root, name);
      try { await mkdir(path, { mode: 0o700 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
      const file = await open(join(path, 'tasks.md'), 'wx', 0o600);
      try { await file.writeFile(tasksMarkdown(record), 'utf8'); }
      finally { await file.close(); }
      this.records.set(name, { path, record });
      return { name, path };
    }
    throw new Error('lane 이름이 반복 충돌했습니다. 다시 실행해 주세요.');
  }

  async bind(name: string, agentId: string) {
    // 클라이언트가 보낸 경로를 쓰지 않는다. 이 프로세스가 생성한 lane만 갱신한다.
    const entry = this.records.get(name);
    if (!entry) throw new Error('이 실행에서 만든 lane이 아닙니다. 기존 tasks.md와 대화를 확인하세요.');
    if (entry.owner && entry.owner !== agentId) throw new Error('이미 다른 감독이 소유한 lane입니다.');
    if (entry.linked) return { linked: true as const };
    if (entry.binding) throw new Error('이 lane의 감독 링크를 설정하고 있습니다.');
    entry.binding = true;
    try {
      if (!entry.owner) await this.writeOwner(entry, agentId);
      entry.owner = agentId;
      await this.link(entry.record.origin.agentId, agentId);
      entry.linked = true;
      return { linked: true as const };
    } finally { entry.binding = false; }
  }

  private async writeOwner(entry: { path: string; record: LaneRecord }, agentId: string) {
    const stat = await lstat(entry.path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(entry.path) !== entry.path) {
      throw new Error('lane 경로가 바뀌어 기록을 중단했습니다.');
    }
    const temporary = join(entry.path, `.tasks-${randomBytes(8).toString('hex')}`);
    const file = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {
      await file.writeFile(tasksMarkdown(entry.record, agentId), 'utf8');
      await file.close();
      await rename(temporary, join(entry.path, 'tasks.md'));
    } catch (error) {
      await file.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
}
