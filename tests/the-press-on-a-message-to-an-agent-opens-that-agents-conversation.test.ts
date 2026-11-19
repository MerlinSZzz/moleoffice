// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS ON A MESSAGE THE PERSON SENT NAMES THE AGENT IT WENT TO, AND OPENS THAT AGENT'S CONVERSATION (wave 13y
 * round 91, item 15f).
 *
 * Both message pages draw a press that opens a message where it is read: the Messages page row's press, with its title
 * and its words for a screen reader, and the "Open it where it is read" press on a message's own page. For a message the
 * reader sent, the press is about who it went to, and `theOtherSide` in each page took that from the first delivery row
 * that is not the reader's, as the row stores it. Two things were wrong with that:
 *   - a delivery stored under the agent's handle or its own record was drawn under that handle or record, and the press
 *     opened the chat at that stored id, where the panel has no name for it, not at the agent;
 *   - a delivery stored under an id nobody answers to was drawn under that id, as if it were a name.
 * Now each page reads a delivery's stored id through `theAgentAStoredSenderNames` in src/shared/messages.ts, the one
 * reader of a stored participant, and keeps it as it is stored when nobody answers it. The press names it through
 * `theWritersName`, the rule round 90 gave the list of who a message reached: the agent by its name, and an id nobody
 * answers to by "An agent this page has no name for".
 *
 * THE CONVERSATION THE PRESS OPENS HOLDS THE MESSAGE (wave 13y round 91, the first answer). The server put a
 * message the person sent in the agent's conversation only when its delivery row stored the agent's registry id. One
 * stored under the agent's handle or its own record was in no conversation the agent is in, read by either side, and in
 * no contact row: `everyoneElseThisMessageIsBetween` in src/server/lib/messages.ts compared each stored recipient as it
 * was stored, and the reads of an agent's own messages (`theIdsChosenFor`) and of a page of one conversation
 * (`theIdsOfOnePair`) found the deliveries to its registry id alone. Now each stored recipient is read through
 * `theAgentAStoredSenderNames`, as a stored sender is, both reads find the deliveries stored under the agent's handle
 * and its own record as well, and the contacts read the record of each agent a delivery stores. So the press opens a
 * conversation that holds the message it was pressed on.
 *
 * THE CHAT OPENED AT AN ID NOBODY ANSWERS TO (wave 13y round 91, the second answer). The press on the message
 * delivered under such an id opens the chat at that id. The panel headed the conversation "Name unavailable", and the
 * server refuses to read a conversation with somebody neither registry holds, so the panel said "Reading this
 * conversation…" for ever. Now the heading says what the pages say, through `theWritersName`, once the panel has read
 * who there is, and a conversation whose read failed says so, with the reason, in place of the reading line.
 *
 * THE HEADING'S STATUS ENDS AS WELL (round 103 of wave 13y). Since round 102 the heading reads the agent's status with
 * the conversation, and says it is reading the status until that read lands. When the conversation's read failed, the
 * status read's answer was thrown away with it, so the heading said it was reading for ever. The chat case now waits
 * for the heading to stop saying so.
 *
 * THE PHRASE INSIDE A SENTENCE, AND A FAILED READ THAT QUOTES NO ID (wave 13y round 93, item 15g). Two things were
 * still wrong on those pages:
 *   - the press read "Open this in the conversation with An agent this page has no name for". The phrase stands where
 *     a name stands and starts upper case, which is right where it stands alone and wrong after a sentence's first
 *     word;
 *   - the chat said "This conversation could not be read: No agent in this installation answers to "Qx7nobodyHas".",
 *     the door's sentence for an agent, which quotes the id it was sent.
 * Now `unregisteredName` and `theWritersName` take where the phrase goes, alone or inside a sentence, and make both
 * from the one word; both presses ask for it inside a sentence. A name and a line the writer typed are never changed.
 * The conversation door keeps its sentence, which tests/a-conversation-is-found-by-an-agents-handle.test.ts reads for
 * the id an agent sent, and adds a short reason that quotes no id. The chat says that reason and nothing in front of
 * it, as ErrorNote says a short reason. The chat's other sentences that name somebody after their first word are in
 * tests/the-chat-names-a-participant-it-has-no-row-for-in-the-one-phrase.test.ts.
 *
 * MADE-UP RECORDS, filed by the test office's person: one agent with a name, a handle and a record of its own, one
 * message from the agent to the person, and four from the person to the agent.
 *
 * THE STORED RECIPIENT IS GIVEN ITS SHAPE IN THE DATABASE, after the message is written through the door, as in
 * tests/the-chat-never-draws-a-claimed-id-as-a-name.test.ts. The door stores the registry id of each recipient and
 * refuses one neither registry holds (`whyTheAddressingIsRefused` in src/server/lib/messages.ts), so these shapes are in
 * rows written before those rules, and the only way to have one now is to write a message and then reshape it. Each
 * message is first checked to hold the registry id the door stored, in its delivery row and in its stored `to`, so the
 * shape is made here and not found. The message to the registry id is left as the door wrote it, so the press on it is
 * the control: it named the agent before round 91 as well.
 *
 * MUTATIONS, after a control run:
 *   1. `theOtherSide` in src/web/pages/MessagesPage.tsx returns the delivery as it is stored: the Messages page row
 *      case fails for the handle and the record.
 *   2. The Messages page row's press is named by the registry's name or else the stored id, as before round 91: the
 *      Messages page case fails for the id nobody answers to.
 *   3. `theOtherSide` in src/web/pages/MessagePage.tsx returns the delivery as it is stored: the own page case fails
 *      for the handle and the record.
 *   4. The own page's press is named by the registry's name or else the stored id, as before round 91: the own page
 *      case fails for the id nobody answers to.
 *   5. `everyoneElseThisMessageIsBetween` compares each stored recipient as it was stored: the server case fails, and
 *      both press cases fail at the message for the handle and the record.
 *   6. `theIdsChosenFor` reads the deliveries to the agent's registry id alone: the server case fails as the agent.
 *   7. `withTheRecordsTheseMessagesStore` reads no record for a stored recipient: the server case fails at the
 *      person's contact row.
 *   8. `theIdsOfOnePair` reads the deliveries to the agent's registry id alone: the server case fails at a page of the
 *      conversation, read by either side, and both press cases fail at the message for the handle and the record.
 *   9. The chat's heading names somebody it has no row for "Name unavailable", as before round 91: the chat case
 *      fails at the heading.
 *  10. The chat draws the reading line while it holds no conversation, whether or not its read failed, as before round
 *      91: the chat case fails at the panel's conversation.
 *  11. The recipients' fast path in `theWritersOfOnePool` takes no agent's own record as a name another participant may
 *      hold: the server case fails, and both press cases fail at the message for the record.
 *  12. `unregisteredName` gives the phrase as it is stored wherever it goes: both cases of the phrase alone and inside
 *      a sentence fail, and the press case fails.
 *  13. The Messages page row's press asks for the phrase alone: the press case fails at the row.
 *  14. The own page's press asks for the phrase alone: the press case fails at the own page.
 *  15. The conversation door's refusal carries no short reason: the door case fails, and the chat case fails at the
 *      panel's conversation.
 *  16. The chat draws a failed read with the door's sentence after its own words, as before round 93: the chat case
 *      fails at the panel's conversation.
 *  17. The chat's line for a screen reader names the agent by the phrase alone: the chat case fails at the line.
 *
 * With W13Y_PRESS_SHOTS set to a folder, it photographs the own pages of the messages to the agent's record and to the
 * id nobody answers to, and the chat opened at that id, at 1440, 990, 660 and 390 in both themes, under the made-up
 * label. The chat is photographed once its read of the conversation has answered, so the pictures show what the panel
 * says then on the code they run on, before round 91 as well.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import {
  CHAT_WORDS,
  MESSAGES_PAGE,
  participantKey,
  theWritersName,
  unregisteredName,
  type KnownParticipant,
  type MessageOnTheWire,
  type UnregisteredWriter,
} from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { messagePath } from '../src/web/components/router.tsx'

