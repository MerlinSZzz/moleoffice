// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COMMENT, TALK BOX AND RECIPIENT PRESSES SAY HOW THEIR ANSWER ENDED.
 *
 * The shared button flashes its whole frame only when a caller proves the press succeeded, fades when the answer
 * failed, and ends plainly when nobody proved either. These are the persistent callers of audit report XIHE6Qc5EGNd
 * that live in line 13y's files at 1adcfbcb2. Each was read before it was wired.
 *
 *   1. SavedComment's Send. A refusal is a failure. The write that addresses the comment proves a success, and that
 *      success is visible while the column re-reads the row, before the row gives way to who it waits for. The path
 *      that finds no record for the chosen agent writes nothing and ends plainly.
 *   2. SavedComment's Save. Its success closes the editor in the same update, so the press is gone and only a refusal
 *      can be shown.
 *   3. SavedComment's Remove. A refusal is a failure. A deleted comment's row stays until the column re-reads, so the
 *      success is visible in that gap and then the row goes.
 *   4. TalkBox's Send. A refused write is a failure. A sent message replaces the box before the wait ends, so only a
 *      refusal can be shown. Writing a message with `to` is sending it (`sentWhenWritten`), so a 200 is a whole send
 *      and not a message held back.
 *   5. TalkBox's Add to review. Writing the comment replaces the box with "Written down" before the holding review is
 *      read, so only a refused write can fade. A comment no review holds, or whose holding review cannot be read, is
 *      not a whole success and ends with no flash and no fade because the press is no longer there.
 *   6. TalkBox's Start review. The same: the comment is written and the box redraws before the review starts. A review
 *      that does not reach the comment, or one that does not start, is not a whole success and ends with no flash and
 *      no fade.
 *   7. Recipients' Find them. `one` proves the words name one agent; `many` and `none` are refusals drawn as the
 *      product working, so they fade and their own sentence is drawn. No page mounts this box at 1adcfbcb2, so it is
 *      drawn in a root of its own on a real page of the live app; the press, its light and its server answer are real.
 *
 * EACH CASE HOLDS THE SERVER'S ANSWER, watches the press's light while it is in flight, then answers by `page.route`
 * and reads how the light ended. `roundRect` is the whole-frame flash; `animate` is the fade, whose duration names the
 * token. Words a case reads are read through `t()`.
 */

