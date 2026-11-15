/** 말풍선 폭: 기본 폭과 화면 폭(양쪽 여백 8)을 넘지 않는다. */
export function tipWidth(preferred: number, windowWidth: number): number {
  return Math.max(120, Math.min(preferred, windowWidth - 16));
}

/**
 * 아이콘의 화면 x 좌표에서 말풍선을 아이콘 기준 어디(left)에 둘지. 기본은 아이콘 왼쪽 8 앞에서 시작하고,
 * 오른쪽 끝이 화면 밖으로 나가면 왼쪽으로, 왼쪽 끝이 나가면 오른쪽으로 밀어 화면 안(여백 8)에 둔다.
 */
export function tipLeft(iconX: number, windowWidth: number, width: number): number {
  if (!Number.isFinite(iconX) || !Number.isFinite(windowWidth)) return -8;
  const absolute = Math.max(8, Math.min(iconX - 8, windowWidth - 8 - width));
  return absolute - iconX;
}
