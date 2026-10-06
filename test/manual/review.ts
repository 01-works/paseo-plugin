// 가상 수치만 모델에 전송한다. 실제 프로세스 종료 코드와 연결하지 않는다.
import { performance } from 'node:perf_hooks';
import { createCodexReviewer } from '../../server/automation/reviewer';
const GiB = 1024 ** 3;
async function main() {
const start = performance.now();
const result = await createCodexReviewer()({ pressure: 'critical', memoryUsed: 14 * GiB, memoryTotal: 16 * GiB, candidates: [{
  process: { pid: 12345, start: '123456', group: 'synthetic-build-worker', name: '정상 빌드 작업 (검증용 가상 데이터)', memoryBytes: 2 * GiB, cpuPercent: 30 },
  points: Array.from({ length: 31 }, (_, i) => ({ t: i * 2000, memoryBytes: GiB + i * GiB / 30, cpuPercent: 30 })),
  growthBytes: GiB, approved: false,
}] }, new AbortController().signal);
console.log(JSON.stringify({ synthetic: true, model: 'gpt-6-luna', elapsedMs: Math.round(performance.now() - start), ...result }));
}
void main().catch(error => { console.error(String(error)); process.exitCode = 1; });
