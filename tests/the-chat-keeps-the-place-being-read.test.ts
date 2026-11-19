// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT KEEPS THE PLACE BEING READ WHERE IT IS ON THE SCREEN, WHATEVER CHANGES SIZE. Wave 13y round 148, item 108.
 *
 * The owner's rule: the place being read stays where it is on the screen when the chat's width or height changes, when
 * the window changes, when pictures and the names of linked records finish loading, and when older messages load
 * above. At the very bottom the place being read is the newest message, so new messages still come into view.
 *
 * WHAT MOVED IT, measured in this round with the last case below, on this file's made-up office. Opening a conversation
 * did not move the list by itself: a reader who did nothing stayed at the newest message in every frame. A reader who
 * began to scroll up just after opening was moved twice. When the pictures landed, the reader was put back at the
 * bottom, because a picture's loading box is taller than the picture: the content above shrank, the list was pushed
 * past its end and then held there. When the record names landed, the rows above grew, and the place being read slid
 * by about 1,150 pixels. Dragging the width while scrolled up put the reader at the bottom in the same way. The chat
 * held the list's top still while the reader was above the bottom, so anything above that changed height moved what
 * the reader saw. The first version of the change lost the place one more way, which its film of a width drag showed
 * and case 4 did not: as the width was dragged out the rows got shorter, the browser pulled the list back to its new
 * end, and the chat read that pull as the reader going to the bottom. It did so from every height from 100 to 1,100
 * pixels above the newest message, and case 4 starts 1,200 pixels up.
 *
 * THE PLACE BEING READ is the message across the middle of the list. It keeps its distance from the edge of the list that
 * stayed where it was, so it stays where it is on the screen. Neither grip of the corner panel moves the list's bottom
 * edge. The mark saying new messages are below sits under the list, so it moves only the bottom edge. When the window
 * changes size, the panel goes with the window's bottom corner and both edges move; then the place keeps its distance
 * from the bottom edge.
 *
 * In a real browser against a Mole Office of its own, each case reads the list in every frame the browser paints, the
 * way tests/the-chat-lands-once-and-keeps-the-readers-place.test.ts does:
 *  1. A reader who does nothing after opening stays at the newest message while pictures and names land.
 *  2. A reader who scrolled up just after opening stays where they are when the pictures land.
 *  3. The same when the names of linked records land.
 *  4. Dragging the width out and back while scrolled up keeps the place.
 *  5. Dragging the height, by the top edge, while scrolled up keeps the place.
 *  6. The window getting smaller and larger while scrolled up keeps the place.
 *  7. Older messages put above keep the place.
 *  8. At the very bottom, dragging the width keeps the newest message in view, and a new message comes into view.
 *  9. A message that arrives while the reader is scrolled up draws the mark under the list, and the place being read
 *     stays where it is in the window.
 * 10. Dragging the width out and back from 100, 300, 500, 700, 900 and 1,100 pixels above the newest message keeps the
 *     place.
 * 11. At the very bottom of the chat page and of the corner panel, a message the person sends is in view from the press,
 *     while it is being written and after. Found by the line's secretary in a film of the chat at 1440: before it was
 *     written, the message was drawn about 68 pixels below the foot of the list. That was on the chat page, where the
 *     list does not change size when the message is put in it.
 * 12. At the very bottom of the chat page and of the corner panel, typing one key at a time, onto a second and a third
 *     line of the box, keeps the newest message where it is above the list's bottom edge, and the list at its end. The
 *     owner reported in round 162 that while they typed, the messages above jumped up and down and part of them was
 *     covered. Measured in that round: each key after the box had grown a line measured the box at one line again, so
 *     for that moment the list was a line taller and the browser pulled it back by 13 pixels, and the chat read the pull
 *     as the reader moving up. From then on the newest message went further under the foot of the list with each line
 *     the box grew.
 * 13. After the person is added to a group that keeps receiving lines, a scroll up with the wheel stays where the reader
 *     put it, and a line that comes after draws the mark under the list. The owner reported in round 162 that after
 *     being added to a chat, the chat was sometimes held in one place, and a scroll with the wheel or a drag was pulled
 *     back.
 * 14. The same with a drag of the list's own scroll bar.
 * 15. At the very bottom of the chat page, a row that gets 20 pixels shorter, and then 492 pixels taller than it was,
 *     before the next frame leaves the list at its end. Measured in round 162, in 3 of 48 openings of the chat page: what
 *     the list held got shorter, the browser pulled the list back to its new end, and the list grew before the scroll
 *     that pull fires was read. The chat read the pull as the reader moving up, 512 pixels above the end in all three,
 *     and from then on held the list away from its end. In two of them the list had got 20 pixels shorter and then 512
 *     taller. The case makes the same changes in one task, so it does not wait for an opening to make them.
 * 16. At the very bottom of the chat page, a scroll up by the wheel, a drag of the list's scroll bar, and a finger drawn
 *     down the list at 390 wide, stay where the reader put them when the newest row gets 300 pixels taller in the same
 *     frame. Measured in round 163: the browser fires a scroll in a frame, and the chat reads it there, before that
 *     frame's layout has told it that a row changed size. At the newest message the chat read every such scroll as the
 *     pull of case 15, and put the list back at its end: in 8 of 8 tries with the wheel, the row grown in the wheel's own
 *     task in 4 and as the scroll was fired in 4, in 2 of 2 with the bar, and in 2 of 2 by touch. The case grows the row
 *     in a listener that runs before the chat's own, so the change is in the frame of the reader's first scroll without
 *     timing luck. The touches are sent one at a time, because the browser's own scroll gesture by touch did not scroll
 *     the list in 6 tries. A new message arriving as the wheel turned did the same only with timing luck, so it is not a
 *     case here: with the wheel sent from 24 milliseconds before the agent's write to 23 after it, one millisecond apart,
 *     the list went back to its end in 4 of 48 tries. In each the message was put in, and no frame was painted, before
 *     the wheel's scroll was read from the old end. With the wheel sent 0 to 69 milliseconds after the write, it did not
 *     happen in 48 tries.
 * 17. At the very bottom of the chat page, after the reader scrolls up by the wheel and back to the very bottom by the
 *     wheel, the change of case 15 leaves the list at its end. Measured in round 163, in 4 of 4 tries: the reader's own
 *     scroll to the bottom left the chat with no place where it had put the list, so nothing told the pull from the
 *     reader, and the list was held 512 pixels above its end.
 * Cases 13 and 14 run in a browser of their own, started the way a screen scaled to 125 % starts it, with its scroll
 * bars drawn. That browser keeps the list's end on a pixel of the screen, and those are four fifths of a page's pixel
 * apart, while scrollHeight and clientHeight are whole pixels. Measured in round 162: scrollTop at the end was then up
 * to a pixel past scrollHeight - clientHeight, and in such a list every step of the reader's scroll was put back at the
 * newest line in the same frame. Which list that is depends on its height, so the group keeps receiving lines until its
 * end reads more than half a pixel past its range. The browser the other cases share draws no scroll bars, and a scale
 * emulated in it measured whole pixels.
 * "Keeps the place" is: in every painted frame, the message that was across the middle is drawn within one pixel of the
 * same distance from the list's bottom edge, and the list is never put back at the bottom. In cases 9, 13 and 14 it is
 * within one pixel of the same height in the window; in 13 and 14 from the moment the reader stops, and the list is not
 * back at the bottom in any frame after the scroll first took it away. In case 10 the shorter rows can leave less below
 * the message than the room under its place. A frame may then have the list at its end with the message lower than its
 * place, as near as the list can go; the last frame has the message back in its place, and the list is not at the
 * bottom. In case 12 the message followed is the newest one, and the list stays within a pixel of its end. In case 15
 * the list stays within a pixel of its end. In case 16 the list is not at the bottom in any frame from the reader's first
 * scroll on; after the wheel, the message that was across the middle at that scroll stays within one pixel of the same
 * height in the window, and while the bar is dragged up or the finger drawn down it never goes up the window by more
 * than a pixel. In case 17 the list stays within a pixel of its end.
 *
 * THE FILMS are taken only when W13Y_CHAT_FILM names a folder outside the checkout, with W13Y_CHAT_FILM_LABEL saying
 * which code they show: opening a conversation and scrolling up while the pictures and names land, dragging the width
 * while scrolled up, sending a message from the very bottom of the chat page, typing at the very bottom of the chat
 * page at 1440 and at 390, and being added to a group at 1440 and at 390 and then scrolling up with the wheel and with
 * the bar while lines arrive. The films of the group are taken in the browser of cases 13 and 14. They are of made-up
 * data, and they carry the label that says so.
 *
 * THE MEASURING CASE runs only when W13Y_CHAT_PROBE names a folder outside the checkout. It writes what each source did
 * to the list, frame by frame, into item108-probe.json.
 *
 * Everything here is made up.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'
