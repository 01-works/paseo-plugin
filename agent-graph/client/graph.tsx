import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Text, View, type ScrollView as NativeScrollView } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { descendantCounts } from '../shared/forest';
import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from '../shared/layout';
import type { AgentKey, Forest } from '../shared/types';
import { stateColor, Status } from './controls';
import type { GraphViewState, ViewState } from './view-state';
export function Graph({ forest, geometry, state, store, origin, theme, stale, surface, viewport, onCopyId }: {
  forest: Forest; geometry: GraphLayout; state: ViewState; store: GraphViewState; origin: AgentKey;
  theme: PluginTheme; stale: boolean; surface: 'modal' | 'panel'; viewport: { width: number; height: number }; onCopyId: (id: string) => void;
}) {
  const c = theme.colors, zoom = state.zoom;
  const horizontal = useRef<NativeScrollView>(null), vertical = useRef<NativeScrollView>(null);
  const [offset, setOffset] = useState(() => ({ ...store.scroll[surface] }));
  const [hovered, setHovered] = useState<AgentKey | null>(null);
  const prior = useRef<{ geometry: GraphLayout; zoom: number; focus: number; insetX: number } | null>(null);
  const counts = useMemo(() => descendantCounts(forest), [forest.signature]);
  const width = Math.max(viewport.width, geometry.width * zoom), height = Math.max(viewport.height, geometry.height * zoom);
  const insetX = Math.max(0, (viewport.width - geometry.width * zoom) / 2);
  const bounds = useRef({ width, height, viewport }); bounds.current = { width, height, viewport };
  const dragStart = useRef({ x: 0, y: 0 });
  const suppressPressUntil = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    // 노드 Pressable은 먼저 responder가 된다. 빈 공간은 즉시 잡아 마우스 이동을 받는다.
    onStartShouldSetPanResponder: () => Platform.OS === 'web',
    onMoveShouldSetPanResponderCapture: (_, gesture) => Platform.OS === 'web' && Math.hypot(gesture.dx, gesture.dy) > 5,
    onPanResponderGrant: event => { event.preventDefault(); dragStart.current = { ...store.scroll[surface] }; suppressPressUntil.current = Date.now() + 400; },
    onPanResponderMove: (event, gesture) => {
      event.preventDefault();
      const b = bounds.current;
      const x = Math.max(0, Math.min(dragStart.current.x - gesture.dx, b.width - b.viewport.width));
      const y = Math.max(0, Math.min(dragStart.current.y - gesture.dy, b.height - b.viewport.height));
      horizontal.current?.scrollTo({ x, animated: false }); vertical.current?.scrollTo({ y, animated: false });
      store.scroll[surface] = { x, y }; setOffset({ x, y }); suppressPressUntil.current = Date.now() + 400;
    },
    onPanResponderRelease: () => { suppressPressUntil.current = Date.now() + 200; },
    onPanResponderTerminationRequest: () => false,
  }), [store, surface]);
  useLayoutEffect(() => {
    const previous = prior.current;
    let x = store.scroll[surface].x, y = store.scroll[surface].y;
    const anchor = state.selected ?? origin;
    const old = previous?.geometry.positions.get(anchor), next = geometry.positions.get(anchor);
    if (next && (!previous && !store.scrollInitialized[surface] || previous && state.focus !== previous.focus)) {
      x = (next.x + NODE_WIDTH / 2) * zoom + insetX - viewport.width / 2;
      y = geometry.direction !== 'down' ? (next.y + NODE_HEIGHT / 2) * zoom - viewport.height / 2 : next.y * zoom - 24;
    } else if (previous && old && next) {
      x += next.x * zoom + insetX - old.x * previous.zoom - previous.insetX; y += next.y * zoom - old.y * previous.zoom;
    }
    x = Math.max(0, Math.min(x, width - viewport.width));
    y = Math.max(0, Math.min(y, height - viewport.height));
    horizontal.current?.scrollTo({ x, animated: false }); vertical.current?.scrollTo({ y, animated: false });
    store.scroll[surface] = { x, y }; store.scrollInitialized[surface] = true;
    setOffset({ x, y }); prior.current = { geometry, zoom, focus: state.focus, insetX };
  }, [geometry, zoom, state.focus, viewport.width, viewport.height, surface]);
  const visible = (x: number, y: number, w: number, h: number) =>
    x * zoom + insetX + w * zoom >= offset.x - 120 && x * zoom + insetX <= offset.x + viewport.width + 120 &&
    y * zoom + h * zoom >= offset.y - 120 && y * zoom <= offset.y + viewport.height + 120;
  const positions = [...geometry.positions.values()].filter(position => visible(position.x, position.y, NODE_WIDTH, NODE_HEIGHT));
  const overview = zoom < 0.6 || positions.length > 200;
  const path = useMemo(() => {
    const keys = new Set<AgentKey>();
    let key = state.selected;
    while (key && !keys.has(key)) { keys.add(key); key = forest.nodes.get(key)?.parent ?? null; }
    return keys;
  }, [forest.signature, state.selected]);
  const labelKey = hovered ?? state.selected, labelPosition = geometry.positions.get(labelKey ?? '');
  const labelNode = forest.nodes.get(labelKey ?? '');
  const labelX = labelPosition ? (labelPosition.x + NODE_WIDTH / 2) * zoom + insetX - offset.x : -1;
  const labelY = labelPosition ? (labelPosition.y + NODE_HEIGHT / 2) * zoom - offset.y : -1;
  const labelWidth = Math.min(280, Math.max(80, viewport.width - 16));
  return <View {...pan.panHandlers} accessibilityLabel="에이전트 그래프 이동 영역" style={{ flex: 1, minHeight: 0 }}>
    <ScrollView ref={horizontal} horizontal scrollEventThrottle={32} showsHorizontalScrollIndicator
    onScroll={event => { const x = event.nativeEvent.contentOffset.x; store.scroll[surface].x = x; setOffset(old => ({ ...old, x })); }}
    style={{ flex: 1 }} contentContainerStyle={{ minWidth: width, height: viewport.height }}>
    <ScrollView ref={vertical} nestedScrollEnabled scrollEventThrottle={32} showsVerticalScrollIndicator
      style={{ width, height: viewport.height, flexShrink: 0, flexGrow: 0 }}
      onScroll={event => { const y = event.nativeEvent.contentOffset.y; store.scroll[surface].y = y; setOffset(old => ({ ...old, y })); }}>
      <View style={{ width, height }}>
        <View style={{ position: 'absolute', left: insetX, top: 0, width: geometry.width, height: geometry.height,
          transformOrigin: 'top left', transform: [{ scale: zoom }] }}>
          {geometry.links?.filter(link => visible(Math.min(link.x1, link.x2), Math.min(link.y1, link.y2),
            Math.abs(link.x2 - link.x1), Math.abs(link.y2 - link.y1))).map(link => {
            const length = Math.hypot(link.x2 - link.x1, link.y2 - link.y1), active = path.has(link.target);
            const thickness = (active ? 2 : 1) / zoom;
            return <View key={link.target} pointerEvents="none" style={{ position: 'absolute',
              left: (link.x1 + link.x2) / 2 - length / 2, top: (link.y1 + link.y2) / 2 - thickness / 2,
              width: length, height: thickness, backgroundColor: active ? c.accent : c.foregroundMuted,
              opacity: active ? 0.75 : 0.25, transform: [{ rotate: Math.atan2(link.y2 - link.y1, link.x2 - link.x1) + 'rad' }] }} />;
          })}
          {geometry.edges.filter(edge => visible(edge.x, edge.y, edge.width, edge.height)).map((edge, index) =>
            <View key={index} pointerEvents="none" style={{ position: 'absolute', left: edge.x, top: edge.y,
              width: Math.max(2, edge.width), height: Math.max(2, edge.height), backgroundColor: c.foregroundMuted, opacity: 0.45 }} />)}
          {positions.map(position => {
            const node = forest.nodes.get(position.key)!;
            const collapsed = state.collapsed.has(position.key);
            const selected = state.selected === position.key;
            const label = (node.agent?.title ?? '부모 정보 없음') + (position.key === origin ? ' · 현재 대화' : '');
            const select = () => { if (Date.now() >= suppressPressUntil.current) store.set({ selected: position.key, message: null }); };
            const copy = node.agent ? () => { if (Date.now() >= suppressPressUntil.current) onCopyId(node.agent!.id); } : undefined;
            if (overview) {
              const hit = 18 / zoom, dot = Math.max(4, Math.min(8, 90 * zoom)) / zoom;
              return <Pressable key={position.key} accessibilityRole="button" accessibilityState={{ selected }}
                accessibilityLabel={label} accessibilityHint={node.agent ? '선택하면 상세 표시, 길게 누르면 에이전트 ID 복사' : undefined}
                onPress={select} onLongPress={copy} onHoverIn={() => setHovered(position.key)} onHoverOut={() => setHovered(null)}
                onFocus={() => setHovered(position.key)} onBlur={() => setHovered(null)}
                style={{ position: 'absolute', left: position.x + NODE_WIDTH / 2 - hit / 2,
                  top: position.y + NODE_HEIGHT / 2 - hit / 2, width: hit, height: hit, alignItems: 'center', justifyContent: 'center' }}>
                <View pointerEvents="none" style={{ width: dot + (selected || position.key === origin ? 4 / zoom : 0),
                  height: dot + (selected || position.key === origin ? 4 / zoom : 0), borderRadius: hit / 2,
                  backgroundColor: node.agent ? stateColor(node.agent.state, theme, stale) : c.foregroundMuted,
                  borderWidth: selected || position.key === origin ? 2 / zoom : 0,
                  borderColor: selected || position.key === origin ? c.accent : c.border }} />
              </Pressable>;
            }
            return <View key={position.key} style={{ position: 'absolute', left: position.x, top: position.y, width: NODE_WIDTH, height: NODE_HEIGHT,
              borderRadius: 10, borderWidth: position.key === origin ? 2 : 1, borderColor: selected || position.key === origin ? c.accent : c.border,
              backgroundColor: selected ? c.surface2 : c.surface1, flexDirection: 'row', alignItems: 'center' }}>
              <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}
                accessibilityHint={node.agent ? '길게 누르면 에이전트 ID 복사' : undefined}
                onPress={select} onLongPress={copy}
                style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', justifyContent: 'center', padding: 10, gap: 6 }}>
                <Text selectable={false} numberOfLines={2} style={{ color: node.context ? c.foregroundMuted : c.foreground }}>{node.agent?.title ?? '부모 정보 없음'}</Text>
                {node.agent ? <Status state={node.agent.state} theme={theme} stale={stale} /> : null}
              </Pressable>
              {node.children.length ? <Pressable accessibilityRole="button"
                accessibilityLabel={(collapsed ? '펼치기 ' : '접기 ') + (node.agent?.title ?? '부모')}
                onPress={() => { if (Date.now() >= suppressPressUntil.current) store.toggle(position.key); }}
                style={{ width: 44 / zoom, minHeight: 44 / zoom, alignItems: 'center', justifyContent: 'center' }}>
                <Text selectable={false} style={{ color: c.foregroundMuted }}>{collapsed ? '+' + (counts.get(position.key) ?? 0) : '−'}</Text>
              </Pressable> : null}
            </View>;
          })}
        </View>
      </View>
    </ScrollView>
  </ScrollView>
    {overview && labelNode && labelX >= 0 && labelX <= viewport.width && labelY >= 0 && labelY <= viewport.height ?
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(8, Math.min(labelX - labelWidth / 2, viewport.width - labelWidth - 8)),
        top: Math.max(8, Math.min(labelY + 16, viewport.height - 70)), width: labelWidth,
        padding: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, gap: 4 }}>
        <Text selectable={false} numberOfLines={2} style={{ color: c.foreground }}>{labelNode.agent?.title ?? '부모 정보 없음'}</Text>
        {labelNode.agent ? <Status state={labelNode.agent.state} theme={theme} stale={stale} /> : null}
      </View> : null}
  </View>;
}
