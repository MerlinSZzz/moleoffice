// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S LOOK AND OWN THEMES ARE KEPT ON THEIR ROW, AND ONLY THEY SET THEM OR ARE GIVEN THEM BACK.
 *
 * The door is the participant change door, PATCH /api/participants/person/<id> with `themes`, because
 * a look is one of the person's own settings, like the send key and the message labels on the same
 * row. Every value the door takes is read by `readTheLook` in src/shared/own-themes.ts, which is the
 * theme reader and the one readability check, before anything is written.
 *
 * WHAT THIS FILE PROVES, against a scratch office in this process:
 *   (c) Only that person: another person, a worker and an agent holding the secretary card are each
 *       refused with a sentence, and nothing is stored. The sentence names the look door, where a
 *       secretary holding the person's grant sets the person's look (test (k), in
 *       tests/the-persons-secretary-sets-their-look-under-the-grant.test.ts). Only that person is given their look back on
 *       the roster, in both of its shapes; every other reader is given no `themes` at all.
 *   (d) The door refuses an unreadable value, a shipped id, an id another own theme has and a
 *       thirteenth theme, each with the reader's sentence and "Nothing was written."
 *   (e) A pair under its floor is refused, naming the pair and the ratio; an unchanged copy of a
 *       shipped theme is kept.
 *   (f) A shipped theme changed in place is refused.
 *   (g) Deleting the chosen theme changes the choice in the same write, to the theme it was copied
 *       from; a write that deletes it and leaves the choice on it is refused.
 *   A refused write stores nothing, and that includes the other settings sent beside it.
 *   A look the row holds that this build's reader does not take reaches that person as unreadable,
 *   with the reader's sentences, and never as null, which means nobody set one. A page that took
 *   null there would write the browser's choice over the themes the person made. The door writes
 *   nothing over it until the person saves a new look.
 *
 * Everything here is made up: the visitor, the agents and every theme. Expected sentences are read
 * from the shared code that writes them, never copied, except the two who-may sentences, which are
 * this door's own words.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { MOST_OWN_THEMES, aCopyOf, anOwnThemeId, lookWithout, readTheLook, type OwnTheme, type TheLook } from '../src/shared/own-themes.ts'
import { READABILITY_PAIRS, ratioWords } from '../src/shared/readability.ts'
import { THE_SECRETARY, THE_WORKER } from '../src/shared/roles.ts'
import { THEMES } from '../src/shared/themes.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const OWNER = THE_TEST_OFFICES_OWNER.id
const VISITOR = 'made-up-visitor'
const SECRETARY = 'made-up-look-secretary'
const WORKER = 'made-up-look-worker'
// The office's person may have a secretary holding their grant set it, at the look door, and the sentence says where.
const ITS_OWN = `Only the person, or a secretary holding the person's grant, sets the person's look and own themes. The secretary sets them at PUT /api/participants/person/${OWNER}/look.`
const NOTHING = 'Nothing was written.'

let t: TestDb
let app: FastifyInstance
const AS_THE_OWNER: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': OWNER,
}
const AS_THE_VISITOR: Record<string, string> = { ...AS_THE_OWNER, 'x-mole-office-actor-id': VISITOR }
const AS_THE_SECRETARY: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }
const AS_THE_WORKER: Record<string, string> = { ...AS_THE_SECRETARY, 'x-mole-office-actor-id': WORKER }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try { body = reply.json() } catch { body = {} }
  return { status: reply.statusCode, body, raw: reply.body }
}

async function registered(handle: string, role: string): Promise<string> {
  const started = await call('POST', '/api/agents/started', AS_THE_OWNER, { handle, name: `Made-up ${handle}`, role })
  expect(started.status, started.raw).toBe(201)
  return String(started.body.whatToGiveIt?.key ?? '')
}

