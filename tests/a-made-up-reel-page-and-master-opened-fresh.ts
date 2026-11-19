// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP REEL PAGE AND THE MADE-UP MASTER OF 54 BOXES, EACH OPENED IN A FRESH WINDOW, TIMED AND READ FOR WHAT
 * IT DRAWS. The two drawings, and how they are stored, are in tests/a-made-up-reel-page-and-a-master-of-54-boxes.ts.
 *
 * WHO CALLS THIS. Three files, each in its own test office:
 *   - tests/the-lanes-drawing-draws-every-link-of-a-reel-page-and-a-master-of-54-boxes.test.ts opens each drawing once
 *     and reads what it draws. The suite runs it.
 *   - tests/the-lanes-drawing-is-first-drawn-within-3-seconds.test.ts opens each drawing five times and times it.
 *   - tests/the-lanes-legend-covers-nothing-on-the-reel-or-the-54-box-master.test.ts opens each drawing at three widths
 *     and reads its legend.
 * Each file calls liveApp itself, so tests/the-test-lists.ts counts it as a browser file.
 *
 * THE PAGE is the one every browser test is served: this checkout's page, built for production ("BUILT FOR
 * PRODUCTION" in tests/helpers.ts says how).
 *
 * HOW AN OPEN IS TIMED. Each open is a new browser context and page on the shared browser, at 1440 by 1000, light,
 * so the page keeps nothing from the open before. The clock starts just before the page is asked for. It stops when
 * the drawing writes data-fit, which is its last write, after its plan is chosen and its lines are drawn. A script the
 * page runs before its own notes each drawing that begins (data-drawing="lanes" written), each plan chosen
 * (data-not-drawn written) and each data-fit, with its time. After the drawing the page keeps has written data-fit,
 * the open waits 3 s, and waits again for as long as another drawing began in that time. The clock stops at the last
 * data-fit of the drawing the page keeps. While a drawing's lines are worked out, the drawing before it stays on the
 * page with its own data-fit, and the page's root says so with data-being-drawn, so an open counts only once no
 * element has data-being-drawn.
 *
 * WHAT AN OPEN READS, once the page has kept its drawing: the links named in data-not-drawn; the file's links that are
 * neither drawn at rest, with a line and a name in data-drawn-links, nor named for a selection in data-on-selection;
 * the records the old code drew as cards that are not drawn as cards, and the cards drawn that it did not draw; how
 * many drawings began and how many plans were chosen; and the fit.
 */
import { loadavg } from 'node:os'
import { dirname, join } from 'node:path'
import { expect } from 'vitest'

import { pipelinePath } from '../src/web/components/router.tsx'
import type { LiveApp, TestDb } from './helpers.ts'
import { DRAWING, readTheDrawing, storeTheAreas, writerFor, type Attempt } from './a-made-up-office-drawn-in-lanes.ts'
import { storeTheMasterOf54Boxes, storeTheReelPage, type Stored } from './a-made-up-reel-page-and-a-master-of-54-boxes.ts'

export const DRAWINGS = [
  { key: 'reel', name: 'made-up reel page' },
  { key: 'master', name: 'made-up master of 54 boxes' },
] as const
export type Drawing = (typeof DRAWINGS)[number]['key']

/** How long one open waits for its drawing: long enough for the old code under load. */
export const WAIT_FOR_THE_DRAWING = 120_000
/** How long no new drawing may begin before the drawing the page keeps is the one read. */
const QUIET = 3_000
/** The longest one open can take, for a case's time limit: the wait, two quiet spells and room to read. */
export const ONE_OPEN_AT_MOST = WAIT_FOR_THE_DRAWING + 2 * QUIET + 30_000

/** Writes the project and both drawings' records and links into the test's database, before the server starts. */
export async function storeTheTwoDrawings(db: TestDb, project: { id: string; title: string }): Promise<Record<Drawing, Stored>> {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { anOfficeId } = await import('../src/server/db/ids.ts')
  createWorkspace(project)
  return { reel: storeTheReelPage(db, project.id, anOfficeId), master: storeTheMasterOf54Boxes(db, project.id, anOfficeId) }
}

