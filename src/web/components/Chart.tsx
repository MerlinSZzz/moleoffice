// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Chart -- plots drawn as inline SVG, with no charting library.
 *
 * WHY NO LIBRARY: a chart library brings a colour system with it, and this app's whole point
 * is that colour carries meaning defined once in tokens.css. Every library chart would then
 * need overriding anyway, and it would still not re-theme when the user switches to `coffee`
 * or `hc`. Drawing the SVG ourselves means a theme swap is a variable swap: every stroke and
 * fill below is `var(--something)`, so the chart follows the app for free.
 *
 * WHY IT MEASURES ITSELF: a chart laid out once for a 900px panel and then scaled down to a
 * phone gets 5px axis labels. So the geometry is recomputed from the real measured width, and
 * anything that would collide is dealt with rather than drawn on top of something else:
 * numeric ticks thin out, column names turn 35 degrees, limit labels move to whichever side of
 * their line covers the least data, and a limit label that is a whole sentence becomes a
 * lettered key under the chart. `geometry()` below is pure, and is what the tests check at
 * 320px.
 *
 * NO ANIMATION: there is deliberately no transition or keyframe anywhere in this file. These
 * charts appear inside a summary you are reading, and a line that draws itself over 800ms is
 * 800ms you cannot read the number.
 *
 * ON THE TWO SPEC SHAPES: see normalizeSpec() near the bottom of the type section. This
 * component reads both the flat form (xLabel, points as [x, y]) and the axis-object form
 * (x: {label, unit, min, max}, points as {x, y}) that the seed and the server validator use.
 */

import { t, type WordKey } from '@shared/i18n.ts'
import { useEffect, useId, useRef, useState } from 'react'
// The data table under a chart scrolls both ways: sideways, and downwards inside a 260px cap. Both
// are marked from one reading, which is contract question 17 answered. See components/InReach.tsx.
import { InReach } from './InReach.tsx'

// ---------------------------------------------------------------------------- the spec

export type ChartKind = 'line' | 'bar' | 'scatter'

/** A point as a tuple, or as the object the server and the seed write. Both are accepted. */
export type ChartPoint = [number, number] | { x: number; y: number; label?: string }

export interface ChartSeries {
  name: string
  id?: string
  /**
   * The NAME of a CSS custom property, e.g. '--st-failed'. Not a colour.
   * A literal colour here would survive a theme swap and stop meaning anything.
   */
  colorToken?: string
  /**
   * A semantic state instead of a token: 'failed', 'done', ... Resolved to --st-<state>, so a
   * failed run is the same colour on the chart as it is in the checklist above it.
   */
  state?: string
  /** Force a dashed line. Series get distinct dashes anyway; this pins one. */
  dashed?: boolean
  points: ChartPoint[]
}

export interface ChartAxis {
  label?: string
  /** Shown in brackets after the label, e.g. force (N). */
  unit?: string
  min?: number
  max?: number
  /** Bar charts with named columns. A point's x is then the index into this list. */
  categories?: string[]
}

/**
 * A reference line. A y line is a limit (max holding force, target accuracy), an x line an event
 * (the day the firmware changed). Written either as {y: 12, label} or as the server's
 * {axis: 'y', value: 12, label}.
 */
export type ChartAnnotation =
  | { y?: number; x?: number; label: string; colorToken?: string; axis?: undefined }
  | { axis: 'x' | 'y'; value: number; label: string; id?: string; colorToken?: string }

export interface ChartSpec {
  kind: ChartKind
  title?: string
  /** Flat axis labels. Include the unit: nothing else knows what the numbers are. */
  xLabel?: string
  yLabel?: string
  /** Axis objects, the other accepted spelling. Wins over xLabel/yLabel when both are given. */
  x?: ChartAxis
  y?: ChartAxis
  series: ChartSeries[]
  annotations?: ChartAnnotation[]
}

// ---------------------------------------------------------------------------- palette

/**
 * Series colours are drawn from the semantic state tokens, not from a private chart palette.
 *
 * That looks odd at first -- a series is not a "state". The reason is that --st-* are the only
 * colours the token contract guarantees exist in all seven themes AND that have been contrast
 * checked against every surface. A private --chart-1..5 would have to be re-checked in each
 * theme by hand, and would resolve to nothing in a theme that forgot it.
 *
 * Colour is never the only channel: each series also gets its own dash pattern and its own
 * marker shape, both shown in the legend, so the chart survives greyscale printing and the
 * `mono` theme where several of these tokens resolve to the same ink.
 */
const SERIES_TOKENS = ['--st-doing', '--st-done', '--st-inferred', '--st-blocked', '--st-todo']
const SERIES_DASH = ['0', '6 3', '1 3', '9 3 2 3', '4 2 1 2']
const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'cross'] as const
type Marker = (typeof MARKERS)[number]

/** A limit line is the value at which something fails, so it borrows the failure colour. */
const ANNOTATION_TOKEN = '--st-failed'

/**
 * Used only if the probe cannot be measured, which means tokens.css did not load at all -- in
 * which case the whole app is unstyled and this is the least of anyone's problems. It is not
 * covering up a data error, so it does not need to be a visible failure.
 */
const FALLBACK_TICK_PX = 12

// ---------------------------------------------------------------------------- scales

export interface Scale {
  /** Domain, already rounded outward to whole ticks. */
  lo: number
  hi: number
  step: number
  ticks: number[]
}

/**
 * Round a domain out to "nice" tick values: 1, 2 or 5 times a power of ten.
 *
 * The alternative -- ticks at the exact data min and max -- gives axes labelled 0.037 to
 * 4.912, which nobody can read a value off. `target` is how many ticks we would like; the
 * result is usually within one of it.
 */
export function niceScale(min: number, max: number, target: number): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error(t('sheet.chart.finiteBounds', { min, max }))
  }
  const want = Math.max(2, Math.round(target))

  // A flat series (every y identical) has no range to divide. Give it one, or the line lands
  // on the floor of the plot and reads as zero.
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.5
    min -= pad
    max += pad
  }

  const raw = (max - min) / want
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag

  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const decimals = tickDecimals(step)
  return { lo: round(lo, decimals), hi: round(hi, decimals), step, ticks: ticksIn(lo, hi, step) }
}

