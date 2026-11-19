// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHAT PUTS THE CONTACTS WHO ARE ONLINE FIRST IN EACH GROUP (wave 13y round 91, item 22).
 *
 * The owner saw supervisors who were offline drawn above supervisors who were online, because a group's rows were
 * ordered by their newest message alone. The order inside a contact group is now:
 *   - the rows placed by hand, by the place they were given. A group ordered by hand keeps its whole hand order;
 *   - then the rows that are online, in the order they had before, which is newest message first;
 *   - then every other row, in that same order. So an agent that is offline is ordered by its newest message, not by
 *     when it was last online.
 * Online is what the reader's dot says in the project the page is in: the dot is green, or it is grey with the words
 * "In a terminal". A person is online when the person's own choice draws the dot green. An agent that is retired, and a
 * writer nobody registered, is not online. There is no chooser; this order replaces the old one.
 *
 * WHAT THIS FILE PROVES
 *   1. Both contact doors put an online supervisor above an offline supervisor whose message is newer, and keep the old
 *      order inside the online part and inside the offline part. One online supervisor is green, from a run inside its
 *      wait for the next message; the other is grey, in a terminal.
 *   2. A person who is online comes before a person who chose to be offline.
 *   3. Each row says whether it is online, and that is what its dot says, by the rule written out here and by the
 *      page's own reading of a dot (`aDotSaysOnline` in src/shared/contacts.ts).
 *   4. Asked in another project, where no supervisor is online, the supervisors are in the old order.
 *   5. Moving a row by hand is a move in the order drawn: the second online supervisor moves down past nothing it
 *      cannot pass. The group is then ordered by hand, and that order holds when an offline supervisor comes online.
 *      A supervisor that arrives online after that, with no place given by hand, goes after the rows placed by hand.
 *   6. The page: a dot read for a row it holds that now says the other thing makes the page read the contacts again,
 *      and a dot that agrees does not. A dot that comes online for a row the page does not hold reads them again only
 *      while rows are left to read.
 *   7. In a browser: the chat draws the online supervisor first, and a new message from the offline supervisor, which
 *      the page puts in place itself, does not move it above.
 *
 * MADE-UP RECORDS. The server cases write a fresh test office: four supervisors and two people, filed through the
 * office's own functions, with session records and a person's choice written by SQL as in
 * tests/the-online-view-says-whether-each-agent-is-online.test.ts. The browser case starts its own test office with two
 * supervisors. Every name in them is invented.
 *
 * MUTATIONS, after a control run:
 *   1. `orderInsideOneContactGroup` in src/shared/contacts.ts ignores `online`, as before round 91: cases 1 and 2 fail,
 *      case 4 fails at the people, case 5 fails at the move, which the old order refuses, and the browser case fails
 *      at the first order.
 *   2. The contact doors read who is online in the project "default" whatever the page's project: case 4 fails.
 *   3. `whichContactsAreOnline` in src/server/lib/presence.ts calls no person online: case 2 fails, case 3 fails at
 *      the person who is online, and case 4 fails at the people.
 *   4. `whichContactsAreOnline` reads only a green dot for an agent, not one in a terminal: cases 1 and 3 fail, and
 *      case 5 fails at the move.
 *   5. `aDotSaysOnline` reads only a green dot: case 3 fails at the supervisor in a terminal, and case 6 fails.
 *   6. `contactsWithANewMessage` in src/web/lib/chatdeltas.ts calls no row online: the browser case fails after the new
 *      message.
 *   7. The presence branch of `applyAnEvent` reads no contacts for a dot: case 6 fails.
 *   8. `moveAContactBy` in src/server/lib/contacts.ts places the group as if nobody were online: case 5 fails at the move.
 *   9. `orderInsideOneContactGroup` puts the online rows with no place given by hand before the rows placed by hand:
 *      case 5 fails at the supervisor that arrives online after the move.
 *
 * With W13Y_ONLINE_FIRST_SHOTS set to a folder, it photographs the chat's contacts, with the supervisors' group drawn, at
 * 1440, 990, 660 and 390 in both themes, under the made-up label, on the code it runs on.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { IN_A_TERMINAL_WORD } from '../src/shared/terminals.ts'
