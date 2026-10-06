// 실제 로컬 RPC의 허용 대조 검증. 직접 만든 작은 worker만 잠시 허용하고 즉시 해제한다.
import { DaemonClient } from '../../node_modules/@getpaseo/client/dist/daemon-client.js';
import WebSocket from 'ws';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const home = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const client = new DaemonClient({ url: 'ws://127.0.0.1:6767/ws', clientId: 'mac-monitor-consent-validation', clientType: 'cli', appVersion: '0.10.2',
  localCredential: () => readFileSync(path.join(home, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }), reconnect: { enabled: false }, connectTimeoutMs: 5000 });
const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-consent-test-'));
const binary = path.join(directory, 'consent-worker');
const call = (name, input) => client.invokePluginRpc('mac-monitor', `mac-monitor.${name}`, input);
let ownedPid, target;
try {
  await client.connect();
  const initial = await call('automation.get', {}); assert.equal(initial.targets.length, 0, '허용 목록이 빈 테스트 환경에서만 실행');
  const compile = spawnSync('/usr/bin/clang', ['-O2', '-o', binary, new URL('./auto-worker.c', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stderr);
  const launch = spawnSync(binary, [], { encoding: 'utf8' }); assert.equal(launch.status, 0);
  ownedPid = Number(launch.stdout.trim()); assert.ok(ownedPid > 1);
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    const list = await call('processes.list', { group: 'consent-worker' });
    if (list.status === 'ok') target = list.entries.find(p => p.pid === ownedPid);
    if (target) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  assert.ok(target?.path, '최신 worker 경로');
  assert.ok(target.memoryBytes < 1024 ** 3, '리뷰 후보가 될 수 없는 작은 검증용 worker');
  const identity = { pid: target.pid, start: target.start, group: target.group };
  // 이전 클라이언트 형식은 스키마 오류 또는 changed:false로 안전하게 거절돼야 한다.
  let oldRejected = false;
  try { oldRejected = !(await call('automation.target', { ...identity, allow: true })).changed; }
  catch { oldRejected = true; }
  assert.ok(oldRejected); assert.equal((await call('automation.get', {})).targets.length, 0);
  assert.equal((await call('automation.target', { ...identity, path: `${target.path}-changed`, name: target.name, allow: true })).changed, false);
  assert.equal((await call('automation.target', { ...identity, path: target.path, name: target.name, allow: true })).changed, true);
  assert.deepEqual((await call('automation.get', {})).targets.map(p => p.pid), [ownedPid]);
  assert.equal((await call('automation.target', { ...identity, allow: false })).changed, true);
  const report = await call('automation.get', {});
  assert.equal(report.targets.length, 0); assert.deepEqual(report.config, initial.config); assert.deepEqual(report.events, initial.events);
  console.log(JSON.stringify({ result: '실제 RPC: 이전 허용 형식·경로 불일치 거절, 검증용 worker만 허용/해제', model: report.status.model, targetCount: report.targets.length, phase: report.status.phase }));
} finally {
  try { if (target) await call('automation.target', { pid: target.pid, start: target.start, group: target.group, allow: false }); }
  finally {
    if (ownedPid) { try { process.kill(ownedPid, 'SIGTERM'); } catch {} }
    await client.close(); await rm(directory, { recursive: true, force: true });
  }
}
