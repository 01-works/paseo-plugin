import { constants } from 'node:fs';
import { open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { stateSchema, type LaneState, type ReportState } from '../shared/report';

const limit = 1024 * 1024;
export class ReportStore {
  constructor(private readonly stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')) {}
  private base() {
    if (!isAbsolute(this.stateHome)) throw new Error('XDG_STATE_HOME은 절대 경로여야 합니다.');
    return join(this.stateHome, 'yw-supervisor');
  }
  private inside(base: string, path: string) {
    const part = relative(base, path);
    return !!part && part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part);
  }
  async lane(cwd: string, laneDir?: string) {
    const base = this.base();
    const root = await realpath(base).catch(() => { throw new Error('yw-supervisor 상태 폴더가 없습니다. 기존 lane을 먼저 확인하세요.'); });
    const underRoot = (path: string) => this.inside(base, resolve(path)) || this.inside(root, resolve(path));
    const candidate = underRoot(cwd) ? cwd : laneDir;
    if (!candidate) throw new Error('감독 cwd가 yw-supervisor 아래가 아닙니다. 기존 lane의 절대 경로를 laneDir로 지정하세요.');
    if (!isAbsolute(candidate) || !underRoot(candidate)) throw new Error('laneDir는 yw-supervisor 아래의 lane 절대 경로여야 합니다.');
    const path = await realpath(candidate);
    if (!this.inside(root, path)) throw new Error('lane 경로가 심볼릭 링크로 yw-supervisor 밖을 가리킵니다.');
    return path;
  }
  async write(cwd: string, laneDir: string | undefined, value: ReportState, signal?: AbortSignal) {
    const state = stateSchema.parse(value);
    const data = `${JSON.stringify(state, null, 2)}\n`;
    if (Buffer.byteLength(data) > limit) throw new Error('상태 보고는 1 MiB를 넘을 수 없습니다.');
    const path = await this.lane(cwd, laneDir);
    const temp = join(path, `.state-${randomUUID()}.tmp`);
    try {
      const file = await open(temp, 'wx', 0o600);
      try { await file.writeFile(data, { signal }); await file.sync(); } finally { await file.close(); }
      signal?.throwIfAborted();
      await rename(temp, join(path, 'state.json'));
    } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    return state;
  }
  async list(): Promise<LaneState[]> {
    const base = this.base();
    let directories;
    try { directories = await readdir(base, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const rows: LaneState[] = [];
    // 하위 cwd의 보고도 찾되 심볼릭 링크 디렉터리는 따라가지 않는다.
    const visit = async (directory: string) => {
      const path = await this.lane(directory);
      const filePath = join(path, 'state.json');
      try {
        const file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        try {
          const stat = await file.stat();
          if (!stat.isFile() || stat.size > limit) throw new Error('state.json은 1 MiB 이하의 일반 파일이어야 합니다.');
          rows.push({ laneDir: path, state: stateSchema.parse(JSON.parse(await file.readFile('utf8'))) });
        } finally { await file.close(); }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') rows.push({ laneDir: path, state: null, error: 'state.json을 읽을 수 없습니다. 형식·권한을 확인하세요.' });
      }
      for (const child of await readdir(path, { withFileTypes: true })) if (child.isDirectory()) await visit(join(path, child.name));
    };
    for (const entry of directories) if (entry.isDirectory()) await visit(join(base, entry.name));
    return rows;
  }
}
