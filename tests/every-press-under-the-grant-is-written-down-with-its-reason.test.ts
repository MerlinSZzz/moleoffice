// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY PRESS UNDER THE PERSON'S GRANT IS WRITTEN DOWN WITH ITS REASON, AND THE PERIOD'S PAGE SHOWS IT. Wave 13s round 2a.
 *
 * `logChange` writes a press row beside the first change row a press writes (`thePressRowOf` in
 * src/server/lib/records.ts). A press whose door writes outside the change log wrote no change row, so it left no press
 * row, and its reason was lost. The office scene's settings are such a door: they are kept in a table of their own.
 * So the route layer writes the row after a 2xx reply, for every route, where the grant was used and no change row
 * wrote it. A refused or failed request writes none.
 *
 * THE PAGE. `actsUnderThePeriod` in src/server/lib/elevation.ts lists those presses among the acts, by time, named by
 * the door's words, and gives every act the reason its press gave. A revision names no press, so a revision act is
 * matched to its press through the change rows of the same record, by the same agent, naming the same grant, at the same
 * time, give or take a second. That is a match and not a stored link: where two presses on one record fall that close
 * together, it cannot tell which reason is whose, and says so. Where no press row is found, the page says no reason was
 * written down.
 *
 * THREE CASES BELOW CHANGE THE DATABASE BY HAND, and each says so where it does: one takes a press row away, as for an
 * act written before the press rows existed, one puts two presses in the same second, and one breaks the stored scene
 * row, so that the door fails after the check. No route makes any of these states now.
 *
 * MUTATIONS, each after a control run (the report of the run that added this file):
 *   · the route layer's writer made to return without writing → the outside-the-log case and the page's press case are
 *     red;
 *   · the writer made to write on every reply, refused or not → the case of a door that failed after the check is red;
 *   · the reading made to give every act "none written" → the reason cases are red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { DEFAULT_PIXEL_SCENE } from '../src/shared/pixel-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { THE_DOORS_THE_LIST_NAMES } from '../src/shared/what-the-grant-carries-words.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let pp: ProfileModule
let theList: typeof import('../src/server/lib/what-the-grant-carries.ts')
let grant: string

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const THE_SCENE_DOOR = 'office.scene-settings.change'

/** The sentences the page draws where a press's reason is missing or cannot be told, in each language. */
const NO_REASON = { en: 'No reason was written down.', zh: '没有写下原因。' }
const CANNOT_TELL = {
  en: "Two presses for the person on this record are stamped at most a second apart, so Mole Office cannot tell which reason is this act's.",
  zh: '这条记录上有两次代本人的操作，时间最多相差一秒，所以 Mole Office 分不清哪个原因属于这项操作。',
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_SECRETARY = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY }

