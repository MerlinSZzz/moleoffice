// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { placeGateMarks, placePill } from "./routing-words.ts";
import { clearFrameRuns } from "./clear-frame-runs.ts";
import { stateWord, linkWord, packageStateWord } from "@shared/words.ts";
import { t } from "@shared/i18n.ts";
import { targetAttributes } from "@shared/targets.ts";
import { currentWorkspace } from "../../../lib/workspace.ts";
import { CARD_RUNG_ATTRIBUTE, theDrawingIs } from "../../../lib/drawnat.ts";
import { gateWordsForReader } from "../../ui.tsx";
import type { DrawnLink, DrawnRecord, LaneArea, LaneArrange, LanesInput, LanesTree } from "./tree.ts";
import { UNITS, COST, ROUTE_ROOM, RoutesAway, pinsOf, avoidsOf, bandRect } from "./routing.ts";
type Facts = { no?: string | null; counts?: { kind: string; n: number }[]; name?: string; summary?: string | null; parts?: readonly { heading: string; text?: string }[]; partsWithheld?: number; detailOn?: boolean; toggleDetail?: () => void };
type LineLook = { tone: string; word: string | null; gate: string | null };
type Point = { x: number; y: number };
type Size = { w: number; h: number };
type Rect = Point & Size;
type DrawingArea = Omit<LaneArea, 'arrange' | 'items'> & {
  arrange: LaneArrange | 'pack';
  items: ({ record: string } | { area: DrawingArea })[];
  derivedTiers?: boolean;
  tierRow?: boolean;
};
type DrawingTree = Omit<LanesTree, 'areas'> & { areas: DrawingArea[] };
type Geometry = Rect & { natW: number };
type CardNode = Geometry & { kind: 'card'; id: string };
type AreaNode = Geometry & {
  kind: 'area'; area: DrawingArea; nested: boolean; framed: boolean;
  record: DrawnRecord | null; tint: string | null; items: LayoutNode[];
  colGaps: number[]; rowGaps: number[]; rowHs: number[];
  gutter: number; gutterSide: 'left' | 'right'; cell: number;
};
type LayoutNode = CardNode | AreaNode;
type Tier = { main: AreaNode; order: AreaNode[]; gaps: number[]; natW: number; y?: number; h?: number };
type Layout = { tops: AreaNode[]; tiers: Tier[]; W: number; H: number };
type AreaRect = { node: AreaNode; rect: Rect; framed: boolean; ids: Set<string>; head: string | null };
type Rectangles = { cards: Map<string, Rect>; areas: AreaRect[]; words: Rect[]; routeCost: typeof COST; under?: Rect[]; restLinks?: DrawnLink[]; wordSizes?: Map<string, Size>; wordPriority?: string[]; wordFirst?: string[]; fitRoom?: number; clearedRest?: Map<string, Point[]>; initialSelection?: { routes: Map<string, Point[]>; loose: { link: string; letGo: string[] }[] } };
type Side = 'top' | 'bottom' | 'left' | 'right';
type EndPin = { side?: Side; at?: number; avoid?: Side[] };
type Pins = { start?: EndPin; end?: EndPin };
type Routes = Map<string, Point[]>;
type RouteResult = { routes: Routes; used: [Uint8Array, Uint8Array]; loose: { link: string; letGo: string[] }[] };
export type { AreaNode, EndPin, Layout, Point, Rect, Rectangles, Side };
const CANVAS_PAD = 12;
const GATE_SIZE = { w: 28, h: 28 };
const MAX_ZOOM = 1.6;
const MIN_ZOOM = 0.1;
const READING_ZOOM = 1;
const FLOOR_PX = 9;
const SMALLEST_UNITS = 13;
const RUNGS = [3, 2, 1];
const CHOSEN = { card: [340, 308, 276, 224, 188, 160, 132, 104], frame: "page", shortStep: false, besideLast: true, rungs: null };
const WAITS_ON = () => t("g7b.card.waits_on");
const NOT_PLACED = () => t("lanes.notPlaced");
// The reason a line with no route is left out, whether it is a line at rest or one shown on a selection.
const NO_ROUTE = "No route was found.";
const SVG = "http://www.w3.org/2000/svg";
function* recordsIn(area: LaneArea): Generator<string> {
  if (area.heading?.record) yield area.heading.record;
  for (const item of area.items) {
    if ('record' in item) yield item.record;
    else yield* recordsIn(item.area);
  }
}
function checkTree(tree: LanesTree) {
  if (tree.direction !== "down") throw new Error(`the tree's direction is ${tree.direction}, and the engine draws only down`);
  if (tree.level !== "boxes" && tree.level !== "steps") throw new Error(`the tree's level is ${tree.level}`);
  const keys = /* @__PURE__ */ new Set();
  const walk = (area: LaneArea, nested: boolean) => {
    if (keys.has(area.key)) throw new Error(`two areas have the key "${area.key}"`);
    keys.add(area.key);
    if (!["row", "stack", "grid", "tiers"].includes(area.arrange)) throw new Error(`the area "${area.key}" is arranged as "${area.arrange}"`);
    if (area.arrange === "grid" && !(area.columns !== null && area.columns >= 1)) throw new Error(`the grid "${area.key}" has no columns`);
    if (nested && area.beside) throw new Error(`the area "${area.key}" is inside another and beside a third, which the engine does not draw`);
    if (area.tint != null && !/^--[a-z][a-z0-9-]*$/.test(area.tint)) throw new Error(`the area "${area.key}" names the tint "${area.tint}", which is no token's name`);
    for (const item of area.items) if ('area' in item) walk(item.area, true);
  };
  for (const area of tree.areas) walk(area, false);
  for (const area of tree.areas) {
    if (area.beside && !tree.areas.some((other) => other.key === area.beside?.of && other !== area)) {
      throw new Error(`the area "${area.key}" is beside "${area.beside.of}", which is no top-level area`);
    }
  }
}
function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string | null): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== void 0 && text !== null) node.textContent = text;
  return node;
}
// What draws one record carries its target, got as cardTarget in CardFace.tsx gets it: a right-click there is about the record, and its comments draw their circle there.
function carryTarget(node: HTMLElement, record: DrawnRecord) {
  for (const [name, value] of Object.entries(targetAttributes({ kind: "record", recordId: record.id, workspaceId: currentWorkspace() }))) node.setAttribute(name, value);
}
function badgeWords(record: DrawnRecord) {
  return record.badges;
}
function cardElement(record: DrawnRecord, rung: number, facts: Facts = {}, inOutline = false) {
  const card = el("div", "e-card");
  card.dataset.role = record.role;
  card.dataset.id = record.id;
  // The card's own number goes on the attribute a graph card writes its position on. data-rung is a report's reading
  // length, and a comment written on a card read this number there as a length it could not place (round 230).
  card.setAttribute(CARD_RUNG_ATTRIBUTE, String(rung));
  carryTarget(card, record);
  if (record.state) card.dataset.state = record.state;
  // A step one package names says that package's state, on the colours of its own state, which data-state keeps.
  const stateSaid = record.packageState !== undefined ? packageStateWord(record.packageState).text : stateWord(record.state, "normal", record.kind).text;
  const head = el("div", "e-head");
  if (facts.no) head.append(el("span", "e-no", facts.no));
  const title = el(record.href ? "a" : "span", "e-title", facts.name ?? record.title);
  if (record.href && title instanceof HTMLAnchorElement) title.href = record.href;
  head.append(title);
  const marks = el("span", "e-marks");
  for (const badgeInfo of badgeWords(record)) {
    const badge = el("span", "e-badge", badgeInfo.text);
    badge.dataset.module = String(badgeInfo.tone);
    marks.append(badge);
  }
  const counts = (facts.counts ?? []).map(({ kind, n }: { kind: string; n: number }) => {
    const count = el("span", "e-count");
    count.dataset.count = kind;
    const words = kind === "carries" ? t("lanes.carries", { n }) : kind === "carries-elsewhere" ? t("lanes.carriesElsewhere", { n }) : kind === "carried" ? t("lanes.carriedBy", { n }) : t("lanes.holds", { n });
    count.title = words;
    count.setAttribute("aria-label", words);
    count.textContent = words;
    return count;
  });
  if (rung < 3) marks.append(...counts);
  if (record.role === "box" || record.role === "step" && record.state && record.state !== "done") {
    const mark = el("span", "e-mark");
    mark.dataset.state = record.state ?? "unrecorded";
    mark.setAttribute("aria-label", stateSaid);
    marks.append(mark);
  }
  if (marks.childElementCount) head.append(marks);
  card.append(head);
  if (true) {
    const row = el("div", "e-chip-row");
    if (record.state) {
      const chip = el("span", "e-chip");
      chip.dataset.state = record.state;
      if (record.packageState !== undefined) chip.dataset.packageState = record.packageState;
      chip.textContent = stateSaid;
      row.append(chip);
    }
    if (!record.state) {
      const chip = el("span", "e-chip");
      chip.dataset.state = "unrecorded";
      chip.textContent = stateWord(null).text;
      row.append(chip);
    }
    row.append(...counts);
    card.append(row);
  }
  if (facts.parts?.length) {
    const list = el("div", "e-parts");
    for (const part of facts.parts) {
      list.append(el("div", "e-part-heading", part.heading));
      if (part.text) list.append(el("div", "e-part-text", part.text));
    }
    if (facts.partsWithheld) list.append(el("div", "e-parts-more", `+${facts.partsWithheld} ${t("g7b.card.parts_of_this_record")}`));
    card.append(list);
  } else if (facts.summary) card.append(el("div", "e-summary", facts.summary));
  if (facts.detailOn !== undefined) {
    const tick = el("button", "e-detail", t("g7b.card.detail"));
    tick.type = "button";
    tick.setAttribute("aria-label", t("g7b.CardFace.detail_on_this_card"));
    tick.setAttribute("aria-pressed", String(facts.detailOn));
    if (facts.toggleDetail) {
      tick.title = t("g7b.CardFace.show_this_record_written_by_part_and");
      tick.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); facts.toggleDetail?.(); });
      card.append(tick);
    } else {
      const why = t("g7b.CardFace.nobody_has_written_this_record_by_part");
      const reason = el("span", "e-detail-reason", why);
      reason.setAttribute("role", "status");
      reason.hidden = true;
      tick.setAttribute("aria-disabled", "true");
      tick.title = why;
      tick.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); reason.hidden = !reason.hidden; });
      card.append(tick, reason);
    }
  }
  return card;
}
function areaHeadElement(heading: NonNullable<LaneArea['heading']>, record: DrawnRecord | null) {
  if (!record) return el("div", "e-heading", heading.text);
  const head = el("div", "e-area-head");
  carryTarget(head, record);
  const title = el(record.href ? "a" : "span", "e-title", record.title);
  if (record.href && title instanceof HTMLAnchorElement) title.href = record.href;
  head.append(title);
  for (const badgeInfo of badgeWords(record)) {
    const badge = el("span", "e-badge", badgeInfo.text);
    badge.dataset.module = String(badgeInfo.tone);
    head.append(badge);
  }
  if (record.state) {
    const chip = el("span", "e-chip");
    chip.dataset.state = record.state;
    chip.textContent = stateWord(record.state, "normal", record.kind).text;
    head.append(chip);
  }
  return head;
}
function headElementIn(node: AreaNode) {
  const head = areaHeadElement(node.area.heading!, node.record);
  head.style.width = "max-content";
  head.style.maxWidth = `${node.w - 2 * (node.framed ? UNITS.framePad : 0)}px`;
  return head;
}
function headAskIn(node: AreaNode): MeasureAsk {
  return { key: `head|${node.area.key}|in ${node.w}`, make: () => headElementIn(node) };
}
function headSizeIn(node: AreaNode, measurer: Measurer) {
  const { key, make } = headAskIn(node);
  return measurer.size(key, make);
}
function pillElement(look: LineLook) {
  const pill = el("div", "e-pill");
  pill.dataset.tone = look.tone;
  pill.append(el("span", "e-pill-word", look.word));
  return pill;
}
function lineLook(link: DrawnLink & { kindWord?: boolean }): LineLook {
  if (link.type === "blocks") {
    const tone = link.gate === "hard" ? "hard" : link.gate === "partial" ? "partial" : "plain";
    return { tone, word: link.kindWord ? WAITS_ON() : null, gate: link.gate };
  }
  if (link.type === "feeds") return { tone: "plain", word: link.carries, gate: null };
  return { tone: "plain", word: link.kindWord ? linkWord(link.type, "forward").text : null, gate: null };
}
type MeasureAsk = { key: string; make: () => HTMLElement; width?: number };
class Measurer {
  room: HTMLElement
  cache: Map<string, { w: number; h: number }>
  cardHeads: Map<string, { width: number; markRoom: number }>
  constructor(slot: HTMLElement) {
    this.room = el("div", "e-measure");
    slot.append(this.room);
    this.cache = /* @__PURE__ */ new Map();
    this.cardHeads = new Map();
  }
  static keyOf(key: string, width?: number): string {
    return `${key}|${width ?? "auto"}`;
  }
  size(key: string, make: () => HTMLElement, width?: number): { w: number; h: number } {
    this.sizeAll([{ key, make, width }]);
    return this.cache.get(Measurer.keyOf(key, width))!;
  }
  // A size read after an element goes into the room lays the page out again, so every element not measured yet goes
  // in before the first is read (round 231). Each is placed on its own in the room (styles.ts), so it has the size it
  // has when measured alone.
  sizeAll(asks: readonly MeasureAsk[]): void {
    const made = new Map<string, HTMLElement>();
    for (const { key, make, width } of asks) {
      const k = Measurer.keyOf(key, width);
      if (this.cache.has(k) || made.has(k)) continue;
      const node = make();
      if (width !== void 0) node.style.width = `${width}px`;
      this.room.append(node);
      made.set(k, node);
    }
    for (const [k, node] of made) {
      const box = node.getBoundingClientRect();
      this.cache.set(k, { w: box.width, h: box.height });
    }
    for (const node of made.values()) node.remove();
  }
  done() {
    this.room.remove();
  }
}
function cardHeadSize(measurer: Measurer, record: DrawnRecord, rung: number, facts: Facts = {}): { width: number; markRoom: number } {
  return cardHeadSizes(measurer, [{ record, facts }], rung)[0]!;
}
// The same for several cards. Every card not measured yet goes into the room before the first is read, so the page is
// laid out twice for them all rather than twice for each (round 238). Each is placed on its own in the room, as in
// sizeAll, so it has the size it has when measured alone.
function cardHeadSizes(measurer: Measurer, cards: readonly { record: DrawnRecord; facts?: Facts | undefined }[], rung: number): { width: number; markRoom: number }[] {
  const made = new Map<string, { card: HTMLElement; marks: HTMLElement | null }>();
  for (const { record, facts = {} } of cards) {
    const key = `${record.id}|${rung}`;
    if (measurer.cardHeads.has(key) || made.has(key)) continue;
    const card = cardElement(record, rung, facts);
    card.style.width = "min-content";
    card.querySelector<HTMLElement>(".e-title")!.style.minWidth = "min-content";
    card.querySelector(".e-chip-row")?.remove();
    measurer.room.append(card);
    made.set(key, { card, marks: card.querySelector<HTMLElement>(".e-marks") });
  }
  const markRooms = new Map([...made].map(([key, { marks }]) => [key, marks ? Math.max(0, marks.scrollWidth - marks.clientWidth) : 0]));
  for (const [key, { marks }] of made) {
    const markRoom = markRooms.get(key)!;
    if (marks && markRoom) marks.style.paddingRight = `${markRoom}px`;
  }
  for (const [key, { card }] of made) measurer.cardHeads.set(key, { width: Math.ceil(card.getBoundingClientRect().width), markRoom: markRooms.get(key)! });
  for (const { card } of made.values()) card.remove();
  return cards.map(({ record }) => measurer.cardHeads.get(`${record.id}|${rung}`)!);
}
function reserveMarkRoom(card: HTMLElement, markRoom: number) {
  const marks = card.querySelector<HTMLElement>(".e-marks");
  if (marks && markRoom) marks.style.paddingRight = `${markRoom}px`;
}
function cardWithMeasuredMarks(measurer: Measurer, record: DrawnRecord, rung: number, facts: Facts = {}) {
  const card = cardElement(record, rung, facts);
  reserveMarkRoom(card, cardHeadSize(measurer, record, rung, facts).markRoom);
  return card;
}
function nodeOf(area: DrawingArea, nested: boolean, records: Map<string, DrawnRecord>): AreaNode {
  const record = area.heading?.record ? records.get(area.heading.record) : null;
  if (area.heading?.record && !record) throw new Error(`the area "${area.key}" is headed by ${area.heading.record}, which is no record`);
  return {
    kind: "area",
    area,
    nested,
    framed: Boolean(area.frame) || Boolean(record) || nested && area.heading !== null,
    record: record ?? null,
    tint: area.tint ?? null,
    items: area.items.map((item): LayoutNode => 'record' in item ? { kind: "card", id: item.record, x: 0, y: 0, w: 0, h: 0, natW: 0 } : nodeOf(item.area, true, records)),
    x: 0, y: 0, w: 0, h: 0, natW: 0, colGaps: [], rowGaps: [], rowHs: [], gutter: 0, gutterSide: 'right', cell: 0,
  };
}
const NOT_PLACED_KEY = "\0not-placed";
// With `widest`, a layout whose natural width is over it stops once that width is known, before any card is measured
// at the width, and is null (round 238).
function layoutAt(tree: DrawingTree, notPlaced: string[], records: Map<string, DrawnRecord>, links: DrawnLink[], measurer: Measurer, rung: number, { card, facts, besideLast, rowWidth, widest = Infinity }: { card: number; facts: Map<string, Facts>; besideLast: boolean; rowWidth: number; widest?: number }): Layout | null {
  const wrap = (area: DrawingArea): DrawingArea => {
    const items = area.items.map((item) => 'area' in item ? { area: wrap(item.area) } : item);
    const gap = area.tierRow ? 56 : UNITS.gap;
    const columns = Math.max(1, Math.floor((rowWidth - 2 * ROUTE_ROOM + gap) / (card + gap)));
    return (area.arrange === "row" || area.arrange === "pack") && items.length > columns ? { ...area, arrange: "grid", columns, items } : { ...area, items };
  };
  const tops = tree.areas.map((area) => nodeOf(wrap(area), false, records));
  let np: AreaNode | null = null;
  if (notPlaced.length) {
    np = nodeOf(wrap({ key: NOT_PLACED_KEY, heading: { text: NOT_PLACED(), record: null }, arrange: "pack", columns: null, beside: null, tint: null, items: notPlaced.map((id) => ({ record: id })) }), false, records);
    tops.push(np);
  }
  const cardAsk = (id: string, width: number): MeasureAsk => ({ key: `card|${id}|${rung}`, make: () => cardWithMeasuredMarks(measurer, records.get(id)!, rung, facts.get(id)), width });
  const cardSize = (id: string, width: number) => {
    const { key, make } = cardAsk(id, width);
    return measurer.size(key, make, width);
  };
  const asksIn = (node: LayoutNode): MeasureAsk[] => node.kind === "card" ? [cardAsk(node.id, node.w)] : [...(node.area.heading === null ? [] : [headAskIn(node)]), ...node.items.flatMap(asksIn)];
  const leastAsks = (node: AreaNode): MeasureAsk[] => node.area.heading === null ? [] : [{ key: `head|${node.area.key}|least`, make: () => areaHeadElement(node.area.heading!, node.record) }];
  const leastAsksIn = (node: LayoutNode): MeasureAsk[] => node.kind === "card" ? [] : [...leastAsks(node), ...node.items.flatMap(leastAsksIn)];
  const headLeast = (node: AreaNode) => {
    const [ask] = leastAsks(node);
    return ask ? measurer.size(ask.key, ask.make).w : 0;
  };
  const pad = (node: AreaNode) => node.framed ? UNITS.framePad : 0;
  const headRoom = (node: AreaNode) => node.area.heading === null ? 0 : headSizeIn(node, measurer).h + UNITS.headGap;
  const pillAsks = (link: DrawnLink): MeasureAsk[] => {
    const look = lineLook(link);
    return look.word ? [{ key: `pill|${link.id}`, make: () => pillElement(look) }] : [];
  };
  const pillSize = (link: DrawnLink) => {
    const [ask] = pillAsks(link);
    return ask ? measurer.size(ask.key, ask.make) : null;
  };
  // The gaps and the natural widths ask for the words on the lines and the least width of each heading one at a time,
  // and a size read after an element goes into the room lays the page out again, so all of them are measured in one
  // layout first (round 238). The plan measures every word on a line at rest in any case.
  measurer.sizeAll([...links.flatMap(pillAsks), ...tops.flatMap(leastAsksIn)]);
  const roomFor = (a: LayoutNode | undefined, b: LayoutNode | undefined, along: 'w' | 'h') => {
    let room = UNITS.gap;
    if (!a || !b || a.kind !== "card" || b.kind !== "card") return room;
    for (const link of links) {
      if (!(link.from === a.id && link.to === b.id || link.from === b.id && link.to === a.id)) continue;
      room = Math.max(room, tree.level === "steps" && records.get(a.id)?.role === "step" && records.get(b.id)?.role === "step" ? 45 : 30);
      const size = pillSize(link);
      if (size) room = Math.max(room, size[along] + UNITS.pillRoom);
    }
    return room;
  };
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
  const rowNeedsRouteRoom = (node: AreaNode, row: number) => {
    const columns = node.area.arrange === "stack" ? 1 : node.area.arrange === "grid" ? Math.min(node.area.columns ?? 1, node.items.length) : node.items.length;
    if (!columns) return false;
    const items = node.items.slice(row * columns, (row + 1) * columns);
    const positions = new Map(items.flatMap((item, i): [string, number][] => item.kind === "card" ? [[item.id, i]] : []));
    return links.some(link => positions.has(link.from) && positions.has(link.to) && Math.abs(positions.get(link.from)! - positions.get(link.to)!) > 1);
  };
  const routeRoom = 30;
  const gutterOf = (node: AreaNode) => {
    if (node.area.arrange !== "stack") return 0;
    if (node.area.derivedTiers) return UNITS.besideGap * 2;
    const at = new Map<string, number>(node.items.flatMap((item, i): [string, number][] => item.kind === "card" ? [[item.id, i]] : []));
    let widest = 0;
    for (const link of links) {
      if (!at.has(link.from) || !at.has(link.to)) continue;
      if (Math.abs(at.get(link.from)! - at.get(link.to)!) < 2) continue;
      widest = Math.max(widest, (pillSize(link)?.w ?? 0) + UNITS.pillRoom + 48, UNITS.besideGap + 48);
    }
    return widest;
  };
  const setGaps = (node: LayoutNode) => {
    if (node.kind === "card") return;
    const items = node.items;
    const n = items.length;
    const next = (i: number) => i + 1 < n ? Math.max(node.area.tierRow ? 56 : 0, roomFor(items[i], items[i + 1], node.area.arrange === "stack" ? "h" : "w")) : 0;
    node.colGaps = [];
    node.rowGaps = [];
    node.gutter = gutterOf(node);
    node.gutterSide = node.area.beside?.side === "left" ? "left" : "right";
    if (node.area.arrange === "stack") node.rowGaps = items.slice(1).map((_, i) => node.area.derivedTiers ? UNITS.tierGap : next(i));
    else if (node.area.arrange === "grid") {
      const c = Math.min(node.area.columns ?? 1, n);
      const rows = Math.ceil(n / c);
      for (let j = 0; j + 1 < c; j++) node.colGaps.push(Math.max(...Array.from({ length: rows }, (_, r) => roomFor(items[r * c + j], items[r * c + j + 1], "w"))));
      for (let r = 0; r + 1 < rows; r++) node.rowGaps.push(Math.max(rowNeedsRouteRoom(node, r) ? routeRoom : 0, ...Array.from({ length: c }, (_, j) => roomFor(items[r * c + j], items[(r + 1) * c + j], "h"))));
    } else node.colGaps = items.slice(1).map((_, i) => next(i));
    for (const item of items) setGaps(item);
  };
  for (const top of tops) setGaps(top);
  const natW = (node: LayoutNode, scale = 1): number => {
    if (node.kind === "card") {
      node.natW = Math.max(card * scale, cardHeadSize(measurer, records.get(node.id)!, rung, facts.get(node.id)).width);
      return node.natW;
    }
    const childScale = tree.level === "boxes" && !node.nested && node.area.arrange === "stack" && node.area.beside ? 0.95 : scale;
    const ws = node.items.map((item) => natW(item, childScale));
    const n = ws.length;
    let inner = 0;
    if (n && (node.area.arrange === "row" || node.area.arrange === "pack")) inner = sum(ws) + sum(node.colGaps);
    else if (n && node.area.arrange === "stack") inner = Math.max(...ws) + node.gutter;
    else if (n) {
      const c = Math.min(node.area.columns ?? 1, n);
      inner = c * Math.max(...ws) + sum(node.colGaps);
    }
    node.natW = Math.max(inner, headLeast(node)) + 2 * pad(node);
    return node.natW;
  };
  for (const top of tops) natW(top);
  const owner = new Map<string, AreaNode>();
  const own = (node: LayoutNode, top: AreaNode) => {
    if (node.kind === "card") owner.set(node.id, top);
    else {
      if (node.record) owner.set(node.record.id, top);
      for (const item of node.items) own(item, top);
    }
  };
  for (const top of tops) own(top, top);
  const pillW = (link: DrawnLink) => pillSize(link)?.w ?? 0;
  const between = (a: AreaNode, b: AreaNode) => {
    let widest = 0;
    for (const link of links) {
      const ends = [owner.get(link.from), owner.get(link.to)];
      if (ends[0] === a && ends[1] === b || ends[0] === b && ends[1] === a) widest = Math.max(widest, pillW(link));
    }
    return Math.max(UNITS.besideGap, widest ? widest + UNITS.pillRoom : 0);
  };
  const besideOf = (key: string, side: 'left' | 'right') => tops.filter((t2) => t2.area.beside?.of === key && t2.area.beside.side === side);
  const chain = (key: string, side: 'left' | 'right') => {
    const out: AreaNode[] = [];
    let next = besideOf(key, side);
    while (next.length) {
      if (next.length > 1) throw new Error(`two areas are beside the ${side} of "${key}"`);
      out.push(next[0]!);
      next = besideOf(next[0]!.area.key, side);
    }
    return out;
  };
  const tierOf = (order: AreaNode[], main: AreaNode): Tier => {
    const gaps = order.slice(1).map((node, i) => between(order[i]!, node));
    return { main, order, gaps, natW: sum(order.map((n) => n.natW)) + sum(gaps) };
  };
  const tiers = tops.filter((t2) => !t2.area.beside && t2 !== np).map((main) => tierOf([...chain(main.area.key, "left").reverse(), main, ...chain(main.area.key, "right")], main));
  for (const top of tops) {
    if (top.area.beside && !tiers.some((tier) => tier.order.includes(top))) throw new Error(`the area "${top.area.key}" is beside nothing drawn`);
  }
  if (np) {
    const widest = Math.max(0, ...tiers.map((t2) => t2.natW));
    const last = tiers[tiers.length - 1];
    const beside = besideLast && last ? tierOf([...last.order, np], last.main) : null;
    if (beside && beside.natW <= widest * 1.12) tiers[tiers.length - 1] = beside;
    else tiers.push(tierOf([np], np));
  }
  const W = Math.max(0, ...tiers.map((t2) => t2.natW));
  if (!(W <= widest)) return null;
  const setW =(node: LayoutNode, width: number): void => {
    node.w = width;
    if (node.kind === "card") return;
    const inner = width - 2 * pad(node);
    const n = node.items.length;
    if (node.area.arrange === "stack") for (const item of node.items) setW(item, inner - node.gutter);
    else if (node.area.arrange === "grid") {
      const c = Math.min(node.area.columns ?? 1, n);
      node.cell = Math.min((inner - sum(node.colGaps)) / c, Math.max(...node.items.map((i) => i.natW)));
      for (const item of node.items) setW(item, node.cell);
    } else for (const item of node.items) setW(item, item.natW);
  };
  const setH = (node: LayoutNode): number => {
    if (node.kind === "card") {
      node.h = cardSize(node.id, node.w).h;
      return node.h;
    }
    const hs = node.items.map(setH);
    const n = hs.length;
    let inner = 0;
    if (n && (node.area.arrange === "row" || node.area.arrange === "pack")) inner = Math.max(...hs);
    else if (n && node.area.arrange === "stack") inner = sum(hs) + sum(node.rowGaps);
    else if (n) {
      const c = Math.min(node.area.columns ?? 1, n);
      node.rowHs = [];
      for (let r = 0; r * c < n; r++) node.rowHs.push(Math.max(...hs.slice(r * c, r * c + c)));
      inner = sum(node.rowHs) + sum(node.rowGaps);
    }
    const columns = node.area.arrange === "stack" ? 1 : node.area.arrange === "grid" ? Math.min(node.area.columns ?? 1, n) : n;
    const lastRow = columns ? Math.ceil(n / columns) - 1 : -1;
    const bottomRoom = lastRow >= 0 && rowNeedsRouteRoom(node, lastRow) ? Math.max(0, routeRoom - pad(node)) : 0;
    node.h = headRoom(node) + inner + 2 * pad(node) + bottomRoom;
    return node.h;
  };
  const placedCards = new Map<string, CardNode>();
  const place = (node: LayoutNode, x: number, y2: number, height: number): void => {
    node.x = x;
    node.y = y2;
    if (node.kind === "card") {
      node.h = height;
      placedCards.set(node.id, node);
      return;
    }
    const extraHeight = Math.max(0, height - node.h);
    node.h = Math.max(height, node.h);
    const p = pad(node);
    const top = y2 + p + headRoom(node);
    const inner = node.w - 2 * p;
    const n = node.items.length;
    if (!n) return;
    if (node.area.arrange === "stack") {
      const left = x + p + (node.gutterSide === "left" ? node.gutter : 0);
      let at = top;
      node.items.forEach((item, i) => {
        const neighbour = node.area.beside && item.kind === "card" ? links.find((link) => link.from === item.id && owner.get(link.to)?.area.key === node.area.beside?.of && placedCards.has(link.to) || link.to === item.id && owner.get(link.from)?.area.key === node.area.beside?.of && placedCards.has(link.from)) : null;
        const other = neighbour && item.kind === 'card' ? neighbour.from === item.id ? neighbour.to : neighbour.from : null;
        const aligned = other ? placedCards.get(other) : null;
        const target = aligned ? Math.max(at, aligned.y + (aligned.h - item.h) / 2) : at;
        let itemLeft = left;
        if (node.area.derivedTiers && item.kind === "area" && item.area.tierRow && i > 0) {
          const previous = node.items[i - 1];
          const previousIds = new Set(previous?.kind === "area" ? previous.items.flatMap(child => child.kind === "card" ? [child.id] : []) : []);
          let offset = 0;
          for (const [index, child] of item.items.entries()) {
            if (child.kind !== "card") continue;
            const link = links.find(edge => edge.to === child.id && previousIds.has(edge.from));
            const parent = link && placedCards.get(link.from);
            if (parent) {
              const childOffset = item.items.slice(0, index).reduce((sum, before, j) => sum + before.w + (item.colGaps[j] ?? 0), 0);
              offset = Math.max(0, Math.min(item.w - item.natW, parent.x + parent.w / 2 - left - childOffset - child.w / 2));
              break;
            }
          }
          itemLeft += offset;
        }
        place(item, itemLeft, target, item.h);
        at = Math.max(at, target) + item.h + (node.rowGaps[i] ?? 0) + (node.tint && !node.framed && node.area.beside && i < n - 1 ? Math.max(0, extraHeight - headRoom(node)) * 1 / (n - 1) : 0);
      });
      node.h = Math.max(node.h, at - y2 + p);
    } else if (node.area.arrange === "grid") {
      const c = Math.min(node.area.columns ?? 1, n);
      const share = 0;
      let at = top;
      node.rowHs.forEach((rowH, r) => {
        node.items.slice(r * c, r * c + c).forEach((item, i) => place(item, x + p + share / 2 + i * (node.cell + share) + sum(node.colGaps.slice(0, i)), at, rowH));
        at += rowH + (node.rowGaps[r] ?? 0);
      });
    } else if (node.area.arrange === "pack") {
      let at = x + p;
      const rowH = Math.max(...node.items.map((item) => item.h));
      node.items.forEach((item, i) => {
        place(item, at, top, rowH);
        at += item.w + (node.colGaps[i] ?? 0);
      });
    } else {
      const share = 0;
      const rowH = Math.max(...node.items.map((i) => i.h));
      let at = x + p + share / 2;
      node.items.forEach((item, i) => {
        place(item, at, top, rowH);
        at += item.w + (node.colGaps[i] ?? 0) + share;
      });
    }
  };
  let y = 0;
  for (const tier of tiers) {
    const columns = tier.order.filter((n) => n !== tier.main);
    const rest = W - columns.reduce((s, n) => s + n.natW, 0) - tier.gaps.reduce((s, g) => s + g, 0);
    for (const node of tier.order) setW(node, tree.level === "steps" ? node.natW : node === tier.main ? rest : node.natW);
    measurer.sizeAll(tier.order.flatMap(asksIn));
    for (const node of tier.order) setH(node);
    if (tree.level === "steps") {
      const groups = tier.order.filter((node) => ["row", "pack", "stack"].includes(node.area.arrange) && node.items.length && (node.area.arrange !== "stack" || node.items.length === 1) && node.items.every((item) => item.kind === "card" && records.get(item.id)?.role === "step"));
      if (groups.length > 1) {
        const rowH = Math.max(...groups.flatMap((node) => node.items.map((item) => item.h)));
        for (const node of groups) {
          const old = Math.max(...node.items.map((item) => item.h));
          node.h += rowH - old;
          for (const item of node.items) item.h = rowH;
        }
      }
    }
    const height = Math.max(...tier.order.map((n) => n.h));
    let x = tree.level === "steps" ? tiers.indexOf(tier) < 2 ? 0 : (W - tier.natW) / 2 : 0;
    tier.order.forEach((node, i) => {
      place(node, x, y, tree.level === "steps" ? node.h : height);
      x += node.w + (tier.gaps[i] ?? 0);
    });
    tier.y = y;
    tier.h = Math.max(...tier.order.map((node) => node.h));
    y += tier.h + (tree.level === "steps" ? 50 : 60);
  }
  return { tops, tiers, W, H: y - (tree.level === "steps" ? 50 : 60) };
}
function rectsOf(layout: Layout, measurer: Measurer): Omit<Rectangles, 'routeCost'> {
  const cards = new Map<string, Rect>();
  const areas: AreaRect[] = [];
  const words: Rect[] = [];
  const walk = (node: LayoutNode): Set<string> => {
    if (node.kind === "card") {
      cards.set(node.id, { x: node.x, y: node.y, w: node.w, h: node.h });
      return /* @__PURE__ */ new Set([node.id]);
    }
    const ids = new Set<string>();
    for (const item of node.items) for (const id of walk(item)) ids.add(id);
    const rect = { x: node.x, y: node.y, w: node.w, h: node.h };
    if (node.area.heading !== null) {
      const size = headSizeIn(node, measurer);
      const p = node.framed ? UNITS.framePad : 0;
      words.push({ x: node.x + p, y: node.y + p, w: size.w, h: size.h });
    }
    areas.push({ node, rect, framed: node.framed, ids, head: node.record?.id ?? null });
    if (node.record) ids.add(node.record.id);
    return ids;
  };
  for (const top of layout.tops) walk(top);
  return { cards, areas, words };
}
function pathOf(points: Point[]) {
  if (!points.length) return '';
  const R = 8;
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let n = 1; n < points.length; n++) {
    const p = points[n]!;
    if (n === points.length - 1) {
      d += ` L ${p.x} ${p.y}`;
      break;
    }
    const a = points[n - 1]!;
    const b = points[n + 1]!;
    const r = Math.min(R, Math.hypot(p.x - a.x, p.y - a.y) / 2, Math.hypot(b.x - p.x, b.y - p.y) / 2);
    const ux = Math.sign(p.x - a.x);
    const uy = Math.sign(p.y - a.y);
    const vx = Math.sign(b.x - p.x);
    const vy = Math.sign(b.y - p.y);
    d += ` L ${p.x - ux * r} ${p.y - uy * r} Q ${p.x} ${p.y} ${p.x + vx * r} ${p.y + vy * r}`;
  }
  return d;
}
function drawnRecordsOf(tree: LanesTree, notPlaced: string[]) {
  const drawn = new Set(notPlaced);
  for (const area of tree.areas) for (const id of recordsIn(area)) drawn.add(id);
  return drawn;
}
function linksOf(snapshot: LanesInput, tree: LanesTree, extraRecords: DrawnRecord[] = []) {
  const notPlaced = tree.areas.length ? tree.notPlaced : snapshot.records.filter((r) => r.role !== "module").map((r) => r.id);
  const drawn = drawnRecordsOf(tree, notPlaced);
  const titles = new Map([...snapshot.records, ...extraRecords].map((r) => [r.id, r.title]));
  const shown = [];
  const notShown = [];
  for (const link of snapshot.links) {
    const missing = [link.from, link.to].filter((id) => !drawn.has(id) || !titles.has(id));
    if (missing.length === 0) shown.push(link);
    else notShown.push({ link, missing: missing.map((id) => titles.get(id) ?? id) });
  }
  return { drawn, shown, notShown, notPlaced };
}
function checkTints(slot: HTMLElement, tree: LanesTree) {
  const style = getComputedStyle(slot);
  const walk = (area: LaneArea) => {
    if (area.tint != null && style.getPropertyValue(area.tint).trim() === "") throw new Error(`the area "${area.key}" names the tint ${area.tint}, which no palette defines`);
    for (const item of area.items) if ('area' in item) walk(item.area);
  };
  for (const area of tree.areas) walk(area);
}
function tierArea(area: LaneArea, links: DrawnLink[]): DrawingArea {
  const items = area.items.map((item) => 'area' in item ? { area: tierArea(item.area, links) } : item);
  if (area.arrange !== "tiers") return { ...area, items };
  const ids = items.flatMap((item) => 'record' in item ? [item.record] : []);
  const own = new Set(ids);
  const deps = links.filter((link) => link.type === "blocks" && own.has(link.from) && own.has(link.to) && link.from !== link.to);
  if (!deps.length) return { ...area, arrange: "stack", items };
  const rank = new Map(ids.map((id) => [id, 0])), remaining = new Set(ids);
  for (let pass = 0; pass < ids.length && remaining.size; pass++) {
    const ready = [...remaining].filter((id) => deps.every((link) => link.to !== id || !remaining.has(link.from)));
    if (!ready.length) break;
    for (const id of ready) {
      const before = deps.filter((link) => link.to === id).map((link) => rank.get(link.from) ?? 0);
      rank.set(id, before.length ? Math.max(...before) + 1 : 0);
      remaining.delete(id);
    }
  }
  const connected = new Set(deps.flatMap(link => [link.from, link.to]));
  const last = Math.max(0, ...rank.values()) + 1;
  for (const id of ids) if (!connected.has(id)) rank.set(id, last);
  const groups = new Map<number, DrawingArea['items']>();
  for (const item of items) {
    const n = 'record' in item ? rank.get(item.record) ?? 0 : 0;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n)!.push(item);
  }
  const orderedGroups = [...groups.entries()].sort(([a], [b]) => a - b);
  for (let g = 0; g < Math.min(1, orderedGroups.length - 1); g++) {
    const group = orderedGroups[g]![1], next = orderedGroups[g + 1]![1];
    const nextIndex = new Map(next.flatMap((item, index): [string, number][] => 'record' in item ? [[item.record, index]] : []));
    const score = (item: DrawingArea['items'][number]) => {
      if (!('record' in item)) return Infinity;
      const targets = deps.filter(link => link.from === item.record && nextIndex.has(link.to)).map(link => nextIndex.get(link.to)!);
      return targets.length ? targets.reduce((sum, value) => sum + value, 0) / targets.length : Infinity;
    };
    group.sort((a, b) => score(a) - score(b));
  }
  return { ...area, arrange: "stack", derivedTiers: true, items: orderedGroups.map(([n, group]) => ({ area: { key: `${area.key}\0tier${n}`, heading: null, arrange: "row", columns: null, beside: null, tint: null, tierRow: true, items: group } })) };
}
function treeToDraw(snapshot: LanesInput, tree: LanesTree): { tree: DrawingTree; notPlaced: string[] } {
  if (tree.areas.length) return { tree: { ...tree, areas: tree.areas.map((area2) => tierArea(area2, snapshot.links)) }, notPlaced: tree.notPlaced };
  const steps = snapshot.records.filter((r) => r.role !== "module").map((r) => ({ record: r.id }));
  const area: LaneArea = { key: "\0stored-order", heading: null, arrange: "tiers", columns: null, beside: null, tint: null, items: steps };
  return { tree: { ...tree, areas: [tierArea(area, snapshot.links)] }, notPlaced: [] };
}
const ON_SELECTION = /* @__PURE__ */ new Set(["implements"]);
function factsOf(snapshot: LanesInput, level: LanesTree['level'], detail?: ReadonlyMap<string, Pick<Facts, "name" | "summary" | "parts" | "partsWithheld" | "detailOn" | "toggleDetail">>) {
  const facts = new Map<string, Facts>();
  for (const record of snapshot.records) {
    const counts: { kind: string; n: number }[] = [];
    if (record.counts.carries !== null) counts.push({ kind: 'carries', n: record.counts.carries.thisPipeline });
    if (record.counts.carries !== null && record.counts.carries.otherPipelines > 0) counts.push({ kind: 'carries-elsewhere', n: record.counts.carries.otherPipelines });
    if (record.counts.carriedBy !== null) counts.push({ kind: 'carried', n: record.counts.carriedBy });
    if (record.counts.holds !== null) counts.push({ kind: 'holds', n: record.counts.holds });
    facts.set(record.id, { no: level === 'steps' && record.role === 'step' ? record.number : null, counts, ...detail?.get(record.id) });
  }
  return facts;
}
function bandRectsOf(layout: Layout) {
  return layout.tops.filter((t2) => t2.tint && !t2.framed).map((t2) => bandRect(t2, layout.W));
}
// `selected` gives the card drawn already selected, as a press would select it, and `onSelect` hears every change of the
// selection, so the page can hold a selection across a fresh drawing. It is asked once the lines are worked out, so a
// card pressed on the drawing before this one meanwhile is the one selected. `signal` says the drawing was replaced:
// its routing worker is ended at once, and the drawing fails with that reason.
async function drawTree(slot: HTMLElement, snapshot: LanesInput, tree: LanesTree, { width, narrow = false, view, extraRecords = [], trial = null, selected: heldCard, onSelect, cardDetails, signal }: { width: number; narrow?: boolean; view?: string; extraRecords?: never[]; trial?: null; selected?: () => string | null; onSelect?: (id: string | null) => void; cardDetails?: ReadonlyMap<string, Pick<Facts, "name" | "summary" | "parts" | "partsWithheld" | "detailOn" | "toggleDetail">>; signal?: AbortSignal }) {
  if (view !== void 0 && view !== "reading") throw new Error(`the view "${view}" is not "reading"`);
  if (view === "reading" && width !== 1440) throw new Error(`Reading size is drawn at 1440, not at ${width}`);
  for (const key2 of Object.keys(trial ?? {})) if (!Object.hasOwn(CHOSEN, key2)) throw new Error(`the trial names "${key2}", which is no setting of the fit`);
  const opts = { ...CHOSEN, ...trial ?? {} };
  if (!["page", "window"].includes(opts.frame)) throw new Error(`the trial's frame is "${opts.frame}", not "page" or "window"`);
  checkTree(tree);
  await document.fonts.ready;
  checkTints(slot, tree);
  const records = new Map([...snapshot.records, ...extraRecords].map((r) => [r.id, r]));
  let { shown } = linksOf(snapshot, tree, extraRecords);
  const drawing = treeToDraw(snapshot, tree);
  const facts = factsOf(snapshot, tree.level, cardDetails);
  const withKindWords = (visible: any) => visible.map((link: any) => ({ ...link, kindWord: ["consumes", "measures"].includes(link.type) || tree.level === "boxes" && link.type === "blocks" }));
  let atRest = withKindWords(shown.filter((l) => !ON_SELECTION.has(l.type)));
  const onSelection = shown.filter((l) => ON_SELECTION.has(l.type));
  const measurer = new Measurer(slot);
  const groups = /* @__PURE__ */ new Map();
  for (const link of onSelection) {
    for (const id of [link.from, link.to]) {
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(link);
    }
  }
  slot.dataset.onSelection = JSON.stringify(Object.fromEntries([...groups].map(([id, links]) => [id, links.map((l: any) => l.id)])));
  // The slot says it is the lanes. What holds the cards says which drawing a comment on one was written on, as the
  // canvas says it, so the comment's reader meets the pipeline before the slot's word (round 230).
  const onThisPipeline = (node: HTMLElement) => {
    for (const [name, value] of Object.entries(theDrawingIs("pipeline", snapshot.pipeline.id))) node.setAttribute(name, value);
  };
  if (narrow) {
    slot.dataset.drawing = "lanes";
    slot.dataset.level = tree.level;
    slot.dataset.drawnLinks = JSON.stringify(shown.map((l) => l.id));
    const list = outline(drawing.tree, drawing.notPlaced, records, shown, facts);
    onThisPipeline(list);
    slot.append(list);
    for (const card of list.querySelectorAll<HTMLElement>('.e-card')) {
      const id = card.dataset.id!;
      const head = cardHeadSize(measurer, records.get(id)!, 3, facts.get(id));
      reserveMarkRoom(card, head.markRoom);
      card.style.minWidth = `${head.width}px`;
    }
    measurer.done();
    let selected: string | null = null;
    const choose = (id: string) => {
      selected = selected === id ? null : id;
      onSelect?.(selected);
      if (selected === null) delete slot.dataset.selected;
      else slot.dataset.selected = selected;
      for (const card of list.querySelectorAll<HTMLElement>('.e-card')) {
        const active = card.dataset.id === selected;
        card.setAttribute('aria-pressed', String(active));
        if (active) card.dataset.selected = '1';
        else delete card.dataset.selected;
        // A card let go closes the note that says why its Detail tick cannot be turned on.
        if (!active) for (const note of card.querySelectorAll<HTMLElement>('.e-detail-reason')) note.hidden = true;
      }
    };
    list.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const card = target.closest<HTMLElement>('.e-card');
      if (card?.dataset.id && !target.closest('a')) choose(card.dataset.id);
    });
    list.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if ((event.key === 'Enter' || event.key === ' ') && target.matches('.e-card') && target.dataset.id) {
        event.preventDefault();
        choose(target.dataset.id);
      } else if (event.key === 'Escape' && selected !== null) choose(selected);
    });
    const drawnSelected = heldCard?.() ?? null;
    if (drawnSelected !== null && [...list.querySelectorAll<HTMLElement>('.e-card')].some((card) => card.dataset.id === drawnSelected)) choose(drawnSelected);
    slot.dataset.fit = JSON.stringify({ outline: true });
    return;
  }
  slot.dataset.drawnLinks = JSON.stringify(atRest.map((l: any) => l.id));
  const frame = el("div", "e-frame");
  const top = slot.getBoundingClientRect().top + window.scrollY;
  const frameH = Math.floor(opts.frame === "window" ? window.innerHeight : window.innerHeight - top);
  frame.style.height = `${frameH}px`;
  onThisPipeline(frame);
  slot.append(frame);
  const frameW = frame.clientWidth;
  const innerH = frame.clientHeight;
  const keyReserve = opts.frame === "window" ? 26 : 0;
  // A compact viewport can scroll a wider readable drawing instead of forcing
  // connected rows into narrow, obstructed grids.
  const rowWidthAt = (card2: number) => frameW < 800 ? Math.max(frameW - 2 * CANVAS_PAD, 4 * card2 + 3 * UNITS.gap + 2 * ROUTE_ROOM) : frameW - 2 * CANVAS_PAD;
  let screenedLayout: { card: number; layout: Layout } | null = null;
  const routingWorker = () => new Worker(new URL("./routing-worker.ts", import.meta.url), { type: "module" });
  // The worker started for the first plan before the headings are measured, until that plan takes it (round 238).
  let started: RoutesAway | null = null;
  const planAt = async (rung2: number, card2: number, unavailable2 = new Map<string, string>(), held: RoutesAway | null = null) => {
    // Every route search of this plan runs in a worker of its own, so the page answers presses while it runs. A retry
    // with one more link left out is the same plan and is given its worker, since a worker's start cost about 26 ms
    // where a search with no route took under 0.01 ms (round 231).
    const away = held ?? started ?? new RoutesAway(routingWorker(), signal);
    started = null;
    try {
      const atRest2 = shown.filter((l) => !ON_SELECTION.has(l.type) && !unavailable2.has(l.id)).map((l) => ({ ...l, kindWord: ["consumes", "measures"].includes(l.type) || tree.level === "boxes" && l.type === "blocks" }));
      const screened = rung2 === 3 && !unavailable2.size && screenedLayout?.card === card2 ? screenedLayout.layout : null;
      screenedLayout = null;
      const layout2 = screened ?? layoutAt(drawing.tree, drawing.notPlaced, records, atRest2, measurer, rung2, { card: card2, facts, besideLast: opts.besideLast, rowWidth: rowWidthAt(card2) })!;
      const spare = frameW / (12 / SMALLEST_UNITS) - layout2.W;
      const fitRoom = spare > 0 && spare < 2 * ROUTE_ROOM ? Math.max(5, Math.floor(spare / 2 / 5) * 5) : undefined;
      const rects = { ...rectsOf(layout2, measurer), routeCost: COST };
      const headed = new Map(rects.areas.filter((a) => a.head).map((a) => [a.head, a.rect]));
      const endRect = (id: string): Rect => {
        const rect = headed.get(id) ?? rects.cards.get(id);
        if (!rect) throw new Error(`the record ${id} is drawn nowhere`);
        return rect;
      };
      for (const link of shown) for (const id of [link.from, link.to]) endRect(id);
      const bands2 = bandRectsOf(layout2);
      const restFree = (await away.route(atRest2, endRect, rects, layout2, bands2)).routes;
      const restMoved = (await away.route(atRest2, endRect, rects, layout2, bands2, null, avoidsOf(atRest2, restFree, endRect))).routes;
      const restPins = pinsOf(atRest2, restMoved, endRect);
      for (const link of atRest2) {
        const from = endRect(link.from), to = endRect(link.to);
        const toArea = headed.has(link.to);
        if (headed.has(link.from) && !toArea) {
          const cy = to.y + to.h / 2;
          if (cy > from.y && cy < from.y + from.h && (to.x + to.w < from.x || to.x > from.x + from.w)) {
            const rightward = to.x > from.x;
            restPins.set(link.id, { start: { side: rightward ? "right" : "left", at: cy }, end: { side: rightward ? "left" : "right", at: cy } });
          } else if (link.type === "feeds" && to.y > from.y + from.h && to.x + to.w / 2 > from.x && to.x + to.w / 2 < from.x + from.w) {
            const cx = to.x + to.w / 2;
            restPins.set(link.id, { start: { side: "bottom", at: cx }, end: { side: "top", at: cx } });
          }
        }
        if (!headed.has(link.from) && !toArea && Math.abs(from.y + from.h / 2 - (to.y + to.h / 2)) < 1 && (from.x + from.w < to.x || to.x + to.w < from.x)) {
          const rightward = from.x < to.x;
          const cy = from.y + from.h / 2;
          restPins.set(link.id, { start: { side: rightward ? "right" : "left", at: cy }, end: { side: rightward ? "left" : "right", at: cy } });
        }
        if (link.type === "feeds" && toArea) {
          const cy = from.y + from.h / 2;
          const cx = from.x + from.w / 2;
          if (cy > to.y && cy < to.y + to.h && (from.x + from.w < to.x || from.x > to.x + to.w)) {
            const rightward = from.x < to.x;
            restPins.set(link.id, { start: { side: rightward ? "right" : "left", at: cy }, end: { side: rightward ? "left" : "right", at: cy } });
          } else if (from.y + from.h < to.y && cx > to.x && cx < to.x + to.w) {
            restPins.set(link.id, { start: { side: "bottom", at: cx }, end: { side: "top", at: cx } });
          }
        }
        if (records.get(link.from)?.state === "blocked" && to.y > from.y + from.h && to.x < from.x) {
          restPins.get(link.id).start = { side: "bottom", at: from.x + from.w * 0.3 };
          restPins.get(link.id).end = { side: "top", at: to.x + to.w * 0.75 };
        }
        if (link.type === "feeds" && records.get(link.from)?.state === "blocked" && to.y > from.y + from.h && Math.max(from.x, to.x) < Math.min(from.x + from.w, to.x + to.w)) {
          const at = (Math.max(from.x, to.x) + Math.min(from.x + from.w, to.x + to.w)) / 2;
          restPins.set(link.id, { start: { side: "bottom", at }, end: { side: "top", at } });
        }
      }
      const outgoing = /* @__PURE__ */ new Map();
      for (const link of atRest2) {
        const a = endRect(link.from), b = endRect(link.to);
        const side = b.y >= a.y + a.h ? "bottom" : b.y + b.h <= a.y ? "top" : b.x >= a.x + a.w ? "right" : "left";
        const key2 = `${link.from}|${side}`;
        if (!outgoing.has(key2)) outgoing.set(key2, []);
        outgoing.get(key2).push({ link, side, far: side === "top" || side === "bottom" ? b.x + b.w / 2 : b.y + b.h / 2 });
        if (headed.has(link.to)) {
          const endSide = a.y + a.h <= b.y ? "top" : a.y >= b.y + b.h ? "bottom" : a.x + a.w <= b.x ? "left" : "right";
          const along = endSide === "top" || endSide === "bottom" ? Math.max(b.x + b.w * 0.25, Math.min(b.x + b.w * 0.75, a.x + a.w / 2)) : Math.max(b.y + b.h * 0.25, Math.min(b.y + b.h * 0.75, a.y + a.h / 2));
          restPins.set(link.id, { ...restPins.get(link.id), end: { side: endSide, at: along } });
        }
      }
      for (const group of outgoing.values()) if (group.length > 1) {
        group.sort((a: any, b: any) => a.far - b.far);
        group.forEach(({ link, side }: any, i: any) => {
          const r = endRect(link.from), across = side === "top" || side === "bottom";
          const start = across ? r.x : r.y, length = across ? r.w : r.h;
          restPins.set(link.id, { ...restPins.get(link.id), start: { side, at: start + length * (i + 1) / (group.length + 1) } });
        });
      }
      const tierParents = new Set(rects.areas.filter((a) => a.node.area.derivedTiers).flatMap((a) => [...a.ids]));
      for (const link of atRest2) {
        if (!tierParents.has(link.from) || !tierParents.has(link.to)) continue;
        const a = endRect(link.from), b = endRect(link.to);
        if (b.y >= a.y + a.h && b.y - a.y - a.h <= UNITS.tierGap + 1) {
          const existing = restPins.get(link.id) ?? {};
          restPins.set(link.id, { ...existing, start: existing.start?.side === 'bottom' ? existing.start : { side: 'bottom', at: a.x + a.w / 2 }, end: { side: 'top', at: Math.max(b.x + b.w * 0.25, Math.min(b.x + b.w * 0.75, a.x + a.w / 2)) } });
        }
        if (b.y > a.y + a.h * 2 && b.x + b.w / 2 < a.x) restPins.set(link.id, { ...restPins.get(link.id), start: { side: "right", at: a.y + a.h / 2 }, end: { side: "right", at: b.y + b.h / 2 } });
        if (b.y > a.y + a.h * 2 && b.x + b.w / 2 > a.x + a.w) restPins.set(link.id, { ...restPins.get(link.id), start: { side: "right", at: a.y + a.h / 2 } });
      }
      const farTierSides = new Map<string, { link: DrawnLink; side: Side; farY: number }[]>();
      for (const link of atRest2) {
        if (!tierParents.has(link.from) || !tierParents.has(link.to)) continue;
        const a = endRect(link.from), b = endRect(link.to);
        const side: Side | null = b.x - (a.x + a.w) >= a.w ? 'right' : a.x - (b.x + b.w) >= a.w ? 'left' : null;
        if (!side || b.y <= a.y + a.h) continue;
        const key = `${link.from}|${side}`;
        if (!farTierSides.has(key)) farTierSides.set(key, []);
        farTierSides.get(key)!.push({ link, side, farY: b.y });
      }
      for (const group of farTierSides.values()) {
        group.sort((a, b) => a.farY - b.farY);
        group.forEach(({ link, side }, index) => {
          const a = endRect(link.from), b = endRect(link.to);
          const start = { side, at: a.y + a.h * (group.length - index) / (group.length + 1) };
          const end = b.y - a.y - a.h <= UNITS.tierGap + 1 ? { side: 'top' as const, at: b.x + b.w / 2 } : restPins.get(link.id)?.end;
          restPins.set(link.id, { ...restPins.get(link.id), start, end });
        });
      }
      for (const area of rects.areas) {
        if (area.node.area.arrange !== "stack" || area.node.area.derivedTiers) continue;
        const side = area.node.gutterSide === "left" ? "left" : "right";
        const order = new Map<string, number>(area.node.items.flatMap((item: any, index: any) => item.kind === "card" ? [[item.id, index]] : []));
        const internal = atRest2.filter((link) => order.has(link.from) && order.has(link.to) && Math.abs(order.get(link.from)! - order.get(link.to)!) > 1);
        const ends = /* @__PURE__ */ new Map();
        for (const link of internal) for (const end of ["from", "to"] as const) {
          const id = link[end], other = endRect(end === "from" ? link.to : link.from);
          if (!ends.has(id)) ends.set(id, []);
          ends.get(id).push({ link, end, far: other.y + other.h / 2 });
        }
        for (const [id, group] of ends) {
          group.sort((a: any, b: any) => b.far - a.far);
          const r = endRect(id);
          group.forEach(({ link, end }: any, i: any) => {
            const pin = { side, at: r.y + r.h * (i + 1) / (group.length + 1) };
            restPins.set(link.id, { ...restPins.get(link.id), [end === "from" ? "start" : "end"]: pin });
          });
        }
      }
      const asks = atRest2.flatMap((link) => {
        const look = lineLook(link);
        return look.word ? [{ key: `pill|${link.id}`, make: () => pillElement(look) }] : [];
      });
      measurer.sizeAll(asks);
      const wordSizes = new Map(atRest2.flatMap((link) => {
        const look = lineLook(link);
        return look.word ? [[link.id, measurer.size(`pill|${link.id}`, () => pillElement(look))] as const] : [];
      }));
      const hard = [...rects.cards.values(), ...rects.words];
      const placeWordsOnce = (links: any, routes2: any, taken: any, lines: any, priority: string[] = [], keepInside = false) => {
        const pills2 = /* @__PURE__ */ new Map();
        const crowded3 = [];
        const priorityIds = new Map<string, number>();
        for (const id of priority) if (!priorityIds.has(id)) priorityIds.set(id, priorityIds.size);
        const ordered = [...links].sort((a, b) => (priorityIds.get(a.id) ?? priorityIds.size) - (priorityIds.get(b.id) ?? priorityIds.size));
        for (const link of ordered) {
          const look = lineLook(link);
          if (!look.word) continue;
          const size = measurer.size(`pill|${link.id}`, () => pillElement(look));
          const others = [...lines].filter(([id]) => id !== link.id).map(([, points]) => points);
          const { rect, clear } = placePill(routes2.get(link.id), size, hard, [...taken, ...pills2.values()], others, keepInside ? 0 : -Infinity);
          pills2.set(link.id, rect);
          if (!clear) crowded3.push(link.id);
        }
        return { pills: pills2, crowded: crowded3 };
      };
      const placeWords = (links: any, routes2: any, taken: any, lines: any, priority: string[] = [], keepInside = false) => {
        const initial = placeWordsOnce(links, routes2, taken, lines, priority, keepInside);
        // Placing the outermost pill first may free a position that was occupied by a later pill.
        // Retain a complete, no-more-crowded placement if the reordered pass cannot improve it.
        const outside = keepInside ? [...initial.pills].filter(([, r]: [string, Rect]) => r.x < 0).sort((a: [string, Rect], b: [string, Rect]) => a[1].x - b[1].x).map(([id]: [string, Rect]) => id) : [];
        if (!initial.crowded.length && !outside.length) return initial;
        const retry = placeWordsOnce(links, routes2, taken, lines, [...outside, ...initial.crowded, ...priority], keepInside);
        const noNewCrowded = retry.crowded.every((id: string) => initial.crowded.includes(id));
        const left = (placed: any) => Math.min(0, ...[...placed.pills.values()].map((r: any) => r.x));
        return noNewCrowded && (retry.crowded.length < initial.crowded.length || keepInside && left(retry) > left(initial)) ? retry : initial;
      };
      const preliminaryWords = placeWords(atRest2, restMoved, [], restMoved);
      const outerWords = fitRoom === undefined ? [] : [...preliminaryWords.pills].filter(([, r]: [string, Rect]) => r.x < -fitRoom).sort((a: [string, Rect], b: [string, Rect]) => a[1].x - b[1].x).map(([id]: [string, Rect]) => id);
      // Only a crowded word routes the lines at rest around the words. A word that is only outside
      // is left to the guarded retry below and to the inside placement of the bounded pass.
      let needsWords = preliminaryWords.crowded.length > 0;
      let wordPriority = needsWords ? [...new Set([...outerWords, ...preliminaryWords.crowded])] : [];
      const leftmostCard = Math.min(...[...rects.cards.values()].map((rect) => rect.x));
      const nearFit = layout2.W <= (frameW - 2 * CANVAS_PAD) / (12 / SMALLEST_UNITS) + 2 * ROUTE_ROOM;
      const wordFirst = nearFit ? atRest2.filter((link) => wordSizes.has(link.id) && endRect(link.from).x <= leftmostCard + 1 && endRect(link.to).x <= leftmostCard + 1).map((link) => link.id) : [];
      let rest = await away.routeAndKeep(atRest2, endRect, needsWords ? { ...rects, wordSizes, wordPriority, wordFirst } : rects, layout2, bands2, null, restPins, true);
      let initialWords = needsWords ? { pills: rest.pills, crowded: rest.crowded } : placeWords(atRest2, rest.routes, [], rest.routes);
      // The final pinned pass can put a pill outside even when the preliminary route did not.
      // Retry that case in the worker, retaining the original if it does not improve the left
      // edge without introducing crowded words or extra crossings at rest.
      const finalOuter = fitRoom === undefined ? [] : [...initialWords.pills].filter(([, r]: [string, Rect]) => r.x < -fitRoom).map(([id]: [string, Rect]) => id);
      if (!needsWords && finalOuter.length) {
        const crossings = (routes: Map<string, Point[]>) => {
          const all = [...routes.values()];
          let count = 0;
          const inside = (p: number, a: number, b: number) => p > Math.min(a, b) + 0.5 && p < Math.max(a, b) - 0.5;
          for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            const a = all[i]!, b = all[j]!;
            for (let x = 1; x < a.length; x++) for (let y = 1; y < b.length; y++) {
              const p = a[x - 1]!, q = a[x]!, r = b[y - 1]!, s = b[y]!;
              const ah = Math.abs(p.y - q.y) < 0.01, bh = Math.abs(r.y - s.y) < 0.01;
              if (ah === bh) continue;
              const [h0, h1, v0, v1] = ah ? [p, q, r, s] : [r, s, p, q];
              if (inside(v0!.x, h0!.x, h1!.x) && inside(h0!.y, v0!.y, v1!.y)) count++;
            }
          }
          return count;
        };
        try {
          const retry = await away.routeAndKeep(atRest2, endRect, { ...rects, wordSizes, wordPriority: finalOuter, wordFirst: finalOuter }, layout2, bands2, null, restPins, true);
          const left = (pills: Map<string, Rect>) => Math.min(0, ...[...pills.values()].map((r) => r.x));
          const extent = (routes: Map<string, Point[]>, pills: Map<string, Rect>) => {
            const xs = [...routes.values()].flat().map((point) => point.x);
            return Math.max(layout2.W, ...xs, ...[...pills.values()].map((r) => r.x + r.w)) - Math.min(0, ...xs, left(pills));
          };
          if (left(retry.pills) > left(initialWords.pills) && extent(retry.routes, retry.pills) <= extent(rest.routes, initialWords.pills) && retry.crowded.every((id: string) => initialWords.crowded.includes(id)) && crossings(retry.routes) <= crossings(rest.routes)) {
            rest = retry;
            initialWords = { pills: retry.pills, crowded: retry.crowded };
            wordPriority = finalOuter;
            needsWords = true;
          }
        } catch { signal?.throwIfAborted(); /* Keep the complete original route when the retry fails. */ }
      }
      const initialRoutes = new Map(rest.routes);
      const movedRuns = clearFrameRuns(rest.routes, [...rects.cards.values()], [...rects.areas.filter((area) => area.framed).map((area) => area.rect), ...bands2]);
      let restWords = movedRuns ? placeWords(atRest2, rest.routes, [], rest.routes, wordPriority) : initialWords;
      if (!needsWords && restWords.crowded.length > initialWords.crowded.length) {
        rest.routes.clear();
        for (const [id, points] of initialRoutes) rest.routes.set(id, points);
        restWords = initialWords;
      }
      if (needsWords) {
        const rightLimit = Math.max(layout2.W, ...[...rest.routes.values()].flat().map((point: Point) => point.x));
        for (const [id, pill] of restWords.pills as Map<string, Rect>) {
          if (pill.x + pill.w <= rightLimit) continue;
          const otherPills = [...restWords.pills].filter(([key]) => key !== id).map(([, rect]) => rect);
          const otherLines = [...rest.routes].filter(([key]) => key !== id).map(([, points]) => points) as Point[][];
          const alternative = placePill(rest.routes.get(id)!, wordSizes.get(id)!, hard, otherPills, otherLines, Math.min(-20, pill.x), rightLimit);
          if (alternative.clear && alternative.rect.x + alternative.rect.w < pill.x + pill.w) {
            restWords.pills.set(id, alternative.rect);
            restWords.crowded = restWords.crowded.filter((linkId: string) => linkId !== id);
          }
        }
      }
      const selRects = { ...rects, under: [...restWords.pills.values()], restLinks: atRest2 };
      const selections2 = /* @__PURE__ */ new Map();
      // Other route inputs are fixed within this plan, so the links decide reuse.
      const selectionCache = new Map<string, any>();
      const selectionFailed = new Map<string, any>();
      const selectionOf = async (lane: RoutesAway, rawLinks: any) => {
        const visible = withKindWords([...atRest2, ...rawLinks]);
        const activeRest = visible.slice(0, atRest2.length);
        const links = visible.slice(atRest2.length);
        const restKept = { links: atRest2, routes: rest.routes };
        const first = await lane.route(links, endRect, selRects, layout2, bands2, rest);
        const moved = await lane.route(links, endRect, selRects, layout2, bands2, rest, avoidsOf(links, first.routes, endRect, restKept));
        const once = await lane.route(links, endRect, selRects, layout2, bands2, rest, pinsOf(links, moved.routes, endRect, restKept), true);
        const sel = once;
        const lines = new Map([...rest.routes, ...sel.routes]);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        const selectedRestWords = placeWords(activeRest, rest.routes, [], lines);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        const selectedWords2 = placeWords(links, sel.routes, [...selectedRestWords.pills.values()], lines);
        return { links, routes: sel.routes, loose: sel.loose, restPills: selectedRestWords.pills, pills: selectedWords2.pills, crowded: [...selectedRestWords.crowded, ...selectedWords2.crowded] };
      };
      // A line shown on a selection that has no route is left out, and the selections are worked out again from the
      // first, as a new plan would, but the lines at rest are kept: no line at rest is shown on a selection, so leaving
      // it out changes none of them, and a selection whose lines are the same is taken from the cache. A new plan for
      // each such line made block 08 of the made-up master at real shape at 660 forty-three times, in 308 s (round 232).
      // The selections not yet worked out are routed at the same time, by this plan's worker and its helpers, and are
      // then read in their order, so the first with a line that has no route is the one that routing them one after
      // another stops at. A selection's routes depend on nothing but its own lines, so they are the same either way.
      let lanes: RoutesAway[] | null = null;
      selections: for (;;) {
        const shownOn = [...groups].map(([id, rawGroup]) => {
          const rawLinks = rawGroup.filter((link: any) => !unavailable2.has(link.id));
          return { id, rawLinks, key: JSON.stringify(rawLinks) };
        }).filter((one) => one.rawLinks.length);
        const asked = [...new Map(shownOn.filter((one) => !selectionCache.has(one.key) && !selectionFailed.has(one.key)).map((one) => [one.key, one.rawLinks]))];
        if (asked.length) {
          if (lanes === null) lanes = await away.lanes(rest, asked.length);
          let next = 0;
          await Promise.all(lanes.map(async (lane) => {
            for (let job = asked[next++]; job !== undefined; job = asked[next++]) {
              const [key, rawLinks] = job;
              try {
                selectionCache.set(key, await selectionOf(lane, rawLinks));
              } catch (error) {
                selectionFailed.set(key, error);
              }
            }
          }));
        }
        selections2.clear();
        for (const { id, key } of shownOn) {
          if (!selectionFailed.has(key)) {
            selections2.set(id, selectionCache.get(key));
            continue;
          }
          const error = selectionFailed.get(key);
          if (typeof error?.linkId !== "string" || unavailable2.has(error.linkId) || !onSelection.some((link) => link.id === error.linkId)) throw error;
          unavailable2.set(error.linkId, NO_ROUTE);
          continue selections;
        }
        break;
      }
      const boundsOf = (words: any, selections: Map<string, any>) => {
        const box = { x0: 0, y0: 0, x1: layout2.W, y1: layout2.H };
        const grow = (x0: number, y0: number, x1: number, y1: number) => Object.assign(box, { x0: Math.min(box.x0, x0), y0: Math.min(box.y0, y0), x1: Math.max(box.x1, x1), y1: Math.max(box.y1, y1) });
        for (const routes2 of [rest.routes, ...[...selections.values()].map((s) => s.routes)]) for (const points of routes2.values()) for (const p of points) grow(p.x, p.y, p.x, p.y);
        for (const pills2 of [words.pills, ...[...selections.values()].flatMap((s) => [s.pills, s.restPills])]) for (const r of pills2.values()) grow(r.x, r.y, r.x + r.w, r.y + r.h);
        return box;
      };
      const availableWidth = frameW / (12 / SMALLEST_UNITS);
      let box2 = boundsOf(restWords, selections2);
      // Only drawings that actually overflow need a second, bounded selection-route pass.
      if (fitRoom !== undefined && box2.x1 - box2.x0 > availableWidth && lanes?.length) {
        const insideWords = placeWords(atRest2, rest.routes, [], rest.routes, [], true);
        const fixedRects = { ...selRects, under: [...insideWords.pills.values()], fitRoom, clearedRest: rest.routes };
        const alternate = new Map<string, any>();
        const entries = [...selections2];
        let next = 0;
        await Promise.all(lanes.map(async (lane) => {
          for (let job = entries[next++]; job !== undefined; job = entries[next++]) {
            const [id, selection] = job;
            let routes = selection.routes, loose = selection.loose;
            const outside = [...routes.values()].some((points: Point[]) => points.some((point) => point.x < -fitRoom || point.x > layout2.W + fitRoom));
            if (outside) try {
              const kept = { links: atRest2, routes: rest.routes };
              const pins = pinsOf(selection.links, routes, endRect, kept);
              const retry = await lane.route(selection.links, endRect, { ...fixedRects, initialSelection: { routes, loose } }, layout2, bands2, rest, pins, true);
              routes = retry.routes; loose = retry.loose;
            } catch { /* Keep the complete baseline selection when a bounded attempt cannot route. */ }
            const lines = new Map([...rest.routes, ...routes]);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            signal?.throwIfAborted();
            const selectedRestWords = placeWords(atRest2, rest.routes, [], lines, [], true);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            signal?.throwIfAborted();
            const selectedWords = placeWords(selection.links, routes, [...selectedRestWords.pills.values()], lines, [], true);
            alternate.set(id, { ...selection, routes, loose, restPills: selectedRestWords.pills, pills: selectedWords.pills, crowded: [...selectedRestWords.crowded, ...selectedWords.crowded] });
          }
        }));
        const proposed = boundsOf(insideWords, alternate);
        const noNewCrowded = insideWords.crowded.every((id: string) => restWords.crowded.includes(id)) && [...alternate].every(([id, selection]) => selection.crowded.every((link: string) => selections2.get(id).crowded.includes(link)));
        // Several selections can share an extreme. Keep a safe partial improvement even when
        // another selection or pill still prevents the whole drawing from fitting.
        if (proposed.x1 - proposed.x0 <= box2.x1 - box2.x0 && noNewCrowded) {
          restWords = insideWords;
          selections2.clear();
          for (const [id, selection] of alternate) selections2.set(id, selection);
          box2 = proposed;
        }
      }
      // The gate marks are placed once the words at rest are final, so a mark is drawn only on a clear place. The layout,
      // the routes and the words at rest are planned without the marks, so a mark moves no other line's words; and a mark
      // keeps inside box2's width, so it does not change the card the fit chooses (round 238).
      const gates = placeGateMarks(atRest2.filter((link) => link.gate !== null && link.gate !== undefined), rest.routes, GATE_SIZE, hard, restWords.pills, box2.x0, box2.x1);
      const movedWords = [...gates.words].filter(([id, rect]) => restWords.pills.get(id) !== rect).map(([id]) => id);
      restWords = { pills: gates.words, crowded: restWords.crowded.filter((id: string) => !movedWords.includes(id)) };
      for (const r of [...gates.marks.values(), ...gates.words.values()]) Object.assign(box2, { x0: Math.min(box2.x0, r.x), y0: Math.min(box2.y0, r.y), x1: Math.max(box2.x1, r.x + r.w), y1: Math.max(box2.y1, r.y + r.h) });
      const crowded2 = [...restWords.crowded, ...[...selections2.values()].flatMap((s) => s.crowded)];
      const loose2 = [...rest.loose, ...[...selections2].flatMap(([id, s]) => s.loose.map((l: any) => ({ ...l, selected: id })))];
      return { layout: layout2, rects, bands: bands2, routes: rest.routes, pills: restWords.pills, gates: gates.marks, gateMarksWithNoPlace: gates.noPlace, selections: selections2, crowded: crowded2, loose: loose2, unavailable: unavailable2, rung: rung2, card: card2, box: { x: box2.x0, y: box2.y0, w: box2.x1 - box2.x0, h: box2.y1 - box2.y0 } };
    } catch (error: any) {
      if (typeof error?.linkId !== "string" || unavailable2.has(error.linkId)) throw error;
      unavailable2.set(error.linkId, NO_ROUTE);
      return await planAt(rung2, card2, unavailable2, away);
    } finally {
      if (held === null) away.end();
    }
  };
  const ladder = [3];
  if (!ladder.length) throw new Error(`the trial names no rung on the ladder: ${JSON.stringify(opts.rungs)}`);
  // Measures the headings and screens the card widths, and gives the widths the plans are tried at.
  const screenWidths = async () => {
    const cardIds = new Set(drawing.notPlaced);
    const collectCards = (area: DrawingArea) => {
      for (const item of area.items) {
        if ('record' in item) cardIds.add(item.record);
        else collectCards(item.area);
      }
    };
    for (const area of drawing.tree.areas) collectCards(area);
    // Measuring the headings forces layout. They are measured 8 at a time, and the page is given a turn between batches
    // and before width screening.
    let minimumCard = 1;
    const heads = [...cardIds].map((id) => ({ record: records.get(id)!, facts: facts.get(id) }));
    for (let from = 0; from < heads.length; from += 8) {
      const batch = heads.slice(from, from + 8);
      for (const head of cardHeadSizes(measurer, batch, 3)) minimumCard = Math.max(minimumCard, head.width);
      if (batch.length === 8) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
      }
    }
    const widths = [...opts.card].filter((value) => value >= minimumCard);
    if (!widths.includes(minimumCard)) widths.push(minimumCard);
    const maxNaturalWidth = (frameW - 2 * CANVAS_PAD) / (12 / SMALLEST_UNITS) - 2 * ROUTE_ROOM;
    const tierLengths = (area: DrawingArea): number[] => [area.tierRow ? area.items.length : 0, ...area.items.flatMap(item => 'area' in item ? tierLengths(item.area) : [])];
    const largestTier = Math.max(0, ...drawing.tree.areas.flatMap(tierLengths));
    if (largestTier > 1) {
      const fitting = widths.filter(card2 => largestTier * card2 + (largestTier - 1) * 56 <= frameW - 2 * CANVAS_PAD - 2 * ROUTE_ROOM);
      if (fitting.length) widths.splice(0, widths.length, ...fitting);
    }
    let firstWidth = -1;
    for (let index = 0; index < widths.length; index++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal?.throwIfAborted();
      const card2 = widths[index]!;
      // A width is screened by the drawing's natural width alone, so a width that does not fit is not laid out further.
      const layout = layoutAt(drawing.tree, drawing.notPlaced, records, atRest, measurer, 3, { card: card2, facts, besideLast: opts.besideLast, rowWidth: rowWidthAt(card2), widest: maxNaturalWidth });
      if (layout !== null) {
        screenedLayout = { card: card2, layout };
        firstWidth = index;
        break;
      }
    }
    widths.splice(0, firstWidth < 0 ? widths.length - 1 : firstWidth);
    if (!widths.length || widths.some((w) => !(w > 0))) throw new Error(`the card widths are ${JSON.stringify(opts.card)}, not a list of widths`);
    return widths;
  };
  // The first plan's routing worker is started before the headings are measured, so it loads its code while they and
  // the widths are worked out (round 238). The first plan takes it in place of starting its own, and ends it as its own.
  // A drawing that fails before that plan ends it here.
  started = new RoutesAway(routingWorker(), signal);
  const widths = await screenWidths().catch((error: unknown) => {
    started?.end();
    throw error;
  });
  const tries = [];
  let chosen = null;
  if (view === "reading") chosen = { ...await planAt(ladder[0]!, widths[0]!), zoom: READING_ZOOM };
  fit: for (const rung2 of view === "reading" ? [] : ladder)
    for (const card2 of widths) {
      const plan = await planAt(rung2, card2);
      const zoom2 = Math.max(12 / SMALLEST_UNITS, Math.min(1, (frameW - 2 * CANVAS_PAD) / plan.box.w));
      const smallestPx = SMALLEST_UNITS * zoom2;
      tries.push({ rung: rung2, card: card2, zoom: round(zoom2, 4), smallestPx: round(smallestPx, 2), natural: { w: round(plan.box.w, 1), h: round(plan.box.h, 1) } });
      chosen = { ...plan, zoom: zoom2 };
      if (plan.box.w * (12 / SMALLEST_UNITS) <= frameW - 2 * CANVAS_PAD || card2 === widths.at(-1)) break fit;
    }
  if (!chosen) throw new Error("No drawing layout was found");
  // The slot says it is the lanes, and at which level, only once its plan is made (round 231). While the worker routes,
  // the page keeps the drawing before on screen and makes this one beside it, and this one is not the drawing yet.
  slot.dataset.drawing = "lanes";
  slot.dataset.level = tree.level;
  const { layout, routes, pills, gates, gateMarksWithNoPlace, selections, crowded, loose, rung, card, box, zoom, unavailable } = chosen;
  shown = shown.filter((link) => !unavailable.has(link.id));
  atRest = atRest.filter((link: any) => !unavailable.has(link.id));
  slot.dataset.drawnLinks = JSON.stringify(atRest.map((link: any) => link.id));
  slot.dataset.notDrawn = JSON.stringify(Object.fromEntries(unavailable));
  slot.dataset.onSelection = JSON.stringify(Object.fromEntries([...groups].map(([id, links]) => [id, links.filter((link: any) => !unavailable.has(link.id)).map((link: any) => link.id)])));
  const fittedH = view ? innerH : Math.ceil(box.h * zoom + 2 * CANVAS_PAD);
  const world = el("div", "e-world");
  world.style.width = `${layout.W}px`;
  world.style.height = `${layout.H}px`;
  const ox = (view === "reading" ? CANVAS_PAD : Math.max(CANVAS_PAD, (frameW - box.w * zoom) / 2)) - box.x * zoom;
  const oy = (view === "reading" ? CANVAS_PAD : CANVAS_PAD) - box.y * zoom;
  world.style.transform = `translate(${ox}px, ${oy}px) scale(${zoom})`;
  const areaNodes: HTMLElement[] = [];
  const bands: HTMLElement[] = [];
  const drawArea = (node: LayoutNode): void => {
    if (node.kind === "card") return;
    const box2 = el("div", "e-area");
    box2.dataset.key = node.area.key;
    box2.dataset.framed = node.framed ? "1" : "0";
    if (node.area.frame) box2.dataset.frame = node.area.frame;
    box2.dataset.nested = node.nested ? "1" : "0";
    if (node.record) box2.dataset.head = node.record.id;
    Object.assign(box2.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` });
    if (node.tint && (node.framed || node.nested)) {
      box2.dataset.tint = node.tint;
      box2.style.setProperty("--e-tint", `var(${node.tint})`);
    } else if (node.tint) {
      const band = el("div", "e-band");
      band.dataset.bandOf = node.area.key;
      band.dataset.tint = node.tint;
      band.style.setProperty("--e-tint", `var(${node.tint})`);
      const r = bandRect(node, layout.W);
      Object.assign(band.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
      bands.push(band);
    }
    areaNodes.push(box2);
    if (node.area.heading !== null) {
      const head = headElementIn(node);
      const p = node.framed ? UNITS.framePad : 0;
      Object.assign(head.style, { position: "absolute", left: `${node.x + p}px`, top: `${node.y + p}px` });
      head.dataset.headOf = node.area.key;
      areaNodes.push(head);
    }
    for (const item of node.items) drawArea(item);
  };
  for (const top2 of layout.tops) drawArea(top2);
  world.append(...bands, ...areaNodes);
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", "e-lines");
  Object.assign(svg.style, { left: "0px", top: "0px", width: `${layout.W}px`, height: `${layout.H}px` });
  svg.setAttribute("viewBox", `0 0 ${layout.W} ${layout.H}`);
  const defs = document.createElementNS(SVG, "defs");
  const markerId = (tone: string) => `e-arrow-${tone}-${slot.dataset.pipelinePart ?? "slot"}`;
  for (const [tone, d] of [["plain", "M 1 1 L 11 6 L 1 11"], ["hard", "M 1 1 L 11 6 L 1 11 z"], ["partial", "M 1 6 L 6 1 L 11 6 L 6 11 z"]]) {
    const marker = document.createElementNS(SVG, "marker");
    for (const [k, v] of Object.entries({ id: markerId(tone!), viewBox: "0 0 12 12", refX: 11, refY: 6, markerWidth: 13, markerHeight: 13, markerUnits: "userSpaceOnUse", orient: "auto" })) marker.setAttribute(k, String(v));
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", d!);
    path.setAttribute("class", "e-arrow");
    path.dataset.tone = tone;
    marker.append(path);
    defs.append(marker);
  }
  svg.append(defs);
  const pathFor = (link: DrawnLink, points: Point[]) => {
    const look = lineLook(link);
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("class", "e-path");
    path.setAttribute("d", pathOf(points));
    path.setAttribute("marker-end", `url(#${markerId(look.tone)})`);
    path.dataset.tone = look.tone;
    path.dataset.type = link.type;
    path.dataset.link = link.id;
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute("aria-label", t("lanes.showLine"));
    path.style.pointerEvents = "stroke";
    const sayLine = () => {
      detail.textContent = [...(linesInWords(link.to, [link], records)?.children ?? [])].map((li) => li.textContent).join(" \xB7 ");
    };
    path.addEventListener("click", sayLine);
    path.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        sayLine();
      }
    });
    path.dataset.points = JSON.stringify(points.map((p: Point) => [round(p.x, 2), round(p.y, 2)]));
    if (link.inferred) path.dataset.inferred = "1";
    return path;
  };
  const parallelPoints = (points: Point[], distance: number) => {
    const normals = points.slice(1).map((p: Point, i: number) => ({ x: -Math.sign(p.y - points[i]!.y) * distance, y: Math.sign(p.x - points[i]!.x) * distance }));
    return points.map((p: Point, i: number) => {
      if (i === 0) return { x: p.x + normals[0]!.x, y: p.y + normals[0]!.y };
      if (i === points.length - 1) return { x: p.x + normals[i - 1]!.x, y: p.y + normals[i - 1]!.y };
      return { x: p.x + normals[i - 1]!.x + normals[i]!.x, y: p.y + normals[i - 1]!.y + normals[i]!.y };
    });
  };
  for (const link of atRest) {
    const points = routes.get(link.id)!, primary = pathFor(link, points);
    if (link.gate === "partial") {
      const companion = document.createElementNS(SVG, "path");
      companion.setAttribute("class", "e-partial-companion");
      companion.setAttribute("d", pathOf(parallelPoints(points, 2.5)));
      companion.dataset.link = link.id;
      primary.setAttribute("d", pathOf(parallelPoints(points, -2.5)));
      primary.removeAttribute("marker-end");
      const carrier = document.createElementNS(SVG, "path");
      carrier.setAttribute("d", pathOf(points.slice(-2)));
      carrier.setAttribute("fill", "none");
      carrier.setAttribute("stroke", "transparent");
      carrier.setAttribute("marker-end", `url(#${markerId("partial")})`);
      svg.append(companion, carrier);
    }
    svg.append(primary);
  }
  const selectedLines = document.createElementNS(SVG, "g");
  selectedLines.setAttribute("class", "e-selected-lines");
  svg.append(selectedLines);
  world.append(svg);
  const cards = /* @__PURE__ */ new Map();
  const restPaths = new Map([...svg.querySelectorAll<SVGPathElement>(":scope > path.e-path")].map((path) => [path.dataset.link, path]));
  const walkCards = (node: LayoutNode): void => {
    if (node.kind === "card") {
      const card2 = cardWithMeasuredMarks(measurer, records.get(node.id)!, rung, facts.get(node.id));
      Object.assign(card2.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` });
      card2.tabIndex = 0;
      card2.setAttribute("role", "button");
      card2.setAttribute("aria-pressed", "false");
      cards.set(node.id, card2);
      world.append(card2);
    } else for (const item of node.items) walkCards(item);
  };
  for (const top2 of layout.tops) walkCards(top2);
  const pillFor = (link: any, rect: any) => {
    const pill = pillElement(lineLook({ ...link, kindWord: ["consumes", "measures"].includes(link.type) || tree.level === "boxes" && link.type === "blocks" }));
    Object.assign(pill.style, { left: `${rect.x}px`, top: `${rect.y}px` });
    pill.dataset.link = link.id;
    return pill;
  };
  let openGate: HTMLElement | null = null;
  const closeGate = (mark: HTMLElement) => {
    mark.removeAttribute("data-open");
    mark.querySelector(".e-gate-words")?.remove();
    mark.removeAttribute("aria-describedby");
    mark.setAttribute("aria-expanded", "false");
    mark.setAttribute("aria-label", t("g7b.Canvas.why_this_is_closed"));
    mark.title = t("g7b.Canvas.say_why_this_block_is_closed");
    if (openGate === mark) openGate = null;
  };
  // The open words are one line beside their mark, at its right, left, foot or head: the first place where the whole of
  // them is inside the frame and the window and the page draws nothing over them, read at their middle and corners
  // with elementFromPoint, so the legend counts. While open they may lie over the drawing's other parts. Each corner
  // point steps in by 0.3 of the corner's radius on screen and a pixel more, so it lies inside the rounded corner: a
  // point a pixel in from both edges lies outside a corner of 4 px and reads what is behind the words (round 238).
  const placeGateWords = (mark: HTMLElement, said: HTMLElement) => {
    const at = mark.getBoundingClientRect();
    const scale = at.width / mark.offsetWidth || 1;
    const size = said.getBoundingClientRect();
    const style = getComputedStyle(said);
    const step = (radius: string) => 0.3 * scale * Math.max(0, ...radius.split(" ").map(parseFloat).filter(Number.isFinite)) + 1;
    const [topLeft, topRight, bottomLeft, bottomRight] = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius, style.borderBottomRightRadius].map(step) as [number, number, number, number];
    const seen = frame.getBoundingClientRect();
    const bounds = { left: Math.max(seen.left, 0) + 2, top: Math.max(seen.top, 0) + 2, right: Math.min(seen.right, document.documentElement.clientWidth) - 2, bottom: Math.min(seen.bottom, document.documentElement.clientHeight) - 2 };
    const within = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
    const beside = (left: number) => ({ left, top: within((at.top + at.bottom - size.height) / 2, bounds.top, bounds.bottom - size.height) });
    const level = (top: number) => ({ left: within((at.left + at.right - size.width) / 2, bounds.left, bounds.right - size.width), top });
    const places = [beside(at.right + 4), beside(at.left - 4 - size.width), level(at.bottom + 4), level(at.top - 4 - size.height)];
    const inside = places.filter((p) => p.left >= bounds.left && p.top >= bounds.top && p.left + size.width <= bounds.right && p.top + size.height <= bounds.bottom);
    const put = (p: { left: number; top: number }) => Object.assign(said.style, { left: `${(p.left - at.left) / scale - mark.clientLeft}px`, top: `${(p.top - at.top) / scale - mark.clientTop}px` });
    for (const p of inside) {
      put(p);
      const box = said.getBoundingClientRect();
      const points = [[(box.left + box.right) / 2, (box.top + box.bottom) / 2], [box.left + topLeft, box.top + topLeft], [box.right - topRight, box.top + topRight], [box.left + bottomLeft, box.bottom - bottomLeft], [box.right - bottomRight, box.bottom - bottomRight]];
      if (points.every(([x, y]) => said.contains(document.elementFromPoint(x!, y!)))) return;
    }
    put(inside[0] ?? places[0]!);
  };
  // The gate's own mark: the old board's shape for a hard or partial gate, a control that opens the gate's words on the
  // drawing and puts them away again. It is one function's words with the line's list (gateWordsFor), and a real button.
  const gateMarkFor = (link: DrawnLink) => {
    const mark = el("button", "e-gate-mark") as HTMLButtonElement;
    mark.type = "button";
    mark.dataset.link = link.id;
    mark.dataset.gate = link.gate ?? "";
    mark.setAttribute("aria-expanded", "false");
    mark.setAttribute("aria-label", t("g7b.Canvas.why_this_is_closed"));
    mark.title = t("g7b.Canvas.say_why_this_block_is_closed");
    const glyph = document.createElementNS(SVG, "svg");
    glyph.setAttribute("class", "e-gate-glyph");
    glyph.setAttribute("viewBox", "0 0 16 16");
    glyph.setAttribute("aria-hidden", "true");
    for (const d of link.gate === "hard" ? ["M1.6 8h5.2", "M9.4 2v12"] : ["M1.6 8h12.8", "M9.4 2v3.4", "M9.4 10.6V14"]) {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", d === "M1.6 8h5.2" || d === "M1.6 8h12.8" ? "1.8" : "2.4");
      path.setAttribute("stroke-linecap", "round");
      glyph.append(path);
    }
    mark.append(glyph);
    mark.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (mark.dataset.open === "1") { closeGate(mark); return; }
      const words = gateWordsFor(link);
      if (words === null) return;
      if (openGate !== null) closeGate(openGate);
      mark.dataset.open = "1";
      mark.setAttribute("aria-expanded", "true");
      mark.setAttribute("aria-label", t("g7b.Canvas.put_away_why_this_is_closed"));
      mark.title = t("g7b.Canvas.put_away_why_this_block_is_closed");
      const said = el("span", "e-gate-words", words);
      said.id = `e-gate-words-${link.id}`;
      mark.append(said);
      placeGateWords(mark, said);
      mark.setAttribute("aria-describedby", said.id);
      openGate = mark;
    });
    return mark;
  };
  const drawRestGateMarks = () => {
    for (const link of atRest) {
      const rect = gates.get(link.id);
      if (rect === undefined) continue;
      const mark = gateMarkFor(link);
      Object.assign(mark.style, { left: `${rect.x}px`, top: `${rect.y}px` });
      world.append(mark);
    }
  };
  const restPillNodes = /* @__PURE__ */ new Map();
  for (const [id, rect] of pills) {
    const node = pillFor(shown.find((link) => link.id === id), rect);
    restPillNodes.set(id, node);
    world.append(node);
  }
  drawRestGateMarks();
  const selectedWords = el("div", "e-selected-words");
  world.append(selectedWords);
  const key = el("div", "e-key");
  const compactKey = tree.level === "boxes" || shown.some((link) => link.gate === "hard" || link.gate === "partial");
  if (compactKey) key.classList.add("e-key-compact");
  if (snapshot.byStep) key.append(el("span", "", t("lanes.byStep")));
  if (snapshot.blockLegend) {
    key.append(el("span", "e-block-legend-head", t("lanes.blocks")));
    for (const block of snapshot.blockLegend) {
      const entry = el("span", "e-block-legend-entry");
      entry.dataset.block = block.id;
      const badge = el("span", "e-badge", t("bigMap.place", { n: block.place }));
      badge.dataset.module = String(block.place);
      entry.append(badge);
      if (block.pipelines.length === 0) entry.append(document.createTextNode(block.title));
      block.pipelines.forEach((pipeline, n) => {
        if (n) entry.append(document.createTextNode(", "));
        const link = el("a", "", pipeline.title);
        link.href = pipeline.href;
        entry.append(link);
      });
      key.append(entry);
    }
  }
  const keyTypes = new Set(shown.map((link) => link.type));
  const addKey = (tone: string, label: string, dashed = false) => {
    const group = el("span");
    const sample = document.createElementNS(SVG, "svg");
    sample.setAttribute("class", "e-key-sample");
    sample.setAttribute("viewBox", "0 0 40 14");
    sample.setAttribute("aria-hidden", "true");
    const stroke = document.createElementNS(SVG, "path");
    stroke.setAttribute("class", "e-key-stroke");
    stroke.setAttribute("d", tone === "partial" ? "M 1 4 H 28 M 1 10 H 28" : "M 1 7 H 28");
    if (dashed) stroke.setAttribute("stroke-dasharray", "6 5");
    const arrow = document.createElementNS(SVG, "path");
    arrow.setAttribute("class", "e-arrow");
    arrow.dataset.tone = tone;
    arrow.setAttribute("transform", "translate(17 1)");
    arrow.setAttribute("d", tone === "plain" ? "M 1 1 L 11 6 L 1 11" : tone === "hard" ? "M 1 1 L 11 6 L 1 11 z" : "M 1 6 L 6 1 L 11 6 L 6 11 z");
    sample.append(stroke, arrow);
    group.append(sample, document.createTextNode(" " + label));
    key.append(group);
  };
  if (tree.level === "boxes") {
    key.append(el("span", "", t("lanes.progress")));
    for (const state of ["done", "doing", "blocked", "todo", null]) {
      const item = el("span"), mark = el("i", "e-mark e-key-mark");
      mark.dataset.state = state ?? "unrecorded";
      item.append(mark, document.createTextNode(" " + stateWord(state).text));
      key.append(item);
    }
  }
  if (shown.some((link) => link.type === "blocks")) addKey("plain", t("lanes.waitsDirection"));
  if (shown.some((link) => link.gate === "hard")) addKey("hard", t("g7b.PipelineFlow.hard_gate"));
  if (shown.some((link) => link.gate === "partial")) addKey("partial", t("g7b.PipelineFlow.partial_gate"));
  if (keyTypes.has("implements")) addKey("plain", t("lanes.carriesKey"), true);
  const detail = el("div", "e-key-detail");
  key.append(detail);
  frame.append(key);
  slot.append(detail);
  // The legend may wrap onto a second line, so the frame leaves room for the height the legend has once it is laid
  // out; 26 px is the height a one-line legend takes, and it stays the frame's height at the widths where it does not wrap (round 231).
  if (!view) frame.style.height = `${fittedH + Math.max(26, key.offsetHeight + 5)}px`;
  let selected: string | null = null;
  const select = (id: string) => {
    selected = id === selected ? null : id;
    onSelect?.(selected);
    selectedLines.replaceChildren();
    selectedWords.replaceChildren();
    for (const [cardId, card2] of cards) {
      card2.setAttribute("aria-pressed", String(cardId === selected));
      if (cardId === selected) card2.dataset.selected = "1";
      else delete card2.dataset.selected;
      // A card let go closes the note that says why its Detail tick cannot be turned on.
      if (cardId !== selected) for (const note of card2.querySelectorAll(".e-detail-reason")) (note as HTMLElement).hidden = true;
    }
    for (const card2 of cards.values()) {
      delete card2.dataset.lit;
      delete card2.dataset.dim;
    }
    for (const path of svg.querySelectorAll<SVGPathElement>(":scope > .e-partial-companion, :scope > path.e-path")) {
      delete path.dataset.active;
      delete path.dataset.dim;
    }
    delete slot.dataset.selected;
    const sel = selected === null ? null : selections.get(selected);
    const connectedIds = new Set(selected === null ? [] : shown.filter((link) => link.from === selected || link.to === selected).map((link) => link.id));
    const places = selected === null ? pills : new Map([...sel ? sel.restPills : pills].filter(([id2]) => connectedIds.has(id2)));
    for (const node of restPillNodes.values()) node.remove();
    restPillNodes.clear();
    for (const [id2, rect] of places) {
      const node = pillFor(shown.find((link) => link.id === id2), rect);
      restPillNodes.set(id2, node);
      world.append(node);
    }
    if (selected === null) {
      detail.textContent = "";
      return;
    }
    const connected = shown.filter((link) => link.from === selected || link.to === selected);
    const neighbours = /* @__PURE__ */ new Set([selected, ...connected.flatMap((link) => [link.from, link.to])]);
    for (const [cardId, card2] of cards) if (!neighbours.has(cardId)) card2.dataset.dim = "1";
    else if (cardId !== selected) card2.dataset.lit = "1";
    for (const link of atRest) {
      const paths = [restPaths.get(link.id), ...svg.querySelectorAll<SVGPathElement>(":scope > .e-partial-companion")].filter((path) => path?.dataset.link === link.id);
      for (const path of paths) {
        if (!path) continue;
        if (connected.some((l) => l.id === link.id)) path.dataset.active = "1";
        else path.dataset.dim = "1";
      }
    }
    detail.textContent = [...(linesInWords(selected, connected, records)?.children ?? [])].map((li) => li.textContent).join(" \xB7 ");
    if (!sel) {
      slot.dataset.selected = selected;
      return;
    }
    for (const link of sel.links) {
      const other = cards.get(link.from === selected ? link.to : link.from);
      if (other) other.dataset.lit = "1";
    }
    for (const link of sel.links) selectedLines.append(pathFor(link, sel.routes.get(link.id)));
    for (const link of sel.links) if (sel.pills.has(link.id)) selectedWords.append(pillFor(link, sel.pills.get(link.id)));
    slot.dataset.selected = selected;
  };
  for (const [id, card2] of cards) {
    if (!card2.hasAttribute("role")) continue;
    card2.addEventListener("click", (event: MouseEvent) => {
      if (!(event.target as Element).closest("a")) select(id);
    });
    card2.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.target === card2 && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        select(id);
      }
    });
  }
  slot.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (openGate !== null) {
      closeGate(openGate);
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (selected !== null) select(selected);
  });
  const drawnSelected = heldCard?.() ?? null;
  if (drawnSelected !== null && cards.has(drawnSelected)) select(drawnSelected);
  measurer.done();
  frame.append(world);
  slot.dataset.restPills = JSON.stringify(Object.fromEntries(pills));
  slot.dataset.selectionRoutes = JSON.stringify(
    Object.fromEntries([...selections].map(([id, s]) => [id, { routes: Object.fromEntries([...s.routes].map(([l, ps]) => [l, ps.map((p: Point) => [round(p.x, 2), round(p.y, 2)])])), pills: Object.fromEntries(s.pills), restPills: Object.fromEntries(s.restPills) }]))
  );
  slot.dataset.fit = JSON.stringify({ ...view ? { view } : {}, trial: opts, zoom: round(zoom, 4), rung, card, smallestPx: round(SMALLEST_UNITS * zoom, 2), frame: { w: frameW, h: fittedH }, natural: { w: round(box.w, 1), h: round(box.h, 1), x: box.x, y: box.y }, tries, crowdedWords: crowded, looseEnds: loose, gateMarksWithNoPlace });
}
function round(n: number, places: number) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
/** The words a waits-on line's gate says, the same words in the line's list and on the gate's own mark. */
function gateWordsFor(link: DrawnLink): string | null {
  return link.type === "blocks" && link.gate !== null
    ? gateWordsForReader(link.gate === "partial" && link.upTo !== null ? { kind: "partial", upTo: link.upTo } : { kind: link.gate }, link.stage)
    : null;
}
function linesInWords(id: string, links: DrawnLink[], records: Map<string, DrawnRecord>) {
  const list = el("ul", "e-said");
  for (const link of links) {
    if (link.from !== id && link.to !== id) continue;
    const out = link.from === id;
    const other = out ? link.to : link.from;
    const title = records.get(other)?.title ?? other;
    const words = link.type === "blocks" ? out ? t("lanes.waitedOnBy", { title }) : t("lanes.waitsOn", { title }) : t("lanes.relationship", { word: linkWord(link.type, out ? "forward" : "reverse").text, title });
    // A wait says how much it blocks, in the words a step card gives its gate, after the same dash (round 230).
    const gate = gateWordsFor(link);
    const li = el("li", "", gate === null ? words : `${words} — ${gate}`);
    if (link.carries) li.append(document.createTextNode(": " + link.carries));
    list.append(li);
  }
  return list.childElementCount ? list : null;
}
function outline(tree: DrawingTree, notPlaced: string[], records: Map<string, DrawnRecord>, links: DrawnLink[], facts: Map<string, Facts>): HTMLElement {
  const root = el("div", "e-outline");
  const item = (id: string) => {
    const li = el("li");
    const record = records.get(id);
    if (!record) return li;
    const card = cardElement(record, 3, facts.get(id), true);
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-pressed', 'false');
    const words = linesInWords(id, links, records);
    if (words) card.append(words);
    li.append(card);
    return li;
  };
  const areaBlock = (area: DrawingArea, nested: boolean): HTMLElement => {
    const box = el("section", "e-outline-area");
    box.dataset.nested = nested ? "1" : "0";
    if (area.tint) {
      box.dataset.tint = area.tint;
      box.style.setProperty("--e-tint", `var(${area.tint})`);
    }
    if (area.heading) {
      const h = el(nested ? "h4" : "h3");
      const record = area.heading.record ? records.get(area.heading.record) : null;
      h.append(record ? record.title : area.heading.text);
      box.append(h);
      if (record) {
        carryTarget(h, record);
        const words = linesInWords(record.id, links, records);
        if (words) {
          carryTarget(words, record);
          box.append(words);
        }
      }
    }
    const list = el("ul");
    for (const it of area.items) {
      if ('record' in it) list.append(item(it.record));
      else {
        const li = el("li");
        li.append(areaBlock(it.area, true));
        list.append(li);
      }
    }
    if (list.childElementCount) box.append(list);
    return box;
  };
  const tops = tree.areas;
  const besideOf = (key: string, side: 'left' | 'right') => tops.filter((t2) => t2.beside?.of === key && t2.beside.side === side);
  const chain = (key: string, side: 'left' | 'right') => {
    const out: DrawingArea[] = [];
    for (let next = besideOf(key, side); next.length; next = besideOf(next[0]!.key, side)) out.push(next[0]!);
    return out;
  };
  for (const main of tops.filter((t2) => !t2.beside)) {
    for (const area of [...chain(main.key, "left").reverse(), main, ...chain(main.key, "right")]) root.append(areaBlock(area, false));
  }
  if (notPlaced.length) root.append(areaBlock({ key: "\0not-placed", heading: { text: NOT_PLACED(), record: null }, arrange: 'stack', columns: null, beside: null, tint: null, items: notPlaced.map((id) => ({ record: id })) }, false));
  return root;
}
function bodyOf(input: LanesInput, unavailable: ReadonlyMap<string, string> = new Map()): string[] {
  const { shown, notShown } = linksOf(input, input.tree);
  const titles = new Map(input.records.map((record) => [record.id, record.title]));
  const sentences = [];
  for (const { link, missing } of notShown) sentences.push(t("lanes.missingEnd", { from: titles.get(link.from) ?? link.from, to: titles.get(link.to) ?? link.to, missing: missing.join(", ") }));
  for (const link of shown) if (unavailable.has(link.id)) sentences.push(t("lanes.noRoute", { from: titles.get(link.from) ?? link.from, to: titles.get(link.to) ?? link.to }));
  return sentences;
}
export {
  bodyOf,
  drawTree,
  linksOf
};
