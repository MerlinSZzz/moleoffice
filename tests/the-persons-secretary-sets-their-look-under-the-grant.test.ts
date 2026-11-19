// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S SECRETARY SETS THE PERSON'S LOOK AND OWN THEMES UNDER THE PERSON'S GRANT, AT A DOOR OF ITS OWN.
 *
 * The door is GET and PUT /api/participants/person/<id>/look. The person reads and sets their own look there, as
 * they set it at the participant change door. A secretary holding the person's grant reads and sets the person's
 * look there too, and nobody else does. The PUT goes through the same reader and the same readability check as the
 * change door (`readTheLook` in src/shared/own-themes.ts), and a change the grant allowed is written down as made
 * under the grant.
 *
 * WHAT THIS FILE PROVES, test (k), against a scratch office in this process:
 *   1. The person reads and sets their own look at the door.
 *   2. The secretary under the grant reads the person's look and sets it, giving a reason. The change row names the
 *      grant and holds no theme, and the grant's period lists the change.
 *   3. Another agent, the secretary with no grant and another person are each refused, with the sentence that says
 *      who may, and nothing is stored. The secretary under the grant is refused another person's look.
 *   4. A theme with a pair under its floor is refused at this door too, for the person and under the grant, with the
 *      reader's sentences.
 *
 * Everything here is made up: the visitor, the agents and every theme. The reader's sentences are read from the
 * shared code that writes them. The who-may sentences are this door's own words, so they are written out here.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { aCopyOf, readTheLook, type OwnTheme, type TheLook } from '../src/shared/own-themes.ts'
import { READABILITY_PAIRS } from '../src/shared/readability.ts'
import { THEMES } from '../src/shared/themes.ts'
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type Built = Awaited<ReturnType<typeof apiApp>>

const OWNER = THE_TEST_OFFICES_OWNER.id
const VISITOR = 'made-up-look-visitor'
const WORKER = 'made-up-look-worker'
const NOTHING = 'Nothing was written.'
const THE_SETTING = 'setting:the-persons-look'
const WHO_MAY_SET = `Only the person, or a secretary holding the person's grant, sets the person's look and own themes. The secretary sets them at PUT /api/participants/person/${OWNER}/look.`
const WHO_MAY_READ = "Only the person, or a secretary holding the person's grant, is given the person's look and own themes."
const ITS_OWN = "A person's look and their own themes are theirs to set, and nobody else's."

const PERSON: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': OWNER,
}
const AS_THE_VISITOR: Record<string, string> = { ...PERSON, 'x-mole-office-actor-id': VISITOR }
const AS_THE_WORKER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': WORKER,
}

let t: TestDb
let app: Built
let run = ''

const asTheSecretary = (session: string = run): Record<string, string> => ({
  ...AS_THE_WORKER,
  'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
  ...(session === '' ? {} : { 'x-mole-office-session': session }),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ask(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; said: string; body: any }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body.error ?? reply.body), body }
}

const theDoor = (who = OWNER): string => `/api/participants/person/${who}/look`

/** What a person's row holds, exactly as stored, or null. */
function stored(who = OWNER): unknown {
  const row = t.client.sqlite.prepare('SELECT themes FROM people WHERE id = ?').get(who) as { themes: string | null }
  return row.themes === null ? null : JSON.parse(row.themes)
}

/** The change rows the door writes for an act under the grant. */
function theChangeRows(): { actor_id: string; field: string | null; old_value: string | null; new_value: string | null; elevation: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT actor_id, field, old_value, new_value, elevation FROM changes WHERE record_id = ? ORDER BY at')
    .all(THE_SETTING) as never
}

function aCopy(name: string, change: (values: Record<string, string>) => void = () => {}, from = THEMES[0]!): OwnTheme {
  const copy = aCopyOf(from, { chosen: 'auto', own: [] }, name)
  const values: Record<string, string> = { ...copy.values }
  change(values)
  return { ...copy, values: values as OwnTheme['values'] }
}

/** The refusal the shared reader gives for this look, as the door must say it. */
function theReadersRefusal(look: unknown): string {
  const read = readTheLook(look)
  if (read.ok) throw new Error('the look this case sends is one the reader takes')
  return `${read.why.join(' ')} ${NOTHING}`
}

async function raise(): Promise<string> {
  const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { ...PERSON, ...thePersonsKeyHeader() }, { reason: 'Keep the office running tonight' })
  expect(pressed.status, pressed.said).toBe(201)
  return String(pressed.body.elevation.id)
}

const EVENING = aCopy('Made-up evening', () => {}, THEMES[2]!)
const KEPT: TheLook = { chosen: EVENING.id, own: [EVENING] }
const MORNING = aCopy('Made-up morning', () => {}, THEMES[5]!)
const NEXT: TheLook = { chosen: MORNING.id, own: [EVENING, MORNING] }

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  for (const [handle, name, role] of [
    [THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name, 'secretary'],
    [WORKER, 'Made-up worker', 'worker'],
  ] as const) {
    const started = await ask('POST', '/api/agents/started', PERSON, { handle, name, role })
    expect(started.status, started.said).toBe(201)
  }
  const session = await ask('POST', '/api/records', asTheSecretary(''), { kind: 'session', title: `${THE_TEST_OFFICES_SECRETARY.handle} answering`, data: { state: 'running' } })
  expect(session.status, session.said).toBe(201)
  run = String(session.body.record.id)
  const held = await ask('POST', `/api/handles/${THE_TEST_OFFICES_SECRETARY.handle}/hold`, asTheSecretary(), { session: run, machine: 'a-machine', runtime: 'claude-code' })
  expect(held.status, held.said).toBe(201)
  const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
  t.client.sqlite
    .prepare("INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) VALUES (?, 'Made-up visitor', ?, ?, NULL, NULL, '2026-11-17 09:00:00')")
    .run(VISITOR, VISITOR, picture.id)
}, 60_000)

