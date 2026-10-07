import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { codexArguments, createCodexReviewer, reviewPrompt, validateReview } from '../server/cleanup-reviewer';
import { processKey } from '../shared/cleanup';
import { item } from './cleanup-fixtures';

const dirs: string[] = [];
const input = { items: [item] }, decision = { key: processKey(item), decision: 'uncertain', reason: '작업 완료 근거가 부족합니다' };
const fake = (script: string, timeoutMs = 2000) => createCodexReviewer({ command: process.execPath, prefixArgs: ['-e', script, '--'], timeoutMs });
const output = (value: unknown) => `const a=process.argv;const dir=a[a.indexOf('--cd')+1];require('node:fs').writeFileSync(require('node:path').join(dir,'result.json'),${JSON.stringify(JSON.stringify(value))});`;
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

it('Luna 실행은 읽기 전용·일회 세션·도구/설정 격리·구조 출력으로 고정', () => {
  const args = codexArguments('/tmp/review');
  expect(args.slice(0, 5)).toEqual(['exec', '--model', 'gpt-6-luna', '--sandbox', 'read-only']);
  for (const value of ['--ephemeral', '--ignore-user-config', '--ignore-rules', 'mcp_servers={}', 'approval_policy="never"', 'web_search="disabled"']) expect(args).toContain(value);
  expect(reviewPrompt(input)).toContain('장기 비활동 이력은 없습니다'); expect(reviewPrompt(input)).toContain('신뢰하지 않는 관측 데이터');
});
it('모든 입력 식별자가 정확히 한 번 있어야 하며 누락·추가·중복·알 수 없는 판정을 거절', () => {
  expect(validateReview({ decisions: [decision] }, input).decisions).toEqual([decision]);
  for (const value of [{ decisions: [] }, { decisions: [{ ...decision, key: '999:1' }] }, { decisions: [decision, decision] },
    { decisions: [{ ...decision, decision: 'kill' }] }, { decisions: [decision], command: 'kill' }]) expect(() => validateReview(value, input)).toThrow();
});
it('실제 자식의 정상 JSON 이벤트와 구조 결과만 허용', async () => {
  const review = fake(`process.stdin.resume();process.stdin.on('end',()=>{${output({ decisions: [decision] })}console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'결과'}}));});`);
  expect(await review(input, new AbortController().signal)).toEqual({ decisions: [decision] });
});
it('도구 실행·오류·잘못된 이벤트·초과 출력은 결과 파일이 있어도 실패', async () => {
  for (const event of [{ type: 'item.started', item: { type: 'command_execution' } }, { type: 'error' }, { type: 'unexpected' }]) {
    const review = fake(`${output({ decisions: [decision] })}console.log(${JSON.stringify(JSON.stringify(event))});setInterval(()=>{},1000);`);
    await expect(review(input, new AbortController().signal)).rejects.toThrow();
  }
  await expect(fake(`process.stdout.write('x'.repeat(70000));setInterval(()=>{},1000);`)(input, new AbortController().signal)).rejects.toThrow('한도');
});
it('시간 초과와 취소는 SIGTERM을 무시하는 검사 자식을 정리한 뒤 반환', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cleanup-test-')); dirs.push(dir); const file = path.join(dir, 'pid');
  const code = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(file)},String(process.pid));setInterval(()=>{},1000);`;
  await expect(fake(code, 1000)(input, new AbortController().signal)).rejects.toThrow('시간 초과');
  const pid = Number(await readFile(file, 'utf8')); expect(() => process.kill(pid, 0)).toThrow();
  const abort = new AbortController(); const operation = fake(code)(input, abort.signal);
  const end=Date.now()+1500;
  while(Number(await readFile(file,'utf8'))===pid){if(Date.now()>end)throw new Error('검사 자식 시작 대기 시간 초과');await new Promise(resolve=>setTimeout(resolve,10));}
  abort.abort(); await expect(operation).rejects.toThrow('취소');
  const cancelledPid = Number(await readFile(file, 'utf8')); expect(() => process.kill(cancelledPid, 0)).toThrow();
});
it('이미 취소된 검사는 자식을 실행하지 않음', async () => {
  const abort = new AbortController(); abort.abort(); await expect(fake('process.exit(0)')(input, abort.signal)).rejects.toThrow('취소');
});
