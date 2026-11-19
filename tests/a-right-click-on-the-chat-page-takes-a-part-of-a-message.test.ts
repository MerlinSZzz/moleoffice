// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK ON THE CHAT PAGE TAKES THE PART OF A MESSAGE UNDER THE POINTER. Problem DowO7yEioWp0.
 *
 * Since the chat page was rebuilt, every message carries its own record's target. A message's words
 * and pictures said nothing finer, so a right-click on one sentence, one picture or one quoted line
 * took the whole message. The dashed frame was drawn in window coordinates on the page body: it
 * hung outside the chat's list when the message was scrolled half out of it, and in the corner chat
 * it lay under the panel.
 *
 * WHAT THIS FILE DOES. In a test office with a made-up agent and made-up messages, it opens the
 * conversation on the chat page and right-clicks a sentence, a picture and a quoted line of one
 * message, and the quote blocks drawn above two messages sent by pointing. Each time it keeps a comment with Start review, or with Add to review once that review collects there, which writes it and sends nothing, and reads back from the server what the
 * comment was stored against: that part, not the whole message. A right-click on the message's own
 * foot still takes the whole message. It then checks that the frame round a picture lies inside the
 * chat's list, and still does after the list is scrolled so the picture is half out of it. Last, it
 * does the same in the corner chat over another page, where the frame must be drawn in the panel.
 *
 * Set CHAT_POINT_SHOTS to a folder to photograph the chat page with a picture taken, at 1440, 990,
 * 660 and 390 in both looks, at 1440 in Chinese and at 1440 in the test language. The ordinary run
 * takes no pictures.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Context } from '../src/shared/targets.ts'
import { goKeeping, keepTheCommentInAReview, liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { openTheChat } from './open-the-chat.ts'

/** A 120 by 80 picture of one colour, so the browser draws a real picture with a real size. */
const A_PICTURE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAHgAAABQCAIAAABd+SbeAAAAg0lEQVR42u3QQQ0AAAgEoItpF6NY1hbOBxsJSPVwIApEi0a0aNEWRItGtGjRFkSLRrRo0YgWjWjRohEtGtGiRSNaNKJFi0a0aESLFo1o0YgWLRrRohEtWjSiRSNatGhEi0a0aNGIFo1o0aIRLRrRokUjWjSiRYtGtGhEixaNaNGI/mMBo/mgHF237aQAAAAASUVORK5CYII=',
  'base64',
)

/** The preview door serves files inside this checkout, and `.logs` is ignored by git. */
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}
const THE_AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'kettle-agent' }

const FIRST = 'The first sentence is about the kettle trial.'
const SECOND = 'The second sentence says the lid stayed shut.'
const QUOTED = 'A quoted line from the trial log.'
const BODY = [FIRST, '', SECOND, '', `> ${QUOTED}`].join('\n')
const WHAT_IT_SHOWS = 'The kettle on the bench'

/** A made-up note that two messages sent by pointing quote. */
const NOTE_BODY = 'The lid clicked shut after four seconds, and the steam stopped at once.'
const POINTED_ONE = 'clicked shut after four seconds'
const POINTED_TWO = 'the steam stopped at once'
const POINTED_THREE = 'after four seconds'
const SAYS_WITH_TWO = 'Two things about the lid note.'
const SAYS_WITH_ONE = 'One thing about the lid note.'

/** Where each part starts in the stored body, which is how its region is named. */
const SECOND_AT = BODY.indexOf(SECOND)
const QUOTED_AT = BODY.indexOf('>')

