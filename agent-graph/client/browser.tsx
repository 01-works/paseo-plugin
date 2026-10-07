import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { copyText, FlatList, Icon, TextInput, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentTime, browserTime, workspaceAgents } from '../shared/browser';
import type { AgentDirectory } from './directory';
import type { GraphViewState } from './view-state';
import { Button, IconButton, Status, Tab } from './controls';
export function AgentBrowser(props: PluginHostProps & {
  directory: AgentDirectory; store: GraphViewState; workspaceId: string; agentId: string;
  surface: 'modal' | 'panel'; onNavigate?: (id: string) => void;
}) {
  const { theme, layout, directory, store, workspaceId, agentId, surface, onNavigate } = props;
  const c = theme.colors, toast = useToast();
  const snapshot = useSyncExternalStore(directory.subscribe, directory.getSnapshot);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const all = useMemo(() => workspaceAgents(snapshot.agents, workspaceId, state.browserSort),
    [snapshot.agents, workspaceId, state.browserSort]);
  const rows = useMemo(() => {
    const term = state.browserQuery.trim().toLocaleLowerCase();
    return term ? all.filter(agent => agent.title.toLocaleLowerCase().includes(term) || agent.id.toLocaleLowerCase().includes(term)) : all;
  }, [all, state.browserQuery]);
  useEffect(() => directory.watch(), [directory]);
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
  return <View style={{ flex: surface === 'panel' || layout.compact ? 1 : undefined, minHeight: 0, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12,
      borderWidth: 1, borderColor: c.border, borderRadius: 8, backgroundColor: c.surface1 }}>
      <Icon name="Search" size={16} color={c.foregroundMuted} />
      <TextInput accessibilityLabel="워크스페이스 에이전트 검색" placeholder="이름 또는 ID 검색" value={state.browserQuery}
        onChangeText={browserQuery => store.set({ browserQuery })} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        onSubmitEditing={() => { if (rows.length === 1) navigate(rows[0].id); }}
        placeholderTextColor={c.foregroundMuted} selectionColor={c.accent}
        style={{ flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 8, paddingRight: 12, color: c.foreground }} />
      {state.browserQuery ? <IconButton theme={theme} name="X" label="검색 지우기" onPress={() => store.set({ browserQuery: '' })} /> : null}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: c.foregroundMuted }}>{snapshot.loaded ?
        (state.browserQuery.trim() ? rows.length + ' / ' : '워크스페이스 · ') + all.length + '개' + (snapshot.partial ? ' · 일부' : '') : snapshot.error ? '목록 확인 불가' : '불러오는 중'}</Text>
      <Tab theme={theme} label="최근 활동순" active={state.browserSort === 'updated'} onPress={() => store.set({ browserSort: 'updated' })}>활동순</Tab>
      <Tab theme={theme} label="최신 생성순" active={state.browserSort === 'created'} onPress={() => store.set({ browserSort: 'created' })}>생성순</Tab>
    </View>
    {snapshot.stale || snapshot.error || snapshot.partial || snapshot.loading && snapshot.loaded ?
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8, backgroundColor: c.surface1, borderRadius: 8 }}>
        <Text style={{ flex: 1, color: c.foregroundMuted }}>
          {snapshot.error ?? (snapshot.stale ? '연결 끊김 · 마지막 목록' : snapshot.loading ? '목록 불러오는 중' : '일부만 표시')}
        </Text>
        {snapshot.error || snapshot.partial ? <Button theme={theme} disabled={snapshot.loading} onPress={() => { void directory.retry(); }}>다시 읽기</Button> : null}
      </View> : null}
    {!onNavigate ? <Text style={{ color: c.foregroundMuted }}>이 화면에서는 대화 이동을 지원하지 않습니다.</Text> : null}
    <FlatList data={rows} keyExtractor={agent => agent.key} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentOffset={{ x: 0, y: store.browserScroll[surface] }}
      onScroll={event => { store.browserScroll[surface] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={64}
      style={{ flex: surface === 'panel' || layout.compact ? 1 : undefined, minHeight: 0,
        height: surface === 'modal' && !layout.compact ? Math.min(400, Math.max(160, all.length * 80)) : undefined }}
      contentContainerStyle={{ flexGrow: rows.length ? undefined : 1 }}
      extraData={{ agentId, stale: snapshot.stale, sort: state.browserSort, onNavigate }}
      getItemLayout={(_, index) => ({ length: 80, offset: 80 * index, index })}
      ListEmptyComponent={<View style={{ flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <Text style={{ color: c.foregroundMuted }}>{!snapshot.loaded ? snapshot.error ? '목록을 읽지 못했습니다' : '목록 불러오는 중' :
          state.browserQuery.trim() ? '검색 결과가 없습니다' : '이 워크스페이스에 에이전트가 없습니다'}</Text>
      </View>}
      renderItem={({ item }) => <View style={{ height: 80, flexDirection: 'row', alignItems: 'center',
        borderBottomWidth: 1, borderColor: c.border, backgroundColor: item.id === agentId ? c.surface1 : c.surface0 }}>
        <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: item.id === agentId ? c.accent : 'transparent' }} />
        <Pressable accessibilityRole="button" accessibilityLabel={item.title + (item.id === agentId ? ' · 현재 대화' : '')}
          accessibilityHint="대화를 엽니다. 길게 누르면 에이전트 ID를 복사합니다" disabled={!onNavigate}
          onPress={() => navigate(item.id)} onLongPress={() => { void copyId(item.id); }}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', gap: 6,
            paddingHorizontal: 10, paddingVertical: 8, backgroundColor: pressed ? c.surface2 : 'transparent' })}>
          <Text numberOfLines={2} style={{ color: c.foreground, fontWeight: item.id === agentId ? '600' : '400' }}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Status state={item.state} theme={theme} stale={snapshot.stale} />
            {item.id === agentId ? <Text style={{ color: c.accent }}>현재</Text> : null}
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, textAlign: 'right', color: c.foregroundMuted }}>{browserTime(agentTime(item, state.browserSort))}</Text>
          </View>
        </Pressable>
        <IconButton theme={theme} name="Copy" label={item.id + ' ID 복사'} onPress={() => { void copyId(item.id); }} />
      </View>}
    />
  </View>;
}
