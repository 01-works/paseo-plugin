import type { PluginServerContext } from '@getpaseo/plugin/server';
import { Collector } from './server/collect';
import { statusRpc } from './shared/contracts';
import { headline } from './shared/summary';

export default function contribute(server: PluginServerContext) {
  const collector = new Collector();
  let served = { local: false, github: false };
  let lastProblem = '';
  server.handle(statusRpc, async input => {
    const status = await collector.status(input);
    // 첫 응답과 바뀐 읽기 문제만 남겨 `paseo plugin logs verifier`로 확인한다.
    const kind = input.includeGithub ? 'github' : 'local';
    if (!served[kind]) {
      served = { ...served, [kind]: true };
      console.log(`first ${kind} status served: ${headline(status).label}`);
    }
    const problem = [...status.errors, status.githubError].filter(Boolean).join('; ');
    if (problem !== lastProblem) {
      lastProblem = problem;
      if (problem) console.error(`read problem: ${problem}`);
      else console.log('read problems cleared');
    }
    return status;
  });
  return () => {};
}
