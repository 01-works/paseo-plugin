import { expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ReportStore } from '../server/reports';

vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, readdir: vi.fn(actual.readdir) };
});
it('목록을 얻은 뒤 lane 하나가 사라져도 다른 lane 상태는 반환한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'supervision-disappear-'));
  try {
    const base = join(root, 'yw-supervisor'); const gone = join(base, 'gone'); const kept = join(base, 'kept');
    await mkdir(gone, { recursive: true }); await mkdir(kept);
    await writeFile(join(kept, 'supervision-state.json'), JSON.stringify({ version: 1, agentId: 'a', serverId: 'local', title: '남은 목표',
      reportedAt: '2026-11-18T00:00:00Z', report: { items: [{ id: 'g', summary: '목표', status: 'open' }], turnEnd: { kind: 'next_action', detail: '배정' }, decisions: [] } }));
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    vi.mocked(readdir).mockImplementationOnce((async () => { const entries = await actual.readdir(base, { withFileTypes: true }); await rm(gone, { recursive: true }); return entries; }) as never);
    const rows = await new ReportStore(root).list();
    expect(rows.find(row => row.state?.title === '남은 목표')).toBeTruthy();
    expect(vi.mocked(readdir)).toHaveBeenCalledTimes(1);
  } finally { vi.mocked(readdir).mockRestore(); await rm(root, { recursive: true, force: true }); }
});
