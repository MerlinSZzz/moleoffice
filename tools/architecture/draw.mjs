#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Draws Mole Office's five diagrams (general, technical, flow, roles and path) as SVG, renders each to PNG at 2x and
// checks the result.
//
//   node tools/architecture/draw.mjs            write the SVGs, the PNGs, icons.json and technical-sources.md
//   node tools/architecture/draw.mjs --svg-only write the SVGs, icons.json and technical-sources.md only
//
// Every word, colour and position is in diagrams.json beside this file. Both languages come from it.
// The rules the pictures keep are in the design study's guide (R1-R13). Before drawing, the data is checked
// against the word and group rules (R4, R6) and against the icon rule: inside one group, every part has an icon or
// none does. After rendering, every text is measured in the same browser that made the PNG: a text that leaves its
// box or comes nearer its sides than the card-line size, two texts that overlap, an arrow that starts or ends inside a card, a line that crosses a text or another line, a label that runs into a card, text under 16 px at 1200 wide (or under the picture's own minPxAt1200), text under 4.5:1 or a
// border under 3:1 contrast, more than three sizes inside the cards, a picture over its limit or a picture over its
// word budget fails the run.
//
// The fonts are Lato and Noto Sans CJK SC. If either is missing, the run stops rather than draw with another font.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const outDir = path.join(repo, 'assets', 'architecture');
const data = JSON.parse(fs.readFileSync(path.join(here, 'diagrams.json'), 'utf8'));
const svgOnly = process.argv.includes('--svg-only');

const C = data.style.colours;
const TINT = data.style.tints;
const FONTS = data.style.fonts;
const SIZE = data.style.sizes;
const LANGS = ['en', 'zh'];
const ICON = data.icons;

// The fonts are part of the picture. Stop if one is missing.
for (const need of data.style.needFonts) {
  const [fam, style] = need.split(':style=');
  if (!execFileSync('fc-list', [`:family=${fam}:style=${style}`, 'family'], { encoding: 'utf8' }).trim()) {
    console.error(`font missing: ${need}. Install it; this tool does not fall back to another font.`);
    process.exit(2);
  }
}

