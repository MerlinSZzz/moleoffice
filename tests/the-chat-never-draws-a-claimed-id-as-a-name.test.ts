// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT NEVER DRAWS THE ID A MESSAGE CLAIMS AS A NAME, AND READS EVERY STORED SENDER THROUGH THE ONE READER (wave 13y
 * round 86, item 15d).
 *
 * Items 15 and 15c made the lead pane and the emergency dialogue read a stored sender the way every stored sender is
 * read (`theAgentAStoredSenderNames` in src/shared/messages.ts): the registry id, then the agent's own record, then the
 * one agent with that handle. When nobody answers, they say so in words. The chat panel did neither:
 *   - a writer nobody registered that typed no line was drawn under the id its messages claim (`unregisteredName`),
 *     in its conversation's heading, in the contact list and on the Messages page;
 *   - a message whose stored sender is an agent's handle or its record drew no picture and no name in a conversation
 *     or a group, because the panel matched the registry id only;
 *   - a group message whose sender nobody answers to drew no name line at all.
 * The Messages page row and a message's own page matched the registry id only as well, so a sender stored as a handle
 * was drawn as the handle there.
 *
 * ONE CASE, ONE PHRASE, ON EVERY PAGE (wave 13y round 88, item 15e). Each page still said "a writer that left no name"
 * for a sender that was stored but that the page had no name for, and the Messages page and a message's own page said
 * "Somebody in no registry" for a message that stored no sender. Now every page asks `theWritersName` in
 * src/shared/messages.ts, and it gives five answers:
 *   - a stored sender the page can name: the registry's name;
 *   - a stored agent it cannot name: "An agent this page has no name for", the lead pane's words;
 *   - a stored person it cannot name: "A person this page has no name for";
 *   - no stored sender it can name, and a typed line: that line;
 *   - no stored sender and no typed line: "A writer that left no name", said only when no sender was stored.
 * A message stored under an agent's own record now moves into that agent's conversation at the server, and both pages'
 * lists carry each agent's record, so the server, the chat and both pages name that agent.
 *
 * WHO A MESSAGE REACHED IS NAMED BY THE SAME RULE (wave 13y round 90, the first gap of item 15e). The Messages page
 * row's list of who a message reached, and a message's own page in its To line and its "Where it went" list, drew a
 * recipient the page had no name for under the id its delivery row holds. Each now asks `theWritersName` for every
 * recipient, as for the writer: a recipient the page can name by its name, and one it cannot by "An agent this page
 * has no name for" or "A person this page has no name for".
 *
 * AN AGENT'S OWN MESSAGES ARE IN ITS OWN LIST (wave 13y round 90, the second gap of item 15e and the missing case 7b).
 * An agent's own message to the person, stored under that agent's own record, was missing from the agent's row for
 * the person. The server read an agent's messages by its registry id and its handle only. Now it reads them by the
 * agent's own record in the reading project as well. A message stored under the agent's handle was in its row before
 * round 90 too, so that half of the case passes on the old code and is proved by mutation 24.
 *
 * INSIDE A SENTENCE THE PHRASE STARTS LOWER CASE (wave 13y round 93, item 15g). The press on a Messages page row and on
 * a message's own page read "Open this in the conversation with An agent this page has no name for". Each page now asks
 * for the name inside its sentence, and the page's own phrase starts lower case there. A typed line and a registry name
 * are drawn as they are.
 *
 * MADE-UP RECORDS, filed by the test office's person: two agents, each with a name, a handle and a record of its own,
 * a group of the person and the two agents, ten messages to the person (one of them to the other agent as well) and
 * three in the group.
 *
 * THE STORED SENDER IS GIVEN ITS SHAPE IN THE DATABASE, after the message is written through the door, as in
 * tests/an-emergency-names-its-sender-by-record-or-handle.test.ts. The door stores the writer's registry id (criterion
 * I1) and refuses a writer nobody registered (criterion M59), so these shapes are in rows written before those rules,
 * and the only way to have one now is to write a message and then reshape it. No door is known to store an agent's
 * record id as a sender; that shape is made here because the panel reads every stored sender through the one reader.
 * Each message is first checked to hold the registry id the door stored, so the shape is made here and not found.
 * Two delivery rows of the message to the person and the other agent are added the same way, for an agent and a person
 * nobody answers to: the door refuses a recipient neither registry holds (`whyTheAddressingIsRefused` in
 * src/server/lib/messages.ts), so no message written now has one. The message is first checked to have reached the two
 * it was sent to, and its stored `to` is given the same four recipients, so the record and its rows agree.
 *
 * MUTATIONS, after a control run. Round 86 proved the first eight:
 *   1. `unregisteredName` in src/shared/messages.ts draws the claimed id again when no line was typed: the rule's case,
 *      the own page case, the no-name conversation case (at its Messages page row) and the contact list case fail.
 *   2. The heading's paragraph in src/web/components/Chat.tsx says "the name above is the line it typed" for a writer
 *      that typed none: the no-name conversation case fails.
 *   3. The panel's reader of a stored sender in Chat.tsx matches the registry id only: the handle case in the
 *      conversation and the group's record case fail.
 *   4. GET /api/messages/unregistered answers the writer of the key it was asked with, not of its newest message: the
 *      door's case and the typed-line conversation case fail.
 *   5. The Messages page row in src/web/pages/MessagesPage.tsx matches the registry id only: its handle case fails.
 *   6. A message's own page in src/web/pages/MessagePage.tsx matches the registry id only: its case fails.
 *   7. `theOtherSide` in MessagesPage.tsx returns the stored sender as it was stored: the row's press names the handle,
 *      and the handle case fails.
 *   8. `theOtherSide` in MessagePage.tsx does the same: the own page's press names the handle, and its case fails.
 * Round 88 proved these:
 *   9. `unregisteredName` says "a writer that left no name" for every writer that typed no line, as before round 88:
 *      the rule's case, the cases of an agent and a person nobody answers to, and the contact list case fail.
 *  10. It says the agent's words for a stored person too: the rule's case and the person's case fail.
 *  11. The group view in src/web/components/Chat.tsx draws "Somebody in no registry" for a sender it cannot name, as
 *      before round 88: both group cases with no name fail.
 *  12. The Messages page's writer statement is the one before round 88: the case with no stored sender fails.
 *  13. The own page's writer statement is the one before round 88: the typed-line and no-sender cases fail.
 *  14. The Messages page's `everyone` carries no record: the record case fails at its row.
 *  15. The own page's `everyone` carries no record: the record case fails at its own page.
 *  16. The server's reader of one conversation leaves the agent's record out of the ids it reads: the server's record
 *      case and the record case fail.
 *  17. The server's contacts read no record for the stored senders: the server's record case and the contact list
 *      case fail.
 *  18. GET /api/messages/unregistered reads no record for the writer it was asked about: the server's record case
 *      fails.
 * Round 90 added these:
 *  19. The Messages page row in src/web/pages/MessagesPage.tsx draws a recipient by the registry's name or else its
 *      id, as before round 90: the case of who a message reached fails at the row.
 *  20. A message's own page in src/web/pages/MessagePage.tsx does so in its To line: that case fails at the To line.
 *  21. It does so in its "Where it went" list: that case fails at the list.
 *  22. The server's read of one reader's messages (`theIdsChosenFor` in src/server/lib/messages.ts) leaves the
 *      agent's own record out: the own row case fails for the agent whose message is stored under its record.
 *  23. The server's contacts (`theContactsOfOneReader`) read no record for the reader itself: that case fails the
 *      same way.
 *  24. `theIdsChosenFor` leaves the agent's handle out: the own row case fails for the agent whose message is stored
 *      under its handle.
 * Round 93 added these:
 *  25. The Messages page row in src/web/pages/MessagesPage.tsx asks for the name alone in its press, as before round 93:
 *      the cases of an agent and a person nobody answers to and of no stored sender fail at the row's press, and so does
 *      the no-name conversation case.
 *  26. A message's own page in src/web/pages/MessagePage.tsx does so in its press: the same three cases fail at the
 *      own page's press.
 * Round 173 added this:
 *  27. The door answers 201 again for a send to an agent nothing holds: the check of the message `reached` fails.
 *
 * With W13Y_CHAT_NAME_SHOTS set to a folder, it photographs the Messages page, the conversation with the agent the page
 * has no name for, the group, the own page of the message stored under an agent's record and the whole own page of the
 * message that reached four recipients at 1440, 990, 660 and 390 in both themes, under the made-up label.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import * as shared from '../src/shared/messages.ts'
