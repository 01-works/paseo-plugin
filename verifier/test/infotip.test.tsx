import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 창 폭과 아이콘의 화면 x 좌표를 테스트에서 바꿀 수 있게 한다.
const env = vi.hoisted(() => ({ width: 375, iconX: 250, measured: 0 }));
vi.mock('react-native', () => ({ View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: env.width, height: 800 }) }));
vi.mock('@getpaseo/plugin/client', () => ({ openExternalUrl: vi.fn() }));
vi.mock('@getpaseo/plugin/client/ui', () => ({ SidebarRow: 'SidebarRow' }));

const { InfoTip } = await import('../client/screen');

const theme = { colors: { surface0: '#000', surface1: '#111', surface2: '#222', border: '#333', foreground: '#fff', foregroundMuted: '#aaa', accent: '#0af', accentForeground: '#000', statusSuccess: '#0f0', statusWarning: '#fa0', statusDanger: '#f00' } };
const styles = { text: { color: '#fff' }, tip: { position: 'absolute' as const, top: 22, left: -8, width: 240 } } as never;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let renderer: ReactTestRenderer | undefined;
afterEach(() => renderer?.unmount());

function bubbleRight(): number {
  const bubble = renderer!.root.find(node => node.type === ('View' as never) && node.props.pointerEvents === 'none');
  const style = Object.assign({}, ...[bubble.props.style].flat());
  return env.iconX + style.left + style.width;
}

async function rerender() {
  await act(async () => renderer!.update(<InfoTip text="설명" styles={styles} theme={theme as never} />));
}

describe('InfoTip placement', () => {
  it('re-measures while open so the bubble stays inside the window after layout or resize', async () => {
    env.width = 375;
    env.iconX = 250;
    env.measured = 0;
    await act(async () => {
      renderer = create(<InfoTip text="설명" styles={styles} theme={theme as never} />, {
        createNodeMock: () => ({ measureInWindow: (cb: (x: number) => void) => { env.measured++; cb(env.iconX); } }),
      });
    });
    const icon = renderer!.root.find(node => node.type === ('Pressable' as never));
    await act(async () => icon.props.onPress());
    expect(bubbleRight()).toBeLessThanOrEqual(375 - 8);

    // 열린 채로 아이콘이 오른쪽으로 움직이면(폴링으로 위 내용이 바뀜) 다음 그리기에서 다시 맞춘다.
    env.iconX = 261;
    await rerender();
    expect(bubbleRight()).toBeLessThanOrEqual(375 - 8);

    // 창이 좁아져도 화면 안에 남는다.
    env.width = 320;
    env.iconX = 280;
    await rerender();
    expect(bubbleRight()).toBeLessThanOrEqual(320 - 8);
    expect(env.measured).toBeGreaterThan(1);
  });
});