const uri = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
const cutoutUri = {};
for (const [name, c] of Object.entries(data.style.cutouts)) cutoutUri[name] = uri(path.join(here, 'cutouts', c.file));
const iconFile = (hue, id) => path.join(here, 'icons', hue, `${id}.png`);
const iconUris = new Map();
const iconUri = (hue, id) => {
  const k = `${hue}/${id}`;
  if (!iconUris.has(k)) iconUris.set(k, uri(iconFile(hue, id)));
  return iconUris.get(k);
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const size = (s) => (typeof s === 'number' ? s : SIZE[s] ?? SIZE.label);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

function pick(t, lang) {
  if (t == null) return [];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t;
  const v = t[lang];
  if (v == null) throw new Error(`missing ${lang} text in ${JSON.stringify(t)}`);
  return Array.isArray(v) ? v : [v];
}
const flat = (line) => (Array.isArray(line) ? line.map((s) => (typeof s === 'string' ? s : s.s)).join('') : line);

// Words, as the budget counts them. English: runs of letters or digits. Chinese: every two Han characters count as
// one word (R4 sets 12 characters against 6 words), and Latin words count as words.
const HAN = /\p{Script=Han}/gu;
function words(str) {
  const han = (str.match(HAN) ?? []).length;
  const latin = (str.replace(HAN, ' ').match(/[\p{L}\p{N}’']+/gu) ?? []).filter((w) => /\p{L}/u.test(w)).length;
  return { han, latin, words: latin + Math.ceil(han / 2) };
}

// Each picture names the limits it keeps in its "rules": the general picture keeps the poster rules R4 and R6; the
// technical picture, drawn for a technical reader, keeps a longer line and no limit on groups.
const POSTER = { titleWords: 3, lineWords: 6, lineHan: 12, groups: 7, parts: 5, topBoxes: 7, lineRows: null, tileLineRows: null, gridTiles: null };
const rulesOf = (diagram) => ({ ...POSTER, ...(diagram.rules ?? {}) });

// The word and group limits, and the icon rule, on the data itself, in both languages.
function checkRules(name, diagram) {
  const problems = [];
  const R = rulesOf(diagram);
  const groups = diagram.elements.filter((e) => e.type === 'group');
  if (R.groups != null && groups.length > R.groups) problems.push(`${name}: ${groups.length} groups, the limit is ${R.groups} (R6)`);
  const cards = [];
  for (const e of diagram.elements) {
    if (e.type === 'card' || e.type === 'band') cards.push({ where: e.id, title: e.title, line: e.line });
    if (e.type === 'flowstep') cards.push({ where: e.id, title: e.title, line: e.line });
    if (e.type === 'steps') for (const st of e.steps) cards.push({ where: `${e.id}/${flat(pick(st.title, 'en')[0])}`, title: st.title, line: st.line });
    if (e.type === 'group') {
      cards.push({ where: e.id, title: e.title, line: e.line });
      const parts = e.parts ?? [];
      if (R.parts != null && parts.length > R.parts) problems.push(`${name}/${e.id}: ${parts.length} parts, the limit is ${R.parts} (R6)`);
      // A capability grid is not held to the five-part limit; it has its own count, set in the picture's rules.
      const tiles = (e.grid ?? []).flatMap((g) => g.tiles);
      if (e.grid && R.gridTiles && (tiles.length < R.gridTiles[0] || tiles.length > R.gridTiles[1]))
        problems.push(`${name}/${e.id}: ${tiles.length} capability tiles, the range is ${R.gridTiles.join(' to ')}`);
      const tileIcons = tiles.filter((tl) => tl.icon).length;
      if (tileIcons !== 0 && tileIcons !== tiles.length) problems.push(`${name}/${e.id}: ${tileIcons} of ${tiles.length} tiles have an icon; every tile has one, or none does`);
      for (const tl of tiles) cards.push({ where: `${e.id}/${flat(pick(tl.title, 'en')[0])}`, title: tl.title, line: tl.line });
      const withIcon = parts.filter((p) => p.icon).length;
      if (withIcon !== 0 && withIcon !== parts.length)
        problems.push(`${name}/${e.id}: ${withIcon} of ${parts.length} parts have an icon; every part has one, or none does`);
      for (const p of parts) cards.push({ where: `${e.id}/${flat(pick(p.title, 'en')[0])}`, title: p.title, line: p.line });
    }
  }
  for (const c of cards)
    for (const lang of LANGS) {
      const t = words(pick(c.title, lang).map(flat).join(' '));
      const l = words(pick(c.line, lang).map(flat).join(' '));
      if (lang === 'en' && t.words > R.titleWords) problems.push(`${name}/${c.where}: title has ${t.words} words, the limit is ${R.titleWords} (R4)`);
      if (lang === 'en' && l.words > R.lineWords) problems.push(`${name}/${c.where}: line has ${l.words} words, the limit is ${R.lineWords} (R4)`);
      if (lang === 'zh' && l.han > R.lineHan) problems.push(`${name}/${c.where}: Chinese line has ${l.han} characters, the limit is ${R.lineHan} (R4)`);
      if (lang === 'zh' && l.latin > R.lineWords) problems.push(`${name}/${c.where}: Chinese line has ${l.latin} Latin words, the limit is ${R.lineWords} (R4)`);
    }
  return problems;
}

// A colour matrix that turns one circle form into another hue, reading the green channel only. It maps the source
// hue to the target and white to white, and every blend between them to the same blend, so the edges stay smooth.
function recolourMatrix(fromHex, toHex) {
  const g0 = hex(fromHex)[1];
  const rows = hex(toHex).map((c0) => {
    const a = (1 - c0) / (1 - g0);
    return `0 ${a.toFixed(5)} 0 0 ${(c0 - a * g0).toFixed(5)}`;
  });
  return [...rows, '0 0 0 1 0'].join('  ');
}

// Where a picture asks for it, a line given as one string is broken into rows that fit a width. The widths are an
// estimate on the wide side; the browser measures the real ones afterwards and fails the run if a row leaves its box.
const NO_START = '，。；、：）！？';
function wrapRows(str, px, maxW) {
  const em = (ch) => {
    if (/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u.test(ch)) return 1;
    if (ch === ' ') return 0.26;
    if (/[A-Z]/.test(ch)) return 0.64;
    if (/[0-9]/.test(ch)) return 0.56;
    if (/[.,;:'’()!-]/.test(ch)) return 0.3;
    return 0.49;
  };
  const width = (t) => [...t].reduce((a, ch) => a + em(ch), 0) * px;
  // Tokens: a Latin word (a no-break space joins two) or one Han character, each with any closing mark after it, so
  // no row starts with a closing mark.
  const tokens = str.match(/[A-Za-z0-9’'().,;:!?/+\u00a0-]+[，。；、：）！？]* ?|[^\sA-Za-z0-9][，。；、：）！？]*|\s/gu) ?? [];
  const greedy = (w) => {
    const rows = [];
    let row = '';
    for (const tk of tokens) {
      if (row && width((row + tk).trimEnd()) > w) {
        rows.push(row.trimEnd());
        row = tk.trimStart();
      } else row += tk;
    }
    if (row.trim()) rows.push(row.trimEnd());
    return rows;
  };
  // Balance: the narrowest width that still needs no more rows, so the last row is not left nearly empty.
  const n = greedy(maxW).length;
  let lo = maxW / 2;
  let hi = maxW;
  while (hi - lo > 2) {
    const mid = (lo + hi) / 2;
    if (greedy(mid).length > n) lo = mid;
    else hi = mid;
  }
  return greedy(hi);
}

// Group layout: a title, then the parts stacked. Every number here is a rule of the guide (R2, R8).
const G = {
  pad: 30, // margin inside a box: at least the card-line size (R8)
  titleBase: 66, // group title baseline below the group top
  partsTop: 110, // first part below the group top
  pictureTop: 20, // a group's picture below the group top
  gap: 36, // between parts: at least the card-title size (R8)
  icon: 56,
  iconGap: 20,
  titleLh: 44,
  lineGap: 42, // title baseline to first line baseline
  lineLh: 38,
};

// A number, or a list of numbers, may be given per language as { "en": …, "zh": … }, so a box can take its own
// language's height and whatever sits under it can follow. Text given per language is left as it is.
const numeric = (v) => typeof v === 'number' || (Array.isArray(v) && v.every(numeric));
function inLanguage(v, lang) {
  if (Array.isArray(v)) return v.map((x) => inLanguage(x, lang));
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 2 && keys.includes('en') && keys.includes('zh') && numeric(v.en) && numeric(v.zh)) return v[lang];
    return Object.fromEntries(keys.map((k) => [k, inLanguage(v[k], lang)]));
  }
  return v;
}

class Drawing {
  constructor(diagram, lang, name) {
    this.d = inLanguage(diagram, lang);
    this.lang = lang;
    this.name = name;
    this.out = [];
    this.n = 0;
    this.slots = new Map(); // icon id -> { how, forms }
    this.filters = new Set();
    this.boxes = {};
    this.layoutProblems = [];
  }
  // A card line in this language, as rows: given rows are kept, one string is wrapped if the picture asks for it.
  rows(t, px, maxW) {
    const v = pick(t, this.lang);
    if (this.d.wrap && v.length === 1 && typeof v[0] === 'string' && !(t && Array.isArray(t[this.lang]))) return wrapRows(v[0], px, maxW);
    return v;
  }
  id(prefix) {
    return `${prefix}-${++this.n}`;
  }
  family() {
    return this.lang === 'zh' ? FONTS.zh : FONTS.en;
  }
  text({ x, y, t, size: s = 'label', weight = 400, anchor = 'start', color = 'ink', lh, container, role, kind }) {
    const lines = pick(t, this.lang);
    const px = size(s);
    const step = lh ?? Math.round(px * 1.3);
    const attrs = [
      `x="${x}"`,
      `font-size="${px}"`,
      `font-weight="${weight}"`,
      `fill="${C[color] ?? color}"`,
      `text-anchor="${anchor}"`,
      `font-family="${esc(this.family())}"`,
      container ? `data-in="${container}"` : '',
      role ? `data-role="${role}"` : '',
      kind ? `data-kind="${kind}" data-rows="${lines.length}"` : '',
    ].filter(Boolean);
    let yy = y;
    for (const line of lines) {
      const segs = Array.isArray(line) ? line : [line];
      const body = segs
        .map((sg) => {
          if (typeof sg === 'string') return esc(sg);
          const a = [];
          if (sg.color) a.push(`fill="${C[sg.color] ?? sg.color}"`);
          if (sg.weight) a.push(`font-weight="${sg.weight}"`);
          return `<tspan ${a.join(' ')}>${esc(sg.s)}</tspan>`;
        })
        .join('');
      this.out.push(`<text ${attrs.join(' ')} y="${yy}">${body}</text>`);
      yy += step;
    }
    return lines.length;
  }
  rect(x, y, w, h, o = {}) {
    const id = o.id ?? this.id('box');
    const a = [
      `x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 18}"`,
      `fill="${o.fill ?? '#FFFFFF'}"`,
      `stroke="${o.stroke}" stroke-width="${o.sw ?? 3}"`,
      o.dashed ? `stroke-dasharray="${o.dashed}"` : '',
      `data-box="${id}"`,
      o.parent ? `data-solid="${o.parent}"` : '',
      o.card ? 'data-card="1"' : '',
    ].filter(Boolean);
    this.out.push(`<rect ${a.join(' ')}/>`);
    this.boxes[id] = { x, y, w, h };
    return id;
  }
  // A picture: a cut-out drawing, cropped to its visible part and fitted into the box.
  image(name, x, y, h) {
    const c = data.style.cutouts[name];
    if (!c) throw new Error(`no cut-out named ${name}`);
    const [x0, y0, x1, y1] = c.visible;
    const w = Math.round((h * (x1 - x0)) / (y1 - y0));
    this.out.push(
      `<svg data-picture="${name}" x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" preserveAspectRatio="xMidYMid meet">` +
        `<title>${esc(name)}</title><image width="720" height="687" href="${cutoutUri[name]}"/></svg>`,
    );
    return w;
  }
  pictureWidth(name, h) {
    const [x0, y0, x1, y1] = data.style.cutouts[name].visible;
    return Math.round((h * (x1 - x0)) / (y1 - y0));
  }
  use(id, hue, how) {
    const u = this.slots.get(id) ?? { how, forms: new Set() };
    u.forms.add(hue);
    this.slots.set(id, u);
  }
  // An icon in the circle form of its group's hue. Where the set has no form in that hue, the listed form is
  // recoloured; where the set has no icon at all, the icon is cut from another one or drawn here, as icons.drawn says.
  icon(id, hue, x, y, s) {
    const tag = `data-picture="${id}" data-icon="${hue}"`;
    const crop = ICON.drawn[id]?.crop;
    if (crop) {
      // A white glyph cut from another icon, on a circle of this hue.
      this.use(id, hue, 'cut');
      this.filters.add('cut-white');
      const [x0, y0, x1, y1] = crop.box;
      const g = s * crop.scale;
      const gw = (g * (x1 - x0)) / (y1 - y0);
      this.out.push(
        `<g ${tag}><title>${esc(id)}</title><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${C[hue]}"/>` +
          `<svg x="${(x + (s - gw) / 2).toFixed(1)}" y="${(y + (s - g) / 2).toFixed(1)}" width="${gw.toFixed(1)}" height="${g.toFixed(1)}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}">` +
          `<image width="512" height="512" href="${iconUri(crop.form, crop.from)}" filter="url(#cut-white)"/></svg></g>`,
      );
      return;
    }
    const glyph = ICON.drawn[id]?.glyph;
    if (glyph) {
      // A white line glyph on a 24-unit square, drawn on a circle of this hue.
      this.use(id, hue, 'drawn');
      const k = (s / 24) * 0.62;
      const off = s * 0.19;
      this.out.push(
        `<g ${tag}><title>${esc(id)}</title><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${C[hue]}"/>` +
          `<g transform="translate(${(x + off).toFixed(1)} ${(y + off).toFixed(1)}) scale(${k.toFixed(4)})" fill="none" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></g>`,
      );
      return;
    }
    if (id === 'problem') {
      // A warning triangle in the circle form.
      this.use(id, hue, 'drawn');
      const k = s / 100;
      const P = (px, py) => `${(x + px * k).toFixed(1)},${(y + py * k).toFixed(1)}`;
      this.out.push(
        `<g ${tag}><title>problem</title><circle cx="${x + s / 2}" cy="${y + s / 2}" r="${s / 2}" fill="${C[hue]}"/>` +
          `<polygon points="${P(50, 22)} ${P(79, 73)} ${P(21, 73)}" fill="none" stroke="#FFFFFF" stroke-width="${(7 * k).toFixed(1)}" stroke-linejoin="round"/>` +
          `<line x1="${x + 50 * k}" y1="${y + 40 * k}" x2="${x + 50 * k}" y2="${y + 56 * k}" stroke="#FFFFFF" stroke-width="${(7 * k).toFixed(1)}" stroke-linecap="round"/>` +
          `<circle cx="${x + 50 * k}" cy="${y + 65 * k}" r="${(4 * k).toFixed(1)}" fill="#FFFFFF"/></g>`,
      );
      return;
    }
    const vis = ICON.visible?.[id];
    if (vis && fs.existsSync(iconFile(hue, id))) {
      // A picture with a measured visible box: cropped to it, so its ink is s units tall, and as wide as it needs.
      this.use(id, hue, 'icon');
      const [x0, y0, x1, y1] = vis;
      const w = (s * (x1 - x0)) / (y1 - y0);
      this.out.push(
        `<svg ${tag} x="${x}" y="${y}" width="${w.toFixed(1)}" height="${s}" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"><title>${esc(id)}</title><image width="512" height="512" href="${iconUri(hue, id)}"/></svg>`,
      );
      return;
    }
    if (fs.existsSync(iconFile(hue, id))) {
      this.use(id, hue, 'icon');
      this.out.push(`<image ${tag} x="${x}" y="${y}" width="${s}" height="${s}" href="${iconUri(hue, id)}"><title>${esc(id)}</title></image>`);
      return;
    }
    const from = ICON.recolour[hue];
    if (from && fs.existsSync(iconFile(from, id))) {
      this.use(id, hue, 'recoloured');
      this.filters.add(`to-${hue}`);
      this.out.push(
        `<image ${tag} x="${x}" y="${y}" width="${s}" height="${s}" href="${iconUri(from, id)}" filter="url(#to-${hue})"><title>${esc(id)}</title></image>`,
      );
      return;
    }
    throw new Error(`icon ${id} has no ${hue} form, no form to recolour and no drawing`);
  }
  element(e) {
    switch (e.type) {
      case 'text':
        return this.text(e);
      case 'card':
        return this.card(e);
      case 'band':
        return this.band(e);
      case 'group':
        return this.group(e);
      case 'arrow':
        return this.arrow(e);
      case 'key':
        return this.key(e);
      case 'boundary':
        return this.boundary(e);
      case 'steps':
        return this.steps(e);
      case 'feature':
        return this.feature(e);
      case 'flowstep':
        return this.flowstep(e);
      default:
        throw new Error(`unknown element type ${e.type}`);
    }
  }
  // A general-picture card: one picture on top, a title and a line, centred.
  card(e) {
    const id = this.rect(e.x, e.y, e.w, e.h, { id: `${this.name}-${e.id}`, stroke: C[e.color], fill: TINT[e.color], card: true, parent: 'top' });
    const cx = e.x + e.w / 2;
    const p = e.picture;
    const areaTop = e.y + G.pad;
    const area = data.style.pictureMax;
    if (p.image) {
      const h = p.size ?? area;
      this.image(p.image, cx - this.pictureWidth(p.image, h) / 2, areaTop + (area - h) / 2, h);
    } else {
      const s = p.size;
      const gap = 16;
      const total = p.icons.length * s + (p.icons.length - 1) * gap;
      p.icons.forEach((icon, i) => this.icon(icon, e.color, cx - total / 2 + i * (s + gap), areaTop + (area - s) / 2, s));
    }
    const tBase = areaTop + area + G.pad + 27;
    const n = this.text({ x: cx, y: tBase, t: e.title, size: 'title', weight: 700, anchor: 'middle', lh: G.titleLh, container: id, role: 'card' });
    this.text({ x: cx, y: tBase + (n - 1) * G.titleLh + 46, t: e.line, size: 'line', color: 'body', anchor: 'middle', lh: G.lineLh, container: id, role: 'card' });
  }
  // The Mole Office band of the general picture: the logo, a title and a line, and four kinds of record.
  band(e) {
    const id = this.rect(e.x, e.y, e.w, e.h, { id: `${this.name}-${e.id}`, stroke: C[e.color], fill: TINT[e.color], card: true, parent: 'top' });
    const h = data.style.pictureMax;
    const top = e.y + (e.h - h) / 2;
    const w = this.image(e.image, e.x + 40, top, h);
    const tx = e.x + 40 + w + 40;
    this.text({ x: tx, y: e.y + e.h / 2 - 6, t: e.title, size: 'title', weight: 700, container: id, role: 'card' });
    this.text({ x: tx, y: e.y + e.h / 2 + 40, t: e.line, size: 'line', color: e.color, weight: 700, container: id, role: 'card' });
    const s = 72;
    const pitch = 190;
    e.items.forEach((it, i) => {
      const icx = e.x + e.w - 40 - pitch / 2 - (e.items.length - 1 - i) * pitch;
      this.icon(it.icon, e.color, icx - s / 2, top + 6, s);
      this.text({ x: icx, y: top + 6 + s + 48, t: it.t, size: 'line', anchor: 'middle', container: id, role: 'card' });
    });
  }
  // A technical-picture group: an optional icon and a title of one or more rows, an optional picture at its top
  // right, an optional line, and parts stacked below. A part is an icon, a title and a line. A group with a fixed
  // height fails the run if its content needs more.
  group(e) {
    const parts = e.parts ?? [];
    const withIcons = parts.some((p) => p.icon);
    // A box's icon is a circle form at the usual 56 units, or a picture (a mole) at e.iconSize, set higher. With
    // e.iconBox, the picture is sized and placed to match its text block: { top, size } are measured from the ink of
    // the title's first row and of the last row beside it, and the text block alone sets the header.
    const IB = e.iconBox;
    const IS = IB ? IB.size : e.iconSize ?? G.icon;
    const iconTop = IB ? IB.top : e.iconSize ? 20 : 30;
    const inset = e.iconInset ?? G.pad;
    const vis = e.icon && ICON.visible?.[e.icon];
    const IW = vis ? (IS * (vis[2] - vis[0])) / (vis[3] - vis[1]) : IS;
    const textX = e.icon ? e.x + inset + IW + (e.iconGap ?? G.iconGap) : e.x + G.pad;
    // With e.lineUnderIcon, the line starts at the box's margin, under the icon, and takes the full width.
    const lineX = e.lineUnderIcon ? e.x + G.pad : textX;
    const titleRows = pick(e.title, this.lang).length;
    const lastTitle = G.titleBase + (titleRows - 1) * 56;
    const iconInHeader = e.icon && (!IB || e.lineUnderIcon);
    let header = Math.max(lastTitle + 14, iconInHeader ? iconTop + IS : 0, e.picture ? G.pictureTop + e.picture.h : 0);
    if (!e.icon && !e.picture && titleRows === 1 && !e.line) header = G.partsTop - 30;
    const LS = size(this.d.lineSize ?? 'line');
    const LLH = Math.round(LS * 1.27);
    const lineRows = e.line ? this.rows(e.line, LS, e.x + e.w - G.pad - lineX) : [];
    const lineBottom = lineRows.length ? header + LS + 6 + (lineRows.length - 1) * LLH + 10 : header;
    const partsTop = e.picture && !lineRows.length ? Math.max(G.partsTop, G.pictureTop + e.picture.h + 24) : lineBottom + 30;
    const heights = parts.map((p) => this.partHeight(p, withIcons, e));
    const gridH = e.grid ? this.grid(e, partsTop, true) : 0;
    const need = Math.max(
      e.grid ? partsTop + gridH + G.pad : parts.length ? partsTop + heights.reduce((a, b) => a + b, 0) + G.gap * (parts.length - 1) + G.pad : lineBottom + G.pad,
      e.icon ? iconTop + IS + G.pad : 0,
    );
    const h = e.h ?? need;
    if (e.h && need > e.h + 0.5) this.layoutProblems.push(`${this.name}-${this.lang}/${e.id} needs ${need} units of height and has ${e.h}`);
    const border = e.border === 'container' ? { stroke: C[e.color], dashed: '16 9' } : { stroke: C[e.color] };
    const id = this.rect(e.x, e.y, e.w, h, { id: `${this.name}-${e.id}`, ...border, fill: TINT[e.color], card: true, parent: 'top' });
    if (e.icon) this.icon(e.icon, e.color, e.x + inset, e.y + iconTop, IS);
    this.text({ x: textX, y: e.y + G.titleBase, t: e.title, size: 'group', weight: 700, lh: 56, container: id, role: 'group' });
    if (e.picture) this.image(e.picture.image, e.x + e.w - G.pad - this.pictureWidth(e.picture.image, e.picture.h), e.y + G.pictureTop, e.picture.h);
    if (lineRows.length) this.text({ x: lineX, y: e.y + header + LS + 6, t: lineRows, size: LS, color: 'body', lh: LLH, container: id, role: 'card', kind: 'line' });
    if (e.grid) this.grid(e, partsTop, false, id, Math.max(0, h - need));
    let y = e.y + partsTop;
    parts.forEach((p, i) => {
      let x = e.x + G.pad;
      let py = y;
      let parent = id;
      if (p.dashed) {
        parent = this.rect(x, y, e.w - 2 * G.pad, heights[i], { stroke: C[e.color], dashed: '12 8', r: 14, parent: id });
        x += G.pad;
        py += G.pad;
      }
      if (p.icon) this.icon(p.icon, e.color, x, py, G.icon);
      const tx = withIcons ? x + G.icon + G.iconGap : x;
      const lines = this.partRows(p, withIcons, e);
      const tBase = lines.length ? py + 30 : py + G.icon / 2 + 13;
      this.text({ x: tx, y: tBase, t: p.title, size: 'title', weight: 700, container: parent, role: 'card' });
      if (lines.length) this.text({ x: tx, y: tBase + G.lineGap, t: lines, size: 'line', color: 'body', lh: G.lineLh, container: parent, role: 'card', kind: 'line' });
      y += heights[i] + G.gap;
    });
    this.boxes[e.id] = { x: e.x, y: e.y, w: e.w, h, need };
  }
  // A capability grid: headed sections of tiles in columns, and an optional flow band at its foot. A tile is an icon,
  // a label of one to three words and at most one short line. A heading may carry a picture beside it. With measure
  // set, it only returns the grid's natural height; drawn, any slack the box has over that height is shared between
  // the gaps before each section and the band, so the box fills with content and not with empty space at its foot.
  grid(e, top, measure, id, slack = 0) {
    if (e.panels) return this.gridPanels(e, top, measure, id);
    const cols = e.cols ?? 2;
    const colGap = e.colGap ?? 30;
    const colW = (e.w - 2 * G.pad - (cols - 1) * colGap) / cols;
    const textW = colW - G.icon - 14;
    const TS = size(this.d.tileTitleSize ?? 'line');
    const TLH = Math.round(TS * 1.2);
    const LS = size(this.d.lineSize ?? 'line');
    const LLH = Math.round(LS * 1.27);
    const HS = size(e.headingSize ?? 'label');
    const HI = e.headingIcon ?? 36;
    const gaps = e.grid.length - 1 + (e.flowband ? 1 : 0);
    const extra = gaps ? slack / gaps : 0;
    let y = e.y + top;
    e.grid.forEach((sec, si) => {
      if (si) y += 26 + extra;
      if (sec.heading) {
        const hi = sec.icon ? HI : 0;
        const rowH = Math.max(hi, HS * 1.3);
        if (!measure) {
          if (sec.icon) this.icon(sec.icon, e.color, e.x + G.pad, y, hi);
          this.text({ x: e.x + G.pad + (hi ? hi + 14 : 0), y: y + rowH / 2 + HS * 0.36, t: sec.heading, size: HS, weight: 700, color: e.color, container: id, role: 'card' });
        }
        y += rowH + 14;
      }
      for (let r = 0; r < sec.tiles.length; r += cols) {
        const row = sec.tiles.slice(r, r + cols);
        const hs = row.map((tl) => {
          const tr = this.rows(tl.title, TS, textW);
          const lr = tl.line ? this.rows(tl.line, LS, textW) : [];
          return { tr, lr, h: Math.max(G.icon, tr.length * TLH + (lr.length ? lr.length * LLH + 4 : 0)) };
        });
        const rowH = Math.max(...hs.map((x) => x.h));
        if (!measure)
          row.forEach((tl, c) => {
            const x = e.x + G.pad + c * (colW + colGap);
            if (tl.icon) this.icon(tl.icon, e.color, x, y, G.icon);
            const tx = x + G.icon + 14;
            const { tr, lr } = hs[c];
            const block = tr.length * TLH + (lr.length ? lr.length * LLH + 4 : 0);
            const ty = y + Math.max(0, (G.icon - block) / 2) + TS * 0.82;
            this.text({ x: tx, y: ty, t: tr, size: TS, weight: 700, lh: TLH, container: id, role: 'card' });
            if (lr.length) this.text({ x: tx, y: ty + (tr.length - 1) * TLH + LLH + 2, t: lr, size: LS, color: 'body', lh: LLH, container: id, role: 'card', kind: 'tile-line' });
          });
        y += rowH + 22;
      }
      y -= 22;
    });
    const fb = e.flowband;
    if (fb) {
      // The flow band: a titled row of small step chips joined by arrows. A picture of the idea, not a list.
      y += 26 + extra;
      const tr = this.rows(fb.title, TS, e.w - 2 * G.pad - G.icon - 14);
      const lr = fb.line ? this.rows(fb.line, LS, e.w - 2 * G.pad - G.icon - 14) : [];
      if (!measure) {
        if (fb.icon) this.icon(fb.icon, e.color, e.x + G.pad, y, G.icon);
        const block = tr.length * TLH + (lr.length ? lr.length * LLH + 4 : 0);
        const ty = y + Math.max(0, (G.icon - block) / 2) + TS * 0.82;
        this.text({ x: e.x + G.pad + G.icon + 14, y: ty, t: tr, size: TS, weight: 700, lh: TLH, container: id, role: 'card' });
        if (lr.length) this.text({ x: e.x + G.pad + G.icon + 14, y: ty + (tr.length - 1) * TLH + LLH + 2, t: lr, size: LS, color: 'body', lh: LLH, container: id, role: 'card', kind: 'tile-line' });
      }
      y += Math.max(G.icon, tr.length * TLH + (lr.length ? lr.length * LLH + 4 : 0)) + 18;
      const n = fb.chips.length;
      const gap = fb.gap ?? 34;
      const cw = (e.w - 2 * G.pad - (n - 1) * gap) / n;
      const rows = fb.chips.map((c) => pick(c, this.lang).length);
      const ch = Math.max(...rows) * LLH + 28;
      if (!measure)
        fb.chips.forEach((c, i) => {
          const x = e.x + G.pad + i * (cw + gap);
          this.rect(x, y, cw, ch, { stroke: C[e.color], fill: '#FFFFFF', r: 14, sw: 2.5, parent: id });
          const k = rows[i];
          this.text({ x: x + cw / 2, y: y + ch / 2 - ((k - 1) * LLH) / 2 + LS * 0.36, t: c, size: LS, anchor: 'middle', lh: LLH, container: id, role: 'card' });
          if (i < n - 1) this.arrow({ color: e.color, within: id, pts: [[x + cw + 2, y + ch / 2], [x + cw + gap - 10, y + ch / 2]] });
        });
      y += ch;
    }
    return y - (e.y + top);
  }
  partRows(p, withIcons, e) {
    const inner = e.w - 2 * G.pad - (p.dashed ? 2 * G.pad : 0) - (withIcons ? G.icon + G.iconGap : 0);
    return this.rows(p.line, SIZE.line, inner);
  }
  partHeight(p, withIcons, e) {
    const n = this.partRows(p, withIcons, e).length;
    const inner = n ? 30 + G.lineGap + (n - 1) * G.lineLh + 10 : G.icon;
    return Math.max(inner, withIcons ? G.icon : 0) + (p.dashed ? 2 * G.pad : 0);
  }
  // A boundary: where something runs. It is a line, not a card; its label sits inside its top-left corner.
  boundary(e) {
    const st = data.style.boundaries[e.style];
    this.rect(e.x, e.y, e.w, e.h, { stroke: C[st.color], dashed: st.dash, fill: 'none', r: 26, sw: st.width });
    if (e.label) this.text({ x: e.x + 30, y: e.y + 40, t: e.label, size: 'label', weight: 700, color: st.color, role: 'boundary' });
  }
  // The change path: a titled band of numbered steps in a row, read left to right, with a chevron between steps.
  // The last card may be of another hue.
  steps(e) {
    const cards = [...e.steps, ...(e.end ? [e.end] : [])];
    const gap = 44;
    const cw = (e.w - 2 * G.pad - (cards.length - 1) * gap) / cards.length;
    const top = e.y + G.partsTop;
    // With no height given, the cards take the height their tallest text needs, and the band follows.
    const ch = e.h ? e.y + e.h - G.pad - top : Math.max(...cards.map((st) => this.stepNeed(st, cw)));
    const bandH = e.h ?? G.partsTop + ch + G.pad;
    // The band holds cards and is not one itself, so an arrow may end on the step it names.
    const id = this.rect(e.x, e.y, e.w, bandH, { id: `${this.name}-${e.id}`, stroke: C[e.color], fill: TINT[e.color], parent: 'top' });
    this.text({ x: e.x + G.pad, y: e.y + G.titleBase, t: e.title, size: 'group', weight: 700, container: id, role: 'group' });
    cards.forEach((st, i) => {
      const x = e.x + G.pad + i * (cw + gap);
      const hue = st.color ?? e.color;
      const cid = this.rect(x, top, cw, ch, { id: `${this.name}-${e.id}-${i + 1}`, stroke: C[hue], fill: st.color ? TINT[hue] : '#FFFFFF', r: 14, parent: id, card: true });
      const LS = size(this.d.lineSize ?? 'line');
      const LLH = Math.round(LS * 1.27);
      const TS = size(this.d.stepTitleSize ?? 'title');
      const TLH = Math.round(TS * 1.22);
      const lines = this.rows(st.line, LS, cw - 2 * G.pad);
      const n = this.text({ x: x + G.pad, y: top + 30 + TS * 0.78, t: st.title, size: TS, weight: 700, lh: TLH, container: cid, role: 'card' });
      const lb = top + 30 + TS * 0.78 + (n - 1) * TLH + LLH + 4;
      this.text({ x: x + G.pad, y: lb, t: lines, size: LS, color: 'body', lh: LLH, container: cid, role: 'card', kind: 'line' });
      const need = lb + (lines.length - 1) * LLH + 10 + G.pad - top;
      if (need > ch + 0.5) this.layoutProblems.push(`${this.name}-${this.lang}/${e.id} step ${i + 1} needs ${need} units of height and has ${ch}`);
      if (i < cards.length - 1) {
        const cx = x + cw + gap / 2;
        const cy = top + ch / 2;
        this.out.push(`<polygon points="${cx - 9},${cy - 16} ${cx + 9},${cy} ${cx - 9},${cy + 16}" fill="${C[e.color]}"/>`);
      }
    });
    this.boxes[e.id] = { x: e.x, y: e.y, w: e.w, h: bandH, cards: cards.map((_, i) => [e.x + G.pad + i * (cw + gap), top, cw, ch]) };
  }
  stepNeed(st, cw) {
    const LLH = Math.round(size(this.d.lineSize ?? 'line') * 1.27);
    const TS = size(this.d.stepTitleSize ?? 'title');
    const n = pick(st.title, this.lang).length;
    const rows = this.rows(st.line, size(this.d.lineSize ?? 'line'), cw - 2 * G.pad).length;
    return Math.ceil(30 + TS * 0.78 + (n - 1) * Math.round(TS * 1.22) + LLH + 4 + (rows - 1) * LLH + 10 + G.pad);
  }
  arrow(e) {
    const c = e.light ? C.machine : C[e.color];
    const heads = e.light ? 'none' : e.heads ?? 'end';
    const marks = [heads !== 'none' ? ` marker-end="url(#head-${e.color})"` : '', heads === 'both' ? ` marker-start="url(#tail-${e.color})"` : ''].join('');
    const kind = heads === 'none' ? 'connector' : 'arrow';
    const attrs = `data-line="${kind}"${e.fromPart ? ' data-from-part="1"' : ''}${e.link ? ` data-link="${e.link.join(' ')}"` : ''}${e.within ? ` data-within="${e.within}"` : ''}`;
    const style = e.light ? `stroke="${c}" stroke-width="2.5" stroke-dasharray="6 5"` : `stroke="${c}" stroke-width="3.5"`;
    const pts = e.pts;
    if (pts.length <= 2) {
      this.out.push(`<polyline ${attrs} points="${pts.map(([px, py]) => `${px},${py}`).join(' ')}" fill="none" ${style} stroke-linejoin="round"${marks}/>`);
    } else {
      // Right angles with rounded elbows: each corner is cut by a quarter-round of radius 16 at most.
      const r = 16;
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length - 1; i++) {
        const [px, py] = pts[i - 1];
        const [cx, cy] = pts[i];
        const [nx, ny] = pts[i + 1];
        const l1 = Math.hypot(cx - px, cy - py);
        const l2 = Math.hypot(nx - cx, ny - cy);
        const k1 = Math.min(r, l1 / 2) / l1;
        const k2 = Math.min(r, l2 / 2) / l2;
        d += ` L${cx - (cx - px) * k1},${cy - (cy - py) * k1} Q${cx},${cy} ${cx + (nx - cx) * k2},${cy + (ny - cy) * k2}`;
      }
      d += ` L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;
      this.out.push(`<path ${attrs} data-pts="${pts.map(([px, py]) => `${px},${py}`).join(' ')}" d="${d}" fill="none" ${style} stroke-linejoin="round"${marks}/>`);
    }
    if (heads !== 'none') this.filters.add(`head-${e.color}`);
    if (heads === 'both') this.filters.add(`tail-${e.color}`);
    if (e.label) this.text({ x: e.label.x, y: e.label.y, t: e.label.t, size: 'label', weight: 700, anchor: e.label.anchor ?? 'middle', lh: 30, role: 'arrow' });
  }
  // A feature card: a picture or icon in a fixed slot at its left, and a title with one or two lines beside it, the
  // whole block centred on the card's height. Cards in a column share one slot width, so their texts line up.
  feature(e) {
    const border = e.border === 'container' ? { stroke: C[e.color], dashed: '16 9' } : { stroke: C[e.color] };
    const id = this.rect(e.x, e.y, e.w, e.h, { id: `${this.name}-${e.id}`, ...border, fill: TINT[e.color], card: true, parent: 'top' });
    const slot = e.slot ?? 130;
    const cy = e.y + e.h / 2;
    if (e.picture) {
      const pw = this.pictureWidth(e.picture.image, e.picture.h);
      this.image(e.picture.image, e.x + 24 + (slot - pw) / 2, cy - e.picture.h / 2, e.picture.h);
    } else if (e.icon) {
      const s = e.iconSize ?? 72;
      const vis = ICON.visible?.[e.icon];
      const iw = vis ? (s * (vis[2] - vis[0])) / (vis[3] - vis[1]) : s;
      this.icon(e.icon, e.color, e.x + 24 + (slot - iw) / 2, cy - s / 2, s);
    }
    const tx = e.x + 24 + slot + 22;
    const TS = e.titleSize ?? 44;
    const LS = e.lineSize ?? 30;
    const LLH = Math.round(LS * 1.3);
    const lines = e.line ? pick(e.line, this.lang) : [];
    const block = TS + (lines.length ? 10 + lines.length * LLH : 0);
    const top = cy - block / 2;
    this.text({ x: tx, y: top + TS * 0.82, t: e.title, size: TS, weight: 700, container: id, role: 'group' });
    if (lines.length) this.text({ x: tx, y: top + TS + 10 + LS * 0.9, t: lines, size: LS, color: 'body', lh: LLH, container: id, role: 'card', kind: 'line' });
    this.boxes[e.id] = { x: e.x, y: e.y, w: e.w, h: e.h, need: e.h };
  }
  // The server's sections as framed panels in rows: e.panels is a list of rows, each a list of section indexes into
  // e.grid. Every tile has the same height and the same icon size, so tiles line up across panels; panels in one row
  // share one height.
  gridPanels(e, top, measure, id) {
    const P = e.panelPad ?? 24;
    const gap = e.panelGap ?? 26;
    const TH = e.tileH ?? 84;
    const TI = e.tileIcon ?? 58;
    const TS = e.tileTitleSize ?? 32;
    const LS = e.tileLineSize ?? 24;
    const TLH = Math.round(TS * 1.18);
    const LLH = Math.round(LS * 1.25);
    const HS = size(e.headingSize ?? 'line');
    const HI = e.headingIcon ?? 72;
    const tc = e.tileCols ?? 2;
    let y = e.y + top;
    for (const row of e.panels) {
      const pw = (e.w - 2 * G.pad - (row.length - 1) * gap) / row.length;
      const rows = Math.max(...row.map((si) => Math.ceil(e.grid[si].tiles.length / tc)));
      const ph = P + HI + 12 + rows * TH + (rows - 1) * 10 + P;
      row.forEach((si, k) => {
        const sec = e.grid[si];
        const px = e.x + G.pad + k * (pw + gap);
        if (measure) return;
        const fid = this.rect(px, y, pw, ph, { stroke: C[e.color], fill: '#FFFFFF', r: 16, sw: 2, parent: id });
        const SI = sec.iconSize ?? HI;
        if (sec.icon) this.icon(sec.icon, e.color, px + P, y + P + (HI - SI) / 2, SI);
        const vis = sec.icon && ICON.visible?.[sec.icon];
        const SW = vis ? (SI * (vis[2] - vis[0])) / (vis[3] - vis[1]) : SI;
        this.text({ x: px + P + SW + 16, y: y + P + HI / 2 + HS * 0.36, t: sec.heading, size: HS, weight: 700, color: e.color, container: fid, role: 'card' });
        const colW = (pw - 2 * P - (tc - 1) * 20) / tc;
        sec.tiles.forEach((tl, i) => {
          const r = Math.floor(i / tc), c = i % tc;
          const tx0 = px + P + c * (colW + 20);
          const ty0 = y + P + HI + 12 + r * (TH + 10);
          this.icon(tl.icon, e.color, tx0, ty0 + (TH - TI) / 2, TI);
          const tr = pick(tl.title, this.lang);
          const lr = tl.line ? pick(tl.line, this.lang) : [];
          const block = tr.length * TLH + (lr.length ? lr.length * LLH + 2 : 0);
          const by = ty0 + (TH - block) / 2;
          this.text({ x: tx0 + TI + 14, y: by + TS * 0.86, t: tr, size: TS, weight: 700, lh: TLH, container: fid, role: 'card' });
          if (lr.length) this.text({ x: tx0 + TI + 14, y: by + tr.length * TLH + LS * 0.86, t: lr, size: LS, color: 'body', lh: LLH, container: fid, role: 'card', kind: 'tile-line' });
        });
      });
      y += ph + gap;
    }
    return y - gap - (e.y + top);
  }
  // A numbered step card: a step of a path, which stands under the part it uses, with a light connector joining the
  // two. The connector check reads its data-flow and data-part.
  flowstep(e) {
    const TS = size('line');
    const TLH = Math.round(TS * 1.22);
    const LS = size(this.d.lineSize ?? 'line');
    const LLH = Math.round(LS * 1.27);
    const lines = this.rows(e.line, LS, e.w - 2 * G.pad);
    const titleRows = pick(e.title, this.lang).length;
    const tb = G.pad + Math.round(TS * 0.74);
    const need = Math.ceil(tb + (titleRows - 1) * TLH + (lines.length ? LLH + 2 + (lines.length - 1) * LLH : 0) + 8 + G.pad);
    const h = e.h ?? need;
    const id = this.rect(e.x, e.y, e.w, h, { id: `${this.name}-${e.id}`, stroke: C[e.color ?? 'flow'], fill: '#FFFFFF', r: 22, card: true, parent: 'top' });
    this.out[this.out.length - 1] = this.out[this.out.length - 1].replace('<rect ', `<rect data-flow="${e.id}"${e.part ? ` data-part="${this.name}-${e.part}"` : ''} `);
    this.text({ x: e.x + G.pad, y: e.y + tb, t: e.title, size: TS, weight: 700, lh: TLH, container: id, role: 'card' });
    if (lines.length) this.text({ x: e.x + G.pad, y: e.y + tb + (titleRows - 1) * TLH + LLH + 2, t: lines, size: LS, color: 'body', lh: LLH, container: id, role: 'card', kind: 'line' });
    this.boxes[e.id] = { x: e.x, y: e.y, w: e.w, h };
  }
  // The key: what each hue means, and what a dashed border means. Entries are laid out in rows of `cols`.
  key(e) {
    e.entries.forEach((k, i) => {
      const x = e.x + (i % e.cols) * e.colW;
      const y = e.y + Math.floor(i / e.cols) * (e.rowH ?? 56);
      if (k.boundary) {
        const st = data.style.boundaries[k.boundary];
        this.rect(x, y, 56, 36, { stroke: C[st.color], dashed: st.keyDash, fill: 'none', r: 8, sw: st.width, parent: 'key' });
      } else if (k.flow) this.rect(x, y, 56, 36, { stroke: C.flow, fill: '#FFFFFF', r: 14, parent: 'key' });
      else if (k.dashed) this.rect(x, y, 56, 36, { stroke: C.body, dashed: '10 6', r: 8, parent: 'key' });
      else this.rect(x, y, 56, 36, { stroke: C[k.color], fill: TINT[k.color], r: 8, parent: 'key' });
      this.text({ x: x + 72, y: y + 26, t: k.t, size: 'label', role: 'key' });
    });
  }
  render() {
    const W = this.d.width;
    for (const e of this.d.elements) this.element(e);
    // A canvas height of "fit" is the lowest box's foot plus the margin at the sides.
    const H = this.d.height === 'fit' ? Math.ceil(Math.max(...Object.values(this.boxes).map((b) => b.y + b.h)) + 40) : this.d.height;
    this.height = H;
    const defs = [];
    for (const f of this.filters) {
      if (f.startsWith('tail-')) {
        const hue = f.slice(5);
        defs.push(`<marker id="${f}" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="${C[hue]}"/></marker>`);
      } else if (f.startsWith('head-')) {
        const hue = f.slice(5);
        defs.push(`<marker id="${f}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C[hue]}"/></marker>`);
      } else if (f.startsWith('to-')) {
        const hue = f.slice(3);
        defs.push(`<filter id="${f}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${recolourMatrix(C[ICON.recolour[hue]], C[hue])}"/></filter>`);
      } else if (f === 'cut-white') {
        // White where the source is its hue, clear where it is white: reads the green channel of an orange form.
        const k = 1 / (1 - hex(C[ICON.cutFrom])[1]);
        defs.push(`<filter id="cut-white" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 ${(-k).toFixed(5)} 0 0 ${k.toFixed(5)}"/></filter>`);
      }
    }
    const title = pick(this.d.svgTitle, this.lang)[0];
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" lang="${this.lang === 'zh' ? 'zh-Hans' : 'en'}">`,
      `<title>${esc(title)}</title>`,
      `<defs>${defs.join('')}</defs>`,
      `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`,
      ...this.out,
      '</svg>',
    ].join('\n');
  }
}

let ruleProblems = [];
for (const [name, diagram] of Object.entries(data.diagrams)) ruleProblems.push(...checkRules(name, diagram));
if (ruleProblems.length) {
  for (const p of ruleProblems) console.error('RULE ' + p);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const written = [];
ruleProblems = [];
const slotUse = {};
for (const [name, diagram] of Object.entries(data.diagrams)) {
  for (const lang of LANGS) {
    const d = new Drawing(diagram, lang, name);
    const svg = d.render();
    for (const lp of d.layoutProblems) ruleProblems.push(lp);
    const file = path.join(outDir, `${name}-${lang}.svg`);
    fs.writeFileSync(file, svg + '\n');
    written.push({ name, lang, file, width: diagram.width, height: d.height, budget: diagram.budget, minPx: diagram.minPxAt1200, topBoxes: rulesOf(diagram).topBoxes, lineRows: rulesOf(diagram).lineRows, tileLineRows: rulesOf(diagram).tileLineRows });
    for (const [id, u] of d.slots) {
      const s = (slotUse[id] ??= { how: u.how, forms: new Set(), diagrams: new Set() });
      for (const f of u.forms) s.forms.add(f);
      s.diagrams.add(name);
    }
    if (process.argv.includes('--boxes')) for (const [k, b] of Object.entries(d.boxes)) if (!k.startsWith('box-') && (!k.includes('-') || k.startsWith('step-'))) console.log(`box ${name}-${lang}/${k}: x ${b.x} y ${b.y} w ${b.w} h ${b.h} bottom ${b.y + b.h}${b.need ? ` needs ${b.need}` : ''}`);
  }
}

if (ruleProblems.length) {
  for (const p of ruleProblems) console.error('LAYOUT ' + p);
  process.exit(1);
}

// icons.json: every icon the pictures use, where it came from and in which forms.
const icons = Object.keys(slotUse)
  .sort()
  .map((id) => {
    const u = slotUse[id];
    const entry = { id, diagrams: [...u.diagrams].sort(), forms: [...u.forms].sort() };
    if (u.how === 'icon') entry.drawn_by = ICON.redrawn.includes(id) ? 'the redrawn icon set (image2)' : 'the first icon set (image2)';
    if (u.how === 'recoloured') Object.assign(entry, { drawn_by: ICON.redrawn.includes(id) ? 'the redrawn icon set (image2)' : 'the first icon set (image2)', note: ICON.recolourNote });
    if (u.how === 'cut' || u.how === 'drawn') Object.assign(entry, { drawn_by: 'draw.mjs', note: ICON.drawn[id].note });
    return entry;
  });
fs.writeFileSync(path.join(outDir, 'icons.json'), JSON.stringify({ note: ICON.note, icons }, null, 2) + '\n');

// technical-sources.md: one row for every box, part, step, boundary and labelled arrow of the technical picture, from
// its "source" field. A drawn thing with no source fails the run.
const cell = (s) => String(s).replace(/\|/g, '\\|');
const en = (t) => pick(t, 'en').map(flat).join(' ');
const rows = [];
const traced = (what, name, src) => {
  if (!src) throw new Error(`technical ${what} "${name}" has no source`);
  rows.push(`| ${cell(what)} | ${cell(name)} | ${cell(src.section)} | ${cell(src.files)} |`);
};
for (const e of data.diagrams.technical.elements) {
  if (e.type === 'group') {
    traced('box', [en(e.title), en(e.line)].filter(Boolean).join(' · '), e.source);
    if (e.flowband) traced('capability', [en(e.title), en(e.flowband.title), en(e.flowband.line), e.flowband.chips.map(en).join(' → ')].filter(Boolean).join(' · '), e.flowband.source);
    for (const sec of e.grid ?? []) for (const tl of sec.tiles) traced('capability', [en(e.title), en(sec.heading), en(tl.title), en(tl.line)].filter(Boolean).join(' · '), tl.source);
    for (const p of e.parts ?? []) traced('part', [en(e.title), en(p.title), en(p.line)].filter(Boolean).join(' · '), p.source);
  }
  if (e.type === 'feature') traced('box', [en(e.title), en(e.line)].filter(Boolean).join(' · '), e.source);
  if (e.type === 'flowstep') traced('change-path step', [en(e.title), en(e.line)].join(' · '), e.source);
  if (e.type === 'steps') for (const st of e.steps) traced('step', [en(st.title).replace(/^\d+\s+/, ''), en(st.line)].join(' · '), st.source);
  if (e.type === 'boundary') traced('boundary', en(e.label), e.source);
  if (e.type === 'text' && e.source) traced('caption', en(e.t), e.source);
  if (e.type === 'arrow' && e.label) traced('arrow', en(e.label.t), e.source);
}
fs.writeFileSync(
  path.join(outDir, 'technical-sources.md'),
  ['# Where each part of the technical diagram comes from', '', data.sources.intro, '', '| What | Words in the picture | Inventory section | Files |', '|---|---|---|---|', ...rows, '', ...data.sources.after, ''].join('\n'),
);

if (svgOnly) {
  console.log(written.map((w) => path.relative(repo, w.file)).join('\n'));
  process.exit(0);
}

// Render and check. The checks run in the same browser that makes the PNG, so they measure the fonts it used.
const { chromium } = await import('playwright');
const browser = await chromium.launch();
let failures = 0;
try {
  for (const w of written) {
    const page = await browser.newPage({ viewport: { width: w.width, height: w.height }, deviceScaleFactor: 2 });
    const svg = fs.readFileSync(w.file, 'utf8');
    await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(
      ({ minPx, pictureMax, budget, minText, minLine, margin, topBoxes, lineRows, tileLineRows }) => {
        const problems = [];
        const box = (el) => el.getBBox();
        const inside = (a, b, pad) => a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.width <= b.x + b.width + pad && a.y + a.height <= b.y + b.height + pad;
        const meet = (a, b, pad) => a.x + pad < b.x + b.width && b.x + pad < a.x + a.width && a.y + pad < b.y + b.height && b.y + pad < a.y + a.height;
        const svg = document.querySelector('svg');
        const W = svg.viewBox.baseVal.width;
        const H = svg.viewBox.baseVal.height;
        const rects = new Map([...svg.querySelectorAll('rect[data-box]')].map((r) => [r.dataset.box, r]));
        const texts = [...svg.querySelectorAll('text')];
        const label = (t) => t.textContent.slice(0, 50);
        // 1. No text leaves its box.
        for (const t of texts) {
          const r = rects.get(t.dataset.in);
          if (r && !inside(box(t), box(r), 0.5)) problems.push(`text leaves its box: "${label(t)}"`);
          // R8: and keeps the card-line size from its box's sides. Three units are allowed for a glyph that hangs past
          // where its row starts, such as the tail of a j.
          else if (r) {
            const a = box(t);
            const b = box(r);
            const m = Math.min(a.x - b.x, b.x + b.width - a.x - a.width);
            if (m < margin - 3) problems.push(`text ${m.toFixed(0)} units from its box's side, under ${margin}: "${label(t)}"`);
          }
        }
        // 2. No two texts overlap.
        const tb = texts.map((t) => [t, box(t)]);
        for (let i = 0; i < tb.length; i++)
          for (let j = i + 1; j < tb.length; j++) if (meet(tb[i][1], tb[j][1], 1.5)) problems.push(`texts overlap: "${label(tb[i][0])}" / "${label(tb[j][0])}"`);
        // 3. A text outside every card touches no card, and keeps 6 units from it.
        const cards = [...svg.querySelectorAll('rect[data-card]')];
        for (const t of texts.filter((t) => !t.dataset.in))
          for (const c of cards) {
            const b = box(c);
            if (meet(box(t), { x: b.x - 6, y: b.y - 6, width: b.width + 12, height: b.height + 12 }, 0)) problems.push(`text runs into a card: "${label(t)}" / ${c.dataset.box}`);
          }
        // 3b. An arrow starts and ends outside every card, unless it is drawn as leaving one part of a group. An arrow
        // drawn within one box (between the chips of a flow band) is exempt from that one box only.
        const ptsOf = (a) => (a.dataset.pts ? a.dataset.pts.split(' ').map((p) => ({ x: +p.split(',')[0], y: +p.split(',')[1] })) : [...a.points]);
        for (const a of svg.querySelectorAll('[data-line="arrow"]')) {
          const pts = ptsOf(a);
          const ends = a.dataset.fromPart ? [pts[pts.length - 1]] : [pts[0], pts[pts.length - 1]];
          for (const pt of ends)
            for (const c of cards) {
              if (a.dataset.within === c.dataset.box) continue;
              const b = box(c);
              if (pt.x > b.x && pt.x < b.x + b.width && pt.y > b.y && pt.y < b.y + b.height) problems.push(`an arrow ${pt === pts[0] ? 'starts' : 'ends'} inside ${c.dataset.box}`);
            }
        }
        // 3c. No arrow or connector line crosses a text.
        const lineTexts = texts.map((t) => [t, box(t)]);
        for (const a of svg.querySelectorAll('[data-line]')) {
          const pts = ptsOf(a);
          for (let i = 1; i < pts.length; i++) {
            const [p, q] = [pts[i - 1], pts[i]];
            const steps = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 2);
            for (const [t, b] of lineTexts) {
              for (let k = 0; k <= steps; k++) {
                const x = p.x + ((q.x - p.x) * k) / steps;
                const y = p.y + ((q.y - p.y) * k) / steps;
                if (x > b.x - 2 && x < b.x + b.width + 2 && y > b.y - 2 && y < b.y + b.height + 2) {
                  problems.push(`a line crosses the text "${label(t)}"`);
                  break;
                }
              }
            }
          }
        }
        // 3e. No two lines cross. Lines may meet where one of them ends (a bracket's tick, a fork's branch), but not
        // where both pass through. Lines here run at right angles, so each piece is either level or upright.
        const pieces = [...svg.querySelectorAll('[data-line]')].map((l, li) => {
          const pts = ptsOf(l);
          return pts.slice(1).map((q, i) => ({ li, p: pts[i], q, end: [pts[0], pts[pts.length - 1]] }));
        }).flat();
        const isEnd = (pt, ends) => ends.some((e) => Math.abs(e.x - pt.x) < 0.5 && Math.abs(e.y - pt.y) < 0.5);
        for (let i = 0; i < pieces.length; i++)
          for (let j = i + 1; j < pieces.length; j++) {
            const [a, b] = [pieces[i], pieces[j]];
            if (a.li === b.li) continue;
            const aLevel = a.p.y === a.q.y;
            const bLevel = b.p.y === b.q.y;
            if (aLevel === bLevel) continue;
            const [h, v] = aLevel ? [a, b] : [b, a];
            const x = v.p.x;
            const y = h.p.y;
            const inH = x > Math.min(h.p.x, h.q.x) && x < Math.max(h.p.x, h.q.x);
            const inV = y > Math.min(v.p.y, v.q.y) && y < Math.max(v.p.y, v.q.y);
            const pt = { x, y };
            if (inH && inV && !isEnd(pt, h.end) && !isEnd(pt, v.end)) problems.push(`two lines cross at ${x},${y}`);
          }
        // 3d. Every numbered step that names a part has a connector whose two ends touch that step and that part.
        // An end touches a box when it lies on the box's border, or within 14 units of it: an arrow's tip stops 12
        // units short of the box its head points at.
        const T = 14;
        const touches = (pt, b) =>
          pt.x >= b.x - T && pt.x <= b.x + b.width + T && pt.y >= b.y - T && pt.y <= b.y + b.height + T &&
          (Math.abs(pt.x - b.x) <= T || Math.abs(pt.x - b.x - b.width) <= T || Math.abs(pt.y - b.y) <= T || Math.abs(pt.y - b.y - b.height) <= T);
        for (const st of svg.querySelectorAll('rect[data-flow][data-part]')) {
          const part = rects.get(st.dataset.part);
          if (!part) {
            problems.push(`step ${st.dataset.flow} names a part that is not drawn: ${st.dataset.part}`);
            continue;
          }
          const joined = [...svg.querySelectorAll('[data-link]')].some((l) => {
            const pts = ptsOf(l);
            const [a, z] = [pts[0], pts[pts.length - 1]];
            return (touches(a, box(st)) && touches(z, box(part))) || (touches(z, box(st)) && touches(a, box(part)));
          });
          if (!joined) problems.push(`step ${st.dataset.flow} has no connector to its part ${st.dataset.part}`);
        }
        // 4. No two boxes that share a parent overlap, and a box inside another stays inside it.
        const groups = {};
        for (const r of svg.querySelectorAll('rect[data-solid]')) (groups[r.dataset.solid] ??= []).push(r);
        for (const list of Object.values(groups))
          for (let i = 0; i < list.length; i++)
            for (let j = i + 1; j < list.length; j++) if (meet(box(list[i]), box(list[j]), 0.5)) problems.push(`boxes overlap: ${list[i].dataset.box} / ${list[j].dataset.box}`);
        for (const r of svg.querySelectorAll('rect[data-solid]')) {
          const parent = rects.get(r.dataset.solid);
          if (parent && !inside(box(r), box(parent), 0.5)) problems.push(`box leaves its card: ${r.dataset.box} in ${r.dataset.solid}`);
        }
        // 5. Nothing leaves the canvas.
        for (const el of [...rects.values(), ...texts, ...svg.querySelectorAll('[data-picture]')]) {
          const b = box(el);
          if (b.x < 0 || b.y < 0 || b.x + b.width > W || b.y + b.height > H) problems.push(`off the canvas: ${el.dataset.box ?? el.dataset.picture ?? label(el)}`);
        }
        // 6. R1: every text and every part of a text is at least 16 px when the picture is 1200 wide.
        const sizes = [];
        for (const el of [...texts, ...svg.querySelectorAll('tspan')]) {
          const px = (parseFloat(getComputedStyle(el).fontSize) * 1200) / W;
          sizes.push(px);
          if (px < minPx - 1e-9) problems.push(`text under ${minPx} px at 1200 wide (${px.toFixed(1)}): "${label(el)}"`);
        }
        // 7. R2: at most three sizes inside the cards.
        const inCards = new Set(texts.filter((t) => t.dataset.role === 'card').map((t) => getComputedStyle(t).fontSize));
        if (inCards.size > 3) problems.push(`${inCards.size} text sizes inside the cards: ${[...inCards].join(', ')}`);
        // 8. R3: no picture is taller than five times the card line.
        for (const p of svg.querySelectorAll('[data-picture]')) {
          // A cut-out is a nested svg that crops its canvas, so its own height is the height drawn.
          // An icon drawn here is a group whose circle is its size.
          const h = p.tagName === 'svg' || p.tagName === 'image' ? p.height.baseVal.value : p.querySelector('circle').getBBox().height;
          if (h > pictureMax + 0.5) problems.push(`picture ${p.dataset.picture} is ${h.toFixed(0)} units tall, the limit is ${pictureMax}`);
        }
        // 9. R10: text at least 4.5:1 against what it sits on, and every border and arrow at least 3:1 against white.
        const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
        const lum = (c) => {
          const [r, g, b] = c.map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const ratio = (a, b) => {
          const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
          return (x + 0.05) / (y + 0.05);
        };
        const white = [255, 255, 255];
        let lowestText = Infinity;
        for (const el of [...texts, ...svg.querySelectorAll('tspan')]) {
          const t = el.tagName === 'tspan' ? el.parentElement : el;
          const under = rects.get(t.dataset.in);
          const bg = under ? rgb(getComputedStyle(under).fill) : white;
          const r = ratio(rgb(getComputedStyle(el).fill), bg);
          lowestText = Math.min(lowestText, r);
          if (r < minText) problems.push(`text contrast ${r.toFixed(2)}:1, under ${minText}:1: "${label(el)}"`);
        }
        let lowestLine = Infinity;
        for (const el of [...rects.values(), ...svg.querySelectorAll('[data-line="arrow"]')]) {
          const s = getComputedStyle(el).stroke;
          if (!s || s === 'none') continue;
          const r = ratio(rgb(s), white);
          lowestLine = Math.min(lowestLine, r);
          if (r < minLine) problems.push(`border contrast ${r.toFixed(2)}:1, under ${minLine}:1: ${el.dataset.box ?? 'arrow'}`);
        }
        // 9b. No text block inside a box runs to more rows than the picture allows under its title.
        for (const t of svg.querySelectorAll('text[data-kind]')) {
          const cap = t.dataset.kind === 'tile-line' ? tileLineRows : lineRows;
          if (cap != null && Number(t.dataset.rows) > cap) problems.push(`a text block of ${t.dataset.rows} rows under its title, the limit is ${cap}: "${label(t)}"`);
        }
        const longest = Math.max(0, ...[...svg.querySelectorAll('text[data-kind]')].map((t) => Number(t.dataset.rows)));
        // 10. R5: the words in the picture, against its budget.
        const all = texts.map((t) => t.textContent).join(' ');
        const HAN = /\p{Script=Han}/gu;
        const han = (all.match(HAN) ?? []).length;
        const latin = (all.replace(HAN, ' ').match(/[\p{L}\p{N}’']+/gu) ?? []).filter((w) => /\p{L}/u.test(w)).length;
        const count = latin + Math.ceil(han / 2);
        if (count > budget) problems.push(`${count} words, the budget is ${budget}`);
        // 11. R6: at most seven top-level boxes.
        const groupCount = svg.querySelectorAll('rect[data-card][data-solid="top"]').length;
        if (topBoxes != null && groupCount > topBoxes) problems.push(`${groupCount} top-level boxes, the limit is ${topBoxes}`);
        return { problems, longest, texts: texts.length, boxes: rects.size, count, han, latin, smallest: Math.min(...sizes), groupCount, cardSizes: [...inCards], lowestText, lowestLine };
      },
      { minPx: w.minPx ?? data.style.minPxAt1200, pictureMax: data.style.pictureMax, budget: w.budget, minText: 4.5, minLine: 3, margin: SIZE.line, topBoxes: w.topBoxes, lineRows: w.lineRows, tileLineRows: w.tileLineRows },
    );
    const png = w.file.replace(/\.svg$/, '.png');
    await page.locator('svg').first().screenshot({ path: png, omitBackground: false });
    const rel = path.relative(repo, png);
    const facts =
      `${report.count} words of ${w.budget} (${report.latin} Latin words, ${report.han} Han characters), ${report.groupCount} top-level boxes, ` +
      `smallest text ${report.smallest.toFixed(1)} px at 1200 wide, sizes in cards ${report.cardSizes.join(' ')}, ` +
      `lowest contrast: text ${report.lowestText.toFixed(2)}:1, borders ${report.lowestLine.toFixed(2)}:1, longest text block ${report.longest} rows`;
    if (report.problems.length) {
      failures += report.problems.length;
      console.log(`FAIL ${rel}: ${report.problems.length} problems; ${facts}`);
      for (const p of report.problems) console.log('  ' + p);
    } else {
      console.log(`ok   ${rel}: ${report.texts} texts and ${report.boxes} boxes checked; ${facts}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
if (failures) {
  console.error(`${failures} problems`);
  process.exit(1);
}
