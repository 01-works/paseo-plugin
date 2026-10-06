import { execFile } from 'node:child_process';
import { cpus } from 'node:os';
import { performance } from 'node:perf_hooks';
import { statfs } from 'node:fs/promises';
import type { RawSample } from '../shared/contracts';
let disk: RawSample['sys']['disk'] = null;
let diskNext = 0;
let diskError = '';

export async function command(file: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => execFile(file, args, { encoding: 'utf8', timeout: 1500, maxBuffer: 64 * 1024, signal }, (error, stdout) => error ? reject(error) : resolve(stdout)));
}
export function parseVm(text: string): Pick<RawSample['sys'], 'pageSize' | 'vm'> {
  const pageSize = Number(/page size of (\d+) bytes/.exec(text)?.[1]);
  const read = (key: string) => { const value = new RegExp(`^${key}:\\s+(\\d+)\\.`, 'm').exec(text)?.[1]; if (!value) throw new Error(`vm_stat 항목 없음: ${key}`); return Number(value); };
  if (!pageSize) throw new Error('vm_stat 페이지 크기 없음');
  return { pageSize, vm: { internal: read('Anonymous pages'), purgeable: read('Pages purgeable'), wire: read('Pages wired down'), compressor: read('Pages occupied by compressor'), external: read('File-backed pages'), free: read('Pages free') } };
}
export function parseSwap(text: string): RawSample['sys']['swap'] {
  const read = (key: string) => { const m = new RegExp(`${key} = ([\\d.]+)([KMG])`).exec(text); if (!m) throw new Error('스왑 출력 해석 실패'); return Number(m[1]) * ({ K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2]]!); };
  return { total: read('total'), used: read('used') };
}
export async function nodeSample(seq: number, signal?: AbortSignal): Promise<RawSample> {
  const errors: string[] = [];
  if (performance.now() >= diskNext) {
    diskNext = performance.now() + 30_000;
    try {
      const fs = await statfs('/System/Volumes/Data');
      if (fs.bsize <= 0 || fs.blocks < fs.bfree || fs.bavail < 0 || fs.bavail > fs.bfree) throw new Error('유효하지 않은 용량');
      disk = { total: fs.blocks * fs.bsize, used: (fs.blocks - fs.bfree) * fs.bsize, available: fs.bavail * fs.bsize, sampledAt: Date.now() }; diskError = '';
    } catch (error) { disk = null; diskError = `Data 볼륨 용량: ${String(error)}`; }
  }
  if (diskError) errors.push(diskError);
  const safely = async <T>(key: string, get: () => Promise<T>): Promise<T | null> => { try { return await get(); } catch (error) { errors.push(`${key}: ${String(error)}`); return null; } };
  // 폴백에서도 실행 비용을 줄인다: vm_stat 한 번 + 여러 키 sysctl 한 번.
  const [vm, sysctl] = await Promise.all([
    safely('vm_stat', async () => parseVm(await command('/usr/bin/vm_stat', [], signal))),
    safely('sysctl', () => new Promise<string>((resolve, reject) => {
      execFile('/usr/sbin/sysctl', ['hw.memsize', 'kern.memorystatus_vm_pressure_level', 'kern.memorystatus_level', 'vm.swapusage'],
        { encoding: 'utf8', timeout: 1500, maxBuffer: 64 * 1024, signal }, (error, stdout) => {
          // 일부 키 실패 시에도 성공한 키의 stdout은 개별적으로 파싱한다.
          if (error && !stdout.trim()) reject(error); else resolve(stdout);
        });
    })),
  ]);
  const value = (key: string): string | null => {
    const line = sysctl?.split('\n').find(line => line.startsWith(`${key}:`));
    if (!line) { errors.push(`${key}: 읽기 실패`); return null; }
    return line.slice(key.length + 1).trim();
  };
  const numeric = (key: string): number | null => {
    const text = value(key); if (text === null) return null;
    const number = Number(text); if (!text || !Number.isFinite(number) || number < 0) { errors.push(`${key}: 숫자 해석 실패`); return null; }
    return number;
  };
  const memsize = numeric('hw.memsize'), pressureLevel = numeric('kern.memorystatus_vm_pressure_level'), memoryLevel = numeric('kern.memorystatus_level');
  const swapText = value('vm.swapusage');
  let swap: RawSample['sys']['swap'] = null;
  if (swapText !== null) { try { swap = parseSwap(swapText); } catch (error) { errors.push(String(error)); } }
  let cpu: RawSample['sys']['cpu'] = null;
  try {
    const values = cpus(); if (!values.length) throw new Error('코어 목록 없음');
    cpu = values.reduce((sum, { times }) => ({ user: sum.user + times.user, system: sum.system + times.sys + times.irq, idle: sum.idle + times.idle, nice: sum.nice + times.nice }), { user: 0, system: 0, idle: 0, nice: 0 });
  } catch (error) { errors.push(`os.cpus: ${String(error)}`); }
  return { v: 1, seq, t: Date.now(), mono: performance.now(), sys: { pageSize: vm?.pageSize ?? null, vm: vm?.vm ?? null, memsize, cpu, swap, pressureLevel, memoryLevel, disk }, procs: null, errors };
}
