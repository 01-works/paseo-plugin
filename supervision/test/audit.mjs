import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
const forbidden = /\b(?:document|window|localStorage|navigator)\.|className=|onClick=|<(?:div|span|button|input|p|a|section|main|iframe|canvas)\b|from ['"]node:|\/client\/host/;
for (const path of ['index.client.tsx', ...files('client')]) {
  if (forbidden.test(readFileSync(path, 'utf8'))) throw new Error(`클라이언트 경계 위반: ${path}`);
}
for (const path of files('shared')) {
  if (/from ['"](?:node:|react|react-native|.*\/server\/)/.test(readFileSync(path, 'utf8'))) throw new Error(`공유 모듈 경계 위반: ${path}`);
}
const config = JSON.parse(readFileSync('tsconfig.json', 'utf8'));
if (config.compilerOptions.lib.some(lib => /dom/i.test(lib))) throw new Error('DOM lib 금지');
console.log('클라이언트·공유 모듈 경계 검사 통과');
