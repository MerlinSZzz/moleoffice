// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT NAMES A STORED SENDER IN ITS OFFERS AND IN THE AGENTS' CONVERSATIONS AS EVERY PAGE DOES (wave 13y round 91,
 * gap 7 of item 15e).
 *
 * Every page names a stored sender by one rule, `theWritersName` in src/shared/messages.ts: by the registry id, the
 * agent's own record or its handle, and in words when nobody answers to it (rounds 86 and 88). The chat panel asks it
 * in three more places, and no test drew any of them with a sender stored under anything but the registry id:
 *   - the offer under a message that leads somewhere (`Where` in src/web/components/Chat.tsx, `.px-chat-lead-words`),
 *     in the person's conversation with an agent, in a group, and in the conversation with a writer nobody registered;
 *   - the offer under a line Remind me later brought back, which names the message's first sender (`whoFirstSentIt`);
 *   - the writer's name on each message in the Between agents view read as neither side (`.px-chat-who`).
 *
 * THE CASES. Each is read by the person in a browser window of its own.
 *   1. THE CONTROL: the offer under the agent's message stored under its registry id names the agent.
 *   2. The offer under its message stored under its own record names the agent.
 *   3. The offer under its message stored under its handle names the agent.
 *   4. In the group, the offer under the other agent's message stored under its handle names that agent.
 *   5. In the conversation with a writer nobody registered, the offer says the page has no name for the agent, and
 *      draws no claimed id.
 *   6. The line Remind me later brought back for the message stored under the handle names the agent in its offer.
 *   7. THE CONTROL: the Between agents view of the two agents, read as neither side, names the agent on its message
 *      stored under the registry id.
 *   8. The same view draws the agent's message to the other agent stored under its handle, under the agent's name.
 *   9. The Between agents list has one row for the two agents, and no row says it has no name for one of them.
 *  10. That row's last line is the two agents' newest message, the one stored under the first agent's handle.
 *  11. The list has one row for the first agent and a third agent, whose only message, from the first agent, is stored
 *      under the first agent's handle, and the row names both.
 *  12. The list has one row for the first agent and a fourth agent, whose only message, to the first agent, is stored
 *      under the fourth agent's own record, and the row names both.
 * Cases 10 and 11 were added after the server fix of gap 7 had been made, when two of its mutations turned no case red
 * (wave 13y round 91): the list's pairs were named in two places, and each place hid the other while the pair also held
 * a message stored under the registry id. Case 12 was added when a third mutation, the list reading no agent's own
 * record, turned no case red: no message between two agents was stored under an own record. Its agent is a fourth
 * because cases 9 and 11 count the rows that hold one agent's name.
 *
 * MADE-UP RECORDS, filed by the test office's person: four agents, each with a name, a handle and a record of its own,
 * a note the offers lead to, and a group of the person and the first two agents. Each message is written through the
 * door as its agent and then given its stored sender in the database, as in
 * tests/the-chat-never-draws-a-claimed-id-as-a-name.test.ts, which says why: the door stores the registry id, so these
 * shapes are in rows written before it did. Each message is first checked to hold the registry id the door stored. The
 * line Remind me later brings back stores the first sender as the message stored it when the line was written
 * (src/server/lib/remind-me-later.ts), so the message is reshaped before its time is moved into the past, and the line
 * is checked to store the handle.
 *
 * MUTATIONS, after a control run; the round's report says which case each turned red.
 */
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { LEADING, participantKey } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT, groupOpenKey } from '../src/web/lib/open-chat.ts'

/** The four agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  lamp: { name: 'Lamp Lighter', handle: 'lamp-lighter' },
  bell: { name: 'Bell Ringer', handle: 'bell-ringer' },
  cart: { name: 'Cart Driver', handle: 'cart-driver' },
  gate: { name: 'Gate Keeper', handle: 'gate-keeper' },
} as const
type Who = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** What every page says for a stored agent it has no name for. */
const NO_NAME_FOR_AN_AGENT = enWave13y['chat.anAgentThisPageHasNoNameFor']
/** What the Between agents list drew for a side the page had no name for, before round 91 gave it the phrase above. */
const NAME_UNAVAILABLE = en['chat.unknownName']

