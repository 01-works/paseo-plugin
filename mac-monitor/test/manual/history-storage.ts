// node --expose-gc --import tsx test/manual/history-storage.ts
// 가상 1시간 숫자 버퍼 검증이다. 실제 1시간 관측 결과가 아니다.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ProcessHistory } from '../../server/history';
let wall = 1_790_000_000_000, mono = 0;
const entries = Array.from({ length: 512 }, (_, i) => ({ pid: i + 1, start: String(100000000000000n + BigInt(i)),
  cpuTimeMs: 0, memoryBytes: 16 * 1024 ** 2 + i, readBytes: 0, writtenBytes: 0 }));
globalThis.gc?.();
const before = process.memoryUsage(), history = new ProcessHistory({ now: () => wall, monotonicNow: () => mono });
for (let sample = 0; sample < 61; sample++) {
  entries.forEach(p => { p.cpuTimeMs += 600; p.readBytes += 1024; p.writtenBytes += 2048; });
  history.accept({ entries, coreCount: 10, truncated: true }, wall, mono);
  if (sample < 60) { wall += 60_000; mono += 60_000; }
}
globalThis.gc?.();
const after = process.memoryUsage(), stats = history.stats(), summaries = [];
const started = performance.now();
for (let i = 0; i < 100; i++) for (let pid = 1; pid <= 16; pid++) summaries.push(history.summary(pid, entries[pid - 1].start));
const elapsed = performance.now() - started;
assert.equal(stats.bufferBytes, 1_374_208); assert.equal(summaries[0]?.observedSeconds, 3600);
assert.equal(history.summary(512, entries[511].start)?.sampleCount, 61);
console.log(JSON.stringify({ synthetic: true, ...stats, observedSeconds: summaries[0]?.observedSeconds,
  arrayBufferDeltaBytes: after.arrayBuffers - before.arrayBuffers, heapDeltaBytes: after.heapUsed - before.heapUsed,
  average16SummariesMs: elapsed / 100 }));
history.clear(); assert.equal(history.stats().bufferBytes, 0);
