import { homedir } from 'node:os';
import path from 'node:path';
import { DISK_MINIMUM_KIB, type GithubStatus, type Run, type VerifierStatus } from '../shared/contracts';
import {
  currentRunFrom,
  deferralFrom,
  deferralReason,
  failureStreakFrom,
  laneMediansFrom,
  lanesFrom,
  median,
  minimumKibFrom,
  parseRunLog,
  parseSummary,
  redPeriodsFrom,
  type RawFailure,
  type RunLog,
  type SummaryEntry,
  windowStatsFrom,
  withRecurrence,
} from './parse';
import { run, type Exec } from './exec';
import { LocalSource, SshSource, type Source } from './source';

export type { Exec, ExecResult } from './exec';
export { run } from './exec';

export interface Config {
  project: string;
  stateDir: string;
  checkout: string;
  launchLabel: string;
  /** 비어 있지 않으면 이 SSH 대상(verifier-logs)으로 원격 verifier를 읽는다. */
  sshTarget?: string | null;
}

// 01-software verifier 설치(scripts/release/verifier-loop.mjs)의 기본 위치
export function defaultConfig(env = process.env): Config {
  const home = homedir();
  return {
    project: env.VERIFIER_PROJECT ?? '01-software',
    stateDir: env.VERIFIER_STATE_DIR ?? path.join(home, '.local/state/verifier'),
    checkout: env.VERIFIER_CHECKOUT ?? path.join(home, '.local/share/01-software-verifier'),
    launchLabel: env.VERIFIER_LAUNCH_LABEL ?? 'local.01-software.verifier-loop',
    sshTarget: env.VERIFIER_SSH_TARGET || null,
  };
}

