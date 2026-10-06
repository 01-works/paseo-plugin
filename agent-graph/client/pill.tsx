import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from '@getpaseo/plugin/client';
import { agentKey } from '../shared/types';
import { countForest, scopeForest } from '../shared/forest';
import type { AgentDirectory } from './directory';
import type { GraphViews } from './view-state';
import { GraphModal } from './modal';
type Listener = () => void;
type Pill = { workspaceId: string; registration: PluginButtonRegistration; mounts: number; label: string };
export function contributePills(client: PluginClientContext, directory: AgentDirectory, views: GraphViews) {
  const pills = new Map<string, Pill>();
  let stopped = false;
  const labelFor = (id: string, workspaceId: string, compact = false) => {
    const snapshot = directory.getSnapshot();
    if (snapshot.error && !snapshot.loaded) return '구조 · 확인 불가';
    if (!snapshot.loaded) return '구조 …';
    if (snapshot.stale) return snapshot.error ? '구조 · 확인 불가' : '구조 · 연결 끊김';
    const count = countForest(scopeForest(directory.getForest(), agentKey(directory.hostId, id), workspaceId, 'group'));
    if (snapshot.partial || !count.total) return '구조 ' + (count.total || '…') + ' · 일부';
    return compact || count.total >= 100 ? '구조 ' + count.total : '구조 ' + count.total + ' · 실행 ' + count.running;
  };
  const register = (id: string, workspaceId: string) => {
    const old = pills.get(id);
    if (old?.workspaceId === workspaceId) return;
    old?.registration.remove();
    let open = false, compact = false;
    const listeners = new Set<Listener>();
    const getOpen = () => open;
    const setOpen = (value: boolean) => { open = value; for (const listener of listeners) listener(); };
    const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
    function GraphIcon(props: PluginButtonIconProps) {
      const opened = useSyncExternalStore(subscribe, getOpen);
      useEffect(() => {
        const pill = pills.get(id); if (!pill) return;
        pill.mounts++; compact = props.layout.compact;
        const unwatch = directory.watch();
        const update = () => {
          const label = labelFor(id, workspaceId, compact);
          if (label !== pill.label) { pill.label = label; pill.registration.update({ label }); }
        };
        update(); const unsubscribe = directory.subscribe(update);
        return () => { pill.mounts--; unsubscribe(); unwatch(); };
      }, [props.layout.compact]);
      const openLarge = () => {
        try { client.openPanel('graph', { workspaceId, agentId: id, location: 'workspace' }); setOpen(false); }
        catch { views.forAgent(props.host.id, workspaceId, id).set({ message: '큰 보기를 열지 못했습니다. 현재 창에서 계속 볼 수 있습니다.' }); }
      };
      return <>
        <Icon name="GitFork" size={props.size} color={props.color} />
        {opened ? <GraphModal {...props} agentId={id} workspaceId={workspaceId} directory={directory} views={views}
          open onOpenChange={setOpen} onLarge={openLarge} /> : null}
      </>;
    }
    const registration = client.addComposerPill({ id: 'graph', workspaceId, agentId: id,
      button: { title: '에이전트 구조', label: '구조 …', icon: GraphIcon, behavior: { kind: 'action', onPress: () => setOpen(true) } } });
    pills.set(id, { workspaceId, registration, mounts: 0, label: '구조 …' });
  };
  const sync = () => {
    if (stopped) return;
    const agents = directory.getSnapshot().agents;
    // 복구 페이지를 읽는 동안 아직 들어오지 않은 기존 pill을 먼저 제거하지 않는다.
    if (!directory.getSnapshot().loading) {
      const ids = new Set(agents.filter(a => a.workspaceId && !a.archived).map(a => a.id));
      for (const [id, pill] of pills) if (!ids.has(id)) { pill.registration.remove(); pills.delete(id); }
    }
    for (const agent of agents) if (agent.workspaceId && !agent.archived) register(agent.id, agent.workspaceId);
  };
  const unsubscribe = directory.subscribe(sync); sync();
  return () => { stopped = true; unsubscribe(); for (const pill of pills.values()) pill.registration.remove(); pills.clear(); };
}
