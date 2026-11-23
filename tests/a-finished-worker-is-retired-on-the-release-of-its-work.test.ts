// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISHED WORKER IS RETIRED WHEN ITS WORK IS RELEASED — criterion M109, THE TEST ONLY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS FOUND BEFORE ANYTHING WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M109 of design/messages/ACCEPTANCE.md section "The retire rule and dead letters": a worker
 * that has finished retires at once when no related work follows, or stays online with a heartbeat
 * when more is to come, rather than its run merely ending with nobody to wake it.
 *
 * MEASURED BEFORE THIS FILE WAS STARTED: the retire half of M109 is already built. When a claim is
 * released, `releaseAClaim` in src/server/lib/claims.ts walks the records the claim named and calls
 * `retireWhateverWasStartedFor` (claims.ts, "RETIRE EVERY AGENT WHOSE ROLE ENDED WHEN THIS PIECE OF
 * WORK WAS RELEASED", criterion P15), which retires every active agent whose record says
 * `startedFor` names that record, with the reason and the date on its record. An agent that named no
 * work is never touched: `startedFor` absent means nobody said, and retiring on an empty field would
 * end a role on no evidence. The half of M109 about staying online — a worker with work left keeps
 * its handle and beats — is the hold and the beat, criterion M79, proved by
 * tests/a-run-holds-the-handle-while-it-answers.test.ts.
 *
 * SO THIS FILE ADDS THE TEST AND NO PRODUCTION CODE. "This was already built and here is the test
 * that proves it" is a real result. Nothing here was written to make the criterion feel bigger.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DECIDED AND BINDING, AND THEREFORE NOT TESTED HERE
 * ---------------------------------------------------------------------------------------
 *
 * M109 LISTS, AND NEVER RETIRES ON THE PRESENCE READING. No test here asserts that an agent which
 * is "offline and not retired" is retired, swept or acted on, because that is not the rule and must
 * not become one. Measured on the live office on 11 September 2026: 61 agents read offline and not
 * retired, and three of them were working perfectly well — the supervisors of the three clusters and
 * every worker of this cluster, including the one writing this. Presence is true only for an agent
 * that runs a waiter; an agent started as a subagent holds no handle and reads offline. A rule that
 * retired on that reading would have retired this worker mid-task. The office's third presence word,
 * `inactive` (registered, no run recorded), is shown under offline and changes nothing here either.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 3 cases, all green. Then, in src/server/lib/claims.ts, the call
 * `retireWhateverWasStartedFor(thing.id, workspaceId)` inside `releaseAClaim` was commented out, so
 * a release ends a claim and retires nobody — which is the state M109's first sentence exists to
 * end (the run merely ended, with nobody to wake it).
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × is retired, with the reason, when the work it was started for is released
 *   × and the registry row carries the retirement with it
 *
 * The change was put back and the control run again: 3 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 *
 * ---------------------------------------------------------------------------------------
 * WHO RELEASES THE WORK
 * ---------------------------------------------------------------------------------------
 *
 * A release asks the card's retire rule for each agent started for the work, with the releaser as
 * the one retiring, and a worker may not retire itself or a worker it did not start. So in each
 * case the claim is filed and released by the agent that started the worker.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type ClaimsLib = typeof import('../src/server/lib/claims.ts')
type RecordsLib = typeof import('../src/server/lib/records.ts')
type ParticipantsLib = typeof import('../src/server/lib/participants.ts')

let t: TestDb
let work: ClaimsLib
let records: RecordsLib
let people: ParticipantsLib
/** Each case registers its own workers, so the handles are its own. */
let caseNumber = 0
const handleFor = (which: 'a' | 'b' | 's'): string => `worker-${which}-${String(caseNumber)}`

const HUMAN = { type: 'human', id: THE_PERSON } as const

/**
 * An agent as the claim library takes it: by its registry id. The registry gives a new agent an id
 * of its own, which is not its handle, so the id is read from the registry after the agent is made.
 * `a` is the worker agent; `b` is another agent, for the release that ends a claim it did not
 * start; `s` is the agent that started the workers and releases their work. Each case gives its
 * workers handles of its own, so a shared office registers no handle twice.
 */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as
    | { id: string }
    | undefined
  if (row === undefined) throw new Error(`nothing is registered as the agent ${handle}`)
  return row.id
}
function asParticipant(handle: string) {
  return { kind: 'agent', id: idOf(handle) } as const
}
function asActor(handle: string) {
  return { type: 'agent', id: idOf(handle) } as const
}

/** What the agent's own record says, which is where retirement is written. */
function theAgentRecord(recordId: string): Record<string, unknown> {
  const read = records.getRecord(recordId)
  if (read === null) throw new Error(`the agent record ${recordId} is gone`)
  return read.data as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  // A release asks the card's retire rule, and that rule reads the role cards.
  const roles = await import('../src/server/lib/roles.ts')
  roles.readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  work = await import('../src/server/lib/claims.ts')
  records = await import('../src/server/lib/records.ts')
  people = await import('../src/server/lib/participants.ts')
}, 60_000)

