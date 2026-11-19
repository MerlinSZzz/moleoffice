// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GROUP, AN AGENT'S PIXEL LOOK AND ITS CARD FIND AN AGENT BY ITS NAME OR BY ITS ID.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion I2 of design/agents/IDENTITY-ACCEPTANCE.md. A new agent's registry id is minted and is
 * not its handle (criterion I1). A reference that ARRIVES with a request may be either one, and the
 * one resolver in src/server/lib/participants.ts says which agent it names. Three places read such a
 * reference by exact id or by exact handle only, and each missed a new agent:
 *
 *   · the groups door, src/server/api/groups.ts: `members[].who` when a group is opened, and `who`
 *     when a member is added. What a membership stores is the registry id.
 *   · the pixel look, src/server/lib/pixel-office.ts: the `:agentId` path value.
 *   · the card and the grant, src/server/lib/elevation.ts, read `WHERE handle = ?`, and the role gate
 *     in src/server/lib/rolegate.ts asked it with the caller's registry id. The gate's refusal
 *     printed that id to a person where it meant the agent's handle.
 *
 * A string that is one agent's id and another live agent's handle is refused in each of them with a
 * 409, because nothing here can tell which of the two was meant. The pair is made the way it happens
 * in a real office: a legacy row whose id is `twin` and whose handle is something else, and then a new
 * agent that registers under the handle `twin`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   · theMemberAsStored in src/server/api/groups.ts hands the member on unchanged → the group cases
 *     go red: a handle is refused as "Nothing is registered", and the twin is not refused. The case
 *     that takes a member out by its handle goes red with them.
 *   · theMemberASideNames matches `?as=` by exact id again → the side case goes red: the handle is
 *     not found among the members.
 *   · pixelAppearance reads `readParticipant({ kind: 'agent', id: agentId })` again → the look cases
 *     go red: the handle answers 404, and the twin is not refused.
 *   · theGrantOn reads `WHERE handle = ?` with the string it is handed → the card case goes red when
 *     the secretary sends its id, and the twin case goes red because nothing is refused.
 *   · theRoleOfTheCaller puts the id in `handle` again → the refusal names the id, and goes red.
 *
 * TWO MORE DOORS, added in the second round. GET /api/checks?startedBy= (src/server/api/inspection.ts)
 * and POST /api/dead-letters/claims (src/server/api/dead-letters.ts) resolve the agent they are
 * handed, and claimDeadLetters in src/server/lib/deadletters.ts names agents by handle in its 404
 * and 409 sentences.
 *
 *   · the checks door passes `startedBy` on unresolved → the starter case goes red when it is named
 *     by its handle, and the twin is not refused.
 *   · the claim door passes `agentId` on unresolved → the claim cases go red: a handle answers 404,
 *     and the twin is not refused.
 *   · claimDeadLetters names the stored string as it is → the 404 and 409 sentences print ids.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, FOR_THE_PERSON, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'

