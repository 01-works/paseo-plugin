import type { Exec } from './exec';

/** 에이전트 작업 디렉터리가 같은 GitHub 저장소의 clone·worktree인지 본다. 디렉터리별로 기억한다. */
export function createRepoMatcher(exec: Exec) {
  const cache = new Map<string, string | null>();
  return async (cwd: string, slug: string): Promise<boolean> => {
    if (!cache.has(cwd)) {
      const result = await exec('git', ['-C', cwd, 'remote', 'get-url', 'origin'], 3_000);
      cache.set(cwd, result.code === 0 ? (/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?\s*$/.exec(result.stdout)?.[1] ?? null) : null);
    }
    return cache.get(cwd)?.toLowerCase() === slug.toLowerCase();
  };
}
