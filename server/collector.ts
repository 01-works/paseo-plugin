import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { rawSchema, type RawSample, type Snapshot, type CpuTicks, type ProcessInfo } from '../shared/contracts';
import { computeCpu, computeMemory, emptySnapshot, pressure, sampleStatus } from '../shared/compute';
import { buildLocal, spawnSource, type NativeSource } from './helper-process';
import { nodeSample } from './node-fallback';
import { pluginRoot } from './host-info';

type Options = {
  platform?: string; root?: string; command?: { file: string; args: string[] }; now?: () => number;
  monotonicNow?: () => number; log?: (message: string) => void; backoffMs?: number;
};
export class Collector {
  private value: Snapshot;
  private members: ProcessInfo[] = [];
  private previousCpu: CpuTicks | null = null;
  private source?: NativeSource;
  private started = false;
  private stopped = false;
  private alive = false;
  private starting?: Promise<void>;
  private root?: string;
  private file?: string;
  private stage: 'prebuilt' | 'local' | 'node' = 'prebuilt';
  private received = false;
  private sourceStarted = 0;
  private successfulAt: number | null = null;
  private receivedMono: number | null = null;
  private lastIssue = '';
  private attempts = 0;
  private interest = false;
  private automaticInterest = false;
  private listeners = new Set<() => void>();
  private get scanning() { return this.interest || this.automaticInterest; }
  private interestTimer?: ReturnType<typeof setTimeout>;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setInterval>;
  private nodeTimer?: ReturnType<typeof setTimeout>;
  private nodeNext = 0;
  private nodeSeq = 0;
  private abort = new AbortController();
  private nodeInFlight?: Promise<void>;
  private invalidLogged = false;
  private streamInvalid = false;
  readonly options: Options;
  private now: () => number;
  private mono: () => number;
  private log: (message: string) => void;
  constructor(options: Options = {}) {
    this.options = options; this.now = options.now ?? Date.now; this.mono = options.monotonicNow ?? (() => performance.now());
    this.log = options.log ?? (message => console.log(`[mac-monitor] ${message}`));
    this.value = emptySnapshot((options.platform ?? process.platform) === 'darwin' ? 'native' : 'unsupported');
  }
  get mode(): Snapshot['helperMode'] { return this.value.helperMode; }
  start(): Promise<void> {
    if (this.started || this.value.helperMode === 'unsupported') return this.starting ?? Promise.resolve();
    this.started = true;
    this.watchdog = setInterval(() => {
      if (!this.source || this.stopped) return;
      const age = this.receivedMono === null ? this.mono() - this.sourceStarted : this.mono() - this.receivedMono;
      if (age > 15_000) {
        const source = this.source; this.lastIssue = '헬퍼 샘플이 15초 이상 중단됨';
        void source.close().then(() => this.exited(source, '헬퍼 샘플이 15초 이상 중단됨'));
      }
    }, 2000);
    return this.launch();
  }
  private launch(): Promise<void> {
    if (this.stopped || this.starting) return this.starting ?? Promise.resolve();
    this.starting = this.launchInner().finally(() => { this.starting = undefined; });
    return this.starting;
  }
  private async launchInner(): Promise<void> {
    if (this.stopped) return;
    try {
      if (!this.options.command) {
        this.root ??= this.options.root ?? await pluginRoot();
        if (this.stage === 'local' && !this.file) this.file = await buildLocal(this.root, this.abort.signal);
      }
      if (this.stopped) return;
      this.previousCpu = null; this.received = false; this.receivedMono = null; this.sourceStarted = this.mono();
      const file = this.options.command?.file ?? this.file ?? path.join(this.root!, 'bin/macmon-helper');
      const source = spawnSource(file, this.options.command?.args ?? [], line => this.receive(line), reason => this.exited(source, reason));
      this.source = source; this.alive = true;
      if (this.scanning) source.setProcesses(true);
      this.log(`헬퍼 시작 (${this.stage}, pid ${source.child.pid ?? '실행 대기'})`);
    } catch (error) {
      if (this.stopped) return;
      this.lastIssue = String(error); this.alive = false;
      // 로컬 빌드/경로 탐색 실패. 추가 자식 없이 Node 모드로 진행한다.
      this.enableNode();
    }
  }
  private receive(line: string): void {
    if (this.stopped) return;
    try {
      const sample = rawSchema.parse(JSON.parse(line));
      this.accept(sample); this.streamInvalid = false;
    } catch {
      this.streamInvalid = true; this.lastIssue = '헬퍼 JSON 또는 스키마 오류';
      if (!this.invalidLogged) { this.log(this.lastIssue); this.invalidLogged = true; }
    }
  }
  private accept(raw: RawSample): void {
    this.members = this.scanning ? raw.procs?.members ?? [] : [];
    const first = !this.received;
    const cpu = computeCpu(raw.sys.cpu, this.previousCpu);
    this.previousCpu = raw.sys.cpu;
    const memory = computeMemory(raw.sys);
    const valid = memory !== null && raw.sys.cpu !== null;
    this.received = true; this.receivedMono = this.mono();
    if (valid) this.successfulAt = this.receivedMono;
    if (valid && this.mono() - this.sourceStarted > 30_000) this.attempts = 0;
    if (first) this.log(`수집 활성 (${this.mode}, 2초 고정 간격)`);
    this.value = { ...this.value, seq: raw.seq, sampledAt: raw.t, ageMs: 0,
      cpu, memory, pressure: pressure(raw.sys.pressureLevel), memoryLevel: raw.sys.memoryLevel, swap: raw.sys.swap, disk: raw.sys.disk ?? null,
      processes: this.scanning && raw.procs ? (({ members: _members, ...groups }) => groups)(raw.procs) : null,
      processesStatus: this.mode === 'node' ? 'unsupported' : !this.scanning ? 'off' : raw.procs ? (raw.procs.ready ? 'ok' : 'warming') : raw.errors.some(e => e.includes('프로세스')) ? 'error' : 'warming',
      errors: [...raw.errors, ...(memory === null && raw.sys.vm ? [raw.sys.vm.speculative === null
        ? '메모리 speculative 카운터 없음 · 헬퍼 업데이트 필요' : '메모리 카운터 조합이 유효하지 않음'] : [])],
      status: valid ? cpu ? 'ok' : 'warming' : 'error' };
    this.lastIssue = valid ? '' : '시스템 측정 일부 실패';
    for (const listener of this.listeners) {
      try { listener(); } catch (error) { this.log(`관측 처리 실패: ${String(error)}`); }
    }
  }
  private exited(source: NativeSource, reason: string): void {
    if (this.stopped || this.source !== source) return;
    this.source = undefined; this.alive = false; this.lastIssue = reason; this.previousCpu = null;
    if (!this.received && !this.options.command) {
      if (this.stage === 'prebuilt') { this.stage = 'local'; this.file = undefined; this.log('prebuilt 실행 실패: 로컬 clang 빌드로 폴백'); }
      else { this.enableNode(); return; }
    }
    const delay = Math.min(60_000, (this.options.backoffMs ?? 1000) * 2 ** Math.min(this.attempts++, 10));
    this.log(`헬퍼 중단: ${reason}; ${delay}ms 후 재시작`);
    this.restartTimer = setTimeout(() => { this.restartTimer = undefined; void this.launch(); }, delay);
  }
  private enableNode(): void {
    if (this.stopped) return;
    this.stage = 'node'; this.value.helperMode = 'node'; this.previousCpu = null; this.alive = true;
    this.log(`Node 전용 모드로 폴백: ${this.lastIssue}; 앱 상위 목록 미지원`);
    this.received = false; this.nodeNext = this.mono(); this.sourceStarted = this.nodeNext;
    this.runNode();
  }
  private runNode(): void {
    if (this.stopped) return;
    this.nodeInFlight = nodeSample(this.nodeSeq++, this.abort.signal).then(sample => { if (!this.stopped) this.accept(sample); }).catch(error => { this.lastIssue = String(error); }).finally(() => {
      this.nodeInFlight = undefined;
      if (this.stopped) return;
      this.nodeNext += 2000; while (this.nodeNext <= this.mono()) this.nodeNext += 2000;
      this.nodeTimer = setTimeout(() => this.runNode(), Math.max(0, this.nodeNext - this.mono()));
    });
  }
  snapshot(includeProcesses = false): Snapshot {
    if (includeProcesses && !this.stopped && this.mode === 'native') {
      if (!this.interest) { const active = this.scanning; this.interest = true; if (!active) { this.value.processes = null; this.value.processesStatus = 'warming'; this.source?.setProcesses(true); } }
      clearTimeout(this.interestTimer);
      this.interestTimer = setTimeout(() => {
        this.interest = false; if (!this.scanning) { this.source?.setProcesses(false); this.value.processes = null; this.value.processesStatus = 'off'; }
      }, 30_000);
    }
    const ageMs = this.value.sampledAt === null ? null : Math.max(0, this.now() - this.value.sampledAt);
    // 상태 판정에는 단조 시계 사용: 시스템 시계 조정으로 오래된 샘플이 정상화되지 않는다.
    const freshAge = this.successfulAt === null ? (this.started ? this.mono() - this.sourceStarted : null) : Math.max(0, this.mono() - this.successfulAt);
    let status = sampleStatus(freshAge, this.alive, this.received && this.value.cpu !== null, this.mode === 'unsupported');
    if ((this.value.status === 'error' || this.streamInvalid) && status !== 'unsupported') status = 'error';
    let processesStatus = this.value.processesStatus;
    if (processesStatus === 'ok' || processesStatus === 'warming') {
      if (status === 'error') processesStatus = 'error'; else if (status === 'stale') processesStatus = 'stale';
    }
    return { ...this.value, status, ageMs, processes: includeProcesses ? this.value.processes : null, processesStatus,
      errors: this.lastIssue ? [...this.value.errors, this.lastIssue] : [...this.value.errors] };
  }
  async stop(): Promise<void> {
    this.stopped = true; this.alive = false; this.abort.abort();
    clearTimeout(this.interestTimer); clearTimeout(this.restartTimer); clearTimeout(this.nodeTimer); clearInterval(this.watchdog);
    this.listeners.clear();
    await this.source?.close(); this.source = undefined;
    await Promise.all([this.starting, this.nodeInFlight]);
  }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  setAutomaticInterest(on: boolean) {
    if (this.stopped) return;
    const was = this.scanning; this.automaticInterest = on;
    if (was !== this.scanning) {
      this.source?.setProcesses(this.scanning); this.value.processes = null;
      this.value.processesStatus = this.scanning ? 'warming' : 'off';
    }
  }
  observeAutomation() { return { snapshot: this.snapshot(false), members: [...this.members] }; }
  async inspectAutomatically(target: { pid: number; start: string; path: string }) {
    if (!this.source || this.stopped || this.mode !== 'native') return 'unknown' as const;
    return this.source.inspect(target.pid, target.start, target.path);
  }
  async validateAutomatically(target: { pid: number; start: string; path: string }) {
    if (!this.source || this.stopped || this.mode !== 'native') return { allowed: false, error: '자동 관리 미지원' };
    return this.source.validateAuto(target.pid, target.start, target.path);
  }
  async terminateAutomatically(target: ProcessInfo & { path: string }) {
    const observation = this.observeAutomation();
    if (observation.snapshot.status !== 'ok' || observation.snapshot.processesStatus !== 'ok'
      || !observation.members.some(p => p.pid === target.pid && p.start === target.start && p.path === target.path && p.group === target.group))
      return { sent: false, error: '자동 종료 대상이 변경되었거나 측정값이 오래되었습니다.' };
    if (!this.source || this.stopped || this.mode !== 'native') return { sent: false, error: '자동 종료 미지원' };
    return this.source.terminate(target.pid, target.start, target.path);
  }
  processList(group: string) {
    const snapshot = this.snapshot(true);
    const entries = snapshot.processes ? this.members.filter(p => p.group === group).sort((a, b) => (b.cpuPercent ?? -1) - (a.cpuPercent ?? -1)) : [];
    return { status: snapshot.processesStatus, sampledAt: snapshot.processes?.sampledAt ?? null, entries };
  }
  async terminate(input: { pid: number; start: string; group: string }): Promise<{ sent: boolean; error?: string }> {
    const list = this.processList(input.group);
    if (list.status !== 'ok' || !list.entries.some(p => p.pid === input.pid && p.start === input.start)) return { sent: false, error: '대상이 없거나 측정값이 오래되었습니다. 목록을 다시 확인하세요.' };
    if (!this.source || this.stopped || this.mode !== 'native') return { sent: false, error: '프로세스 종료 미지원' };
    return this.source.terminate(input.pid, input.start);
  }
  async terminateGroup(input: { group: string; targets: { pid: number; start: string }[] }) {
    const list = this.processList(input.group);
    const source = this.source;
    // 확인한 목록만 대상으로 한다. 새 프로세스를 추가하거나 변경된 PID를 따라가지 않는다.
    const valid = list.status === 'ok' && source && !this.stopped && this.mode === 'native'
      && input.targets.length > 0 && new Set(input.targets.map(p => p.pid)).size === input.targets.length
      && input.targets.every(p => list.entries.some(entry => entry.pid === p.pid && entry.start === p.start));
    if (!valid) return { results: input.targets.map(p => ({ pid: p.pid, sent: false, error: '대상 목록이 변경되었거나 측정값이 오래되었습니다. 다시 확인하세요.' })) };
    const results = await Promise.all(input.targets.map(async p => ({ pid: p.pid, ...await source.terminate(p.pid, p.start) })));
    return { results };
  }
}
let singleton: Collector | undefined;
export function getCollector(): Collector { return singleton ??= new Collector(); }
export async function stopCollector(): Promise<void> { const current = singleton; singleton = undefined; await current?.stop(); }
