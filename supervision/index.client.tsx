import type { PluginClientContext } from '@getpaseo/plugin/client';
import { startSupervisor, openMySupervisor } from './client/actions';
import { OpenAgent } from './client/open-agent';

export default function contribute(client: PluginClientContext) {
  const pending = new Set<string>();
  const cleanup = [
    client.addScreen({ id: 'open-agent', title: '감독 대화로 이동', Component: OpenAgent }),
    // 두 버전의 runtime은 이름을 ^[a-z][a-z0-9-]*$로 제한한다. /감독은 등록 불가.
    client.addSlashCommand({ name: 'supervise', description: '이 목표를 맡을 감독 대화 시작', argumentHint: '<목표>', context: 'agent',
      async onSubmit(context) {
        if (pending.has(context.agent.id)) throw new Error('이 대화의 감독을 만들고 있습니다. 잠시 기다려 주세요.');
        pending.add(context.agent.id);
        try { const { warning } = await startSupervisor(context, context.args); if (warning) throw new Error(warning); }
        finally { pending.delete(context.agent.id); }
      },
    }),
    client.addSlashCommand({ name: 'my-supervisor', description: '내 감독으로 이동', argumentHint: '', context: 'agent', onSubmit: openMySupervisor }),
    client.addCommandCenterItem({ id: 'my-supervisor', title: '내 감독으로 이동', icon: 'CornerLeftUp',
      keywords: ['감독', 'supervisor', 'parent'], context: 'agent', onSelect: openMySupervisor }),
  ];
  return () => { for (const remove of cleanup) remove(); };
}
