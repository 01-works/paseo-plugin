// 가상 프로세스 정보의 실제 Luna 검토만 수행한다. PID 조회나 종료 신호는 보내지 않는다.
import { createCodexReviewer } from '../../server/cleanup-reviewer.ts';
import { item } from '../cleanup-fixtures.ts';
const start = performance.now();
const value = await createCodexReviewer()({ items: [item, { ...item, pid: 124, name: 'Chrome', group: 'Chrome',
  command: 'chrome --headless --remote-debugging-port=9222 --user-data-dir=/tmp/test-browser', cwd: '/tmp/browser-test' }] }, new AbortController().signal);
console.log(JSON.stringify({ synthetic: true, seconds: (performance.now() - start) / 1000, result: value }));
