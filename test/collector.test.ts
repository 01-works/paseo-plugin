import { afterEach, describe, expect, it, vi } from 'vitest';
import { Collector } from '../server/collector';
import { raw } from './fixtures';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshotSchema } from '../shared/contracts';

const collectors: Collector[] = [], dirs: string[] = [];
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean | Promise<boolean>, ms = 3000) { const end = Date.now() + ms; while (!await predicate()) { if (Date.now() > end) throw new Error('상태 대기 시간 초과'); await pause(10); } }
function fake(code: string, extras: ConstructorParameters<typeof Collector>[0] = {}) {
  const c = new Collector({ platform: 'darwin', command: { file: process.execPath, args: ['-e', code] }, log: () => {}, ...extras }); collectors.push(c); return c;
}
const sampleCode = `const raw=${JSON.stringify(raw)}; raw.t=Date.now(); console.log(JSON.stringify(raw)); raw.seq++;raw.t=Date.now();raw.sys.cpu.user+=50;raw.sys.cpu.idle+=50;console.log(JSON.stringify(raw));`;
afterEach(async () => { await Promise.all(collectors.splice(0).map(c => c.stop())); await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe('캐시 및 헬퍼 수명주기', () => {
  it('전체 종료의 응답 순서가 달라도 PID별 성공·보호 대상 실패를 보존', async () => {
    const members = [123, 124].map(pid => ({ pid, start: String(pid), group: '앱', name: '앱', memoryBytes: 100, cpuPercent: 1 }));
    const payload = { ...raw, procs: { ready: true, sampledAt: Date.now(), coreCount: 10, excludedRoot: 0, excludedPermission: 0, otherErrors: 0,
      topCpu: [{ name: '앱', memoryBytes: 200, processCount: 2, cpuPercent: 2 }], topMemory: [], members } };
    const c = fake(`const raw=${JSON.stringify(payload)};console.log(JSON.stringify(raw));require('node:readline').createInterface({input:process.stdin}).on('line',line=>{
      if(line==='procs on'){raw.seq++;raw.sys.cpu.user+=10;console.log(JSON.stringify(raw));}
      if(line.startsWith('terminate ')){const [,id,pid]=line.split(' ').map(Number);setTimeout(()=>console.log(JSON.stringify({action:'terminate',id,sent:pid===123,...(pid===124?{error:'보호된 프로세스'}:{})})),pid===123?20:0);}
    });`);
    await c.start();await until(() => c.snapshot().seq === 0);c.processList('앱');await until(() => c.processList('앱').status === 'ok');
    expect((await c.terminateGroup({ group: '앱', targets: members })).results).toEqual([
      { pid: 123, sent: true, error: undefined }, { pid: 124, sent: false, error: '보호된 프로세스' },
    ]);
    expect(c.snapshot().seq).toBe(1);
  });
  it('프로세스 조회는 캐시만 읽고 종료는 최신 PID·시작 시각·그룹에 한정', async () => {
    const entry = { pid: 12345, start: '90071992547409999', group: 'codex', name: 'codex', memoryBytes: 100, cpuPercent: 1 };
    const procs = { ready: true, sampledAt: Date.now(), coreCount: 10, excludedRoot: 1, excludedPermission: 1, otherErrors: 0,
      topCpu: [{ name: 'codex', memoryBytes: 100, processCount: 1, cpuPercent: 1 }], topMemory: [], members: [entry] };
    const payload = { ...raw, procs, sys: { ...raw.sys, disk: { total: 1000, used: 400, available: 600, sampledAt: Date.now() } } };
    const code = `const raw=${JSON.stringify(payload)};raw.t=Date.now();console.log(JSON.stringify(raw));raw.sys.cpu.user+=10;raw.seq++;console.log(JSON.stringify(raw));require('node:readline').createInterface({input:process.stdin}).on('line',line=>{if(line==='procs on'){raw.sys.cpu.user+=10;console.log(JSON.stringify(raw));}if(line.startsWith('terminate ')){const id=Number(line.split(' ')[1]);console.log(JSON.stringify({action:'terminate',id,sent:true}));}});`;
    let mono = 1000;
    const c = fake(code, { monotonicNow: () => mono });await c.start();await until(() => c.snapshot().seq === 1);
    c.processList('codex');await until(() => c.processList('codex').entries.length === 1);
    expect(c.processList('codex').entries[0].start).toBe(entry.start);
    expect(c.snapshot(true).processes).not.toHaveProperty('members');
    expect(c.snapshot().disk?.used).toBe(400);
    const seq = c.snapshot().seq; for (let i = 0; i < 100; i++) c.processList('codex');expect(c.snapshot().seq).toBe(seq);
    expect((await c.terminate({ ...entry, start: '1' })).sent).toBe(false);
    expect((await c.terminate({ ...entry, group: 'other' })).sent).toBe(false);
    expect((await c.terminate(entry)).sent).toBe(true);
    expect((await c.terminateGroup({ group: 'codex', targets: [{ pid: entry.pid, start: entry.start }] })).results).toEqual([{ pid: entry.pid, sent: true, error: undefined }]);
    expect((await c.terminateGroup({ group: 'other', targets: [entry] })).results[0].sent).toBe(false);
    expect((await c.terminateGroup({ group: 'codex', targets: [entry, { ...entry, pid: 54321 }] })).results.every(p => !p.sent)).toBe(true);
    expect((await c.terminateGroup({ group: 'codex', targets: [{ ...entry, start: '1' }] })).results[0].sent).toBe(false);
    expect((await c.terminateGroup({ group: 'codex', targets: [entry, entry] })).results.every(p => !p.sent)).toBe(true);
    expect(c.snapshot().status).toBe('ok');
    mono += 5001;expect((await c.terminate(entry)).sent).toBe(false);
    expect((await c.terminateGroup({ group: 'codex', targets: [entry] })).results[0].sent).toBe(false);
  });
  it('정상 스트림: RPC 100개가 새 측정을 만들지 않음', async () => {
    const c = fake(`${sampleCode}setInterval(()=>{},1000);`); await c.start(); await until(() => c.snapshot().seq === 1);
    const replies = await Promise.all(Array.from({ length: 100 }, () => Promise.resolve(c.snapshot(true))));
    expect(new Set(replies.map(s => s.seq))).toEqual(new Set([1])); expect(replies[0].cpu?.total).toBe(50);
    expect(snapshotSchema.safeParse(replies[0]).success).toBe(true);
    await pause(80); expect(c.snapshot().seq).toBe(1);
  });
  it('잘못된 JSON/스키마를 무시하고 이전 캐시 유지', async () => {
    const c = fake(`${sampleCode}console.log('bad-json');console.log('{"v":2}');setInterval(()=>{},1000);`);
    await c.start(); await until(() => c.snapshot().errors.some(e => e.includes('JSON')));
    expect(c.snapshot().seq).toBe(1); expect(c.snapshot().memory).not.toBeNull(); expect(c.snapshot().status).toBe('error');
  });
  it('단조 시계 지연/오류, 압력 실패를 정상 압력으로 표시하지 않음', async () => {
    let mono = 1000; let now = 1000;
    const missingPressure = JSON.stringify({ ...raw, sys: { ...raw.sys, pressureLevel: null }, errors: ['pressure 읽기 실패'] });
    const c = fake(`console.log('${missingPressure}');setInterval(()=>{},1000);`, { now: () => now, monotonicNow: () => mono });
    await c.start(); await until(() => c.snapshot().seq === 0);
    expect(c.snapshot().pressure).toBe('unknown'); expect(c.snapshot().cpu).toBeNull();
    mono += 5001; expect(c.snapshot().status).toBe('stale');
    now -= 100_000; mono += 10_000; expect(c.snapshot().status).toBe('error');
  });
  it('핵심 필드 읽기 실패는 null과 오류', async () => {
    const bad = JSON.stringify({ ...raw, sys: { ...raw.sys, vm: null, cpu: null, disk: null }, errors: ['VM 실패', 'Data 볼륨 용량 읽기 실패'] });
    const c = fake(`console.log('${bad}');setInterval(()=>{},1000);`);await c.start();await until(() => c.snapshot().seq === 0);
    expect(c.snapshot().status).toBe('error'); expect(c.snapshot().memory).toBeNull();expect(c.snapshot().cpu).toBeNull();
    expect(c.snapshot().disk).toBeNull(); expect(c.snapshot().errors).toContain('Data 볼륨 용량 읽기 실패');
  });
  it('이전 헬퍼의 speculative 누락은 CPU 캐시를 유지하고 메모리만 확인 불가', async () => {
    const c = fake(`const raw=${JSON.stringify(raw)};delete raw.sys.vm.speculative;console.log(JSON.stringify(raw));raw.seq++;raw.sys.cpu.user+=50;raw.sys.cpu.idle+=50;console.log(JSON.stringify(raw));setInterval(()=>{},1000);`);
    await c.start();await until(() => c.snapshot().seq === 1);
    const s = c.snapshot();
    expect(s.cpu?.total).toBe(50); expect(s.memory).toBeNull(); expect(s.status).toBe('error');
    expect(s.errors).toContain('메모리 speculative 카운터 없음 · 헬퍼 업데이트 필요');
    expect(snapshotSchema.safeParse(s).success).toBe(true);
  });
  it('중단 후 지수 백오프, 동시에 하나만 실행, stop 후 자식 없음', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mac-monitor-test-'));dirs.push(dir);const file = path.join(dir, 'starts');
    const code = `require('node:fs').appendFileSync(${JSON.stringify(file)},JSON.stringify({pid:process.pid,t:Date.now()})+'\\n');${sampleCode}setTimeout(()=>process.exit(0),30);`;
    const c = fake(code, { backoffMs: 100 });await c.start();
    await until(() => c.snapshot().status === 'error');
    await until(() => c.snapshot().seq === 1 && c.snapshot().status !== 'error');
    await until(() => c.snapshot().status === 'error');
    // 백오프가 끝나도 OS의 프로세스 시작은 늦어질 수 있다. 고정 sleep 대신 실제 세 번째 시작을 기다린다.
    let starts: {pid:number;t:number}[] = [];
    await until(async () => { starts = (await readFile(file, 'utf8')).trim().split('\n').map(l => JSON.parse(l) as {pid:number;t:number}); return starts.length >= 3; });
    expect(starts.length).toBeGreaterThanOrEqual(3);expect(starts[1].t-starts[0].t).toBeGreaterThanOrEqual(100);expect(starts[2].t-starts[1].t).toBeGreaterThanOrEqual(200);
    expect(starts.filter(({ pid }) => { try { process.kill(pid, 0); return true; } catch { return false; } }).length).toBeLessThanOrEqual(1);
    await c.stop(); const n = (await readFile(file, 'utf8')).length;await pause(450);expect((await readFile(file,'utf8')).length).toBe(n);
    for (const { pid } of starts) expect(() => process.kill(pid, 0)).toThrow();
  });
  it('cleanup은 SIGTERM 무시 자식에도 1초 후 SIGKILL', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mac-monitor-test-'));dirs.push(dir);const file = path.join(dir, 'pid');
    const c = fake(`require('node:fs').writeFileSync(${JSON.stringify(file)},String(process.pid));process.on('SIGTERM',()=>{});${sampleCode}setInterval(()=>{},1000);`);
    await c.start();await until(() => c.snapshot().seq === 1);const pid=Number(await readFile(file,'utf8'));
    await c.stop();expect(() => process.kill(pid,0)).toThrow();
  });
  it('앱 관심 요청은 on 한 번만 보내고 30초 뒤 off; 재개는 측정 중', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'mac-monitor-test-'));dirs.push(dir);const file = path.join(dir, 'commands');
    const code = `${sampleCode}process.stdin.on('data',d=>require('node:fs').appendFileSync(${JSON.stringify(file)},d));setInterval(()=>{},1000);`;
    const c = fake(code, { monotonicNow: () => 1000 });await c.start();await until(() => c.snapshot().seq === 1);
    vi.useFakeTimers();
    try {
      for (let i=0;i<100;i++) c.snapshot(true);
      await vi.advanceTimersByTimeAsync(29_999);expect(c.snapshot().processesStatus).toBe('warming');
      await vi.advanceTimersByTimeAsync(1);expect(c.snapshot().processesStatus).toBe('off');
    } finally { vi.useRealTimers(); }
    await pause(40);expect(await readFile(file,'utf8')).toBe('procs on\nprocs off\n');
    expect(c.snapshot(true).processesStatus).toBe('warming');
  });
  it('macOS 아닌 경우 자식 실행 없음', async () => {
    const c = fake('throw Error("실행하면 안 됨")', { platform: 'linux' });await c.start();expect(c.snapshot().status).toBe('unsupported');expect(c.mode).toBe('unsupported');
  });
});
