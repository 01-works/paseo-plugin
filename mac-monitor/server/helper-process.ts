import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { paseoHome } from './host-info';
import { metadataSchema, type ProcessMetadata } from '../shared/cleanup';

type Response = { sent: boolean; error?: string; ok?: boolean; process?: unknown };
export type NativeSource = {
  child: ChildProcessWithoutNullStreams;
  close(): Promise<void>;
  setProcesses(on: boolean): void;
  setInspection(on: boolean): void;
  setHistory(on: boolean): void;
  inspect(pid: number, start: string): Promise<ProcessMetadata>;
  terminate(pid: number, start: string): Promise<{ sent: boolean; error?: string }>;
};
export function spawnSource(command: string, args: string[], onLine: (line: string) => void, onExit: (reason: string) => void): NativeSource {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  let requestId = 0;
  const pending = new Map<number, (result: Response) => void>();
  lines.on('line', line => {
    try {
      const value = JSON.parse(line);
      if (value.action === 'terminate' || value.action === 'inspect') { pending.get(value.id)?.({ sent: value.sent === true,
        ok: value.ok === true, process: value.process, error: typeof value.error === 'string' ? value.error : undefined }); return; }
    } catch { /* 측정 JSON 오류는 수집기가 처리한다. */ }
    onLine(line);
  });
  let exited = false, closing = false;
  let stderr = '';
  child.stdin.on('error', () => {}); // 종료와 관심 명령 사이 EPIPE 경합
  child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-2000); });
  child.once('error', error => { stderr = error.message; });
  child.once('close', (code, signal) => { exited = true; lines.close(); for (const resolve of pending.values()) resolve({ sent: false, error: '헬퍼 연결 종료' }); if (!closing) onExit(`헬퍼 종료 (${code ?? signal}): ${stderr}`); });
  const request = (command: string, timeoutMessage: string): Promise<Response> => {
    if (closing || exited || !child.stdin.writable) return Promise.resolve({ sent: false, error: '헬퍼 연결 없음' });
    const id = ++requestId;
    return new Promise(resolve => {
      const timer = setTimeout(() => { pending.delete(id); resolve({ sent: false, error: timeoutMessage }); }, 3000);
      pending.set(id, result => { clearTimeout(timer); pending.delete(id); resolve(result); });
      child.stdin.write(`${command.replace('$id', String(id))}\n`);
    });
  };
  return {
    child,
    setProcesses(on) { if (!closing && !exited && child.stdin.writable) child.stdin.write(`procs ${on ? 'on' : 'off'}\n`); },
    setInspection(on) { if (!closing && !exited && child.stdin.writable) child.stdin.write(`inspection ${on ? 'on' : 'off'}\n`); },
    setHistory(on) { if (!closing && !exited && child.stdin.writable) child.stdin.write(`history ${on ? 'on' : 'off'}\n`); },
    async inspect(pid, start) {
      const result = await request(`inspect $id ${pid} ${start}`, '실행 정보 응답 시간 초과');
      if (!result.ok) throw new Error(result.error ?? '실행 정보 확인 불가');
      return metadataSchema.parse(result.process);
    },
    async terminate(pid, start) {
      const { sent, error } = await request(`terminate $id ${pid} ${start}`, '종료 응답 시간 초과 · 대상 상태를 다시 확인하세요');
      return { sent, error };
    },
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
    let message = '', failure: Error | undefined;
    child.stderr.on('data', value => { message = (message + value).slice(-2000); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
    let abortKill: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => { child.kill('SIGTERM'); abortKill ??= setTimeout(() => child.kill('SIGKILL'), 1000); };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    child.once('error', error => { failure = error; });
    // AbortError도 실제 close까지 기다려 컴파일 자식을 정리한다.
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(abortKill); signal?.removeEventListener('abort', onAbort);
      if (failure) reject(failure); else if (code === 0) resolve(); else reject(new Error(`${command}: ${message || code}`));
    });
  });
}
