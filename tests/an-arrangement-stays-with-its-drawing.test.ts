// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE DRAWING'S ARRANGEMENT IS NEVER DRAWN ON ANOTHER, AND A WRITE DOES NOT BLANK THE DRAWER.
 * Problem H27sMWE8-t_u.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * `StructureView` (src/web/components/graph/StructureView.tsx) reads how a drawing was asked to be
 * shown, and keeps the last answer so that a write in the edit drawer does not blank the drawer while
 * the answer is read again. That kept answer belongs to one drawing. Drawing a second pipeline with
 * the first one's arrangement is a silent wrong answer.
 *
 * tests/graph-edit.test.ts once checked this by finding a line of text in the component's source. That
 * check passed with the rule deleted, so it was removed, and no test drove the rule after that.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS TEST DOES, IN A REAL BROWSER
 * ---------------------------------------------------------------------------------------
 *
 *   1. On pipeline A it opens the edit drawer and stores a lane for A's first step. That writes the
 *      arrangement and reads it again. It checks that the drawer is still open after the re-read, with
 *      the server's answer still on it.
 *   2. It presses pipeline B in the picker, and holds B's read of its arrangement until it has looked.
 *      While B's read is out, nothing may be drawn: the page says it is reading, and no drawer is
 *      offered. A page that drew B here could only be drawing it with A's arrangement.
 *   3. It lets B's read through and checks that B's drawer gives B's card no lane, and that B's page
 *      does not name A's lane.
 *   4. It goes back to A and checks that A's step still has its lane, and that A's page says so.
 *
 * Holding the read is not a wait. The page is looked at while the request is known to be out, then
 * the request is let go. Without the hold, a wrong drawing would last only as long as one read, and
 * the hold makes that time long enough to look at.
 *
 * ---------------------------------------------------------------------------------------
 * TWO THINGS HOLD STEP 2 TODAY, AND THE MUTATIONS SAY WHICH
 * ---------------------------------------------------------------------------------------
 *
 * App.tsx keys `TheFaultBoundary` on the address (`key={window.location.hash}`). So a press on
 * another drawing mounts the page afresh, and `StructureView` starts with no kept answer at all. The
 * scope keying inside `StructureView` is a second guard, for a view that stays mounted across a
 * change of drawing. Before this test, that second guard did not hold: the first render with the new
 * drawing still held the old drawing's answer, and `lastGood` kept it under the new drawing's name.
 *
 * Each run below was made after a control run, and each mutation was put back afterwards.
 *
 *   take the key off `TheFaultBoundary` in App.tsx, with StructureView as it was before this test
 *     → step 2 goes red: B is drawn with A's arrangement while B's read is out.
 *   take the key off, with StructureView as it is now → green: the view holds the rule itself.
 *   take the key off, and read `lastGood` without comparing its scope
 *     (`const previous = lastGood.current?.stored ?? null`) → step 2 goes red.
 *   take the key off, and treat an answer read for another drawing as this drawing's
 *     (`const here = reading`) → step 2 goes red.
 *   with the key on, never keep a last answer (`const previous = null`)
 *     → step 1 goes red: the re-read closes the form and throws away the server's answer.
 *
 * With the key on, undoing the scope keying alone leaves this test green, because the page is
 * mounted afresh. So this test alone does not catch that change while the key is on. It does catch
 * B being drawn with A's arrangement, whatever the cause.
 *
 * ---------------------------------------------------------------------------------------
 * THE TEST IS ON A PIPELINE'S LANES SINCE 15 NOVEMBER 2026, AND WRITES A LANE
 * ---------------------------------------------------------------------------------------
 *
 * A filed pipeline's page draws its lanes, and the lanes' "How this is shown" form offers only a
 * card's lane and its order: there is no direction to set. So step 1 stores a lane for A's first step
 * with "Store how this card is shown", and steps 3 and 4 read that card's lane field. The lanes list
 * no lanes of their own here, so the page says under the drawing that the stored lane places nothing,
 * and names the card and the lane. Step 3 checks that B's page does not name A's lane, and step 4
 * checks that A's page does. Step 2, the held read, is unchanged.
 *
 * The runs above were made on the canvas. The run made on the lanes, after a control run, and put
 * back afterwards:
 *
 *   with the key on, never keep a last answer (`const previous = null` in StructureView.tsx)
 *     → step 1 goes red: the re-read closes the form and throws away the server's answer.
 *
 * ---------------------------------------------------------------------------------------
 * THE LANE IS NAMED IN THE DEVELOPER VIEW, SINCE 16 NOVEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * The sentence that names the card and the stored lane that places nothing is about the stored
 * arrangement, not about the records. The decision of that day, which the secretary filed from the owner's words,
 * moves such sentences out of
 * the page's body for every reader, to the developer view only
 * (tests/a-pipeline-page-in-the-developer-view.ts). So the test opens A in the developer view, with
 * `?mode=inspect` before the hash, which stays through each press in the picker. Step 3 checks that
 * neither B's said section nor its developer section names A's lane. Step 4 checks that A's
 * developer section names it, in a line of lanesInput.oldNodeLane, and that A's said section does
 * not. Steps 1 and 2 are unchanged.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Request, Route } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { pipelineScope } from '../src/shared/presentation.ts'
