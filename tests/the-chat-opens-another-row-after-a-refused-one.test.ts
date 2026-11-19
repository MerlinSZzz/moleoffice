// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT OPENS ANOTHER ROW OF ITS BETWEEN AGENTS LIST AFTER A REFUSED ONE, AND DRAWS NO ANSWER OF A ROW THE PERSON
 * HAS LEFT OVER THE ROW NOW OPEN (wave 13y round 129, item 67's page half).
 *
 * The chat reads a conversation between two agents when its row is opened, and again when a message in it arrives. Each
 * read was applied when it answered, whichever row was open by then. So an answer for a row the person had already left
 * was drawn over the row they opened after it: its messages in place of the open row's, and a refused read again as the
 * notice at the top of the panel. Now an answer is applied only while the row it was asked for is still open.
 *
 * THE CASES, each read by the person in a browser window of their own.
 *   1. THE CONTROL: the row of the first two agents, opened, draws its message and no notice.
 *   2. After the row with an id nobody answers to is refused and the press back is pressed, that row opens as in case 1.
 *   3. The first read of the third agent's row is held. The person leaves that row and opens the first one. The held
 *      answer then arrives, and the first row still draws its own message and not the third row's.
 *   4. The first row is open and a message in it arrives, so the chat reads it again; that read is held. The person
 *      leaves the row and opens the third agent's. The held read then fails, and the panel draws no notice over the
 *      third agent's row.
 *   5. The first read of the third agent's row is held. The person leaves that row and opens the refused one, which
 *      says its reason. The held read then fails, and the refused row still says its own reason, and not the made-up one.
 * Cases 1 and 2 pass on the code before round 129 as well. Cases 3, 4 and 5 fail there.
 *
 * MADE-UP RECORDS, filed by the test office's person: three agents, each with a name, a handle and a record of its own,
 * and three messages: the first agent to the second, the second to the first, and the first to the third. The second
 * message's stored sender is then made an id nobody registered, in the database, as in
 * tests/the-between-door-gives-a-short-reason-for-a-side-nobody-answers-to.test.ts, so its row is refused with 404. A
 * fourth message, from the first agent to the second, is filed in case 4. The failure in case 4 is made by the test, in
 * the browser, from a made-up sentence.
 *
 * MUTATIONS, after a control run, in src/web/components/Chat.tsx:
 *   1. The read on opening a row applies its answer after the row was left, as before: case 3 fails.
 *   2. The read again of an open row draws its failure after the row was left, as before: case 4 fails.
 *   3. The read on opening a row stores its refusal after the row was left, as before: case 5 fails.
 *
 * With W13Y_ANOTHER_ROW_SHOTS set to a folder, the last case photographs what case 4 reads at its end, at 1440 and 390 in
 * both themes, under the made-up label, on the code it runs on. It answers no read of the list from the third row's
 * opening on, because on the code before round 129 a read of the lists that answers takes the notice away again.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page, Route } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** The three agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  lamp: { name: 'Lamp Lighter', handle: 'lamp-lighter' },
  bell: { name: 'Bell Ringer', handle: 'bell-ringer' },
  drum: { name: 'Drum Beater', handle: 'drum-beater' },
} as const
type Who = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** The failure case 4 makes in the browser. Nothing in the office says it. */
const THE_MADE_UP_REFUSAL = 'A made-up refusal, which the test answers in place of the office.'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The messages filed before the cases: who writes each, to whom, and what it says. */
const SAID = {
  known: { by: 'lamp', to: 'bell', body: 'The tower lamp is lit for you.' },
  nobodys: { by: 'bell', to: 'lamp', body: 'The bell rang at noon for you.' },
  drums: { by: 'lamp', to: 'drum', body: 'The drum beat twice for you.' },
} as const
/** The message case 4 files while the first row is open. */
const ARRIVING = 'The lamp is out again for you.'
/** The first row, of the first two agents, and the third agent's row. */
const FIRST = ['lamp', 'bell'] as const
const THIRD = ['lamp', 'drum'] as const

