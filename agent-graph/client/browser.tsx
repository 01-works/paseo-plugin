import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
import { copyText, FlatList, Icon, TextInput, useToast } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
import { agentTime, browserTime, workspaceAgents } from '../shared/browser';
import type { AgentDirectory } from './directory';
import type { GraphViewState } from './view-state';
import { Button, Status } from './controls';
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <TextInput accessibilityLabel="워크스페이스 에이전트 검색" placeholder="이름 또는 ID 검색" value={state.browserQuery}
        onChangeText={browserQuery => store.set({ browserQuery })} autoCorrect={false} autoCapitalize="none" returnKeyType="search"
        placeholderTextColor={c.foregroundMuted} selectionColor={c.accent}
        style={{ flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: c.border,
          borderRadius: 8, backgroundColor: c.surface1, color: c.foreground }} />
      {state.browserQuery ? <Button theme={theme} label="검색 지우기" onPress={() => store.set({ browserQuery: '' })}>×</Button> : null}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 }}>
      <Text style={{ flex: 1, color: c.foregroundMuted }}>현재 워크스페이스 · {snapshot.loaded ?
        (state.browserQuery.trim() ? rows.length + '/' : '') + all.length + '개' + (snapshot.partial ? ' · 일부' : '') : '불러오는 중'}</Text>
      <Button theme={theme} label={state.browserSort === 'updated' ? '최근 활동순 · 생성순으로 변경' : '생성순 · 최근 활동순으로 변경'}
        onPress={() => store.set({ browserSort: state.browserSort === 'updated' ? 'created' : 'updated' })}>
        {state.browserSort === 'updated' ? '최근 활동 ↓' : '생성순 ↓'}
      </Button>
      {snapshot.error || snapshot.partial ? <Button theme={theme} disabled={snapshot.loading} onPress={() => { void directory.retry(); }}>다시 읽기</Button> : null}
    </View>
    {snapshot.stale || snapshot.error || snapshot.loading && snapshot.loaded ? <Text style={{ color: c.foregroundMuted }}>
      {snapshot.error ?? (snapshot.stale ? '연결 끊김 · 마지막 목록' : '목록 불러오는 중')}
    </Text> : null}
    {!onNavigate ? <Text style={{ color: c.foregroundMuted }}>이 화면에서는 대화 이동을 지원하지 않습니다.</Text> : null}
    <FlatList data={rows} keyExtractor={agent => agent.key} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentOffset={{ x: 0, y: store.browserScroll[surface] }}
      onScroll={event => { store.browserScroll[surface] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={64}
      style={{ flex: surface === 'panel' || layout.compact ? 1 : undefined, minHeight: 0,
        height: surface === 'modal' && !layout.compact ? 360 : undefined, borderWidth: 1, borderColor: c.border, borderRadius: 10 }}
      contentContainerStyle={{ padding: 8, flexGrow: rows.length ? undefined : 1 }}
      getItemLayout={(_, index) => ({ length: 92, offset: 8 + 92 * index, index })}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      ListEmptyComponent={<View style={{ flex: 1, minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
        <Text style={{ color: c.foregroundMuted }}>{!snapshot.loaded ? snapshot.error ? '목록을 읽지 못했습니다' : '목록 불러오는 중' :
          state.browserQuery.trim() ? '검색 결과가 없습니다' : '이 워크스페이스에 에이전트가 없습니다'}</Text>
      </View>}
      renderItem={({ item }) => <View style={{ height: 88, flexDirection: 'row', alignItems: 'center',
        borderWidth: 1, borderColor: item.id === agentId ? c.accent : c.border, borderRadius: 8, backgroundColor: c.surface1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.title + (item.id === agentId ? ' · 현재 대화' : '')}
          accessibilityHint="대화를 엽니다. 길게 누르면 에이전트 ID를 복사합니다" disabled={!onNavigate}
          onPress={() => navigate(item.id)} onLongPress={() => { void copyId(item.id); }}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', gap: 6,
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: pressed ? c.surface2 : 'transparent' })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={2} style={{ flex: 1, minWidth: 0, color: c.foreground }}>{item.title}</Text>
            {onNavigate ? <Icon name="ChevronRight" size={14} color={c.foregroundMuted} /> : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 2 }}>
            <Status state={item.state} theme={theme} stale={snapshot.stale} />
            <Text style={{ color: item.id === agentId ? c.accent : c.foregroundMuted }}>{item.id === agentId ? '현재' : browserTime(agentTime(item, state.browserSort))}</Text>
          </View>
        </Pressable>
        <Button theme={theme} label={item.id + ' ID 복사'} onPress={() => { void copyId(item.id); }}>ID</Button>
      </View>}
    />
  </View>;
}
