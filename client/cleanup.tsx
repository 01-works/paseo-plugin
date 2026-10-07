import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import { useRpc } from '@getpaseo/plugin/client';
import { cleanupStartRpc, cleanupGetRpc, cleanupCancelRpc, cleanupTerminateRpc, processKey,
  type CleanupItem, type CleanupState } from '../shared/cleanup';
import { useStableQuery } from './data';
import { appPercent, gib } from './format';
import { Badge, Card, type Theme } from './visuals';

const labels = { candidate: '정리 후보', keep: '유지 권장', uncertain: '판단 어려움' } as const;
export function elapsedLabel(seconds: number): string {
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}일 ${Math.floor(seconds % 86400 / 3600)}시간`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}시간 ${Math.floor(seconds % 3600 / 60)}분`;
  return `${Math.floor(seconds / 60)}분`;
}
export function CleanupPanel({ theme, hostId, name, onBack }: { theme: Theme; hostId: string; name: string; onBack(): void }) {
  const c = theme.colors;
  const start = useRpc(cleanupStartRpc), get = useRpc(cleanupGetRpc), cancel = useRpc(cleanupCancelRpc), terminate = useRpc(cleanupTerminateRpc);
  const lifetime = useRef<{ mounted: boolean; id?: string; promise?: Promise<CleanupState> }>({ mounted: false });
  const [initial, setInitial] = useState<CleanupState>();
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<CleanupItem[] | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ results: { pid: number; start: string; sent: boolean; error?: string }[] }>();
  const [polling, setPolling] = useState(true);
  useEffect(() => {
    const own = lifetime.current; own.mounted = true;
    own.promise ??= start({});
    void own.promise.then(state => {
      own.id = state.id;
      if (own.mounted) setInitial(state); else void cancel({ id: state.id }).catch(() => {});
    }).catch(err => { if (own.mounted) setError(String(err instanceof Error ? err.message : err)); });
    return () => {
      own.mounted = false;
      // StrictMode의 즉시 재연결은 같은 검사 하나를 사용한다. 실제 닫기/호스트 전환만 취소한다.
      void Promise.resolve().then(() => { if (!own.mounted && own.id) void cancel({ id: own.id }).catch(() => {}); });
    };
  }, [start, cancel]);
  const query = useStableQuery({ queryKey: ['mac-monitor', hostId, 'cleanup', initial?.id],
    queryFn: () => get({ id: initial!.id }),
    enabled: Boolean(initial?.id) && polling && (initial?.phase === 'observing' || initial?.phase === 'reviewing'), refreshInterval: 2000 });
  const state = query.data ?? initial;
  useEffect(() => {
    if (query.error || (state && state.phase !== 'observing' && state.phase !== 'reviewing')) setPolling(false);
  }, [state, query.error]);
  const busy = !error && !query.error && (!state || state.phase === 'observing' || state.phase === 'reviewing');
  const checked = state?.items.filter(item => selected.has(processKey(item)) && item.decision === 'candidate') ?? [];
  const toggle = (key: string) => setSelected(previous => { const next = new Set(previous); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const send = async () => {
    if (!state || !confirmation?.length || pending || result) return;
    setPending(true); setError('');
    try { const value = await terminate({ id: state.id, targets: confirmation.map(({ pid, start }) => ({ pid, start })) });
      if (lifetime.current.mounted) setResult(value);
    } catch (err) { if (lifetime.current.mounted) setError(`종료 요청 실패: ${String(err)}`); }
    finally { if (lifetime.current.mounted) setPending(false); }
  };
  return <Card theme={theme}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="정리 검사 뒤로" disabled={pending} onPress={onBack} style={{ paddingVertical: 8 }}>
        <Text style={{ color: c.foregroundMuted }}>‹ 뒤로</Text>
      </Pressable>
      <Text numberOfLines={1} style={{ color: c.foreground, fontWeight: '600', flex: 1 }}>정리 검사 · {name}</Text>
    </View>
    <ScrollView accessibilityLabel="정리 검사 결과" nestedScrollEnabled style={{ height: 320, flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{ gap: 12, paddingRight: 8, flexGrow: 1 }}>
      {error || query.error || state?.error ? <Text style={{ color: c.foregroundMuted }}>{error || query.error?.message || state?.error}</Text> : null}
      {result ? <>
        <Text style={{ color: c.foreground }}>종료 요청 {result.results.filter(p => p.sent).length}개 · 보내지 못함 {result.results.filter(p => !p.sent).length}개</Text>
        {result.results.filter(p => !p.sent).map(p => <Text key={processKey(p)} style={{ color: c.foregroundMuted }}>PID {p.pid} · {p.error}</Text>)}
      </> : confirmation ? <>
        <Text style={{ color: c.foreground, fontWeight: '600' }}>{confirmation.length}개 종료</Text>
        <Text style={{ color: c.foregroundMuted }}>저장하지 않은 작업을 잃을 수 있습니다.</Text>
        {confirmation.map(p => <Text key={processKey(p)} numberOfLines={1} style={{ color: c.foregroundMuted }}>{p.name} · PID {p.pid}</Text>)}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
          <Pressable accessibilityRole="button" disabled={pending} onPress={() => setConfirmation(null)}><Text style={{ color: c.foreground }}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="선택한 정리 후보 종료 확인" disabled={pending} onPress={() => void send()}>
            <Text style={{ color: pending ? c.foregroundMuted : c.statusDanger }}>{pending ? '요청 중' : '종료'}</Text>
          </Pressable>
        </View>
      </> : busy ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: c.foregroundMuted }}>{state?.phase === 'reviewing' ? 'Luna 검사 중' : `활동 확인 중${state ? ` · ${Math.min(12, Math.floor(state.observedSeconds))}/12초` : ''}`}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="정리 검사 취소" onPress={onBack} style={{ padding: 8 }}><Text style={{ color: c.foregroundMuted }}>취소</Text></Pressable>
      </View> : state?.phase === 'ready' ? <>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Badge theme={theme} label={`정리 후보 ${state.items.filter(p => p.decision === 'candidate').length}개`} />
          <Pressable accessibilityRole="button" accessibilityLabel="선택한 정리 후보 종료 선택" disabled={!checked.length || Boolean(query.error)}
            onPress={() => setConfirmation(checked)} style={{ paddingVertical: 8 }}>
            <Text style={{ color: checked.length && !query.error ? c.foreground : c.foregroundMuted }}>선택 종료{checked.length ? ` (${checked.length})` : ''}</Text>
          </Pressable>
        </View>
        {!state.items.length ? <Text style={{ color: c.foregroundMuted }}>이번 검사 범위에서 검토할 대상이 없습니다.</Text> : null}
        {[...state.items].sort((a, b) => Number(b.decision === 'candidate') - Number(a.decision === 'candidate')).map(p =>
          <View key={processKey(p)} style={{ gap: 6, paddingVertical: 8, borderBottomWidth: 1, borderColor: c.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {p.decision === 'candidate' ? <Pressable accessibilityRole="checkbox" accessibilityLabel={`${p.name} PID ${p.pid} 정리 선택`}
                accessibilityState={{ checked: selected.has(processKey(p)) }} onPress={() => toggle(processKey(p))} style={{ padding: 6 }}>
                <Text style={{ color: selected.has(processKey(p)) ? c.accent : c.foregroundMuted }}>{selected.has(processKey(p)) ? '☑' : '☐'}</Text>
              </Pressable> : null}
              <Text numberOfLines={1} style={{ color: c.foreground, flex: 1 }}>{p.name} · PID {p.pid}</Text>
              <Badge theme={theme} label={labels[p.decision]} />
            </View>
            <Text style={{ color: c.foregroundMuted }}>실행 {elapsedLabel(p.ageSeconds)} · 관찰 {Math.floor(p.observedSeconds)}초 · CPU 최대 {appPercent(p.maxCpuPercent)} · {gib(p.memoryBytes)}</Text>
            {p.history ? <Text style={{ color: c.foregroundMuted }}>최근 {Math.max(1, Math.round(p.history.observedSeconds / 60))}분 · 평균 CPU {appPercent(p.history.averageCpuPercent)} · 메모리 {p.history.memoryDeltaBytes === 0 ? '유지' : `${gib(Math.abs(p.history.memoryDeltaBytes))} ${p.history.memoryDeltaBytes > 0 ? '증가' : '감소'}`}</Text> : null}
            {p.command ? <Text numberOfLines={2} style={{ color: c.foregroundMuted }}>{p.command}</Text> : null}
            {p.cwd ? <Text numberOfLines={1} style={{ color: c.foregroundMuted }}>{p.cwd}</Text> : null}
            <Text style={{ color: c.foregroundMuted }}>{p.reason}</Text>
          </View>)}
      </> : null}
    </ScrollView>
  </Card>;
}