/** Once the server is up, as the person: sets the master, and tries to store each drawing's areas and places. */
export async function setTheMasterAndStoreTheAreas(app: LiveApp, db: TestDb, project: string, stored: Record<Drawing, Stored>): Promise<Record<Drawing, Attempt>> {
  const write = writerFor(app, project, join(dirname(db.file), 'keys.json'))
  await write.call('PUT', `/api/projects/${project}/master-pipeline`, { pipeline: stored.master.master! })
  const [reel] = stored.reel.areas
  const [master] = stored.master.areas
  return { reel: await storeTheAreas(write, reel!.pipeline, reel!.intent), master: await storeTheAreas(write, master!.pipeline, master!.intent) }
}

// ================================================================================================ the page's notes

/** What the script the page runs before its own notes, in the order it happened. */
interface TheNotes {
  events: { kind: 'began' | 'planned' | 'fit'; drawing: number; at: number }[]
  /** The number of the drawing the page holds now, or null when it holds none. */
  kept(): number | null
}

/** Run by the page before its own script: picks the project and the theme, and notes each drawing's writes. */
function noteTheDrawings(project: string): void {
  localStorage.setItem('mole-office.workspace', project)
  localStorage.setItem('mole-office.preset.theme', 'light')
  const numbers = new WeakMap<Element, number>()
  let counted = 0
  const numberOf = (element: Element): number => {
    if (!numbers.has(element)) numbers.set(element, (counted += 1))
    return numbers.get(element)!
  }
  const notes: TheNotes = {
    events: [],
    kept: () => {
      const kept = document.querySelector('[data-drawing="lanes"]')
      return kept === null ? null : numberOf(kept)
    },
  }
  ;(window as unknown as { lanesNotes: TheNotes }).lanesNotes = notes
  const kinds: Record<string, TheNotes['events'][number]['kind']> = { 'data-drawing': 'began', 'data-not-drawn': 'planned', 'data-fit': 'fit' }
  new MutationObserver((changes) => {
    const at = Date.now()
    for (const change of changes) {
      const element = change.target as Element
      if (element.getAttribute('data-drawing') !== 'lanes') continue
      notes.events.push({ kind: kinds[change.attributeName!]!, drawing: numberOf(element), at })
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: Object.keys(kinds) })
}

// ======================================================================================================== an open

export interface AnOpen {
  /** From asking for the page to the last data-fit of the drawing the page keeps. */
  ms: number
  /** The one-minute load just before the page was asked for. */
  load: number
  began: number
  planned: number
  fit: string
  notDrawn: unknown
  /** The file's links that are neither drawn at rest nor named for a selection, by the keys of the file. */
  missing: string[]
  /** The records the old code drew as cards that are not drawn as cards, by the keys of the file. */
  cardsMissing: string[]
  /** How many cards are drawn for records the old code did not draw as cards. */
  cardsAdded: number
  atRest: number
  forASelection: number
  cards: number
}

/** Opens the drawing's page in a new browser context, times its first drawing, and reads what it draws. */
export async function openOnce(app: LiveApp, project: string, one: Stored, drawing: Drawing, n: number): Promise<AnOpen> {
  const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    await context.addInitScript(noteTheDrawings, project)
    const page = await context.newPage()
    /** The drawing the page keeps, when it has written data-fit since it last began; null until then. */
    const theKeptDrawing = () =>
      page.evaluate(() => {
        const notes = (window as unknown as { lanesNotes: TheNotes }).lanesNotes
        const kept = notes.kept()
        const its = notes.events.filter((event) => event.drawing === kept && event.kind !== 'planned')
        const last = its.at(-1)
        const began = notes.events.filter((event) => event.kind === 'began').length
        const planned = notes.events.filter((event) => event.kind === 'planned').length
        return { fittedAt: last?.kind === 'fit' ? last.at : null, began, planned }
      })
    const itIsDrawn = () =>
      page.waitForFunction(
        () => {
          const notes = (window as unknown as { lanesNotes?: TheNotes }).lanesNotes
          if (notes === undefined || document.querySelector('[data-being-drawn]') !== null) return false
          const kept = notes.kept()
          return notes.events.filter((event) => event.drawing === kept && event.kind !== 'planned').at(-1)?.kind === 'fit'
        },
        null,
        { timeout: WAIT_FOR_THE_DRAWING, polling: 100 },
      )
    const load = loadavg()[0]!
    const asked = Date.now()
    await page.goto(`${app.site}/?lang=en&theme=light&open=${drawing}-${String(n)}#${pipelinePath(one.pipeline)}`, { waitUntil: 'commit' })
    await itIsDrawn()
    let seen = await theKeptDrawing()
    for (;;) {
      await page.waitForTimeout(QUIET)
      await itIsDrawn()
      const now = await theKeptDrawing()
      const quiet = now.began === seen.began
      seen = now
      if (quiet) break
    }

    const read = await readTheDrawing(page)
    const root = page.locator(DRAWING)
    const notDrawn = JSON.parse((await root.getAttribute('data-not-drawn')) ?? 'null') as unknown
    const fit = JSON.parse((await root.getAttribute('data-fit')) ?? 'null') as { card?: number; zoom?: number; tries?: unknown[]; natural?: unknown } | null
    const lined = new Set(read.paths.map((path) => path.link))
    const named = new Set(Object.values(read.onSelection).flat())
    const drawnAtRest = (link: string) => read.drawnLinks.includes(link) && lined.has(link)
    const keyOf = new Map(Object.entries(one.id).map(([key, id]) => [id, key]))
    const drawnCards = new Set(read.cards.map((card) => card.id))
    const oldCards = new Set(one.cards)
    return {
      ms: seen.fittedAt! - asked,
      load,
      began: seen.began,
      planned: seen.planned,
      fit: JSON.stringify({ card: fit?.card, zoom: fit?.zoom, tries: fit?.tries?.length, natural: fit?.natural }),
      notDrawn,
      missing: one.links.filter((link) => !drawnAtRest(link) && !named.has(link)).map((link) => one.linkNamed.get(link)!),
      cardsMissing: one.cards.filter((card) => !drawnCards.has(card)).map((card) => keyOf.get(card)!),
      cardsAdded: [...drawnCards].filter((card) => !oldCards.has(card)).length,
      atRest: one.links.filter(drawnAtRest).length,
      forASelection: one.links.filter((link) => !drawnAtRest(link) && named.has(link)).length,
      cards: drawnCards.size,
    }
  } finally {
    await context.close()
  }
}

/** The open is whole: it leaves out no link and no card the old code drew, and draws no card it did not. */
export function theOpenIsWhole(open: AnOpen, label: string): void {
  expect(open.notDrawn, `${label}: the links named in data-not-drawn`).toEqual({})
  expect(open.missing, `${label}: the file's links neither drawn at rest nor named for a selection`).toEqual([])
  expect(open.cardsMissing, `${label}: the records the old code drew as cards that are not drawn as cards`).toEqual([])
  expect(open.cardsAdded, `${label}: the cards drawn for records the old code did not draw as cards`).toBe(0)
}

/** What an open drew, in one line, for a case to print. */
export function whatItDrew(opens: AnOpen[], one: Stored): string {
  return (
    `drawings begun ${opens.map((open) => open.began).join(', ')}, plans chosen ${opens.map((open) => open.planned).join(', ')}; ` +
    `fit ${opens.map((open) => open.fit).join(' ')}; cards ${opens.map((open) => open.cards).join(', ')} of the ${String(one.cards.length)} ` +
    `the old code drew; of the file's ${String(one.links.length)} links, drawn at rest ${opens.map((open) => open.atRest).join(', ')} ` +
    `and for a selection ${opens.map((open) => open.forASelection).join(', ')}`
  )
}
