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
  return request;
}
let request: ReturnType<(typeof createRequester)> | undefined;
export function configureRequester(call: Call): () => void { const own = createRequester(call); request = own; return () => { if (request === own) request = undefined; }; }
export function requestSnapshot(includeProcesses: boolean, call?: Call): Promise<Snapshot> {
  if (!request) { if (!call) return Promise.reject(new Error('호스트 RPC 연결 없음')); request = createRequester(call); }
  return request(includeProcesses);
}
export function useSnapshot(enabled = true) {
  const rpc = useRpc(snapshotRpc);
  return useQuery({ queryKey: ['mac-monitor', 'snapshot'], queryFn: () => requestSnapshot(true, rpc), refetchInterval: 2000, staleTime: 700, retry: false, enabled });
}
