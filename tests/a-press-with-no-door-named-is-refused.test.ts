// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PRESS UNDER THE PERSON'S GRANT THAT NAMES NO DOOR IS REFUSED, AND NOTHING IS WRITTEN. Wave 13s round 67.
 *
 * `mayPressForThePerson` (src/server/lib/records.ts) asks which door a press came through before it asks this office's
 * list or the card, because the answer is given for a door. An actor a route builds always names its door: `actorFrom`
 * puts the route's operation on `actor.press`. An actor built by hand, in code that is not a route, may name none. The
 * check then cannot tell whether the secretary card keeps the act for the person, so `aRaiseCarriesIt` refuses it 403
 * in its own words rather than let the grant press it.
 *
 * The act driven here is filing a decision with `createRecord`, an act only the person may make, whose guard asks
 * `actsForThePerson` and so `aRaiseCarriesIt`. The secretary holds the person's grant, given through the grant's own
 * door. The control is the same secretary with a door named, `record.write`, and a reason: it is let through, so the
 * refusal comes from the missing door and from nothing else.
 *
 * Every agent and record here is made up for the test, in a fresh test database.
 *
 * MUTATION, after a control run: the refusal is the `no door` branch of `mayPressForThePerson` and the throw in
 * `aRaiseCarriesIt`, both in src/server/lib/records.ts. The press-less actor reaches them through
 * src/server/lib/records.ts and the grant lookup in src/server/lib/elevation.ts alone, before
 * src/server/lib/what-the-grant-carries.ts or the card is asked anything. Take out the `no door` branch, and "is
 * refused 403" is red: the check reads the door of a press that is not there, and fails with a TypeError instead of
 * this refusal.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { Actor } from '../src/server/lib/records.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { A_TESTS_REASON_FOR_THE_PERSON, apiApp, expectPanelError, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>

const SECRETARY = THE_TEST_OFFICES_SECRETARY.handle

const THE_REFUSAL =
  "This act was asked under the person's grant with no door named, so Mole Office cannot tell whether the secretary card " +
  'keeps it for the person. Nothing was done. Make it through its door in the API.'

/** How many rows the records, the change log and the presses for the person hold. */
function theRowCounts(): { records: number; changes: number; presses: number } {
  const count = (table: string): number => (t.client.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  return { records: count('records'), changes: count('changes'), presses: count('presses_for_the_person') }
}

/** A decision for the person's register, filed by `actor`. Only the person may file one. */
function aDecisionBy(actor: Actor, title: string) {
  return t.api.createRecord({
    kind: 'decision',
    title,
    workspaceId: 'default',
    actor,
    data: { replaces: [], decided_by: 'the owner', authority: 'the owner said so', because: 'A test files it.' },
  })
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const asThePerson = { 'content-type': 'application/json', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const started = await app.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asThePerson,
    payload: { handle: SECRETARY, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' },
  })
  expect(started.statusCode, started.body).toBe(201)
  const raised = await app.app.inject({
    method: 'POST',
    url: `/api/roles/elevation/${SECRETARY}`,
    headers: { ...asThePerson, ...thePersonsKeyHeader() },
    payload: { reason: 'A test raises it.', endsWhen: 'when you say' },
  })
  expect(raised.statusCode, raised.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
})

describe('a press with no door named', () => {
  it('is refused 403 in the check\'s own words, and writes no record, no change row and no press row', () => {
    const before = theRowCounts()
    const title = 'A decision asked with no door named'

    const noDoor: Actor = { type: 'agent', id: SECRETARY, sessionId: null, stated: true }
    const refused = expectPanelError(t, () => aDecisionBy(noDoor, title), 403)
    expect(refused.message).toBe(THE_REFUSAL)

    expect(theRowCounts()).toEqual(before)
    expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title)).toEqual({ n: 0 })
  })

  it('is let through when the same secretary names the door and gives a reason, so the door is what was missing', () => {
    const before = theRowCounts()

    const throughItsDoor: Actor = {
      type: 'agent',
      id: SECRETARY,
      sessionId: null,
      stated: true,
      press: { operation: 'record.write', aRead: false, reason: A_TESTS_REASON_FOR_THE_PERSON },
    }
    const filed = aDecisionBy(throughItsDoor, 'A decision asked through its door')
    expect(filed.kind).toBe('decision')

    const after = theRowCounts()
    expect(after.records).toBe(before.records + 1)
    expect(after.presses).toBe(before.presses + 1)
  })
})