let t: TestDb
let app: BuiltServer

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(reference: string): Record<string, string> {
  return { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': reference }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; said: string; body: Record<string, unknown> }> {
  const reply = await app.app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** Register an agent through the door a starter uses, and hand back its registry id. */
async function register(handle: string, role?: string): Promise<string> {
  const done = await ask('POST', '/api/agents/started', AS_THE_PERSON, {
    handle,
    name: handle,
    ...(role === undefined ? {} : { role }),
  })
  expect(done.status, done.said).toBeLessThan(300)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row has the handle ${handle}`).toBeDefined()
  const id = (row as { id: string }).id
  // THE MINT IS IN PLACE, or nothing below tells a handle from an id.
  expect(id, 'the registration set the id to the handle').not.toBe(handle)
  return id
}

/** A row registered before the mint, whose id is `id` and whose handle is something else. */
function aLegacyRow(id: string, handle: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-16 10:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(id, handle, handle, `avatar-default-agent-${id}`, '2026-09-16 10:00:00')
}

/**
 * THE NEW AGENT OF A TWIN PAIR, registered by filing its record, the way every door reaches the
 * registration. Not through POST /api/agents/started: that door registers the row and then answers
 * 409 itself, because a later step of it reads the new agent back by the handle `twin`. That door is
 * src/server/api/participants.ts, which this file does not test.
 */
/** The new agent of a twin pair, registered under the id string that is the legacy row's id. */
function registerTheTwin(handle: string, role: string): string {
  t.api.createRecord({
    workspaceId: 'default',
    actor: { type: 'human', id: THE_PERSON },
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', role },
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row has the handle ${handle}`).toBeDefined()
  expect((row as { id: string }).id).not.toBe(handle)
  return (row as { id: string }).id
}

/** The agents in a group now, as the membership table stores them. */
function membersOf(groupId: string): string[] {
  const rows = t.client.sqlite
    .prepare("SELECT member_id FROM group_members WHERE group_id = ? AND member_kind = 'agent' AND left_at IS NULL ORDER BY member_id")
    .all(groupId) as { member_id: string }[]
  return rows.map((row) => row.member_id)
}

function howManyGroups(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM groups').get() as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = await apiApp()
  await app.app.ready()
}, 60_000)

afterAll(async () => {
  await app.app.close()
  t.close()
})

describe('the groups door', () => {
  it('stores the registry id of an agent named by its handle, when a group is opened and when a member is added', async () => {
    const first = await register('group-first')
    const second = await register('group-second')
    const opened = await ask('POST', '/api/groups', AS_THE_PERSON, {
      name: 'Two agents',
      because: 'They need to talk.',
      members: [{ who: { kind: 'agent', id: 'group-first' }, because: 'It asked.' }],
    })
    expect(opened.status, opened.said).toBe(201)
    const groupId = String((opened.body['group'] as { id: string }).id)
    expect(membersOf(groupId)).toEqual([first])

    const added = await ask('POST', `/api/groups/${groupId}/members`, AS_THE_PERSON, {
      who: { kind: 'agent', id: 'group-second' },
      because: 'It answers the question.',
    })
    expect(added.status, added.said).toBe(200)
    expect(membersOf(groupId).sort()).toEqual([first, second].sort())
  })

  it('refuses a group whose second member is a name nobody bears, and opens no group', async () => {
    await register('group-real')
    const before = howManyGroups()
    const refused = await ask('POST', '/api/groups', AS_THE_PERSON, {
      name: 'One real, one not',
      because: 'To see the refusal.',
      members: [
        { who: { kind: 'agent', id: 'group-real' }, because: 'It is real.' },
        { who: { kind: 'agent', id: 'nobody-bears-this' }, because: 'It is not.' },
      ],
    })
    expect(refused.status, refused.said).toBe(400)
    expect(refused.said).toContain('nobody-bears-this')
    expect(howManyGroups()).toBe(before)
  })

  it('refuses a string that is one agent\'s id and another agent\'s handle, and opens no group', async () => {
    const twin = 'twin-groups'
    aLegacyRow(twin, `${twin}-first`)
    registerTheTwin(twin, 'worker')
    const before = howManyGroups()
    const opening = await ask('POST', '/api/groups', AS_THE_PERSON, {
      name: 'Which twin',
      because: 'To see the refusal.',
      members: [{ who: { kind: 'agent', id: twin }, because: 'Which one?' }],
    })
    expect(opening.status, opening.said).toBe(409)
    expect(howManyGroups()).toBe(before)

    const open = await ask('POST', '/api/groups', AS_THE_PERSON, { name: 'An empty group', because: 'To add to.', members: [] })
    expect(open.status, open.said).toBe(201)
    const groupId = String((open.body['group'] as { id: string }).id)
    const adding = await ask('POST', `/api/groups/${groupId}/members`, AS_THE_PERSON, {
      who: { kind: 'agent', id: twin },
      because: 'Which one?',
    })
    expect(adding.status, adding.said).toBe(409)
    expect(membersOf(groupId)).toEqual([])
  })
})