/**
 * Ticks at multiples of `step` inside [lo, hi].
 *
 * Built by multiplication from a whole multiple of the step, then re-rounded: adding `step`
 * repeatedly accumulates float error and produces ticks like 0.30000000000000004.
 */
export function ticksIn(lo: number, hi: number, step: number): number[] {
  const decimals = tickDecimals(step)
  const first = Math.ceil(round(lo / step, 9))
  const out: number[] = []
  for (let i = first; ; i++) {
    const v = round(i * step, decimals)
    if (v > hi + step * 1e-9) break
    if (v >= lo - step * 1e-9) out.push(v)
    if (out.length > 1000) break // a guard against a pathological step, never hit in practice
  }
  return out
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, Math.min(12, decimals))
  return Math.round(v * f) / f
}

function tickDecimals(step: number): number {
  const d = Math.ceil(-Math.log10(step))
  return Math.max(0, Math.min(9, d))
}

/** Format one tick. Decimals come from the step, so a 0.5 step never prints "1" twice. */
export function formatTick(v: number, step: number): string {
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) {
    // Long runs of zeros are unreadable on an axis and force a huge left margin.
    return v.toExponential(1).replace('e+', 'e')
  }
  const s = v.toFixed(tickDecimals(step))
  return s === '-0' ? '0' : s
}

/**
 * Decide which labels can be drawn without touching, walking along the axis and keeping a
 * label only when it clears the last kept one by `gap` pixels.
 *
 * This is the whole answer to "the chart must be right at 320px". Rotating labels or letting
 * them overlap were the alternatives; dropping some is the only one that stays readable.
 */
export function keepMask(centers: number[], widths: number[], gap: number): boolean[] {
  const keep = centers.map(() => false)
  let lastRight = -Infinity
  for (let i = 0; i < centers.length; i++) {
    const c = centers[i]
    const w = widths[i]
    if (c === undefined || w === undefined) continue
    if (c - w / 2 >= lastRight + gap) {
      keep[i] = true
      lastRight = c + w / 2
    }
  }
  return keep
}

// ---------------------------------------------------------------------------- normalising

export interface NormSeries {
  name: string
  token: string
  dash: string
  marker: Marker
  points: Array<[number, number]>
}

export interface NormAnnotation {
  x?: number
  y?: number
  label: string
  token: string
}

/** One shape for the renderer to draw, whichever spelling the spec arrived in. */
export interface NormChart {
  kind: ChartKind
  title?: string
  xLabel?: string
  yLabel?: string
  /** Named x columns, or null for a numeric x axis. */
  categories: string[] | null
  xMin?: number
  xMax?: number
  yMin?: number
  yMax?: number
  series: NormSeries[]
  annotations: NormAnnotation[]
  /** Points thrown away because they could not be plotted. Reported on screen, never hidden. */
  dropped: number
}

export type NormResult = { ok: true; chart: NormChart } | { ok: false; reason: string }

/**
 * Read either spec spelling into one shape, or say why it cannot be drawn.
 *
 * WHY THIS EXISTS: three places in this repository describe a chart, and they do not agree.
 * This component's own contract uses xLabel and [x, y] tuples; scripts/seed.ts and
 * src/server/lib/summary.ts use x: {label, unit, min, max} with {x, y} points, series states
 * instead of tokens, and annotations written as {axis, value, label}. Rather than render a
 * blank rectangle for two of the three, the reader accepts all of them.
 *
 * It is a tolerant READER, not a tolerant validator: anything it cannot make sense of comes
 * back as a reason and is shown on the page. Nothing is guessed.
 */
export function normalizeSpec(spec: ChartSpec): NormResult {
  if (!spec || typeof spec !== 'object') return { ok: false, reason: t('sheet.chart.missing') }
  if (spec.kind !== 'line' && spec.kind !== 'bar' && spec.kind !== 'scatter') {
    return {
      ok: false,
      reason: t('sheet.chart.unknown', { kind: String(spec.kind) }),
    }
  }
  if (!Array.isArray(spec.series) || spec.series.length === 0) {
    return { ok: false, reason: t('sheet.chart.noSeries') }
  }

  const categories = spec.x?.categories ?? null
  let dropped = 0

  const series: NormSeries[] = spec.series.map((s, i) => {
    const points: Array<[number, number]> = []
    for (const p of s.points ?? []) {
      const pair = readPoint(p)
      if (!pair) {
        dropped++
        continue
      }
      // With named columns x is an index, and an index off the end would draw a bar outside
      // the axes rather than fail.
      if (categories && (!Number.isInteger(pair[0]) || pair[0] < 0 || pair[0] >= categories.length)) {
        dropped++
        continue
      }
      points.push(pair)
    }
    // Lines and bars are drawn in x order or they zig-zag back on themselves. A scatter has
    // no order to preserve.
    if (spec.kind !== 'scatter') points.sort((a, b) => a[0] - b[0])

    const token =
      s.colorToken ?? (s.state ? `--st-${s.state}` : SERIES_TOKENS[i % SERIES_TOKENS.length]) ?? '--text'
    return {
      name: s.name,
      token,
      dash: s.dashed ? '6 3' : SERIES_DASH[i % SERIES_DASH.length] ?? '0',
      marker: MARKERS[i % MARKERS.length] ?? 'circle',
      points,
    }
  })

  const annotations: NormAnnotation[] = []
  for (const a of spec.annotations ?? []) {
    const token = a.colorToken ?? ANNOTATION_TOKEN
    if ('axis' in a && a.axis !== undefined) {
      if (!Number.isFinite(a.value)) {
        return { ok: false, reason: t('sheet.chart.annotationNumber', { label: a.label }) }
      }
      annotations.push(a.axis === 'y' ? { y: a.value, label: a.label, token } : { x: a.value, label: a.label, token })
      continue
    }
    const hasX = a.x !== undefined && Number.isFinite(a.x)
    const hasY = a.y !== undefined && Number.isFinite(a.y)
    if (!hasX && !hasY) {
      return {
        ok: false,
        reason: t('sheet.chart.annotationCoordinates', { label: a.label }),
      }
    }
    annotations.push({
      ...(hasX ? { x: a.x } : {}),
      ...(hasY ? { y: a.y } : {}),
      label: a.label,
      token,
    })
  }

  const chart: NormChart = {
    kind: spec.kind,
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    ...(axisLabel(spec.x, spec.xLabel) !== undefined ? { xLabel: axisLabel(spec.x, spec.xLabel) } : {}),
    ...(axisLabel(spec.y, spec.yLabel) !== undefined ? { yLabel: axisLabel(spec.y, spec.yLabel) } : {}),
    categories,
    ...(numberOrNothing(spec.x?.min, 'xMin')),
    ...(numberOrNothing(spec.x?.max, 'xMax')),
    ...(numberOrNothing(spec.y?.min, 'yMin')),
    ...(numberOrNothing(spec.y?.max, 'yMax')),
    series,
    annotations,
    dropped,
  }
  return { ok: true, chart }
}

