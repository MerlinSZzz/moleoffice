// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON CHANGES WHO ANSWERS FOR AN AGENT, ITS STARTER, BY A PRESS ON ITS PAGE. Wave 13u, round 186.
 *
 * Until this round a starter moved only by a write of `data.startedBy` on the agent's record, which checked nothing,
 * kept no reason and told nobody. These cases read GET /api/agents/:id/starter, GET /api/agents/:id/starter-preview and
 * POST /api/agents/:id/starter against the real server, and read the registry row, the records, the history and the
 * lines straight from the database.
 *
 *   1. The preview says what the press would do, and writes nothing. An agent may read it.
 *   2. Each refusal writes nothing: an agent pressing, even the agent's own starter; no reason; another person; a name
 *      nobody bears; the agent itself; a retired agent on either side; the starter it has now; a loop; a chain that
 *      reaches nobody; Mole Office's own row.
 *   3. The person's press moves the row and the agent's records in every project, keeps the change with its reason,
 *      and tells the agent and both starters. The reading of who answers for the agent lists it.
 *   4. A press for an agent with a run that has not ended waits, naming the run; a second press may say `atOnce`. With it,
 *      the change is made, the run is kept on the change, and the agent is told a round going on reports to the new
 *      starter.
 *   5. A secretary may be moved, and the preview says it is one.
 *   6. The secretary card keeps the press for the person, so no raise carries it.
 *   7. A run in each state that ends a run (`RUN_IS_OVER_STATES` in src/server/lib/keys.ts) holds up no press,
 *      one state at a time, and a run with no state holds it up.
 *
 * Every agent, project and name here is made up.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const FIRST = 'default'
const SECOND = 'made-up-meadow'
const ANOTHER_PERSON = 'made-up-visitor'
const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
const keys: Record<string, string> = {}

type Headers = Record<string, string>
const asThePerson = (workspace = FIRST): Headers => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
})
const asAgent = (handle: string, workspace = FIRST): Headers => ({
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys[handle]!,
})

/** The answer, with every key-shaped string hidden so a failure never prints one. */
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Headers, payload?: object): Promise<{ status: number; body: any; said: string }> {
  const res = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: unknown = null
  try {
    body = JSON.parse(res.body)
  } catch {
    body = null
  }
  return { status: res.statusCode, body, said: res.body.replace(/[0-9a-f]{64}/g, '<a key>') }
}

const idOf = (handle: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
const anAgentNamed = (handle: string): { kind: string; id: string } => ({ kind: 'agent', id: idOf(handle) })
const thePerson = (): { kind: string; id: string } => ({ kind: 'person', id: THE_PERSON })

/** The registry row's starter, as every reader of it reads it. */
const theStarterOf = (handle: string): unknown =>
  t.client.sqlite.prepare('SELECT started_by_kind AS kind, started_by_id AS id FROM agents WHERE id = ?').get(idOf(handle))

/** The starter each of the agent's live records holds, by project. */
function theStartersOnTheRecordsOf(handle: string): Record<string, unknown> {
  const rows = t.client.sqlite
    .prepare(
      `SELECT r.workspace_id AS project, r.data -> '$.startedBy' AS startedBy FROM agent_records a JOIN records r ON r.id = a.record_id
        WHERE a.agent_id = ? AND r.deleted_at IS NULL`,
    )
    .all(idOf(handle)) as { project: string; startedBy: string | null }[]
  return Object.fromEntries(rows.map((row) => [row.project, row.startedBy === null ? null : JSON.parse(row.startedBy)]))
}

/** Every write a change of starter makes: the row, the records, the history and the lines. A refusal changes none. */
function whatAChangeWrites(handle: string): unknown {
  return {
    row: theStarterOf(handle),
    records: theStartersOnTheRecordsOf(handle),
    changes: (t.client.sqlite.prepare('SELECT count(*) AS n FROM agent_starter_changes').get() as { n: number }).n,
    lines: theLines().length,
  }
}

/** The office's lines about a change of starter, oldest first, with whom each was to and its whole sentence. */
function theLines(): { to: string; line: string; said: string }[] {
  const rows = t.client.sqlite
    .prepare(
      `SELECT json_extract(data, '$.to[0].id') AS too, json_extract(data, '$.body') AS line, json_extract(data, '$.saidInFull') AS said
         FROM records WHERE kind = 'message' AND json_extract(data, '$.notice') = 'theStarterOfAnAgentChanged' ORDER BY rowid`,
    )
    .all() as { too: string; line: string; said: string }[]
  return rows.map((row) => ({ to: row.too, line: row.line, said: row.said }))
}

async function start(handle: string, headers: Headers, role?: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', headers, { handle, name: `Made-up ${handle}`, ...(role === undefined ? {} : { role }) })
  expect(made.status, made.said).toBe(201)
  if (made.body.whatToGiveIt?.key !== undefined) keys[handle] = String(made.body.whatToGiveIt.key)
}

const press = (handle: string, body: object, headers = asThePerson()) => call('POST', `/api/agents/${idOf(handle)}/starter`, headers, body)
const preview = (handle: string, to: string, headers = asThePerson()) =>
  call('GET', `/api/agents/${idOf(handle)}/starter-preview?to=${encodeURIComponent(to)}`, headers)

/** A fixture run of the agent, filed with no state and then put in `state` in the database, as the move's cases do. */
function aRun(handle: string, state: string, title: string): string {
  const id = t.api.createRecord({
    kind: 'session',
    workspaceId: FIRST,
    origin: 'fixture',
    actor: { type: 'agent', id: idOf(handle) },
    title,
    data: { runtime: 'claude-code', servingAgent: handle, servingAgentId: idOf(handle) },
  }).id
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, id)
  return id
}

