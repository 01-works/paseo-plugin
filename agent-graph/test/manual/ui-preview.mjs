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
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ScrollView, FlatList, TextInput, View, Text, Pressable } from 'react-native';
export { ScrollView, FlatList, TextInput };
const ModalContext = createContext(null);
export const Modal = Object.assign(props => <ModalContext.Provider value={props}>{props.children}</ModalContext.Provider>, {
  Content: props => {
    const modal = useContext(ModalContext);
    return modal?.open ? createPortal(<div role="dialog" aria-modal="true" aria-label={modal.title}
      style={{ position: 'fixed', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12, background: 'rgba(0,0,0,0.4)', font: '14px system-ui' }} onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); modal.onOpenChange(false); }
        }}>
      <View style={{ width: '100%', maxWidth: 400, borderRadius: 12, backgroundColor: window.preview.colors.surface0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, height: 52 }}>
          <Text style={{ color: window.preview.colors.foreground }}>{modal.title}</Text>
          <Pressable accessibilityLabel="닫기 확인 창 닫기" onPress={() => modal.onOpenChange(false)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="X" color={window.preview.colors.foregroundMuted} />
          </Pressable>
        </View>
        <View style={props.contentContainerStyle}>{props.children}</View>
      </View>
    </div>, document.body) : null;
  }
});
// 호스트의 Lucide 모양을 대역에도 반영한다. SVG는 제품 client가 아닌 미리보기에서만 사용한다.
export const Icon = ({ name, color, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {name === 'Search' ? <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></> :
    name === 'Copy' ? <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></> :
    name === 'X' ? <path d="m18 6-12 12M6 6l12 12"/> :
    name === 'Maximize2' ? <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/> :
    name === 'List' ? <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/> : <path d="m9 18 6-6-6-6"/>}
</svg>;
export const copyText = async value => { window.preview.copied = value; window.preview.showToast('에이전트 ID 복사됨'); };
export const useToast = () => ({ show: text => window.preview.showToast(text), error: text => window.preview.showToast(text) });
`);
await writeFile(path.join(output, 'entry.tsx'), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { AgentContent } from ${JSON.stringify(path.join(root, 'client/content.tsx'))};
import { createAgentDirectory } from ${JSON.stringify(path.join(root, 'client/directory.ts'))};
import { createBrowserViews } from ${JSON.stringify(path.join(root, 'client/view-state.ts'))};
import { page, raw } from ${JSON.stringify(path.join(root, 'test/fixtures.ts'))};
const params = new URLSearchParams(location.search), compact = params.get('compact') !== '0', light = params.get('theme') === 'light';
const total = Math.max(0, Number(params.get('nodes') ?? 12)), panel = params.get('surface') === 'panel';
const titles = ['API 응답 검증', 'UI 레이아웃 검토', '회귀 테스트', '문서 정리', '성능 측정', '오류 처리'];
const entries = [...(total ? [raw('supervisor-001', { title: params.get('long') === '1' ? '워크스페이스의 최근 에이전트 탐색과 모바일 사용성 개선 최종 검토' : '에이전트 탐색 개선', status: 'running', updatedAt: '2026-10-07T04:59:00Z' })] : []),
  ...Array.from({ length: Math.max(0, total - 1) }, (_, i) => raw('agent-' + String(i + 1).padStart(3, '0'), {
    title: titles[i % titles.length] + ' ' + (i + 1), status: i % 4 === 0 ? 'running' : 'idle',
    labels: { 'paseo.parent-agent-id': 'supervisor-001' }, model: 'GPT-6', cwd: '/example/paseo-plugin',
    createdAt: new Date(Date.parse('2026-10-06T00:00:00Z') + i * 60000).toISOString(),
    updatedAt: new Date(Date.parse('2026-10-07T00:00:00Z') + i * 120000).toISOString() })),
  raw('foreign-workspace', { title: '다른 워크스페이스 항목', workspaceId: 'other', updatedAt: '2026-10-08T00:00:00Z', labels: { 'paseo.parent-agent-id': 'supervisor-001' } })];
let observer;
const snapshot = page(entries), lease = { subscriptionId: 'preview', release: async () => {}, subscribe(value) { observer = value; value.snapshot({ ...snapshot, subscriptionId: 'preview' }); return () => {}; } };
const directory = createAgentDirectory({ agents: {
  list: async () => { if (params.get('error') === '1') throw new Error('예시 연결 오류'); return { ...snapshot, subscription: lease }; },
  ref: id => ({ refresh: async () => {
    const agent = entries.find(entry => entry.id === id);
    return agent ? { agent, project: {} } : null;
  }, archive: async () => {
    await new Promise(resolve => setTimeout(resolve, 150));
    if (params.get('closeError') === '1') throw new Error('예시 보관 오류');
    window.preview.closed.push(id);
    const index = entries.findIndex(entry => entry.id === id);
    if (index >= 0) entries.splice(index, 1);
    return { archivedAt: new Date().toISOString() };
  } })
} }, 'h');
const views = createBrowserViews(), store = views.forAgent('h', 'w', 'supervisor-001');
const colors = light ? { foreground: '#22272e', foregroundMuted: '#616b78', surface0: '#ffffff', surface1: '#f3f5f7', surface2: '#e7ebf1', border: '#d5dbe3', accent: '#395ec6', statusSuccess: '#28754c', statusWarning: '#9b6500', statusDanger: '#b83a40' }
  : { foreground: '#e5e7eb', foregroundMuted: '#a3adb9', surface0: '#181c21', surface1: '#20262d', surface2: '#303943', border: '#3a434d', accent: '#98b5ff', statusSuccess: '#7dce9b', statusWarning: '#eeb756', statusDanger: '#ee858a' };
document.body.style.background = colors.surface0;
window.preview = { directory, store, views, colors, copied: null, opened: null, closed: [], update() {
  const target = entries.find(agent => agent.status !== 'running') ?? entries[0];
  observer.update({ type: 'agent_update', payload: { kind: 'upsert', agent: { ...target, status: 'running', updatedAt: '2026-10-07T05:30:00Z' }, project: {} } });
} };
function App() {
  const [toast, showToast] = useState(''); window.preview.showToast = text => { showToast(text); setTimeout(() => showToast(''), 1800); };
  return <View style={{ flex: 1, backgroundColor: colors.surface0, minHeight: 0 }}>
    <View style={{ height: 52, justifyContent: 'center', paddingHorizontal: panel ? 16 : 24, borderBottomWidth: 1, borderColor: colors.border }}>
      <Text style={{ color: colors.foreground }}>에이전트</Text>
    </View>
    <View style={{ flex: compact || panel ? 1 : undefined, minHeight: 0, padding: 12 }}>
      <AgentContent directory={directory} views={views} theme={{ colors }} host={{ id: 'h', label: '예시 호스트' }}
        layout={{ compact, platform: 'web' }} workspaceId="w" agentId="supervisor-001" surface={panel ? 'panel' : 'modal'}
        onLarge={panel ? undefined : () => window.preview.showToast('크게 보기 요청')}
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
