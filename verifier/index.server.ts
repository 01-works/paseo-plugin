import type { PluginServerContext } from '@getpaseo/plugin/server';
import { createVerifierTool } from './server/agent-tool';
import { Collector, defaultConfig, run } from './server/collect';
import { createRepoMatcher } from './server/workspace-match';
import { statusRpc } from './shared/contracts';
import { verifierSettings, type VerifierSettings } from './shared/settings';
import { headline } from './shared/summary';

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(verifierSettings);
  let current: VerifierSettings = { sshTarget: '', checkout: '', agentTool: true };
  let collector = new Collector(defaultConfig());
  const apply = (state: Awaited<ReturnType<typeof settings.read>>) => {
    if (state.status !== 'ready') {
      console.error(`settings invalid: ${state.error}`);
      return;
    }
    current = state.values;
    const base = defaultConfig();
    // 설정이 비어 있으면 환경 변수·기본 위치를 쓴다.
    collector = new Collector({
      ...base,
      sshTarget: current.sshTarget.trim() || base.sshTarget,
      checkout: current.checkout.trim() || base.checkout,
    });
    console.log(`source: ${current.sshTarget.trim() || base.sshTarget ? `ssh ${current.sshTarget.trim() || base.sshTarget}` : 'local'}`);
  };
  void settings.read().then(apply, error => console.error(`settings read failed: ${error instanceof Error ? error.message : String(error)}`));
  const stopSettings = settings.subscribe(apply);

  let served = { local: false, github: false };
  let lastProblem = '';
  const read = async (input: { includeGithub: boolean; refresh?: boolean }) => {
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
  };
  server.handle(statusRpc, input => read(input));

  // 01-software 작업 디렉터리의 에이전트에게만 도구를 준다.
  const tool = createVerifierTool(includeGithub => read({ includeGithub }));
  const matches = createRepoMatcher(run);
  const stopHook = server.addHook('agent.open.before', async ({ request }) => {
    if (!current.agentTool) return;
    const slug = await collector.repoSlug().catch(() => null);
    if (!slug || !(await matches(request.cwd, slug))) return;
    return { ...request, tools: [...request.tools, tool] };
  });

  return () => {
    stopHook();
    stopSettings();
  };
}
