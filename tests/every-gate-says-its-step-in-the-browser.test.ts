// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY GATE SAYS THE STEP IT STOPS AT BY THE STEP'S NUMBER AND TITLE, IN THE BROWSER (wave 13y round 85, item 15b).
 *
 * tests/every-gate-says-its-step-by-number-and-title.test.ts holds every place that can be drawn without a browser.
 * Two places of the plan are drawn only after a press, and this file holds them: the panel a press on a card opens
 * (`PlanDetail` in src/web/components/graph/PlanGraph.tsx), and the label on each line the pressed card touches
 * (`LineLabel`). It also holds the pipeline page's list at 390, where a step card's "waits on" fact and the walls are
 * printed, so the pictures show what a person reads.
 *
 * MADE-UP RECORDS, filed by the test office's person: a pipeline of four steps, and another pipeline that lists the
 * fourth step and a block of its own; a problem holding the first pipeline up only as far as its third step; three
 * waits between the steps, at the third step, at the other pipeline's block, and at a stage in words; and a goal three
 * of the steps relate to, so the plan of the week draws them.
 *
 * A WALL AT THE OTHER PIPELINE'S BLOCK IS NOT MADE HERE, because the link door refuses it: a partial gate on a pipeline
 * stops only at a step of that pipeline (`resolveGateStage` in src/server/lib/records.ts). A wait into a step may stop
 * at a block of any pipeline that lists the step, so a wait is what this file draws such a block with. The wall's
 * sentence for one, from links stored before that refusal, is held by the other file.
 *
 * MUTATIONS are of src/web/lib/gate-stage.ts, as in the other file: it names no stage, and both cases fail, because
 * the ids are drawn; it draws a block of another pipeline as stored, and the pipeline case fails and the plan's does
 * not.
 *
 * With W13Y_GATE_SHOTS set to a folder, it photographs the pipeline's list and the plan, with the first step pressed,
 * at 1440, 990, 660 and 390 in both themes, under the made-up label. The pipeline page draws the list itself only at
 * 390, so at the other widths the picture is taken after a press on the list. A step card's facts are in its fold, and
 * the folds that hold them are opened first. The plan draws its own list where it is narrow, and the picture is taken
 * of that list.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { gateLabel } from '../src/shared/work.ts'

const STEPS = ['Take the reel out', 'Clean the reel', 'Weigh the reel', 'Put the reel back']
const SHOTS = process.env.W13Y_GATE_SHOTS
const LABEL = 'Made-up data — a test office with two pipelines and one goal, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

