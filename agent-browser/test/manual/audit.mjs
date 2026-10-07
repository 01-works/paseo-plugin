import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const forbidden = /document\.|window\.|localStorage|navigator\.|<[a-z]+[ >]|className=|onClick=|onContextMenu=|fontSize/;
const failures = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (/\.tsx?$/.test(file)) {
      const lines = (await readFile(file, 'utf8')).split('\n');
      lines.forEach((line, index) => { if (forbidden.test(line)) failures.push(`${file}:${index + 1}`); });
    }
  }
}
await inspect('client');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; }
else console.log('client DOM/HTML·글자 크기 audit 0건');
