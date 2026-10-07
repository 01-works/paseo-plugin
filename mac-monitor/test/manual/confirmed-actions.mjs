// 합성 리뷰와 실제 헬퍼를 연결한다. 이 스크립트가 만든 자식만 종료하며 메모리 압력은 만들지 않는다.
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawnSource } from '../../server/helper-process.ts';
import { MemoryGuardian } from '../../server/automation/guardian.ts';
import { createAuditor } from '../../server/automation/audit.ts';
import { initialState, writeAutomation } from '../../server/automation/store.ts';
import { emptySnapshot, computeMemory } from '../../shared/compute.ts';

const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-confirm-test-'));
const file = path.join(directory, 'automatic-actions.jsonl');
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{const end=performance.now()+5;while(performance.now()<end){}},100)'], { stdio: 'ignore' });
const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
let current, listener, guard;
let attempts = 0;
const source = spawnSource(new URL('../../bin/macmon-helper', import.meta.url).pathname, [], line => { current = JSON.parse(line); listener?.(); }, reason => { throw new Error(reason); });
source.setProcesses(true);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => {
  const end = Date.now() + 15_000;
  while (!predicate()) { if (Date.now() > end) throw new Error('검증 대상 대기 초과'); await pause(100); }
};
try {
  await until(() => current?.procs?.ready && current.procs.members.some(p => p.pid === child.pid));
  const p = current.procs.members.find(p => p.pid === child.pid);
  assert.ok(p.path);
  const target = { pid: p.pid, start: p.start, name: p.name, path: p.path, group: p.group };
  const reviewedAt = Date.now();
  const state = initialState();
  state.reviews = [{ at: reviewedAt, target, decision: 'observe', reason: '직접 만든 검증용 프로세스의 합성 리뷰입니다.', memoryBytes: p.memoryBytes, growthBytes: 0, outcome: 'pending' }];
  guard = new MemoryGuardian({
    subscribe: callback => { listener = callback; return () => { listener = undefined; }; },
    setAutomaticInterest() {}, // 검증 화면의 관심이 유지되는 상황이며 자동 리뷰는 꺼져 있다.
    observeAutomation: () => ({ snapshot: { ...emptySnapshot('native'), status: 'ok', ageMs: Date.now() - current.t, seq: current.seq, sampledAt: current.t,
      memory: computeMemory(current.sys), pressure: 'normal', processesStatus: current.procs?.ready ? 'ok' : 'warming' }, members: current.procs?.members ?? [] }),
    terminate: async input => { assert.equal(input.pid, child.pid); assert.equal(input.start, p.start); attempts++; return source.terminate(input.pid, input.start); },
    terminateAutomatically: async () => { throw new Error('이 검증에서 자동 종료는 금지'); },
    inspectAutomatically: async input => { assert.equal(input.pid, child.pid); return source.inspect(input.pid, input.start, input.path); },
    validateAutomatically: async () => ({ allowed: false }),
  }, { read: async () => state, write: value => writeAutomation(value, path.join(directory, 'automation.json')), audit: createAuditor(file),
    reviewer: async () => { throw new Error('이 검증에서 AI 호출은 금지'); } });
  await guard.start();
  assert.equal(attempts, 0);
  const input = { ...target, reviewedAt };
  assert.equal((await guard.confirm({ ...input, path: `${p.path}-changed` })).sent, false);
  assert.equal(attempts, 0); process.kill(child.pid, 0);
  assert.equal((await guard.confirm(input)).sent, true);
  assert.equal((await guard.confirm(input)).sent, false);
  assert.equal((await exit).signal, 'SIGTERM');
  await until(() => guard.report().reviews[0].outcome === 'exited');
  const records = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(records.map(r => r.kind), ['planned', 'sent', 'exited']);
  assert.ok(records.every(r => r.mode === 'confirmed' && r.reviewedAt === reviewedAt && r.target.start === p.start));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal(attempts, 1);
  console.log(JSON.stringify({ result: '합성 리뷰 + 실제 헬퍼: 경로 불일치·중복 거절, 검증 자식만 SIGTERM 1회, 10초 후 실제 종료 확인', attempts, auditKinds: records.map(r => r.kind), auditMode: records[0].mode, auditPermissions: '0600' }));
} finally {
  await guard?.stop(); child.kill('SIGTERM'); await source.close(); await rm(directory, { recursive: true, force: true });
}
