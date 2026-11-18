import { readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { stateSchema, type LaneState, type ReportState } from '../shared/report';
import { atomicJson, readText, SerialFiles } from './files';

export const reportFile = 'supervision-state.json';
export class ReportStore {
  private readonly writes = new SerialFiles();
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
    return join(root, relative(root, path).split(sep)[0]);
  }
  private async read(path: string) {
    const text = await readText(join(path, reportFile));
    return text === null ? null : stateSchema.parse(JSON.parse(text));
  }
  async write(cwd: string, laneDir: string | undefined, value: ReportState, signal?: AbortSignal) {
    const state = stateSchema.parse(value);
    if (Buffer.byteLength(JSON.stringify(state, null, 2)) + 1 > 1024 * 1024) throw new Error('상태 보고는 1 MiB를 넘을 수 없습니다.');
    const path = await this.lane(cwd, laneDir);
    return this.writes.run(path, async () => {
      const previous = await this.read(path);
      const header = await readText(join(path, 'tasks.md'), 8192, true);
      const owner = header === null ? previous?.agentId : header.match(/^감독:\s+\S+\s+(\S+)\s+@\s+\S+\s*$/)?.[1];
      if (!owner || owner !== state.agentId) throw new Error('lane 소유 감독이 호출자와 다릅니다. 인계 시 tasks.md 첫 감독 줄을 먼저 교체하세요.');
      const missing = previous?.report.items.filter(item => !state.report.items.some(next => next.id === item.id)
        && !(item.status === 'deferred' && item.deferredBy)) ?? [];
      if (missing.length) throw new Error(`기존 항목을 제거할 수 없습니다: ${missing.map(item => item.id).join(', ')}. 사용자 결정 출처와 deferred로 먼저 보고하세요.`);
      await atomicJson(join(path, reportFile), state, signal);
      return state;
    });
  }
  async list(): Promise<LaneState[]> {
    const base = this.base();
    let directories;
    try { directories = await readdir(base, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const rows: LaneState[] = [];
    for (const entry of directories) {
      if (!entry.isDirectory()) continue;
      let path = join(base, entry.name);
      try {
        path = await this.lane(path);
        const state = await this.read(path);
        if (state) rows.push({ laneDir: path, state });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') rows.push({ laneDir: path, state: null, error: `${reportFile}을 읽을 수 없습니다. 형식·권한을 확인하세요.` });
      }
    }
    return rows;
  }
}
