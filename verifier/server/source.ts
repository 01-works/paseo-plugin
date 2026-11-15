import { readdir } from 'node:fs/promises';
import { userInfo } from 'node:os';
import path from 'node:path';
import { readTail, type Exec } from './exec';
import { parseDfAvailableKib, parseLaunchctl, type LaunchAgent } from './parse';

const SUMMARY_TAIL_BYTES = 1024 * 1024;
// 원격은 줄 수로 자른다. verifier-logs의 tail 상한이 10000줄이다.
const SUMMARY_TAIL_LINES = 2000;
const RUN_LOG_TAIL_BYTES = 512 * 1024;

/** verifier 로그를 읽는 통로. 같은 기기면 파일을, 다른 기기면 읽기 전용 SSH를 쓴다. */
export interface Source {
  readonly kind: 'local' | 'ssh';
  readonly target: string | null;
  /** LaunchAgent 상태. 원격에서는 알 수 없어 null이다. */
  launchAgent(): Promise<LaunchAgent | null>;
  /** 지금 디스크 여유(KiB). 원격에서는 알 수 없어 null이다. */
  diskKib(): Promise<number | null>;
  summary(): Promise<string>;
  /** 실행 로그 이름(정렬됨). 상세 `*-lanes.log`는 뺀다. */
  runLogNames(): Promise<string[]>;
  runLog(name: string): Promise<string>;
}

function isRunLog(project: string, name: string) {
  return name.startsWith(`${project}-run-`) && name.endsWith('.log') && !name.endsWith('-lanes.log');
}

export class LocalSource implements Source {
  readonly kind = 'local';
  readonly target = null;

  constructor(
    private readonly options: { project: string; stateDir: string; checkout: string; launchLabel: string },
    private readonly exec: Exec,
  ) {}

  private get logsDir() {
    return path.join(this.options.stateDir, 'logs');
  }

  async launchAgent() {
    const result = await this.exec('launchctl', ['print', `gui/${userInfo().uid}/${this.options.launchLabel}`], 5_000);
    return parseLaunchctl(result.stdout, result.code);
  }

  async diskKib() {
    // verifier preflight와 같은 대상(verifier checkout)을 잰다.
    return parseDfAvailableKib((await this.exec('df', ['-Pk', this.options.checkout], 5_000)).stdout);
  }

  summary() {
    return readTail(path.join(this.logsDir, `${this.options.project}-summary.log`), SUMMARY_TAIL_BYTES);
  }

  async runLogNames() {
    return (await readdir(this.logsDir)).filter(name => isRunLog(this.options.project, name)).sort();
  }

  runLog(name: string) {
    return readTail(path.join(this.logsDir, name), RUN_LOG_TAIL_BYTES);
  }
}

/** `ls -lAR` 출력에서 로그 폴더 바로 아래 파일 이름만 뽑는다. */
export function parseRemoteListing(text: string): string[] {
  const names: string[] = [];
  for (const line of text.split('\n')) {
    if (line === '' || line.endsWith(':')) break; // 첫 하위 폴더 목록부터는 무시한다.
    if (!line.startsWith('-')) continue;
    const name = line.trim().split(/\s+/).at(-1);
    if (name) names.push(name);
  }
  return names;
}

/**
 * bootstrap verifier role의 읽기 전용 SSH(`verifier-logs`)로 읽는다.
 * 그 통로는 로그 폴더에 대한 ls·tail·cat만 허용한다.
 */
export class SshSource implements Source {
  readonly kind = 'ssh';

  constructor(
    readonly target: string,
    private readonly project: string,
    private readonly exec: Exec,
  ) {}

  private async ssh(...command: string[]) {
    // 로그 파일 이름은 영문·숫자·._- 뿐이라 원격 셸 인용이 필요 없다. 그래도 다른 문자는 보내지 않는다.
    for (const part of command) if (!/^[A-Za-z0-9._-]+$/.test(part)) throw new Error(`원격 인자에 쓸 수 없는 문자: ${part}`);
    const result = await this.exec('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-T', this.target, ...command], 20_000);
    if (result.code !== 0) throw new Error(`ssh ${this.target} ${command[0]}: ${(result.stderr || result.stdout).trim().split('\n')[0] || `exit ${result.code}`}`);
    return result.stdout;
  }

  async launchAgent() {
    return null;
  }

  async diskKib() {
    return null;
  }

  summary() {
    return this.ssh('tail', '-n', String(SUMMARY_TAIL_LINES), `${this.project}-summary.log`);
  }

  async runLogNames() {
    return parseRemoteListing(await this.ssh('ls')).filter(name => isRunLog(this.project, name)).sort();
  }

  runLog(name: string) {
    return this.ssh('cat', name);
  }
}
