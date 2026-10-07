import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { rawSchema } from '../shared/contracts';
import { historyFrameSchema } from '../shared/history';

it.skipIf(process.platform !== 'darwin')('배경 숫자는 같은 고정 타이머로 수집하고 앱 목록·실행 정보를 출력하지 않음', async () => {
  const child = spawn('bin/macmon-helper', [], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout }), closed = new Promise<void>(resolve => child.once('close', () => resolve()));
  let stderr = ''; child.stderr.on('data', data => { stderr += data; });
  try {
    child.stdin.write('history on\nprocs off\n');
    const samples = await new Promise<ReturnType<typeof rawSchema.parse>[]>((resolve, reject) => {
      const values: ReturnType<typeof rawSchema.parse>[] = [];
      const timer = setTimeout(() => reject(new Error('헬퍼 이력 대기 초과')), 8000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      lines.on('line', line => {
        try { values.push(rawSchema.parse(JSON.parse(line))); }
        catch (error) { clearTimeout(timer); reject(error); return; }
        if (values.length >= 3) { clearTimeout(timer); resolve(values); }
      });
    });
    const frames = samples.filter(s => s.history !== undefined);
    expect(frames).toHaveLength(1);
    const frame = historyFrameSchema.parse(frames[0].history);
    expect(frame.entries.some(p => p.pid === process.pid)).toBe(true);
    expect(samples.every(s => s.procs === null && !s.errors.length)).toBe(true);
    expect(frame.entries.length).toBeLessThanOrEqual(512);
    for (const entry of frame.entries) expect(Object.keys(entry).sort()).toEqual(['cpuTimeMs', 'memoryBytes', 'pid', 'readBytes', 'start', 'writtenBytes']);
    expect(samples[2].mono - samples[1].mono).toBeGreaterThan(1800);
    expect(samples[2].mono - samples[1].mono).toBeLessThan(2200);
    expect(stderr).toBe('');
  } finally {
    lines.close(); child.stdin.end();
    const kill = setTimeout(() => child.kill('SIGKILL'), 1000);
    await closed; clearTimeout(kill);
  }
}, 10_000);
