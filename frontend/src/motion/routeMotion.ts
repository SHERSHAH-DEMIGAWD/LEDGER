/** Presentation only: stable viewpoints make return journeys reverse naturally. */
export type RouteScene = 'overview' | 'deals' | 'invitations' | 'detail' | 'create';

export function routeScene(path: string): RouteScene | null {
  if (path === '/') return 'overview';
  if (path === '/deals') return 'deals';
  if (path === '/invitations') return 'invitations';
  if (path === '/deals/new') return 'create';
  if (/^\/deals\/[^/]+\/?$/.test(path)) return 'detail';
  return null;
}

export function routeMovement(from: string, to: string) {
  const previous = routeScene(from);
  const next = routeScene(to);
  const depth = (scene: RouteScene) => scene === 'detail' || scene === 'create' ? 1 : 0;
  if (!previous || !next || from === to) return { direction: 0, depth: 0 };
  const depthChange = depth(next) - depth(previous);
  const order: Record<RouteScene, number> = { overview: 0, deals: 1, create: 1, detail: 1, invitations: 2 };
  return { direction: depthChange || Math.sign(order[next] - order[previous]), depth: depthChange };
}

export const routeEase = [0.22, 0.72, 0.22, 1] as const;

// Small angles keep the photographed coin and its sunlight in one plane.
// Zoom provides enough overscan that moving the viewpoint never exposes an edge.
export function environmentTransform(scene: RouteScene | null, compact: boolean) {
  const views = {
    overview: [0, 0, 0, 0, 1],
    deals: [-0.6, 0.15, 0.7, -0.15, 1.026],
    invitations: [0.55, -0.15, -0.65, 0.2, 1.027],
    detail: [-1.1, -0.3, 1.1, -0.25, 1.055],
    create: [-0.8, -0.2, 0.85, -0.2, 1.04],
  };
  const [x, y, ry, rx, scale] = views[scene ?? 'overview'];
  const amount = compact ? 0.28 : 1;
  return `perspective(2400px) translate3d(${x * amount}%, ${y * amount}%, 0) rotateY(${ry * amount}deg) rotateX(${rx * amount}deg) scale(${1 + (scale - 1) * amount})`;
}
