import { homedir } from 'node:os';
import { expect, it } from 'vitest';
import { Observation, eligibleMetadata, historyCandidates, publicCommand, redact, sameMetadata } from '../server/cleanup-policy';
import { observed, metadata, history } from './cleanup-fixtures';

it('연속된 실제 관찰 구간의 CPU 최대값과 디스크 I/O 차이만 계산', () => {
  const o = new Observation();
  for (let i = 0; i <= 6; i++) o.accept([{ ...observed, cpuPercent: i === 3 ? 0.09 : 0.01, readBytes: 1000 + i * 10, writtenBytes: 2000 + i }], i * 2000);
  expect(o.seconds).toBe(12);
  expect(o.candidates()).toEqual([{ ...observed, observationSource: 'live', observedSeconds: 12, maxCpuPercent: 0.09, readBytes: 60, writtenBytes: 6 }]);
  // 같은 시각의 중복 읽기는 관찰을 늘리지 않는다.
  o.accept([observed], 12_000); expect(o.candidates()[0].readBytes).toBe(60);
});
it('PID 재사용·부모 변경·I/O 역행·최근 활동·누락을 지속 저활동으로 취급하지 않음', () => {
  for (const changed of [{ start: '1' }, { parentPid: 2 }, { readBytes: 0 }, { cpuPercent: 1 }, { cpuPercent: null }, { ageSeconds: 20 }]) {
    const o = new Observation(); for (let i = 0; i < 5; i++) o.accept([observed], i * 2000);
    o.accept([{ ...observed, ...changed }], 10_000); o.accept([observed], 12_000); expect(o.candidates()).toEqual([]);
  }
  const o = new Observation(); for (let i = 0; i < 6; i++) o.accept([observed], i * 2000);
  o.accept([], 12_000); expect(o.candidates()).toEqual([]);
});
it('샘플이 5초 이상 끊기면 관찰을 처음부터 계산', () => {
  const o = new Observation(); for (let i = 0; i < 6; i++) o.accept([observed], i * 2000);
  o.accept([observed], 16_000); expect(o.seconds).toBe(0); expect(o.candidates()).toEqual([]);
});
it('앱 하나가 후보를 독점하지 않으며 전체 후보는 16개로 제한', () => {
  const entries = Array.from({ length: 60 }, (_, i) => ({ ...observed, pid: i + 100, group: `앱${Math.floor(i / 3)}`, memoryBytes: 1000 - i }));
  const o = new Observation(); for (let i = 0; i <= 6; i++) o.accept(entries, i * 2000);
  expect(o.candidates()).toHaveLength(16); expect(o.candidates().filter(p => p.group === '앱0')).toHaveLength(2);
});
it('이력 경로도 같은 앱별·전체 제한을 사용하며 최근 90초 경계를 포함', () => {
  const entries = Array.from({ length: 60 }, (_, i) => ({ ...observed, pid: i + 100, group: `앱${Math.floor(i / 3)}`, memoryBytes: 1000 - i }));
  const candidates = historyCandidates(entries, history.sampledAt + 90_000, () => history)!;
  expect(candidates).toHaveLength(16); expect(candidates.filter(p => p.group === '앱0')).toHaveLength(2);
  expect(historyCandidates([observed], history.sampledAt + 90_001, () => history)).toBeNull();
  expect(historyCandidates([{ ...observed, cpuPercent: 1 }], history.sampledAt, () => history)).toEqual([]);
  expect(historyCandidates([{ ...observed, ageSeconds: 20 }], history.sampledAt, () => null)).toEqual([]);
});
it('보호된 트리·시스템·Paseo·Codex·Claude·터미널·누락 인자는 검토 대상에서 제외', () => {
  expect(eligibleMetadata(metadata)).toBe(true);
  for (const change of [{ protected: true }, { path: null }, { args: null }, { cpuPercent: null }, { cpuPercent: 2 },
    { path: '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder' }, { path: '/usr/libexec/something' },
    { path: '/usr/sbin/service' }, { path: '/opt/homebrew/bin/codex' }, { path: '/usr/local/bin/claude' },
    { path: '/Applications/Paseo.app/Contents/MacOS/Paseo' }, { path: '/Applications/iTerm.app/Contents/MacOS/iTerm2' }])
    expect(eligibleMetadata({ ...metadata, ...change })).toBe(false);
});
it('종료 대조는 가리지 않은 전체 인자와 실행 정체성·현재 활동을 비교', () => {
  expect(sameMetadata(metadata, { ...metadata })).toBe(true);
  for (const change of [{ start: '1' }, { path: '/tmp/node' }, { cwd: '/tmp/other' }, { args: ['node', 'new.js'] },
    { parentPid: 2 }, { group: 'chrome' }, { name: 'other' }, { cpuPercent: 1 }])
    expect(sameMetadata(metadata, { ...metadata, ...change })).toBe(false);
});
it('버전 번호로 실행되는 Claude와 보호 그룹도 검토/확인 종료에서 제외', () => {
  for (const change of [{ path: '/Users/test/.local/share/claude/versions/2.1.286', name: '2.1.286' },
    { path: '/Users/test/.claude/versions/2.1.286' }, { group: 'claude' }, { group: 'Codex' }, { group: 'Paseo' }]) {
    const current = { ...metadata, ...change };
    expect(eligibleMetadata(current)).toBe(false); expect(sameMetadata(current, current)).toBe(false);
  }
});
it('모델/UI 사본에서 홈 경로와 흔한 비밀 인자를 가리고 원본은 유지', () => {
  const args = ['/opt/homebrew/bin/node', `${homedir()}/test.js`, '--access-token', 'super-secret-value',
    '--api-key=sk-123456789abcdef', 'redis://user:password@example.com', 'Authorization: Bearer abcdef'];
  const m = { ...metadata, args };
  const publicValue = publicCommand(m)!;
  expect(publicValue).toContain('node ~/test.js'); expect(publicValue).toContain('--access-token [가림]');
  for (const secret of ['super-secret-value', '123456789abcdef', 'user:password', 'abcdef', homedir()]) expect(publicValue).not.toContain(secret);
  expect(m.args).toBe(args); expect(redact('password=hello&token=world')).toBe('password=[가림]&token=[가림]');
});