import { CHAT_WORDS, MESSAGES_PAGE, participantKey, unregisteredKey, unregisteredName, type KnownParticipant } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { enWave13y } from '../src/shared/words/en-wave-13y.ts'
import { OPEN_AT, groupOpenKey } from '../src/web/lib/open-chat.ts'
import { messagePath } from '../src/web/components/router.tsx'

/** The two agents, each a name, a handle and a record, every one a different string. */
const AGENTS = {
  lamp: { name: 'Lamp Lighter', handle: 'lamp-lighter' },
  bell: { name: 'Bell Ringer', handle: 'bell-ringer' },
} as const
type Who = keyof typeof AGENTS
/** Twelve characters in the shape of an id, which no registry row and no record in the test office has. */
const NOBODYS = 'Qx7nobodyHas'
/** Another such id, claimed by the writer that typed a line. */
const CLAIMED = 'Zr4claimedId'
/** The line that writer typed. */
const TYPED = 'Night Porter'
/** The line typed by a writer whose message stored no sender at all. */
const TYPED_ALONE = 'Day Porter'
/** A third such id, stored as a person's. */
const NOBODYS_PERSON = 'Pt9nobodyHas'
const SHOTS = process.env.W13Y_CHAT_NAME_SHOTS
const LABEL = 'Made-up data — a test office with two agents, a group and thirteen messages, not real office data'
/**
 * What the heading's paragraph says for a writer that typed no line, in English, read from the list the page reads. NOT
 * TYPED AS THE LIST, so the file runs the same before the sentence was in it, and fails there on what the panel draws.
 */
const NO_LINE_PARAGRAPH = (enWave13y as Record<string, unknown>)['chat.unregisteredIsNoName']
/**
 * What every page says for a stored sender it has no name for, an agent's and a person's, read the same way and for the
 * same reason (wave 13y round 88).
 */
