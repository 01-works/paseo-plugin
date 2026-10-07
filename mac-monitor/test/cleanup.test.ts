import { afterEach, expect, it, vi } from 'vitest';
import { Cleanup } from '../server/cleanup';
import { processKey, RESULT_TTL_MS, type Inspection, type ProcessMetadata } from '../shared/cleanup';
import { observed, metadata, history } from './cleanup-fixtures';
import type { Reviewer } from '../server/cleanup-reviewer';

const managers: Cleanup[] = [];
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function harness(review?: Reviewer) {
  let now = 0, listener: ((s: Inspection | null, t: number, issue?: string) => void) | undefined;
  const release = vi.fn(() => { listener = undefined; });
  const source = { observeInspection: vi.fn((fn: typeof listener) => { listener = fn; return release; }),
    processHistory: vi.fn((_pid: number, _start: string): import('../shared/history').HistorySummary | null => null),
    inspectProcess: vi.fn(async (_pid: number, _start: string) => ({ ...metadata })), terminateInspected: vi.fn(async (_pid: number, _start: string) => ({ sent: true })) };
  const reviewer = review ?? vi.fn<Reviewer>(async input => ({ decisions: input.items.map(p => ({ key: processKey(p), decision: 'candidate', reason: '테스트 잔여 실행 정황으로 선택 검토' })) }));
  const cleanup = new Cleanup(source, reviewer, { now: () => now }); managers.push(cleanup);
  const emit = (entries = [observed], issue?: string, ready = true) => { listener?.({ entries, truncated: false, ready }, history.sampledAt + now, issue); now += 2000; };
  const observe = async () => { for (let i = 0; i <= 6; i++) emit(); await flush(); };
  return { cleanup, source, reviewer, release, emit, observe, advance: (ms: number) => { now += ms; } };
}
afterEach(async () => { await Promise.all(managers.splice(0).map(c => c.stop())); vi.useRealTimers(); });

it('최신 이력은 추가 관찰을 생략하고 이력 부족은 기존 요청형 검사를 유지', async () => {
  for (const value of [history, null]) {
    const h = harness(); h.source.processHistory.mockReturnValue(value);
    const state = h.cleanup.start(); h.emit(); await flush();
    if (value) {
      expect(h.cleanup.get(state.id).phase).toBe('ready');
      expect(h.cleanup.get(state.id).observationSource).toBe('history');
      expect(h.cleanup.get(state.id).items[0]).toMatchObject({ observationSource: 'history', observedSeconds: history.observedSeconds,
        maxCpuPercent: history.maxMinuteCpuPercent, cpuPercent: observed.cpuPercent, readBytes: history.readBytes });
    } else {
      expect(h.reviewer).not.toHaveBeenCalled(); expect(h.cleanup.get(state.id).observationSource).toBe('live'); await h.observe();
    }
    expect(h.reviewer).toHaveBeenCalledOnce(); expect(h.cleanup.get(state.id).items[0].history).toEqual(value);
    expect(h.source.processHistory).toHaveBeenCalledWith(observed.pid, observed.start);
    expect(h.source.processHistory).toHaveBeenCalledTimes(value ? 1 : 2);
    expect(h.source.terminateInspected).not.toHaveBeenCalled();
  }
});

