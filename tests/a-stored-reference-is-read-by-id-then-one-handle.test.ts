// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STORED AGENT REFERENCE IS READ BY EXACT ID, THEN THE ONE HANDLE, AND NOBODY WHERE TWO ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE MEASURES — criterion I2, the amendment of 16 September 22:10
 * ---------------------------------------------------------------------------------------
 *
 * A STORED reference was written earlier and is read back now: a session's `servingAgent`, a dead
 * letter's addressee, a claim row's claimant, a `startedBy` link. It is NEVER resolved by the
 * arriving-reference resolver, which raises a 409 when a string means two agents. It is read by
 * exact id first, which settles it alone because an id is never reused; failing that, the one agent
 * bearing the string as a handle, live or retired; and no agent where more than one answers, so a
 * reading stays readable rather than breaking the page it is on.
 *
 * The five files this wave changed — messages.ts, superiors.ts, delegation.ts, claims.ts and a
 * comment in inbox.ts — each read stored references this way. This file proves the reading on the
 * two surfaces a test can see directly, and on the two doors that resolve an ARRIVING name.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, WITH THE MUTATION THAT TURNS EACH RED
 * ---------------------------------------------------------------------------------------
 *
 *   A. messages.ts, through `theAgentASessionAnswersAs`:
 *      · a legacy handle-shaped id still resolves;
 *      · a stored minted id resolves;
 *      · a stored plain handle (not an id) resolves through the handle step;
 *      · a legacy id settles alone even when a successor agent now bears that string as its handle;
 *      · a string two agents bear as a handle resolves to NO agent and the reading does not throw.
 *      MUTATION ONE: in `theAgentAStoredReferenceNames` in messages.ts, replace the body with a
 *      handle-only lookup over `listParticipants().agents`. The minted-id case (no row bears the id
 *      as a handle), the legacy-id case (follows the successor) and the two-handle case (picks one)
 *      all go red.
 *      MUTATION TWO: replace the body with `readParticipant({ kind: 'agent', id: stored })`. The
 *      stored plain-handle case goes red, because a handle is not an id.
 *
 *   B. superiors.ts, through the message door (a message to a retired addressee):
 *      · a retired addressee whose recorded starter and owner is a stored MINTED ID is handed to that agent;
 *      · a retired addressee whose recorded starter and owner is a stored HANDLE is handed to that agent;
 *      · a retired addressee whose recorded starter and owner is a name TWO agents bear resolves to no
 *        agent, and the line says the ownership chain cannot continue from the addressee. The entry
 *        carries `to: null` and no copy is made.
 *      The starter in the first two cases is made REACHABLE — a running session record serving it
 *      plus a live child process registered as its resource — because a decision walks
 *      the chain and only hands the letter to somebody who can be reached. The reply names the
 *      chosen participant under `routed`.
 *      MUTATION THREE: in the stored reader `theChainUpFrom` uses, read each rung by exact id only —
 *      `byId.get(at.id)` with no handle step. The stored-handle case goes red, because the chain
 *      stops at a name no agent answers and the letter falls to the owner.
 *      MUTATION FOUR: make the chain resolve a name two agents bear to the first of them. The
 *      two-agent case goes red, because the letter goes to one of them instead of the owner.
 *
 *   C. the claim door (POST /api/claims):
 *      · an ARRIVING name that is one agent's id and another live agent's handle is refused 409,
 *        naming both agents — the ambiguity is refused rather than guessed at;
 *      · the door reads the claimant it resolved by id, so a minted-id agent with no registered work
 *        area is refused 403 instead of quietly allowed to claim.
 *      MUTATION FIVE: disable the step-5 throw in `theAgentAnArrivingReferenceNames` and the first
 *      case goes red (the name resolves to the id-holder).
 *      MUTATION SIX: make the row in `fileAClaim` null and the second case goes red (a null row skips
 *      the work-area rule).
 *
 * THE THREE-RUN PROOF for this file: control green, each mutation red, restore green again.
 *
 * THE AGENTS are built by writing the `agents` row directly, the way
 * tests/a-stored-stamp-is-never-resolved-by-the-arriving-resolver.test.ts does. That includes the
 * legacy agent whose id is its handle: the registration door now mints an id, so it can no longer
 * make one. The collisions are written under the real index, which covers live rows only since
 * migration 0174 (piece I-2, criterion I3).
 */

import type { FastifyInstance } from 'fastify'
import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let messages: typeof import('../src/server/lib/messages.ts')
/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []

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

/**
 * A legacy agent whose id IS its handle. The door mints a new id now, so this row is written
 * straight in, as the rows written before the mint are.
 */
const LEGACY_REGISTERED = 'legacy-registered'

/** A legacy agent whose id is its old name, and the agent that took that name after it retired. */
const LEGACY_RETIRED = { id: 'relay', handle: 'relay-the-first', name: 'Relay The First', retired: true }
const SUCCESSOR = { id: 'Cy3pL8kJ4mNv', handle: 'relay', name: 'Relay The Second' }

