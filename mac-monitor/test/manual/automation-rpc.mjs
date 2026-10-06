// 로컬 플러그인의 자동 관리 설정만 다룬다. 원격 호스트·에이전트·사용자 프로세스는 변경하지 않는다.
import { DaemonClient } from '../../node_modules/@getpaseo/client/dist/daemon-client.js';
import WebSocket from 'ws';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const home = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const client = new DaemonClient({ url: 'ws://127.0.0.1:6767/ws', clientId: 'mac-monitor-automation-validation', clientType: 'cli', appVersion: '0.10.2',
  localCredential: () => readFileSync(path.join(home, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }), reconnect: { enabled: false }, connectTimeoutMs: 5000 });
try {
  await client.connect();
  let report = await client.invokePluginRpc('mac-monitor', 'mac-monitor.automation.get', {});
  if (process.argv.includes('--enable')) report = await client.invokePluginRpc('mac-monitor', 'mac-monitor.automation.configure', { ...report.config, enabled: true });
  const snapshot = await client.invokePluginRpc('mac-monitor', 'mac-monitor.snapshot.get', { includeProcesses: false });
  assert.equal(report.status.model, 'gpt-6-luna'); assert.equal(snapshot.automation.model, 'gpt-6-luna');
  const result = { config: report.config, status: report.status, targetCount: report.targets.length, events: report.events,
    snapshot: { seq: snapshot.seq, status: snapshot.status, pressure: snapshot.pressure, processesStatus: snapshot.processesStatus } };
  writeFileSync('/tmp/mac-monitor-automation-live.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await client.close(); }
