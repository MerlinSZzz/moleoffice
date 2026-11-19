// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MOVED TO ANOTHER PROJECT BY ONE PRESS, and what stays behind and why: every agent move is built, and a
 * person moves an agent without changing code. Wave 13u, round 184.
 *
 * Before this round, moving an agent took one record move per record, and nothing said which records were the agent's.
 * A run that names its agent only by its record (`data.ranAs`) named it in the old project, so after a move by hand it
 * named nobody. These cases read GET and POST /api/agents/:id/project-move against the real server, and read where each
 * record is filed straight from the database.
 *
 *   1. The preview names what would move and what would stay, each with why, and writes nothing.
 *   2. An agent may not press it, for itself or another agent.
 *   3. The same project, an unknown agent and an `also` not as the preview said are refused, and nothing moves.
 *   4. The person's press moves the agent's record and its ended runs together. A run still going and a paused run
 *      stay, with why. Another agent's run stays and is not named.
 *   5. A moved run that named the agent only by its record still names it, now in the new project.
 *   6. A run that was still going follows with the same press once it has ended, after the record went ahead.
 *   7. An agent with a record in both projects is refused, since the office does not join two records into one.
 *   8. A link from the agent's record to a run still going would cross the boundary: the preview names it, and the
 *      press is refused with nothing written.
 *   9. A run whose `data.servingAgent` is stored as null names no agent, as the one reader of a run's agent says, so
 *      the move neither lists nor moves it, whatever its binding says (round 184's refused check, its first finding).
 *  10. A run served by one agent that also carries another agent's binding: the press rewrites only the moved agent's
 *      binding, and the other agent's binding still names the project its record stayed in (the second finding).
 *
 * All names and projects here are made up.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const FROM = 'orchard'
const TO = 'meadow'

let t: TestDb
let app: FastifyInstance
let theAgentOf: (run: string) => string | null

function headers(workspace: string, actor = THE_PERSON, key?: string): Record<string, string> {
  return {
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': actor === THE_PERSON ? 'human' : 'agent',
    'x-mole-office-actor-id': actor,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  }
}

async function call(
  method: 'GET' | 'POST',
  url: string,
  workspace: string,
  payload?: unknown,
  actor = THE_PERSON,
  key?: string,
): Promise<{ status: number; body: any; raw: string }> {
  const res = await app.inject({ method, url, headers: headers(workspace, actor, key), ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: unknown = null
  try {
    body = JSON.parse(res.body)
  } catch {
    body = null
  }
  return { status: res.statusCode, body, raw: res.body }
}

/** The project a record is filed in now, read from the database. */
function whereIs(id: string): string {
  const row = t.client.sqlite.prepare('SELECT workspace_id AS w FROM records WHERE id = ?').get(id) as { w: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return row.w
}

/** The agent's live record in a project, as the agent_records join says. */
function theRecordOf(agentId: string, workspace: string): string | null {
  const row = t.client.sqlite
    .prepare(
      `SELECT r.id AS id FROM agent_records a JOIN records r ON r.id = a.record_id
        WHERE a.agent_id = ? AND r.workspace_id = ? AND r.deleted_at IS NULL ORDER BY r.created_at DESC LIMIT 1`,
    )
    .get(agentId, workspace) as { id: string } | undefined
  return row?.id ?? null
}

async function anAgent(handle: string, workspace = FROM): Promise<{ id: string; key: string; record: string }> {
  const started = await call('POST', '/api/agents/started', workspace, { handle, name: handle, runtime: 'claude-code' })
  expect(started.status, started.raw).toBe(201)
  const id = String(started.body.agent.id)
  const record = theRecordOf(id, workspace)
  expect(record, `registering ${handle} filed no agent record in ${workspace}`).not.toBeNull()
  return { id, key: String(started.body.whatToGiveIt.key), record: record! }
}

/** The JSON type a record's data holds at `path`, or null where the key is absent. */
function storedType(id: string, path: string): string | null {
  return (t.client.sqlite.prepare('SELECT json_type(data, ?) AS type FROM records WHERE id = ?').get(path, id) as { type: string | null }).type
}

/** A run's `data.ranAs` as stored. */
function theBindingsOf(run: string): unknown {
  return JSON.parse((t.client.sqlite.prepare("SELECT json_extract(data, '$.ranAs') AS r FROM records WHERE id = ?").get(run) as { r: string }).r)
}

function setTheState(run: string, state: string): void {
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, run)
}

/**
 * A fixture run, filed with no state and then put in `state` in the database. A run filed as finished must say what it
 * submits, which is not what these cases are about.
 */
function aRun(agent: { id: string }, state: string, title: string, data: Record<string, unknown>, workspace = FROM): string {
  const id = t.api.createRecord({
    kind: 'session',
    workspaceId: workspace,
    origin: 'fixture',
    actor: { type: 'agent', id: agent.id },
    title,
    data: { runtime: 'claude-code', ...data },
  }).id
  setTheState(id, state)
  return id
}

const servedBy = (agent: { id: string }, handle: string): Record<string, unknown> => ({ servingAgent: handle, servingAgentId: agent.id })

describe('an agent moved to another project by one press', () => {
  const MOVER = 'made-up-mover'
  let mover: { id: string; key: string; record: string }
  let other: { id: string; key: string; record: string }
  let finished: string
  let crashed: string
  let running: string
  let paused: string
  let byItsRecord: string
  let anotherAgentsRun: string

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    for (const [id, title] of [
      [FROM, 'A made-up orchard'],
      [TO, 'A made-up meadow'],
    ]) {
      const made = await call('POST', '/api/workspaces', 'default', { id, title })
      expect(made.status, made.raw).toBe(201)
    }
    mover = await anAgent(MOVER)
    other = await anAgent('made-up-neighbour')
    finished = aRun(mover, 'finished', 'A made-up finished run', servedBy(mover, MOVER))
    crashed = aRun(mover, 'crashed', 'A made-up crashed run', servedBy(mover, MOVER))
    running = aRun(mover, 'running', 'A made-up running run', servedBy(mover, MOVER))
    paused = aRun(mover, 'paused', 'A made-up paused run', servedBy(mover, MOVER))
    // A RUN THAT NAMES ITS AGENT ONLY BY ITS RECORD, in this project.
    byItsRecord = aRun(mover, 'finished', 'A made-up run named by its record', { ranAs: [{ workspaceId: FROM, agentId: mover.record }] })
    anotherAgentsRun = aRun(other, 'finished', "A made-up neighbour's run", servedBy(other, 'made-up-neighbour'))
    const inspection = await import('../src/server/lib/inspection.ts')
    theAgentOf = (run) => {
      const row = t.client.sqlite.prepare('SELECT id, workspace_id AS workspaceId, data FROM records WHERE id = ?').get(run) as {
        id: string
        workspaceId: string
        data: string
      }
      return inspection.theAgentsOfTheseRuns([{ id: row.id, workspaceId: row.workspaceId, data: JSON.parse(row.data) }]).get(run) ?? null
    }
    expect(theAgentOf(byItsRecord)).toBe(mover.id)
  }, 60_000)

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('1: the preview names what would move and what would stay, each with why, and writes nothing', async () => {
    const said = await call('GET', `/api/agents/${mover.id}/project-move?to=${TO}`, FROM)
    expect(said.status, said.raw).toBe(200)
    expect(said.body.dryRun).toBe(true)
    expect(said.body.record).toBe(mover.record)
    const moving = said.body.moving as { id: string; kind: string; forcedBy: { withId: string } | null }[]
    const named = moving.filter((one) => one.forcedBy === null).map((one) => one.id)
    expect(named.sort(), JSON.stringify(moving)).toEqual([mover.record, finished, crashed, byItsRecord].sort())
    // WHAT GOES WITH THEM: each ended run's own flow run, which the walk brings because a link joins it to its run. The
    // running and paused runs' flow runs stay with their runs.
    const comingWith = moving.filter((one) => one.forcedBy !== null)
    expect(comingWith.map((one) => one.kind), JSON.stringify(moving)).toEqual(['flow_run', 'flow_run', 'flow_run'])
    expect(comingWith.map((one) => one.forcedBy!.withId).sort()).toEqual([finished, crashed, byItsRecord].sort())
    const staying = Object.fromEntries((said.body.staying as { id: string; why: string; because: string }[]).map((one) => [one.id, one.why]))
    expect(staying).toEqual({ [running]: 'still-going', [paused]: 'paused' })
    expect(said.body.crossing).toEqual([])
    expect(said.body.needsAlso).toEqual([])
    for (const id of [mover.record, finished, crashed, running, paused, byItsRecord, anotherAgentsRun]) expect(whereIs(id)).toBe(FROM)
  })

  it('2: an agent may not press it, for itself or another agent, and nothing moves', async () => {
    for (const target of [mover.id, other.id]) {
      const pressed = await call('POST', `/api/agents/${target}/project-move`, FROM, { to: TO }, mover.id, mover.key)
      expect(pressed.status, pressed.raw).toBe(403)
    }
    for (const id of [mover.record, other.record, finished]) expect(whereIs(id)).toBe(FROM)
  })

  it('3: the same project, an unknown agent and an also not as asked are refused, and nothing moves', async () => {
    expect((await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: FROM })).status).toBe(400)
    expect((await call('POST', '/api/agents/made-up-nobody/project-move', FROM, { to: TO })).status).toBe(404)
    expect((await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: 'made-up-nowhere' })).status).toBe(404)
    const wrongAlso = await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: TO, also: [anotherAgentsRun] })
    expect(wrongAlso.status, wrongAlso.raw).toBe(409)
    for (const id of [mover.record, finished, anotherAgentsRun]) expect(whereIs(id)).toBe(FROM)
  })

  it("4 and 5: the person's press moves the record and the ended runs, the rest stay, and a run named by its record still names it", async () => {
    const pressed = await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: TO })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(pressed.body.dryRun).toBe(false)
    for (const id of [mover.record, finished, crashed, byItsRecord]) expect(whereIs(id)).toBe(TO)
    for (const one of pressed.body.moving as { id: string }[]) expect(whereIs(one.id)).toBe(TO)
    expect((pressed.body.moving as unknown[]).length).toBe(7)
    for (const id of [running, paused, anotherAgentsRun, other.record]) expect(whereIs(id)).toBe(FROM)
    expect(theRecordOf(mover.id, TO)).toBe(mover.record)
    expect(theRecordOf(mover.id, FROM)).toBeNull()
    const staying = Object.fromEntries((pressed.body.staying as { id: string; why: string }[]).map((one) => [one.id, one.why]))
    expect(staying).toEqual({ [running]: 'still-going', [paused]: 'paused' })
    // 5: the binding now says the new project, and the one reader of a run's agent still finds it.
    const ranAs = JSON.parse(
      (t.client.sqlite.prepare("SELECT json_extract(data, '$.ranAs') AS r FROM records WHERE id = ?").get(byItsRecord) as { r: string }).r,
    ) as { workspaceId: string; agentId: string }[]
    expect(ranAs).toEqual([{ workspaceId: TO, agentId: mover.record }])
    expect(pressed.body.bindingsRewritten).toBe(1)
    expect(theAgentOf(byItsRecord)).toBe(mover.id)
  })

  it('6: a run that was still going follows with the same press once it has ended', async () => {
    // The preview read just after a press answers: nothing moves, the two runs stay, each with why, and the agent's
    // record is in the project it went to. A page shows that answer, so it says where the agent is now.
    const before = await call('GET', `/api/agents/${mover.id}/project-move?to=${TO}`, FROM)
    expect(before.status, before.raw).toBe(200)
    expect(before.body.moving).toEqual([])
    expect(before.body.staying.map((one: { id: string; why: string }) => [one.id, one.why])).toEqual([
      [running, 'still-going'],
      [paused, 'paused'],
    ])
    expect(before.body.recordIsIn).toEqual([TO])
    // A press with nothing to move is refused, and names what stays and where the record is.
    const early = await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: TO })
    expect(early.status, early.raw).toBe(404)
    const said = String(early.body.error)
    expect(said).toContain('Nothing was moved.')
    expect(said).toContain(`Its record is in "${TO}".`)
    expect(said).toContain('2 of its records stay here: "A made-up running run", still going; "A made-up paused run", paused.')
    expect(whereIs(running)).toBe(FROM)
    setTheState(running, 'finished')
    const pressed = await call('POST', `/api/agents/${mover.id}/project-move`, FROM, { to: TO })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(pressed.body.record).toBeNull()
    expect(pressed.body.recordIsIn).toEqual([TO])
    expect(whereIs(running)).toBe(TO)
    expect(whereIs(paused)).toBe(FROM)
  })

  it('7: an agent with a record in both projects is refused, and nothing moves', async () => {
    const twice = await anAgent('made-up-twice')
    const second = t.api.createRecord({
      kind: 'agent',
      workspaceId: TO,
      origin: 'fixture',
      actor: { type: 'human', id: THE_PERSON },
      title: 'made-up-twice in the meadow',
      data: {},
    }).id
    t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(second, twice.id)
    const pressed = await call('POST', `/api/agents/${twice.id}/project-move`, FROM, { to: TO })
    expect(pressed.status, pressed.raw).toBe(409)
    expect(whereIs(twice.record)).toBe(FROM)
  })

  it('8: a link from its record to a run still going is named by the preview and refuses the press', async () => {
    const linked = await anAgent('made-up-linked')
    const stillGoing = aRun(linked, 'running', 'A made-up run still going, linked', servedBy(linked, 'made-up-linked'))
    const link = await call('POST', '/api/links', FROM, { fromId: linked.record, toId: stillGoing, type: 'relates_to' })
    expect(link.status, link.raw).toBe(201)
    const said = await call('GET', `/api/agents/${linked.id}/project-move?to=${TO}`, FROM)
    expect(said.status, said.raw).toBe(200)
    expect((said.body.crossing as { toId: string }[]).map((one) => one.toId)).toEqual([stillGoing])
    const pressed = await call('POST', `/api/agents/${linked.id}/project-move`, FROM, { to: TO, also: said.body.needsAlso })
    expect(pressed.status, pressed.raw).toBe(409)
    expect(whereIs(linked.record)).toBe(FROM)
  })

  it('9: a run whose servingAgent is stored as null names no agent, so the move neither lists nor moves it', async () => {
    const quiet = await anAgent('made-up-quiet')
    const namesNobody = aRun(quiet, 'finished', 'A made-up run that names nobody', { ranAs: [{ workspaceId: FROM, agentId: quiet.record }] })
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgent', json('null')) WHERE id = ?").run(namesNobody)
    expect(storedType(namesNobody, '$.servingAgent')).toBe('null')
    expect(theAgentOf(namesNobody)).toBeNull()
    const said = await call('GET', `/api/agents/${quiet.id}/project-move?to=${TO}`, FROM)
    expect(said.status, said.raw).toBe(200)
    const listed = [...(said.body.moving as { id: string }[]), ...(said.body.staying as { id: string }[])].map((one) => one.id)
    expect(listed).toEqual([quiet.record])
    const pressed = await call('POST', `/api/agents/${quiet.id}/project-move`, FROM, { to: TO })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(whereIs(quiet.record)).toBe(TO)
    expect(whereIs(namesNobody)).toBe(FROM)
    expect(pressed.body.bindingsRewritten).toBe(0)
    expect(theBindingsOf(namesNobody)).toEqual([{ workspaceId: FROM, agentId: quiet.record }])
  })

  it("10: a run served by one agent has only that agent's binding rewritten, and another agent's binding stays", async () => {
    const served = await anAgent('made-up-served')
    const earlier = await anAgent('made-up-earlier')
    const twoBindings = aRun(served, 'finished', 'A made-up run with two bindings', servedBy(served, 'made-up-served'))
    // THE OTHER AGENT'S BINDING IS PUT IN THE DATABASE, as a binding kept from before is. The office refuses to file a
    // session whose binding names an agent other than the one filing it.
    const bindings = [
      { workspaceId: FROM, agentId: earlier.record },
      { workspaceId: FROM, agentId: served.record },
    ]
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.ranAs', json(?)) WHERE id = ?").run(JSON.stringify(bindings), twoBindings)
    expect(theBindingsOf(twoBindings)).toEqual(bindings)
    expect(theAgentOf(twoBindings)).toBe(served.id)
    const pressed = await call('POST', `/api/agents/${served.id}/project-move`, FROM, { to: TO })
    expect(pressed.status, pressed.raw).toBe(200)
    expect(whereIs(twoBindings)).toBe(TO)
    expect(whereIs(served.record)).toBe(TO)
    expect(whereIs(earlier.record)).toBe(FROM)
    expect(pressed.body.bindingsRewritten).toBe(1)
    expect(theBindingsOf(twoBindings)).toEqual([
      { workspaceId: FROM, agentId: earlier.record },
      { workspaceId: TO, agentId: served.record },
    ])
    expect(theAgentOf(twoBindings)).toBe(served.id)
  })
})
