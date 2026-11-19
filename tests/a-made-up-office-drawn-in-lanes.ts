// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP OFFICE, AND THE READING OF THE DRAWING IN AREAS, SHARED BY THE TESTS OF PV-2'S PAGE. Wave 13u round 230.
 * The drawing replaces the master's block map and today's canvas on a pipeline's page, as PV-2's page decision says;
 * its areas are the `lanes` of a pipeline's stored presentation, as PV-2's decision on areas says.
 *
 * Four test files use this one: tests/the-lanes-drawing-draws-every-kind-of-link.test.ts,
 * tests/the-lanes-drawing-crosses-no-line-at-rest.test.ts, tests/the-lanes-drawing-cards-say-their-state-and-select.test.ts
 * and tests/the-lanes-drawing-titles-lead-and-say-no-study-words.test.ts. Each starts its own test office with liveApp
 * and writes through the API as the person, in a made-up project. Every title, area name and link word is made up and
 * says so. No record id is written anywhere: records are named by keys, and their ids come from the office's replies.
 *
 * WHAT THE DRAWING SHOWS A TEST, from the contract the wave's supervisor sent for round 230:
 *   - the root `[data-drawing="lanes"]`, with data-level, data-drawn-links (the ids of the links drawn at rest),
 *     data-on-selection (for each card id, the ids of the links drawn while it is selected) and data-selected;
 *   - each card `.e-card`, with data-id, data-role, data-state when a state is stored, role="button", tabindex 0,
 *     aria-pressed, and during a selection data-selected, data-lit or data-dim;
 *   - each line `path.e-path`, with data-link, data-type, data-points (JSON points in drawing units) and data-inferred;
 *   - each area, with data-key (its name), data-tint and data-head; each title `.e-title`; each state chip `.e-chip`.
 *
 * A WRITE THAT IS REFUSED UNTIL THE DRAWING IS JOINED IS TRIED, NOT DEMANDED. Storing areas is one: today's presentation
 * door refuses `lanes` as a key it does not know. Its reply is kept, and each case that needs areas says so first, so
 * the refusal turns that case red in the office's own words instead of failing every case through the setup.
 */
