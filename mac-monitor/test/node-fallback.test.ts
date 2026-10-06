import { expect, it } from 'vitest';
import { parseVm, parseSwap } from '../server/node-fallback';
import { computeMemory } from '../shared/compute';
import { raw } from './fixtures';
const vmText = 'Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: 100.\nPages purgeable: 20.\nPages wired down: 30.\nPages occupied by compressor: 40.\nFile-backed pages: 50.\nPages free: 10.\nPages speculative: 4.\n';
it('vm_stat의 빈 페이지는 speculative을 복원해 네이티브와 같은 기준으로 해석', () => {
  const vm = parseVm(vmText);
  expect(vm).toEqual({ pageSize: 16384, vm: { internal: 100, purgeable: 20, wire: 30, compressor: 40, external: 50, free: 14, speculative: 4 } });
  expect(computeMemory({ ...raw.sys, ...vm })?.used).toBe(raw.sys.memsize! - 60 * 16384);
});
it('speculative 항목 누락은 0으로 대체하지 않고 오류', () => {
  expect(() => parseVm(vmText.replace('Pages speculative: 4.\n', ''))).toThrow('Pages speculative');
});
it('누락 vm_stat/swap은 해석 실패, M/G 이진 단위', () => { expect(() => parseVm('')).toThrow(); expect(() => parseSwap('bad')).toThrow(); expect(parseSwap('total = 2.00G used = 512.00M free = 1.50G')).toEqual({ total: 2 * 1024 ** 3, used: 512 * 1024 ** 2 }); });
