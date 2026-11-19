// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANEL'S PRESSES SAY HOW THEIR ANSWER ENDED. Wave 13y, round 152.
 *
 * The shared button flashes its whole frame only when its caller proves the press did what its words say, fades when
 * the answer was a refusal, and otherwise ends plainly. This file holds the persistent presses of
 * src/web/components/agent/ReviewBar.tsx to that, on the real page of a Mole Office of its own:
 *   - Send in your review ends plainly on a whole success, because the sent row takes the press's place and is the
 *     answer; Keep this reading (on an agent's answer and on a pasted one), Ask them to read these, Take it away, Remove
 *     and Send this comment can each be answered 200 with part of the press not done. Those flash on a whole success,
 *     fade with no flash on a refusal, and end plainly, with no flash and no fade, on a partial answer.
 *   - Start a review here, the leave question's Send and Discard, Send this review, Save this reading and Save the
 *     change are gone or drawn again when they succeed, so only a refusal can be shown: it fades, with no flash.
 * Every case also proves that one press draws exactly one light, and that the light is around the pressed button.
 *
 * EACH CASE HOLDS ONE REQUEST OF THE PRESS with `page.route`, watches the light while it waits, then lets the server
 * answer, or answers with a refusal made up by this file, or changes what the server answered. `roundRect` is the
 * whole-frame flash and `animate` is the fade, whose duration names the token.
 *
 * WHICH PARTIAL ANSWERS ARE REAL AND WHICH ARE MADE UP. Real: a send that keeps back a comment only the person may
 * answer, a decision; a kept reading that stores the annotation's reading and not the message's; a Take it away or a
 * Remove whose record was changed through the API while the press waited. Made up: Ask, whose real answer is given one
 * held-back message it did not hold, because this office does not hold back one question to one active agent; and Send
 * this comment, whose real answer is given the comment as one for the person to answer, because a send of one comment
 * to an agent it cannot reach is refused with 409, not answered 200: line 265 of
 * tests/a-dispatched-agent-retires-and-needs-a-proved-key.test.ts expects that 409.
 *
 * MUTATION: take `pendingSucceeded` off Take it away, and "Take it away flashes when the reading is removed" fails;
 * take `pendingFailed` off any press, and its refusal case fails.
 *
 * Everything here is made up.
 */
import type { Locator, Page, Route } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WORLD_HEADER } from '../src/config/world-header.mjs'
import { t } from '../src/shared/i18n.ts'
import { artefactNamed, onlyAPersonMayWriteIt } from '../src/shared/intent.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

