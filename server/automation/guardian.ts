import { performance } from 'node:perf_hooks';
import { automaticProtection, automationConfigSchema, processKey, REVIEW_MAX_AGE_MS, type AutomationConfig, type AutomaticTarget, type AutomationEvent, type AutomationStatus, type AutomationTargetInput, type ReviewedProcess, type ReviewConfirmInput } from '../../shared/automation';
import type { ProcessInfo, Snapshot } from '../../shared/contracts';
import { abovePressure, canAutomaticallyTerminate, growing, healthy, POLICY, sameTarget, reviewHeadroom, type Candidate, type Point } from './policy';
import { createCodexReviewer, validateReview, type Reviewer } from './reviewer';
import { initialState, readAutomation, writeAutomation, type AutomationState } from './store';
import type { ProcessState } from '../helper-process';
import { auditMetrics, createAuditor, type AuditRecord, type Auditor } from './audit';

export interface GuardCollector {
  subscribe(listener: () => void): () => void;
  setAutomaticInterest(on: boolean): void;
  observeAutomation(): { snapshot: Snapshot; members: ProcessInfo[] };
  terminateAutomatically(target: ProcessInfo & { path: string }): Promise<{ sent: boolean; error?: string }>;
  inspectAutomatically(target: { pid: number; start: string; path: string }): Promise<ProcessState>;
  validateAutomatically(target: { pid: number; start: string; path: string }): Promise<{ allowed: boolean; error?: string }>;
  terminate(target: { pid: number; start: string; group: string }): Promise<{ sent: boolean; error?: string }>;
}
type Options = { reviewer?: Reviewer; read?: () => Promise<AutomationState>; write?: (state: AutomationState) => Promise<void>; audit?: Auditor;
  now?: () => number; mono?: () => number; log?: (message: string) => void };
