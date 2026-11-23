// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWNER HAND-OVERS ARE KEPT, AND ITS PAGE LISTS THEM (wave 13s round 281).
 *
 * The owner door, POST /api/agents/:id/owner, keeps one row of `agent_owner_changes` for each hand-over it makes, in
 * the same write as the new owner:
 *
 *   before   the owner kind and id exactly as the agent's row held them, each empty when the row held none, and kept
 *            as they were when they cannot be read;
 *   after    the new owner's kind and id;
 *   maker    the person or the agent who made it, and the grant it was made under, empty when none was used;
 *   reason   as the door read it;
 *   when     a local wall-clock stamp.
 *
 * A hand-over to the owner the agent already has keeps a row as well. A refused hand-over keeps none.
 *
 * THE READ, GET /api/participants/agent/:id/owner-changes, names the agent by its id or its handle. It gives every row,
 * newest first by its stamp and then by the order the rows were written, with the name of each owner and each maker. An
 * owner is said in the three states the read of one agent uses for its owner. The reply also says the moment this
 * office began to keep the rows. That moment is written once, by the first start of the server that keeps them, before
 * it listens, and never again. Until then the reply says none.
 *
 * THE PAGE draws the list in its own panel, after the agent's facts and before its handover. The panel says from when
 * the list holds the hand-overs, or that the day was not recorded, and a short word when it holds none. An owner
 * with no name to draw is drawn with the word the owner fact on the same page uses. The panel holds no control.
 * The page cases draw the panel from made-up readings, with no server, and read the drawn text, never the markup:
 * the markup holds the panel's style sheet.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setFixtureOwner } from './agent-owner-fixture.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { drawnStamp, localStamp } from '../src/shared/time.ts'
import type { WordKey } from '../src/shared/i18n.ts'
import type { AnOwnerHandOver, TheOwnerHandOversOfAnAgent } from '../src/web/api.ts'

type Agent = { id: string; key: string; handle: string; name: string }
type I18n = typeof import('../src/shared/i18n.ts')
type Drawer = typeof import('../src/web/components/AgentOwnerHandOvers.tsx')

let office: TestDb
let app: FastifyInstance
let personId: string
let personsName: string
let secretaryRole: string
let i18n: I18n
let first: Agent
let second: Agent
let stranger: Agent

