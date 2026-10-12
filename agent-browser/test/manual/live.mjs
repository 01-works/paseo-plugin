// 로컬 검증 전용 전송 계층. 제품은 호스트의 client.paseo만 사용한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPaseoClient } from '@getpaseo/client';
import { createAgentDirectory } from '../../client/directory.ts';
import { workspaceAgents } from '../../shared/browser.ts';
import { createCleanupPlan } from '../../shared/cleanup.ts';
const sdkVersion = JSON.parse(readFileSync(new URL('../../node_modules/@getpaseo/client/package.json', import.meta.url), 'utf8')).version;
const taskPaseoHome = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const transport = createPaseoClient({
  url: 'ws://127.0.0.1:6767/ws', clientId: 'agent-browser-local-validation', clientType: 'cli', appVersion: sdkVersion,
  localCredential: () => readFileSync(path.join(taskPaseoHome, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
  reconnect: { enabled: false }, connectTimeoutMs: 5000,
});
let directory, releaseWatch, releaseReplies;
try {
  await transport.connect();
  const api = transport;
  const list = api.agents.list.bind(api.agents);
  let reads = 0, leases = 0, timelineReads = 0, timelineSubscriptions = 0, currentWorkspace;
  api.agents.list = async options => {
    reads++; if (options?.subscribe) leases++;
    const result = await list(options);
    currentWorkspace ??= result.entries.find(({ agent }) => agent.cwd === path.resolve(process.cwd(), '..'))?.agent.workspaceId;
    return result;
  };
  const ref = api.agents.ref.bind(api.agents);
  api.agents.ref = (...args) => {
    const handle = ref(...args), timeline = handle.timeline;
    return { ...handle, timeline: {
      ...timeline,
      refetch: options => { timelineReads++; return timeline.refetch(options); },
      subscribe: handler => { timelineSubscriptions++; return timeline.subscribe(handler); },
    } };
  };
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
  const idleReads = reads - initialReads;
  let replyValidation;
  if (process.argv.includes('--replies')) {
    const workspaceId = process.env.AGENT_BROWSER_WORKSPACE_ID ?? currentWorkspace;
    assert(workspaceId, '현재 worktree의 workspace를 찾지 못했습니다');
    releaseReplies = directory.watchReplies(workspaceId);
    const replyDeadline = Date.now() + 45000;
    const rows = () => workspaceAgents(directory.getSnapshot().agents, workspaceId, 'updated');
    while (rows().some(agent => agent.replyStatus === 'pending') && Date.now() < replyDeadline)
      await new Promise(resolve => setTimeout(resolve, 100));
    assert(rows().length > 0);
    assert(rows().every(agent => agent.replyStatus === 'ready'), '답변 시각 조회가 완료되어야 합니다');
    replyValidation = { agents: rows().length, withReplies: rows().filter(agent => agent.lastReplyAt).length,
      timelineReads, timelineSubscriptions };
    const afterReplies = timelineReads;
    await new Promise(resolve => setTimeout(resolve, 2000));
    replyValidation.idleTimelineReads = timelineReads - afterReplies;
  }
  // 존재하지 않는 상위 label로 조회해 필터를 무시하는 호스트에서 정리하지 않음을 확인한다.
  const filtered = await api.agents.list({ filter: { includeArchived: false,
    labels: { 'paseo.parent-agent-id': 'agent-browser-validation-missing-parent-' + Date.now() } }, page: { limit: 1 } });
  assert.equal(filtered.entries.length, 0); assert.equal(filtered.pageInfo.hasMore, false);
  const workspaces = [...new Set(snapshot.agents.map(agent => agent.workspaceId).filter(Boolean))];
  const counts = workspaces.map(workspaceId => ({ workspaceId,
    total: workspaceAgents(snapshot.agents, workspaceId, 'updated').length,
    cleanupCandidates: createCleanupPlan(snapshot.agents, workspaceId,
      snapshot.agents.find(agent => agent.workspaceId === workspaceId)?.id ?? '', 7).agents.length }));
  console.log(JSON.stringify({ loaded: snapshot.loaded, partial: snapshot.partial, agents: snapshot.agents.length,
    reads, leases, idleReads, replyValidation, childFilterReads: 1, workspaceCount: counts.length,
    largestWorkspaces: counts.sort((a, b) => b.total - a.total).slice(0, 5) }, null, 2));
} finally {
  releaseReplies?.(); releaseWatch?.(); await directory?.dispose(); await transport.close();
}
