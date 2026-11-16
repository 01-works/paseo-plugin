import React from 'react';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginTheme } from '@getpaseo/plugin';
import type { VerifierStatus } from '../shared/contracts';

const hooks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 375, height: 800 }) }));
vi.mock('@getpaseo/plugin/client', () => ({ openExternalUrl: hooks.open }));
vi.mock('@getpaseo/plugin/client/ui', () => ({ SidebarRow: 'SidebarRow' }));
import { VerifierView } from '../client/screen';
import { healthy, hostWarning, NOW, red, remote, running, SIG_CI } from './status';

const theme: PluginTheme = {
  colors: {
    surface0: '#000', surface1: '#111', surface2: '#222', border: '#333', foreground: '#eee', foregroundMuted: '#888',
    accent: '#38f', accentForeground: '#fff', statusSuccess: '#2c4', statusWarning: '#fa0', statusDanger: '#f33',
  },
};

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  if (renderer) await act(async () => renderer!.unmount());
  renderer = undefined;
  hooks.open.mockReset();
});

async function render(status: VerifierStatus | undefined, extra: { error?: string; compact?: boolean } = {}) {
  await act(async () => {
    renderer = create(<VerifierView state={{ data: status, error: extra.error, loading: false }} theme={theme} compact={extra.compact ?? false} onRefresh={() => {}} now={NOW} />);
  });
  return renderer!;
}

function textOf(node: ReactTestInstance): string {
  return node.children.map(child => (typeof child === 'string' ? child : textOf(child))).join('');
}
/** 화면의 Text 줄(중첩 Text는 바깥 줄 하나로) */
function lines(): string[] {
  const all = renderer!.root.findAll(node => node.type === ('Text' as unknown as React.ElementType));
  return all.filter(node => !all.some(other => other !== node && other.findAll(inner => inner === node).length > 0)).map(textOf);
}
function headers(): string[] {
  return renderer!.root.findAll(node => node.type === ('Text' as unknown as React.ElementType) && node.props.accessibilityRole === 'header').map(textOf);
}
function press(predicate: (node: ReactTestInstance) => boolean) {
  const target = renderer!.root.find(node => node.type === ('Pressable' as unknown as React.ElementType) && predicate(node));
  return act(async () => target.props.onPress());
}
const byLabel = (pattern: RegExp) => (node: ReactTestInstance) => typeof node.props.accessibilityLabel === 'string' && pattern.test(node.props.accessibilityLabel);
const byRole = (role: string, text: string) => (node: ReactTestInstance) => node.props.accessibilityRole === role && textOf(node) === text;

