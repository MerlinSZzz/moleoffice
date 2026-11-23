// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The routing of the lanes drawing's lines, moved here out of engine.ts. Every route search runs in the worker of
// routing-worker.ts, and the page sends it the calls through RoutesAway, below.
import type { DrawnLink } from "./tree.ts";
import { placePill } from "./routing-words.ts";
import type { AreaNode, EndPin, Layout, Point, Rect, Rectangles, Side } from "./engine.ts";
// What routing reads of an area's node and of the layout, and so all that a call to the worker carries of them.
type RouteAreaNode = Pick<AreaNode, 'x' | 'y' | 'w' | 'h' | 'tint' | 'nested'> & { area: Pick<AreaNode['area'], 'derivedTiers'> };
type RouteRects = Omit<Rectangles, 'areas'> & { areas: (Omit<Rectangles['areas'][number], 'node'> & { node: RouteAreaNode })[] };
type RouteLayout = Pick<Layout, 'W' | 'H'>;
const UNITS = {
  card: 188,
  gap: 16,
  // between two items of an area
  tierGap: 70,
  // between two tiers: room for lines and their words
  besideGap: 56,
  // the least room between an area and a column beside it
  pillRoom: 48,
  // added to the widest words on the lines between two columns
  framePad: 12,
  // inside a framed area
  headGap: 8
  // under an area's heading
};
const BAND_BLEED = 10;
const CELL = 5;
const COST = { bend: 40, overlap: 3e3, cross: 3e3, near: 1.5, alongside: 50, apart: 1500, offMiddle: 2, bandEdge: 1500, ownSide: 1500, outside: 10, underWords: 30 };
const KEEP_CLEAR = 8;
const END_SPAN = 0.25;
const ALONGSIDE_CELLS = 3;
const APART = 12;
const ROUTE_ROOM = 60;
// A binary heap of numbered states. Its keys and states are kept in typed arrays that double when full; it compares
// and moves them as the heap of plain arrays before it did, so states of equal keys still leave it in the same order.
class Heap {
  keys: Float64Array
  items: Int32Array
  size: number
  constructor(capacity = 1024) {
    this.keys = new Float64Array(capacity);
    this.items = new Int32Array(capacity);
    this.size = 0;
  }
  clear() {
    this.size = 0;
  }
  push(item: number, key: number) {
    if (this.size === this.items.length) {
      const keys = new Float64Array(2 * this.size), items = new Int32Array(2 * this.size);
      keys.set(this.keys);
      items.set(this.items);
      this.keys = keys;
      this.items = items;
    }
    const { keys, items } = this;
    let i = this.size++;
    while (i > 0) {
      const p = i - 1 >> 1;
      if (keys[p]! <= key) break;
      keys[i] = keys[p]!;
      items[i] = items[p]!;
      i = p;
    }
    keys[i] = key;
    items[i] = item;
  }
  get minKey() {
    return this.keys[0]!;
  }
  pop() {
    const { keys, items } = this;
    const top = items[0]!;
    const n = --this.size;
    if (n) {
      const lastKey = keys[n]!;
      const last = items[n]!;
      let i = 0;
      for (; ; ) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1]! < keys[c]!) c++;
        if (keys[c]! >= lastKey) break;
        keys[i] = keys[c]!;
        items[i] = items[c]!;
        i = c;
      }
      keys[i] = lastKey;
      items[i] = last;
    }
    return top;
  }
}
// An estimate of what is left of a route from each cell, worked out outward from the goal only as far as a search
// asks. Its distances are final where `settled` is set.
type Estimate = { distances: Float64Array; settled: Uint8Array; heap: Heap; barred: number };
// The arrays routing reuses from one call of routeAll to the next while a drawing is planned, grown to the largest
// grid routed. They live in the routing worker, and go when the plan that started it ends it. Each search and each
// link's cell costs are marked with a number of their own, so nothing an earlier one wrote is read as its own.
class RouteSpace {
  n: number
  best: Float64Array
  seen: Uint32Array
  back: Int32Array
  keptBack: Int32Array
  epoch = 0
  straight: [Float64Array, Float64Array]
  turning: [Float64Array, Float64Array]
  alongside: [Float64Array, Float64Array]
  barred: [Uint8Array, Uint8Array]
  costed: Uint32Array
  costEpoch = 0
  estimates: Estimate[]
  heap = new Heap()
  constructor(n: number) {
    this.n = n;
    const states = n * 4 * 9;
    this.best = new Float64Array(states);
    this.seen = new Uint32Array(states);
    this.back = new Int32Array(states);
    this.keptBack = new Int32Array(states);
    this.straight = [new Float64Array(n), new Float64Array(n)];
    this.turning = [new Float64Array(n), new Float64Array(n)];
    this.alongside = [new Float64Array(n), new Float64Array(n)];
    this.barred = [new Uint8Array(n), new Uint8Array(n)];
    this.costed = new Uint32Array(n);
    this.estimates = [0, 1, 2, 3].map(() => ({ distances: new Float64Array(n), settled: new Uint8Array(n), heap: new Heap(), barred: 0 }));
  }
}
let routeSpace: RouteSpace | null = null;
// The free and moved passes use the same walls, although their pins and earlier routes differ. Keep only the
// wall-neighbor grids, which those passes read but never modify, and bound the memory held by the worker.
let nearWalls: { geometry: string; grids: Map<string, Uint8Array>; bytes: number } | null = null;
const NEAR_WALLS_LIMIT = 32 * 1024 * 1024;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
// What routeAll had kept just after it routed one line: the line, the cells of every route so far, the routes, the
// words, the crowded words and the lines let go. It is kept for each line put first or given priority, while every
// line before it was too.
type Routed = { id: string; used: [Uint8Array, Uint8Array]; routes: [string, Point[]][]; pills: [string, Rect][]; crowded: string[]; loose: any[] };
// Obstacle grids before earlier lines' pills and the two ends are added, shared only by attempts of one call.
type AttemptWalls = { grids: Map<DrawnLink, Map<number, Uint8Array>>; bytes: number };
const ATTEMPT_WALLS_LIMIT = 32 * 1024 * 1024;
function routeAll(drawnLinks: DrawnLink[], endRect: (id: string) => Rect, rects: RouteRects, layout: RouteLayout, bands: Rect[], before: any = null, pins: any = null, finalPass = false, wordPriority: ReadonlySet<string> = new Set(), fixedRoutes: Map<string, Point[]> = new Map(), fixedPills: Map<string, Rect> = new Map(), firstWords: ReadonlySet<string> = new Set(), steps: Routed[] | null = null, attemptWalls: AttemptWalls | null = null) {
  const routeCost = before ? { ...rects.routeCost, apart: 1500, ownSide: 1500 } : rects.routeCost;
  const x0 = -ROUTE_ROOM;
  const y0 = -ROUTE_ROOM;
  const cols = Math.ceil((layout.W + 2 * ROUTE_ROOM) / CELL);
  const rows = Math.ceil((layout.H + 2 * ROUTE_ROOM) / CELL);
  const N = cols * rows;
  if (!routeSpace || routeSpace.n < N) routeSpace = new RouteSpace(N);
  const space = routeSpace;
  const cellOf = (x: number, y: number): [number, number] => [Math.floor((x - x0) / CELL), Math.floor((y - y0) / CELL)];
  const centre = (i: number, j: number) => ({ x: x0 + (i + 0.5) * CELL, y: y0 + (j + 0.5) * CELL });
  // The columns and rows of the cells a rectangle covers, grown by a margin, cut to the grid: [first column, last
  // column, first row, last row]. A rectangle that covers no cell gives a first after its last.
  const cellsOf = (r: Rect, margin: number) => {
    const [a, b] = cellOf(r.x - margin, r.y - margin);
    const [c, d] = cellOf(r.x + r.w + margin, r.y + r.h + margin);
    return [Math.max(0, a), Math.min(cols - 1, c), Math.max(0, b), Math.min(rows - 1, d)] as const;
  };
  const fill = (grid: Uint8Array, r: Rect, margin: number, value: number) => {
    const [i0, i1, j0, j1] = cellsOf(r, margin);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid[j * cols + i] = value;
  };
  const used: any = before && !rects.clearedRest ? [Uint8Array.from(before.used[0]), Uint8Array.from(before.used[1])] : [new Uint8Array(N), new Uint8Array(N)];
  if (before && rects.clearedRest) for (const points of rects.clearedRest.values()) {
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1]!, b = points[n]!;
      const axis = Math.abs(a.y - b.y) < 0.01 ? 0 : 1;
      const [i0, j0] = cellOf(a.x, a.y), [i1, j1] = cellOf(b.x, b.y);
      for (let j = Math.max(0, Math.min(j0, j1)); j <= Math.min(rows - 1, Math.max(j0, j1)); j++)
        for (let i = Math.max(0, Math.min(i0, i1)); i <= Math.min(cols - 1, Math.max(i0, i1)); i++) used[axis][j * cols + i] = 1;
    }
  }
  const nearRest = new Uint8Array(N);
  if (before && rects.clearedRest) for (const points of rects.clearedRest.values()) {
    for (let n = 1; n < points.length; n++) {
      const a = points[n - 1]!, b = points[n]!;
      if (Math.abs(a.x - b.x) >= 0.01 || (a.x >= 0 && a.x <= layout.W)) continue;
      const [firstI, firstJ] = cellOf(a.x - 6, Math.min(a.y, b.y) - CELL);
      const [lastI, lastJ] = cellOf(a.x + 6, Math.max(a.y, b.y) + CELL);
      for (let i = Math.max(0, firstI); i <= Math.min(cols - 1, lastI); i++) {
        if (Math.abs(centre(i, 0).x - a.x) >= 6 - 0.001) continue;
        for (let j = Math.max(0, firstJ); j <= Math.min(rows - 1, lastJ); j++) nearRest[j * cols + i] = 1;
      }
    }
  }
  const onBand: [Uint8Array, Uint8Array] = [new Uint8Array(N), new Uint8Array(N)];
  const borderRects = rects.wordSizes?.size ? [...bands, ...rects.areas.filter((area) => area.framed).map((area) => area.rect)] : bands;
  for (const b of borderRects) {
    for (const y of [b.y, b.y + b.h]) for (let j = 0; j < rows; j++) if (Math.abs(centre(0, j).y - y) < APART) fill(onBand[0], { x: b.x, y: centre(0, j).y, w: b.w, h: 0 }, 0, 1);
    for (const x of [b.x, b.x + b.w]) for (let i = 0; i < cols; i++) if (Math.abs(centre(i, 0).x - x) < APART) fill(onBand[1], { x: centre(i, 0).x, y: b.y, w: 0, h: b.h }, 0, 1);
  }
  const outside = new Uint8Array(N).fill(1);
  if (bands.length) {
    const bx0 = Math.min(...bands.map((b) => b.x));
    const by0 = Math.min(...bands.map((b) => b.y));
    fill(outside, { x: bx0, y: by0, w: Math.max(...bands.map((b) => b.x + b.w)) - bx0, h: Math.max(...bands.map((b) => b.y + b.h)) - by0 }, 0, 0);
  } else outside.fill(0);
  const under = new Uint8Array(N);
  for (const r of rects.under ?? []) fill(under, r, 2, 1);
  const LEAVE: Record<string, number> = { top: 3, bottom: 1, left: 2, right: 0 };
  const ARRIVE: Record<string, number> = { top: 1, bottom: 3, left: 0, right: 2 };
  const atPin = (pin: EndPin & { at: number; side: Side }, i: number, j: number) => pin.side === "top" || pin.side === "bottom" ? i === Math.floor((pin.at - x0) / CELL) : j === Math.floor((pin.at - y0) / CELL);
  const placed = (pin: EndPin | undefined): pin is EndPin & { at: number; side: Side } => pin?.at !== void 0 && pin.side !== void 0;
  const inMiddle = (r: Rect, i: number, j: number, across: boolean) => across
    ? Math.abs(x0 + (i + 0.5) * CELL - r.x - r.w / 2) <= END_SPAN * r.w
    : Math.abs(y0 + (j + 0.5) * CELL - r.y - r.h / 2) <= END_SPAN * r.h;
  const alignedAcrossAreas = (link: DrawnLink) => {
    const a = endRect(link.from), b = endRect(link.to);
    const left = rects.areas.find(area => !area.node.nested && area.ids.has(link.from));
    const right = rects.areas.find(area => !area.node.nested && area.ids.has(link.to));
    return link.type === 'blocks' && left && right && left !== right && Math.abs(a.y + a.h / 2 - b.y - b.h / 2) < 1;
  };
  const hasAlignedCrossArea = drawnLinks.some(alignedAcrossAreas);
  const canReuseNear = !before && !rects.wordSizes?.size && !rects.under?.length && !fixedPills.size;
  if (canReuseNear) {
    const geometry = JSON.stringify([layout, [...rects.cards], rects.words, rects.areas.map((a) => [a.rect, a.framed, a.head, [...a.ids], a.node.x, a.node.y, a.node.w, a.node.h, a.node.tint, a.node.nested, a.node.area.derivedTiers]), hasAlignedCrossArea]);
    if (nearWalls?.geometry !== geometry) nearWalls = { geometry, grids: new Map(), bytes: 0 };
  }
  const order = [...drawnLinks].sort((p, q) => {
    const first = Number(firstWords.has(q.id)) - Number(firstWords.has(p.id));
    if (first) return first;
    const priority = Number(wordPriority.has(q.id)) - Number(wordPriority.has(p.id));
    if (priority) return priority;
    const d = (l: DrawnLink) => {
      const a = endRect(l.from);
      const b = endRect(l.to);
      return Math.abs(a.x + a.w / 2 - b.x - b.w / 2) + Math.abs(a.y + a.h / 2 - b.y - b.h / 2) - (alignedAcrossAreas(l) ? 100000 : 0);
    };
    return (before && rects.fitRoom !== undefined) || (wordPriority.has(p.id) && wordPriority.has(q.id)) ? d(q) - d(p) : d(p) - d(q);
  });
  const routes: any = new Map();
  const pills = new Map<string, Rect>(fixedPills);
  const crowded: string[] = [];
  const loose: any[] = [];
  const keepRoute = (link: DrawnLink, points: Point[]) => {
    const size = rects.wordSizes?.get(link.id);
    if (size) {
      const placed = placePill(points, size, [...rects.cards.values(), ...rects.words], [...pills.values()], [...fixedRoutes.values(), ...routes.values()] as Point[][]);
      pills.set(link.id, placed.rect);
      if (!placed.clear) crowded.push(link.id);
    }
    routes.set(link.id, points);
  };
  // `steps` is given only to calls made again with the same arguments but more lines given priority. Each line is
  // routed from what the lines before it left, so a call whose order begins with the same lines as the call before,
  // in the same order, routes them as that call did. It starts from what that call had kept after them, and keeps
  // the same for the call after it.
  let resumed = 0;
  if (steps) {
    while (resumed < steps.length && order[resumed]?.id === steps[resumed]!.id) resumed++;
    steps.length = resumed;
    const after = steps[resumed - 1];
    if (after) {
      used[0].set(after.used[0]);
      used[1].set(after.used[1]);
      for (const [id, points] of after.routes) routes.set(id, points);
      pills.clear();
      for (const [id, rect] of after.pills) pills.set(id, rect);
      crowded.push(...after.crowded);
      loose.push(...after.loose);
    }
  }
  for (const [position, link] of order.entries()) {
    if (position < resumed) continue;
    for (const room of before ? [0, ...(rects.fitRoom === undefined ? [] : [rects.fitRoom]), ROUTE_ROOM - CELL] : [hasAlignedCrossArea ? 40 : 15]) {
    const from = endRect(link.from);
    const to = endRect(link.to);
    // Keep nearby horizontal segments on distinct tracks, even where a gap separates them.
    // A cell is near one when its row has a used horizontal cell 23 columns or fewer from it on either side. The used
    // cells are found four at a time, in order, and each sets the cells around it from where the one before stopped.
    const nearHorizontal = new Uint8Array(N);
    const horizontal: Uint8Array = used[0];
    const marked = Math.min(N, horizontal.length);
    const fours = new Uint32Array(horizontal.buffer, horizontal.byteOffset, marked >> 2);
    let reach = 0;
    const nearIt = (k: number) => {
      const rowStart = k - k % cols;
      const end = Math.min(rowStart + cols, k + 24);
      nearHorizontal.fill(1, Math.max(rowStart, k - 23, reach), end);
      reach = end;
    };
    for (let w = 0; w < fours.length; w++) if (fours[w]) for (let k = 4 * w; k < 4 * w + 4; k++) if (horizontal[k]) nearIt(k);
    for (let k = 4 * fours.length; k < marked; k++) if (horizontal[k]) nearIt(k);
    // A cell is outside the room when its centre's column or its row is: a row outside is blocked whole, and every
    // other row is given the columns outside.
    const heldWalls = attemptWalls?.grids.get(link)?.get(room);
    const blocked = heldWalls ? heldWalls.slice() : new Uint8Array(N);
    if (!heldWalls) {
      const outsideColumns = new Uint8Array(cols);
      for (let i = 0; i < cols; i++) {
        const x = x0 + (i + 0.5) * CELL;
        const tight = before && rects.fitRoom !== undefined && room === rects.fitRoom;
        const leftRoom = tight ? room + 10 : room;
        const rightRoom = tight ? Math.max(0, room - 10) : room;
        if (x < -leftRoom || x > layout.W + rightRoom) outsideColumns[i] = 1;
      }
      for (let j = 0; j < rows; j++) {
        const y = y0 + (j + 0.5) * CELL;
        if (y < -(room === rects.fitRoom ? ROUTE_ROOM - CELL : room) || y > layout.H + (room === rects.fitRoom ? ROUTE_ROOM - CELL : room)) blocked.fill(1, j * cols, (j + 1) * cols);
        else blocked.set(outsideColumns, j * cols);
      }
      for (const [id, r] of rects.cards) if (id !== link.from && id !== link.to) fill(blocked, r, KEEP_CLEAR, 1);
      // A visible area unrelated to both ends is an obstacle, including its tint bleed.
      for (const a of rects.areas) {
        if ((!a.framed && !a.node.tint) || a.head === link.from || a.head === link.to || a.ids.has(link.from) || a.ids.has(link.to)) continue;
        fill(blocked, a.node.tint && !a.framed ? bandRect(a.node, layout.W) : a.rect, KEEP_CLEAR, 1);
      }
      for (const r of rects.words) fill(blocked, r, 2, 1);
      for (const a of rects.areas) {
        if (!a.framed) continue;
        if (a.head === link.from || a.head === link.to) continue;
        if (a.ids.has(link.from) || a.ids.has(link.to)) continue;
        fill(blocked, a.rect, KEEP_CLEAR, 1);
      }
      const lane = !hasAlignedCrossArea && rects.areas.find((a) => !a.node.nested && !a.node.area.derivedTiers && a.ids.has(link.from) && a.ids.has(link.to));
      if (lane) {
        // Every cell outside the lane's cells is blocked: each row above or below them whole, and the columns beside them.
        const [i0, i1, j0, j1] = cellsOf(lane.rect, 0);
        for (let j = 0; j < rows; j++) {
          if (!(j >= j0 && j <= j1 && i0 <= i1)) blocked.fill(1, j * cols, (j + 1) * cols);
          else {
            blocked.fill(1, j * cols, j * cols + i0);
            blocked.fill(1, j * cols + i1 + 1, (j + 1) * cols);
          }
        }
      }
      if (attemptWalls && attemptWalls.bytes + N <= ATTEMPT_WALLS_LIMIT) {
        let rooms = attemptWalls.grids.get(link);
        if (!rooms) attemptWalls.grids.set(link, rooms = new Map());
        rooms.set(room, blocked.slice());
        attemptWalls.bytes += N;
      }
    }
    // Pills only add walls, so adding them after the lane restriction gives the same grid.
    for (const r of pills.values()) fill(blocked, r, 2, 1);
    const goal = new Uint8Array(N);
    fill(goal, to, -1, 1);
    const start = new Uint8Array(N);
    fill(start, from, -1, 1);
    fill(blocked, from, -1, 1);
    fill(blocked, to, -1, 0);
    const ownSide: [Uint8Array, Uint8Array] = [new Uint8Array(N), new Uint8Array(N)];
    for (const r of [from, to]) {
      fill(ownSide[0], { x: r.x, y: r.y - KEEP_CLEAR, w: r.w, h: KEEP_CLEAR }, 0, 1);
      fill(ownSide[0], { x: r.x, y: r.y + r.h, w: r.w, h: KEEP_CLEAR }, 0, 1);
      fill(ownSide[1], { x: r.x - KEEP_CLEAR, y: r.y, w: KEEP_CLEAR, h: r.h }, 0, 1);
      fill(ownSide[1], { x: r.x + r.w, y: r.y, w: KEEP_CLEAR, h: r.h }, 0, 1);
    }
    const withoutWordWalls = blocked.slice();
    // Whether a walk of single steps from the cells beside the start, the cells a search starts from, reaches the end
    // through cells the walls leave open. A search steps only so, so when no walk reaches the end no search does.
    // Without crossing, a step may not enter a cell that a line passes through at right angles to the step, unless the
    // cell is part of the end, just as a step of a search that avoids crossing may not.
    const reaches = (walls: Uint8Array, withoutCrossing: boolean) => {
      const reached = new Uint8Array(N);
      const queue = new Int32Array(N);
      let head = 0, tail = 0;
      const add = (i: number, j: number, axis = -1) => {
        if (i < 0 || j < 0 || i >= cols || j >= rows) return;
        const k = j * cols + i;
        if (walls[k] || reached[k] || withoutCrossing && axis >= 0 && used[1 - axis][k] && !goal[k]) return;
        reached[k] = 1;
        queue[tail++] = k;
      };
      const [sa, sb] = cellOf(from.x, from.y);
      const [sc, sd] = cellOf(from.x + from.w, from.y + from.h);
      for (let i = sa + 1; i < sc; i++) { add(i, sb - 1); add(i, sd + 1); }
      for (let j = sb + 1; j < sd; j++) { add(sa - 1, j); add(sc + 1, j); }
      while (head < tail) {
        const k = queue[head++]!;
        if (goal[k]) return true;
        const i = k % cols, j = (k - i) / cols;
        for (let dir = 0; dir < 4; dir++) add(i + DX[dir]!, j + DY[dir]!, dir & 1);
      }
      return false;
    };
    // If even an unconstrained walk cannot connect the ends inside, use the outer room.
    if (before && room === 0 && !reaches(withoutWordWalls, false)) continue;
    for (const r of rects.under ?? []) fill(blocked, r, 2, 1);
    fill(blocked, to, -1, 0);
    const nearKey = canReuseNear ? JSON.stringify([link.from, link.to, from, to, room]) : null;
    let near = nearKey === null ? undefined : nearWalls!.grids.get(nearKey);
    if (!near) {
      near = new Uint8Array(N);
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          if (blocked[k]) continue;
          if (i > 0 && blocked[k - 1] || i < cols - 1 && blocked[k + 1] || j > 0 && blocked[k - cols] || j < rows - 1 && blocked[k + cols]) near[k] = 1;
        }
      if (nearKey !== null && nearWalls!.bytes + near.byteLength <= NEAR_WALLS_LIMIT) {
        nearWalls!.grids.set(nearKey, near);
        nearWalls!.bytes += near.byteLength;
      }
    }
    const nearForCost = near;
    const [ga, gb] = cellOf(to.x, to.y);
    const [gc, gd] = cellOf(to.x + to.w, to.y + to.h);
    const h = (i: number, j: number) => Math.max(0, ga - i, i - gc) + Math.max(0, gb - j, j - gd);
    // What a step into a cell costs along each axis, worked out for a cell the first time a search or an estimate
    // reaches it while this link is routed. The terms are those each step added before, in the same order, so each
    // cost is the same number: `straight` and `turning` hold the sum before the end and alongside terms, for a step
    // that keeps its direction and for one that turns, and `alongside` holds the alongside term. `barred` says which
    // steps may not be taken: 1 when lines are kept apart, 2 when crossing is avoided, and 4 always.
    const costEpoch = ++space.costEpoch;
    const { straight, turning, alongside, barred, costed } = space;
    const costCell = (k: number) => {
      costed[k] = costEpoch;
      for (let axis = 0; axis < 2; axis++) {
        const nearCost = nearForCost[k] ? COST.near : 0;
        let ahead = 1 + nearCost;
        let turned = 1 + COST.bend + nearCost;
        let bar = 0;
        if (used[axis][k]) { ahead += routeCost.overlap; turned += routeCost.overlap; bar |= 1; }
        if (axis === 0 && nearHorizontal[k] && !goal[k]) { ahead += 1200; turned += 1200; }
        if (used[1 - axis][k]) {
          // When words are walls, a detour past another line can otherwise trade a clear word for many crossings.
          const crossing = rects.wordSizes?.size ? 300000 : before && rects.fitRoom !== undefined ? 100000 : COST.cross;
          ahead += crossing; turned += crossing; if (!goal[k]) bar |= 2;
        }
        if (onBand[axis]![k]) { const band = rects.wordSizes?.size ? 15000 : before ? 150 : COST.bandEdge; ahead += band; turned += band; }
        if (outside[k]) { ahead += COST.outside; turned += COST.outside; }
        if (under[k]) { ahead += COST.underWords; turned += COST.underWords; }
        if (ownSide[axis]![k] && !goal[k]) {
          if (before) { ahead += routeCost.ownSide; turned += routeCost.ownSide; }
          else bar |= 4;
        }
        let along = 0;
        const side = axis === 0 ? cols : 1;
        for (let d = 1; d <= ALONGSIDE_CELLS; d++) {
          if (k - d * side >= 0 && used[axis][k - d * side] || k + d * side < N && used[axis][k + d * side]) {
            if (d * CELL < APART) bar |= 1;
            along = d * CELL < APART ? routeCost.apart / d : COST.alongside * (ALONGSIDE_CELLS + 1 - d) / ALONGSIDE_CELLS;
            break;
          }
        }
        if (before && rects.fitRoom !== undefined && axis === 1) {
          const x = x0 + (k % cols + 0.5) * CELL;
          const outside = x < 0 || x > layout.W;
          let tooClose = !!nearRest[k] || outside && !!used[1][k];
          const i = k % cols;
          for (let d = 1; d * CELL < 6 && !tooClose; d++) for (const sign of [-1, 1]) {
            const next = i + sign * d;
            if (next < 0 || next >= cols) continue;
            const otherX = x + sign * d * CELL;
            if (used[1][k + sign * d] && (outside || otherX < 0 || otherX > layout.W)) tooClose = true;
          }
          if (tooClose) bar |= 4;
        }
        straight[axis]![k] = ahead;
        turning[axis]![k] = turned;
        alongside[axis]![k] = along;
        barred[axis]![k] = bar;
      }
    };
    const goalCells: number[] = [];
    const [gi0, gi1, gj0, gj1] = cellsOf(to, -1);
    for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) goalCells.push(j * cols + i);
    const estimates = new Map<string, Estimate>();
    // Omitting turn and endpoint costs makes this a lower bound on every remaining route.
    const estimate = (separate: boolean, avoidCrossing: boolean, pin: any, allowedEnd: (dir: number, i: number, j: number) => boolean, leaning: boolean): Estimate => {
      const improve = !!rects.wordSizes?.size || !!(before && rects.fitRoom !== undefined);
      const key = improve ? `${separate}:${avoidCrossing}:${placed(pin.end) ? `${pin.end.side}@${pin.end.at}` : (pin.end?.avoid ?? []).join()}` : `${separate}:${avoidCrossing}`;
      const held = estimates.get(key);
      if (held) return held;
      const made = space.estimates[estimates.size] ??= { distances: new Float64Array(space.n), settled: new Uint8Array(space.n), heap: new Heap(), barred: 0 };
      made.distances.fill(Infinity, 0, N);
      made.settled.fill(0, 0, N);
      made.heap.clear();
      made.barred = 4 | (separate ? 1 : 0) | (avoidCrossing ? 2 : 0);
      for (const k of goalCells) {
        made.distances[k] = 0;
        if (improve) made.settled[k] = 1;
        else made.heap.push(k, 0);
      }
      if (improve) for (const k of goalCells) {
        const i = k % cols, j = (k - i) / cols;
        for (let dir = 0; dir < 4; dir++) {
          if (!allowedEnd(dir, i, j)) continue;
          const pi = i - DX[dir]!, pj = j - DY[dir]!;
          if (pi < 0 || pj < 0 || pi >= cols || pj >= rows) continue;
          const p = pj * cols + pi;
          if (blocked[p] || goal[p]) continue;
          if (costed[k] !== costEpoch) costCell(k);
          const axis = dir & 1;
          if (barred[axis]![k]! & made.barred) continue;
          const cost = straight[axis]![k]! + alongside[axis]![k]! + (axis === 1 ? COST.offMiddle * Math.abs(x0 + (i + 0.5) * CELL - to.x - to.w / 2) / (to.w / 2) : COST.offMiddle * Math.abs(y0 + (j + 0.5) * CELL - to.y - to.h / 2) / (to.h / 2)) + (leaning && dx > dy !== (axis === 0) ? 20 : 0);
          if (cost < made.distances[p]!) {
            made.distances[p] = cost;
            made.heap.push(p, cost);
          }
        }
      }
      estimates.set(key, made);
      return made;
    };
    // A cell's distance is the least sum of step costs from it to the goal, so it is the same number however far out
    // the estimate has been worked when it is asked: it is worked out until the cell is settled or nothing is left.
    const distanceOf = (made: Estimate, target: number) => {
      const { distances, settled, heap } = made;
      const bars = made.barred;
      while (!settled[target] && heap.size) {
        const value = heap.minKey;
        const k = heap.pop();
        if (value !== distances[k]) continue;
        settled[k] = 1;
        if (costed[k] !== costEpoch) costCell(k);
        const i = k % cols, j = (k - i) / cols;
        for (let dir = 0; dir < 4; dir++) {
          const axis = dir & 1;
          if (barred[axis]![k]! & bars) continue;
          const ni = i + DX[dir]!, nj = j + DY[dir]!;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const nk = nj * cols + ni;
          if (blocked[nk]) continue;
          const next = value + (straight[axis]![k]! + alongside[axis]![k]!);
          if (next < distances[nk]!) {
            distances[nk] = next;
            heap.push(nk, next);
          }
        }
      }
      return distances[target]!;
    };
    const dx = Math.abs(from.x + from.w / 2 - to.x - to.w / 2);
    const dy = Math.abs(from.y + from.h / 2 - to.y - to.h / 2);
    const search = (pin: any, requireRun: boolean, separate = false, minRun = 8, avoidCrossing = false, useEstimate = false, preserveBack = false): any => {
      const span2 = requireRun && finalPass ? 9 : 1;
      const remaining = (i: number, j: number) => {
        if (!made) return h(i, j);
        const k = j * cols + i;
        return made.settled[k] ? made.distances[k]! : distanceOf(made, k);
      };
      if (space.epoch === 0xffffffff) { space.seen.fill(0); space.epoch = 0; }
      const { best, seen } = space;
      const epoch = ++space.epoch;
      // A route kept while a shorter one is sought keeps its way back in an array of its own.
      const back2 = preserveBack ? space.keptBack : space.back;
      const bestAt = (state: number) => seen[state] === epoch ? best[state]! : Infinity;
      const heap = space.heap;
      heap.clear();
      let seeded = 0;
      const allowedEnd = (dir: number, i: number, j: number) => placed(pin.end)
        ? dir === ARRIVE[pin.end.side] && atPin(pin.end, i, j)
        : inMiddle(to, i, j, dir % 2 === 1) && !(pin.end?.avoid ?? []).some((side: Side) => dir === ARRIVE[side]);
      const offMiddle = (r: Rect, i: number, j: number, across: boolean) => across ? COST.offMiddle * Math.abs(x0 + (i + 0.5) * CELL - r.x - r.w / 2) / (r.w / 2) : COST.offMiddle * Math.abs(y0 + (j + 0.5) * CELL - r.y - r.h / 2) / (r.h / 2);
      const leaning = !before && !finalPass && !placed(pin.end);
      const made = useEstimate ? estimate(separate, avoidCrossing, pin, allowedEnd, leaning) : null;
      const [sa, sb] = cellOf(from.x, from.y);
      const [sc, sd] = cellOf(from.x + from.w, from.y + from.h);
      let seedInGoal = false;
      const seed = (i: number, j: number, dir: number) => {
        if (i < 0 || j < 0 || i >= cols || j >= rows) return;
        const k = j * cols + i;
        if (blocked[k] && !goal[k]) return;
        if (placed(pin.start) ? dir !== LEAVE[pin.start.side] || !atPin(pin.start, i, j) : !inMiddle(from, i, j, dir % 2 === 1) || (pin.start?.avoid ?? []).some((side: Side) => dir === LEAVE[side])) return;
        const s = (k * 4 + dir) * span2;
        const g = offMiddle(from, i, j, dir % 2 === 1);
        if (bestAt(s) > g) {
          seen[s] = epoch;
          best[s] = g;
          back2[s] = -1;
          if (!Number.isFinite(remaining(i, j))) return;
          heap.push(s, g + remaining(i, j));
          if (goal[k]) seedInGoal = true;
          seeded++;
        }
      };
      for (let i = sa + 1; i < sc; i++) {
        seed(i, sb - 1, 3);
        seed(i, sd + 1, 1);
      }
      for (let j = sb + 1; j < sd; j++) {
        seed(sa - 1, j, 2);
        seed(sc + 1, j, 0);
      }
      // A final run must have an allowed entry and enough clear cells before it.
      if (span2 > 1 && heap.size && !seedInGoal) {
        let possible = false;
        for (let j = Math.max(0, gb); j <= Math.min(rows - 1, gd) && !possible; j++) {
          for (let i = Math.max(0, ga); i <= Math.min(cols - 1, gc) && !possible; i++) {
            const target = j * cols + i;
            if (!goal[target]) continue;
            for (let dir = 0; dir < 4 && !possible; dir++) {
              if (!allowedEnd(dir, i, j)) continue;
              const axis = dir % 2;
              let clear = true;
              for (let n = 0; n <= minRun && clear; n++) {
                const x = i - n * DX[dir]!, y = j - n * DY[dir]!;
                if (x < 0 || y < 0 || x >= cols || y >= rows) { clear = false; break; }
                const k = y * cols + x;
                if (blocked[k] || n > 0 && goal[k]) { clear = false; break; }
                if (n === minRun) continue;
                if (used[axis][k] && separate || used[1 - axis][k] && avoidCrossing && !goal[k] || ownSide[axis]![k] && !goal[k] && !before) { clear = false; break; }
                const side = axis === 0 ? cols : 1;
                for (let d = 1; d <= ALONGSIDE_CELLS; d++) {
                  if (k - d * side >= 0 && used[axis][k - d * side] || k + d * side < N && used[axis][k + d * side]) {
                    if (separate && d * CELL < APART) clear = false;
                    break;
                  }
                }
              }
              if (clear) possible = true;
            }
          }
        }
        if (!possible) return { found: -1, back: back2, span: span2, seeded };
      }
      const bars = 4 | (separate ? 1 : 0) | (avoidCrossing ? 2 : 0);
      let found2 = -1;
      let explored = 0;
      while (heap.size) {
        if (!made && ++explored === 4096) return search(pin, requireRun, separate, minRun, avoidCrossing, true, preserveBack);
        const queued = heap.minKey;
        const s = heap.pop();
        const base = span2 === 1 ? s : (s / 9) | 0;
        const run = s - span2 * base;
        const k = base >> 2;
        const dir = base & 3;
        const i = k % cols;
        const j = (k - i) / cols;
        // A state leaves the heap only after it was put there by this search, so its best cost is its own.
        const g = best[s]!;
        if (span2 > 1 && (rects.wordSizes?.size || (before && rects.fitRoom !== undefined))) {
          let beaten = false;
          for (let r2 = run + 1, at = s + 1; r2 < 9 && !beaten; r2++, at++) if (seen[at] === epoch && best[at]! <= g) beaten = true;
          if (beaten) continue;
        }
        if (queued > g + (made ? made.distances[k]! : h(i, j))) continue;
        if (goal[k]) {
          found2 = s;
          break;
        }
        for (let nd = 0; nd < 4; nd++) {
          if (nd === (dir + 2) % 4) continue;
          if (span2 > 1 && nd !== dir && run < 2) continue;
          const ni = i + DX[nd]!;
          const nj = j + DY[nd]!;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const nk = nj * cols + ni;
          if (blocked[nk]) continue;
          const axis = nd & 1;
          const nextRun = span2 > 1 ? nd === dir ? Math.min(8, run + 1) : 1 : 0;
          const entering = goal[nk];
          if (entering) {
            if (span2 > 1 && nextRun < minRun) continue;
            if (!allowedEnd(nd, ni, nj)) continue;
          }
          if (costed[nk] !== costEpoch) costCell(nk);
          if (barred[axis]![nk]! & bars) continue;
          let cost = nd === dir ? straight[axis]![nk]! : turning[axis]![nk]!;
          if (entering) {
            cost += offMiddle(to, ni, nj, axis === 1);
            if (leaning && dx > dy !== (axis === 0)) cost += 20;
          }
          cost += alongside[axis]![nk]!;
          const left = made ? made.settled[nk] ? made.distances[nk]! : distanceOf(made, nk) : h(ni, nj);
          if (left === Infinity) continue;
          const ns = (nk * 4 + nd) * span2 + nextRun;
          const reached = g + cost;
          if (span2 > 1 && (rects.wordSizes?.size || (before && rects.fitRoom !== undefined))) {
            let beaten = false;
            for (let r2 = nextRun + 1, at = ns + 1; r2 < 9 && !beaten; r2++, at++) if (seen[at] === epoch && best[at]! <= reached) beaten = true;
            if (beaten) continue;
          }
          if (reached < (seen[ns] === epoch ? best[ns]! : Infinity)) {
            seen[ns] = epoch;
            best[ns] = reached;
            back2[ns] = s;
            heap.push(ns, reached + left);
          }
        }
      }
      return { found: found2, back: back2, span: span2, seeded };
    };
    let asked: any = pins?.get(link.id) ?? {};
    if (hasAlignedCrossArea) {
      const cross = drawnLinks.find(alignedAcrossAreas);
      const sourceArea = cross && rects.areas.find(area => !area.node.nested && area.ids.has(cross.from));
      if (sourceArea && sourceArea.ids.has(link.from) && sourceArea.ids.has(link.to) && Math.abs(from.x - to.x) < CELL && from.y > to.y) {
        const side: Side = endRect(cross!.to).x > endRect(cross!.from).x ? 'left' : 'right';
        asked = { start: { side, at: from.y + from.h / 2 }, end: { side: 'top', at: to.x + to.w / 2 } };
      }
    }
    let found = -1, back: any, span = 1, seeded = 0;
    const occupied = new Set<string>();
    if (before) for (const restLink of rects.restLinks ?? []) {
      const pts = before.routes.get(restLink.id);
      if (restLink.from === link.to) occupied.add(sideOn(to, pts[0]));
      if (restLink.to === link.to) occupied.add(sideOn(to, pts[pts.length - 1]));
    }
    const alternatives = before && asked.end ? ["top", "right", "bottom", "left"].filter((side) => side !== asked.end.side && !occupied.has(side)).map((side) => [{ ...asked, end: { side, at: side === "top" || side === "bottom" ? to.x + to.w / 2 : to.y + to.h / 2 } }, ["end"]]) : [];
    const sourceEnds = [];
    if (before) for (const restLink of rects.restLinks ?? []) {
      const pts = before.routes.get(restLink.id);
      if (restLink.from === link.from) sourceEnds.push(pts[0]);
      if (restLink.to === link.from) sourceEnds.push(pts[pts.length - 1]);
    }
    const closeStart = placed(asked.start) && sourceEnds.some((pt2) => sideOn(from, pt2) === asked.start.side && Math.abs(alongOf(from, pt2) - asked.start.at) < APART);
    const occupiedStart = new Set<string>(sourceEnds.map((pt2) => sideOn(from, pt2)));
    const startAlternatives = closeStart ? ["bottom", "top", "right", "left"].filter((side) => side !== asked.start.side && !occupiedStart.has(side)).map((side) => [{ ...asked, start: { side, at: side === "top" || side === "bottom" ? from.x + from.w / 2 : from.y + from.h / 2 } }, ["start"]]) : [];
    const attempts = [...startAlternatives, [asked, []], ...alternatives, ...asked.start || asked.end ? [[{ end: asked.end }, ["start"]], [{ start: asked.start }, ["end"]], [{}, ["start", "end"]]] : []];
    for (let walls = 0; walls < (rects.under?.length ? 2 : 1) && found < 0; walls++) {
      if (walls) { blocked.set(withoutWordWalls); estimates.clear(); }
      // When words are routed and the first search that avoids crossing fails, a walk asks whether any way to the end
      // crosses no line. When none does, every other search that avoids crossing fails too, so none of them is run.
      // Then, unless these are the last walls and room, a second walk asks whether any way reaches the end at all. When
      // none does, no search does, so none is run and the next walls or room are tried. The last are always searched,
      // because a line with no route is reported with the ways out of its start that its last search found open.
      let crossingFree: boolean | null = null, closed = false;
      const last = walls === (rects.under?.length ? 2 : 1) - 1 && !(before && room !== ROUTE_ROOM - CELL);
      for (const avoidCrossing of [true, false]) {
        for (const separate of finalPass ? [true, false] : [false]) {
          for (const requireRun of [true, false]) {
            for (const [pin, letGo] of attempts) {
              if (avoidCrossing ? crossingFree === false : closed) break;
              ({ found, back, span, seeded } = search(pin, requireRun, separate, 8, avoidCrossing));
              if (found >= 0) {
                if (finalPass && !before && requireRun) {
                  const quality = (result: any) => {
                    const dirs = [];
                    for (let at = result.found; at >= 0; at = result.back[at]) dirs.push(Math.floor(at / result.span) & 3);
                    dirs.reverse();
                    const runs: any[] = [];
                    for (const dir of dirs) {
                      if (!runs.length || runs[runs.length - 1].dir !== dir) runs.push({ dir, len: 1 });
                      else runs[runs.length - 1].len++;
                    }
                    const n = runs.length;
                    const lastThree = n >= 3 ? runs.slice(-3) : [];
                    const bad = lastThree.length && ((lastThree[0].dir + 2) % 4 === lastThree[2].dir || lastThree[1].len * CELL < 30) ? 1 : 0;
                    return { bad, bends: n - 1 };
                  };
                  const original = { found, back, span, seeded };
                  const q = quality(original);
                  if (q.bad || q.bends >= 2) {
                    const shorter = search(pin, requireRun, separate, 3, avoidCrossing, false, true);
                    if (shorter.found >= 0) {
                      const next = quality(shorter);
                      if (next.bad <= q.bad && next.bends + 1 < q.bends) ({ found, back, span, seeded } = shorter);
                    }
                  }
                }
                if (letGo.length) loose.push({ link: link.id, letGo });
                break;
              }
              if (avoidCrossing && crossingFree === null && rects.wordSizes?.size) {
                crossingFree = reaches(blocked, true);
                closed = !crossingFree && !last && !reaches(blocked, false);
              }
            }
            if (found >= 0) break;
          }
          if (found >= 0) break;
        }
        if (found >= 0) break;
      }
    }
    if (found < 0 && before && room !== ROUTE_ROOM - CELL) continue;
    if (found < 0) {
      const box = (r: Rect) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}\xD7${Math.round(r.h)}`;
      const error = Object.assign(new Error(`no route was found for the line ${link.id}, from ${box(from)} to ${box(to)}; ${seeded} ways out of its start were open`), {linkId: link.id});
      throw error;
    }
    const cellsBack: any[] = [];
    for (let s = found; s >= 0; s = back[s]) cellsBack.push(Math.floor(s / span) >> 2);
    const cells = cellsBack.reverse().slice(0, -1);
    if (!cells.length) {
      const error = Object.assign(new Error("No route was found."), {linkId: link.id});
      throw error;
    }
    const pt = (k: number) => centre(k % cols, Math.floor(k / cols));
    const points: any[] = [pt(cells[0]!)];
    for (let n = 1; n < cells.length - 1; n++) {
      const a = cells[n - 1];
      const b = cells[n];
      const c = cells[n + 1];
      if (b - a !== c - b) points.push(pt(b));
    }
    if (cells.length > 1) points.push(pt(cells[cells.length - 1]));
    const first = points[0];
    const startPoint = first.y < from.y ? { x: first.x, y: from.y } : first.y > from.y + from.h ? { x: first.x, y: from.y + from.h } : first.x < from.x ? { x: from.x, y: first.y } : { x: from.x + from.w, y: first.y };
    const last = points[points.length - 1];
    const arrive = Math.floor(found / span) & 3;
    const endPoint = arrive === 0 ? { x: to.x, y: last.y } : arrive === 2 ? { x: to.x + to.w, y: last.y } : arrive === 1 ? { x: last.x, y: to.y } : { x: last.x, y: to.y + to.h };
    // Prefer a clear two-bend route between neighbouring derived tiers.
    const tier = rects.areas.find(area => area.node.area.derivedTiers && area.ids.has(link.from) && area.ids.has(link.to));
    let shortRoute: { points: Point[]; cells: [number, number][] } | null = null;
    if (finalPass && !before && tier && to.y > from.y + from.h && to.y - from.y - from.h <= UNITS.tierGap + 1) {
      const sx = asked.start?.side === 'bottom' && asked.start.at !== undefined ? asked.start.at : from.x + from.w / 2;
      const targetX = asked.end?.side === 'top' && asked.end.at !== undefined ? asked.end.at : to.x + to.w / 2;
      const ex = Math.abs(sx - targetX) <= CELL ? sx : targetX;
      const [sc, sr] = cellOf(sx, from.y + from.h);
      const [ec, er] = cellOf(ex, to.y);
      for (let row = sr + 3; row <= er - 3 && !shortRoute; row++) {
        const sample: [number, number][] = [];
        for (let j = sr + 1; j <= row; j++) sample.push([j * cols + sc, 1]);
        for (let i = Math.min(sc, ec); i <= Math.max(sc, ec); i++) sample.push([row * cols + i, 0]);
        for (let j = row; j < er; j++) sample.push([j * cols + ec, 1]);
        const clear = sample.every(([k, axis]) => k >= 0 && k < N && (!blocked[k] || goal[k] || start[k]) && !used[0][k] && !used[1][k] && !onBand[axis]![k] && !(axis === 0 && nearHorizontal[k]) && !(axis === 1 && (used[1][k - 1] || used[1][k + 1])) && !(axis === 0 && (used[0][k - cols] || used[0][k + cols])));
        if (clear) {
          const y = centre(0, row).y;
          shortRoute = { points: [{ x: sx, y: from.y + from.h }, { x: sx, y }, { x: ex, y }, { x: ex, y: to.y }], cells: sample };
        }
      }
    }
    if (shortRoute) {
      for (const [k, axis] of shortRoute.cells) used[axis][k] = 1;
      keepRoute(link, simplify(shortRoute.points));
      break;
    }
    // A near-aligned pair can use a single straight track when the intervening cells are clear.
    // Check other routes, obstacles and band edges before replacing a detour.
    let straightCells: number[] | null = null;
    if (Math.abs(startPoint.x - endPoint.x) <= CELL && arrive % 2 === 1 &&
        startPoint.x >= to.x && startPoint.x <= to.x + to.w && first.x === startPoint.x) {
      const [col, startRow] = cellOf(startPoint.x, startPoint.y);
      const [, endRow] = cellOf(startPoint.x, endPoint.y);
      const candidate: number[] = [];
      let clear = true;
      for (let row = Math.min(startRow, endRow) + 1; row < Math.max(startRow, endRow); row++) {
        const k = row * cols + col;
        if (row < 0 || row >= rows || col < 0 || col >= cols ||
            blocked[k] && !goal[k] && !start[k] || used[0][k] || used[1][k] ||
            col > 0 && used[1][k - 1] || col + 1 < cols && used[1][k + 1] || onBand[1][k]) {
          clear = false;
          break;
        }
        candidate.push(k);
      }
      if (clear && candidate.length) straightCells = candidate;
    }
    if (straightCells) {
      for (const k of straightCells) used[1][k] = 1;
      keepRoute(link, [startPoint, { x: startPoint.x, y: endPoint.y }]);
    } else {
      for (let n = 1; n < cells.length; n++) {
        const axis = Math.abs(cells[n] - cells[n - 1]) === 1 ? 0 : 1;
        used[axis][cells[n]] = 1;
        used[axis][cells[n - 1]] = 1;
      }
      keepRoute(link, simplify([startPoint, ...points, endPoint]));
    }
    break;
    }
    if (steps && steps.length === position && (firstWords.has(link.id) || wordPriority.has(link.id))) {
      steps.push({ id: link.id, used: [used[0].slice(), used[1].slice()], routes: [...routes], pills: [...pills], crowded: [...crowded], loose: [...loose] });
    }
  }
  return { routes, used, loose, pills, crowded };
}
function pinsOf(links: any, routes: any, endRect: any, kept: any = null) {
  const sides = /* @__PURE__ */ new Map();
  const add = (id: any, p: any, entry: any) => {
    const r = endRect(id);
    const side = sideOn(r, p);
    const key = `${id}|${side}`;
    if (!sides.has(key)) sides.set(key, { r, side, ends: [] });
    sides.get(key).ends.push({ ...entry, at: alongOf(r, p) });
  };
  const addAll = (list: any, routesOf: any, keep: any) => {
    for (const link of list) {
      const points = routesOf.get(link.id);
      add(link.from, points[0], { link: link.id, end: "start", keep });
      add(link.to, points[points.length - 1], { link: link.id, end: "end", keep });
    }
  };
  const pins = /* @__PURE__ */ new Map();
  const straight = links.filter((link: any) => routes.get(link.id).length === 2);
  addAll(straight, routes, true);
  for (const link of straight) {
    const [a, b] = routes.get(link.id);
    pins.set(link.id, { start: { side: sideOn(endRect(link.from), a), at: alongOf(endRect(link.from), a) }, end: { side: sideOn(endRect(link.to), b), at: alongOf(endRect(link.to), b) } });
  }
  addAll(links.filter((link: any) => !straight.includes(link)), routes, false);
  if (kept) addAll(kept.links, kept.routes, true);
  for (const { r, side, ends } of sides.values()) {
    const across = side === "top" || side === "bottom";
    const start = across ? r.x : r.y;
    const length = across ? r.w : r.h;
    const free = ends.map((_: any, i: any) => start + length * (i + 1) / (ends.length + 1));
    for (const e of ends.filter((e2: any) => e2.keep)) {
      let n = 0;
      for (let m = 1; m < free.length; m++) if (Math.abs(free[m] - e.at) < Math.abs(free[n] - e.at)) n = m;
      free.splice(n, 1);
    }
    ends.filter((e: any) => !e.keep).sort((a: any, b: any) => a.at - b.at).forEach((e: any, i: any) => pins.set(e.link, { ...pins.get(e.link), [e.end]: { side, at: free[i] } }));
  }
  return pins;
}
function sideOn(r: Rect, p: Point): 'top' | 'bottom' | 'left' | 'right' {
  return Math.abs(p.y - r.y) < 0.01 ? "top" : Math.abs(p.y - r.y - r.h) < 0.01 ? "bottom" : Math.abs(p.x - r.x) < 0.01 ? "left" : "right";
}
function alongOf(r: Rect, p: Point) {
  const side = sideOn(r, p);
  return side === "top" || side === "bottom" ? p.x : p.y;
}
function avoidsOf(links: any, routes: any, endRect: any, kept: any = null) {
  const straightOn = /* @__PURE__ */ new Set();
  const all = [...links.map((l: any) => [l, routes]), ...kept ? kept.links.map((l: any) => [l, kept.routes]) : []];
  for (const [link, from] of all) {
    const points = from.get(link.id);
    if (points.length !== 2) continue;
    straightOn.add(`${link.from}|${sideOn(endRect(link.from), points[0])}`);
    straightOn.add(`${link.to}|${sideOn(endRect(link.to), points[1])}`);
  }
  const avoids = /* @__PURE__ */ new Map();
  for (const link of links) {
    const points = routes.get(link.id);
    if (points.length === 2) {
      avoids.set(link.id, { start: { side: sideOn(endRect(link.from), points[0]), at: alongOf(endRect(link.from), points[0]) }, end: { side: sideOn(endRect(link.to), points[1]), at: alongOf(endRect(link.to), points[1]) } });
      continue;
    }
    const startSide = sideOn(endRect(link.from), points[0]);
    const endSide = sideOn(endRect(link.to), points[points.length - 1]);
    const pin: any = {};
    if (straightOn.has(`${link.from}|${startSide}`)) pin.start = { avoid: [startSide, awayFrom(endRect(link.from), endRect(link.to))] };
    if (straightOn.has(`${link.to}|${endSide}`)) pin.end = { avoid: [endSide, awayFrom(endRect(link.to), endRect(link.from))] };
    if (pin.start || pin.end) avoids.set(link.id, pin);
  }
  return avoids;
}
function awayFrom(r: Rect, o: Rect): 'top' | 'bottom' | 'left' | 'right' {
  const dx = o.x + o.w / 2 - r.x - r.w / 2;
  const dy = o.y + o.h / 2 - r.y - r.h / 2;
  return Math.abs(dx) / r.w > Math.abs(dy) / r.h ? dx > 0 ? "left" : "right" : dy > 0 ? "top" : "bottom";
}
function simplify(points: Point[]) {
  if (!points.length) return [];
  const out = [points[0]!];
  for (let n = 1; n < points.length; n++) {
    const p = points[n]!;
    const q = out[out.length - 1]!;
    if (Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01) continue;
    if (out.length >= 2) {
      const o = out[out.length - 2]!;
      const straight = Math.abs(o.x - q.x) < 0.01 && Math.abs(q.x - p.x) < 0.01 || Math.abs(o.y - q.y) < 0.01 && Math.abs(q.y - p.y) < 0.01;
      if (straight) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}
function bandRect(t2: Pick<AreaNode, 'x' | 'y' | 'w' | 'h'>, width: number) {
  const b = BAND_BLEED;
  const right = t2.x + t2.w;
  return { x: t2.x - b, y: t2.y - b, w: right - t2.x + 2 * b, h: t2.h + 2 * b };
}
type Loose = { link: string; letGo: string[] }[];
// ROUTES WORKED OUT AWAY FROM THE PAGE (round 231). One press on the steps level of a large pipeline held the page for
// over eleven seconds of route searches. Now the page sends each routeAll call to a worker and waits for its answer, so
// it answers presses while the lines are worked out. A call carries what routeAll reads and nothing else: each line's
// two end rectangles, each area with the fields of its node that routing reads, and the drawing's width and height.
// A result a later call starts from is kept in the worker, and the later call names it by the first call's id.
type RouteCall = {
  id: number; keep: boolean; links: DrawnLink[]; ends: Map<string, Rect>; rects: RouteRects; layout: RouteLayout; bands: Rect[];
  before: number | null; pins: Map<string, unknown> | null; finalPass: boolean;
};
type RoutesKept = ReturnType<typeof routeAll>;
// The page asks its worker for helpers that start from a kept answer, and the worker gives each helper its port and that
// answer, to keep under the same id.
type LanesCall = { id: number; lanes: number; from: number };
type LaneGiven = { port: MessagePort; from: number; kept: RoutesKept };
type RouteReply = { id: number; routes: Map<string, Point[]>; loose: Loose; pills: Map<string, Rect>; crowded: string[] } | { id: number; ports: MessagePort[] } | { id: number; failed: string; linkId: string | null };
type RouteScope = { onmessage: ((event: MessageEvent<RouteCall | LanesCall | LaneGiven>) => void) | null; postMessage: (reply: RouteReply, transfer: Transferable[]) => void };
type RoutesFound = { routes: Map<string, Point[]>; loose: Loose; pills: Map<string, Rect>; crowded: string[]; kept: number | null };
// The selections still to work out decide how many routing workers work on them, the drawing's own worker one of them,
// but never more than six, nor more than the processors less two, so that two are left for the page and the browser.
const LANES_AT_MOST = 6;
// The worker's side: routing-worker.ts calls it once. A route that cannot be found is answered with the line's id, so
// the page can leave that line out and plan again, as it did when it routed on the page. A helper is this file started
// again from the worker's own address; it answers on the port it is given. A helper that stops is an error here, which
// reaches the page as this worker's own error does.
function answerRouteCalls(scope: RouteScope, kept = new Map<number, RoutesKept>()) {
  let helpers: Worker[] = [];
  scope.onmessage = ({ data: call }) => {
    if ("port" in call) {
      answerRouteCalls(call.port, new Map([[call.from, call.kept]]));
      return;
    }
    let reply: RouteReply;
    const ports: MessagePort[] = [];
    try {
      if ("lanes" in call) {
        for (const helper of helpers) helper.terminate();
        helpers = [];
        const from = kept.get(call.from);
        if (from === undefined) throw new Error(`the routing worker was asked for helpers that start from call ${call.from}, which it did not keep`);
        const processors = navigator.hardwareConcurrency;
        if (!Number.isInteger(processors) || processors < 1) throw new Error(`the routing worker could not tell how many processors there are: it read ${String(processors)}`);
        while (ports.length + 1 < Math.min(call.lanes, LANES_AT_MOST, processors - 2)) {
          const helper = new Worker(self.location.href, { type: "module" });
          helper.onerror = (event) => {
            throw new Error(`a routing helper stopped: ${event.message || "it gave no reason"}`);
          };
          const channel = new MessageChannel();
          const given: LaneGiven = { port: channel.port1, from: call.from, kept: from };
          helper.postMessage(given, [channel.port1]);
          helpers.push(helper);
          ports.push(channel.port2);
        }
        reply = { id: call.id, ports };
      } else {
        const endRect = (id: string): Rect => {
          const rect = call.ends.get(id);
          if (!rect) throw new Error(`the record ${id} is drawn nowhere`);
          return rect;
        };
        const before = call.before === null ? null : kept.get(call.before);
        if (before === undefined) throw new Error(`the routing worker was asked to start from call ${call.before}, which it did not keep`);
        const canRepair = call.finalPass && !!call.rects.wordSizes && !before;
        let result: RoutesKept;
        if (!canRepair) {
          const initialRects = before && call.rects.fitRoom !== undefined ? { ...call.rects, fitRoom: undefined, clearedRest: undefined } : call.rects;
          result = before && call.rects.initialSelection ? { ...call.rects.initialSelection, used: before.used, pills: new Map(), crowded: [] } : routeAll(call.links, endRect, initialRects, call.layout, call.bands, before, call.pins, call.finalPass);
        } else {
          const priority = new Set<string>(call.rects.wordPriority ?? []);
          let initial: RoutesKept | undefined;
          let failure: unknown;
          // Each attempt after a failure gives one more line priority, so it may start where the one before stood.
          const steps: Routed[] = [];
          const attemptWalls: AttemptWalls = { grids: new Map(), bytes: 0 };
          for (let attempt = 0; attempt < 8; attempt++) {
            try {
              const next = routeAll(call.links, endRect, call.rects, call.layout, call.bands, before, call.pins, call.finalPass, priority, new Map(), new Map(), new Set(call.rects.wordFirst ?? []), steps, attemptWalls);
              if (!initial || next.crowded.length < initial.crowded.length) initial = next;
              break;
            } catch (error) {
              failure = error;
              const linkId = (error as { linkId?: unknown } | null)?.linkId;
              if (typeof linkId !== "string") throw error;
              if (priority.has(linkId)) break;
              priority.add(linkId);
            }
          }
          if (!initial) throw failure;
          result = initial;
          const hard = [...call.rects.cards.values(), ...call.rects.words];
          const arrange = (routes: Map<string, Point[]>, first: ReadonlySet<string> = new Set()) => {
            const pills = new Map<string, Rect>(), crowded: string[] = [];
            const order = [...call.links].sort((a, b) => Number(first.has(b.id)) - Number(first.has(a.id)));
            for (const link of order) {
              const size = call.rects.wordSizes!.get(link.id);
              if (!size) continue;
              const others = [...routes].filter(([id]) => id !== link.id).map(([, points]) => points);
              const placed = placePill(routes.get(link.id)!, size, hard, [...pills.values()], others);
              pills.set(link.id, placed.rect);
              if (!placed.clear) crowded.push(link.id);
            }
            return { pills, crowded };
          };
          const bestWords = (routes: Map<string, Point[]>) => {
            const first = arrange(routes);
            if (!first.crowded.length) return first;
            const retry = arrange(routes, new Set(first.crowded));
            return retry.crowded.length < first.crowded.length ? retry : first;
          };
          const countCrossings = (line: Point[], others: Iterable<Point[]>) => {
            let count = 0;
            const inside = (p: number, a: number, b: number) => p > Math.min(a, b) + 0.5 && p < Math.max(a, b) - 0.5;
            for (const other of others) for (let a = 1; a < line.length; a++) for (let b = 1; b < other.length; b++) {
              const p = line[a-1]!, q = line[a]!, r = other[b-1]!, t = other[b]!;
              const ph = Math.abs(p.y-q.y) < 0.01, rh = Math.abs(r.y-t.y) < 0.01;
              if (ph === rh) continue;
              const [h0,h1,v0,v1] = ph ? [p,q,r,t] : [r,t,p,q];
              if (inside(v0.x,h0.x,h1.x) && inside(h0.y,v0.y,v1.y)) count++;
            }
            return count;
          };
          const horizontalBounds = (paths: Map<string, Point[]>, pills: Map<string, Rect>) => {
            const points = [...paths.values()].flat();
            return {
              left: Math.min(0, ...points.map((point) => point.x), ...[...pills.values()].map((rect) => rect.x)),
              right: Math.max(call.layout.W, ...points.map((point) => point.x), ...[...pills.values()].map((rect) => rect.x + rect.w)),
            };
          };
          let words = bestWords(result.routes);
          let shown = horizontalBounds(result.routes, words.pills);
          // Each line's crossings with all the others, counted once for each pair of lines, since a pair crosses as
          // often either way round, and brought up to date when a repair is kept.
          const crossingsOf = new Map<string, number>();
          const lines = [...(result.routes as Map<string, Point[]>)];
          for (const [id] of lines) crossingsOf.set(id, 0);
          for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
            const count = countCrossings(lines[a]![1], [lines[b]![1]]);
            crossingsOf.set(lines[a]![0], crossingsOf.get(lines[a]![0])! + count);
            crossingsOf.set(lines[b]![0], crossingsOf.get(lines[b]![0])! + count);
          }
          const tried = new Set<string>();
          for (let attempt = 0; attempt < 12; attempt++) {
            const candidates = call.links.filter((link) => !tried.has(link.id)).map((link) => ({ id: link.id, crossings: crossingsOf.get(link.id)! })).sort((a, b) => Number(words.crowded.includes(b.id)) - Number(words.crowded.includes(a.id)) || Number((words.pills.get(b.id)?.x ?? 0) < -20) - Number((words.pills.get(a.id)?.x ?? 0) < -20) || b.crossings - a.crossings);
            if (!candidates.length || (!words.crowded.includes(candidates[0]!.id) && (words.pills.get(candidates[0]!.id)?.x ?? 0) >= -20 && !candidates[0]!.crossings)) break;
            const id = candidates[0]!.id;
            tried.add(id);
            const link = call.links.find((x) => x.id === id)!;
            const fixed = new Map<string, Point[]>([...(result.routes as Map<string, Point[]>)].filter(([key]) => key !== id));
            const fixedPills = new Map([...words.pills].filter(([key]) => key !== id && !words.crowded.includes(key)));
            const cols = Math.ceil((call.layout.W + 2 * ROUTE_ROOM) / CELL);
            const rows = Math.ceil((call.layout.H + 2 * ROUTE_ROOM) / CELL);
            const used = [new Uint8Array(cols * rows), new Uint8Array(cols * rows)];
            const cell = (x: number) => Math.floor((x + ROUTE_ROOM) / CELL);
            for (const points of fixed.values()) for (let n = 1; n < points.length; n++) {
              const a = points[n-1]!, b = points[n]!;
              const axis = Math.abs(a.y-b.y) < 0.01 ? 0 : 1;
              const i0 = Math.max(0, Math.min(cell(a.x), cell(b.x))), i1 = Math.min(cols-1, Math.max(cell(a.x), cell(b.x)));
              const j0 = Math.max(0, Math.min(cell(a.y), cell(b.y))), j1 = Math.min(rows-1, Math.max(cell(a.y), cell(b.y)));
              for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) used[axis]![j*cols+i] = 1;
            }
            const kept = { routes: fixed, used, loose: [], pills: fixedPills, crowded: [] };
            const retryRects = { ...call.rects, restLinks: call.links.filter((x) => x.id !== id), under: [...fixedPills.values()] };
            try {
              const retry = routeAll([link], endRect, retryRects, call.layout, call.bands, kept, call.pins, true, new Set(), fixed, fixedPills);
              const points = retry.routes.get(id)!;
              if (retry.crowded.length) continue;
              const old: Point[] = result.routes.get(id)!;
              const oldCrossings = candidates[0]!.crossings;
              const newCrossings = countCrossings(points, fixed.values());
              // The test below refuses, whatever words it would give, a retry that adds crossings, a retry with a point
              // past the drawing's sides, and a retry that routes the line as it was, whose words are the same. Such a
              // retry is refused before its words are placed.
              if (newCrossings > oldCrossings || points.some((point: Point) => point.x < shown.left || point.x > shown.right)) continue;
              if (points.length === old.length && points.every((point: Point, n: number) => point.x === old[n]!.x && point.y === old[n]!.y)) continue;
              const routes = new Map<string, Point[]>(result.routes); routes.set(id, points);
              const next = bestWords(routes);
              const previousBounds = shown;
              const nextBounds = horizontalBounds(routes, next.pills);
              const spanImproved = nextBounds.right - nextBounds.left < previousBounds.right - previousBounds.left;
              // A local word repair must not buy fewer crowded words by widening its drawing or adding crossings.
              if (newCrossings > oldCrossings || nextBounds.left < previousBounds.left || nextBounds.right > previousBounds.right || next.crowded.length > words.crowded.length || (next.crowded.length === words.crowded.length && newCrossings === oldCrossings && !spanImproved)) continue;
              for (const [key, other] of fixed) crossingsOf.set(key, crossingsOf.get(key)! - countCrossings(old, [other]) + countCrossings(points, [other]));
              crossingsOf.set(id, newCrossings);
              result = { ...result, routes, used: retry.used, loose: [...result.loose.filter((x: any) => x.link !== id), ...retry.loose] };
              words = next;
              shown = nextBounds;
            } catch { /* A local retry may have no available route; keep the complete original. */ }
          }
          // Prefer a clear placement nearer the drawing when a pill would otherwise extend far to its left.
          for (const [id, pill] of words.pills) {
            if (pill.x >= -20) continue;
            const size = call.rects.wordSizes!.get(id)!;
            const otherPills = [...words.pills].filter(([key]) => key !== id).map(([, rect]) => rect);
            const otherLines = [...result.routes].filter(([key]) => key !== id).map(([, points]) => points) as Point[][];
            const alternative = placePill(result.routes.get(id)!, size, hard, otherPills, otherLines, -20);
            if (alternative.clear && alternative.rect.x > pill.x) {
              words.pills.set(id, alternative.rect);
              words.crowded = words.crowded.filter((linkId) => linkId !== id);
            }
          }
          // Keep words within the routed drawing when another clear place exists.
          const rightLimit = Math.max(call.layout.W, ...[...result.routes.values()].flat().map((p: Point) => p.x));
          for (const [id, pill] of words.pills) {
            if (pill.x + pill.w <= rightLimit) continue;
            const size = call.rects.wordSizes!.get(id)!;
            const otherPills = [...words.pills].filter(([key]) => key !== id).map(([, rect]) => rect);
            const otherLines = [...result.routes].filter(([key]) => key !== id).map(([, points]) => points) as Point[][];
            const alternative = placePill(result.routes.get(id)!, size, hard, otherPills, otherLines, Math.min(-20, pill.x), rightLimit);
            if (alternative.clear && alternative.rect.x + alternative.rect.w < pill.x + pill.w) {
              words.pills.set(id, alternative.rect);
              words.crowded = words.crowded.filter((linkId) => linkId !== id);
            }
          }
          result = { ...result, pills: words.pills, crowded: words.crowded };
        }
        if (before && call.finalPass && call.rects.fitRoom !== undefined) {
          const overflow = (routes: Map<string, Point[]>) => [...routes.values()].flat().reduce((largest, p) => Math.max(largest, -call.rects.fitRoom! - p.x, p.x - call.layout.W - call.rects.fitRoom!), 0);
          const first = new Set([...result.routes].filter(([, points]) => points.some((p: Point) => p.x < -call.rects.fitRoom! || p.x > call.layout.W + call.rects.fitRoom!)).map(([id]) => id as string));
          if (first.size) {
            const span = (routes: Map<string, Point[]>) => {
              const points = [...routes.values()].flat();
              return Math.max(call.layout.W, ...points.map((p) => p.x)) - Math.min(0, ...points.map((p) => p.x));
            };
            const crossingCount = (routes: Map<string, Point[]>) => {
              const selected = [...routes.values()];
              const resting = [...(call.rects.clearedRest ?? new Map<string, Point[]>()).values()];
              const crosses = (a: Point, b: Point, c: Point, d: Point) => {
                const ah = Math.abs(a.y - b.y) < 0.01, ch = Math.abs(c.y - d.y) < 0.01;
                if (ah === ch) return false;
                const [h1, h2, v1, v2] = ah ? [a, b, c, d] : [c, d, a, b];
                const inside = (p: number, x: number, y: number) => p > Math.min(x, y) + 0.5 && p < Math.max(x, y) - 0.5;
                return inside(v1!.x, h1!.x, h2!.x) && inside(h1!.y, v1!.y, v2!.y);
              };
              const between = (a: Point[], b: Point[]) => {
                let count = 0;
                for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) if (crosses(a[i - 1]!, a[i]!, b[j - 1]!, b[j]!)) count++;
                return count;
              };
              let total = 0;
              for (let i = 0; i < selected.length; i++) {
                for (const rest of resting) total += between(selected[i]!, rest);
                for (let j = i + 1; j < selected.length; j++) total += between(selected[i]!, selected[j]!);
              }
              return total;
            };
            // Try the whole offending group first, then bounded individual repairs. A group can
            // fail even though one of its lines has a safe alternative around the fixed lines.
            const groups = first.size > 1 ? [first, ...[...first].slice(0, 5).map((id) => new Set([id]))] : [first];
            for (const preferred of groups) try {
              const preserved = [...(result.routes as Map<string, Point[]>)].filter(([id]) => !preferred.has(id));
              const obstacles = new Map<string, Point[]>([...(call.rects.clearedRest ?? new Map<string, Point[]>()), ...preserved]);
              const alternateRects = { ...call.rects, clearedRest: obstacles };
              const rerouted = routeAll(call.links.filter((link) => preferred.has(link.id)), endRect, alternateRects, call.layout, call.bands, before, call.pins, call.finalPass, preferred);
              const alternate = { ...result, routes: new Map<string, Point[]>([...preserved, ...rerouted.routes]), loose: [...result.loose.filter((item) => !preferred.has(item.link)), ...rerouted.loose] };
              if ((span(alternate.routes) < span(result.routes) || span(alternate.routes) === span(result.routes) && overflow(alternate.routes) < overflow(result.routes)) && crossingCount(alternate.routes) <= crossingCount(result.routes)) result = alternate;
            } catch { /* Keep the first complete set when an alternate cannot route every line. */ }
          }
        }
        if (call.keep) kept.set(call.id, result);
        reply = { id: call.id, routes: result.routes, loose: result.loose, pills: result.pills, crowded: result.crowded };
      }
    } catch (error) {
      const linkId = (error as { linkId?: unknown } | null)?.linkId;
      reply = { id: call.id, failed: error instanceof Error ? error.message : String(error), linkId: typeof linkId === "string" ? linkId : null };
    }
    scope.postMessage(reply, "ports" in reply ? reply.ports : []);
  };
}
// The page's side: one for each plan, ended when the plan is made or has failed, or at once when `signal` says the
// drawing was replaced. Ending it ends the worker, with the arrays and the kept results in it, and its helpers, and
// every call still waiting fails with the reason. An answer to a call nobody waits for any more is dropped. A helper's
// port is answered in the same way, and is ended with the worker that started the helper.
class RoutesAway {
  worker: Worker | MessagePort
  helpers: RoutesAway[] = []
  next = 0
  waiting = new Map<number, { resolve: (reply: any) => void; reject: (error: Error) => void }>()
  ended: Error | null = null
  signal: AbortSignal | undefined
  replaced = () => this.end(new Error("the drawing was replaced before it was drawn"))
  constructor(worker: Worker | MessagePort, signal?: AbortSignal) {
    this.worker = worker;
    this.signal = signal;
    worker.onmessage = ({ data }: MessageEvent<RouteReply>) => {
      const waiting = this.waiting.get(data.id);
      if (!waiting) return;
      this.waiting.delete(data.id);
      if ("failed" in data) waiting.reject(Object.assign(new Error(data.failed), data.linkId === null ? {} : { linkId: data.linkId }));
      else waiting.resolve(data);
    };
    if ("terminate" in worker) worker.onerror = (event) => this.end(new Error(`the lines could not be worked out, because the routing worker stopped: ${event.message || "it gave no reason"}`));
    worker.onmessageerror = () => this.end(new Error("the lines could not be worked out, because the routing worker sent an answer that could not be read"));
    if (signal?.aborted) this.replaced();
    else signal?.addEventListener("abort", this.replaced, { once: true });
  }
  // routeAll's arguments, answered by the worker. `before` is an earlier answer that was kept.
  route(drawnLinks: DrawnLink[], endRect: (id: string) => Rect, rects: RouteRects, layout: RouteLayout, bands: Rect[], before: RoutesFound | null = null, pins: Map<string, unknown> | null = null, finalPass = false, keep = false): Promise<RoutesFound> {
    if (this.ended) return Promise.reject(this.ended);
    if (before !== null && before.kept === null) return Promise.reject(new Error("a route call starts from an answer the routing worker was not asked to keep"));
    const id = ++this.next;
    const ends = new Map<string, Rect>();
    for (const link of drawnLinks) for (const end of [link.from, link.to]) ends.set(end, endRect(end));
    const areas = rects.areas.map((a) => ({ ...a, node: { x: a.node.x, y: a.node.y, w: a.node.w, h: a.node.h, tint: a.node.tint, nested: a.node.nested, area: { derivedTiers: a.node.area.derivedTiers } } }));
    const call: RouteCall = { id, keep, links: drawnLinks, ends, rects: { cards: rects.cards, areas, words: rects.words, routeCost: rects.routeCost, under: rects.under, restLinks: rects.restLinks, wordSizes: rects.wordSizes, wordPriority: rects.wordPriority, wordFirst: rects.wordFirst, fitRoom: rects.fitRoom, clearedRest: rects.clearedRest, initialSelection: rects.initialSelection }, layout: { W: layout.W, H: layout.H }, bands, before: before?.kept ?? null, pins, finalPass };
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve: (reply) => resolve({ routes: reply.routes, loose: reply.loose, pills: reply.pills, crowded: reply.crowded, kept: keep ? id : null }), reject });
      this.worker.postMessage(call);
    });
  }
  // The same, with the answer kept in the worker for later calls to start from.
  routeAndKeep(...args: Parameters<RoutesAway["route"]>) {
    const [drawnLinks, endRect, rects, layout, bands, before, pins, finalPass] = args;
    return this.route(drawnLinks, endRect, rects, layout, bands, before, pins, finalPass, true);
  }
  // This worker and the helpers it starts for `wanted` calls, each of which starts from the kept answer `from` (round
  // 232). The worker decides how many, and starts none for one call. Asked again, it ends the helpers it had first.
  lanes(from: RoutesFound, wanted: number): Promise<RoutesAway[]> {
    if (this.ended) return Promise.reject(this.ended);
    if (from.kept === null) return Promise.reject(new Error("helpers start from an answer the routing worker was not asked to keep"));
    for (const helper of this.helpers) helper.end(new Error("the plan was made again"));
    this.helpers = [];
    const id = ++this.next;
    const call: LanesCall = { id, lanes: wanted, from: from.kept };
    return new Promise((resolve, reject) => {
      this.waiting.set(id, {
        resolve: (reply: { ports: MessagePort[] }) => {
          this.helpers = reply.ports.map((port) => new RoutesAway(port));
          resolve([this, ...this.helpers]);
        },
        reject,
      });
      this.worker.postMessage(call);
    });
  }
  end(reason = new Error("the plan was made")) {
    if (this.ended) return;
    this.ended = reason;
    this.signal?.removeEventListener("abort", this.replaced);
    for (const helper of this.helpers) helper.end(reason);
    if ("terminate" in this.worker) this.worker.terminate();
    else this.worker.close();
    for (const waiting of this.waiting.values()) waiting.reject(reason);
    this.waiting.clear();
  }
}
export type { RouteScope };
export { UNITS, COST, ROUTE_ROOM, routeAll, answerRouteCalls, RoutesAway, pinsOf, avoidsOf, bandRect };