function readPoint(p: ChartPoint): [number, number] | null {
  if (Array.isArray(p)) {
    const [x, y] = p
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  }
  if (p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.y)) return [p.x, p.y]
  return null
}

/** "force" plus unit "N" becomes "force (N)"; the unit is never dropped on the floor. */
function axisLabel(axis: ChartAxis | undefined, flat: string | undefined): string | undefined {
  const label = axis?.label ?? flat
  if (label === undefined) return undefined
  return axis?.unit ? `${label} (${axis.unit})` : label
}

function numberOrNothing(v: number | undefined, key: string): Record<string, number> {
  return v !== undefined && Number.isFinite(v) ? { [key]: v } : {}
}

// ---------------------------------------------------------------------------- geometry

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** A reference line with its label already placed somewhere it does not collide. */
export interface PlacedAnnotation {
  /** The full text. Always shown somewhere: on the line, or in the key under the chart. */
  label: string
  /** Set when the label was too long to lie on the plot and became a keyed footnote. */
  key?: string
  /** What is actually drawn at textX/textY: the label, or just the key letter. */
  drawn: string
  token: string
  /** Pixel x of the vertical line, if there is one. */
  lineX?: number
  /** Pixel y of the horizontal line, if there is one. */
  lineY?: number
  textX: number
  /** Baseline y of the label. */
  textY: number
  anchor: 'start' | 'end'
  box: Box
}

export interface Geometry {
  w: number
  h: number
  ml: number
  mr: number
  mt: number
  mb: number
  plotW: number
  plotH: number
  x: Scale
  y: Scale
  /** The text drawn at each x tick: a number, or a category name. */
  xLabels: string[]
  /** Which x tick labels survived collision thinning, index-aligned with x.ticks. */
  xKeep: boolean[]
  /** Column names are turned on their side when they will not fit flat. See geometry(). */
  xRotate: boolean
  yKeep: boolean[]
  /** Width of one bar for one series, in pixels. Zero for line and scatter. */
  barW: number
  annotations: PlacedAnnotation[]
  sx: (v: number) => number
  sy: (v: number) => number
}

/**
 * Estimated pixel width of a string.
 *
 * A Latin glyph in the UI stack is about 0.62em; a Han, Kana or Hangul glyph is a full em.
 * Measuring 倒片台安全护罩 the Latin way under-states it by 40%, which is enough to let the collision
 * check pass a label that is in fact drawn over its neighbour -- and this app has Chinese
 * module names in it. Over-estimating slightly is the safe direction: it thins one label too
 * many rather than overlapping two.
 */
export function textWidth(s: string, size: number): number {
  let w = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    const wide =
      (c >= 0x1100 && c <= 0x115f) || // Hangul Jamo
      (c >= 0x2e80 && c <= 0xa4cf) || // CJK radicals through Yi
      (c >= 0xac00 && c <= 0xd7a3) || // Hangul syllables
      (c >= 0xf900 && c <= 0xfaff) || // CJK compatibility ideographs
      (c >= 0xfe30 && c <= 0xfe4f) || // CJK compatibility forms
      (c >= 0xff00 && c <= 0xff60) || // full-width forms
      (c >= 0xffe0 && c <= 0xffe6)
    w += wide ? size : size * 0.62
  }
  return w
}

/**
 * Work out every pixel of the plot from the measured width. Pure, so the tests can assert
 * that nothing collides at 320px without a browser.
 *
 * `fs` is the real, computed pixel size of --fs-1, measured from a hidden probe span rather
 * than assumed, because a density preset or a browser zoom changes it.
 */
