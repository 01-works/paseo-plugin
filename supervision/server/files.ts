import { constants, statSync } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export function resolveStateHome(value = process.env.XDG_STATE_HOME) {
  const fallback = join(homedir(), '.local', 'state');
  if (!value || !isAbsolute(value) || value.includes('\0')) return fallback;
  try { if (!statSync(value).isDirectory()) return fallback; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return fallback; }
  return value;
}

export async function readJson<T>(path: string, schema: { parse(value: unknown): T }, limit = 1024 * 1024, repair = false): Promise<T | null> {
  const text = await readText(path, limit);
  if (text === null) return null;
  try { return schema.parse(JSON.parse(text)); }
  catch (error) {
    if (!repair) throw error;
    await rename(path, `${path}.${randomUUID()}.corrupt`).catch(failure => { if (failure.code !== 'ENOENT') throw failure; });
    return null;
  }
}

export async function readText(path: string, limit = 1024 * 1024, firstLine = false): Promise<string | null> {
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (!firstLine && stat.size > limit)) throw new Error('플러그인 파일의 형식·크기가 올바르지 않습니다.');
    if (firstLine) {
      const buffer = Buffer.alloc(limit);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead).toString('utf8').split(/\r?\n/, 1)[0];
    }
    const text = await file.readFile('utf8');
    if (Buffer.byteLength(text) > limit) throw new Error('플러그인 파일 크기 제한을 넘었습니다.');
    return text;
  } finally { await file.close(); }
}
export async function atomicJson(path: string, value: unknown, signal?: AbortSignal) {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, { signal }); await file.sync(); }
    finally { await file.close(); }
    signal?.throwIfAborted();
    await rename(temp, path);
  } finally { await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
export class SerialFiles {
  private readonly tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(key) ?? Promise.resolve()).catch(() => {}).then(action);
    this.tails.set(key, result);
    void result.finally(() => { if (this.tails.get(key) === result) this.tails.delete(key); }).catch(() => {});
    return result;
  }
}
