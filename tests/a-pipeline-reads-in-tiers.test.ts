// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE'S THREE READING TIERS BEFORE FULL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE DECISION SAYS
 * ---------------------------------------------------------------------------------------
 *
 * Three tiers are built before full:
 *
 *   tier 1  the title only
 *   tier 2  the block titles
 *   tier 3  the block titles with one line each — the block's own summary where a block has one,
 *           otherwise the first sentence of what was measured on it
 *   tier 4  full — the drawing exactly as it was before any tier existed
 *
 * Only tiers that have words are offered, and the choice is remembered per record. The control
 * stands on the pipeline page, above the fold whose body the tier changes.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THESE TESTS RUN
 * ---------------------------------------------------------------------------------------
 *
 * The static cases render the tier body to static markup with react-dom/server and compare text,
 * the way tests/pipeline-flow.test.ts does — the runner's environment is node, with a minimal
 * window stand-in for the storage the page reads. The remembered choice is proved by a browser in
 * the file's last describe: sessionStorage on the page, a real reload, and the tier still standing
 * after it.
 *
 * THE CONTROL-RUN AND MUTATION OBLIGATION: a mutation of tier 3 into showing TWO lines per block
 * — the summary and the measured text both — turns the tier-3 and the "nothing more" case red;
 * restoring the file byte for byte restores green.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { PipelineBlockView } from '../src/shared/blocks.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/PipelinePage.tsx')
type Flow = typeof import('../src/web/components/PipelineFlow.tsx')
let page: Page
let flow: Flow

const STORE = new Map<string, string>()
const storage = {
  getItem: (k: string) => STORE.get(k) ?? null,
  setItem: (k: string, v: string) => void STORE.set(k, v),
  removeItem: (k: string) => void STORE.delete(k),
}

beforeAll(async () => {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  page = await import('../src/web/pages/PipelinePage.tsx')
  flow = await import('../src/web/components/PipelineFlow.tsx')
})

const AT = '2026-08-01 09:00:00'

function block(id: string, name: string, body: { summary?: string; measured?: string } = {}): PanelRecord {
  return {
    id,
    kind: 'block',
    title: `Test › ${name}`,
    summary: body.summary ?? null,
    data: { state: 'todo', ...(body.measured === undefined ? {} : { measured: body.measured }) },
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
  } as unknown as PanelRecord
}

function pipelineOf(
  steps: Record<string, { name: string; summary?: string; measured?: string }>,
  title = 'The trial',
  id = 'p1',
): PanelRecord {
  return {
    id,
    kind: 'pipeline',
    title,
    summary: null,
    data: { blockIds: Object.keys(steps) },
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
  } as unknown as PanelRecord
}

/**
 * A three-block fixture: one block has only a summary, one has only what was measured on it, one
 * has neither — so tier 3's two routes to a line and its honest absence are all in one drawing.
 */
const THREE = {
  b1: { name: 'Sense the pot', summary: 'Reads the camera two hundred times a second.' },
  b2: { name: 'Drive the jaws', measured: 'p50 42 ms · p95 61 ms · n=400' },
  b3: { name: 'Let go' },
} as const

function readingOf(steps: Record<string, { name: string; summary?: string; measured?: string }>) {
  const pipeline = pipelineOf(steps)
  const blocks = Object.entries(steps).map(([id, body]) => block(id, body.name, body))
  return flow.readPipeline(pipeline, [pipeline, ...blocks], [])
}

import type { StepAttention } from '../src/web/components/PipelineFlow.tsx'

const render = (
  reading: NonNullable<ReturnType<typeof readingOf>>,
  tier: Parameters<typeof page.PipelineTierBody>[0]['tier'],
): string =>
  renderToStaticMarkup(h(page.PipelineTierBody, { reading, tier, attention: new Map<string, StepAttention>() }))

describe('the four tiers', () => {
  // Read lazy, inside the cases: the modules load in beforeAll, and a describe body runs before that.
  const reading = () => readingOf(THREE)

  it('tier 1 draws the title and nothing else', () => {
    const html = render(reading(), 'title')
    expect(html).toContain('The trial')
    expect(html).not.toContain('Sense the pot')
    expect(html).not.toContain('Reads the camera')
    expect(html).not.toContain('p50 42 ms')
  })

  it('tier 2 draws the three block titles and no body text', () => {
    const html = render(reading(), 'blockTitles')
    for (const name of ['Sense the pot', 'Drive the jaws', 'Let go']) expect(html).toContain(name)
    expect(html).not.toContain('Reads the camera two hundred times a second')
    expect(html).not.toContain('p50 42 ms')
  })

  it('tier 3 draws each block title with exactly its one line, and nothing more', () => {
    const html = render(reading(), 'blockTitlesWithLine')
    for (const name of ['Sense the pot', 'Drive the jaws', 'Let go']) expect(html).toContain(name)
    // THE BLOCK'S OWN SUMMARY where one is written.
    expect(html).toContain('Reads the camera two hundred times a second.')
    // THE FIRST SENTENCE OF THE MEASURED WORDS where there is no summary.
    expect(html).toContain('p50 42 ms · p95 61 ms · n=400')
    // AND NOTHING MORE AT THAT TIER: no grid, no carriers, no per-step prose.
    expect(html).not.toContain('pf-grid')
    expect(html).not.toContain('carried by')
    expect(html).not.toContain('Nothing has been measured on this step')
    // THE BLOCK WITH NEITHER summary NOR measured DRAWS ITS TITLE AND NO LINE: two blocks carry
    // a line, out of three blocks, so two lines and not three.
    const events = html.match(/pp-tiers-line/g) ?? []
    expect(events.length, `the lines under the titles: ${html}`).toBe(2)
  })

  it('tier 4 is the drawing as it already is, changed by nothing', () => {
    const html = render(reading(), 'full')
    expect(html).toContain('pf-grid')
    expect(html).toContain('Sense the pot')
  })
})

