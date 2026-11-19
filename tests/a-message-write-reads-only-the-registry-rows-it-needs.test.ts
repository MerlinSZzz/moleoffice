// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WRITE READS ONLY THE REGISTRY ROWS ITS SENDER COULD BE, AND THE SECRETARIES ONCE. Wave 13u round 41.
 *
 * Two reads of the agent registry ran on every message written. Measured on a made-up office of 972 agents:
 *   - B. `whatANewMessageChanges` (src/server/lib/messages.ts) read the id, name and handle of everybody in both
 *     registries (973 rows) to say who sent the message, for the event that tells an open page about it;
 *   - C. the create door in src/server/lib/records.ts asked `theMessageReader` three times, once each for the
 *     message's target, quotes and lead. For an agent writer each asked `theSecretaries()`, which reads every agent:
 *     972 rows each time, 2,916 for the three.
 * A stored sender is matched by kind and id, or an agent by its handle (`theAgentAStoredSenderNames` in
 * src/shared/messages.ts), so the rows whose id or handle is the stored id are the only rows that can answer it. A typed
 * `from` with no stored sender is still matched against every name. A message to a group asks no sender. The reader is
 * now worked out once and handed to all three checks, which only read it.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE.
 *
 *   1. THE SAME ANSWER, for ten messages that differ in who sent them. For each, the lists the event carries are
 *      compared with the answer this code gave before the change, written out below, and the sender of each pair with
 *      what `senderOf` says when it is given every registered name. The ten: the person; an agent stored by its id,
 *      to the person and to another agent; an agent stored by its handle; a handle two agents have held, one of them
 *      retired; an agent and a person no registry holds; a line Mole Office wrote; a message to a group; and a typed
 *      `from` with no stored sender.
 *   2. NOT EVERY NAME. The statements that read every name run only for the typed `from`, and the rows read for any
 *      other sender are at most the rows that hold its id or handle. The typed `from` case is also the guard: if the
 *      statements were written differently the counter would see nothing, and that case would fail first.
 *   3. THE SECRETARIES ONCE. An agent's message with a target and a lead, one with quotes, one with neither, and one
 *      whose target is not there (refused as before): the statement that reads the secretaries runs once for each. The
 *      person's message to an agent nothing holds runs it not at all: the 409's reason names nobody to write to instead,
 *      so it reads no secretaries, and the reader of the three checks runs it for the person not at all either. A direct
 *      call of `theSecretaries()` runs it once, which is the guard for this case. These are written through
 *      `createRecord`: the record door asks for the reader twice more for its own answer, and that door is not changed.
 *
 * THE LIMITS.
 *   · The answers before the change are written out here, from a run of this file on the code before it, and not
 *     worked out again by that code.
 *   · The PATCH door, which asks for the reader only for a field that changed, is not changed and not run here.
 *
 * WHAT TURNS EACH RED, each tried in wave 13u round 41, after a control run that was red on the counts alone:
 *   · case 1: read the agents by id only, not by handle (the handle stored with one bearer is not found);
 *   · case 1: read only the agents not retired (the handle two agents held is taken for the live one);
 *   · case 1: give the typed `from` no names (it is not matched);
 *   · case 2: read every name again for every sender;
 *   · case 3: ask `theMessageReader` once for each check again.
 *   · case 3, tried in wave 13s round 248: name the secretaries in the 409's reason again, as `theCannotReceiveLine`
 *     does (the person's count rises to 1).
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { participantKey, senderOf } from '../src/shared/messages.ts'
import { MOLE_OFFICE_HANDLE, type ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_WREN = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-wren' }
/** The two statements of `everyNameInTheRegistries`, as src/server/lib/participants.ts writes them. */
const EVERY_NAME = new Set(['SELECT id, name, handle FROM people ORDER BY handle', 'SELECT id, name, handle FROM agents ORDER BY handle'])
/** The statement of `theSecretaries`, as src/server/lib/secretariat.ts writes it. */
const THE_SECRETARIES = 'SELECT id FROM agents WHERE role = ? AND retired IS NOT 1 ORDER BY id'
/** A statement that reads the id, name and handle of rows of either registry, whichever rows it asks for. */
const A_READ_OF_NAMES = /^\s*SELECT id, name, handle FROM (people|agents)\b/

let t: TestDb
let app: FastifyInstance
let messages: typeof import('../src/server/lib/messages.ts')
let secretariat: typeof import('../src/server/lib/secretariat.ts')
type Seen = { everyName: number; secretaries: number; registryRows: number }
let seen: Seen = { everyName: 0, secretaries: 0, registryRows: 0 }
const person: ParticipantRef = { kind: 'person', id: THE_PERSON }
let wren: ParticipantRef
let finch: ParticipantRef
let heron: ParticipantRef

beforeAll(async () => {
  t = await freshDb()
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  // THE COUNTER GOES IN BEFORE THE SERVER IS MADE, so no statement the server keeps is prepared without it.
  sqlite.prepare = function (this: unknown, text: string) {
    const statement = prepare.call(this, text)
    const everyName = EVERY_NAME.has(text.trim())
    const secretaries = text.trim() === THE_SECRETARIES
    const registry = A_READ_OF_NAMES.test(text)
    if (!everyName && !secretaries && !registry) return statement
    for (const method of ['all', 'get'] as const) {
      const real = statement[method] as (...args: unknown[]) => unknown
      statement[method] = function (this: unknown, ...args: unknown[]) {
        const rows = real.apply(this, args)
        const n = Array.isArray(rows) ? rows.length : rows === undefined ? 0 : 1
        seen = {
          everyName: seen.everyName + (everyName ? 1 : 0),
          secretaries: seen.secretaries + (secretaries ? 1 : 0),
          registryRows: seen.registryRows + (registry ? n : 0),
        }
        return rows
      }
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  messages = await import('../src/server/lib/messages.ts')
  secretariat = await import('../src/server/lib/secretariat.ts')
  const register = async (handle: string): Promise<ParticipantRef> => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' } },
    })
    expect(made.statusCode, made.body).toBe(201)
    const { id } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }
    return { kind: 'agent', id }
  }
  wren = await register('made-up-wren')
  finch = await register('made-up-finch')
  heron = await register('made-up-heron')
  // A RETIRED AGENT THAT HELD THE SAME HANDLE, written into the table as a registry row of before the handle was freed.
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, licence_source) ' +
        "VALUES ('avatar-made-up-old-heron', 'avatar', 'default', NULL, 'image/svg+xml', NULL, '2026-10-01 10:00:00', NULL, NULL, 'generated')",
    )
    .run()
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) ' +
        "VALUES ('made-up-old-heron', 'Old heron', 'made-up-heron', 'avatar-made-up-old-heron', 1, '2026-10-02 10:00:00', '2026-10-01 10:00:00')",
    )
    .run()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** What `act` answers, with the registry reads counted while it ran. */