export function geometry(c: NormChart, w: number, h: number, fs: number): Geometry {
  const axisFs = fs + 1
  const textW = textWidth

  const xs: number[] = []
  const ys: number[] = []
  for (const s of c.series) {
    for (const p of s.points) {
      xs.push(p[0])
      ys.push(p[1])
    }
  }
  // A reference line off the top of the plot is a reference line you cannot see, so the
  // domain covers the annotations as well as the data.
  for (const a of c.annotations) {
    if (a.x !== undefined) xs.push(a.x)
    if (a.y !== undefined) ys.push(a.y)
  }
  // Bars are read as areas from a baseline, so the baseline has to be on the chart.
  if (c.kind === 'bar') ys.push(0)
  if (c.categories) {
    xs.push(-0.5, c.categories.length - 0.5)
  }
  if (xs.length === 0 || ys.length === 0) throw new Error(t('sheet.chart.noPoints'))

  const yTarget = Math.max(2, Math.min(8, Math.floor(h / (fs * 3.2))))
  const y = fixScale(niceScale(Math.min(...ys), Math.max(...ys), yTarget), c.yMin, c.yMax)

  const yLabelW = Math.max(...y.ticks.map((t) => textW(formatTick(t, y.step), fs)), fs)
  const ml = Math.round(yLabelW + 10 + (c.yLabel ? axisFs + 6 : 0))
  const mr = 12
  const mt = Math.round(fs * 0.9)

  /**
   * Column names are turned on their side when they will not fit flat.
   *
   * Thinning is the right answer for a numeric axis -- you can still read a value off an
   * unlabelled tick, because the axis is continuous. It is the WRONG answer for named columns:
   * a bar with no name under it cannot be attributed at all, and the reader either guesses or
   * mis-reads. So instead of dropping "Chest cam", the whole row turns 35 degrees, which costs
   * some height and keeps every column named.
   */
  const cats = c.categories
  let xRotate = false
  let catBudget = 0
  if (cats) {
    const slot = Math.max(40, w - ml - mr) / cats.length
    const widest = Math.max(...cats.map((s) => textW(s, fs)))
    xRotate = widest + 6 > slot
    // A very long name would eat the whole chart, so it is capped and truncated with an
    // ellipsis. The full name stays in the data table and in the text alternative.
    if (xRotate) catBudget = Math.min(widest, h * 0.42)
  }

  const mb = Math.round(
    (xRotate ? catBudget * ROT_SIN + fs * ROT_COS : fs) + 8 + (c.xLabel ? axisFs + 6 : 0),
  )

  const plotW = Math.max(40, w - ml - mr)
  const plotH = Math.max(40, h - mt - mb)

  const xTarget = Math.max(2, Math.min(9, Math.floor(plotW / (fs * 4.5))))
  let x: Scale
  let barW = 0

  if (c.categories) {
    // Named columns: one tick per column, at its index, and the domain is half a slot wider
    // at each end so the first and last bars sit inside the axes.
    const n = c.categories.length
    x = { lo: -0.5, hi: n - 0.5, step: 1, ticks: Array.from({ length: n }, (_, i) => i) }
    barW = Math.max(1, ((plotW / n) * 0.72) / Math.max(1, c.series.length))
  } else {
    x = fixScale(niceScale(Math.min(...xs), Math.max(...xs), xTarget), c.xMin, c.xMax)
    if (c.kind === 'bar') {
      // Bars sit ON their x value, so half a bar hangs off each end unless the domain is
      // widened by half a slot.
      const uniq = [...new Set(xs)].sort((a, b) => a - b)
      let gap = Infinity
      for (let i = 1; i < uniq.length; i++) {
        const a = uniq[i - 1]
        const b = uniq[i]
        if (a !== undefined && b !== undefined) gap = Math.min(gap, b - a)
      }
      if (!Number.isFinite(gap) || gap <= 0) gap = Math.max(1, (x.hi - x.lo) / 4)
      x = fixScale(
        niceScale(Math.min(...xs) - gap / 2, Math.max(...xs) + gap / 2, xTarget),
        c.xMin,
        c.xMax,
      )
      const slotPx = (gap / (x.hi - x.lo)) * plotW
      barW = Math.max(1, (slotPx * 0.72) / Math.max(1, c.series.length))
    }
  }

  const sx = (v: number) => ml + ((v - x.lo) / (x.hi - x.lo)) * plotW
  const sy = (v: number) => mt + plotH - ((v - y.lo) / (y.hi - y.lo)) * plotH

  const xLabels = cats
    ? x.ticks.map((t) => (xRotate ? truncateTo(cats[t] ?? String(t), catBudget, fs) : cats[t] ?? String(t)))
    : x.ticks.map((t) => formatTick(t, x.step))

  // Turned on their side, labels only have to clear each other by their line height divided by
  // the sine of the angle, which is why rotating fits so many more of them in.
  const xKeep = xRotate
    ? keepMask(x.ticks.map(sx), xLabels.map(() => (fs + 2) / ROT_SIN), 2)
    : keepMask(x.ticks.map(sx), xLabels.map((s) => textW(s, fs)), 6)
  const yKeep = keepMask(
    y.ticks.map((t) => -sy(t)), // negated: keepMask walks forward, and y grows upward
    y.ticks.map(() => fs),
    4,
  )

  // Where the data actually is, in pixels, so a label can be put somewhere it does not cover
  // it. Segments are sampled rather than only their end points: a four-point line has almost
  // no vertices to collide with, but the line between them is what the reader is following.
  const ink: Array<[number, number]> = []
  const budget = 400
  for (const s of c.series) {
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i]
      if (!p) continue
      ink.push([sx(p[0]), sy(p[1])])
      const q = s.points[i + 1]
      if (!q || ink.length > budget) continue
      for (let k = 1; k < 6; k++) {
        ink.push([sx(p[0] + ((q[0] - p[0]) * k) / 6), sy(p[1] + ((q[1] - p[1]) * k) / 6)])
      }
    }
  }

  const annotations = placeAnnotations(c.annotations, { ml, mt, plotW, plotH, fs, sx, sy, ink })

  return { w, h, ml, mr, mt, mb, plotW, plotH, x, y, xLabels, xKeep, xRotate, yKeep, barW, annotations, sx, sy }
}

/** The angle column names are turned through when they will not fit flat. */
export const ROT_DEG = 35
const ROT_SIN = Math.sin((ROT_DEG * Math.PI) / 180)
const ROT_COS = Math.cos((ROT_DEG * Math.PI) / 180)

/** Cut a label down to a pixel budget, marking that it was cut. Never cuts silently. */
export function truncateTo(s: string, budget: number, fs: number): string {
  if (textWidth(s, fs) <= budget) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', fs) > budget) break
    out += ch
  }
  return out + '…'
}

