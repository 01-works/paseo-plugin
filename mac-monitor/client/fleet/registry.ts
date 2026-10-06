// 문서화되지 않은 동일 JS realm 동작은 이 파일에만 격리한다.
import { requestSnapshot } from '../data';
import type { PluginClientContext } from '@getpaseo/plugin/client';
import { hostInfoRpc, snapshotRpc, type HostInfo, type Snapshot } from '../../shared/contracts';
export type FleetEntry = { serverId?: string; info: HostInfo; rpc: PluginClientContext['rpc']; registeredAt: number; pluginVersion: string; pending?: Promise<Snapshot> };
type Registry = { v: 1; hosts: Map<string, FleetEntry> };
type FleetGlobal = typeof globalThis & { __pasoMacMonitor?: Registry };
export function registryEntries(): FleetEntry[] {
  try { const value = (globalThis as FleetGlobal).__pasoMacMonitor; return value?.v === 1 && value.hosts instanceof Map ? [...value.hosts.values()] : []; } catch { return []; }
}
export function registerFleet(client: PluginClientContext): () => void {
  let stopped = false, entry: FleetEntry | undefined, key = '', registry: Registry | undefined;
  void client.rpc(hostInfoRpc, {}).then(info => {
    if (stopped) return;
    try {
      const root = globalThis as FleetGlobal;
      if (root.__pasoMacMonitor && root.__pasoMacMonitor.v !== 1) return;
      registry = root.__pasoMacMonitor ??= { v: 1, hosts: new Map() };
      if (!(registry.hosts instanceof Map)) return;
      key = info.serverId ?? `hostname:${info.hostname}`;
      const rpc = ((contract, input) => contract.name === snapshotRpc.name
        ? requestSnapshot((input as { includeProcesses: boolean }).includeProcesses)
        : client.rpc(contract, input)) as PluginClientContext['rpc'];
      entry = { serverId: info.serverId, info, rpc, registeredAt: Date.now(), pluginVersion: info.version };
      registry.hosts.set(key, entry);
    } catch { /* realm/레지스트리 접근 실패: 공식 호스트 선택기 모드 */ }
  }).catch(() => {});
  return () => { stopped = true; if (entry && registry?.hosts.get(key) === entry) registry.hosts.delete(key); };
}
export async function fleetSnapshot(entry: FleetEntry, includeProcesses: boolean): Promise<Snapshot> {
  // 타임아웃 후에도 실제 RPC 종료 전까지 single-flight를 유지한다.
  const current = entry.pending ??= entry.rpc(snapshotRpc, { includeProcesses });
  current.finally(() => { if (entry.pending === current) entry.pending = undefined; }).catch(() => {});
  let timer: ReturnType<(typeof setTimeout)> | undefined;
  try {
    return await Promise.race([current, new Promise<Snapshot>((_, reject) => { timer = setTimeout(() => reject(new Error('호스트 응답 3초 초과')), 3000); })]);
  } finally { clearTimeout(timer); }
}
