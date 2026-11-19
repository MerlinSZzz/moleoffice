// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MEASURE TWO THINGS A SCREENSHOT CANNOT SETTLE: how small the type is, and whether the edge of a
 * control can be seen at all.
 *
 *   node tools/legibility.mjs --label before
 *   node tools/legibility.mjs --label after --compare before
 *   node tools/legibility.mjs --label selected --pages queries,records,plan
 *
 * --pages takes comma-separated page names from the report. Without it, every page is walked.
 *
 * It drives a browser at an app SOMEBODY ELSE ALREADY STARTED (the dev server on 5173/8787 by
 * default), because both numbers are properties of the real corpus: the sentence lengths on the
 * records page are the sentences this installation actually holds, and a seeded fixture would
 * report the fixture's typography instead of the product's.
 *
 * IT CANNOT WRITE. Every request the page makes is inspected and anything that is not a GET or a
 * HEAD is ABORTED, so a measuring run cannot mark a reading point, promote a proposal or touch
 * data/panelx.db even if a page decides to. A blocked request is counted and printed; if one ever
 * appears, the number that follows was measured against a page that did not fully load and is
 * reported as such rather than quietly averaged in.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND HOW
 * ------------------------------------------------------------------------------------------
 *
 * TYPE. Every non-empty text node, with the computed `font-size` of the element that holds it,
 * excluding anything `checkVisibility()` says is not on the screen. Two numbers come out: how many
 * of those nodes are set below 13px, and how many of them are FULL SENTENCES — eight words or more
 * — set below 13px inside `main.page`. The second is the one that matters. A 12px chip reading
 * "DONE" is a label and is meant to be small; a 25-word finding set at 12px is prose the reader has
 * to get through, and the app already proves it reads better bigger, because the phone breakpoint
 * in tokens.css raises the same three tokens for a screen held further away.
 *
 * EDGES. Every element with a visible border, its border colour composited over what is behind it,
 * against the backdrop it sits on. WCAG 1.4.11 asks 3:1 of the visual boundary of a control. The
 * ratio is computed from sRGB relative luminance —
 *
 *     c <= 0.03928 ? c/12.92 : ((c + 0.055) / 1.055) ** 2.4        (÷1.055, NOT ÷2.055)
 *     L = 0.2126 R + 0.7152 G + 0.0722 B
 *     ratio = (Lbright + 0.05) / (Ldark + 0.05)
 *
 * — and the run refuses to report anything until black on white comes back as 21.00 and white on
 * white as 1.00, because getting that formula subtly wrong is how a previous pass reported dozens
 * of failures that were not there.
 *
 * COLOURS ARE COMPOSITED ON A CANVAS, not parsed. A border may be `color-mix(in srgb, X 55%,
 * transparent)`, the backdrop may be three transparent panels deep, and hand-parsing `rgba()`,
 * `color(srgb …)` and `oklab()` is a fourth place to get colour arithmetic wrong. So the ancestor
 * backgrounds are painted onto a 1×1 canvas from the root down and the border colour is painted on
 * top; the pixel that comes back IS the colour a person sees. A colour the canvas cannot parse is
 * REPORTED, never treated as opaque black.
 *
 * A control counts as passing if EITHER its border reaches 3:1 against the surface outside it, or
 * its own fill does — a filled button with no visible edge is still a visible button. Both numbers
 * are kept for every control, so the report can say which one is carrying it.
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium } from 'playwright'

import { profileSegmentFrom, recordPrefixFrom, segmentFrom } from './read-the-router.mjs'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
import { waitForThePage } from './the-page-is-ready.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { localStamp } from '../src/shared/time.ts'
import { fetchAFullList } from './a-full-list-read.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = join(root, 'tools', 'legibility')
const routerFile = join(root, 'src', 'web', 'components', 'router.tsx')
/* And where the grammar it used to hold now lives. See `theAddressSource`. */
const addressesFile = join(root, 'src', 'shared', 'addresses.ts')
/**
 * THE ADDRESSES AND THE ROUTER, READ AS ONE SOURCE.
 *
 * The address grammar — FLAT_ROUTES and the `Route` union — moved to src/shared/addresses.ts on
 * 9 September 2026, so the write door could read it as well as the shell (criterion M97).
 * `recordPath` and the other address builders stayed in src/web/components/router.tsx. The patterns
 * below want one string, and the two files are one declaration split by which program may import it.
 */
function theAddressSource() {
  return [addressesFile, routerFile].map((file) => readFileSync(file, 'utf8')).join('\n\n')
}

/* The shared table the five family addresses come out of. See `familyKeys`. */
const workFile = join(root, 'src', 'shared', 'work.ts')
// WHERE A PARTICIPANT'S PAGE ADDRESS IS DECLARED. Read, never typed here: see `profileSegmentFrom`.
const profileFile = join(root, 'src', 'shared', 'profile.ts')

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? fallback : args[at + 1]
}
const LABEL = arg('label', 'run')
const COMPARE = arg('compare', null)
const WEB = whereIsTheWebApp(arg('web', undefined))
// .env decides where the API is unless --api says otherwise. tools/where-is-the-api.mjs.
const API = whereIsTheApi(arg('api', undefined))
const WORKSPACE = arg('workspace', 'panelx')
/**
 * WHO THIS TOOL ASKS AS: MOLE_OFFICE_AGENT, with MOLE_AGENT_KEY as its key when that is set, as the other tools do
 * (tools/sandbox-common.mjs). Once the key window is closed, a read that names nobody and carries no key is refused
 * so this tool is answered only with a key.
 */
const WHO = anAgentsToolHeaders({ withoutAKey: process.env['MOLE_OFFICE_AGENT'] || 'legibility' })
const WIDTH = Number(arg('width', '1440'))
const THEMES = (arg('themes', 'light,dark')).split(',')
/** The floor. A text node below this is what the review is counting. */
const SMALL = 13
/** A sentence, for this purpose: eight words or more. */
const SENTENCE_WORDS = 8
/** WCAG 1.4.11, the boundary of a control. */
const FLOOR = 3

