// 전용 임시 홈에서 업데이트 도중 설정 경로가 늦게 바뀌는 상황을 재현한다.
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Collector } from '../../server/collector';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, timeout: number) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('설치 경로 복구 대기 시간 초과');
    await pause(100);
  }
}
async function main() {
  const home = await mkdtemp(path.join(tmpdir(), 'mac-monitor-install-recovery-'));
  const previous = process.env.PASEO_HOME;
  process.env.PASEO_HOME = home;
  const oldRoot = path.join(home, 'old'), newRoot = path.join(home, 'new');
  const collector = new Collector({ backoffMs: 50 });
  const configure = (root: string) => writeFile(path.join(home, 'config.json'),
    JSON.stringify({ plugins: { 'mac-monitor': { path: root } } }));
  try {
    await mkdir(path.join(oldRoot, 'bin'), { recursive: true });
    await mkdir(path.join(newRoot, 'bin'), { recursive: true });
    await symlink('/usr/bin/false', path.join(oldRoot, 'bin/macmon-helper'));
    await copyFile('bin/macmon-helper', path.join(newRoot, 'bin/macmon-helper'));
    await configure(oldRoot);
    await collector.start();
    await until(() => collector.mode === 'node' && collector.snapshot().status === 'ok', 10_000);
    await configure(newRoot);
    await rm(oldRoot, { recursive: true });
    await until(() => collector.mode === 'native' && collector.snapshot().status === 'ok', 40_000);
    await until(() => collector.snapshot(true).processesStatus === 'ok', 10_000);
    const state = collector.snapshot(true);
    assert.deepEqual(state.errors, []);
    assert.ok(state.processes);
    console.log(JSON.stringify({
      helperMode: state.helperMode, status: state.status,
      processesStatus: state.processesStatus, errors: state.errors,
    }));
  } finally {
    await collector.stop();
    if (previous === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = previous;
    await rm(home, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