describe('the person changes who answers for an agent', () => {
  beforeAll(async () => {
    t = await freshDb()
    writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`, {
      mode: 0o600,
    })
    app = (await apiApp()).app
    await app.ready()
    const made = await call('POST', '/api/workspaces', asThePerson(), { id: SECOND, title: 'A made-up second project' })
    expect(made.status, made.said).toBe(201)
    await start('top-a', asThePerson(), 'supervisor')
    await start('top-b', asThePerson(), 'supervisor')
    await start('middle', asAgent('top-a'))
    await start('below', asAgent('middle'))
    // THE SAME AGENT IN A SECOND PROJECT, so it has two records for the press to write.
    const joined = await call('POST', '/api/agents/started', asAgent('top-a', SECOND), { handle: 'middle', name: 'Made-up middle' })
    expect(joined.status, joined.said).toBe(201)
    await start('to-retire', asThePerson())
    await start('unstarted', asThePerson())
    await start('with-a-run', asAgent('top-a'))
    // A ROW NOBODY RECORDED A STARTER ON, the state every row registered before 6 September 2026 holds.
    t.client.sqlite.prepare('UPDATE agents SET started_by_kind = NULL, started_by_id = NULL WHERE id = ?').run(idOf('unstarted'))
    const record = t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf('to-retire')) as { id: string }
    const retired = await call('PATCH', `/api/records/${record.id}`, asThePerson(), { dataPatch: { state: 'retired', retiredBecause: 'A made-up agent, retired.' } })
    expect(retired.status, retired.said).toBe(200)
    const picture = t.client.sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }
    t.client.sqlite
      .prepare(
        'INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) ' +
          "VALUES (?, 'Made-up Visitor', ?, ?, NULL, NULL, '2026-11-08 09:00:00')",
      )
      .run(ANOTHER_PERSON, ANOTHER_PERSON, picture.id)
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('1: the preview says what the press would do, and writes nothing', async () => {
    const before = whatAChangeWrites('middle')
    for (const headers of [asThePerson(), asAgent('below')]) {
      const read = await preview('middle', 'top-b', headers)
      expect(read.status, read.said).toBe(200)
      expect(read.body.dryRun).toBe(true)
      expect(read.body.from).toMatchObject(anAgentNamed('top-a'))
      expect(read.body.to).toMatchObject(anAgentNamed('top-b'))
      expect(read.body.toWasReadAs).toBe('the one live agent with this handle')
      expect(read.body.isASecretary).toBe(false)
      expect(read.body.agentsBelow).toBe(1)
      expect(read.body.firstSecretaryUp).toEqual({ before: null, after: null })
      expect(read.body.runsNotEnded).toEqual([])
      expect(read.body.records.map((one: { project: string }) => one.project).sort()).toEqual([FIRST, SECOND].sort())
      expect(read.body.change).toBeNull()
      expect(read.body.told).toEqual([])
    }
    expect(whatAChangeWrites('middle')).toEqual(before)
  })

  it('2: each refusal writes nothing', async () => {
    const tries: [string, string, object, Headers, number, string][] = [
      ["an agent presses for another agent", 'middle', { to: 'top-b', because: 'A made-up reason.' }, asAgent('top-b'), 403, 'Only the person'],
      ["the agent's own starter presses", 'middle', { to: 'top-b', because: 'A made-up reason.' }, asAgent('top-a'), 403, 'Only the person'],
      ['the agent presses for itself', 'middle', { to: 'top-b', because: 'A made-up reason.' }, asAgent('middle'), 403, 'Only the person'],
      ['no reason', 'middle', { to: 'top-b', because: ' ' }, asThePerson(), 400, '"because"'],
      ['another person', 'middle', { to: ANOTHER_PERSON, because: 'A made-up reason.' }, asThePerson(), 400, 'a person other than'],
      ['a name nobody bears', 'middle', { to: 'made-up-nobody', because: 'A made-up reason.' }, asThePerson(), 404, 'No agent is registered as "made-up-nobody"'],
      ['the agent itself', 'middle', { to: 'middle', because: 'A made-up reason.' }, asThePerson(), 400, 'cannot answer for itself'],
      ['a retired new starter', 'middle', { to: 'to-retire', because: 'A made-up reason.' }, asThePerson(), 409, 'is retired'],
      ['a retired agent', 'to-retire', { to: 'top-b', because: 'A made-up reason.' }, asThePerson(), 409, 'is retired'],
      ['the starter it has now', 'middle', { to: 'top-a', because: 'A made-up reason.' }, asThePerson(), 409, 'already answers for'],
      ['a loop', 'middle', { to: 'below', because: 'A made-up reason.' }, asThePerson(), 409, 'make a loop'],
      ['a chain that reaches nobody', 'middle', { to: 'unstarted', because: 'A made-up reason.' }, asThePerson(), 409, 'reaches nobody'],
    ]
    for (const [what, handle, body, headers, status, words] of tries) {
      const before = whatAChangeWrites(handle)
      const sent = await press(handle, body, headers)
      expect(sent.status, `${what}: ${sent.said}`).toBe(status)
      expect(String(sent.body?.error ?? ''), what).toContain(words)
      expect(String(sent.body?.error ?? ''), what).toContain('Nothing was changed.')
      expect(whatAChangeWrites(handle), what).toEqual(before)
    }
    const own = await call('POST', `/api/agents/${moleOffice().id}/starter`, asThePerson(), { to: 'top-b', because: 'A made-up reason.' })
    expect(own.status, own.said).toBe(403)
    expect(String(own.body?.error ?? '')).toContain("Mole Office's own row")
  })

  it("3: the person's press moves the row and every record, keeps the change and tells the agent and both starters", async () => {
    const sent = await press('middle', { to: 'top-b', because: 'Top-b leads this work now.' })
    expect(sent.status, sent.said).toBe(200)
    expect(theStarterOf('middle')).toEqual(anAgentNamed('top-b'))
    expect(theStartersOnTheRecordsOf('middle')).toEqual({ [FIRST]: anAgentNamed('top-b'), [SECOND]: anAgentNamed('top-b') })

    const kept = t.client.sqlite.prepare('SELECT * FROM agent_starter_changes WHERE agent_id = ?').all(idOf('middle')) as Record<string, unknown>[]
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({
      from_kind: 'agent',
      from_id: idOf('top-a'),
      to_kind: 'agent',
      to_id: idOf('top-b'),
      asked_by_kind: 'person',
      asked_by_id: THE_PERSON,
      because: 'Top-b leads this work now.',
      state: 'applied',
      runs_not_ended: '[]',
    })
    expect(kept[0]!['applied_at']).not.toBeNull()

    const lines = theLines()
    expect(lines.map((one) => one.to).sort()).toEqual([idOf('middle'), idOf('top-a'), idOf('top-b')].sort())
    const to = (handle: string) => lines.find((one) => one.to === idOf(handle))!
    expect(to('middle').line).toBe('Who answers for you changed')
    expect(to('middle').said).toContain('The reason given: Top-b leads this work now.')
    expect(to('top-b').line).toBe('You answer for Made-up middle now')
    expect(to('top-a').line).toBe('You no longer answer for Made-up middle')
    expect(to('top-a').said).toContain('A new-key grant you made for it stays yours to withdraw.')
    expect(sent.body.told.map((one: { message: string }) => one.message)).toHaveLength(3)

    const read = await call('GET', `/api/agents/${idOf('middle')}/starter`, asAgent('below'))
    expect(read.status, read.said).toBe(200)
    expect(read.body.starter).toMatchObject(anAgentNamed('top-b'))
    expect(read.body.reachesThePerson).toBe(true)
    expect(read.body.changes).toHaveLength(1)
    expect(read.body.changes[0]).toMatchObject({ from: anAgentNamed('top-a'), to: anAgentNamed('top-b'), askedBy: thePerson(), state: 'applied' })

    // AND THE PERSON MAY MAKE THEMSELVES THE STARTER, which tells only the agent and the old starter.
    const toThePerson = await press('below', { to: THE_PERSON, because: 'The person leads it directly.' })
    expect(toThePerson.status, toThePerson.said).toBe(200)
    expect(theStarterOf('below')).toEqual(thePerson())
    expect(toThePerson.body.toWasReadAs).toBe('the person')
    expect(toThePerson.body.told.map((one: { who: { id: string } }) => one.who.id).sort()).toEqual([idOf('below'), idOf('middle')].sort())
  })

  it('4: a run that has not ended makes the change wait, and at once applies that same change', async () => {
    const run = aRun('with-a-run', 'running', 'A made-up run still going')
    aRun('with-a-run', 'finished', 'A made-up run that ended')
    const read = await preview('with-a-run', 'top-b')
    expect(read.status, read.said).toBe(200)
    expect(read.body.runsNotEnded).toEqual([{ id: run, title: 'A made-up run still going', project: FIRST, state: 'running' }])

    const waiting = await press('with-a-run', { to: 'top-b', because: 'A made-up reason.' })
    expect(waiting.status, waiting.said).toBe(200)
    expect(waiting.body.change.state).toBe('waiting')
    expect(waiting.body.change.runsNotEnded).toEqual([run])
    expect(theStarterOf('with-a-run')).toEqual(anAgentNamed('top-a'))

    const atOnce = await press('with-a-run', { to: 'top-b', because: 'A made-up reason.', atOnce: true })
    expect(atOnce.status, atOnce.said).toBe(200)
    expect(atOnce.body.change.id).toBe(waiting.body.change.id)
    expect(atOnce.body.change.state).toBe('applied')
    expect(theStarterOf('with-a-run')).toEqual(anAgentNamed('top-b'))
    expect(atOnce.body.change.runsNotEnded).toEqual([run])
    const told = theLines().find((one) => one.to === idOf('with-a-run'))!
    expect(told.said).toContain('A run of yours had not ended, and the person made the change at once')
  })

  it('5: a secretary may be moved, and the preview says it is one', async () => {
    await start('a-secretary', asThePerson(), 'secretary')
    await start('under-the-secretary', asAgent('a-secretary'))
    const read = await preview('under-the-secretary', 'top-a')
    expect(read.status, read.said).toBe(200)
    expect(read.body.firstSecretaryUp.before).toMatchObject(anAgentNamed('a-secretary'))
    expect(read.body.firstSecretaryUp.after).toBeNull()
    const secretary = await preview('a-secretary', 'top-a')
    expect(secretary.status, secretary.said).toBe(200)
    expect(secretary.body.isASecretary).toBe(true)
    expect(secretary.body.agentsBelow).toBe(1)
    const moved = await press('a-secretary', { to: 'top-a', because: 'A made-up reason.' })
    expect(moved.status, moved.said).toBe(200)
    expect(theStarterOf('a-secretary')).toEqual(anAgentNamed('top-a'))
  })

  it('6: the secretary card keeps the press for the person, so no raise carries it', async () => {
    const { theCardsAnswerAbout } = await import('../src/server/lib/what-the-grant-carries.ts')
    expect(theCardsAnswerAbout('agent.starter-move')).toBe('kept')
  })

  it('7: a run in each state that ends a run holds up no press, and a run with no state does', async () => {
    const { RUN_IS_OVER_STATES } = await import('../src/shared/run-has-ended.ts')
    await start('ended-runs', asAgent('top-a'))
    const run = aRun('ended-runs', 'running', 'A made-up run that ends one way at a time')
    let to = 'top-b'
    for (const state of RUN_IS_OVER_STATES) {
      t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, run)
      const sent = await press('ended-runs', { to, because: `A made-up reason: its run is ${state}.` })
      expect(sent.status, `${state}: ${sent.said}`).toBe(200)
      expect(sent.body.runsNotEnded, state).toEqual([])
      expect(theStarterOf('ended-runs'), state).toEqual(anAgentNamed(to))
      to = to === 'top-b' ? 'top-a' : 'top-b'
    }
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.state') WHERE id = ?").run(run)
    const held = await press('ended-runs', { to, because: 'A made-up reason: its run has no state.' })
    expect(held.status, held.said).toBe(200)
    expect(held.body.change.state).toBe('waiting')
    expect(held.body.runsNotEnded).toEqual([{ id: run, title: 'A made-up run that ends one way at a time', project: FIRST, state: null }])
  })
})
