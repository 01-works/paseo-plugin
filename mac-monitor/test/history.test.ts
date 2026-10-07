import { expect, it } from 'vitest';
import { ProcessHistory } from '../server/history';
import { historyFrameSchema, historySummarySchema, type HistoryFrame } from '../shared/history';
const epoch = 1_790_000_000_000;
const process = { pid: 123, start: '90071992547409999', cpuTimeMs: 1000, memoryBytes: 16 * 1024 ** 2, readBytes: 100, writtenBytes: 200 };
function harness() {
  let wall = epoch, mono = 0;
  const history = new ProcessHistory({ now: () => wall, monotonicNow: () => mono });
  const advance = (ms = 60_000) => { wall += ms; mono += ms; };
  const push = (entries = [process], truncated = false, coreCount = 10) => history.accept({ entries, truncated, coreCount }, wall, mono);
  return { history, push, advance, clock: (w: number, m: number) => { wall += w; mono += m; }, summary: () => history.summary(process.pid, process.start) };
}
it('첫 관측은 확인 불가, 이후 1분 평균 CPU와 메모리/I/O 실제 차이를 계산', () => {
  const h = harness(); h.push(); expect(h.summary()).toBeNull();
  h.advance(); h.push([{ ...process, cpuTimeMs: 2200, memoryBytes: process.memoryBytes + 1024, readBytes: 500, writtenBytes: 800 }]);
  expect(h.summary()).toEqual({ sampledAt: epoch + 60_000, observedSeconds: 60, sampleCount: 2,
    averageCpuPercent: 0.2, maxMinuteCpuPercent: 0.2, memoryDeltaBytes: 1024, peakMemoryBytes: process.memoryBytes + 1024,
    readBytes: 400, writtenBytes: 600, limited: false });
  expect(historySummarySchema.safeParse(h.summary()).success).toBe(true);
});
it('낮은 CPU로 거르지 않고 활동 구간을 보관해 구간 평균의 최대를 반환', () => {
  const h = harness(); h.push(); h.advance(); h.push([{ ...process, cpuTimeMs: 601000 }]);
  h.advance(); h.push([{ ...process, cpuTimeMs: 601000 }]);
  expect(h.summary()?.averageCpuPercent).toBe(50); expect(h.summary()?.maxMinuteCpuPercent).toBe(100);
});
it('PID 재사용·대상 누락·빈 관측은 0 활동으로 해석하지 않고 연속 근거를 끊음', () => {
  for (const entries of [[], [{ ...process, start: '2' }]]) {
    const h = harness(); h.push(); h.advance(); h.push(entries); expect(h.summary()).toBeNull();
    h.advance(); h.push(); expect(h.summary()).toBeNull(); h.advance(); h.push(); expect(h.summary()?.observedSeconds).toBe(60);
  }
});
it('CPU/디스크 카운터 역행과 90초 초과 공백을 이어 붙이지 않음', () => {
  for (const changed of [{ cpuTimeMs: 999 }, { readBytes: 99 }, { writtenBytes: 199 }]) {
    const h = harness(); h.push(); h.advance(); h.push([{ ...process, ...changed }]); expect(h.summary()).toBeNull();
    h.advance(); h.push([{ ...process, ...changed }]); expect(h.summary()?.observedSeconds).toBe(60);
  }
  const h = harness(); h.push(); h.advance(91_000); h.push(); expect(h.summary()).toBeNull();
  h.advance(); h.push(); expect(h.summary()?.sampleCount).toBe(2);
});
it('상한으로 누락된 대상은 확인 불가, 포함된 대상에도 제한을 전달', () => {
  const h = harness(); h.push([process], true); h.advance(); h.push([process], true);
  expect(h.summary()?.limited).toBe(true); expect(h.history.summary(456, process.start)).toBeNull();
});
it('오래된 값·수면/벽시계 불연속·코어 변경을 현재 연속 관측에 쓰지 않음', () => {
  const h = harness(); h.push(); h.advance(); h.push(); h.advance(90_001); expect(h.summary()).toBeNull();
  for (const [wall, mono] of [[120_000, 0], [-60_000, 60_000], [60_000, 0]]) {
    const c = harness(); c.push(); c.advance(); c.push(); c.clock(wall, mono); expect(c.summary()).toBeNull(); expect(c.history.stats().frames).toBe(0);
  }
  const c = harness(); c.push(); c.advance(); c.push([process], false, 8); expect(c.summary()).toBeNull();
});
it('한 시간/61회/512개 숫자 버퍼 상한을 지키고 만료/clear 때 해제', () => {
  const h = harness(), entries = Array.from({ length: 512 }, (_, i) => ({ ...process, pid: i + 1 }));
  for (let i = 0; i < 121; i++) { h.push(entries); if (i < 120) h.advance(); }
  expect(h.history.stats()).toEqual({ frames: 61, entries: 61 * 512, bufferBytes: 1_374_208 });
  h.advance(3_600_001); expect(h.history.stats().bufferBytes).toBe(0);
  h.push(entries); h.history.clear(); expect(h.history.stats().entries).toBe(0);
});
it('잘못된 값·범위 초과·중복은 예외를 누출하지 않고 원시 스키마에서 거절', () => {
  const frame: HistoryFrame = { entries: [process], truncated: false, coreCount: 10 };
  expect(historyFrameSchema.safeParse(frame).success).toBe(true);
  for (const change of [{ start: 'secret' }, { start: '18446744073709551616' }, { start: '0' },
    { memoryBytes: Number.MAX_SAFE_INTEGER + 1 }, { readBytes: -1 }, { cpuTimeMs: Infinity }]) {
    expect(historyFrameSchema.safeParse({ ...frame, entries: [{ ...process, ...change }] }).success).toBe(false);
  }
  expect(historyFrameSchema.safeParse({ ...frame, entries: [process, process] }).success).toBe(false);
  expect(historyFrameSchema.safeParse({ ...frame, entries: Array.from({ length: 513 }, (_, i) => ({ ...process, pid: i + 1 })) }).success).toBe(false);
});
