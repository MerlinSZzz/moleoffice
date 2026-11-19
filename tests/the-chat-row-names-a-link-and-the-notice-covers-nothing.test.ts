// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION'S ROW WORDS A LINK AS ITS BUBBLE DOES, AND THE MESSAGES START UNDER A LINE OF THEIR OWN (wave 13y
 * round 146). Two faults in the chat, found while pictures were screened on 7 November 2026.
 *
 * (a) The line under a conversation's name in the chat's lists showed a message's record link as its raw twelve-character
 *     id. The bubble draws the same link as the record's label. A page address showed as typed, where the bubble draws
 *     the words of its press.
 * (b) With an agent nothing answers as, a scrolled message was cut about 4 pixels under the notice saying so, and no
 *     line was drawn there. The sides of the cut bubble ran up to the notice's border, so the notice looked as if it
 *     lay over the message. Nothing was drawn over it. The messages now start under a line of their own, drawn as the
 *     line under the agent's name, with more room above it.
 *
 * In a test office of its own, this file has the person write to one agent with a labelled record's id and a page
 * address in the message, and one agent write the same to another. It also has the person write enough lines to an
 * agent nothing answers as to fill the panel, so they scroll.
 *
 * 1. THE CONTACT ROW DRAWS THE WORDS THE BUBBLE DRAWS: the label and the page press's words, and neither the id nor
 *    the address.
 * 2. THE BETWEEN-AGENTS ROW DRAWS THE WORDS ITS BUBBLE DRAWS, in the same way.
 * 3. THE MESSAGES START UNDER A LINE, at 1440 and 390, with the messages at the top, in the middle and at the foot
 *    of their scroll. The top of the list is a solid line in the colour of the line under the agent's name, at least
 *    6 pixels under the notice's foot, and every point of the notice is drawn by the notice.
 *
 * Set W13Y_ITEM_92_SHOTS to a folder outside the checkout, and W13Y_ITEM_92_LOOK to light or dark, to photograph the
 * contact row and the scrolled conversation at 1440, 990, 660 and 390 in that look. One run takes one look, so each look
 * is taken in a test office of its own. The ordinary run takes none. Every record and message here is made up, and
 * every picture says so above the chat's heading. The words under each line that name the machine it was written from
 * are blurred, because that is the test machine's name.
 *
 * MUTATIONS: the rows draw the message's words as stored, and 1 and 2 go red; the line along the top of the list is
 * taken out, and 3 goes red; the room above it is taken out, and 3 goes red.
 */

import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** The agent the person writes a link to, and the two agents who write to each other. */
const READER = { handle: 'quarry-reader', name: 'Quarry Reader' }
const LARK = { handle: 'lark-writer', name: 'Lark Writer' }
const WREN = { handle: 'wren-reader', name: 'Wren Reader' }
/** The agent nothing answers as, whose conversation holds enough lines to scroll. */
const FAR = { handle: 'far-away-one', name: 'Far Away One' }
/** How many lines the person writes to the far agent: more than the panel shows at 1440. */
const LINES_TO_FAR = 40

const LABEL_OF_THE_RECORD = 'Clamp mount load test'
const THE_PAGE = '#/plan'

/** The id of the module whose label the links are drawn with. */
let labelled = ''

async function post(headers: Record<string, string>, body: unknown, expected = theAnswerToAWriteInATestOffice(headers, body)): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** Register an agent through the plain records door. */
async function anAgent(who: { handle: string; name: string }): Promise<void> {
  await post(AS_THE_OWNER, { kind: 'agent', title: who.name, data: { handle: who.handle, runtime: 'claude-code', state: 'active' } })
}

/** One message to one agent, from whoever these headers name. */
async function says(from: Record<string, string>, to: string, body: string, expected?: ReturnType<typeof theAnswerToAWriteInATestOffice>): Promise<void> {
  const message = { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: to }] } }
  await post(from, message, expected ?? theAnswerToAWriteInATestOffice(from, message))
}

/**
 * A module with a label written through the route a person writes one through. A module and not a note, because only
 * the module and report kinds keep a label.
 */
