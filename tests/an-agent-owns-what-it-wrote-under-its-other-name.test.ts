// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT OWNS WHAT IT WROTE, WHATEVER NAME IT WROTE UNDER — AND NOBODY INHERITS IT BY TAKING ITS NAME.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO BREAKAGES THIS FILE HOLDS SHUT, AND BOTH OF THEM ARE SILENT
 * ---------------------------------------------------------------------------------------
 *
 * Five guards in src/server/lib/records.ts decide whether the agent asking is the agent that wrote
 * something. Until piece I-3b they compared two strings with `===`, which worked only because every
 * agent's id was its own handle. Criterion I2 ends that, and it breaks in two directions:
 *
 *   AN AGENT LOSES ITS OWN PAST. It wrote under its handle `wanderer`; it comes back under its
 *   minted id; `===` says no; it can no longer withdraw its own ask or reclassify its own fork. The
 *   refusal reads exactly like an ordinary permission refusal, so nobody looks.
 *
 *   AN AGENT INHERITS SOMEBODY ELSE'S PAST. After piece I-2 frees a handle, a new agent registers
 *   under a retired agent's name and sends that name as `x-mole-office-actor-id`. The string is
 *   exactly the retired agent's legacy id — the string stored on everything it ever wrote — so
 *   `===` says yes. Report `_0kw_md4ZMAP` is why I-3b lands before I-2 and not after.
 *
 * `sameAgent` in src/server/lib/records.ts is the one reader all five guards now call, and this file
 * drives all five through the doors a caller actually has.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ROWS ARE WRITTEN STRAIGHT AT THE TABLE, AND WHY THE INDEX IS DROPPED
 * ---------------------------------------------------------------------------------------
 *
 * THE DOOR MINTS AN ID NOW, so it could make an agent whose id is not its handle. But the door picks
 * the id, and the cases below need ids known in advance. And `ember` must be a legacy agent whose id
 * IS its handle, which the door no longer makes. So these rows are inserted here.
 * tests/an-agent-whose-id-is-not-its-handle-writes-under-its-name.test.ts does the same and this
 * follows it. The ladder of starters is the exception: it is registered at the door, and the id the
 * door minted for `beacon` is read from the registry.
 *
 * AND A HANDLE IS UNIQUE AMONG LIVE ROWS ONLY since migration 0174 (piece I-2, criterion I3), so the
 * one block that needs two agents under one name retires the first before the second is written,
 * under the real index. Nothing is waited for and nothing is guessed: the collision is built.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `sameAgent` in src/server/lib/records.ts back to the comparison it replaced — return
 *     `stored.actorType === actor.type && stored.actorId.trim() === actor.id.trim()` — and every
 *     block below goes red: the five guards refuse the agent its own past, the new agent walks off
 *     with the retired one's fork and ask, the two-agent stamp picks one, and the annotation refusal
 *     prints a nanoid at a reader.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
/** The registry id the door minted for `beacon`, read from the registry. */
let beaconId = ''

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

// ============================================================ who is in this world

/**
 * THE AGENT THIS PIECE EXISTS FOR: a minted-shaped id and a name that is not it. It writes under its
 * name, the way every agent alive at the landing goes on doing (criterion I9), and comes back under
 * its id.
 */
const WANDERER = { id: 'Wm4kP9xQ2bTz', handle: 'wanderer', name: 'Wanderer' }

/** Somebody else, so that a guard which let everybody through would be caught. */
const BYSTANDER = { id: 'Ot7bV3nM5cKq', handle: 'bystander', name: 'Bystander' }

/**
 * THE COLLISION PIECE I-2 MAKES POSSIBLE. `ember` registered before the mint, so its id IS the string
 * `ember`; it wrote; it retired and its name was freed; a new agent took the name and was given an id
 * of its own. Everything `ember` ever wrote is stamped `ember`.
 */
const EMBER_THEN = { id: 'ember', handle: 'ember', name: 'Ember' }
const EMBER_NOW = { id: 'Nv4hT8kWq2Zb', handle: 'ember', name: 'Ember Two' }

/** TWO AGENTS UNDER ONE NAME, which needs the handle index gone. Neither has `twin` as an id. */
const TWIN_ONE = { id: 'Tw1rE5tY8uIo', handle: 'twin', name: 'Twin One' }
const TWIN_TWO = { id: 'Zb9cD4eF7gHi', handle: 'twin', name: 'Twin Two' }