import type { ChannelEvent } from '../src/shared/events.ts'
import type { HeldLists } from '../src/web/lib/chatdeltas.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const SECOND = 'online-first-second-project'
const NOW = new Date(2026, 9, 26, 9, 0, 0)

type Row = Record<string, unknown>
/** One contact row as these cases read it. `online` is what round 91 adds. */
interface ContactRow { key: string; group: string; at: number; online?: unknown; who: { kind: string; id: string } | null }
interface Reading { who: { kind: string; id: string }; colour: string; word: string }

/** The dot's rule, written out here, so the doors and the page's reading cannot meet it by moving together. */
const theDotSaysOnline = (reading: Reading): boolean => reading.colour === 'green' || reading.word === IN_A_TERMINAL_WORD

/**
 * THE FOUR SUPERVISORS, each with one message to the person, a second apart, in this order. The old order is newest
 * message first: cinder, lantern, ember, hearth.
 */
const SUPERVISORS = [
  { handle: 'hearth-supervisor', name: 'Hearth', online: 'waiting' },
  { handle: 'ember-supervisor', name: 'Ember', online: null },
  { handle: 'lantern-supervisor', name: 'Lantern', online: 'terminal' },
  { handle: 'cinder-supervisor', name: 'Cinder', online: null },
] as const
/** The supervisor case 5 files after the group was ordered by hand. */
const LATE = { handle: 'flint-supervisor', name: 'Flint' } as const
type Handle = (typeof SUPERVISORS)[number]['handle'] | typeof LATE.handle

/** Two people who never wrote, so the old order is by id: the one who is away first. */
const AWAY = 'aaa-away-person'
const HERE = 'zzz-here-person'

