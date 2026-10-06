import type { Snapshot } from '../shared/contracts';
import { GiB } from '../shared/units';
export function gib(value: number | null | undefined): string {
  if (value == null) return '—';
  const amount = value / GiB;
  return amount > 0 && amount < 0.1 ? '<0.1 GiB' : `${amount.toFixed(1)} GiB`;
}
export function percent(value: number | null | undefined): string { return value == null ? '—' : `${Math.round(value)}%`; }
export function appPercent(value: number | null | undefined): string { return value == null ? '—' : value > 0 && value < 0.1 ? '<0.1%' : `${value.toFixed(1)}%`; }
export function relativeTime(ageMs: number | null): string { return ageMs === null ? '아직 샘플 없음' : ageMs < 1000 ? '방금' : `${Math.floor(Math.max(0, ageMs) / 1000)}초 전`; }
export const pressureLabels = { normal: '정상', warning: '주의', critical: '위험', unknown: '확인 불가' } as const;
export const statusLabels = { warming: '측정 중', ok: '최신', stale: '지연', error: '오류', unsupported: 'macOS 전용 — 이 호스트는 미지원' } as const;
export function pillLabel(s: Snapshot | null): string {
  if (!s) return '측정 중';
  if (s.status === 'unsupported') return 'macOS 미지원';
  const cpu = percent(s.cpu?.total);
  // 호스트가 모든 composer pill을 최대 160px로 제한한다. G는 GiB의 축약이다.
  const memory = s.memory ? `${(s.memory.used / GiB).toFixed(1)}G` : '—';
  const prefix = s.status === 'ok' ? '' : `${statusLabels[s.status]} · `;
  return `${prefix}${cpu} · ${memory}`;
}

export function displaySnapshot(snapshot: Snapshot, connectionError = false, now = Date.now()): Snapshot {
  const ageMs = snapshot.sampledAt === null ? null : Math.max(0, now - snapshot.sampledAt);
  const status = snapshot.status === 'unsupported' ? 'unsupported' : connectionError || snapshot.status === 'error' || (ageMs !== null && ageMs > 15_000) ? 'error' : (ageMs !== null && ageMs > 5_000) ? 'stale' : snapshot.status;
  return { ...snapshot, ageMs, status };
}
