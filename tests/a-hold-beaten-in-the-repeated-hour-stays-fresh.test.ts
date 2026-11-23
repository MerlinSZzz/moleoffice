// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOLD BEATEN IN THE REPEATED HOUR STAYS FRESH.
 *
 * On 25 October 2026 the clocks in Europe/London go back an hour at 02:00 summer time, so the hour from 01:00 comes
 * twice: first in summer time (00:00 to 01:00 UTC), then in winter time (01:00 to 02:00 UTC). On 28 March 2027 they go
 * forward an hour at 01:00, so the hour from 01:00 to 02:00 never comes.
 *
 * A hold says when its session last said it was there as a local stamp with no offset (`last_heard_at`), and the words
 * cannot say which pass of the repeated hour they mean. The reader took the first pass. So a hold beaten at 01:10 winter
 * time read, a minute later, as an hour and a minute quiet: past the grace window, lapsed, released by the next reader,
 * and every later beat of its waiter refused. The hold now keeps the moment of the same clock reading beside its stamp
 * (`last_heard_instant`). That moment only says which pass of the hour its stamp means, so the reader reads it only when
 * it names the stamp beside it: its first 19 characters are the stamp, with T for the space. A stamp changed without its
 * moment is read from its words, as before.
 *
 * WHAT IS PROVED, against a throwaway database, with this process's zone set to Europe/London and its clock set here.
 * Every hold below is claimed and beaten through the hold doors, except the rows cases 3, 4 and 5 write, which say why.
 *
 *   1. A hold claimed at 01:09 winter time on 25 October and beaten at 01:10 winter time is taken at the beat, and is
 *      fresh and sixty seconds quiet at 01:11 winter time.
 *   2. On 28 March 2027, a hold beaten at 00:30 winter time is an hour quiet at 02:30 summer time, not two, and a hold
 *      beaten at 02:30 summer time is fresh a minute later.
 *   3. Control: a row written before a hold kept its moment, with the stamp 01:10 and no moment, is read from its words
 *      as before. At 01:11 winter time it is 3,660 seconds quiet, and lapsed.
 *   4. A moment that names its stamp and cannot be read, with the offset +25:00, answers past every window, as a stamp
 *      that cannot be read does.
 *   5. A stamp changed alone is read from its words, as before. A hold claimed at noon on 2 November 2026, with its
 *      stamp then set to 11:00, is 3,660 seconds quiet at 12:01, and lapsed.
 *
 * Without the code, cases 1 and 4 are red: the beat in case 1 is refused, because the claim's stamp reads as more than
 * an hour old, and case 4's moment has no column to be written to. Cases 2, 3 and 5 are green. A reader that reads the
 * moment whenever it is there, without asking whether it names its stamp, turns case 5 red: it reads the hold as sixty
 * seconds quiet and fresh.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type Handles = typeof import('../src/server/lib/handles.ts')

const MINUTE = 60_000

/** 01:09 winter time, 25 October 2026, in the second pass of the repeated hour. */
const SECOND_PASS_AT_NINE_PAST = Date.UTC(2026, 9, 25, 1, 9, 0)
/** 01:10 winter time, a minute later. */
const SECOND_PASS_AT_TEN_PAST = Date.UTC(2026, 9, 25, 1, 10, 0)
/** 00:30 winter time, 28 March 2027, half an hour before the skipped hour. */
const BEFORE_THE_SKIP = Date.UTC(2027, 2, 28, 0, 30, 0)
/** 02:30 summer time, 28 March 2027, half an hour after the skipped hour, and an hour after the one above. */
const AFTER_THE_SKIP = Date.UTC(2027, 2, 28, 1, 30, 0)
/** Noon, 2 November 2026, in winter time and far from either change of the clocks. */
const NOON_IN_NOVEMBER = Date.UTC(2026, 10, 2, 12, 0, 0)

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let handles: Handles
let theZoneBefore: string | undefined

beforeAll(async () => {
  theZoneBefore = process.env.TZ
  process.env.TZ = 'Europe/London'
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  handles = await import('../src/server/lib/handles.ts')
}, 60_000)

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await app?.close()
  t?.close()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

/** An agent registered through the door, a running session for it, and the headers its own key sends. */
async function anAgentWithASession(handle: string): Promise<{ agentId: string; session: string; headers: Record<string, string> }> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role: 'worker' } })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const agentId = agentByHandle(handle)!.id
  const session = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: `A made-up session of ${handle}`, data: { state: 'running', runtime: 'codex' }, actor: t.api.HUMAN }).id
  const headers = {
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': makeAnAgentKey(agentId, null),
  }
  return { agentId, session, headers }
}

/** Claim the handle through the hold door, on the clock as it is set. */
async function claim(handle: string, session: string, headers: Record<string, string>): Promise<void> {
  const held = await app.inject({ method: 'POST', url: `/api/handles/${handle}/hold`, headers, payload: { session, runtime: 'codex', machine: 'made-up-machine' } })
  expect(held.statusCode, held.body.slice(0, 300)).toBe(201)
}