function headers(kind: 'human' | 'agent', id: string, key?: string) {
  return {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': kind, 'x-mole-office-actor-id': id,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  }
}
const person = () => headers('human', personId)
const as = (agent: Agent) => headers('agent', agent.handle, agent.key)

async function register(handle: string, name: string, by: ReturnType<typeof headers>, role?: string): Promise<Agent> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers: by,
    payload: { handle, name, runtime: 'claude-code', ...(role === undefined ? {} : { role }) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const body = reply.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  return { id: body.agent.id, key: body.whatToGiveIt.key, handle, name }
}

async function handOver(target: Agent, to: Agent | { id: string }, by: ReturnType<typeof headers>, because = 'A test hand-over') {
  return app.inject({
    method: 'POST', url: `/api/agents/${target.id}/owner`, headers: by,
    payload: { owner: { kind: 'agent', id: to.id }, because },
  })
}

/** The kept rows of one agent, as stored, in the order they were written. */
function rowsOf(agent: Agent) {
  return office.client.sqlite.prepare(
    'SELECT id, from_kind, from_id, to_kind, to_id, made_by_kind, made_by_id, under_grant, because, made_at ' +
      'FROM agent_owner_changes WHERE agent_id = ? ORDER BY rowid',
  ).all(agent.id) as {
    id: string; from_kind: string | null; from_id: string | null; to_kind: string; to_id: string
    made_by_kind: string; made_by_id: string; under_grant: string | null; because: string; made_at: string
  }[]
}

/** The read of one agent's hand-overs, as the person asks it, by the agent's id or its handle. */
async function readOf(agent: string): Promise<TheOwnerHandOversOfAnAgent> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${agent}/owner-changes`, headers: person() })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheOwnerHandOversOfAnAgent
}

const LOCAL_STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  personId = (await import('../src/shared/person.ts')).THE_PERSON
  personsName = office.client.sqlite.prepare('SELECT name FROM people WHERE id = ?').pluck().get(personId) as string
  secretaryRole = (await import('../src/server/lib/roles.ts')).theRoleCards().elevation.onlyThisCardCanHoldIt
  first = await register('first-secretary', 'First Secretary', person(), secretaryRole)
  second = await register('second-secretary', 'Second Secretary', person(), secretaryRole)
  stranger = await register('other-agent', 'Other Agent', person())

  // src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that lets the panel
  // load; nothing in it is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: personId }))
  i18n = await import('../src/shared/i18n.ts')
}, 120_000)

afterAll(async () => {
  i18n?.setWordLanguage('en')
  await app?.close()
  office?.close()
})

describe('a hand-over at the owner door is kept', () => {
  it('keeps one row with the owner before and after, who made it, no grant, the reason and a local stamp', async () => {
    const owned = await register('kept-worker', 'Kept Worker', as(first))
    const before = localStamp(new Date())
    const reply = await handOver(owned, second, as(first), '  A kept hand-over  ')
    expect(reply.statusCode, reply.body).toBe(200)
    const after = localStamp(new Date())
    const rows = rowsOf(owned)
    expect(rows).toEqual([{
      id: expect.any(String) as string,
      from_kind: 'agent', from_id: first.id,
      to_kind: 'agent', to_id: second.id,
      made_by_kind: 'agent', made_by_id: first.id,
      under_grant: null,
      because: 'A kept hand-over',
      made_at: expect.stringMatching(LOCAL_STAMP) as string,
    }])
    expect(rows[0]!.made_at >= before && rows[0]!.made_at <= after, `${rows[0]!.made_at} is not between ${before} and ${after}`).toBe(true)
    // THE PERSON IS KEPT AS THE MAKER of a hand-over the person makes.
    expect((await handOver(owned, first, person())).statusCode).toBe(200)
    expect(rowsOf(owned).at(-1)).toMatchObject({ from_kind: 'agent', from_id: second.id, to_id: first.id, made_by_kind: 'person', made_by_id: personId })
  })

  it('keeps a row for a hand-over to the owner the agent already has', async () => {
    const owned = await register('same-owner-worker', 'Same Owner Worker', as(first))
    expect((await handOver(owned, first, person())).statusCode).toBe(200)
    expect(rowsOf(owned)).toMatchObject([{ from_kind: 'agent', from_id: first.id, to_kind: 'agent', to_id: first.id }])
  })

  it('keeps an owner before that cannot be read exactly as the row held it', async () => {
    const owned = await register('unreadable-owner-worker', 'Unreadable Owner Worker', person())
    office.client.sqlite.prepare('UPDATE agents SET owner_kind = ?, owner_id = ? WHERE id = ?').run('no-such-kind', first.id, owned.id)
    expect((await handOver(owned, second, person())).statusCode).toBe(200)
    expect(rowsOf(owned)).toMatchObject([{ from_kind: 'no-such-kind', from_id: first.id, to_id: second.id }])
  })

  it('keeps an owner before that nobody recorded as empty', async () => {
    const owned = await register('unowned-worker', 'Unowned Worker', person())
    setFixtureOwner(office.client.sqlite, null, owned.id)
    expect((await handOver(owned, first, person())).statusCode).toBe(200)
    expect(rowsOf(owned)).toMatchObject([{ from_kind: null, from_id: null, to_id: first.id }])
  })

  it('keeps no row for a hand-over the door refuses', async () => {
    const owned = await register('refused-worker', 'Refused Worker', as(first))
    expect((await handOver(owned, second, as(owned))).statusCode).toBe(403)
    expect((await handOver(owned, stranger, person())).statusCode).toBeGreaterThanOrEqual(400)
    const retired = await register('retired-worker', 'Retired Worker', as(first))
    office.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(retired.id)
    expect((await handOver(retired, second, person())).statusCode).toBe(409)
    expect(rowsOf(owned)).toEqual([])
    expect(rowsOf(retired)).toEqual([])
  })

  it('keeps the grant a secretary acting under the person’s grant used', async () => {
    const delegate = await register('granted-secretary', 'Granted Secretary', person(), secretaryRole)
    const raised = await app.inject({
      method: 'POST', url: `/api/roles/elevation/${delegate.handle}`, headers: { ...person(), ...thePersonsKeyHeader() },
      payload: { reason: 'A test grant', endsWhen: 'when you say' },
    })
    expect(raised.statusCode, raised.body).toBe(201)
    const grant = (raised.json() as { elevation: { id: string } }).elevation.id
    const owned = await register('granted-worker', 'Granted Worker', as(first))
    const reply = await app.inject({
      method: 'POST', url: `/api/agents/${owned.id}/owner`, headers: as(delegate),
      payload: { owner: { kind: 'agent', id: second.id }, because: 'A test hand-over', ...FOR_THE_PERSON },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect(rowsOf(owned)).toMatchObject([{ from_id: first.id, to_id: second.id, made_by_kind: 'agent', made_by_id: delegate.id, under_grant: grant }])
  })
})

describe('the read of an agent’s hand-overs', () => {
  it('lists every hand-over of the agent newest first, naming each owner and each maker', async () => {
    const listed = await register('listed-worker', 'Listed Worker', person())
    const gone = 'nobody-registered-has-this-id'
    // 1: from the person, its first owner, to the first secretary, by the person.
    expect((await handOver(listed, first, person())).statusCode).toBe(200)
    // 2: from the first secretary to the second, by the first secretary, its owner now.
    expect((await handOver(listed, second, as(first))).statusCode).toBe(200)
    // 3: from an owner nobody recorded.
    setFixtureOwner(office.client.sqlite, null, listed.id)
    expect((await handOver(listed, first, person())).statusCode).toBe(200)
    // 4: from an owner that cannot be read.
    office.client.sqlite.prepare('UPDATE agents SET owner_kind = ?, owner_id = ? WHERE id = ?').run('no-such-kind', first.id, listed.id)
    expect((await handOver(listed, second, person())).statusCode).toBe(200)
    // 5: from an owner whose id names nobody registered.
    setFixtureOwner(office.client.sqlite, gone, listed.id)
    expect((await handOver(listed, first, person())).statusCode).toBe(200)
    const rows = rowsOf(listed)
    expect(rows).toHaveLength(5)
    // THE STAMP COMES BEFORE THE ORDER OF WRITING. The second row is given a made-up earlier stamp, so it goes last.
    const earlier = '2026-01-02 03:04:05'
    office.client.sqlite.prepare('UPDATE agent_owner_changes SET made_at = ? WHERE id = ?').run(earlier, rows[1]!.id)

    const held = (agent: Agent) => ({ state: 'held', kind: 'agent', id: agent.id, name: agent.name })
    const byThePerson = { kind: 'person', id: personId, name: personsName }
    const one = (at: number, before: unknown, after: Agent, by: unknown) =>
      ({ id: rows[at]!.id, at: at === 1 ? earlier : rows[at]!.made_at, before, after: held(after), by, underTheGrant: null, because: 'A test hand-over' })
    const expected = [
      one(4, { state: 'held', kind: 'agent', id: gone, name: null }, first, byThePerson),
      one(3, { state: 'broken' }, second, byThePerson),
      one(2, { state: 'absent' }, first, byThePerson),
      one(0, { state: 'held', kind: 'person', id: personId, name: personsName }, first, byThePerson),
      one(1, held(first), second, { kind: 'agent', id: first.id, name: first.name }),
    ]
    const read = await readOf(listed.id)
    expect(read.agent).toBe(listed.id)
    expect(read.handOvers).toEqual(expected)
    // BY ITS HANDLE AS WELL, as the read of its renames.
    expect((await readOf(listed.handle)).handOvers).toEqual(expected)
    // AN AGENT NEVER HANDED OVER HAS NONE, and an agent nobody registered is not found.
    expect((await readOf(stranger.id)).handOvers).toEqual([])
    const unknown = await app.inject({ method: 'GET', url: '/api/participants/agent/no-agent-has-this-name/owner-changes', headers: person() })
    expect(unknown.statusCode, unknown.body).toBe(404)
  })

  it('says no day until the office sets it, and keeps the first day it set', async () => {
    expect((await readOf(stranger.id)).since).toBeNull()
    const { keepTheDayTheHandOversBeganOnce } = await import('../src/server/lib/agent-owner-changes.ts')
    const before = localStamp(new Date())
    const set = keepTheDayTheHandOversBeganOnce()
    const after = localStamp(new Date())
    const stored = () => office.client.sqlite.prepare('SELECT owner_changes_since FROM installation WHERE only_row = 1').pluck().get()
    expect(stored()).toBe(set.since)
    expect(set.since).toMatch(LOCAL_STAMP)
    expect(set.since >= before && set.since <= after, `${set.since} is not between ${before} and ${after}`).toBe(true)
    expect(set.line).toContain(set.since)
    expect((await readOf(stranger.id)).since).toBe(set.since)
    // NEVER AGAIN. A made-up earlier day stands for one an earlier start set, and a later start leaves it.
    const earlier = '2026-01-02 03:04:05'
    office.client.sqlite.prepare('UPDATE installation SET owner_changes_since = ? WHERE only_row = 1').run(earlier)
    const again = keepTheDayTheHandOversBeganOnce()
    expect(again.since).toBe(earlier)
    expect(again.line).toContain(earlier)
    expect(stored()).toBe(earlier)
    expect((await readOf(stranger.id)).since).toBe(earlier)
  })

  it('sets the day at each start of the server, after the database is ready and before the server listens', () => {
    const source = readFileSync('src/server/index.ts', 'utf8')
    const code = source.split('\n').filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line)).join('\n')
    const ready = code.indexOf('decision = prepareToServe(')
    const listens = code.indexOf('await app.listen({')
    expect(ready, 'the start checks the database').toBeGreaterThan(-1)
    expect(listens, 'the start listens after it checks the database').toBeGreaterThan(ready)
    const calls = [...code.matchAll(/\bkeepTheDayTheHandOversBeganOnce\(\)/g)].map((call) => call.index)
    expect(calls, 'the start sets the day once').toHaveLength(1)
    expect(calls[0]).toBeGreaterThan(ready)
    expect(calls[0]).toBeLessThan(listens)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// THE PAGE, drawn from made-up readings with no server.
// ---------------------------------------------------------------------------------------------------------------------

let loaded: Drawer | undefined
const drawer = async (): Promise<Drawer> => (loaded ??= await import('../src/web/components/AgentOwnerHandOvers.tsx'))

/** The panel's text as a reader reads it: no style, no tags, and the characters the markup escapes as they are written. */
async function drawn(reading: TheOwnerHandOversOfAnAgent): Promise<{ text: string; markup: string }> {
  const markup = renderToStaticMarkup(h((await drawer()).TheOwnerHandOvers, { reading }))
  const text = markup
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
  return { text, markup }
}

const PANEL_WORDS = ['heading', 'since', 'noDay', 'none', 'changed', 'madeBy', 'madeByUnderTheGrant', 'reason', 'readFailed'] as const
const word = (which: (typeof PANEL_WORDS)[number], values?: Record<string, string>): string =>
  i18n.t(`ownerHandOvers.${which}` as string as WordKey, values as never)
/** The owner fact's own word for an owner whose name cannot be drawn. */
const ownerWord = (which: 'none' | 'unreadable' | 'namesNobody'): string => i18n.t(`profileOwner.${which}` as string as WordKey)

const FIRST = { state: 'held', kind: 'agent', id: 'made-up-first-secretary', name: 'A made-up first secretary' } as const
const SECOND = { state: 'held', kind: 'agent', id: 'made-up-second-secretary', name: 'A made-up second secretary' } as const
const THE_PERSON_NAMED = { kind: 'person', id: 'made-up-person', name: 'A made-up person' } as const
const A_SECRETARY = { kind: 'agent', id: 'made-up-raised-secretary', name: 'A made-up raised secretary' } as const
const SINCE = '2026-11-20 09:30:00'

function aHandOver(over: Partial<AnOwnerHandOver>): AnOwnerHandOver {
  return {
    id: 'made-up-hand-over',
    at: '2026-11-21 10:00:00',
    before: FIRST,
    after: SECOND,
    by: { kind: FIRST.kind, id: FIRST.id, name: FIRST.name },
    underTheGrant: null,
    because: 'A made-up reason.',
    ...over,
  }
}

const CONTROL = /<button\b|<form\b|<input\b|<select\b|<textarea\b/

describe('the agent’s page lists its hand-overs', () => {
  it('draws the day the list began, then each hand-over with its owners, its maker, its grant and its reason, in both languages', async () => {
    for (const language of ['en', 'zh'] as const) {
      i18n.setWordLanguage(language)
      const later = aHandOver({ id: 'made-up-later', at: '2026-11-21 11:00:00', before: SECOND, after: FIRST, by: THE_PERSON_NAMED, because: 'A made-up later reason.' })
      const earlier = aHandOver({ id: 'made-up-earlier', by: A_SECRETARY, underTheGrant: 'made-up-grant' })
      const { text, markup } = await drawn({ agent: 'made-up-agent', since: SINCE, handOvers: [later, earlier] })
      expect(text).toContain(word('heading'))
      expect(text).toContain(word('since', { when: drawnStamp(SINCE) }))
      expect(text).not.toContain(word('noDay'))
      expect(text, 'the word for none is drawn only when the list holds none').not.toContain(word('none'))
      const laterSaid = word('changed', { when: drawnStamp(later.at), from: SECOND.name, to: FIRST.name })
      const earlierSaid = word('changed', { when: drawnStamp(earlier.at), from: FIRST.name, to: SECOND.name })
      expect(text).toContain(laterSaid)
      expect(text).toContain(earlierSaid)
      expect(text.indexOf(laterSaid), 'the rows are drawn in the order the read gives them').toBeLessThan(text.indexOf(earlierSaid))
      expect(text).toContain(word('madeBy', { who: THE_PERSON_NAMED.name }))
      expect(text).toContain(word('madeByUnderTheGrant', { who: A_SECRETARY.name }))
      expect(text, 'a hand-over under the grant is not drawn as one without it').not.toContain(word('madeBy', { who: A_SECRETARY.name }))
      expect(text).toContain(word('reason', { because: 'A made-up later reason.' }))
      expect(text).toContain(word('reason', { because: 'A made-up reason.' }))
      expect(markup, 'the panel holds no control').not.toMatch(CONTROL)
    }
    i18n.setWordLanguage('en')
  })

  it('draws that the day was not recorded, and a word for none when no hand-over is kept', async () => {
    for (const language of ['en', 'zh'] as const) {
      i18n.setWordLanguage(language)
      const unrecorded = await drawn({ agent: 'made-up-agent', since: null, handOvers: [] })
      expect(unrecorded.text).toContain(word('heading'))
      expect(unrecorded.text).toContain(word('noDay'))
      expect(unrecorded.text).toContain(word('none'))
      const recorded = await drawn({ agent: 'made-up-agent', since: SINCE, handOvers: [] })
      expect(recorded.text).toContain(word('since', { when: drawnStamp(SINCE) }))
      expect(recorded.text).not.toContain(word('noDay'))
      expect(recorded.text).toContain(word('none'))
      for (const { markup } of [unrecorded, recorded]) expect(markup).not.toMatch(CONTROL)
    }
    i18n.setWordLanguage('en')
  })

  it('draws the owner fact’s word for an owner nobody recorded, one that cannot be read, and one registered nowhere', async () => {
    for (const language of ['en', 'zh'] as const) {
      i18n.setWordLanguage(language)
      const when = drawnStamp('2026-11-21 10:00:00')
      const { text } = await drawn({
        agent: 'made-up-agent',
        since: SINCE,
        handOvers: [
          aHandOver({ id: 'made-up-from-nobody', before: { state: 'absent' } }),
          aHandOver({ id: 'made-up-from-unreadable', before: { state: 'broken' } }),
          aHandOver({ id: 'made-up-unregistered', before: { ...FIRST, name: null }, after: { ...SECOND, name: null }, by: { ...A_SECRETARY, name: null } }),
        ],
      })
      expect(text).toContain(word('changed', { when, from: ownerWord('none'), to: SECOND.name }))
      expect(text).toContain(word('changed', { when, from: ownerWord('unreadable'), to: SECOND.name }))
      expect(text).toContain(word('changed', { when, from: ownerWord('namesNobody'), to: ownerWord('namesNobody') }))
      expect(text).toContain(word('madeBy', { who: ownerWord('namesNobody') }))
    }
    i18n.setWordLanguage('en')
  })

  it('has its words in English and in Chinese, and each Chinese word is its own', () => {
    for (const language of ['en', 'zh'] as const) {
      for (const which of PANEL_WORDS) {
        const key = `ownerHandOvers.${which}`
        expect(Object.hasOwn(i18n.WORD_LISTS[language], key), `${language} has ${key}`).toBe(true)
      }
    }
    i18n.setWordLanguage('en')
    const inEnglish = PANEL_WORDS.map((which) => word(which))
    i18n.setWordLanguage('zh')
    const inChinese = PANEL_WORDS.map((which) => word(which))
    i18n.setWordLanguage('en')
    expect(inChinese.filter((one, at) => one === inEnglish[at]), 'every panel word has its own Chinese').toEqual([])
  })

  it('stands on the agent’s page after its facts and before its handover', () => {
    const page = readFileSync('src/web/pages/ProfilePage.tsx', 'utf8')
    const facts = page.indexOf('{facts}')
    const handover = page.indexOf('{handover}')
    expect(facts, 'the agent’s page draws its facts').toBeGreaterThan(-1)
    expect(handover, 'the agent’s page draws its handover after its facts').toBeGreaterThan(facts)
    expect(page.slice(facts, handover)).toMatch(/<AgentOwnerHandOvers agentId=\{who\.id\} \/>/)
    expect(page.split('<AgentOwnerHandOvers ').length - 1, 'the panel stands once').toBe(1)
  })
})
