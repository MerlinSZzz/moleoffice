// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE DRAWS AN ARROW FROM EACH STEP TO THE NEXT WHEN NO STEP LINK IS STORED, AND A `feeds` LINK SAYS WHAT MOVES.
 *
 * Screenshots showed a pipeline whose steps had no stored
 * links: a stack of steps with no arrows, and numbered steps that did not read in the stored order.
 *
 * WHAT IS PROVED, in a made-up office with three pipelines:
 *   1. no step-to-step link stored: the rows are in the pipeline's stored order (01, 06, 12, 07),
 *      one lighter arrow joins each step to the next, each has a hover word, and one legend line
 *      says the arrows follow the stored order and are not stored links;
 *   2. a `blocks` link stored: the wait is drawn as today, with its gate, and NO order arrow is drawn;
 *   3. a `feeds` link stored: the arrow carries the out port's name, and the arrow's pill says
 *      "out → in" when the in port differs. The port names are the agents' own words and are not
 *      translated. No order arrow is drawn.
 *
 * The test writes each `feeds` row straight into its own throwaway database, as an import would
 * leave it. POST /api/links writes one too since round 216, and
 * tests/a-feeds-link-is-written-between-steps-and-modules.test.ts proves that door. The page reads it through
 * `GET /api/links`, the one bulk link read.
 *
 * MUTATION, after a control run: in PipelineFlow.tsx, layoutFlow draws no order edges when the
 * pipeline stores none. Cases 1 and 3 go red, and case 2 stays green.
 *
 * PICTURES: only when TEST_SHOTS names a folder. Every pipeline is photographed at 1440 and 390,
 * in light, in English and Chinese.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { testShots, TEST_SHOTS, photographWithNothingOver } from './where-shots-go.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

const LANGUAGES = ['en', 'zh'] as const
const LOOKS = ['light'] as const
const WIDTHS = [1440, 390] as const

// CRITERION CHANGE, as decided: the legend line is the name "step order" beside its mark, not a sentence.
const ORDER_LEGEND = 'pipelineFlow.legend.stepOrder'
const ORDER_HOVER = 'g7b.PipelineFlow.the_next_step_in_the_stored_order'

let db: TestDb
let app: LiveApp
let page: Page
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('w19-pipeline-arrows')

/** One made-up pipeline and the block ids the test needs to read back. */
interface Built {
  id: string
  name: string
  steps: string[]
}

function pipeline(title: string, names: readonly string[]): Built {
  const record = db.api.createRecord({
    kind: 'pipeline',
    title,
    workspaceId: 'default',
    origin: 'fixture',
    actor: db.api.HUMAN,
    data: { blockIds: [] },
  })
  const steps = names.map((name) => db.blocks.addBlock(record.id, { name, state: 'todo' }, db.api.HUMAN).block.id)
  return { id: record.id, name: title, steps }
}

/** A `feeds` row, written straight into the test's own database, as an import would leave it. */
function feeds(from: string, to: string, carries: { out: string; in?: string }[], n: number): void {
  db.client.sqlite
    .prepare(
      'INSERT INTO links (id, workspace_id, owner_id, created_at, updated_at, from_id, to_id, type, inferred, created_by, created_by_type, carries) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      `feeds-${String(n)}`,
      'default',
      THE_TEST_OFFICES_OWNER.id,
      '2026-11-01 12:00:00',
      '2026-11-01 12:00:00',
      from,
      to,
      'feeds',
      0,
      THE_TEST_OFFICES_OWNER.id,
      'human',
      JSON.stringify(carries),
    )
}

let ordered: Built
let waited: Built
let moved: Built

