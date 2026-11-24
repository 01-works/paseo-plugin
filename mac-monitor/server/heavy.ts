import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { heavyQueueSchema, type HeavyQueue, type HeavyResult } from '../shared/heavy';

export type HeavyRun = () => Promise<string>;
export type HeavyDirectories = (pids: number[]) => Promise<Map<number, string>>;
const CACHE_MS = 10_000;

// 읽기 전용 조회만 실행한다. 대기열을 바꾸는 명령은 쓰지 않는다.
const runStatus: HeavyRun = () => new Promise((resolve, reject) => {
  execFile(path.join(homedir(), '.local/bin/yw-heavy'), ['status', '--json'], { timeout: 5000, maxBuffer: 1024 * 1024 },
    (error, stdout) => { if (error) reject(error); else resolve(stdout); });
});

// 작업 폴더만 읽는다. 명령 인자·환경 변수는 조회하지 않는다.
const readDirectories: HeavyDirectories = pids => new Promise(resolve => {
  // 일부 PID가 이미 끝났으면 lsof는 실패 코드로 끝나도 나머지를 출력한다.
  execFile('/usr/sbin/lsof', ['-a', '-n', '-P', '-w', '-d', 'cwd', '-p', pids.join(','), '-Fpn'], { timeout: 3000, maxBuffer: 1024 * 1024 },
    (_error, stdout) => resolve(parseDirectories(String(stdout))));
});
export function parseDirectories(output: string): Map<number, string> {
  const found = new Map<number, string>();
  let pid: number | undefined;
  // 시간 초과·버퍼 제한으로 잘린 마지막 줄은 다른 폴더로 읽힐 수 있어 버린다.
  for (const line of output.split('\n').slice(0, -1)) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid !== undefined && line.startsWith('n/')) found.set(pid, line.slice(1));
  }
  return found;
}

export class HeavyReader {
  private cached: HeavyResult | undefined;
  private flight: Promise<HeavyResult> | undefined;
  constructor(private readonly run: HeavyRun = runStatus, private readonly now: () => number = Date.now,
    private readonly directories: HeavyDirectories = readDirectories) {}

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
    if (!parsed.success) return result('unsupported');
    await this.addDirectories(parsed.data);
    return result('ok', parsed.data);
  }

  private async addDirectories(queue: HeavyQueue): Promise<void> {
    // 끝난 프로세스의 PID는 다른 프로세스가 재사용했을 수 있어 조회하지 않는다.
    const items = queue.slots.flatMap(slot => [...(slot.running ? [slot.running] : []), ...slot.waiting]).filter(item => item.state === 'alive' && item.pid !== null);
    for (const item of queue.slots.flatMap(slot => [...(slot.running ? [slot.running] : []), ...slot.waiting])) item.directory = null;
    if (!items.length) return;
    try {
      const found = await this.directories([...new Set(items.map(item => item.pid!))]);
      for (const item of items) item.directory = found.get(item.pid!) ?? null;
    } catch { /* 폴더를 모르면 작업 ID만 보인다. */ }
  }
}
