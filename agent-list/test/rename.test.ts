import { expect, it, vi } from 'vitest';
import type { PaseoApi } from '@getpaseo/client';
import { createAgentDirectory } from '../client/directory';
import { renamePrompt } from '../shared/rename';

function api(models: Record<string, string[]>, helpers: { id: string; workspaceId: string; createdAt: string }[] = []) {
  const create = vi.fn(async () => ({ id: 'helper' }));
  const workspaces = { ref: vi.fn(() => ({ agents: { create } })) };
  const providers = { listModels: vi.fn(async (provider: string) => {
    if (!models[provider]) throw new Error('제공자 없음');
    return { models: models[provider].map(id => ({ id })) };
  }) };
  const list = vi.fn(async () => ({ entries: helpers.map(agent => ({ agent })) }));
  return { client: { agents: { list }, workspaces, providers } as unknown as PaseoApi, create, workspaces, list };
}
const request = (provider: string) => ({ config: { provider, modeId: provider.startsWith('codex') ? 'auto-review' : 'auto', thinkingOptionId: 'low' }, title: '에이전트 이름 정리',
  prompt: renamePrompt('w'), labels: { 'agent-list.role': 'rename' } });

it('저렴한 모델 순서대로 이 기기에서 쓸 수 있는 첫 모델로 같은 workspace에 도우미를 한 번만 만든다', async () => {
  const h = api({ codex: ['gpt-6-astra', 'gpt-6.1-terra'], claude: ['claude-sonnet-5-5'] });
  const directory = createAgentDirectory(h.client, 'h');
  expect(await Promise.all([directory.startRename('w'), directory.startRename('w')])).toEqual(['helper', 'helper']);
  expect(h.create).toHaveBeenCalledTimes(1);
  expect(h.workspaces.ref).toHaveBeenCalledWith('w');
  expect(h.create).toHaveBeenCalledWith(request('codex/gpt-6.1-terra'));
  await directory.dispose();
});

it('Codex를 쓸 수 없으면 Sonnet, 둘 다 없으면 만들지 않는다', async () => {
  const claude = api({ claude: ['claude-opus-5-5', 'claude-sonnet-5-5'] }), directory = createAgentDirectory(claude.client, 'h');
  await directory.startRename('w');
  expect(claude.create).toHaveBeenCalledWith(request('claude/claude-sonnet-5-5'));
  const none = api({ codex: ['gpt-6-astra'], claude: ['claude-opus-5-5'] }), empty = createAgentDirectory(none.client, 'h');
  await expect(empty.startRename('w')).rejects.toThrow('이름 정리에 쓸 모델');
  expect(none.create).not.toHaveBeenCalled();
  await directory.dispose(); await empty.dispose();
});

it('도우미 지시는 감독자 작업자·실행 중 대화를 빼고 묶음·제목을 되돌릴 수 있게 남기며 보관하지 않는다', () => {
  const prompt = renamePrompt('w');
  for (const text of ['paseo.parent-agent-id', 'running', 'agent-list.original-title', 'agent-list.continued-from', '가장 최근 대화 하나만', '빈 값', '보관'])
    expect(prompt).toContain(text);
});