async function aLabelledModule(): Promise<string> {
  const id = await post(AS_THE_OWNER, {
    kind: 'module',
    title: 'The clamp mount that has to hold twenty newtons',
    data: { context: 'A mount that has to hold twenty newtons.', parts: [] },
  })
  const ledger = await fetch(`${app.api}/api/records/${id}/revisions`, { headers: AS_THE_OWNER })
  expect(ledger.status, await ledger.clone().text()).toBe(200)
  const newest = ((await ledger.json()) as { revisions: { seq: number; contentHash: string }[] }).revisions[0]
  const wrote = await fetch(`${app.api}/api/records/${id}/short-forms`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ madeFrom: { seq: newest?.seq, contentHash: newest?.contentHash }, forms: { label: LABEL_OF_THE_RECORD } }),
  })
  expect(wrote.status, await wrote.text()).toBe(200)
  return id
}

const theLink = (): string => `Please read ${labelled} and then ${THE_PAGE} before noon.`

beforeAll(async () => {
  app = await liveApp({ name: 'chat-row-link-and-notice', viewport: { width: 1440, height: 1000 } })
  labelled = await aLabelledModule()
  for (const one of [READER, LARK, WREN, FAR]) await anAgent(one)
  await says(AS_THE_OWNER, READER.handle, theLink())
  // NOTHING HOLDS WREN IN THE TEST OFFICE, so the office stores Lark's message, routes it and answers 409. The message is
  // stored all the same, and the between-agents row draws it.
  await says(asAgent(LARK.handle), WREN.handle, theLink(), 409)
  for (let line = 1; line <= LINES_TO_FAR; line += 1) {
    await says(AS_THE_OWNER, FAR.handle, `Line ${String(line)} of the far agent's work list: read the gauges in the east shed and write them down.`)
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

beforeEach(async () => {
  await app.page.setViewportSize({ width: 1440, height: 1000 })
})

/** The panel open on one of its lists, with no conversation open. */
async function openTheList(tab: 'contacts' | 'between'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await waitForThePage(app.page, 30_000)
  if ((await app.page.$('.px-chat')) === null) {
    await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await app.page.click('.px-chat-circle')
  }
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  await app.page.click(`.px-chat-tab[data-tab="${tab}"]`)
  await app.page.waitForSelector('.px-chat-contact', { timeout: 20_000 })
}

/**
 * One row of the open list, found by the names it is drawn under. A between-agents row names both agents, in an order
 * that does not follow their names, so each name is looked for on its own.
 */
const theRow = (...names: string[]) =>
  names.reduce((rows, name) => rows.filter({ hasText: name }), app.page.locator('.px-chat-contact')).first()

/** Words as a person reads them, on one line. */
const oneLine = (words: string): string => words.replace(/\s+/g, ' ').trim()

/** The words the open conversation's last bubble draws, once its link is named. */
async function theLastBubble(): Promise<string> {
  const bubble = app.page.locator('.px-chat-said [data-chat-content]').last()
  await bubble.locator('a[data-named="label"]').waitFor({ timeout: 20_000 })
  return oneLine(await bubble.innerText())
}

/** The words a row's line under the name draws. */
const theRowsLine = async (names: string[]): Promise<string> => oneLine(await theRow(...names).locator('.px-chat-last').innerText())

/**
 * The bubble a row opens, and then the row's line, back in the list.
 *
 * THE BUBBLE IS READ FIRST, once its link is named, so the name has been read when the row is drawn again. The row is
 * then read until it draws the bubble's words, for as long as a bubble waits for its own name. A row that never does
 * fails with the words it drew.
 */
async function theBubbleAndThenItsRow(tab: 'contacts' | 'between', names: string[]): Promise<{ bubble: string; row: string }> {
  await openTheList(tab)
  await theRow(...names).click()
  const bubble = await theLastBubble()
  await app.page.click('.px-chat-back')
  await app.page.click(`.px-chat-tab[data-tab="${tab}"]`)
  await theRow(...names).locator('.px-chat-last').waitFor({ timeout: 20_000 })
  await expect.poll(() => theRowsLine(names), { timeout: 10_000 }).toBe(bubble)
  return { bubble, row: await theRowsLine(names) }
}

it('1. the contact row draws the words the bubble draws: the label and the page press, and not the id or address', async () => {
  const seen = await theBubbleAndThenItsRow('contacts', [READER.name])
  expect(seen.bubble, 'the bubble does not draw the label').toContain(LABEL_OF_THE_RECORD)
  expect(seen.row, 'the row draws the record id').not.toContain(labelled)
  expect(seen.row, 'the row draws the page address').not.toContain(THE_PAGE)
}, 120_000)

it('2. the between-agents row draws the words its bubble draws, in the same way', async () => {
  const seen = await theBubbleAndThenItsRow('between', [LARK.name, WREN.name])
  expect(seen.bubble, 'the bubble does not draw the label').toContain(LABEL_OF_THE_RECORD)
  expect(seen.row, 'the row draws the record id').not.toContain(labelled)
  expect(seen.row, 'the row draws the page address').not.toContain(THE_PAGE)
}, 120_000)

/** The far agent's conversation, open, with its notice drawn. */
async function openTheFarConversation(): Promise<void> {
  await openTheList('contacts')
  await theRow(FAR.name).click()
  await app.page.waitForSelector('.px-chat-cannot-reach', { timeout: 20_000 })
  await app.page.waitForFunction((wanted) => document.querySelectorAll('.px-chat-said > li').length >= wanted, LINES_TO_FAR, {
    timeout: 20_000,
  })
}

/** The least room between the notice's foot and the line the messages start under. The fault left 4 pixels. */
const ROOM_UNDER_THE_NOTICE = 6

/** How the top of the list is drawn, and the line under the agent's name it is drawn as. */
interface TheTopOfTheList {
  style: string
  width: number
  colour: string
  underTheName: string | null
}

/** Scroll the messages alone to this share of their scroll, and say how the notice and the list stand. */
async function scrolledTo(share: number): Promise<{ scrolls: boolean; roomAbove: number; top: TheTopOfTheList; coveredAt: string[] }> {
  return app.page.evaluate((share) => {
    const list = document.querySelector('.px-chat-said')
    const notice = document.querySelector('.px-chat-cannot-reach')
    const heading = document.querySelector('.px-chat-them')
    if (list === null || notice === null) throw new Error('the conversation drew no list or no notice')
    list.scrollTop = (list.scrollHeight - list.clientHeight) * share
    const box = notice.getBoundingClientRect()
    const coveredAt: string[] = []
    // EVERY POINT OF THE NOTICE IS DRAWN BY THE NOTICE: a point where something else answers is a point covered.
    for (const x of [0.05, 0.5, 0.95]) {
      for (const y of [0.1, 0.5, 0.9]) {
        const at = { x: box.left + box.width * x, y: box.top + box.height * y }
        const drawn = document.elementFromPoint(at.x, at.y)
        if (drawn === null || !notice.contains(drawn)) coveredAt.push(`${String(Math.round(at.x))},${String(Math.round(at.y))}: ${drawn?.className ?? 'nothing'}`)
      }
    }
    const edge = getComputedStyle(list)
    return {
      scrolls: list.scrollHeight > list.clientHeight + 1,
      roomAbove: list.getBoundingClientRect().top - box.bottom,
      top: {
        style: edge.borderTopStyle,
        width: parseFloat(edge.borderTopWidth),
        colour: edge.borderTopColor,
        underTheName: heading === null ? null : getComputedStyle(heading).borderBottomColor,
      },
      coveredAt,
    }
  }, share)
}

it('3. the messages start under a line, with room above it, at 1440 and 390, wherever they are scrolled', async () => {
  for (const width of [1440, 390]) {
    await app.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await openTheFarConversation()
    for (const share of [0, 0.5, 1]) {
      const stands = await scrolledTo(share)
      expect(stands.scrolls, `at ${String(width)} the messages do not scroll, so this proves nothing`).toBe(true)
      const where = `at ${String(width)}, scrolled to ${String(share)}`
      expect.soft(stands.roomAbove, `${where}, the room between the notice and the messages`).toBeGreaterThanOrEqual(ROOM_UNDER_THE_NOTICE)
      expect.soft(stands.top.style, `${where}, the top of the list is not a solid line`).toBe('solid')
      expect.soft(stands.top.width, `${where}, the line along the top of the list`).toBeGreaterThan(0)
      expect.soft(stands.top.colour, `${where}, the line is not drawn as the one under the agent's name`).toBe(stands.top.underTheName)
      expect.soft(stands.coveredAt, `${where}, something is drawn over the notice`).toEqual([])
    }
  }
}, 120_000)