function forThePerson(reason: string): { forThePerson: { reason: string } } {
  return { forThePerson: { reason } }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

interface PressRow {
  id: string
  workspace_id: string | null
  agent_id: string
  session_id: string | null
  grant_id: string
  operation: string
  reason: string | null
  at: string
}

function thePresses(): PressRow[] {
  return t.client.sqlite.prepare('SELECT * FROM presses_for_the_person ORDER BY rowid').all() as PressRow[]
}

function theLastChangeRow(): number {
  return (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
}

function theChangeRowsAfter(rowid: number): { record_id: string; press_id: string | null }[] {
  return t.client.sqlite.prepare('SELECT record_id, press_id FROM changes WHERE rowid > ? ORDER BY rowid').all(rowid) as {
    record_id: string
    press_id: string | null
  }[]
}

function theSceneAsStored(): string | null {
  const row = t.client.sqlite.prepare('SELECT settings FROM office_scene_settings WHERE only_row = 1').get() as { settings: string } | undefined
  return row?.settings ?? null
}

/** Change whether the office map moves, for the person: a door that writes outside the change log. */
function changeTheScene(extra: Record<string, unknown>) {
  return ask('PATCH', '/api/office/scene-settings', AS_THE_SECRETARY, { motion: true, ...extra })
}

/** File a decision for the person: a write that keeps a revision and change rows. Returns its id. */
async function aDecisionForThePerson(title: string, reason: string): Promise<string> {
  const done = await ask('POST', '/api/records', AS_THE_SECRETARY, {
    ...forThePerson(reason),
    kind: 'decision',
    title,
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'Because they said so.' },
  })
  expect(done.status, done.said).toBe(201)
  return String((done.body['record'] as { id: string }).id)
}

/** The reason of one act, as the reply carries it. */
type TheReason = { written: string } | { written: null; because: 'none written' | 'cannot tell' }

interface AnAct {
  recordId: string | null
  title: string
  op: string
  seq: number | null
  actorId: string
  at: string
  door: { words: { en: string; zh: string | null } | null; operation: string } | null
  reason: TheReason
}

async function theProfile(): Promise<Record<string, unknown>> {
  const reply = await ask('GET', `/api/participants/agent/${SECRETARY}/profile`, AS_THE_PERSON)
  expect(reply.status, reply.said).toBe(200)
  return reply.body
}

function theActsIn(said: Record<string, unknown>): AnAct[] {
  const held = said['theCardTheyHold'] as { elevation: { period: { grant: { id: string }; acts: AnAct[] } | null } | null } | null
  const period = held?.elevation?.period
  expect(period, 'the profile reply carries no period').toBeTruthy()
  expect(period!.grant.id).toBe(grant)
  return period!.acts
}

function drawn(said: Record<string, unknown>, language: 'en' | 'zh' = 'en'): string {
  setWordLanguage(language)
  try {
    return renderToStaticMarkup(h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]))
  } finally {
    setWordLanguage('en')
  }
}

/** What React writes for a text: the page escapes the apostrophe. */
function asDrawn(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;')
}

beforeAll(async () => {
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
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  theList = await import('../src/server/lib/what-the-grant-carries.ts')
  expect((await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).status).toBe(201)
  const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(pressed.status, pressed.said).toBe(201)
  grant = String((pressed.body['elevation'] as { id: string }).id)
}, 60_000)