/** The agent: a name, a handle and a record, each a different string. */
const AGENT = { name: 'Gate Keeper', handle: 'gate-keeper' } as const
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** What every page says for a stored agent it has no name for (wave 13y round 88). */
const NO_NAME_FOR_AN_AGENT = enWave13y['chat.anAgentThisPageHasNoNameFor']
const NO_NAME_FOR_A_PERSON = enWave13y['chat.aPersonThisPageHasNoNameFor']
/** A phrase as it goes inside a sentence, after the sentence's first word: its first letter lower case (round 93). */
const insideASentence = (phrase: string): string => `${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`
/** What the conversation door says, quoting no id, of an agent and of a person nobody answers to (round 93). */
const NOBODY_TO_READ = {
  agent: 'No agent in this office answers to this name, so there is nothing to read.',
  person: 'No person in this office answers to this name, so there is nothing to read.',
} as const
/**
 * The two readers of a name asked where it goes. Read loosely, because this file is committed before they take the
 * choice; asked with no choice, each answers as it did before round 93.
 */
const nameOfAWriterNobodyRegistered = unregisteredName as (writer: UnregisteredWriter, where?: 'alone' | 'inASentence') => string
const nameOfAWriter = theWritersName as (
  one: Pick<MessageOnTheWire, 'sentBy' | 'from'>,
  everyone: readonly KnownParticipant[],
  where?: 'alone' | 'inASentence',
) => string
const SHOTS = process.env.W13Y_PRESS_SHOTS
const LABEL = 'Made-up data — a test office with one agent and five messages, not real office data'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The agent's message to the person, which is in the agent's conversation whatever the press opens. */
const THE_AGENTS = 'The north gate is shut for the night.'