describe('the rest of the groups door', () => {
  it('reads a group from the side of a member named by its handle, and names the members by handle when it refuses', async () => {
    const id = await register('side-member')
    const opened = await ask('POST', '/api/groups', AS_THE_PERSON, {
      name: 'A side to read from',
      because: 'To read it as the agent.',
      members: [{ who: { kind: 'agent', id: 'side-member' }, because: 'It is the side.' }],
    })
    expect(opened.status, opened.said).toBe(201)
    const groupId = String((opened.body['group'] as { id: string }).id)
    const read = await ask('GET', `/api/groups/${groupId}?as=side-member`, AS_THE_PERSON)
    expect(read.status, read.said).toBe(200)
    expect(read.body['asSide']).toEqual({ kind: 'agent', id })
    const refused = await ask('GET', `/api/groups/${groupId}?as=not-a-member`, AS_THE_PERSON)
    expect(refused.status, refused.said).toBe(400)
    expect(refused.said).toContain(`side-member (${id})`)
  })

  it('takes out a member named by its handle', async () => {
    const id = await register('leaving-member')
    const opened = await ask('POST', '/api/groups', AS_THE_PERSON, {
      name: 'One to leave',
      because: 'To take somebody out.',
      members: [{ who: { kind: 'agent', id }, because: 'It will leave.' }],
    })
    expect(opened.status, opened.said).toBe(201)
    const groupId = String((opened.body['group'] as { id: string }).id)
    const out = await ask('POST', `/api/groups/${groupId}/members/remove`, AS_THE_PERSON, { who: { kind: 'agent', id: 'leaving-member' } })
    expect(out.status, out.said).toBe(200)
    expect(membersOf(groupId)).toEqual([])
  })
})

describe('the pixel look', () => {
  it('reads and changes a new agent\'s look by its handle and by its id', async () => {
    const id = await register('look-owner')
    for (const reference of ['look-owner', id]) {
      const read = await ask('GET', `/api/office/appearance/${reference}`, AS_THE_PERSON)
      expect(read.status, `${reference}: ${read.said}`).toBe(200)
      expect(read.body['agentId']).toBe(id)
      const changed = await ask('PUT', `/api/office/appearance/${reference}`, AS_THE_PERSON, { appearance: null })
      expect(changed.status, `${reference}: ${changed.said}`).toBe(200)
      expect(changed.body['agentId']).toBe(id)
    }
  })

  it('refuses a string that is one agent\'s id and another agent\'s handle', async () => {
    const twin = 'twin-look'
    aLegacyRow(twin, `${twin}-first`)
    registerTheTwin(twin, 'worker')
    const read = await ask('GET', `/api/office/appearance/${twin}`, AS_THE_PERSON)
    expect(read.status, read.said).toBe(409)
    const changed = await ask('PUT', `/api/office/appearance/${twin}`, AS_THE_PERSON, { appearance: null })
    expect(changed.status, changed.said).toBe(409)
  })
})

