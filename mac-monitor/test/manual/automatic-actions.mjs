// 검증용 orphan worker와 보호 대상의 자식만 만든다. 기존 사용자 프로세스를 종료하지 않는다.
import { spawnSync } from 'node:child_process';
import { mkdtemp, copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { spawnSource } from '../../server/helper-process.ts';
const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-auto-test-'));
const binary = path.join(directory, 'auto-worker');
const owned = new Set(); let source;
const pause = ms => new Promise(r => setTimeout(r, ms));
const until = async fn => { const end = Date.now() + 15_000; while (!fn()) { if (Date.now() > end) throw new Error('검증 대상 대기 초과'); await pause(100); } };
try {
  const compile = spawnSync('/usr/bin/clang', ['-O2', '-o', binary, new URL('./auto-worker.c', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stderr);
  const launched = spawnSync(binary, [], { encoding: 'utf8' }); assert.equal(launched.status, 0); const pid = Number(launched.stdout.trim()); owned.add(pid);
  const protectedChildren = [];
  for (const name of ['codex-test-parent', 'Terminal-test-parent', 'iterm-test-parent', 'warp-test-parent', 'Other.app/Contents/MacOS/test-parent']) {
    const parentBinary = path.join(directory, name); await mkdir(path.dirname(parentBinary), { recursive: true }); await copyFile(binary, parentBinary);
    // 런처의 Codex/Paseo 조상과 분리해서 각 부모 이름의 보호를 독립적으로 검증한다.
    const launched = spawnSync(parentBinary, ['--orphan-parent', binary], { encoding: 'utf8' });
    assert.equal(launched.status, 0, name);
    const [parentPid, childPid] = launched.stdout.trim().split(/\s+/).map(Number);
    assert.ok(parentPid > 1 && childPid > 1, name); owned.add(parentPid); owned.add(childPid);
    protectedChildren.push({ name, pid: childPid });
  }
  let sample;
  source = spawnSource(new URL('../../bin/macmon-helper', import.meta.url).pathname, [], line => { sample = JSON.parse(line); }, () => {});
  source.setProcesses(true);
  await until(() => sample?.procs?.ready && [pid, ...protectedChildren.map(p => p.pid)].every(p => sample.procs.members.some(m => m.pid === p)));
  const entry = sample.procs.members.find(p => p.pid === pid);
  assert.ok(entry.path.endsWith('/auto-worker'));
  assert.equal((await source.validateAuto(pid, entry.start, entry.path)).allowed, true);
  for (const { name, pid: protectedPid } of protectedChildren) {
    const blocked = sample.procs.members.find(p => p.pid === protectedPid);
    assert.equal((await source.validateAuto(protectedPid, blocked.start, blocked.path)).allowed, false, `${name} 자식의 허용 차단`);
    const result = await source.terminate(protectedPid, blocked.start, blocked.path);
    assert.equal(result.sent, false, `${name} 자식의 신호 차단`); assert.match(result.error, /하위 프로세스 보호/);
    process.kill(protectedPid, 0);
  }
  assert.equal(await source.inspect(pid, entry.start, entry.path), 'running');
  assert.equal((await source.terminate(pid, '0', entry.path)).sent, false);
  assert.equal((await source.terminate(pid, entry.start, `${entry.path}-changed`)).sent, false);
  process.kill(pid, 0);
  assert.equal((await source.terminate(pid, entry.start, entry.path)).sent, true);
  source.setProcesses(false); // 종료 확인에 전체 프로세스 스캔이 필요하지 않음.
  await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  assert.equal(await source.inspect(pid, entry.start, entry.path), 'exited'); owned.delete(pid);
  console.log(JSON.stringify({ result: '시작 시각·실행 경로 변경 차단, Codex·Terminal·iTerm·Warp·일반 앱 자식 보호, 검증용 orphan worker SIGTERM·종료 확인', protectedParents: protectedChildren.map(p => p.name), seq: sample.seq }));
} finally {
  for (const pid of owned) { try { process.kill(pid, 'SIGTERM'); } catch {} }
  await source?.close(); await rm(directory, { recursive: true, force: true });
}
