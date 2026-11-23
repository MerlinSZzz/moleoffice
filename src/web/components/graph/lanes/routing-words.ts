// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Point, Rect } from "./engine.ts";
type Size = { w: number; h: number };
const WORDS_OFF_BEND = 10;
const WORDS_OFF_ARROW = 15;
const WORD_POSITIONS = [...Array.from({ length: 19 }, (_, i) => (i + 1) / 20).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5)), ...Array.from({ length: 199 }, (_, i) => (i + 1) / 200).filter((_, i) => (i + 1) % 10 !== 0).sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5))];
const overlap = (r: Rect, o: Rect, pad = 0) => r.x < o.x + o.w + pad && o.x - pad < r.x + r.w && r.y < o.y + o.h + pad && o.y - pad < r.y + r.h;
/** Each run of the other lines, as a box a unit wider on every side. */
function linePartsOf(others: Point[][]): Rect[] {
  const lineParts: Rect[] = [];
  for (const other of others)
    for (let n = 1; n < other.length; n++) {
      const [a, b] = [other[n - 1]!, other[n]!];
      lineParts.push({ x: Math.min(a.x, b.x) - 1, y: Math.min(a.y, b.y) - 1, w: Math.abs(a.x - b.x) + 2, h: Math.abs(a.y - b.y) + 2 });
    }
  return lineParts;
}
/** Whether a place is not clear: within 8 of a card or an area heading, within 12 of words or a mark, or on a line. */
function hitsOf(hard: Rect[], taken: Rect[], lineParts: Rect[]) {
  return (r: Rect) => hard.some((o) => overlap(r, o, 8)) || taken.some((o) => overlap(r, o, 12)) || lineParts.some((o) => overlap(r, o));
}
/** The place for a line's words on the line. A place is clear only when it hits nothing and passes accept as well. */
export function placePill(points: Point[], size: Size, hard: Rect[], taken: Rect[], others: Point[][] = [], minX = -Infinity, maxX = Infinity, accept: (r: Rect) => boolean = () => true) {
  const segs = [];
  for (let n = 1; n < points.length; n++) {
    const a = points[n - 1]!;
    const b = points[n]!;
    segs.push({ a, b, len: Math.hypot(b.x - a.x, b.y - a.y), last: n === points.length - 1 });
  }
  segs.sort((p, q) => q.len - p.len);
  const lineParts = linePartsOf(others);
  // A pill moves along one axis of a segment. Only obstacles overlapping its fixed axis can hit it.
  const obstacles = (upright: boolean, fixed: number) => {
    const crosses = (o: Rect, pad: number) => upright
      ? fixed < o.x + o.w + pad && o.x - pad < fixed + size.w
      : fixed < o.y + o.h + pad && o.y - pad < fixed + size.h;
    return hitsOf(hard.filter((o) => crosses(o, 8)), taken.filter((o) => crosses(o, 12)), lineParts.filter((o) => crosses(o, 0)));
  };
  let first = null;
  let outside: Rect | null = null;
  for (const seg of segs) {
    const along = seg.a.y === seg.b.y ? size.w : size.h;
    const upright = seg.a.x === seg.b.x;
    const hits = seg.a.x === seg.b.x || seg.a.y === seg.b.y
      ? obstacles(upright, upright ? seg.a.x - size.w / 2 : seg.a.y - size.h / 2)
      : hitsOf(hard, taken, lineParts);
    for (const t2 of WORD_POSITIONS) {
      if (seg.len * t2 - along / 2 < WORDS_OFF_BEND || seg.len * (1 - t2) - along / 2 < (seg.last ? WORDS_OFF_ARROW : WORDS_OFF_BEND)) continue;
      const cx = seg.a.x + (seg.b.x - seg.a.x) * t2;
      const cy = seg.a.y + (seg.b.y - seg.a.y) * t2;
      const r = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };
      first ??= r;
      if (!hits(r) && accept(r)) {
        if (r.x >= minX && r.x + r.w <= maxX) return { rect: r, clear: true };
        outside ??= r;
      }
    }
  }
  const BESIDE = 2;
  for (const seg of segs) {
    const upright = seg.a.x === seg.b.x;
    const sideHits = seg.a.x !== seg.b.x && seg.a.y !== seg.b.y
      ? Array(2).fill(hitsOf(hard, taken, lineParts))
      : upright
        ? [obstacles(true, seg.a.x + BESIDE), obstacles(true, seg.a.x - BESIDE - size.w)]
        : [obstacles(false, seg.a.y - BESIDE - size.h), obstacles(false, seg.a.y + BESIDE)];
    for (const t2 of WORD_POSITIONS) {
      const cx = seg.a.x + (seg.b.x - seg.a.x) * t2;
      const cy = seg.a.y + (seg.b.y - seg.a.y) * t2;
      const sides = upright ? [{ x: cx + BESIDE, y: cy - size.h / 2 }, { x: cx - BESIDE - size.w, y: cy - size.h / 2 }] : [{ x: cx - size.w / 2, y: cy - BESIDE - size.h }, { x: cx - size.w / 2, y: cy + BESIDE }];
      for (const [index, at] of sides.entries()) {
        const r = { ...at, w: size.w, h: size.h };
        if (!sideHits[index]!(r) && accept(r)) {
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
/** The gap between a gate mark and its own line's words, when the mark lies beside them (round 238). */
const GATE_GAP = 4;
/** The four places for a gate mark beside its line's words, GATE_GAP from them: at their left, their right, over them and under them. */
function marksBeside(words: Rect, size: Size): Rect[] {
  const x = words.x + (words.w - size.w) / 2;
  const y = words.y + (words.h - size.h) / 2;
  return [
    { x: words.x - GATE_GAP - size.w, y, w: size.w, h: size.h },
    { x: words.x + words.w + GATE_GAP, y, w: size.w, h: size.h },
    { x, y: words.y - GATE_GAP - size.h, w: size.w, h: size.h },
    { x, y: words.y + words.h + GATE_GAP, w: size.w, h: size.h },
  ];
}
/**
 * The place of each gate mark at rest (round 238). The layout and the words at rest are planned without the marks, so a
 * mark never moves another line's words. A mark is given only a place that is clear: 8 from the cards and area headings,
 * 12 from the other lines' words and from the marks placed before it, off the other lines, and between minX and maxX, so
 * no mark and no moved words widen the drawing and the fit chooses the card it would choose without them. For a line with
 * words at rest, the mark is tried first beside its own words, where they are, off its own arrow. Where no place beside
 * them is clear, the words move along their line to the first place where they and a mark beside them are both clear.
 * Then the mark is placed alone on its line by placePill, as it is for a line with no words at rest; and last, the mark
 * takes a place on the line and the words are placed again, clear of it. A line that gets no clear place has no mark, and
 * is named in noPlace: its gate is still said by its colour, the legend and the line's own press.
 */
export function placeGateMarks(links: { id: string }[], routes: Map<string, Point[]>, size: Size, hard: Rect[], words: Map<string, Rect>, minX: number, maxX: number) {
  const marks = new Map<string, Rect>();
  const placedWords = new Map(words);
  const noPlace: string[] = [];
  const inside = (r: Rect) => r.x >= minX && r.x + r.w <= maxX;
  for (const link of links) {
    const route = routes.get(link.id);
    if (route === undefined) throw new Error(`the gated line ${link.id} has no route at rest`);
    const others = [...routes].filter(([id]) => id !== link.id).map(([, points]) => points);
    const otherWords = [...placedWords].filter(([id]) => id !== link.id).map(([, rect]) => rect);
    const own = placedWords.get(link.id);
    if (own !== undefined) {
      const end = route[route.length - 1]!;
      const arrow = { x: end.x - WORDS_OFF_ARROW, y: end.y - WORDS_OFF_ARROW, w: 2 * WORDS_OFF_ARROW, h: 2 * WORDS_OFF_ARROW };
      const hits = hitsOf(hard, [...otherWords, ...marks.values()], [...linePartsOf(others), arrow]);
      const besideWords = (at: Rect) => marksBeside(at, size).find((mark) => inside(mark) && !hits(mark));
      const moved = besideWords(own) === undefined ? placePill(route, { w: own.w, h: own.h }, hard, [...otherWords, ...marks.values()], others, minX, maxX, (at) => inside(at) && besideWords(at) !== undefined) : null;
      const at = moved === null ? own : moved.clear ? moved.rect : null;
      if (at !== null) {
        marks.set(link.id, besideWords(at)!);
        placedWords.set(link.id, at);
        continue;
      }
    }
    const alone = placePill(route, size, hard, [...placedWords.values(), ...marks.values()], others, minX, maxX, inside);
    if (alone.clear) {
      marks.set(link.id, alone.rect);
      continue;
    }
    if (own !== undefined) {
      const mark = placePill(route, size, hard, [...otherWords, ...marks.values()], others, minX, maxX, inside);
      const moved = mark.clear ? placePill(route, { w: own.w, h: own.h }, hard, [...otherWords, ...marks.values(), mark.rect], others, minX, maxX, inside) : null;
      if (moved?.clear) {
        marks.set(link.id, mark.rect);
        placedWords.set(link.id, moved.rect);
        continue;
      }
    }
    noPlace.push(link.id);
  }
  return { marks, words: placedWords, noPlace };
}
