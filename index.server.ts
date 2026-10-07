import type { PluginServerContext } from '@getpaseo/plugin/server';
import { hostInfoRpc, snapshotRpc, processListRpc, terminateRpc, terminateGroupRpc } from './shared/contracts';
import { getCollector, stopCollector } from './server/collector';
import { hostInfo } from './server/host-info';
import { cleanupStartRpc, cleanupGetRpc, cleanupCancelRpc, cleanupTerminateRpc } from './shared/cleanup';
import { Cleanup } from './server/cleanup';

export default function contribute(server: PluginServerContext) {
  const collector = getCollector();
  const cleanup = new Cleanup(collector);
  server.handle(snapshotRpc, ({ includeProcesses }) => collector.snapshot(includeProcesses));
  server.handle(hostInfoRpc, () => hostInfo(collector.mode));
  server.handle(processListRpc, ({ group }) => collector.processList(group));
  server.handle(terminateRpc, input => collector.terminate(input));
  server.handle(terminateGroupRpc, input => collector.terminateGroup(input));
  server.handle(cleanupStartRpc, () => cleanup.start());
  server.handle(cleanupGetRpc, ({ id }) => cleanup.get(id));
  server.handle(cleanupCancelRpc, ({ id }) => cleanup.cancel(id));
  server.handle(cleanupTerminateRpc, ({ id, targets }) => cleanup.terminate(id, targets));
  void collector.start();
  return async () => {
    // 먼저 검사를 취소한다. 헬퍼를 함께 닫아 대기 중인 실행 정보 응답도 즉시 해제한다.
    const stoppingCleanup = cleanup.stop();
    await stopCollector();
    await stoppingCleanup;
  };
}
