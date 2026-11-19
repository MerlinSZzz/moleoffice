// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BETWEEN DOOR'S REFUSAL OF A SIDE NOBODY ANSWERS TO CARRIES A SHORT REASON THAT QUOTES NO ID, AND THE CHAT SAYS
 * THAT REASON (wave 13y round 94, the Between door, placed first).
 *
 * `GET /api/messages/between/:pair` reads a conversation between two agents. A side that no registry row answers is
 * refused with 404 and the sentence `No durable agent in this installation answers to "<id>".`, which quotes the id
 * the caller sent. The chat opens such a pair from a row of its Between agents list, a row that pairs an agent with an
 * id stored on an older message, and it drew that sentence in the notice at the top of the panel, so the person read a
 * raw id. Round 93 gave the conversation door the same fix: the sentence is kept for a caller that sent the id, and a
 * short reason beside it says the same without the id (PanelError's fifth argument). Now the Between door does the same,
 * and the chat's notice says the reason of a refusal that has one and no code, as ErrorNote does. The chat takes that
 * rule from one place for its reads of a pair and its read of a conversation.
 *
 * THE PANEL SAYS THE REASON AND THE WAY BACK, AND NOTHING ELSE (wave 13y round 95, item 26). After the refusal the panel
 * still drew its heading, a button for each side and the line saying whose view it was, above an empty message list,
 * and the reason was a notice at the top. Every side's read of such a pair is refused, so none of those could lead
 * anywhere. Now a pair whose read was refused draws the reason once, in the panel, and under it a press back to the
 * contacts, in the words the back arrow already carries for a screen reader.
 *
 * THE CASES. Cases 3 to 5 are read by the person in a browser window of their own.
 *   1. THE CONTROL: the door reads the pair of the two agents.
 *   2. The door refuses a pair with a side nobody answers to, in either order, with the first agent named by its id or
 *      its handle, and read as neither side or as the first agent's: 404, its sentence that quotes the id, and the short
 *      reason, which quotes none.
 *   3. THE CONTROL: the row of the two agents, opened in the chat, draws its message and no notice.
 *   4. The row of the first agent and the id nobody answers to, opened in the chat, draws the short reason once, in the
 *      panel, and the press back; no notice, heading, side button, line saying whose view it is or message list; and the
 *      panel quotes the id nowhere.
 *   5. The press back, pressed, draws the Between agents list again, with that row in it.
 *
 * NOT REACHED BY ANY CASE, and why:
 *   - The chat reads an open pair again when a message in it arrives, and that read's failure is a notice, since what
 *     was read before stays drawn. No door writes a message to or from an id nobody answers to, so no message can
 *     arrive in such a pair while it is open.
 *   - The chat's read of the pair as one side. Before round 95 case 4 pressed a side button after the refusal; there is
 *     no side button after a refusal now. The door's answer to a side is case 2's, and the chat draws the answer to every
 *     read of a pair through the same place.
 *
 * MADE-UP RECORDS, filed by the test office's person: two agents, each with a name, a handle and a record of its own,
 * a message from the first agent to the second, and a message from the second agent to the first. The second message's
 * stored sender is then made an id nobody registered, in the database, as in
 * tests/the-chat-names-a-participant-it-has-no-row-for-in-the-one-phrase.test.ts: the door stores the registry id of a
 * sender and refuses one nobody registered, so the shape is in rows written before that rule, and the only way to have
 * one now is to write a message and then reshape it. The message is first checked to hold the registry id the door
 * stored, so the shape is made here and not found.
 *
 * MUTATIONS, after a control run. Round 94's three, where case 4 read the reason in the notice; since round 95 it reads
 * the reason in the panel:
 *   1. The Between door's refusal carries no short reason: case 2 fails, and case 4 fails at the reason.
 *   2. The chat's read of a pair on opening it draws the door's sentence, as before round 94: case 4 fails at the
 *      reason.
 *   3. `theShortReasonOf` in src/web/components/Chat.tsx, the one place, answers no reason: case 4 fails at the reason,
 *      and so does the chat case of tests/the-press-on-a-message-to-an-agent-opens-that-agents-conversation.test.ts.
 * Round 95's:
 *   4. The refused pair is drawn as before, with its heading and side buttons above an empty list: cases 4 and 5 fail.
 *   5. The refusal is a notice as well as the panel's reason: case 4 fails at the notice.
 *   6. The press back does nothing: case 5 fails.
 *
 * With W13Y_BETWEEN_SHOTS set to a folder, the last case photographs what case 4 reads, at 1440, 990, 660 and 390 in
 * both themes, under the made-up label, on the code it runs on.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { CHAT_WORDS } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** The two agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  lamp: { name: 'Lamp Lighter', handle: 'lamp-lighter' },
  bell: { name: 'Bell Ringer', handle: 'bell-ringer' },
} as const
type Who = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** The door's sentence, kept as it was: it quotes the id the caller sent. */
const THE_SENTENCE = `No durable agent in this installation answers to "${NOBODYS}".`
/** The short reason beside it, which quotes no id (round 94). */
const THE_REASON = 'No agent in this office answers to one of these two names, so there is nothing to read.'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The two messages: who writes each, to whom, and what it says. */
const SAID = {
  known: { by: 'lamp', to: 'bell', body: 'The tower lamp is lit for you.' },
  nobodys: { by: 'bell', to: 'lamp', body: 'The bell rang at noon for you.' },
} as const

