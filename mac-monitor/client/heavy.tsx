import { Pressable, Text, View } from 'react-native';
import type { PluginSurfaceProps } from '@getpaseo/plugin/client';
import type { HeavyItem, HeavyQueue, HeavySlot } from '../shared/heavy';
import { useAgentNames } from './agents';
import { useHeavy } from './heavy-data';
import { findWorkspace, useWorkspaces, type WorkspaceInfo } from './workspaces';
import { Badge, Card, type Theme } from './visuals';

const SHOWN = 20;
// status --json 한 번이 약 0.2초의 CPU를 쓴다. 사이드바는 화면보다 드물게 읽는다.
export const SIDEBAR_INTERVAL = 60_000;
export const CARD_INTERVAL = 15_000;
// 실행 중인 작업이 이만큼 차례를 잡으면 눈에 띄게 한다. 끝나는 시각은 예측하지 않는다(같은 이름 이력이 거의 없어 맞지 않음).
export const LONG_RUN_SECONDS = 30 * 60;

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
type Names = Record<string, string>;
type OpenAgent = (agentId: string) => void;
type OpenWorkspace = (workspaceId: string) => void;
const supervisorName = (id: string | null, names: Names) => id === null ? '감독 확인 불가' : Object.hasOwn(names, id) ? names[id] : id.slice(0, 12);

// 이 호스트에서 찾은 감독만 세션을 연다. 구버전 앱에는 이동 기능이 없다.
function Supervisor({ theme, id, names, openAgent }: { theme: Theme; id: string | null; names: Names; openAgent?: OpenAgent }) {
  const c = theme.colors, name = supervisorName(id, names);
  if (!openAgent || id === null || !Object.hasOwn(names, id)) return <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: c.foregroundMuted, flexShrink: 1 }}>{name}</Text>;
  return <Pressable accessibilityRole="link" accessibilityLabel={`감독 세션 열기: ${name}`} hitSlop={6} onPress={() => openAgent(id)}
    style={({ pressed }) => ({ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 4, backgroundColor: pressed ? c.surface2 : undefined })}>
    <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: c.accent }}>{name}</Text>
  </Pressable>;
}

type RowContext = { theme: Theme; names: Names; workspaces: readonly WorkspaceInfo[]; openAgent?: OpenAgent; openWorkspace?: OpenWorkspace };
// 제목: workspace 이름 → 작업 폴더 이름 → 작업 ID. 제목이 있으면 작업 ID는 둘째 줄로 내린다.
function Title({ theme, item, workspace, openWorkspace }: { theme: Theme; item: HeavyItem; workspace: WorkspaceInfo | null; openWorkspace?: OpenWorkspace }) {
  const c = theme.colors;
  const label = workspace?.name ?? item.directory?.split('/').filter(Boolean).pop() ?? item.id ?? '작업 확인 불가';
  if (!workspace || !openWorkspace) return <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: c.foreground, fontWeight: '600' }}>{label}</Text>;
  return <Pressable accessibilityRole="link" accessibilityLabel={`workspace 열기: ${label}`} onPress={() => openWorkspace(workspace.id)}
    style={({ pressed }) => ({ alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 4, backgroundColor: pressed ? c.surface2 : undefined })}>
    <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: c.foreground, fontWeight: '600' }}>{label}</Text>
  </Pressable>;
}
function Row({ theme, position, item, time, long = false, names, workspaces, openAgent, openWorkspace }: RowContext & { position: string; item: HeavyItem; time: string; long?: boolean }) {
  const c = theme.colors, workspace = findWorkspace(workspaces, item.directory);
  const titled = workspace !== null || item.directory !== null;
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderColor: c.border }}>
    <Text style={{ color: c.foregroundMuted, minWidth: 32, fontVariant: ['tabular-nums'] }}>{position}</Text>
    <View style={{ flex: 1, minWidth: 0 }}>
      <Title theme={theme} item={item} workspace={workspace} openWorkspace={openWorkspace} />
      {titled && item.id !== null ? <Text selectable numberOfLines={1} ellipsizeMode="middle" style={{ color: c.foregroundMuted }}>{item.id}</Text> : null}
      <Supervisor theme={theme} id={item.supervisor} names={names} openAgent={openAgent} />
    </View>
    {workspace?.pr == null ? null : <Badge theme={theme} label={`PR #${workspace.pr}`} />}
    {long ? <Badge theme={theme} label="오래 실행 중" color={c.statusWarning} dot /> : null}
    {item.state === 'alive' ? null : <Badge theme={theme} label={dead(item) ? '끝남' : '확인 불가'} />}
    <Text style={{ color: c.foregroundMuted, fontVariant: ['tabular-nums'] }}>{time}</Text>
  </View>;
}

