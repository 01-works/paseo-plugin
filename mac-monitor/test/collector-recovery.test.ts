import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeSource } from '../server/helper-process';
import { raw } from './fixtures';

const mocks = vi.hoisted(() => ({
  pluginRoot: vi.fn(), buildLocal: vi.fn(), spawnSource: vi.fn(), nodeSample: vi.fn(),
}));
vi.mock('../server/host-info', () => ({ pluginRoot: mocks.pluginRoot }));
vi.mock('../server/helper-process', () => ({ buildLocal: mocks.buildLocal, spawnSource: mocks.spawnSource }));
vi.mock('../server/node-fallback', () => ({ nodeSample: mocks.nodeSample }));
import { Collector } from '../server/collector';

let collector: Collector;
let sources: { source: NativeSource; line: (line: string) => void; exit: (reason: string) => void }[];
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks(); sources = [];
  mocks.pluginRoot.mockResolvedValue('/old');
  mocks.buildLocal.mockRejectedValue(new Error('소스 경로 없음'));
  mocks.nodeSample.mockImplementation(async () => structuredClone(raw));
  mocks.spawnSource.mockImplementation((_file, _args, line, exit) => {
    const source = {
      child: { pid: 123 }, close: vi.fn().mockResolvedValue(undefined),
      setProcesses: vi.fn(), setInspection: vi.fn(), setHistory: vi.fn(),
      inspect: vi.fn(), terminate: vi.fn(),
    } as unknown as NativeSource;
    sources.push({ source, line, exit }); return source;
  });
  collector = new Collector({ platform: 'darwin', log: () => {} });
});
afterEach(async () => { await collector.stop(); vi.useRealTimers(); });
async function fallback() {
  await collector.start(); sources[0].exit('서명 오류');
  await vi.advanceTimersByTimeAsync(1000);
  expect(collector.mode).toBe('node');
}
function sample(index = sources.length - 1) {
  sources[index].line(JSON.stringify(raw));
  sources[index].line(JSON.stringify({ ...raw, seq: raw.seq + 1, sys: { ...raw.sys, cpu: { ...raw.sys.cpu!, user: raw.sys.cpu!.user + 1 } } }));
}

it('재시작 전에 설치 경로가 바뀌면 이전 경로 빌드 대신 새 prebuilt를 실행', async () => {
  await collector.start();
  sources[0].exit('이전 헬퍼 종료');
  mocks.pluginRoot.mockResolvedValue('/new');
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.buildLocal).not.toHaveBeenCalled();
  expect(mocks.spawnSource.mock.calls.map(call => call[0])).toEqual(['/old/bin/macmon-helper', '/new/bin/macmon-helper']);
  sample();
  expect(collector.snapshot().status).toBe('ok');
  expect(collector.mode).toBe('native');
});

it('정상 헬퍼 재시작 중 설정 읽기가 잠깐 실패하면 확인된 기존 경로를 재사용', async () => {
  await collector.start(); sample();
  sources[0].exit('헬퍼 종료');
  mocks.pluginRoot.mockRejectedValueOnce(new Error('설정 교체 중'));
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(2);
  expect(mocks.spawnSource.mock.calls[1][0]).toBe('/old/bin/macmon-helper');
  expect(mocks.nodeSample).not.toHaveBeenCalled();
  sample();
  expect(collector.snapshot()).toMatchObject({ helperMode: 'native', status: 'ok', errors: [] });
});

it('Node 폴백 뒤 설정 저장이 완료되면 새 경로에서 복구하고 Node 수집을 멈춤', async () => {
  await fallback();
  mocks.pluginRoot.mockResolvedValue('/new');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(2);
  sample();
  expect(collector.snapshot()).toMatchObject({ helperMode: 'native', status: 'ok', errors: [] });
  const calls = mocks.nodeSample.mock.calls.length;
  await vi.advanceTimersByTimeAsync(4000);
  expect(mocks.nodeSample).toHaveBeenCalledTimes(calls);
  expect(mocks.buildLocal).toHaveBeenCalledTimes(1);
});

it('같은 설치 경로의 실패는 반복 빌드하지 않고 Node 수집을 유지', async () => {
  await fallback();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(mocks.pluginRoot).toHaveBeenCalledTimes(5);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(1);
  expect(mocks.buildLocal).toHaveBeenCalledTimes(1);
  expect(collector.mode).toBe('node');
});

it('설정 읽기 실패 후에도 Node 수집을 유지하고 다음 확인에서 복구', async () => {
  mocks.pluginRoot.mockRejectedValue(new Error('설정 저장 중'));
  await collector.start();
  expect(collector.mode).toBe('node');
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.spawnSource).not.toHaveBeenCalled();
  expect(mocks.nodeSample.mock.calls.length).toBeGreaterThan(1);
  mocks.pluginRoot.mockResolvedValue('/new');
  await vi.advanceTimersByTimeAsync(30_000);
  sample();
  expect(collector.snapshot().status).toBe('ok');
});

it('복구 도중 설정 읽기가 실패해도 정상 Node 수집을 오류 상태로 바꾸지 않음', async () => {
  await fallback();
  let seq = 0;
  mocks.nodeSample.mockImplementation(async () => ({
    ...structuredClone(raw), seq: seq++, sys: { ...raw.sys, cpu: { ...raw.sys.cpu!, user: raw.sys.cpu!.user + seq } },
  }));
  mocks.pluginRoot.mockRejectedValue(new Error('일시적 읽기 실패'));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(collector.snapshot()).toMatchObject({ helperMode: 'node', status: 'ok', errors: [] });
});

it('늦게 완료된 Node 샘플을 버리고 수집 종료를 기다린 후 네이티브를 시작', async () => {
  await fallback();
  let finish!: (value: typeof raw) => void;
  mocks.nodeSample.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(2000);
  mocks.pluginRoot.mockResolvedValue('/new');
  await vi.advanceTimersByTimeAsync(28_000);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(1);
  finish({ ...raw, seq: 999 });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(2);
  expect(collector.snapshot().seq).not.toBe(999);
  sample();
  expect(collector.snapshot().status).toBe('ok');
});

it('종료 중 완료된 경로 조회가 자식이나 복구 타이머를 만들지 않음', async () => {
  await fallback();
  let finish!: (root: string) => void;
  mocks.pluginRoot.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(30_000);
  const stopped = collector.stop();
  finish('/new'); await stopped;
  await vi.advanceTimersByTimeAsync(90_000);
  expect(mocks.spawnSource).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
