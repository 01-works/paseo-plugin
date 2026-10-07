import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type FlatList as NativeFlatList } from 'react-native';
import { FlatList } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { descendantCounts, visibleRows, type TreeRow } from '../shared/forest';
import type { AgentKey, Forest } from '../shared/types';
import { Status } from './controls';
import type { GraphViewState, ViewState } from './view-state';
export function Tree({ forest, state, store, origin, theme, stale, onCopyId }: {
  forest: Forest; state: ViewState; store: GraphViewState; origin: AgentKey; theme: PluginTheme; stale: boolean; onCopyId: (id: string) => void;
}) {
  const c = theme.colors;
  const rows = useMemo(() => visibleRows(forest, state.collapsed).rows, [forest.signature, state.collapsed]);
  const counts = useMemo(() => descendantCounts(forest), [forest.signature]);
  const list = useRef<NativeFlatList<TreeRow>>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // FlatList는 첫 layout 전 visibleLength가 0이다. 그때 viewPosition을 적용하면 맨 위가 잘린다.
    if (!state.focus || !height) return;
    const index = rows.findIndex(row => row.key === (state.selected ?? origin));
    if (index >= 0) list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.3 });
  }, [state.focus, height]);
  return <FlatList ref={list} data={rows} keyExtractor={row => row.key}
    onLayout={event => setHeight(event.nativeEvent.layout.height)}
    extraData={{ forest, selected: state.selected, stale }} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={5}
    getItemLayout={(_, index) => ({ length: 80, offset: 8 + 80 * index, index })}
    contentContainerStyle={{ padding: 8 }}
    renderItem={({ item }) => {
      const node = forest.nodes.get(item.key)!;
      const collapsed = state.collapsed.has(item.key);
      return <View style={{ height: 80, marginLeft: Math.min(item.depth, 6) * 14, flexDirection: 'row', alignItems: 'center',
        borderBottomWidth: 1, borderColor: c.border, backgroundColor: state.selected === item.key ? c.surface1 : c.surface0 }}>
        <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: item.key === origin ? c.accent : 'transparent' }} />
        {node.children.length ? <Pressable accessibilityRole="button" accessibilityLabel={(collapsed ? '펼치기 ' : '접기 ') + (node.agent?.title ?? '부모')}
          onPress={() => store.toggle(item.key)} style={{ width: 44, alignSelf: 'stretch', minHeight: 52, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: c.foregroundMuted }}>{collapsed ? '›' : '⌄'}</Text>
        </Pressable> : <View style={{ width: 14 }} />}
        <Pressable accessibilityRole="button" accessibilityState={{ selected: state.selected === item.key }}
          accessibilityLabel={(node.agent?.title ?? '부모 정보 없음') + (item.key === origin ? ' · 현재 대화' : '')}
          accessibilityHint={node.agent ? '길게 누르면 에이전트 ID 복사' : undefined}
          onPress={() => store.set({ selected: item.key, message: null })}
          onLongPress={node.agent ? () => onCopyId(node.agent!.id) : undefined}
          style={{ flex: 1, minWidth: 0, minHeight: 60, justifyContent: 'center', paddingVertical: 8, paddingRight: 12, gap: 6 }}>
          <Text numberOfLines={2} style={{ color: node.context ? c.foregroundMuted : c.foreground,
            fontWeight: state.selected === item.key ? '600' : '400' }}>{node.agent?.title ?? '부모 정보 없음'}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {node.agent ? <Status state={node.agent.state} theme={theme} stale={stale} /> : null}
            {collapsed ? <Text style={{ color: c.foregroundMuted }}>· 하위 {counts.get(item.key) ?? 0}</Text> : null}
          </View>
        </Pressable>
      </View>;
    }}
  />;
}