/** What the owner's row holds, exactly as stored, or null. */
function stored(column = 'themes'): unknown {
  const row = t.client.sqlite.prepare(`SELECT ${column} AS held FROM people WHERE id = ?`).get(OWNER) as { held: string | null }
  return row.held === null ? null : column === 'themes' ? JSON.parse(row.held) : row.held
}

function changeTheLook(headers: Record<string, string>, themes: unknown, who = OWNER, more: Record<string, unknown> = {}) {
  return call('PATCH', `/api/participants/person/${who}`, headers, { themes, ...more })
}

function aCopy(name: string, change: (values: Record<string, string>) => void = () => {}, from = THEMES[0]!, look: TheLook = { chosen: 'auto', own: [] }): OwnTheme {
  const copy = aCopyOf(from, look, name)
  const values: Record<string, string> = { ...copy.values }
  change(values)
  return { ...copy, values: values as OwnTheme['values'] }
}

/** The sentences the shared reader refuses this look with. */
function theReadersSentences(look: unknown): readonly string[] {
  const read = readTheLook(look)
  if (read.ok) throw new Error('the look this case sends is one the reader takes')
  return read.why
}

/** The refusal the shared reader gives for this look, as the door must say it. */
function theReadersRefusal(look: unknown): string {
  return `${theReadersSentences(look).join(' ')} ${NOTHING}`
}

const EVENING = aCopy('Made-up evening', () => {}, THEMES[2]!)
const KEPT: TheLook = { chosen: EVENING.id, own: [EVENING] }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(AS_THE_OWNER, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  AS_THE_SECRETARY['x-mole-office-key'] = await registered(SECRETARY, THE_SECRETARY)
  AS_THE_WORKER['x-mole-office-key'] = await registered(WORKER, THE_WORKER)
  const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
  t.client.sqlite
    .prepare("INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) VALUES (?, 'Made-up visitor', ?, ?, NULL, NULL, '2026-11-17 09:00:00')")
    .run(VISITOR, VISITOR, picture.id)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

beforeEach(() => {
  t.client.sqlite.prepare('UPDATE people SET themes = ?, chat_text_size = NULL WHERE id = ?').run(JSON.stringify(KEPT), OWNER)
})

describe('(c) a look is that person\'s own', () => {
  it('is kept for the person when they set it, and given back to them whole', async () => {
    t.client.sqlite.prepare('UPDATE people SET themes = NULL WHERE id = ?').run(OWNER)
    const set = await changeTheLook(AS_THE_OWNER, KEPT)
    expect(set.status, set.raw).toBe(200)
    expect(stored()).toEqual(KEPT)
    expect(set.body.participant.themes).toEqual(KEPT)
    const cleared = await changeTheLook(AS_THE_OWNER, null)
    expect(cleared.status, cleared.raw).toBe(200)
    expect(stored()).toBeNull()
  })

  it.each([
    ['another person', AS_THE_VISITOR],
    ['an agent holding the secretary card', AS_THE_SECRETARY],
    ['a worker', AS_THE_WORKER],
  ])('refuses %s, with a sentence, and stores nothing', async (_who, headers) => {
    const other = aCopy('Made-up stranger')
    const refused = await changeTheLook(headers, { chosen: other.id, own: [other] })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.body.error).toBe(ITS_OWN)
    expect(stored()).toEqual(KEPT)
  })

  it('refuses a look for an agent, which has none', async () => {
    // The path names the agent by its handle, as it asks about itself.
    const agentPath = await call('PATCH', `/api/participants/agent/${WORKER}`, AS_THE_WORKER, { themes: KEPT })
    expect(agentPath.status, agentPath.raw).toBe(403)
    expect(agentPath.body.error).toBe('Only a person has a look and own themes, so there is nothing here for an agent to set.')
  })

  it.each([['the page shape', '?shape=page'], ['the whole shape', '']])('gives the look on the roster in %s to that person and to no other reader', async (_shape, query) => {
    const theOwnerOn = async (headers: Record<string, string>) => {
      const roster = await call('GET', `/api/participants${query}`, headers)
      expect(roster.status, roster.raw).toBe(200)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return roster.body.people.find((one: any) => one.id === OWNER)
    }
    expect((await theOwnerOn(AS_THE_OWNER)).themes).toEqual(KEPT)
    for (const headers of [AS_THE_VISITOR, AS_THE_SECRETARY, AS_THE_WORKER]) {
      const seen = await theOwnerOn(headers)
      expect(seen.id).toBe(OWNER)
      expect(Object.keys(seen), headers['x-mole-office-actor-id']).not.toContain('themes')
    }
  })

  it('gives no reader the look on the one-participant read, so it is not a second way round', async () => {
    for (const headers of [AS_THE_VISITOR, AS_THE_SECRETARY, AS_THE_WORKER]) {
      const read = await call('GET', `/api/participants/person/${OWNER}`, headers)
      expect(read.status, read.raw).toBe(200)
      expect(Object.keys(read.body.participant)).not.toContain('themes')
    }
  })
})

