// 설치된 로컬 플러그인의 요청형 검사를 한 번 실행한다. 실제 Luna 사용량을 소비하며 종료 RPC는 호출하지 않는다.
// reload 뒤 숫자 이력이 두 회 이상 쌓인 다음 --expect-history로 관찰 생략을 검증할 수 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';
import { DaemonClient } from '../../node_modules/@getpaseo/client/dist/daemon-client.js';
import WebSocket from 'ws';

const sdkVersion = JSON.parse(readFileSync(new URL('../../node_modules/@getpaseo/client/package.json', import.meta.url), 'utf8')).version;
const taskHome = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const client = new DaemonClient({ url: 'ws://127.0.0.1:6767/ws', clientId: 'mac-monitor-history-validation', clientType: 'cli', appVersion: sdkVersion,
  localCredential: () => readFileSync(path.join(taskHome, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
  reconnect: { enabled: false }, connectTimeoutMs: 5000 });
const rpc = (method, input) => client.invokePluginRpc('mac-monitor', `mac-monitor.cleanup.${method}`, input);
let id;
try {
  await client.connect();
  const host = await client.invokePluginRpc('mac-monitor', 'mac-monitor.host.info', {});
  assert.equal(host.version, JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version);
  const started = performance.now();
  let state = await rpc('start', {}); id = state.id;
  const transitions = []; let last, preReviewMs;
  while (performance.now() - started < 60_000) {
    const mode = `${state.phase}:${state.observationSource ?? 'pending'}`;
    if (mode !== last) {
      last = mode; transitions.push({ phase: state.phase, source: state.observationSource ?? null, elapsedMs: Math.round(performance.now() - started) });
    }
    if (state.phase !== 'observing') preReviewMs ??= Math.round(performance.now() - started);
    if (['ready', 'error', 'cancelled'].includes(state.phase)) break;
    await wait(500); state = await rpc('get', { id });
  }
  assert.equal(state.phase, 'ready', state.error ?? '검사 완료 시간 초과');
  if (process.argv.includes('--expect-history')) {
    assert.equal(state.observationSource, 'history', '검토 대상 일부의 이력이 부족해 추가 관찰했습니다');
    assert.ok(state.items.every(p => p.observationSource === 'history' && p.history), '이력 출처와 결과가 일치해야 합니다');
    assert.ok(preReviewMs < 12_000, '추가 12초 관찰을 생략해야 합니다');
  }
  // 경로·인자·작업 폴더·사용자 프로세스의 식별자는 출력하지 않는다.
  console.log(JSON.stringify({ version: host.version, preReviewMs, totalMs: Math.round(performance.now() - started), transitions,
    items: state.items.length, candidates: state.items.filter(p => p.decision === 'candidate').length,
    historyItems: state.items.filter(p => p.observationSource === 'history').length,
    historySeconds: state.items.map(p => p.history?.observedSeconds ?? null), signalRequests: 0 }));
} finally {
  if (id) await rpc('cancel', { id }).catch(() => {});
  await client.close();
}
