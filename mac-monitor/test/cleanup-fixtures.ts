import type { CleanupItem, ObservedProcess, ProcessMetadata } from '../shared/cleanup';
import type { HistorySummary } from '../shared/history';
export const history: HistorySummary = { sampledAt: 1_790_000_000_000, observedSeconds: 1200, sampleCount: 21,
  averageCpuPercent: 0.01, maxMinuteCpuPercent: 0.1, memoryDeltaBytes: 1024 ** 2, peakMemoryBytes: 256 * 1024 ** 2,
  readBytes: 1024, writtenBytes: 2048, limited: false };

export const observed: ObservedProcess = { pid: 123, start: '90071992547409999', name: 'node', group: 'node',
  ageSeconds: 7200, parentPid: 1, memoryBytes: 256 * 1024 ** 2, cpuPercent: 0.01, readBytes: 1000, writtenBytes: 2000 };
export const metadata: ProcessMetadata = { pid: observed.pid, start: observed.start, name: observed.name, group: observed.group,
  path: '/opt/homebrew/bin/node', args: ['node', '/tmp/completed-test/server.js'], cwd: '/tmp/completed-test',
  parentPid: 1, parentName: 'launchd', protected: false, issues: [], cpuPercent: 0.01 };
export const item: CleanupItem = { ...observed, observedSeconds: 12, maxCpuPercent: 0.01, readBytes: 0, writtenBytes: 0,
  command: 'node /tmp/completed-test/server.js', cwd: metadata.cwd, parentName: metadata.parentName, decision: 'uncertain', reason: '' };