describe('the chat opens another row of the Between agents list after a refused one', () => {
  let app: LiveApp
  /** Each agent's registry id, as the office gave it. */
  const ids: Record<Who, string> = { lamp: '', bell: '', drum: '' }

  beforeAll(async () => {
    app = await liveApp({ name: 'chat-opens-another-row', viewport: { width: 1440, height: 1000 } })
    for (const who of Object.keys(AGENTS) as Who[]) {
      const { name, handle } = AGENTS[who]
      await filed('/api/records', AS_THE_PERSON, { kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } })
    }
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string; name: string }[]
    }
    for (const who of Object.keys(AGENTS) as Who[]) {
      const row = listed.agents.find((one) => one.handle === AGENTS[who].handle)
      ids[who] = row?.id ?? ''
      expect(row?.name, JSON.stringify(row)).toBe(AGENTS[who].name)
    }
    // NOBODY ANSWERS TO THE MADE-UP ID, or case 2 would prove nothing.
    expect(listed.agents.some((one) => one.id === NOBODYS || one.handle === NOBODYS)).toBe(false)
    const messageIds = {} as Record<keyof typeof SAID, string>
    for (const one of Object.keys(SAID) as (keyof typeof SAID)[]) {
      const { by, to, body } = SAID[one]
      messageIds[one] = await aMessage(by, to, body)
    }
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      // THE CONTROL: the door stored the registry id of the sender, so the shape below is made here and not found.
      const sentBy = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(messageIds.nobodys) as { sentBy: string }
      expect(JSON.parse(sentBy.sentBy)).toEqual({ kind: 'agent', id: ids.bell })
      expect(db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(NOBODYS, messageIds.nobodys).changes).toBe(1)
    } finally {
      db.close()
    }
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Files one thing through a door and answers the record it made. */
  async function filed(path: string, headers: Record<string, string>, body: unknown, expected = 201): Promise<Record<string, { id: string }>> {
    const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await reply.text()
    expect(reply.status, text).toBe(expected)
    return JSON.parse(text) as Record<string, { id: string }>
  }

  /**
   * One message from one agent to another, filed through the door as the first agent. NOTHING HOLDS ANY OF THE THREE AGENTS
   * IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The message is stored all the same,
   * and the Between agents list draws it.
   */
  async function aMessage(by: Who, to: Who, body: string): Promise<string> {
    return (
      await filed(
        '/api/records',
        { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[by].handle },
        { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: ids[to] }] } },
        409,
      )
    )['record']!.id
  }

  /** The path the chat reads a pair at, read as neither side: the two ids sorted, with a tilde between them. */
  const thePathOf = (a: Who, b: Who): string => `/api/messages/between/${[ids[a], ids[b]].sort().join('~')}`

  /** A window of its own on Home, with the page drawn; in one theme and at one width when a picture asks for them. */
  async function aWindow(look?: { theme: 'light' | 'dark'; width: number }) {
    const width = look?.width ?? 1440
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, ...(look ? { colorScheme: look.theme } : {}) })
    if (look) await context.addInitScript((theme) => window.localStorage.setItem('mole-office.preset.theme', theme), look.theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    return { context, page }
  }

  /** Opens the panel's Between agents list, as the person does with the tab. */
  async function theBetweenList(page: Page): Promise<void> {
    if ((await page.locator('.px-chat').count()) === 0) {
      await page.locator('.px-chat-circle').click()
      await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    }
    await page.locator('.px-chat-tab[data-tab="between"]').click()
  }

  /**
   * Presses one row of the list: a row of two agents found by both their names, which stay when a message arrives, and
   * the refused row by the words of its message, since one of its sides has no name.
   */
  async function pressTheRowOf(page: Page, which: readonly [Who, Who] | 'nobodys'): Promise<void> {
    const rows = page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')
    const row = which === 'nobodys'
      ? rows.filter({ hasText: SAID.nobodys.body })
      : rows.filter({ hasText: AGENTS[which[0]].name }).filter({ hasText: AGENTS[which[1]].name })
    await row.first().waitFor({ timeout: 30_000 })
    expect(await row.count(), `the rows of ${String(which)}`).toBe(1)
    await row.first().click()
  }

  /** Presses the row and answers the status of the Between door's answer to that press. */
  async function openTheRowOf(page: Page, which: readonly [Who, Who] | 'nobodys'): Promise<number> {
    const read = page.waitForResponse((reply) => reply.url().includes('/api/messages/between/'))
    await pressTheRowOf(page, which)
    return (await read).status()
  }

  /** Waits for two drawings, so what an answer moved is on the screen before it is read. */
  const twoDrawings = (page: Page) => page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))))

  /**
   * Holds the chat's reads of one path until `release` is called. The first read that comes after this is held; every
   * other read of the path goes on as it would.
   */
  async function holdTheNextReadOf(page: Page, path: string) {
    let held: Route | null = null
    let heldNow: () => void = () => {}
    const asked = new Promise<void>((resolve) => { heldNow = resolve })
    await page.route((url) => url.pathname === path, async (route) => {
      if (held !== null) return route.continue()
      held = route
      heldNow()
    })
    return {
      asked,
      release: async (how: 'as-it-is' | 'refused') => {
        await asked
        if (how === 'as-it-is') await held!.continue()
        else {
          // THE REFUSAL CARRIES THE OFFICE'S OWN HEADERS, so the page takes it as this office's answer and draws its
          // sentence. A reply without them is read as an answer from another office, and a sentence of its own is drawn.
          const real = await held!.fetch()
          await held!.fulfill({ response: real, status: 409, contentType: 'application/json', body: JSON.stringify({ error: THE_MADE_UP_REFUSAL }) })
        }
      },
    }
  }

  /** What the panel draws once the first row is open: its own message, and no notice. */
  async function theFirstRowIsDrawn(page: Page): Promise<void> {
    await page.locator('.px-chat .px-chat-bubble', { hasText: SAID.known.body }).first().waitFor({ timeout: 30_000 })
    expect(await page.locator('.px-chat .px-chat-notice').count(), 'a notice').toBe(0)
    expect(await page.locator('.px-chat .px-chat-refused').count(), 'a refusal').toBe(0)
  }

  /**
   * Case 4 up to its end: the first row read again and held, the third row opened, the held read failed. It answers
   * every notice the panel drew from the failure on, since a read of the lists that answers after it takes a notice away.
   * For the pictures, the lists are not read again from the third row's opening on, so a notice stays to be photographed.
   */
  async function case4(page: Page, holdTheLists = false): Promise<string[]> {
    await theBetweenList(page)
    expect(await openTheRowOf(page, FIRST)).toBe(200)
    await theFirstRowIsDrawn(page)
    const hold = await holdTheNextReadOf(page, thePathOf('lamp', 'bell'))
    await aMessage('lamp', 'bell', ARRIVING)
    await hold.asked
    await page.locator('.px-chat .px-chat-back').first().click({ timeout: 30_000 })
    expect(await openTheRowOf(page, THIRD)).toBe(200)
    await page.locator('.px-chat .px-chat-bubble', { hasText: SAID.drums.body }).first().waitFor({ timeout: 30_000 })
    if (holdTheLists) {
      // NO READ OF THE LIST IS ANSWERED, and a read already on its way has 300 ms to answer first.
      await page.route((url) => url.pathname === '/api/messages/between-agents', () => {})
      await page.waitForTimeout(300)
    }
    await page.evaluate(() => {
      const drawn: string[] = []
      ;(window as unknown as { noticesDrawn: string[] }).noticesDrawn = drawn
      new MutationObserver(() => {
        for (const one of document.querySelectorAll('.px-chat .px-chat-notice')) drawn.push(one.textContent ?? '')
      }).observe(document.body, { subtree: true, childList: true, characterData: true })
    })
    await hold.release('refused')
    await twoDrawings(page)
    await page.waitForTimeout(500)
    await twoDrawings(page)
    return page.evaluate(() => (window as unknown as { noticesDrawn: string[] }).noticesDrawn)
  }

  it('1. the control: the row of the first two agents, opened, draws its message and no notice', async () => {
    const { context, page } = await aWindow()
    try {
      await theBetweenList(page)
      expect(await openTheRowOf(page, FIRST)).toBe(200)
      await theFirstRowIsDrawn(page)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('2. after a refused row and the press back, the row of the first two agents opens as in case 1', async () => {
    const { context, page } = await aWindow()
    try {
      await theBetweenList(page)
      expect(await openTheRowOf(page, 'nobodys')).toBe(404)
      await page.locator('.px-chat .px-chat-refused-back').first().click({ timeout: 30_000 })
      expect(await openTheRowOf(page, FIRST)).toBe(200)
      await theFirstRowIsDrawn(page)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('3. an answer for a row the person has left is not drawn over the row opened after it', async () => {
    const { context, page } = await aWindow()
    try {
      await theBetweenList(page)
      const hold = await holdTheNextReadOf(page, thePathOf('lamp', 'drum'))
      await pressTheRowOf(page, THIRD)
      await hold.asked
      await page.locator('.px-chat .px-chat-back').first().click({ timeout: 30_000 })
      expect(await openTheRowOf(page, FIRST)).toBe(200)
      await theFirstRowIsDrawn(page)
      const late = page.waitForResponse((reply) => new URL(reply.url()).pathname === thePathOf('lamp', 'drum'))
      await hold.release('as-it-is')
      expect((await late).status(), 'the held answer').toBe(200)
      await twoDrawings(page)
      await page.waitForTimeout(500)
      await twoDrawings(page)
      expect(await page.locator('.px-chat .px-chat-bubble', { hasText: SAID.drums.body }).count(), "the third row's message").toBe(0)
      await theFirstRowIsDrawn(page)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('4. a read again that fails after the person left its row draws no notice over the row now open', async () => {
    const { context, page } = await aWindow()
    try {
      const noticesDrawn = await case4(page)
      expect(noticesDrawn, 'the notices drawn from the failure on').toEqual([])
      const drawn = await page.locator('.px-chat').innerText()
      expect(drawn, 'the panel').not.toContain(THE_MADE_UP_REFUSAL)
      expect(await page.locator('.px-chat .px-chat-notice').count(), 'a notice').toBe(0)
      await page.locator('.px-chat .px-chat-bubble', { hasText: SAID.drums.body }).first().waitFor({ timeout: 30_000 })
    } finally {
      await context.close()
    }
  }, 120_000)

  it('5. a refusal for a row the person has left does not take away the refusal of the row open now', async () => {
    const { context, page } = await aWindow()
    try {
      await theBetweenList(page)
      const hold = await holdTheNextReadOf(page, thePathOf('lamp', 'drum'))
      await pressTheRowOf(page, THIRD)
      await hold.asked
      await page.locator('.px-chat .px-chat-back').first().click({ timeout: 30_000 })
      expect(await openTheRowOf(page, 'nobodys')).toBe(404)
      const refused = page.locator('.px-chat .px-chat-refused-why')
      await refused.first().waitFor({ timeout: 30_000 })
      const itsReason = await refused.first().innerText()
      await hold.release('refused')
      await twoDrawings(page)
      await page.waitForTimeout(500)
      await twoDrawings(page)
      expect(await refused.count(), "the open row's refusal").toBe(1)
      expect(await refused.first().innerText(), "the open row's reason").toBe(itsReason)
      expect(await page.locator('.px-chat').innerText(), 'the panel').not.toContain(THE_MADE_UP_REFUSAL)
    } finally {
      await context.close()
    }
  }, 120_000)

})