describe('the card and the grant', () => {
  it('lets a secretary registered after the mint act under its grant, whether it sends its handle or its id', async () => {
    const id = await register('card-secretary', 'secretary')
    const pressed = await ask('POST', '/api/roles/elevation/card-secretary', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'a test raises it', endsWhen: 'when you say' })
    expect(pressed.status, pressed.said).toBe(201)
    const settings = await ask('GET', '/api/office/scene-settings', AS_THE_PERSON)
    expect(settings.status, settings.said).toBe(200)
    for (const reference of ['card-secretary', id]) {
      const read = await ask('GET', '/api/office/scene-settings', asAgent(reference))
      expect(read.body['mayChange'], `${reference}: ${String(read.body['refusal'])}`).toBe(true)
      // THE ROLE GATE ASKS THE GRANT TOO: the scene is one of the person's own acts.
      const changed = await ask('PATCH', '/api/office/scene-settings', asAgent(reference), { ...(settings.body['settings'] as object), ...FOR_THE_PERSON })
      expect(changed.status, `${reference}: ${changed.said}`).toBe(200)
    }
    // THE SCENE IS SHARED by the whole office, so the case gives it back as it found it.
    const restored = await ask('PATCH', '/api/office/scene-settings', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, settings.body['settings'])
    expect(restored.status, restored.said).toBe(200)
  })

  it('names a refused worker by its handle, not by its id', async () => {
    const id = await register('card-worker', 'worker')
    const settings = await ask('GET', '/api/office/scene-settings', AS_THE_PERSON)
    const refused = await ask('PATCH', '/api/office/scene-settings', asAgent(id), settings.body['settings'])
    expect(refused.status, refused.said).toBe(403)
    expect(refused.said).toContain('"card-worker" is a worker')
    expect(refused.said).not.toContain(id)
  })

  it('refuses a string that is one agent\'s id and another agent\'s handle', async () => {
    const twin = 'twin-card'
    aLegacyRow(twin, `${twin}-first`)
    registerTheTwin(twin, 'secretary')
    const { theElevationHeldBy } = await import('../src/server/lib/elevation.ts')
    let refused: unknown = null
    try {
      theElevationHeldBy(twin)
    } catch (error) {
      refused = error
    }
    expect(refused, 'the grant was read for one of the two agents without asking which').not.toBeNull()
    expect((refused as { status: number }).status).toBe(409)
    expect(String((refused as Error).message)).toContain(`${twin}-first`)
  })
})

// ============================================================ round 2: two more arriving doors

/** An agent started by another agent, which is what makes the first one its starter. */
async function registerStartedBy(starter: string, handle: string): Promise<string> {
  const done = await ask('POST', '/api/agents/started', asAgent(starter), { handle, name: handle, role: 'worker', workArea: ['src'], chapters: ['5'] })
  expect(done.status, done.said).toBeLessThan(300)
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A run of one agent that has said it is finished, and has not been released. */
async function aFinishedRun(handle: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(handle), {
    kind: 'session',
    title: `A run of ${handle}`,
    data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd() },
  })
  expect(filed.status, filed.said).toBe(201)
  const run = String((filed.body['record'] as { id: string }).id)
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  const done = await ask('PATCH', `/api/records/${run}`, asAgent(handle), { dataPatch: { state: 'finished' } })
  expect(done.status, done.said).toBe(200)
  return run
}