/**
 * Put each reference-line label somewhere it does not sit on top of another one.
 *
 * The 12 N and the 14 N limits on the clamp chart are about 25 pixels apart, which is less
 * than one line of text: written the obvious way, both labels land in the same place and the
 * chart says nothing legible about either limit.
 *
 * Each label is offered four positions -- above or below its line, at the right or the left
 * edge -- and takes the one that is clear of the other labels and covers the least data. On
 * the clamp chart that moves the "14 N" label to the left-hand side, where both lines are
 * still down at 7 N, instead of laying it across the v3 line at the point where v3 breaks.
 *
 * A label that finds nothing clear is still drawn, in its best position: an unlabelled limit
 * line is worse than a crowded one, because the reader cannot tell what it means at all.
 */
function placeAnnotations(
  annotations: NormAnnotation[],
  m: {
    ml: number
    mt: number
    plotW: number
    plotH: number
    fs: number
    sx: (v: number) => number
    sy: (v: number) => number
    ink: Array<[number, number]>
  },
): PlacedAnnotation[] {
  const left = m.ml
  const right = m.ml + m.plotW
  const top = m.mt
  const bottom = m.mt + m.plotH
  const placed: PlacedAnnotation[] = []
  const taken: Box[] = []

  const KEYS = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // I and O are left out: they read as 1 and 0
  let keyed = 0

  for (const a of annotations) {
    /**
     * A limit worth drawing is often a sentence -- "12 N needed to hold the 60 mm pot through
     * a transplant pull". Laid across a 320px plot that sentence IS the chart: it covers the
     * data it is meant to be a limit on. So a label wider than about half the plot becomes a
     * letter on the line plus a line in a key underneath, which is what a printed figure does.
     */
    const useKey = textWidth(a.label, m.fs) > m.plotW * 0.55
    const key = useKey ? (KEYS[keyed++ % KEYS.length] ?? '*') : undefined
    const drawn = key ?? a.label

    const w = Math.min(textWidth(drawn, m.fs), m.plotW - 6)
    const h = m.fs
    const candidates: Array<{ textX: number; textY: number; anchor: 'start' | 'end' }> = []

    if (a.y !== undefined && a.x === undefined) {
      const y = m.sy(a.y)
      // Above the line first: a limit reads as a ceiling, and the label belongs on the side
      // the reader's eye is coming from.
      for (const dy of [-4, m.fs + 2]) {
        candidates.push({ textX: right - 3, textY: y + dy, anchor: 'end' })
        candidates.push({ textX: left + 3, textY: y + dy, anchor: 'start' })
      }
    } else if (a.x !== undefined) {
      const x = m.sx(a.x)
      // Near the right-hand edge the label would run off, so it starts on the other side.
      const nearRight = x > left + m.plotW * 0.65
      for (let row = 0; row < 4; row++) {
        const ty = top + m.fs - 2 + row * (m.fs + 2)
        candidates.push(
          nearRight
            ? { textX: x - 4, textY: ty, anchor: 'end' }
            : { textX: x + 4, textY: ty, anchor: 'start' },
        )
        candidates.push(
          nearRight
            ? { textX: x + 4, textY: ty, anchor: 'start' }
            : { textX: x - 4, textY: ty, anchor: 'end' },
        )
      }
    }

    if (candidates.length === 0) continue

    const boxOf = (cand: { textX: number; textY: number; anchor: 'start' | 'end' }): Box => ({
      x: cand.anchor === 'end' ? cand.textX - w : cand.textX,
      y: cand.textY - h,
      w,
      h,
    })

    const inside = (b: Box) => b.x >= left - 2 && b.x + b.w <= right + 2 && b.y >= top - 2 && b.y + b.h <= bottom + 2

    // Lower is better. The three penalties are ranked, not added blindly: running off the plot
    // is worse than sitting on another label, which is worse than sitting on the data.
    const cost = (cand: { textX: number; textY: number; anchor: 'start' | 'end' }): number => {
      const b = boxOf(cand)
      let c = inside(b) ? 0 : 10000
      if (taken.some((t) => overlap(t, b))) c += 1000
      for (const [px, py] of m.ink) {
        if (px >= b.x && px <= b.x + b.w && py >= b.y - 2 && py <= b.y + b.h + 2) c += 1
      }
      return c
    }

    let chosen = candidates[0]
    let best = Infinity
    for (const cand of candidates) {
      const c = cost(cand)
      if (c < best) {
        best = c
        chosen = cand
      }
    }

    if (!chosen) continue
    const box = boxOf(chosen)
    taken.push(box)
    placed.push({
      label: a.label,
      ...(key !== undefined ? { key } : {}),
      drawn,
      token: a.token,
      ...(a.x !== undefined ? { lineX: m.sx(a.x) } : {}),
      ...(a.y !== undefined ? { lineY: m.sy(a.y) } : {}),
      textX: chosen.textX,
      textY: chosen.textY,
      anchor: chosen.anchor,
      box,
    })
  }

  return placed
}

function overlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Apply an author-set axis minimum or maximum.
 *
 * The step stays as computed, so the ticks are still round numbers; only the ends of the
 * domain move. An author who writes y.min = 0 wants the bar chart to start at zero, not a
 * different set of tick values.
 */
function fixScale(s: Scale, min: number | undefined, max: number | undefined): Scale {
  if (min === undefined && max === undefined) return s
  const lo = min ?? s.lo
  const hi = max ?? s.hi
  if (!(hi > lo)) {
    throw new Error(t('sheet.chart.axisRange', { min: lo, max: hi }))
  }
  return { lo, hi, step: s.step, ticks: ticksIn(lo, hi, s.step) }
}

// ---------------------------------------------------------------------------- text alternative

/**
 * The sentence a screen reader gets instead of the picture. It states the axes with their
 * units, then the shape of each series as numbers, then the reference lines -- everything a
 * sighted reader takes from a glance.
 */
const CHART_KIND_WORDS = {
  line: 'sheet.chart.line', bar: 'sheet.chart.bar', scatter: 'sheet.chart.scatter',
} as const satisfies Record<ChartKind, WordKey>

