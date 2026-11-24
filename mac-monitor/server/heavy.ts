import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { heavyQueueSchema, type HeavyResult } from '../shared/heavy';

export type HeavyRun = () => Promise<string>;
const CACHE_MS = 10_000;

// 읽기 전용 조회만 실행한다. 대기열을 바꾸는 명령은 쓰지 않는다.
const runStatus: HeavyRun = () => new Promise((resolve, reject) => {
  execFile(path.join(homedir(), '.local/bin/yw-heavy'), ['status', '--json'], { timeout: 5000, maxBuffer: 1024 * 1024 },
    (error, stdout) => { if (error) reject(error); else resolve(stdout); });
});

export class HeavyReader {
  private cached: HeavyResult | undefined;
  private flight: Promise<HeavyResult> | undefined;
  constructor(private readonly run: HeavyRun = runStatus, private readonly now: () => number = Date.now) {}

  get(): Promise<HeavyResult> {
    const age = this.cached ? this.now() - this.cached.sampledAt : Infinity;
    if (this.cached && age >= 0 && age < CACHE_MS) return Promise.resolve(this.cached);
    this.flight ??= this.read().then(result => { this.cached = result; return result; }).finally(() => { this.flight = undefined; });
    return this.flight;
  }

  private async read(): Promise<HeavyResult> {
    const result = (status: HeavyResult['status'], queue: HeavyResult['queue'] = null): HeavyResult => ({ status, sampledAt: this.now(), queue });
    let output: string;
    try { output = await this.run(); }
    catch (error) {
      const code = (error as { code?: unknown }).code;
      return result(code === 'ENOENT' ? 'missing' : code === 2 ? 'unsupported' : 'error');
    }
    let value: unknown;
    // --json을 모르는 구버전은 사람용 문장을 출력한다.
    try { value = JSON.parse(output); } catch { return result('unsupported'); }
    const parsed = heavyQueueSchema.safeParse(value);
    return parsed.success ? result('ok', parsed.data) : result('unsupported');
  }
}