describe('(d) and (f) the door reads every theme before it stores it', () => {
  it.each([
    ['an unreadable value', () => ({ chosen: 'auto', own: [aCopy('Made-up bad', (values) => { values['--bg'] = '#fff;} body{color:red' })] })],
    ['a shipped theme changed in place', () => ({ chosen: 'auto', own: [{ ...aCopy('Made-up paper', (values) => { values['--bg'] = '#fefefe' }), id: THEMES[0]!.id }] })],
    ['an id another own theme has', () => {
      const first = aCopy('Made-up first')
      return { chosen: 'auto', own: [first, { ...aCopy('Made-up second'), id: first.id }] }
    }],
    [`theme ${MOST_OWN_THEMES + 1}`, () => {
      const own: OwnTheme[] = []
      for (let i = 0; i <= MOST_OWN_THEMES; i++) own.push({ ...aCopy(`Made-up ${i + 1}`), id: anOwnThemeId(own.map((one) => one.id)) })
      return { chosen: 'auto', own }
    }],
  ])('refuses %s with the reader\'s sentence, and stores nothing, not even what was sent beside it', async (_case, make) => {
    const look = make()
    const refused = await changeTheLook(AS_THE_OWNER, look, OWNER, { chatTextSize: 'large' })
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.body.error).toBe(theReadersRefusal(look))
    expect(stored()).toEqual(KEPT)
    expect(stored('chat_text_size')).toBeNull()
  })

  it(`keeps ${MOST_OWN_THEMES} own themes`, async () => {
    const own: OwnTheme[] = []
    for (let i = 0; i < MOST_OWN_THEMES; i++) own.push({ ...aCopy(`Made-up ${i + 1}`), id: anOwnThemeId(own.map((one) => one.id)) })
    const kept = await changeTheLook(AS_THE_OWNER, { chosen: own[0]!.id, own })
    expect(kept.status, kept.raw).toBe(200)
    expect((stored() as TheLook).own).toHaveLength(MOST_OWN_THEMES)
  })
})

describe('(e) the one readability check', () => {
  it('refuses a theme with one pair under its floor, naming the pair and its ratio, and stores nothing', async () => {
    const pair = READABILITY_PAIRS.find((one) => one.fg === '--lanes-badge-text-0')!
    const faint = aCopy('Made-up faint', (values) => { values[pair.fg] = values[pair.bg]! })
    const refused = await changeTheLook(AS_THE_OWNER, { chosen: faint.id, own: [faint] })
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.body.error).toBe(theReadersRefusal({ chosen: faint.id, own: [faint] }))
    expect(refused.body.error).toContain(`${pair.fg} on ${pair.bg} at ${ratioWords(1)} to 1`)
    expect(stored()).toEqual(KEPT)
  })

  it('keeps an unchanged copy of each shipped theme', async () => {
    for (const theme of THEMES) {
      const copy = aCopy(`Copy of ${theme.name.en}`, () => {}, theme)
      const kept = await changeTheLook(AS_THE_OWNER, { chosen: copy.id, own: [copy] })
      expect(kept.status, `${theme.id}: ${kept.raw}`).toBe(200)
      expect(stored()).toEqual({ chosen: copy.id, own: [copy] })
    }
  })
})