import type { Browser, BrowserContext, Page } from 'playwright'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { NEAR_THE_TOP } from '../src/web/lib/conversationpages.ts'
import { OPEN_AT, groupOpenKey } from '../src/web/lib/open-chat.ts'
import { isARecordId, participantKey } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { name: 'Made-up Reading Agent', handle: 'made-up-reading-agent' }
const AS_THE_AGENT = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
/** The other member of the groups of cases 13 and 14. */
const SECOND = { name: 'Made-up Second Agent', handle: 'made-up-second-agent' }
const AS_THE_SECOND = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECOND.handle }
/** Words typed one key at a time: long enough to wrap onto a second and a third line of the box, at 1440 and at 390. */
const TYPED = 'Made-up words typed one key at a time at the very bottom of the conversation, long enough to wrap onto a second line of the box and then onto a third, so each line the box grows by is seen.'
const film = process.env.W13Y_CHAT_FILM
const LABEL = 'Made-up data — an invented office, not real office data'
/**
 * THE FIRST BLOCK OF THE PAGE THAT IS DRAWN, which the label goes above. Ahead of the page's own blocks is the holder of
 * the strip that says the page is being read again, and while nothing is being read that holder has no size.
 */
const THE_PAGE_TOP = '#main > *:not([data-made-up-label]):not(style):visible'
/** Two full pages of fifty and part of a third, so older messages load above. */
const MESSAGES = 130
/** Eight pixels is the bottom, as the chat itself counts it. */
const BOTTOM_PX = 8
/** How long pictures and names are held back, long enough that the reader has stopped before they land. */
const HELD_MS = 4_000
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let app: LiveApp
let agentKey = ''
let agentId = ''
/** This file's own folder for its pictures, in the checkout's .logs, because the file door serves only from a preview root. */
let OURS = ''

/** A real png of one colour, so a picture has its height only once its bytes have come. */
function aPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, sum])
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8
  head[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

async function say(headers: Record<string, string>, data: Record<string, unknown>): Promise<void> {
  const body = String(data.body)
  const written = { kind: 'message', title: body.slice(0, 30), data }
  const said = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(written) })
  expect(said.status, await said.clone().text()).toBe(theAnswerToAWriteInATestOffice(headers, written))
}

/**
 * One painted frame: how far the list is from its bottom, and how far the row being followed is from the list's bottom
 * edge and from the window's top, or null where that row is not drawn. Null for the whole frame while there is no list.
 */
type Frame = { t: number; gap: number; at: number | null; onScreen: number | null; width: number; height: number; middle: string } | null

/**
 * READ THE LIST IN EVERY FRAME, IMMEDIATELY BEFORE IT IS PAINTED, as tests/the-chat-lands-once-and-keeps-the-readers-place.test.ts
 * does and for its reasons: a resize observer made in the frame's callback is the newest, so the browser calls it after
 * the page's own, after the frame's layout, and no task runs between it and the paint. The row followed is the one
 * whose words begin with `listFollows`.
 */
function theWatcher(): void {
  const w = window as unknown as { listFrames: unknown[]; listWatched: boolean; listFrom: number; listFollows: string }
  w.listFrames = []
  w.listFrom = performance.now()
  if (w.listWatched) return
  w.listWatched = true
  const read = (): void => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    if (list === null) {
      w.listFrames.push(null)
      return
    }
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    let across = ''
    let at: number | null = null
    let onScreen: number | null = null
    for (const row of list.querySelectorAll<HTMLElement>(':scope > li')) {
      const its = row.getBoundingClientRect()
      const words = /^Made-up line \d+\./.exec(row.querySelector('.px-chat-words')?.textContent ?? '')?.[0] ?? ''
      if (across === '' && its.bottom >= middle) across = words
      if (words !== '' && words === w.listFollows) {
        at = Math.round(box.bottom - its.top)
        onScreen = Math.round(its.top)
      }
    }
    w.listFrames.push({
      t: Math.round(performance.now() - w.listFrom),
      gap: Math.round(list.scrollHeight - list.clientHeight - list.scrollTop),
      at,
      onScreen,
      width: Math.round(box.width),
      height: Math.round(box.height),
      middle: across,
    })
  }
  const tick = (): void => {
    if (!w.listWatched) return
    const atThePaint = new ResizeObserver(() => {
      atThePaint.disconnect()
      read()
    })
    atThePaint.observe(document.documentElement)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** Start reading every frame, following the row with these words. */
async function watch(page: Page, follows = ''): Promise<void> {
  await page.evaluate((words) => {
    ;(window as unknown as { listFollows: string }).listFollows = words
  }, follows)
  await page.evaluate(theWatcher)
}

async function theFrames(on: Page): Promise<NonNullable<Frame>[]> {
  const frames = (await on.evaluate(() => {
    const w = window as unknown as { listFrames: unknown[]; listWatched: boolean }
    w.listWatched = false
    return w.listFrames
  })) as Frame[]
  return frames.filter((one): one is NonNullable<Frame> => one !== null)
}

/** The frames as lines, one line for each change, for a failure to show what was painted. */
function told(frames: NonNullable<Frame>[]): string {
  const out: string[] = []
  let last = ''
  for (const f of frames) {
    const one = `gap ${String(f.gap)} followed row ${f.at === null ? 'not drawn' : `${String(f.at)} px above the bottom edge, ${String(f.onScreen)} px from the window's top`} list ${String(f.width)}x${String(f.height)} middle ${f.middle}`
    if (one !== last) out.push(`@${String(f.t)}ms ${one}`)
    last = one
  }
  return out.join('\n')
}

/**
 * The message across the middle of the list: its first words, how far its top is above the list's bottom edge, and how
 * far it is from the window's top.
 */
async function theRowBeingRead(page: Page): Promise<{ words: string; at: number; onScreen: number }> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    if (list === null) throw new Error('no list')
    const box = list.getBoundingClientRect()
    const middle = box.top + box.height / 2
    for (const row of list.querySelectorAll<HTMLElement>(':scope > li')) {
      const its = row.getBoundingClientRect()
      const words = /^Made-up line \d+\./.exec(row.querySelector('.px-chat-words')?.textContent ?? '')?.[0] ?? ''
      if (words !== '' && its.bottom >= middle) return { words, at: Math.round(box.bottom - its.top), onScreen: Math.round(its.top) }
    }
    throw new Error('no message reaches the middle of the list')
  })
}

