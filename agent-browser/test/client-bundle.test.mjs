import { afterAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Node 테스트만으로는 iOS의 번들 로드 실패를 검출하지 못한다.
// Paseo 0.10.2 client compiler와 같은 설정으로 제품 entry를 묶어 RN에 포함된 Hermes로 읽는다.
const require = createRequire(import.meta.url);
const directory = mkdtempSync(path.join(tmpdir(), 'agent-browser-hermes-'));
const binary = { darwin: 'osx-bin/hermesc', linux: 'linux64-bin/hermesc', win32: 'win64-bin/hermesc.exe' }[process.platform];
if (!binary) throw new Error('Hermes 검증을 지원하지 않는 운영체제입니다');
const hermesc = path.join(path.dirname(require.resolve('react-native/package.json')), 'sdks/hermesc', binary);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function compile(source, name) {
  const file = path.join(directory, name + '.js');
  writeFileSync(file, source);
  return spawnSync(hermesc, ['-emit-binary', '-out', path.join(directory, name + '.hbc'), file], { encoding: 'utf8' });
}

it('iOS Hermes는 이전 pill 로드 실패를 일으킨 미변환 클래스 문법을 거부', () => {
  const result = compile('var AgentDirectory = class { constructor() { this.agents = new Map(); } };', 'previous');
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Invalid expression');
});

it('실제 client entry 전체 번들이 iOS Hermes에서 문법 오류 없이 컴파일됨', async () => {
  const result = await build({
    entryPoints: ['index.client.tsx'], bundle: true, format: 'cjs', jsx: 'automatic', platform: 'neutral', target: 'es2020',
    supported: { 'async-await': false },
    external: ['@getpaseo/plugin', '@getpaseo/plugin/client', '@getpaseo/plugin/client/react-native', '@getpaseo/plugin/client/ui',
      '@tanstack/react-query', 'react', 'react/jsx-runtime', 'react-native', 'zod'],
    treeShaking: true, write: false, logLevel: 'silent',
  });
  const code = result.outputFiles[0].text.replaceAll('get: () => from[key]', 'value: from[key]');
  const bundle = '(function(require) { const module = { exports: {} }; const exports = module.exports;\n' + code + '\nreturn module.exports; })';
  const compiled = compile(bundle, 'client');
  expect(compiled.error).toBeUndefined();
  expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
});