describe('the contact doors put the contacts who are online first in each group', () => {
  let t: TestDb
  let app: FastifyInstance
  const idOf = new Map<Handle, string>()
  const keyOf = (handle: Handle): string => `agent:${idOf.get(handle) ?? handle}`

  /** A local wall-clock stamp, whole seconds, `n` seconds from NOW. */
  function stamp(n: number): string {
    const at = new Date(NOW.getTime() + n * 1000)
    const two = (v: number) => String(v).padStart(2, '0')
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
  }

  function aRecord(project: string, id: string, at: number, kind: string, title: string, data: Row): void {
    t.client.sqlite
      .prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, ?, '${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, 'authored')`)
      .run(id, project, stamp(at), stamp(at), kind, title, JSON.stringify(data))
  }

  /** A run of the agent's the message worker started, inside its wait for the next message: the dot is green. */
  function aWaitingRun(handle: Handle, run: string): void {
    const id = idOf.get(handle)!
    aRecord('default', run, -800, 'session', `Waiting run of ${handle}`, {
      state: 'finished', servingAgent: handle, servingAgentId: id, runtime: 'claude-code', providerSession: `${run}-conversation`,
      deliveringMessage: `${run}-message`, waitsUntil: stamp(1_200), lastOutputAt: stamp(-800), startedByMoleOffice: true,
    })
  }

  /** A run of the agent's open in one of the office's terminals: the dot is grey, with the words "In a terminal". */
  function aTerminalRun(handle: Handle, run: string): void {
    const id = idOf.get(handle)!
    aRecord('default', run, -3_000, 'session', `Terminal run of ${handle}`, {
      state: 'running', runtime: 'claude-code', startedAt: stamp(-3_000), doing: 'Invented work in a terminal', workingDirectory: '/made-up/folder',
      servingAgent: handle, servingAgentId: id, startedByMoleOffice: true,
      extra: { openedBy: { type: 'human', id: THE_PERSON }, inATerminal: { terminal: `${run}-terminal`, holder: { pid: 4_194_380, startedAt: stamp(-3_000) } } },
    })
  }

  async function get<T>(url: string, project = 'default'): Promise<T> {
    const res = await app.inject({ method: 'GET', url, headers: { ...PERSON, 'x-mole-office-workspace': project } })
    expect(res.statusCode, `${url}: ${res.body}`).toBe(200)
    return res.json() as T
  }

  /** The keys of one group's rows, by their place in it, from the whole list. */
  const inGroup = (rows: readonly ContactRow[], group: string): string[] =>
    rows.filter((one) => one.group === group).sort((a, b) => a.at - b.at).map((one) => one.key)
  /** The keys of one group's rows in the order one page of the contact list carries them. */
  const asCarried = (rows: readonly ContactRow[], group: string): string[] => rows.filter((one) => one.group === group).map((one) => one.key)

  const supervisors = (...handles: Handle[]): string[] => handles.map(keyOf)
  const mine = (keys: readonly string[]): string[] => keys.filter((key) => key === `person:${AWAY}` || key === `person:${HERE}`)

  /** A supervisor filed through the office's own functions, with its registry id kept. */
  function aSupervisor(handle: Handle, name: string): void {
    const record = t.api.createRecord({
      workspaceId: 'default', kind: 'agent', title: name,
      data: { handle, runtime: 'claude-code', state: 'active', role: 'supervisor' },
      actor: { type: 'human', id: THE_PERSON },
    })
    const row = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as { id: string } | undefined
    expect(row, `${handle} has no registry row`).toBeDefined()
    idOf.set(handle, row!.id)
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    for (const one of SUPERVISORS) aSupervisor(one.handle, one.name)
    // THE TWO PEOPLE, copied from the person's own row. The one who is away chose so; the other has not chosen.
    const sqlite = t.client.sqlite
    const columns = (sqlite.prepare('PRAGMA table_info(people)').all() as { name: string }[]).map((c) => c.name)
    const others = columns.filter((c) => !['id', 'handle', 'name', 'office_owner', 'presence_choice', 'presence_choice_at'].includes(c))
    for (const [id, name] of [[AWAY, 'Away Made-Up'], [HERE, 'Here Made-Up']] as const) {
      sqlite.prepare(`INSERT INTO people (id, handle, name, ${others.join(', ')}) SELECT ?, ?, ?, ${others.join(', ')} FROM people WHERE id = ?`).run(id, id, name, THE_PERSON)
    }
    sqlite.prepare("UPDATE people SET presence_choice = 'offline', presence_choice_at = ? WHERE id = ?").run(stamp(-60), AWAY)
    sqlite.prepare('INSERT OR IGNORE INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run(SECOND, 'Invented second project', stamp(-90_000), stamp(-90_000))
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
    for (const one of SUPERVISORS) {
      if (one.online === 'waiting') aWaitingRun(one.handle, `${one.handle}-run`)
      if (one.online === 'terminal') aTerminalRun(one.handle, `${one.handle}-run`)
    }
    for (const [i, one] of SUPERVISORS.entries()) {
      vi.setSystemTime(new Date(NOW.getTime() + (i + 1) * 1000))
      const body = `${one.name} has finished the invented task.`
      const said = await app.inject({
        method: 'POST', url: '/api/records',
        headers: { ...PERSON, 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': one.handle },
        payload: { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } },
      })
      expect(said.statusCode, said.body).toBe(201)
    }
    vi.setSystemTime(new Date(NOW.getTime() + 10_000))
  })
  afterAll(async () => {
    vi.useRealTimers()
    await app.close()
    t.close()
  })

  it('has the supervisors and the people the cases need, each online or not as its dot says', async () => {
    // THE CONTROL: the office is what the cases say it is, on the code before round 91 as well.
    const { presence } = await get<{ presence: Reading[] }>('/api/presence')
    const said = new Map(presence.map((one) => [`${one.who.kind}:${one.who.id}`, theDotSaysOnline(one)]))
    expect(SUPERVISORS.map((one) => said.get(keyOf(one.handle)))).toEqual([true, false, true, false])
    expect([said.get(`person:${AWAY}`), said.get(`person:${HERE}`)]).toEqual([false, true])
    const terminal = presence.find((one) => `${one.who.kind}:${one.who.id}` === keyOf('lantern-supervisor'))
    expect([terminal?.colour, terminal?.word], 'the second online supervisor is grey, in a terminal').toEqual(['grey', IN_A_TERMINAL_WORD])
    // AND THE OLD ORDER IS NEWEST MESSAGE FIRST, which the order of the messages above gives.
    const { contacts } = await get<{ contacts: (ContactRow & { last: { sentAt: string } | null })[] }>('/api/messages/contacts')
    const newestFirst = contacts.filter((one) => one.group === 'supervisor').sort((a, b) => (b.last?.sentAt ?? '').localeCompare(a.last?.sentAt ?? '')).map((one) => one.key)
    expect(newestFirst).toEqual(supervisors('cinder-supervisor', 'lantern-supervisor', 'ember-supervisor', 'hearth-supervisor'))
  })

  it('1. both doors put the online supervisors first, each part newest message first', async () => {
    const wanted = supervisors('lantern-supervisor', 'hearth-supervisor', 'cinder-supervisor', 'ember-supervisor')
    const whole = await get<{ contacts: ContactRow[] }>('/api/messages/contacts')
    expect(inGroup(whole.contacts, 'supervisor'), 'GET /api/messages/contacts').toEqual(wanted)
    const page = await get<{ contacts: ContactRow[] }>('/api/messages/contact-list')
    expect(asCarried(page.contacts, 'supervisor'), 'GET /api/messages/contact-list').toEqual(wanted)
  })

  it('2. a person who is online comes before a person who chose to be away', async () => {
    const whole = await get<{ contacts: ContactRow[] }>('/api/messages/contacts')
    expect(mine(inGroup(whole.contacts, 'people'))).toEqual([`person:${HERE}`, `person:${AWAY}`])
    const page = await get<{ contacts: ContactRow[] }>('/api/messages/contact-list')
    expect(mine(asCarried(page.contacts, 'people'))).toEqual([`person:${HERE}`, `person:${AWAY}`])
  })

  it('3. each row says whether it is online, and that is what its dot says', async () => {
    const { presence } = await get<{ presence: Reading[] }>('/api/presence')
    const dots = new Map(presence.map((one) => [`${one.who.kind}:${one.who.id}`, one]))
    const shared = (await import('../src/shared/contacts.ts')) as unknown as { aDotSaysOnline?: (reading: Reading) => boolean }
    expect(typeof shared.aDotSaysOnline, 'the page reads a dot with aDotSaysOnline').toBe('function')
    for (const door of ['/api/messages/contacts', '/api/messages/contact-list', '/api/messages/contacts?shape=page']) {
      const { contacts } = await get<{ contacts: ContactRow[] }>(door)
      const wanted = [...supervisors('hearth-supervisor', 'ember-supervisor', 'lantern-supervisor', 'cinder-supervisor'), `person:${AWAY}`, `person:${HERE}`]
      const rows = wanted.map((key) => contacts.find((one) => one.key === key))
      expect(rows.map((one) => one?.online), door).toEqual([true, false, true, false, false, true])
      for (const row of contacts) {
        if (row.who === null) {
          expect(row.online, `${door}: a writer nobody registered`).toBe(false)
          continue
        }
        const dot = dots.get(row.key)
        expect(dot, `${door}: ${row.key} has a dot`).toBeDefined()
        expect([row.key, row.online], door).toEqual([row.key, theDotSaysOnline(dot!)])
        expect([row.key, shared.aDotSaysOnline?.(dot!)], `${door}: the page's reading of the dot`).toEqual([row.key, theDotSaysOnline(dot!)])
      }
    }
  })

  it('4. asked in another project, where no supervisor is online, the supervisors are newest message first', async () => {
    const whole = await get<{ contacts: ContactRow[] }>('/api/messages/contacts', SECOND)
    expect(inGroup(whole.contacts, 'supervisor')).toEqual(supervisors('cinder-supervisor', 'lantern-supervisor', 'ember-supervisor', 'hearth-supervisor'))
    expect(whole.contacts.filter((one) => one.group === 'supervisor').map((one) => one.online)).toEqual([false, false, false, false])
    // A PERSON'S CHOICE IS THE SAME IN EVERY PROJECT.
    expect(mine(inGroup(whole.contacts, 'people'))).toEqual([`person:${HERE}`, `person:${AWAY}`])
  })

  it('5. a move by hand moves a row in the order drawn, the hand order then holds, and a late row goes after it', async () => {
    const moved = await app.inject({
      method: 'POST', url: '/api/messages/contact-placements',
      headers: { ...PERSON, 'content-type': 'application/json' },
      payload: { contact: keyOf('hearth-supervisor'), moveBy: 1 },
    })
    // HEARTH IS SECOND IN THE ORDER DRAWN, so it moves down one. In the old order it was last, and the move was refused.
    expect(moved.statusCode, moved.body).toBe(200)
    const byHand = supervisors('lantern-supervisor', 'cinder-supervisor', 'hearth-supervisor', 'ember-supervisor')
    expect(inGroup((moved.json() as { contacts: ContactRow[] }).contacts, 'supervisor'), 'the move door answers').toEqual(byHand)
    expect(inGroup((await get<{ contacts: ContactRow[] }>('/api/messages/contacts')).contacts, 'supervisor'), 'read again').toEqual(byHand)
    // EMBER COMES ONLINE. A group ordered by hand keeps its whole hand order.
    aWaitingRun('ember-supervisor', 'ember-supervisor-run')
    const after = await get<{ contacts: ContactRow[] }>('/api/messages/contacts')
    expect(after.contacts.find((one) => one.key === keyOf('ember-supervisor'))?.online, 'ember is online now').toBe(true)
    expect(inGroup(after.contacts, 'supervisor'), 'the hand order, after ember came online').toEqual(byHand)
    expect(asCarried((await get<{ contacts: ContactRow[] }>('/api/messages/contact-list')).contacts, 'supervisor')).toEqual(byHand)
    // FLINT ARRIVES ONLINE, with no place given by hand. A row placed by hand keeps its place, so Flint goes after them.
    aSupervisor(LATE.handle, LATE.name)
    aWaitingRun(LATE.handle, `${LATE.handle}-run`)
    const late = await get<{ contacts: ContactRow[] }>('/api/messages/contacts')
    expect(late.contacts.find((one) => one.key === keyOf(LATE.handle))?.online, 'flint is online').toBe(true)
    const withLate = [...byHand, keyOf(LATE.handle)]
    expect(inGroup(late.contacts, 'supervisor'), 'the rows placed by hand, then flint').toEqual(withLate)
    expect(asCarried((await get<{ contacts: ContactRow[] }>('/api/messages/contact-list')).contacts, 'supervisor')).toEqual(withLate)
  })
})

