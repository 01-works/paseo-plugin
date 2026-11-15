// 실제 verifier 로그에서 줄인 표본. 형식 근거: 01-software scripts/release/verifier-loop.mjs, nightly-local-check.mjs
const clock = 'clock=[{"lane":"ecommerce-db","status":"unobserved","samples":0,"startedAt":null}]';
const order = 'lane_order={"order":["install","app-packages","release-prepare-dry-run"],"source":null}';
const ready = 'preflight=[{"item":"docker","ready":true,"measurement":"server=29.5.2"},{"item":"disk","ready":true,"measurement":"available_kib=41735836,minimum_kib=10485760"}]';
const lowDisk = 'preflight=[{"item":"docker","ready":true,"measurement":"server=29.5.2"},{"item":"disk","ready":false,"measurement":"available_kib=10123764,minimum_kib=10485760","reason":"low-space"}]';

export function summaryLine(at: string, log: string, sha: string, status: string, runSeconds: number, preflight = ready) {
  const exit = status === 'success' ? 0 : status === 'failure' ? 1 : 3;
  return `${at} log=${log} kind=tip mode=full sha=${sha} runner=${sha} exit=${exit} status=${status} status_id=- queue_wait_s=0 lock_wait_s=0 run_s=${runSeconds} memory_wait_s=0 peak_rss_kib=- ${preflight} ${status === 'none' ? 'lane_order=-' : order} ${clock}`;
}

export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);
export const SHA_C = 'c'.repeat(40);
export const LOW_DISK = lowDisk;

export const finishedFailureLog = `2026-11-15T05:11:51.000Z Target tip ${SHA_B}; runner code origin/dev ${SHA_B}
2026-11-15T05:11:51.100Z Waiting for compat yw-heavy FIFO
2026-11-15T05:11:51.200Z Compat yw-heavy acquired after 0s
2026-11-15T05:11:51.300Z Heavy authority acquired via local after 0s
Lane order summary: {"order":["install","app-packages","release-prepare-dry-run"],"source":null}
[install] start
[install] passed in 13s (exit 0)
[app-packages] start
[app-packages] failed in 118s (exit 1)
[app-packages] classification=unknown reason=failure-unidentified signature=e918
[release-prepare-dry-run] start
[release-prepare-dry-run] passed in 229s (exit 0)
Total 360s; failure: Failed: app-packages
Recorded verifier=failure on X.
`;

export const runningLog = `2026-11-15T07:01:31.167Z Target tip ${SHA_C}; runner code origin/dev ${SHA_C}
2026-11-15T07:01:31.186Z Waiting for compat yw-heavy FIFO
2026-11-15T07:01:31.297Z Compat yw-heavy acquired after 0s
2026-11-15T07:01:31.300Z Heavy authority acquired via local after 0s
Preflight summary: [{"item":"docker","ready":true,"measurement":"server=29.5.2"}]
Lane order summary: {"order":["install","app-packages","release-prepare-dry-run"],"source":{"sha":"x","statusId":1,"diagnoses":[]}}
[install] start
[install] passed in 13s (exit 0)
[app-packages] start
`;

export const waitingLog = `2026-11-15T07:01:31.167Z Target tip ${SHA_C}; runner code origin/dev ${SHA_C}
2026-11-15T07:01:31.186Z Waiting for compat yw-heavy FIFO
`;

export const launchctlRunning = `gui/501/local.01-software.verifier-loop = {
\tactive count = 1
\tpath = /Users/x/Library/LaunchAgents/local.01-software.verifier-loop.plist
\ttype = LaunchAgent
\tstate = running

\tprogram = /bin/sh
\truns = 751
\tpid = 78978
\tlast exit code = 1
\trun interval = 300 seconds
\tendpoints = {
\t\t"x" = {
\t\t\tstate = active
\t\t}
\t}
}
`;

export const dfOutput = `Filesystem     1024-blocks      Used Available Capacity  Mounted on
/dev/disk3s5    482797652 430000000  38545204    92%    /System/Volumes/Data
`;