/**
 * What is held back, and for how long: so many milliseconds, or until the case lets it go. A case lets go once the
 * reader has stopped, so what was held lands after that without the case waiting out a time.
 */
type Slow = { pictures: number | 'until let go'; names: number | 'until let go' }

/**
 * How wide a window is, and the browser it opens in: the one every case shares, or one of a case's own, whose window
 * already has its size and its scale from the way it was started.
 */
type Where = { width: number; browser: Browser | null; touch?: true }

/**
 * Open a window in which the chat is closed and set on the made-up agent's conversation, with these reads held back.
 * `letGo` lets go of what is held until let go, and nothing asked for after it is held.
 */
async function aWindow(slow: Slow, filmed = false, where: Where = { width: 1440, browser: null }): Promise<{ context: BrowserContext; page: Page; letGo: () => void }> {
  const size = { width: where.width, height: 1000 }
  const context = await (where.browser ?? app.browser).newContext({
    viewport: where.browser === null ? size : null,
    ...(where.touch === true ? { hasTouch: true } : {}),
    ...(!filmed || film === undefined ? {} : { recordVideo: { dir: join(film, 'films'), size } }),
  })
  await context.addInitScript((key) => {
    if (sessionStorage.getItem('chat-test-set') === 'yes') return
    sessionStorage.setItem('chat-test-set', 'yes')
    localStorage.setItem('mole-office.preset.theme', 'light')
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', 'default')
    localStorage.setItem('mole-office.chat.open', 'no')
    localStorage.setItem('mole-office.chat.with', key)
  }, agentKey)
  // THE FILM BLURS THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, because it names the machine this test runs
  // on. The blur draws nothing new and moves nothing.
  if (filmed) {
    await context.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '.px-chat-from { filter: blur(5px); }'
        document.head.append(style)
      })
    })
  }
  const page = await context.newPage()
  const held: (() => void)[] = []
  let gone = false
  const hold = async (how: number | 'until let go', pattern: RegExp): Promise<void> => {
    if (how !== 'until let go' && how <= 0) return
    await page.route(pattern, async (route) => {
      if (how !== 'until let go') await new Promise((done) => setTimeout(done, how))
      else if (!gone) await new Promise<void>((done) => held.push(done))
      await route.continue().catch(() => undefined)
    })
  }
  const letGo = (): void => {
    gone = true
    for (const done of held.splice(0)) done()
  }
  await page.goto(`${app.site}/?lang=en#/`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  if (filmed) {
    const top = page.locator(THE_PAGE_TOP).first()
    await top.waitFor({ timeout: 30_000 })
    await putTheMadeUpLabelIn(page, LABEL, top, 'the-chat-keeps-the-place-being-read')
  }
  await hold(slow.pictures, /\/api\/file\?/)
  await hold(slow.names, /\/api\/short-forms\/rows/)
  return { context, page, letGo }
}

/**
 * Press the circle, and wait for the conversation's first page to be drawn. The circle opens the chat beside the page.
 * Only the chat's own window has grips that drag its size, so a case that drags them puts the chat there with the seam's
 * press, the way the person does.
 */
async function openTheConversation(page: Page, where: 'beside the page' | 'in its own window' = 'beside the page'): Promise<void> {
  await page.click('.px-chat-circle')
  if (where === 'in its own window') await page.click('.px-chat-seam-window')
  await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length >= n, 50, { timeout: 30_000 })
}

/** Go to the chat's own page, which opens on the same conversation, and wait for its first page to be drawn. */
async function openTheChatPage(page: Page): Promise<void> {
  await page.goto(`${app.site}/?lang=en#/chat`, { timeout: 60_000 })
  await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length >= n, 50, { timeout: 30_000 })
}

/**
 * How many pictures are still loading, and how many record names have not come, in the list.
 *
 * A name that has not come is either the chat's own link marked "no", or an id the shared inline reading
 * has not had an answer for yet, marked "reading".
 */
async function stillComing(page: Page): Promise<{ pictures: number; names: number }> {
  return page.evaluate(() => ({
    pictures: document.querySelectorAll('.px-chat-said .sb-image-stand').length,
    names: document.querySelectorAll('.px-chat-said a.px-chat-link[data-named="no"], .px-chat-said [data-named="reading"]').length,
  }))
}

async function untilEverythingHasCome(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll('.px-chat-said .sb-image-stand, .px-chat-said a.px-chat-link[data-named="no"], .px-chat-said [data-named="reading"]').length === 0,
    undefined,
    { timeout: 30_000 },
  )
}

async function pointAtTheList(page: Page): Promise<void> {
  const box = await page.locator('.px-chat-said').boundingBox()
  if (box === null) throw new Error('no list')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
}

/** The reader's small steps up, as a trackpad sends them: four pixels at a time, 160 pixels in all. */
async function smallStepsUp(page: Page): Promise<void> {
  for (let n = 0; n < 40; n++) {
    await page.mouse.wheel(0, -4)
    await page.waitForTimeout(16)
  }
}

/** Every frame keeps the row followed where it was, and none is back at the bottom. */
function expectThePlaceKept(frames: NonNullable<Frame>[], reading: { words: string; at: number }): void {
  expect(frames.length, 'no frame was painted').toBeGreaterThan(0)
  const moved = frames.filter((one) => one.at === null || Math.abs(one.at - reading.at) > 1)
  expect(moved, `${reading.words} was ${String(reading.at)} px above the bottom edge\n${told(frames)}`).toEqual([])
  expect(frames.filter((one) => one.gap <= BOTTOM_PX), `put back at the bottom\n${told(frames)}`).toEqual([])
}

/** How much one measure of the list changed across these frames. */
function howMuch(frames: NonNullable<Frame>[], measure: 'width' | 'height'): number {
  return Math.max(...frames.map((one) => one[measure])) - Math.min(...frames.map((one) => one[measure]))
}

/** Drag one of the grips of the chat's own window by this much and back, in steps, so many frames are painted on the way. */
async function dragTheGrip(page: Page, edge: 'left' | 'top', dx: number, dy: number): Promise<void> {
  const grip = await page.locator(`.px-chat-grip[data-edge="${edge}"]`).boundingBox()
  if (grip === null) throw new Error(`no ${edge} edge`)
  const x = grip.x + grip.width / 2
  const y = grip.y + grip.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 15 })
  await page.waitForTimeout(400)
  await page.mouse.move(x, y, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(800)
}

/**
 * Type these words and press Send, with the write held back until the message being sent has been drawn for so many
 * milliseconds, so it is drawn for that long before it is written. Wait until the written row has taken the place of the
 * one being sent.
 */