const NO_NAME_FOR_AN_AGENT = (enWave13y as Record<string, unknown>)['chat.anAgentThisPageHasNoNameFor'] as string
const NO_NAME_FOR_A_PERSON = (enWave13y as Record<string, unknown>)['chat.aPersonThisPageHasNoNameFor'] as string
/** The page's own phrase as a sentence carries it: starting lower case (wave 13y round 93). */
const insideASentence = (phrase: string): string => `${phrase.charAt(0).toLowerCase()}${phrase.slice(1)}`
/** What the two pages said before round 88 for a message that stored no sender, which no page says now. */
const NO_REGISTRY = en['chat.somebodyUnknown']
/** The one rule every page asks, read by name so the file runs the same before it was written, and fails there. */
const theWritersName = (shared as Record<string, unknown>)['theWritersName'] as
  | ((one: { sentBy: ParticipantRef | null; from: string | null }, everyone: readonly KnownParticipant[]) => string)
  | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The two recipients nobody answers to, which the message `reached` is given in the database. */
const NOBODY_REACHED: readonly ParticipantRef[] = [
  { kind: 'agent', id: NOBODYS },
  { kind: 'person', id: NOBODYS_PERSON },
]

/**
 * The thirteen messages: who writes each, where, what it says, and the stored sender and typed line it is given.
 * `nothing` removes the stored sender, `person` stores an id nobody has as a person's, and `registry` keeps the
 * registry id the door stored. `reached` is sent to the person and the other agent.
 */
const SAID = {
  handle: { by: 'lamp', inGroup: false, body: 'The lamps on the east stair are lit.', storedAs: 'handle', typed: null },
  nobody: { by: 'lamp', inGroup: false, body: 'A line whose writer left no name.', storedAs: 'nobody', typed: null },
  typed: { by: 'lamp', inGroup: false, body: 'The night door is locked.', storedAs: 'claimed', typed: TYPED },
  typedAlone: { by: 'lamp', inGroup: false, body: 'The day door is open.', storedAs: 'nothing', typed: TYPED_ALONE },
  none: { by: 'lamp', inGroup: false, body: 'A line that stored no writer at all.', storedAs: 'nothing', typed: null },
  person: { by: 'lamp', inGroup: false, body: 'A line stored as from a person nobody has.', storedAs: 'person', typed: null },
  record: { by: 'lamp', inGroup: false, body: 'The lamps on the west stair are lit.', storedAs: 'record', typed: null },
  groupRecord: { by: 'bell', inGroup: true, body: 'The bell rang at noon.', storedAs: 'record', typed: null },
  groupNobody: { by: 'bell', inGroup: true, body: 'A group line nobody answers for.', storedAs: 'nobody', typed: null },
  groupNone: { by: 'bell', inGroup: true, body: 'A group line that stored no writer.', storedAs: 'nothing', typed: null },
  reached: { by: 'lamp', inGroup: false, body: 'The hall lamps are lit for all four.', storedAs: 'registry', typed: null },
  bellOwn: { by: 'bell', inGroup: false, body: 'The bell rope is new.', storedAs: 'record', typed: null },
  lampOwn: { by: 'lamp', inGroup: false, body: 'The lamp oil is ordered.', storedAs: 'handle', typed: null },
} as const
type Said = keyof typeof SAID

