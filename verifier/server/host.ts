import type { HostStatus } from '../shared/contracts';
import { HOST_WARNING_THRESHOLDS } from '../shared/host';
import type { Exec } from './exec';

const HOST_CACHE_MS = 60_000;
const LANE_CONTAINER = /^console-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-[a-z0-9][a-z0-9_.-]*)?$/i;
type Sample<T> = { at: number; value: T; errors: string[] };
type Resources = Omit<HostStatus, 'leftoverContainers'>;

export function parseSwapUsedPercent(text: string): number {
  const kib = (key: string) => {
    const match = new RegExp(`\\b${key}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*([KMGT])\\b`, 'i').exec(text);
    if (!match) throw new Error('vm.swapusage output unreadable');
    return Number(match[1]) * 1024 ** 'KMGT'.indexOf(match[2].toUpperCase());
  };
  const total = kib('total');
  const used = kib('used');
  if (used > total) throw new Error('vm.swapusage used exceeds total');
  return total === 0 ? 0 : used / total * 100;
}

export function parseFseventsdRssKib(text: string): number {
  const lines = text.trim().split('\n');
  if (!text.trim() || lines.some(line => !/^\s*\d+\s+\S/.test(line))) throw new Error('ps output unreadable');
  return lines.reduce((sum, line) => {
    const match = /^\s*(\d+)\s+(?:.*\/)?fseventsd\s*$/.exec(line);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

/** 5초짜리 결과 캐시/수동 새로고침과 독립적인 60초 캐시. 실패도 캐시한다. */
export class HostCollector {
  private resources?: Sample<Resources>;
  private resourcesFlight?: Promise<Sample<Resources>>;
  private containers?: Sample<HostStatus['leftoverContainers']>;
  private containersFlight?: Promise<Sample<HostStatus['leftoverContainers']>>;

  constructor(private readonly exec: Exec) {}

  async read(canCheckContainers: boolean): Promise<{ host: HostStatus; errors: string[] }> {
    const [resources, containers] = await Promise.all([
      this.readResources(),
      canCheckContainers ? this.readContainers() : null,
    ]);
    return {
      host: { ...resources.value, leftoverContainers: containers?.value ?? null },
      errors: [...resources.errors, ...(containers?.errors ?? [])],
    };
  }

  private async command(command: string, args: string[]) {
    const result = await this.exec(command, args, 5_000);
    if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim().split('\n')[0] || `exit ${result.code}`);
    return result.stdout;
  }

  private async readResources() {
    if (this.resources && Date.now() - this.resources.at < HOST_CACHE_MS) return this.resources;
    this.resourcesFlight ??= this.collectResources().finally(() => { this.resourcesFlight = undefined; });
    return this.resources = await this.resourcesFlight;
  }

  private async collectResources(): Promise<Sample<Resources>> {
    const errors: string[] = [];
    const warn = (label: string) => (error: unknown) => {
      errors.push(`host ${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    };
    const [swapUsedPercent, fseventsdRssKib] = await Promise.all([
      this.command('sysctl', ['vm.swapusage']).then(parseSwapUsedPercent).catch(warn('swap')),
      this.command('ps', ['-axo', 'rss=,comm=']).then(parseFseventsdRssKib).catch(warn('fseventsd')),
    ]);
    const at = Date.now();
    return { at, value: { measuredAt: new Date(at).toISOString(), swapUsedPercent, fseventsdRssKib }, errors };
  }

  private async readContainers() {
    if (this.containers && Date.now() - this.containers.at < HOST_CACHE_MS) return this.containers;
    this.containersFlight ??= this.collectContainers().finally(() => { this.containersFlight = undefined; });
    return this.containers = await this.containersFlight;
  }

  private async collectContainers(): Promise<Sample<HostStatus['leftoverContainers']>> {
    try {
      const listing = await this.command('docker', ['ps', '--format', '{{.ID}}\t{{.Names}}']);
      const ids = listing.trim() ? listing.trim().split('\n').flatMap(line => {
        const [id, name] = line.split('\t');
        if (!/^[0-9a-f]{12,64}$/.test(id ?? '') || !name) throw new Error('docker ps output unreadable');
        return LANE_CONTAINER.test(name) ? [id] : [];
      }) : [];
      // CreatedAt/RunningFor는 생성 시각이라 재시작한 컨테이너의 가동 시간을 알 수 없다.
      // inspect도 이름·가동 여부·시작 시각만 읽으며 환경 변수 등은 읽지 않는다.
      const details = ids.length ? await this.command('docker', ['inspect', '--type', 'container', '--format', '{{.Name}}\t{{.State.Running}}\t{{.State.StartedAt}}', ...ids]) : '';
      if (ids.length && (!details.trim() || details.trim().split('\n').length !== ids.length)) throw new Error('docker inspect output incomplete');
      const at = Date.now();
      const names = details.trim() ? details.trim().split('\n').flatMap(line => {
        const [rawName, running, startedAt] = line.split('\t');
        const name = rawName?.replace(/^\//, '') ?? '';
        const started = Date.parse(startedAt ?? '');
        if (!LANE_CONTAINER.test(name) || !['true', 'false'].includes(running) || !Number.isFinite(started)) throw new Error('docker inspect output unreadable');
        return running === 'true' && at - started > HOST_WARNING_THRESHOLDS.containerAgeSeconds * 1000 ? [name] : [];
      }).sort() : [];
      return { at, value: { measuredAt: new Date(at).toISOString(), count: names.length, names }, errors: [] };
    } catch (error) {
      return { at: Date.now(), value: null, errors: [`host docker: ${error instanceof Error ? error.message : String(error)}`] };
    }
  }
}
