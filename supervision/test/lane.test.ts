import { describe, expect, it } from 'vitest';
import { goalSlug, laneName, tasksMarkdown, supervisorPrompt } from '../shared/lane';
import { record } from './fixtures';

describe('lane 이름과 기록', () => {
  it.each([
    ['../감독/../../테스트', '감독-테스트'], ['ＦＯＯ / Bar', 'foo-bar'], ['... 💡', 'goal'],
    ['a\\b\u0000c', 'a-b-c'], ['  Hello   World! ', 'hello-world'],
  ])('slug %s', (input, expected) => expect(goalSlug(input)).toBe(expected));
  it('긴 slug를 제한한다', () => expect(goalSlug('가'.repeat(100))).toHaveLength(48));
  it('로컬 날짜와 임의 4자를 사용한다', () => {
    expect(laneName('목표', new Date(2026, 10, 17), 'a0f3')).toBe('목표-20261117-a0f3');
    expect(() => laneName('목표', new Date(), '../x')).toThrow();
    expect(() => laneName('목표', new Date('invalid'), 'a0f3')).toThrow();
  });
  it('머리말 자리와 스킬의 첫 요청 형식을 만든다', () => {
    const text = tasksMarkdown(record);
    expect(text.split('\n').slice(0, 2)).toEqual([
      '감독: claude/claude-opus-5-5 <대화 생성 후 ID 기록> @ srv_test', '상태: 진행',
    ]);
    const ledger = JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)![1]);
    expect(ledger).toEqual({ 목표버전: 1, 승인: [], 항목: [{ id: 'G1', 원문: record.goal,
      시각: record.recordedAt, 출처: `대화 srv_test/${record.origin.agentId}`, 상태: '열림', 대기: '없음' }] });
    expect(tasksMarkdown(record, record.origin.agentId)).toContain(`${record.origin.agentId} @ srv_test`);
  });
  it('요청의 코드 펜스와 줄바꿈을 JSON으로 보존한다', () => {
    const goal = '원문\n```\n"인용" \\ 경로';
    const text = tasksMarkdown({ ...record, goal });
    expect(text.match(/^```/gm)).toHaveLength(4);
    expect(JSON.parse(text.match(/```json\n([\s\S]*?)\n```/)![1]).항목[0].원문).toBe(goal);
  });
  it('원 대화 주소와 기존 맥락을 읽으라는 지시를 전달한다', () => {
    const prompt = supervisorPrompt(record.goal, '/state/lane', record.origin);
    for (const value of ['yw-supervisor', '/state/lane', record.origin.agentId, 'srv_test', '다시 묻지']) expect(prompt).toContain(value);
  });
});
