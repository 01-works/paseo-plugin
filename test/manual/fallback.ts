// 전용 임시 홈에서 실행한다. 실제 데몬 설정/플러그인을 변경하지 않는다.
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Collector } from '../../server/collector';
async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'mac-monitor-fallback-'));
  const originalPaseoHome = process.env.PASEO_HOME;
  process.env.PASEO_HOME = path.join(dir, 'home');
  try {
    for (const mode of ['local', 'node']) {
      const root = path.join(dir, mode); await mkdir(path.join(root, 'native'), { recursive: true });
      if (mode === 'local') await copyFile('native/macmon-helper.c', path.join(root, 'native/macmon-helper.c'));
      const collector = new Collector({ root, backoffMs: 50 });
      try {
        await collector.start(); const end = Date.now() + 15_000;
        while (collector.snapshot().status !== 'ok') {
          if (Date.now() > end) throw new Error(`${mode} 폴백 대기 시간 초과`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const snapshot = collector.snapshot(true);
        if (snapshot.helperMode !== (mode === 'local' ? 'native' : 'node') || snapshot.errors.length) throw new Error('폴백 결과 불일치');
        console.log(JSON.stringify({ requested: mode, helperMode: snapshot.helperMode, status: snapshot.status, seq: snapshot.seq, processesStatus: snapshot.processesStatus, errors: snapshot.errors }));
      } finally { await collector.stop(); }
    }
  } finally {
    if (originalPaseoHome === undefined) delete process.env.PASEO_HOME; else process.env.PASEO_HOME = originalPaseoHome;
    await rm(dir, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error);process.exitCode = 1; });
