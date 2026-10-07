// 실제 제품 컴포넌트 + RN Web. 합성 데이터/호스트 대역이며 실제 iOS 시트 검증을 대신하지 않는다.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
const root = process.cwd(), output = path.join(tmpdir(), 'agent-graph-ui');
const option = name => process.argv.find(value => value.startsWith(name + '='))?.slice(name.length + 1);
const require = createRequire(path.join(option('--modules') ?? root, 'package.json'));
const web = require.resolve('react-native-web');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'host.tsx'), `
import React from 'react';
import { ScrollView, FlatList, TextInput, Text } from 'react-native';
export { ScrollView, FlatList, TextInput };
export const Icon = ({ color }) => <Text style={{ color }}>›</Text>;
export const copyText = async value => { window.preview.copied = value; window.preview.showToast('에이전트 ID 복사됨'); };
export const useToast = () => ({ show: text => window.preview.showToast(text), error: text => window.preview.showToast(text) });
`);
await writeFile(path.join(output, 'entry.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { GraphContent } from ${JSON.stringify(path.join(root, 'client/content.tsx'))};
import { createAgentDirectory } from ${JSON.stringify(path.join(root, 'client/directory.ts'))};
import { createGraphViews } from ${JSON.stringify(path.join(root, 'client/view-state.ts'))};
import { page, raw } from ${JSON.stringify(path.join(root, 'test/fixtures.ts'))};
const params = new URLSearchParams(location.search), compact = params.get('compact') !== '0', light = params.get('theme') === 'light';
const total = Number(params.get('nodes') || 12);
const titles = ['API 응답 검증', 'UI 레이아웃 검토', '회귀 테스트', '문서 정리', '성능 측정', '오류 처리'];
const entries = [raw('supervisor-001', { title: '에이전트 구조 구현', status: 'running', updatedAt: '2026-10-07T04:59:00Z' }),
  ...Array.from({ length: total - 1 }, (_, i) => raw('agent-' + String(i + 1).padStart(3, '0'), {
    title: titles[i % titles.length] + ' ' + (i + 1), status: i % 4 === 0 ? 'running' : 'idle',
    labels: { 'paseo.parent-agent-id': 'supervisor-001' }, model: 'GPT-6', cwd: '/example/paseo-plugin',
    createdAt: new Date(Date.parse('2026-10-06T00:00:00Z') + i * 60000).toISOString(),
    updatedAt: new Date(Date.parse('2026-10-07T00:00:00Z') + i * 120000).toISOString() })),
  raw('foreign-workspace', { title: '다른 워크스페이스 항목', workspaceId: 'other', updatedAt: '2026-10-08T00:00:00Z', labels: { 'paseo.parent-agent-id': 'supervisor-001' } })];
let observer;
const snapshot = page(entries), lease = { subscriptionId: 'preview', release: async () => {}, subscribe(value) { observer = value; value.snapshot({ ...snapshot, subscriptionId: 'preview' }); return () => {}; } };
const directory = createAgentDirectory({ agents: { list: async () => ({ ...snapshot, subscription: lease }) } }, 'h');
const views = createGraphViews(), store = views.forAgent('h', 'w', 'supervisor-001');
if (params.get('view') === 'structure') store.set({ view: 'structure' });
const colors = light ? { foreground: '#22272e', foregroundMuted: '#616b78', surface0: '#ffffff', surface1: '#f3f5f7', surface2: '#e7ebf1', border: '#d5dbe3', accent: '#395ec6', statusSuccess: '#28754c', statusWarning: '#9b6500', statusDanger: '#b83a40' }
  : { foreground: '#e5e7eb', foregroundMuted: '#a3adb9', surface0: '#181c21', surface1: '#20262d', surface2: '#303943', border: '#3a434d', accent: '#98b5ff', statusSuccess: '#7dce9b', statusWarning: '#eeb756', statusDanger: '#ee858a' };
document.body.style.background = colors.surface0;
window.preview = { directory, store, views, copied: null, opened: null, update() {
  const target = entries.find(agent => agent.status !== 'running') ?? entries[0];
  observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: { ...target, status: 'running', updatedAt: '2026-10-07T05:30:00Z' }, project: {} } });
} };
function App() {
  const [toast, showToast] = useState(''); window.preview.showToast = text => { showToast(text); setTimeout(() => showToast(''), 1800); };
  return <View style={{ flex: 1, backgroundColor: colors.surface0, minHeight: 0 }}>
    <View style={{ height: 52, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.foreground }}>에이전트</Text>
    </View>
    <View style={{ flex: compact ? 1 : undefined, minHeight: 0, padding: 12 }}>
      <GraphContent directory={directory} views={views} theme={{ colors }} host={{ id: 'h', label: '예시 호스트' }}
        layout={{ compact, platform: 'web' }} workspaceId="w" agentId="supervisor-001" surface="modal"
        onNavigate={params.get('nav') === '0' ? undefined : id => { window.preview.opened = id; window.preview.showToast('대화 이동 요청: ' + id); }} />
    </View>
    {toast ? <View style={{ position: 'absolute', bottom: 16, left: 16, padding: 12, borderRadius: 8, backgroundColor: colors.surface2 }}>
      <Text style={{ color: colors.foreground }}>{toast}</Text>
    </View> : null}
  </View>;
}
directory.start().then(() => createRoot(document.getElementById('root')).render(<App />));
`);
await build({ entryPoints: [path.join(output, 'entry.tsx')], bundle: true, format: 'esm', platform: 'browser', target: 'es2020', jsx: 'automatic',
  alias: { 'react-native': web, '@getpaseo/plugin/client/react-native': path.join(output, 'host.tsx'),
    react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') },
  outfile: path.join(output, 'preview.js'), logLevel: 'warning' });
await writeFile(path.join(output, 'index.html'), '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>agent-graph 화면 검증</title><style>html,body,#root{margin:0;width:100%;height:100%;}#root{display:flex;flex-direction:column;font:14px system-ui;}*{box-sizing:border-box;}</style><div id="root"></div><script type="module" src="/preview.js"></script></html>');
const server = createServer(async (request, response) => {
  try {
    const file = request.url?.split('?')[0] === '/preview.js' ? 'preview.js' : 'index.html';
    response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html; charset=utf-8');
    response.end(await readFile(path.join(output, file)));
  } catch { response.writeHead(500); response.end(); }
});
if (!process.argv.includes('--build-only')) server.listen(Number(option('--port') ?? 49318), '127.0.0.1', () => console.log('http://127.0.0.1:' + server.address().port + ' · 합성 데이터 RN Web 미리보기'));