/** The person's four messages to the agent, and the stored id each delivery is given. */
const SENT = {
  registry: { body: 'Is the north gate shut?', storedAs: 'registry' },
  handle: { body: 'Is the south gate shut?', storedAs: 'handle' },
  record: { body: 'Is the east gate shut?', storedAs: 'record' },
  nobody: { body: 'Is the west gate shut?', storedAs: 'nobody' },
} as const
type Sent = keyof typeof SENT

describe('the press on a message the person sent names the agent it went to and opens its conversation', () => {
  let app: LiveApp
  /** The agent's registry id and its own record's id, as the office gave them. */
  const ids = { registry: '', record: '' }
  /** Each message's record id, as the door gave it. */
  const messageIds = {} as Record<Sent, string>

  beforeAll(async () => {
    app = await liveApp({ name: 'press-opens-the-agent', viewport: { width: 1440, height: 1000 } })
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ kind: 'agent', title: AGENT.name, data: { handle: AGENT.handle, runtime: 'claude-code', state: 'active' } }),
    })
    const madeText = await made.text()
    expect(made.status, madeText).toBe(201)
    ids.record = (JSON.parse(madeText) as { record: { id: string } }).record.id
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
      agents: { id: string; handle: string; name: string; record?: string | null }[]
    }
    const row = listed.agents.find((one) => one.handle === AGENT.handle)
    ids.registry = row?.id ?? ''
    // THE NAME, THE HANDLE, THE REGISTRY ID AND THE RECORD ARE DIFFERENT STRINGS, or a case would prove nothing.
    expect([row?.name, row?.record], JSON.stringify(row)).toEqual([AGENT.name, ids.record])
    expect(new Set([AGENT.name, AGENT.handle, ids.registry, ids.record]).size).toBe(4)
    const theirs = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle },
      body: JSON.stringify({ kind: 'message', title: THE_AGENTS.slice(0, 30), data: { body: THE_AGENTS, to: [{ kind: 'person', id: THE_PERSON }] } }),
    })
    expect(theirs.status, await theirs.text()).toBe(201)
    for (const one of Object.keys(SENT) as Sent[]) await send(one)
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Writes one message from the person to the agent through the door, then gives its delivery its stored id. */
  async function send(one: Sent): Promise<void> {
    const { body, storedAs } = SENT[one]
    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: ids.registry }] } }),
    })
    const text = await reply.text()
    // THE UNHELD 409 (decision 60sbc5I-bwKx): the person's send to a registered agent nothing holds stores the letter
    // and answers the error. The agent is its own starter's end, so the walk makes no second delivery row.
    expect(reply.status, text).toBe(409)
    const id = (JSON.parse(text) as { record: { id: string } }).record.id
    messageIds[one] = id
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      const rows = db.prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ?').all(id)
      const stored = db.prepare("SELECT json_extract(data, '$.to') AS stored FROM records WHERE id = ?").get(id) as { stored: string }
      // THE CONTROL: the door delivered the message to the agent's registry id and stored the same, and nobody else.
      const theAgent: ParticipantRef = { kind: 'agent', id: ids.registry }
      expect(rows, `who the door delivered ${one} to`).toEqual([theAgent])
      expect(JSON.parse(stored.stored), `who the door stored ${one} as to`).toEqual([theAgent])
      if (storedAs === 'registry') return
      const as = storedAs === 'handle' ? AGENT.handle : storedAs === 'record' ? ids.record : NOBODYS
      db.prepare('UPDATE message_delivery SET recipient_id = ? WHERE message_id = ?').run(as, id)
      db.prepare("UPDATE records SET data = json_set(data, '$.to', json(?)) WHERE id = ?").run(JSON.stringify([{ kind: 'agent', id: as }]), id)
    } finally {
      db.close()
    }
  }

  /** A window of its own on the Messages page, with the page's rows drawn. */
  async function aWindow() {
    const context = await app.browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    await page.goto(`${app.site}/#/messages`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-ms-one').first().waitFor({ timeout: 30_000 })
    return { context, page }
  }

  /** A window of its own on one message's own page, in one theme and at one width, with its press drawn. */
  async function itsOwnPage(one: Sent, theme: 'light' | 'dark' = 'light', width = 1440) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#${messagePath(messageIds[one])}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.mp-open').first().waitFor({ timeout: 30_000 })
    return { context, page }
  }

  /** The words drawn on one element, trimmed. */
  const wordsOf = async (where: ReturnType<Page['locator']>): Promise<string> => ((await where.first().textContent()) ?? '').trim()

  /**
   * After a press: the panel's heading names the agent, and the agent's own message to the person is in the panel, so
   * the conversation open is the agent's and not one with the stored id. The message the press was on is in it too: it
   * is newer than the agent's, so it is drawn by the time the agent's is.
   */
  async function theAgentsConversationIsOpen(page: Page, where: string, one: Sent): Promise<void> {
    await expect.poll(() => wordsOf(page.locator('.px-chat .px-chat-name')), { message: `the panel's heading, opened from ${where}`, timeout: 10_000 }).toBe(AGENT.name)
    await page.locator('.px-chat li.px-chat-one', { hasText: THE_AGENTS }).first().waitFor({ timeout: 30_000 })
    expect(await page.locator('.px-chat li.px-chat-one', { hasText: SENT[one].body }).count(), `the message pressed on, in the conversation opened from ${where}`).toBe(1)
  }

  for (const one of ['registry', 'handle', 'record'] as const) {
    it(`names the agent on the Messages page row's press for the message delivered under its ${one}, and opens its conversation`, async () => {
      const { context, page } = await aWindow()
      try {
        const press = page.locator('.px-ms-one', { hasText: SENT[one].body }).locator('.px-ms-open')
        expect(await press.getAttribute('data-other'), "the row's press").toBe('participant')
        expect(await press.getAttribute('title'), "the row's press").toBe(MESSAGES_PAGE.openItWhereItIsRead(AGENT.name))
        expect(await wordsOf(press.locator('.sr-only')), "the row's press, for a screen reader").toBe(MESSAGES_PAGE.openItWhereItIsRead(AGENT.name))
        await press.click()
        await theAgentsConversationIsOpen(page, 'the Messages page', one)
      } finally {
        await context.close()
      }
    }, 120_000)

    it(`names the agent on the own page's press for the message delivered under its ${one}, and opens its conversation`, async () => {
      const { context, page } = await itsOwnPage(one)
      try {
        const press = page.locator('.mp-open')
        expect(await wordsOf(press), "the own page's press").toBe(MESSAGES_PAGE.openItWhereItIsRead(AGENT.name))
        await press.click()
        await theAgentsConversationIsOpen(page, 'its own page', one)
      } finally {
        await context.close()
      }
    }, 120_000)
  }

  it("puts the person's messages delivered under the agent's handle or record in their conversation, read by either side, and on each side's one contact row", async () => {
    const AS_THE_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT.handle }
    const read = async <T,>(url: string, headers: Record<string, string>): Promise<T> => {
      const reply = await fetch(`${app.api}${url}`, { headers })
      const text = await reply.text()
      expect(reply.status, `${url}: ${text}`).toBe(200)
      return JSON.parse(text) as T
    }
    const bodiesOf = async (url: string, headers: Record<string, string>): Promise<string[]> =>
      (await read<{ messages: { body: string }[] }>(url, headers)).messages.map((one) => one.body).sort()
    const withTheAgent = `/api/messages/conversation?kind=agent&id=${encodeURIComponent(ids.registry)}`
    const withThePerson = `/api/messages/conversation?kind=person&id=${encodeURIComponent(THE_PERSON)}`
    // A PAGE OF THE CONVERSATION AND THE WHOLE OF IT, which choose their messages by two readers, from each side. The
    // message delivered under an id nobody answers to is in neither side's.
    const between = [THE_AGENTS, SENT.registry.body, SENT.handle.body, SENT.record.body].sort()
    // THE ROUTED LIST IS TAKEN OFF THE MESSAGES TO THE HANDLE AND THE RECORD WHILE THIS CASE READS, and put back after.
    // Nothing answers as the agent in the test office, so the door routed each message and stored that in its `routed`
    // list, and a message with one is in every reader's own list (`theIdsChosenFor`). A message the routing did not touch
    // has none, and then only its delivery row puts it in the agent's own list.
    const db = new Database(join(app.dir, 'panelx.db'))
    const kept = new Map<string, string>()
    try {
      for (const one of ['handle', 'record'] as const) {
        const id = messageIds[one]
        const stored = db.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
        kept.set(id, stored.data)
        expect((JSON.parse(stored.data) as { routed?: unknown[] }).routed?.length ?? 0, `the routed list of the message to the ${one}`).toBeGreaterThan(0)
        db.prepare("UPDATE records SET data = json_remove(data, '$.routed') WHERE id = ?").run(id)
      }
      expect({
        personPage: await bodiesOf(`${withTheAgent}&limit=50`, AS_THE_PERSON),
        personWhole: await bodiesOf(withTheAgent, AS_THE_PERSON),
        agentPage: await bodiesOf(`${withThePerson}&limit=50`, AS_THE_AGENT),
        agentWhole: await bodiesOf(withThePerson, AS_THE_AGENT),
      }).toEqual({ personPage: between, personWhole: between, agentPage: between, agentWhole: between })
      // ONE CONTACT ROW EACH WAY, whose newest line is the newest message between them: the one delivered under the record.
      type Rows = { contacts: { who: ParticipantRef | null; last: { body: string } | null }[] }
      const theAgentsNames = [ids.registry, AGENT.handle, ids.record]
      const personsRows = (await read<Rows>('/api/messages/contacts', AS_THE_PERSON)).contacts
        .filter((one) => one.who?.kind === 'agent' && theAgentsNames.includes(one.who.id))
        .map((one) => ({ id: one.who?.id, last: one.last?.body ?? null }))
      const agentsRows = (await read<Rows>('/api/messages/contacts', AS_THE_AGENT)).contacts
        .filter((one) => one.who?.kind === 'person' && one.who.id === THE_PERSON)
        .map((one) => ({ id: one.who?.id, last: one.last?.body ?? null }))
      expect({ personsRows, agentsRows }).toEqual({
        personsRows: [{ id: ids.registry, last: SENT.record.body }],
        agentsRows: [{ id: THE_PERSON, last: SENT.record.body }],
      })
    } finally {
      for (const [id, data] of kept) db.prepare('UPDATE records SET data = ? WHERE id = ?').run(data, id)
      db.close()
    }
  }, 60_000)

  it('says in words on both presses that the page has no name for an agent nobody answers to, and draws its stored id on neither', async () => {
    // INSIDE THE SENTENCE THE PHRASE STARTS LOWER CASE (round 93). The control: the phrase as stored starts upper case,
    // so the two forms differ and this case can tell them apart.
    expect(insideASentence(NO_NAME_FOR_AN_AGENT)).not.toBe(NO_NAME_FOR_AN_AGENT)
    const said = MESSAGES_PAGE.openItWhereItIsRead(insideASentence(NO_NAME_FOR_AN_AGENT))
    const { context, page } = await aWindow()
    try {
      const row = page.locator('.px-ms-one', { hasText: SENT.nobody.body })
      const press = row.locator('.px-ms-open')
      expect(await press.getAttribute('title'), "the row's press").toBe(said)
      expect(await wordsOf(press.locator('.sr-only')), "the row's press, for a screen reader").toBe(said)
      expect(await row.innerText(), 'the Messages page row').not.toContain(NOBODYS)
    } finally {
      await context.close()
    }
    const own = await itsOwnPage('nobody')
    try {
      expect(await wordsOf(own.page.locator('.mp-open')), "the own page's press").toBe(said)
      expect(await own.page.locator('body').innerText(), 'its own page').not.toContain(NOBODYS)
    } finally {
      await own.context.close()
    }
  }, 120_000)

  /** The chat panel opened by the press on the own page of the message to the id nobody answers to. */
  async function theChatAtNobody() {
    const own = await itsOwnPage('nobody')
    await own.page.locator('.mp-open').click()
    return { ...own, panel: own.page.locator('.px-chat') }
  }

  it('opens the chat at an agent nobody answers to under the same words, and ends there in a stated state, not in reading for ever', async () => {
    const { context, panel } = await theChatAtNobody()
    try {
      // THE HEADING SAYS THE PHRASE ALONE, as stored; the line's words for a screen reader say it inside a sentence.
      // Nobody wrote a line for this agent, so since round 102 of wave 13y the heading draws no line, and those words
      // are on the press beside the name that opens the line's editor.
      await expect.poll(() => wordsOf(panel.locator('.px-chat-them .px-chat-name')), { message: "the panel's heading", timeout: 10_000 }).toBe(NO_NAME_FOR_AN_AGENT)
      expect(await panel.locator('.px-chat-them').innerText(), "the panel's heading").not.toContain(NOBODYS)
      expect(await panel.locator('.px-chat-edit-personal').first().getAttribute('aria-label'), "the agent's line, for a screen reader").toBe(
        CHAT_WORDS.theirLine(insideASentence(NO_NAME_FOR_AN_AGENT)),
      )
      // THE FAILED READ IS SAID IN THE DOOR'S SHORT REASON AND NOTHING ELSE, which quotes no id (round 93).
      await expect.poll(() => wordsOf(panel.locator('.px-chat-empty')), { message: "the panel's conversation, once its read has failed", timeout: 30_000 }).toBe(
        NOBODY_TO_READ.agent,
      )
      const drawn = await panel.innerText()
      expect(drawn, 'the panel').not.toContain(en['chat.readingConversation'])
      expect(drawn, 'the panel').not.toContain(NOBODYS)
      // THE STATUS READ ENDS TOO: the heading stops saying it is reading the agent's status.
      await expect.poll(() => panel.locator('.px-chat-them').innerText(), { message: "the panel's heading, once the status read has ended", timeout: 30_000 }).not.toContain(
        enWave13y['chat.status.reading'],
      )
    } finally {
      await context.close()
    }
  }, 120_000)

  it('has the conversation door refuse an id nobody answers to in its sentence that quotes the id, beside a short reason that quotes none', async () => {
    for (const kind of ['agent', 'person'] as const) {
      const reply = await fetch(`${app.api}/api/messages/conversation?kind=${kind}&id=${NOBODYS}`, { headers: AS_THE_PERSON })
      const said = (await reply.json()) as { error?: unknown; reason?: unknown }
      expect(reply.status, `${kind}: ${JSON.stringify(said)}`).toBe(404)
      // THE CONTROL: the door's sentence still quotes the id it was sent, as an agent reading the door is told.
      expect(String(said.error), `${kind}: the door's sentence`).toContain(`"${NOBODYS}"`)
      expect(said.reason, `${kind}: the short reason`).toBe(NOBODY_TO_READ[kind])
    }
  }, 60_000)

  it.runIf(SHOTS)('photographs the chat opened at the agent nobody answers to at the four widths in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await itsOwnPage('nobody', theme, width)
        try {
          // ONCE THE READ HAS ANSWERED AND THE PANEL HAS DRAWN TWICE SINCE, whatever the panel says then is the picture.
          const answered = page.waitForResponse((reply) => reply.url().includes('/api/messages/conversation?'))
          await page.locator('.mp-open').click()
          await answered
          await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
          // THE LABEL GOES IN THE HEADING, above the name. Above the heading, and above the line where no conversation is
          // held, it reached the panel's left edge and lay over the grip that resizes the panel.
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-chat .px-chat-them-top'), `the chat at nobody, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/chat-at-nobody-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
      }
    }
  }, 1_200_000)

  it.runIf(SHOTS)('photographs the own pages of the messages to the record and to nobody at the four widths in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const one of ['record', 'nobody'] as const) {
          const own = await itsOwnPage(one, theme, width)
          try {
            await putTheMadeUpLabelIn(own.page, LABEL, own.page.locator('.mp-facts'), `the own page of the message to ${one}, ${theme} at ${width}`)
            await own.page.screenshot({ path: `${SHOTS}/own-page-to-${one}-${theme}-${width}.png`, fullPage: true })
          } finally {
            await own.context.close()
          }
        }
      }
    }
  }, 1_200_000)
})

