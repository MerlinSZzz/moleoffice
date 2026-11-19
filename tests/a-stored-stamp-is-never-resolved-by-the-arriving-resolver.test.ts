// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED STAMP IS NEVER RESOLVED BY THE ARRIVING-REFERENCE RESOLVER.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT, MEASURED RATHER THAN REASONED ABOUT — problem `1depXfmbfVH9`
 * ---------------------------------------------------------------------------------------
 *
 * `whereTheQuestionIs` in src/server/lib/confirming.ts asked who put a question on the person's
 * queue by handing the stored stamp to `participantForActor`:
 *
 *     const marker = participantForActor({ type: 'agent', id: asked.actorId })
 *
 * `asked.actorId` is a STORED stamp off the revision ledger. `participantForActor` is the ARRIVING-
 * reference resolver, and since piece I-1 that reader RAISES a 409 when a name means two agents.
 * So from the moment piece I-2 frees a handle and somebody takes it, a record whose asker stamp is
 * that name answers 409 to every request that touches it:
 *
 *   · PATCH refuses it — `assertMayRemoveAnAsk` calls this on every write that touches the ask;
 *   · GET refuses it too, because the record route serves `whereTheQuestionIs` with every record;
 *   · AND THE OWNER IS NOT EXEMPT. They cannot read the record and they cannot clear the question. It
 *     drops off their own page for a reason that is about a name rather than about their record.
 *
 * Nothing is written, so it is fail-closed rather than a hole. It is still a record the owner cannot reach.
 *
 * It was found while building piece I-3b's freed-handle collision, in this test suite: the
 * collision's own read of the row failed. Supervisor SI then measured how far it reaches — 36 call
 * sites of `participantForActor` in src/, of which 35 pass the LIVE actor off the request, which is
 * exactly what the throwing resolver is for and is correct. This was the only one passing a stored
 * stamp. One file, one function.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOW, AND WHY THAT IS THE SAFE DIRECTION
 * ---------------------------------------------------------------------------------------
 *
 * The stamp is read the way criterion I2 reads a stored one: an EXACT ID first, and it settles it
 * alone, because an id is never reused; failing that, the one agent bearing the string as a handle,
 * live or retired. Where more than one answers, NO agent answers, and the reading takes the branch
 * that was already there for a stamp nothing bears — the question is with the person, with a
 * sentence naming both agents. A question whose asker cannot be placed belongs in the person's queue, not
 * out of reach of everybody.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `whereTheQuestionIs` back on `participantForActor({ type: 'agent', id: asked.actorId })`,
 *     the line exactly as it was — three of the five cases below go red. The exact-id pair raises
 *     the resolver's 409 where a record and a refusal should be, so both of its cases fail; and the
 *     two-handle stamp is followed to whichever live agent bears the name, so the reading names one
 *     agent where it should name two and say the question is the person's.
 *
 * MEASURED, NOT ASSUMED: a first mutation that only re-added the throw turned two cases red rather
 * than three, because the resolver refuses a name only when an id and a live handle name different
 * agents — two agents sharing a handle is not that case. The mutation above is the whole line back.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** TWO AGENTS UNDER ONE NAME, neither of which has it as an id. The stamp names both. */
const ASKED_FIRST = { id: 'As1kE4rT7yUi', handle: 'inquirer', name: 'Inquirer One' }
const ASKED_SECOND = { id: 'Bx2nM6qW9zPl', handle: 'inquirer', name: 'Inquirer Two' }

/** A LEGACY AGENT WHOSE ID IS ITS OLD NAME, and the agent that took the name after it retired. */
const LEGACY = { id: 'relay', handle: 'relay', name: 'Relay' }
const SUCCESSOR = { id: 'Cy3pL8kJ4mNv', handle: 'relay', name: 'Relay Two' }