beforeEach(() => {
  caseNumber += 1
})

afterAll(() => {
  t.close()
})

/**
 * One agent registered as a durable agent, with `startedFor` only when it was started for the work,
 * and `startedBy` only when another agent started it.
 */
function registerAnAgent(handle: string, startedFor: string | null, startedBy?: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: {
      handle,
      runtime: 'claude-code',
      state: 'active',
      workArea: ['src'],
      ...(startedFor === null ? {} : { startedFor }),
      ...(startedBy === undefined ? {} : { startedBy: asParticipant(startedBy) }),
    },
    actor: HUMAN,
  }).id
}

/** A run for an agent to claim under, and a piece of work for the claim to name. */
function aRun(handle: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `${handle} answering a message`,
    data: { state: 'running', runtime: 'claude-code' },
    actor: asActor(handle),
  }).id
}

describe('the retire rule, M109', () => {
  it('is retired, with the reason, when the work it was started for is released', () => {
    const a = handleFor('a')
    const s = handleFor('s')
    const workId = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'The gripper module',
      data: {},
      actor: HUMAN,
    }).id
    registerAnAgent(s, null)
    const agentRecord = registerAnAgent(a, workId, s)
    const run = aRun(s)

    const WORKER = asParticipant(a)
    const STARTER = asParticipant(s)
    const filed = work.fileAClaim(
      { workspaceId: 'default', claimant: STARTER, run, things: [{ what: 'record', id: workId }] },
      asActor(s),
    )
    // AND NOT BEFORE. A worker with work left is not retired by anything: the finish that ends the
    // role is somebody releasing the work, never the agent's own word that it is done.
    expect(theAgentRecord(agentRecord)['state']).toBe('active')
    expect(people.agentsStartedFor(workId).map((one) => one.handle)).toEqual([a])

    work.releaseAClaim(filed.claim.id, 'default', STARTER, 'the task is done and checked')

    const said = theAgentRecord(agentRecord)
    expect(said['state']).toBe('retired')
    expect(String(said['retiredBecause'])).toContain('The task it was started for was released')
    expect(String(said['retiredBecause'])).toContain('The gripper module')
    // AND THE REGISTRY ROW CARRIES THE RETIREMENT WITH IT, so a reader of the contact list sees a
    // retired agent and not an active one nobody answers.
    const row = people.readParticipant(WORKER)
    expect(row !== null && 'retired' in row && row.retired).toBe(true)
    // AND IT IS NOT SWEPT BACK IN: an already-retired agent is left out of every later reading.
    expect(people.agentsStartedFor(workId)).toEqual([])
  })

  it('an agent that named no work is never touched by the release', () => {
    const a = handleFor('a')
    const b = handleFor('b')
    const workId = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'The other module',
      data: {},
      actor: HUMAN,
    }).id
    // THIS ONE WAS STARTED FOR NOTHING IN PARTICULAR. Its card has no end written on it, so a
    // release ends nothing of its.
    const freeAgent = registerAnAgent(b, null)
    // B STARTED THIS ONE, so b's release may retire it.
    const startedOne = registerAnAgent(a, workId, b)
    const run = aRun(b)
    const SECOND = asParticipant(b)
    const filed = work.fileAClaim(
      { workspaceId: 'default', claimant: SECOND, run, things: [{ what: 'record', id: workId }] },
      asActor(b),
    )
    work.releaseAClaim(filed.claim.id, 'default', SECOND, 'done')

    expect(theAgentRecord(freeAgent)['state']).toBe('active')
    // AND THE ONE THAT WAS STARTED FOR IT IS GONE, which is the contrast this case exists for.
    expect(theAgentRecord(startedOne)['state']).toBe('retired')
  })

  it('a release retires nobody the claim did not name, and names only its own records', () => {
    const a = handleFor('a')
    const b = handleFor('b')
    const mine = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'The claimed module',
      data: {},
      actor: HUMAN,
    }).id
    const other = t.api.createRecord({
      workspaceId: 'default',
      kind: 'module',
      title: 'The unclaimed module',
      data: {},
      actor: HUMAN,
    }).id
    const s = handleFor('s')
    registerAnAgent(s, null)
    const onMine = registerAnAgent(a, mine, s)
    const onOther = registerAnAgent(b, other, s)
    const run = aRun(s)
    const STARTER = asParticipant(s)
    const filed = work.fileAClaim(
      { workspaceId: 'default', claimant: STARTER, run, things: [{ what: 'record', id: mine }] },
      asActor(s),
    )
    work.releaseAClaim(filed.claim.id, 'default', STARTER, 'done')

    expect(theAgentRecord(onMine)['state']).toBe('retired')
    // THE RELEASE ONLY NAMED ONE RECORD, so the agent started for the other one stays.
    expect(theAgentRecord(onOther)['state']).toBe('active')
  })
})
