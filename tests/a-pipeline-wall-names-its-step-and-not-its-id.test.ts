// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIPELINE'S WALL NAMES THE STEP IT STANDS AT BY ITS NUMBER AND TITLE, AND NOT BY ITS ID (wave 13y round 83).
 *
 * At 390 the pipeline page prints its drawing as a list, and the list opens with what holds the pipeline up
 * (`Wall` in src/web/components/graph/Outline.tsx). A partial gate stores the step it stops at as the id of the
 * step's block, and the wall drew that id: "only as far as XeoH1HdPx2-b until this finishes". Now the wall's call to
 * `gateWordsForReader` in src/web/components/graph/model.ts passes the step's number and title, and the wall says
 * "only as far as 03 Weigh the reel until this finishes".
 *
 * MADE-UP RECORDS: one pipeline of four blocks and one problem, filed by the test office's person, and a `blocks` link
 * from the problem to the pipeline with a partial gate at the third block.
 *
 * MUTATION, after a control run: the wall's call passes no stage. The case goes red, because the block's id is drawn.
 * tests/graph-model.test.ts holds the stage named in words and the block of another pipeline.
 *
 * With W13Y_WALL_SHOTS set to a folder, it photographs the wall at 1440, 990, 660 and 390 in both themes, under the
 * made-up label. The page draws the list itself only at 390, so at the other widths the picture is taken after a
 * press on the list.
 */
import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { gateLabel } from '../src/shared/work.ts'

const STEPS = ['Take the reel out', 'Clean the reel', 'Weigh the reel', 'Put the reel back']
const SHOTS = process.env.W13Y_WALL_SHOTS
const LABEL = 'Made-up data — a test office with one pipeline of four steps, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

describe('a pipeline wall', () => {
  let app: LiveApp
  let pipelineId = ''
  const blockIds: string[] = []

  const post = async (path: string, body: unknown): Promise<{ record: { id: string } }> => {
    const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers: AS_THE_PERSON, body: JSON.stringify(body) })
    const text = await reply.text()
    expect(reply.ok, `POST ${path}: ${text}`).toBe(true)
    return JSON.parse(text) as { record: { id: string } }
  }

  beforeAll(async () => {
    app = await liveApp({ name: 'pipeline-wall-names', viewport: { width: 390, height: 844 } })
    pipelineId = (await post('/api/records', { kind: 'pipeline', title: 'Store the reel', data: { blockIds: [] } })).record.id
    for (const name of STEPS) blockIds.push((await post(`/api/records/${pipelineId}/blocks`, { name, state: 'todo' })).record.id)
    const problem = (await post('/api/records', { kind: 'problem', title: 'The scales are out', data: { state: 'open' } })).record.id
    await post('/api/links', { fromId: problem, toId: pipelineId, type: 'blocks', gate: { kind: 'partial', upTo: blockIds[2] } })
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** A window of its own on the pipeline, in one theme and at one width, with the list and its wall drawn. */
  async function onThePipeline(theme: 'light' | 'dark', width: number, height: number) {
    const context = await app.browser.newContext({ viewport: { width, height }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#/pipeline/${pipelineId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.gx-stage').first().waitFor({ timeout: 30_000 })
    if ((await page.locator('.gx-walls').count()) === 0) await page.locator('button', { hasText: /^List$/ }).first().click()
    await page.locator('.gx-wall-words').first().waitFor({ timeout: 30_000 })
    return { context, page }
  }

  const whatTheWallsSay = (page: Page) => page.locator('.gx-walls').first().evaluate((walls) => walls.textContent ?? '')

  it('at 390, says the step’s number and title and never the id of its block', async () => {
    const { context, page } = await onThePipeline('light', 390, 844)
    try {
      const said = await whatTheWallsSay(page)
      expect(await page.locator('.gx-wall-words').first().textContent(), said).toBe(gateLabel({ kind: 'partial', upTo: `03 ${STEPS[2]}` }))
      expect(said, 'the id of the block the wall stands at is drawn').not.toContain(blockIds[2])
    } finally {
      await context.close()
    }
  }, 120_000)

  it.runIf(SHOTS)('photographs the wall at the four widths in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await onThePipeline(theme, width, width === 390 ? 844 : 1000)
        try {
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.gx-walls'), `the pipeline wall, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/wall-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
      }
    }
  }, 600_000)
})