const UNPROVED = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const KILN = { name: 'Kiln Keeper', handle: 'kiln-keeper' }
const AS_KILN = { ...UNPROVED, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': KILN.handle }
const REFUSAL = 'A refusal made up by this test.'

let app: LiveApp
/** The person, with the test office's key for the person, which a dispatch asks for. */
let person: Record<string, string> = UNPROVED
let kiln = ''
let worldAnswered = ''
let exposedHeaders = ''
/** A number that gives each note and each comment words of its own, so its row is found by them. */
let made = 0

async function ask<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = person): Promise<T> {
  const reply = await fetch(app.api + path, {
    method,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const aLetterNothingHolds = method === 'POST' && path === '/api/records' && theAnswerToAWriteInATestOffice(headers, body) === 409
  if (aLetterNothingHolds ? reply.status !== 409 : !reply.ok) throw new Error(`${method} ${path} answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as T
}

// ============================================================================ the world each case is made in

interface AReview {
  about: string
  title: string
  review: string
  /** Each comment's id and the words its row shows. */
  comments: { id: string; body: string }[]
}

type AComment = 'message' | 'annotation' | 'decision'

/** A note with no review on it, its id and its title. */
async function aNote(): Promise<{ about: string; title: string }> {
  const title = `Made-up kiln note (${String((made += 1))})`
  const about = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'note', title, data: { body: 'Two firings a week.' } })).record.id
  return { about, title }
}

/**
 * A note with a review collecting on it, going to Kiln Keeper unless `goesTo` says otherwise, holding one comment of
 * each kind asked for. A decision is an annotation whose reading says only a person may write what it asks for.
 */
async function aReview(kinds: AComment[], goesTo: string | null = kiln, chosen: string | null = null): Promise<AReview> {
  const { about, title } = await aNote()
  const target = { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry: target })).review.id
  if (goesTo !== null) await ask('POST', `/api/reviews/${review}/recipient`, { recipient: { kind: 'agent', agentId: goesTo } })
  const comments: AReview['comments'] = []
  for (const kind of kinds) {
    const body = `Made-up comment ${String((made += 1))} about the shelves.`
    const id = (await ask<{ record: { id: string } }>('POST', '/api/records', kind === 'message'
      ? { kind: 'message', title: body, data: { body, target, ...(chosen === null ? {} : { chosenRecipient: { kind: 'agent', agentId: chosen } }) } }
      : { kind: 'annotation', title: body, data: { body, context: target } })).record.id
    if (kind === 'decision') {
      await ask('PATCH', `/api/records/${id}`, { dataPatch: { interpretation: `They ask for a decision: which day to fire. ${onlyAPersonMayWriteIt(artefactNamed('decision')!)}` } })
    }
    comments.push({ id, body })
  }
  return { about, title, review, comments }
}

/** The same review with its collecting finished, as the person's press of Finish leaves it. */
async function collected(review: AReview): Promise<AReview> {
  await ask('POST', `/api/reviews/${review.review}/finish-collecting`, {})
  return review
}

/** A reading of each of the review's comments, in the shape an agent answers with and a person pastes. */
function aReadingOf(review: AReview): string {
  return JSON.stringify({
    comments: review.comments.map((one) => ({ commentId: one.id, reading: 'A shelf needs replacing.', intents: ['change'], artefacts: ['task'] })),
    groups: [],
  })
}

/** The review read, with a reading of each comment kept, as Keep this reading keeps one. */
async function read(review: AReview): Promise<AReview> {
  await ask('POST', `/api/reviews/${review.review}/organise`, JSON.parse(aReadingOf(review)))
  return review
}

/** Kiln Keeper asked to read the review, as Ask them to read these asks, and its answer written in the conversation. */
async function kilnHasAnswered(review: AReview): Promise<AReview> {
  const thread = (await ask<{ thread: { id: string } }>('POST', '/api/agent/threads', { title: `Read the comments in review ${review.review}`, mode: 'direct' })).thread.id
  await ask('POST', `/api/agent/threads/${thread}/messages`, {
    intent: 'ask',
    body: 'Made up: read these comments and say what each one asks for.',
    context: null,
    recipient: { kind: 'agent', agentId: kiln, sessionId: null, said: null, why: null },
    fromAnnotationId: null,
  })
  await ask('POST', `/api/agent/threads/${thread}/dispatch`, {})
  await ask('POST', `/api/agent/threads/${thread}/messages`, { intent: 'discuss', body: aReadingOf(review), context: null }, AS_KILN)
  return review
}

// ============================================================================ the page

beforeAll(async () => {
  app = await liveApp({ name: 'review-button-outcomes', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const health = await fetch(`${app.api}/api/health`)
  worldAnswered = health.headers.get(WORLD_HEADER) ?? ''
  exposedHeaders = health.headers.get('access-control-expose-headers') ?? ''
  if (worldAnswered === '') throw new Error('the test office did not say which world answered GET /api/health')
  person = { ...UNPROVED, ...thePersonsKeyHeader(`${app.dir}/keys.json`) }
  kiln = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'agent', title: KILN.name, data: { handle: KILN.handle, runtime: 'claude-code', state: 'active' } })).record.id
  // PAIRED THROUGH THE PAGE, so each press is the person's. Every case opens a page of its own in this context, which
  // carries the pairing, and closes it without asking the page, so a review left collecting asks nothing.
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: t('g4.pairing.press'), exact: true }).click()
  await app.page.getByText(t('g4.pairing.paired'), { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

/** Open a page of this context on the note. */
async function aPageOn(about: string): Promise<Page> {
  const page = await app.context.newPage()
  await page.goto(`${app.site}/#/r/${about}`)
  await waitForThePage(page, 60_000)
  return page
}

/** Open the column on the list of reviews. The column remembers whether it was open, which its switch says. */
async function openTheList(page: Page): Promise<void> {
  const switched = page.locator('.px-review-switch')
  if ((await switched.getAttribute('aria-pressed')) === 'true') await switched.click()
  await switched.click()
  await page.locator('.px-pane-list').waitFor({ timeout: 30_000 })
}

/** Open the review in the column, and wait until the review drawn is this one. */
async function openTheReview(page: Page, review: AReview): Promise<void> {
  await openTheList(page)
  await page.locator(`.px-pane-list .px-rev-go[title*="${review.title}"]`).first().click()
  const state = (await ask<{ review: { state: string } }>('GET', `/api/reviews/${review.review}`)).review.state
  await (state === 'collecting'
    ? page.locator('[data-part="your-review"]', { hasText: review.title })
    : page.locator(`.px-pane .px-pane-count[title*="${review.title}"]`)
  ).first().waitFor({ timeout: 30_000 })
}

/**
 * Open one comment's row, and answer what the row draws under it. A collecting review keeps its rows under More about
 * this review. Only a row of the review has a More press of its own.
 */
async function openTheRow(page: Page, review: AReview, which = 0): Promise<Locator> {
  const comment = review.comments[which]!
  // THE TRAY'S LIST IS SHUT AT FIRST: its Show comments press opens the whole review, where More and the rows are.
  const bar = page.locator('[data-part="your-review-bar"]')
  if ((await bar.count()) > 0) {
    const show = bar.getByRole('button', { name: t('review.tray.show'), exact: true })
    if ((await show.count()) > 0) await show.click()
  }
  const more = page.locator('details.px-b-more')
  if ((await more.count()) > 0 && !(await more.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await more.locator('> summary').click()
  }
  const row = page.locator('.px-rev-item:has(> .px-rev-acts)', { has: page.locator('.px-rev-words', { hasText: comment.body }) })
  await row.locator('.px-rev-acts').getByRole('button', { name: t('review.pane.row.more'), exact: true }).click()
  const item = page.locator(`.px-review-item[data-note-id="${comment.id}"]`)
  await item.waitFor({ timeout: 30_000 })
  return item
}

/** The press, once it is drawn and on: a press that is off says why and does nothing. */
async function ready(press: Locator): Promise<Locator> {
  await press.waitFor({ timeout: 30_000 })
  await expect.poll(() => press.getAttribute('aria-disabled'), { timeout: 30_000, message: 'the press is on' }).not.toBe('true')
  return press
}

// ============================================================================ one press, one light

/**
 * HOW THE CASE ANSWERS THE REQUEST IT HOLDS: the server's own answer; a refusal made up by this file; or a function
 * that answers it some other way.
 */
type Answer = 'the server' | 'a refusal' | ((route: Route) => Promise<void>)

/**
 * THE CORS HEADERS A REPLY OWES A PAGE ON ANOTHER LOOPBACK PORT, and the world the reply comes from. Without them the
 * browser refuses an answer this file makes, and the press sees a network error instead of the refusal.
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

async function token(page: Page, name: string): Promise<string> {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return String(Number.parseFloat(value) * (value.endsWith('ms') ? 1 : 1000))
  }, name)
}

/**
 * PRESS, HOLD THE ONE REQUEST, AND READ HOW THE LIGHT ENDED.
 *
 * The first request with `method` whose path matches `path` is held. While it is held, the page must draw exactly one
 * light, and that light must be around the press. The light is then watched: `roundRect` on its canvas is the
 * whole-frame flash, and `animate` is its fade. `meanwhile` runs while the request is still held, and then the request
 * is answered as `answer` says. The case waits until the watched light has gone.
 */
async function pressAndSee(
  page: Page,
  press: Locator,
  call: { method: string; path: RegExp },
  answer: Answer,
  meanwhile?: () => Promise<void>,
): Promise<{ flash: string | null; fade: string | null }> {
  await page.evaluate(() => {
    delete document.documentElement.dataset.testFlash
    delete document.documentElement.dataset.testFade
  })
  const lights = page.locator('canvas[data-wait-light]')
  await expect.poll(() => lights.count(), { timeout: 10_000, message: 'a light is drawn before the press' }).toBe(0)
  let held = false
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => { release = resolve })
  const hold = async (route: Route) => {
    if (held || route.request().method() !== call.method) return route.fallback()
    held = true
    await released
    // THE PAGE MAY HAVE MOVED ON WHILE THE ANSWER WAS HELD. Playwright handles a route when its page closes, and a late
    // continue or fulfill then throws "Route is already handled"; that is the page ending, not a fault of the press.
    try {
      if (answer === 'the server') return await route.continue()
      if (answer === 'a refusal') {
        return await route.fulfill({ status: 409, headers: theHeadersThePageMayRead(), contentType: 'application/json', body: JSON.stringify({ error: REFUSAL }) })
      }
      return await answer(route)
    } catch (err) {
      if (!String(err).includes('Route is already handled')) throw err
    }
  }
  const ours = (url: URL) => url.href.startsWith(app.api) && call.path.test(url.pathname)
  await page.route(ours, hold)
  try {
    const button = await press.elementHandle()
    if (button === null) throw new Error('the press is not drawn')
    await press.click()
    await expect.poll(() => held, { timeout: 30_000, message: `the press asked ${call.method} ${String(call.path)}` }).toBe(true)
    // ONE PRESS, ONE LIGHT, AROUND THE PRESS. Read twice, a moment apart, so a second light started a beat later is seen.
    const around = () => button.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      return [...document.querySelectorAll('canvas[data-wait-light]')].map((canvas) => {
        const r = canvas.getBoundingClientRect()
        return r.left <= x && x <= r.right && r.top <= y && y <= r.bottom ? 'around the press' : 'somewhere else'
      })
    })
    await expect.poll(around, { timeout: 10_000, message: 'the press draws one light, around itself' }).toEqual(['around the press'])
    await page.waitForTimeout(400)
    expect(await around(), 'the press draws one light, around itself').toEqual(['around the press'])
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
    await meanwhile?.()
    release()
    await expect.poll(() => page.locator('canvas[data-test-watched]').count(), { timeout: 15_000, message: 'the light has gone' }).toBe(0)
    const html = page.locator('html')
    return { flash: await html.getAttribute('data-test-flash'), fade: await html.getAttribute('data-test-fade') }
  } finally {
    release()
    await page.unroute(ours, hold)
  }
}

/** How each kind of end reads. */
async function proved(page: Page) {
  return { flash: 'yes', fade: await token(page, '--motion-settle') }
}
async function refused(page: Page) {
  return { flash: null, fade: await token(page, '--motion-quick') }
}
const PLAIN = { flash: null, fade: null }

/** The refusal's own words are still drawn, as the press drew them before. */
async function theRefusalIsSaid(page: Page): Promise<void> {
  await expect.poll(() => page.getByText(REFUSAL).count(), { timeout: 10_000, message: 'the refusal is said on the page' }).toBeGreaterThan(0)
}

/** Run a case on a page of its own, closed afterwards without asking it. */
async function onAPage(note: { about: string }, run: (page: Page) => Promise<void>): Promise<void> {
  const page = await aPageOn(note.about)
  try {
    await run(page)
  } finally {
    await page.close()
  }
}

/** A partial answer made up from the server's real one. */
function changedAnswer(change: (body: Record<string, unknown>) => void): (route: Route) => Promise<void> {
  return async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as Record<string, unknown>
    change(body)
    await route.fulfill({ response, json: body })
  }
}

