import type { PluginClientContext } from '@getpaseo/plugin/client';

// 배포 시 SDK를 따로 설치하지 않도록 호스트가 제공하는 plugin 계약에서 타입을 유도한다.
export type PaseoApi = PluginClientContext['paseo'];
export type PaseoAgentListResult = Awaited<ReturnType<PaseoApi['agents']['list']>>;
export type PaseoAgent = PaseoAgentListResult['entries'][number]['agent'];
export type AgentSubscription = NonNullable<PaseoAgentListResult['subscription']>;
