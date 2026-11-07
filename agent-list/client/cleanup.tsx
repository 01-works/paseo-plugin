import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { FlatList, Modal, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentChangedTime, listTime } from '../shared/list';
import { cleanupPeriods, createCleanupPlan, type CleanupOutcome, type CleanupPlan, type CleanupResult } from '../shared/cleanup';
import type { AgentDirectory, DirectorySnapshot } from './directory';
import type { ListState, ListViewState } from './view-state';
import { Button, ControlLayout, Status } from './controls';
import { spacing } from './spacing';

export function AgentCleanup({ theme, layout, directory, snapshot, store, state, workspaceId, agentId, disabled }: PluginHostProps & {
  directory: AgentDirectory; snapshot: DirectorySnapshot; store: ListViewState; state: ListState;
  workspaceId: string; agentId: string; disabled: boolean;
}) {
  const c = theme.colors, toast = useToast();
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [outcomes, setOutcomes] = useState< readonly CleanupOutcome[]>([]);
  const [result, setResult] = useState<CleanupResult | null>(null);
  const [error, setError] = useState< string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withRename, setWithRename] = useState(true);
  const [renameStatus, setRenameStatus] = useState<'started' | 'failed' | null>(null);
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
    setResult(null); setOutcomes([]); setError(null); setRenameStatus(null);
  };
  // 보관을 먼저 끝내고 남은 대화만 이름을 정리한다. 이름은 원래 제목 라벨로 되돌릴 수 있어 따로 묻지 않는다.
  const confirm = async () => {
    if (!plan || !(plan.agents.length || withRename) || controller.current || unavailable || disabled || result) return;
    const active = new AbortController();
    controller.current = active; setBusy(true); setError(null);
    try {
      const finished = plan.agents.length ? await directory.cleanup(plan, { signal: active.signal,
        onProgress: progress => { if (mounted.current) setOutcomes(progress); } }) : { outcomes: [], stopped: false };
      if (withRename && !finished.stopped && !active.signal.aborted) {
        try { await directory.startRename(workspaceId); if (mounted.current) setRenameStatus('started'); }
        catch { if (mounted.current) setRenameStatus('failed'); }
      }
      if (mounted.current) {
        setResult(finished);
        const archived = finished.outcomes.filter(outcome => outcome.status === 'archived').length;
        if (plan.agents.length) toast.show(archived + '개를 보관함으로 이동했습니다', { durationMs: 2200 });
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error && cause.name === 'AgentActionError'
        ? cause.message : '정리를 시작하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요');
    } finally {
      controller.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  const summary = result && plan?.agents.length ? result.outcomes.filter(outcome => outcome.status === 'archived').length + '개 보관 · ' +
    result.outcomes.filter(outcome => outcome.status === 'skipped').length + '개 건너뜀 · ' +
    result.outcomes.filter(outcome => outcome.status === 'failed').length + '개 실패' : null;
  return <View style={{ flexShrink: 0, paddingHorizontal: spacing.inset, paddingTop: spacing.gap, borderTopWidth: 1, borderColor: c.border }}>
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.gap }}>
      <Button theme={theme} variant="outline" icon="Archive" label="오래된 에이전트 정리"
        hint="대상 목록을 확인한 뒤 대화를 보관하고 이름을 정리합니다" disabled={disabled || unavailable || busy} onPress={() => review()}>
        {'에이전트 정리 · ' + count + '개'}
      </Button>
    </View>
    {plan ? <Modal title="에이전트 정리" open onOpenChange={open => { if (!open && !controller.current) setPlan(null); }}>
      <Modal.Content scrollable={false} contentContainerStyle={{ flex: 1, minHeight: 0, padding: spacing.section }}>
        <ControlLayout compact={layout.compact}><View style={{ flex: 1, minHeight: 0, gap: spacing.inset }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}>
            <Text style={{ flex: 1, color: c.foregroundMuted }}>최근 활동 없음</Text>
            {cleanupPeriods.map(days => <Button key={days} theme={theme} label={days + '일 정리 기준'}
              active={plan.days === days} disabled={busy || Boolean(result) || unavailable || disabled}
              onPress={() => review(days)}>{days + '일'}</Button>)}
          </View>
          <Text style={{ color: c.foreground }}>{plan.days + '일 이상 최근 변경이 없는 ' + plan.agents.length + '개를 보관함으로 이동합니다.'}</Text>
          <Text style={{ color: c.foregroundMuted }}>현재 대화와 작업 중인 대화는 제외합니다. 하위에 최근 활동이나 진행 중인 작업이 있으면 상위도 제외합니다. 이어진 대화는 하나의 작업으로 보고 모두 오래됐을 때만 함께 보관합니다.</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}>
            <Text style={{ flex: 1, color: c.foregroundMuted }}>보관 뒤 저렴한 모델의 새 대화가 같은 작업을 이어간 대화를 묶고, 작업마다 마지막 대화의 알 수 없는 제목을 바꿉니다. 감독자의 하위 대화는 건드리지 않고, 원래 제목·묶음은 라벨로 남아 되돌릴 수 있습니다.</Text>
            <Button theme={theme} label="보관 뒤 이름도 정리" active={withRename} disabled={busy || Boolean(result)}
              onPress={() => setWithRename(value => !value)}>{withRename ? '이름 정리 켬' : '이름 정리 끔'}</Button>
          </View>
          {unavailable ? <Text accessibilityRole="alert" style={{ color: c.statusWarning }}>목록을 모두 읽고 연결 상태를 확인한 뒤 정리할 수 있습니다.</Text> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>{error}</Text> : null}
          {summary ? <Text accessibilityRole="alert" style={{ color: c.foreground }}>{summary}</Text> : null}
          {renameStatus === 'started' ? <Text style={{ color: c.foreground }}>이름 정리를 시작했습니다. 결과는 '에이전트 이름 정리' 대화에서 확인합니다.</Text> : null}
          {renameStatus === 'failed' ? <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>이름 정리 대화를 만들지 못했습니다. 연결과 모델 사용 가능 여부를 확인해 주세요.</Text> : null}
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
                  <Text style={{ flex: 1, textAlign: 'right', color: c.foregroundMuted }}>{listTime(agentChangedTime(item), layout.compact)}</Text>
                </View>
                {outcome?.message ? <Text style={{ color: c.foregroundMuted }}>{outcome.message}</Text> : null}
              </View>;
            }} />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.gap }}>
            {busy ? <Button theme={theme} variant="outline" label="에이전트 정리 중단" onPress={() => controller.current?.abort()}>중단</Button> :
              <Button theme={theme} onPress={() => setPlan(null)}>{result ? '닫기' : '취소'}</Button>}
            {result ? <Button theme={theme} variant="outline" disabled={unavailable || disabled} onPress={() => review()}>대상 다시 확인</Button> :
              <Button theme={theme} variant="outline" label="오래된 에이전트 보관 확인" danger={plan.agents.length > 0}
                disabled={busy || unavailable || disabled || !(plan.agents.length || withRename)} onPress={() => { void confirm(); }}>
                {busy ? '정리 중 ' + outcomes.length + '/' + plan.agents.length
                  : plan.agents.length ? plan.agents.length + '개 보관' + (withRename ? ' · 이름 정리' : '') : '이름 정리'}
              </Button>}
          </View>
        </View></ControlLayout>
      </Modal.Content>
    </Modal> : null}
  </View>;
}