export function describeChart(c: NormChart): string {
  const kind = t(CHART_KIND_WORDS[c.kind])
  const parts: string[] = [c.title ? t('sheet.chart.named', { kind, title: c.title }) : t('sheet.chart.unnamed', { kind })]
  if (c.xLabel) parts.push(t('sheet.chart.horizontal', { label: c.xLabel }))
  if (c.yLabel) parts.push(t('sheet.chart.vertical', { label: c.yLabel }))
  for (const s of c.series) {
    if (s.points.length === 0) {
      parts.push(t('sheet.chart.emptySeries', { name: s.name }))
      continue
    }
    const ys = s.points.map((p) => p[1])
    const first = s.points[0]
    const last = s.points[s.points.length - 1]
    parts.push(t('sheet.chart.seriesDetail', {
      name: s.name, n: s.points.length, first: first ? first[0] : '?', last: last ? last[0] : '?',
      min: Math.min(...ys), max: Math.max(...ys), end: last ? last[1] : '?',
    }))
  }
  for (const a of c.annotations) {
    const at = [a.x !== undefined ? 'x ' + a.x : '', a.y !== undefined ? 'y ' + a.y : ''].filter(Boolean).join(', ')
    parts.push(t('sheet.chart.reference', { at, label: a.label }))
  }
  if (c.dropped > 0) parts.push(t('sheet.chart.droppedDescription', { n: c.dropped }))
  return parts.join(' ')
}

// ---------------------------------------------------------------------------- markers

function markerPath(kind: Marker, cx: number, cy: number, r: number): string {
  switch (kind) {
    case 'square':
      return `M${cx - r} ${cy - r}h${r * 2}v${r * 2}h${-r * 2}Z`
    case 'triangle':
      return `M${cx} ${cy - r * 1.15}L${cx + r} ${cy + r * 0.8}L${cx - r} ${cy + r * 0.8}Z`
    case 'diamond':
      return `M${cx} ${cy - r * 1.2}L${cx + r * 1.2} ${cy}L${cx} ${cy + r * 1.2}L${cx - r * 1.2} ${cy}Z`
    case 'cross':
      return `M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx - r} ${cy + r}L${cx + r} ${cy - r}`
    case 'circle':
    default:
      // Two arcs, so that every marker is the same element type.
      return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`
  }
}

/** The cross is a stroke shape; the rest are filled. */
function markerIsStroke(kind: Marker): boolean {
  return kind === 'cross'
}

// ---------------------------------------------------------------------------- the component

export function Chart({ spec }: { spec: ChartSpec }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; fs: number } | null>(null)
  const uid = useId()

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const read = () => {
      const probe = el.querySelector('.pxc-probe')
      const fs = probe instanceof HTMLElement ? parseFloat(getComputedStyle(probe).fontSize) : NaN
      setSize({
        w: Math.round(el.clientWidth),
        fs: Number.isFinite(fs) && fs > 0 ? fs : FALLBACK_TICK_PX,
      })
    }
    read()
    // Panels in this app are resizable and the phone layout reflows, so the width is not a
    // one-time reading.
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const norm = normalizeSpec(spec)
  const chart = norm.ok ? norm.chart : null
  const plottable = chart ? chart.series.some((s) => s.points.length > 0) : false

  const w = size?.w ?? 0
  const fs = size?.fs ?? FALLBACK_TICK_PX
  // Wide charts get proportionally shorter, or a 1200px panel gets a 600px tall chart.
  const h = Math.round(Math.max(180, Math.min(320, w * 0.5)))

  let g: Geometry | null = null
  let geometryError: string | null = null
  if (chart && plottable && w > 0) {
    try {
      g = geometry(chart, w, h, fs)
    } catch (err) {
      geometryError = err instanceof Error ? err.message : String(err)
    }
  }

  const reason = !norm.ok
    ? norm.reason
    : !plottable
      ? t('sheet.chart.noPlottable')
      : geometryError

  const titleId = `${uid}-t`
  const descId = `${uid}-d`

  return (
    <div className="pxc" ref={wrapRef}>
      <style href="mole-office-chart" precedence="default">
        {CHART_CSS}
      </style>
      {/* Measures the real px value of --fs-1 for the layout maths. Zero-sized, so it costs
          no space; getComputedStyle always resolves font-size to pixels. */}
      <span className="pxc-probe" aria-hidden="true" />

      {(chart?.title ?? spec?.title) ? <div className="pxc-title">{chart?.title ?? spec.title}</div> : null}

      {reason ? (
        <p className="pxc-fail" role="alert">
          <strong>{t('sheet.chart.notDrawn')}</strong> {reason}
        </p>
      ) : chart ? (
        <>
          <Legend series={chart.series} />
          <svg
            className="pxc-svg"
            width={w || undefined}
            height={h}
            viewBox={`0 0 ${w || 1} ${h}`}
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
          >
            <title id={titleId}>{chart.title ?? t('sheet.chart.title')}</title>
            <desc id={descId}>{describeChart(chart)}</desc>
            {g ? <Plot c={chart} g={g} /> : null}
          </svg>
          {g && g.annotations.some((a) => a.key !== undefined) ? (
            <ul className="pxc-keys">
              {g.annotations
                .filter((a) => a.key !== undefined)
                .map((a) => (
                  <li key={a.key}>
                    <span className="pxc-key" style={{ color: `var(${a.token})` }}>
                      {a.key}
                    </span>
                    <span>{a.label}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          {chart.dropped > 0 ? (
            <p className="pxc-note" role="status">
              {t('sheet.chart.droppedDescription', { n: chart.dropped })}
            </p>
          ) : null}
          <DataTable c={chart} />
        </>
      ) : null}
    </div>
  )
}

function Legend({ series }: { series: NormSeries[] }) {
  return (
    <ul className="pxc-legend">
      {series.map((s) => (
        <li key={s.name}>
          {/* The swatch repeats the dash pattern and the marker, so the legend works in
              greyscale and in the mono theme where several tokens share one ink. */}
          <svg width="26" height="10" aria-hidden="true" className="pxc-swatch">
            <line
              x1="0"
              y1="5"
              x2="26"
              y2="5"
              stroke={`var(${s.token})`}
              strokeWidth="2"
              strokeDasharray={s.dash}
            />
            <path
              d={markerPath(s.marker, 13, 5, 3)}
              fill={markerIsStroke(s.marker) ? 'none' : `var(${s.token})`}
              stroke={`var(${s.token})`}
              strokeWidth="1.5"
            />
          </svg>
          <span>{s.name}</span>
        </li>
      ))}
    </ul>
  )
}

function Plot({ c, g }: { c: NormChart; g: Geometry }) {
  const left = g.ml
  const right = g.ml + g.plotW
  const top = g.mt
  const bottom = g.mt + g.plotH

  return (
    <>
      {/* gridlines first, so the data draws over them */}
      <g className="pxc-grid">
        {g.y.ticks.map((t) => (
          <line key={`gy${t}`} x1={left} y1={g.sy(t)} x2={right} y2={g.sy(t)} />
        ))}
      </g>

      <g className="pxc-axis">
        <line x1={left} y1={top} x2={left} y2={bottom} />
        <line x1={left} y1={bottom} x2={right} y2={bottom} />
      </g>

      <g className="pxc-tick-text">
        {g.y.ticks.map((t, i) =>
          g.yKeep[i] ? (
            <g key={`ty${t}`}>
              <line className="pxc-tickmark" x1={left - 4} y1={g.sy(t)} x2={left} y2={g.sy(t)} />
              <text x={left - 7} y={g.sy(t)} textAnchor="end" dominantBaseline="middle">
                {formatTick(t, g.y.step)}
              </text>
            </g>
          ) : null,
        )}
        {g.x.ticks.map((t, i) =>
          g.xKeep[i] ? (
            <g key={`tx${t}`}>
              <line className="pxc-tickmark" x1={g.sx(t)} y1={bottom} x2={g.sx(t)} y2={bottom + 4} />
              {g.xRotate ? (
                // Anchored at its END so the label runs back up towards its own tick, which is
                // what makes a turned label unambiguous about which column it belongs to.
                <text
                  x={g.sx(t)}
                  y={bottom + 7}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="pxc-cat"
                  transform={`rotate(-${ROT_DEG} ${g.sx(t)} ${bottom + 7})`}
                >
                  {g.xLabels[i]}
                </text>
              ) : (
                <text
                  x={g.sx(t)}
                  y={bottom + 6}
                  textAnchor="middle"
                  dominantBaseline="hanging"
                  className={c.categories ? 'pxc-cat' : undefined}
                >
                  {g.xLabels[i]}
                </text>
              )}
            </g>
          ) : null,
        )}
      </g>

      {/* axis titles, which is where the units live */}
      <g className="pxc-axis-text">
        {c.xLabel ? (
          <text x={left + g.plotW / 2} y={g.h - 2} textAnchor="middle">
            {c.xLabel}
          </text>
        ) : null}
        {c.yLabel ? (
          <text
            x={10}
            y={top + g.plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90 10 ${top + g.plotH / 2})`}
          >
            {c.yLabel}
          </text>
        ) : null}
      </g>

      {c.series.map((s, si) => (
        <SeriesShape key={s.name} kind={c.kind} s={s} si={si} n={c.series.length} g={g} />
      ))}

      {/* reference lines last: a limit must never end up underneath a data line */}
      {g.annotations.map((a, i) => (
        <Annotation key={i} a={a} g={g} />
      ))}
    </>
  )
}