describe('6. the page reads the contacts again when a dot moves a row it holds', () => {
  const me = { kind: 'person' as const, id: 'page-reader' }
  const where = { project: 'default', talkProject: 'default', panelOpen: true }
  const row = (id: string, at: number, online: boolean) => ({
    who: { kind: 'agent', id }, unregistered: null, last: null, unread: 0, anythingUnread: false,
    key: `agent:${id}`, group: 'supervisor', at, online, foldedUnder: null, projects: [],
  })
  /** The page holds the first three rows of the supervisors' group, two online and one not, with `left` rows still to read. */
  const held = (left: number): HeldLists => ({
    circle: null, who: null, presence: [], between: null, groups: null, talk: null, talkPresence: null, theGroup: null, unregistered: null,
    contacts: {
      me, contacts: [row('on-one', 0, true), row('on-two', 1, true), row('off-one', 2, false)],
      contactGroups: [], contactSides: [], unread: { messages: 0, groups: 0 }, workspaceId: 'default',
      rowsIn: { supervisor: 3 + left }, total: 3 + left, inTheProject: null, matched: 3 + left, left, name: null, project: null,
    },
  }) as unknown as HeldLists
  const dot = (id: string, colour: string, word: string): ChannelEvent => ({
    name: 'presence.changed', who: { kind: 'agent', id }, colour,
    reading: { who: { kind: 'agent', id }, colour, word, says: 'Made-up words.', state: null },
  }) as unknown as ChannelEvent
  const readsContacts = async (lists: HeldLists, event: ChannelEvent): Promise<boolean> => {
    const { applyAnEvent } = await import('../src/web/lib/chatdeltas.ts')
    return applyAnEvent(lists, event, me, null, where).reads.has('contacts')
  }

  it('reads them for a held row whose dot now says the other thing', async () => {
    expect(await readsContacts(held(0), dot('off-one', 'green', 'Online')), 'an offline row comes online').toBe(true)
    expect(await readsContacts(held(0), dot('on-two', 'grey', 'Offline')), 'an online row goes offline').toBe(true)
    expect(await readsContacts(held(0), dot('off-one', 'grey', IN_A_TERMINAL_WORD)), 'an offline row is in a terminal').toBe(true)
  })

  it('does not read them for a dot that agrees with the row', async () => {
    expect(await readsContacts(held(0), dot('on-one', 'green', 'Online'))).toBe(false)
    expect(await readsContacts(held(0), dot('on-two', 'grey', IN_A_TERMINAL_WORD))).toBe(false)
    expect(await readsContacts(held(0), dot('off-one', 'grey', 'Offline'))).toBe(false)
  })

  it('reads them for a row it does not hold that comes online only while rows are left to read', async () => {
    expect(await readsContacts(held(2), dot('not-held', 'green', 'Online')), 'rows are left').toBe(true)
    expect(await readsContacts(held(0), dot('not-held', 'green', 'Online')), 'no row is left').toBe(false)
    expect(await readsContacts(held(2), dot('not-held', 'grey', 'Offline')), 'it went offline').toBe(false)
  })
})