describe("the Between door's refusal of a side nobody answers to", () => {
  let app: LiveApp
  /** Each agent's registry id, as the office gave it. */
  const ids: Record<Who, string> = { lamp: '', bell: '' }

  beforeAll(async () => {
    app = await liveApp({ name: 'between-door-short-reason', viewport: { width: 1440, height: 1000 } })
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
    // NOBODY ANSWERS TO THE MADE-UP ID, or the cases below would prove nothing.
    expect(listed.agents.some((one) => one.id === NOBODYS || one.handle === NOBODYS)).toBe(false)
    const messageIds = {} as Record<keyof typeof SAID, string>
    // NOTHING HOLDS EITHER AGENT IN THE TEST OFFICE, so the office stores each message, routes it and answers 409. The
    // message is stored all the same, and the answer still carries its record.
    for (const one of Object.keys(SAID) as (keyof typeof SAID)[]) {
      const { by, to, body } = SAID[one]
      messageIds[one] = (
        await filed(
          '/api/records',
          { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[by].handle },
          { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'agent', id: ids[to] }] } },
          409,
        )
      )['record']!.id
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

  /** The words drawn on one element, trimmed. */
  const wordsOf = async (where: ReturnType<Page['locator']>): Promise<string> => ((await where.first().textContent()) ?? '').trim()

  /**
   * Opens the panel's Between agents list, as the person does with the tab, presses the row that holds the message
   * given, and answers the status of the Between door's answer to that press.
   */
  async function openTheRowOf(page: Page, body: string): Promise<number> {
    await page.locator('.px-chat-circle').click()
    await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
    await page.locator('.px-chat-tab[data-tab="between"]').click()
    const row = page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', { hasText: body })
    await row.first().waitFor({ timeout: 30_000 })
    const read = page.waitForResponse((reply) => reply.url().includes('/api/messages/between/'))
    await row.first().click()
    return (await read).status()
  }

  describe('the door', () => {
    it('1. the control: the door reads the pair of the two agents', async () => {
      const reply = await fetch(`${app.api}/api/messages/between/${ids.lamp}~${ids.bell}`, { headers: AS_THE_PERSON })
      const text = await reply.text()
      expect(reply.status, text).toBe(200)
      const said = JSON.parse(text) as { messages: { body: string }[] }
      expect(said.messages.map((one) => one.body)).toContain(SAID.known.body)
    })

    it('2. the door refuses a side nobody answers to with its sentence that quotes the id, beside a short reason that quotes none', async () => {
      for (const pair of [`${ids.lamp}~${NOBODYS}`, `${NOBODYS}~${ids.lamp}`, `${AGENTS.lamp.handle}~${NOBODYS}`]) {
        for (const side of ['', `?as=${ids.lamp}`]) {
          const reply = await fetch(`${app.api}/api/messages/between/${pair}${side}`, { headers: AS_THE_PERSON })
          const text = await reply.text()
          expect(reply.status, `${pair}${side}: ${text}`).toBe(404)
          const said = JSON.parse(text) as { error?: unknown; reason?: unknown }
          expect(said.error, `${pair}${side}: the sentence`).toBe(THE_SENTENCE)
          expect(said.reason, `${pair}${side}: the short reason`).toBe(THE_REASON)
        }
      }
      expect(THE_REASON).not.toContain(NOBODYS)
    })
  })

  describe('the chat', () => {
    it('3. the control: the row of the two agents, opened, draws its message and no notice', async () => {
      const { context, page } = await aWindow()
      try {
        expect(await openTheRowOf(page, SAID.known.body)).toBe(200)
        await page.locator('.px-chat .px-chat-bubble', { hasText: SAID.known.body }).first().waitFor({ timeout: 30_000 })
        expect(await page.locator('.px-chat .px-chat-notice').count()).toBe(0)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('4. the row with the id nobody answers to, opened, says the short reason once, in the panel, with the press back and nothing else', async () => {
      const { context, page } = await aWindow()
      try {
        expect(await openTheRowOf(page, SAID.nobodys.body)).toBe(404)
        const refused = page.locator('.px-chat .px-chat-refused')
        await refused.first().waitFor({ timeout: 30_000 })
        expect(await wordsOf(refused.locator('.px-chat-refused-why')), 'the reason').toBe(THE_REASON)
        expect(await wordsOf(refused.locator('.px-chat-refused-back')), 'the press back').toBe(CHAT_WORDS.back)
        const drawn = await page.locator('.px-chat').innerText()
        expect(drawn.split(THE_REASON).length - 1, `the reason, in the panel: ${drawn}`).toBe(1)
        expect(drawn, 'the panel').not.toContain(NOBODYS)
        for (const [what, where] of [
          ['a notice', '.px-chat-notice'],
          ['a heading', '.px-chat-them'],
          ['a side button', '.px-chat-side'],
          ['a line saying whose view it is', '.px-chat-watching'],
          ['a message list', '.px-chat-said'],
        ] as const) {
          expect(await page.locator(`.px-chat ${where}`).count(), `the panel draws ${what}`).toBe(0)
        }
      } finally {
        await context.close()
      }
    }, 120_000)

    it('5. the press back draws the Between agents list again, with that row in it', async () => {
      const { context, page } = await aWindow()
      try {
        expect(await openTheRowOf(page, SAID.nobodys.body)).toBe(404)
        await page.locator('.px-chat .px-chat-refused-back').first().click({ timeout: 30_000 })
        const row = page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact', { hasText: SAID.nobodys.body })
        await row.first().waitFor({ timeout: 30_000 })
        expect(await page.locator('.px-chat .px-chat-refused').count(), 'the reason, after the press back').toBe(0)
      } finally {
        await context.close()
      }
    }, 120_000)
  })

})
