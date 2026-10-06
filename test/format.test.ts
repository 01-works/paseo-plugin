import { expect, it } from 'vitest';
import { gib, pillLabel, relativeTime } from '../client/format';
import { computeMemory, emptySnapshot } from '../shared/compute';
import { raw } from './fixtures';
it('GiB 1024³ 소수 1자리와 누락값', () => { expect(gib(1.25 * 1024 ** 3)).toBe('1.3 GiB'); expect(gib(null)).toBe('—'); expect(gib(0)).toBe('0.0 GiB'); });
it('상대 시각', () => { expect(relativeTime(null)).toBe('아직 샘플 없음'); expect(relativeTime(999)).toBe('방금'); expect(relativeTime(5999)).toBe('5초 전'); });
it('160px pill용 축약 라벨/오류/미지원', () => {
  const s = { ...emptySnapshot('native'), status: 'ok' as const, cpu: { total: 23.4, user: 20, system: 3.4 }, memory: computeMemory(raw.sys) };
  expect(pillLabel(s)).toBe('23% · 0.0G');
  expect(pillLabel({ ...s, status: 'stale' })).toContain('지연'); expect(pillLabel({ ...s, status: 'error' })).toContain('오류');
  expect(pillLabel(emptySnapshot('unsupported'))).toBe('macOS 미지원');
});

it('앱 CPU의 작은 사용량과 누락값을 구분', async () => {
  const { appPercent } = await import('../client/format');
  expect(appPercent(0.4)).toBe('0.4%'); expect(appPercent(0.03)).toBe('<0.1%');
  expect(appPercent(0)).toBe('0.0%'); expect(appPercent(null)).toBe('—');
});