afterEach(() => {
  theList.setThisOfficesAnswer(THE_SCENE_DOOR, 'default', { type: 'human', id: THE_PERSON })
})

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a press under the grant is written down once, with its reason', () => {
  it('writes one press row for a press whose door writes outside the change log', async () => {
    const before = thePresses().length
    const from = theLastChangeRow()

    const done = await changeTheScene(forThePerson('The scene, changed for the person.'))
    expect(done.status, done.said).toBe(200)

    // THE DOOR WROTE NO CHANGE ROW UNDER THE GRANT, which is why `logChange` could not write the press down.
    expect(theChangeRowsAfter(from).filter((row) => row.press_id !== null)).toEqual([])
    const presses = thePresses().slice(before)
    expect(presses, 'the press outside the change log was not written down').toHaveLength(1)
    expect(presses[0]).toMatchObject({
      agent_id: SECRETARY,
      grant_id: grant,
      operation: THE_SCENE_DOOR,
      reason: 'The scene, changed for the person.',
      workspace_id: 'default',
    })
    expect(presses[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  })

  it('writes one row, not two, for a press that also wrote change rows', async () => {
    const before = thePresses().length
    const from = theLastChangeRow()

    const decision = await aDecisionForThePerson('A decision filed for the person', 'The decision, filed for the person.')

    const presses = thePresses().slice(before)
    expect(presses, 'the press is written down more than once, or not at all').toHaveLength(1)
    expect(presses[0]).toMatchObject({ grant_id: grant, operation: 'record.write', reason: 'The decision, filed for the person.' })
    const rows = theChangeRowsAfter(from).filter((row) => row.record_id === decision)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.press_id).toBe(presses[0]!.id)
  })

  it('writes none for a press refused for no reason, and changes nothing', async () => {
    const before = thePresses().length
    const scene = theSceneAsStored()

    const no = await changeTheScene({})
    expect(no.status, no.said).toBe(400)
    expect(no.said).toContain('every such press gives its reason')

    expect(thePresses()).toHaveLength(before)
    expect(theSceneAsStored()).toBe(scene)
  })

  it("writes none for a press this office's list keeps for the person, and changes nothing", async () => {
    theList.setThisOfficesAnswer(THE_SCENE_DOOR, 'kept', { type: 'human', id: THE_PERSON })
    const before = thePresses().length
    const scene = theSceneAsStored()

    const no = await changeTheScene(forThePerson('A press the list keeps.'))
    expect(no.status, no.said).toBe(403)
    expect(no.said).toContain(`keeps ${THE_SCENE_DOOR} for the person, so their grant does not press it for them`)

    expect(thePresses()).toHaveLength(before)
    expect(theSceneAsStored()).toBe(scene)
  })

  it('writes none for a press the check let through whose door then failed', async () => {
    const before = thePresses().length
    const scene = theSceneAsStored()

    // THE CHECK SAYS YES, AND THE DOOR FAILS AFTER IT. The door keeps every stored setting but motion as it was, so it
    // reads the stored row whole, and this case breaks that row by hand: it names a scene the shape does not allow. The
    // body is one the shape allows, so it passes the shape, which is read before the check, and the failure comes from
    // the door's reading of the row, whose complaint names the scene first.
    const broken = JSON.stringify({ ...DEFAULT_PIXEL_SCENE, scene: 'no-such-scene' })
    t.client.sqlite
      .prepare("INSERT INTO office_scene_settings (only_row, settings, updated_at, updated_by_kind, updated_by_id) VALUES (1, ?, '2026-11-01 12:00:00', 'human', ?) ON CONFLICT(only_row) DO UPDATE SET settings = excluded.settings")
      .run(broken, THE_PERSON)
    try {
      const no = await changeTheScene(forThePerson('A press that fails.'))
      expect(no.status, no.said).toBe(400)
      expect(no.said).toMatch(/^scene: /)

      expect(thePresses()).toHaveLength(before)
      expect(theSceneAsStored()).toBe(broken)
    } finally {
      if (scene === null) t.client.sqlite.prepare('DELETE FROM office_scene_settings WHERE only_row = 1').run()
      else t.client.sqlite.prepare('UPDATE office_scene_settings SET settings = ? WHERE only_row = 1').run(scene)
    }
  })
})

