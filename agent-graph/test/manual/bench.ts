import { performance } from 'node:perf_hooks';
import { normalizeAgent } from '../../client/normalize';
import { workspaceAgents } from '../../shared/browser';
import { raw } from '../fixtures';
const agents = Array.from({ length: 2000 }, (_, i) => normalizeAgent(raw(String(i), {
  title: '검토 ' + i, workspaceId: i % 5 ? 'w' : 'other',
  createdAt: new Date(Date.UTC(2026, 9, 6, 0, i)).toISOString(),
  updatedAt: new Date(Date.UTC(2026, 9, 7, 0, 2000 - i)).toISOString(),
}), 'h'));
for (const [name, sort, query] of [['최근 활동순', 'updated', ''], ['생성순', 'created', ''], ['이름 검색', 'updated', '검토 10']] as const) {
  const samples: number[] = []; let visible = 0;
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    visible = workspaceAgents(agents, 'w', sort, query).length;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ name, platform: process.platform, arch: process.arch, model: agents.length, visible,
    repetitions: samples.length, medianMs: samples[50], p95Ms: samples[95] }));
}
