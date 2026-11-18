import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { reportInputSchema, reportSchema } from '../shared/report';
import { report } from './fixtures';

describe('감독 보고 계약', () => {
  it('전체 보고와 도구 JSON schema를 직렬화한다', () => {
    expect(reportInputSchema.parse({ ...report(), laneDir: '/lane' }).laneDir).toBe('/lane');
    expect(z.toJSONSchema(reportInputSchema).type).toBe('object');
  });
  it('완료인데 열린 항목이 있으면 남은 ID·요약을 안내한다', () => {
    expect(() => reportSchema.parse({ ...report(), turnEnd: { kind: 'done', detail: '끝' } })).toThrow('goal (목표)');
  });
  it.each(['done', 'deferred'])('%s 항목의 근거가 필수다', status => {
    expect(() => reportInputSchema.parse({ ...report(), items: [{ id: 'g', summary: '작업', status }] })).toThrow(status === 'done' ? 'evidence' : 'deferredBy');
  });
  it('완료·연기는 각각 근거를 붙여 기록한다', () => {
    expect(reportSchema.parse({ ...report(), items: [{ id: 'a', summary: '구현', status: 'done', evidence: 'commit abc' },
      { id: 'b', summary: 'GUI', status: 'deferred', deferredBy: '사용자 메시지 #2' }], turnEnd: { kind: 'done', detail: '종료' } }).items).toHaveLength(2);
  });
  it('대기는 재개 조건을 요구한다', () => {
    expect(() => reportSchema.parse({ ...report(), turnEnd: { kind: 'waiting', detail: 'CI' } })).toThrow('resume');
    expect(reportSchema.parse({ ...report(), turnEnd: { kind: 'waiting', detail: 'CI', resume: { type: 'pr_check', ref: 'PR #1' } } }).turnEnd.resume?.type).toBe('pr_check');
  });
  it('중복 ID와 공백 근거를 거부한다', () => {
    expect(() => reportSchema.parse({ ...report(), items: [...report().items, ...report().items] })).toThrow('중복');
    expect(() => reportSchema.parse({ ...report(), items: [{ id: 'a', summary: '작업', status: 'done', evidence: ' ' }] })).toThrow();
  });
});
