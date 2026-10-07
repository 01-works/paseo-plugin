import type { PluginServerContext } from '@getpaseo/plugin/server';
import { hostInfoRpc, snapshotRpc, processListRpc, terminateRpc, terminateGroupRpc } from './shared/contracts';
import { getCollector, stopCollector } from './server/collector';
import { hostInfo } from './server/host-info';
import { automationReportRpc, automationConfigureRpc, automationTargetRpc, reviewConfirmRpc } from './shared/automation';
import { MemoryGuardian } from './server/automation/guardian';

export default function contribute(server: PluginServerContext) {
  const collector = getCollector();
  const guardian = new MemoryGuardian(collector, { log: message => console.log(message) });
  const ready = guardian.start();
  server.handle(snapshotRpc, ({ includeProcesses }) => ({ ...collector.snapshot(includeProcesses), automation: guardian.status() }));
  server.handle(hostInfoRpc, () => hostInfo(collector.mode));
  server.handle(processListRpc, ({ group }) => {
    const list = collector.processList(group);
    return { ...list, entries: list.entries.map(p => ({ ...p, autoAllowed: guardian.isAllowed(p) })) };
  });
  server.handle(terminateRpc, input => collector.terminate(input));
  server.handle(terminateGroupRpc, input => collector.terminateGroup(input));
  server.handle(automationReportRpc, async () => { await ready; return guardian.report(); });
  server.handle(automationConfigureRpc, async input => { await ready; return guardian.configure(input); });
  server.handle(automationTargetRpc, async input => { await ready; return guardian.target(input); });
  server.handle(reviewConfirmRpc, async input => { await ready; return guardian.confirm(input); });
  void collector.start();
  return async () => { await ready; await guardian.stop(); await stopCollector(); };
}