describe('(g) deleting the chosen theme', () => {
  it('changes the choice in the same write, to the shipped theme it was copied from', async () => {
    const after = lookWithout(KEPT, EVENING.id)
    expect(after.chosenBecame).toBe(THEMES[2]!.id)
    const deleted = await changeTheLook(AS_THE_OWNER, after.look)
    expect(deleted.status, deleted.raw).toBe(200)
    expect(stored()).toEqual({ chosen: THEMES[2]!.id, own: [] })
  })

  it('refuses a write that deletes the chosen theme and leaves the choice on it', async () => {
    const left = { chosen: EVENING.id, own: [] }
    const refused = await changeTheLook(AS_THE_OWNER, left)
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.body.error).toBe(theReadersRefusal(left))
    expect(stored()).toEqual(KEPT)
  })
})

describe('a look the row holds that the reader does not take', () => {
  const STRICTER = { chosen: EVENING.id, own: [aCopy('Made-up later', (values) => { values['--bg'] = 'url(made-up.png)' }, THEMES[2]!)] }
  const holding = (text: string) => t.client.sqlite.prepare('UPDATE people SET themes = ? WHERE id = ?').run(text, OWNER)
  const heldText = () => (t.client.sqlite.prepare('SELECT themes AS held FROM people WHERE id = ?').get(OWNER) as { held: string | null }).held
  async function theOwnersLookOn(query: string, headers = AS_THE_OWNER) {
    const roster = await call('GET', `/api/participants${query}`, headers)
    expect(roster.status, roster.raw).toBe(200)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return roster.body.people.find((one: any) => one.id === OWNER)
  }

  it.each([['the page shape', '?shape=page'], ['the whole shape', '']])('reaches the person on the roster in %s as unreadable, with the reader\'s sentences, and not as null', async (_shape, query) => {
    holding(JSON.stringify(STRICTER))
    const seen = await theOwnersLookOn(query)
    expect(seen.themes).not.toBeNull()
    expect(seen.themes).toEqual({ unreadable: theReadersSentences(STRICTER) })
    for (const headers of [AS_THE_VISITOR, AS_THE_SECRETARY, AS_THE_WORKER]) {
      expect(Object.keys(await theOwnersLookOn(query, headers))).not.toContain('themes')
    }
  })

  it('reaches the person as unreadable, with a sentence, when the row holds text that is not JSON', async () => {
    holding('{"chosen": "made-up')
    const { themes } = await theOwnersLookOn('?shape=page')
    expect(themes).not.toBeNull()
    expect(Object.keys(themes)).toEqual(['unreadable'])
    expect(themes.unreadable.length).toBeGreaterThan(0)
    for (const sentence of themes.unreadable) expect(typeof sentence === 'string' && sentence.trim().length > 0, String(sentence)).toBe(true)
  })

  it('is given back as unreadable by the change door too, which writes nothing over it for another setting', async () => {
    const text = JSON.stringify(STRICTER)
    holding(text)
    const other = await call('PATCH', `/api/participants/person/${OWNER}`, AS_THE_OWNER, { chatTextSize: 'large' })
    expect(other.status, other.raw).toBe(200)
    expect(other.body.participant.themes).toEqual({ unreadable: theReadersSentences(STRICTER) })
    expect(heldText()).toBe(text)
  })

  it('is written over when the person saves a new look, which is their choice', async () => {
    holding(JSON.stringify(STRICTER))
    const saved = await changeTheLook(AS_THE_OWNER, KEPT)
    expect(saved.status, saved.raw).toBe(200)
    expect(stored()).toEqual(KEPT)
    expect(saved.body.participant.themes).toEqual(KEPT)
  })
})