it('준비 안 된 빈 목록은 정상 완료로 해석하지 않고 현재 기준점을 기다림', async () => {
  const h = harness(); h.source.processHistory.mockReturnValue(history);
  const state = h.cleanup.start(); h.emit([], undefined, false); await flush();
  expect(h.cleanup.get(state.id).phase).toBe('observing'); expect(h.reviewer).not.toHaveBeenCalled();
  expect(h.source.processHistory).not.toHaveBeenCalled(); h.emit(); await flush();
  expect(h.cleanup.get(state.id).phase).toBe('ready'); expect(h.reviewer).toHaveBeenCalledOnce();
});
it('오래되거나 불연속으로 부족한 이력·현재 CPU 미확인은 추가 관찰로 보완', async () => {
  for (const value of [{ ...history, sampledAt: history.sampledAt - 90_001 }, { ...history, sampledAt: history.sampledAt + 1 },
    { ...history, sampleCount: 1 }, { ...history, observedSeconds: 20 }]) {
    const h = harness(); h.source.processHistory.mockReturnValue(value);
    const state = h.cleanup.start(); h.emit(); await flush();
    expect(h.cleanup.get(state.id).phase).toBe('observing'); expect(h.cleanup.get(state.id).observationSource).toBe('live');
    expect(h.reviewer).not.toHaveBeenCalled(); await h.observe(); expect(h.cleanup.get(state.id).items[0].observationSource).toBe('live');
  }
  const h = harness(); h.source.processHistory.mockReturnValue(history);
  const state = h.cleanup.start(); h.emit([{ ...observed, cpuPercent: null }]); await flush();
  expect(h.cleanup.get(state.id).phase).toBe('observing'); expect(h.reviewer).not.toHaveBeenCalled();
});
it('선택 범위 중 한 대상만 이력이 없어도 누락하지 않고 관찰 후 함께 검토', async () => {
  const h = harness(), second = { ...observed, pid: 124 };
  h.source.processHistory.mockImplementation(pid => pid === observed.pid ? history : null);
  h.source.inspectProcess.mockImplementation(async pid => ({ ...metadata, pid }));
  const state = h.cleanup.start(); h.emit([observed, second]); await flush(); expect(h.reviewer).not.toHaveBeenCalled();
  for (let i = 0; i < 6; i++) h.emit([observed, second]); await flush();
  expect(h.cleanup.get(state.id).items.map(p => p.pid)).toEqual([123, 124]);
  expect(h.cleanup.get(state.id).items.every(p => p.observationSource === 'live')).toBe(true);
});
it('이력으로 대기를 생략해도 실행 정보 변경·활동·보호·취소 검증을 유지', async () => {
  for (const change of [{ cpuPercent: 2 }, { protected: true }, { name: '바뀐 이름' }, { start: '1' }]) {
    const h = harness(); h.source.processHistory.mockReturnValue(history);
    h.source.inspectProcess.mockResolvedValue({ ...metadata, ...change });
    const state = h.cleanup.start(); h.emit(); await flush();
    expect(h.cleanup.get(state.id).items).toEqual([]); expect(h.reviewer).not.toHaveBeenCalled(); expect(h.source.terminateInspected).not.toHaveBeenCalled();
  }
  const h = harness(); h.source.processHistory.mockReturnValue(history); let done!: (m: ProcessMetadata) => void;
  h.source.inspectProcess.mockImplementation(() => new Promise(resolve => { done = resolve; }));
  const state = h.cleanup.start(); h.emit(); await flush(); h.cleanup.cancel(state.id); done(metadata); await flush();
  expect(h.cleanup.get(state.id).phase).toBe('cancelled'); expect(h.reviewer).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledOnce();
});

