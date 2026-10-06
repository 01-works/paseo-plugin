import { describe, expect, it } from 'vitest';
import { computeCpu, computeMemory, pressure, sampleStatus, emptySnapshot } from '../shared/compute';
import { raw } from './fixtures';

describe('원시 카운터 계산', () => {
  it('Activity Monitor 합계는 실제 빈 페이지·파일 기반 페이지를 제외하고 세부 항목은 유지', () => {
    expect(computeMemory(raw.sys)).toEqual({ app: 80 * 16384, wired: 30 * 16384, compressed: 40 * 16384, cached: 70 * 16384,
      used: 16 * 1024 ** 3 - 56 * 16384, total: 16 * 1024 ** 3 });
  });
  it('실측 카운터에서 약 0.56 GiB 누락과 speculative·purgeable 중복 제외를 회귀 검증', () => {
    const memory = computeMemory({ ...raw.sys, vm: { free: 35340, speculative: 12538, internal: 394117,
      external: 148760, wire: 191902, compressor: 255611, purgeable: 1510 } })!;
    expect(memory.used / 1024 ** 3).toBe(13.382171630859375);
    expect((memory.app + memory.wired + memory.compressed) / 1024 ** 3).toBe(12.8192138671875);
    expect(memory.cached).toBe(150270 * 16384);
  });
  it.each([4096, 16384])('페이지 크기 %s에 따라 총 사용량을 계산', pageSize => {
    const memory = computeMemory({ ...raw.sys, pageSize, memsize: 200 * pageSize,
      vm: { internal: 60, purgeable: 10, wire: 10, compressor: 10, external: 50, free: 100, speculative: 20 } });
    expect(memory?.used).toBe(70 * pageSize);
  });
  it('speculative 누락·역행·음수 합계·정밀도 손실은 0으로 보정하지 않음', () => {
    for (const vm of [{ ...raw.sys.vm!, speculative: null }, { ...raw.sys.vm!, speculative: 11 },
      { ...raw.sys.vm!, external: 2 ** 30 }, { ...raw.sys.vm!, wire: Number.MAX_SAFE_INTEGER }]) {
      expect(computeMemory({ ...raw.sys, vm })).toBeNull();
    }
    expect(computeMemory({ ...raw.sys, pageSize: 0.5 })).toBeNull();
  });
  it('유효한 사용량 0은 읽기 실패 null과 구분', () => {
    expect(computeMemory({ ...raw.sys, memsize: 10 * 16384,
      vm: { internal: 0, purgeable: 0, wire: 0, compressor: 0, external: 0, free: 10, speculative: 0 } })?.used).toBe(0);
  });
  it('누락/음수 앱 계산은 0이 아니라 null', () => {
    expect(computeMemory({ ...raw.sys, pageSize: null })).toBeNull();
    expect(computeMemory({ ...raw.sys, vm: null })).toBeNull();
    expect(computeMemory({ ...raw.sys, vm: { ...raw.sys.vm!, internal: 0 } })).toBeNull();
  });
  it('CPU는 누적값이 아닌 사용자+nice/시스템 Δ', () => {
    expect(computeCpu({ user: 130, nice: 20, system: 70, idle: 240 }, raw.sys.cpu)).toEqual({ user: 40, system: 20, total: 60 });
  });
  it('첫 샘플, 동일 카운터, 0 total, 역행을 측정 중으로 처리', () => {
    expect(computeCpu(raw.sys.cpu, null)).toBeNull();
    expect(computeCpu(null, raw.sys.cpu)).toBeNull();
    expect(computeCpu(raw.sys.cpu, raw.sys.cpu)).toBeNull();
    expect(computeCpu({ ...raw.sys.cpu!, user: 0 }, raw.sys.cpu)).toBeNull();
    expect(emptySnapshot('native').status).toBe('warming');
    expect(sampleStatus(0, true, false)).toBe('warming');
  });
  it.each([[1, 'normal'], [2, 'warning'], [4, 'critical'], [0, 'unknown'], [-1, 'unknown'], [3, 'unknown'], [null, 'unknown']] as const)('압력 %s → %s', (level, expected) => expect(pressure(level)).toBe(expected));
  it('5초/15초 경계, 헬퍼 중단, 미지원', () => {
    expect(sampleStatus(5000, true, true)).toBe('ok'); expect(sampleStatus(5001, true, true)).toBe('stale');
    expect(sampleStatus(15000, true, true)).toBe('stale'); expect(sampleStatus(15001, true, true)).toBe('error');
    expect(sampleStatus(0, false, true)).toBe('error'); expect(sampleStatus(null, false, false, true)).toBe('unsupported');
  });
});
