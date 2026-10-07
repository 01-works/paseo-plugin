import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { automationConfigSchema, automaticTargetSchema, automationEventSchema, reviewedProcessSchema } from '../../shared/automation';
import { paseoHome } from '../host-info';

const stateSchema = z.object({
  v: z.literal(1), config: automationConfigSchema,
  targets: z.array(automaticTargetSchema).max(32), events: z.array(automationEventSchema).max(20),
  reviewTimes: z.array(z.number().finite().nonnegative()).max(6), lastReviewAt: z.number().finite().nonnegative().nullable(),
  reviews: z.array(reviewedProcessSchema).max(4).default([]),
});
export type AutomationState = z.infer<typeof stateSchema>;
export const initialState = (): AutomationState => ({ v: 1, config: automationConfigSchema.parse({}), targets: [], events: [], reviewTimes: [], lastReviewAt: null, reviews: [] });
export function automationFile() { return path.join(paseoHome(), 'mac-monitor', 'automation.json'); }
export async function readAutomation(file = automationFile()): Promise<AutomationState> {
  try {
    if ((await stat(file)).size > 64 * 1024) throw new Error('설정 크기 초과');
    return stateSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initialState(); throw new Error('자동 관리 설정을 읽지 못했습니다. 자동 조치를 중단합니다.'); }
}
export async function writeAutomation(state: AutomationState, file = automationFile()): Promise<void> {
  const valid = stateSchema.parse(state);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}