import { build } from 'esbuild'
import type { ElementHandle, Locator, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

const CONTACT = 'Harbour survey agent'
const HANDLE = 'harbour-survey'
const REPORT_BLOCK = 'The north pier reads four metres at low water, and the tide table is from last year.'

let app: LiveApp
let agentId = ''
let savedReportId = ''
let sendReportId = ''
let addReportId = ''
let keepReportId = ''
let otherReview: { review: { id: string }; started: boolean; rule: unknown; says: string }
let oneAnswer: unknown
let manyAnswer: unknown
let noneAnswer: unknown
let recipientsBundle = ''
let worldAnswered = ''
let exposedHeaders = ''

const saved: Record<'sendRefused' | 'sendWorked' | 'save' | 'removeRefused' | 'removeWorked' | 'noRecord', string> = {
  sendRefused: '',
  sendWorked: '',
  save: '',
  removeRefused: '',
  removeWorked: '',
  noRecord: '',
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

async function get<T>(path: string): Promise<T> {
  const reply = await fetch(app.api + path, { headers: PERSON })
  if (!reply.ok) throw new Error(`${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

function aReport(title: string): Promise<{ record: { id: string } }> {
  return post('/api/records', {
    kind: 'report',
    title,
    data: {
      for: 'Robin Vale',
      date: '2026-11-10',
      blocks: [{ id: 'b-1', type: 'text', heading: 'The soundings', text: REPORT_BLOCK }],
    },
  })
}

function aSavedComment(reportId: string, body: string): Promise<{ record: { id: string } }> {
  return post('/api/records', {
    kind: 'message',
    title: body.slice(0, 40),
    data: {
      body,
      target: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } },
    },
  })
}

function startAReview(reportId: string): Promise<{ review: { id: string }; started: boolean; rule: unknown; says: string }> {
  return post('/api/reviews', {
    entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' }, place: { at: 'surface' } },
  })
}

async function aResolution(said: string): Promise<unknown> {
  const reply = await fetch(`${app.api}/api/agent/recipients/resolve`, {
    method: 'POST',
    headers: PERSON,
    body: JSON.stringify({ said }),
  })
  if (!reply.ok) throw new Error(`the resolve door answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as unknown
}

beforeAll(async () => {
  app = await liveApp({ name: 'comment-talk-button-outcomes', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const health = await fetch(`${app.api}/api/health`)
  worldAnswered = health.headers.get(WORLD_HEADER) ?? ''
  exposedHeaders = health.headers.get('access-control-expose-headers') ?? ''
  if (worldAnswered === '') throw new Error('the test office did not say which world answered GET /api/health')

  await post('/api/records', { kind: 'agent', title: CONTACT, data: { handle: HANDLE, runtime: 'claude-code', state: 'active' } })
  const registries = await get<{ agents: { id: string; handle: string }[] }>('/api/participants')
  agentId = registries.agents.find((one) => one.handle === HANDLE)?.id ?? ''
  expect(agentId, 'the contact is in the registries').not.toBe('')
  await post('/api/records', {
    kind: 'message',
    title: 'A note',
    data: { body: 'The harbour soundings are in.', to: [{ kind: 'person', id: THE_PERSON }] },
  }, AS(HANDLE))

  const savedReport = await aReport('Synthetic report: the harbour soundings')
  savedReportId = savedReport.record.id
  for (const [key, body] of [
    ['sendRefused', 'Synthetic comment: this send is refused.'],
    ['sendWorked', 'Synthetic comment: this send reaches the agent.'],
    ['save', 'Synthetic comment: these words are saved.'],
    ['removeRefused', 'Synthetic comment: this removal is refused.'],
    ['removeWorked', 'Synthetic comment: this one is removed.'],
    ['noRecord', 'Synthetic comment: the chosen agent has no record.'],
  ] as const) {
    saved[key] = (await aSavedComment(savedReportId, body)).record.id
  }

  sendReportId = (await aReport('Synthetic report: the talk box sends')).record.id
  addReportId = (await aReport('Synthetic report: the talk box adds to a review')).record.id
  keepReportId = (await aReport('Synthetic report: the talk box starts a review')).record.id
  // ADD TO REVIEW NEEDS A COLLECTING REVIEW THAT REACHES THIS REPORT. KEEP IS DRAWN WHERE NONE COLLECTS HERE.
  // The review is started through the box below, after pairing, so its scope is the exact place the box is about.
  const otherReport = await aReport('Synthetic report: a review somewhere else')
  otherReview = await startAReview(otherReport.record.id)

  // THE RESOLVE DOOR MATCHES THE WORDS AGAINST THE RUNS THIS PROJECT HOLDS. Two made-up runs share a word and one
  // carries a word of its own, which is how the three answers are made without inventing one.
  for (const title of ['Zephyr North Surveyor run', 'Zephyr South Surveyor run']) {
    await post('/api/records', {
      kind: 'session',
      title,
      summary: 'Synthetic: a run for the recipients box.',
      data: { state: 'idle', runtime: 'claude-code' },
    })
  }
  oneAnswer = await aResolution('zephyr north')
  manyAnswer = await aResolution('zephyr')
  noneAnswer = await aResolution('quillfeather')
  expect((oneAnswer as { outcome?: string }).outcome, 'one run carries both words').toBe('one')
  expect((manyAnswer as { outcome?: string }).outcome, 'both runs carry one word').toBe('many')
  expect((noneAnswer as { outcome?: string }).outcome, 'no run carries this word').toBe('none')

  const bundled = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'recipients-outcome-harness.tsx',
      loader: 'tsx',
      contents: `import './tests/a-page-of-a-test-office.ts';
        import {theApiIsOnPort} from './src/web/lib/api-address.ts';
        theApiIsOnPort(${String(app.apiPort)});
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {setWordLanguage} from './src/shared/i18n.ts';
        import {RecipientPicker} from './src/web/components/agent/Recipients.tsx';
        setWordLanguage('en');
        const host = document.createElement('div');
        host.id = 'recipients-test';
        Object.assign(host.style, { position: 'fixed', inset: '0', overflow: 'auto', padding: '24px', background: 'var(--bg)', zIndex: '1000' });
        document.body.append(host);
        createRoot(host).render(<RecipientPicker context={null} reviewOn={false}
          recipients={{status: 'error', message: 'Fixture: the ranking is not what this test asks about.', fault: null}}
          onChoose={() => {}} onClose={() => {}}/>);
        window.recipientsBoxDrawn = true;`,
    },
    loader: { '.css': 'empty' },
    write: false,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  recipientsBundle = bundled.outputFiles[0]!.text

  // SENDING A REVIEW AND THE COLUMN'S PRESSES NEED THE PAIRED BROWSER.
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: t('g4.pairing.press'), exact: true }).click()
  await app.page.getByText(t('g4.pairing.paired'), { exact: true }).waitFor()

  // START THE REVIEW OF THE ADD-TO-REVIEW REPORT THROUGH THE BOX, on the same place the cases will open. This is the
  // press that makes the scope, so `covers` and the box cannot disagree about what the review collects.
  const seedTalk = await openTheTalkBox(app.page, addReportId, 'Synthetic comment: start the review collecting here.')
  await seedTalk.getByRole('button', { name: t('talk.startReview'), exact: true }).click()
  await app.page.getByText(t('talk.state.reviewStarted'), { exact: true }).waitFor({ timeout: 30_000 })
  await closeTheWrittenDownBox(seedTalk)
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

async function aPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  // THE PAIRED PAGE OF THIS LIVE APP, used one case at a time. A new context would not carry the pairing cookie.
  return { page: app.page, close: () => Promise.resolve() }
}

/**
 * WAIT FOR THE PRESS'S OWN LIGHT, not whichever light is on the page.
 *
 * The frame draws a light for a background re-read, for navigation and for loading rows, and those use the same canvas
 * element. This waits until exactly one light is drawn, it surrounds the pressed button, and it is still that one a
 * moment later. Then it marks that canvas, so the case waits for that light to go and not for another one. A failure
 * says every light's box and the press's box.
 */
async function watchTheLight(page: Page, button: ElementHandle<HTMLElement>): Promise<void> {
  const lights = page.locator('canvas[data-wait-light]')
  const seen = () => button.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const rect = (r: DOMRect) => ({ left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) })
    return {
      press: rect(box),
      lights: [...document.querySelectorAll('canvas[data-wait-light]')].map((canvas) => {
        const r = canvas.getBoundingClientRect()
        return { ...rect(r), around: r.left <= x && x <= r.right && r.top <= y && y <= r.bottom }
      }),
    }
  })
  const oneAround = async (): Promise<boolean> => {
    const now = await seen()
    return now.lights.length === 1 && now.lights[0]?.around === true
  }
  try {
    await expect.poll(oneAround, { timeout: 10_000, message: 'the press draws one light, around itself' }).toBe(true)
    await page.waitForTimeout(400)
    const still = await seen()
    expect(still.lights.length === 1 && still.lights[0]?.around === true, `the press draws one light, around itself: ${JSON.stringify(still)}`).toBe(true)
  } catch (error) {
    throw new Error(`no single light around the press: ${JSON.stringify(await seen())}\n${String(error)}`)
  }
  await lights.evaluate((element) => {
    element.setAttribute('data-test-watched', '')
    const context = (element as HTMLCanvasElement).getContext('2d')!
    context.roundRect = new Proxy(context.roundRect, {
      apply(target, thisArg, args) {
        document.documentElement.dataset.testFlash = 'yes'
        return Reflect.apply(target, thisArg, args)
      },
    })
    const animate = element.animate.bind(element)
    element.animate = (frames, options) => {
      const fade = animate(frames, options)
      document.documentElement.dataset.testFade = String(fade.effect?.getTiming().duration)
      return fade
    }
  })
}

