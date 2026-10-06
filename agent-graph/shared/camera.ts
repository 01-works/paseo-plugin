import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from './layout';
export type Point = { x: number; y: number };
export type Viewport = { width: number; height: number };
export type Camera = Point & { zoom: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const clampZoom = (value: number) => clamp(value, 0.03, 1.5);
export function cameraMetrics(geometry: Viewport, viewport: Viewport, zoom: number) {
  return {
    width: Math.max(viewport.width, geometry.width * zoom), height: Math.max(viewport.height, geometry.height * zoom),
    insetX: Math.max(0, (viewport.width - geometry.width * zoom) / 2),
    insetY: Math.max(0, (viewport.height - geometry.height * zoom) / 2),
  };
}
export function constrainCamera(camera: Camera, geometry: Viewport, viewport: Viewport): Camera {
  const zoom = clampZoom(camera.zoom), metrics = cameraMetrics(geometry, viewport, zoom);
  return { zoom, x: clamp(camera.x, 0, metrics.width - viewport.width), y: clamp(camera.y, 0, metrics.height - viewport.height) };
}
export function panCamera(start: Camera, delta: Point, geometry: Viewport, viewport: Viewport): Camera {
  return constrainCamera({ ...start, x: start.x - delta.x, y: start.y - delta.y }, geometry, viewport);
}
// 두 손가락의 처음 중심 아래에 있던 좌표를 현재 중심 아래에 유지한다.
export function pinchCamera(start: Camera, firstCenter: Point, center: Point, ratio: number, geometry: Viewport, viewport: Viewport): Camera {
  const zoom = clampZoom(start.zoom * ratio), before = cameraMetrics(geometry, viewport, start.zoom), after = cameraMetrics(geometry, viewport, zoom);
  return constrainCamera({ zoom,
    x: (start.x + firstCenter.x - before.insetX) / start.zoom * zoom + after.insetX - center.x,
    y: (start.y + firstCenter.y - before.insetY) / start.zoom * zoom + after.insetY - center.y,
  }, geometry, viewport);
}
// 축소된 점의 터치 영역이 겹쳐도 실제 터치에 가장 가까운 노드를 고른다.
export function nearestNode(geometry: GraphLayout, camera: Camera, viewport: Viewport, point: Point, radius = 24) {
  const metrics = cameraMetrics(geometry, viewport, camera.zoom);
  let key: string | null = null, distance = radius;
  for (const position of geometry.positions.values()) {
    const x = (position.x + NODE_WIDTH / 2) * camera.zoom + metrics.insetX - camera.x;
    const y = (position.y + NODE_HEIGHT / 2) * camera.zoom + metrics.insetY - camera.y;
    const next = Math.hypot(x - point.x, y - point.y);
    if (next < distance) { distance = next; key = position.key; }
  }
  return key;
}
