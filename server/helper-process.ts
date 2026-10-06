import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { paseoHome } from './host-info';

export type NativeSource = {
  child: ChildProcessWithoutNullStreams;
  close(): Promise<void>;
  setProcesses(on: boolean): void;
};
export function spawnSource(command: string, args: string[], onLine: (line: string) => void, onExit: (reason: string) => void): NativeSource {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => onLine(line));
  let exited = false, closing = false;
  let stderr = '';
  child.stdin.on('error', () => {}); // 종료와 관심 명령 사이 EPIPE 경합
  child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-2000); });
  child.once('error', error => { stderr = error.message; });
  child.once('close', (code, signal) => { exited = true; lines.close(); if (!closing) onExit(`헬퍼 종료 (${code ?? signal}): ${stderr}`); });
  return {
    child,
    setProcesses(on) { if (!closing && !exited && child.stdin.writable) child.stdin.write(`procs ${on ? 'on' : 'off'}\n`); },
    async close() {
      closing = true;
      if (exited) return;
      await new Promise<void>(resolve => {
        const kill = setTimeout(() => child.kill('SIGKILL'), 1000);
        child.once('close', () => { clearTimeout(kill); resolve(); });
        child.stdin.end(); child.kill('SIGTERM');
      });
    },
  };
}
export async function buildLocal(root: string, signal?: AbortSignal): Promise<string> {
  const dataDir = path.join(paseoHome(), 'mac-monitor');
  await mkdir(dataDir, { recursive: true });
  const binary = path.join(dataDir, 'macmon-helper');
  await run('/usr/bin/clang', ['-std=c11', '-O2', '-mmacosx-version-min=11.0', '-o', binary, path.join(root, 'native/macmon-helper.c')], signal);
  await run('/usr/bin/codesign', ['-s', '-', '-f', binary], signal);
  return binary;
}
async function run(command: string, args: string[], signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], signal });
    let message = ''; child.stderr.on('data', value => { message = (message + value).slice(-2000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${command}: ${message || code}`)); });
  });
}