async function sendWithTheWriteHeld(page: Page, words: string, drawnFor: number): Promise<void> {
  let letTheWriteGo!: () => void
  const theWrite = new Promise<void>((done) => {
    letTheWriteGo = done
  })
  await page.route('**/api/records', async (route) => {
    if (route.request().method() === 'POST') await theWrite
    await route.continue().catch(() => undefined)
  })
  await page.fill('.px-chat-write textarea', words)
  await page.click('.px-chat-send')
  await page.waitForSelector('.px-chat-said .px-chat-bubble[data-send-state="sending"]', { timeout: 10_000 })
  await page.waitForTimeout(drawnFor)
  letTheWriteGo()
  await page.waitForFunction(
    (sent) =>
      document.querySelector('.px-chat-said .px-chat-bubble[data-send-state="sending"], .px-chat-said .px-chat-bubble[data-send-state="sent"]') === null &&
      [...document.querySelectorAll('.px-chat-said .px-chat-words')].some((one) => (one.textContent ?? '').startsWith(sent)),
    words,
    { timeout: 30_000 },
  )
}

/** Open the conversation with nothing held back, let everything land, and scroll up 1,200 pixels. */
async function scrolledUpAfterEverythingCame(
  page: Page,
  where: 'beside the page' | 'in its own window' = 'beside the page',
): Promise<{ words: string; at: number; onScreen: number }> {
  await openTheConversation(page, where)
  await untilEverythingHasCome(page)
  await page.waitForTimeout(1_000)
  await pointAtTheList(page)
  await page.mouse.wheel(0, -1_200)
  await page.waitForTimeout(800)
  return theRowBeingRead(page)
}

/** The first words of the newest message drawn. */
async function theNewestLine(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const row of [...document.querySelectorAll<HTMLElement>('.px-chat-said > li')].reverse()) {
      const words = /^Made-up line \d+\./.exec(row.querySelector('.px-chat-words')?.textContent ?? '')?.[0]
      if (words !== undefined) return words
    }
    throw new Error('no message is drawn')
  })
}

async function theBoxHeight(page: Page): Promise<number> {
  return page.locator('.px-chat-write textarea').evaluate((box) => box.getBoundingClientRect().height)
}

/** Follow the row with these words from now on, in the frames already being read. Answers the time it was named. */
async function follow(page: Page, words: string): Promise<number> {
  return page.evaluate((one) => {
    const w = window as unknown as { listFollows: string; listFrom: number }
    w.listFollows = one
    return Math.round(performance.now() - w.listFrom)
  }, words)
}

/**
 * A BROWSER OF A CASE'S OWN, started the way a screen scaled to 125 % starts it, with its scroll bars drawn. It is the
 * browser the shared one is, started with two more words; its window is this wide and 1,000 pixels high.
 */
async function aScaledBrowser(width: number): Promise<Browser> {
  const { chromium } = await import('playwright')
  return chromium.launch({ args: ['--force-device-scale-factor=1.25', `--window-size=${String(width)},1000`], ignoreDefaultArgs: ['--hide-scrollbars'] })
}

let theSecondAgent: Promise<void> | null = null

/** A group of the made-up agent and a second one, with sixty lines in it numbered from `from`, and the person not in it. */
async function aGroupOfSixtyLines(from: number): Promise<string> {
  theSecondAgent ??= (async () => {
    const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: SECOND.name, data: { handle: SECOND.handle, runtime: 'claude-code', state: 'active' } }) })
    expect(filed.status, await filed.clone().text()).toBe(201)
  })()
  await theSecondAgent
  const made = await fetch(`${app.api}/api/groups`, {
    method: 'POST',
    headers: PERSON,
    body: JSON.stringify({
      name: `Made-up kiln group ${String(from)}`,
      because: 'Two made-up agents talk about the kiln.',
      members: [
        { who: { kind: 'agent', id: AGENT.handle }, because: 'It holds the made-up kiln log.' },
        { who: { kind: 'agent', id: SECOND.handle }, because: 'It checks the made-up kiln log.' },
      ],
    }),
  })
  expect(made.status, await made.clone().text()).toBe(201)
  const group = ((await made.json()) as { group: { id: string } }).group.id
  for (let n = from; n < from + 60; n += 1) {
    const long = (n - from + 1) % 3 === 0 ? ' The made-up kiln log for this line runs on, so the row takes three or four lines of the panel and the list is long enough to scroll a good way.' : ''
    await say(n % 2 === 0 ? AS_THE_AGENT : AS_THE_SECOND, { body: `Made-up line ${String(n)}.${long}`, toGroup: group })
  }
  return group
}

/** Line `n` comes into the group, and is drawn. */
async function aLineArrives(page: Page, group: string, n: number, words = 'A new line in the group.'): Promise<void> {
  await say(n % 2 === 0 ? AS_THE_AGENT : AS_THE_SECOND, { body: `Made-up line ${String(n)}. ${words}`, toGroup: group })
  await page.waitForFunction(
    (line) => [...document.querySelectorAll('.px-chat-said .px-chat-words')].some((one) => (one.textContent ?? '').startsWith(line)),
    `Made-up line ${String(n)}.`,
    { timeout: 30_000 },
  )
  await page.waitForTimeout(300)
}

/** How far scrollTop is past scrollHeight - clientHeight. */
async function pastItsRange(page: Page): Promise<number> {
  return page.locator('.px-chat-said').evaluate((list) => list.scrollTop - (list.scrollHeight - list.clientHeight))
}

/**
 * Lines come into the group, numbered from `next`, until the list's end reads more than half a pixel past its range, and
 * at most twelve. Answers the number of the line after them.
 */
async function untilItsEndReadsPast(page: Page, group: string, next: number): Promise<number> {
  let n = next
  for (let tries = 0; tries < 12 && (await pastItsRange(page)) <= 0.5; tries++) {
    await aLineArrives(page, group, n)
    n += 1
  }
  return n
}

/**
 * Open a group of sixty lines the person is not in, as a press on it from another page opens it, and add the person to
 * it. The group then keeps receiving lines until the list's end reads more than half a pixel past its range, which a
 * case needs and a film only tries for. Answers the group and the number of its next line.
 */
async function addedToAGroup(page: Page, from: number, needsItPast = true): Promise<{ group: string; next: number }> {
  const group = await aGroupOfSixtyLines(from)
  await page.evaluate(([name, key]) => window.dispatchEvent(new CustomEvent(name, { detail: key })), [OPEN_AT, groupOpenKey(group)] as const)
  await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length >= n, 40, { timeout: 30_000 })
  await page.waitForTimeout(1_000)
  const added = await fetch(`${app.api}/api/groups/${group}/members`, { method: 'POST', headers: PERSON, body: JSON.stringify({ who: { kind: 'person', id: THE_PERSON }, because: 'The person is added to the made-up group.' }) })
  expect(added.status, await added.clone().text()).toBe(200)
  await page.waitForSelector('.px-chat-write textarea', { timeout: 15_000 })
  await page.waitForTimeout(1_000)
  const next = await untilItsEndReadsPast(page, group, from + 60)
  // THE LIST'S END READS PAST ITS RANGE, or this case would test nothing.
  if (needsItPast) expect(await pastItsRange(page), "the list's end never read more than half a pixel past its range").toBeGreaterThan(0.5)
  return { group, next }
}

/**
 * Drag the list's own scroll bar up by this many pixels, in steps, from the middle of its thumb. The bar's track is the
 * list's height less an arrow as thick as the bar at each end; the thumb is as long as the share of the list in view,
 * and no shorter than twenty pixels, and sits as far down the track as the list is scrolled.
 */