let app: LiveApp
let folder = ''
let messageId = ''
let withTwoId = ''
let withOneId = ''

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  folder = mkdtempSync(join(CHECKOUT, '.logs', 'chat-point-'))
  const picture = join(folder, 'kettle.png')
  writeFileSync(picture, A_PICTURE)

  app = await liveApp({ name: 'chat-point', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  const file = async (headers: Record<string, string>, body: unknown): Promise<string> => {
    const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
    expect(made.status, await made.clone().text()).toBe(201)
    return ((await made.json()) as { record: { id: string } }).record.id
  }
  await file(OWNER, {
    kind: 'agent',
    title: 'Kettle Agent',
    data: { handle: 'kettle-agent', runtime: 'claude-code', state: 'active' },
  })
  // TWO MESSAGES SENT BY POINTING: one quoting two places in its own list, one with the single
  // place a comment was left on. Each draws its quotes as blocks above its words.
  const noteId = await file(OWNER, { kind: 'note', title: 'The lid note', data: { body: NOTE_BODY } })
  const pointingAt = (words: string) => ({
    target: { kind: 'record', recordId: noteId, workspaceId: 'default' },
    place: { at: 'quote', words },
  })
  withTwoId = await file(THE_AGENT, {
    kind: 'message',
    title: SAYS_WITH_TWO,
    data: { body: SAYS_WITH_TWO, to: [{ kind: 'person', id: THE_PERSON }], quotes: [pointingAt(POINTED_ONE), pointingAt(POINTED_TWO)] },
  })
  withOneId = await file(THE_AGENT, {
    kind: 'message',
    title: SAYS_WITH_ONE,
    data: { body: SAYS_WITH_ONE, to: [{ kind: 'person', id: THE_PERSON }], target: pointingAt(POINTED_THREE) },
  })
  // ENOUGH MESSAGES ABOVE THE ONE POINTED AT THAT THE CHAT'S LIST SCROLLS.
  for (let n = 1; n <= 10; n++) {
    await file(THE_AGENT, {
      kind: 'message',
      title: `Kettle note ${String(n)}`,
      data: { body: `Kettle note ${String(n)}: the water reached the mark.`, to: [{ kind: 'person', id: THE_PERSON }] },
    })
  }
  messageId = await file(THE_AGENT, {
    kind: 'message',
    title: 'The kettle trial',
    data: {
      body: BODY,
      to: [{ kind: 'person', id: THE_PERSON }],
      pictures: [{ id: 'p-1', type: 'image', path: picture, alt: WHAT_IT_SHOWS }],
    },
  })
}, 240_000)

afterAll(async () => {
  await app?.stop()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
}, 60_000)

/** The bubble of a message, by its own first words. */
const bubbleOf = (words: string) => `.px-chat-said .px-chat-bubble:has-text("${words}")`
const BUBBLE = bubbleOf(FIRST)

/** Wait until the message's picture has really been drawn. */
async function waitForThePicture(): Promise<void> {
  await app.page.waitForFunction(
    (words) => {
      const bubble = [...document.querySelectorAll('.px-chat-said .px-chat-bubble')].find((one) =>
        (one.textContent ?? '').includes(words),
      )
      const image = bubble?.querySelector('img')
      return image !== null && image !== undefined && image.complete && image.naturalWidth > 0
    },
    FIRST,
    { timeout: 20_000 },
  )
}

/** Open the conversation with the agent on the chat page. */
async function openOnTheChatPage(language: string | null = null): Promise<void> {
  // KEEP IS ANSWERED IF ASKED: a comment kept with Start review leaves a review not sent behind it.
  await goKeeping(app.page, `${app.site}/${language === null ? '' : `?lang=${language}`}#/chat`)
  await waitForThePage(app.page, 60_000)
  // BELOW 40REM THE PAGE DRAWS ONE PANE AT A TIME, and it may reopen the conversation it last showed.
  const contact = app.page.locator('.px-chat-contact:has(.px-chat-name:text-is("Kettle Agent"))')
  if (!(await contact.isVisible())) {
    const back = app.page.locator('.px-chat-back')
    if (await back.isVisible()) await back.click()
  }
  if (await contact.isVisible()) await contact.click()
  await app.page.waitForSelector(BUBBLE, { timeout: 20_000 })
  await waitForThePicture()
}

/** Open the conversation in the corner chat, over another page. */
async function openInTheCorner(): Promise<void> {
  await goKeeping(app.page, `${app.site}/#/settings`)
  await waitForThePage(app.page, 60_000)
  await openTheChat(app.page)
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Kettle Agent"))')
  await app.page.waitForSelector(BUBBLE, { timeout: 20_000 })
  await waitForThePicture()
}

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

interface Pointed {
  /** The word in front of the name: what kind of thing the box is about. */
  kind: string
  /** The words the box names the thing by. */
  what: string
  /** The thing that was right-clicked. */
  part: Box
  /** The chat's scrolling list of messages. */
  list: Box
  /** Every piece of the mark for what the box is open about. */
  marks: { box: Box; inAFixedPanel: boolean }[]
}

/** One part of a message: what it is drawn as, words it holds when that is not enough, and whose. */
interface Part {
  css: string
  text?: string
  /** The first words of the message it is in. The kettle message when left out. */
  in?: string
}