import { englishWords } from '../src/shared/words/joined.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SAID, theDrawingIsDrawn } from './a-made-up-office-drawn-in-lanes.ts'
import { DEVELOPER } from './a-pipeline-page-in-the-developer-view.ts'

let app: LiveApp
let first = ''
let second = ''

const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const FIRST_TITLE = 'Wrist camera calibration'
const SECOND_TITLE = 'Gripper force sweep'
const FIRST_STEP = 'Collect boards'
const LANE = 'Optics bench'

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as { record: { id: string } }
}

async function filePipeline(title: string, blocks: readonly string[]): Promise<string> {
  const id = (await post('/api/records', { kind: 'pipeline', title, summary: `The steps of ${title}.`, data: { blockIds: [] } }))
    .record.id
  for (const name of blocks) await post(`/api/records/${id}/blocks`, { name, state: 'todo' })
  return id
}

/** True for the page's GET of one drawing's stored arrangement, and for nothing else. */
function isTheRead(request: Request, pipelineId: string): boolean {
  if (request.method() !== 'GET') return false
  const path = decodeURIComponent(new URL(request.url()).pathname)
  return path === `/api/presentation/${pipelineScope(pipelineId)}`
}

/** What the drawing, its drawer and the page's sentences under it show right now. */
async function onScreen(): Promise<{
  reading: string | null
  drawer: boolean
  lane: string | null
  said: string | null
  formOpen: boolean
  pageSays: string
  developerSays: string
}> {
  return app.page.evaluate(([saidPart, developerPart]) => {
    const drawer = document.querySelector('.gx-drawer')
    const label = [...document.querySelectorAll('.gx-drawer label.px-label')].find(
      (one) => one.textContent?.trim() === 'Which lane it belongs in',
    )
    const control = label === undefined ? null : document.getElementById(label.getAttribute('for') ?? '')
    const act = [...document.querySelectorAll('.gx-drawer button.gx-act')].find(
      (one) => one.textContent?.trim() === 'How this is shown',
    )
    return {
      reading: document.querySelector('.gx-loading')?.textContent?.trim() ?? null,
      drawer: drawer !== null,
      lane: control instanceof HTMLInputElement ? control.value : null,
      said: document.querySelector('.gx-drawer .gx-outcome-said')?.textContent?.trim() ?? null,
      formOpen: act?.getAttribute('aria-expanded') === 'true',
      pageSays: document.querySelector(saidPart)?.textContent ?? '',
      developerSays: document.querySelector(developerPart)?.textContent ?? '',
    }
  }, [SAID, DEVELOPER] as const)
}

/** Open the drawer if it is closed, then open its "How this is shown" form. */
async function openTheArrangementForm(): Promise<void> {
  if ((await app.page.locator('.gx-drawer').count()) === 0) {
    await app.page.locator('.gx button', { hasText: /^Edit$/ }).click()
  }
  await app.page.locator('.gx-drawer button.gx-act', { hasText: 'How this is shown' }).click()
  await app.page.locator('.gx-drawer').getByLabel('Which lane it belongs in', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 })
}

/** Choose the card the form arranges, by the title in its option, and wait for its stored lane to load. */
async function chooseTheCard(title: string): Promise<void> {
  const which = app.page.locator('.gx-drawer').getByLabel('Which card you are arranging', { exact: true })
  const value = await which.locator('option', { hasText: title }).first().getAttribute('value')
  if (value === null || value === '') throw new Error(`the form offers no card titled “${title}”`)
  await which.selectOption(value)
  await twoFrames()
}