function SeriesShape({
  kind,
  s,
  si,
  n,
  g,
}: {
  kind: ChartKind
  s: NormSeries
  si: number
  n: number
  g: Geometry
}) {
  const colour = `var(${s.token})`

  if (kind === 'bar') {
    const baseline = g.sy(Math.max(g.y.lo, Math.min(0, g.y.hi)))
    const groupW = g.barW * n
    return (
      <g>
        {s.points.map(([x, y], i) => {
          const cx = g.sx(x) - groupW / 2 + si * g.barW
          const yy = g.sy(y)
          return (
            <rect
              key={i}
              x={cx}
              y={Math.min(yy, baseline)}
              width={Math.max(1, g.barW - 1)}
              height={Math.max(1, Math.abs(baseline - yy))}
              fill={colour}
              stroke={colour}
              strokeWidth="1"
              // The dash on the outline is the greyscale channel for bars, matching the legend.
              strokeDasharray={s.dash}
            />
          )
        })}
      </g>
    )
  }

  if (kind === 'scatter') {
    return (
      <g>
        {s.points.map(([x, y], i) => (
          <path
            key={i}
            d={markerPath(s.marker, g.sx(x), g.sy(y), 3.5)}
            fill={markerIsStroke(s.marker) ? 'none' : colour}
            stroke={colour}
            strokeWidth="1.5"
          />
        ))}
      </g>
    )
  }

  const d = s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${g.sx(x)} ${g.sy(y)}`).join('')
  // Markers on a dense line become a smear, so they appear only when they can be told apart.
  const showMarkers = s.points.length <= 24
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeDasharray={s.dash}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showMarkers
        ? s.points.map(([x, y], i) => (
            <path
              key={i}
              d={markerPath(s.marker, g.sx(x), g.sy(y), 3)}
              fill={markerIsStroke(s.marker) ? 'none' : colour}
              stroke={colour}
              strokeWidth="1.5"
            />
          ))
        : null}
    </g>
  )
}

function Annotation({ a, g }: { a: PlacedAnnotation; g: Geometry }) {
  const colour = `var(${a.token})`
  const left = g.ml
  const right = g.ml + g.plotW
  const top = g.mt
  const bottom = g.mt + g.plotH

  return (
    <g>
      {a.lineY !== undefined ? (
        <line className="pxc-ann-line" x1={left} y1={a.lineY} x2={right} y2={a.lineY} stroke={colour} />
      ) : null}
      {a.lineX !== undefined ? (
        <line className="pxc-ann-line" x1={a.lineX} y1={top} x2={a.lineX} y2={bottom} stroke={colour} />
      ) : null}
      {/* A solid backing rect, not a text halo. A halo only paints where there are glyphs, so
          the dashed line shows through the word spaces and "12 N needed" reads as "12.N". */}
      <rect
        className="pxc-ann-bg"
        x={a.box.x - 2}
        y={a.box.y - 1}
        width={a.box.w + 4}
        height={a.box.h + 3}
      />
      <text className="pxc-ann-text" x={a.textX} y={a.textY} textAnchor={a.anchor} fill={colour}>
        {a.drawn}
      </text>
    </g>
  )
}

/**
 * The numbers behind the picture, collapsed.
 *
 * The <desc> above serves a screen reader, but a researcher checking whether the peak was
 * 15.9 or 15.4 cannot read that off a line either. One <details> answers both.
 */
function DataTable({ c }: { c: NormChart }) {
  const total = c.series.reduce((n, s) => n + s.points.length, 0)
  return (
    <details className="pxc-data">
      <summary>
        {t('sheet.chart.data', { n: total })}
      </summary>
      <InReach box="pxc-scroll" name={t('sheet.chart.dataName')} shape={String(total)}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('sheet.chart.series')}</th>
              <th scope="col">{c.xLabel ?? t('sheet.chart.x')}</th>
              <th scope="col">{c.yLabel ?? t('sheet.chart.y')}</th>
            </tr>
          </thead>
          <tbody>
            {c.series.flatMap((s) =>
              s.points.map(([x, y], i) => (
                <tr key={`${s.name}-${i}`}>
                  <td>{s.name}</td>
                  <td className="pxc-num">{c.categories ? (c.categories[x] ?? x) : x}</td>
                  <td className="pxc-num">{y}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </InReach>
    </details>
  )
}

// ---------------------------------------------------------------------------- styles
//
// Carried with the component rather than added to styles.css: React 19 hoists a <style> that
// has an href and a precedence into <head> and de-duplicates it by href, so twenty charts on
// one page still produce exactly one style element. Every value here is a token.

const CHART_CSS = `
.pxc { display:block; width:100%; font-family: var(--font-ui); color: var(--text); }
.pxc-probe { position:absolute; width:0; height:0; overflow:hidden; font-size: var(--fs-1); }
.pxc-title { font-size: var(--fs-3); line-height: var(--lh-tight); font-weight:600;
  color: var(--text); margin:0 0 2px; }
.pxc-legend { display:flex; flex-wrap:wrap; gap:2px var(--gut); margin:0 0 4px; padding:0;
  list-style:none; font-size: var(--fs-1); line-height: var(--lh-tight); color: var(--text-2); }
.pxc-legend li { display:flex; align-items:center; gap:6px; }
.pxc-swatch { flex:none; }
.pxc-svg { display:block; width:100%; height:auto; overflow:visible; }
.pxc-grid line { stroke: var(--border); stroke-width:1; }
.pxc-axis line, .pxc-tickmark { stroke: var(--border-strong); stroke-width:1; }
.pxc-tick-text text { font-size: var(--fs-1); fill: var(--text-3); font-family: var(--font-mono); }
.pxc-tick-text text.pxc-cat { font-family: var(--font-ui); }
.pxc-axis-text text { font-size: var(--fs-2); fill: var(--text-2); }
.pxc-ann-line { stroke-dasharray: 6 4; stroke-width:1.5; }
/* The label sits on its own patch of panel colour, so it stays readable wherever it crosses
   a gridline, a data line or another limit. --pxc-halo lets a caller that puts a chart on a
   different surface say so. */
.pxc-ann-bg { fill: var(--pxc-halo, var(--panel)); }
.pxc-ann-text { font-size: var(--fs-1); font-weight:700; }
/* The key for reference lines whose label is a sentence rather than a phrase. */
.pxc-keys { display:flex; flex-direction:column; gap:2px; margin:4px 0 0; padding:0;
  list-style:none; font-size: var(--fs-1); line-height: var(--lh-body); color: var(--text-2); }
.pxc-keys li { display:flex; gap:6px; align-items:baseline; }
.pxc-key { flex:none; font-weight:700; font-family: var(--font-mono);
  min-width:1.1em; text-align:center; }
.pxc-fail { display:block; margin:0; padding: var(--pad); font-size: var(--fs-2);
  line-height: var(--lh-body); color: var(--st-failed); background: var(--st-failed-bg);
  border: var(--border-w) solid var(--st-failed-line);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm); }