describe('7. in a browser, the chat draws the online supervisor first and keeps it there', () => {
  const SHOTS = process.env.W13Y_ONLINE_FIRST_SHOTS
  const LABEL = 'Made-up data — a test office with two supervisors, one online, not real office data'
  const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  /** Alder is online, from a run inside its wait; Birch is offline and wrote after Alder, so the old order drew Birch first. */
  const ALDER = { name: 'Alder Online', handle: 'alder-online', id: '' }
  const BIRCH = { name: 'Birch Away', handle: 'birch-away', id: '' }
  let app: LiveApp
  const keys = (): string[] => [`agent:${ALDER.id}`, `agent:${BIRCH.id}`]
  const ROWS = '.px-chat-group-of[data-group="supervisor"] .px-chat-contact'

  /** A local wall-clock stamp, whole seconds, `n` seconds from now. */
  const stampFromNow = (n: number): string => {
    const at = new Date(Date.now() + n * 1000)
    const two = (v: number) => String(v).padStart(2, '0')
    return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`
  }

  async function say(agent: { handle: string }, body: string): Promise<void> {
    const said = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.handle },
      body: JSON.stringify({ kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } }),
    })
    expect(said.status, await said.text()).toBe(201)
  }

  beforeAll(async () => {
    app = await liveApp({ name: 'online-contacts-first', viewport: { width: 1440, height: 1000 } })
    for (const agent of [ALDER, BIRCH]) {
      const made = await fetch(`${app.api}/api/records`, {
        method: 'POST',
        headers: AS_THE_PERSON,
        body: JSON.stringify({ kind: 'agent', title: agent.name, data: { handle: agent.handle, runtime: 'claude-code', state: 'active' } }),
      })
      expect(made.status, await made.text()).toBe(201)
    }
    const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as { agents: { id: string; handle: string }[] }
    for (const agent of [ALDER, BIRCH]) agent.id = listed.agents.find((one) => one.handle === agent.handle)?.id ?? ''
    expect([ALDER.id, BIRCH.id].every((id) => id !== '')).toBe(true)
    const db = new Database(join(app.dir, 'panelx.db'))
    try {
      for (const agent of [ALDER, BIRCH]) db.prepare("UPDATE agents SET role = 'supervisor' WHERE id = ?").run(agent.id)
      const owner = (db.prepare("SELECT owner_id AS id FROM records WHERE kind = 'agent' LIMIT 1").get() as { id: string }).id
      const run = 'alder-online-waiting-run'
      db.prepare("INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) VALUES (?, 'default', ?, ?, ?, 'session', ?, ?, 'authored')").run(
        run, owner, stampFromNow(-60), stampFromNow(-60), 'Waiting run of alder-online',
        JSON.stringify({
          state: 'finished', servingAgent: ALDER.handle, servingAgentId: ALDER.id, runtime: 'claude-code', providerSession: `${run}-conversation`,
          deliveringMessage: `${run}-message`, waitsUntil: stampFromNow(3_600), lastOutputAt: stampFromNow(-60), startedByMoleOffice: true,
        }),
      )
    } finally {
      db.close()
    }
    await say(ALDER, 'The invented fence is mended.')
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    await say(BIRCH, 'The invented hedge is cut.')
    // THE CONTROL: Alder's dot is green and Birch's is not, on the code before round 91 as well.
    const dots = (await (await fetch(`${app.api}/api/presence`, { headers: AS_THE_PERSON })).json()) as { presence: Reading[] }
    const colourOf = (id: string) => dots.presence.find((one) => one.who.kind === 'agent' && one.who.id === id)?.colour
    expect([colourOf(ALDER.id), colourOf(BIRCH.id)]).toEqual(['green', 'grey'])
    if (SHOTS) mkdirSync(SHOTS, { recursive: true })
  }, 240_000)

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /** A window of its own with the chat open at its contacts, in one theme and at one width. */
  async function theContacts(theme: 'light' | 'dark' = 'light', width = 1440) {
    const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
    await context.addInitScript((look) => window.localStorage.setItem('mole-office.preset.theme', look), theme)
    const page = await context.newPage()
    await page.goto(`${app.site}/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.click('.px-chat-circle')
    await page.waitForSelector('.px-chat', { timeout: 30_000 })
    if ((await page.$('.px-chat-back')) !== null) await page.click('.px-chat-back')
    await page.locator(ROWS).nth(1).waitFor({ timeout: 30_000 })
    return { context, page }
  }

  const drawnOrder = async (page: Page): Promise<string[]> => page.locator(ROWS).evaluateAll((rows) => rows.map((one) => one.getAttribute('data-contact') ?? ''))

  it('photographs the contacts at four widths in both themes', async () => {
    if (!SHOTS) return
    for (const theme of ['light', 'dark'] as const) {
      for (const width of [1440, 990, 660, 390]) {
        const { context, page } = await theContacts(theme, width)
        try {
          // THE PANEL FILLS THE WINDOW, so the supervisors' group is in view below the people and the secretary.
          const fill = page.locator('.px-chat-fill')
          if ((await fill.isVisible()) && (await fill.getAttribute('aria-pressed')) === 'false') await fill.click()
          await page.locator(`${ROWS} .px-chat-dot[data-colour="green"]`).first().waitFor({ timeout: 30_000 })
          // EVERY PICTURE IN THE ROWS HAS ITS BYTES AND IS DECODED, so a picture of the page does not show an empty
          // circle for an avatar still on its way, as the dark one at 1440 did. Each row draws one, and they decode out
          // of the page's way, so having the bytes is not yet being drawn.
          await page.waitForFunction(
            (rows) => {
              const pictures = [...document.querySelectorAll<HTMLImageElement>(`${rows} img`)]
              return pictures.length >= document.querySelectorAll(rows).length && pictures.every((one) => one.complete && one.naturalWidth > 0)
            },
            ROWS,
            { timeout: 30_000 },
          )
          await page.locator(`${ROWS} img`).evaluateAll(async (pictures) => {
            await Promise.all(pictures.map((one) => (one as HTMLImageElement).decode()))
            await new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn)))
          })
          // INSIDE THE FILTER'S ROW, which has room at its sides, so the label is clear of the panel's resize grip.
          await putTheMadeUpLabelIn(page, LABEL, page.locator('.px-chat .px-chat-filter'), `the contacts, ${theme} at ${width}`)
          await page.screenshot({ path: `${SHOTS}/contacts-${theme}-${width}.png` })
        } finally {
          await context.close()
        }
      }
    }
  }, 300_000)

  it('draws the online supervisor first, and a new message from the offline one does not move it above', async () => {
    const { context, page } = await theContacts()
    try {
      expect(await drawnOrder(page), 'the first drawing').toEqual(keys())
      const words = 'The invented gate is painted.'
      await say(BIRCH, words)
      await page.locator(`${ROWS}[data-contact="agent:${BIRCH.id}"] .px-chat-contact-line`, { hasText: words }).waitFor({ timeout: 30_000 })
      expect(await drawnOrder(page), 'after the offline supervisor wrote').toEqual(keys())
    } finally {
      await context.close()
    }
  }, 120_000)
})