describe('the phrase for somebody the page has no name for, alone and inside a sentence (round 93)', () => {
  const NOBODY_AS_AN_AGENT: ParticipantRef = { kind: 'agent', id: NOBODYS }

  it('is the stored phrase alone, and inside a sentence the same phrase starting lower case, for an agent, a person and a writer that left no name', () => {
    for (const [writer, phrase] of [
      [{ typed: null, said: NOBODY_AS_AN_AGENT }, NO_NAME_FOR_AN_AGENT],
      [{ typed: null, said: { kind: 'person', id: NOBODYS } }, NO_NAME_FOR_A_PERSON],
      [{ typed: null, said: null }, en['chat.unregisteredWithNoName']],
    ] as const) {
      // THE CONTROL: each phrase is stored starting upper case, so its form inside a sentence is a different string.
      expect(insideASentence(phrase), phrase).not.toBe(phrase)
      expect(nameOfAWriterNobodyRegistered(writer), `${phrase}, asked with no choice`).toBe(phrase)
      expect(nameOfAWriterNobodyRegistered(writer, 'alone'), `${phrase}, alone`).toBe(phrase)
      expect(nameOfAWriterNobodyRegistered(writer, 'inASentence'), `${phrase}, inside a sentence`).toBe(insideASentence(phrase))
    }
  })

  it('never changes a line the writer typed, or a name a registry holds, inside a sentence', () => {
    const typed = 'Night Watch at the west gate'
    expect(nameOfAWriterNobodyRegistered({ typed, said: NOBODY_AS_AN_AGENT }, 'inASentence')).toBe(typed)
    const theAgent: ParticipantRef = { kind: 'agent', id: 'gateKeeperId' }
    const everyone: KnownParticipant[] = [{ who: theAgent, name: AGENT.name, handle: AGENT.handle }]
    expect(nameOfAWriter({ sentBy: theAgent, from: null }, everyone, 'inASentence'), 'a name a registry holds').toBe(AGENT.name)
    expect(nameOfAWriter({ sentBy: NOBODY_AS_AN_AGENT, from: null }, everyone, 'inASentence'), 'an id nobody answers to').toBe(
      insideASentence(NO_NAME_FOR_AN_AGENT),
    )
    expect(nameOfAWriter({ sentBy: NOBODY_AS_AN_AGENT, from: null }, everyone), 'the same, asked with no choice').toBe(NO_NAME_FOR_AN_AGENT)
  })
})
