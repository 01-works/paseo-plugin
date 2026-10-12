import { afterAll, expect, it } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ts from 'typescript';

// Node 테스트만으로는 iOS의 번들 로드 실패를 검출하지 못한다.
// 호스트 제공 모듈 밖의 타입 import도 배포 시 의존성 설치가 필요하다.
// import 경계를 확인한 뒤 제품 entry를 묶어 RN에 포함된 Hermes로 읽는다.
// 호스트 compiler 전체의 대역은 아니므로 실제 Git 설치는 별도로 검증한다.
const hostModules = ['@getpaseo/plugin', '@getpaseo/plugin/client', '@getpaseo/plugin/client/react-native', '@getpaseo/plugin/client/ui',
  '@tanstack/react-query', 'react', 'react/jsx-runtime', 'react-native', 'zod'];
const require = createRequire(import.meta.url);
const directory = mkdtempSync(path.join(tmpdir(), 'agent-list-hermes-'));
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

it('개발 의존성이 없는 배포 사본의 client entry가 번들링되고 iOS Hermes에서 컴파일됨', async () => {
  const pluginDirectory = path.join(directory, 'plugin');
  mkdirSync(pluginDirectory);
  for (const name of ['index.client.tsx', 'client', 'shared']) {
    cpSync(name, path.join(pluginDirectory, name), { recursive: true });
  }
  for (const name of readdirSync(pluginDirectory, { recursive: true }).filter(name => /\.tsx?$/.test(name))) {
    const source = readFileSync(path.join(pluginDirectory, name), 'utf8');
    const imports = ts.preProcessFile(source, true, true).importedFiles.map(item => item.fileName);
    const unavailable = imports.filter(id => !id.startsWith('./') && !id.startsWith('../') && !hostModules.includes(id));
    expect(unavailable, name + ': 타입 import도 호스트 제공 모듈 또는 로컬 파일이어야 함').toEqual([]);
  }
  const result = await build({
    absWorkingDir: pluginDirectory,
    entryPoints: ['index.client.tsx'], bundle: true, format: 'cjs', jsx: 'automatic', platform: 'neutral', target: 'es2020',
    supported: { 'async-await': false },
    external: hostModules,
    treeShaking: true, write: false, logLevel: 'silent',
  });
  const code = result.outputFiles[0].text.replaceAll('get: () => from[key]', 'value: from[key]');
  const bundle = '(function(require) { const module = { exports: {} }; const exports = module.exports;\n' + code + '\nreturn module.exports; })';
  const compiled = compile(bundle, 'client');
  expect(compiled.error).toBeUndefined();
  expect(compiled.status, compiled.stdout + compiled.stderr).toBe(0);
});
