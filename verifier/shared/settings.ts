import { defineSettings } from '@getpaseo/plugin';
import { z } from 'zod';

// host별 설정. 비워 두면 이 기기의 verifier를 직접 읽는다.
export const verifierSettings = defineSettings({
  id: 'verifier',
  scope: 'host',
  version: 1,
  schema: z.object({
    // bootstrap verifier role의 읽기 전용 SSH 대상(ssh config의 Host 이름 등). 비우면 이 기기를 읽는다.
    sshTarget: z.string().default(''),
    // 커밋 제목·저장소를 읽을 01-software clone. 비우면 verifier checkout 기본 위치다.
    checkout: z.string().default(''),
    // 01-software 작업 디렉터리의 에이전트에게 verifier_status 도구를 준다.
    agentTool: z.boolean().default(true),
  }),
});

export type VerifierSettings = z.output<typeof verifierSettings.schema>;
