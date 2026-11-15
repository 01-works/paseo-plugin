import { describe, expect, it } from 'vitest';
import { attentionItems, devState, failureGroups, footerLine, formatAge, formatClock, overallLine } from '../shared/overview';
import { FIRST_RED_SHA, healthy, hostWarning, NOW, red, remote, RUN_SHA, running, SIG_CI, SIG_DB } from './status';

describe('overallLine', () => {
  it('says how long dev has been red and which lanes failed', () => {
    expect(overallLine(red, NOW)).toEqual({ tone: 'danger', label: 'dev 실패 13시간째 · console-ci' });
  });
  it('shows the passing SHA when the last finished run passed', () => {
    expect(overallLine(healthy, NOW)).toEqual({ tone: 'success', label: '통과 · b09aa18' });
  });
  it('falls back to the failure streak without redSince, and puts LaunchAgent off first', () => {
    expect(overallLine({ ...red, redSince: null }, NOW).label).toBe('dev 실패 2회 연속 · console-ci');
    expect(overallLine({ ...red, agent: { loaded: false, running: false, runs: null, intervalSeconds: null } }, NOW)).toEqual({ tone: 'danger', label: 'LaunchAgent 꺼짐' });
    expect(overallLine({ ...healthy, recent: [] }, NOW)).toEqual({ tone: 'muted', label: '실행 기록 없음' });
  });
  it('formats coarse ages', () => {
    expect(formatAge(45 * 60)).toBe('45분');
    expect(formatAge(13 * 3600 + 59 * 60)).toBe('13시간');
    expect(formatAge(50 * 3600)).toBe('2일 2시간');
    expect(formatAge(48 * 3600)).toBe('2일');
  });
});

describe('devState', () => {
  it('reads the GitHub dev tip against verifier results', () => {
    expect(devState(healthy)).toBe('통과');
    expect(devState(red)).toBe('실패');
    expect(devState({ ...running, github: { ...running.github!, devSha: RUN_SHA } })).toBe('검증 중');
    expect(devState({ ...healthy, github: { ...healthy.github!, devSha: 'e'.repeat(40) } })).toBe('아직 검증 안 됨');
    expect(devState(remote)).toBeNull();
  });
});

describe('failureGroups', () => {
  it('groups the last finished run by signature with the first SHA, its PR and the red issue', () => {
    expect(failureGroups(red)).toEqual([
      { signature: SIG_CI, lanes: ['console-ci'], classification: 'reproduced', reason: 'both-failed', streak: 2, firstSha: FIRST_RED_SHA, firstAt: '2026-11-15T20:00:00.000Z', firstPr: '7957', where: 'last', issue: 10196, issueKnown: true },
    ]);
    expect(failureGroups(healthy)).toEqual([]);
  });

  it('merges the current run into one line per signature and keeps the longer streak', () => {
    const groups = failureGroups(running);
    expect(groups.map(group => [group.signature, group.where, group.streak, group.issue])).toEqual([
      [SIG_CI, 'both', 3, 10196],
      [SIG_DB, 'current', 1, null],
    ]);
    // 새로 나온 실패의 첫 SHA는 지금 실행이고, PR은 지금 커밋 제목에서 읽는다.
    expect(groups[1]).toMatchObject({ firstSha: RUN_SHA, firstPr: '7961', issueKnown: true });
  });

  it('does not claim "no issue" when red issues were not read', () => {
    expect(failureGroups({ ...red, github: null })[0]).toMatchObject({ issue: null, issueKnown: false });
    expect(failureGroups({ ...red, github: { ...red.github!, redIssues: null, redIssuesError: 'HTTP 401' } })[0]).toMatchObject({ issue: null, issueKnown: false });
  });

  it('keeps failed lanes that have no classification line', () => {
    const last = red.recent.at(-1)!;
    const status = { ...red, recent: [...red.recent.slice(0, -1), { ...last, failedLanes: ['console-ci', 'sdk'] }] };
    expect(failureGroups(status).map(group => [group.signature, group.lanes, group.classification])).toEqual([
      [SIG_CI, ['console-ci'], 'reproduced'],
      [null, ['sdk'], null],
    ]);
  });
});

describe('attentionItems', () => {
  it('is empty when nothing needs attention', () => {
    expect(attentionItems(healthy, NOW)).toEqual([]);
  });

  it('lists only exceeded host warnings, low disk, deferral and read warnings, each with guidance', () => {
    const items = attentionItems(hostWarning, NOW);
    expect(items.map(item => [item.key, item.tone])).toEqual([['host', 'warning'], ['disk', 'warning'], ['deferral', 'warning'], ['errors', 'muted']]);
    const host = items[0];
    expect(host.kind === 'notice' && host.title).toBe('기기 점검 필요 · swap 92.5% · 남은 lane 컨테이너 1개');
    // 조치 안내는 늘 보이는 줄이 아니라 ⓘ 설명(help)에 둔다.
    expect(host.kind === 'notice' && host.help).toContain('sudo killall fseventsd');
    expect(host.kind === 'notice' && host.lines.join('\n')).not.toContain('sudo killall fseventsd');
    expect(host.kind === 'notice' && host.lines[0]).toContain('console-12345678');
    const disk = items[1];
    expect(disk.kind === 'notice' && disk.title).toBe('디스크 여유 12.0 GiB · 실행 최소 10.0 GiB');
    expect(disk.kind === 'notice' && disk.help).toContain('1.5배');
    expect(items[2].kind === 'notice' && items[2].help).toContain('다음 확인에서 다시 시작');
    expect(attentionItems({ ...hostWarning, disk: { availableKib: 9 * 1024 * 1024, minimumKib: 10 * 1024 * 1024, measuredAt: null } }, NOW).find(item => item.key === 'disk')?.tone).toBe('danger');
    expect(attentionItems({ ...healthy, disk: { availableKib: 15 * 1024 * 1024, minimumKib: 10 * 1024 * 1024, measuredAt: null } }, NOW)).toEqual([]);
  });

  it('puts failures first and reports GitHub and red issue read failures', () => {
    const items = attentionItems({ ...running, githubError: 'HTTP 502', github: { ...running.github!, redIssues: null, redIssuesError: 'gh issue list: HTTP 401' } }, NOW);
    expect(items.map(item => item.key)).toEqual([`failure:${SIG_CI}`, `failure:${SIG_DB}`, 'github', 'red-issues']);
  });
});

describe('footerLine', () => {
  it('shows LaunchAgent, interval, disk and time locally', () => {
    expect(footerLine(healthy, NOW)).toBe(`LaunchAgent 대기 · 5분마다 확인 · 누적 751회 · 디스크 여유 40.0 GiB · ${formatClock(NOW, NOW)} 기준`);
  });
  it('shows the remote target and the preflight disk record remotely', () => {
    expect(footerLine(remote, NOW)).toBe(`원격 verifier-box · LaunchAgent 상태 알 수 없음 · 디스크 여유 40.0 GiB (${formatClock('2026-11-16T06:00:00.000Z', NOW)} preflight) · ${formatClock(NOW, NOW)} 기준`);
  });
});
