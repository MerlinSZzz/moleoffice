// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NUMBER SOMEBODY TYPES AT THE START OF A LINE IS DRAWN AS THEY TYPED IT. Wave 13y round 137.
 *
 * The problem as it was seen: a reply to point 3 of a message began with "3." and the chat
 * drew "1." in its place. The renderer read a line that starts with a number and a full stop as a Markdown
 * numbered list, kept the words and dropped the number, and the browser numbered every list from 1.
 * A list written 2 then 5 was drawn 1 then 2. People answer a message by number, so the drawn number
 * said they answered another point. The stored body was right all along.
 *
 * In a real browser against a Mole Office of its own, with made-up records, the person sends two
 * messages to a made-up agent: "3. yes", and "2. A" with "5. B" on the next line. Each case reads
 * what a reader is given for every item of a drawn list, number included, from the browser's
 * accessibility tree. That tree holds the number the browser draws for a list item as text, and it
 * holds a number drawn from the page's own styles as text too, so one reading covers both ways of
 * drawing it.
 *  1. The chat draws 3, and 2 then 5, at 1440 in the light look. What is read is text, not layout or colour, so
 *     one width and one look are enough.
 *  2. A message's own page draws them the same way, since it draws the body with the chat's reader.
 *  3. The messages page draws "3. yes" and "2. A 5. B", and the stored bodies are what was sent.
 * Each look is stored before the page is opened for it, since the app draws the look that is stored
 * and no longer follows the system's once one is.
 *
 * NOT CHECKED HERE: a comment's words on the review pane and on its own page, and an agent's words
 * beside a place. Those draw the body as plain text (src/web/components/agent/ReviewBar.tsx,
 * src/web/pages/RecordPage.tsx and src/web/components/agent/AgentSaidHere.tsx), so no number in them
 * is read as a list. The messages page is the one plain-text surface read here.
 *
 * THE MUTATIONS:
 *  A. draw the chat's lists without the typed numbers, and cases 1 and 2 go red with "1. yes" and
 *     "1. A", "2. B".
 *  B. is no longer run: it was caught only by a dark picture, and the cases now draw the light look only.
 *
 * THE PICTURES are taken only when TYPED_NUMBERS_SHOTS names a folder outside the checkout: the chat
 * and a message's own page at 1440 in the light look. It is made-up data, and every picture
 * carries the label that says so. In the chat the label goes above the conversation's head, as in the
 * other chat pictures, and the line that names the machine a message was written on is blurred. A
 * message's own page is photographed with the chat closed, since at 390 the chat is drawn over the
 * page. A dark picture of a place, when one is taken, must follow its light one, and a dark picture whose
 * bytes are its light one's fails the case: the page never took the dark look, so it is no picture of
 * the dark look.
 *
 * Everything here is made up.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { messagePath } from '../src/web/components/router.tsx'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { openTheChat } from './open-the-chat.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const LABEL = 'Made-up data — an invented office, not real office data'

/** The two bodies the requirement names. */
const THREE = '3. yes'
const TWO_THEN_FIVE = ['2. A', '5. B'].join('\n')

/** What a reader is given for each drawn item of each body, in the order the items are drawn. */
const AS_TYPED = [['3. yes'], ['2. A', '5. B']]

const WIDTHS = [1440] as const
const LOOKS = ['light'] as const

let app: LiveApp
const sent = new Map<string, string>()

async function say(body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'agent', id: 'numbers-agent' }] },
    }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(said.status, await said.clone().text()).toBe(409)
  sent.set(body, ((await said.json()) as { record: { id: string } }).record.id)
}

/**
 * WHAT A READER IS GIVEN FOR EACH ITEM OF EACH LIST UNDER `lists`, in the order they are drawn.
 *
 * Read from the accessibility tree, because neither the item's text nor its markup holds the number
 * the browser draws for it. The words of every text the tree holds for the item are joined, so a
 * drawn "1. " and "yes" read "1. yes".
 */
async function whatEachItemReads(page: Page, lists: string): Promise<string[][]> {
  const cdp = await page.context().newCDPSession(page)
  try {
    const counts = await page.$$eval(lists, (found) => found.map((list) => list.querySelectorAll(':scope > li').length))
    const read: string[][] = []
    for (const [at, count] of counts.entries()) {
      const items: string[] = []
      for (let n = 0; n < count; n++) {
        const { result } = await cdp.send('Runtime.evaluate', {
          expression: `document.querySelectorAll(${JSON.stringify(lists)})[${String(at)}].querySelectorAll(':scope > li')[${String(n)}]`,
        })
        if (result.objectId === undefined) throw new Error(`item ${String(n)} of list ${String(at)} under ${lists} was not found`)
        const { nodes } = await cdp.send('Accessibility.queryAXTree', { objectId: result.objectId, role: 'StaticText' })
        items.push(nodes.map((node) => String(node.name?.value ?? '')).join(' ').replace(/\s+/g, ' ').trim())
      }
      read.push(items)
    }
    return read
  } finally {
    await cdp.detach()
  }
}

async function openTheConversation(look: (typeof LOOKS)[number]): Promise<void> {
  await app.page.goto(`${app.site}/?look=${look}`)
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-said')) === null) {
    await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
    await app.page.click('.px-chat-contact:has(.px-chat-name:text-is("Numbers Agent"))')
  }
  await app.page.waitForSelector('.px-chat-md ol.sb-list', { timeout: 20_000 })
}

