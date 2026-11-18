import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveStateHome } from '../server/files';
import { LaneStore } from '../server/lanes';
import { ReportStore } from '../server/reports';
import { TurnStore } from '../server/turns';
import contribute from '../index.server';
import { record, origin } from './fixtures';

vi.mock('node:os', async original => ({ ...await original<typeof import('node:os')>(), homedir: vi.fn() }));
const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
it.each(['relative', 'file', ''])('무효 XDG %s는 기본 경로로 대체하고 플러그인·감독 생성을 유지한다', async invalid => {
  const root = await mkdtemp(join(tmpdir(), 'supervision-home-')); roots.push(root); vi.mocked(homedir).mockReturnValue(root);
  const regular = join(root, 'not-directory'); await writeFile(regular, 'file');
  vi.stubEnv('XDG_STATE_HOME', invalid === 'file' ? regular : invalid);
  expect(resolveStateHome()).toBe(join(root, '.local', 'state'));
  expect(() => contribute({ addHook: () => () => {}, handle: () => {} } as never)).not.toThrow();
  const lane = await new LaneStore(undefined, () => 'abcd').create({ ...record, originId: origin.agentId });
  expect(lane.path).toContain(join(root, '.local', 'state', 'yw-supervisor'));
  expect(await new ReportStore().list()).toEqual([]);
  await new TurnStore().record('a', 'before', '2026-11-18T00:00:00Z');
});
it('절대 경로의 아직 없는 상태 폴더는 유효하다', () => {
  expect(resolveStateHome('/new/state/home')).toBe('/new/state/home');
});

it('NUL을 포함한 직접 입력은 기본 경로로 대체한다', () => {
  vi.mocked(homedir).mockReturnValue('/fallback-home');
  expect(resolveStateHome('/invalid\0path')).toBe('/fallback-home/.local/state');
  expect(() => new TurnStore('/invalid\0path')).not.toThrow();
});