it('요청 때만 관찰·메타데이터·리뷰 1회, 모델 대기 전에 관찰 해제; 선택만으로 종료하지 않음', async () => {
  const h = harness(); expect(h.source.observeInspection).not.toHaveBeenCalled();
  const initial = h.cleanup.start(); expect(initial.phase).toBe('observing'); expect(h.reviewer).not.toHaveBeenCalled();
  h.source.inspectProcess.mockImplementation(async () => { expect(h.release).not.toHaveBeenCalled(); return metadata; });
  await h.observe(); const state = h.cleanup.get(initial.id);
  expect(state.phase).toBe('ready'); expect(state.items).toHaveLength(1); expect(h.release).toHaveBeenCalledOnce();
  expect(h.reviewer).toHaveBeenCalledOnce(); expect(h.source.terminateInspected).not.toHaveBeenCalled();
});
it('동시 검사와 검사 중 종료를 거절하고 취소 시 관찰을 해제', async () => {
  const h = harness(), state = h.cleanup.start(); expect(() => h.cleanup.start()).toThrow('진행 중');
  expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(false);
  expect(h.cleanup.cancel('other').cancelled).toBe(false); expect(h.cleanup.cancel(state.id).cancelled).toBe(true);
  await flush(); expect(h.release).toHaveBeenCalledOnce(); expect(h.reviewer).not.toHaveBeenCalled();
  expect(h.cleanup.get(state.id).phase).toBe('cancelled');
});
it('관찰 오류·시간 초과는 빈 정상 결과로 대체하지 않고 모델을 호출하지 않음', async () => {
  const h = harness(), state = h.cleanup.start(); h.emit([], '샘플 읽기 실패'); await flush();
  expect(h.cleanup.get(state.id).phase).toBe('error'); expect(h.reviewer).not.toHaveBeenCalled();
  vi.useFakeTimers(); const t = harness(), pending = t.cleanup.start(); await vi.advanceTimersByTimeAsync(22_001);
  expect(t.cleanup.get(pending.id).error).toContain('초과'); expect(t.release).toHaveBeenCalledOnce();
});
it('빈 후보는 모델을 호출하지 않고 메타데이터 조회 실패는 오류로 표시', async () => {
  const h = harness(), state = h.cleanup.start(); for (let i = 0; i <= 6; i++) h.emit([]); await flush();
  expect(h.cleanup.get(state.id).items).toEqual([]); expect(h.reviewer).not.toHaveBeenCalled();
  const bad = harness(); bad.source.inspectProcess.mockRejectedValue(new Error('읽기 실패')); const pending = bad.cleanup.start(); await bad.observe();
  expect(bad.cleanup.get(pending.id).phase).toBe('error'); expect(bad.reviewer).not.toHaveBeenCalled();
  for (const missing of [{ args: null }, { path: null }, { cpuPercent: null }]) {
    const partial = harness(); partial.source.inspectProcess.mockResolvedValue({ ...metadata, ...missing });
    const result = partial.cleanup.start(); await partial.observe();
    expect(partial.cleanup.get(result.id).phase).toBe('error'); expect(partial.reviewer).not.toHaveBeenCalled();
  }
});
it('모델이 알 수 없는 PID를 반환하면 결과를 거절', async () => {
  const h = harness(async () => ({ decisions: [{ key: '999:1', decision: 'candidate', reason: '종료' }] })), state = h.cleanup.start();
  await h.observe(); expect(h.cleanup.get(state.id).phase).toBe('error'); expect(h.source.terminateInspected).not.toHaveBeenCalled();
});
it('검사 결과의 후보만 명시 선택·최신 재확인 뒤 신호를 한 번 전송', async () => {
  const h = harness(), state = h.cleanup.start(); await h.observe();
  expect((await h.cleanup.terminate(state.id, [{ ...observed, start: '1' }])).results[0].sent).toBe(false);
  expect((await h.cleanup.terminate(state.id, [observed, observed])).results.every(p => !p.sent)).toBe(true);
  expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(true);
  expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(false);
  expect(h.source.terminateInspected).toHaveBeenCalledExactlyOnceWith(observed.pid, observed.start);
});
it('유지/판단 어려움·변경된 명령·CPU 활동·만료된 결과에는 신호를 보내지 않음', async () => {
  for (const decision of ['keep', 'uncertain'] as const) {
    const h = harness(async input => ({ decisions: input.items.map(p => ({ key: processKey(p), decision, reason: '근거 부족' })) }));
    const state = h.cleanup.start(); await h.observe(); expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(false);
  }
  for (const changed of [{ args: ['node', 'new.js'] }, { cpuPercent: 1 }, { start: '1' }]) {
    const h = harness(), state = h.cleanup.start(); await h.observe(); h.source.inspectProcess.mockResolvedValue({ ...metadata, ...changed });
    expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(false); expect(h.source.terminateInspected).not.toHaveBeenCalled();
  }
  const h = harness(), state = h.cleanup.start(); await h.observe(); h.advance(RESULT_TTL_MS + 1);
  expect((await h.cleanup.terminate(state.id, [observed])).results[0].sent).toBe(false); expect(h.cleanup.get(state.id).error).toContain('만료');
});
it('다중 선택 중 하나의 실행 정보가 바뀌면 모든 신호를 보내기 전에 거절', async () => {
  const h = harness();h.source.inspectProcess.mockImplementation(async pid => ({ ...metadata, pid }));
  const state=h.cleanup.start(), second={...observed,pid:124};
  for(let i=0;i<=6;i++)h.emit([observed,second]);await flush();
  h.source.inspectProcess.mockImplementation(async pid => ({ ...metadata,pid,...(pid===124?{args:['node','changed.js']}:{}) }));
  const result=await h.cleanup.terminate(state.id,[observed,second]);expect(result.results.every(p=>!p.sent)).toBe(true);
  expect(h.source.terminateInspected).not.toHaveBeenCalled();
});
it('모델 취소 뒤 실제 작업 완료까지 새 검사를 막고 stop은 자식 완료를 기다림', async () => {
  let done!: (value: { decisions: [] }) => void;
  const review = vi.fn<Reviewer>(() => new Promise(resolve => { done = resolve; })); const h = harness(review), state = h.cleanup.start();
  await h.observe(); expect(h.cleanup.get(state.id).phase).toBe('reviewing'); h.cleanup.cancel(state.id);
  expect(() => h.cleanup.start()).toThrow('진행 중'); let stopped = false; const stop = h.cleanup.stop().then(() => { stopped = true; });
  await flush(); expect(stopped).toBe(false); done({ decisions: [] }); await stop;
  expect(h.cleanup.get(state.id).phase).toBe('cancelled'); expect(() => h.cleanup.start()).toThrow('종료');
});
it('실행 정보 조회 중 취소하면 관찰을 해제하고 모델로 넘기지 않음', async () => {
  const h=harness();let done!:(m:ProcessMetadata)=>void;
  h.source.inspectProcess.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
  const state=h.cleanup.start();await h.observe();expect(h.source.inspectProcess).toHaveBeenCalledOnce();
  h.cleanup.cancel(state.id);done(metadata);await flush();expect(h.release).toHaveBeenCalledOnce();
  expect(h.reviewer).not.toHaveBeenCalled();expect(h.cleanup.get(state.id).items).toEqual([]);
});
it('종료 직전 취소나 결과 만료, 동시 요청에는 신호를 보내지 않음', async () => {
  for (const expire of [false, true]) {
    const h = harness(), state = h.cleanup.start(); await h.observe(); let done!: (m: ProcessMetadata) => void;
    h.source.inspectProcess.mockImplementation(() => new Promise(resolve => { done = resolve; }));
    const operation = h.cleanup.terminate(state.id, [observed]); await expect(h.cleanup.terminate(state.id, [observed])).rejects.toThrow('진행 중');
    if (expire) h.advance(RESULT_TTL_MS + 1); else h.cleanup.cancel(state.id); done(metadata);
    expect((await operation).results[0].sent).toBe(false); expect(h.source.terminateInspected).not.toHaveBeenCalled();
  }
});
