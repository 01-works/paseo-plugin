import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
export async function runPaseo(args: string[]): Promise<string> {
  const home = process.env.PASEO_HOME;
  if (!home || !isAbsolute(home)) throw new Error('PASEO_HOME을 확인할 수 없어 CLI 호출을 중단했습니다.');
  const { stdout } = await exec('paseo', [...args, '--home', home, '--json'], { timeout: 30_000, maxBuffer: 1024 * 1024 });
  return stdout;
}
