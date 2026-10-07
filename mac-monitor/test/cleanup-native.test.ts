import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
const run = promisify(execFile);
it.skipIf(process.platform !== 'darwin')('C 실행 인자 파서는 빈 인자와 환경 영역을 혼동하지 않음', async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'mac-monitor-args-test-')), binary=path.join(directory,'arguments');
  try {
    await run('/usr/bin/clang',['-std=c11','-O2','-o',binary,'test/manual/native-arguments.c']);
    expect((await run(binary)).stdout).toContain('환경 영역 제외');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
