// 실제 컴포넌트 트리를 정적 HTML로 옮겨 레이아웃만 검토한다. Paseo 화면 검증을 대체하지 않는다.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const directory = '/tmp/mac-monitor-ui';
await mkdir(directory, { recursive: true });
await build({
  stdin: { contents: `
    import React from 'react';
    import { act, create } from 'react-test-renderer';
    import { writeFileSync } from 'node:fs';
    import { Details } from './client/popover';
    import { emptySnapshot } from './shared/compute';
    const GiB = 1024 ** 3;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const s = { ...emptySnapshot('native'), status: 'ok', sampledAt: Date.now(), ageMs: 0,
      cpu: { total: 23, user: 18, system: 5 },
      memory: { used: 14.1 * GiB, total: 16 * GiB, app: 6.2 * GiB, wired: 3.1 * GiB, compressed: 4.8 * GiB, cached: 1.3 * GiB },
      swap: { used: 4.2 * GiB, total: 6 * GiB }, pressure: 'normal', memoryLevel: 35, processesStatus: 'ok',
      processes: { topCpu: [
        { name: 'Google Chrome', processCount: 24, cpuPercent: 12, memoryBytes: 4.5 * GiB },
        { name: 'codex', processCount: 3, cpuPercent: 7, memoryBytes: 1.2 * GiB },
        { name: 'claude', processCount: 2, cpuPercent: 3, memoryBytes: 0.8 * GiB },
        { name: 'Paseo', processCount: 5, cpuPercent: 1, memoryBytes: 0.5 * GiB },
        { name: 'node', processCount: 2, cpuPercent: 0.4, memoryBytes: 0.2 * GiB }
      ], topMemory: [
        { name: 'Google Chrome', processCount: 24, cpuPercent: 12, memoryBytes: 4.5 * GiB },
        { name: 'codex', processCount: 3, cpuPercent: 7, memoryBytes: 1.2 * GiB }
      ], excludedRoot: 208, excludedPermission: 210, otherErrors: 0 } };
    const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
    const units = new Set(['flex','flexGrow','flexShrink','fontWeight','opacity','zIndex']);
    function html(node) {
      if (node == null) return '';
      if (typeof node === 'string' || typeof node === 'number') return escape(node);
      if (Array.isArray(node)) return node.map(html).join('');
      const style = flatten(node.props.style);
      for (const prefix of ['padding','margin']) for (const axis of ['Horizontal','Vertical']) {
        const key = prefix + axis;
        if (style[key] != null) { for (const side of axis === 'Horizontal' ? ['Left','Right'] : ['Top','Bottom']) style[prefix+side] = style[key]; delete style[key]; }
      }
      if (style.fontVariant) { style.fontVariantNumeric = style.fontVariant.join(' '); delete style.fontVariant; }
      const css = Object.entries(style).map(([key,value]) => key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase()) + ':' + (typeof value === 'number' && value !== 0 && !units.has(key) ? value+'px' : value)).join(';');
      return '<div class="'+node.type+'" style="'+escape(css)+'">'+html(node.children)+'</div>';
    }
    (async () => { for (const dark of [true, false]) for (const compact of [false, true]) {
      const colors = dark ? { foreground: '#ededed', foregroundMuted: '#9b9ba3', surface0: '#141416', surface1: '#1e1e22', surface2: '#2b2b30', border: '#34343b', accent: '#aaa3ff', statusSuccess: '#73c99d', statusWarning: '#edc268', statusDanger: '#ed8585' }
        : { foreground: '#25252b', foregroundMuted: '#71717d', surface0: '#fafafa', surface1: '#ffffff', surface2: '#f0f0f4', border: '#e3e3e9', accent: '#7664d8', statusSuccess: '#268050', statusWarning: '#92720d', statusDanger: '#b83939' };
      const props = { theme: { colors }, layout: { compact, platform: 'web' }, host: { id: 'h', label: 'Mac mini' } };
      let renderer;
      await act(async()=>{ renderer = create(<Details {...props} snapshot={s} name="Mac mini"/>); });
      const content = html(renderer.toJSON());
      await act(async()=>renderer.unmount());
      const filename = (dark ? 'dark' : 'light') + (compact ? '-compact' : '-desktop');
      const width = compact ? 360 : 520;
      const page = '<!doctype html><meta charset="utf-8"><title>mac-monitor 구성 검토</title><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:'+colors.surface0+';color:'+colors.foreground+'}.View,.Pressable{display:flex;flex-direction:column;flex-shrink:0;min-height:0;border-style:solid;border-width:0}.Text{display:block;flex-shrink:0;white-space:pre-wrap;overflow-wrap:break-word;line-height:1.45}main{width:'+width+'px;padding:'+(compact?16:24)+'px}header{font-size:11px;padding-bottom:16px;color:'+colors.foregroundMuted+'}</style><main><header>레이아웃 검토용 · 예시 데이터 / 예시 테마</header>'+content+'</main>';
      writeFileSync(${JSON.stringify(directory)}+'/'+filename+'.html', page);
    } })().catch(error => { console.error(error); process.exitCode = 1; });
  `, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: join(directory, 'render.cjs'), bundle: true, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'preview-native-elements', setup(builder) {
    builder.onResolve({ filter: /^react-native$/ }, () => ({ path: 'native', namespace: 'preview' }));
    builder.onResolve({ filter: /^@getpaseo\/plugin\/client$/ }, () => ({ path: 'sdk', namespace: 'preview' }));
    builder.onLoad({ filter: /.*/, namespace: 'preview' }, args => ({ contents: args.path === 'native'
      ? 'export const View="View", Text="Text", Pressable="Pressable";'
      : 'export function useRpc(){ return ()=>{}; }', loader: 'js' }));
  } }],
});
// 외부 패키지는 작업 저장소의 node_modules에서 찾는다.
const { spawnSync } = await import('node:child_process');
const run = spawnSync(process.execPath, [join(directory, 'render.cjs')], { stdio: 'inherit',
  env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') } });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(directory);