const SEND = (review: AReview) => ({ method: 'POST', path: new RegExp(`^/api/reviews/${review.review}/send$`) })
const ORGANISE = (review: AReview) => ({ method: 'POST', path: new RegExp(`^/api/reviews/${review.review}/organise$`) })
const RECORD = (method: string, id: string) => ({ method, path: new RegExp(`^/api/records/${id}$`) })
const DISPATCH = { method: 'POST', path: /^\/api\/agent\/threads\/[^/]+\/dispatch$/ }

// ============================================================================ the cases

describe('Start a review here', () => {
  it('fades after a refusal, with no flash', async () => {
    await onAPage(await aNote(), async (page) => {
      await openTheList(page)
      const press = await ready(page.locator('.px-pane-do').getByRole('button', { name: t('review.pane.start'), exact: true }))
      expect(await pressAndSee(page, press, { method: 'POST', path: /^\/api\/reviews$/ }, 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)
})

describe('Send in your review', () => {
  // THE TRAY'S OWN SEND, the one press at the foot of the window. The list's Send under the comments is not drawn in
  // the tray: the row at the foot carries the same act, so one press is offered and not two (wave 13y round 153).
  const theSend = (page: Page, _n: number) =>
    ready(page.locator('[data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.send'), exact: true }))

  it('ends plainly when every comment has gone, and the sent row takes the press\'s place', async () => {
    const review = await aReview(['message'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, 1), SEND(review), 'the server')).toEqual(PLAIN)
      // THE SENT ROW HAS TAKEN THE PRESS'S PLACE, with its Close press drawn (wave 13y round 157).
      await page.locator('[data-part="your-review-sent"] [data-part="your-review-bar"]').getByRole('button', { name: t('review.tray.close'), exact: true }).waitFor({ timeout: 30_000 })
    })
  }, 180_000)

  it('fades after a refusal, with no flash', async () => {
    const review = await aReview(['message'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, 1), SEND(review), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('ends plainly when a comment only the person may answer stays', async () => {
    const review = await aReview(['message', 'decision'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, 2), SEND(review), 'the server')).toEqual(PLAIN)
    })
  }, 180_000)
})

