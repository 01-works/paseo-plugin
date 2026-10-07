import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { copyText, FlatList, Icon, Modal, TextInput, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentTime, browserTime, workspaceAgents } from '../shared/browser';
import type { AgentDirectory } from './directory';
import type { BrowserViewState } from './view-state';
import type { Agent } from '../shared/types';
import { Button, ControlLayout, IconButton, RowButton, Status } from './controls';
import { spacing } from './spacing';
export function AgentBrowser(props: PluginHostProps & {
  directory: AgentDirectory; store: BrowserViewState; workspaceId: string; agentId: string;
  onNavigate?: (id: string) => void;
}) {
  const { theme, layout, directory, store, workspaceId, agentId, onNavigate } = props;
  const c = theme.colors, toast = useToast();
  const snapshot = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [closeTarget, setCloseTarget] = useState<Agent | null>(null);
  const [closingId, setClosingId] = useState< string | null>(null);
  const [closeError, setCloseError] = useState< string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const closeBusy = useRef(false), mounted = useRef(true);
  const all = useMemo(() => workspaceAgents(snapshot.agents, workspaceId, state.browserSort),
    [snapshot.agents, workspaceId, state.browserSort]);
  const rows = useMemo(() => {
    const term = state.browserQuery.trim().toLocaleLowerCase();
    return term ? all.filter(agent => agent.title.toLocaleLowerCase().includes(term) || agent.id.toLocaleLowerCase().includes(term)) : all;
  }, [all, state.browserQuery]);
  useEffect(() => directory.watch(), [directory]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const copyId = async (id: string) => {
    try { await copyText(id); toast.show('에이전트 ID 복사됨', { durationMs: 1800 }); }
    catch { toast.error('ID를 복사하지 못했습니다'); }
  };
  const navigate = (id: string) => {
    if (!directory.getSnapshot().agents.some(agent => agent.id === id && agent.workspaceId === workspaceId && !agent.archived)) {
      toast.error('이 에이전트는 현재 워크스페이스에 없습니다'); return;
    }
    try { onNavigate?.(id); }
    catch { toast.error('대화를 열지 못했습니다. 다시 눌러 주세요'); }
  };
  const requestClose = (agent: Agent) => {
    if (closeBusy.current) return;
    setCloseError(null); setCloseTarget(agent);
  };
  const confirmClose = async () => {
    if (!closeTarget || closeBusy.current) return;
    closeBusy.current = true; setClosingId(closeTarget.id); setCloseError(null);
    try {
      await directory.archive(closeTarget.id, workspaceId);
      if (mounted.current) { setCloseTarget(null); toast.show('대화를 보관함으로 이동했습니다', { durationMs: 1800 }); }
    } catch (error) {
      if (mounted.current) setCloseError(error instanceof Error && error.name === 'AgentActionError'
        ? error.message : '대화를 닫지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요');
    } finally {
      closeBusy.current = false;
      if (mounted.current) setClosingId(null);
    }
  };
  return <View style={{ flex: layout.compact ? 1 : undefined, minHeight: 0, gap: spacing.inset }}>
    <View style={{ gap: spacing.gap }}>
      <View style={{ minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.gap, paddingHorizontal: spacing.inset,
        borderWidth: 1, borderColor: searchFocused ? c.accent : c.border, borderRadius: spacing.gap }}>
        <Icon name="Search" size={16} color={c.foregroundMuted} />
        <TextInput accessibilityLabel="워크스페이스 에이전트 검색" placeholder="이름 또는 ID 검색" value={state.browserQuery}
          onChangeText={browserQuery => store.set({ browserQuery })} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
          onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)}
          onSubmitEditing={() => { if (rows.length === 1) navigate(rows[0].id); }}
          placeholderTextColor={c.foregroundMuted} selectionColor={c.accent}
          style={{ flex: 1, minWidth: 0, minHeight: layout.compact ? 44 : 40, padding: 0, color: c.foreground,
            outlineWidth: layout.platform === 'web' && searchFocused ? 0 : undefined }} />
        {state.browserQuery ? <IconButton theme={theme} name="X" label="검색 지우기" onPress={() => store.set({ browserQuery: '' })} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap, paddingHorizontal: spacing.inset }}>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: c.foregroundMuted }}>{snapshot.loaded ?
          (state.browserQuery.trim() ? rows.length + ' / ' : '') + all.length + '개' + (snapshot.partial ? ' · 일부' : '') : snapshot.error ? '목록 확인 불가' : '불러오는 중'}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.small }}>
          <Button theme={theme} label="최근 활동순" active={state.browserSort === 'updated'} onPress={() => store.set({ browserSort: 'updated' })}>활동순</Button>
          <Button theme={theme} label="최신 생성순" active={state.browserSort === 'created'} onPress={() => store.set({ browserSort: 'created' })}>생성순</Button>
        </View>
      </View>
    </View>
    {snapshot.stale || snapshot.error || snapshot.partial || snapshot.loading && snapshot.loaded ?
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap, paddingHorizontal: spacing.inset,
        paddingVertical: spacing.small, backgroundColor: c.surface1, borderRadius: spacing.gap }}>
        <Text style={{ flex: 1, color: c.foregroundMuted }}>
          {snapshot.error ?? (snapshot.stale ? '연결 끊김 · 마지막 목록' : snapshot.loading ? '목록 불러오는 중' : '일부만 표시')}
        </Text>
        {snapshot.error || snapshot.partial ? <Button theme={theme} disabled={snapshot.loading} onPress={() => { void directory.retry(); }}>다시 읽기</Button> : null}
      </View> : null}
    {!onNavigate ? <Text style={{ color: c.foregroundMuted, paddingHorizontal: spacing.inset }}>이 화면에서는 대화 이동을 지원하지 않습니다.</Text> : null}
    <FlatList data={rows} keyExtractor={agent => agent.key} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentOffset={{ x: 0, y: store.browserScroll.modal }}
      onScroll={event => { store.browserScroll.modal = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={64}
      style={{ flex: layout.compact ? 1 : undefined, minHeight: 0,
        height: !layout.compact ? Math.min(400, Math.max(160, all.length * 80)) : undefined,
        borderTopWidth: 1, borderColor: c.border }}
      contentContainerStyle={{ flexGrow: rows.length ? undefined : 1 }}
      extraData={{ agentId, stale: snapshot.stale, sort: state.browserSort, onNavigate, closingId }}
      getItemLayout={(_, index) => ({ length: 80, offset: 80 * index, index })}
      ListEmptyComponent={<View style={{ flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: spacing.inset }}>
        <Text style={{ color: c.foregroundMuted }}>{!snapshot.loaded ? snapshot.error ? '목록을 읽지 못했습니다' : '목록 불러오는 중' :
          state.browserQuery.trim() ? '검색 결과가 없습니다' : '이 워크스페이스에 에이전트가 없습니다'}</Text>
      </View>}
      renderItem={({ item }) => <View style={{ height: 80, flexDirection: 'row', alignItems: 'center', gap: spacing.gap,
        paddingHorizontal: spacing.small, paddingVertical: spacing.small,
        borderBottomWidth: 1, borderColor: c.border, backgroundColor: item.id === agentId ? c.surface1 : c.surface0 }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, backgroundColor: item.id === agentId ? c.accent : 'transparent' }} />
        <RowButton theme={theme} label={item.title + (item.id === agentId ? ' · 현재 대화' : '')}
          hint="대화를 엽니다. 길게 누르면 에이전트 ID를 복사합니다" disabled={!onNavigate}
          onPress={() => navigate(item.id)} onLongPress={() => { void copyId(item.id); }}>
          <Text numberOfLines={2} style={{ color: c.foreground, fontWeight: item.id === agentId ? '600' : '400' }}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.gap }}>
            <Status state={item.state} theme={theme} stale={snapshot.stale} />
            {item.id === agentId ? <Text style={{ color: c.accent }}>현재</Text> : null}
            <Text numberOfLines={1} accessibilityLabel={browserTime(agentTime(item, state.browserSort))}
              style={{ flex: 1, minWidth: 0, textAlign: 'right', color: c.foregroundMuted }}>{browserTime(agentTime(item, state.browserSort), layout.compact)}</Text>
          </View>
        </RowButton>
        <View style={{ flexDirection: 'row', gap: spacing.small }}>
          <IconButton theme={theme} name="Copy" label={item.id + ' ID 복사'} onPress={() => { void copyId(item.id); }} />
          <IconButton theme={theme} name={closingId === item.id ? 'LoaderCircle' : 'X'} label={item.title + ' 대화 닫기'}
            danger hint="확인 후 대화를 보관함으로 이동합니다" disabled={snapshot.stale || closingId !== null} onPress={() => requestClose(item)} />
        </View>
      </View>}
    />
    {closeTarget ? <Modal title="대화 닫기" open onOpenChange={open => { if (!open && !closeBusy.current) setCloseTarget(null); }}>
      <Modal.Content contentContainerStyle={{ padding: spacing.section }}>
        <ControlLayout compact={layout.compact}><View style={{ gap: spacing.inset }}>
        <Text numberOfLines={2} style={{ color: c.foreground, fontWeight: '600' }}>{closeTarget.title}</Text>
        <Text style={{ color: c.foregroundMuted }}>보관함으로 이동합니다. 실행 중인 작업과 연결된 하위 에이전트도 함께 닫힐 수 있습니다.</Text>
        {closeError ? <Text accessibilityRole="alert" style={{ color: c.statusDanger }}>{closeError}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.gap }}>
          <Button theme={theme} disabled={closingId !== null} onPress={() => setCloseTarget(null)}>취소</Button>
          <Button theme={theme} label="선택한 대화 닫기 확인" danger disabled={closingId !== null} onPress={() => { void confirmClose(); }}>
            {closingId !== null ? '닫는 중…' : '닫기'}
          </Button>
        </View>
        </View></ControlLayout>
      </Modal.Content>
    </Modal> : null}
  </View>;
}
