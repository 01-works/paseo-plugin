// 검증용 내부 CLI 전송 계층. 제품 클라이언트에서는 사용하지 않는다.
import { DaemonClient } from '../../node_modules/@getpaseo/client/dist/daemon-client.js';
import WebSocket from 'ws';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const home = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const client = new DaemonClient({ url: 'ws://127.0.0.1:6767/ws', clientId: 'mac-monitor-local-validation', clientType: 'cli', appVersion: '0.10.2',
  localCredential: () => readFileSync(path.join(home, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }), reconnect: { enabled: false }, connectTimeoutMs: 5000 });
const snapshots = [];
const includeProcesses = process.argv.includes('--processes');
const duration = Number(process.argv.find(value => value.startsWith('--seconds='))?.split('=')[1] ?? 12);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  await client.connect();
  console.log('host', await client.invokePluginRpc('mac-monitor', 'mac-monitor.host.info', {}));
  const concurrent = await Promise.all(Array.from({ length: 100 }, () => client.invokePluginRpc('mac-monitor', 'mac-monitor.snapshot.get', { includeProcesses })));
  console.log('100 concurrent seq', [...new Set(concurrent.map(s => s.seq))]);
  const end = Date.now() + duration * 1000;
  while (Date.now() < end) {
    const s = await client.invokePluginRpc('mac-monitor', 'mac-monitor.snapshot.get', { includeProcesses }); snapshots.push(s);
    console.log(JSON.stringify({ seq: s.seq, sampledAt: s.sampledAt, ageMs: s.ageMs, status: s.status, cpu: s.cpu, memory: s.memory, pressure: s.pressure, processesStatus: s.processesStatus, excludedRoot: s.processes?.excludedRoot, errors: s.errors }));
    await pause(2000);
  }
  writeFileSync('/tmp/mac-monitor-live.json', JSON.stringify({ concurrentSeqs: [...new Set(concurrent.map(s => s.seq))], snapshots }, null, 2));
} finally { await client.close(); }