describe('the question on leaving a page whose review is not sent', () => {
  /** Leave the page by a change of the hash, once the list of collecting reviews has been read, and wait to be asked. */
  async function leave(page: Page): Promise<Locator> {
    await page.waitForTimeout(1000)
    await page.evaluate(() => { location.hash = '#/records' })
    const question = page.locator('[data-part="leave-question"]')
    await question.waitFor({ timeout: 30_000 })
    return question
  }

  it('Send fades after a refusal, with no flash', async () => {
    const review = await aReview(['message'])
    await onAPage(review, async (page) => {
      const question = await leave(page)
      const press = await ready(question.getByRole('button', { name: t('review.b.send', { n: 1 }), exact: true }))
      const call = { method: 'POST', path: new RegExp(`^/api/reviews/${review.review}/finish-collecting$`) }
      expect(await pressAndSee(page, press, call, 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('Discard fades after a refusal, with no flash', async () => {
    const review = await aReview(['message'])
    await onAPage(review, async (page) => {
      const question = await leave(page)
      await ready(question.getByRole('button', { name: t('review.b.send', { n: 1 }), exact: true }))
      const press = await ready(question.getByRole('button', { name: t('review.leave.discard'), exact: true }))
      const call = { method: 'POST', path: new RegExp(`^/api/reviews/${review.review}/discard$`) }
      expect(await pressAndSee(page, press, call, 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)
})

describe('Keep this reading, on the answer an agent gave', () => {
  const theKeep = (page: Page) =>
    ready(page.locator('[data-part="have-them-read"] > .px-org-acts').getByRole('button', { name: t('review.pane.read.keep'), exact: true }))

  it('flashes when every reading was stored', async () => {
    const review = await kilnHasAnswered(await collected(await aReview(['annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page), ORGANISE(review), 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('fades after a refusal, with no flash', async () => {
    const review = await kilnHasAnswered(await collected(await aReview(['annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page), ORGANISE(review), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('ends plainly when one reading was stored and one was not', async () => {
    const review = await kilnHasAnswered(await collected(await aReview(['message', 'annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page), ORGANISE(review), 'the server')).toEqual(PLAIN)
    })
  }, 180_000)
})

describe('Ask them to read these', () => {
  /** Choose Kiln Keeper as the reader, and answer the press that asks. */
  async function theAsk(page: Page): Promise<Locator> {
    const read = page.locator('[data-part="have-them-read"]')
    await read.getByRole('button', { name: t('review.pane.read.choose'), exact: true }).click()
    await read.locator('.px-talk-contact', { hasText: KILN.name }).first().click()
    await read.locator('.px-org-to', { hasText: KILN.name }).waitFor({ timeout: 30_000 })
    return ready(read.getByRole('button', { name: t('review.pane.read.ask'), exact: true }))
  }

  it('flashes when the question went and nothing was held back', async () => {
    const review = await collected(await aReview(['annotation']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theAsk(page), DISPATCH, 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('fades after a refusal, with no flash', async () => {
    const review = await collected(await aReview(['annotation']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theAsk(page), DISPATCH, 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('ends plainly when the answer says a message was held back (made up)', async () => {
    const review = await collected(await aReview(['annotation']))
    const heldBack = changedAnswer((body) => {
      ;(body['held'] as unknown[]).push({
        messageId: 'made-up-message',
        quotedBody: 'Made up by this test.',
        why: 'Made up by this test: this message was not held back.',
        sentence: { key: 'anAnswer' },
      })
    })
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theAsk(page), DISPATCH, heldBack)).toEqual(PLAIN)
    })
  }, 180_000)
})

describe('Keep this reading, on one pasted', () => {
  async function theKeep(page: Page, review: AReview): Promise<Locator> {
    const self = page.locator('[data-part="have-them-read"] .px-org-self')
    await self.locator('> summary').click()
    await page.getByLabel(t('review.pane.read.pasteLabel'), { exact: true }).fill(aReadingOf(review))
    return ready(self.locator('.px-org-acts').getByRole('button', { name: t('review.pane.read.keep'), exact: true }))
  }

  it('flashes when every reading was stored', async () => {
    const review = await collected(await aReview(['annotation']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page, review), ORGANISE(review), 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('fades after a refusal, with no flash', async () => {
    const review = await collected(await aReview(['annotation']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page, review), ORGANISE(review), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('ends plainly when one reading was stored and one was not', async () => {
    const review = await collected(await aReview(['message', 'annotation']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theKeep(page, review), ORGANISE(review), 'the server')).toEqual(PLAIN)
    })
  }, 180_000)
})

describe('Send this review', () => {
  it('fades after a refusal, with no flash', async () => {
    const review = await collected(await aReview(['message']))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await ready(page.locator('[data-part="send-the-review"]').getByRole('button', { name: t('review.pane.send.head'), exact: true }))
      expect(await pressAndSee(page, press, SEND(review), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)
})

describe('the reading beside a comment', () => {
  it('Save this reading fades after a refusal, with no flash', async () => {
    const review = await read(await collected(await aReview(['annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const item = await openTheRow(page, review)
      await item.getByRole('button', { name: t('review.pane.reading.change'), exact: true }).click()
      await item.getByLabel(t('review.pane.reading.label'), { exact: true }).fill('Made up: the left shelf needs replacing first.')
      const press = await ready(item.getByRole('button', { name: t('review.pane.reading.save'), exact: true }))
      expect(await pressAndSee(page, press, RECORD('PATCH', review.comments[0]!.id), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  const theTakeAway = async (page: Page, review: AReview) =>
    ready((await openTheRow(page, review)).getByRole('button', { name: t('review.pane.reading.takeAway'), exact: true }))

  it('Take it away flashes when the reading is removed', async () => {
    const review = await read(await collected(await aReview(['annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theTakeAway(page, review)
      expect(await pressAndSee(page, press, RECORD('PATCH', review.comments[0]!.id), 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('Take it away fades after a refusal, with no flash', async () => {
    const review = await read(await collected(await aReview(['annotation'])))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theTakeAway(page, review)
      expect(await pressAndSee(page, press, RECORD('PATCH', review.comments[0]!.id), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('Take it away ends plainly when the reading was already gone', async () => {
    const review = await read(await collected(await aReview(['annotation'])))
    const id = review.comments[0]!.id
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theTakeAway(page, review)
      const takenAwayFirst = async () => { await ask('PATCH', `/api/records/${id}`, { dataPatch: { interpretation: null } }) }
      expect(await pressAndSee(page, press, RECORD('PATCH', id), 'the server', takenAwayFirst)).toEqual(PLAIN)
    })
  }, 180_000)
})

describe('a comment in a review still collecting', () => {
  const theRemove = async (page: Page, review: AReview) =>
    ready((await openTheRow(page, review)).getByRole('button', { name: t('review.pane.note.remove'), exact: true }))

  it('Remove flashes when the comment is removed', async () => {
    const review = await aReview(['annotation', 'message'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theRemove(page, review)
      expect(await pressAndSee(page, press, RECORD('DELETE', review.comments[0]!.id), 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('Remove fades after a refusal, with no flash', async () => {
    const review = await aReview(['annotation', 'message'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theRemove(page, review)
      expect(await pressAndSee(page, press, RECORD('DELETE', review.comments[0]!.id), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('Remove ends plainly when the comment was already removed', async () => {
    const review = await aReview(['annotation', 'message'])
    const id = review.comments[0]!.id
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const press = await theRemove(page, review)
      const removedFirst = async () => { await ask('DELETE', `/api/records/${id}`) }
      expect(await pressAndSee(page, press, RECORD('DELETE', id), 'the server', removedFirst)).toEqual(PLAIN)
    })
  }, 180_000)

  it('Save the change fades after a refusal, with no flash', async () => {
    const review = await aReview(['annotation', 'message'])
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      const item = await openTheRow(page, review)
      await item.getByRole('button', { name: t('review.pane.note.edit'), exact: true }).click()
      await item.getByLabel(t('review.pane.note.saysLabel'), { exact: true }).fill('Made up: the right shelf is cracked as well.')
      const press = await ready(item.getByRole('button', { name: t('review.pane.note.save'), exact: true }))
      expect(await pressAndSee(page, press, RECORD('PATCH', review.comments[0]!.id), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)
})

describe('Send this comment, in a review whose collecting has finished', () => {
  const theSend = async (page: Page, review: AReview) =>
    ready((await openTheRow(page, review)).getByRole('button', { name: t('review.pane.note.send'), exact: true }))

  it('flashes when the comment has gone', async () => {
    const review = await collected(await aReview(['message'], null, kiln))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, review), SEND(review), 'the server')).toEqual(await proved(page))
    })
  }, 180_000)

  it('fades after a refusal, with no flash', async () => {
    const review = await collected(await aReview(['message'], null, kiln))
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, review), SEND(review), 'a refusal')).toEqual(await refused(page))
      await theRefusalIsSaid(page)
    })
  }, 180_000)

  it('ends plainly when the answer says the comment is yours to answer (made up)', async () => {
    const review = await collected(await aReview(['message'], null, kiln))
    const id = review.comments[0]!.id
    const keptForYou = changedAnswer((body) => {
      ;(body['yoursToAnswer'] as unknown[]).push({ id, quotedBody: 'Made up by this test.', why: 'Made up by this test: this comment was sent.' })
    })
    await onAPage(review, async (page) => {
      await openTheReview(page, review)
      expect(await pressAndSee(page, await theSend(page, review), SEND(review), keptForYou)).toEqual(PLAIN)
    })
  }, 180_000)
})
