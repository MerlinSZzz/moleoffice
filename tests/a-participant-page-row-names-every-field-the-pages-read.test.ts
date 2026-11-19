// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH KIND OF PARTICIPANT'S PAGE ROW CARRIES EVERY FIELD THE PAGES READ FROM THAT KIND, AND NO OTHER.
 *
 * A participant's page row is named twice. `pageParticipant` in src/server/api/participants.ts builds each field of a
 * person's row and of an agent's row by hand. `PARTICIPANT_FIELDS_THE_PAGES_READ` in src/shared/short-lists.ts lists
 * the fields the pages read, and `ParticipantForThePage` in src/web/api.ts types the page row from that list. Nothing
 * tied the two together, so a field added to the list could be missing from the row; only a test of the line that
 * added the field found that, by chance. Invariant 9: one fact, one place.
 *
 * IT READ THE TWO ROWS TOGETHER, AND THAT WAS NOT ENOUGH. A field the person's row and the agent's row both carry
 * could be dropped from one row alone and the union still named it, so neither row was checked. This test checks
 * each kind alone, against the fields that kind carries.
 *
 * WHICH FIELD BELONGS TO WHICH KIND IS READ FROM THE CODE, NOT WRITTEN HERE. No declared list splits the page fields
 * by kind; the two branches of `pageParticipant` build the split but are the thing under test. The code states the
 * same split independently in the two branches of `onTheWire`, which builds the whole participant row: a listed field
 * a person's whole row carries is a field that person's page row must carry, and the same for an agent. This is a
 * behaviour test: it reads both whole rows through `GET /api/participants`, both page rows through
 * `GET /api/participants?shape=page`, and copies neither the list nor the split.
 *
 * IT ALSO CHECKS THE CASE THE TEST EXISTS FOR: a field added to the list and to neither kind's row, so both per-kind
 * checks would pass while no page could read it. Every listed field must be carried by at least one kind.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { PARTICIPANT_FIELDS_THE_PAGES_READ } from '../src/shared/short-lists.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HEADERS = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const HANDLE = 'page-row-agent'

let t: TestDb
let app: FastifyInstance
let agentId = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: HEADERS,
    payload: { handle: HANDLE, name: 'A page row agent', role: 'worker' },
  })
  expect(made.statusCode, made.body).toBe(201)
  agentId = (made.json() as { agent: { id: string } }).agent.id
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

type Roster = { people: Record<string, unknown>[]; agents: Record<string, unknown>[] }

/** The listed fields a whole page row of this kind carries: the kind's own statement of what its page row must keep. */
function theListedFieldsThisKindCarries(whole: Record<string, unknown>): Set<string> {
  return new Set(PARTICIPANT_FIELDS_THE_PAGES_READ.filter((field) => field in whole))
}

it('names every listed field each kind carries, and no field the pages do not read', async () => {
  const [pageAnswer, wholeAnswer] = await Promise.all([
    app.inject({ method: 'GET', url: '/api/participants?shape=page', headers: HEADERS }),
    app.inject({ method: 'GET', url: '/api/participants', headers: HEADERS }),
  ])
  expect(pageAnswer.statusCode, pageAnswer.body).toBe(200)
  expect(wholeAnswer.statusCode, wholeAnswer.body).toBe(200)
  const page = pageAnswer.json() as Roster
  const whole = wholeAnswer.json() as Roster
  const listed = new Set<string>(PARTICIPANT_FIELDS_THE_PAGES_READ)
  const check = (kind: 'person' | 'agent', id: string, pageRows: Record<string, unknown>[], wholeRows: Record<string, unknown>[]) => {
    const pageRow = pageRows.find((row) => row['id'] === id)
    const wholeRow = wholeRows.find((row) => row['id'] === id)
    expect(pageRow, `the office has no page row for its ${kind}`).toBeDefined()
    expect(wholeRow, `the office has no whole row for its ${kind}`).toBeDefined()
    const mustCarry = theListedFieldsThisKindCarries(wholeRow!)
    const carries = new Set(Object.keys(pageRow!))
    return {
      entry: {
        kind,
        missing: [...mustCarry].filter((field) => !carries.has(field)),
        notRead: [...carries].filter((field) => !listed.has(field)),
      },
      mustCarry,
    }
  }
  const person = check('person', THE_PERSON, page.people, whole.people)
  const agent = check('agent', agentId, page.agents, whole.agents)
  // A LISTED FIELD NO KIND CARRIES IS THE CASE THIS TEST EXISTS FOR: a field added to the list before it is
  // added to either row. Both rows can look right and the field still be read by no page.
  const carriedByNoKind = [...listed].filter((field) => !person.mustCarry.has(field) && !agent.mustCarry.has(field))
  expect([person.entry, agent.entry, { carriedByNoKind }]).toEqual([
    { kind: 'person', missing: [], notRead: [] },
    { kind: 'agent', missing: [], notRead: [] },
    { carriedByNoKind: [] },
  ])
})