async function counted<T>(act: () => T | Promise<T>): Promise<{ answer: T } & Seen> {
  seen = { everyName: 0, secretaries: 0, registryRows: 0 }
  const answer = await act()
  return { answer, ...seen }
}

/**
 * A message written through the record door, with the registry reads counted while it was written. `expected` is the
 * status the write answers, when a caller names it.
 */
async function aMessage(headers: Record<string, string>, data: Record<string, unknown>, expected?: number): Promise<{ id: string } & Seen> {
  const made = await counted(() =>
    app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'A made-up message', data: { body: 'Made up for this file.', ...data } } }),
  )
  expect(made.answer.statusCode, made.answer.body).toBe(expected ?? theAnswerToAWriteInATestOffice(headers, { kind: 'message', data: { body: 'Made up for this file.', ...data } }))
  return { id: (made.answer.json() as { record: { id: string } }).record.id, everyName: made.everyName, secretaries: made.secretaries, registryRows: made.registryRows }
}

/** The message's stored data, with `change` laid over it, written straight into the row. */
function storedAs(id: string, change: (data: Record<string, unknown>) => Record<string, unknown>): void {
  const { data } = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  writeDataBypassingTheGate(t, id, change(JSON.parse(data) as Record<string, unknown>))
}

describe('a new message says who sent it as before, and reads only the rows its sender could be', () => {
  const sortedPair = (a: ParticipantRef, b: ParticipantRef): [ParticipantRef, ParticipantRef] =>
    participantKey(a) < participantKey(b) ? [a, b] : [b, a]
  /** The pairs in one order. They follow the delivery rows, whose order no rule fixes. */
  const inOrder = (pairs: unknown): unknown =>
    Array.isArray(pairs)
      ? [...(pairs as [ParticipantRef, ParticipantRef][])].sort((x, y) => (participantKey(x[0]) + participantKey(x[1]) < participantKey(y[0]) + participantKey(y[1]) ? -1 : 1))
      : pairs

  /** The lists for the event, and what was read for them: the statements over every name, and the rows of names read. */
  async function theLists(id: string): Promise<{ pairs: unknown; agentPairs: unknown; everyName: number; registryRows: number }> {
    const read = await counted(() => messages.whatANewMessageChanges(id, false))
    const lists = read.answer
    if (lists === null) throw new Error(`no message ${id} to read`)
    // AND THE SENDER OF EACH PAIR IS WHAT THE RULE SAYS WHEN IT IS GIVEN EVERY REGISTERED NAME.
    const byEveryName = lists.entry.toGroup !== null ? null : senderOf(lists.entry, messages.everybodyRegistered())
    for (const [from] of lists.pairs ?? []) expect(from, `the sender of a pair of ${id}`).toEqual(byEveryName)
    return { pairs: lists.pairs, agentPairs: lists.agentPairs, everyName: read.everyName, registryRows: read.registryRows }
  }

  it('says who sent each of ten messages as the code before this round said', async () => {
    const toWren = (await aMessage(AS_THE_PERSON, { to: [wren] })).id
    const fromWren = (await aMessage(AS_WREN, { to: [person] })).id
    // NOTHING HOLDS FINCH IN THE TEST OFFICE, so each message wren sends it is stored, routed and answered 409. The
    // message is stored all the same, and its lists are read below.
    const wrenToFinch = (await aMessage(AS_WREN, { to: [finch] }, 409)).id
    const cases: { what: string; id: string; pairs: unknown; agentPairs: unknown; reads: 'none' | 'its rows' | 'every name' }[] = []

    cases.push({ what: 'the person', id: toWren, pairs: [[person, wren]], agentPairs: [], reads: 'its rows' })
    cases.push({ what: 'an agent by its id, to the person', id: fromWren, pairs: [[wren, person]], agentPairs: [], reads: 'its rows' })
    // THE MESSAGE WAITS FOR FINCH, WHOM THE PERSON OWNS, so no copy reaches the person and the person is in no pair.
    cases.push({ what: 'an agent by its id, to an agent', id: wrenToFinch, pairs: [[wren, finch]], agentPairs: [sortedPair(wren, finch)], reads: 'its rows' })

    // TO FINCH, WHICH NOTHING HOLDS: the 409, with the message stored.
    const byHandle = (await aMessage(AS_WREN, { to: [finch] }, 409)).id
    storedAs(byHandle, (data) => ({ ...data, sentBy: { kind: 'agent', id: 'made-up-wren' } }))
    // It waits for finch, whom the person owns, so no copy reaches the person and the person is in no pair.
    cases.push({
      what: 'an agent by its handle',
      id: byHandle,
      pairs: [[wren, finch]],
      agentPairs: [sortedPair({ kind: 'agent', id: 'made-up-wren' }, finch)],
      reads: 'its rows',
    })

    const twoHeld = (await aMessage(AS_WREN, { to: [person] })).id
    storedAs(twoHeld, (data) => ({ ...data, sentBy: { kind: 'agent', id: 'made-up-heron' } }))
    cases.push({ what: 'a handle a live and a retired agent held', id: twoHeld, pairs: [[{ kind: 'agent', id: 'made-up-heron' }, person]], agentPairs: [], reads: 'its rows' })
    expect(heron.id, 'the fixture: the live heron has an id of its own').not.toBe('made-up-heron')

    const nobodysAgent = (await aMessage(AS_WREN, { to: [person] })).id
    storedAs(nobodysAgent, (data) => ({ ...data, sentBy: { kind: 'agent', id: 'made-up-nobody' } }))
    cases.push({ what: 'an agent no registry holds', id: nobodysAgent, pairs: [[{ kind: 'agent', id: 'made-up-nobody' }, person]], agentPairs: [], reads: 'its rows' })

    // TO FINCH, WHICH NOTHING HOLDS: the 409, with the message stored.
    const nobodysPerson = (await aMessage(AS_WREN, { to: [finch] }, 409)).id
    storedAs(nobodysPerson, (data) => ({ ...data, sentBy: { kind: 'person', id: 'made-up-nobody' } }))
    // It waits for finch, whom the person owns, so no copy reaches the person and the person is in no pair.
    cases.push({ what: 'a person no registry holds', id: nobodysPerson, pairs: [[{ kind: 'person', id: 'made-up-nobody' }, finch]], agentPairs: [], reads: 'its rows' })

    const officeLine = (await aMessage(AS_WREN, { to: [person] })).id
    storedAs(officeLine, (data) => ({ ...data, sentBy: { kind: 'agent', id: MOLE_OFFICE_HANDLE } }))
    cases.push({ what: 'a line Mole Office wrote', id: officeLine, pairs: null, agentPairs: [], reads: 'its rows' })

    // TO FINCH, WHICH NOTHING HOLDS, when it is sent: the 409, with the message stored. The group is written in after.
    const toAGroup = (await aMessage(AS_WREN, { to: [finch] }, 409)).id
    storedAs(toAGroup, (data) => ({ ...data, toGroup: 'made-up-group' }))
    cases.push({ what: 'a message to a group', id: toAGroup, pairs: null, agentPairs: [], reads: 'none' })

    const typed = (await aMessage(AS_WREN, { to: [person] })).id
    storedAs(typed, (data) => {
      const { sentBy: _left, ...rest } = data
      return { ...rest, from: '  Made-Up-WREN ' }
    })
    cases.push({ what: 'a typed from with no stored sender', id: typed, pairs: [[wren, person]], agentPairs: [], reads: 'every name' })

    // EVERY ANSWER FIRST, THEN WHAT WAS READ, so a run that fails on the reads has already compared all ten answers.
    const read = new Map<string, Awaited<ReturnType<typeof theLists>>>()
    for (const one of cases) {
      const lists = await theLists(one.id)
      expect({ pairs: inOrder(lists.pairs), agentPairs: lists.agentPairs }, `the lists of ${one.what}`).toEqual({ pairs: inOrder(one.pairs), agentPairs: one.agentPairs })
      read.set(one.id, lists)
    }
    const registered = messages.everybodyRegistered().length
    for (const one of cases) {
      const lists = read.get(one.id)!
      if (one.reads === 'every name') {
        expect(lists.everyName, `the statements over every name, for ${one.what}`).toBe(2)
        expect(lists.registryRows, `the rows of names read for ${one.what}`).toBe(registered)
      } else {
        expect(lists.everyName, `the statements over every name, for ${one.what}`).toBe(0)
        // AT MOST THE LIVE AND THE RETIRED HERON: the rows whose id or handle is the stored id.
        expect(lists.registryRows, `the rows of names read for ${one.what}`).toBeLessThanOrEqual(one.reads === 'none' ? 0 : 2)
      }
    }
  })

})

