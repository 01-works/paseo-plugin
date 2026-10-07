import { performance } from 'node:perf_hooks';
import { HISTORY_FRAME_LIMIT, HISTORY_MAX_GAP_MS, HISTORY_RETENTION_MS, type HistoryFrame, type HistorySummary } from '../shared/history';

// 한 프로세스당 44 bytes. 경로·이름·명령행·작업 폴더를 저장하지 않는다.
type Frame = { t: number; mono: number; receivedMono: number; cores: number; limited: boolean;
  pids: Uint32Array; starts: BigUint64Array; values: Float64Array };
function indexOf(frame: Frame, pid: number, start: bigint): number {
  let left = 0, right = frame.pids.length - 1;
  while (left <= right) {
    const mid = (left + right) >>> 1, value = frame.pids[mid];
    if (value === pid) return frame.starts[mid] === start ? mid : -1;
    if (value < pid) left = mid + 1; else right = mid - 1;
  }
  return -1;
}
export class ProcessHistory {
  private frames: Frame[] = [];
  private wall: () => number;
  private mono: () => number;
  constructor(options: { now?: () => number; monotonicNow?: () => number } = {}) {
    this.wall = options.now ?? Date.now; this.mono = options.monotonicNow ?? (() => performance.now());
  }
  clear(): void { this.frames = []; }
  prune(): void {
    const wall = this.wall(), mono = this.mono();
    this.frames = this.frames.filter(f => wall - f.t <= HISTORY_RETENTION_MS && mono - f.receivedMono <= HISTORY_RETENTION_MS);
    const last = this.frames.at(-1);
    // 단조 시계가 수면 중 멈추거나 벽시계가 바뀐 구간을 활동 근거로 이어 붙이지 않는다.
    if (last && Math.abs((wall - last.t) - (mono - last.receivedMono)) > 5000) this.clear();
  }
  accept(data: HistoryFrame, t: number, mono: number): void {
    this.prune();
    const receivedMono = this.mono();
    if (!Number.isFinite(t) || !Number.isFinite(mono) || Math.abs(this.wall() - t) > 5000) { this.clear(); return; }
    const last = this.frames.at(-1);
    if (last && (mono <= last.mono || t <= last.t || Math.abs((t - last.t) - (mono - last.mono)) > 5000 || data.coreCount !== last.cores)) this.clear();
    const entries = [...data.entries].sort((a, b) => a.pid - b.pid), count = entries.length;
    const frame: Frame = { t, mono, receivedMono, cores: data.coreCount, limited: data.truncated,
      pids: new Uint32Array(count), starts: new BigUint64Array(count), values: new Float64Array(count * 4) };
    entries.forEach((p, i) => {
      frame.pids[i] = p.pid; frame.starts[i] = BigInt(p.start);
      frame.values.set([p.cpuTimeMs, p.memoryBytes, p.readBytes, p.writtenBytes], i * 4);
    });
    this.frames.push(frame);
    if (this.frames.length > HISTORY_FRAME_LIMIT) this.frames.shift();
  }
  summary(pid: number, start: string): HistorySummary | null {
    this.prune();
    const latest = this.frames.at(-1);
    if (!latest || Math.max(this.wall() - latest.t, this.mono() - latest.receivedMono) > HISTORY_MAX_GAP_MS || !/^\d{1,20}$/.test(start)) return null;
    const key = BigInt(start), index = indexOf(latest, pid, key);
    if (index < 0) return null;
    let first = latest, firstIndex = index, next = latest, nextIndex = index, count = 1;
    let maxCpu = 0, peak = latest.values[index * 4 + 1], limited = latest.limited;
    for (let i = this.frames.length - 2; i >= 0; i--) {
      const frame = this.frames[i], current = indexOf(frame, pid, key), elapsed = next.mono - frame.mono;
      if (current < 0 || elapsed < 30_000 || elapsed > HISTORY_MAX_GAP_MS || next.cores !== frame.cores) break;
      const a = current * 4, b = nextIndex * 4;
      const cpuDelta = next.values[b] - frame.values[a];
      const cpu = cpuDelta / elapsed * 100 / frame.cores;
      if (cpuDelta < 0 || cpu > 100 || next.values[b + 2] < frame.values[a + 2] || next.values[b + 3] < frame.values[a + 3]) break;
      first = next = frame; firstIndex = nextIndex = current; count++;
      maxCpu = Math.max(maxCpu, cpu); peak = Math.max(peak, frame.values[a + 1]); limited ||= frame.limited;
    }
    if (count < 2) return null;
    const a = firstIndex * 4, b = index * 4, elapsed = latest.mono - first.mono;
    return { sampledAt: latest.t, observedSeconds: elapsed / 1000, sampleCount: count,
      averageCpuPercent: (latest.values[b] - first.values[a]) / elapsed * 100 / latest.cores, maxMinuteCpuPercent: maxCpu,
      memoryDeltaBytes: latest.values[b + 1] - first.values[a + 1], peakMemoryBytes: peak,
      readBytes: latest.values[b + 2] - first.values[a + 2], writtenBytes: latest.values[b + 3] - first.values[a + 3], limited };
  }
  stats() {
    this.prune();
    return { frames: this.frames.length, entries: this.frames.reduce((n, f) => n + f.pids.length, 0),
      bufferBytes: this.frames.reduce((n, f) => n + f.pids.byteLength + f.starts.byteLength + f.values.byteLength, 0) };
  }
}