/**
 * A WRITER NO REGISTRY ROW HOLDS, AND IT IS ONE OF THE DECLARED ONES BY NAME.
 *
 * `AGENT_IDS_THAT_NEED_NO_REGISTRATION` in src/server/lib/records.ts names the writers that are
 * pieces of the office rather than agents anybody registers. This is the message worker, and it is
 * used here rather than an invented name so the test says WHY the last resort in `sameAgent` exists:
 * without it the worker could put a question on the person's queue and never withdraw it.
 */
const THE_WORKER = 'mole-office/the-message-worker'

/** A second writer the office cannot place either, so that the last resort is not a blanket yes. */
const THE_DEV_SUPERVISOR = 'mole-office/the-dev-supervisor'

// ============================================================ the small tools this file writes with

/** Write an agent row straight at the table, with the picture row its foreign key needs. */
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

/** Retire one, and optionally free its name the way piece I-2 will. */
function retire(id: string, newHandle?: string): void {
  t.client.sqlite
    .prepare('UPDATE agents SET retired = 1, retired_at = ? WHERE id = ?')
    .run('2026-09-12 09:00:00', id)
  if (newHandle !== undefined) t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run(newHandle, id)
}

async function post(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
): Promise<{ code: number; said: string; id: string }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  let id = ''
  try {
    id = (reply.json() as { record?: { id?: string } }).record?.id ?? ''
  } catch {
    id = ''
  }
  return { code: reply.statusCode, said: reply.body, id }
}

async function patch(
  id: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload })
  return { code: reply.statusCode, said: reply.body }
}

/** What a record's `data` holds now, read as the person so no rule of this file's own is in the way. */
async function stored(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  return (reply.json() as { record: { data: Record<string, unknown> } }).record.data
}

/** A report for a note to point at. Notes need something real to be about. */
async function aReport(headers: Record<string, string>): Promise<string> {
  const made = await post(
    '/api/records',
    {
      kind: 'report',
      title: 'What the gripper did on Tuesday',
      data: {
        for: THE_TEST_OFFICES_OWNER.name,
        date: '2026-09-16',
        blocks: [{ id: 'b-1', type: 'text', text: 'It let go of the part on 37% of runs.' }],
      },
    },
    headers,
  )
  expect(made.code, made.said).toBe(201)
  return made.id
}

/** A note written by whoever the headers say, pointing at a report. */
async function aNote(headers: Record<string, string>, words: string): Promise<string> {
  const about = await aReport(AS_THE_PERSON)
  const made = await post(
    '/api/records',
    {
      kind: 'annotation',
      title: 'On the gripper number',
      data: { body: words, context: { target: { kind: 'record', recordId: about, workspaceId: WORKSPACE } } },
    },
    headers,
  )
  expect(made.code, made.said).toBe(201)
  return made.id
}

/** A fork classified by whoever the headers say. */
async function aFork(headers: Record<string, string>): Promise<string> {
  const made = await post(
    '/api/records',
    {
      kind: 'proposal',
      title: 'Which timeout on the gripper poll?',
      data: { question: 'a or b?', options: ['a — 200 ms', 'b — 2 s'], who_settles_it: 'the owner' },
    },
    headers,
  )
  expect(made.code, made.said).toBe(201)
  return made.id
}

/** A question put on the person's queue by whoever the headers say. */
async function anAsk(headers: Record<string, string>): Promise<string> {
  const made = await post(
    '/api/records',
    {
      kind: 'problem',
      title: 'The arm stops short of the handover pose',
      data: { symptom: 'it stops 4 cm short', whose_move: 'person' },
    },
    headers,
  )
  expect(made.code, made.said).toBe(201)
  return made.id
}

