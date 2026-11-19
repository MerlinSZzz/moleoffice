// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE FAILED READ OF THE COLLECTING REVIEWS IS ONE LINE IN THE STRIP AT THE FOOT, NOT FOUR.
 *
 * Wave 13x round 24, problem 2bLeFm_iwIKV. The frame's ring, the sidebar's Reviews control, the review column and the
 * question asked on leaving a page each drew the list of collecting reviews through a `useAsync` of their own. They
 * shared the read, but each hook has its own slot on the strip, so one read that failed drew "A newer read failed." four
 * times, with the same words: measured on 839cbaf24, 4 lines with the column shut and 4 with it open.
 *
 * The choice of message OAk_UzC4xd4Y: the four share one read slot inside ReviewBar.tsx, so one failure is one line.
 * The strip itself (src/web/components/ReReadStrip.tsx) is not changed.
 *
 * The failed read is made by the test: the browser's requests for the list are refused while a focus looks again.
 * Everything is made up: the notes and the comment, in a Mole Office of the test's own.
 *
 * WHAT MAKES IT FAIL: any of the four drawing the list through a read slot of its own, in
 * src/web/components/agent/ReviewBar.tsx. Each one adds a line.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_LIST = '**/api/reviews?state=collecting*'

let app: LiveApp

async function ask<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = await fetch(app.api + path, {
    method,
    headers: body === undefined ? AS_THE_PERSON : { ...AS_THE_PERSON, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A made-up note, by its id. */
async function aNote(title: string): Promise<string> {
  return (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'note', title, data: { body: 'Made up for this test.' } })).record.id
}

/** A review started on a note by a call to the server, holding one made-up comment. Answers the review's id. */
async function aReviewStartedElsewhere(on: string): Promise<string> {
  const entry = { target: { kind: 'record', recordId: on, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry })).review.id
  await ask('POST', '/api/records', { kind: 'message', title: 'Made-up comment', data: { body: 'A made-up comment, written by the test.', target: entry } })
  return review
}

/** Opens a note as a new load of the page, and waits until the list of collecting reviews has been read. */
async function openFresh(note: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${note}`)
  const read = app.page.waitForResponse((reply) => reply.url().includes('/api/reviews?state=collecting'), { timeout: 30_000 })
  await app.page.reload()
  await read
  await waitForThePage(app.page)
}

/** Opens the column with the sidebar's Reviews control, then the one review listed in it. */
async function openTheReviewInTheColumn(): Promise<void> {
  const press = app.page.locator('.px-review-switch')
  if ((await press.getAttribute('aria-pressed')) !== 'true') await press.click()
  await app.page.locator('.px-pane').waitFor({ timeout: 20_000 })
  await app.page.locator('.px-pane .px-rev-go').first().click({ timeout: 20_000 })
  await app.page.locator('.px-pane [data-part="your-review"]').waitFor({ timeout: 20_000 })
}

async function shutTheColumn(): Promise<void> {
  const press = app.page.locator('.px-review-switch')
  if ((await press.getAttribute('aria-pressed')) === 'true') await press.click()
  await app.page.locator('.px-pane').waitFor({ state: 'detached', timeout: 20_000 })
}

async function focus(): Promise<void> {
  await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
}

/** The lines the strip at the foot draws now, each as the words it says. */
async function theStripsLines(): Promise<string[]> {
  return app.page.locator('.px-reread .px-error').allTextContents()
}

/** Waits until the strip has drawn at least one line and has not changed for a second, and answers its lines. */
async function theStripOnceSettled(): Promise<string[]> {
  let last = await theStripsLines()
  let steadySince = Date.now()
  const until = Date.now() + 10_000
  while (Date.now() < until) {
    await app.page.waitForTimeout(250)
    const now = await theStripsLines()
    if (JSON.stringify(now) !== JSON.stringify(last)) {
      last = now
      steadySince = Date.now()
    } else if (now.length > 0 && Date.now() - steadySince >= 1_000) break
  }
  return last
}

/** Waits up to 10 s for the strip to draw no line, and answers its lines then. */
async function theStripOnceEmpty(): Promise<string[]> {
  let now = await theStripsLines()
  const until = Date.now() + 10_000
  while (Date.now() < until && now.length > 0) {
    await app.page.waitForTimeout(250)
    now = await theStripsLines()
  }
  return now
}

/** Refuses the list of collecting reviews while one focus looks again, and answers the strip's lines once settled. */
async function oneFailedLook(): Promise<string[]> {
  await app.page.route(THE_LIST, (route) => route.abort('failed'))
  try {
    await focus()
    return await theStripOnceSettled()
  } finally {
    await app.page.unroute(THE_LIST)
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'one-failed-read-one-line', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await app.page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('one read of the collecting reviews that fails', () => {
  it('draws one line with the column shut, and one with a review open in it, and none once the read answers again', async () => {
    const here = await aNote('Made-up glaze log, stood on')
    const elsewhere = await aNote('Made-up shelf log, reviewed elsewhere')
    const review = await aReviewStartedElsewhere(elsewhere)
    try {
      await openFresh(here)
      expect(await theStripsLines(), 'nothing has failed yet').toEqual([])

      const shut = await oneFailedLook()
      expect(shut.length, `the column shut: ${JSON.stringify(shut)}`).toBe(1)
      expect(shut[0], 'the line says a newer read failed').toContain(en['frameFiles.reread.failed'])
      await focus()
      expect(await theStripOnceEmpty(), 'the read answered again').toEqual([])

      await openTheReviewInTheColumn()
      const open = await oneFailedLook()
      expect(open.length, `a review open in the column: ${JSON.stringify(open)}`).toBe(1)
      await focus()
      expect(await theStripOnceEmpty(), 'the read answered again').toEqual([])
    } finally {
      await app.page.unroute(THE_LIST).catch(() => undefined)
      await ask('POST', `/api/reviews/${review}/abandon`)
      await shutTheColumn()
    }
  }, 180_000)
})
