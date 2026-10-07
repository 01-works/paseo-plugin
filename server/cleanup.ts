import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { CLEANUP_LIMIT, OBSERVE_MS, RESULT_TTL_MS, processKey, type CleanupItem, type CleanupState, type ProcessMetadata } from '../shared/cleanup';
import type { Collector } from './collector';
import { Observation, eligibleMetadata, historyCandidates, publicCommand, redact, sameMetadata, type ObservedCandidate } from './cleanup-policy';
import { createCodexReviewer, validateReview, type Reviewer } from './cleanup-reviewer';

type Source = Pick<Collector, 'observeInspection' | 'inspectProcess' | 'terminateInspected' | 'processHistory'>;
type Job = { state: CleanupState; abort: AbortController; metadata: Map<string, ProcessMetadata>; attempted: Set<string>;
  task?: Promise<void>; terminating?: Promise<unknown>; expiresMono?: number; running: boolean };
export class Cleanup {
  private job?: Job;
  private stopped = false;
  private now: () => number;
  constructor(private source: Source, private reviewer: Reviewer = createCodexReviewer(), options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => performance.now());
  }
  start(): CleanupState {
    if (this.stopped) throw new Error('플러그인이 종료되었습니다');
    if (this.job && (this.job.running || this.job.terminating)) throw new Error('정리 검사가 이미 진행 중입니다');
    const job: Job = { abort: new AbortController(), metadata: new Map(), attempted: new Set(), running: true, state: {
      id: randomUUID(), phase: 'observing', observedSeconds: 0, sampledAt: null, expiresAt: null, items: [], truncated: false,
    } };
    this.job?.abort.abort(); this.job = job; job.task = this.run(job).finally(() => { job.running = false; }); return this.get(job.state.id);
  }
  get(id: string): CleanupState {
    const job = this.requireJob(id);
    if (job.expiresMono !== undefined && this.now() > job.expiresMono) {
      job.state = { ...job.state, phase: 'error', items: [], error: '검사 결과가 만료되었습니다. 다시 검사하세요' }; job.metadata.clear();
    }
    return { ...job.state, items: job.state.items.map(item => ({ ...item })) };
  }
  cancel(id: string): { cancelled: boolean } {
    if (!this.job || this.job.state.id !== id) return { cancelled: false };
    const job = this.job; job.abort.abort(); job.metadata.clear();
    job.state = { ...job.state, phase: 'cancelled', items: [] }; return { cancelled: true };
  }
  private requireJob(id: string): Job {
    if (!this.job || this.job.state.id !== id) throw new Error('해당 기기의 검사 결과가 없습니다'); return this.job;
  }
  private async run(job: Job): Promise<void> {
    const signal = job.abort.signal;
    let release = () => {};
    try {
      const observation = new Observation();
      let candidates: ObservedCandidate[] | undefined;
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined; let settled = false;
        const finish = (error?: string) => { if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); error ? reject(new Error(error)) : resolve(); };
        const abort = () => finish('검사 취소'); signal.addEventListener('abort', abort, { once: true });
        let lastSample: number | undefined;
        try {
          release = this.source.observeInspection((sample, sampledAt, issue) => {
            if (signal.aborted || settled) return;
            if (issue || !sample) { finish(issue ?? '관찰 정보 확인 불가'); return; }
            if (sampledAt === lastSample) return; lastSample = sampledAt;
            if (!job.state.observationSource && sample.ready === true) {
              const recent = historyCandidates(sample.entries, sampledAt, (pid, start) => this.source.processHistory(pid, start));
              if (recent) {
                candidates = recent;
                job.state = { ...job.state, observationSource: 'history', sampledAt, truncated: job.state.truncated || sample.truncated };
                finish(); return;
              }
              job.state = { ...job.state, observationSource: 'live' };
            }
            observation.accept(sample.entries, this.now());
            job.state = { ...job.state, observedSeconds: observation.seconds, sampledAt,
              truncated: job.state.truncated || sample.truncated };
            if (observation.seconds * 1000 >= OBSERVE_MS) finish();
          });
          if (!settled) timer = setTimeout(() => finish('관찰 시간이 초과되었습니다. 최신 측정을 확인하세요'), 22_000);
          if (signal.aborted) abort();
        } catch (error) { finish(String(error)); }
      });
      if (signal.aborted) return;
      const items: CleanupItem[] = []; let unread = 0;
      for (const p of candidates ?? observation.candidates()) {
        if (signal.aborted) return;
        try {
          const metadata = await this.source.inspectProcess(p.pid, p.start);
          if (signal.aborted) return;
          if (!metadata.protected && (!metadata.path || !metadata.args || metadata.cpuPercent === null)) { unread++; continue; }
          if (!eligibleMetadata(metadata) || processKey(metadata) !== processKey(p) || metadata.parentPid !== p.parentPid
            || metadata.group !== p.group || metadata.name !== p.name) continue;
          job.metadata.set(processKey(p), metadata);
          items.push({ ...p, name: redact(p.name), group: redact(p.group), parentPid: metadata.parentPid, parentName: metadata.parentName ? redact(metadata.parentName) : null,
            command: publicCommand(metadata), cwd: metadata.cwd ? redact(metadata.cwd) : null,
            history: p.history ?? this.source.processHistory(p.pid, p.start), decision: 'uncertain', reason: '' });
        } catch { unread++; }
      }
      if (signal.aborted) return;
      // 메타데이터의 CPU 대조까지 기준 캐시를 유지한다. 모델을 기다리는 동안에는 관찰하지 않는다.
      release(); release = () => {};
      if (!items.length && unread) throw new Error('대상의 실행 정보를 확인하지 못했습니다. 다시 검사하세요');
      job.state = { ...job.state, phase: 'reviewing', truncated: job.state.truncated || unread > 0 };
      if (items.length) {
        const input = { items }, result = validateReview(await this.reviewer(input, signal), input);
        if (signal.aborted) return;
        const decisions = new Map(result.decisions.map(d => [d.key, d]));
        job.state.items = items.map(item => ({ ...item, decision: decisions.get(processKey(item))!.decision,
          reason: redact(decisions.get(processKey(item))!.reason).slice(0, 240) }));
      }
      job.expiresMono = this.now() + RESULT_TTL_MS;
      job.state = { ...job.state, phase: 'ready', expiresAt: Date.now() + RESULT_TTL_MS };
    } catch (error) {
      if (!signal.aborted) { job.metadata.clear(); job.state = { ...job.state, phase: 'error', items: [], error: redact(error instanceof Error ? error.message : String(error)).slice(0, 300) }; }
    } finally { release(); if (signal.aborted) job.metadata.clear(); }
  }
  async terminate(id: string, targets: { pid: number; start: string }[]) {
    const job = this.requireJob(id);
    if (job.terminating) throw new Error('종료 요청이 이미 진행 중입니다');
    const operation = this.terminateSelected(job, targets); job.terminating = operation;
    try { return await operation; } finally { if (job.terminating === operation) job.terminating = undefined; }
  }
  private async terminateSelected(job: Job, targets: { pid: number; start: string }[]) {
    const denied = (error: string) => ({ results: targets.map(p => ({ ...p, sent: false, error })) });
    const state = this.get(job.state.id);
    if (this.stopped || job.abort.signal.aborted || state.phase !== 'ready' || !targets.length || targets.length > CLEANUP_LIMIT
      || new Set(targets.map(processKey)).size !== targets.length) return denied('최신 검사 결과와 선택한 대상이 필요합니다');
    for (const p of targets) {
      const key = processKey(p), item = state.items.find(value => processKey(value) === key), metadata = job.metadata.get(key);
      if (item?.decision !== 'candidate' || !metadata || job.attempted.has(key)) return denied('검사에서 선택할 수 없는 대상이거나 이미 종료를 요청했습니다');
      try {
        if (!sameMetadata(metadata, await this.source.inspectProcess(p.pid, p.start))) return denied('실행 정보 또는 활동이 변경되었습니다. 다시 검사하세요');
      } catch { return denied('대상의 최신 실행 정보를 확인할 수 없습니다'); }
      if (job.abort.signal.aborted || this.job !== job) return denied('검사가 종료되어 요청을 취소했습니다');
    }
    if (job.abort.signal.aborted || this.job !== job || job.expiresMono === undefined || this.now() > job.expiresMono)
      return denied('검사 결과가 만료되었거나 취소되었습니다');
    // 모든 대상을 먼저 확인한 뒤, 중복 RPC가 신호를 다시 보내지 않도록 시도를 소비한다.
    targets.forEach(p => job.attempted.add(processKey(p)));
    const results = [];
    for (const p of targets) {
      if (job.abort.signal.aborted || this.job !== job) { results.push({ ...p, sent: false, error: '검사가 종료되어 요청을 취소했습니다' }); continue; }
      try { results.push({ ...p, ...await this.source.terminateInspected(p.pid, p.start) }); }
      catch { results.push({ ...p, sent: false, error: '종료 요청 응답을 확인할 수 없습니다' }); }
    }
    return { results };
  }
  async stop(): Promise<void> {
    this.stopped = true; const job = this.job; if (!job) return;
    this.cancel(job.state.id); await Promise.allSettled([job.task, job.terminating]);
  }
}
