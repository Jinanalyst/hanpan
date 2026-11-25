// Small top-down drawing of a land, used in the menu and the store.
export function floorPlan(map) {
  const c = document.createElement('canvas'), [hx, hz] = map.size, g = c.getContext('2d');
  c.width = 160; c.height = 80;
  // turned sideways so Red is on the left and Blue on the right
  const k = Math.min(156 / (hz * 2), 76 / (hx * 2)), w = hz * 2 * k, h = hx * 2 * k;
  g.translate(80, 40);
  g.fillStyle = map.theme.ground[0]; g.fillRect(-w / 2, -h / 2, w, h);
  const F = map.theme.front;
  if (F) {   // sea, sand, then grass
    g.fillStyle = '#c9b184'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#4f7377'; g.fillRect(-w / 2, -h / 2, (F.sea + hz) * k, h);
    g.fillStyle = '#747a4c'; g.fillRect(F.sand * k, -h / 2, (hz - F.sand) * k, h);
  }
  g.fillStyle = 'rgba(15,17,12,.6)';
  for (const b of map.boxes) if (b.min[1] < 2 && b.kind !== 'perimeter') g.fillRect(b.min[2] * k, -b.max[0] * k, (b.max[2] - b.min[2]) * k, (b.max[0] - b.min[0]) * k);
  g.fillStyle = '#ff6a4d'; g.fillRect(-w / 2, -h / 2, 5, h);
  g.fillStyle = '#5aa5ff'; g.fillRect(w / 2 - 5, -h / 2, 5, h);
  return c;
}
