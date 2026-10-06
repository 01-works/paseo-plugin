// 플러그인과 별도로 실행하는 수동 대조 CLI. 종료 시 자식 헬퍼도 종료한다.
import { Collector } from './collector';
import { GiB } from '../shared/units';
const collector = new Collector({ root: process.cwd() });
let timer: ReturnType<typeof setInterval>;
let closing = false;
async function close() { if (closing) return; closing = true; clearInterval(timer); await collector.stop(); process.exit(0); }
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());
console.log('Activity Monitor와 같은 시각에 3회 이상 기록하세요. CPU는 전 코어 합산 0~100%, 용량은 GiB입니다. 종료: Ctrl+C');
const limit = Number(process.argv.find(arg => arg.startsWith('--samples='))?.split('=')[1] ?? Infinity);
let count = 0;
const show = () => {
  const s = collector.snapshot(true);
  const g = (value: number | undefined) => value === undefined ? '—' : (value / GiB).toFixed(3);
  console.log(JSON.stringify({ 시각: s.sampledAt === null ? null : new Date(s.sampledAt).toISOString(), seq: s.seq, 상태: s.status,
    CPU: s.cpu, 메모리GiB: s.memory && { 사용: g(s.memory.used), 앱: g(s.memory.app), 와이어드: g(s.memory.wired), 압축: g(s.memory.compressed), 캐시: g(s.memory.cached), 전체: g(s.memory.total) },
    압력: s.pressure, 스왑GiB: s.swap && { 사용: g(s.swap.used), 전체: g(s.swap.total) }, 앱: s.processes, 오류: s.errors }));
  if (s.cpu && ++count >= limit) void close();
};
void collector.start().then(() => { show(); if (!closing) timer = setInterval(show, 2000); }).catch(error => { console.error(error); void close(); });