/** A place no offer here leads to, so the words before it in an offer are the words that name its sender. */
const SOMEWHERE = 'Somewhere'
/** The words an offer begins with when it names `name`: the sentence up to the place it leads to. */
const anOfferFrom = (name: string): string => LEADING.offer(name, SOMEWHERE).split(SOMEWHERE)[0]!
/** Whether an offer drawn on the page begins with the words that name `name`. */
const offersFrom = (drawn: string, name: string): boolean => drawn.startsWith(anOfferFrom(name))

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * The messages: who writes each, to whom, what it says, whether it leads to the note, and the stored sender it is
 * given. `registry` keeps the registry id the door stored.
 */
const SAID = {
  leadRegistry: { by: 'lamp', to: 'person', body: 'Come and see the lamp list.', lead: true, storedAs: 'registry' },
  leadRecord: { by: 'lamp', to: 'person', body: 'Come and see the west stair list.', lead: true, storedAs: 'record' },
  leadHandle: { by: 'lamp', to: 'person', body: 'Come and see the east stair list.', lead: true, storedAs: 'handle' },
  leadNobody: { by: 'lamp', to: 'person', body: 'Come and see the cellar list.', lead: true, storedAs: 'nobody' },
  groupHandle: { by: 'bell', to: 'group', body: 'Come and see the bell rota.', lead: true, storedAs: 'handle' },
  betweenRegistry: { by: 'lamp', to: 'bell', body: 'The tower lamp is lit for you.', lead: false, storedAs: 'registry' },
  betweenHandle: { by: 'lamp', to: 'bell', body: 'The porch lamp is lit for you.', lead: false, storedAs: 'handle' },
  toCartHandle: { by: 'lamp', to: 'cart', body: 'The gate lamp is lit for your cart.', lead: false, storedAs: 'handle' },
  fromGateRecord: { by: 'gate', to: 'lamp', body: 'The gate is shut for the night.', lead: false, storedAs: 'record' },
} as const
type Said = keyof typeof SAID

