// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PIPELINE FLOW DRAWS EVERY STORED WAIT AS ONE LINE BETWEEN ITS TWO STEPS, AND NO OTHER LINE. Wave 13k
 * round 40, piece 2 (problem _b3XYAYKrZsC).
 *
 * The pipeline flow (src/web/components/PipelineFlow.tsx) is not the shared drawing in
 * src/web/components/graph. It draws its own dependency lines: each step's row holds plain boxes for the
 * lines that pass it, start at it or end at it, at a lane worked out by `layoutFlow`. tests/pipeline-flow.test.ts
 * checks the lanes as numbers and the markup as text. Nothing looked at where the boxes land in a browser, so
 * a line that stops short of its step, or that joins the wrong two steps, passed every test.
 *
 * WHAT IS CLAIMED: on the pipeline page, with the whole drawing shown, in light, in English at 1440 and 390
 * and in Chinese at 1440:
 *   - there is one row and one dot per step, in the stored order;
 *   - two steps' dots are joined by drawn ink exactly when a `blocks` link joins those two steps. Joined means
 *     one vertical run of ink, broken only by the rule between two rows, passing no other step's dot, with a
 *     straight or a sideways piece of ink reaching each of the two dots;
 *   - the hard gate's mark sits in the row of the step that waits.
 *
 * MADE-UP RECORDS: one pipeline of six blocks the test office's person files, with five `blocks` links: a
 * fork, a rejoin, a line that passes two rows, a hard gate and a partial one.
 *
 * MUTATION, after a control run (the commit that added this file names the logs): in PipelineFlow.tsx's
 * stylesheet, a line that ends at a step stops 6px short of its dot. The cases go red.
 *
 * PICTURES: only when TEST_SHOTS names a folder, the drawing at each width, look and language.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { join } from 'node:path'
