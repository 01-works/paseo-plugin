// 로컬 데몬 실사용 검증: 이어진 대화 묶기와 작업 이름 정리. 전용 테스트 workspace에서만 실행한다.
// node --import tsx test/manual/e2e-cleanup.mjs <workspaceId> [--seed] [--seed-only] [--show-only]
// --seed는 저렴한 모델로 상황 재현용 대화를 만든다. 매번 새로 만든 빈 테스트 workspace에서 실행한다.
// 대화를 보관하고 이름·라벨을 바꾸므로 실제 작업 workspace에 쓰지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createPaseoClient } from '@getpaseo/client';
import { createAgentDirectory } from '../../client/directory.ts';
import { normalizeAgent } from '../../client/normalize.ts';
import { collapseLineage, lineageRoots } from '../../shared/lineage.ts';
import { workspaceAgents } from '../../shared/list.ts';

const workspaceId = process.argv[2];
assert(workspaceId?.startsWith('wks_'), 'workspaceId가 필요합니다');
const flag = name => process.argv.includes(name);
const sdkVersion = JSON.parse(readFileSync(new URL('../../node_modules/@getpaseo/client/package.json', import.meta.url), 'utf8')).version;
const home = process.env.PASEO_HOME ?? path.join(homedir(), '.paseo');
const api = createPaseoClient({
  url: 'ws://127.0.0.1:6767/ws', clientId: 'agent-list-e2e', clientType: 'cli', appVersion: sdkVersion,
  localCredential: () => readFileSync(path.join(home, 'local-credential'), 'utf8').trim(),
  webSocketFactory: (url, options) => new WebSocket(url, options?.protocols, { headers: options?.headers }),
  reconnect: { enabled: false }, connectTimeoutMs: 5000,
});
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);
const live = async () => (await api.agents.list({ filter: { includeArchived: false }, page: { limit: 200 } }))
  .entries.map(entry => entry.agent).filter(agent => agent.workspaceId === workspaceId);
const show = async label => {
  const agents = (await live()).map(agent => normalizeAgent(agent, 'e2e'));
  const raw = new Map((await live()).map(agent => [agent.id, agent]));
  const groups = collapseLineage(workspaceAgents(agents, workspaceId, 'created'), lineageRoots(agents, workspaceId));
  log(label, groups.length + '줄 /', agents.length + '개');
  for (const group of groups) for (const [index, agent] of group.members.entries()) {
    const labels = raw.get(agent.id)?.labels ?? {};
    log(index ? '     └' : '  -', agent.id.slice(0, 8), JSON.stringify(agent.title),
      labels['agent-list.continued-from'] ? '[묶음 ← ' + labels['agent-list.continued-from'].slice(0, 8) + ']' : '',
      labels['agent-list.original-title'] ? '[원래: ' + labels['agent-list.original-title'] + ']' : '');
  }
  return { agents, raw, groups };
};
const ask = '파일은 읽거나 수정하지 말고';
let directory;
try {
  await api.connect();
  const workspace = api.workspaces.ref(workspaceId);
  const ids = {};
  if (flag('--seed')) {
    const make = async (key, title, prompt, labels = {}) => {
      const handle = await workspace.agents.create({ config: { provider: 'codex/gpt-6-luna', thinkingOptionId: 'low' }, title, prompt, labels });
      ids[key] = handle.id; return handle;
    };
    const first = await Promise.all([
      make('A', '재개', `README에 설치 방법 섹션을 넣으려면 어떤 항목이 필요할지 ${ask} 두 줄로만 답해.`),
      make('U1', '결제 실패 원인 조사해줘. 카드 결제가 간헐적으로 실패한다는 제보가 있음', `카드 결제 간헐 실패의 원인 후보를 ${ask} 두 가지만 답해.`),
      make('M1', 'https://example.com/issues/42?utm_source=mail', `https://example.com/issues/42 의 로그인 실패를 조사한다고 가정하고 확인할 점 두 가지만 ${ask} 답해.`),
      make('S', '감독 테스트', 'OK라고만 답해.'),
      make('X', '다크 모드 색상 대비 점검', `다크 모드 색상 대비 점검 기준을 ${ask} 한 줄로 답해.`),
    ]);
    const w = await make('W', 'Builder · 테스트 작업자', 'OK라고만 답해.', { 'paseo.parent-agent-id': ids.S });
    await Promise.all([...first, w].map(handle => handle.waitForFinish(180000)));
    const second = await Promise.all([
      make('B', '재개 (continued)', `이전 대화에 이어서, README 설치 방법 섹션에 들어갈 항목을 ${ask} 한 줄로 정리해.`, { 'zerosub.continued-from': ids.A }),
      make('U2', `${ids.U1} 에이전트 작업 이어서 해줘`, `앞 대화(카드 결제 간헐 실패 조사)에 이어서 다음 확인 단계를 ${ask} 한 줄로 답해.`),
      make('M2', '너가 이어서 진행', `앞에서 하던 example.com/issues/42 로그인 실패 조사를 이어서, 확인할 점을 한 가지 더 ${ask} 답해.`),
      make('W2', 'Builder · 테스트 작업자 (continued)', 'OK라고만 답해.', { 'zerosub.continued-from': ids.W }),
    ]);
    await Promise.all(second.map(handle => handle.waitForFinish(180000)));
    log('seed', Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, id.slice(0, 8)])));
    if (flag('--seed-only')) process.exit(0);
  }
  if (flag('--show-only')) { await show('현재'); process.exit(0); }
  const before = await show('도우미 전');
  if (ids.A) assert.equal(before.groups.length, 7, 'A-B(라벨)·U1-U2(제목 ID)·W-W2 묶음, M1·M2는 아직 따로');
  directory = createAgentDirectory(api, 'e2e');
  const helperId = await directory.startRename(workspaceId);
  log('도우미', helperId.slice(0, 8));
  const finished = await api.agents.ref(helperId).waitForFinish(900000);
  log('도우미 종료', finished.status);
  const after = await show('도우미 뒤');
  if (ids.A) {
    assert.equal(after.raw.get(ids.M2)?.labels?.['agent-list.continued-from'], ids.M1, 'M2를 M1에 묶음');
    assert.equal(after.raw.get(ids.W)?.title, 'Builder · 테스트 작업자', '감독자 작업자는 그대로');
    assert.equal(after.groups.length, 7, '이름이 바뀐 뒤에도 묶음 유지(도우미 + M1-M2 묶임)');
    for (const key of ['B', 'U2', 'M2']) assert(after.raw.get(ids[key])?.labels?.['agent-list.original-title'], key + ' 이름 정리');
    for (const key of ['A', 'U1', 'M1']) assert(!after.raw.get(ids[key])?.labels?.['agent-list.original-title'], key + '는 묶음의 이전 대화라 그대로');
    log('검증 통과');
  }
} finally {
  await directory?.dispose();
  await api.close();
}