describe('the chat and the Messages page name a stored sender', () => {
  let app: LiveApp
  /** Each agent's registry id and its own record's id, as the office gave them. */
  const ids: Record<Who, { registry: string; record: string }> = { lamp: { registry: '', record: '' }, bell: { registry: '', record: '' } }
  let groupId = ''
  /** Each message's record id, as the door gave it. */
  const messageIds = {} as Record<Said, string>

  beforeAll(async () => {
    app = await liveApp({ name: 'chat-claimed-ids', viewport: { width: 1440, height: 1000 } })
    for (const who of Object.keys(AGENTS) as Who[]) {
      const { name, handle } = AGENTS[who]
      const reply = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: AS_THE_PERSON,
        body: JSON.stringify({ kind: 'agent', title: name, data: { handle, runtime: 'claude-code', state: 'active' } }),
      })
      const text = await reply.text()
      expect(reply.status, text).toBe(201)
      ids[who].record = (JSON.parse(text) as { record: { id: string } }).record.id
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
    const group = await fetch(`${app.api}/api/groups`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({
        name: 'The east stair',
        because: 'The two agents report on the stair to the person here.',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'the person reads the reports' },
          { who: { kind: 'agent', id: ids.lamp.registry }, because: 'it lights the lamps' },
          { who: { kind: 'agent', id: ids.bell.registry }, because: 'it rings the bell' },
        ],
      }),
    })
    const groupText = await group.text()
    expect(group.status, groupText).toBe(201)
    groupId = (JSON.parse(groupText) as { group: { id: string } }).group.id
    for (const one of Object.keys(SAID) as Said[]) await write(one)
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** Writes one message through the door as its agent, then gives its stored sender and typed line their shape. */
  async function write(one: Said): Promise<void> {
    const { by, inGroup, body, storedAs, typed } = SAID[one]
    const to: ParticipantRef[] = [{ kind: 'person', id: THE_PERSON }, ...(one === 'reached' ? [{ kind: 'agent' as const, id: ids.bell.registry }] : [])]
    const reply = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[by].handle },
      body: JSON.stringify({
        kind: 'message',
        title: body.slice(0, 30),
        data: inGroup ? { body, toGroup: groupId } : { body, to },
      }),
    })
    const text = await reply.text()
    // THE MESSAGE `reached` ANSWERS 409: the door says that nothing answers as "bell", and the message is stored and
    // waits. Every other message answers 201.
    expect(reply.status, text).toBe(one === 'reached' ? 409 : 201)
    if (one === 'reached') {
      // THE 409 IS FOR "bell" ALONE, BY ITS REGISTRY ID, so a 409 for any other reason fails.
      const { routed } = JSON.parse(text) as { routed?: { for: ParticipantRef; said?: { was: string } }[] }
      expect(routed?.map((entry) => ({ for: entry.for, was: entry.said?.was })), text).toEqual([
        { for: { kind: 'agent', id: ids.bell.registry }, was: 'nothing answering' },
      ])
    }
    const id = (JSON.parse(text) as { record: { id: string } }).record.id
    messageIds[one] = id
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy, json_extract(data, '$.from') AS typed FROM records WHERE id = ?").get(id) as {
        sentBy: string
        typed: string | null
      }
      // THE CONTROL: the door stored the registry id and no typed line, so the shape below is made here and not found.
      expect([JSON.parse(stored.sentBy), stored.typed], `what the door stored for ${one}`).toEqual([{ kind: 'agent', id: ids[by].registry }, null])
      if (storedAs === 'nothing') db.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(id)
      else if (storedAs === 'person') {
        db.prepare("UPDATE records SET data = json_set(data, '$.sentBy', json_object('kind', 'person', 'id', ?)) WHERE id = ?").run(NOBODYS_PERSON, id)
      } else if (storedAs !== 'registry') {
        const as = storedAs === 'handle' ? AGENTS[by].handle : storedAs === 'record' ? ids[by].record : storedAs === 'nobody' ? NOBODYS : CLAIMED
        db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(as, id)
      }
      if (typed !== null) db.prepare("UPDATE records SET data = json_set(data, '$.from', ?) WHERE id = ?").run(typed, id)
      if (one === 'reached') addTheRecipientsNobodyAnswersTo(db, id, to)
    } finally {
      db.close()
    }
  }

  /**
   * Gives a message two more recipients, an agent and a person nobody answers to, in its delivery rows and in its stored
   * `to` alike.
   */
  function addTheRecipientsNobodyAnswersTo(db: Database.Database, id: string, sent: readonly ParticipantRef[]): void {
    const rows = db.prepare('SELECT recipient_kind AS kind, recipient_id AS id, at FROM message_delivery WHERE message_id = ?').all(id) as {
      kind: 'agent' | 'person'
      id: string
      at: string
    }[]
    const stored = db.prepare("SELECT json_extract(data, '$.to') AS stored FROM records WHERE id = ?").get(id) as { stored: string }
    // THE CONTROL: the door wrote a row for each of the two it was sent to and stored the same two, and nobody else.
    const inOrder = (all: readonly ParticipantRef[]) => all.map((one) => participantKey(one)).sort()
    expect(inOrder(rows), 'who the door delivered the message to').toEqual(inOrder(sent))
    expect(inOrder(JSON.parse(stored.stored) as ParticipantRef[]), 'who the door stored the message as to').toEqual(inOrder(sent))
    const add = db.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, 'queued', ?)")
    for (const [n, who] of NOBODY_REACHED.entries()) add.run(`${id}-nobody-${n}`, id, who.kind, who.id, rows[0]!.at)
    db.prepare("UPDATE records SET data = json_set(data, '$.to', json(?)) WHERE id = ?").run(JSON.stringify([...sent, ...NOBODY_REACHED]), id)
  }

  /** A window of its own on the Messages page, in one theme and at one width, with the page's rows drawn. */
  async function aWindow(theme: 'light' | 'dark' = 'light', width = 1440) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#/messages`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.px-ms-one').first().waitFor({ timeout: 30_000 })
    return { context, page }
  }

  /** A window of its own on one message's own page, with the line naming who wrote it drawn. */
  async function itsOwnPage(one: Said, theme: 'light' | 'dark' = 'light', width = 1440) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/#${messagePath(messageIds[one])}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('.mp-writer').first().waitFor({ timeout: 30_000 })
    return { context, page }
  }

  /** The Messages page row of one message. */
  const theRow = (page: Page, one: Said) => page.locator('.px-ms-one', { hasText: SAID[one].body })

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

  /** The labels of the pictures drawn on one element. */
  const picturesOf = async (where: ReturnType<Page['locator']>): Promise<string[]> =>
    where.locator('img.avatar').evaluateAll((all) => all.map((one) => one.getAttribute('title') ?? ''))

  it('names no writer by the id it claims, in the one rule every screen reads', () => {
    expect(unregisteredName({ typed: null, said: { kind: 'agent', id: NOBODYS } })).toBe(NO_NAME_FOR_AN_AGENT)
    expect(unregisteredName({ typed: TYPED, said: { kind: 'agent', id: CLAIMED } })).toBe(TYPED)
    expect(unregisteredName({ typed: '  ', said: { kind: 'agent', id: CLAIMED } })).toBe(NO_NAME_FOR_AN_AGENT)
    expect(unregisteredName({ typed: null, said: { kind: 'person', id: NOBODYS_PERSON } })).toBe(NO_NAME_FOR_A_PERSON)
    expect(unregisteredName({ typed: TYPED_ALONE, said: null })).toBe(TYPED_ALONE)
    expect(unregisteredName({ typed: null, said: null })).toBe(CHAT_WORDS.unregisteredWithNoName)
  })

  it('gives one answer for each of the five cases, in the one rule every page asks for a writer', () => {
    expect(typeof theWritersName, 'theWritersName in src/shared/messages.ts').toBe('function')
    const named = theWritersName!
    // MADE-UP IDS, which the rule reads as strings: one agent and one person, each with a name and a handle.
    const everyone: KnownParticipant[] = [
      { who: { kind: 'agent', id: 'agentRegistry' }, name: AGENTS.lamp.name, handle: AGENTS.lamp.handle, record: 'agentsRecord' },
      { who: { kind: 'person', id: 'personRegistry' }, name: 'Door Keeper', handle: 'door-keeper' },
    ]
    const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })
    for (const [sentBy, from, says] of [
      // A stored sender the page can name: by the registry id, the agent's own record or its handle.
      [agent('agentRegistry'), null, AGENTS.lamp.name],
      [agent('agentsRecord'), null, AGENTS.lamp.name],
      [agent(AGENTS.lamp.handle), TYPED, AGENTS.lamp.name],
      [{ kind: 'person', id: 'personRegistry' }, null, 'Door Keeper'],
      // A stored sender it cannot name, which typed no line.
      [agent(NOBODYS), null, NO_NAME_FOR_AN_AGENT],
      [agent(NOBODYS), '  ', NO_NAME_FOR_AN_AGENT],
      [{ kind: 'person', id: NOBODYS_PERSON }, null, NO_NAME_FOR_A_PERSON],
      // A typed line, with no stored sender the page can name.
      [agent(CLAIMED), TYPED, TYPED],
      [null, TYPED_ALONE, TYPED_ALONE],
      [null, AGENTS.lamp.handle, AGENTS.lamp.name],
      // Nothing stored and nothing typed.
      [null, null, CHAT_WORDS.unregisteredWithNoName],
      [null, '  ', CHAT_WORDS.unregisteredWithNoName],
    ] as const) {
      expect(named({ sentBy, from }, everyone), JSON.stringify({ sentBy, from })).toBe(says)
    }
  })

  it('answers, for a key that carries no typed line, the writer as its newest message has it', async () => {
    const key = unregisteredKey({ typed: null, said: { kind: 'agent', id: CLAIMED } })
    const reply = await fetch(`${app.api}/api/messages/unregistered?writer=${encodeURIComponent(key)}`, { headers: AS_THE_PERSON })
    const text = await reply.text()
    expect(reply.status, text).toBe(200)
    const said = JSON.parse(text) as { writer: { typed: string | null; said: { kind: string; id: string } | null }; messages: { body: string }[] }
    expect(said.messages.map((one) => one.body)).toEqual([SAID.typed.body])
    expect(said.writer).toEqual({ typed: TYPED, said: { kind: 'agent', id: CLAIMED } })
  }, 60_000)

  it("puts a one-to-one message stored under an agent's own record in that agent's conversation, at the server", async () => {
    const bodiesOf = async (url: string): Promise<string[]> => {
      const reply = await fetch(`${app.api}${url}`, { headers: AS_THE_PERSON })
      const text = await reply.text()
      expect(reply.status, `${url}: ${text}`).toBe(200)
      return (JSON.parse(text) as { messages: { body: string }[] }).messages.map((one) => one.body)
    }
    const lamp = `kind=agent&id=${encodeURIComponent(ids.lamp.registry)}`
    // A PAGE OF THE CONVERSATION AND THE WHOLE OF IT, which choose their messages by two readers.
    expect(await bodiesOf(`/api/messages/conversation?${lamp}&limit=50`), 'a page').toEqual(expect.arrayContaining([SAID.handle.body, SAID.record.body]))
    expect(await bodiesOf(`/api/messages/conversation?${lamp}`), 'the whole').toEqual(expect.arrayContaining([SAID.handle.body, SAID.record.body]))
    const key = unregisteredKey({ typed: null, said: { kind: 'agent', id: ids.lamp.record } })
    expect(await bodiesOf(`/api/messages/unregistered?writer=${encodeURIComponent(key)}`), 'a writer nobody registered').toEqual([])
    const reply = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_PERSON })
    const text = await reply.text()
    expect(reply.status, text).toBe(200)
    const { contacts } = JSON.parse(text) as { contacts: { who: ParticipantRef | null; unregistered: { said: ParticipantRef | null } | null }[] }
    expect(contacts.filter((one) => one.unregistered?.said?.id === ids.lamp.record), 'a contact row for the record').toEqual([])
    expect(contacts.filter((one) => one.who?.kind === 'agent' && one.who.id === ids.lamp.registry).length, "the agent's row").toBe(1)
  }, 60_000)

  /**
   * THE FIVE CASES, each with the name every page gives its writer and the press its Messages page row draws (round 88).
   * A sender the page can name is stored as the agent's handle and as its record. A typed line is in two messages: one
   * whose stored sender nobody answers to, and one that stored none. The last is the name inside the press's sentence,
   * where the page's own phrase starts lower case (round 93).
   */
  const FIVE_CASES = [
    ['handle', () => AGENTS.lamp.name, 'participant', () => AGENTS.lamp.name],
    ['record', () => AGENTS.lamp.name, 'participant', () => AGENTS.lamp.name],
    ['nobody', () => NO_NAME_FOR_AN_AGENT, 'unregistered', () => insideASentence(NO_NAME_FOR_AN_AGENT)],
    ['person', () => NO_NAME_FOR_A_PERSON, 'unregistered', () => insideASentence(NO_NAME_FOR_A_PERSON)],
    ['typed', () => TYPED, 'unregistered', () => TYPED],
    ['typedAlone', () => TYPED_ALONE, 'unregistered', () => TYPED_ALONE],
    ['none', () => CHAT_WORDS.unregisteredWithNoName, 'unregistered', () => insideASentence(CHAT_WORDS.unregisteredWithNoName)],
  ] as const
  for (const [one, name, other, inASentence] of FIVE_CASES) {
    it(`names the writer of the ${one} message the same way on the Messages page, in the chat and on its own page`, async () => {
      const { context, page } = await aWindow()
      try {
        const row = theRow(page, one)
        expect(await wordsOf(row.locator('.px-ms-from')), 'the Messages page row').toBe(name())
        const press = row.locator(`.px-ms-open[data-other="${other}"]`)
        expect(await press.getAttribute('title'), "the row's press").toBe(MESSAGES_PAGE.openItWhereItIsRead(inASentence()))
        await press.click()
        await inThePanel(page, one)
        await expect
          .poll(() => wordsOf(page.locator('.px-chat .px-chat-name')), { message: 'the chat, opened from the row', timeout: 10_000 })
          .toBe(name())
      } finally {
        await context.close()
      }
      const own = await itsOwnPage(one)
      try {
        expect(await wordsOf(own.page.locator('.mp-writer')), 'its own page').toBe(name())
        const press = own.page.locator('.mp-open')
        expect(await wordsOf(press), "its own page's press").toBe(MESSAGES_PAGE.openItWhereItIsRead(inASentence()))
        await press.click()
        await inThePanel(own.page, one)
        await expect
          .poll(() => wordsOf(own.page.locator('.px-chat .px-chat-name')), { message: 'the chat, opened from its own page', timeout: 10_000 })
          .toBe(name())
      } finally {
        await own.context.close()
      }
    }, 180_000)
  }

  it("draws the Messages page row of a message stored under the agent's handle under the agent's name and picture, and opens the agent's conversation", async () => {
    const { context, page } = await aWindow()
    try {
      const row = theRow(page, 'handle')
      expect(await wordsOf(row.locator('.px-ms-from'))).toBe(AGENTS.lamp.name)
      expect(await picturesOf(row.locator('.px-ms-head'))).toEqual([AGENTS.lamp.name])
      // THE ROW'S PRESS NAMES THE AGENT AND OPENS ITS CONVERSATION, which is where the server puts a message stored under
      // its handle.
      const press = row.locator('.px-ms-open[data-other="participant"]')
      expect(await press.getAttribute('title')).toBe(MESSAGES_PAGE.openItWhereItIsRead(AGENTS.lamp.name))
      await press.click()
      await inThePanel(page, 'handle')
      await expect.poll(() => wordsOf(page.locator('.px-chat .px-chat-name')), { timeout: 10_000 }).toBe(AGENTS.lamp.name)
    } finally {
      await context.close()
    }
  }, 120_000)

  it("names the sender on a message's own page through the same reader, and a writer nobody registered by its line or by words saying it left none", async () => {
    for (const [one, writer, pictures] of [
      ['handle', AGENTS.lamp.name, [AGENTS.lamp.name]],
      ['record', AGENTS.lamp.name, [AGENTS.lamp.name]],
      ['nobody', NO_NAME_FOR_AN_AGENT, []],
      ['person', NO_NAME_FOR_A_PERSON, []],
      ['typed', TYPED, []],
      ['typedAlone', TYPED_ALONE, []],
      ['none', CHAT_WORDS.unregisteredWithNoName, []],
    ] as const) {
      const { context, page } = await itsOwnPage(one)
      try {
        const facts = page.locator('.mp-facts .mp-fact').first()
        expect(await wordsOf(page.locator('.mp-writer')), `the writer of ${one}`).toBe(writer)
        expect(await picturesOf(facts), `the picture of the writer of ${one}`).toEqual([...pictures])
        expect(await wordsOf(facts), `the writer of ${one}`).not.toMatch(
          new RegExp(`${NOBODYS}|${NOBODYS_PERSON}|${CLAIMED}|${AGENTS.lamp.handle}|${ids.lamp.record}`),
        )
      } finally {
        await context.close()
      }
    }
  }, 240_000)

  it("draws a message stored under the agent's handle with the agent's picture, in the conversation with the agent", async () => {
    const { context, page } = await aWindow()
    try {
      await openThePanelAt(page, participantKey({ kind: 'agent', id: ids.lamp.registry }))
      const row = await inThePanel(page, 'handle')
      expect(await picturesOf(row)).toEqual([AGENTS.lamp.name])
    } finally {
      await context.close()
    }
  }, 120_000)

  it("names a group message stored under the agent's own record by the agent's name and picture", async () => {
    const { context, page } = await aWindow()
    try {
      await openThePanelAt(page, groupOpenKey(groupId))
      const row = await inThePanel(page, 'groupRecord')
      expect(await row.locator('.px-chat-typed').count(), 'the message draws no line saying who sent it').toBe(1)
      expect(await wordsOf(row.locator('.px-chat-typed'))).toBe(AGENTS.bell.name)
      expect(await picturesOf(row)).toEqual([AGENTS.bell.name])
    } finally {
      await context.close()
    }
  }, 120_000)

  it('says in words that it has no name for a group message whose sender nobody answers to, and that one which stored none left none', async () => {
    const { context, page } = await aWindow()
    try {
      await openThePanelAt(page, groupOpenKey(groupId))
      for (const [one, says] of [
        ['groupNobody', NO_NAME_FOR_AN_AGENT],
        ['groupNone', CHAT_WORDS.unregisteredWithNoName],
      ] as const) {
        const row = await inThePanel(page, one)
        expect(await row.locator('.px-chat-typed').count(), `the message ${one} draws no line saying who sent it`).toBe(1)
        expect(await wordsOf(row.locator('.px-chat-typed')), one).toBe(says)
        expect(await picturesOf(row), one).toEqual([])
        expect(await wordsOf(row), one).not.toContain(NOBODYS)
      }
    } finally {
      await context.close()
    }
  }, 120_000)

  it('opens the conversation with an agent the page has no name for under words saying so, and draws its claimed id nowhere', async () => {
    const { context, page } = await aWindow()
    try {
      const row = theRow(page, 'nobody')
      expect(await wordsOf(row.locator('.px-ms-from'))).toBe(NO_NAME_FOR_AN_AGENT)
      const press = row.locator('.px-ms-open[data-other="unregistered"]')
      expect(await press.getAttribute('title')).toBe(MESSAGES_PAGE.openItWhereItIsRead(insideASentence(NO_NAME_FOR_AN_AGENT)))
      await press.click()
      await inThePanel(page, 'nobody')
      await expect.poll(() => wordsOf(page.locator('.px-chat .px-chat-name')), { timeout: 10_000 }).toBe(NO_NAME_FOR_AN_AGENT)
      expect(await wordsOf(page.locator('.px-chat .px-chat-watching'))).toBe(NO_LINE_PARAGRAPH)
      expect(await wordsOf(page.locator('.px-chat'))).not.toContain(NOBODYS)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('opens the conversation with a writer that typed a line under that line, from the Messages page too', async () => {
    const { context, page } = await aWindow()
    try {
      const row = theRow(page, 'typed')
      expect(await wordsOf(row.locator('.px-ms-from'))).toBe(TYPED)
      await row.locator('.px-ms-open[data-other="unregistered"]').click()
      await inThePanel(page, 'typed')
      await expect.poll(() => wordsOf(page.locator('.px-chat .px-chat-name')), { timeout: 10_000 }).toBe(TYPED)
      expect(await wordsOf(page.locator('.px-chat .px-chat-watching'))).toBe(CHAT_WORDS.unregisteredIs)
      expect(await wordsOf(page.locator('.px-chat'))).not.toContain(CLAIMED)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('says "Somebody in no registry" nowhere, on the Messages page or in the group', async () => {
    const { context, page } = await aWindow()
    try {
      // THE TEXT DRAWN, not every node's text: the page's own scripts are in the body too.
      expect(await page.locator('body').innerText(), 'the Messages page').not.toContain(NO_REGISTRY)
      await openThePanelAt(page, groupOpenKey(groupId))
      await inThePanel(page, 'groupNone')
      expect(await page.locator('.px-chat').innerText(), 'the group').not.toContain(NO_REGISTRY)
    } finally {
      await context.close()
    }
  }, 120_000)

  it('names who a message reached by the same rule, on its Messages page row and on its own page', async () => {
    const reply = await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })
    const text = await reply.text()
    expect(reply.status, text).toBe(200)
    const person = (JSON.parse(text) as { people: { id: string; name: string }[] }).people.find((one) => one.id === THE_PERSON)?.name
    expect(person, 'the name the registry has for the person').toBeTruthy()
    // THE FOUR, IN NO ORDER: the person and the other agent by their names, and the two nobody answers to in words.
    const four = [person!, AGENTS.bell.name, NO_NAME_FOR_AN_AGENT, NO_NAME_FOR_A_PERSON].sort()
    const anId = new RegExp(`${NOBODYS}|${NOBODYS_PERSON}`)
    const trimmed = (all: string[]) => all.map((one) => one.trim()).sort()
    const { context, page } = await aWindow()
    try {
      const row = theRow(page, 'reached')
      expect(trimmed(await row.locator('.px-ms-who').allTextContents()), 'the Messages page row').toEqual(four)
      expect(await wordsOf(row.locator('.px-ms-went')), 'the Messages page row').not.toMatch(anId)
    } finally {
      await context.close()
    }
    const own = await itsOwnPage('reached')
    try {
      expect(trimmed((await wordsOf(own.page.locator('.mp-to-list'))).split(', ')), 'its own page, the To line').toEqual(four)
      expect(trimmed(await own.page.locator('.mp-went .mp-who').allTextContents()), 'its own page, where it went').toEqual(four)
      expect(await wordsOf(own.page.locator('.mp-went')), 'its own page, where it went').not.toMatch(anId)
    } finally {
      await own.context.close()
    }
  }, 120_000)

  it("puts an agent's own message to the person in that agent's own row for the person, stored under its record or its handle", async () => {
    /** The newest message on one agent's contact row for the person, as the contacts door answers that agent. */
    const theNewestOnThePersonsRow = async (who: Who): Promise<string | null> => {
      const reply = await fetch(`${app.api}/api/messages/contacts`, {
        headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENTS[who].handle },
      })
      const text = await reply.text()
      expect(reply.status, text).toBe(200)
      const { contacts } = JSON.parse(text) as { contacts: { who: ParticipantRef | null; last: { body: string } | null }[] }
      return contacts.find((one) => one.who?.kind === 'person' && one.who.id === THE_PERSON)?.last?.body ?? null
    }
    // BOTH ARE ASKED BEFORE EITHER IS COMPARED, so a run that fails says what each agent's row holds.
    expect({ bell: await theNewestOnThePersonsRow('bell'), lamp: await theNewestOnThePersonsRow('lamp') }).toEqual({
      bell: SAID.bellOwn.body,
      lamp: SAID.lampOwn.body,
    })
  }, 60_000)

  it("draws no claimed id in the chat's contact list", async () => {
    const { context, page } = await aWindow()
    try {
      await page.locator('.px-chat-circle').click()
      await page.locator('.px-chat').waitFor({ timeout: 30_000 })
      if ((await page.locator('.px-chat-back').count()) > 0) await page.locator('.px-chat-back').first().click()
      // FIVE WRITERS NOBODY REGISTERED: the agent and the person nobody answers to, the two typed lines, and the message
      // that stored nothing. The message stored under the agent's record is the agent's, and is in its row.
      const rows = page.locator('.px-chat-contact[data-unregistered="yes"]')
      await expect.poll(() => rows.count(), { timeout: 30_000 }).toBe(5)
      const drawn = await rows.evaluateAll((all) => all.map((one) => one.textContent ?? ''))
      expect(
        drawn.filter((one) => [NOBODYS, NOBODYS_PERSON, CLAIMED, ids.lamp.record].some((id) => one.includes(id))),
        'a contact row draws a claimed id',
      ).toEqual([])
      for (const name of [NO_NAME_FOR_AN_AGENT, NO_NAME_FOR_A_PERSON, TYPED, TYPED_ALONE, CHAT_WORDS.unregisteredWithNoName]) {
        expect(drawn.filter((one) => one.includes(name)).length, `${name} in ${JSON.stringify(drawn)}`).toBe(1)
      }
      expect(drawn.filter((one) => one.includes(NO_REGISTRY)), JSON.stringify(drawn)).toEqual([])
    } finally {
      await context.close()
    }
  }, 120_000)

  it.runIf(SHOTS)('photographs the Messages page, the agent the page has no name for, the group and two own pages at the four widths in both themes', async () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await aWindow(theme, width)
        try {
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-ms-one').first(), `the Messages page, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/messages-page-${theme}-${width}.png` })
          await theRow(page, 'nobody').locator('.px-ms-open[data-other="unregistered"]').click()
          // THE LABEL GOES ABOVE THE MESSAGE, under the heading and its paragraph. Above the paragraph it lay over the
          // panel's own edge, where the grip that resizes it is.
          const nobody = await inThePanel(page, 'nobody')
          await putTheMadeUpLabelIn(page, LABEL, nobody, `the agent the page has no name for, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/agent-with-no-name-${theme}-${width}.png` })
          await openThePanelAt(page, groupOpenKey(groupId))
          const row = await inThePanel(page, 'groupRecord')
          await putTheMadeUpLabelIn(page, LABEL, row, `the group, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/group-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
        const own = await itsOwnPage('record', theme, width)
        try {
          await putTheMadeUpLabelIn(own.page, LABEL, own.page.locator('.mp-facts'), `the message's own page, ${theme} at ${width}`)
          await own.page.screenshot({ path: `${SHOTS}/own-page-record-${theme}-${width}.png` })
        } finally {
          await own.context.close()
        }
        // THE WHOLE PAGE, because the list of where it went is below the first screen at the narrow widths.
        const reached = await itsOwnPage('reached', theme, width)
        try {
          await putTheMadeUpLabelIn(reached.page, LABEL, reached.page.locator('.mp-facts'), `the own page of the message that reached four, ${theme} at ${width}`)
          await reached.page.screenshot({ path: `${SHOTS}/own-page-reached-${theme}-${width}.png`, fullPage: true })
        } finally {
          await reached.context.close()
        }
      }
    }
  }, 1_200_000)
})
