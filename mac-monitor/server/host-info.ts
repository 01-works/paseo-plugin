import { readFile } from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { VERSION, type HostInfo } from '../shared/contracts';

export function paseoHome(): string {
  const configured = process.env.PASEO_HOME ?? '~/.paseo';
  return path.resolve(configured.startsWith('~/') ? path.join(homedir(), configured.slice(2)) : configured);
}
export async function hostInfo(helperMode: HostInfo['helperMode']): Promise<HostInfo> {
  return { hostname: hostname(), platform: process.platform, helperMode, version: VERSION };
}
export async function pluginRoot(): Promise<string> {
  // 0.10.2의 eval 번들에는 import.meta.url / 소스 경로 컨텍스트가 없다.
  const config = JSON.parse(await readFile(path.join(paseoHome(), 'config.json'), 'utf8')) as { plugins?: Record<string, { path?: string }> };
  const root = config.plugins?.['mac-monitor']?.path;
  if (!root) throw new Error('mac-monitor 설치 경로를 찾을 수 없습니다');
  return path.resolve(root.startsWith('~/') ? path.join(homedir(), root.slice(2)) : root);
}