/** Close the box a right-click opened, when one is open. */
async function closeTheBox(): Promise<void> {
  const close = app.page.locator('.px-talk .px-talk-close')
  if ((await close.count()) > 0) await close.first().click()
  await app.page.waitForSelector('.px-talk', { state: 'detached', timeout: 10_000 })
}

/** Right-click the middle of one part of the message, and read the box and the mark. */
async function pointAt(part: Part): Promise<Pointed> {
  await closeTheBox()
  const all = app.page.locator(bubbleOf(part.in ?? FIRST)).locator(part.css)
  const target = (part.text === undefined ? all : all.filter({ hasText: part.text })).first()
  await target.scrollIntoViewIfNeeded()
  await target.click({ button: 'right' })
  await app.page.waitForSelector('.px-talk', { timeout: 15_000 })
  return readTheMark(part)
}

/** Read the box and the mark as they are now, after two frames so a new measurement has landed. */
async function readTheMark(part: Part): Promise<Pointed> {
  await app.page.evaluate(
    () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  )
  const kind = ((await app.page.locator('.px-talk .px-talk-chip-kind').first().textContent()) ?? '').trim()
  const what = ((await app.page.locator('.px-talk .px-talk-chip-what').first().textContent()) ?? '').trim()
  const seen = await app.page.evaluate(
    ({ bubble, part }) => {
      const box = (element: Element): Box => {
        const r = element.getBoundingClientRect()
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
      }
      const holder = [...document.querySelectorAll('.px-chat-said .px-chat-bubble')].find((one) =>
        (one.textContent ?? '').includes(bubble),
      )
      const thing = [...(holder?.querySelectorAll(part.css) ?? [])].find(
        (one) => part.text === undefined || (one.textContent ?? '').includes(part.text),
      )
      const list = thing?.closest('.px-chat-said')
      if (thing === null || thing === undefined || list === null || list === undefined) {
        throw new Error(`nothing matches ${part.css} in the message`)
      }
      const marks = [...document.querySelectorAll<HTMLElement>('.px-subject > i[data-why="subject"]')].map((piece) => {
        const panel = piece.closest('.px-chat')
        return {
          box: box(piece),
          inAFixedPanel: panel !== null && getComputedStyle(panel).position === 'fixed',
        }
      })
      return { part: box(thing), list: box(list), marks }
    },
    { bubble: part.in ?? FIRST, part },
  )
  return { kind, what, ...seen }
}

/**
 * THE WORD IN FRONT OF THE NAME, ONCE THE BOX HAS BEEN TOLD WHAT RECORD THE PART IS IN.
 *
 * The box asks the office what the record holding the part is when it opens (TalkBox's
 * `whatTheseRecordsAre`). Until that answer comes back it draws the general noun, "Part of a record",
 * and only then "Part of a message". Read two frames after the box opened, this file saw the general
 * noun whenever the answer was slow: wave 13k's round 14 found it red on main 91ce95d6 under load, and
 * a delay of 1.5 seconds put into that read makes it red every time (log
 * .logs/named-tests-2026-09-29T04-04-43-675.log). So the word is waited for, up to 15 seconds.
 * A box that never says "Part of a message" still fails. The pictures below wait for the Chinese word the
 * same way.
 */
async function theSettledWord(message: string, word = 'Part of a message'): Promise<void> {
  await expect
    .poll(async () => ((await app.page.locator('.px-talk .px-talk-chip-kind').first().textContent()) ?? '').trim(), {
      message,
      timeout: 15_000,
    })
    .toBe(word)
}

/**
 * Keep a comment without sending it, and read back what the server stored it against.
 *
 * START REVIEW IS THE KEEPING PRESS IN SHAPE B, which replaced Save without sending. It writes the
 * comment first and then starts the page's review. Since wave 13x round 22, once that review collects
 * here, the keeping press is Add to review in its place (`keepTheCommentInAReview`). What this file
 * reads is the target the comment was stored against, which the review does not change.
 */
async function saveAndReadBack(comment: string): Promise<Context | null> {
  await app.page.locator('.px-talk textarea').first().fill(comment)
  await keepTheCommentInAReview(app.page)
  await app.page.waitForSelector('.px-talk-said', { timeout: 15_000 })
  const reply = (await (
    await fetch(`${app.api}/api/messages/comments`, { headers: { 'x-mole-office-workspace': 'default' } })
  ).json()) as { comments?: { kind: string; data?: { body?: string; context?: Context; target?: Context } }[] }
  const written = (reply.comments ?? []).find((row) => row.data?.body === comment)
  if (written === undefined) throw new Error(`the comment was not stored: ${JSON.stringify(reply).slice(0, 400)}`)
  return (written.kind === 'annotation' ? written.data?.context : written.data?.target) ?? null
}

