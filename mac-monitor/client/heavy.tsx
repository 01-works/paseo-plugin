import { Text, View } from 'react-native';
import { useAgent } from '@getpaseo/plugin/client';
import type { HeavyItem, HeavyQueue, HeavySlot } from '../shared/heavy';
import { useHeavy } from './heavy-data';
import { Badge, Card, type Theme } from './visuals';

const SHOWN = 20;
// status --json 한 번이 약 0.2초의 CPU를 쓴다. 사이드바는 화면보다 드물게 읽는다.
export const SIDEBAR_INTERVAL = 60_000;
export const CARD_INTERVAL = 15_000;

export function duration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  if (minutes < 1) return '1분 미만';
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}시간${rest ? ` ${rest}분` : ''}` : `${minutes}분`;
}
const dead = (item: HeavyItem) => item.state.startsWith('dead:');
const age = (item: HeavyItem, now: number) => item.queued === null ? null : Math.max(0, now / 1000 - item.queued);

export function heavySummary(queue: HeavyQueue, now: number): { waiting: number; oldest: number | null } {
  const live = queue.slots.flatMap(slot => slot.waiting).filter(item => !dead(item));
  const ages = live.map(item => age(item, now)).filter((value): value is number => value !== null);
  return { waiting: live.length, oldest: ages.length ? Math.max(...ages) : null };
}
// 예상 차례를 알면 그 순서, 모르면 등록 순서. 차례에 없는 줄(회수될 줄 등)은 뒤에 둔다.
export function orderedWaiting(slot: HeavySlot): HeavyItem[] {
  if (!slot.turns) return slot.waiting;
  const rank = new Map(slot.turns.map((id, index) => [id, index]));
  const position = (item: HeavyItem) => item.id === null ? Infinity : rank.get(item.id) ?? Infinity;
  return slot.waiting.map((item, index) => ({ item, index, at: position(item) }))
    .sort((a, b) => a.at === b.at ? a.index - b.index : a.at - b.at).map(entry => entry.item);
}

// 이 호스트에 있는 에이전트면 이름, 아니면 ID 앞자리.
function Supervisor({ id, theme }: { id: string | null; theme: Theme }) {
  const title = useAgent(id ?? '', agent => agent.title);
  return <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.foregroundMuted, flexShrink: 1 }}>{title || (id ? id.slice(0, 12) : '감독 확인 불가')}</Text>;
}

function Row({ theme, position, item, time }: { theme: Theme; position: string; item: HeavyItem; time: string }) {
  const c = theme.colors;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: c.border }}>
    <Text style={{ color: c.foregroundMuted, minWidth: 32, fontVariant: ['tabular-nums'] }}>{position}</Text>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text selectable numberOfLines={1} ellipsizeMode="middle" style={{ color: c.foreground }}>{item.id ?? '작업 확인 불가'}</Text>
      <Supervisor id={item.supervisor} theme={theme} />
    </View>
    {item.state === 'alive' ? null : <Badge theme={theme} label={dead(item) ? '끝남' : '확인 불가'} />}
    <Text style={{ color: c.foregroundMuted, fontVariant: ['tabular-nums'] }}>{time}</Text>
  </View>;
}

function Slot({ theme, slot, now }: { theme: Theme; slot: HeavySlot; now: number }) {
  const c = theme.colors, items = orderedWaiting(slot);
  const queued = (item: HeavyItem) => { const value = age(item, now); return value === null ? '—' : duration(value); };
  return <View>
    {slot.name === 'main' ? null : <Text style={{ color: c.foregroundMuted, fontWeight: '600', paddingTop: 8 }}>{slot.name === 'verifier' ? '검증 자리' : slot.name}</Text>}
    {slot.running ? <Row theme={theme} position="실행" item={slot.running}
      time={slot.running.started === null ? '—' : duration(now / 1000 - slot.running.started)} />
      : <Text style={{ color: c.foregroundMuted, paddingVertical: 6 }}>실행 중인 작업 없음</Text>}
    {items.length && !slot.turns ? <Text style={{ color: c.foregroundMuted, paddingVertical: 6 }}>실제 차례를 알 수 없어 등록 순서로 표시</Text> : null}
    {items.slice(0, SHOWN).map((item, index) => <Row key={`${item.id}:${index}`} theme={theme} position={slot.turns ? `${index + 1}` : '·'} item={item} time={queued(item)} />)}
    {items.length > SHOWN ? <Text style={{ color: c.foregroundMuted, paddingTop: 6 }}>외 {items.length - SHOWN}건</Text> : null}
  </View>;
}

export function HeavyCard({ theme }: { theme: Theme }) {
  const { data, failed } = useHeavy(CARD_INTERVAL);
  const c = theme.colors;
  // yw-heavy가 없는 Mac에는 카드를 보이지 않는다.
  if (!data || data.status === 'missing') return null;
  const summary = data.queue ? heavySummary(data.queue, data.sampledAt) : null;
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <Text style={{ color: c.foreground, fontWeight: '600' }}>heavy 대기열</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {data.queue?.paused ? <Badge theme={theme} label="새 제출 중지" color={c.statusWarning} dot /> : null}
        {failed ? <Badge theme={theme} label="이전 값" /> : null}
        {summary ? <Badge theme={theme} label={`대기 ${summary.waiting}${summary.oldest === null ? '' : ` · 최장 ${duration(summary.oldest)}`}`} /> : null}
      </View>
    </View>
    {data.queue ? data.queue.slots.map(slot => <Slot key={slot.name} theme={theme} slot={slot} now={data.sampledAt} />)
      : <Text style={{ color: c.foregroundMuted }}>{data.status === 'unsupported' ? '이 기기의 yw-heavy가 현황 조회를 지원하지 않음 · 갱신 필요' : '대기열 확인 불가'}</Text>}
  </Card>;
}

export function HeavyTrailing({ theme }: { theme: Theme }) {
  const { data } = useHeavy(SIDEBAR_INTERVAL);
  if (!data?.queue) return null;
  const { waiting, oldest } = heavySummary(data.queue, data.sampledAt);
  if (!waiting) return null;
  return <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontVariant: ['tabular-nums'] }}>대기 {waiting}{oldest === null ? '' : ` · ${duration(oldest)}`}</Text>;
}