/** A minted agent: its id is a nanoid and its handle is a different string. */
const MINTED = { id: 'M1nTed1d0001', handle: 'minted-handle', name: 'Minted One' }

/**
 * TWO AGENTS, ONE HANDLE, which is the shape piece I-2 allows: the handle is unique among LIVE
 * agents, so a retired row and a live one may share it. Neither has it as an id.
 */
const SHARED_LIVE = { id: 'Tw0AgentsA001', handle: 'shared-name', name: 'Shared Live' }
const SHARED_RETIRED = { id: 'Tw0AgentsB002', handle: 'shared-name', name: 'Shared Retired', retired: true }

/** ONE STRING THAT IS ONE AGENT'S ID AND ANOTHER LIVE AGENT'S HANDLE. */
const AMBIGUOUS_ID = { id: 'sharedname', handle: 'its-own-handle', name: 'Legacy Shared Name' }
const AMBIGUOUS_HANDLE = { id: 'M1ntAmb1g0001', handle: 'sharedname', name: 'New Shared Name' }

/** The retired addressees the dead-letter door reads. Each names a different stored starter. */
const RETIRED_BY_MINTED_ID = 'RetiredOne001'
const RETIRED_BY_HANDLE = 'RetiredTwo002'
const RETIRED_BY_TWO_NAMES = 'RetiredThree3'

