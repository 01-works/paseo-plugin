import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryGuardian, type GuardCollector } from '../server/automation/guardian';
import { growing, POLICY, type Point } from '../server/automation/policy';
import { initialState, readAutomation, writeAutomation } from '../server/automation/store';
import { automaticProtection, processKey, type ReviewResult } from '../shared/automation';
import { emptySnapshot } from '../shared/compute';
import type { ProcessInfo, Snapshot } from '../shared/contracts';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuditor, AUDIT_LIMIT, type AuditRecord } from '../server/automation/audit';

const GiB = 1024 ** 3;
const processInfo: ProcessInfo = { pid: 23456, start: '12345678901234567', group: 'worker', name: 'worker', path: '/opt/dev/worker', memoryBytes: GiB, cpuPercent: 0.1 };
const target = { pid: processInfo.pid, start: processInfo.start, group: processInfo.group, name: processInfo.name, path: processInfo.path! };
const base: Snapshot = { ...emptySnapshot('native'), status: 'ok', ageMs: 0, pressure: 'critical', memoryLevel: 10, processesStatus: 'ok',
  cpu: { total: 20, user: 15, system: 5 },
  memory: { total: 16 * GiB, used: 14 * GiB, app: 10 * GiB, wired: 2 * GiB, compressed: 2 * GiB, cached: GiB },
  disk: { total: 100 * GiB, used: 50 * GiB, available: 50 * GiB, sampledAt: 1_000_000 } };
