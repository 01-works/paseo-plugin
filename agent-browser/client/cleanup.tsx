import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { FlatList, Modal, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentChangedTime, browserTime } from '../shared/browser';
import { cleanupPeriods, createCleanupPlan, type CleanupOutcome, type CleanupPlan, type CleanupResult } from '../shared/cleanup';
import type { AgentDirectory, DirectorySnapshot } from './directory';
import type { BrowserState, BrowserViewState } from './view-state';
import { Button, ControlLayout, Status } from './controls';
import { spacing } from './spacing';

export function AgentCleanup({ theme, layout, directory, snapshot, store, state, workspaceId, agentId, disabled }: PluginHostProps & {
  directory: AgentDirectory; snapshot: DirectorySnapshot; store: BrowserViewState; state: BrowserState;
  workspaceId: string; agentId: string; disabled: boolean;
}) {
  const c = theme.colors, toast = useToast();
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [outcomes, setOutcomes] = useState< readonly CleanupOutcome[]>([]);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState< string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const unavailable = !snapshot.loaded || snapshot.loading || snapshot.partial || snapshot.stale || Boolean(snapshot.error);
  const count = useMemo(() => createCleanupPlan(snapshot.agents, workspaceId, agentId, state.cleanupDays).agents.length,
    [snapshot.agents, workspaceId, agentId, state.cleanupDays]);
  const statuses = useMemo(() => new Map(outcomes.map(outcome => [outcome.id, outcome])), [outcomes]);
  const review = (days = state.cleanupDays) => {
    if (controller.current || unavailable || disabled) return;
    store.set({ cleanupDays: days });
    setPlan(createCleanupPlan(directory.getSnapshot().agents, workspaceId, agentId, days));
    setResult(null); setOutcomes([]); setError(null);
  };
  const confirm = async () => {
    if (!plan?.agents.length || controller.current || unavailable || disabled || result) return;
    const active = new AbortController();
    controller.current = active; setBusy(true); setError(null);
    try {
      const finished = await directory.cleanup(plan, { signal: active.signal,
        onProgress: progress => { if (mounted.current) setOutcomes(progress); } });
      if (mounted.current) {
        setResult(finished);
        const archived = finished.outcomes.filter(outcome => outcome.status === 'archived').length;
        toast.show(archived + '개를 보관함으로 이동했습니다', { durationMs: 2200 });
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name === 'AgentActionError'
        ? cause.message : '정리를 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요');
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const summary = result ? result.outcomes.filter(outcome => outcome.status === 'archived').length + '개 보관 · ' +
    result.outcomes.filter(outcome => outcome.status === 'skipped').length + '개 건너뜀 · ' +
    result.outcomes.filter(outcome => outcome.status === 'failed').length + '개 실패' : null;
  return <View style={{ flexShrink: 0, paddingHorizontal: spacing.inset, paddingTop: spacing.gap, borderTopWidth: 1, borderColor: c.border }}>
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <Button theme={theme} variant="outline" icon="Archive" label="오래된 에이전트 정리"
        hint="대상 목록을 확인한 뒤 대화를 보관합니다" disabled={disabled || unavailable || busy} onPress={() => review()}>
        {'오래된 에이전트 정리 · ' + count + '개'}
      </Button>
    </View>
    {plan ? <Modal title="오래된 에이전트 정리" open onOpenChange={open => { if (!open && !controller.current) setPlan(null); }}>
      <Modal.Content scrollable={false} contentContainerStyle={{ flex: 1, minHeight: 0, padding: spacing.section }}>
        <ControlLayout compact={layout.compact}><View style={{ flex: 1, minHeight: 0, gap: spacing.inset }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}>
            <Text style={{ flex: 1, color: c.foregroundMuted }}>최근 활동 없음</Text>
            {cleanupPeriods.map(days => <Button key={days} theme={theme} label={days + '일 정리 기준'}
              active={plan.days === days} disabled={busy || Boolean(result) || unavailable || disabled}
              onPress={() => review(days)}>{days + '일'}</Button>)}
          </View>
          <Text style={{ color: c.foreground }}>{plan.days + '일 이상 최근 변경이 없는 ' + plan.agents.length + '개를 보관함으로 이동합니다.'}</Text>
          <Text style={{ color: c.foregroundMuted }}>현재 대화와 작업 중인 대화는 제외합니다. 하위에 최근 활동이나 진행 중인 작업이 있으면 상위도 제외합니다.</Text>
          {unavailable ? <Text accessibilityRole="alert" style={{ color: c.statusWarning }}>목록을 모두 읽고 연결 상태를 확인한 뒤 정리할 수 있습니다.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>{error}</Text> : null}
          {summary ? <Text accessibilityRole="alert" style={{ color: c.foreground }}>{summary}</Text> : null}
          {result?.stopped ? <Text style={{ color: c.foregroundMuted }}>
            {'정리가 중단되었습니다. ' + (plan.agents.length - result.outcomes.length) + '개는 처리하지 않았습니다.'}
          </Text> : null}
          <FlatList accessibilityLabel="정리할 에이전트 목록" data={plan.agents} keyExtractor={agent => agent.key}
            initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5} extraData={outcomes}
            style={{ flex: 1, minHeight: 0, borderTopWidth: 1, borderColor: c.border }}
            ListEmptyComponent={<Text style={{ color: c.foregroundMuted, paddingVertical: spacing.inset }}>이 기준에 해당하는 대화가 없습니다.</Text>}
            renderItem={({ item }) => {
              const outcome = statuses.get(item.id);
              return <View style={{ paddingVertical: spacing.inset, gap: spacing.small, borderBottomWidth: 1, borderColor: c.border }}>
                <Text numberOfLines={2} style={{ color: c.foreground }}>{item.title}</Text>
                <View style={{ flexDirection: 'row', gap: spacing.gap, alignItems: 'center' }}>
                  {outcome ? <Text style={{ color: outcome.status === 'failed' ? c.statusDanger : c.foregroundMuted }}>
                    {outcome.status === 'archived' ? '보관 완료' : outcome.status === 'skipped' ? '건너뜀' : '실패'}
                  </Text> : <Status state={item.state} theme={theme} stale={snapshot.stale} />}
                  <Text style={{ flex: 1, textAlign: 'right', color: c.foregroundMuted }}>{browserTime(agentChangedTime(item), layout.compact)}</Text>
                </View>
                {outcome?.message ? <Text style={{ color: c.foregroundMuted }}>{outcome.message}</Text> : null}
              </View>;
            }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.gap }}>
            {busy ? <Button theme={theme} variant="outline" label="에이전트 정리 중단" onPress={() => controller.current?.abort()}>중단</Button> :
              <Button theme={theme} onPress={() => setPlan(null)}>{result ? '닫기' : '취소'}</Button>}
            {result ? <Button theme={theme} variant="outline" disabled={unavailable || disabled} onPress={() => review()}>대상 다시 확인</Button> :
              <Button theme={theme} variant="outline" label="오래된 에이전트 보관 확인" danger
                disabled={busy || unavailable || disabled || !plan.agents.length} onPress={() => { void confirm(); }}>
                {busy ? '정리 중 ' + outcomes.length + '/' + plan.agents.length : plan.agents.length + '개 보관'}
              </Button>}
          </View>
        </View></ControlLayout>
      </Modal.Content>
    </Modal> : null}
  </View>;
}
