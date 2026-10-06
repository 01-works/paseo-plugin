import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, type GestureResponderEvent, type ScrollView, type View } from 'react-native';
import { cameraMetrics, constrainCamera, panCamera, pinchCamera, type Camera, type Point, type Viewport } from '../shared/camera';
import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from '../shared/layout';
import type { AgentKey } from '../shared/types';
import type { GraphViewState, ViewState } from './view-state';
type Gesture = { camera: Camera; center: Point; distance: number; kind: 'pan' | 'pinch' };
type Prior = { geometry: GraphLayout; zoom: number; focus: number; insetX: number; insetY: number };
export function useGraphCamera(geometry: GraphLayout, state: ViewState, store: GraphViewState, origin: AgentKey, viewport: Viewport, surface: 'modal' | 'panel') {
  const native = Platform.OS !== 'web';
  const horizontal = useRef<ScrollView>(null), vertical = useRef<ScrollView>(null), viewportRef = useRef<View>(null);
  const [camera, setCamera] = useState<Camera>(() => ({ ...store.scroll[surface], zoom: state.zoom }));
  const current = useRef(camera), bounds = useRef({ geometry, viewport }); bounds.current = { geometry, viewport };
  const prior = useRef<Prior | null>(null), gesture = useRef<Gesture | null>(null);
  const lastTouch = useRef<Omit<Gesture, 'camera'> | null>(null);
  const screenOrigin = useRef({ x: 0, y: 0 }), suppressPressUntil = useRef(0);
  const timer = useRef<ReturnType< typeof setTimeout> | undefined>(undefined);
  const measure = () => viewportRef.current?.measureInWindow((x, y) => { screenOrigin.current = { x, y }; });
  const point = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX - screenOrigin.current.x, y: event.nativeEvent.pageY - screenOrigin.current.y });
  const apply = (next: Camera, defer = false) => {
    current.current = next; store.scroll[surface] = { x: next.x, y: next.y };
    if (defer) {
      if (timer.current === undefined) timer.current = setTimeout(() => { timer.current = undefined; setCamera(current.current); }, 16);
    } else {
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = undefined; setCamera(next);
    }
  };
  const api = useRef({ apply, measure }); api.current = { apply, measure };
  useEffect(() => () => { if (timer.current !== undefined) clearTimeout(timer.current); }, []);
  const pan = useMemo(() => {
    const touches = (event: GestureResponderEvent) => {
      const values = event.nativeEvent?.touches ?? [];
      const a = values[0], b = values[1];
      if (!a) return null;
      return { center: { x: b ? (a.pageX + b.pageX) / 2 : a.pageX,
        y: b ? (a.pageY + b.pageY) / 2 : a.pageY },
        distance: b ? Math.max(1, Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) : 0, kind: b ? 'pinch' as const : 'pan' as const };
    };
    const rebase = (event: GestureResponderEvent) => {
      const touch = touches(event);
      if (touch) { lastTouch.current = touch; gesture.current = { ...touch, camera: { ...current.current } }; }
    };
    const finish = () => {
      gesture.current = null; lastTouch.current = null; api.current.apply(current.current); suppressPressUntil.current = Date.now() + 200;
      // 핀치 중에는 뷰만 갱신하고 공유 상태는 끝에 한 번 저장한다.
      if (store.getSnapshot().zoom !== current.current.zoom) store.zoomTo(current.current.zoom);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: event => !native || (event.nativeEvent?.touches?.length ?? 0) >= 2,
      onMoveShouldSetPanResponderCapture: (event, value) => (event.nativeEvent?.touches?.length ?? 0) >= 2 || Math.hypot(value.dx, value.dy) > 5,
      onPanResponderGrant: event => {
        if (!store.getSnapshot().forceFitted) store.set({ forceFitted: true });
        if (!native) {
          event.preventDefault(); lastTouch.current = { center: { x: 0, y: 0 }, distance: 0, kind: 'pan' };
          gesture.current = { camera: { ...current.current }, ...lastTouch.current };
        }
        else { api.current.measure(); rebase(event); }
        suppressPressUntil.current = Date.now() + 400;
      },
      onPanResponderStart: event => { if (native) rebase(event); },
      onPanResponderEnd: event => { if (native) rebase(event); },
      onPanResponderMove: (event, value) => {
        const b = bounds.current;
        let next: Camera;
        if (!native) {
          event.preventDefault(); const first = gesture.current!;
          next = panCamera(first.camera, { x: value.dx - first.center.x, y: value.dy - first.center.y }, b.geometry, b.viewport);
          lastTouch.current = { center: { x: value.dx, y: value.dy }, distance: 0, kind: 'pan' };
        }
        else {
          const touch = touches(event), first = gesture.current;
          if (!touch) return;
          if (!first || first.kind !== touch.kind) { rebase(event); return; }
          lastTouch.current = touch;
          const local = (center: Point) => ({ x: center.x - screenOrigin.current.x, y: center.y - screenOrigin.current.y });
          next = touch.kind === 'pinch' ? pinchCamera(first.camera, local(first.center), local(touch.center), touch.distance / first.distance, b.geometry, b.viewport)
            : panCamera(first.camera, { x: touch.center.x - first.center.x, y: touch.center.y - first.center.y }, b.geometry, b.viewport);
        }
        const metrics = cameraMetrics(b.geometry, b.viewport, next.zoom);
        if (prior.current) prior.current = { ...prior.current, zoom: next.zoom, insetX: metrics.insetX, insetY: metrics.insetY };
        api.current.apply(next, native); suppressPressUntil.current = Date.now() + 400;
      },
      onPanResponderRelease: finish, onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    });
  }, [store, surface, native]);
  useLayoutEffect(() => {
    const previous = prior.current, zoom = gesture.current ? current.current.zoom : state.zoom, metrics = cameraMetrics(geometry, viewport, zoom);
    let { x, y } = current.current;
    const anchor = state.selected ?? origin, old = previous?.geometry.positions.get(anchor), next = geometry.positions.get(anchor);
    if (next && (!previous && !store.scrollInitialized[surface] || previous && state.focus !== previous.focus)) {
      x = (next.x + NODE_WIDTH / 2) * zoom + metrics.insetX - viewport.width / 2;
      y = (next.y + NODE_HEIGHT / 2) * zoom + metrics.insetY - viewport.height / 2;
    } else if (previous && old && next) {
      x += next.x * zoom + metrics.insetX - old.x * previous.zoom - previous.insetX;
      y += next.y * zoom + metrics.insetY - old.y * previous.zoom - previous.insetY;
    }
    const nextCamera = constrainCamera({ x, y, zoom }, geometry, viewport);
    api.current.apply(nextCamera);
    // 초기 배치나 viewport가 터치 도중 바뀌어도 배율을 되돌리지 않는다.
    if (gesture.current && lastTouch.current) gesture.current = { ...lastTouch.current, camera: nextCamera };
    store.scrollInitialized[surface] = true;
    prior.current = { geometry, zoom, focus: state.focus, insetX: metrics.insetX, insetY: metrics.insetY };
  }, [geometry, state.zoom, state.focus, viewport.width, viewport.height, surface]);
  // 배율에 따른 콘텐츠 크기가 렌더링된 다음 스크롤한다. 이전 크기에 먼저
  // scrollTo하면 브라우저가 좌표를 잘라 선택한 노드가 화면 밖으로 밀린다.
  useLayoutEffect(() => {
    if (!native) {
      horizontal.current?.scrollTo({ x: camera.x, animated: false }); vertical.current?.scrollTo({ y: camera.y, animated: false });
    }
  }, [native, camera.x, camera.y, camera.zoom, geometry, viewport.width, viewport.height]);
  const onScroll = (axis: 'x' | 'y', value: number) => {
    const next = { ...current.current, [axis]: value }; current.current = next;
    store.scroll[surface] = { x: next.x, y: next.y }; setCamera(next);
  };
  return { camera, native, metrics: cameraMetrics(geometry, viewport, camera.zoom), horizontal, vertical, viewportRef,
    panHandlers: pan.panHandlers, measure, point, canPress: () => Date.now() >= suppressPressUntil.current, onScroll };
}
