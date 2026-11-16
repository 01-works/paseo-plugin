import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostCollector, parseFseventsdRssKib, parseSwapUsedMib } from '../server/host';
import type { Exec } from '../server/exec';
import { HOST_WARNING_THRESHOLDS, hostIndicators } from '../shared/host';

const NOW = Date.parse('2026-11-16T10:00:00Z');
const name = (suffix: string) => `console-12345678-1234-4234-8234-123456789abc-${suffix}`;
const old = name('ecommerce-test');
const restarted = name('restarted');
const boundary = name('exactly-two-hours');
const stopped = name('stopped');
const ok = (stdout: string) => ({ code: 0, stdout, stderr: '' });

function fakeExec(options: { warning?: boolean; dockerFailure?: 'exit' | 'missing' | 'inspect' } = {}) {
  return vi.fn<Exec>(async (command, args) => {
    if (command === 'sysctl') return ok(`total = 10.00G used = ${options.warning ? '8.00' : '7.99'}G free = 2.00G`);
    if (command === 'ps') return ok(`  ${options.warning ? HOST_WARNING_THRESHOLDS.fseventsdRssKib : HOST_WARNING_THRESHOLDS.fseventsdRssKib - 1} /System/Library/CoreServices/fseventsd\n 9999 /usr/bin/other\n`);
    if (command === 'docker') {
      if (options.dockerFailure === 'missing') throw new Error('spawn docker ENOENT');
      if (options.dockerFailure === 'exit' || options.dockerFailure === 'inspect' && args[0] === 'inspect') return { code: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' };
      if (!options.warning) return ok('');
      if (args[0] === 'ps') return ok(`aaaaaaaaaaaa\t${old}\nbbbbbbbbbbbb\t${restarted}\ncccccccccccc\t${boundary}\ndddddddddddd\t${stopped}\neeeeeeeeeeee\tconsole-not-a-uuid-ecommerce-test\nffffffffffff\tunrelated\n`);
      return ok(`/${old}\ttrue\t2026-11-16T07:59:59.000000000Z\n/${restarted}\ttrue\t2026-11-16T09:59:00Z\n/${boundary}\ttrue\t2026-11-16T08:00:00Z\n/${stopped}\tfalse\t2026-11-16T05:00:00Z\n`);
    }
    throw new Error(`unexpected ${command}`);
  });
}

afterEach(() => vi.useRealTimers());

describe('host health', () => {
  it('parses swap units, no allocated swap, and sums only fseventsd RSS in KiB', () => {
    expect(parseSwapUsedMib('vm.swapusage: total = 1024.00M used = 0.50G free = 512.00M (encrypted)')).toBe(512);
    expect(parseSwapUsedMib('total = 0.00M used = 0.00M free = 0.00M')).toBe(0);
    // 11-17 실측: 동적 총량이 작아 비율은 87.8%였지만 사용량은 2.6 GiB로 정상
    expect(parseSwapUsedMib('vm.swapusage: total = 3072.00M  used = 2697.81M  free = 374.19M  (encrypted)')).toBeCloseTo(2697.81);
    expect(() => parseSwapUsedMib('unreadable')).toThrow();
    expect(() => parseSwapUsedMib('total = 1M used = 2M')).toThrow();
    expect(parseFseventsdRssKib(' 10 /System/Library/CoreServices/fseventsd\n 20 fseventsd\n 999 /usr/bin/other\n')).toBe(30);
    expect(parseFseventsdRssKib(' 999 /usr/bin/other\n')).toBe(0);
    expect(() => parseFseventsdRssKib('')).toThrow();
  });

  it('warns at inclusive resource thresholds and counts only running UUID lane containers older than two hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const exec = fakeExec({ warning: true });
    const result = await new HostCollector(exec).read(true);
    expect(result.errors).toEqual([]);
    expect(result.host).toMatchObject({ swapUsedMib: 8192, fseventsdRssKib: 2097152, leftoverContainers: { count: 1, names: [old] } });
    expect(hostIndicators(result.host).every(item => item.warning)).toBe(true);
    expect(exec.mock.calls.find(([, args]) => args[0] === 'inspect')?.[1]).toEqual([
      'inspect', '--type', 'container', '--format', '{{.Name}}\t{{.State.Running}}\t{{.State.StartedAt}}', 'aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc', 'dddddddddddd',
    ]);
  });

  it('reports no warnings below the resource thresholds and with an empty container list', async () => {
    const { host, errors } = await new HostCollector(fakeExec()).read(true);
    expect(errors).toEqual([]);
    expect(host.leftoverContainers).toMatchObject({ count: 0, names: [] });
    expect(hostIndicators(host).some(item => item.warning)).toBe(false);
  });

  it.each(['exit', 'missing', 'inspect'] as const)('keeps other readings and caches Docker %s failure as null with a warning', async dockerFailure => {
    const exec = fakeExec({ warning: true, dockerFailure });
    const collector = new HostCollector(exec);
    const result = await collector.read(true);
    expect(result.host.leftoverContainers).toBeNull();
    expect(result.host.swapUsedMib).toBe(8192);
    expect(result.errors).toEqual([expect.stringMatching(/^host docker:/)]);
    const calls = exec.mock.calls.length;
    expect(await collector.read(true)).toEqual(result);
    expect(exec).toHaveBeenCalledTimes(calls);
  });

  it('returns null and warnings for failed or malformed resource readings', async () => {
    const exec: Exec = async command => command === 'sysctl' ? ok('bad swap output') : { code: 1, stdout: '', stderr: 'ps unavailable' };
    const result = await new HostCollector(exec).read(false);
    expect(result.host).toMatchObject({ swapUsedMib: null, fseventsdRssKib: null, leftoverContainers: null });
    expect(result.errors).toEqual([expect.stringContaining('host swap:'), expect.stringContaining('host fseventsd:')]);
  });

  it.each(['', '/bad-name\ttrue\tinvalid-date\n'])('does not treat unreadable Docker detail %j as a confirmed empty list', async details => {
    const exec: Exec = async (command, args) => command === 'docker'
      ? ok(args[0] === 'ps' ? `aaaaaaaaaaaa\t${old}\n` : details)
      : fakeExec()(command, args);
    const result = await new HostCollector(exec).read(true);
    expect(result.host.leftoverContainers).toBeNull();
    expect(result.errors).toEqual([expect.stringMatching(/^host docker:/)]);
  });

  it('shares in-flight reads and caches resources and idle container readings for 60 seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const exec = fakeExec({ warning: true });
    const collector = new HostCollector(exec);
    const [first, second] = await Promise.all([collector.read(true), collector.read(true)]);
    expect(first).toEqual(second);
    expect(exec).toHaveBeenCalledTimes(4);
    vi.setSystemTime(NOW + 59_999);
    expect(await collector.read(true)).toEqual(first);
    expect(exec).toHaveBeenCalledTimes(4);
    // 실행 중에는 기존 캐시의 잔여물도 보여 주지 않고 Docker 명령을 보내지 않는다.
    expect((await collector.read(false)).host.leftoverContainers).toBeNull();
    expect(exec).toHaveBeenCalledTimes(4);
    vi.setSystemTime(NOW + 60_000);
    expect((await collector.read(true)).host.measuredAt).not.toBe(first.host.measuredAt);
    expect(exec).toHaveBeenCalledTimes(8);
  });

  it('defers Docker reads until idle without re-reading cached resources', async () => {
    const exec = fakeExec();
    const collector = new HostCollector(exec);
    expect((await collector.read(false)).host.leftoverContainers).toBeNull();
    expect(exec.mock.calls.map(([command]) => command)).toEqual(['sysctl', 'ps']);
    expect((await collector.read(true)).host.leftoverContainers?.count).toBe(0);
    expect(exec.mock.calls.map(([command]) => command)).toEqual(['sysctl', 'ps', 'docker']);
  });
});