// ============================================================ the world, built once

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  // 1. THE LADDER, THROUGH THE REAL DOOR, because the fifth guard reads a chain of starters and a
  //    registration refuses a chain that does not reach the person. The door gives `beacon` a
  //    minted id. It is then renamed as well, so the name it registered under is nobody's name.
  const secretary = await post('/api/agents/started', { handle: 'beacon', name: 'Beacon', role: 'secretary' }, AS_THE_PERSON)
  expect(secretary.code, secretary.said).toBe(201)
  const worker = await post('/api/agents/started', { handle: 'asker', name: 'Asker', role: 'worker' }, asAgent('beacon'))
  expect(worker.code, worker.said).toBe(201)
  const third = await post('/api/agents/started', { handle: 'elsewhere', name: 'Elsewhere', role: 'worker' }, asAgent('beacon'))
  expect(third.code, third.said).toBe(201)
  beaconId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('beacon') as { id: string }).id
  expect(beaconId, 'the door gave beacon its handle as its id, not a minted id').not.toBe('beacon')
  t.client.sqlite.prepare('UPDATE agents SET handle = ? WHERE id = ?').run('beacon-under-another-name', beaconId)

  // 2. THE TWO PLAIN AGENTS, written at the table so their ids are known in advance.
  insertAgent(WANDERER)
  insertAgent(BYSTANDER)

  // 3. THE HISTORY THAT MAKES THE COLLISION REAL, in the order it really happens: `ember` was live
  //    when it wrote, so every row it left is stamped with the string `ember`.
  insertAgent(EMBER_THEN)
  embersFork = await aFork(asAgent(EMBER_THEN.id))
  embersAsk = await anAsk(asAgent(EMBER_THEN.id))
  retire(EMBER_THEN.id, 'ember-the-first')
  insertAgent(EMBER_NOW)

  // 4. AND TWO AGENTS UNDER ONE NAME. `twin` writes while it is the only one bearing the name, then
  //    retires keeping it, and a second agent takes the name — which the real index allows since
  //    migration 0174, because it covers live rows only.
  insertAgent(TWIN_ONE)
  twinsNote = await aNote(asAgent(TWIN_ONE.handle), 'Both readings of this number are defensible.')
  retire(TWIN_ONE.id)
  insertAgent(TWIN_TWO)

  // 5. WHAT A WRITER THE OFFICE CANNOT PLACE LEFT BEHIND. `app.inject()` is on no socket, so
  //    `actor.from` is absent and the unregistered-writer rule does not apply — which is the same
  //    reason that rule's own test drives a real listener instead.
  theWorkersNote = await aNote(asAgent(THE_WORKER), 'Nobody has this name on file.')
  theWorkersAsk = await anAsk(asAgent(THE_WORKER))
})

let embersFork = ''
let embersAsk = ''
let twinsNote = ''
let theWorkersNote = ''
let theWorkersAsk = ''

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the five guards, one at a time

