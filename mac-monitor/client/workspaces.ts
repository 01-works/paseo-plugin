import { useEffect, useState } from 'react';
import { getPaseoClient } from '@getpaseo/plugin/client';

export type WorkspaceInfo = { id: string; directory: string; name: string; pr: number | null; git: boolean };
const REFRESH = 60_000;
const MAX_PAGES = 10;

// 폴더가 겹치면 더 깊은 workspace가 이긴다. 같은 폴더의 workspace가 여럿이면 어느 것인지 알 수 없어 맞추지 않는다. /private/tmp처럼 git이 아닌 폴더 workspace는 안에 남의 작업이 섞이므로 같은 폴더일 때만 맞춘다.
export function findWorkspace(workspaces: readonly WorkspaceInfo[], directory: string | null): WorkspaceInfo | null {
  if (!directory) return null;
  let best: WorkspaceInfo | null = null, tied = false;
  for (const item of workspaces) {
    if (directory !== item.directory && !(item.git && directory.startsWith(`${item.directory}/`))) continue;
    if (!best || item.directory.length > best.directory.length) { best = item; tied = false; }
    else if (item.directory === best.directory) tied = true;
  }
  return tied ? null : best;
}

export function useWorkspaces(serverId: string): WorkspaceInfo[] {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  useEffect(() => {
    let stopped = false, latest = 0;
    setWorkspaces([]);
    const load = async () => {
      const own = ++latest;
      try {
        const entries: Awaited<ReturnType<ReturnType<typeof getPaseoClient>['workspaces']['list']>>['entries'] = [];
        let cursor: string | undefined;
        // 일부만 읽으면 빠진 하위 workspace 대신 상위 workspace가 맞을 수 있어 끝까지 읽는다.
        for (let page = 0; ; page++) {
          if (page === MAX_PAGES) throw new Error('workspace 목록이 너무 큼');
          const result = await getPaseoClient(serverId).workspaces.list({ includeBackground: true, page: { limit: 200, ...(cursor ? { cursor } : {}) } });
          if (stopped || own !== latest) return;
          entries.push(...result.entries);
          if (!result.pageInfo?.hasMore || !result.pageInfo.nextCursor) break;
          cursor = result.pageInfo.nextCursor;
        }
        setWorkspaces(entries.flatMap(entry => entry.workspaceDirectory && entry.workspaceDirectory !== '/'
          ? [{ id: entry.id, directory: entry.workspaceDirectory, name: entry.title || entry.name, pr: entry.githubRuntime?.pullRequest?.number ?? null,
            git: entry.projectKind === 'git' && entry.workspaceKind !== 'directory' }] : []));
      } catch { /* 마지막 목록을 유지하고, 없으면 작업 ID로 표시한다. */ }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH);
    return () => { stopped = true; clearInterval(timer); };
  }, [serverId]);
  return workspaces;
}
