import { performance } from 'node:perf_hooks';
import { buildForest, scopeForest, initialCollapse, descendantCounts } from '../../shared/forest';
import { layoutForest } from '../../shared/layout';
import { agent } from '../fixtures';
const nodes = Array.from({ length: 2000 }, (_, i) => agent(String(i), i ? String(Math.floor((i - 1) / 5)) : undefined));
for (const [name, model, folded] of [
  ['가까운 경로', nodes, true], ['전체 펼침', nodes, false],
  ['직계 자손 1999', Array.from({ length: 2000 }, (_, i) => agent(String(i), i ? '0' : undefined)), false],
  ['깊은 체인', Array.from({ length: 2000 }, (_, i) => agent(String(i), i ? String(i - 1) : undefined)), false],
] as const) {
  const samples: number[] = []; let positions = 0;
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    const forest = buildForest(model, 'h'), scoped = scopeForest(forest, model[100].key, 'w', 'group');
    const collapse = folded ? initialCollapse(scoped, model[100].key) : new Set<string>(); descendantCounts(scoped);
    positions = layoutForest(scoped, collapse).positions.size;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ name, platform: process.platform, arch: process.arch, model: model.length, positions,
    repetitions: samples.length, medianMs: samples[50], p95Ms: samples[95], processHeapMiB: process.memoryUsage().heapUsed / 1024 ** 2 }));
}
