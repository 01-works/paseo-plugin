// 종료 대상은 이 스크립트가 만든 테스트 자식 두 개로만 제한한다.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { Collector } from '../../server/collector.ts';
const children = Array.from({ length: 2 }, () => spawn(process.execPath,
  ['-e', 'setInterval(()=>{const end=performance.now()+5;while(performance.now()<end){}},100)'], { stdio: 'ignore' }));
const collector = new Collector({ root: new URL('../..', import.meta.url).pathname, log: () => {} });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await collector.start();
  let group, entries = [];
  const end = Date.now() + 12_000;
  while (entries.length < 2 && Date.now() < end) {
    const snapshot = collector.snapshot(true);
    for (const g of snapshot.processes?.topCpu ?? []) {
      const list = collector.processList(g.name);
      const own = list.entries.filter(p => children.some(child => child.pid === p.pid));
      if (list.status === 'ok' && own.length === 2) { group = g.name; entries = own; break; }
    }
    if (entries.length < 2) await pause(100);
  }
  assert.equal(entries.length, 2, '테스트 자식 두 개를 같은 그룹의 최신 캐시에서 찾음');
  const targets = entries.map(({ pid, start }) => ({ pid, start }));
  const denied = await collector.terminateGroup({ group, targets: targets.map((p, i) => i ? p : { ...p, start: '0' }) });
  assert.ok(denied.results.every(p => !p.sent));
  for (const child of children) process.kill(child.pid, 0);
  const exits = children.map(child => new Promise(resolve => child.once('exit', (code, signal) => resolve(signal))));
  const sent = await collector.terminateGroup({ group, targets });
  assert.ok(sent.results.every(p => p.sent));
  assert.deepEqual(await Promise.all(exits), ['SIGTERM', 'SIGTERM']);
  console.log(JSON.stringify({ result: '목록 불일치 시 전체 차단, 확인한 테스트 자식 두 개만 SIGTERM 성공', targets, results: sent.results }));
} finally {
  for (const child of children) child.kill('SIGTERM');
  await collector.stop();
}