async function dragTheBar(page: Page, dy: number): Promise<void> {
  const bar = await page.locator('.px-chat-said').evaluate((list: HTMLElement) => {
    const box = list.getBoundingClientRect()
    return { top: box.top, right: box.right, height: box.height, thickness: list.offsetWidth - list.clientWidth, down: list.scrollTop / (list.scrollHeight - list.clientHeight), shown: list.clientHeight / list.scrollHeight }
  })
  expect(bar.thickness, 'the list draws no scroll bar to drag').toBeGreaterThan(0)
  const track = bar.height - 2 * bar.thickness
  const thumb = Math.max(track * bar.shown, 20)
  const x = bar.right - bar.thickness / 2
  const y = bar.top + bar.thickness + (track - thumb) * Math.min(bar.down, 1) + thumb / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let n = 1; n <= 10; n++) {
    await page.mouse.move(x, y - (dy * n) / 10)
    await page.waitForTimeout(50)
  }
  await page.mouse.up()
}

/**
 * From the reader's scroll on, the list is never back at the bottom; from the moment the row being read was named it
 * stays within one pixel of the same height in the window; and the mark says a line came below.
 */
async function expectTheScrollKept(page: Page, reading: { words: string; onScreen: number }, named: number): Promise<void> {
  const mark = await page.locator('.px-chat-new-below').count()
  const frames = await theFrames(page)
  const left = frames.findIndex((one) => one.gap > BOTTOM_PX)
  expect(left, `the list never left the newest line: each step of the scroll was put back\n${told(frames)}`).toBeGreaterThanOrEqual(0)
  expect(frames.slice(left).filter((one) => one.gap <= BOTTOM_PX), `put back at the bottom\n${told(frames)}`).toEqual([])
  const moved = frames.filter((one) => one.t >= named && (one.onScreen === null || Math.abs(one.onScreen - reading.onScreen) > 1))
  expect(moved, `${reading.words} was ${String(reading.onScreen)} px from the window's top\n${told(frames)}`).toEqual([])
  expect(mark, `no mark said a line came below\n${told(frames)}`).toBe(1)
}

/**
 * A FINGER ON THE LIST IS DRAWN DOWN BY THIS MANY PIXELS, thirty at a step and a step about every frame, and lifted.
 * The touches are sent one at a time, as tests/a-card-is-enlarged-by-dragging-its-edge.test.ts sends them, because the
 * browser's own scroll gesture by touch pressed and lifted the finger without scrolling the list in round 163.
 */
async function drawAFingerDown(page: Page, dy: number): Promise<void> {
  const box = await page.locator('.px-chat-said').boundingBox()
  if (box === null) throw new Error('no list')
  const x = Math.round(box.x + box.width / 2)
  const y = Math.round(box.y + box.height / 3)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let moved = 30; moved <= dy; moved += 30) {
    await page.waitForTimeout(16)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + moved }] })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Where the list is, and where its end is. */
type Read = { top: number; end: number }

/**
 * THE NEWEST ROW GETS 20 PIXELS SHORTER AND THEN 492 TALLER THAN IT WAS, in one task, so no frame comes between the
 * three steps. Reading `scrollTop` after the row got shorter makes the browser pull the list back to its new end then,
 * and the scroll that pull fires is read only in the next frame. It says where the list was before, after the pull and
 * after the row grew.
 */
async function aRowShorterThenMuchTaller(page: Page): Promise<{ before: Read; pulled: Read; after: Read }> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    const row = [...(list?.querySelectorAll<HTMLElement>(':scope > li') ?? [])].at(-1)
    if (list === null || row === undefined) throw new Error('no list')
    const read = (): { top: number; end: number } => ({ top: list.scrollTop, end: list.scrollHeight - list.clientHeight })
    const before = read()
    const height = row.getBoundingClientRect().height
    row.style.boxSizing = 'border-box'
    row.style.overflow = 'hidden'
    row.style.height = `${String(height - 20)}px`
    const pulled = read()
    row.style.height = `${String(height + 492)}px`
    return { before, pulled, after: read() }
  })
}

/** Case 15's judgement: the change happened, and the list is within a pixel of its end in every frame after it. */
function expectTheListAtItsEnd(changed: { before: Read; pulled: Read; after: Read }, frames: NonNullable<Frame>[]): void {
  const { before, pulled, after } = changed
  expect(before.end - before.top, 'the list was not at its end before the row changed').toBeLessThanOrEqual(1)
  expect(before.end - pulled.end, 'the row did not get shorter').toBe(20)
  expect(Math.abs(pulled.end - pulled.top), 'the browser did not pull the list to its new end').toBeLessThanOrEqual(1)
  expect(after.end - before.end, 'the row did not grow').toBe(492)
  expect(frames.length, 'no frame was painted').toBeGreaterThan(0)
  expect(frames.filter((one) => one.gap > 1), `the list left its end\n${told(frames)}`).toEqual([])
}

/** What the list was at the reader's first scroll, on the frames' clock, as the next function keeps it. */
type AtTheScroll = { t: number; words: string; onScreen: number; gap: number; grewBy: number }

/**
 * AT THE LIST'S NEXT SCROLL, THE NEWEST ROW GETS 300 PIXELS TALLER BEFORE THE CHAT READS THAT SCROLL. A listener on the
 * document in the capture phase runs before the chat's own, which is on the list, so the change is in the frame of the
 * reader's first scroll without timing luck. It names the message across the middle at that moment as the one the
 * frames follow, and keeps when that was, where that message was in the window, how far the list was from its end, and
 * how much the end grew.
 */
async function theNewestGrowsAtTheNextScroll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { listFollows: string; listFrom: number; atTheScroll: unknown }
    w.atTheScroll = null
    const list = document.querySelector<HTMLElement>('.px-chat-said')
    const newest = [...(list?.querySelectorAll<HTMLElement>(':scope > li') ?? [])].at(-1)
    if (list === null || newest === undefined) throw new Error('no list')
    const height = newest.getBoundingClientRect().height
    const once = (event: Event): void => {
      if (event.target !== list) return
      document.removeEventListener('scroll', once, true)
      const box = list.getBoundingClientRect()
      const middle = box.top + box.height / 2
      let words = ''
      let onScreen = 0
      for (const row of list.querySelectorAll<HTMLElement>(':scope > li')) {
        const its = row.getBoundingClientRect()
        const said = /^Made-up line \d+\./.exec(row.querySelector('.px-chat-words')?.textContent ?? '')?.[0] ?? ''
        if (said !== '' && its.bottom >= middle) {
          words = said
          onScreen = Math.round(its.top)
          break
        }
      }
      const end = list.scrollHeight - list.clientHeight
      newest.style.boxSizing = 'border-box'
      newest.style.overflow = 'hidden'
      newest.style.height = `${String(height + 300)}px`
      w.listFollows = words
      w.atTheScroll = { t: Math.round(performance.now() - w.listFrom), words, onScreen, gap: Math.round(end - list.scrollTop), grewBy: Math.round(list.scrollHeight - list.clientHeight - end) }
    }
    document.addEventListener('scroll', once, { capture: true, passive: true })
  })
}

async function whatWasAtTheScroll(page: Page): Promise<AtTheScroll | null> {
  return page.evaluate(() => (window as unknown as { atTheScroll: AtTheScroll | null }).atTheScroll)
}

