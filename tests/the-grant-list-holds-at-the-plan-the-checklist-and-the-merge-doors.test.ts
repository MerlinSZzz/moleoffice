// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THIS OFFICE'S LIST OF WHAT THE GRANT CARRIES HOLDS AT TWO MORE PLACES THAT ASK THE CHECK: APPLYING A SETTLED CHANGE
 * SET, AND MARKING A CHECKLIST ITEM DONE WITH NO EVIDENCE. Wave 13s round 67.
 *
 * Each place asks `aRaiseCarriesIt` (src/server/lib/records.ts) after its own ways of letting the act through. That
 * asks `mayPressForThePerson`, which reads this office's row for the door before the card's answer. Each place is
 * driven through its route, with a secretary that holds the person's grant:
 *   - applying a change set is POST /api/planning/proposals/:id/apply, operation `plan.write`, asked in the route
 *     itself (src/server/api/planning.ts);
 *   - marking an item done with no evidence is PATCH /api/checklists/:id/items/:item, operation
 *     `checklist.changeItem`, asked in `thePersonsOwnDone` (src/server/lib/checklists.ts).
 * The card's answer for both doors is may-press: none is on `elevation.neverPresses` or `askFirst`.
 *
 * AT EACH PLACE IT HOLDS:
 *   - where this office's row says `kept`, the secretary is refused 403 in the check's own words, and nothing is
 *     written: the place's own record is unchanged, and `changes` and `presses_for_the_person` gain no row;
 *   - where the row says `may-press`, the secretary is let through, and what it wrote names the grant;
 *   - a check that comes after the grant still refuses, and writes nothing: a change set nobody settled is not
 *     applied, and a checklist that changed since it was read is not written.
 *
 * Every agent and record here is made up for the test, in a fresh test database.
 *
 * MUTATION, after a control run:
 *   · src/server/lib/what-the-grant-carries.ts, `thisOfficesAnswerAbout` answers null for every door → the three
 *     "keeps" cases are red: the card's may-press stands, and the change set is applied, the item is marked done and
 *     the entry is moved;
 *   · src/server/lib/checklists.ts, `aRaiseCarriesIt(actor)` in `thePersonsOwnDone` replaced by `true` → "keeps
 *     checklist.changeItem" is red: the item is marked done; and "lets the secretary mark it done" is red: the check
 *     was not asked, so the mark and the change row do not name the grant;
 *   · src/server/api/planning.ts, `aRaiseCarriesIt(actor)` in the apply route replaced by a lookup of the grant alone
 *     (`theElevationHeldBy(actor.id) !== null`) → "keeps plan.write" is red: the change set is applied; and "lets
 *     the secretary apply it" is red: nothing it wrote names the grant;
 *   · src/server/lib/merge-state-machine.ts, `aRaiseCarriesIt(actor)` in `mayMoveAnEntryFirst` replaced by a lookup
 *     of the grant alone, which still names it on the move → "keeps merge.first" is red: the entry is moved; and "lets
 *     the secretary move it" is red: the move names the grant, and the change row does not.
 * The three cases of a check after the grant stay green under all four mutations: they refuse for a reason that is
 * not the grant.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import {
  A_TESTS_REASON_FOR_THE_PERSON,
  apiApp,
  freshDb,
  FOR_THE_PERSON,
  FOR_THE_PERSON_IN_THE_QUERY,
  thePersonsKeyHeader,
  type TestDb,
  governsTheWholeProject,
} from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let list: typeof import('../src/server/lib/what-the-grant-carries.ts')
let grant = ''

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle
const WORKSPACE = 'default'
/** Who sets this office's row in this file: the person, as the door that sets it would name them. */
const THE_PERSON_SETTING_IT: Actor = { type: 'human', id: THE_PERSON }

let asThePerson: Record<string, string> = {}
let asTheSecretary: Record<string, string> = {}

/** The stable part of the check's refusal for a door this office keeps for the person. */
function keptWords(operation: string): string {
  return `keeps ${operation} for the person, so their grant does not press it for them`
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; said: string; body: Record<string, any> }> {
  const reply = await app.app.inject({
    method,
    url,
    headers: payload === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { payload }),
  })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** How many rows the change log and the presses for the person hold, to show a refused press added none. */
function theRowCounts(): { changes: number; presses: number } {
  const changes = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM changes').get() as { n: number }).n
  const presses = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM presses_for_the_person').get() as { n: number }).n
  return { changes, presses }
}