/** Beat the hold through the beat door, on the clock as it is set. */
async function beat(handle: string, session: string, headers: Record<string, string>): Promise<{ statusCode: number; body: string }> {
  return app.inject({ method: 'POST', url: `/api/handles/${handle}/beat`, headers, payload: { session } })
}

describe('a hold beaten in the repeated hour stays fresh', () => {
  it('1. a hold beaten at 01:10 winter time is fresh and a minute quiet at 01:11', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_NINE_PAST })
    const handle = 'a-hold-in-the-second-pass'
    const { agentId, session, headers } = await anAgentWithASession(handle)
    await claim(handle, session, headers)
    vi.setSystemTime(SECOND_PASS_AT_TEN_PAST)
    const beaten = await beat(handle, session, headers)
    expect(beaten.statusCode, beaten.body.slice(0, 300)).toBe(200)
    expect(handles.theNewestHoldOn(agentId, SECOND_PASS_AT_TEN_PAST + MINUTE)).toMatchObject({ quietFor: 60, state: 'fresh' })
  })

  it('2. on the night the clocks go forward, a hold is an hour quiet across the skipped hour, and one beaten after it is fresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BEFORE_THE_SKIP })
    const before = 'a-hold-before-the-skip'
    const early = await anAgentWithASession(before)
    await claim(before, early.session, early.headers)
    expect(handles.theNewestHoldOn(early.agentId, AFTER_THE_SKIP)).toMatchObject({ quietFor: 3_600, state: 'lapsed' })

    vi.setSystemTime(AFTER_THE_SKIP)
    const after = 'a-hold-after-the-skip'
    const late = await anAgentWithASession(after)
    await claim(after, late.session, late.headers)
    expect(handles.theNewestHoldOn(late.agentId, AFTER_THE_SKIP + MINUTE)).toMatchObject({ quietFor: 60, state: 'fresh' })
  })

  it('3. control: a row with no moment is read from its words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const { agentId, session } = await anAgentWithASession('a-hold-written-before-its-moment')
    // WRITTEN BY HAND, AS A ROW WRITTEN BEFORE A HOLD KEPT ITS MOMENT: the columns that existed then, and nothing else.
    // No door writes a row without its moment now.
    t.client.sqlite
      .prepare(
        "INSERT INTO handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at) VALUES ('a-made-up-old-hold', ?, ?, 'made-up-machine', 'codex', '2026-10-25 01:10:00', '2026-10-25 01:10:00')",
      )
      .run(agentId, session)
    // Its words read as the first pass, 00:10 UTC, so at 01:11 winter time it is an hour and a minute quiet.
    expect(handles.theNewestHoldOn(agentId, SECOND_PASS_AT_TEN_PAST + MINUTE)).toMatchObject({ quietFor: 3_660, state: 'lapsed' })
  })

  it('4. a moment that cannot be read answers past every window', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SECOND_PASS_AT_TEN_PAST })
    const handle = 'a-hold-with-an-unreadable-moment'
    const { agentId, session, headers } = await anAgentWithASession(handle)
    await claim(handle, session, headers)
    // WRITTEN BY HAND, BECAUSE NO DOOR WRITES A MOMENT THAT CANNOT BE READ: the door's own row, with its moment spoiled.
    // Its date and time are kept, so it still names its stamp, and its offset is one no clock has.
    t.client.sqlite.prepare("UPDATE handle_holds SET last_heard_instant = substr(last_heard_instant, 1, 23) || '+25:00' WHERE agent_id = ?").run(agentId)
    const spoiled = t.client.sqlite.prepare('SELECT last_heard_instant FROM handle_holds WHERE agent_id = ?').get(agentId) as { last_heard_instant: string }
    expect(spoiled.last_heard_instant).toBe('2026-10-25T01:10:00.000+25:00')
    const { handleGraceSeconds } = await import('../src/server/lib/env.ts')
    expect(handles.theNewestHoldOn(agentId, SECOND_PASS_AT_TEN_PAST + 30_000)).toMatchObject({ quietFor: handleGraceSeconds() + 1, state: 'lapsed' })
  })

  it('5. a stamp changed alone is read from its words, as before', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOON_IN_NOVEMBER })
    const handle = 'a-hold-with-its-stamp-changed-alone'
    const { agentId, session, headers } = await anAgentWithASession(handle)
    await claim(handle, session, headers)
    // WRITTEN BY HAND, AS A TEST OR A WRITER THAT KNOWS ONLY THE STAMP AGES A HOLD: the door's own row, with its stamp set
    // an hour back and its moment left as the door wrote it. The hold doors never change the stamp alone.
    t.client.sqlite.prepare("UPDATE handle_holds SET last_heard_at = '2026-11-02 11:00:00' WHERE agent_id = ?").run(agentId)
    // The moment names noon, not 11:00, so it is passed over, and the stamp says an hour and a minute quiet at 12:01.
    expect(handles.theNewestHoldOn(agentId, NOON_IN_NOVEMBER + MINUTE)).toMatchObject({ quietFor: 3_660, state: 'lapsed' })
  })
})