describe("the period's page lists every press under the grant, with its reason", () => {
  it('lists a press outside the change log among the acts, named by its door, with its reason', async () => {
    const done = await changeTheScene(forThePerson('The scene, listed on the page.'))
    expect(done.status, done.said).toBe(200)
    const press = thePresses().at(-1)!

    const said = await theProfile()
    const act = theActsIn(said).find((one) => one.door !== null && one.reason.written === 'The scene, listed on the page.')
    expect(act, 'the press outside the change log is not on the page').toBeTruthy()
    expect(act).toMatchObject({ recordId: null, seq: null, actorId: SECRETARY, at: press.at })
    expect(act!.door).toEqual({ words: THE_DOORS_THE_LIST_NAMES[THE_SCENE_DOOR], operation: THE_SCENE_DOOR })

    const english = drawn(said)
    expect(english).toContain(asDrawn(THE_DOORS_THE_LIST_NAMES[THE_SCENE_DOOR]!.en))
    expect(english).toContain('The scene, listed on the page.')
    expect(drawn(said, 'zh')).toContain(THE_DOORS_THE_LIST_NAMES[THE_SCENE_DOOR]!.zh)
  })

  it('gives a revision act and a link act the reason of the press that made them', async () => {
    const decision = await aDecisionForThePerson('A decision whose reason is drawn', 'The reason drawn beside the decision.')
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'proposal',
      title: 'A fork the person reserved',
      data: { question: 'Which?', options: ['One', 'Two'], because: 'Somebody has to choose.', who_settles_it: 'the owner' },
    })
    expect(filed.status, filed.said).toBe(201)
    const promoted = await ask('POST', `/api/records/${String((filed.body['record'] as { id: string }).id)}/promote`, AS_THE_SECRETARY, {
      ...forThePerson('The reason the fork was settled.'),
      title: 'The decision that settled the fork',
      data: { decided_by: 'the owner', authority: 'the owner said so', because: 'One of them.' },
    })
    expect(promoted.status, promoted.said).toBe(201)
    const settled = String((promoted.body['decision'] as { id: string }).id)

    const said = await theProfile()
    const acts = theActsIn(said)
    expect(acts.find((one) => one.recordId === decision && one.op === 'create')?.reason).toEqual({ written: 'The reason drawn beside the decision.' })
    expect(acts.find((one) => one.recordId === settled && one.op === 'create')?.reason).toEqual({ written: 'The reason the fork was settled.' })
    expect(acts.find((one) => one.recordId === settled && one.op === 'link')?.reason).toEqual({ written: 'The reason the fork was settled.' })
    for (const one of acts) expect(one.door === null, `${one.title}: an act on a record names a door`).toBe(one.recordId !== null)

    const english = drawn(said)
    expect(english).toContain('The reason drawn beside the decision.')
    expect(english).toContain('The reason the fork was settled.')
  })

  it('says no reason was written down where the act has no press row, in English and in Chinese', async () => {
    const decision = await aDecisionForThePerson('A decision with no press row', 'A reason the test takes away.')
    // BY HAND: the press row is taken away, and the change rows no longer name it, as for an act written before the
    // press rows existed (migration 0280). No route writes an act under the grant with no press row now.
    const press = thePresses().at(-1)!
    t.client.sqlite.prepare('UPDATE changes SET press_id = NULL WHERE press_id = ?').run(press.id)
    t.client.sqlite.prepare('DELETE FROM presses_for_the_person WHERE id = ?').run(press.id)

    const said = await theProfile()
    const act = theActsIn(said).find((one) => one.recordId === decision && one.op === 'create')
    expect(act?.reason).toEqual({ written: null, because: 'none written' })
    expect(drawn(said)).toContain(NO_REASON.en)
    expect(drawn(said, 'zh')).toContain(NO_REASON.zh)
  })

  it('says it cannot tell which reason is whose where two presses fall in the same second on one record', async () => {
    const decision = await aDecisionForThePerson('A decision pressed twice in one second', 'The first press.')
    const changed = await ask('PATCH', `/api/records/${decision}`, AS_THE_SECRETARY, {
      ...forThePerson('The second press.'),
      title: 'A decision pressed twice in one second, renamed',
    })
    expect(changed.status, changed.said).toBe(200)
    // BY HAND: both presses are put in the same second, on both ledgers, as two quick presses would be.
    const [first, second] = thePresses().slice(-2)
    expect(first!.reason).toBe('The first press.')
    expect(second!.reason).toBe('The second press.')
    t.client.sqlite.prepare('UPDATE changes SET at = ? WHERE press_id = ?').run(first!.at, second!.id)
    t.client.sqlite.prepare('UPDATE revisions SET at = ? WHERE record_id = ?').run(first!.at, decision)
    t.client.sqlite.prepare('UPDATE presses_for_the_person SET at = ? WHERE id = ?').run(first!.at, second!.id)

    const said = await theProfile()
    const acts = theActsIn(said).filter((one) => one.recordId === decision && one.seq !== null)
    expect(acts.map((one) => one.op).sort()).toEqual(['create', 'update'])
    for (const one of acts) expect(one.reason, one.op).toEqual({ written: null, because: 'cannot tell' })
    expect(drawn(said)).toContain(asDrawn(CANNOT_TELL.en))
    expect(drawn(said, 'zh')).toContain(CANNOT_TELL.zh)
  })
})