beforeAll(async () => {
  db = await freshDb()
  // THE STORED ORDER IS DELIBERATELY NOT NUMERICAL. The rows must follow the store, not a sort.
  ordered = pipeline('Ordered by the store', ['01 Fit the bracket', '06 Torque the bolt', '12 Check the gap', '07 Sign it off'])

  waited = pipeline('Waits written down', ['01 Layout', '02 Cut', '03 Weld'])
  db.api.createLink({ fromId: waited.steps[0]!, toId: waited.steps[1]!, type: 'blocks', gate: { kind: 'hard' }, actor: db.api.HUMAN })
  db.api.createLink({ fromId: waited.steps[1]!, toId: waited.steps[2]!, type: 'blocks', gate: { kind: 'hard' }, actor: db.api.HUMAN })

  moved = pipeline('Data moves', ['ZED RGB-D', 'Object detection', 'Masks'])
  feeds(moved.steps[0]!, moved.steps[1]!, [{ out: 'RGB-D', in: 'image' }], 1)
  feeds(moved.steps[1]!, moved.steps[2]!, [{ out: 'masks' }], 2)

  app = await liveApp({ name: 'pipeline-order-arrows', database: db.file, workspace: 'default', viewport: { width: 1440, height: 1100 } })
  page = app.page
  await page.addInitScript(({ person }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    // The whole drawing, rather than the shorter tier a pipeline of two or more steps opens at.
    const id = decodeURIComponent(location.hash.split('/').pop() ?? '')
    if (id !== '') sessionStorage.setItem(`mole-office.here.pipelineTier.${id}`, 'full')
  }, { person: THE_TEST_OFFICES_OWNER.id })
}, 300_000)

afterAll(async () => {
  await app?.stop()
  db?.close()
}, 120_000)

interface Seen {
  names: string[]
  orderEdges: string[]
  waitEdges: string[]
  moveEdges: string[]
  orderTitles: string[]
  moveLabels: { text: string; title: string | null }[]
  gates: string[]
  legend: string
  pageWidth: number
  windowWidth: number
}