beforeAll(async () => {
  mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
  OURS = mkdtempSync(join(CHECKOUT, '.logs', 'the-chat-keeps-the-place-'))
  app = await liveApp({ name: 'the-chat-keeps-the-place-being-read', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const filed = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }) })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const agents = ((await (await fetch(`${app.api}/api/participants`, { headers: PERSON })).json()) as { agents: { id: string; handle: string }[] }).agents
  agentId = agents.find((one) => one.handle === AGENT.handle)?.id ?? ''
  expect(agentId).not.toBe('')
  agentKey = participantKey({ kind: 'agent', id: agentId })
  // RECORDS TO LINK TO, each with a title long enough that its name drawn in a message takes more room than its id.
  const linked: string[] = []
  while (linked.length < 12) {
    const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers: PERSON, body: JSON.stringify({ kind: 'note', title: `Made-up note ${String(linked.length + 1)} about the kiln schedule and the glaze tests of the week`, data: { body: 'made up' } }) })
    expect(made.status, await made.clone().text()).toBe(201)
    const one = ((await made.json()) as { record: { id: string } }).record.id
    if (isARecordId(one)) linked.push(one)
  }
  // EVERY THIRD MESSAGE IS LONG, EVERY FOURTH NAMES TWO NOTES, AND EVERY NINTH CARRIES A PICTURE.
  for (let n = 1; n <= MESSAGES; n += 1) {
    const long = n % 3 === 0 ? ' The made-up kiln log for this line runs on, so the row takes three or four lines of the panel and the list is long enough to scroll a good way.' : ''
    const link = n % 4 === 0 ? ` See ${linked[(n / 4) % linked.length]} and ${linked[(n / 4 + 5) % linked.length]}.` : ''
    const data: Record<string, unknown> = { body: `Made-up line ${String(n)}.${long}${link}` }
    if (n % 9 === 0) {
      const path = join(OURS, `made-up-${String(n)}.png`)
      const third = (n / 9) % 3
      writeFileSync(path, aPng(640, 360, third === 0 ? [200, 120, 80] : third === 1 ? [80, 140, 200] : [120, 180, 100]))
      data.pictures = [{ id: 'p-1', type: 'image', path, alt: `A made-up block of colour, ${String(n)}` }]
    }
    if (n % 2 === 0) await say(AS_THE_AGENT, { ...data, to: [{ kind: 'person', id: THE_PERSON }] })
    else await say(PERSON, { ...data, to: [{ kind: 'agent', id: agentId }] })
  }
}, 600_000)

afterAll(async () => {
  await app?.stop()
  if (OURS !== '') rmSync(OURS, { recursive: true, force: true })
}, 60_000)

