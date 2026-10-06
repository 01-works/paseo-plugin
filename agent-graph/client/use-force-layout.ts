import { useEffect, useMemo, useState } from 'react';
import { createForceLayout } from '../shared/force-layout';
import type { AgentKey, Forest } from '../shared/types';
import type { GraphLayout } from '../shared/layout';
import type { GraphViewState } from './view-state';

export function useForceLayout(forest: Forest, collapsed: ReadonlySet<AgentKey>, store: GraphViewState, enabled: boolean) {
  const key = useMemo(() => JSON.stringify([forest.signature, [...collapsed].sort()]), [forest.signature, collapsed]);
  const job = useMemo(() => {
    const cached = store.forceCache.get(key);
    if (cached) { store.forceCache.delete(key); store.forceCache.set(key, cached); }
    const previous = [...store.forceCache.values()].at(-1);
    const work = cached || !enabled ? null : createForceLayout(forest, collapsed, previous);
    return { key, cached, work, seed: cached ?? work?.result() ?? {
      positions: new Map(), edges: [], width: 0, height: 0, truncated: false, direction: 'force' as const,
    } };
  }, [key, store, enabled]);
  const [finished, setFinished] = useState<{ key: string; layout: GraphLayout } | null>(null);
  const ready = job.cached ?? (finished?.key === key ? finished.layout : null);
  useEffect(() => {
    if (!enabled || job.seed.truncated || job.cached) return;
    let cancelled = false, timer: ReturnType< typeof setTimeout> | undefined;
    const run = () => {
      if (cancelled) return;
      const start = performance.now();
      do { job.work!.tick(); } while (!job.work!.done && performance.now() - start < 6);
      if (job.work!.done) {
        const layout = job.work!.result();
        store.forceCache.set(key, layout);
        while (store.forceCache.size > 4) store.forceCache.delete(store.forceCache.keys().next().value!);
        setFinished({ key, layout });
      } else timer = setTimeout(run, 0);
    };
    timer = setTimeout(run, 0);
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); job.work!.stop(); };
  }, [job, enabled, store]);
  return { geometry: ready ?? job.seed, arranging: enabled && !job.seed.truncated && !ready };
}