describe('an agent that wrote under its handle still owns it when it comes back under its minted id', () => {
  it('guard 1 — may still change the words of a note it wrote, and nobody else may', async () => {
    const note = await aNote(asAgent(WANDERER.handle), 'The gripper let go on 37% of runs.')

    const mine = await patch(note, { dataPatch: { body: 'The gripper let go on 41% of runs.' } }, asAgent(WANDERER.id))
    expect(mine.code, mine.said).toBe(200)
    expect((await stored(note))['body']).toBe('The gripper let go on 41% of runs.')

    const theirs = await patch(note, { dataPatch: { body: 'It was fine.' } }, asAgent(BYSTANDER.id))
    expect(theirs.code, 'another agent rewrote somebody else’s words').toBe(403)
    expect((await stored(note))['body']).toBe('The gripper let go on 41% of runs.')
  })

  it('guard 2 — may sign a decision with either of its two names, and not with somebody else’s', async () => {
    // THIS GUARD IS DIFFERENT IN KIND and the difference is the point: `decided_by` is a field the
    // agent is writing RIGHT NOW, not a stamp the ledger kept. Resolving it means an agent has two
    // true names for itself after the mint and is believed for either.
    const byItsName = await post(
      '/api/records',
      { kind: 'decision', title: 'Poll the gripper every 200 ms', data: {
        ...governsTheWholeProject(), replaces: [], decided_by: WANDERER.handle, authority: 'a measurement', because: '37% of runs dropped the part at 2 s.' } },
      asAgent(WANDERER.id),
    )
    expect(byItsName.code, byItsName.said).toBe(201)

    const byItsId = await post(
      '/api/records',
      { kind: 'decision', title: 'Poll the wrist camera every 200 ms', data: {
        ...governsTheWholeProject(), replaces: [], decided_by: WANDERER.id, authority: 'a measurement', because: 'The same measurement, on the camera.' } },
      asAgent(WANDERER.handle),
    )
    expect(byItsId.code, byItsId.said).toBe(201)

    const somebodyElse = await post(
      '/api/records',
      { kind: 'decision', title: 'Signed with another agent’s name', data: {
        ...governsTheWholeProject(), replaces: [], decided_by: BYSTANDER.handle, authority: 'a measurement', because: 'Not this agent’s to sign.' } },
      asAgent(WANDERER.id),
    )
    expect(somebodyElse.code, 'an agent signed a decision in another agent’s name').toBe(403)
  })

  it('guard 3 — may still correct a fork it classified, and nobody else may', async () => {
    const fork = await aFork(asAgent(WANDERER.handle))

    const mine = await patch(fork, { dataPatch: { who_settles_it: 'an agent' } }, asAgent(WANDERER.id))
    expect(mine.code, mine.said).toBe(200)
    expect((await stored(fork))['who_settles_it']).toBe('an agent')

    const back = await aFork(asAgent(WANDERER.handle))
    const theirs = await patch(back, { dataPatch: { who_settles_it: 'an agent' } }, asAgent(BYSTANDER.id))
    expect(theirs.code, 'another agent took a fork off the owner').toBe(403)
    expect((await stored(back))['who_settles_it']).toBe('the owner')
  })

  it('guard 4 — may still withdraw a question it asked, and nobody else may', async () => {
    const ask = await anAsk(asAgent(WANDERER.handle))

    const mine = await patch(ask, { dataPatch: { whose_move: null } }, asAgent(WANDERER.id))
    expect(mine.code, mine.said).toBe(200)
    expect((await stored(ask))['whose_move']).toBeUndefined()

    const again = await anAsk(asAgent(WANDERER.handle))
    const theirs = await patch(again, { dataPatch: { whose_move: null } }, asAgent(BYSTANDER.id))
    expect(theirs.code, 'another agent emptied the owner’s queue').toBe(403)
    expect((await stored(again))['whose_move']).toBe('person')
  })

  it('guard 5 — the starter a question is with is answered by either of its two names', async () => {
    // THIS ONE ALREADY RESOLVED before piece I-3b, through `participantForActor`, and it is on
    // `sameAgent` now so there is one reader rather than two shapes of one question in one file.
    // Both arrivals are proved, so a change that broke either half would be caught.
    const first = await anAsk(asAgent('asker'))
    const byName = await patch(first, { dataPatch: { state: 'fixed' } }, asAgent('beacon-under-another-name'))
    expect(byName.code, byName.said).toBe(200)

    const second = await anAsk(asAgent('asker'))
    const byId = await patch(second, { dataPatch: { state: 'fixed' } }, asAgent(beaconId))
    expect(byId.code, byId.said).toBe(200)

    const third = await anAsk(asAgent('asker'))
    const notItsQuestion = await patch(third, { dataPatch: { state: 'fixed' } }, asAgent('elsewhere'))
    expect(notItsQuestion.code, 'an agent the question is not with closed it').toBe(403)
    expect((await stored(third))['whose_move']).toBe('person')
  })
})

// ============================================================ 2. nobody inherits a past by taking a name

describe('an agent that takes a retired agent’s freed handle does not own what the retired agent wrote', () => {
  it('may not reclassify the retired agent’s fork, though the stored stamp is the name it now bears', async () => {
    // THE STORED STAMP IS `ember`, WHICH IS THE RETIRED AGENT'S EXACT ID. An id is never reused, so
    // it names that agent and no other — and the agent asking, under its own minted id, is not it.
    const taking = await patch(embersFork, { dataPatch: { who_settles_it: 'an agent' } }, asAgent(EMBER_NOW.id))
    expect(taking.code, 'an agent reclassified a fork by taking the classifier’s name').toBe(403)
    expect((await stored(embersFork))['who_settles_it']).toBe('the owner')
  })

  it('may not withdraw the retired agent’s question either', async () => {
    // `sameAgent` FIRST, ON ITS OWN, because this is the fact this piece owns and the door below
    // refuses for a second reason as well. The stored stamp `ember` is the retired agent's EXACT id,
    // so it names that agent and nobody else, and the agent asking is not it.
    expect(
      t.api.sameAgent({ actorType: 'agent', actorId: EMBER_THEN.id }, { type: 'agent', id: EMBER_NOW.id }),
      'the new holder of a freed name was read as the agent that wrote under it',
    ).toBe(false)

    // AND THE DOOR REFUSES WITH THE GUARD'S OWN 403 AND WRITES NOTHING. It answered 409 until the
    // second commit on this branch: `whereTheQuestionIs` in src/server/lib/confirming.ts read the
    // STORED asker through the ARRIVING-reference resolver, which raises I-1's ambiguity refusal for
    // the string `ember` — problem `1depXfmbfVH9`, found here and fixed in
    // tests/a-stored-stamp-is-never-resolved-by-the-arriving-resolver.test.ts's own commit.
    const taking = await patch(embersAsk, { dataPatch: { whose_move: null } }, asAgent(EMBER_NOW.id))
    expect(taking.code, `refused with ${taking.code}: ${taking.said}`).toBe(403)
    expect((await stored(embersAsk))['whose_move'], 'the question was taken off the record').toBe('person')
  })

  it('is refused before any of that if it sends the shared name, because the name means two agents', async () => {
    // AND THIS IS THE OTHER HALF OF THE SAME PROTECTION. Criterion I9 keeps a live agent sending its
    // HANDLE, and after I-2 that handle is also the retired agent's id — so the resolver refuses the
    // request outright, naming both agents and the id to send instead. Nothing is guessed either way.
    const ambiguous = await patch(embersFork, { dataPatch: { who_settles_it: 'an agent' } }, asAgent('ember'))
    expect(ambiguous.code, 'a name that means two agents was answered instead of refused').toBe(409)
    expect(ambiguous.said).toContain('names two agents')
    expect(ambiguous.said).toContain('Ember')
    expect(ambiguous.said).toContain('Ember Two')
    expect((await stored(embersFork))['who_settles_it']).toBe('the owner')
  })
})