it('1. a reader who does nothing after opening stays at the newest message while the pictures and names land', async () => {
  const { context, page, letGo } = await aWindow({ pictures: 'until let go', names: 'until let go' })
  try {
    await watch(page)
    await openTheConversation(page)
    const coming = await stillComing(page)
    // THE PICTURES AND NAMES WERE STILL COMING WHEN THE LIST WAS DRAWN, or this case would test nothing.
    expect(coming.pictures, 'no picture was still loading').toBeGreaterThan(0)
    expect(coming.names, 'no name was still coming').toBeGreaterThan(0)
    letGo()
    await untilEverythingHasCome(page)
    await page.waitForTimeout(800)
    const frames = await theFrames(page)
    expect(frames.length, 'no frame was painted').toBeGreaterThan(0)
    expect(frames.filter((one) => one.gap > BOTTOM_PX), told(frames)).toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('2. a reader who scrolled up just after opening stays where they are when the pictures land', async () => {
  const { context, page } = await aWindow({ pictures: HELD_MS, names: 0 })
  try {
    await openTheConversation(page)
    await pointAtTheList(page)
    await page.waitForTimeout(300)
    await smallStepsUp(page)
    await page.waitForTimeout(300)
    const reading = await theRowBeingRead(page)
    expect((await stillComing(page)).pictures, 'the pictures had landed before the reader stopped').toBeGreaterThan(0)
    await watch(page, reading.words)
    await untilEverythingHasCome(page)
    await page.waitForTimeout(800)
    expectThePlaceKept(await theFrames(page), reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('3. a reader who scrolled up just after opening stays where they are when the names of linked records land', async () => {
  const { context, page, letGo } = await aWindow({ pictures: 0, names: 'until let go' })
  try {
    await openTheConversation(page)
    await pointAtTheList(page)
    await page.waitForTimeout(300)
    await smallStepsUp(page)
    await page.waitForTimeout(300)
    const reading = await theRowBeingRead(page)
    expect((await stillComing(page)).names, 'the names had landed before the reader stopped').toBeGreaterThan(0)
    await watch(page, reading.words)
    letGo()
    await untilEverythingHasCome(page)
    await page.waitForTimeout(800)
    expectThePlaceKept(await theFrames(page), reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('4. dragging the width out and back while scrolled up keeps the place being read', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    const reading = await scrolledUpAfterEverythingCame(page, 'in its own window')
    await watch(page, reading.words)
    await dragTheGrip(page, 'left', -300, 0)
    const frames = await theFrames(page)
    expect(howMuch(frames, 'width'), 'the width did not change').toBeGreaterThanOrEqual(80)
    expectThePlaceKept(frames, reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('5. dragging the height by the top edge while scrolled up keeps the place being read', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    const reading = await scrolledUpAfterEverythingCame(page, 'in its own window')
    await watch(page, reading.words)
    await dragTheGrip(page, 'top', 0, -200)
    const frames = await theFrames(page)
    expect(howMuch(frames, 'height'), 'the height did not change').toBeGreaterThanOrEqual(150)
    expectThePlaceKept(frames, reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('6. the window getting smaller and larger again while scrolled up keeps the place being read', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    const reading = await scrolledUpAfterEverythingCame(page)
    await watch(page, reading.words)
    // A busy browser can paint no frame during a fixed delay. Keep watching until the initial and
    // smaller sizes were actually recorded before restoring the window; every captured frame is
    // still checked below for the reader's place.
    const heights = () => page.evaluate(() => (window as unknown as { listFrames: Array<{height:number} | null> }).listFrames.flatMap(frame => frame === null ? [] : [frame.height]))
    await expect.poll(async () => (await heights()).length, { timeout: 30_000 }).toBeGreaterThan(0)
    const initialHeight = (await heights())[0]!
    await page.setViewportSize({ width: 1000, height: 560 })
    await expect.poll(async () => (await heights()).some(height => Math.abs(height - initialHeight) >= 20), { timeout: 30_000 }).toBe(true)
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.waitForTimeout(800)
    const frames = await theFrames(page)
    expect(howMuch(frames, 'height'), 'the list did not change size').toBeGreaterThanOrEqual(20)
    expectThePlaceKept(frames, reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('7. older messages put above keep the place being read', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    await openTheConversation(page)
    await untilEverythingHasCome(page)
    await page.waitForTimeout(1_000)
    // THE OLDER PAGE IS HELD BACK UNTIL THE READER HAS STOPPED, so it lands after that.
    let letTheOlderPageGo!: () => void
    const theOlderPage = new Promise<void>((done) => {
      letTheOlderPageGo = done
    })
    await page.route('**/api/messages/conversation**', async (route) => {
      await theOlderPage
      await route.continue().catch(() => undefined)
    })
    const drawn = await page.locator('.px-chat-said .px-chat-words').count()
    await pointAtTheList(page)
    for (let tries = 0; tries < 20; tries++) {
      if ((await page.locator('.px-chat-said').evaluate((list) => list.scrollTop)) <= NEAR_THE_TOP) break
      await page.mouse.wheel(0, -1_500)
      await page.waitForTimeout(150)
    }
    await page.waitForTimeout(400)
    expect(await page.locator('.px-chat-said .px-chat-words').count(), 'the older page landed before the reader stopped').toBe(drawn)
    const reading = await theRowBeingRead(page)
    await watch(page, reading.words)
    letTheOlderPageGo()
    await page.waitForFunction((n) => document.querySelectorAll('.px-chat-said .px-chat-words').length > n, drawn, { timeout: 30_000 })
    await page.waitForTimeout(800)
    expectThePlaceKept(await theFrames(page), reading)
  } finally {
    await context.close()
  }
}, 120_000)

it('8. at the very bottom, dragging the width keeps the newest message in view, and a new message comes into view', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    await openTheConversation(page, 'in its own window')
    await untilEverythingHasCome(page)
    await page.waitForTimeout(1_000)
    await watch(page)
    await dragTheGrip(page, 'left', -300, 0)
    await say(AS_THE_AGENT, { body: 'Made-up line 131. A new line from the agent.', to: [{ kind: 'person', id: THE_PERSON }] })
    await page.waitForFunction(() => [...document.querySelectorAll('.px-chat-said .px-chat-words')].some((one) => (one.textContent ?? '').startsWith('Made-up line 131.')), undefined, { timeout: 30_000 })
    await page.waitForTimeout(800)
    const frames = await theFrames(page)
    expect(howMuch(frames, 'width'), 'the width did not change').toBeGreaterThanOrEqual(80)
    expect(frames.filter((one) => one.gap > BOTTOM_PX), told(frames)).toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('9. a message that arrives while the reader is scrolled up draws the mark under the list, and the place being read stays where it is', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    const reading = await scrolledUpAfterEverythingCame(page)
    await watch(page, reading.words)
    await say(AS_THE_AGENT, { body: 'Made-up line 132. A new line from the agent, while the reader is further up.', to: [{ kind: 'person', id: THE_PERSON }] })
    await page.waitForSelector('.px-chat-new-below', { timeout: 30_000 })
    await page.waitForTimeout(800)
    const frames = await theFrames(page)
    // THE MARK SITS UNDER THE LIST, in the panel's own flow, so the list is shorter at its bottom once it is drawn, and
    // its top has not moved. A row kept against the bottom edge alone would move up the window by the mark's height.
    expect(howMuch(frames, 'height'), 'the mark took no room from the list').toBeGreaterThanOrEqual(10)
    const moved = frames.filter((one) => one.onScreen === null || Math.abs(one.onScreen - reading.onScreen) > 1)
    expect(moved, `${reading.words} was ${String(reading.onScreen)} px from the window's top\n${told(frames)}`).toEqual([])
    expect(frames.filter((one) => one.gap <= BOTTOM_PX), `put at the bottom\n${told(frames)}`).toEqual([])
  } finally {
    await context.close()
  }
}, 120_000)

it('10. dragging the width out and back from any height above the newest message keeps the place being read', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    await openTheConversation(page, 'in its own window')
    await untilEverythingHasCome(page)
    await page.waitForTimeout(1_000)
    const lost: string[] = []
    for (let up = 100; up <= 1_100; up += 200) {
      await pointAtTheList(page)
      await page.mouse.wheel(0, 100_000)
      // THE WHEEL HAS TAKEN THE LIST TO ITS END before it turns up from there.
      await page.waitForFunction(
        () => {
          const list = document.querySelector<HTMLElement>('.px-chat-said')
          return list !== null && list.scrollHeight - list.clientHeight - list.scrollTop <= 1
        },
        undefined,
        { polling: 'raf', timeout: 10_000 },
      )
      await page.mouse.wheel(0, -up)
      await page.waitForTimeout(500)
      const reading = await theRowBeingRead(page)
      await watch(page, reading.words)
      await dragTheGrip(page, 'left', -300, 0)
      const frames = await theFrames(page)
      expect(howMuch(frames, 'width'), 'the width did not change').toBeGreaterThanOrEqual(80)
      const asNearAsItGoes = (one: NonNullable<Frame>): boolean => one.at !== null && one.gap <= 1 && one.at < reading.at
      const strayed = frames.filter((one) => one.at === null || (Math.abs(one.at - reading.at) > 1 && !asNearAsItGoes(one)))
      const last = frames.at(-1)
      const back = last !== undefined && last.at !== null && Math.abs(last.at - reading.at) <= 1 && last.gap > BOTTOM_PX
      if (strayed.length > 0 || !back) lost.push(`${String(up)} px up, ${reading.words} was ${String(reading.at)} px above the bottom edge\n${told(frames)}`)
    }
    expect(lost.map((one) => one.split('\n')[0]), lost.join('\n\n')).toEqual([])
  } finally {
    await context.close()
  }
}, 180_000)

it('11. at the very bottom, a message the person sends is in view from the press, while it is written and after, on the chat page and in the corner', async () => {
  const lost: string[] = []
  for (const [where, line] of [
    ['page', 'Made-up line 133.'],
    ['corner', 'Made-up line 134.'],
  ] as const) {
    const { context, page } = await aWindow({ pictures: 0, names: 0 })
    try {
      if (where === 'page') await openTheChatPage(page)
      else await openTheConversation(page)
      await untilEverythingHasCome(page)
      await page.waitForTimeout(1_000)
      await watch(page, line)
      await sendWithTheWriteHeld(page, `${line} Sent by the person from the bottom of the conversation.`, 300)
      await page.waitForTimeout(800)
      const frames = await theFrames(page)
      if (!frames.some((one) => one.at !== null)) lost.push(`${where}: the message sent was never drawn\n${told(frames)}`)
      else if (frames.some((one) => one.gap > BOTTOM_PX)) lost.push(`${where}: the list left its end\n${told(frames)}`)
    } finally {
      await context.close()
    }
  }
  expect(lost.map((one) => one.split('\n')[0]), lost.join('\n\n')).toEqual([])
}, 120_000)

it('12. at the very bottom, typing one key at a time keeps the newest message in view, through each line the box grows by, on the chat page and in the corner', async () => {
  const lost: string[] = []
  for (const where of ['page', 'corner'] as const) {
    const { context, page } = await aWindow({ pictures: 0, names: 0 })
    try {
      if (where === 'page') await openTheChatPage(page)
      else await openTheConversation(page)
      await untilEverythingHasCome(page)
      await page.waitForTimeout(1_000)
      await page.click('.px-chat-write textarea')
      const newest = await theNewestLine(page)
      const oneLine = await theBoxHeight(page)
      await watch(page, newest)
      // EACH KEY 20 MILLISECONDS AFTER THE ONE BEFORE, longer than a frame at 60 frames a second.
      await page.keyboard.type(TYPED, { delay: 20 })
      await page.waitForTimeout(800)
      const grown = await theBoxHeight(page)
      const frames = await theFrames(page)
      const first = frames[0]
      if (grown <= oneLine) lost.push(`${where}: the box did not grow, ${String(oneLine)} px and then ${String(grown)} px\n${told(frames)}`)
      else if (first === undefined || first.at === null) lost.push(`${where}: ${newest} was not drawn when the typing began\n${told(frames)}`)
      else if (frames.some((one) => one.at === null || Math.abs(one.at - (first.at ?? 0)) > 1 || one.gap > 1)) {
        lost.push(`${where}: ${newest} was ${String(first.at)} px above the bottom edge, and the list moved off its end\n${told(frames)}`)
      }
    } finally {
      await context.close()
    }
  }
  expect(lost.map((one) => one.split('\n')[0]), lost.join('\n\n')).toEqual([])
}, 120_000)

it("13. after the person is added to a group that keeps talking, the wheel's scroll up stays where it was put, and a new line draws the mark", async () => {
  const browser = await aScaledBrowser(1440)
  try {
    const { context, page } = await aWindow({ pictures: 0, names: 0 }, false, { width: 1440, browser })
    try {
      const { group, next } = await addedToAGroup(page, 1_001)
      await watch(page)
      await pointAtTheList(page)
      for (let n = 0; n < 6; n++) {
        await page.mouse.wheel(0, -120)
        await page.waitForTimeout(120)
      }
      await page.waitForTimeout(800)
      const reading = await theRowBeingRead(page)
      const named = await follow(page, reading.words)
      await aLineArrives(page, group, next)
      await page.waitForTimeout(800)
      await expectTheScrollKept(page, reading, named)
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
}, 180_000)

it("14. after the person is added to a group that keeps talking, a drag of the list's scroll bar stays where it was put, and a new line draws the mark", async () => {
  const browser = await aScaledBrowser(1440)
  try {
    const { context, page } = await aWindow({ pictures: 0, names: 0 }, false, { width: 1440, browser })
    try {
      const { group, next } = await addedToAGroup(page, 2_001)
      await watch(page)
      await dragTheBar(page, 60)
      await page.waitForTimeout(800)
      const reading = await theRowBeingRead(page)
      const named = await follow(page, reading.words)
      await aLineArrives(page, group, next)
      await page.waitForTimeout(800)
      await expectTheScrollKept(page, reading, named)
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
}, 180_000)

it('15. at the very bottom, a row that gets shorter and then much taller before the next frame leaves the list at its end', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    await openTheChatPage(page)
    await untilEverythingHasCome(page)
    await page.waitForTimeout(1_000)
    await watch(page, await theNewestLine(page))
    const changed = await aRowShorterThenMuchTaller(page)
    await page.waitForTimeout(800)
    expectTheListAtItsEnd(changed, await theFrames(page))
  } finally {
    await context.close()
  }
}, 120_000)

it("16. at the very bottom, the reader's own scroll by the wheel, by the bar and by touch stays where it was put when the list's end changes in the same frame", async () => {
  const lost: string[] = []
  const judged = (how: string, at: AtTheScroll | null, all: NonNullable<Frame>[]): NonNullable<Frame>[] => {
    if (at === null) {
      lost.push(`${how}: the list did not scroll\n${told(all)}`)
      return []
    }
    if (at.grewBy !== 300 || at.gap <= BOTTOM_PX) lost.push(`${how}: the row did not grow by 300 px, or the scroll did not leave the bottom: ${JSON.stringify(at)}\n${told(all)}`)
    const frames = all.filter((one) => one.t >= at.t)
    if (frames.length === 0) lost.push(`${how}: no frame was painted after the scroll\n${told(all)}`)
    if (frames.some((one) => one.gap <= BOTTOM_PX)) lost.push(`${how}: put back at the bottom\n${told(all)}`)
    return frames
  }
  // THE WHEEL, on the chat page in the browser the cases share: from the scroll on, the message across the middle stays.
  {
    const { context, page } = await aWindow({ pictures: 0, names: 0 })
    try {
      await openTheChatPage(page)
      await untilEverythingHasCome(page)
      await page.waitForTimeout(1_000)
      await watch(page)
      await theNewestGrowsAtTheNextScroll(page)
      await pointAtTheList(page)
      await page.mouse.wheel(0, -120)
      await page.waitForTimeout(800)
      const at = await whatWasAtTheScroll(page)
      const all = await theFrames(page)
      const frames = judged('the wheel', at, all)
      if (at !== null && frames.some((one) => one.onScreen === null || Math.abs(one.onScreen - at.onScreen) > 1)) {
        lost.push(`the wheel: ${at.words} was ${String(at.onScreen)} px from the window's top at the scroll\n${told(all)}`)
      }
    } finally {
      await context.close()
    }
  }
  // THE BAR, in the browser of cases 13 and 14: the drag goes on moving the list up, so the message across the middle at
  // the first scroll only ever goes down the window.
  const browser = await aScaledBrowser(1440)
  try {
    const { context, page } = await aWindow({ pictures: 0, names: 0 }, false, { width: 1440, browser })
    try {
      await openTheChatPage(page)
      await untilEverythingHasCome(page)
      await page.waitForTimeout(1_000)
      await watch(page)
      await theNewestGrowsAtTheNextScroll(page)
      await dragTheBar(page, 60)
      await page.waitForTimeout(800)
      const at = await whatWasAtTheScroll(page)
      const all = await theFrames(page)
      const frames = judged('the bar', at, all)
      const up = frames.findIndex((one, n) => one.onScreen === null || one.onScreen < (n === 0 ? (at?.onScreen ?? 0) : (frames[n - 1]?.onScreen ?? 0)) - 1)
      if (at !== null && up >= 0) lost.push(`the bar: ${at.words} went up the window, or was not drawn, ${String(up)} frames after the scroll\n${told(all)}`)
    } finally {
      await context.close()
    }
  } finally {
    await browser.close()
  }
  // TOUCH, at 390 wide in a window that takes touches: the finger goes on moving the list up, as the bar does.
  {
    const { context, page } = await aWindow({ pictures: 0, names: 0 }, false, { width: 390, browser: null, touch: true })
    try {
      await openTheChatPage(page)
      await untilEverythingHasCome(page)
      await page.waitForTimeout(1_000)
      await watch(page)
      await theNewestGrowsAtTheNextScroll(page)
      await drawAFingerDown(page, 180)
      await page.waitForTimeout(800)
      const at = await whatWasAtTheScroll(page)
      const all = await theFrames(page)
      const frames = judged('touch', at, all)
      const up = frames.findIndex((one, n) => one.onScreen === null || one.onScreen < (n === 0 ? (at?.onScreen ?? 0) : (frames[n - 1]?.onScreen ?? 0)) - 1)
      if (at !== null && up >= 0) lost.push(`touch: ${at.words} went up the window, or was not drawn, ${String(up)} frames after the scroll\n${told(all)}`)
    } finally {
      await context.close()
    }
  }
  expect(lost.map((one) => one.split('\n')[0]), lost.join('\n\n')).toEqual([])
}, 180_000)

it('17. after the reader scrolls up and back to the very bottom by the wheel, a row that gets shorter and then much taller before the next frame leaves the list at its end', async () => {
  const { context, page } = await aWindow({ pictures: 0, names: 0 })
  try {
    await openTheChatPage(page)
    await untilEverythingHasCome(page)
    await page.waitForTimeout(1_000)
    await pointAtTheList(page)
    const gap = async (): Promise<number> => page.locator('.px-chat-said').evaluate((list: HTMLElement) => Math.round(list.scrollHeight - list.clientHeight - list.scrollTop))
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(500)
    expect(await gap(), 'the wheel did not take the list up from the bottom').toBeGreaterThan(BOTTOM_PX)
    await page.mouse.wheel(0, 240)
    await expect.poll(async () => Math.abs(await gap()), { timeout: 30_000 }).toBeLessThanOrEqual(1)
    await page.waitForTimeout(500)
    await watch(page, await theNewestLine(page))
    const changed = await aRowShorterThenMuchTaller(page)
    await page.waitForTimeout(800)
    expectTheListAtItsEnd(changed, await theFrames(page))
  } finally {
    await context.close()
  }
}, 120_000)


