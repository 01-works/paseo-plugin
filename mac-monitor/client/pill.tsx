import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, View } from 'react-native';
import { Modal } from '@getpaseo/plugin/client/react-native';
import type { PluginClientContext, PluginButtonIconProps, PluginButtonRegistration } from '@getpaseo/plugin/client';
import { emptySnapshot } from '../shared/compute';
import type { Snapshot } from '../shared/contracts';
import { MonitorContent, pressureColor } from './popover';
import { pillLabel, pressureLabels } from './format';
import { requestSnapshot } from './data';

type Pill = { workspaceId: string; registration: PluginButtonRegistration; mounts: number; label: string };
export function contributePills(client: PluginClientContext) {
  const pills = new Map<string, Pill>();
  const listeners = new Set<() => void>();
  const lifetime = new AbortController();
  let stopped = false, fetching = false, snapshot: Snapshot | null = null;
  let timer: ReturnType<(typeof setInterval)> | undefined;
  const broadcast = () => { for (const listener of listeners) listener(); };
  const update = () => {
    for (const pill of pills.values()) {
      if (!pill.mounts) continue;
      const label = pillLabel(snapshot);
      if (label !== pill.label) { pill.label = label; pill.registration.update({ label }); }
    }
    broadcast();
  };
  const refresh = async () => {
    if (stopped || fetching || ![...pills.values()].some(p => p.mounts > 0)) return;
    fetching = true;
    try { const next = await requestSnapshot(false); if (!stopped) snapshot = next; }
    catch (error) { if (!stopped) snapshot = { ...(snapshot ?? emptySnapshot('native')), status: 'error', errors: [String(error)] }; }
    finally { fetching = false; if (!stopped) update(); }
  };
  const visibility = () => {
    const visible = [...pills.values()].some(p => p.mounts > 0);
    if (visible && !timer && !stopped) { void refresh(); timer = setInterval(() => void refresh(), 2000); }
    if (!visible && timer) { clearInterval(timer); timer = undefined; }
  };
  const register = (agent: { id: string; workspaceId?: string | null }) => {
    if (stopped) return;
    const old = pills.get(agent.id);
    if (old && old.workspaceId === agent.workspaceId) return;
    old?.registration.remove(); pills.delete(agent.id);
    if (!agent.workspaceId) { visibility(); return; }
    // 라벨 갱신과 독립적인 상태: update({label})가 열린 상세를 닫지 않는다.
    let open = false;
    const dialogListeners = new Set<() => void>();
    const setOpen = (value: boolean) => { open = value; for (const listener of dialogListeners) listener(); };
    function PressureDot(props: PluginButtonIconProps) {
      const { theme, size } = props;
      const value = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => snapshot);
      const opened = useSyncExternalStore(listener => { dialogListeners.add(listener); return () => { dialogListeners.delete(listener); }; }, () => open);
      useEffect(() => {
        const pill = pills.get(agent.id); if (!pill) return;
        pill.mounts++; update(); visibility();
        return () => { pill.mounts = Math.max(0, pill.mounts - 1); visibility(); };
      }, []);
      return <>
        <View accessibilityLabel={`메모리 압력 ${value ? pressureLabels[value.pressure] : '확인 불가'}`} style={{ width: Math.max(6, size / 2), height: Math.max(6, size / 2), borderRadius: size, backgroundColor: pressureColor(value, theme) }} />
        {opened ? <Pressable accessible={false} focusable={false} onPress={event => event.stopPropagation()}>
          {/* 웹 portal의 클릭도 React 부모 pill로 버블링한다. action 재실행은 아이콘/모달을 remount한다. */}
          <Modal title="모니터" open onOpenChange={setOpen}>
            <Modal.Content><MonitorContent {...props} initialSnapshot={value} /></Modal.Content>
          </Modal>
        </Pressable> : null}
      </>;
    }
    const label = pillLabel(snapshot);
    const registration = client.addComposerPill({ id: 'monitor', workspaceId: agent.workspaceId, agentId: agent.id,
      button: { title: '모니터', label, icon: PressureDot, behavior: { kind: 'action', onPress: () => setOpen(true) } } });
    pills.set(agent.id, { workspaceId: agent.workspaceId, registration, mounts: 0, label });
  };
  const remove = (id: string) => { pills.get(id)?.registration.remove(); pills.delete(id); visibility(); };
  void client.paseo.agents.list({ subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (stopped) return;
    subscription?.subscribe({
      snapshot: ({ entries }) => {
        const ids = new Set(entries.map(({ agent }) => agent.id));
        for (const id of pills.keys()) if (!ids.has(id)) remove(id);
        for (const { agent } of entries) register(agent);
      },
      update: message => {
        if (message.type !== 'agent_update') return;
        const value = message.payload;
        if (value.kind === 'remove') remove(value.agentId); else register(value.agent);
      },
    });
  }).catch(error => { if (!stopped) console.error('mac-monitor 에이전트 구독 실패', error); });
  return () => { stopped = true; lifetime.abort(); clearInterval(timer); for (const pill of pills.values()) pill.registration.remove(); pills.clear(); listeners.clear(); };
}
