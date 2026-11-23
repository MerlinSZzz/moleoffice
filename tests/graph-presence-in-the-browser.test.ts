// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PRESENCE IS READ FOR THE CARDS ON SCREEN, AND THE PROOF IS THE REQUEST THE PAGE MAKES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS CLAIM NEEDS A BROWSER AND CANNOT BE MADE ANYWHERE ELSE
 * ---------------------------------------------------------------------------------------
 *
 * Round ten wave 11's step 10: *presence is computed for the nodes on screen, not for a whole
 * project on every draw*. A read that took the drawing's ids and quietly answered about the project
 * looks identical from every other angle — same marks on the same cards, same everything — and only
 * a project with more records than the drawing has cards tells the two apart.
 *
 * So this file writes a project with SIX records and draws a pipeline holding THREE of them, watches
 * the request the page actually sends, and asserts the ids in it are the drawing's own three and
 * not the project's six. The plan's mutation for this row is *call it for the whole project*, and
 * that mutation reds the first test below.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHAT A PERSON THEN SEES
 * ---------------------------------------------------------------------------------------
 *
 * The second half opens the same drawing and reads the presence marker off the live page, because a
 * read that runs and a card that draws are two different claims and the wave that is being closed
 * shipped four halves with no door.
 *
 * ---------------------------------------------------------------------------------------
 * THE MARKER IS READ ON THE MODULES DRAWING SINCE 15 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes now, and a lanes card draws no presence marker. The
 * modules drawing still draws the cards that do. So the same work domain is about a module as
 * well, that module is linked to a second one so that the modules drawing does not fold it away,
 * and the marker case opens the modules drawing. The request case still reads the pipeline's page.
 *
 * A MUTATION THAT TURNS IT RED: make `PresenceRow` in src/web/components/graph/Presence.tsx return
 * null for every card. No card draws a marker, and the marker case goes red.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE WORDS ARE READ ON THE PIPELINE'S OWN PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The lanes mark no card, so the pipeline's page says in its words who is working on its steps.
 * The words case opens that page itself, rather than reading whatever page the case before it left
 * open, and waits for the sentence with a bound, because the sentence comes only after the read answers.
 *
 * A MUTATION THAT TURNS IT RED: in `whatADrawingWithNoMarksSays` in
 * src/web/components/graph/restrictions-and-presence.ts, push nothing for the records with a work
 * domain. The page says nothing about who is working, and the words case goes red.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ARE IN THE DEVELOPER VIEW, SINCE 16 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The decision of that day, which the secretary filed from the owner's words, keeps the page's body for what a reader
 * needs to trust the
 * page, and moves the drawing's other sentences to the developer view only. The sentence naming the
 * records with a work domain is one of those, so the words case reads it in the developer section
 * (tests/a-pipeline-page-in-the-developer-view.ts), named by its key, drawingWithNoMarks.workDomain.
 * It then opens the page in the normal view, waits for the presence read's reply, and checks that
 * the sentence is not on the page there.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { DEVELOPER, theDeveloperLines } from './a-pipeline-page-in-the-developer-view.ts'

let app: LiveApp
let page: Page
let pipelineId = ''
let blockIds: string[] = []
/** Records this file files that are NOT on the drawing. If they appear in the request, it is wrong. */
let offDrawing: string[] = []
let agentId = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