/** Twenty-one messages to one agent, addressed by its registry id, and the sweep that names it. */
async function deadLettersFor(agentId: string): Promise<void> {
  for (let n = 1; n <= 21; n++) {
    const filed = await ask('POST', '/api/records', AS_THE_PERSON, {
      kind: 'message',
      title: `letter ${String(n)}`,
      data: { body: `letter ${String(n)}`, to: [{ kind: 'agent', id: agentId }] },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, filed.said).toBe(409)
  }
  const swept = await ask('POST', '/api/dead-letters/sweep', AS_THE_PERSON, {})
  expect(swept.status, swept.said).toBe(200)
  const row = t.client.sqlite.prepare('SELECT agent_id FROM dead_letter_claims WHERE agent_id = ?').get(agentId)
  expect(row, 'the sweep named nobody, so no claim is waiting').toBeDefined()
}

describe('the list of checks one starter owes', () => {
  it('lists the runs of the agents a starter started, whether it is named by its handle or its id', async () => {
    const starter = await register('check-starter', 'secretary')
    await registerStartedBy('check-starter', 'check-worker')
    const run = await aFinishedRun('check-worker')
    for (const reference of ['check-starter', starter]) {
      const list = await ask('GET', `/api/checks?startedBy=${reference}`, asAgent('check-starter'))
      expect(list.status, `${reference}: ${list.said}`).toBe(200)
      const runs = (list.body['list'] as { run: string }[]).map((one) => one.run)
      expect(runs, `${reference}: the list is empty`).toContain(run)
    }
  })

  it('refuses a string that is one agent\'s id and another agent\'s handle', async () => {
    const twin = 'twin-checks'
    aLegacyRow(twin, `${twin}-first`)
    registerTheTwin(twin, 'secretary')
    const list = await ask('GET', `/api/checks?startedBy=${twin}`, AS_THE_PERSON)
    expect(list.status, list.said).toBe(409)
  })
})

describe('a dead-letter claim', () => {
  it('claims an addressee named by its handle, and one named by its id', async () => {
    await register('claim-secretary', 'secretary')
    await register('claim-other-secretary', 'secretary')
    const first = await register('addressee-one', 'worker')
    const second = await register('addressee-two', 'worker')
    await deadLettersFor(first)
    await deadLettersFor(second)
    // WHAT WAS ALREADY CLAIMED BEFORE THIS CASE, read whole so the case can say what it added and nothing else.
    const claimedBefore = t.client.sqlite
      .prepare('SELECT agent_id FROM dead_letter_claims WHERE claimed_at IS NOT NULL ORDER BY agent_id')
      .all() as { agent_id: string }[]
    const alreadyClaimed = new Set(claimedBefore.map((one) => one.agent_id))
    for (const reference of ['addressee-one', second]) {
      const claimed = await ask('POST', '/api/dead-letters/claims', asAgent('claim-secretary'), { agentId: reference, because: 'I take these.' })
      expect(claimed.status, `${reference}: ${claimed.said}`).toBeLessThan(300)
    }
    const claimedAfter = t.client.sqlite
      .prepare('SELECT agent_id FROM dead_letter_claims WHERE claimed_at IS NOT NULL ORDER BY agent_id')
      .all() as { agent_id: string }[]
    const added = claimedAfter.map((one) => one.agent_id).filter((id) => !alreadyClaimed.has(id))
    expect(added.sort()).toEqual([first, second].sort())
  })

  it('names the claimer and the addressee by their handles when a second claim is refused', async () => {
    const claimer = await register('first-claimer', 'secretary')
    await register('second-claimer', 'secretary')
    const addressee = await register('addressee-taken', 'worker')
    await deadLettersFor(addressee)
    const claimed = await ask('POST', '/api/dead-letters/claims', asAgent('first-claimer'), { agentId: addressee, because: 'Mine.' })
    expect(claimed.status, claimed.said).toBeLessThan(300)
    const again = await ask('POST', '/api/dead-letters/claims', asAgent('second-claimer'), { agentId: 'addressee-taken', because: 'Mine too.' })
    expect(again.status, again.said).toBe(409)
    expect(again.said).toContain('"first-claimer"')
    expect(again.said).toContain('"addressee-taken"')
    expect(again.said).not.toContain(claimer)
    expect(again.said).not.toContain(addressee)
  })

  it('names an addressee nobody broadcast by its handle, not by its id', async () => {
    await register('lonely-claimer', 'secretary')
    const addressee = await register('never-named', 'worker')
    const claimed = await ask('POST', '/api/dead-letters/claims', asAgent('lonely-claimer'), { agentId: addressee, because: 'Mine?' })
    expect(claimed.status, claimed.said).toBe(404)
    expect(claimed.said).toContain('"never-named"')
    expect(claimed.said).not.toContain(addressee)
  })

  it('refuses a string that is one agent\'s id and another agent\'s handle', async () => {
    const twin = 'twin-letter'
    await register('twin-claimer', 'secretary')
    aLegacyRow(twin, `${twin}-first`)
    registerTheTwin(twin, 'worker')
    const claimed = await ask('POST', '/api/dead-letters/claims', asAgent('twin-claimer'), { agentId: twin, because: 'Which one?' })
    expect(claimed.status, claimed.said).toBe(409)
    expect(claimed.said).toContain(`${twin}-first`)
  })
})