function insertAgent(who: { id: string; handle: string; name: string }): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(who.id, who.name, who.handle, `avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
}

function retire(id: string, newHandle?: string): void {
  t.client.sqlite.prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?').run('2026-09-12 09:00:00', id)
  if (newHandle !== undefined) t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(newHandle, id)
}

/** A question put on the person's queue by whoever the headers say. */
async function anAsk(headers: Record<string, string>, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'problem', title, data: { symptom: 'it stops 4 cm short', whose_move: 'person' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function read(
  id: string,
): Promise<{
  code: number
  said: string
  where: { with: { kind: string; id: string } | null; markedBy: { kind: string; id: string } | null; reachedThePerson: boolean; says: string } | null
}> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  let where = null
  try {
    where = (reply.json() as { whereTheQuestionIs?: typeof where }).whereTheQuestionIs ?? null
  } catch {
    where = null
  }
  return { code: reply.statusCode, said: reply.body, where }
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { code: reply.statusCode, said: reply.body }
}

let ambiguousToRead = ''
let ambiguousForAnAgent = ''
let ambiguousForThePerson = ''
let legacysAsk = ''

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  // 1. THE AMBIGUOUS STAMP. `inquirer` asks while it is the only agent bearing the name, retires
  //    keeping it, and then a second agent takes it — which needs the unique index gone, and that is
  //    what piece I-2 does to `agents_handle_idx`.
  insertAgent(ASKED_FIRST)
  ambiguousToRead = await anAsk(asAgent(ASKED_FIRST.handle), 'The arm stops short, and this one is read')
  ambiguousForAnAgent = await anAsk(asAgent(ASKED_FIRST.handle), 'The arm stops short, and an agent tries this one')
  ambiguousForThePerson = await anAsk(asAgent(ASKED_FIRST.handle), 'The arm stops short, and the person clears this one')
  retire(ASKED_FIRST.id)
  t.client.sqlite.prepare('DROP INDEX IF EXISTS agents_handle_idx').run()
  insertAgent(ASKED_SECOND)

  // 2. THE EXACT-ID STAMP. `relay` registered before the mint, so its id IS the string `relay`; it
  //    asked, retired, its name was freed, and a new agent took the name.
  insertAgent(LEGACY)
  legacysAsk = await anAsk(asAgent(LEGACY.id), 'The wrist camera drifts, asked under a legacy id')
  retire(LEGACY.id, 'relay-the-first')
  insertAgent(SUCCESSOR)
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. a stamp that names two agents

describe('a question whose asker stamp names two agents stays readable and stays in the person’s queue', () => {
  it('is served to the person, and says which two agents the name means', async () => {
    const got = await read(ambiguousToRead)

    expect(got.code, `the person could not read their own record: ${got.said}`).toBe(200)
    expect(got.where?.reachedThePerson, 'the question was not put in the person’s queue').toBe(true)
    expect(got.where?.with, 'a question nobody can place was said to be with somebody').toBeNull()
    expect(got.where?.says).toContain(ASKED_FIRST.name)
    expect(got.where?.says).toContain(ASKED_SECOND.name)
    expect(got.where?.says, 'the reading does not say where the question is').toContain('with the person')
  })

  it('is still the person’s to clear, which is the whole reason the safe direction is their queue', async () => {
    const cleared = await patch(ambiguousForThePerson, { dataPatch: { whose_move: null } }, AS_THE_PERSON)
    expect(cleared.code, cleared.said).toBe(200)
  })

  it('is refused to the live agent bearing the name, by the guard rather than by the resolver', async () => {
    // 403 AND NOT 409. `sameAgent` answers that a stamp naming two agents is not the caller's own —
    // fail closed — and the refusal that follows is the guard's own sentence about the queue, which
    // tells the agent what to do instead. A 409 here would be the defect this file is about.
    const refused = await patch(ambiguousForAnAgent, { dataPatch: { whose_move: null } }, asAgent(ASKED_SECOND.id))
    expect(refused.code, `refused with ${refused.code}: ${refused.said}`).toBe(403)
    expect(refused.said).toContain('takes it out of the person')

    const still = await read(ambiguousForAnAgent)
    expect(still.code, still.said).toBe(200)
  })
})

// ============================================================ 2. a stamp that is one agent's exact id

describe('a stamp that is a legacy agent’s exact id names that agent, and not whoever holds the name now', () => {
  it('is served, and the reading marks the agent whose ID the stamp is', async () => {
    const got = await read(legacysAsk)

    expect(got.code, `the person could not read their own record: ${got.said}`).toBe(200)
    expect(got.where?.markedBy?.id, 'the stamp was followed to the agent that took the freed name').toBe(LEGACY.id)
  })

  it('is not the successor’s to withdraw, and the refusal is the guard’s rather than the resolver’s', async () => {
    const refused = await patch(legacysAsk, { dataPatch: { whose_move: null } }, asAgent(SUCCESSOR.id))
    expect(refused.code, `refused with ${refused.code}: ${refused.said}`).toBe(403)
    expect(refused.said).toContain('takes it out of the person')
  })
})
