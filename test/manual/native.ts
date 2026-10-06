import { spawn } from 'node:child_process';
import path from 'node:path';
import { rawSchema, TOP_APP_LIMIT, type RawSample } from '../../shared/contracts';
import { computeMemory } from '../../shared/compute';
import { spawnSource } from '../../server/helper-process';
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) { const end = Date.now() + 8000;while (!predicate()) { if (Date.now() > end) throw new Error('네이티브 상태 대기 시간 초과');await pause(20); } }
async function main() {
  const samples: RawSample[] = [];
  const source = spawnSource(path.resolve('bin/macmon-helper'), [], line => { samples.push(rawSchema.parse(JSON.parse(line))); }, () => {});
  try {
    await until(() => samples.length === 1);source.setProcesses(true);
    if (samples[0].sys.vm?.speculative == null || computeMemory(samples[0].sys) === null) throw new Error('Activity Monitor 메모리 계산 필드 오류');
    await until(() => samples.length >= 3);
    if (samples[1].procs?.ready !== false || samples[2].procs?.ready !== true) throw new Error('앱 CPU 기준점/두 번째 샘플 오류');
    if (samples[2].procs.topCpu.length !== TOP_APP_LIMIT || samples[2].procs.topMemory.length !== TOP_APP_LIMIT) throw new Error('상위 목록 수 오류');
    source.setProcesses(false);await until(() => samples.length >= 4);
    if (samples[3].procs !== null) throw new Error('off 명령 이후 스캔 유지');
    const intervals = samples.slice(1).map((s,i) => s.mono - samples[i].mono);
    if (intervals.some(n => n < 1850 || n > 2150) || samples.some(s => s.errors.length)) throw new Error('고정 간격 또는 측정 오류');
    console.log(JSON.stringify({ samples: samples.length, intervalsMs: intervals, topCpu: samples[2].procs.topCpu.length, topMemory: samples[2].procs.topMemory.length, firstProcesses: 'warming', secondProcesses: 'ok', off: samples[3].procs }));
  } finally { await source.close(); }
  // 부모 강제 종료 시 stdin EOF를 통해 자식 헬퍼가 고아로 남지 않는지 확인한다.
  const parentCode = `const {spawn}=require('node:child_process');const h=spawn(${JSON.stringify(path.resolve('bin/macmon-helper'))},[],{stdio:['pipe','ignore','ignore']});console.log(h.pid);setInterval(()=>{},1000);`;
  const parent = spawn(process.execPath, ['-e', parentCode], { stdio: ['ignore','pipe','inherit'] });
  let pid = 0;parent.stdout.once('data', data => { pid = Number(String(data).trim()); });
  try {
    await until(() => pid > 0);parent.kill('SIGKILL');
    await until(() => { try { process.kill(pid,0); return false; } catch { return true; } });
    console.log('부모 SIGKILL 뒤 헬퍼 종료 확인');
  } finally { parent.kill('SIGKILL');if (pid) { try { process.kill(pid,'SIGTERM'); } catch {} } }
}
void main().catch(error => { console.error(error);process.exitCode=1; });
