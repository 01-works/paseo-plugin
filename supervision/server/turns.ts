import { mkdir, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { turnStateSchema, type TurnState } from '../shared/report';
import { atomicJson, readText, SerialFiles } from './files';

const recordSchema = turnStateSchema.extend({ startedAt: z.iso.datetime().nullable() });
export class TurnStore {
  private readonly writes = new SerialFiles();
  private readonly directory: string;
  constructor(stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')) {
    if (!isAbsolute(stateHome)) throw new Error('XDG_STATE_HOME은 절대 경로여야 합니다.');
    this.directory = join(stateHome, 'paseo-supervision', 'turns');
  }
  async record(agentId: string, phase: 'before' | 'after', at: string) {
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(agentId)) throw new Error('감독 ID가 올바르지 않습니다.');
    return this.writes.run(agentId, async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = join(this.directory, `${agentId}.json`);
      const text = await readText(path, 16384);
      const previous = text === null ? null : recordSchema.parse(JSON.parse(text));
      await atomicJson(path, recordSchema.parse({ agentId,
        startedAt: phase === 'before' ? at : null,
        lastEndedStartedAt: phase === 'after' ? previous?.startedAt ?? null : previous?.lastEndedStartedAt ?? null,
      }));
    });
  }
  async list(): Promise<TurnState[]> {
    let files;
    try { files = await readdir(this.directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
    const rows: TurnState[] = [];
    for (const file of files) {
      if (!/^[a-zA-Z0-9_-]{1,256}\.json$/.test(file)) continue;
      try {
        const text = await readText(join(this.directory, file), 16384);
        if (text !== null) rows.push(turnStateSchema.parse(JSON.parse(text)));
      } catch { rows.push({ agentId: file.slice(0, -5), lastEndedStartedAt: null }); }
    }
    return rows;
  }
}
