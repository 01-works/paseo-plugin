import { expect, it } from 'vitest';
import { normalizeAgent } from '../client/normalize';
import { raw } from './fixtures';
  it.each([
    [{ status: 'closed', requiresAttention: true, attentionReason: 'permission' }, 'closed'],
    [{ status: 'running', lastError: 'old', attentionReason: 'finished', requiresAttention: false }, 'running'],
    [{ status: 'idle' }, 'idle'],
    [{ status: 'idle', requiresAttention: true, attentionReason: 'finished' }, 'ready'],
    [{ status: 'running', requiresAttention: true, attentionReason: 'permission' }, 'permission'],
    [{ status: 'initializing' }, 'starting'],
    [{ providerUnavailable: true }, 'unavailable'],
    [{ status: 'error' }, 'error'],
  ] as const)('현재 상태를 과거 플래그와 구분: %j', (patch, expected) => {
    expect(normalizeAgent(raw('a', patch), 'h').state).toBe(expected);
  });
