import { expect, it } from 'vitest';
import { createCodexReviewer, type ReviewInput, codexArguments, reviewPrompt } from '../server/automation/reviewer';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const input: ReviewInput = { pressure: 'critical', memoryUsed: 14 * 1024 ** 3, memoryTotal: 16 * 1024 ** 3, candidates: [{
  process: { pid: 23456, start: '1111', group: 'worker', name: 'worker', path: '/private/task/worker', cpuPercent: 0.1, memoryBytes: 2 * 1024 ** 3 },
  points: [{ t: 0, cpuPercent: 0.1, memoryBytes: 1024 ** 3 }, { t: 60_000, cpuPercent: 0.1, memoryBytes: 2 * 1024 ** 3 }], growthBytes: 1024 ** 3, approved: true,
}] };
function fake(code: string, timeoutMs = 1500) { return createCodexReviewer({ command: process.execPath,
  prefixArgs: ['-e', code, '--'], timeoutMs }); }
const parseArgs = `const fs=require('node:fs'),a=process.argv;const result=a[a.indexOf('--output-last-message')+1];`;
const good = { decisions: [{ key: '23456:1111', decision: 'observe', reason: '작업 목적을 알 수 없습니다.' }] };
it('CLI는 도구·설정·훅을 제외한 읽기 전용 일회성 실행, 경로는 모델에 전송하지 않음', () => {
  const args = codexArguments('/tmp/review');
  expect(args).toContain('--ignore-user-config'); expect(args).toContain('--ignore-rules');
  expect(args).toContain('--ephemeral'); expect(args).toContain('read-only');
  expect(args).toContain('shell_tool'); expect(args).toContain('hooks'); expect(args).toContain('plugins');
  expect(reviewPrompt(input)).not.toContain('/private/task/worker');
  expect(reviewPrompt(input)).toContain('신뢰하지 않는');
});
it('구조화 결과를 검증하고 정상적인 메시지 이벤트 허용', async () => {
  const reviewer = fake(`${parseArgs}let prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{fs.writeFileSync(result,JSON.stringify(${JSON.stringify(good)}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message'}}));});`);
  expect(await reviewer(input, new AbortController().signal)).toEqual(good);
});
it('취소 시 먼저 종료한 CLI의 자식도 정리하고 임시 폴더 삭제', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mac-monitor-review-test-')), record = path.join(directory, 'pids');
  try {
    const code = `${parseArgs}const child=require('node:child_process').spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},100);'],{stdio:['ignore','pipe','ignore']});
      process.on('SIGTERM',()=>process.exit(0));child.stdout.once('data',()=>{fs.writeFileSync(${JSON.stringify(record)},JSON.stringify({parent:process.pid,child:child.pid,directory:process.cwd()}));console.log(JSON.stringify({type:'item.started',item:{type:'command_execution'}}));});setInterval(()=>{},100);`;
    await expect(fake(code, 3000)(input, new AbortController().signal)).rejects.toThrow('도구 사용');
    const pids = JSON.parse(await readFile(record, 'utf8'));
    await expect(stat(pids.directory)).rejects.toThrow();
    for (const pid of [pids.parent, pids.child]) {
      const end = Date.now() + 2000;
      while (Date.now() < end) { try { process.kill(pid, 0); } catch { break; } await new Promise(r => setTimeout(r, 20)); }
      expect(() => process.kill(pid, 0)).toThrow();
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it.each([
  ['중복 대상', { decisions: [good.decisions[0], good.decisions[0]] }],
  ['미지 대상', { decisions: [{ ...good.decisions[0], key: '123:0' }] }],
  ['스키마 외 필드', { ...good, command: 'kill' }],
  ['잘못된 결정', { decisions: [{ ...good.decisions[0], decision: 'kill' }] }],
])('리뷰 결과 %s는 실패 처리', async (_name, result) => {
  await expect(fake(`${parseArgs}fs.writeFileSync(result,JSON.stringify(${JSON.stringify(result)}));`)(input, new AbortController().signal)).rejects.toThrow();
});
it.each(['command_execution', 'mcp_tool_call', 'web_search'])('도구 이벤트 %s는 즉시 취소', async type => {
  await expect(fake(`console.log(JSON.stringify({type:'item.started',item:{type:${JSON.stringify(type)}}}));process.on('SIGTERM',()=>{});setInterval(()=>{},100);`)(input, new AbortController().signal)).rejects.toThrow('도구 사용');
});
it.each([
  ['도구 사용', JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } })],
  ['요청 실패', JSON.stringify({ type: 'turn.failed' })],
  ['이벤트 형식', 'broken'],
  ['이벤트 형식', 'null'],
  ['이벤트 형식', '{}'],
])('개행 없는 마지막 출력의 %s도 거절', async (reason, tail) => {
  await expect(fake(`${parseArgs}fs.writeFileSync(result,JSON.stringify(${JSON.stringify(good)}));process.stdout.write(${JSON.stringify(tail)});`)(input, new AbortController().signal)).rejects.toThrow(reason);
});
it('개행 없는 마지막 정상 이벤트도 검사하고 허용', async () => {
  expect(await fake(`${parseArgs}fs.writeFileSync(result,JSON.stringify(${JSON.stringify(good)}));process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message'}}));`)(input, new AbortController().signal)).toEqual(good);
});
it('CLI 실패·과대한 출력·깨진 JSON·과대한 결과는 실패 처리', async () => {
  await expect(fake('process.exit(2)')(input, new AbortController().signal)).rejects.toThrow('종료 코드');
  await expect(fake('console.log("x".repeat(70*1024))')(input, new AbortController().signal)).rejects.toThrow('출력 한도');
  await expect(fake('console.log("broken")')(input, new AbortController().signal)).rejects.toThrow('이벤트 형식');
  await expect(fake(`${parseArgs}fs.writeFileSync(result,' '.repeat(8193));`)(input, new AbortController().signal)).rejects.toThrow('크기 초과');
});
it('시간 초과 시 SIGTERM을 무시하는 리뷰도 종료하고 프로세스를 남기지 않음', async () => {
  const started = Date.now();
  await expect(fake('process.on("SIGTERM",()=>{});setInterval(()=>{},100);', 150)(input, new AbortController().signal)).rejects.toThrow('시간 초과');
  expect(Date.now() - started).toBeLessThan(2500);
});
it('호출 전과 실행 중 취소는 결과를 사용하지 않음', async () => {
  const stopped = new AbortController(); stopped.abort();
  await expect(fake('process.exit(0)')(input, stopped.signal)).rejects.toThrow('취소');
  const controller = new AbortController();
  const result = fake('setInterval(()=>{},100);')(input, controller.signal);
  setTimeout(() => controller.abort(), 150);
  await expect(result).rejects.toThrow('취소');
});
it('비활성화한 Code Mode의 알려진 시작 알림만 허용하고 실제 실패 이벤트는 거절', async () => {
  const notice = 'Code Mode is unavailable because code-mode host is disabled. Code mode will fail closed; enable features.code_mode_host.';
  const boot = `console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:${JSON.stringify(notice)}}}));`;
  expect(await fake(`${parseArgs}${boot}fs.writeFileSync(result,JSON.stringify(${JSON.stringify(good)}));`)(input, new AbortController().signal)).toEqual(good);
  await expect(fake(`${boot}console.log(JSON.stringify({type:'turn.failed'}));`)(input, new AbortController().signal)).rejects.toThrow('요청 실패');
  await expect(fake(`console.log(JSON.stringify({type:'turn.failed',item:{type:'error',message:${JSON.stringify(notice)}}}));`)(input, new AbortController().signal)).rejects.toThrow('요청 실패');
  await expect(fake(`console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'모델 접근 불가'}}));`)(input, new AbortController().signal)).rejects.toThrow('모델 접근 불가');
});