describe('which tiers are offered, and where the page opens', () => {
  it('a pipeline with no blocks offers the title and full, and nothing between', () => {
    const empty = pipelineOf({})
    const reading = flow.readPipeline(empty, [empty], [])
    expect(page.tiersOffered(reading)).toEqual(['title', 'full'])
    expect(page.defaultPipelineTier(reading)).toBe('full')
  })

  it('blocks without a line leave tier 3 unoffered, and a pipeline with two blocks opens at tier 2', () => {
    const noLines = { a: { name: 'A' }, b: { name: 'B' } }
    const reading = readingOf(noLines)
    expect(page.tiersOffered(reading)).toEqual(['title', 'blockTitles', 'full'])
    expect(page.defaultPipelineTier(reading)).toBe('blockTitles')
  })

  it('a record with fewer than two blocks opens at full', () => {
    const one = { a: { name: 'Only one', summary: 'Its line.' } }
    expect(page.defaultPipelineTier(readingOf(one))).toBe('full')
  })

  it('the one line is the summary where there is one and the first sentence where there is not', () => {
    const reading = readingOf(THREE)
    const step = (id: string) => reading.steps.find((s: PipelineBlockView) => s.id === id) as PipelineBlockView
    expect(page.oneLineOfBlock(step('b1'))).toBe('Reads the camera two hundred times a second.')
    expect(page.oneLineOfBlock(step('b2'))).toBe('p50 42 ms · p95 61 ms · n=400')
    expect(page.oneLineOfBlock(step('b3'))).toBe(null)
  })

  it('the cut is a whole first sentence, and only a first sentence', () => {
    expect(page.firstSentence('Wound it twice and measured the pull. Then the jig came loose.')).toBe(
      'Wound it twice and measured the pull.',
    )
    expect(page.firstSentence('p50 42 ms · p95 61 ms · n=400')).toBe('p50 42 ms · p95 61 ms · n=400')
  })
})

// ============================================================================ remembered across a reload

/**
 * THE TIER IS REMEMBERED ACROSS A RELOAD, the way the report page remembers its level.
 *
 * A real browser, a real record, a real press on More, a real reload — the memory is
 * sessionStorage keyed `mole-office.here.pipelineTier.<record id>`, so only a reload with the
 * same session storage can prove it. Control run first, then the mutation: revert the press's
 * write of the tier into storage and the case goes red.
 */
describe('the tier is remembered, in a browser', () => {
  const HEADERS = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  }

  it('keeps the reader’s choice across a reload', async () => {
    const { liveApp, waitForThePage } = await import('./helpers.ts')
    const app = await liveApp({ name: 'pipeline-tiers-memory', viewport: { width: 1440, height: 1000 } })
    try {
      const post = async (path: string, body: unknown): Promise<{ record: { id: string } }> => {
        const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
        if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
        return (await res.json()) as { record: { id: string } }
      }
      const pipeline = await post('/api/records', {
        kind: 'pipeline',
        title: 'Tiers trial',
        data: { blockIds: [] },
      })
      const id = pipeline.record.id
      for (const name of ['Sense the pot', 'Drive the jaws', 'Let go']) await post(`/api/records/${id}/blocks`, { name, state: 'done', measured: 'Measured once, with a reason.' })

      const at = `${app.site}/#/pipeline/${id}`
      const open = async (): Promise<void> => {
        await app.page.goto(at, { timeout: 60_000 })
        await app.page.reload({ timeout: 60_000 })
        await waitForThePage(app.page, 60_000)
        // THE FOLD IS CLOSED AT REST. Open the one whose body the tier changes.
        await app.page.getByText('the steps × modules grid for this pipeline').click()
        await app.page.waitForSelector('.pp-tiers', { timeout: 60_000 })
      }
      await open()
      // THE DEFAULT, AND THE REAL COUNTS BESIDE LESS AND MORE.
      await app.page.waitForFunction(() => document.querySelector('.pp-tier-word')?.textContent === 'Block titles')
      // THE PRESS THAT RECORDS A CHOICE.
      await app.page.getByRole('button', { name: 'More', exact: true }).click()
      await app.page.waitForFunction(() => document.querySelector('.pp-tier-word')?.textContent === 'Block titles and a line')
      await app.page.waitForSelector('.pp-tiers-line', { timeout: 30_000 })

      // THE RELOAD. sessionStorage survives it; the stored tier must come back with it.
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      await app.page.getByText('the steps × modules grid for this pipeline').click()
      await app.page.waitForFunction(() => document.querySelector('.pp-tier-word')?.textContent === 'Block titles and a line')
      await app.page.waitForSelector('.pp-tiers-line', { timeout: 30_000 })

      // AND THE ADDRESS STILL NAMES THAT PIPELINE, so the remembered choice is that record's.
      expect(new URL(app.page.url()).hash).toBe(`#/pipeline/${id}`)
    } finally {
      await app?.stop()
    }
  }, 300_000)
})

afterAll(() => {
  // The window stand-in stays as module state; nothing after this file's own cases reads it.
  void STORE
})
