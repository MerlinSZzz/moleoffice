// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Point, Rect } from "./engine.ts";
type Size = { w: number; h: number };
const WORDS_OFF_BEND = 10;
const WORDS_OFF_ARROW = 15;
const WORD_POSITIONS = [...Array.from({ length: 19 }, (_, i) => (i + 1) / 20).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5)), ...Array.from({ length: 199 }, (_, i) => (i + 1) / 200).filter((_, i) => (i + 1) % 10 !== 0).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5))];
export function placePill(points: Point[], size: Size, hard: Rect[], taken: Rect[], others: Point[][] = [], minX = -Infinity, maxX = Infinity) {
  const segs = [];
  for (let n = 1; n < points.length; n++) {
    const a = points[n - 1]!;
    const b = points[n]!;
    segs.push({ a, b, len: Math.hypot(b.x - a.x, b.y - a.y), last: n === points.length - 1 });
  }
  segs.sort((p, q) => q.len - p.len);
  const lineParts: Rect[] = [];
  for (const other of others)
    for (let n = 1; n < other.length; n++) {
      const [a, b] = [other[n - 1]!, other[n]!];
      lineParts.push({ x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1, w: Math.abs(a.x - b.x) + 2, h: Math.abs(a.y - b.y) + 2 });
    }
  const overlap = (r: Rect, o: Rect, pad = 0) => r.x < o.x + o.w + pad && o.x - pad < r.x + r.w && r.y < o.y + o.h + pad && o.y - pad < r.y + r.h;
  // A pill moves along one axis of a segment. Only obstacles overlapping its fixed axis can hit it.
  const obstacles = (upright: boolean, fixed: number) => {
    const crosses = (o: Rect, pad: number) => upright
      ? fixed < o.x + o.w + pad && o.x - pad < fixed + size.w
      : fixed < o.y + o.h + pad && o.y - pad < fixed + size.h;
    const h = hard.filter((o) => crosses(o, 8));
    const t = taken.filter((o) => crosses(o, 12));
    const l = lineParts.filter((o) => crosses(o, 0));
    return (r: Rect) => h.some((o) => overlap(r, o, 8)) || t.some((o) => overlap(r, o, 12)) || l.some((o) => overlap(r, o));
  };
  let first = null;
  let outside: Rect | null = null;
  for (const seg of segs) {
    const along = seg.a.y === seg.b.y ? size.w : size.h;
    const upright = seg.a.x === seg.b.x;
    const hits = seg.a.x === seg.b.x || seg.a.y === seg.b.y
      ? obstacles(upright, upright ? seg.a.x - size.w / 2 : seg.a.y - size.h / 2)
      : (r: Rect) => hard.some((o) => overlap(r, o, 8)) || taken.some((o) => overlap(r, o, 12)) || lineParts.some((o) => overlap(r, o));
    for (const t2 of WORD_POSITIONS) {
      if (seg.len * t2 - along / 2 < WORDS_OFF_BEND || seg.len * (1 - t2) - along / 2 < (seg.last ? WORDS_OFF_ARROW : WORDS_OFF_BEND)) continue;
      const cx = seg.a.x + (seg.b.x - seg.a.x) * t2;
      const cy = seg.a.y + (seg.b.y - seg.a.y) * t2;
      const r = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };
      first ??= r;
      if (!hits(r)) {
        if (r.x >= minX && r.x + r.w <= maxX) return { rect: r, clear: true };
        outside ??= r;
      }
    }
  }
  const BESIDE = 2;
  for (const seg of segs) {
    const upright = seg.a.x === seg.b.x;
    const sideHits = seg.a.x !== seg.b.x && seg.a.y !== seg.b.y
      ? Array(2).fill((r: Rect) => hard.some((o) => overlap(r, o, 8)) || taken.some((o) => overlap(r, o, 12)) || lineParts.some((o) => overlap(r, o)))
      : upright
        ? [obstacles(true, seg.a.x + BESIDE), obstacles(true, seg.a.x - BESIDE - size.w)]
        : [obstacles(false, seg.a.y - BESIDE - size.h), obstacles(false, seg.a.y + BESIDE)];
    for (const t2 of WORD_POSITIONS) {
      const cx = seg.a.x + (seg.b.x - seg.a.x) * t2;
      const cy = seg.a.y + (seg.b.y - seg.a.y) * t2;
      const sides = upright ? [{ x: cx + BESIDE, y: cy - size.h / 2 }, { x: cx - BESIDE - size.w, y: cy - size.h / 2 }] : [{ x: cx - size.w / 2, y: cy - BESIDE - size.h }, { x: cx - size.w / 2, y: cy + BESIDE }];
      for (const [index, at] of sides.entries()) {
        const r = { ...at, w: size.w, h: size.h };
        if (!sideHits[index]!(r)) {
          if (r.x >= minX && r.x + r.w <= maxX) return { rect: r, clear: true };
          outside ??= r;
        }
      }
    }
  }
  if (outside) return { rect: outside, clear: true };
  if (!first) {
    const seg = segs[0]!;
    first = { x: (seg.a.x + seg.b.x) / 2 - size.w / 2, y: (seg.a.y + seg.b.y) / 2 - size.h / 2, w: size.w, h: size.h };
  }
  return { rect: first, clear: false };
}
