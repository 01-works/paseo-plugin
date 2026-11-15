// client 코드는 React Native 기본 요소만 쓰고 기본 글자 크기를 따른다.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
// 소문자 태그는 HTML 요소다. `<typeof x>`·`<void>` 같은 타입 인자는 제외한다.
const forbidden = /document\.|window\.|localStorage|navigator\.|<(?!typeof\b|void\b)[a-z]+[ >/]|className=|onClick=|fontSize/;
const failures = [];
async function inspect(target) {
  const stat = await readdir(target, { withFileTypes: true }).catch(() => null);
  const entries = stat ?? [];
  for (const entry of entries) {
    const file = path.join(target, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.tsx?$/.test(file)) scan(file, await readFile(file, 'utf8'));
  }
}
function scan(file, text) {
  text.split('\n').forEach((line, index) => {
    if (forbidden.test(line)) failures.push(`${file}:${index + 1}`);
  });
}
await inspect('client');
scan('index.client.tsx', await readFile('index.client.tsx', 'utf8'));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('client DOM/HTML·글자 크기 audit 0건');