/** Take the press's element before clicking, because a waiting press adds a screen-reader word to its name. */
async function pressIt(press: Locator): Promise<ElementHandle<HTMLElement>> {
  const button = await press.elementHandle()
  if (button === null) throw new Error('the press is not drawn')
  await press.click()
  return button as ElementHandle<HTMLElement>
}

/** Forget the previous press's marks, so a case reads only its own light, and wait until no light is drawn. */
async function forgetTheLastLight(page: Page): Promise<void> {
  await expect.poll(() => page.locator('canvas[data-wait-light]').count(), { timeout: 10_000, message: 'no light is drawn before the press' }).toBe(0)
  await page.evaluate(() => {
    delete document.documentElement.dataset.testFlash
    delete document.documentElement.dataset.testFade
    for (const canvas of document.querySelectorAll('canvas[data-test-watched]')) canvas.removeAttribute('data-test-watched')
  })
}

/** How the light ended: whether the whole frame was lit, the fade's duration if it faded, and whether it has gone. */
async function howTheLightEnded(page: Page): Promise<{ flash: string | null; fade: string | null }> {
  const html = page.locator('html')
  return { flash: await html.getAttribute('data-test-flash'), fade: await html.getAttribute('data-test-fade') }
}

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return String(Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000))
  }, name)
}