import { join } from 'node:path'
import type { Page } from 'playwright'
import { expect } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { pipelineScope } from '../src/shared/presentation.ts'
import { thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { waitForTheProjects } from './switch-the-project.ts'

// ============================================================================================ writing as the person

/** A reply kept whole, for a write that may be refused. */
export interface Attempt {
  ok: boolean
  status: number
  text: string
}

export interface Writer {
  /** A write that must succeed. The case or hook fails with the office's reply when it does not. */
  call(method: string, path: string, body?: unknown): Promise<any>
  /** A write whose refusal is an answer. */
  attempt(method: string, path: string, body?: unknown): Promise<Attempt>
}

/** `keysFile` is beside the database: in the app's own folder, or beside a database file the test named. */
export function writerFor(app: LiveApp, project: string, keysFile = join(app.dir, 'keys.json')): Writer {
  const attempt = async (method: string, path: string, body?: unknown): Promise<Attempt> => {
    const headers = {
      'content-type': 'application/json',
      'x-mole-office-workspace': project,
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_PERSON,
      ...thePersonsKeyHeader(keysFile),
    }
    const reply = await fetch(`${app.api}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { ok: reply.ok, status: reply.status, text: await reply.text() }
  }
  return {
    attempt,
    async call(method, path, body) {
      const made = await attempt(method, path, body)
      expect(made.ok, `${method} ${path}: ${made.text}`).toBe(true)
      return JSON.parse(made.text) as unknown
    },
  }
}

/** Stores a pipeline's areas and places. Tried, not demanded: see the header. */
export function storeTheAreas(write: Writer, pipelineId: string, intent: Record<string, unknown>): Promise<Attempt> {
  return write.attempt('PUT', `/api/presentation/${encodeURIComponent(pipelineScope(pipelineId))}`, { intent })
}

/** The first thing a case that needs areas says. */
export function theAreasWereStored(stored: Attempt, pipeline: string): void {
  expect(stored.ok, `the areas of ${pipeline} were stored (PUT ${String(stored.status)}: ${stored.text})`).toBe(true)
}

// ===================================================================================================== the page

export async function prepareThePage(app: LiveApp, project: string): Promise<void> {
  await app.page.addInitScript((id) => {
    localStorage.setItem('mole-office.workspace', id)
    localStorage.setItem('mole-office.preset.theme', new URL(location.href).searchParams.get('theme') ?? 'light')
  }, project)
}

let loads = 0

export async function openThePage(app: LiveApp, path: string, theme: 'light' | 'dark' = 'light'): Promise<void> {
  loads += 1
  await app.page.goto(`${app.site}/?lang=en&theme=${theme}&load=${String(loads)}#${path}`)
  await waitForThePage(app.page, 30_000)
  await waitForTheProjects(app.page)
}

export const DRAWING = '[data-drawing="lanes"]'
export const SAID = '[data-pipeline-part="said"]'

export const cardOf = (recordId: string): string => `${DRAWING} .e-card[data-id="${recordId}"]`

/**
 * Waits for the drawing in areas to be drawn and to hold still, and fails with a sentence when the page has none.
 * Holding still is the same reading of the root, its cards and its lines on 10 animation frames running, so a test
 * never reads a line half laid out. At 390 the drawing is an outline of cards, and only its cards are waited for.
 */
export async function theDrawingIsDrawn(page: Page, { outline = false } = {}): Promise<void> {
  const ready = outline ? `${DRAWING} .e-card` : `${DRAWING}[data-drawn-links]`
  await page.locator(ready).first().waitFor({ timeout: 30_000 }).catch(() => undefined)
  expect(await page.locator(DRAWING).count(), `one drawing in areas (${DRAWING}) on ${page.url()}`).toBe(1)
  if (outline) expect(await page.locator(`${DRAWING} .e-card`).count(), 'the outline draws its cards (.e-card)').toBeGreaterThan(0)
  else expect(await page.locator(`${DRAWING}[data-drawn-links]`).count(), 'the drawing names the lines it draws at rest (data-drawn-links)').toBe(1)
  await theDrawingHoldsStill(page)
}

export async function theDrawingHoldsStill(page: Page): Promise<void> {
  await page.evaluate(
    (selector) =>
      new Promise<void>((resolve, reject) => {
        const reading = (): string => {
          const root = document.querySelector(selector)
          if (root === null) return 'none'
          const lines = [...root.querySelectorAll('path.e-path')].map((p) => `${p.getAttribute('data-link') ?? ''} ${p.getAttribute('data-points') ?? ''}`)
          const cards = [...root.querySelectorAll('.e-card')].map((c) => `${c.getAttribute('data-id') ?? ''} ${c.getAttribute('aria-pressed') ?? ''}`)
          const attributes = ['data-level', 'data-drawn-links', 'data-on-selection', 'data-selected'].map((name) => root.getAttribute(name) ?? '')
          return [...attributes, ...cards, ...lines].join('\n')
        }
        const started = performance.now()
        let last = reading()
        let same = 0
        const frame = (): void => {
          const now = reading()
          same = now === last ? same + 1 : 0
          last = now
          if (same >= 10) resolve()
          else if (performance.now() - started > 10_000) reject(new Error('the drawing was still changing after 10 seconds'))
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    DRAWING,
  )
}

/**
 * Presses Whole screen and returns once the drawing that press starts is shown and holds still. The page makes the next
 * drawing hidden beside the one on screen, so theDrawingIsDrawn alone can pass on the drawing before. This waits for the
 * drawing before to leave the page, which it does only when the next one is shown in its place, so the wait cannot pass
 * before the next drawing has started.
 */
export async function openTheWholeScreen(page: Page): Promise<void> {
  const before = await page.locator(DRAWING).elementHandle()
  await page.getByRole('button', { name: 'Whole screen', exact: true }).click()
  const left = await page.waitForFunction((drawing) => !drawing.isConnected, before, { timeout: 30_000 }).then(() => true, () => false)
  expect(left, `the drawing shown before Whole screen was pressed left the page for the one Whole screen started, on ${page.url()}`).toBe(true)
  await theDrawingIsDrawn(page)
}

// ============================================================================================ reading the drawing

export type Point = readonly [number, number]

export interface DrawnCard {
  id: string
  role: string | null
  state: string | null
  buttonRole: string | null
  tabIndex: string | null
  pressed: string | null
  selected: boolean
  lit: boolean
  dim: boolean
  chips: { state: string | null; text: string }[]
  titles: { tag: string; href: string | null; text: string }[]
}

export interface DrawnPath {
  link: string
  type: string | null
  points: Point[]
  inferred: boolean
}

export interface DrawnArea {
  key: string | null
  tint: string | null
  head: string | null
  /** The cards lying inside the area's rectangle, an inner area's among them. */
  cards: string[]
}

export interface TheDrawing {
  level: string | null
  drawnLinks: string[]
  onSelection: Record<string, string[]>
  selected: string | null
  cards: DrawnCard[]
  paths: DrawnPath[]
  /** Every area, in the order the document holds them. */
  areas: DrawnArea[]
  /** The drawing's text, with each run of white space made one space. */
  text: string
}

function jsonOf(text: string | null, what: string): unknown {
  expect(text, `${what} is there`).not.toBeNull()
  try {
    return JSON.parse(text!) as unknown
  } catch {
    throw new Error(`${what} is not JSON: ${text!}`)
  }
}

function idsOf(value: unknown, what: string): string[] {
  expect(Array.isArray(value) && value.every((v) => typeof v === 'string'), `${what} is a list of link ids: ${JSON.stringify(value)}`).toBe(true)
  return value as string[]
}

/** Points written as [x, y] or as {x, y}; anything else fails with what it was. */
export function pointsOf(text: string | null, link: string): Point[] {
  const value = jsonOf(text, `the points of line ${link}`)
  expect(Array.isArray(value), `the points of line ${link} are a list: ${String(text)}`).toBe(true)
  return (value as unknown[]).map((point) => {
    const pair = Array.isArray(point) ? point : typeof point === 'object' && point !== null ? [(point as { x?: unknown }).x, (point as { y?: unknown }).y] : []
    const [x, y] = pair as unknown[]
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`line ${link} has a point that is not two numbers: ${JSON.stringify(point)}`)
    }
    return [x, y] as const
  })
}

/** The drawing as the page holds it, before any attribute is read as JSON. */
async function readTheRoot(page: Page) {
  const raw = await page.evaluate((selector) => {
    const root = document.querySelector(selector)
    if (root === null) return null
    const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    return {
      text: text(root),
      level: root.getAttribute('data-level'),
      drawnLinks: root.getAttribute('data-drawn-links'),
      onSelection: root.getAttribute('data-on-selection'),
      selected: root.getAttribute('data-selected'),
      cards: [...root.querySelectorAll('.e-card')].map((card) => ({
        id: card.getAttribute('data-id') ?? '',
        role: card.getAttribute('data-role'),
        state: card.getAttribute('data-state'),
        buttonRole: card.getAttribute('role'),
        tabIndex: card.getAttribute('tabindex'),
        pressed: card.getAttribute('aria-pressed'),
        selected: card.getAttribute('data-selected') === '1',
        lit: card.getAttribute('data-lit') === '1',
        dim: card.getAttribute('data-dim') === '1',
        chips: [...card.querySelectorAll('.e-chip')].map((chip) => ({ state: chip.getAttribute('data-state'), text: text(chip) })),
        titles: [...card.querySelectorAll('.e-title')].map((title) => ({ tag: title.tagName.toLowerCase(), href: title.getAttribute('href'), text: text(title) })),
      })),
      paths: [...root.querySelectorAll('path.e-path')].map((path) => ({
        link: path.getAttribute('data-link') ?? '',
        type: path.getAttribute('data-type'),
        points: path.getAttribute('data-points'),
        inferred: path.getAttribute('data-inferred') === '1',
      })),
      areas: [...root.querySelectorAll('[data-key]')].map((area) => {
        // The drawing places its cards beside its areas, not inside them, so a card is in an area when it lies inside
        // the area's rectangle (to a pixel, for rounding).
        const box = area.getBoundingClientRect()
        const inside = (card: Element): boolean => {
          const r = card.getBoundingClientRect()
          return r.width > 0 && r.left >= box.left - 1 && r.top >= box.top - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1
        }
        return {
          key: area.getAttribute('data-key'),
          tint: area.getAttribute('data-tint'),
          head: area.getAttribute('data-head'),
          cards: [...root.querySelectorAll('.e-card')].filter(inside).map((card) => card.getAttribute('data-id') ?? ''),
        }
      }),
    }
  }, DRAWING)
  expect(raw, `a drawing in areas (${DRAWING}) to read`).not.toBeNull()
  return raw!
}

/** Every card, in the order the document holds them, at any width. */
export async function readTheCards(page: Page): Promise<DrawnCard[]> {
  return (await readTheRoot(page)).cards
}

export async function readTheDrawing(page: Page): Promise<TheDrawing> {
  const raw = await readTheRoot(page)
  const onSelection = jsonOf(raw.onSelection, 'data-on-selection')
  expect(typeof onSelection === 'object' && onSelection !== null && !Array.isArray(onSelection), `data-on-selection is a map: ${String(raw.onSelection)}`).toBe(true)
  return {
    level: raw.level,
    drawnLinks: idsOf(jsonOf(raw.drawnLinks, 'data-drawn-links'), 'data-drawn-links'),
    onSelection: Object.fromEntries(Object.entries(onSelection as Record<string, unknown>).map(([card, links]) => [card, idsOf(links, `data-on-selection of ${card}`)])),
    selected: raw.selected,
    cards: raw.cards,
    paths: raw.paths.map((path) => ({ ...path, points: pointsOf(path.points, path.link) })),
    areas: raw.areas,
    text: raw.text,
  }
}

/**
 * A place on a card that is the card and not its title, scrolled into the window, for a pointer press that must reach
 * the card itself. Fails when every place tried is the title or something drawn over the card.
 */
export async function aPlaceOnTheCard(page: Page, recordId: string): Promise<{ x: number; y: number }> {
  const place = await page.evaluate(
    ({ selector, id }) => {
      const card = document.querySelector(`${selector} .e-card[data-id="${CSS.escape(id)}"]`)
      if (card === null) return null
      card.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
      const box = card.getBoundingClientRect()
      for (const down of [0.85, 0.7, 0.5, 0.3, 0.15]) {
        for (const across of [0.15, 0.3, 0.5, 0.7, 0.85]) {
          const x = box.left + box.width * across
          const y = box.top + box.height * down
          const hit = document.elementFromPoint(x, y)
          if (hit !== null && card.contains(hit) && hit.closest('a, .e-title') === null) return { x, y }
        }
      }
      return null
    },
    { selector: DRAWING, id: recordId },
  )
  expect(place, `a place on card ${recordId} that is not its title`).not.toBeNull()
  return place!
}

// ================================================================================== the office for criteria 1, 3-6

export const PROJECT = { id: 'test-lanes-drawing', title: 'Example office drawn in areas (made up)' }

/** The steps of each made-up block pipeline, with the state each is stored in. `alone` has no line at all. */
export const STEPS = [
  { name: 'start', state: 'done' },
  { name: 'next', state: 'doing' },
  { name: 'partly', state: 'todo' },
  { name: 'top', state: 'blocked' },
  { name: 'bottom', state: 'failed' },
  { name: 'loop-a', state: 'doing' },
  { name: 'loop-b', state: 'todo' },
  { name: 'alone', state: 'done' },
] as const

/** The modules each made-up block pipeline draws. A module is stored with no state, so its card says so. */
export const MODULES = ['reader', 'writer', 'counter'] as const

/** The words the feeds link carries. */
export const CARRIED = 'example rows (made up)'

/**
 * Each link of a made-up block pipeline, by its ends' names, and what it is there to show. The office stores a feeds
 * link only between two steps and an implements link only from a module to a step (checkLinkKinds in
 * src/server/lib/records.ts), so both feeds links join two steps. `elsewhere` is the one step
 * of another pipeline; every other end is a record of the pipeline itself.
 */
export const LINKS = [
  { key: 'hard', type: 'blocks', from: 'start', to: 'next', gate: { kind: 'hard' }, shows: 'a waits-on line through a hard gate' },
  { key: 'partial', type: 'blocks', from: 'next', to: 'partly', gate: { kind: 'partial', upTo: 'the first example batch (made up)' }, shows: 'a waits-on line through a partial gate' },
  { key: 'upward', type: 'blocks', from: 'bottom', to: 'top', shows: 'an upward line: a step waits on a step placed below it' },
  { key: 'loop-there', type: 'blocks', from: 'loop-a', to: 'loop-b', shows: 'a loop: two steps, each waiting on the other' },
  { key: 'loop-back', type: 'blocks', from: 'loop-b', to: 'loop-a', shows: 'the loop, back' },
  { key: 'feeds', type: 'feeds', from: 'top', to: 'start', carries: [{ out: CARRIED }], shows: 'a feeds line with the words it carries' },
  { key: 'feeds-back', type: 'feeds', from: 'start', to: 'top', shows: 'the same two records, linked both ways' },
  { key: 'consumes', type: 'consumes', from: 'counter', to: 'reader', shows: 'a consumes line' },
  { key: 'measures', type: 'measures', from: 'counter', to: 'writer', shows: 'a measures line' },
  { key: 'implements', type: 'implements', from: 'reader', to: 'start', shows: 'an implements line, drawn while a card at one end is selected' },
  { key: 'implements-writer', type: 'implements', from: 'writer', to: 'next', shows: 'the writer carries a step' },
  { key: 'implements-counter', type: 'implements', from: 'counter', to: 'partly', shows: 'the counter carries a step' },
  { key: 'elsewhere', type: 'blocks', from: 'elsewhere', to: 'bottom', shows: "a link to a step of another pipeline" },
] as const

/** The link the drawing cannot draw: its far end is an idea, which is no drawn record and no pipeline's step. */
export const UNDRAWABLE = { key: 'undrawable', type: 'consumes', from: 'partly', to: 'idea' } as const

export const TITLES = {
  master: 'Example master pipeline (made up)',
  'master-first': 'Example first block (made up)',
  'master-second': 'Example second block (made up)',
  'master-third': 'Example third block (made up)',
  drawn: 'Example pipeline drawn in areas (made up)',
  plain: 'Example pipeline with no areas stored (made up)',
  other: 'Example other pipeline (made up)',
  elsewhere: 'Example step of another pipeline (made up)',
  idea: 'Example idea nobody draws (made up)',
} as const

/** The areas of the pipeline drawn in areas, and where each of its records is placed. */
export const AREAS = [
  { name: 'Example first area (made up)', arrange: 'row', order: 1, tint: '--area-1' },
  { name: 'Example second area (made up)', arrange: 'row', order: 2, tint: '--area-2' },
  { name: 'Example third area (made up)', arrange: 'row', order: 3 },
  { name: 'Example area of modules (made up)', arrange: 'grid', columns: 3, order: 4, tint: '--area-4' },
] as const

export const PLACES: Readonly<Record<string, readonly [number, number]>> = {
  top: [0, 1],
  start: [0, 2],
  next: [0, 3],
  partly: [1, 1],
  'loop-a': [1, 2],
  'loop-b': [1, 3],
  bottom: [2, 1],
  alone: [2, 2],
  reader: [3, 1],
  writer: [3, 2],
  counter: [3, 3],
}

export interface MadeUpOffice {
  /** Each record's id, by key. The second pipeline's records have keys beginning `plain-`. */
  id: Record<string, string>
  /** Each record's kind, by id. */
  kindOf: Record<string, string>
  /** Each record's stored state, by id, for the records stored with one. */
  stateOf: Record<string, string>
  /** Each link's id, by key, and its ends' keys. The second pipeline's link keys begin `plain-`. */
  link: Record<string, string>
  ends: Record<string, { from: string; to: string; type: string }>
  /** The reply to storing the areas of the pipeline drawn in areas. */
  areas: Attempt
  /** The reply to a link from a step to itself. */
  selfLink: Attempt
}

/**
 * The made-up office: a master of three blocks, with a block pipeline hung on each. The first is drawn in areas; the
 * second has the same records and links with no areas stored; the third holds one step that both link to. Every block
 * pipeline's steps are boxes on the master's Boxes level.
 */
export async function buildTheMadeUpOffice(write: Writer): Promise<MadeUpOffice> {
  const office: MadeUpOffice = { id: {}, kindOf: {}, stateOf: {}, link: {}, ends: {}, areas: { ok: false, status: 0, text: 'not tried' }, selfLink: { ok: false, status: 0, text: 'not tried' } }
  const { id } = office
  const record = (key: string, made: { record: { id: string } }, kind: string, state: string | null): void => {
    id[key] = made.record.id
    office.kindOf[made.record.id] = kind
    if (state !== null) office.stateOf[made.record.id] = state
  }
  const pipeline = async (key: keyof typeof TITLES): Promise<void> => {
    record(key, await write.call('POST', '/api/records', { kind: 'pipeline', title: TITLES[key], data: { blockIds: [] } }), 'pipeline', null)
  }
  const step = async (pipelineKey: string, key: string, name: string, state: string): Promise<void> => {
    record(key, await write.call('POST', `/api/records/${id[pipelineKey]!}/blocks`, { name, state }), 'block', state)
  }
  const module = async (key: string, title: string): Promise<void> => {
    record(key, await write.call('POST', '/api/records', { kind: 'module', title, data: { context: 'Made up for a test of the drawing in areas.' } }), 'module', null)
  }
  const join = async (key: string, from: string, to: string, type: string, extra: Record<string, unknown> = {}): Promise<void> => {
    office.link[key] = (await write.call('POST', '/api/links', { fromId: id[from]!, toId: id[to]!, type, ...extra })).id as string
    office.ends[key] = { from, to, type }
  }

  await write.call('POST', '/api/workspaces', PROJECT)
  await pipeline('master')
  await step('master', 'master-first', TITLES['master-first'], 'done')
  await step('master', 'master-second', TITLES['master-second'], 'doing')
  await step('master', 'master-third', TITLES['master-third'], 'todo')
  await join('master-hard', 'master-first', 'master-second', 'blocks', { gate: { kind: 'hard' } })
  await join('master-plain', 'master-second', 'master-third', 'blocks')

  await pipeline('other')
  await step('other', 'elsewhere', TITLES.elsewhere, 'doing')
  await join('other-part', 'other', 'master-third', 'part_of')
  record('idea', await write.call('POST', '/api/records', { kind: 'idea', title: TITLES.idea, data: {} }), 'idea', null)

  for (const [pipelineKey, prefix, block] of [['drawn', '', 'master-first'], ['plain', 'plain-', 'master-second']] as const) {
    await pipeline(pipelineKey)
    await join(`${prefix}part`, pipelineKey, block, 'part_of')
    for (const { name, state } of STEPS) await step(pipelineKey, `${prefix}${name}`, `Example step ${name} (made up)`, state)
    for (const name of MODULES) await module(`${prefix}${name}`, `Example module ${name}${prefix === '' ? '' : ' with no areas'} (made up)`)
    const named = (end: string): string => (end === 'elsewhere' ? end : `${prefix}${end}`)
    for (const one of LINKS) {
      const extra = { ...('gate' in one ? { gate: one.gate } : {}), ...('carries' in one ? { carries: one.carries } : {}) }
      await join(`${prefix}${one.key}`, named(one.from), named(one.to), one.type, extra)
    }
    await join(`${prefix}${UNDRAWABLE.key}`, named(UNDRAWABLE.from), UNDRAWABLE.to, UNDRAWABLE.type)
  }
  await write.call('PUT', `/api/projects/${PROJECT.id}/master-pipeline`, { pipeline: id['master']! })

  office.selfLink = await write.attempt('POST', '/api/links', { fromId: id['start']!, toId: id['start']!, type: 'blocks' })
  office.areas = await storeTheAreas(write, id['drawn']!, {
    direction: 'down',
    lanes: AREAS,
    nodes: Object.fromEntries(Object.entries(PLACES).map(([name, [area, order]]) => [id[name]!, { lane: AREAS[area]!.name, order }])),
  })
  return office
}
