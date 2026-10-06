import type { PluginServerContext } from '@getpaseo/plugin/server';
import { hostInfoRpc, snapshotRpc, settings, processListRpc, terminateRpc, terminateGroupRpc } from './shared/contracts';
import { getCollector, stopCollector } from './server/collector';
import { hostInfo } from './server/host-info';

export default function contribute(server: PluginServerContext) {
  server.registerSettings(settings);
  const collector = getCollector();
  server.handle(snapshotRpc, ({ includeProcesses }) => collector.snapshot(includeProcesses));
  server.handle(hostInfoRpc, () => hostInfo(collector.mode));
  server.handle(processListRpc, ({ group }) => collector.processList(group));
  server.handle(terminateRpc, input => collector.terminate(input));
  server.handle(terminateGroupRpc, input => collector.terminateGroup(input));
  void collector.start();
  return stopCollector;
}
