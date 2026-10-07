import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@getpaseo/plugin/client/react-native';
import type { PluginButtonIconProps, PluginButtonRegistration, PluginClientContext } from '@getpaseo/plugin/client';
import type { AgentDirectory } from './directory';
import type { BrowserViews } from './view-state';
import { AgentModal } from './modal';
import { createAgentNavigation, type AgentNavigation } from './navigation';
type Listener = () => void;
type Pill = { workspaceId: string; registration: PluginButtonRegistration; label: string };
export function contributePills(client: PluginClientContext, directory: AgentDirectory, views: BrowserViews, agentNavigation: AgentNavigation = createAgentNavigation(client)) {
  const pills = new Map<string, Pill>();
  let stopped = false;
  let counted: ReturnType<AgentDirectory['getSnapshot']>['agents'] | null = null;
  const counts = new Map<string, number>();
  const labelFor = (workspaceId: string) => {
    const snapshot = directory.getSnapshot();
    if (snapshot.error && !snapshot.loaded) return '에이전트 · 확인 불가';
    if (!snapshot.loaded) return '에이전트 …';
    if (snapshot.stale) return snapshot.error ? '에이전트 · 확인 불가' : '에이전트 · 연결 끊김';
    if (counted !== snapshot.agents) {
      counted = snapshot.agents; counts.clear();
      for (const agent of counted) if (agent.workspaceId && !agent.archived) {
        counts.set(agent.workspaceId, (counts.get(agent.workspaceId) ?? 0) + 1);
      }
    }
    const total = counts.get(workspaceId) ?? 0;
    if (snapshot.partial) return '에이전트 ' + total + ' · 일부';
    return '에이전트 ' + total;
  };
  const register = (id: string, workspaceId: string) => {
    const old = pills.get(id);
    if (old?.workspaceId === workspaceId) return;
    old?.registration.remove();
    let open = false;
    const listeners = new Set<Listener>();
    const getOpen = () => open;
    const setOpen = (value: boolean) => { open = value; for (const listener of listeners) listener(); };
    const subscribe = (listener: Listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
    function AgentIcon(props: PluginButtonIconProps) {
      const opened = useSyncExternalStore(subscribe, getOpen);
      useEffect(() => {
        const pill = pills.get(id); if (!pill) return;
        const unwatch = directory.watch();
        const update = () => {
          const label = labelFor(workspaceId);
          if (label !== pill.label) { pill.label = label; pill.registration.update({ label }); }
        };
        update(); const unsubscribe = directory.subscribe(update);
        return () => { unsubscribe(); unwatch(); };
      }, []);
      const openLarge = () => {
        const store = views.forAgent(props.host.id, workspaceId, id);
        store.set({ message: null });
        try {
          if (props.layout.compact) {
            agentNavigation.open({ serverId: props.host.id, workspaceId, agentId: id, targetId: null });
          } else client.openPanel('graph', { workspaceId, agentId: id, location: 'workspace' });
          setOpen(false);
        }
        catch { store.set({ message: '큰 보기를 열지 못했습니다. 현재 창에서 계속 볼 수 있습니다.' }); }
      };
      const navigate = (targetId: string) => {
        const target = directory.getSnapshot().agents.find(agent => agent.id === targetId && agent.workspaceId === workspaceId && !agent.archived);
        if (!target) throw new Error('에이전트 확인 불가');
        agentNavigation.open({ serverId: props.host.id, workspaceId, agentId: id, targetId });
        setOpen(false);
      };
      return <>
        <Icon name="List" size={props.size} color={props.color} />
        {opened ? <AgentModal {...props} agentId={id} workspaceId={workspaceId} directory={directory} views={views}
          open onOpenChange={setOpen} onLarge={openLarge} onNavigate={navigate} /> : null}
      </>;
    }
    const registration = client.addComposerPill({ id: 'graph', workspaceId, agentId: id,
      button: { title: '에이전트', label: '에이전트 …', icon: AgentIcon, behavior: { kind: 'action', onPress: () => setOpen(true) } } });
    pills.set(id, { workspaceId, registration, label: '에이전트 …' });
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
