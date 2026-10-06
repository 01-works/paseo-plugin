// 렌더러와 분리한 정적 D3 배치 비용. 실행 중인 Paseo 에이전트는 수정하지 않는다.
import { performance } from 'node:perf_hooks';
import { createForceLayout, FORCE_TICKS } from '../../shared/force-layout';
import { buildForest } from '../../shared/forest';
import { fitZoom } from '../../shared/layout';
import { agent } from '../fixtures';

for (const count of [209, 500, 2000]) {
  const forest = buildForest([agent('root'), ...Array.from({ length: count - 1 }, (_, i) => agent('child' + i, 'root'))], 'h');
  const runs = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    const start = performance.now(), work = createForceLayout(forest, new Set());
    let maxTickMs = 0;
    for (let i = 0; i < FORCE_TICKS; i++) {
      const tickStart = performance.now(); work.tick(); maxTickMs = Math.max(maxTickMs, performance.now() - tickStart);
    }
    const layout = work.result(); work.stop();
    runs.push({ totalMs: performance.now() - start, maxTickMs, width: layout.width, height: layout.height,
      fitZoom: fitZoom(layout, 640, 360) });
  }
  const median = [...runs].sort((a, b) => a.totalMs - b.totalMs)[1];
  console.log(JSON.stringify({ nodes: count, ticks: FORCE_TICKS, runs, median }));
}
