import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { ScrollView } from '@getpaseo/plugin/client/react-native';
import type { PluginHostProps } from '@getpaseo/plugin/client';
type PluginTheme = PluginHostProps['theme'];
import { descendantCounts } from '../shared/forest';
import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from '../shared/layout';
import type { AgentKey, Forest } from '../shared/types';
import { stateColor, Status } from './controls';
import type { GraphViewState, ViewState } from './view-state';
import { nearestNode } from '../shared/camera';
import { useGraphCamera } from './use-graph-camera';
export function Graph({ forest, geometry, state, store, origin, theme, stale, surface, viewport, onCopyId, controls }: {
  forest: Forest; geometry: GraphLayout; state: ViewState; store: GraphViewState; origin: AgentKey;
  theme: PluginTheme; stale: boolean; surface: 'modal' | 'panel'; viewport: { width: number; height: number }; onCopyId: (id: string) => void; controls?: (zoom: number) => ReactNode;
}) {
  const c = theme.colors;
  const view = useGraphCamera(geometry, state, store, origin, viewport, surface);
  const { camera, metrics, native } = view, zoom = camera.zoom, offset = camera;
  const { width, height, insetX, insetY } = metrics;
  const [hovered, setHovered] = useState<AgentKey | null>(null);
  const counts = useMemo(() => descendantCounts(forest), [forest.signature]);
  const visible = (x: number, y: number, w: number, h: number) =>
    x * zoom + insetX + w * zoom >= offset.x - 120 && x * zoom + insetX <= offset.x + viewport.width + 120 &&
    y * zoom + insetY + h * zoom >= offset.y - 120 && y * zoom + insetY <= offset.y + viewport.height + 120;
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
  const labelY = labelPosition ? (labelPosition.y + NODE_HEIGHT / 2) * zoom + insetY - offset.y : -1;
  const labelWidth = Math.min(280, Math.max(80, viewport.width - 16));
  const layer = <View style={{ position: 'absolute', left: insetX - (native ? offset.x : 0), top: insetY - (native ? offset.y : 0),
    width: geometry.width, height: geometry.height, transformOrigin: 'top left', transform: [{ scale: zoom }] }}>
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
            const target = (event?: GestureResponderEvent) => native && overview && event?.nativeEvent ?
              nearestNode(geometry, camera, viewport, view.point(event)) : position.key;
            const select = (event?: GestureResponderEvent) => {
              const key = target(event);
              if (view.canPress() && key) store.set({ selected: key, message: null });
            };
            const copy = node.agent ? (event?: GestureResponderEvent) => {
              const agent = forest.nodes.get(target(event) ?? '')?.agent;
              if (view.canPress() && agent) onCopyId(agent.id);
            } : undefined;
            if (overview) {
              const hit = (native ? 44 : 18) / zoom, dot = Math.max(4, Math.min(8, 90 * zoom)) / zoom;
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
                onPress={() => { if (view.canPress()) store.toggle(position.key); }}
                style={{ width: 44 / zoom, minHeight: 44 / zoom, alignItems: 'center', justifyContent: 'center' }}>
                <Text selectable={false} style={{ color: c.foregroundMuted }}>{collapsed ? '+' + (counts.get(position.key) ?? 0) : '−'}</Text>
              </Pressable> : null}
            </View>;
          })}
  </View>;
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View {...view.panHandlers} ref={view.viewportRef} collapsable={false} onLayout={view.measure}
      accessibilityLabel="에이전트 그래프 이동 영역" accessibilityHint="드래그로 이동하고 두 손가락으로 확대하거나 축소합니다"
      style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {native ? layer : <ScrollView ref={view.horizontal} horizontal scrollEventThrottle={32} showsHorizontalScrollIndicator
        onScroll={event => view.onScroll('x', event.nativeEvent.contentOffset.x)}
        style={{ flex: 1 }} contentContainerStyle={{ minWidth: width, height: viewport.height }}>
        <ScrollView ref={view.vertical} nestedScrollEnabled scrollEventThrottle={32} showsVerticalScrollIndicator
          style={{ width, height: viewport.height, flexShrink: 0, flexGrow: 0 }}
          onScroll={event => view.onScroll('y', event.nativeEvent.contentOffset.y)}>
          <View style={{ width, height }}>{layer}</View>
        </ScrollView>
      </ScrollView>}
    </View>
    {!controls && overview && labelNode && labelX >= 0 && labelX <= viewport.width && labelY >= 0 && labelY <= viewport.height ?
      <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(8, Math.min(labelX - labelWidth / 2, viewport.width - labelWidth - 8)),
        top: Math.max(8, Math.min(labelY + 16, viewport.height - 70)), width: labelWidth,
        padding: 8, borderRadius: 8, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1, gap: 4 }}>
        <Text selectable={false} numberOfLines={2} style={{ color: c.foreground }}>{labelNode.agent?.title ?? '부모 정보 없음'}</Text>
        {labelNode.agent ? <Status state={labelNode.agent.state} theme={theme} stale={stale} /> : null}
      </View> : null}
    {controls?.(zoom)}
  </View>;
}
