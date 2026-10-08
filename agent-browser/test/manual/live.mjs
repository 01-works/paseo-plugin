// 로컬 검증 전용 전송 계층. 제품은 호스트의 client.paseo만 사용한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPaseoClient } from '@getpaseo/client';
import { createAgentDirectory } from '../../client/directory.ts';
import { workspaceAgents } from '../../shared/browser.ts';
const sdkVersion = JSON.parse(readFileSync(new URL('../../node_modules/@getpaseo/client/package.json', import.meta.url), 'utf8')).version;
const taskPaseoHome = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const transport = createPaseoClient({
  url: 'ws://127.0.0.1:6767/ws', clientId: 'agent-browser-local-validation', clientType: 'cli', appVersion: sdkVersion,
  localCredential: () => readFileSync(path.join(taskPaseoHome, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
  reconnect: { enabled: false }, connectTimeoutMs: 5000,
});
let directory, releaseWatch;
try {
  await transport.connect();
  const api = transport;
  const list = api.agents.list.bind(api.agents);
  let reads = 0, leases = 0;
  api.agents.list = options => { reads++; if (options?.subscribe) leases++; return list(options); };
  directory = createAgentDirectory(api, 'local-validation');
  releaseWatch = directory.watch();
  await directory.start();
  const deadline = Date.now() + 15000;
  while (directory.getSnapshot().loading && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  const snapshot = directory.getSnapshot();
  assert.equal(snapshot.loading, false); assert.equal(snapshot.stale, false); assert.equal(snapshot.error, null);
  assert.equal(leases, 1);
  const initialReads = reads;
  await new Promise(resolve => setTimeout(resolve, 5000));
  assert.equal(reads, initialReads, '정상 연결에서 반복 목록 조회 없음');
  const workspaces = [...new Set(snapshot.agents.map(agent => agent.workspaceId).filter(Boolean))];
  const counts = workspaces.map(workspaceId => ({ workspaceId,
    total: workspaceAgents(snapshot.agents, workspaceId, 'updated').length }));
  console.log(JSON.stringify({ loaded: snapshot.loaded, partial: snapshot.partial, agents: snapshot.agents.length,
    reads, leases, idleReads: reads - initialReads, workspaceCount: counts.length, largestWorkspaces: counts.sort((a, b) => b.total - a.total).slice(0, 5) }, null, 2));
} finally {
  releaseWatch?.(); await directory?.dispose(); await transport.close();
}