function Slot({ slot, now, ...context }: RowContext & { slot: HeavySlot; now: number }) {
  const { theme } = context, c = theme.colors, items = orderedWaiting(slot), turns = new Set(slot.turns ?? []);
  const queued = (item: HeavyItem) => { const value = age(item, now); return value === null ? '—' : duration(value); };
  return <View>
    {slot.name === 'main' ? null : <Text style={{ color: c.foregroundMuted, fontWeight: '600', paddingTop: 8 }}>{slot.name === 'verifier' ? '검증 자리' : slot.name}</Text>}
    {slot.running ? <Row {...context} position="실행" item={slot.running}
      time={slot.running.started === null ? '—' : duration(now / 1000 - slot.running.started)}
      long={slot.running.started !== null && now / 1000 - slot.running.started >= LONG_RUN_SECONDS} />
      : <Text style={{ color: c.foregroundMuted, paddingVertical: 6 }}>실행 중인 작업 없음</Text>}
    {items.length && !slot.turns ? <Text style={{ color: c.foregroundMuted, paddingVertical: 6 }}>실제 차례를 알 수 없어 등록 순서로 표시</Text> : null}
    {items.slice(0, SHOWN).map((item, index) => <Row key={`${item.id}:${index}`} {...context} position={item.id !== null && turns.has(item.id) ? `${index + 1}` : '·'} item={item} time={queued(item)} />)}
    {items.length > SHOWN ? <Text style={{ color: c.foregroundMuted, paddingTop: 6 }}>외 {items.length - SHOWN}건</Text> : null}
  </View>;
}

// 대기열을 읽은 뒤에만 감독·workspace 목록을 조회한다.
function Slots({ theme, hostId, navigation, slots, now }: { theme: Theme; hostId: string; navigation?: PluginSurfaceProps['navigation']; slots: HeavySlot[]; now: number }) {
  const names = useAgentNames(hostId);
  const workspaces = useWorkspaces(hostId);
  const open = navigation?.openAgent;
  const openAgent = open ? (agentId: string) => open({ agentId, serverId: hostId }) : undefined;
  const show = navigation?.openWorkspace;
  const openWorkspace = show ? (workspaceId: string) => show({ workspaceId, serverId: hostId }) : undefined;
  return <>{slots.map(slot => <Slot key={slot.name} theme={theme} slot={slot} now={now} names={names} workspaces={workspaces} openAgent={openAgent} openWorkspace={openWorkspace} />)}</>;
}

export function HeavyCard({ theme, hostId, navigation }: { theme: Theme; hostId: string; navigation?: PluginSurfaceProps['navigation'] }) {
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
    {data.queue ? <Slots theme={theme} hostId={hostId} navigation={navigation} slots={data.queue.slots} now={data.sampledAt} />
      : <Text style={{ color: c.foregroundMuted }}>{data.status === 'unsupported' ? '이 기기의 yw-heavy가 현황 조회를 지원하지 않음 · 갱신 필요' : '대기열 확인 불가'}</Text>}
  </Card>;
}

export function HeavyTrailing({ theme }: { theme: Theme }) {
  const { data, failed } = useHeavy(SIDEBAR_INTERVAL);
  // 사이드바에는 '이전 값' 표시 자리가 없어, 조회가 실패하면 옛 건수를 보이지 않는다.
  if (failed || !data?.queue) return null;
  const { waiting, oldest } = heavySummary(data.queue, data.sampledAt);
  if (!waiting) return null;
  return <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontVariant: ['tabular-nums'] }}>대기 {waiting}{oldest === null ? '' : ` · ${duration(oldest)}`}</Text>;
}