// lane 표에 쓰는 실행 수. 7일 통계는 요약 로그에서 따로 센다.
const HISTORY_RUNS = 20;
const STATS_WINDOWS_HOURS = [24, 24 * 7];
const BEATS = 30;
const LOCAL_CACHE_MS = 5_000;
const GITHUB_CACHE_MS = 10 * 60_000;
const GITHUB_MIN_REFRESH_MS = 30_000;
const STALE_RUN_MS = 12 * 60 * 60_000;
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Collector {
  private local?: { at: number; value: Omit<VerifierStatus, 'github' | 'githubError'> };
  private localFlight?: Promise<Omit<VerifierStatus, 'github' | 'githubError'>>;
  private github?: { at: number; value: GithubStatus | null; error: string | null; key: string };
  private githubFlight?: Promise<void>;
  // 요약에 기록된 실행 로그와 커밋 제목은 더 바뀌지 않으므로 한 번만 읽는다.
  private runLogs = new Map<string, RunLog>();
  private subjects = new Map<string, string | null>();
  private slug?: Promise<string>;
  private readonly source: Source;

  constructor(
    private readonly config: Config = defaultConfig(),
    private readonly exec: Exec = run,
  ) {
    this.source = config.sshTarget ? new SshSource(config.sshTarget, config.project, exec) : new LocalSource(config, exec);
  }

  async status(input: { includeGithub: boolean; refresh?: boolean }): Promise<VerifierStatus> {
    const local = await this.localStatus(input.refresh === true);
    if (!input.includeGithub) return { ...local, github: null, githubError: null };
    await this.refreshGithub(local.lastSuccess?.sha ?? null, input.refresh === true);
    return { ...local, github: this.github?.value ?? null, githubError: this.github?.error ?? null };
  }

  private async localStatus(force: boolean) {
    if (!force && this.local && Date.now() - this.local.at < LOCAL_CACHE_MS) return this.local.value;
    this.localFlight ??= this.collectLocal().finally(() => {
      this.localFlight = undefined;
    });
    const value = await this.localFlight;
    this.local = { at: Date.now(), value };
    return value;
  }

  private async collectLocal(): Promise<Omit<VerifierStatus, 'github' | 'githubError'>> {
    const errors: string[] = [];
    const source = this.source;
    const warn = <T,>(label: string, fallback: T) => (error: unknown) => {
      errors.push(`${label}: ${message(error)}`);
      return fallback;
    };

    const [agent, liveKib, summaryText, runLogNames] = await Promise.all([
      source.launchAgent().catch(warn('launchctl', null)),
      source.diskKib().catch(warn('disk', null)),
      source.summary().catch(warn('summary log', '')),
      source.runLogNames().catch(warn('logs dir', [] as string[])),
    ]);

    const entries = parseSummary(summaryText);
    if (source.kind === 'local' && liveKib === null) errors.push('disk: df output unreadable');
    const disk = diskFrom(liveKib, entries);

    // 요약에 아직 없는 가장 최근 실행 로그가 지금 도는 실행이다.
    const summarized = new Set(entries.map(entry => entry.log));
    const latestLog = runLogNames.at(-1);
    let current: ReturnType<typeof currentRunFrom> | null = null;
    // 원격에서는 LaunchAgent를 볼 수 없어 요약에 없는 최근 로그만으로 판단한다(12시간 넘으면 버림).
    if ((agent?.running ?? source.kind === 'ssh') && latestLog && !summarized.has(latestLog)) {
      try {
        const text = await source.runLog(latestLog);
        const fallbackSha = /-([0-9a-f]{12})\.log$/.exec(latestLog)?.[1] ?? '';
        const log = parseRunLog(text);
        const subject = log.sha ? (await this.subjectsOf([log.sha])).get(log.sha) ?? null : null;
        const candidate = currentRunFrom(log, fallbackSha, subject);
        // 요약 없이 끊긴 옛 실행 로그를 지금 실행으로 착각하지 않는다(verifier 실행 제한 12시간).
        const started = candidate.startedAt ? Date.parse(candidate.startedAt) : NaN;
        current = Number.isFinite(started) && Date.now() - started > STALE_RUN_MS ? null : candidate;
      } catch (error) {
        errors.push(`current run log: ${message(error)}`);
      }
    }

    const realEntries = entries.filter((entry): entry is SummaryEntry & { status: 'success' | 'failure' } => entry.status !== 'none');
    const history = realEntries.slice(-HISTORY_RUNS);
    const lastSuccessEntry = realEntries.findLast(entry => entry.status === 'success');
    const wanted = lastSuccessEntry && !history.includes(lastSuccessEntry) ? [...history, lastSuccessEntry] : history;
    const subjects = await this.subjectsOf(wanted.map(entry => entry.sha));
    const toRun = async (entry: SummaryEntry & { status: 'success' | 'failure' }): Promise<Omit<Run, 'failures'> & { failures: RawFailure[] }> => {
      const log = await this.runLogOf(entry.log);
      return {
        // 반복 정보는 아래 withRecurrence가 채운다.
        endedAt: entry.at,
        sha: entry.sha,
        subject: subjects.get(entry.sha) ?? null,
        status: entry.status,
        runSeconds: entry.runSeconds,
        failedLanes: entry.status === 'failure' ? log?.failedLanes ?? [] : [],
        lanes: log ? lanesFrom(log) : [],
        failures: log?.failures ?? [],
      };
    };
    const rawRecent = await Promise.all(history.map(toRun));
    // 캐시된 로그 객체는 고치지 않고, 반복 정보를 붙인 새 객체를 만든다. 지금 실행은 가장 최근 다음 실행으로 본다.
    const chain = [...rawRecent.map(run => ({ sha: run.sha, at: run.endedAt, failures: run.failures })), ...(current ? [{ sha: current.sha, at: current.startedAt, failures: current.failures }] : [])];
    const annotated = withRecurrence(chain);
    const recent: Run[] = rawRecent.map((run, index) => ({ ...run, failures: annotated[index] }));
    const currentRun: VerifierStatus['current'] = current ? { ...current, failures: annotated[rawRecent.length] } : null;
    const now = Date.now();
    const red = redPeriodsFrom(realEntries.map(entry => ({ endedAt: entry.at, status: entry.status })));
    const openRed = red.at(-1)?.end === null ? red.at(-1) : undefined;

    return {
      collectedAt: new Date(now).toISOString(),
      agent,
      current: currentRun,
      recent,
      laneMedians: laneMediansFrom(recent),
      beats: entries.slice(-BEATS).map(entry => ({
        at: entry.at,
        sha: entry.sha,
        status: entry.status,
        runSeconds: entry.runSeconds,
        reason: entry.status === 'none' ? deferralReason(entry) : null,
      })),
      redSince: openRed ? new Date(openRed.start).toISOString() : null,
      stats: STATS_WINDOWS_HOURS.map(hours => windowStatsFrom(entries, hours, now)),
      repoUrl: await this.repoSlug().then(slug => `https://github.com/${slug}`, () => null),
      lastSuccess: lastSuccessEntry ? { ...(await toRun(lastSuccessEntry)), failures: [] } : null,
      failureStreak: failureStreakFrom(recent),
      deferral: currentRun ? null : deferralFrom(entries),
      typicalRunSeconds: median(recent.slice(-10).map(entry => entry.runSeconds).filter((value): value is number => value !== null)),
      disk,
      source: { kind: source.kind, target: source.target },
      errors,
    };
  }

  private async runLogOf(logName: string): Promise<RunLog | null> {
    const cached = this.runLogs.get(logName);
    if (cached) return cached;
    try {
      const log = parseRunLog(await this.source.runLog(logName));
      this.runLogs.set(logName, log);
      return log;
    } catch {
      return null;
    }
  }

  /** verifier checkout에서 커밋 제목을 읽는다. 없는 커밋은 null로 기억한다. */
  private async subjectsOf(shas: string[]): Promise<Map<string, string | null>> {
    const missing = [...new Set(shas)].filter(sha => /^[0-9a-f]{40}$/.test(sha) && !this.subjects.has(sha));
    const read = async (batch: string[]) => {
      const result = await this.exec('git', ['-C', this.config.checkout, 'show', '-s', '--format=%H%x1f%s', ...batch], 10_000);
      if (result.code !== 0) return false;
      for (const line of result.stdout.split('\n')) {
        const [sha, subject] = line.split('\x1f');
        if (sha && subject !== undefined) this.subjects.set(sha, subject);
      }
      return true;
    };
    if (missing.length > 0 && !(await read(missing))) {
      // 하나라도 없으면 git이 통째로 실패하므로 하나씩 다시 읽는다.
      for (const sha of missing) if (!(await read([sha]))) this.subjects.set(sha, null);
    }
    return this.subjects;
  }

  private async refreshGithub(candidateSha: string | null, force: boolean) {
    const key = candidateSha ?? '';
    const age = this.github ? Date.now() - this.github.at : Infinity;
    const fresh = this.github?.key === key && age < (force ? GITHUB_MIN_REFRESH_MS : GITHUB_CACHE_MS);
    if (fresh) return;
    this.githubFlight ??= this.collectGithub(candidateSha)
      .then(value => {
        this.github = { at: Date.now(), value, error: null, key };
      })
      .catch(error => {
        // 마지막 성공 값은 남기고 오류만 표시한다.
        this.github = { at: Date.now(), value: this.github?.value ?? null, error: message(error), key };
      })
      .finally(() => {
        this.githubFlight = undefined;
      });
    await this.githubFlight;
  }

  repoSlug(): Promise<string> {
    this.slug ??= this.readRepoSlug();
    this.slug.catch(() => {
      this.slug = undefined;
    });
    return this.slug;
  }

  private async readRepoSlug(): Promise<string> {
    const remote = await this.exec('git', ['-C', this.config.checkout, 'remote', 'get-url', 'origin'], 5_000);
    const slug = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?\s*$/.exec(remote.stdout)?.[1];
    if (!slug) throw new Error('verifier checkout의 GitHub origin을 읽지 못했습니다');
    return slug;
  }

  private async collectGithub(candidateSha: string | null): Promise<GithubStatus> {
    const slug = await this.repoSlug();
    const gh = async (endpoint: string, jq: string) => {
      const result = await this.exec('gh', ['api', `repos/${slug}/${endpoint}`, '--jq', jq], 15_000);
      if (result.code !== 0) throw new Error(`gh api ${endpoint}: ${(result.stderr || result.stdout).trim().split('\n')[0] || `exit ${result.code}`}`);
      return result.stdout.trim();
    };
    const [devSha, mainSha] = await Promise.all([gh('branches/dev', '.commit.sha'), gh('branches/main', '.commit.sha')]);
    const [ahead, candidate] = await Promise.all([
      gh(`compare/${mainSha}...${devSha}`, '.ahead_by'),
      candidateSha ? gh(`compare/${mainSha}...${candidateSha}`, '"\\(.status) \\(.ahead_by)"') : Promise.resolve(''),
    ]);
    const [candidateState, candidateAhead] = candidate.split(' ');
    return {
      fetchedAt: new Date().toISOString(),
      devSha,
      mainSha,
      devAheadOfMain: Number(ahead) || 0,
      candidate: candidateSha && candidateState === 'ahead' ? { sha: candidateSha, aheadOfMain: Number(candidateAhead) || 0 } : null,
    };
  }
}

/** 지금 잰 값이 없으면(원격) 마지막 preflight 기록의 값을 쓰고 그 시각을 남긴다. */
export function diskFrom(liveKib: number | null, entries: SummaryEntry[]): VerifierStatus['disk'] {
  const minimumKib = minimumKibFrom(entries) ?? DISK_MINIMUM_KIB;
  if (liveKib !== null) return { availableKib: liveKib, minimumKib, measuredAt: null };
  for (let index = entries.length - 1; index >= 0; index--) {
    const measurement = entries[index].preflight.find(item => item.item === 'disk')?.measurement;
    const kib = measurement ? /available_kib=(\d+)/.exec(measurement)?.[1] : undefined;
    if (kib) return { availableKib: Number(kib), minimumKib, measuredAt: entries[index].at };
  }
  return null;
}