/** One record as stored, so a refused press can be shown to have left it as it was. */
function theStoredRecord(id: string): { data: string; updated_at: string } {
  return t.client.sqlite.prepare('SELECT data, updated_at FROM records WHERE id = ?').get(id) as { data: string; updated_at: string }
}

/** The presses for the person written since the row count `from`, oldest first. */
function thePressesAfter(from: number): { grant_id: string; operation: string; agent_id: string; reason: string | null }[] {
  return t.client.sqlite.prepare('SELECT grant_id, operation, agent_id, reason FROM presses_for_the_person ORDER BY rowid').all().slice(from) as never
}

/** The `elevation` column of every change row written about one record. */
function theElevationsOn(record: string): (string | null)[] {
  return (t.client.sqlite.prepare('SELECT elevation FROM changes WHERE record_id = ? ORDER BY rowid').all(record) as { elevation: string | null }[]).map(
    (row) => row.elevation,
  )
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  list = await import('../src/server/lib/what-the-grant-carries.ts')
  asThePerson = {
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(),
  }
  const started = await ask('POST', '/api/agents/started', asThePerson, { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  expect(started.status, started.said).toBe(201)
  asTheSecretary = {
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': SECRETARY,
    'x-mole-office-key': String(started.body['whatToGiveIt']?.key ?? ''),
  }
  const raised = await ask('POST', `/api/roles/elevation/${SECRETARY}`, asThePerson, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.said).toBe(201)
  grant = String(raised.body['elevation']?.id ?? '')
  expect(grant).not.toBe('')
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('applying a settled change set, POST /api/planning/proposals/:id/apply', () => {
  const APPLY = (proposal: string): string => `/api/planning/proposals/${proposal}/apply?${FOR_THE_PERSON_IN_THE_QUERY}`

  /** A change set that creates one task, filed by the person, and settled by the person's decision when `settled`. */
  async function aChangeSet(title: string, settled: boolean): Promise<string> {
    const proposal = await ask('POST', '/api/records', asThePerson, {
      kind: 'proposal',
      title: `A change set that creates "${title}"`,
      data: {
        question: 'Should the project take this shape?',
        options: ['a — yes, as written', 'b — no'],
        who_settles_it: 'the owner',
        extra: { delta: { ops: [{ op: 'create_record', says: `Create the task "${title}"`, kind: 'task', title, workspaceId: WORKSPACE, data: { state: 'todo' } }] } },
      },
    })
    expect(proposal.status, proposal.said).toBe(201)
    const id = String(proposal.body['record'].id)
    if (!settled) return id
    const decision = await ask('POST', '/api/records', asThePerson, {
      kind: 'decision',
      title: 'Yes, as written',
      data: { ...governsTheWholeProject(), replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'It is right.' },
    })
    expect(decision.status, decision.said).toBe(201)
    const link = await ask('POST', '/api/links', asThePerson, { fromId: decision.body['record'].id, toId: id, type: 'derived_from' })
    expect(link.status, link.said).toBeLessThan(300)
    return id
  }

  function theTasksTitled(title: string): string[] {
    return (t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'task' AND title = ? AND deleted_at IS NULL").all(title) as { id: string }[]).map((row) => row.id)
  }

  it('keeps plan.write: the secretary is refused in the check\'s own words, and nothing is written', async () => {
    list.setThisOfficesAnswer('plan.write', 'kept', THE_PERSON_SETTING_IT)
    const title = 'A task the kept change set would create'
    const proposal = await aChangeSet(title, true)
    const before = theRowCounts()
    const stored = theStoredRecord(proposal)

    const refused = await ask('POST', APPLY(proposal), asTheSecretary)
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(keptWords('plan.write'))

    expect(theTasksTitled(title)).toEqual([])
    expect(theStoredRecord(proposal)).toEqual(stored)
    expect(theRowCounts()).toEqual(before)
  })

  it('lets the secretary apply it where the row says may-press, and what it wrote names the grant', async () => {
    list.setThisOfficesAnswer('plan.write', 'may-press', THE_PERSON_SETTING_IT)
    const title = 'A task the pressed change set creates'
    const proposal = await aChangeSet(title, true)
    const from = theRowCounts().presses

    const applied = await ask('POST', APPLY(proposal), asTheSecretary)
    expect(applied.status, applied.said).toBe(200)

    const tasks = theTasksTitled(title)
    expect(tasks).toHaveLength(1)
    const elevations = theElevationsOn(tasks[0]!)
    expect(elevations.length).toBeGreaterThan(0)
    for (const elevation of elevations) expect(elevation ?? '').toContain(grant)
    expect(thePressesAfter(from)).toEqual([{ grant_id: grant, operation: 'plan.write', agent_id: SECRETARY, reason: A_TESTS_REASON_FOR_THE_PERSON }])
  })

  it('still refuses a change set nobody settled under may-press, and writes nothing', async () => {
    list.setThisOfficesAnswer('plan.write', 'may-press', THE_PERSON_SETTING_IT)
    const title = 'A task the unsettled change set would create'
    const proposal = await aChangeSet(title, false)
    const before = theRowCounts()
    const stored = theStoredRecord(proposal)

    const refused = await ask('POST', APPLY(proposal), asTheSecretary)
    expect(refused.status, refused.said).toBe(409)
    expect(refused.said).toContain('has not been settled by a person')

    expect(theTasksTitled(title)).toEqual([])
    expect(theStoredRecord(proposal)).toEqual(stored)
    expect(theRowCounts()).toEqual(before)
  })
})

describe('marking a checklist item done with no evidence, PATCH /api/checklists/:id/items/:item', () => {
  /** A checklist of the person's with one open item the person added, so nobody but the person is told. */
  async function anItem(words: string): Promise<{ checklist: string; item: string }> {
    const made = await ask('POST', '/api/checklists', asThePerson, { title: `A checklist for "${words}"` })
    expect(made.status, made.said).toBe(201)
    const checklist = String(made.body['checklist'].id)
    const added = await ask('POST', `/api/checklists/${checklist}/items`, asThePerson, { words })
    expect(added.status, added.said).toBe(201)
    return { checklist, item: String(added.body['item'].id) }
  }

  async function theVersionOf(checklist: string): Promise<string> {
    const read = await ask('GET', `/api/checklists/${checklist}`, asThePerson)
    expect(read.status, read.said).toBe(200)
    return String(read.body['checklist'].version)
  }

  it('keeps checklist.changeItem: the secretary is refused in the check\'s own words, and nothing is written', async () => {
    list.setThisOfficesAnswer('checklist.changeItem', 'kept', THE_PERSON_SETTING_IT)
    const { checklist, item } = await anItem('An item the kept press would tick')
    const version = await theVersionOf(checklist)
    const before = theRowCounts()
    const stored = theStoredRecord(checklist)

    const refused = await ask('PATCH', `/api/checklists/${checklist}/items/${item}`, asTheSecretary, { ...FOR_THE_PERSON, state: 'done' })
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain(keptWords('checklist.changeItem'))

    expect(await theVersionOf(checklist)).toBe(version)
    expect(theStoredRecord(checklist)).toEqual(stored)
    expect(theRowCounts()).toEqual(before)
  })

  it('lets the secretary mark it done where the row says may-press, and the mark and the change row name the grant', async () => {
    list.setThisOfficesAnswer('checklist.changeItem', 'may-press', THE_PERSON_SETTING_IT)
    const { checklist, item } = await anItem('An item the pressed press ticks')
    const from = theRowCounts().presses

    const done = await ask('PATCH', `/api/checklists/${checklist}/items/${item}`, asTheSecretary, { ...FOR_THE_PERSON, state: 'done' })
    expect(done.status, done.said).toBe(200)
    expect(done.body['item'].state).toBe('done')
    expect(done.body['item'].doneByThePerson).toMatchObject({ underTheRaise: true })

    expect(theElevationsOn(checklist).at(-1) ?? '').toContain(grant)
    expect(thePressesAfter(from)).toEqual([{ grant_id: grant, operation: 'checklist.changeItem', agent_id: SECRETARY, reason: A_TESTS_REASON_FOR_THE_PERSON }])
  })

  it('still refuses a version the checklist no longer has under may-press, and writes nothing', async () => {
    list.setThisOfficesAnswer('checklist.changeItem', 'may-press', THE_PERSON_SETTING_IT)
    const { checklist, item } = await anItem('An item the stale press would tick')
    const version = await theVersionOf(checklist)
    const before = theRowCounts()
    const stored = theStoredRecord(checklist)

    const stale = await ask('PATCH', `/api/checklists/${checklist}/items/${item}`, asTheSecretary, {
      ...FOR_THE_PERSON,
      state: 'done',
      ifVersion: 'a-version-it-never-had',
    })
    expect(stale.status, stale.said).toBe(409)
    expect(stale.body['code']).toBe('checklistChangedSinceRead')

    expect(await theVersionOf(checklist)).toBe(version)
    expect(theStoredRecord(checklist)).toEqual(stored)
    expect(theRowCounts()).toEqual(before)
  })
})