/** Whether one box lies inside another, to half a pixel. */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.right <= outer.right + 0.5 &&
    inner.bottom <= outer.bottom + 0.5
  )
}

describe('a right-click on the chat page', () => {
  it('on a sentence takes that sentence', async () => {
    await openOnTheChatPage()
    const pointed = await pointAt({ css: 'p', text: SECOND })
    await theSettledWord('the box does not say it is about a part of a message')
    expect(pointed.what, 'the box does not name the sentence').toBe(SECOND)
    const stored = await saveAndReadBack('Which lid was this?')
    expect(stored?.target, 'the comment was not stored against the sentence').toEqual({
      kind: 'region',
      recordId: messageId,
      regionId: `data.body@${String(SECOND_AT)}`,
    })
  }, 120_000)

  it('on a picture takes that picture', async () => {
    const pointed = await pointAt({ css: 'img' })
    await theSettledWord('the box does not say it is about a part of a message')
    expect(pointed.what, 'the box does not name the picture').toBe(WHAT_IT_SHOWS)
    const stored = await saveAndReadBack('Is this the new kettle?')
    expect(stored?.target, 'the comment was not stored against the picture').toEqual({
      kind: 'region',
      recordId: messageId,
      regionId: 'data.pictures[#p-1].path',
    })
  }, 120_000)

  it('on a quoted line takes that quoted line', async () => {
    const pointed = await pointAt({ css: 'blockquote' })
    expect(pointed.what, 'the box does not name the quoted line').toBe(QUOTED)
    const stored = await saveAndReadBack('Where is this log?')
    expect(stored?.target, 'the comment was not stored against the quoted line').toEqual({
      kind: 'region',
      recordId: messageId,
      regionId: `data.body@${String(QUOTED_AT)}`,
    })
  }, 120_000)

  it('on a quote block above the words takes that quote', async () => {
    const second = await pointAt({ css: '.px-chat-quote', text: POINTED_TWO, in: SAYS_WITH_TWO })
    await theSettledWord('the box does not say it is about a part of a message')
    expect(second.what, 'the box does not name the quote').toBe(POINTED_TWO)
    expect(await saveAndReadBack('Why did the steam stop?'), 'the comment was not stored against the second quote').toMatchObject({
      target: { kind: 'region', recordId: withTwoId, regionId: 'data.quotes[1]' },
    })
    const single = await pointAt({ css: '.px-chat-quote', in: SAYS_WITH_ONE })
    expect(single.what, 'the box does not name the quote').toBe(POINTED_THREE)
    expect(await saveAndReadBack('Four seconds is slow.'), 'the comment was not stored against the quote').toMatchObject({
      target: { kind: 'region', recordId: withOneId, regionId: 'data.target' },
    })
    // THE FRAME IS ROUND THE QUOTE BLOCK, because a quote names no characters of its own.
    const framed = await pointAt({ css: '.px-chat-quote', text: POINTED_ONE, in: SAYS_WITH_TWO })
    expect(framed.marks.length, 'no frame was drawn round the quote').toBe(1)
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(framed.marks[0]?.box[edge], `the frame's ${edge} edge is not the quote's`).toBeCloseTo(framed.part[edge], 0)
    }
  }, 120_000)

  it("on the message's own frame, outside any part, takes the whole message", async () => {
    await pointAt({ css: '.px-chat-foot' })
    const stored = await saveAndReadBack('This whole message is about the old kettle.')
    // THE MESSAGE'S OWN HOME IS THE MESSAGE CENTRE: a message belongs to no project.
    expect(stored?.target, 'the comment was not stored against the whole message').toEqual({
      kind: 'record',
      recordId: messageId,
      workspaceId: 'message-centre',
    })
  }, 120_000)

  it("draws the frame round the picture inside the chat's list, and keeps it there when the list scrolls", async () => {
    const pointed = await pointAt({ css: 'img' })
    const picture = (await readTheMark({ css: '.px-chat-pic' })).part
    expect(pointed.marks.length, 'no frame was drawn').toBe(1)
    const frame = pointed.marks[0]?.box ?? { left: 0, top: 0, right: 0, bottom: 0 }
    for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
      expect(frame[edge], `the frame's ${edge} edge is not the picture's`).toBeCloseTo(picture[edge], 0)
    }
    expect(inside(frame, pointed.list), 'the frame is outside the chat list').toBe(true)

    // SCROLL THE LIST BACK SO THE PICTURE IS HALF BELOW ITS BOTTOM EDGE. The message is the newest,
    // so the list cannot scroll further down than it is.
    await app.page.evaluate(
      ({ bubble }) => {
        const holder = [...document.querySelectorAll('.px-chat-said .px-chat-bubble')].find((one) =>
          (one.textContent ?? '').includes(bubble),
        )
        const shown = holder?.querySelector('.px-chat-pic')
        const list = shown?.closest('.px-chat-said')
        if (shown === null || shown === undefined || list === null || list === undefined) throw new Error('no picture')
        const at = shown.getBoundingClientRect()
        list.scrollTop += at.top + at.height / 2 - list.getBoundingClientRect().bottom
      },
      { bubble: FIRST },
    )
    const scrolled = await readTheMark({ css: '.px-chat-pic' })
    expect(scrolled.part.bottom, 'the picture did not scroll half out of the list').toBeGreaterThan(scrolled.list.bottom)
    expect(scrolled.part.top, 'the picture scrolled wholly out of the list').toBeLessThan(scrolled.list.bottom)
    expect(scrolled.marks.length, 'the frame went when the list scrolled').toBe(1)
    const moved = scrolled.marks[0]?.box ?? scrolled.part
    expect(
      inside(moved, scrolled.list),
      `the frame ${JSON.stringify(moved)} hangs outside the chat list ${JSON.stringify(scrolled.list)}`,
    ).toBe(true)
    expect(moved.top, 'the frame did not move with the picture').toBeCloseTo(scrolled.part.top, 0)
    expect(moved.left, 'the frame did not stay round the picture').toBeCloseTo(scrolled.part.left, 0)
    await closeTheBox()
  }, 120_000)

  it('in the corner chat draws the frame in the panel, round the picture', async () => {
    await openInTheCorner()
    const pointed = await pointAt({ css: 'img' })
    const picture = (await readTheMark({ css: '.px-chat-pic' })).part
    expect(pointed.marks.length, 'no frame was drawn').toBe(1)
    expect(pointed.marks[0]?.inAFixedPanel, 'the frame is drawn on the page under the corner chat').toBe(true)
    expect(inside(pointed.marks[0]?.box ?? picture, pointed.list), 'the frame is outside the chat list').toBe(true)
    expect(pointed.marks[0]?.box.bottom, 'the frame is not round the picture').toBeCloseTo(picture.bottom, 0)
    await closeTheBox()
  }, 120_000)

  it.skipIf(!process.env['CHAT_POINT_SHOTS'])(
    'leaves a picture taken on the chat page for the two looks, the four widths and the two languages',
    async () => {
      const shots = process.env['CHAT_POINT_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const takes: { width: number; theme: 'light' | 'dark'; language: string | null }[] = [
        ...[1440, 990, 660, 390].flatMap((width) =>
          (['light', 'dark'] as const).map((theme) => ({ width, theme, language: null })),
        ),
        { width: 1440, theme: 'light', language: 'zh' },
        { width: 1440, theme: 'dark', language: 'zh' },
        { width: 1440, theme: 'light', language: 'xx' },
      ]
      for (const take of takes) {
        await app.page.setViewportSize({ width: take.width, height: 900 })
        await app.page.goto(`${app.site}/#/chat`, { timeout: 60_000 })
        await app.page.evaluate((theme) => {
          localStorage.setItem('mole-office.preset.theme', theme)
        }, take.theme)
        // A NEW DOCUMENT, so the look just stored is the one the page starts in.
        await app.page.goto('about:blank')
        await openOnTheChatPage(take.language)
        expect(await app.page.locator('html').getAttribute('data-theme'), `${String(take.width)} ${take.theme}`).toBe(take.theme)
        const pointed = await pointAt({ css: 'img' })
        expect(pointed.marks.length, `${String(take.width)} ${take.theme}: no frame`).toBe(1)
        if (take.language === 'zh') await theSettledWord('the box names the part in English', '消息的一部分')
        const language = take.language === null ? '' : `-${take.language}`
        await app.page.screenshot({ path: join(shots, `chat-point-${String(take.width)}-${take.theme}${language}.png`) })
        await closeTheBox()
      }
    },
    600_000,
  )
})