/** The folder the pictures go to, or null when nobody asked for them. */
function theShotsFolder(): string | null {
  const shots = process.env['TYPED_NUMBERS_SHOTS']
  if (!shots) return null
  mkdirSync(shots, { recursive: true })
  return shots
}

/** The light picture of each place, kept to be compared with the dark picture of the same place. */
const lightPictures = new Map<string, Buffer>()

/** Takes the picture of a place in a look, and refuses a dark picture whose bytes are its light one's. */
async function takeThePicture(shots: string, place: string, look: (typeof LOOKS)[number]): Promise<void> {
  const picture = await app.page.screenshot({ path: join(shots, `${place}-${look}.png`) })
  if (look === 'light') {
    lightPictures.set(place, picture)
    return
  }
  const light = lightPictures.get(place)
  expect(light, `the light picture ${place} was taken before the dark one`).toBeDefined()
  expect(light!.equals(picture), `the dark picture ${place} is its light one`).toBe(false)
}

beforeAll(async () => {
  app = await liveApp({ name: 'typed-numbers', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Numbers Agent',
      data: { handle: 'numbers-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // THE LOOK OF EACH PASS IS STORED, from the look= of the address, before the app reads it.
  await app.page.addInitScript(() => {
    localStorage.setItem('mole-office.preset.theme', new URLSearchParams(location.search).get('look') ?? 'light')
  })
  await say(THREE)
  await say(TWO_THEN_FIVE)
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 120_000)

describe('a typed number is drawn as typed', () => {
  it('the chat draws 3, and 2 then 5, at 1440 in the light look', async () => {
    const shots = theShotsFolder()
    try {
      for (const width of WIDTHS) {
        for (const look of LOOKS) {
          await app.page.setViewportSize({ width, height: 1000 })
          await openTheConversation(look)
          // THE PICTURES BLUR THE LINE THAT SAYS WHICH MACHINE A MESSAGE WAS WRITTEN ON, since it names the machine this
          // test runs on. The blur draws nothing new and moves nothing.
          if (shots !== null) await app.page.addStyleTag({ content: '.px-chat-from { filter: blur(5px); }' })
          await theResizeIsDrawn(app.page)
          expect(await whatEachItemReads(app.page, '.px-chat-md ol.sb-list'), `the chat at ${String(width)}, ${look}`).toEqual(AS_TYPED)
          if (shots !== null) {
            await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator('.px-chat .px-chat-them-top'), `chat-${String(width)}-${look}`)
            await app.page.locator('.px-chat-md ol.sb-list').last().scrollIntoViewIfNeeded()
            await takeThePicture(shots, `chat-${String(width)}`, look)
          }
        }
      }
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 240_000)

  it("a message's own page draws them as the chat does", async () => {
    const shots = theShotsFolder()
    try {
      for (const [body, items] of [[THREE, AS_TYPED[0]], [TWO_THEN_FIVE, AS_TYPED[1]]] as const) {
        await app.page.goto(`${app.site}/#${messagePath(sent.get(body)!)}`)
        await waitForThePage(app.page, 30_000)
        await app.page.waitForSelector('.mp-body ol.sb-list', { timeout: 30_000 })
        expect(await whatEachItemReads(app.page, '.mp-body ol.sb-list'), `the page of ${JSON.stringify(body)}`).toEqual([items])
      }
      // THE PAGE HOLDING 2 THEN 5, at 1440 in the light look.
      for (const width of WIDTHS) {
        for (const look of LOOKS) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.goto(`${app.site}/?look=${look}#${messagePath(sent.get(TWO_THEN_FIVE)!)}`)
          await waitForThePage(app.page, 30_000)
          await app.page.waitForSelector('.mp-body ol.sb-list', { timeout: 30_000 })
          if (shots !== null) {
            if (await app.page.locator('.px-chat-close').isVisible()) await app.page.locator('.px-chat-close').click()
            await app.page.waitForSelector('.px-chat', { state: 'detached', timeout: 20_000 })
          }
          await theResizeIsDrawn(app.page)
          expect(await whatEachItemReads(app.page, '.mp-body ol.sb-list'), `the page at ${String(width)}, ${look}`).toEqual([AS_TYPED[1]])
          if (shots !== null) {
            await putTheMadeUpLabelIn(app.page, LABEL, app.page.locator('h1').first(), `message-page-${String(width)}-${look}`)
            await takeThePicture(shots, `message-page-${String(width)}`, look)
          }
        }
      }
    } finally {
      await app.page.setViewportSize({ width: 1440, height: 1000 })
    }
  }, 240_000)

  it('the messages page draws the words as sent, and the stored bodies are unchanged', async () => {
    await app.page.goto(`${app.site}/#/messages`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.px-ms-words', { timeout: 30_000 })
    const rows = (await app.page.$$eval('.px-ms-words', (found) => found.map((one) => (one as HTMLElement).innerText))).map((one) =>
      one.replace(/\s+/g, ' ').trim(),
    )
    expect(rows).toContain('3. yes')
    expect(rows).toContain('2. A 5. B')

    for (const [body, id] of sent) {
      const stored = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_PERSON })
      expect(stored.status).toBe(200)
      expect(((await stored.json()) as { record: { data: { body: string } } }).record.data.body).toBe(body)
    }
  }, 120_000)
})