/**
 * HOW LITTLE THE CONTENT AREA MAY DRAW BEFORE A PAGE IS CALLED EMPTY.
 *
 * Per page, and inside `main.page` only. The old floor was "did the whole document hold 0 text
 * nodes", which the rail alone defeats: on 14 August 2026 a page was made to render nothing at all,
 * its count fell from 155 to 31, and this tool exited 0 because 31 is not 0. The rail is furniture
 * and is on every page whatever the page draws, so it can never be part of the measurement of
 * whether the page drew.
 *
 * The numbers are the same ones tools/review.mjs uses and the measurement is written down there.
 * In short: the two emptiest pages this app can legitimately draw are its empty states — the plans
 * page with no plan written (3 text nodes, 9 words) and the not-found page (4 and 11). The next
 * smallest drew 28, and most pages draw hundreds. The floor is below the smallest of those, and a
 * content area that drew nothing produces 0 of both.
 */
const CONTENT_FLOOR = { nodes: 2, words: 4 }

// --------------------------------------------------------------------------------- the page list

/**
 * Every page, read out of the router's own FLAT_ROUTES — the same parse tools/review.mjs does, and
 * for the same reason: a hand-copied page list is a second copy that silently stops growing.
 */
function pagesFrom(source) {
  const block = source.match(/const FLAT_ROUTES[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (block === null) {
    throw new Error(`Could not find FLAT_ROUTES in ${addressesFile}; teach this parser its new shape.`)
  }
  const pages = [{ name: 'home', address: '#/', route: 'home' }]
  // A KEY IN QUOTES IS STILL A KEY. `'agent-use'` cannot be written bare — a hyphen is not allowed
  // in a JavaScript identifier — and the pattern used to require a bare one, so the page it names
  // would have been skipped in silence and the review would have photographed a shorter app while
  // reporting success. The coverage check below is what caught it; the quote is now optional here.
  for (const entry of block[1].matchAll(/^\s*'?([A-Za-z0-9_$-]+)'?:\s*'([^']+)'/gm)) {
    pages.push({ name: entry[2], address: `#/${entry[1]}`, route: entry[2] })
  }
  // A KEY NAMED BY A CONSTANT IS STILL A KEY. Settings' segment became `[SETTINGS_SEGMENT]` when its
  // address learnt to name one panel (settingsPath), and the pattern above reads only a key written
  // out, so Settings dropped out of this list in silence and the coverage check below threw. The
  // constant is read where it is declared, by the one reader of such declarations; this measures the
  // address settingsPath() builds with no panel, the whole page with every panel folded.
  for (const entry of block[1].matchAll(/^\s*\[([A-Z][A-Z0-9_]*)\]:\s*'([^']+)'/gm)) {
    const segment = segmentFrom(source, entry[1], addressesFile, `the ${entry[2]} page`)
    pages.push({ name: entry[2], address: `#/${segment}`, route: entry[2] })
  }
  if (pages.length === 1) throw new Error(`FLAT_ROUTES in ${routerFile} read as empty.`)
  // THE FIVE FAMILY PAGES SHARE ONE ROUTE and are not in FLAT_ROUTES: their address segment IS the
  // family key, read off KIND_FAMILIES so that a family added there gets an address with nothing to
  // keep in step. Reading only FLAT_ROUTES left a FIVE-PAGE HOLE in this gate — Work, Structure,
  // What we believe, Might do and What happened were never measured for type size or contrast, on
  // the pass that redesigned all five of them. tools/review.mjs already reads the same declaration.
  //
  // A FAMILY WHOSE KEY IS ALREADY A FLAT ADDRESS HAS NO PAGE OF ITS OWN, and it is skipped rather
  // than measured twice. `decisions` is that family: the router reads FLAT_ROUTES first, so
  // `#/decisions` is the cross-project decisions page and there is no family page behind it. This
  // tool measured that page twice and printed one of the rows under the name "family-decisions",
  // which is a page that does not exist. tools/review.mjs already skips it for the same reason.
  const flatSegments = new Set(pages.map((p) => p.address.replace(/^#\//, '')))
  for (const family of familyKeys()) {
    if (flatSegments.has(family)) continue
    pages.push({ name: `family-${family}`, address: `#/${family}`, route: 'family' })
  }
  // THE NOT-FOUND PAGE IS A PAGE, and it is the one the router answers with when it does not know
  // an address, so it is reached by asking for an address the router cannot know.
  pages.push({ name: 'unknown', address: '#/no-such-page', route: 'unknown' })
  return pages
}

/**
 * STOP IF THE ROUTER DECLARES A PAGE THIS TOOL NEVER LOOKED AT, and say which and why.
 *
 * WHY THIS IS HERE. The page list is derived from the router rather than hand-written, which is the
 * right shape, but derived from only PART of it: FLAT_ROUTES plus the family keys. Three pages in
 * the router's `Route` union have no flat address — the record page, one plan and the not-found page
 * — and until this check nothing said so. The record page was added by hand further down and the
 * other two were simply never measured, on a tool whose whole job is that every screen is looked at.
 *
 * `Route` is the router's own list of every page, one member per page, so it is the thing to check
 * against. A page reachable only with an id is reached by finding a real one through the read API;
 * when the workspace holds none, that is reported by name — "nobody has looked" rather than silence.
 */
function coverageAgainstTheRouter(source, pages) {
  const union = source.match(/export type Route =([\s\S]*?)\n\n/)
  if (union === null) {
    throw new Error(
      `Could not find the \`Route\` union in ${addressesFile}, which is what proves this tool measured every page.`,
    )
  }
  const declared = [...union[1].matchAll(/\{\s*name:\s*'([^']+)'/g)].map((m) => m[1])
  const measured = new Set(pages.map((p) => p.route ?? p.name))
  return {
    declared,
    missed: declared.filter((name) => !measured.has(name)),
    extra: [...measured].filter((name) => !declared.includes(name)),
  }
}

/** The family keys, out of the shared table that defines them. Never a copy. */
function familyKeys() {
  const source = readFileSync(workFile, 'utf8')
  const block = source.match(/export const KIND_FAMILIES = \{([\s\S]*?)\n\} as const/)
  if (block === null) {
    throw new Error(
      `Could not find KIND_FAMILIES in ${workFile}. The five family pages take their addresses from ` +
        `it, so this tool cannot know what to measure. Teach this parser the new shape -- do not ` +
        `hand-copy a family list into tools/legibility.mjs.`,
    )
  }
  const keys = [...block[1].matchAll(/^\s*([a-z]+):\s*\{/gm)].map((m) => m[1])
  if (keys.length === 0) throw new Error(`KIND_FAMILIES in ${workFile} was found but read as empty.`)
  return keys
}

// The address prefix of a record page is read by `recordPrefixFrom`, imported above. It used to be
// a copy of the same regular expression here, in tools/review.mjs and in tools/accept.mjs, and all
// three broke on the same change. There is one now.

// --------------------------------------------------------------------------------- colour maths

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]) => 0.2126 * channel(r / 255) + 0.7152 * channel(g / 255) + 0.0722 * channel(b / 255)
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Prove the formula before any number computed with it is printed. */
function proveTheFormula() {
  const checks = [
    ['black on white', contrast([0, 0, 0], [255, 255, 255]), 21],
    ['white on white', contrast([255, 255, 255], [255, 255, 255]), 1],
    // A published pair: #767676 is the lightest grey that still reaches 4.5:1 on white.
    ['#767676 on white', contrast([118, 118, 118], [255, 255, 255]), 4.54],
  ]
  for (const [what, got, want] of checks) {
    if (Math.abs(got - want) > 0.01) {
      throw new Error(`The contrast formula is wrong: ${what} came out at ${got.toFixed(2)}, not ${want}.`)
    }
  }
}

const hex = ([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

// --------------------------------------------------------------------------------- in the page

/**
 * Runs INSIDE the browser. Returns raw colours and sizes; every ratio is computed in node above,
 * from one implementation of the formula.
 */
function measureInPage({ small, sentenceWords }) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })

  /** Paint a stack of CSS colours bottom-first and read the pixel back. Reports what it cannot parse. */
  const paint = (layers) => {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = 'rgb(255, 255, 255)'
    ctx.fillRect(0, 0, 1, 1)
    for (const colour of layers) {
      if (colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') continue
      // A colour the canvas cannot parse leaves fillStyle untouched, which would silently paint the
      // previous layer twice. Sentinel first, so an unparsed colour is detected and named.
      ctx.fillStyle = '#123456'
      ctx.fillStyle = colour
      const took = ctx.fillStyle
      if (took === '#123456' && !/^#123456$/i.test(colour)) return { rgb: null, unparsed: colour }
      ctx.fillRect(0, 0, 1, 1)
    }
    const d = ctx.getImageData(0, 0, 1, 1).data
    return { rgb: [d[0], d[1], d[2]], unparsed: null }
  }

  /** The background colours from the root down to (and excluding) this element. */
  const backdropLayers = (el) => {
    const stack = []
    for (let node = el.parentElement; node !== null; node = node.parentElement) {
      stack.unshift(getComputedStyle(node).backgroundColor)
    }
    stack.unshift(getComputedStyle(document.documentElement).backgroundColor)
    return stack
  }

  const visible = (el) =>
    el.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })

  // ------------------------------------------------------------------ type
  //
  // THE CONTENT AREA IS COUNTED SEPARATELY FROM THE WHOLE DOCUMENT, and that separation is the fix
  // for this tool's worst defect. `nodes` counts the whole page including the rail, which is right
  // for the type tables — small type in the rail is still small type — and useless as a test of
  // whether the PAGE drew. The rail is on every page whatever the page does, so it clears any
  // floor on its own. Measured on 14 August 2026: a page made to render nothing at all still
  // reported 31 text nodes, and this tool exited 0. `contentNodes` counts `main.page` alone, which
  // is the element App.tsx puts every page inside, and it is 0 when the page drew nothing.
  const body = document.querySelector('main.page')
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const sizes = {}
  let nodes = 0
  let contentNodes = 0
  let contentWords = 0
  let belowSmall = 0
  const sentences = []
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim()
    if (text === '') continue
    const el = node.parentElement
    if (el === null || el.closest('script, style, title') !== null) continue
    if (!visible(el)) continue
    const size = Number.parseFloat(getComputedStyle(el).fontSize)
    nodes++
    const words = text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
    const inContent = body !== null && body.contains(el)
    if (inContent) {
      contentNodes++
      contentWords += words
    }
    const key = size.toFixed(2)
    sizes[key] = (sizes[key] ?? 0) + 1
    if (size >= small) continue
    belowSmall++
    if (words >= sentenceWords && inContent) {
      sentences.push({ size, words, text: text.slice(0, 160) })
    }
  }

  // ------------------------------------------------------------------ edges
  const CONTROL = [
    'button', 'a[href]', 'input', 'select', 'textarea', 'summary', 'label',
    '[role="button"]', '[role="tab"]', '[role="checkbox"]', '[role="radio"]', '[role="menuitem"]',
    '.px-btn', '.px-input', '.px-select', '.px-chip-btn', '.px-menu-item',
  ].join(',')
  const INDICATOR = '.px-chip, .px-tag, .px-mark, .px-inc-mark'

  const edges = []
  const unparsed = []
  for (const el of document.querySelectorAll('*')) {
    if (!visible(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const style = getComputedStyle(el)
    const sides = ['Top', 'Right', 'Bottom', 'Left'].filter((side) => {
      const w = Number.parseFloat(style[`border${side}Width`])
      const s = style[`border${side}Style`]
      return w > 0 && s !== 'none' && s !== 'hidden'
    })
    if (sides.length === 0) continue

    const isControl = el.matches(CONTROL)
    const isIndicator = el.matches(INDICATOR)
    const kind = isControl ? 'control' : isIndicator ? 'indicator' : 'other'
    if (kind === 'other') continue

    const outside = backdropLayers(el)
    const outsidePaint = paint(outside)
    const fillPaint = paint([...outside, style.backgroundColor])
    if (outsidePaint.rgb === null) unparsed.push(outsidePaint.unparsed)
    if (fillPaint.rgb === null) unparsed.push(fillPaint.unparsed)

    for (const side of sides) {
      const colour = style[`border${side}Color`]
      // The border paints over the element's own background (background-clip is border-box), and
      // the boundary is read against the surface OUTSIDE the control.
      const edgePaint = paint([...outside, style.backgroundColor, colour])
      if (edgePaint.rgb === null) {
        unparsed.push(edgePaint.unparsed)
        continue
      }
      edges.push({
        kind,
        side,
        tag: el.tagName.toLowerCase(),
        cls: el.getAttribute('class') ?? '',
        variant: el.getAttribute('data-variant') ?? el.getAttribute('data-state') ?? '',
        disabled: el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled'),
        declared: colour,
        edge: edgePaint.rgb,
        outside: outsidePaint.rgb,
        fill: fillPaint.rgb,
        // A BORDER THAT PAINTS NOTHING IS NOT A FAINT BORDER, IT IS NO BORDER. `border-color:
        // transparent` is used deliberately in this app — the `authored` origin mark gives up its
        // enclosure and carries its meaning on its word, its silhouette and its ink instead — and
        // reporting a designed absence as a 1.00:1 contrast failure would be a made-up defect.
        // Measured rather than parsed: the pixel with the border painted over the fill is the same
        // pixel as the fill.
        drawn: String(edgePaint.rgb) !== String(fillPaint.rgb),
        width: Number.parseFloat(style[`border${side}Width`]),
        style: style[`border${side}Style`],
      })
      break // one side is enough: all four are the same declaration on every control here.
    }
  }

  return {
    nodes,
    contentFound: body !== null,
    contentNodes,
    contentWords,
    contentHeight: body === null ? 0 : Math.round(body.getBoundingClientRect().height),
    belowSmall,
    sizes,
    sentences,
    edges,
    unparsed: [...new Set(unparsed)],
  }
}

// --------------------------------------------------------------------------------- the run

async function readRecords() {
  const res = await fetchAFullList(fetch, `${API}/api/records?shape=full`, { headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO } })
  if (!res.ok) throw new Error(`${API}/api/records answered ${res.status}; is the dev server up?`)
  const body = await res.json()
  if (!Array.isArray(body.records) || body.records.length === 0) {
    throw new Error(`Workspace "${WORKSPACE}" holds no records, so there is no record page to measure.`)
  }
  // THE PAGE CHOICE SORTS BY `incompleteCount`, which a narrow row does not carry. A cut answer is refused by name.
  if (body.records.some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error(`${API}/api/records answered the narrow rows and not the whole ones this survey picks its pages from.`)
  }
  return body.records
}

async function main() {
  proveTheFormula()
  const routerSource = theAddressSource()
  const pages = pagesFrom(routerSource)
  const prefix = recordPrefixFrom(routerSource, routerFile)

  const records = await readRecords()
  const pick = (kind) => {
    const of = records.filter((r) => r.kind === kind)
    return [...of].sort((a, b) => a.incompleteCount - b.incompleteCount)[0]
  }
  const module = pick('module')
  const obligation = pick('obligation')
  if (module !== undefined) {
    pages.push({ name: 'record (module)', route: 'record', address: `#${prefix}${encodeURIComponent(module.id)}` })
  }
  if (obligation !== undefined) {
    pages.push({ name: 'record (obligation)', route: 'record', address: `#${prefix}${encodeURIComponent(obligation.id)}` })
  }

  // ONE PLAN, which is a page of its own and is only reachable with an id after `#/plans`.
  //
  // Found rather than written. This tool may not write anything — every request that is not a read
  // is stopped at the wire — so unlike tools/review.mjs it cannot make a plan to look at. It asks
  // the read API for one instead, and when the workspace holds none it says so by name below rather
  // than leaving the page quietly unmeasured.
  const unreachable = []
  const plansPage = pages.find((p) => p.route === 'plans')
  const plan = await fetch(`${API}/api/plans?state=every`, { headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO } })
    .then((r) => (r.ok ? r.json() : { plans: [] }))
    .then((body) => (Array.isArray(body.plans) ? body.plans[0] : undefined))
    .catch(() => undefined)
  if (plan !== undefined && plansPage !== undefined) {
    pages.push({
      name: 'one plan',
      route: 'onePlan',
      address: `${plansPage.address}/${encodeURIComponent(plan.id)}`,
    })
  } else {
    unreachable.push(
      `onePlan — workspace "${WORKSPACE}" holds no plan, so there is no plan page to measure. Write one and run this again.`,
    )
  }

  // ONE PERSON'S PAGE AND ONE AGENT'S, which are only reachable with a kind and an id.
  //
  // Found rather than written, for the reason the plan above gives: this tool may not write, so it
  // asks the read API who is registered. The two registries are almost never both empty — an
  // installation registers Mole Office itself — but when one is, the page is named below as
  // unreachable rather than left quietly unmeasured.
  const segment = profileSegmentFrom(readFileSync(profileFile, 'utf8'), profileFile)
  const registered = await fetch(`${API}/api/participants`, { headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO } })
    .then((r) => (r.ok ? r.json() : { people: [], agents: [] }))
    .catch(() => ({ people: [], agents: [] }))
  const somebody = [
    ['person', Array.isArray(registered.people) ? registered.people[0] : undefined],
    ['agent', Array.isArray(registered.agents) ? registered.agents[0] : undefined],
  ]
  for (const [kind, one] of somebody) {
    if (one === undefined) continue
    pages.push({
      name: `profile (${kind})`,
      route: 'who',
      address: `#/${segment}/${kind}/${encodeURIComponent(one.id)}`,
    })
  }
  if (somebody.every(([, one]) => one === undefined)) {
    unreachable.push(
      `who — neither registry holds anybody, so there is no profile page to measure. Register a person or an agent and run this again.`,
    )
  }

  // ONE SECRETARY'S NOTEBOOK, criteria N1 to N4. It hangs off an agent's own address, so it is
  // measured for whatever agent this installation has: the page draws whether or not a notebook has
  // been written, because saying nobody has written one is itself a drawing a person reads.
  const anAgent = Array.isArray(registered.agents) ? registered.agents[0] : undefined
  if (anAgent === undefined) {
    unreachable.push(
      `notebook — no agent is registered, so there is no notebook page to measure. Register an agent and run this again.`,
    )
  } else {
    pages.push({
      name: 'a secretary notebook',
      route: 'notebook',
      address: `#/${segment}/agent/${encodeURIComponent(anAgent.id)}/notebook`,
    })
  }

  // A NEW ROLE CARD, BEING FILLED IN. Criterion P51. It has no flat address — it is two segments,
  // `#/roles/new` — and it is a page a person reads and types on, so it is measured like every
  // other rather than explained away.
  pages.push({ name: 'a new role card', route: 'roleNew', address: '#/roles/new' })
  // WHO HOLDS EACH CARD, criterion P72. Reached by opening the fold on a card at the Role cards
  // page; the address is what a person types, and this tool measures it like every other page.
  pages.push({ name: 'who holds each card', route: 'roleCensus', address: '#/roles/who-holds-them' })

  /**
   * ONE VISITING AGENT'S CREDENTIAL. Criteria P24 to P29.
   *
   * FOUND RATHER THAN WRITTEN, for the same reason the profile above is: this tool may not write, so
   * it asks the read API which credentials there are. An installation only this computer has ever
   * reached holds none, and the page is then named as unreachable rather than left quietly
   * unmeasured — which is what "there is nothing to look at" honestly means here.
   */
  const credentials = await fetch(`${API}/api/office/visitors`, {
    headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO },
  })
    .then((r) => (r.ok ? r.json() : { credentials: [] }))
    .catch(() => ({ credentials: [] }))
  const aCredential = Array.isArray(credentials.credentials) ? credentials.credentials[0] : undefined
  if (aCredential === undefined) {
    unreachable.push(
      'visitor — no agent from another machine holds a credential here, so there is no credential page to ' +
        'measure. Issue one with POST /api/office/visitors and run this again.',
    )
  } else {
    pages.push({
      name: 'a visiting agent',
      route: 'visitor',
      address: `#/visitor/${encodeURIComponent(aCredential.id)}`,
    })
  }

  // ONE INCIDENT'S SCENE, criterion I3. It hangs off the incident's own id, so it is measured for
  // whatever incident this workspace holds. Found rather than written, like every id-carrying page
  // above: when the workspace holds none, the page is named as unreachable rather than left
  // quietly unmeasured.
  const anIncident = await fetch(`${API}/api/records?kind=incident`, {
    headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO },
  })
    .then((r) => (r.ok ? r.json() : { records: [] }))
    .then((body) => (Array.isArray(body.records) ? body.records[0] : undefined))
    .catch(() => undefined)
  if (anIncident === undefined) {
    unreachable.push(
      `incident — workspace "${WORKSPACE}" holds no incident, so there is no incident page to measure. File one and run this again.`,
    )
  } else {
    pages.push({
      name: 'an incident scene',
      route: 'incident',
      address: `#/incident/${encodeURIComponent(anIncident.id)}`,
    })
  }

  // ONE MESSAGE, ONE PROBLEM AND ONE AGENT RUN, each with a page of its own since criterion E2 on
  // the rule of 16 September 2026. Each is reached only with an id, so it
  // is measured for whatever record of that kind this workspace holds, and named as unreachable when
  // the workspace holds none. Measuring only the generic record page left these three pages out of
  // the coverage check entirely, which is a page nobody looked at on a tool whose whole job is that
  // every screen is looked at. ONE HANDBOOK joined them in wave 13u round 177: its kind has had a page of its own,
  // `#/handbook/<id>`, from the start.
  for (const [route, constant, noun, page] of [
    ['message', 'MESSAGE_SEGMENT', 'message', "a message's own page"],
    ['problem', 'PROBLEM_SEGMENT', 'problem', "a problem's own page"],
    ['session', 'SESSION_SEGMENT', 'agent run', "an agent run's own page"],
    ['handbook', 'HANDBOOK_SEGMENT', 'handbook', "a handbook's own page"],
  ]) {
    const one = pick(route)
    if (one === undefined) {
      unreachable.push(
        `${route} — workspace "${WORKSPACE}" holds no ${noun}, so there is no ${noun} page to ` +
          `measure. File one and run this again.`,
      )
    } else {
      pages.push({
        name: `a ${noun}`,
        route,
        address: `#/${segmentFrom(routerSource, constant, addressesFile, page)}/${encodeURIComponent(one.id)}`,
      })
    }
  }

  // ONE SWITCHED-ON PLUGIN'S PAGE, wave 13x round 15. `#/plugin/<id>/<page>` draws a page only for a plugin that is on,
  // so it is measured for the first one this office reports, and named as unreachable when there is none. Found rather
  // than written: this tool may not write, and switching a plugin on is the person's press. An answer that is not a
  // reading is said as that, because nobody looking is not the same as there being nothing to see.
  const pluginsAnswer = await fetch(`${API}/api/plugins`, { headers: { 'X-Mole-Office-Workspace': WORKSPACE, ...WHO } })
    .catch(() => null)
  const pluginsRead = pluginsAnswer?.ok === true ? await pluginsAnswer.json().catch(() => null) : null
  const aPluginOn = Array.isArray(pluginsRead?.plugins)
    ? pluginsRead.plugins.find((one) => one.state === 'on' && (one.manifest?.pages?.length ?? 0) > 0)
    : undefined
  if (aPluginOn === undefined) {
    unreachable.push(
      pluginsRead === null
        ? `plugin — GET ${API}/api/plugins answered ${pluginsAnswer === null ? 'nothing' : pluginsAnswer.status}, so ` +
            `nobody looked for a plugin page to measure.`
        : `plugin — no plugin this office reports is switched on with a page, so there is no plugin page to measure. ` +
            `Switch one on in Settings and run this again.`,
    )
  } else {
    pages.push({
      name: 'a plugin page',
      route: 'plugin',
      address:
        `#/${segmentFrom(routerSource, 'PLUGIN_SEGMENT', addressesFile, "a plugin's page")}/` +
        `${encodeURIComponent(aPluginOn.id)}/${encodeURIComponent(aPluginOn.manifest.pages[0].slug)}`,
    })
  }

  // EVERY PAGE THE ROUTER DECLARES, OR A NAMED REASON WHY NOT. See `coverageAgainstTheRouter`.
  const coverage = coverageAgainstTheRouter(routerSource, pages)
  if (coverage.extra.length > 0) {
    throw new Error(
      `This tool is measuring pages the \`Route\` union in ${routerFile} does not declare: ` +
        `${coverage.extra.join(', ')}. Either the router changed shape or this list is wrong; ` +
        `teach this tool the new shape rather than measuring an address nothing serves.`,
    )
  }
  const unexplained = coverage.missed.filter((name) => !unreachable.some((line) => line.startsWith(`${name} —`)))
  if (unexplained.length > 0) {
    throw new Error(
      `The \`Route\` union in ${routerFile} declares ${unexplained.length} page(s) this tool never ` +
        `measures and cannot explain: ${unexplained.join(', ')}. A page nobody measures for type size ` +
        `and contrast is a page this gate does not cover. Teach this tool how to reach it rather than ` +
        `letting it quietly go unseen.`,
    )
  }

  const requested = arg('pages', null)
  const names = requested === null ? null : requested.split(',')
  if (names !== null) {
    const unknown = names.filter((name) => !pages.some((page) => page.name === name))
    if (unknown.length > 0) {
      throw new Error(`--pages names no page called ${unknown.map((name) => JSON.stringify(name)).join(', ')}.`)
    }
  }
  const selected = names === null ? pages : pages.filter((page) => names.includes(page.name))
  if (selected.length === 0) throw new Error('--pages leaves no pages to walk.')
  if (names !== null) console.log(`legibility: measuring ${selected.length} selected pages of ${pages.length}.`)

  const browser = await chromium.launch()
  const results = []
  let blocked = 0
  try {
    for (const page of selected) {
      for (const theme of THEMES) {
        const context = await browser.newContext({
          viewport: { width: WIDTH, height: 1000 },
          colorScheme: theme,
          deviceScaleFactor: 1,
        })
        await context.addInitScript(
          ([key, id]) => window.localStorage.setItem(key, id),
          ['mole-office.workspace', WORKSPACE],
        )
        // NOTHING THIS RUN DOES MAY WRITE. Anything but a read is stopped at the wire.
        await context.route('**/*', (route) => {
          const method = route.request().method()
          if (method === 'GET' || method === 'HEAD') return route.continue()
          blocked++
          return route.abort()
        })
        const tab = await context.newPage()
        const url = `${WEB}/${page.address}`
        let error = null
        let measured = null
        try {
          await tab.goto(url, { timeout: 45_000 })
          await waitForThePage(tab, 45_000)
          await tab.waitForTimeout(1200)
          if (await tab.evaluate(() => document.querySelector('.gx-canvas-wrap') !== null)) {
            await tab.waitForSelector('.gx-canvas-wrap[data-state="drawn"]', { timeout: 30_000 })
            await tab.waitForTimeout(600)
          }
          measured = await tab.evaluate(measureInPage, { small: SMALL, sentenceWords: SENTENCE_WORDS })
        } catch (err) {
          error = err.message.split('\n')[0]
          console.error(`legibility: FAILED ${page.name} ${theme}: ${error}`)
        }
        results.push({ page: page.name, address: page.address, theme, error, ...(measured ?? {}) })
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }

  if (blocked > 0) {
    console.warn(`legibility: ${blocked} non-GET requests were blocked. The pages below did not fully settle.`)
  }

  // ------------------------------------------------------------------ report
  // THE REPORT'S TIME IS LOCAL WALL-CLOCK TIME, chapter 4 rule 8 (acceptance finding 63).
  const report = { label: LABEL, width: WIDTH, workspace: WORKSPACE, at: localStamp(new Date()), pages: [] }
  for (const r of results) {
    if (r.error !== null) {
      report.pages.push({ page: r.page, theme: r.theme, error: r.error })
      continue
    }
    const groups = new Map()
    for (const e of r.edges) {
      const ratio = contrast(e.edge, e.outside)
      const fillRatio = contrast(e.fill, e.outside)
      const key = `${e.kind}|${e.tag}|${e.cls}|${e.variant}|${hex(e.edge)}|${hex(e.outside)}`
      const found = groups.get(key)
      if (found === undefined) {
        groups.set(key, {
          kind: e.kind,
          what:
            `${e.tag}${e.cls === '' ? '' : `.${e.cls.split(/\s+/).join('.')}`}` +
            `${e.variant === '' ? '' : `[${e.variant}]`}${e.disabled ? '[disabled]' : ''}`,
          edge: hex(e.edge),
          outside: hex(e.outside),
          declared: e.declared,
          style: e.style,
          drawn: e.drawn,
          ratio: Number(ratio.toFixed(2)),
          fillRatio: Number(fillRatio.toFixed(2)),
          // An undrawn edge is reported on its own line rather than counted as a failing ratio.
          // For a CONTROL that is still a finding — nothing says where it ends but its fill — and
          // for an indicator that has given its enclosure up on purpose it is not.
          passes: !e.drawn ? e.kind === 'indicator' || fillRatio >= FLOOR : ratio >= FLOOR || fillRatio >= FLOOR,
          seen: 1,
        })
      } else found.seen++
    }
    report.pages.push({
      page: r.page,
      theme: r.theme,
      nodes: r.nodes,
      contentFound: r.contentFound,
      contentNodes: r.contentNodes,
      contentWords: r.contentWords,
      contentHeight: r.contentHeight,
      belowSmall: r.belowSmall,
      sentencesBelowSmall: r.sentences.length,
      sizes: r.sizes,
      sentences: r.sentences.sort((a, b) => b.words - a.words).slice(0, 6),
      unparsed: r.unparsed,
      edges: [...groups.values()].sort((a, b) => a.ratio - b.ratio),
    })
  }

  mkdirSync(outDir, { recursive: true })
  // THE IGNORE FILE SAYS WHO WROTE IT AND WHY. It used to be a bare `*` with nothing beside it, so
  // this directory was invisible to `git status` through a file that was itself invisible to
  // `git status`, and nothing said which tool had done it or that it would come back. Deleting it
  // closed nothing: this line rewrites it on every run, and the test suite runs this tool twice
  // (tests/looked-at-every-screen.test.ts, labels `test-control` and `test-defects`). A reader who
  // leaves something here that ought to be committed gets no warning from the ordinary check, so
  // the file now gives them one.
  writeFileSync(
    join(outDir, '.gitignore'),
    [
      '# Written by tools/legibility.mjs on every run, and rewritten by the next one.',
      '#',
      '# What is in this directory: one JSON report per --label, measured from a real browser.',
      '# They are measurements and not source. Make another with',
      '#',
      '#     node tools/legibility.mjs --label <name>',
      '#',
      '# The rule below ignores everything here INCLUDING this file, so nothing in this directory',
      '# reaches a commit by accident and nothing here shows up in `git status`. If you put',
      '# something here that does belong in the repository, `git add -f` it and say why in the',
      '# commit message, because the ordinary check will not remind you.',
      '*',
      '',
    ].join('\n'),
  )
  const file = join(outDir, `${LABEL}.json`)
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)

  const before = COMPARE === null ? null : JSON.parse(readFileSync(join(outDir, `${COMPARE}.json`), 'utf8'))
  const was = (page, theme, field) => {
    if (before === null) return null
    const found = before.pages.find((p) => p.page === page && p.theme === theme)
    return found === undefined ? null : found[field]
  }

  const pad = (s, n) => String(s).padEnd(n)
  const num = (s, n) => String(s).padStart(n)
  console.log(`\nTYPE at ${WIDTH}px, workspace "${WORKSPACE}" — nodes below ${SMALL}px, and full sentences (${SENTENCE_WORDS}+ words) below ${SMALL}px in main.page`)
  console.log(`"in page" is what main.page drew on its own, with the rail and the header bar left out.`)
  console.log(`${pad('page', 22)}${pad('theme', 7)}${num('nodes', 7)}${num('in page', 9)}${num(`<${SMALL}px`, 9)}${num('%', 6)}${num('sentences', 11)}`)
  for (const p of report.pages) {
    if (p.error !== undefined) {
      console.log(`${pad(p.page, 22)}${pad(p.theme, 7)}  FAILED: ${p.error}`)
      continue
    }
    const pc = p.nodes === 0 ? 0 : Math.round((p.belowSmall / p.nodes) * 100)
    const wasBelow = was(p.page, p.theme, 'belowSmall')
    const wasSent = was(p.page, p.theme, 'sentencesBelowSmall')
    console.log(
      `${pad(p.page, 22)}${pad(p.theme, 7)}${num(p.nodes, 7)}${num(p.contentNodes, 9)}${num(p.belowSmall, 9)}${num(`${pc}%`, 6)}${num(p.sentencesBelowSmall, 11)}` +
        (wasBelow === null ? '' : `   (was ${wasBelow} / ${wasSent})`),
    )
  }

  console.log(`\nEDGES — distinct bordered controls and indicators below ${FLOOR}:1 (border vs the surface outside; a fill that reaches ${FLOOR}:1 on its own counts as passing)`)
  console.log(`${pad('page', 22)}${pad('theme', 7)}${num('controls', 10)}${num('fail', 6)}${num('indicators', 12)}${num('fail', 6)}${num('worst', 8)}`)
  for (const p of report.pages) {
    if (p.error !== undefined) continue
    const controls = p.edges.filter((e) => e.kind === 'control')
    const indicators = p.edges.filter((e) => e.kind === 'indicator')
    const failC = controls.filter((e) => !e.passes)
    const failI = indicators.filter((e) => !e.passes)
    const worst = p.edges.length === 0 ? '—' : Math.min(...p.edges.map((e) => e.ratio)).toFixed(2)
    const wasFail = was(p.page, p.theme, 'edges')
    const wasCount = wasFail === null ? null : wasFail.filter((e) => e.kind === 'control' && !e.passes).length
    console.log(
      `${pad(p.page, 22)}${pad(p.theme, 7)}${num(controls.length, 10)}${num(failC.length, 6)}${num(indicators.length, 12)}${num(failI.length, 6)}${num(worst, 8)}` +
        (wasCount === null ? '' : `   (was ${wasCount} failing)`),
    )
  }

  const everyFailure = new Map()
  for (const p of report.pages) {
    for (const e of p.edges ?? []) {
      if (e.passes) continue
      const key = `${e.what}|${e.edge}|${e.outside}`
      if (!everyFailure.has(key)) everyFailure.set(key, { ...e, pages: new Set() })
      everyFailure.get(key).pages.add(`${p.page}/${p.theme}`)
    }
  }
  console.log(`\nEVERY DISTINCT EDGE BELOW ${FLOOR}:1 (${everyFailure.size} of them)`)
  for (const e of [...everyFailure.values()].sort((a, b) => a.ratio - b.ratio)) {
    console.log(
      `  ${e.drawn ? `${num(e.ratio.toFixed(2), 5)}:1` : ' none '}  fill ${num(e.fillRatio.toFixed(2), 5)}:1  ` +
        `${pad(e.kind, 10)} ${e.edge} on ${e.outside}  ${e.what.slice(0, 70)}  [${e.pages.size} page-themes]`,
    )
  }

  const unparsed = [...new Set(report.pages.flatMap((p) => p.unparsed ?? []))]
  if (unparsed.length > 0) console.warn(`\nlegibility: colours the canvas could not parse: ${unparsed.join(', ')}`)
  console.log(`\nlegibility: written to ${file}`)

  /**
   * A RUN THAT MEASURED NOTHING IS NOT A RUN THAT FOUND NOTHING WRONG.
   *
   * This tool had no exit code at all. It printed its tables and returned 0 whatever happened, so
   * "it exits 0" meant only that it finished.
   *
   * On 13 August that produced a clean pass over a broken product. The browser app stopped booting
   * — a page was imported and never created — and every page this tool visited rendered nothing. It
   * reported 0 nodes, 0 controls, 0 indicators and 0 failures on all 36 page-and-theme rows, printed
   * its usual output, and exited 0. Ninety minutes earlier the same tool had measured 228 nodes on
   * Home and 1,487 on the catalogue. One of the two checks the UX contract names as must-stay-true
   * was reading a dead app as a perfect one.
   *
   * That is the first invariant failing inside the project's own tooling, which is the worst place
   * for it: every other check here is trusted because this kind of check exists.
   *
   * So there is a floor. It is deliberately not a threshold anybody has to tune — any page that
   * renders at all clears it by three orders of magnitude, and a page that renders nothing cannot.
   *
   * AND THAT FLOOR WAS COUNTED OVER THE WRONG THING, which is the second half of the same defect and
   * was found on 14 August 2026. It asked whether the whole DOCUMENT held 0 text nodes. The rail is
   * part of the document and is drawn on every page whatever the page does, so a page made to render
   * nothing at all came back with 31 text nodes rather than 0 — its count fell from 155 — and this
   * tool exited 0. A floor the furniture clears on its own is not a floor. It is counted per page,
   * inside `main.page`, against `CONTENT_FLOOR`, which is what the numbers below do.
   */
  const measured = report.pages.filter((p) => p.error === undefined)
  const empty = measured.filter(
    (p) => p.contentFound !== true || (p.contentNodes ?? 0) < CONTENT_FLOOR.nodes || (p.contentWords ?? 0) < CONTENT_FLOOR.words,
  )
  const whyEmpty = (p) =>
    p.contentFound !== true
      ? 'no main.page at all'
      : `${p.contentNodes} text nodes, ${p.contentWords} words`
  if (measured.length === 0 || empty.length === measured.length) {
    console.error(
      `\nlegibility: NOTHING WAS MEASURED. ${measured.length} page-themes were visited and every one of them ` +
        `drew nothing in its content area, so this run says nothing about the product. The usual cause is that ` +
        `the app is not booting — open ${WEB} and look. This is reported as a failure rather than as a pass with ` +
        `empty tables, because a check that cannot see anything must not read as a check that found nothing wrong.`,
    )
    process.exitCode = 1
    return
  }
  if (empty.length > 0) {
    console.error(
      `\nlegibility: ${empty.length} of ${measured.length} page-themes DREW NOTHING in their content area — ` +
        `${empty.map((p) => `${p.page}/${p.theme} (${whyEmpty(p)})`).join(', ')}. The rail was still there, which ` +
        `is why the whole-document counts above look ordinary. Every other number is about the rest.`,
    )
    process.exitCode = 1
  }

  /**
   * PRINTING A FAILURE AND EXITING 0 IS THE SAME DEFECT AS SAYING "STORED." OVER UNSAVED TEXT.
   *
   * This tool found contrast failures and type set below the floor, printed both in full, and
   * exited 0 — so every caller that reads an exit code, which is every caller that is not a person
   * with the whole transcript in front of them, was told the interface was legible. A whole page of
   * new contrast failures read exactly like none.
   *
   * The two are separate counts because they are separate findings and a reader needs to know which
   * one went wrong, but either fails the run. There is no allowed list and no stored count of
   * "known" failures: a number saying how many failures are acceptable is a fact worked out in two
   * places, and the day somebody adds one more it is bumped rather than read.
   */
  // `everyFailure` is the same list that was printed in full above, so the count that fails the run
  // and the list a person reads are one thing rather than two that can disagree.
  const smallSentences = measured.filter((p) => (p.sentencesBelowSmall ?? 0) > 0)
  if (everyFailure.size > 0) {
    console.error(
      `\nlegibility: ${everyFailure.size} distinct bordered controls or indicators are below ${FLOOR}:1 against the ` +
        `surface outside them, listed above with the page-themes they appear on. WCAG 1.4.11 asks ${FLOOR}:1 of the ` +
        `visual boundary of a control, so this run FAILS. A tool that prints a contrast failure and exits 0 is ` +
        `telling its caller the opposite of what it just measured.`,
    )
    process.exitCode = 1
  }
  if (smallSentences.length > 0) {
    const worst = smallSentences
      .map((p) => `${p.page}/${p.theme} (${p.sentencesBelowSmall})`)
      .join(', ')
    console.error(
      `\nlegibility: full sentences are set below ${SMALL}px on ${smallSentences.length} page-themes — ${worst}. ` +
        `A sentence of ${SENTENCE_WORDS} words or more is prose the reader has to get through, and the app's own phone ` +
        `breakpoint raises these tokens because it reads better bigger. This run FAILS.`,
    )
    process.exitCode = 1
  }

  if (unreachable.length > 0) {
    console.warn(
      `\nlegibility: ${unreachable.length} page(s) the router declares were NOT measured, and here is why:\n  ` +
        `${unreachable.join('\n  ')}\nThis is reported rather than passed over, because a page nobody measured ` +
        `is not a page that was found clean.`,
    )
  }

  if (COMPARE !== null && !existsSync(join(outDir, `${COMPARE}.json`))) {
    console.warn(`legibility: nothing to compare against — ${COMPARE}.json does not exist.`)
  }
}

await main()