describe('VerifierView', () => {
  it('shows a passing summary, "nothing to check", the recent tab and a single footer line', async () => {
    await render(healthy);
    expect(headers()).toEqual(['통과 · b09aa18', '확인할 것', '기록']);
    const text = lines();
    expect(text).toContain('지금 실행 없음');
    expect(text).toContain('확인할 것 없음');
    expect(text.join('\n')).toContain('승격 후보');
    expect(text.join('\n')).toContain('main보다 7커밋 앞섬');
    expect(text.some(line => line.startsWith('디스크 여유 40.0 GiB / 최소 10.0 GiB · '))).toBe(true);
    // 없앤 카드: 디스크·실행 연기·읽기 경고·따로 있던 최근 실행 카드
    for (const removed of ['디스크', '실행 연기', '읽기 경고', '최근 실행', '기기 상태', '승격', '기간 요약']) expect(headers()).not.toContain(removed);
  });

  it('shows red duration, one line per signature with the first SHA, its PR and the linked red issue', async () => {
    await render(red);
    expect(headers()[0]).toBe('dev 실패 13시간째 · console-ci');
    const text = lines();
    expect(text).toContain('1건');
    expect(text).toContain('2회 연속');
    expect(text).toContain('· 마지막 실행');
    expect(text).toContain('#10196');
    expect(text).toContain('reproduced · both-failed · 07a3cdbaa6b8');
    await press(byLabel(/^이슈 10196/));
    expect(hooks.open).toHaveBeenCalledWith('https://github.com/acme/repo/issues/10196');
    await press(byLabel(/^PR 7957/));
    expect(hooks.open).toHaveBeenLastCalledWith('https://github.com/acme/repo/pull/7957');
  });

  it('shows the running lane bar collapsed, and lane details when the bar is pressed', async () => {
    await render(running);
    const text = lines();
    expect(text).toContain('4/11');
    expect(text.some(line => line.startsWith('예상 종료 '))).toBe(true);
    expect(text).not.toContain('migration-exec');
    await press(byLabel(/^lane 진행 4\/11/));
    const open = lines();
    expect(open).toContain('migration-exec');
    expect(open).toContain('약 20분째 · 평소 10분');
    expect(open).toContain('fix(console): 지금 커밋');
    // 지금 실행과 마지막 실행의 같은 signature는 한 줄로 묶인다.
    expect(open.filter(line => line === '3회 연속')).toHaveLength(1);
    expect(open).toContain('· 지금·마지막 실행');
    expect(open).toContain('이번에 처음');
    expect(open).toContain('없음');
  });

  it('lists only exceeded host warnings with guidance, plus disk, deferral and read warnings', async () => {
    await render(hostWarning);
    const text = lines();
    expect(text).toContain('기기 점검 필요 · swap 9.3 GiB · 남은 lane 컨테이너 1개');
    // 조치 안내는 짧은 한 줄로 늘 보인다.
    expect(text.join('\n')).toContain('조치: run 사이에 loop를 내리고');
    expect(text).not.toContain('fseventsd RSS 0.0 GiB');
    expect(text).toContain('디스크 여유 12.0 GiB · 실행 최소 10.0 GiB');
    expect(text).toContain('실행 연기 · disk low-space 9.7GiB');
    expect(text).toContain('읽기 경고 1건');
    expect(text).toContain('docker: Cannot connect to the Docker daemon');
    expect(text).not.toContain('확인할 것 없음');
  });

  it('reads remotely: hides the promotion line and shows the remote target in the footer', async () => {
    await render(remote, { compact: true });
    const text = lines();
    expect(text.join('\n')).not.toContain('승격 후보');
    expect(text.some(line => line.startsWith('원격 verifier-box · 디스크 여유 40.0 GiB / 최소 10.0 GiB ('))).toBe(true);
    expect(text).toContain('확인 안 됨');
    await press(byRole('tab', '통계'));
    expect(lines()).toContain('원격 SSH 모드에서는 기기 상태를 읽을 수 없습니다.');
  });

  it('switches history tabs and expands a run row', async () => {
    await render(red);
    const tabs = renderer!.root.findAll(node => node.props.accessibilityRole === 'tab' && node.type === ('Pressable' as unknown as React.ElementType));
    expect(tabs.map(textOf)).toEqual(['최근', 'lane 표', '통계']);
    expect(tabs.map(tab => tab.props.accessibilityState.selected)).toEqual([true, false, false]);
    expect(lines()).not.toContain('chore: 다음 커밋');
    await press(byLabel(/실패 ed5fbe3, 누르면 펼칩니다$/));
    const open = lines();
    expect(open).toContain('chore: 다음 커밋');
    expect(open.some(line => line.startsWith(`console-ci: reproduced · both-failed · ${SIG_CI.slice(0, 12)} · 2회 연속`))).toBe(true);

    await press(byRole('tab', 'lane 표'));
    expect(lines()).toContain('최근 3회');
    expect(lines().some(line => line.startsWith('열 위 막대는'))).toBe(false);
    await press(byRole('tab', '통계'));
    const stats = lines();
    expect(stats.some(line => line.startsWith('지금 red:'))).toBe(true);
    expect(stats).toContain('swap 1.5 GiB');
    expect(stats.some(line => line.startsWith('최근 3회. 위 막대는'))).toBe(false);
  });

  it('shows the loading and error header before data', async () => {
    await render(undefined);
    expect(headers()).toEqual(['불러오는 중…']);
    await render(undefined, { error: 'rpc failed' });
    expect(headers()).toEqual(['읽기 실패']);
    expect(lines()).toContain('rpc failed');
  });
});