/**
 * RECORD EVERY LIGHT THE PRESS DRAWS FROM NOW ON, AND HOW EACH ENDED, for a press that may draw none.
 *
 * A light is the press's when the box it is painted in holds the press and reaches past it by no more than the press's
 * gap and glow. A background re-read frames the column or a row, which is larger, so its light is not counted. A light
 * of the press carries `data-test-press-light` while it is on the page; a flash or a fade of one is written on the
 * page's root. `stopRecordingThePressLights` ends the recording.
 */
async function recordThePressLights(page: Page, button: ElementHandle<HTMLElement>): Promise<void> {
  await button.evaluate((press) => {
    const root = document.documentElement
    delete root.dataset.testPressFlash
    delete root.dataset.testPressFade
    // THE GAP OF A PRESS'S LIGHT IS 2, ITS MARGIN THE GLOW'S REACH AND 2 MORE; one more for rounding.
    const reach = (Number.parseFloat(getComputedStyle(root).getPropertyValue('--motion-glow-reach')) || 0) + 5
    const aroundThePress = (canvas: HTMLCanvasElement): boolean => {
      const light = canvas.getBoundingClientRect()
      const box = press.getBoundingClientRect()
      return [box.left - light.left, box.top - light.top, light.right - box.right, light.bottom - box.bottom].every((outside) => outside >= -1 && outside <= reach)
    }
    const ofThePress = (canvas: HTMLCanvasElement): boolean => {
      if (aroundThePress(canvas)) canvas.setAttribute('data-test-press-light', '')
      return canvas.hasAttribute('data-test-press-light')
    }
    const watch = (canvas: HTMLCanvasElement): void => {
      const context = canvas.getContext('2d')
      if (context === null) return
      // EVERY PAINT CLEARS THE CANVAS AFTER IT IS PLACED, so this is where its place is read.
      context.clearRect = new Proxy(context.clearRect, {
        apply(target, thisArg, args) {
          ofThePress(canvas)
          return Reflect.apply(target, thisArg, args)
        },
      })
      context.roundRect = new Proxy(context.roundRect, {
        apply(target, thisArg, args) {
          if (ofThePress(canvas)) root.dataset.testPressFlash = 'yes'
          return Reflect.apply(target, thisArg, args)
        },
      })
      const animate = canvas.animate.bind(canvas)
      canvas.animate = (frames, options) => {
        const fade = animate(frames, options)
        if (ofThePress(canvas)) root.dataset.testPressFade = String(fade.effect?.getTiming().duration)
        return fade
      }
    }
    const added = new MutationObserver((changes) => {
      for (const change of changes) {
        for (const node of change.addedNodes) if (node instanceof HTMLCanvasElement && node.hasAttribute('data-wait-light')) watch(node)
      }
    })
    added.observe(document.body, { childList: true })
    ;(window as unknown as { testPressLights?: MutationObserver }).testPressLights = added
  })
}

async function stopRecordingThePressLights(page: Page): Promise<void> {
  await page.evaluate(() => {
    const recording = window as unknown as { testPressLights?: MutationObserver }
    recording.testPressLights?.disconnect()
    delete recording.testPressLights
  })
}

/** How the press's lights ended: whether one lit the whole frame, and the fade's duration if one faded. */
async function howThePressLightsEnded(page: Page): Promise<{ flash: string | null; fade: string | null }> {
  const html = page.locator('html')
  return { flash: await html.getAttribute('data-test-press-flash'), fade: await html.getAttribute('data-test-press-fade') }
}

async function theLightHasGone(page: Page): Promise<void> {
  await expect.poll(() => page.locator('canvas[data-test-watched]').count(), { timeout: 15_000, message: 'the light the press drew has gone' }).toBe(0)
}

/**
 * THE CORS HEADERS A REPLY OWES A PAGE ON ANOTHER LOOPBACK PORT. The page is served on the web port and calls the API
 * on its own port; without these the browser refuses an intercepted answer and the component sees a network error
 * instead of the reply this case is about.
 */