beforeAll(async () => {
  app = await liveApp({ name: 'graph-presence', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const pipeline = await post('/api/records', {
    kind: 'pipeline',
    title: 'Wrist calibration sweep',
    summary: 'Does the wrist camera hold its calibration across a working day?',
    data: { blockIds: [] },
  })
  pipelineId = pipeline.record.id
  for (const name of ['Collect boards', 'Solve the intrinsics']) {
    const block = await post(`/api/records/${pipelineId}/blocks`, { name, state: 'doing' })
    blockIds.push(block.record.id)
  }

  // THREE RECORDS THAT ARE NOT ON THIS DRAWING. A read that answered about the project would name
  // these in its request, and there is no other way to tell that apart from a correct read.
  offDrawing = []
  for (const title of ['Bench rig wiring', 'Tray clamp release timing', 'Old handover notes']) {
    const other = await post('/api/records', { kind: 'module', title, data: { state: 'active' } })
    offDrawing.push(other.record.id)
  }

  // THE DURABLE AGENT THE WORK BELONGS TO. A work domain refuses to name anything else, and the
  // refusal is right: an overlap found next week has to be tellable to somebody, and a session that
  // has died is not somebody.
  const agent = await post('/api/records', {
    kind: 'agent',
    title: 'Perception',
    data: { handle: 'perception', state: 'active', runtime: 'claude-code' },
  })
  agentId = agent.record.id

  // SOMEBODY WORKING ON THE FIRST BLOCK. A work domain, `about` that block, whose last sign of work
  // is the revision this create just wrote — so its age is seconds and its presence is `live`.
  const domain = await post('/api/records', {
    kind: 'work_domain',
    title: 'Wrist intrinsics scope',
    data: {
      objective: 'Solve and check the wrist intrinsics.',
      agent: agentId,
      writes: ['src/perception/intrinsics.py'],
    },
  })
  await post('/api/links', { fromId: domain.record.id, toId: blockIds[0], type: 'about' })

  // TWO LINKED MODULES, and the same work domain about the first of them. The modules drawing folds
  // away a module linked to no other module, so the second is there to keep the first drawn.
  const modules: string[] = []
  for (const title of ['Wrist camera', 'Calibration board']) {
    const made = await post('/api/records', { kind: 'module', title, data: { state: 'active' } })
    modules.push(made.record.id)
  }
  await post('/api/links', { fromId: modules[0], toId: modules[1], type: 'relates_to' })
  await post('/api/links', { fromId: domain.record.id, toId: modules[0], type: 'about' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Every presence request the page sends while it draws this route, in the order it sent them. */
async function presenceRequestsFor(route: string): Promise<string[]> {
  const seen: string[] = []
  const watch = (url: string): void => {
    if (url.includes('/api/work-domains/presence')) seen.push(url)
  }
  page.on('request', (req) => {
    watch(req.url())
  })
  try {
    await page.goto(`${app.site}/${route}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForTimeout(1500)
  } finally {
    page.removeAllListeners('request')
  }
  return seen
}

describe('the drawing asks about the cards on screen', () => {
  it('names the drawing’s own records in the request and none of the project’s others', async () => {
    const requests = await presenceRequestsFor(`#/pipeline/${pipelineId}`)
    expect(requests.length, 'the drawing never asked who is working on anything').toBeGreaterThan(0)
    const asked = new Set(
      requests.flatMap((url) => decodeURIComponent(new URL(url).searchParams.get('records') ?? '').split(',')),
    )
    for (const id of blockIds) {
      expect(asked.has(id), `the drawing did not ask about its own block ${id}`).toBe(true)
    }
    for (const id of offDrawing) {
      expect(
        asked.has(id),
        `the drawing asked about ${id}, which is not on it — the read is over the project, not the cards on screen`,
      ).toBe(false)
    }
  }, 120_000)
})

describe('what a person sees on the drawing', () => {
  it('draws a presence marker on the card somebody is working on, and on no other card', async () => {
    await page.goto(`${app.site}/#/pipeline/drawing`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.gx-here', { timeout: 30_000 })
    const drawn = await page.evaluate(() =>
      [...document.querySelectorAll('.gx-here')].map((one) => ({
        presence: one.getAttribute('data-presence'),
        stage: one.getAttribute('data-stage'),
        title: one.getAttribute('title') ?? '',
      })),
    )
    expect(drawn.length, 'more than one card carried a presence marker for one work domain').toBe(1)
    // TWO DIMENSIONS ON THE LIVE PAGE, not only in a rendered string.
    expect(drawn[0]!.presence).toBe('live')
    expect(drawn[0]!.stage).toBe('filed')
    expect(drawn[0]!.title).toContain('Perception')
  }, 120_000)

  it('says in words, in the developer view, that it read who is working, so an unread drawing cannot look like an empty one', async () => {
    // ITS OWN PAGE, the pipeline's lanes, which mark no card and so say it in words. The sentence comes
    // after the read answers, so it is waited for, and only for so long. Since 16 November 2026 it is
    // said in the developer view only.
    await page.goto(`${app.site}/?mode=inspect#/pipeline/${pipelineId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('[data-drawing="lanes"]', { timeout: 30_000 })
    const sentence = sayInEnglish('drawingWithNoMarks.workDomain', { n: 1, titles: '“Collect boards”' })
    await expect
      .poll(async () => (await theDeveloperLines(page)).filter((line) => line.words.includes(sentence)), {
        timeout: 30_000,
        message: 'the developer view says nothing about who is working on its steps, so a failed read reads as nobody here',
      })
      .toHaveLength(1)
    const [line] = (await theDeveloperLines(page)).filter((one) => one.words.includes(sentence))
    expect(line?.key, 'the line names the sentence by its key').toBe('drawingWithNoMarks.workDomain')

    // The normal view, once the presence read has answered and the page has drawn its answer.
    const read = page.waitForResponse((reply) => reply.url().includes('/api/work-domains/presence?'), { timeout: 30_000 })
    await page.goto(`${app.site}/?load=normal#/pipeline/${pipelineId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('[data-drawing="lanes"]', { timeout: 30_000 })
    expect((await read).ok(), 'the presence read answered').toBe(true)
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))))
    expect(await page.locator('body').innerText(), 'the normal view does not say who is working on its steps').not.toContain(sentence)
    expect(await page.locator(DEVELOPER).count(), 'the normal view draws no developer section').toBe(0)
  }, 120_000)
})
