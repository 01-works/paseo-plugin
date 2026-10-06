import { expect, it } from 'vitest';
import { cameraMetrics, constrainCamera, nearestNode, panCamera, pinchCamera } from '../shared/camera';
import type { GraphLayout } from '../shared/layout';
it('화면 맞춤은 두 축 가운데에 표시하고 이동·배율을 경계로 제한', () => {
  const geometry = { width: 200, height: 100 }, viewport = { width: 320, height: 300 };
  expect(cameraMetrics(geometry, viewport, 1)).toEqual({ width: 320, height: 300, insetX: 60, insetY: 100 });
  expect(constrainCamera({ x: 500, y: -100, zoom: 10 }, geometry, viewport)).toEqual({ x: 0, y: 0, zoom: 1.5 });
  expect(constrainCamera({ x: 0, y: 0, zoom: -1 }, geometry, viewport).zoom).toBe(0.03);
});
it('한 손가락으로 두 축을 함께 이동하고 끝에서 멈춤', () => {
  const geometry = { width: 1000, height: 900 }, viewport = { width: 320, height: 300 };
  expect(panCamera({ x: 100, y: 200, zoom: 1 }, { x: -50, y: 75 }, geometry, viewport)).toEqual({ x: 150, y: 125, zoom: 1 });
  expect(panCamera({ x: 100, y: 200, zoom: 1 }, { x: -5000, y: -5000 }, geometry, viewport)).toEqual({ x: 680, y: 600, zoom: 1 });
});
it('핀치는 선택된 노드가 아니라 손가락 중심 아래의 좌표를 보존', () => {
  const geometry = { width: 2000, height: 2000 }, viewport = { width: 320, height: 300 };
  const start = { x: 200, y: 300, zoom: 0.75 }, first = { x: 100, y: 120 }, center = { x: 140, y: 150 };
  const next = pinchCamera(start, first, center, 1.5, geometry, viewport);
  expect((next.x + center.x) / next.zoom).toBeCloseTo((start.x + first.x) / start.zoom);
  expect((next.y + center.y) / next.zoom).toBeCloseTo((start.y + first.y) / start.zoom);
});
it('센터 여백이 있는 축소 보기에서 확대할 때도 중심 좌표가 유지', () => {
  const geometry = { width: 600, height: 600 }, viewport = { width: 320, height: 300 }, start = { x: 0, y: 0, zoom: 0.4 };
  const next = pinchCamera(start, { x: 160, y: 150 }, { x: 160, y: 150 }, 2, geometry, viewport);
  expect(next).toEqual({ x: 80, y: 90, zoom: 0.8 });
});
it('겹친 터치 영역은 가장 가까운 점을 고르고 멀리 누르면 선택하지 않음', () => {
  const geometry: GraphLayout = { width: 500, height: 400, direction: 'force', edges: [], truncated: false,
    positions: new Map([['a', { key: 'a', x: 100, y: 100, depth: 0 }], ['b', { key: 'b', x: 120, y: 100, depth: 0 }]]) };
  const camera = { x: 0, y: 0, zoom: 1 }, viewport = { width: 320, height: 300 };
  expect(nearestNode(geometry, camera, viewport, { x: 205, y: 140 })).toBe('b');
  expect(nearestNode(geometry, camera, viewport, { x: 190, y: 140 })).toBe('a');
  expect(nearestNode(geometry, camera, viewport, { x: 50, y: 50 })).toBeNull();
});
