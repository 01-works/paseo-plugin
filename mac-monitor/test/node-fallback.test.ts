import { expect, it } from 'vitest';
import { parseVm, parseSwap } from '../server/node-fallback';
it('vm_stat의 Anonymous/File-backed/압축 실제 점유 페이지를 사용', () => {
  const vm = parseVm('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: 100.\nPages purgeable: 20.\nPages wired down: 30.\nPages occupied by compressor: 40.\nFile-backed pages: 50.\nPages free: 10.\n');
  expect(vm).toEqual({ pageSize: 16384, vm: { internal: 100, purgeable: 20, wire: 30, compressor: 40, external: 50, free: 10 } });
});
it('누락 vm_stat/swap은 해석 실패, M/G 이진 단위', () => { expect(() => parseVm('')).toThrow(); expect(() => parseSwap('bad')).toThrow(); expect(parseSwap('total = 2.00G used = 512.00M free = 1.50G')).toEqual({ total: 2 * 1024 ** 3, used: 512 * 1024 ** 2 }); });
