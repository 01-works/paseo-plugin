import { describe, expect, it } from 'vitest';
import { computeCpu, computeMemory, pressure, sampleStatus, emptySnapshot } from '../shared/compute';
import { raw } from './fixtures';

describe('원시 카운터 계산', () => {
  it('앱/와이어드/압축/캐시 공식 및 GiB 물리 용량', () => {
    expect(computeMemory(raw.sys)).toEqual({ app: 80 * 16384, wired: 30 * 16384, compressed: 40 * 16384, cached: 70 * 16384, used: 150 * 16384, total: 16 * 1024 ** 3 });
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
  it.each([[1, 'normal'], [2, 'warning'], [4, 'critical'], [0, 'unknown'], [3, 'unknown'], [null, 'unknown']] as const)('압력 %s → %s', (level, expected) => expect(pressure(level)).toBe(expected));
  it('5초/15초 경계, 헬퍼 중단, 미지원', () => {
    expect(sampleStatus(5000, true, true)).toBe('ok'); expect(sampleStatus(5001, true, true)).toBe('stale');
    expect(sampleStatus(15000, true, true)).toBe('stale'); expect(sampleStatus(15001, true, true)).toBe('error');
    expect(sampleStatus(0, false, true)).toBe('error'); expect(sampleStatus(null, false, false, true)).toBe('unsupported');
  });
});
