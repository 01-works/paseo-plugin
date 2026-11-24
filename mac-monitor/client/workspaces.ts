import { useEffect, useState } from 'react';
import { getPaseoClient } from '@getpaseo/plugin/client';

export type WorkspaceInfo = { id: string; directory: string; name: string; pr: number | null; git: boolean };
const REFRESH = 60_000;

// 폴더가 겹치면 더 깊은 workspace가 이긴다. /private/tmp처럼 git이 아닌 폴더 workspace는 안에 남의 작업이 섞이므로 같은 폴더일 때만 맞춘다.
export function findWorkspace(workspaces: readonly WorkspaceInfo[], directory: string | null): WorkspaceInfo | null {
  if (!directory) return null;
  let best: WorkspaceInfo | null = null;
  for (const item of workspaces) {
    if (directory !== item.directory && !(item.git && directory.startsWith(`${item.directory}/`))) continue;
    if (!best || item.directory.length > best.directory.length) best = item;
  }
  return best;
}

export function useWorkspaces(serverId: string): WorkspaceInfo[] {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  useEffect(() => {
    let stopped = false;
    setWorkspaces([]);
    const load = async () => {
      try {
        const { entries } = await getPaseoClient(serverId).workspaces.list({ includeBackground: true, page: { limit: 200 } });
        if (!stopped) setWorkspaces(entries.flatMap(entry => entry.workspaceDirectory && entry.workspaceDirectory !== '/'
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
