// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
type Point = { x: number; y: number };
type Rect = Point & { w: number; h: number };

// Move a run clear of a framed edge only when the new line remains clear of cards and does not add crossings.
export function clearFrameRuns(routes: Map<string, Point[]>, cards: Rect[], frames: Rect[]) {
  const overlap = (a: number, b: number, lo: number, hi: number) => Math.max(0, Math.min(Math.max(a, b), hi) - Math.max(Math.min(a, b), lo));
  const runs = (points: Point[]) => {
    const found: { index: number; horizontal: boolean; edge: number }[] = [];
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1]!, b = points[n]!;
      for (const r of frames) {
        if (a.y === b.y && overlap(a.x, b.x, r.x, r.x + r.w) > 20)
          for (const edge of [r.y, r.y + r.h]) if (Math.abs(a.y - edge) <= 5.5) found.push({ index: n, horizontal: true, edge });
        if (a.x === b.x && overlap(a.y, b.y, r.y, r.y + r.h) > 20)
          for (const edge of [r.x, r.x + r.w]) if (Math.abs(a.x - edge) <= 5.5) found.push({ index: n, horizontal: false, edge });
      }
    }
    return found;
  };
  const overCard = (points: Point[]) => points.some((b, i) => {
    if (!i) return false;
    const a = points[i - 1]!;
    return cards.some(r => Math.max(a.x, b.x) > r.x + 1 && Math.min(a.x, b.x) < r.x + r.w - 1 && Math.max(a.y, b.y) > r.y + 1 && Math.min(a.y, b.y) < r.y + r.h - 1);
  });
  const crosses = (points: Point[], id: string) => {
    let total = 0;
    const inside = (x: number, a: number, b: number) => x > Math.min(a, b) + 0.5 && x < Math.max(a, b) - 0.5;
    for (const [otherId, other] of routes) if (otherId !== id)
      for (let i = 1; i < points.length; i++) for (let j = 1; j < other.length; j++) {
        const a = points[i - 1]!, b = points[i]!, c = other[j - 1]!, d = other[j]!;
        if (a.y === b.y && c.x === d.x && inside(c.x, a.x, b.x) && inside(a.y, c.y, d.y)) total++;
        if (a.x === b.x && c.y === d.y && inside(a.x, c.x, d.x) && inside(c.y, a.y, b.y)) total++;
      }
    return total;
  };
  const sharedTrack = (points: Point[], id: string) => {
    let total = 0;
    for (const [otherId, other] of routes) if (otherId !== id)
      for (let i = 1; i < points.length; i++) for (let j = 1; j < other.length; j++) {
        const a = points[i - 1]!, b = points[i]!, c = other[j - 1]!, d = other[j]!;
        if (a.y === b.y && c.y === d.y && a.y === c.y) total += overlap(a.x, b.x, Math.min(c.x, d.x), Math.max(c.x, d.x));
        if (a.x === b.x && c.x === d.x && a.x === c.x) total += overlap(a.y, b.y, Math.min(c.y, d.y), Math.max(c.y, d.y));
      }
    return total;
  };
  let moved = false;
  for (const [id] of routes) {
    let points = routes.get(id)!;
    for (let attempt = 0; attempt < 30; attempt++) {
      const found = runs(points);
      if (!found.length) break;
      const initialCrossings = crosses(points, id);
      const initialShared = sharedTrack(points, id);
      let best: Point[] | undefined;
      for (const run of found) {
        const a = points[run.index - 1]!, b = points[run.index]!;
        for (const offset of [-8, 8, -12, 12, -18, 18, -6, 6]) {
          const v = run.edge + offset;
          const one = run.horizontal ? { x: a.x, y: v } : { x: v, y: a.y };
          const two = run.horizontal ? { x: b.x, y: v } : { x: v, y: b.y };
          const candidates = [
            ...(run.index > 1 && run.index < points.length - 1 ? [[...points.slice(0, run.index - 1), one, two, ...points.slice(run.index + 1)]] : []),
            [...points.slice(0, run.index), one, two, ...points.slice(run.index)],
          ];
          for (const candidate of candidates) {
            if (runs(candidate).length >= found.length || overCard(candidate) || crosses(candidate, id) > initialCrossings || sharedTrack(candidate, id) > initialShared) continue;
            best = candidate; break;
          }
          if (best) break;
        }
        if (best) break;
      }
      if (!best) break;
      points = best; routes.set(id, points); moved = true;
    }
  }
  return moved;
}