function theHeadersThePageMayRead(): Record<string, string> {
  return {
    'access-control-allow-origin': app.site,
    vary: 'Origin',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': exposedHeaders,
    [WORLD_HEADER]: worldAnswered,
  }
}

/** The saved-comment column on the report, open on its first comment circle. */
async function openTheSavedColumn(page: Page, reportId: string, commentId: string): Promise<Locator> {
  // A FULL LOAD, not only the hash: the one-read slots and the review state belong to the document, and a case must
  // start from what the server holds rather than from the case before it.
  await page.goto('about:blank')
  await page.goto(`${app.site}/#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.px-comment-circle').first().click()
  await page.getByText(t('review.pane.commentsHere'), { exact: true }).waitFor({ timeout: 30_000 })
  const row = page.locator(`[data-saved-comment="${commentId}"]`)
  await row.waitFor({ timeout: 30_000 })
  return row
}

/** Choose the contact in a saved comment's list, so the next Send has somebody with a record. */
async function chooseTheContact(row: Locator): Promise<void> {
  await row.getByRole('button', { name: t('review.pane.note.send'), exact: true }).click()
  await row.locator('.px-talk-filter').waitFor({ timeout: 20_000 })
  await row.locator('.px-talk-contact', { hasText: CONTACT }).first().click()
  await expect.poll(async () => (await row.locator('.px-saved-chosen').innerText()).replace(/\s*▾$/, ''), { timeout: 20_000 })
    .toBe(`${t('talk.to')} ${CONTACT}`)
}

/** The report page, with the talk box open on its one block. */
async function openTheTalkBox(page: Page, reportId: string, words: string): Promise<Locator> {
  // A FULL LOAD, for the reason `openTheSavedColumn` gives.
  await page.goto('about:blank')
  await page.goto(`${app.site}/?lang=en#/r/${reportId}`)
  await waitForThePage(page)
  const field = '[data-text-field="data.blocks[#b-1].text"]'
  await page.locator(field).waitFor({ timeout: 30_000 })
  const at = await page.evaluate((selector) => {
    const element = document.querySelector<HTMLElement>(selector)
    if (element === null) throw new Error('the paragraph is not drawn')
    element.scrollIntoView({ block: 'center' })
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 4)
    range.setEnd(node, 14)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    const box = range.getClientRects()[0]
    if (box === undefined) throw new Error('the words have no box')
    return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) }
  }, field)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  const talk = page.locator('.px-talk')
  await talk.locator('textarea').waitFor({ timeout: 20_000 })
  await talk.locator('textarea').fill(words)
  return talk
}

/** The To list, and the contact chosen from it. */
async function chooseTheTalkBoxContact(talk: Locator): Promise<void> {
  await talk.locator('.px-talk-to-btn').click()
  await talk.locator('.px-talk-contact', { hasText: CONTACT }).first().click()
}

async function closeTheWrittenDownBox(talk: Locator): Promise<void> {
  await talk.getByRole('button', { name: t('talk.backToReading'), exact: true }).click()
  await talk.waitFor({ state: 'detached', timeout: 30_000 })
}

// ------------------------------------------------------------------ saved comment: send

