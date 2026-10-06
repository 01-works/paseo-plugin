import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type ScrollView as NativeScrollView } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { descendantCounts } from '../shared/forest';
import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from '../shared/layout';
import type { AgentKey, Forest } from '../shared/types';
import { Status } from './controls';
import type { GraphViewState, ViewState } from './view-state';
export function Graph({ forest, geometry, state, store, origin, theme, stale, surface, viewport, onCopyId }: {
  forest: Forest; geometry: GraphLayout; state: ViewState; store: GraphViewState; origin: AgentKey;
  theme: PluginTheme; stale: boolean; surface: 'modal' | 'panel'; viewport: { width: number; height: number }; onCopyId: (id: string) => void;
}) {
  const c = theme.colors, zoom = state.zoom;
  const horizontal = useRef<NativeScrollView>(null), vertical = useRef<NativeScrollView>(null);
  const [offset, setOffset] = useState(() => ({ ...store.scroll[surface] }));
  const prior = useRef<{ geometry: GraphLayout; zoom: number; focus: number } | null>(null);
  const counts = useMemo(() => descendantCounts(forest), [forest.signature]);
  const width = Math.max(viewport.width, geometry.width * zoom), height = Math.max(viewport.height, geometry.height * zoom);
  useLayoutEffect(() => {
    const previous = prior.current;
    let x = store.scroll[surface].x, y = store.scroll[surface].y;
    const anchor = state.selected ?? origin;
    const old = previous?.geometry.positions.get(anchor), next = geometry.positions.get(anchor);
    if (next && (!previous && !store.scrollInitialized[surface] || previous && state.focus !== previous.focus)) {
      x = (next.x + NODE_WIDTH / 2) * zoom - viewport.width / 2;
      y = next.y * zoom - 24;
    } else if (previous && old && next) {
      x += next.x * zoom - old.x * previous.zoom; y += next.y * zoom - old.y * previous.zoom;
    }
    x = Math.max(0, Math.min(x, width - viewport.width));
    y = Math.max(0, Math.min(y, height - viewport.height));
    horizontal.current?.scrollTo({ x, animated: false }); vertical.current?.scrollTo({ y, animated: false });
    store.scroll[surface] = { x, y }; store.scrollInitialized[surface] = true;
    setOffset({ x, y }); prior.current = { geometry, zoom, focus: state.focus };
  }, [geometry, zoom, state.focus, viewport.width, viewport.height, surface]);
  const visible = (x: number, y: number, w: number, h: number) =>
    x * zoom + w * zoom >= offset.x - 120 && x * zoom <= offset.x + viewport.width + 120 &&
    y * zoom + h * zoom >= offset.y - 120 && y * zoom <= offset.y + viewport.height + 120;
  return <ScrollView ref={horizontal} horizontal scrollEventThrottle={32}
    onScroll={event => { const x = event.nativeEvent.contentOffset.x; store.scroll[surface].x = x; setOffset(old => ({ ...old, x })); }}
    style={{ flex: 1 }} contentContainerStyle={{ height: viewport.height }}>
    <ScrollView ref={vertical} nestedScrollEnabled scrollEventThrottle={32} style={{ width, height: viewport.height }}
      onScroll={event => { const y = event.nativeEvent.contentOffset.y; store.scroll[surface].y = y; setOffset(old => ({ ...old, y })); }}>
      <View style={{ width, height }}>
        <View style={{ position: 'absolute', left: 0, top: 0, width: geometry.width, height: geometry.height,
          transformOrigin: 'top left', transform: [{ scale: zoom }] }}>
          {geometry.edges.filter(edge => visible(edge.x, edge.y, edge.width, edge.height)).map((edge, index) =>
            <View key={index} pointerEvents="none" style={{ position: 'absolute', left: edge.x, top: edge.y,
              width: Math.max(2, edge.width), height: Math.max(2, edge.height), backgroundColor: c.foregroundMuted, opacity: 0.45 }} />)}
          {[...geometry.positions.values()].filter(position => visible(position.x, position.y, NODE_WIDTH, NODE_HEIGHT)).slice(0, 200).map(position => {
            const node = forest.nodes.get(position.key)!;
            const collapsed = state.collapsed.has(position.key);
            return <View key={position.key} style={{ position: 'absolute', left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT,
              borderRadius: 10, borderWidth: position.key === origin ? 2 : 1, borderColor: position.key === origin ? c.accent : c.border,
              backgroundColor: state.selected === position.key ? c.surface2 : c.surface1, flexDirection: 'row', alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected: state.selected === position.key }}
                accessibilityLabel={(node.agent?.title ?? '부모 정보 없음') + (position.key === origin ? ' · 현재 대화' : '')}
                accessibilityHint={node.agent ? '길게 누르면 에이전트 ID 복사' : undefined}
                onPress={() => store.set({ selected: position.key, message: null })}
                onLongPress={node.agent ? () => onCopyId(node.agent!.id) : undefined}
                style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', padding: 10, gap: 6 }}>
                <Text numberOfLines={2} style={{ color: node.context ? c.foregroundMuted : c.foreground }}>{node.agent?.title ?? '부모 정보 없음'}</Text>
                {node.agent ? <Status state={node.agent.state} theme={theme} stale={stale} /> : null}
              </Pressable>
              {node.children.length ? <Pressable accessibilityRole="button"
                accessibilityLabel={(collapsed ? '펼치기 ' : '접기 ') + (node.agent?.title ?? '부모')}
                onPress={() => store.toggle(position.key)} style={{ width: 44 / zoom, minHeight: 44 / zoom, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c.foregroundMuted }}>{collapsed ? '+' + (counts.get(position.key) ?? 0) : '−'}</Text>
              </Pressable> : null}
            </View>;
          })}
        </View>
      </View>
    </ScrollView>
  </ScrollView>;
}