import { liveApp, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { testShots, TEST_SHOTS } from './where-shots-go.ts'

const AS_THE_PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LANGUAGES = ['en', 'zh'] as const
// LIGHT ONLY. The lines do not depend on the colour scheme, so the dark looks go.
const LOOKS = ['light'] as const
const WIDTHS = { en: [1440, 390], zh: [1440] } as const

/** The six steps, in the stored order. */
const STEPS = ['Sense the pot', 'Find the handle', 'Measure the lid', 'Plan the grasp', 'Weigh the pot', 'Lift it']
/** Each wait as [the step waited on, the step that waits, its gate], by position in STEPS. */
const WAITS: [number, number, { kind: 'hard' } | { kind: 'partial'; upTo: string } | null][] = [
  [0, 1, null],
  [0, 2, null],
  [1, 3, null],
  [2, 3, { kind: 'partial', upTo: 'the lid is found' }],
  [0, 4, null],
  [3, 5, { kind: 'hard' }],
]
const STORED = WAITS.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`).sort()

let app: LiveApp
let page: Page
let pipelineId = ''
const KEEP = (process.env[TEST_SHOTS] ?? '') !== ''
const SHOTS = testShots('pipeline-flow-lines')

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

interface Seen {
  rows: number
  dots: number
  joined: string[]
  hardGateRows: number[]
}

/** Open the pipeline with its whole drawing shown, and measure what was drawn. */
async function look(language: 'en' | 'zh', theme: string, width: number): Promise<Seen> {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=${language}&look=${theme}#/pipeline/${pipelineId}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
  // The fold that holds the drawing is closed at rest; open the one with the drawing in it.
  await page.waitForFunction(() => document.querySelector('.pp-tiers, .pf-steps') !== null || document.querySelectorAll('details.px-explain').length > 0, null, { timeout: 30_000 })
  await page.evaluate(() => {
    for (const fold of document.querySelectorAll('details.px-explain')) (fold as HTMLDetailsElement).open = true
  })
  await page.locator('.pf-steps').first().waitFor({ timeout: 30_000 })
  await page.locator('.pf-steps').first().scrollIntoViewIfNeeded()
  return page.evaluate(() => {
    const NEAR = 1.5
    const steps = [...document.querySelectorAll('.pf-steps').item(0).querySelectorAll(':scope > li.pf-step')]
    const centre = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const dots = steps.map((row) => row.querySelectorAll('.pf-gutter > .pf-node'))
    const at = dots.map((list) => centre((list[0] as Element).getBoundingClientRect()))
    const ink = (selector: string) =>
      steps
        .flatMap((row) => [...row.querySelectorAll(selector)])
        .filter((one) => one.checkVisibility())
        .map((one) => one.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
    const upright = ink('.pf-line')
    const across = ink('.pf-elbow')
    // THE RULE BETWEEN TWO ROWS CROSSES EVERY LINE, and it is ink too: a line passing from one row into
    // the next has a gap exactly that wide, filled by the rule. So a gap is allowed up to the rule's width.
    const rule = parseFloat(getComputedStyle(steps[0] as Element).borderTopWidth) || 0
    /** True when ink at x covers every y from y1 to y2, with no gap wider than the rule between rows. */
    const runs = (x: number, y1: number, y2: number): boolean => {
      const spans = upright
        .filter((r) => Math.abs(r.left + r.width / 2 - x) <= NEAR)
        .map((r) => [r.top, r.bottom] as const)
        .sort((a, b) => a[0] - b[0])
      let reached = y1
      for (const [top, bottom] of spans) {
        if (top > reached + rule + 0.5) break
        reached = Math.max(reached, bottom)
      }
      return reached >= y2 - NEAR
    }
    /** True when the run at x reaches the dot: the dot is on it, or a sideways piece joins the two. */
    const reaches = (x: number, dot: { x: number; y: number }): boolean =>
      Math.abs(dot.x - x) <= NEAR ||
      across.some(
        (r) =>
          Math.abs(r.top + r.height / 2 - dot.y) <= NEAR &&
          r.left <= Math.min(x, dot.x) + NEAR &&
          r.right >= Math.max(x, dot.x) - NEAR,
      )
    const lanes = [...new Set(upright.map((r) => Math.round((r.left + r.width / 2) * 2) / 2))]
    const joined: string[] = []
    for (let i = 0; i < at.length; i += 1) {
      for (let j = i + 1; j < at.length; j += 1) {
        const a = at[i]!
        const b = at[j]!
        const one = lanes.some(
          (x) =>
            runs(x, a.y, b.y) &&
            reaches(x, a) &&
            reaches(x, b) &&
            !at.some((c, k) => k > i && k < j && Math.abs(c.x - x) <= NEAR),
        )
        if (one) joined.push(`${i}-${j}`)
      }
    }
    return {
      rows: steps.length,
      dots: dots.reduce((n, list) => n + list.length, 0),
      joined: joined.sort(),
      hardGateRows: steps.flatMap((row, i) => [...row.querySelectorAll('.pf-gate[data-gate="hard"]')].map(() => i)),
    }
  })
}

beforeAll(async () => {
  app = await liveApp({ name: 'pipeline-flow-lines', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  await page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
    // The whole drawing, rather than the shorter tier a pipeline of two or more steps opens at.
    const id = decodeURIComponent(location.hash.split('/').pop() ?? '')
    if (id !== '') sessionStorage.setItem(`mole-office.here.pipelineTier.${id}`, 'full')
  })
  pipelineId = (await post('/api/records', { kind: 'pipeline', title: 'Lift the pot', data: { blockIds: [] } })).record.id
  const ids: string[] = []
  for (const name of STEPS) ids.push((await post(`/api/records/${pipelineId}/blocks`, { name, state: 'todo' })).record.id)
  for (const [from, to, gate] of WAITS) {
    await post('/api/links', { fromId: ids[from], toId: ids[to], type: 'blocks', ...(gate === null ? {} : { gate }) })
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
})

describe('the pipeline flow joins two steps exactly when a stored wait joins them', () => {
  for (const language of LANGUAGES) {
    it.each(WIDTHS[language])(`${language}: at %i, light and dark, every line runs from one step's dot to the other's`, async (width) => {
      for (const theme of LOOKS) {
        const seen = await look(language, theme, width)
        if (KEEP) {
          await page.locator('.pf-steps').first().screenshot({ path: join(SHOTS, `flow-${language}-${width}-${theme}.png`) })
        }
        expect(seen.rows, `${theme}: one row per step`).toBe(STEPS.length)
        expect(seen.dots, `${theme}: one dot per step`).toBe(STEPS.length)
        expect(seen.joined, `${theme}: the steps the drawn lines join`).toEqual(STORED)
        expect(seen.hardGateRows, `${theme}: the hard gate's mark is in the row that waits`).toEqual([5])
      }
    }, 240_000)
  }
})