it('Send on a saved comment fades after a refused write, with no flash, and keeps its failure line', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  const rowId = saved.sendRefused
  try {
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    await chooseTheContact(row)
    let held = false
    await page.route((url) => url.pathname === `/api/records/${rowId}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The recipient could not be stored in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const send = row.getByRole('button', { name: t('review.pane.note.send'), exact: true })
    const pressed = await pressIt(send)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await row.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused recipient is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await row.locator('.px-error').innerText()).toContain(t('review.pane.note.notStored'))
    expect(await row.getByRole('button', { name: t('review.pane.note.send'), exact: true }).isVisible(), 'the press stays so it can be tried again').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Send on a saved comment flashes when the write that addresses it resolves, then the row gives way', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  const rowId = saved.sendWorked
  try {
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    await chooseTheContact(row)
    let held = false
    await page.route((url) => url.pathname === `/api/records/${rowId}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const send = row.getByRole('button', { name: t('review.pane.note.send'), exact: true })
    const pressed = await pressIt(send)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-settle'))
    expect((await howTheLightEnded(page)).flash, 'the write that addresses the comment is a success').toBe('yes')
    await page.locator(`[data-saved-comment="${rowId}"]`).waitFor({ state: 'detached', timeout: 30_000 })
    await page.locator('.px-saved-to', { hasText: CONTACT }).waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Send on a saved comment ends plainly when the chosen agent has no record and nothing is written', async () => {
  const { page, close } = await aPage()
  const rowId = saved.noRecord
  try {
    // THE PARTICIPANTS READ IS THE ONE SEND MAKES BEFORE IT WRITES. The contact row itself comes from the contacts
    // book, so the agent is still choosable; only its record is missing.
    let rewritten = false
    await page.route((url) => url.pathname === '/api/participants', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as { people: unknown[]; agents: { id: string; handle?: string; record?: unknown }[] }
      body.agents = body.agents.map((one) => {
        if (one.handle !== HANDLE) return one
        rewritten = true
        return { ...one, record: null }
      })
      const headers = { ...response.headers(), ...theHeadersThePageMayRead() }
      delete headers['content-length']
      await route.fulfill({ status: response.status(), headers, contentType: 'application/json', body: JSON.stringify(body) })
    })
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    await chooseTheContact(row)
    await expect.poll(() => rewritten, { timeout: 20_000, message: 'the participants read was answered with no record for the agent' }).toBe(true)
    await forgetTheLastLight(page)
    const send = row.getByRole('button', { name: t('review.pane.note.send'), exact: true })
    const pressed = (await send.elementHandle()) as ElementHandle<HTMLElement> | null
    if (pressed === null) throw new Error('the press is not drawn')
    await recordThePressLights(page, pressed)
    await pressed.click()
    await row.getByText(t('savedComment.noRecord'), { exact: true }).waitFor({ timeout: 20_000 })
    // THE PATH WROTE NOTHING, SO IT IS NEITHER A SUCCESS NOR A FAILURE. The cached read answers at once, so the light
    // may never be drawn; either way it is not painted as a success and not faded as a failure. The column reads
    // again after the press, and a light of that read is not the press's.
    await expect.poll(() => pressed.getAttribute('data-pending'), { timeout: 10_000, message: 'the press stops waiting' }).toBeNull()
    await expect.poll(() => page.locator('canvas[data-test-press-light]').count(), { timeout: 10_000, message: 'and no light of the press is left running' }).toBe(0)
    expect(await howThePressLightsEnded(page), 'a resolved path that wrote nothing is neither').toEqual({ flash: null, fade: null })
    expect(await send.isVisible()).toBe(true)
  } finally {
    await stopRecordingThePressLights(page)
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

// ------------------------------------------------------------------ saved comment: save and remove

it('Save on a saved comment fades after a refusal with no flash, and the editor stays open', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  const rowId = saved.save
  try {
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    await row.getByRole('button', { name: t('review.pane.note.edit'), exact: true }).click()
    await row.getByRole('textbox', { name: t('review.pane.note.saysLabel') }).fill('Synthetic comment: these words are changed.')
    let held = false
    await page.route((url) => url.pathname === `/api/records/${rowId}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The words could not be changed in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const save = row.getByRole('button', { name: t('review.pane.note.save'), exact: true })
    const pressed = await pressIt(save)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await row.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused change is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await row.locator('.px-error').innerText()).toContain(t('review.pane.note.notMade'))
    expect(await row.getByRole('button', { name: t('review.pane.note.save'), exact: true }).isVisible(), 'the editor stays open').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Remove on a saved comment fades after a refusal with no flash, and the comment stays', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  const rowId = saved.removeRefused
  try {
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    let held = false
    await page.route((url) => url.pathname === `/api/records/${rowId}`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The comment could not be removed in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const remove = row.getByRole('button', { name: t('review.pane.note.remove'), exact: true })
    const pressed = await pressIt(remove)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await row.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused removal is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await row.locator('.px-error').innerText()).toContain(t('review.pane.note.notMade'))
    await row.getByRole('button', { name: t('review.pane.note.remove'), exact: true }).waitFor({ timeout: 20_000 })
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Remove on a saved comment flashes when the delete resolves, then the comment and its press go', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  const rowId = saved.removeWorked
  try {
    const row = await openTheSavedColumn(page, savedReportId, rowId)
    let held = false
    await page.route((url) => url.pathname === `/api/records/${rowId}`, async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const remove = row.getByRole('button', { name: t('review.pane.note.remove'), exact: true })
    const pressed = await pressIt(remove)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-settle'))
    expect((await howTheLightEnded(page)).flash, 'a delete that resolved is a success').toBe('yes')
    await page.locator(`[data-saved-comment="${rowId}"]`).waitFor({ state: 'detached', timeout: 30_000 })
    await theLightHasGone(page)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

// ------------------------------------------------------------------ talk box: send

it('Send in the talk box fades after a refused write, with no flash, and keeps its failure line', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, sendReportId, 'Synthetic comment: send this one now.')
    await chooseTheTalkBoxContact(talk)
    const send = talk.getByRole('button', { name: t('talk.send'), exact: true })
    await send.waitFor({ timeout: 30_000 })
    await expect.poll(() => send.getAttribute('aria-disabled'), { timeout: 30_000 }).toBeNull()
    let held = false
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The message could not be sent in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(send)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused send is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await talk.locator('.px-error').innerText()).toContain(t('talk.nothingWritten'))
    expect(await send.isVisible(), 'the press stays so it can be tried again').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

// ------------------------------------------------------------------ talk box: add to review

it('Add to review ends with no flash and no fade when no review holds the written comment', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, addReportId, 'Synthetic comment: write this into the collecting review.')
    const add = talk.getByRole('button', { name: t('talk.addToReview'), exact: true })
    await add.waitFor({ timeout: 30_000 })
    await expect.poll(() => add.getAttribute('aria-disabled'), { timeout: 30_000 }).toBeNull()
    let held = false
    let holdingAsked = false
    await page.route((url) => url.pathname === '/api/reviews/holding', async (route) => {
      holdingAsked = true
      await route.fulfill({
        status: 200,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ review: null }),
      })
    })
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(add)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.getByText(t('talk.state.noReviewHoldsIt'), { exact: true }).waitFor({ timeout: 30_000 })
    await expect.poll(() => holdingAsked, { timeout: 30_000 }).toBe(true)
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a comment no review holds is not a whole success').toEqual({ flash: null, fade: null })
    await closeTheWrittenDownBox(talk)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Add to review ends with no flash and no fade when the holding review cannot be read', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, addReportId, 'Synthetic comment: the holding review cannot be read.')
    const add = talk.getByRole('button', { name: t('talk.addToReview'), exact: true })
    await add.waitFor({ timeout: 30_000 })
    let held = false
    await page.route((url) => url.pathname === '/api/reviews/holding', async (route) => {
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The holding review could not be read in this test.' }),
      })
    })
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(add)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a holding review that could not be read is not a whole success').toEqual({ flash: null, fade: null })
    expect(await talk.locator('.px-error').innerText()).toContain(t('talk.state.holdingNotRead'))
    await closeTheWrittenDownBox(talk)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Add to review fades after a refused write, with no flash, and keeps its failure line', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, addReportId, 'Synthetic comment: this write is refused.')
    const add = talk.getByRole('button', { name: t('talk.addToReview'), exact: true })
    await add.waitFor({ timeout: 30_000 })
    let held = false
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The comment could not be written in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(add)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused write is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await talk.locator('.px-error').innerText()).toContain(t('talk.nothingWritten'))
    expect(await add.isVisible(), 'the press stays so it can be tried again').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

// ------------------------------------------------------------------ talk box: start review

it('Start review ends with no flash and no fade when the review does not reach the comment', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, keepReportId, 'Synthetic comment: the review started is somewhere else.')
    const keep = talk.getByRole('button', { name: t('talk.startReview'), exact: true })
    await keep.waitFor({ timeout: 30_000 })
    let held = false
    await page.route((url) => url.pathname === '/api/reviews', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      // A REAL REVIEW OF ANOTHER REPORT: its detail is read by the page and does not hold this comment.
      await route.fulfill({
        status: 200,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify(otherReview),
      })
    })
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(keep)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.getByText(t('talk.state.keptNotInTheReview'), { exact: true }).waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a review that does not reach the comment is not a whole success').toEqual({ flash: null, fade: null })
    await closeTheWrittenDownBox(talk)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Start review ends with no flash and no fade when the review does not start', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, keepReportId, 'Synthetic comment: the review cannot start.')
    const keep = talk.getByRole('button', { name: t('talk.startReview'), exact: true })
    await keep.waitFor({ timeout: 30_000 })
    let held = false
    await page.route((url) => url.pathname === '/api/reviews', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The review could not start in this test.' }),
      })
    })
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.continue()
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(keep)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a review that did not start is not a whole success').toEqual({ flash: null, fade: null })
    expect(await talk.locator('.px-error').innerText()).toContain(t('talk.state.keptReviewNotStarted'))
    await closeTheWrittenDownBox(talk)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

it('Start review fades after a refused write, with no flash, and keeps its failure line', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    const talk = await openTheTalkBox(page, keepReportId, 'Synthetic comment: this start-review write is refused.')
    const keep = talk.getByRole('button', { name: t('talk.startReview'), exact: true })
    await keep.waitFor({ timeout: 30_000 })
    let held = false
    await page.route((url) => url.pathname === '/api/records', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 500,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The comment could not be written in this test.' }),
      })
    })
    await forgetTheLastLight(page)
    const pressed = await pressIt(keep)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await talk.locator('.px-error').waitFor({ timeout: 30_000 })
    await theLightHasGone(page)
    expect(await howTheLightEnded(page), 'a refused write is not a success').toEqual({ flash: null, fade: await token(page, '--motion-quick') })
    expect(await talk.locator('.px-error').innerText()).toContain(t('talk.nothingWritten'))
    expect(await keep.isVisible(), 'the press stays so it can be tried again').toBe(true)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 180_000)

// ------------------------------------------------------------------ recipients: find them

it('Find them flashes for one named agent and fades for a refusal, naming what the answer said', async () => {
  const { page, close } = await aPage()
  let release: () => void = () => {}
  try {
    await page.goto(`${app.site}/#/`)
    await waitForThePage(page)
    await page.addScriptTag({ type: 'module', content: recipientsBundle })
    await page.locator('#recipients-test').waitFor({ timeout: 30_000 })
    const press = page.locator('#recipients-test .px-pick-say-row button')
    await press.waitFor({ timeout: 30_000 })
    await page.locator('#recipients-test .px-pick-say-row input').fill('zephyr')
    let answer: unknown = oneAnswer
    let held = false
    await page.route((url) => url.pathname === '/api/agent/recipients/resolve', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      held = true
      await new Promise<void>((resolve) => { release = resolve })
      await route.fulfill({
        status: 200,
        headers: theHeadersThePageMayRead(),
        contentType: 'application/json',
        body: JSON.stringify(answer),
      })
    })

    // ONE AGENT: the words name one, so the press did what it says.
    await forgetTheLastLight(page)
    let pressed = await pressIt(press)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-settle'))
    expect((await howTheLightEnded(page)).flash, 'one named agent is a success').toBe('yes')
    const matched = page.locator('#recipients-test .px-pick-matched')
    await matched.waitFor({ timeout: 30_000 })
    expect(await matched.innerText()).toBe((oneAnswer as { note: string }).note)
    await theLightHasGone(page)

    // MANY: a refusal naming every candidate, drawn as the product working.
    answer = manyAnswer
    held = false
    await forgetTheLastLight(page)
    pressed = await pressIt(press)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-quick'))
    expect((await howTheLightEnded(page)).flash, 'many named agents is a refusal, not a success').toBeNull()
    const refused = page.locator('#recipients-test .px-pick-refused')
    await expect.poll(async () => (await refused.innerText()).trim(), { timeout: 30_000 }).toBe((manyAnswer as { note: string }).note)
    await theLightHasGone(page)

    // NONE: the other refusal, offering a new agent.
    answer = noneAnswer
    held = false
    await forgetTheLastLight(page)
    pressed = await pressIt(press)
    await expect.poll(() => held, { timeout: 30_000 }).toBe(true)
    await watchTheLight(page, pressed)
    release()
    await expect.poll(async () => (await howTheLightEnded(page)).fade, { timeout: 10_000 }).toBe(await token(page, '--motion-quick'))
    expect((await howTheLightEnded(page)).flash, 'no named agent is a refusal, not a success').toBeNull()
    await expect.poll(async () => (await refused.innerText()).trim(), { timeout: 30_000 }).toBe((noneAnswer as { note: string }).note)
    expect(await page.locator('#recipients-test .px-pick-why').innerText()).toContain((noneAnswer as { startANewAgent: string }).startANewAgent)
    await theLightHasGone(page)
  } finally {
    release()
    await page.unrouteAll({ behavior: 'wait' })
    await close()
  }
}, 240_000)
