import { execFile } from 'node:child_process';
import { open } from 'node:fs/promises';

// launchd·Paseo 데몬의 PATH에는 Homebrew가 없을 수 있다.
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Exec = (command: string, args: string[], timeoutMs?: number) => Promise<ExecResult>;

export function run(command: string, args: string[], timeoutMs = 10_000): Promise<ExecResult> {
  const env = { ...process.env, PATH: [process.env.PATH, ...EXTRA_PATH].filter(Boolean).join(':'), GH_PROMPT_DISABLED: '1', NO_COLOR: '1' };
  return new Promise(resolve => {
    execFile(command, args, { timeout: timeoutMs, env, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) || (error && code === 1 ? error.message : '') });
    });
  });
}

export async function readTail(file: string, bytes: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8');
    // 잘린 첫 줄은 버린다.
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
}