describe('every gate in the browser', () => {
  let app: LiveApp
  let pipelineId = ''
  const blockIds: string[] = []
  let otherBlockId = ''

  const post = async (path: string, body: unknown): Promise<{ record: { id: string } }> => {
    const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
    const text = await reply.text()
    expect(reply.ok, `POST ${path}: ${text}`).toBe(true)
    return JSON.parse(text) as { record: { id: string } }
  }
  const partial = (upTo: string) => ({ kind: 'partial' as const, upTo })

  beforeAll(async () => {
    app = await liveApp({ name: 'every-gate-in-the-browser', viewport: { width: 1440, height: 1000 } })
    pipelineId = (await post('/api/records', { kind: 'pipeline', title: 'Store the reel', data: { blockIds: [] } })).record.id
    for (const name of STEPS) blockIds.push((await post(`/api/records/${pipelineId}/blocks`, { name, state: 'todo' })).record.id)
    // Several pipelines may list one block (checkBlockIds in src/server/lib/records/pipeline-blocks.ts), so the other one lists step 4.
    const other = (await post('/api/records', { kind: 'pipeline', title: 'Check the scales', data: { blockIds: [blockIds[3]] } })).record.id
    otherBlockId = (await post(`/api/records/${other}/blocks`, { name: 'Zero the scales', state: 'todo' })).record.id

    const scales = (await post('/api/records', { kind: 'problem', title: 'The scales are out', data: { state: 'open' } })).record.id
    await post('/api/links', { fromId: scales, toId: pipelineId, type: 'blocks', gate: partial(blockIds[2]!) })
    await post('/api/links', { fromId: blockIds[0], toId: blockIds[3], type: 'blocks', gate: partial(blockIds[2]!) })
    await post('/api/links', { fromId: blockIds[1], toId: blockIds[3], type: 'blocks', gate: partial(otherBlockId) })
    await post('/api/links', { fromId: blockIds[1], toId: blockIds[2], type: 'blocks', gate: partial('the reel is dry') })

    const goal = (
      await post('/api/records', {
        kind: 'goal',
        title: 'Keep the reel safe',
        data: { horizon: 'short', what: 'The reel is stored dry and weighed.', owner: THE_TEST_OFFICES_OWNER.id, state: 'open' },
      })
    ).record.id
    for (const at of [0, 2, 3]) await post('/api/links', { fromId: blockIds[at], toId: goal, type: 'relates_to' })
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** True when the words hold the id of any block made here. */
  const holdsABlockId = (words: string): boolean => [...blockIds, otherBlockId].some((id) => words.includes(id))

  /** A window of its own on one page, in one theme and at one width. */
  async function open(hash: string, theme: 'light' | 'dark', width: number) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#${hash}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    return { context, page }
  }

  /** The pipeline's list, with its walls and its step cards drawn. */
  async function onThePipeline(theme: 'light' | 'dark', width: number) {
    const opened = await open(`/pipeline/${pipelineId}`, theme, width)
    const { page } = opened
    await page.locator('.gx-stage').first().waitFor({ timeout: 30_000 })
    if ((await page.locator('.gx-walls').count()) === 0) await page.locator('button', { hasText: /^List$/ }).first().click()
    await page.locator('.gx-wall-words').first().waitFor({ timeout: 30_000 })
    return opened
  }

  /** The plan of this week, with the first step pressed where the plan draws cards, and its own list where it does not. */
  async function onThePlan(theme: 'light' | 'dark', width: number) {
    const opened = await open('/horizons', theme, width)
    const { page } = opened
    await page.locator('.pg-row-gate, .pg-node').first().waitFor({ timeout: 60_000 })
    // WHERE THE PLAN DRAWS CARDS, the first step's card is pressed by its name, and a card missing from them fails.
    // The labels of the card's lines are drawn after its panel. The panel takes room, so the plan lays the group out
    // again, and it draws no labels while it does: the labels are read once two readings half a second apart agree.
    if ((await page.locator('.pg-node').count()) > 0) {
      await page.locator(`.pg-node[data-record-id="${blockIds[0]}"] button.gx-card-title`).click({ timeout: 30_000 })
      await page.locator('.pg-detail').first().waitFor({ timeout: 30_000 })
      let before = ''
      await expect
        .poll(
          async () => {
            const now = JSON.stringify(await textsOf(page, '.pg-line-label'))
            const settled = now !== '[]' && now === before
            before = now
            return settled
          },
          { timeout: 30_000, interval: 500 },
        )
        .toBe(true)
    }
    return opened
  }

  function textsOf(page: Page, selector: string) {
    return page.locator(selector).evaluateAll((all) => all.map((one) => (one.textContent ?? '').replace(/\s+/g, ' ').trim()))
  }

  it("at 1440, says the step in the plan's panel and on the pressed card's lines by its title and never by its id", async () => {
    const { context, page } = await onThePlan('light', 1440)
    try {
      const panel = await textsOf(page, '.pg-detail .pg-row-gate')
      const labels = await textsOf(page, '.pg-line-label')
      const drawing = (await page.locator('.hz-drawing').first().innerText()).replace(/\s+/g, ' ').slice(0, 800)
      const said = `${[...panel, ...labels].join(' | ')} — the drawing said: ${drawing}`
      expect(panel, said).toContain(gateLabel(partial(STEPS[2]!)))
      expect(labels.some((label) => label.endsWith(`· ${gateLabel(partial(STEPS[2]!))}`)), said).toBe(true)
      expect([...panel, ...labels].filter(holdsABlockId), 'the id of a block is drawn').toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it("at 390, says each wait by its step's number and title, and a block of another pipeline in words", async () => {
    const { context, page } = await onThePipeline('light', 390)
    try {
      const facts = await textsOf(page, '.gx-fact')
      const said = facts.join(' | ')
      expect(facts.some((fact) => fact.includes(gateLabel(partial(`03 ${STEPS[2]}`)))), said).toBe(true)
      expect(facts.some((fact) => fact.includes(gateLabel(partial('a step that is not in this pipeline')))), said).toBe(true)
      const all = await page.locator('.gx-walls, .gx-facts').evaluateAll((every) => every.map((one) => one.textContent ?? ''))
      expect(all.filter(holdsABlockId), 'the id of a block is drawn').toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it.runIf(SHOTS)("photographs the pipeline's list and the plan at the four widths in both themes", async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const pipeline = await onThePipeline(theme, width)
        try {
          // A STEP CARD'S FACTS ARE IN ITS FOLD, so every fold that holds a fact is opened for the picture.
          await pipeline.page
            .locator('details.px-scan:has(.gx-fact)')
            .evaluateAll((all) => all.forEach((one) => ((one as HTMLDetailsElement).open = true)))
          await putTheMadeUpLabelIn(pipeline.page, LABEL, pipeline.page.locator('.gx-walls'), `the pipeline list, ${theme} at ${width}`)
          await pipeline.page.screenshot({ path: `${SHOTS}/pipeline-${theme}-${width}.png`, fullPage: true })
        } finally {
          await pipeline.context.close()
        }
        const plan = await onThePlan(theme, width)
        try {
          // THE WHOLE PAGE, so the label stays in the picture where the plan's list is longer than the window.
          await putTheMadeUpLabelIn(plan.page, LABEL, plan.page.locator('.hz-drawing'), `the plan, ${theme} at ${width}`)
          await plan.page.screenshot({ path: `${SHOTS}/plan-${theme}-${width}.png`, fullPage: true })
        } finally {
          await plan.context.close()
        }
      }
    }
  }, 900_000)
})