function insertAgent(who: {
  id: string
  handle: string
  name: string
  retired?: boolean
  startedBy?: { kind: string; id: string }
}): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${who.id}`, '2026-09-16 10:00:00')
  // THE OWNER BESIDE THE STARTER. Since the owner package a letter follows the recorded owner, and the office records an
  // agent's starter as its owner, so this row holds both, as a real office holds them.
  t.client.sqlite
    .prepare(
      'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id, ' +
        'owner_kind, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      who.id,
      who.name,
      who.handle,
      `avatar-default-agent-${who.id}`,
      who.retired === true ? 1 : 0,
      '2026-09-16 10:00:00',
      who.startedBy?.kind ?? null,
      who.startedBy?.id ?? null,
      who.startedBy?.kind ?? null,
      who.startedBy?.id ?? null,
    )
}

/** What one session answers as, when its `servingAgent` is the stored string under test. */
function answersAs(servingAgent: string): ReturnType<typeof messages.theAgentASessionAnswersAs> {
  return messages.theAgentASessionAnswersAs(
    { id: `session-${servingAgent}`, data: { servingAgent }, workspaceId: WORKSPACE },
    WORKSPACE,
  )
}

/** A person's send over the one door every message arrives at. */
async function sendAsThePerson(to: string, body: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The superior a dead letter was handed to, off the send's own reply. */
function givenTo(said: Record<string, unknown>): { kind: string; id: string } | null {
  const notes = said['routed'] as { to: { kind: string; id: string } | null }[] | undefined
  return notes?.[0]?.to ?? null
}

/**
 * A RUNNING SESSION THAT ANSWERS AS ONE AGENT, plus a real child registered as its process.
 *
 * A starter is reachable only when something is answering as it, which is
 * a running session record and a live process resource. Without one the routing skips the starter
 * and the letter goes further up the chain, so these fixtures are what keep section B measuring the
 * stored reader rather than the reach reading.
 */
function aSessionFor(agentId: string): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: agentId },
    actor: t.api.HUMAN,
  }).id
}

async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({
    workspaceId: WORKSPACE,
    sessionRecordId,
    type: 'process',
    key: String(child.pid),
    actor: t.api.HUMAN,
  })
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  messages = await import('../src/server/lib/messages.ts')

  // 1. A LEGACY HANDLE-SHAPED ID, written straight in. The registration door mints an id now, so it
  //    cannot make an agent whose id is its handle.
  insertAgent({ id: LEGACY_REGISTERED, handle: LEGACY_REGISTERED, name: 'Legacy Registered' })

  // 2. THE OTHER ROWS, written straight in: a minted id, the freed-name pair, the two agents under
  //    one handle, and the id-versus-handle collision. The unique index on `handle` covers live rows
  //    only since migration 0174 (criterion I3), so a retired row and a live one may share a handle
  //    under the real index and nothing is dropped.
  insertAgent(MINTED)
  insertAgent(LEGACY_RETIRED)
  insertAgent(SUCCESSOR)
  insertAgent(SHARED_LIVE)
  insertAgent(SHARED_RETIRED)
  insertAgent(AMBIGUOUS_ID)
  insertAgent(AMBIGUOUS_HANDLE)

  // The retired addressees the dead-letter door reads. Each names a different stored starter: an
  // exact minted id, a stored handle, and a name two agents bear.
  insertAgent({
    id: RETIRED_BY_MINTED_ID,
    handle: 'retired-one',
    name: 'Retired One',
    retired: true,
    startedBy: { kind: 'agent', id: MINTED.id },
  })
  insertAgent({
    id: RETIRED_BY_HANDLE,
    handle: 'retired-two',
    name: 'Retired Two',
    retired: true,
    startedBy: { kind: 'agent', id: MINTED.handle },
  })
  insertAgent({
    id: RETIRED_BY_TWO_NAMES,
    handle: 'retired-three',
    name: 'Retired Three',
    retired: true,
    startedBy: { kind: 'agent', id: SHARED_LIVE.handle },
  })

  // THE STARTER THE FIRST TWO CASES READ MUST BE REACHABLE, or the routing would skip it and hand
  // the letter to the owner. A reachable agent is one something is answering
  // as, which is a running session record and a live process registered against it.
  await aLiveProcessFor(aSessionFor(MINTED.id))
})

afterAll(() => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  app.close()
  t.close()
})

// ============================================================ A. the stored reader in messages.ts

describe('a stored reference in a session’s servingAgent is read by id, then the one handle', () => {
  it('follows a legacy handle-shaped id, which is the agent’s exact id', () => {
    const got = answersAs(LEGACY_REGISTERED)
    expect(got?.agent).toEqual({ kind: 'agent', id: LEGACY_REGISTERED })
  })

  it('follows a stored minted id, which no handle could have found', () => {
    const got = answersAs(MINTED.id)
    expect(got?.agent, 'a minted id is an exact id and must resolve').toEqual({ kind: 'agent', id: MINTED.id })
  })

  it('follows a stored plain handle through the handle step', () => {
    const got = answersAs(MINTED.handle)
    expect(got?.agent, 'a stored handle is not an id and must resolve through the one handle').toEqual({
      kind: 'agent',
      id: MINTED.id,
    })
  })

  it('lets the legacy id settle it alone even when a successor now bears the name as a handle', () => {
    const got = answersAs(LEGACY_RETIRED.id)
    expect(got?.agent, 'the stored id names the agent that wrote it, not whoever took its name').toEqual({
      kind: 'agent',
      id: LEGACY_RETIRED.id,
    })
  })

  it('resolves a name two agents bear to no agent, and the reading stays readable', () => {
    expect(() => answersAs(SHARED_LIVE.handle)).not.toThrow()
    expect(answersAs(SHARED_LIVE.handle), 'two agents answer, so nobody does').toBeNull()
  })
})

// ============================================================ B. the stored reader through the door

describe('a dead letter reads its addressee’s stored starter the same way', () => {
  it('hands the words to the starter named by a stored minted id', async () => {
    const { code, said } = await sendAsThePerson(RETIRED_BY_MINTED_ID, 'A note for the first done worker')
    expect(code, JSON.stringify(said)).toBe(409)
    expect(givenTo(said)).toEqual({ kind: 'agent', id: MINTED.id })
  })

  it('hands the words to the starter named by a stored handle', async () => {
    const { code, said } = await sendAsThePerson(RETIRED_BY_HANDLE, 'A note for the second done worker')
    expect(code, JSON.stringify(said)).toBe(409)
    expect(givenTo(said)).toEqual({ kind: 'agent', id: MINTED.id })
  })

  it('resolves a starter’s name two agents bear to no agent, so no copy is made', async () => {
    const { code, said } = await sendAsThePerson(RETIRED_BY_TWO_NAMES, 'A note for the third done worker')
    expect(code, JSON.stringify(said)).toBe(409)
    // THE WALK STOPS AT A NAME NO SINGLE AGENT ANSWERS TO. Since the owner package that is an ownership chain that
    // cannot continue from the addressee, so no copy is made and the entry carries `to: null`.
    expect(givenTo(said), 'a name two agents answer is no agent, so no copy goes to a guessed one').toBeNull()
    // AND THE LINE SAYS SO. A letter to an agent with no recorded owner carries no copy either, so the
    // two are told apart by the ending and its sentence and not by the destination alone. Mutation four resolves the
    // shared name to the first agent, and these assertions go red.
    const { theRoutedLine, BROKEN_OWNERS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    const notes = said['routed'] as { line: string; said?: Parameters<typeof theRoutedLine>[0] }[]
    expect(notes[0]!.said?.ending).toEqual({ how: BROKEN_OWNERS_ROUTING_ENDING, stoppedAt: 'Retired Three' })
    expect(notes[0]!.line).toBe(theRoutedLine(notes[0]!.said!))
  })
})

// ============================================================ C. the claim door

describe('the claim door resolves the caller now and refuses an ambiguous name', () => {
  it('refuses an arriving name that is one agent’s id and another live agent’s handle, with 409', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent(AMBIGUOUS_ID.id),
      payload: { run: 'a-run', things: [{ what: 'record', id: 'a-record' }] },
    })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body, 'the refusal names both agents').toContain(AMBIGUOUS_ID.name)
    expect(reply.body).toContain(AMBIGUOUS_HANDLE.name)
  })

  it('reads the claimant it resolved by id, so a minted-id agent with no work area is refused 403', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent(MINTED.id),
      payload: { run: 'a-run', things: [{ what: 'record', id: 'a-record' }] },
    })
    expect(reply.statusCode, reply.body).toBe(403)
    expect(reply.body).toContain('work area')
  })
})
