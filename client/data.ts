import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRpc } from '@getpaseo/plugin/client';
import { snapshotRpc, type Snapshot } from '../shared/contracts';

type Call = (input: { includeProcesses: boolean }) => Promise<Snapshot>;
// 설치별 번들 모듈 하나. pill/팝오버/대시보드가 동일 호스트의 in-flight를 공유한다.
export function createRequester(call: Call) {
  let flight: Promise<Snapshot> | undefined;
  let withProcesses = false;
  let cached: Snapshot | undefined;
  let cachedProcesses = false;
  let fetched = 0;
  const request = async (includeProcesses: boolean): Promise<Snapshot> => {
    if (flight) {
      const processesInFlight = withProcesses;
      const result = await flight;
      return includeProcesses && !processesInFlight ? request(true) : result;
    }
    if (cached && Date.now() - fetched < 700 && (!includeProcesses || cachedProcesses)) return cached;
    withProcesses = includeProcesses;
    flight = call({ includeProcesses }).then(result => { cached = result; cachedProcesses = includeProcesses; fetched = Date.now(); return result; });
    const current = flight;
    try { return await current; } finally { if (flight === current) flight = undefined; }
  };
  return Object.assign(request, { peek: () => cached });
}
let request: ReturnType<(typeof createRequester)> | undefined;
export function configureRequester(call: Call): () => void { const own = createRequester(call); request = own; return () => { if (request === own) request = undefined; }; }
export function requestSnapshot(includeProcesses: boolean, call?: Call): Promise<Snapshot> {
  if (!request) { if (!call) return Promise.reject(new Error('호스트 RPC 연결 없음')); request = createRequester(call); }
  return request(includeProcesses);
}
export function cachedSnapshot(): Snapshot | undefined { return request?.peek(); }
// Query 캐시가 다른 창에서 바뀌어도 이 화면은 자기 읽기 결과만 표시한다.
export function useStableQuery<T>(options: { queryKey: readonly unknown[]; queryFn: (signal: AbortSignal) => Promise<T>; enabled?: boolean; initialData?: T; refreshInterval?: number }) {
  const query = useQuery({ queryKey: options.queryKey, queryFn: ({ signal }) => options.queryFn(signal),
    retry: false, enabled: false, refetchOnWindowFocus: false, refetchOnReconnect: false });
  const [result, setResult] = useState<{ data?: T; error: Error | null; isFetching: boolean }>(() => ({ data: options.initialData, error: null, isFetching: false }));
  const generation = useRef(0);
  const refresh = query.refetch;
  const refetch = useCallback(async () => {
    const own = generation.current;
    setResult(previous => ({ ...previous, isFetching: true }));
    const next = await refresh({ cancelRefetch: false });
    if (own === generation.current) setResult(previous => next.isError
      ? { ...previous, error: next.error, isFetching: false }
      : { data: next.data, error: null, isFetching: false });
    return next;
  }, [refresh]);
  useEffect(() => {
    generation.current++;
    if (options.enabled === false) return () => { generation.current++; };
    void refetch();
    const timer = options.refreshInterval ? setInterval(() => void refetch(), options.refreshInterval) : undefined;
    return () => { generation.current++; clearInterval(timer); };
  }, [options.enabled, options.refreshInterval, refetch]);
  return { ...result, refetch };
}

function waitForSample(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(new Error('샘플 읽기 취소')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2200);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

export async function readAppSample(signal: AbortSignal, read: () => Promise<Snapshot>): Promise<Snapshot> {
  if (signal.aborted) throw new Error('샘플 읽기 취소');
  let sample = await read();
  // 앱 스캔을 막 켠 경우 첫 CPU 기준점 다음 샘플까지 최초 로딩만 기다린다.
  // RPC는 기존 측정값만 읽는다. 헬퍼의 고정 측정 간격을 바꾸지 않는다.
  for (let attempt = 0; attempt < 2 && (sample.processesStatus === 'off' || sample.processesStatus === 'warming') && sample.status !== 'error'; attempt++) {
    await waitForSample(signal);
    if (signal.aborted) throw new Error('샘플 읽기 취소');
    sample = await read();
  }
  return sample;
}

export function useSnapshot(enabled = true, initialData = cachedSnapshot()) {
  const rpc = useRpc(snapshotRpc);
  return useStableQuery({ queryKey: ['mac-monitor', 'snapshot'], queryFn: signal => readAppSample(signal, () => requestSnapshot(true, rpc)), enabled, refreshInterval: 2000, initialData: initialData && { ...initialData,
    processesStatus: initialData.processesStatus === 'ok' && !initialData.processes ? 'warming' : initialData.processesStatus } });
}