// ============================================================ 3. a stamp that names two agents

describe('a stored stamp that names two agents is answered no rather than resolved to one of them', () => {
  it('refuses the live agent bearing the name, and the refusal names both agents', async () => {
    const refused = await patch(twinsNote, { dataPatch: { body: 'One reading only.' } }, asAgent(TWIN_TWO.id))
    expect(refused.code, 'a stamp that names two agents was resolved to one of them').toBe(403)
    // BOTH OF THEM, BY NAME. The refusal is a refusal BECAUSE it is ambiguous, so saying which two is
    // the whole of the reason — chapter 10 rule 1, and invariant 5: absence beats a guess, and
    // ambiguity is neither an absence nor an answer.
    expect(refused.said).toContain('Twin One')
    expect(refused.said).toContain('Twin Two')
    expect((await stored(twinsNote))['body']).toBe('Both readings of this number are defensible.')
  })

  it('refuses it on a governance field the agent is writing now, and says what would be accepted', async () => {
    // `decided_by` is not a stored stamp, but a string that names two agents settles nothing there
    // either, and a governance write fails closed where the two readings disagree.
    const refused = await post(
      '/api/records',
      { kind: 'decision', title: 'Signed with a name two agents answer to', data: {
        ...governsTheWholeProject(), replaces: [], decided_by: 'twin', authority: 'a measurement', because: 'The name settles nothing.' } },
      asAgent(TWIN_TWO.id),
    )
    expect(refused.code, 'a decision was signed with a name that means two agents').toBe(403)
    expect(refused.said, 'the refusal does not say what would be accepted').toContain(TWIN_TWO.id)
    expect((JSON.parse(refused.said) as { error: string }).error, 'the refusal offers a name the office then refuses').not.toContain(`"${TWIN_TWO.handle}", both of which are your own name`)
  })
})

// ============================================================ 4. a stamp that names nobody