beforeEach(() => {
  t.client.sqlite.prepare('UPDATE people SET themes = ? WHERE id = ?').run(JSON.stringify(KEPT), OWNER)
  t.client.sqlite.prepare('UPDATE people SET themes = NULL WHERE id = ?').run(VISITOR)
  t.client.sqlite.prepare('DELETE FROM changes WHERE record_id = ?').run(THE_SETTING)
})

afterEach(async () => {
  await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, PERSON)
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('(k) the person\'s look, at its own door', () => {
  it('1: the person reads and sets their own look there', async () => {
    const read = await ask('GET', theDoor(), PERSON)
    expect(read.status, read.said).toBe(200)
    expect(read.body.themes).toEqual(KEPT)
    const set = await ask('PUT', theDoor(), PERSON, { themes: NEXT })
    expect(set.status, set.said).toBe(200)
    expect(set.body.themes).toEqual(NEXT)
    expect(set.body.underTheGrant).toBeNull()
    expect(stored()).toEqual(NEXT)
    expect(theChangeRows(), 'the person\'s own act is not one done under the grant').toEqual([])
  })

  it('2: the secretary under the grant reads and sets the person\'s look, and the change says the grant allowed it', async () => {
    const grant = await raise()
    const read = await ask('GET', theDoor(), asTheSecretary())
    expect(read.status, read.said).toBe(200)
    expect(read.body.themes).toEqual(KEPT)

    const set = await ask('PUT', theDoor(), asTheSecretary(), { ...FOR_THE_PERSON, themes: NEXT })
    expect(set.status, set.said).toBe(200)
    expect(set.body.themes).toEqual(NEXT)
    expect(set.body.underTheGrant).toBe(grant)
    expect(stored()).toEqual(NEXT)

    // THE RECORD OF THE CHANGE names the grant, and holds no theme: only the person and their secretary are given those.
    const rows = theChangeRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ field: "the person's look and own themes", old_value: null, new_value: null })
    // The column keeps the grant as it stood, as JSON.
    expect((JSON.parse(rows[0]!.elevation ?? 'null') as { id?: string } | null)?.id).toBe(grant)

    const profile = (await ask('GET', `/api/participants/agent/${THE_TEST_OFFICES_SECRETARY.handle}/profile`, PERSON)).body
    const acts = (profile.theCardTheyHold?.elevation?.period?.acts ?? []) as { kind: string; title: string }[]
    expect(acts.filter((one) => one.kind === 'setting').map((one) => one.title)).toEqual(["the person's look and own themes"])
  })

  it.each([
    ['another agent', (): Record<string, string> => AS_THE_WORKER, FOR_THE_PERSON],
    ['the secretary with no grant', (): Record<string, string> => asTheSecretary(), FOR_THE_PERSON],
    ['another person', (): Record<string, string> => AS_THE_VISITOR, {}],
  ])('3: refuses %s, saying who may, and stores nothing', async (_who, headers, reason) => {
    const other = aCopy('Made-up stranger')
    const refused = await ask('PUT', theDoor(), headers(), { ...reason, themes: { chosen: other.id, own: [other] } })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toBe(`${WHO_MAY_SET} ${NOTHING}`)
    expect(stored()).toEqual(KEPT)
    expect(theChangeRows()).toEqual([])
    const read = await ask('GET', theDoor(), headers())
    expect(read.status, read.said).toBe(403)
    expect(read.said).toBe(WHO_MAY_READ)
  })

  it('3: refuses the secretary under the grant another person\'s look, which the grant does not reach', async () => {
    await raise()
    const other = aCopy('Made-up stranger')
    const refused = await ask('PUT', theDoor(VISITOR), asTheSecretary(), { ...FOR_THE_PERSON, themes: { chosen: other.id, own: [other] } })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toBe(`${ITS_OWN} ${NOTHING}`)
    expect(stored(VISITOR)).toBeNull()
    expect(theChangeRows()).toEqual([])
  })

  it.each([
    ['the person', (): Record<string, string> => PERSON, {}],
    ['the secretary under the grant', (): Record<string, string> => asTheSecretary(), FOR_THE_PERSON],
  ])('4: refuses a theme with a pair under its floor from %s, with the reader\'s sentences', async (who, headers, reason) => {
    if (who !== 'the person') await raise()
    const pair = READABILITY_PAIRS.find((one) => one.fg === '--lanes-badge-text-0')!
    const faint = aCopy('Made-up faint', (values) => { values[pair.fg] = values[pair.bg]! })
    const look = { chosen: faint.id, own: [EVENING, faint] }
    const refused = await ask('PUT', theDoor(), headers(), { ...reason, themes: look })
    expect(refused.status, refused.said).toBe(400)
    expect(refused.said).toBe(theReadersRefusal(look))
    expect(stored()).toEqual(KEPT)
    expect(theChangeRows()).toEqual([])
  })
})
