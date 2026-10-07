// 저장소 헬퍼와 이 스크립트가 만든 테스트 자식만 검증한다. 기존 사용자 프로세스는 종료하지 않는다.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { spawnSource } from '../../server/helper-process.ts';
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{const end=performance.now()+5;while(performance.now()<end){}},100)'], { stdio: 'ignore' });
let current;
const source = spawnSource(new URL('../../bin/macmon-helper', import.meta.url).pathname, [], line => { current = JSON.parse(line); }, reason => { throw new Error(reason); });
source.setProcesses(true);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  const end = Date.now() + 10_000;
  let entry;
  while (!entry && Date.now() < end) { entry = current?.procs?.members?.find(p => p.pid === child.pid && p.cpuPercent !== null); await pause(100); }
  assert.ok(entry, '테스트 자식이 상위 그룹의 캐시에 포함되어야 함');
  assert.ok(current.sys.disk?.total > 0);
  assert.equal((await source.terminate(child.pid, '0')).sent, false);
  process.kill(child.pid, 0);
  assert.equal((await source.terminate(process.pid, '0')).sent, false);
  assert.equal((await source.terminate(source.child.pid, '0')).sent, false);
  const metadata = await source.inspect(child.pid, entry.start);
  assert.equal(metadata.pid, child.pid); assert.ok(metadata.path.endsWith('/node')); assert.ok(metadata.args.includes('-e'));
  assert.equal(metadata.protected, false); assert.equal(metadata.parentPid, process.pid); assert.equal(typeof metadata.cpuPercent, 'number');
  await assert.rejects(source.inspect(child.pid, '0'));
  const parentEntry = current?.procs?.members?.find(p => p.pid === process.pid);
  if (parentEntry) assert.equal((await source.inspect(process.pid, parentEntry.start)).protected, true);
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  assert.equal((await source.terminate(child.pid, entry.start)).sent, true);
  assert.equal((await exited).signal, 'SIGTERM');
  console.log(JSON.stringify({ result: '실행 정보 읽기·PID 시작 시각 불일치·부모·헬퍼 차단, 테스트 자식 SIGTERM 성공', disk: current.sys.disk, sampledSeq: current.seq }));
} finally {
  child.kill('SIGTERM');
  await source.close();
}