describe('a stored stamp the office cannot place is the last resort, and it is not a blanket yes', () => {
  it('(a) is the SAME writer for the identical unplaceable name, which is what the six exist for', async () => {
    // THE ONE BRANCH OF `sameAgent` THAT DOES NOT RESOLVE, and it is declared rather than silent:
    // where the office can place NEITHER side, two names are two strings. Six writers are on
    // `AGENT_IDS_THAT_NEED_NO_REGISTRATION` on purpose, and without this the message worker could
    // put a question on the person's queue and never withdraw it. The owner's F1 answer of
    // 3 September 2026 applied to identity: name it, never stop it.
    //
    // THE RULE WAS RULED ON. SI struck "an unregistered writer owns nothing" from this piece's brief
    // on the measurement below and replaced it (messages `mLrM_g499W_R` and `viQyJQSL-tNA`).
    const words = await patch(theWorkersNote, { dataPatch: { body: 'Still its own to change.' } }, asAgent(THE_WORKER))
    expect(words.code, words.said).toBe(200)
    expect((await stored(theWorkersNote))['body']).toBe('Still its own to change.')

    const question = await patch(theWorkersAsk, { dataPatch: { whose_move: null } }, asAgent(THE_WORKER))
    expect(question.code, 'the message worker could not withdraw its own question').toBe(200)
    expect((await stored(theWorkersAsk))['whose_move']).toBeUndefined()
  })

  it('(b) is NOT the same for a different unplaceable name, nor for the same id under another type', async () => {
    const somebodyElseUnplaceable = await patch(
      theWorkersNote,
      { dataPatch: { body: 'Mine now.' } },
      asAgent(THE_DEV_SUPERVISOR),
    )
    expect(somebodyElseUnplaceable.code, 'one unplaceable writer claimed another’s words').toBe(403)

    // AND BOTH HALVES OF THE IDENTITY, NOT ONLY THE ID. A person carrying the message worker's id
    // string is not the message worker, and a comparison on the id alone would have said it was.
    const sameIdOtherType = await patch(
      theWorkersNote,
      { dataPatch: { body: 'Mine now.' } },
      { ...AS_THE_PERSON, 'x-mole-office-actor-id': THE_WORKER },
    )
    expect(sameIdOtherType.code, 'one id string under two actor types was read as one writer').toBe(403)
    // AND IT IS THIS RULE REFUSING, not another one further up. Both refusals are the authorship
    // gate's own sentence, so a 403 arriving for some other reason would not pass for a proof.
    expect(somebodyElseUnplaceable.said).toContain('wrote this note')
    expect(sameIdOtherType.said).toContain('wrote this note')

    expect((await stored(theWorkersNote))['body']).toBe('Still its own to change.')
  })

  it('(c) is NOT the same in either direction between a placeable name and an unplaceable one', async () => {
    // A REGISTERED CALLER CANNOT CLAIM AN UNPLACEABLE STAMP.
    const registeredClaiming = await patch(theWorkersNote, { dataPatch: { body: 'Mine now.' } }, asAgent(WANDERER.id))
    expect(registeredClaiming.code, 'a registered agent claimed an unplaceable writer’s note').toBe(403)
    expect(registeredClaiming.said).toContain(THE_WORKER)
    expect((await stored(theWorkersNote))['body']).toBe('Still its own to change.')

    // AND AN UNPLACEABLE CALLER CANNOT CLAIM A REGISTERED AGENT'S. Its own name is placeable by
    // nobody, so nothing it sends can resolve to the agent that wrote this.
    const wanderersNote = await aNote(asAgent(WANDERER.handle), 'Measured on Tuesday, twice.')
    const unplaceableClaiming = await patch(
      wanderersNote,
      { dataPatch: { body: 'Measured once.' } },
      asAgent(THE_WORKER),
    )
    expect(unplaceableClaiming.code, 'an unplaceable writer claimed a registered agent’s note').toBe(403)
    expect((await stored(wanderersNote))['body']).toBe('Measured on Tuesday, twice.')
  })
})

// ============================================================ 5. the sentence a person reads

describe('a refusal names the agent rather than printing the string the ledger holds', () => {
  it('names an agent that wrote under its minted id, and prints no nanoid at a reader', async () => {
    // THE STAMP HERE IS THE MINTED ID, because the note was written under it. Before piece I-3b this
    // refusal interpolated the stamp straight into what a person reads, which after the mint is
    // twelve characters of nanoid naming nobody. Chapter 10 rule 1.
    const note = await aNote(asAgent(WANDERER.id), 'Written under the id rather than the name.')

    const refused = await patch(note, { dataPatch: { body: 'Not yours to change.' } }, asAgent(BYSTANDER.id))
    expect(refused.code, refused.said).toBe(403)
    expect(refused.said, 'the refusal does not name the agent that wrote it').toContain(WANDERER.name)
    expect(refused.said, 'the refusal does not say which name that agent goes by').toContain(WANDERER.handle)
    expect(refused.said, 'the refusal printed the stored id at a reader').not.toContain(WANDERER.id)
  })

  it('keeps the person’s own stamp exactly as it was, because their id is their name', async () => {
    // A PERSON RESOLVES BY ID ALONE and nothing about that moved: `human:` and the person's id is what this sentence
    // said before, and tests/a-comment-belongs-to-whoever-wrote-it.test.ts holds it to those words.
    const theOwnersNote = await aNote(AS_THE_PERSON, 'The part slipped on the third cycle.')

    const refused = await patch(theOwnersNote, { dataPatch: { body: 'The calibration was fine.' } }, asAgent(WANDERER.id))
    expect(refused.code, refused.said).toBe(403)
    expect(refused.said).toContain(`human:${THE_PERSON}`)
  })
})
