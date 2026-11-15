import { execFile } from 'node:child_process';
import { open, readdir } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { DISK_MINIMUM_KIB, type GithubStatus, type Run, type VerifierStatus } from '../shared/contracts';
import {
  currentRunFrom,
  deferralFrom,
  failureStreakFrom,
  laneMediansFrom,
  lanesFrom,
  median,
  minimumKibFrom,
  parseDfAvailableKib,
  parseLaunchctl,
  parseRunLog,
  parseSummary,
  redPeriodsFrom,
  type RunLog,
  type SummaryEntry,
  windowStatsFrom,
} from './parse';

export interface Config {
  project: string;
  stateDir: string;
  checkout: string;
  launchLabel: string;
}

// 01-software verifier 설치(scripts/release/verifier-loop.mjs)의 기본 위치
export function defaultConfig(env = process.env): Config {
  const home = homedir();
  return {
    project: env.VERIFIER_PROJECT ?? '01-software',
    stateDir: env.VERIFIER_STATE_DIR ?? path.join(home, '.local/state/verifier'),
    checkout: env.VERIFIER_CHECKOUT ?? path.join(home, '.local/share/01-software-verifier'),
    launchLabel: env.VERIFIER_LAUNCH_LABEL ?? 'local.01-software.verifier-loop',
  };
}

// lane 표에 쓰는 실행 수. 7일 통계는 요약 로그에서 따로 센다.
const HISTORY_RUNS = 20;
const SUMMARY_TAIL_BYTES = 1024 * 1024;
const RUN_LOG_TAIL_BYTES = 512 * 1024;
const STATS_WINDOWS_HOURS = [24, 24 * 7];
const LOCAL_CACHE_MS = 5_000;
const GITHUB_CACHE_MS = 10 * 60_000;
const GITHUB_MIN_REFRESH_MS = 30_000;
const STALE_RUN_MS = 12 * 60 * 60_000;
// launchd·Paseo 데몬의 PATH에는 Homebrew가 없을 수 있다.
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Exec = (command: string, args: string[], timeoutMs?: number) => Promise<ExecResult>;

export function run(command: string, args: string[], timeoutMs = 10_000): Promise<ExecResult> {
  const env = { ...process.env, PATH: [process.env.PATH, ...EXTRA_PATH].filter(Boolean).join(':'), GH_PROMPT_DISABLED: '1', NO_COLOR: '1' };
  return new Promise(resolve => {
    execFile(command, args, { timeout: timeoutMs, env, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const code = error ? (typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout), stderr: String(stderr) || (error && code === 1 ? error.message : '') });
    });
  });
}

async function readTail(file: string, bytes: number): Promise<string> {
  const handle = await open(file, 'r');
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const text = buffer.toString('utf8');
    // 잘린 첫 줄은 버린다.
    return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    await handle.close();
  }
}

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

  constructor(
    private readonly config: Config = defaultConfig(),
    private readonly exec: Exec = run,
  ) {}

  private get logsDir() {
    return path.join(this.config.stateDir, 'logs');
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
    const prefix = `${this.config.project}-`;

    const [launch, df, summaryText, runLogNames] = await Promise.all([
      this.exec('launchctl', ['print', `gui/${userInfo().uid}/${this.config.launchLabel}`], 5_000),
      this.exec('df', ['-Pk', this.config.checkout], 5_000),
      readTail(path.join(this.logsDir, `${prefix}summary.log`), SUMMARY_TAIL_BYTES).catch(error => {
        errors.push(`summary log: ${message(error)}`);
        return '';
      }),
      readdir(this.logsDir)
        .then(names => names.filter(name => name.startsWith(`${prefix}run-`) && name.endsWith('.log') && !name.endsWith('-lanes.log')).sort())
        .catch(error => {
          errors.push(`logs dir: ${message(error)}`);
          return [] as string[];
        }),
    ]);

    const agent = parseLaunchctl(launch.stdout, launch.code);
    const entries = parseSummary(summaryText);
    const availableKib = parseDfAvailableKib(df.stdout);
    if (availableKib === null) errors.push('disk: df output unreadable');

    // 요약에 아직 없는 가장 최근 실행 로그가 지금 도는 실행이다.
    const summarized = new Set(entries.map(entry => entry.log));
    const latestLog = runLogNames.at(-1);
    let current: VerifierStatus['current'] = null;
    if (agent.running && latestLog && !summarized.has(latestLog)) {
      try {
        const text = await readTail(path.join(this.logsDir, latestLog), RUN_LOG_TAIL_BYTES);
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
    const toRun = async (entry: SummaryEntry & { status: 'success' | 'failure' }): Promise<Run> => {
      const log = await this.runLogOf(entry.log);
      return {
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
    const recent = await Promise.all(history.map(toRun));
    const now = Date.now();
    const red = redPeriodsFrom(realEntries.map(entry => ({ endedAt: entry.at, status: entry.status })));
    const openRed = red.at(-1)?.end === null ? red.at(-1) : undefined;

    return {
      collectedAt: new Date(now).toISOString(),
      agent,
      current,
      recent,
      laneMedians: laneMediansFrom(recent),
      redSince: openRed ? new Date(openRed.start).toISOString() : null,
      stats: STATS_WINDOWS_HOURS.map(hours => windowStatsFrom(entries, hours, now)),
      repoUrl: await this.repoSlug().then(slug => `https://github.com/${slug}`, () => null),
      lastSuccess: lastSuccessEntry ? await toRun(lastSuccessEntry) : null,
      failureStreak: failureStreakFrom(recent),
      deferral: current ? null : deferralFrom(entries),
      typicalRunSeconds: median(recent.slice(-10).map(entry => entry.runSeconds).filter((value): value is number => value !== null)),
      disk: availableKib === null ? null : { availableKib, minimumKib: minimumKibFrom(entries) ?? DISK_MINIMUM_KIB },
      errors,
    };
  }

  private async runLogOf(logName: string): Promise<RunLog | null> {
    const cached = this.runLogs.get(logName);
    if (cached) return cached;
    try {
      const log = parseRunLog(await readTail(path.join(this.logsDir, logName), RUN_LOG_TAIL_BYTES));
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

  private repoSlug(): Promise<string> {
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