async function look(id: string, language: 'en' | 'zh', look: 'light' | 'dark', width: number): Promise<Seen> {
  await page.setViewportSize({ width, height: 1100 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&look=${look}#/pipeline/${id}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForFunction(() => document.querySelectorAll('details.px-explain').length > 0 || document.querySelector('.pf-steps') !== null, null, { timeout: 30_000 })
  await page.evaluate(() => {
    for (const fold of document.querySelectorAll('details.px-explain')) (fold as HTMLDetailsElement).open = true
  })
  await page.locator('.pf-steps').first().waitFor({ timeout: 30_000 })
  return page.evaluate(() => {
    const flow = document.querySelector('.pf') as HTMLElement
    const steps = flow.querySelector('.pf-steps') as HTMLElement
    const rows = [...steps.querySelectorAll(':scope > li.pf-step')]
    const lines = [...steps.querySelectorAll('.pf-line')]
    const edgesWith = (attribute: string): string[] => [
      ...new Set(lines.filter((line) => line.getAttribute(attribute) === '1').map((line) => line.getAttribute('data-edge') ?? '')),
    ].sort()
    const orderEdges = edgesWith('data-order')
    const moveEdges = edgesWith('data-move')
    const allEdges = [...new Set(lines.map((line) => line.getAttribute('data-edge') ?? ''))].sort()
    return {
      names: rows.map((row) => (row.querySelector('.pf-step-name')?.textContent ?? '').trim()),
      orderEdges,
      waitEdges: allEdges.filter((edge) => !orderEdges.includes(edge) && !moveEdges.includes(edge)),
      moveEdges,
      orderTitles: [...new Set(lines.filter((line) => line.getAttribute('data-order') === '1').map((line) => line.getAttribute('title') ?? ''))],
      moveLabels: [...steps.querySelectorAll('.pf-move')].map((label) => ({
        text: (label.textContent ?? '').replace(/\s+/g, ' ').trim(),
        title: label.getAttribute('title'),
      })),
      gates: [...steps.querySelectorAll('.pf-gate')].map((gate) => gate.getAttribute('data-gate') ?? ''),
      legend: (flow.querySelector('.pf-legend')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      pageWidth: document.documentElement.scrollWidth,
      windowWidth: document.documentElement.clientWidth,
    }
  })
}

function aWord(language: 'en' | 'zh', key: string): string {
  const word = theWordAPageDraws(language, key)
  if (word === undefined || word === '') throw new Error(`the word ${key} is not in the list`)
  return word
}

describe('a pipeline draws its own order, a stored wait, and the data a feeds link carries', () => {
  for (const language of LANGUAGES) {
    for (const lookAt of LOOKS) {
      for (const width of WIDTHS) {
        it(`${language}, ${lookAt}, at ${String(width)}: the stored order, the wait, and the data on an arrow`, async () => {
          const seenOrdered = await look(ordered.id, language, lookAt, width)
          if (KEEP) {
            await photographWithNothingOver(page, '.pf', join(SHOTS, `order-${language}-${String(width)}-${lookAt}.png`))
          }
          expect(seenOrdered.names, 'the rows are in the pipeline\'s stored order').toEqual([
            '01 Fit the bracket',
            '06 Torque the bolt',
            '12 Check the gap',
            '07 Sign it off',
          ])
          expect(seenOrdered.orderEdges, 'one order arrow from each step to the next').toHaveLength(3)
          expect(seenOrdered.orderTitles.filter((title) => title === ''), 'every order arrow has a hover word').toEqual([])
          expect(seenOrdered.orderTitles, 'every order arrow says the same hover word').toEqual([aWord(language, ORDER_HOVER)])
          expect(seenOrdered.waitEdges, 'no stored wait is drawn').toEqual([])
          expect(seenOrdered.moveEdges, 'no stored move is drawn').toEqual([])
          expect(seenOrdered.gates, 'no gate is drawn on an order arrow').toEqual([])
          expect(seenOrdered.legend, 'one legend line says the arrows follow the step order').toContain(aWord(language, ORDER_LEGEND))
          expect(seenOrdered.pageWidth, 'the page with order arrows fits the window').toBeLessThanOrEqual(seenOrdered.windowWidth + 1)

          const seenWaited = await look(waited.id, language, lookAt, width)
          if (KEEP) {
            await photographWithNothingOver(page, '.pf', join(SHOTS, `wait-${language}-${String(width)}-${lookAt}.png`))
          }
          expect(seenWaited.orderEdges, 'a stored wait means no order arrow').toEqual([])
          expect(seenWaited.waitEdges, 'the two stored waits are drawn as before').toHaveLength(2)
          expect(seenWaited.gates, 'the hard gate is drawn').toContain('hard')
          expect(seenWaited.moveEdges, 'no move is drawn').toEqual([])
          expect(seenWaited.moveLabels, 'no data label is drawn').toEqual([])
          expect(seenWaited.pageWidth, 'the page with a stored wait fits the window').toBeLessThanOrEqual(seenWaited.windowWidth + 1)

          const seenMoved = await look(moved.id, language, lookAt, width)
          if (KEEP) {
            await photographWithNothingOver(page, '.pf', join(SHOTS, `move-${language}-${String(width)}-${lookAt}.png`))
          }
          expect(seenMoved.orderEdges, 'a stored feeds link means no order arrow').toEqual([])
          expect(seenMoved.waitEdges, 'no wait is drawn').toEqual([])
          expect(seenMoved.moveEdges, 'one arrow per feeds link').toHaveLength(2)
          expect(seenMoved.moveLabels.map((label) => label.text), 'the out port, and the in port when it differs').toEqual([
            'RGB-D → image',
            'masks',
          ])
          expect(seenMoved.moveLabels.map((label) => label.title), 'the full words are on the arrow itself').toEqual([
            'RGB-D → image',
            'masks',
          ])
          expect(seenMoved.pageWidth, 'the page with a feed label fits the window').toBeLessThanOrEqual(seenMoved.windowWidth + 1)
        }, 240_000)
      }
    }
  }
})
