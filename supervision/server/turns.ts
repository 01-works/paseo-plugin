import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { turnStateSchema, type TurnState } from '../shared/report';
import { atomicJson, readJson, resolveStateHome, SerialFiles } from './files';

const recordSchema = turnStateSchema.extend({ startedAt: z.iso.datetime().nullable() });
export class TurnStore {
  private readonly writes = new SerialFiles();
  private readonly directory: string;
  constructor(stateHome?: string) {
    this.directory = join(resolveStateHome(stateHome), 'paseo-supervision', 'turns');
  }
  async record(agentId: string, phase: 'before' | 'after', at: string) {
    if (!/^[a-zA-Z0-9_-]{1,256}$/.test(agentId)) throw new Error('감독 ID가 올바르지 않습니다.');
    return this.writes.run(agentId, async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const path = join(this.directory, `${agentId}.json`);
      const previous = await readJson(path, recordSchema, 16384, true);
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
        const record = await readJson(join(this.directory, file), recordSchema, 16384);
        if (record !== null) rows.push(turnStateSchema.parse(record));
      } catch { rows.push({ agentId: file.slice(0, -5), lastEndedStartedAt: null }); }
    }
    return rows;
  }
}