const guards: MemoryGuardian[] = [], directories: string[] = [];
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function setup(options: { allowed?: boolean; result?: ReviewResult; deferred?: boolean; state?: ReturnType<typeof initialState>; write?: (s: ReturnType<typeof initialState>) => Promise<void>; audit?: (record: AuditRecord) => Promise<void> } = {}) {
  let time = 0, finish!: (r: ReviewResult) => void;
  let observation = { snapshot: structuredClone(base), members: [{ ...processInfo }] };
  const state = options.state ?? initialState(); state.config.enabled = true;
  if (options.allowed !== false) state.targets = [target];
  const interest = vi.fn(), terminate = vi.fn(async () => ({ sent: true })), inspect = vi.fn(async () => 'exited' as const), validate = vi.fn(async () => ({ allowed: true, error: undefined as string | undefined }));
  const collector: GuardCollector = { subscribe: () => () => {}, setAutomaticInterest: interest,
    observeAutomation: () => observation, terminateAutomatically: terminate, inspectAutomatically: inspect, validateAutomatically: validate };
  const result = options.result ?? { decisions: [{ key: processKey(target), decision: 'terminate', reason: '허용한 worker의 지속 증가' }] };
  const reviewer = vi.fn((_input, signal: AbortSignal) => options.deferred ? new Promise<ReviewResult>(r => { finish = r; signal.addEventListener('abort', () => r(result), { once: true }); }) : Promise.resolve(result));
  const writes: ReturnType<typeof initialState>[] = [];
  const audit: AuditRecord[] = [];
  const guard = new MemoryGuardian(collector, { reviewer, now: () => 1_000_000 + time, mono: () => time,
    read: async () => structuredClone(state), write: options.write ?? (async s => { writes.push(s); }), audit: options.audit ?? (async record => { audit.push(record); }) });
  guards.push(guard);
  const tick = (ms = 2000, change?: (o: typeof observation) => void) => {
    time += ms; observation.snapshot.sampledAt = 1_000_000 + time;
    observation.snapshot.disk!.sampledAt = observation.snapshot.sampledAt;
    change?.(observation); guard.accept();
  };
  const pressureAndGrowth = async () => {
    guard.accept();
    for (let i = 0; i < 60; i++) tick();
    for (let i = 0; i < 31; i++) tick(2000, o => { o.members[0].memoryBytes += 8 * 1024 ** 2; });
    await flush();
  };
  return { guard, tick, pressureAndGrowth, reviewer, terminate, interest, inspect, validate, writes, audit, observation, finish: (r = result) => finish(r) };
}
afterEach(async () => { await Promise.all(guards.splice(0).map(g => g.stop())); await Promise.all(directories.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
describe('자동 관리 추세와 보호 규칙', () => {
  it('큰 footprint만으로 후보를 만들지 않고 60초 증가·연속 측정을 요구', () => {
    const points: Point[] = Array.from({ length: 31 }, (_, i) => ({ t: i * 2000, memoryBytes: GiB + i * 8 * 1024 ** 2, cpuPercent: 0.1 }));
    const p = { ...processInfo, memoryBytes: points.at(-1)!.memoryBytes };
    expect(growing(p, points)).toBe(true);
    expect(growing(p, points.slice(2))).toBe(false);
    expect(growing({ ...p, memoryBytes: GiB }, points.map(x => ({ ...x, memoryBytes: GiB })))).toBe(false);
    expect(growing(p, points.filter((_, i) => i < 5 || i > 8))).toBe(false);
    expect(growing({ ...p, memoryBytes: 500 * 1024 ** 2 }, points)).toBe(false);
    const decreasing = points.map((x, i) => ({ ...x, memoryBytes: i > 25 ? points[25].memoryBytes - (i - 25) * 1024 ** 2 : x.memoryBytes }));
    expect(growing({ ...p, memoryBytes: decreasing.at(-1)!.memoryBytes }, decreasing)).toBe(false);
  });
  it.each(['/Applications/Other.app/Contents/MacOS/Other', '/System/Library/worker', '/usr/libexec/worker', '/opt/codex/worker', '/opt/claude/worker', '/opt/paseo/worker', '/opt/Google Chrome/worker', '/opt/Terminal/worker'])('보호 대상 경로 %s', file => {
    expect(automaticProtection({ ...processInfo, path: file })).not.toBeNull();
  });
  it('일반 worker만 허용하며 경로 미확인도 차단', () => {
    expect(automaticProtection(processInfo)).toBeNull(); expect(automaticProtection({ ...processInfo, path: null })).not.toBeNull();
  });
  it('정상 압력에서는 스캔·리뷰를 추가하지 않음', async () => {
    const h = setup(); await h.guard.start(); h.observation.snapshot.pressure = 'normal';
    for (let i = 0; i < 400; i++) h.tick();
    expect(h.interest.mock.calls.some(([on]) => on)).toBe(false); expect(h.reviewer).not.toHaveBeenCalled();
  });
  it('120초 압력 + 60초 증가 후 허용 대상 하나에만 신호, 압력 회복 후에도 종료 확인', async () => {
    const h = setup(); await h.guard.start(); await h.pressureAndGrowth();
    expect(h.reviewer).toHaveBeenCalledOnce(); expect(h.terminate).toHaveBeenCalledOnce();
    expect(h.guard.report().targets).toHaveLength(0);
    expect(h.writes.some(s => s.targets.length === 0 && s.events.some(e => e.kind === 'review'))).toBe(true);
    for (let i = 0; i < 6; i++) h.tick(2000, o => { o.snapshot.pressure = 'normal'; });
    await flush(); expect(h.inspect).toHaveBeenCalledOnce(); expect(h.guard.report().events.at(-1)?.kind).toBe('exited');
    expect(h.interest.mock.calls.at(-1)).toEqual([false]);
    expect(h.audit.map(r => r.kind)).toEqual(['review', 'planned', 'sent', 'exited']);
    expect(h.audit.at(-1)?.target).toEqual(target); expect(h.audit.at(-1)?.before.pressure).toBe('critical');
    expect(h.audit.at(-1)?.after?.pressure).toBe('normal');
  });
  it('허용 목록이 비어 있으면 리뷰만, 모델의 terminate에도 신호 없음', async () => {
    const h = setup({ allowed: false }); await h.guard.start(); await h.pressureAndGrowth();
    expect(h.reviewer).toHaveBeenCalledOnce(); expect(h.terminate).not.toHaveBeenCalled();
  });
  it.each(['normal', 'unknown', 'stale', 'node', 'gap'] as const)('압력·수집 단절 %s는 지속 시간을 초기화', async mode => {
    const h = setup(); await h.guard.start(); h.guard.accept(); for (let i = 0; i < 50; i++) h.tick();
    h.tick(mode === 'gap' ? 6000 : 2000, o => {
      if (mode === 'normal' || mode === 'unknown') o.snapshot.pressure = mode;
      if (mode === 'stale') o.snapshot.status = 'stale'; if (mode === 'node') o.snapshot.helperMode = 'node';
    });
    h.observation.snapshot = structuredClone(base);
    for (let i = 0; i < 20; i++) h.tick();
    expect(h.interest.mock.calls.some(([on]) => on)).toBe(false);
  });
  it.each(['recovery', 'pid', 'path', 'busy', 'decrease', 'missing', 'stale', 'revoked', 'disabled', 'disk', 'headroom'] as const)('리뷰 중 %s 변화는 자동 종료 차단', async mode => {
    const h = setup({ deferred: true }); await h.guard.start(); await h.pressureAndGrowth();
    expect(h.reviewer).toHaveBeenCalledOnce();
    if (mode === 'revoked') await h.guard.target({ ...target, allow: false });
    else if (mode === 'disabled') await h.guard.configure({ ...h.guard.report().config, enabled: false });
    else h.tick(2000, o => {
      if (mode === 'recovery') o.snapshot.pressure = 'normal';
      if (mode === 'pid') o.members[0].start = '987';
      if (mode === 'path') o.members[0].path = '/opt/dev/different';
      if (mode === 'busy') o.members[0].cpuPercent = 10;
      if (mode === 'decrease') o.members[0].memoryBytes -= 16 * 1024 ** 2;
      if (mode === 'missing') o.members = [];
      if (mode === 'stale') o.snapshot.status = 'stale';
      if (mode === 'disk') o.snapshot.disk!.available = GiB - 1;
      if (mode === 'headroom') o.snapshot.memoryLevel = 2;
    });
    h.finish(); await flush(); expect(h.terminate).not.toHaveBeenCalled();
  });
  it('리뷰 대기 중에도 추세를 갱신하고 한 번만 호출하며 종료 직전 재확인', async () => {
    const h = setup({ deferred: true }); await h.guard.start(); await h.pressureAndGrowth();
    for (let i = 0; i < 15; i++) h.tick(2000, o => { o.members[0].memoryBytes += 8 * 1024 ** 2; });
    expect(h.reviewer).toHaveBeenCalledOnce(); h.finish(); await flush(); expect(h.terminate).toHaveBeenCalledOnce();
    for (let i = 0; i < 20; i++) h.tick(); await flush(); expect(h.reviewer).toHaveBeenCalledOnce();
  });
  it.each(['disk', 'memory', 'cpu', 'unknown'] as const)('리뷰 실행 여유 부족 %s는 AI 호출도 보류', async resource => {
    const h = setup(); await h.guard.start();
    if (resource === 'disk') h.observation.snapshot.disk!.available = GiB - 1;
    else if (resource === 'memory') h.observation.snapshot.memoryLevel = 2;
    else if (resource === 'cpu') h.observation.snapshot.cpu!.total = 90;
    else h.observation.snapshot.memoryLevel = null;
    await h.pressureAndGrowth(); expect(h.reviewer).not.toHaveBeenCalled(); expect(h.terminate).not.toHaveBeenCalled();
  });
  it('150초 조사에 증가 후보가 없으면 스캔을 끄고 15분 대기', async () => {
    const h = setup(); await h.guard.start(); h.guard.accept(); for (let i = 0; i < 138; i++) h.tick();
    expect(h.reviewer).not.toHaveBeenCalled(); expect(h.interest.mock.calls.at(-1)).toEqual([false]); expect(h.guard.status().phase).toBe('cooldown');
  });
  it('최근 15분 또는 24시간 6회 기록은 재시작 후에도 리뷰 차단', async () => {
    for (const limited of ['cooldown', 'daily']) {
      const state = initialState(); state.lastReviewAt = limited === 'cooldown' ? 999_999 : null;
      state.reviewTimes = limited === 'daily' ? Array(POLICY.dailyReviews).fill(999_999) : [];
      const h = setup({ state }); await h.guard.start(); await h.pressureAndGrowth();
      expect(h.reviewer).not.toHaveBeenCalled(); expect(h.interest.mock.calls.some(([on]) => on)).toBe(false);
    }
  });
  it('모델의 미지 대상·중복 결과는 종료하지 않음', async () => {
    for (const decisions of [[{ key: 'unknown', decision: 'terminate', reason: '이상' }], Array(2).fill({ key: processKey(target), decision: 'terminate', reason: '이상' })]) {
      const h = setup({ result: { decisions } as ReviewResult }); await h.guard.start(); await h.pressureAndGrowth();
      expect(h.terminate).not.toHaveBeenCalled(); expect(h.guard.report().events.some(e => e.kind === 'error')).toBe(true);
    }
  });
  it('저장 실패는 리뷰·종료를 차단', async () => {
    const h = setup({ write: async () => { throw new Error('저장 실패'); } }); await h.guard.start(); await h.pressureAndGrowth();
    expect(h.reviewer).not.toHaveBeenCalled(); expect(h.terminate).not.toHaveBeenCalled(); expect(h.guard.status().phase).toBe('error');
  });
  it('자동 종료 로그 저장 실패는 신호를 차단하고 오류 상태로 전환', async () => {
    let count = 0;
    const h = setup({ audit: async () => { if (++count === 2) throw new Error('로그 저장 실패'); } });
    await h.guard.start(); await h.pressureAndGrowth(); expect(h.terminate).not.toHaveBeenCalled(); expect(h.guard.status().phase).toBe('error');
  });
  it('종료 확인 실패를 완료라고 표시하지 않으며 추가 신호 없음', async () => {
    const h = setup(); h.inspect.mockResolvedValue('running' as never); await h.guard.start(); await h.pressureAndGrowth();
    for (let i = 0; i < 6; i++) h.tick(); await flush();
    expect(h.guard.report().events.at(-1)?.kind).toBe('still-running'); expect(h.terminate).toHaveBeenCalledOnce();
  });
  it('보호된 앱은 허용 요청 자체도 거절', async () => {
    const h = setup({ allowed: false }); await h.guard.start(); h.observation.members[0].path = '/Applications/App.app/Contents/MacOS/worker';
    expect((await h.guard.target({ ...target, allow: true })).changed).toBe(false);
    expect(h.guard.report().targets).toHaveLength(0);
  });
  it('경로가 정상이어도 네이티브의 소유자·상위 프로세스 검증을 통과해야 허용', async () => {
    const h = setup({ allowed: false }); await h.guard.start(); h.validate.mockResolvedValue({ allowed: false, error: 'Codex 자식 보호' });
    expect((await h.guard.target({ ...target, allow: true })).changed).toBe(false); expect(h.guard.report().targets).toHaveLength(0);
    h.validate.mockResolvedValue({ allowed: true, error: undefined });
    expect((await h.guard.target({ ...target, allow: true })).changed).toBe(true); expect(h.guard.report().targets).toEqual([target]);
    expect(h.terminate).not.toHaveBeenCalled();
  });
  it('리뷰 결과 뒤 기록 또는 마지막 조건 확인 실패는 신호를 보내지 않음', async () => {
    for (const failure of ['write', 'changed']) {
      let writes = 0; let h: ReturnType<typeof setup>;
      h = setup({ write: async () => { if (++writes === 2) { if (failure === 'write') throw new Error('기록 실패'); else h.observation.members[0].cpuPercent = 30; } } });
      await h.guard.start(); await h.pressureAndGrowth(); expect(h.reviewer).toHaveBeenCalledOnce(); expect(h.terminate).not.toHaveBeenCalled();
    }
  });
});
it('자동 관리 설정은 별도 0600 파일에 보존하고 손상·과대 파일은 중단', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-automation-')); directories.push(directory);
  const file = path.join(directory, 'automation.json');
  expect((await readAutomation(file)).config.enabled).toBe(false);
  const state = initialState(); state.config.enabled = true; state.targets = [target];
  await writeAutomation(state, file); expect(await readAutomation(file)).toEqual(state);
  expect((await stat(file)).mode & 0o777).toBe(0o600); expect(await readFile(file, 'utf8')).toContain('worker');
  await writeFile(file, 'broken'); await expect(readAutomation(file)).rejects.toThrow('자동 관리 설정');
  await writeFile(file, ' '.repeat(64 * 1024 + 1)); await expect(readAutomation(file)).rejects.toThrow('자동 관리 설정');
});
it('상세 로그는 0600 JSON lines로 직렬 저장하고 256 KiB에서 한 파일만 회전', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-audit-')); directories.push(directory);
  const file = path.join(directory, 'automatic-actions.jsonl'), audit = createAuditor(file);
  const record: AuditRecord = { v: 1, at: 1000, model: 'gpt-6-luna', kind: 'planned', target, decision: 'terminate', reason: '지속 증가',
    before: { pressure: 'critical', processMemoryBytes: GiB, processCpuPercent: 0.1, systemMemoryUsed: 14 * GiB, memoryLevel: 10, sampledAt: 1000, seq: 1 } };
  await Promise.all([audit(record), audit({ ...record, at: 1001, kind: 'sent' })]);
  expect((await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line).kind)).toEqual(['planned', 'sent']);
  expect((await stat(file)).mode & 0o777).toBe(0o600);
  await writeFile(file, 'x'.repeat(AUDIT_LIMIT)); await audit(record);
  expect((await stat(`${file}.1`)).size).toBe(AUDIT_LIMIT);
  expect(JSON.parse((await readFile(file, 'utf8')).trim()).target.start).toBe(target.start);
  await writeFile(file, 'y'.repeat(AUDIT_LIMIT)); await audit(record);
  expect((await readFile(`${file}.1`, 'utf8'))[0]).toBe('y'); expect((await stat(file)).size).toBeLessThan(AUDIT_LIMIT);
});