describe("the chat's offers and the Between agents view name a stored sender", () => {
  let app: LiveApp
  /** Each agent's registry id and its own record's id, as the office gave them. */
  const ids: Record<Who, { registry: string; record: string }> = {
    lamp: { registry: '', record: '' },
    bell: { registry: '', record: '' },
    cart: { registry: '', record: '' },
    gate: { registry: '', record: '' },
  }
  let groupId = ''
  let noteId = ''
  /** Each message's record id, as the door gave it. */
  const messageIds = {} as Record<Said, string>

  beforeAll(async () => {
    app = await liveApp({ name: 'chat-offer-names', viewport: { width: 1440, height: 1000 }, remindMeLaterEverySeconds: 1 })
    for (const who of Object.keys(AGENTS) as Who[]) {
      const { name, handle } = AGENTS[who]
      ids[who].record = (await filed('/api/records', AS_THE_PERSON, { kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } }))['record']!.id
    }
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string; name: string; record?: string | null }[]
    }
    for (const who of Object.keys(AGENTS) as Who[]) {
      const row = listed.agents.find((one) => one.handle === AGENTS[who].handle)
      ids[who].registry = row?.id ?? ''
      // THE NAME, THE HANDLE, THE REGISTRY ID AND THE RECORD ARE DIFFERENT STRINGS, or a case would prove nothing.
      expect([row?.name, row?.record], JSON.stringify(row)).toEqual([AGENTS[who].name, ids[who].record])
      expect(new Set([AGENTS[who].name, AGENTS[who].handle, ids[who].registry, ids[who].record]).size).toBe(4)
    }
    noteId = (await filed('/api/records', AS_THE_PERSON, { kind: 'note', title: 'The stair lists', data: { date: '2026-10-26', body: 'The lists the offers lead to.' } }))['record']!.id
    groupId = (
      await filed('/api/groups', AS_THE_PERSON, {
        name: 'The bell tower',
        because: 'The two agents report on the tower to the person here.',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'the person reads the reports' },
          { who: { kind: 'agent', id: ids.lamp.registry }, because: 'it lights the lamps' },
          { who: { kind: 'agent', id: ids.bell.registry }, because: 'it rings the bell' },
        ],
      })
    )['group']!.id
    for (const one of Object.keys(SAID) as Said[]) await write(one)
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Files one thing through a door and answers the record or group it made. */
  async function filed(path: string, headers: Record<string, string>, body: unknown, expected = 201): Promise<Record<string, { id: string }>> {
    const reply = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    const text = await reply.text()
    expect(reply.status, text).toBe(expected)
    return JSON.parse(text) as Record<string, { id: string }>
  }

  /** Writes one message through the door as its agent, then gives its stored sender its shape. */
  async function write(one: Said): Promise<void> {
    const { by, to, body, lead, storedAs } = SAID[one]
    const addressed =
      to === 'group' ? { toGroup: groupId } : { to: [to === 'person' ? { kind: 'person', id: THE_PERSON } : { kind: 'agent', id: ids[to].registry }] }
    const data = { body, ...addressed, ...(lead ? { lead: { target: { kind: 'record', recordId: noteId, workspaceId: 'default' } } } : {}) }
    // NOTHING HOLDS ANY OF THE AGENTS IN THE TEST OFFICE, so a message to one is stored, routed and answered 409. It is
    // stored all the same, and the answer still carries its record. A message to the person or the group keeps its 201.
    const expected = to === 'person' || to === 'group' ? 201 : 409
    const id = (
      await filed('/api/records', { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[by].handle }, { kind: 'message', title: body.slice(0, 30), data }, expected)
    )['record']!.id
    messageIds[one] = id
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy, json_extract(data, '$.lead') AS lead FROM records WHERE id = ?").get(id) as {
        sentBy: string
        lead: string | null
      }
      // THE CONTROL: the door stored the registry id, and the offer when one was sent, so the shape below is made here.
      expect([JSON.parse(stored.sentBy), stored.lead !== null], `what the door stored for ${one}`).toEqual([{ kind: 'agent', id: ids[by].registry }, lead])
      if (storedAs !== 'registry') {
        const as = storedAs === 'handle' ? AGENTS[by].handle : storedAs === 'record' ? ids[by].record : NOBODYS
        db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(as, id)
      }
    } finally {
      db.close()
    }
  }

  /** A window of its own on Home, with the page drawn. */
  async function aWindow() {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    return { context, page }
  }

  /** Opens the panel at a contact or a group, the way another page asks it to. */
  async function openThePanelAt(page: Page, key: string): Promise<void> {
    await page.evaluate(([name, detail]) => window.dispatchEvent(new CustomEvent(name, { detail })), [OPEN_AT, key] as const)
  }

  /** The panel's row of one message, once the panel has drawn it. */
  async function inThePanel(page: Page, one: Said) {
    const row = page.locator('.px-chat li.px-chat-one', { hasText: SAID[one].body })
    await row.first().waitFor({ timeout: 30_000 })
    return row.first()
  }

  /** The words drawn on one element, trimmed. */
  const wordsOf = async (where: ReturnType<Page['locator']>): Promise<string> => ((await where.first().textContent()) ?? '').trim()

  /** The offer drawn under one message in the panel. */
  const theOfferUnder = async (page: Page, one: Said): Promise<string> => wordsOf((await inThePanel(page, one)).locator('.px-chat-lead-words'))

  /** Opens the panel's Between agents list, as the person does with the tab. */
  async function theBetweenList(page: Page) {
    await page.locator('.px-chat-circle').click()
    await page.locator('.px-chat').waitFor({ timeout: 30_000 })
    if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
    await page.locator('.px-chat-tab[data-tab="between"]').click()
    await page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-list').waitFor({ timeout: 30_000 })
    return page.locator('.px-chat-under-tabs[data-showing="between"] .px-chat-contact')
  }

  /** The row of the Between agents list that names both agents, opened as neither side. */
  async function theTwoAgentsReadAsNeither(page: Page): Promise<void> {
    const rows = await theBetweenList(page)
    const both = rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name })
    await both.first().waitFor({ timeout: 30_000 })
    await both.first().click()
    await page.locator('.px-chat-side').first().waitFor({ timeout: 30_000 })
  }

  describe('the offer under a message', () => {
    for (const [one, title] of [
      ['leadRegistry', '1. the control: stored under the registry id, it names the agent'],
      ['leadRecord', "2. stored under the agent's own record, it names the agent"],
      ['leadHandle', "3. stored under the agent's handle, it names the agent"],
    ] as const) {
      it(title, async () => {
        const { context, page } = await aWindow()
        try {
          await openThePanelAt(page, participantKey({ kind: 'agent', id: ids.lamp.registry }))
          const offer = await theOfferUnder(page, one)
          expect(offersFrom(offer, AGENTS.lamp.name), offer).toBe(true)
        } finally {
          await context.close()
        }
      }, 120_000)
    }

    it("4. in the group, stored under the other agent's handle, it names that agent", async () => {
      const { context, page } = await aWindow()
      try {
        await openThePanelAt(page, groupOpenKey(groupId))
        const offer = await theOfferUnder(page, 'groupHandle')
        expect(offersFrom(offer, AGENTS.bell.name), offer).toBe(true)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('5. in the conversation with a writer nobody registered, it says the page has no name for the agent', async () => {
      const { context, page } = await aWindow()
      try {
        await page.goto(`${app.site}/#/messages`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        const row = page.locator('.px-ms-one', { hasText: SAID.leadNobody.body })
        await row.locator('.px-ms-open[data-other="unregistered"]').click()
        const offer = await theOfferUnder(page, 'leadNobody')
        expect(offersFrom(offer, NO_NAME_FOR_AN_AGENT), offer).toBe(true)
        expect(offer).not.toContain(NOBODYS)
      } finally {
        await context.close()
      }
    }, 120_000)
  })

  it('6. the line Remind me later brought back for the message stored under the handle names the agent in its offer', async () => {
    const db = new Database(join(app.dir, 'panelx.db'))
    let line: string | null = null
    try {
      // THE TIME IS MOVED INTO THE PAST IN THIS OFFICE'S OWN DATABASE, so its timer, which looks every second, brings
      // the message back, as in tests/the-one-press-popup-and-remind-me-later-are-drawn-in-the-browser.test.ts.
      const moved = db
        .prepare("UPDATE message_delivery SET remind_at = '2026-01-01 00:00:00' WHERE message_id = ? AND recipient_kind = 'person' AND reminded_at IS NULL")
        .run(messageIds.leadHandle)
      expect(moved.changes).toBe(1)
      const theLine = db.prepare("SELECT id, json_extract(data, '$.extra.backAsYouAsked.from') AS first FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutMessage') = ?")
      let first: string | null = null
      for (let tries = 0; tries < 40 && line === null; tries += 1) {
        const found = theLine.get(messageIds.leadHandle) as { id: string; first: string } | undefined
        line = found?.id ?? null
        first = found?.first ?? null
        if (line === null) await new Promise((resolve) => setTimeout(resolve, 250))
      }
      expect(line, 'the office did not bring the message back within 10 seconds, though its timer looks every second').not.toBeNull()
      // THE CONTROL: the line stores the first sender as the message stored it, the handle.
      expect(JSON.parse(String(first))).toEqual({ kind: 'agent', id: AGENTS.lamp.handle })
    } finally {
      db.close()
    }
    const { context, page } = await aWindow()
    try {
      await openThePanelAt(page, participantKey({ kind: 'agent', id: ids.lamp.registry }))
      const offer = page.locator('.px-chat .px-chat-system[data-carries-an-offer="yes"] .px-chat-lead-words')
      await offer.first().waitFor({ timeout: 30_000 })
      expect(await offer.count(), 'the lines that carry an offer').toBe(1)
      const drawn = await wordsOf(offer)
      expect(offersFrom(drawn, AGENTS.lamp.name), drawn).toBe(true)
    } finally {
      await context.close()
    }
  }, 120_000)

  describe('the Between agents view, read as neither side', () => {
    it("7. the control: the agent's message stored under its registry id is under the agent's name", async () => {
      const { context, page } = await aWindow()
      try {
        await theTwoAgentsReadAsNeither(page)
        expect(await wordsOf((await inThePanel(page, 'betweenRegistry')).locator('.px-chat-who'))).toBe(AGENTS.lamp.name)
      } finally {
        await context.close()
      }
    }, 120_000)

    it("8. the agent's message stored under its handle is drawn there, under the agent's name", async () => {
      const { context, page } = await aWindow()
      try {
        await theTwoAgentsReadAsNeither(page)
        await inThePanel(page, 'betweenRegistry')
        const row = page.locator('.px-chat li.px-chat-one', { hasText: SAID.betweenHandle.body })
        expect(await row.count(), 'the message stored under the handle is in the view').toBe(1)
        expect(await wordsOf(row.locator('.px-chat-who'))).toBe(AGENTS.lamp.name)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('9. the list has one row for the two agents, and none that has no name for one of them', async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theBetweenList(page)
        await rows.filter({ hasText: AGENTS.lamp.name }).first().waitFor({ timeout: 30_000 })
        const drawn = (await rows.allTextContents()).map((one) => one.trim())
        expect(drawn.filter((one) => one.includes(AGENTS.bell.name)), JSON.stringify(drawn)).toHaveLength(1)
        expect(drawn.filter((one) => one.includes(NAME_UNAVAILABLE) || one.includes(NO_NAME_FOR_AN_AGENT)), JSON.stringify(drawn)).toEqual([])
      } finally {
        await context.close()
      }
    }, 120_000)

    it("10. the two agents' row ends on their newest message, the one stored under the handle", async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theBetweenList(page)
        const both = rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name })
        await both.first().waitFor({ timeout: 30_000 })
        expect(await both.count(), 'the rows that name both agents').toBe(1)
        expect(await wordsOf(both.locator('.px-chat-last'))).toContain(SAID.betweenHandle.body)
      } finally {
        await context.close()
      }
    }, 120_000)

    it('11. a pair whose only message is stored under the handle has one row, and it names both agents', async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theBetweenList(page)
        // THE CONTROL OF THE WAIT: the row of the first two agents is there whatever this case finds.
        await rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name }).first().waitFor({ timeout: 30_000 })
        const drawn = (await rows.allTextContents()).map((one) => one.trim())
        const withCart = drawn.filter((one) => one.includes(AGENTS.cart.name))
        expect(withCart, JSON.stringify(drawn)).toHaveLength(1)
        expect(withCart[0], JSON.stringify(drawn)).toContain(AGENTS.lamp.name)
        expect(withCart[0], JSON.stringify(drawn)).toContain(SAID.toCartHandle.body)
      } finally {
        await context.close()
      }
    }, 120_000)

    it("12. a pair whose only message is stored under the sender's own record has one row, and it names both agents", async () => {
      const { context, page } = await aWindow()
      try {
        const rows = await theBetweenList(page)
        // THE CONTROL OF THE WAIT: the row of the first two agents is there whatever this case finds.
        await rows.filter({ hasText: AGENTS.lamp.name }).filter({ hasText: AGENTS.bell.name }).first().waitFor({ timeout: 30_000 })
        const drawn = (await rows.allTextContents()).map((one) => one.trim())
        const withGate = drawn.filter((one) => one.includes(SAID.fromGateRecord.body))
        expect(withGate, JSON.stringify(drawn)).toHaveLength(1)
        expect(withGate[0], JSON.stringify(drawn)).toContain(AGENTS.gate.name)
        expect(withGate[0], JSON.stringify(drawn)).toContain(AGENTS.lamp.name)
      } finally {
        await context.close()
      }
    }, 120_000)
  })
})