.pxc-note { margin:4px 0 0; font-size: var(--fs-1); line-height: var(--lh-body);
  color: var(--st-inferred); }
.pxc-data { margin-top:4px; font-size: var(--fs-1); color: var(--text-2); }
/* --row-h, not a number: tokens.css raises it to 44px on a phone, which is the touch floor.
   Laying the summary out as a flex row drops the browser's disclosure triangle, so the marker
   is drawn explicitly -- a toggle with no affordance reads as a label. */
.pxc-data summary { cursor:pointer; padding:2px 0; border-radius: var(--radius-sm);
  min-height: var(--row-h); display:flex; align-items:center; gap:6px; list-style:none; }
.pxc-data summary::-webkit-details-marker { display:none; }
.pxc-data summary::before { content:'▸'; color: var(--text-3); }
.pxc-data[open] summary::before { content:'▾'; }
.pxc-data summary:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
.pxc-scroll { overflow-x:auto; max-height:260px; overflow-y:auto; margin-top:4px;
  border:var(--border-w) solid var(--border); border-radius: var(--radius-sm); }
.pxc-data table { border-collapse: collapse; width:100%; font-family: var(--font-mono); }
.pxc-data th, .pxc-data td { text-align:left; padding:2px var(--pad); white-space:nowrap;
  border-bottom: 1px solid var(--border); }
.pxc-data thead th { position:sticky; top:0; background: var(--panel-2); color: var(--text-2); }
.pxc-data .pxc-num { text-align:right; font-variant-numeric: tabular-nums; }
`
