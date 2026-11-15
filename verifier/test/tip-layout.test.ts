import { describe, expect, it } from 'vitest';
import { tipLeft, tipWidth } from '../client/tip-layout';

describe('tooltip layout', () => {
  it('keeps the bubble narrower than the window', () => {
    expect(tipWidth(320, 1200)).toBe(320);
    expect(tipWidth(320, 300)).toBe(284);
    expect(tipWidth(320, 100)).toBe(120);
  });

  it('opens right of the icon by default and shifts left near the right edge', () => {
    expect(tipLeft(100, 1200, 320)).toBe(-8);
    // 폭 375 화면, 아이콘 x=250: 기본이면 오른쪽 끝이 562까지 나간다 → 화면 안(오른쪽 여백 8)으로 민다.
    const left = tipLeft(250, 375, 240);
    expect(250 + left).toBe(375 - 8 - 240);
    expect(250 + left + 240).toBeLessThanOrEqual(375 - 8);
  });

  it('never starts left of the window margin and survives unknown positions', () => {
    expect(4 + tipLeft(4, 375, 240)).toBe(8);
    expect(tipLeft(Number.NaN, 375, 240)).toBe(-8);
  });
});
