// @vitest-environment jsdom
// DOM은 클릭 경계 검증에만 사용한다. 제품은 React Native 요소만 사용한다.
import { afterEach, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
vi.mock('react-native', async () => {
  const { createElement, useLayoutEffect } = await import('react');
  return {
    View: props => {
      useLayoutEffect(() => { props.onLayout?.({ nativeEvent: { layout: { width: 500, height: 360 } } }); }, []);
      return createElement('div', {}, props.children);
    },
    Text: props => createElement('span', {}, props.children),
    Platform: { OS: 'web' }, PanResponder: { create: () => ({ panHandlers: {} }) },
    Pressable: props => createElement('div', { role: props.accessible === false ? undefined : 'button',
      'aria-label': props.accessibilityLabel, onClick: props.disabled ? undefined : props.onPress }, props.children),
  };
});
vi.mock('@getpaseo/plugin/client/react-native', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  const { createPortal } = await import('react-dom');
  const ScrollView = forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({ scrollTo() {} }));
    return createElement('div', {}, props.children);
  });
  return { ScrollView, FlatList: props => createElement('div', {}, props.data.map(item => createElement('div', { key: item.key }, props.renderItem({ item })))),
    TextInput: props => createElement('input', { 'aria-label': props.accessibilityLabel }),
    Icon: () => null, copyText: vi.fn(async () => {}), useToast: () => ({ show() {}, error() {} }),
    Modal: Object.assign(props => props.children, { Content: props => createPortal(props.children, document.getElementById('portal')) }) };
});
import { createAgentDirectory } from '../client/directory';
import { contributePills } from '../client/pill';
import { createBrowserViews } from '../client/view-state';
import { page, raw } from './fixtures';
import { copyText } from '@getpaseo/plugin/client/react-native';
let root, directory, stop;
afterEach(async () => {
  await act(async () => root?.unmount()); stop?.(); await directory?.dispose(); document.body.innerHTML = '';
  vi.useRealTimers();
});
it('React portal 본문·정렬·복사·닫기 확인과 취소·대화 이동은 바깥 pill action을 재실행하지 않음', async () => {
  vi.useFakeTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '<div id="app"></div><div id="portal"></div>';
  const snapshot = page([raw('a'), raw('b', { labels: { 'paseo.parent-agent-id': 'a' } }), raw('c')]);
  const lease = { subscriptionId: 's', subscribe: observer => {
    observer.snapshot({ ...snapshot, subscriptionId: 's' }); return () => {};
  }, release: async () => {} };
  const archive = vi.fn(async () => ({ archivedAt: '2026-10-07T07:00:00Z' }));
  directory = createAgentDirectory({ agents: { list: async () => ({ ...snapshot, subscription: lease }),
    ref: id => ({ refresh: async () => ({ agent: snapshot.entries.find(entry => entry.agent.id === id).agent, project: {} }), archive }) } }, 'h');
  const views = createBrowserViews(); let button;
  const openSurface = vi.fn();
  const client = { openSurface, addComposerPill: input => { if (input.agentId === 'a') button = input.button; return { update() {}, remove() {} }; } };
  stop = contributePills(client, directory, views); await directory.start();
  const Icon = button.icon;
  const palette = { foreground: '#eee', foregroundMuted: '#aaa', surface0: '#111', surface1: '#222', surface2: '#333', border: '#444',
    accent: '#88c', statusSuccess: '#0a0', statusWarning: '#aa0', statusDanger: '#a00' };
  const props = { theme: { colors: palette }, host: { id: 'h' }, layout: { compact: false, platform: 'web' }, size: 14, color: '#aaa' };
  const press = vi.fn(() => button.behavior.onPress());
  root = createRoot(document.getElementById('app'));
  await act(async () => root.render(React.createElement('button', { id: 'pill', onClick: press }, React.createElement(Icon, props))));
  const click = async element => { expect(element).toBeTruthy(); await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true }))); };
  await click(document.getElementById('pill'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  await click(document.querySelector('#portal [aria-label="최신 생성순"]'));
  await click(document.querySelector('#portal [aria-label="b ID 복사"]'));
  await click([...document.querySelectorAll('#portal span')].find(node => node.textContent === '3개'));
  expect(press).toHaveBeenCalledTimes(1);
  expect(copyText).toHaveBeenLastCalledWith('b');
  expect(views.forAgent('h', 'w', 'a').getSnapshot().browserSort).toBe('created');
  expect(document.getElementById('portal').textContent).toContain('3개');
  await click(document.querySelector('#portal [aria-label="c 대화 닫기"]'));
  expect(archive).not.toHaveBeenCalled();
  await click([...document.querySelectorAll('#portal span')].find(node => node.textContent === '취소'));
  expect(document.querySelector('#portal [aria-label="선택한 대화 닫기 확인"]')).toBeNull();
  await click(document.querySelector('#portal [aria-label="c 대화 닫기"]'));
  await click(document.querySelector('#portal [aria-label="선택한 대화 닫기 확인"]'));
  expect(archive).toHaveBeenCalledOnce();
  expect(document.querySelector('#portal [aria-label="c 대화 닫기"]')).toBeNull();
  expect(document.getElementById('portal').textContent).toContain('2개');
  expect(press).toHaveBeenCalledTimes(1); expect(openSurface).not.toHaveBeenCalled();
  await click(document.querySelector('#portal [aria-label="b ID 복사"]'));
  expect(openSurface).not.toHaveBeenCalled();
  await click(document.querySelector('#portal [aria-label="b"]'));
  expect(openSurface).toHaveBeenCalledOnce(); expect(press).toHaveBeenCalledTimes(1);
});
