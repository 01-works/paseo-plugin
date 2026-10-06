import { afterEach, expect, it, vi } from 'vitest';
import type { PluginClientContext } from '@getpaseo/plugin/client';
import { registerFleet, registryEntries, fleetSnapshot, type FleetEntry } from '../client/fleet/registry';
import { emptySnapshot } from '../shared/compute';
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: () => vi.fn() }));
const global = globalThis as typeof globalThis & { __pasoMacMonitor?: unknown };
const info = { hostname: '검증 Mac', serverId: '검증 호스트', platform: 'darwin', helperMode: 'native' as const, version: '0.1.0' };
afterEach(() => { delete global.__pasoMacMonitor; vi.useRealTimers(); });
it('알 수 없는 레지스트리 버전은 건드리지 않고 공식 모드로 폴백', async () => {
  global.__pasoMacMonitor = { v: 2, hosts: new Map() };
  const cleanup = registerFleet({ rpc: vi.fn(async () => info) } as unknown as PluginClientContext);
  await Promise.resolve();expect(registryEntries()).toEqual([]);cleanup();
  expect(global.__pasoMacMonitor).toMatchObject({ v: 2 });
});
it('늦은 RPC 응답은 cleanup 뒤 등록하지 않고, 새 등록은 이전 cleanup으로 제거되지 않음', async () => {
  let resolve!: (value: typeof info) => void;
  const pending = new Promise<typeof info>(r => { resolve = r; });
  const cleanup = registerFleet({ rpc: vi.fn(() => pending) } as unknown as PluginClientContext);
  cleanup();resolve(info);await Promise.resolve();expect(registryEntries()).toEqual([]);
  const client = { rpc: vi.fn(async () => info) } as unknown as PluginClientContext;
  const old = registerFleet(client);await Promise.resolve();const current = registerFleet(client);await Promise.resolve();
  old();expect(registryEntries()).toHaveLength(1);current();expect(registryEntries()).toHaveLength(0);
});
it('3초 타임아웃 뒤에도 기존 RPC가 끝날 때까지 single-flight', async () => {
  vi.useFakeTimers();let resolve!: (value: ReturnType<typeof emptySnapshot>) => void;
  const rpc = vi.fn(() => new Promise<ReturnType<typeof emptySnapshot>>(r => { resolve = r; }));
  const entry: FleetEntry = { info, serverId: info.serverId, registeredAt: 0, pluginVersion: info.version, rpc: rpc as PluginClientContext['rpc'] };
  const first = expect(fleetSnapshot(entry,false)).rejects.toThrow('3초');await vi.advanceTimersByTimeAsync(3000);await first;
  const second = expect(fleetSnapshot(entry,false)).rejects.toThrow('3초');await vi.advanceTimersByTimeAsync(3000);await second;
  expect(rpc).toHaveBeenCalledTimes(1);resolve(emptySnapshot('native'));await Promise.resolve();await Promise.resolve();
  const third = fleetSnapshot(entry,false);expect(rpc).toHaveBeenCalledTimes(2);resolve(emptySnapshot('native'));await third;
});
