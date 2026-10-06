import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { PluginClientContext, PluginButtonRegistration, PluginButton, PluginButtonIconProps } from '@getpaseo/plugin/client';
import { Modal } from '@getpaseo/plugin/client/react-native';
import { emptySnapshot } from '../shared/compute';
import { computeMemory } from '../shared/compute';
import { raw } from './fixtures';

vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable' }));
vi.mock('../client/popover', () => ({ MonitorContent: () => '상세', pressureColor: () => 'theme-color' }));
vi.mock('@getpaseo/plugin/client/react-native', async () => {
  const { createElement } = await import('react');
  return { Modal: Object.assign((props: { children: React.ReactNode }) => createElement('Modal', props, props.children), {
    Content: (props: { children: React.ReactNode }) => createElement('ModalContent', props, props.children),
  }) };
});
vi.mock('@getpaseo/plugin/client', () => ({ useRpc: () => vi.fn() }));
import { configureRequester, createRequester } from '../client/data';
import { contributePills } from '../client/pill';
import { MonitorContent } from '../client/popover';
import { displaySnapshot } from '../client/format';

const sample = { ...emptySnapshot('native'), status: 'ok' as const, seq: 1, sampledAt: Date.now(), cpu: { total: 20, user: 10, system: 10 }, memory: computeMemory(raw.sys), pressure: 'warning' as const };
let renderers: ReactTestRenderer[] = [];
let cleanups: (() => void)[] = [];
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { for (const r of renderers.splice(0)) await act(async () => r.unmount()); for (const cleanup of cleanups.splice(0)) cleanup();vi.useRealTimers(); });
describe('클라이언트 공유 요청 및 표시 수명주기', () => {
  it('동시 100개는 RPC 하나, detail 요청은 순서대로 실행', async () => {
    let resolve!: (value: typeof sample) => void;
    const call = vi.fn(() => new Promise<typeof sample>(r => { resolve = r; }));
    const request = createRequester(call);
    const results = Array.from({ length: 100 }, () => request(false));
    const detail = request(true);
    expect(call).toHaveBeenCalledTimes(1);resolve(sample);await Promise.all(results);await Promise.resolve();
    expect(call).toHaveBeenCalledTimes(2);expect(call.mock.calls[1]).toEqual([{ includeProcesses: true }]);resolve(sample);await detail;
  });
  it('보이는 pill 3개는 공유 타이머 하나; 숨기면 RPC 중단; 같은 라벨 update 없음', async () => {
    vi.useFakeTimers();
    const rpc = vi.fn(async () => sample);cleanups.push(configureRequester(rpc));
    const buttons = new Map<string, { button: PluginButton; registration: PluginButtonRegistration }>();
    const subscription = { subscribe: vi.fn() };
    const client = { paseo: { agents: { list: vi.fn(async () => ({ subscription })) } }, addComposerPill: vi.fn(({ agentId, button }) => {
      const registration = { update: vi.fn(), remove: vi.fn() };buttons.set(agentId, { button, registration });return registration;
    }) } as unknown as PluginClientContext;
    cleanups.push(contributePills(client));await Promise.resolve();
    const callbacks = subscription.subscribe.mock.calls[0][0];
    callbacks.snapshot({ entries: ['a','b','c'].map(id => ({ agent: { id, workspaceId: 'w' } })) });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });expect(rpc).toHaveBeenCalledTimes(0);
    const props = { theme: { colors: {} }, layout: { compact: false, platform: 'web' }, host: { id: 'host', label: '호스트' }, size: 12 } as PluginButtonIconProps;
    await act(async () => {
      for (const { button } of buttons.values()) { const Icon = button.icon as React.ComponentType<PluginButtonIconProps>; renderers.push(create(<Icon {...props} />)); }
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(renderers[0].root.findAllByType(Modal)).toHaveLength(0);
    const behavior = buttons.get('a')!.button.behavior;
    expect(behavior.kind).toBe('action');
    if (behavior.kind !== 'action') throw new Error('모달 action이 필요함');
    await act(async () => { await behavior.onPress(); });
    expect(renderers[0].root.findAllByType(Modal)).toHaveLength(1);
    expect(renderers[1].root.findAllByType(Modal)).toHaveLength(0);
    expect(renderers[0].root.findByType(MonitorContent).props.initialSnapshot).toBe(sample);
    const stopPropagation = vi.fn();
    const guard = renderers[0].root.find(node => node.type === ('Pressable' as React.ElementType) && node.props.focusable === false);
    await act(async () => guard.props.onPress({ stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(renderers[0].root.findAllByType(Modal)).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });expect(rpc).toHaveBeenCalledTimes(4);
    expect(renderers[0].root.findAllByType(Modal)).toHaveLength(1);
    await act(async () => { renderers[0].root.findByType(Modal).props.onOpenChange(false); });
    expect(renderers[0].root.findAllByType(Modal)).toHaveLength(0);
    for (const { registration } of buttons.values()) expect(registration.update).toHaveBeenCalledTimes(1);
    for (const renderer of renderers.splice(0)) await act(async () => renderer.unmount());
    await vi.advanceTimersByTimeAsync(6000);expect(rpc).toHaveBeenCalledTimes(4);
    callbacks.update({ type: 'agent_update', payload: { kind: 'remove', agentId: 'a' } });expect(buttons.get('a')?.registration.remove).toHaveBeenCalled();
  });
  it('RPC 실패 후 마지막 값이 최신/정상으로 남지 않음', () => {
    expect(displaySnapshot(sample, true).status).toBe('error');
    expect(displaySnapshot({ ...sample, sampledAt: 1000 }, false, 6001).status).toBe('stale');
    expect(displaySnapshot({ ...sample, sampledAt: 1000 }, false, 16001).status).toBe('error');
  });
});