/** Two animation frames, so every render a finished request started has been painted. */
async function twoFrames(): Promise<void> {
  await app.page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'an-arrangement-stays-with-its-drawing', viewport: { width: 1440, height: 1000 } })
  first = await filePipeline(FIRST_TITLE, [FIRST_STEP, 'Solve the intrinsics'])
  second = await filePipeline(SECOND_TITLE, ['Mount the load cell', 'Sweep the force'])
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the edit drawer on a pipeline drawing', () => {
  it('keeps each drawing’s arrangement to that drawing, and stays open through a write', async () => {
    const page = app.page
    await page.goto(`${app.site}/?mode=inspect#/pipeline/${first}`, { timeout: 60_000 })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await theDrawingIsDrawn(page)

    // ---- 1. a write, and the re-read after it, on A ----
    await openTheArrangementForm()
    await chooseTheCard(FIRST_STEP)
    await page.locator('.gx-drawer').getByLabel('Which lane it belongs in', { exact: true }).fill(LANE)
    const reread = page.waitForResponse((response) => isTheRead(response.request(), first), { timeout: 30_000 })
    await page.locator('.gx-drawer button', { hasText: 'Store how this card is shown' }).click()
    await reread
    await page.waitForFunction(
      () => document.querySelector('.gx-drawer-rereading') === null && document.querySelector('.gx-loading') === null,
      undefined,
      { timeout: 30_000 },
    )
    await twoFrames()
    const afterWrite = await onScreen()
    expect(afterWrite.drawer, 'the drawer closed when the arrangement was read again after the write').toBe(true)
    expect(afterWrite.formOpen, 'the form that made the write was closed by the re-read').toBe(true)
    expect(afterWrite.said, 'the server’s answer to the write was thrown away by the re-read').toBe('Saved.')
    expect(afterWrite.lane, 'A does not show the lane that was just written').toBe(LANE)

    // ---- 2. change to B, and look while B's read is held ----
    let seen: () => void = () => undefined
    const theReadIsOut = new Promise<void>((done) => {
      seen = done
    })
    let letItGo: () => void = () => undefined
    const released = new Promise<void>((done) => {
      letItGo = done
    })
    const hold = async (route: Route): Promise<void> => {
      if (!isTheRead(route.request(), second)) {
        await route.fallback()
        return
      }
      seen()
      await released
      await route.continue()
    }
    await page.route('**/api/presentation/**', hold)
    try {
      await page.locator('nav.gx-scopes a', { hasText: SECOND_TITLE }).click()
      await theReadIsOut
      await twoFrames()
      const whileReading = await onScreen()
      expect(
        whileReading.reading,
        'B was drawn before its own arrangement was read, so it was drawn with A’s arrangement',
      ).toBe('Reading how this drawing was asked to be shown.')
      expect(whileReading.drawer, 'a drawer was offered for B holding A’s arrangement').toBe(false)
    } finally {
      letItGo()
      // `wait` lets the held request finish before the handler goes, so it is not cut off.
      await page.unrouteAll({ behavior: 'wait' })
    }

    // ---- 3. B's own answer ----
    await page.waitForFunction(() => document.querySelector('.gx-loading') === null, undefined, { timeout: 30_000 })
    await openTheArrangementForm()
    const onB = await onScreen()
    expect(onB.lane, 'B’s card shows a lane that was only ever written for A’s').toBe('')
    expect(onB.pageSays, 'B’s page names the lane that was only ever written for A').not.toContain(LANE)
    expect(onB.developerSays, 'B’s developer section names the lane that was only ever written for A').not.toContain(LANE)

    // ---- 4. back to A, which still has its own ----
    const readOfA = page.waitForResponse((response) => isTheRead(response.request(), first), { timeout: 30_000 })
    await page.locator('nav.gx-scopes a', { hasText: FIRST_TITLE }).click()
    await readOfA
    await page.waitForFunction(() => document.querySelector('.gx-loading') === null, undefined, { timeout: 30_000 })
    await openTheArrangementForm()
    await chooseTheCard(FIRST_STEP)
    const backOnA = await onScreen()
    expect(backOnA.lane, 'A’s step lost the lane written for it').toBe(LANE)
    expect(backOnA.developerSays, 'A’s developer section does not say where its step was stored').toContain(
      englishWords()['lanesInput.oldNodeLane'].replace('{record}', FIRST_STEP).replace('{lane}', LANE),
    )
    expect(backOnA.developerSays, 'A’s developer section names the sentence by its key').toContain('lanesInput.oldNodeLane')
    expect(backOnA.pageSays, 'A’s said section, which every reader sees, names the stored lane').not.toContain(LANE)
  }, 240_000)
})