export class MemoryGuardian {
  private state = initialState();
  private phase: AutomationStatus['phase'] = 'off';
  private failure = '';
  private stopped = false;
  private ready = false;
  private pressureSince: number | null = null;
  private lastSample: number | null = null;
  private scanSince: number | null = null;
  private histories = new Map<string, Point[]>();
  private inFlight?: Promise<void>;
  private abort?: AbortController;
  private unsubscribe?: () => void;
  private writes: Promise<void> = Promise.resolve();
  private revision = 0;
  private pendingExit = new Map<string, { record: AuditRecord; at: number }>();
  private confirmations = new Set<Promise<void>>();
  private actions = new Set<Promise<{ sent: boolean; error?: string }>>();
  private reviewer: Reviewer;
  private auditor: Auditor;
  private now: () => number;
  private mono: () => number;
  constructor(private collector: GuardCollector, private options: Options = {}) {
    this.reviewer = options.reviewer ?? createCodexReviewer(); this.now = options.now ?? Date.now;
    this.auditor = options.audit ?? createAuditor();
    this.mono = options.mono ?? (() => performance.now());
  }
  async start() {
    try {
      this.state = await (this.options.read ?? readAutomation)(); this.ready = true; this.phase = this.state.config.enabled ? 'idle' : 'off';
      if (this.state.reviews.some(r => r.outcome === 'requested' || r.outcome === 'sent')) {
        // 이전 실행의 신호 전송 여부를 추측하거나 재시도하지 않는다.
        this.state.reviews = this.state.reviews.map(r => r.outcome === 'requested' || r.outcome === 'sent' ? { ...r, outcome: 'unknown' } : r);
        await this.save();
      }
    }
    catch (error) { this.fail(String(error)); }
    if (!this.stopped) this.unsubscribe = this.collector.subscribe(() => this.accept());
  }
  status(): AutomationStatus { return { enabled: this.ready && !this.failure && this.state.config.enabled, phase: this.phase,
    model: 'gpt-6-luna', targetCount: this.state.targets.length,
    pendingReviewCount: this.state.reviews.filter(r => r.outcome === 'pending' && r.decision !== 'normal' && r.target.path
      && this.now() >= r.at && this.now() - r.at <= REVIEW_MAX_AGE_MS).length,
    lastEvent: this.state.events.at(-1) ?? null }; }
  report() { return { config: { ...this.state.config }, targets: [...this.state.targets], status: this.status(), events: [...this.state.events], reviews: structuredClone(this.state.reviews) }; }
  isAllowed(p: ProcessInfo) { return this.state.targets.some(t => sameTarget(p, t)); }
  private save() {
    const snapshot = structuredClone(this.state);
    const result = this.writes.catch(() => {}).then(() => (this.options.write ?? writeAutomation)(snapshot));
    this.writes = result;
    return result.catch(error => { this.fail(`자동 관리 기록 저장 실패: ${String(error)}`); throw error; });
  }
  private event(kind: AutomationEvent['kind'], message: string, pid?: number) {
    this.state.events = [...this.state.events, { at: this.now(), kind, message: message.slice(0, 500), ...(pid ? { pid } : {}) }].slice(-20);
    this.options.log?.(`[mac-monitor] 자동 관리: ${kind} · ${message.slice(0, 240)}`);
  }
  private async audit(record: AuditRecord) {
    try { await this.auditor(record); }
    catch (error) { this.fail('자동 종료 로그 저장 실패 · 자동 조치를 중단했습니다.'); void this.save().catch(() => {}); throw error; }
  }
  private fail(message: string) {
    this.failure = message; this.phase = 'error'; this.abort?.abort(); this.collector.setAutomaticInterest(false);
    this.event('error', message);
  }
  async configure(input: AutomationConfig) {
    this.state.config = automationConfigSchema.parse(input); this.revision++; this.abort?.abort(); this.reset();
    await this.save(); this.failure = ''; this.ready = true; this.phase = input.enabled ? 'idle' : 'off'; return this.report();
  }
  async target(input: AutomationTargetInput) {
    const key = processKey(input);
    if (!input.allow) {
      this.state.targets = this.state.targets.filter(t => processKey(t) !== key); this.revision++; this.abort?.abort();
      await this.save(); return { changed: true };
    }
    const { snapshot, members } = this.collector.observeAutomation();
    const p = members.find(p => processKey(p) === key && p.group === input.group);
    const reason = p ? automaticProtection(p) : '대상 프로세스 없음';
    if (!this.ready || !healthy(snapshot) || snapshot.processesStatus !== 'ok' || reason || !p?.path || Buffer.byteLength(p.path) > 511)
      return { changed: false, error: reason ?? '최신 네이티브 측정이 필요합니다.' };
    if (!sameTarget(p, input)) return { changed: false, error: '확인한 프로세스 정보가 변경되었습니다. 다시 선택하세요.' };
    if (this.state.targets.length >= 32 && !this.isAllowed(p)) return { changed: false, error: '자동 관리 대상은 최대 32개입니다.' };
    const target: AutomaticTarget = { pid: p.pid, start: p.start, name: p.name, group: p.group, path: p.path };
    const revision = this.revision;
    const validation = await this.collector.validateAutomatically(target);
    if (this.stopped || revision !== this.revision) return { changed: false, error: '자동 관리 설정이 변경되었습니다. 다시 확인하세요.' };
    if (!validation.allowed) return { changed: false, error: validation.error ?? '자동 관리 보호 대상입니다.' };
    const fresh = this.collector.observeAutomation();
    const current = fresh.members.find(p => processKey(p) === key);
    if (!healthy(fresh.snapshot) || fresh.snapshot.processesStatus !== 'ok' || !current || !sameTarget(current, target))
      return { changed: false, error: '확인한 프로세스 정보가 변경되었습니다. 다시 선택하세요.' };
    this.state.targets = [...this.state.targets.filter(t => processKey(t) !== key), target]; this.revision++; this.abort?.abort();
    await this.save(); return { changed: true };
  }
  confirm(input: ReviewConfirmInput) {
    const work = this.confirmReview(input);
    this.actions.add(work); void work.then(() => this.actions.delete(work), () => this.actions.delete(work));
    return work;
  }
  private reviewedTarget(input: ReviewConfirmInput) {
    const observation = this.collector.observeAutomation();
    const p = observation.members.find(p => sameTarget(p, input));
    return healthy(observation.snapshot) && observation.snapshot.processesStatus === 'ok' && p ? { ...observation, process: p } : null;
  }
  private outcome(record: AuditRecord, outcome: ReviewedProcess['outcome']) {
    const review = this.state.reviews.find(r => r.at === record.reviewedAt && processKey(r.target) === processKey(record.target));
    if (review) review.outcome = outcome;
  }
  private async confirmReview(input: ReviewConfirmInput): Promise<{ sent: boolean; error?: string }> {
    const review = this.state.reviews.find(r => r.at === input.reviewedAt && sameTarget(r.target, input));
    if (!this.ready || this.failure || this.stopped || this.inFlight || !review || review.decision === 'normal' || review.outcome !== 'pending'
      || this.now() < review.at || this.now() - review.at > REVIEW_MAX_AGE_MS)
      return { sent: false, error: '확인할 최신 리뷰가 없거나 이미 처리했습니다. 다시 확인하세요.' };
    const current = this.reviewedTarget(input);
    if (!current) return { sent: false, error: '대상이 변경되었거나 측정값이 오래되었습니다. 다시 확인하세요.' };
    const revision = this.revision;
    const record: AuditRecord = { v: 1, at: this.now(), model: 'gpt-6-luna', mode: 'confirmed', reviewedAt: review.at,
      kind: 'planned', target: { ...review.target }, decision: review.decision, reason: review.reason, before: auditMetrics(current.snapshot, current.process) };
    // 확인한 실행 인스턴스에 한 번만 시도한다. 동시 요청·재시작으로 신호를 재전송하지 않는다.
    review.outcome = 'requested'; this.state.targets = this.state.targets.filter(t => processKey(t) !== processKey(input));
    try {
      await this.save(); await this.audit(record);
      const fresh = this.reviewedTarget(input);
      if (this.stopped || this.failure || revision !== this.revision || !fresh || this.now() - review.at > REVIEW_MAX_AGE_MS) {
        this.outcome(record, 'cancelled');
        await this.audit({ ...record, at: this.now(), kind: 'cancelled', reason: '종료 확인 도중 대상·측정·설정이 변경되었습니다.' });
        await this.save(); return { sent: false, error: '종료 확인 도중 상태가 변경되었습니다. 다시 확인하세요.' };
      }
      const result = await this.collector.terminate({ pid: input.pid, start: input.start, group: input.group });
      this.outcome(record, result.sent ? 'sent' : 'refused');
      this.event(result.sent ? 'sent' : 'skipped', result.sent ? '사용자 확인 후 종료 신호를 보냈습니다.' : result.error ?? '종료 신호 전송 실패', input.pid);
      if (result.sent) this.pendingExit.set(processKey(input), { record, at: this.mono() });
      const after = this.collector.observeAutomation();
      await this.audit({ ...record, at: this.now(), kind: result.sent ? 'sent' : 'refused',
        reason: result.sent ? review.reason : (result.error ?? '종료 신호 전송 실패').slice(0, 500),
        after: auditMetrics(after.snapshot, after.members.find(p => sameTarget(p, input))) });
      await this.save(); return result;
    } catch {
      this.outcome(record, 'unknown');
      if (!this.failure) {
        this.event('error', '확인 종료의 전송·기록을 완료하지 못했습니다. 다시 신호를 보내지 않습니다.', input.pid);
        await this.audit({ ...record, at: this.now(), kind: 'unknown', reason: '확인 종료의 전송·기록 실패' }).catch(() => {});
      }
      await this.save().catch(() => {});
      return { sent: false, error: '확인 종료를 완료하지 못했습니다. 기록과 현재 프로세스를 확인하세요.' };
    }
  }
  private reset() {
    this.pressureSince = null; this.lastSample = null; this.scanSince = null; this.histories.clear();
    this.collector.setAutomaticInterest(false);
  }
  private budgetAvailable() {
    const now = this.now();
    this.state.reviewTimes = this.state.reviewTimes.filter(t => now - t < 24 * 3600_000);
    return this.state.reviewTimes.length < POLICY.dailyReviews
      && (this.state.lastReviewAt === null || now - this.state.lastReviewAt >= POLICY.cooldownMs);
  }
  accept() {
    if (this.stopped) return;
    this.checkExits(this.mono());
    if (!this.ready || this.failure) return;
    const { snapshot: s, members } = this.collector.observeAutomation(); const now = this.mono();
    if (!this.state.config.enabled || !abovePressure(s, this.state.config)) {
      this.abort?.abort(); this.reset(); this.phase = this.state.config.enabled ? 'idle' : 'off'; return;
    }
    if (this.lastSample !== null && (now <= this.lastSample || now - this.lastSample > 5000)) {
      this.abort?.abort(); this.reset();
    }
    this.lastSample = now; this.pressureSince ??= now;
    if (now - this.pressureSince < this.state.config.sustainedSeconds * 1000) { this.phase = 'watching'; return; }
    if (!this.inFlight && !this.budgetAvailable()) { this.phase = 'cooldown'; this.collector.setAutomaticInterest(false); return; }
    if (!reviewHeadroom(s, this.now())) {
      this.event('skipped', '리뷰를 실행할 여유 부족 · 자동 조치를 보류했습니다.');
      this.state.lastReviewAt = this.now(); this.abort?.abort(); this.reset();
      void this.save().catch(() => {}); this.phase = 'cooldown'; return;
    }
    if (this.scanSince === null) { this.scanSince = now; this.histories.clear(); this.collector.setAutomaticInterest(true); }
    if (!this.inFlight && now - this.scanSince > POLICY.scanMs) {
      this.event('skipped', '지속 증가 후보 없음 · 이번 조사를 마쳤습니다.'); this.state.lastReviewAt = this.now();
      this.scanSince = null; this.histories.clear(); this.collector.setAutomaticInterest(false);
      void this.save().catch(() => {}); this.phase = 'cooldown'; return;
    }
    this.phase = this.inFlight ? 'reviewing' : 'sampling';
    if (s.processesStatus !== 'ok') { this.histories.clear(); return; }
    const selected = [...members].sort((a, b) => Number(this.isAllowed(b)) - Number(this.isAllowed(a)) || b.memoryBytes - a.memoryBytes).slice(0, POLICY.maxHistories);
    const keys = new Set(selected.map(processKey));
    for (const key of this.histories.keys()) if (!keys.has(key)) this.histories.delete(key);
    const candidates: Candidate[] = [];
    for (const p of selected) {
      const key = processKey(p), points = (this.histories.get(key) ?? []).filter(x => now - x.t <= POLICY.historyMs + 2500);
      points.push({ t: now, memoryBytes: p.memoryBytes, cpuPercent: p.cpuPercent }); this.histories.set(key, points);
      if (growing(p, points)) candidates.push({ process: { ...p }, points: [...points], growthBytes: p.memoryBytes - points[0].memoryBytes, approved: this.isAllowed(p) && !automaticProtection(p) });
    }
    // 리뷰 중에도 같은 2초 샘플로 추세를 갱신한다. 오래된 증가 추세로 종료하지 않는다.
    if (this.inFlight || this.actions.size || !this.budgetAvailable()) return;
    const chosen = candidates.sort((a, b) => Number(b.approved) - Number(a.approved) || b.growthBytes - a.growthBytes).slice(0, POLICY.maxCandidates);
    if (!chosen.length) return;
    this.abort = new AbortController(); this.phase = 'reviewing';
    const work = this.review(chosen, s, this.abort.signal, this.revision);
    this.inFlight = work; void work.then(() => { if (this.inFlight === work) this.inFlight = undefined; }, error => {
      this.fail(`자동 관리 처리 실패: ${String(error)}`); if (this.inFlight === work) this.inFlight = undefined;
    });
  }
  private async review(candidates: Candidate[], original: Snapshot, signal: AbortSignal, revision: number) {
    try {
      this.state.lastReviewAt = this.now(); this.state.reviewTimes.push(this.now()); await this.save();
      if (this.stopped || signal.aborted) return;
      const input = { pressure: original.pressure, memoryUsed: original.memory!.used, memoryTotal: original.memory!.total, candidates };
      const result = validateReview(await this.reviewer(input, signal), input);
      if (this.stopped || signal.aborted || revision !== this.revision || this.failure) return;
      const reviewedAt = this.now();
      this.state.reviews = result.decisions.map(d => {
        const c = candidates.find(c => processKey(c.process) === d.key)!;
        return { at: reviewedAt, target: { pid: c.process.pid, start: c.process.start, path: c.process.path ?? null, group: c.process.group, name: c.process.name },
          decision: d.decision, reason: d.reason, memoryBytes: c.process.memoryBytes, growthBytes: c.growthBytes, outcome: 'pending' };
      });
      let attempted = false;
      for (const decision of result.decisions) {
        if (this.stopped || signal.aborted || revision !== this.revision || this.failure) break;
        const c = candidates.find(c => processKey(c.process) === decision.key)!;
        const record: AuditRecord = { v: 1, at: this.now(), model: 'gpt-6-luna', mode: 'automatic', reviewedAt, kind: 'review',
          target: { pid: c.process.pid, start: c.process.start, path: c.process.path ?? null, group: c.process.group, name: c.process.name },
          decision: decision.decision, reason: decision.reason, before: auditMetrics(original, c.process) };
        await this.audit(record);
        const labels = { normal: '정상', observe: '관찰', terminate: '종료 검토' };
        this.event('review', `${c.process.group} · ${labels[decision.decision]}: ${decision.reason}`, c.process.pid);
        if (this.stopped || signal.aborted || revision !== this.revision || this.failure) break;
        if (decision.decision !== 'terminate' || !c.approved) continue;
        if (attempted) {
          const reason = '한 번의 리뷰에서는 프로세스 하나만 종료를 시도합니다.';
          this.event('skipped', reason, c.process.pid);
          await this.audit({ ...record, at: this.now(), kind: 'refused', reason }); continue;
        }
        const current = this.collector.observeAutomation(); const p = current.members.find(p => processKey(p) === decision.key);
        if (!abovePressure(current.snapshot, this.state.config) || !reviewHeadroom(current.snapshot, this.now()) || current.snapshot.processesStatus !== 'ok' || !p
          || !canAutomaticallyTerminate(p, c, this.state.targets) || !this.currentlyGrowing(p)) {
          const reason = '종료 조건 변경 또는 보호 대상 · 종료하지 않았습니다.';
          this.event('skipped', reason, c.process.pid);
          await this.audit({ ...record, at: this.now(), kind: 'refused', reason, after: auditMetrics(current.snapshot, p) }); continue;
        }
        // 한 번의 시도만 허용한다. 재시작·기록 실패 후 자동으로 다시 신호를 보내지 않는다.
        const permission = this.state.targets.find(t => sameTarget(p, t))!;
        this.state.targets = this.state.targets.filter(t => processKey(t) !== decision.key);
        this.outcome(record, 'requested');
        attempted = true;
        await this.save();
        const planned = { ...record, at: this.now(), kind: 'planned' as const, before: auditMetrics(current.snapshot, p) };
        await this.audit(planned);
        if (this.stopped || signal.aborted || revision !== this.revision || this.failure) {
          this.outcome(record, 'cancelled');
          await this.audit({ ...planned, at: this.now(), kind: 'cancelled', reason: '설정 변경·취소로 종료 신호를 보내지 않았습니다.' }); break;
        }
        const fresh = this.collector.observeAutomation(); const target = fresh.members.find(x => processKey(x) === decision.key);
        if (!target?.path || !abovePressure(fresh.snapshot, this.state.config) || !reviewHeadroom(fresh.snapshot, this.now()) || fresh.snapshot.processesStatus !== 'ok'
          || !canAutomaticallyTerminate(target, c, [permission]) || !this.currentlyGrowing(target)) {
          this.event('skipped', '최종 확인 실패 · 종료하지 않았습니다.', c.process.pid);
          this.outcome(record, 'cancelled');
          await this.audit({ ...planned, at: this.now(), kind: 'cancelled', reason: '최종 확인 실패', after: auditMetrics(fresh.snapshot, target) }); continue;
        }
        const sent = await this.collector.terminateAutomatically({ ...target, path: target.path });
        this.outcome(record, sent.sent ? 'sent' : 'refused');
        this.event(sent.sent ? 'sent' : 'skipped', sent.sent ? '자동 종료 신호를 보냈습니다.' : sent.error ?? '종료 신호 전송 실패', p.pid);
        if (sent.sent) this.pendingExit.set(decision.key, { record: planned, at: this.mono() });
        const after = this.collector.observeAutomation();
        await this.audit({ ...planned, at: this.now(), kind: sent.sent ? 'sent' : 'refused',
          reason: sent.sent ? decision.reason : (sent.error ?? '종료 신호 전송 실패').slice(0, 500),
          after: auditMetrics(after.snapshot, after.members.find(x => processKey(x) === decision.key)) });
      }
      await this.save();
    } catch (error) {
      if (!signal.aborted && !this.stopped) { this.event('error', String(error)); await this.save().catch(() => {}); }
    } finally {
      if (!this.stopped && !this.failure) this.phase = this.state.config.enabled ? 'cooldown' : 'off';
      this.collector.setAutomaticInterest(false); this.scanSince = null; this.histories.clear();
    }
  }
  private currentlyGrowing(p: ProcessInfo) {
    const points = this.histories.get(processKey(p)) ?? [];
    return this.mono() - (points.at(-1)?.t ?? -Infinity) <= 5000 && growing(p, points);
  }
  private checkExits(now: number) {
    for (const [key, pending] of this.pendingExit) {
      if (now - pending.at < 10_000) continue;
      this.pendingExit.delete(key);
      const target = pending.record.target;
      if (!target.path) continue;
      const work = this.collector.inspectAutomatically({ ...target, path: target.path }).catch(() => 'unknown' as const).then(async state => {
        const observation = this.collector.observeAutomation();
        await this.audit({ ...pending.record, at: this.now(), kind: state, after: auditMetrics(observation.snapshot, observation.members.find(p => processKey(p) === key)) });
        this.outcome(pending.record, state);
        this.event(state === 'exited' ? 'exited' : 'still-running', state === 'exited' ? '프로세스 종료를 확인했습니다.'
          : state === 'running' ? '종료 요청 후에도 실행 중입니다. 추가 신호는 보내지 않습니다.' : '종료 여부를 확인하지 못했습니다. 추가 신호는 보내지 않습니다.', target.pid);
        return this.save();
      }).then(() => {}, () => { if (!this.stopped && !this.failure) this.fail('자동 종료 결과 확인 실패'); });
      this.confirmations.add(work); void work.then(() => this.confirmations.delete(work));
    }
  }
  async stop() {
    this.stopped = true; this.revision++; this.unsubscribe?.(); this.abort?.abort(); this.collector.setAutomaticInterest(false);
    await this.inFlight; await Promise.allSettled(this.actions); await Promise.all(this.confirmations);
    const pending = [...this.pendingExit.values()]; this.pendingExit.clear();
    for (const { record } of pending) {
      try {
        await this.audit({ ...record, at: this.now(), kind: 'unknown', reason: '플러그인 종료로 종료 여부를 확인하지 못했습니다.' });
        this.outcome(record, 'unknown');
        this.event('skipped', '플러그인 종료로 종료 여부를 확인하지 못했습니다.', record.target.pid);
      } catch { break; } // 기록 실패도 헬퍼 정리를 막지 않는다.
    }
    if (pending.length && !this.failure) await this.save().catch(() => {});
    await this.writes.catch(() => {});
  }
}
