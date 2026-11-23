// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITE DOORS READ AN AGENT'S OLD ID THROUGH ITS ALIAS. Item 30c's (b), as decided for wave 13s round 171: a
 * writer that only pauses while the office is closed for the re-mint comes back holding the old ids, and each of six
 * doors lands it on the agent the old id was. An old id is an alias filed for the agent's canonical id. A door that
 * stores an id keeps it as it was sent; only the reading resolves it. A made-up id is still refused, as before.
 *
 * Every agent, run, goal and duty here is made up, in a throwaway office with made-up keys.
 *
 * THE CASES, one for the resolver and one or more for each door:
 *   0. theAgentRowAnIdNames answers an old id and the canonical id with the agent's row, and null for a made-up id, a
 *      handle or an old id with a space added;
 *   1. PUT /api/secretaries/<old id>/duties writes the agent's duties; a PUT at the canonical id changes a duties
 *      record stored under the old id and leaves that stored id; the secretary writes its own duties at its old id
 *      with a warrant bound to the old id; a made-up id is a 404;
 *   2. a watch whose holder is an old id is filed and stored as sent; a made-up holder is refused with 400;
 *   3. the duties guard: duties naming the secretary by its old id are filed, and a second record for the same
 *      secretary under its canonical id is refused 409; the secretary files duties under its old id with its own
 *      key; a supervisor named by its old id is taken, and another secretary naming it by its canonical id is
 *      refused 409; a made-up supervisor is refused with 400;
 *   4. the starting door finds the worker by an old id, and takes a launcher whose `extra.worker` is the other
 *      spelling, either way round; the run-key door mints the worker's key under a launcher that names the old id; a
 *      launcher naming a made-up worker, and a made-up worker, are still refused;
 *   5. a goal whose filed_by is the caller's old id is filed and stored as sent; a made-up filed_by is refused 403; a
 *      goal filed with no filed_by stores the name the request was made under, the handle or the registry id it
 *      named, and the identity reader reads each of the three forms stored as a stamp;
 *   6. saving default appearances writes the agent an old id names, once, and skips a made-up id as missing;
 *   7. the list of every secretary's duties, a door beside them that only reads, lists a duties record stored under
 *      an old id under its secretary and not under notASecretaryNow. A record stored under the old id of an agent
 *      that is no secretary says what that agent is, and one under a made-up id says that no agent has it.
 *
 * Run it alone: node tools/run-named-tests.mjs tests/the-write-doors-read-an-old-id-through-its-alias.test.ts
 *
 * MUTATIONS, each red here after a green control run, the file restored with cp and checked with cmp after each:
 *   1. participants.ts, theAgentRowAnIdNames: read `id` in place of its alias target. Cases 0 to 6 go red.
 *   2. participant-fields.ts: ask readParticipant of an agent too. Cases 2 and 3 go red.
 *   3. api/secretary-duties.ts, theDutiesRecords: match the asked id alone. Case 1 goes red.
 *   4. api/secretary-duties.ts, the PUT's change: write `secretary` again. Case 1 goes red.
 *   5. grant/secretary-duties.ts, checkThereIsNoOther: match the asked id alone. Case 3 goes red.
 *   6. grant/secretary-duties.ts, checkTheSupervisors: ask the other duties for the canonical ids alone. Case 3 goes red.
 *   7. grant/secretary-duties.ts, checkWhoWrites: compare the caller with the stored id. Cases 1 and 3 go red.
 *   8. grant/secretary-duties.ts, checkWhoWrites: take only the binding under the stored id. Case 1 goes red.
 *   9. lib/worker-runs.ts, startingTheWorkerRun: read the worker by the id sent. Case 4 goes red.
 *  10. shared/worker-runs.ts, theLauncherIsForThisWorkerRun: compare extra.worker as stored. Case 4 goes red.
 *  11. goals.ts, theAgentMarkAsStored: compare filed_by with the caller's id alone. Case 5 goes red.
 *  12. pixel-office.ts, applyDefaultPixelAppearances: write the row by the plan's id. Case 6 goes red.
 *  13. api/secretary-duties.ts, everySecretarysDuties: take a record's stored id as the agent for notASecretaryNow.
 *      Case 7 goes red.
 *  14. api/secretary-duties.ts, everySecretarysDuties: match a secretary's record by its stored id. Case 7 goes red.
 *  15. registry-aliases/identity-positions.ts: list goal.filed_by as a registry id again. Case 5 goes red.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const THE_WORKER_ID = 'mole-office/the-message-worker'
const MADE_UP = 'made-up-id-nobody-has'

let t: TestDb
let app: FastifyInstance
let serial = 0
let workerModeBefore: string | undefined
let guard: typeof import('../src/server/lib/grant/secretary-duties.ts')

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': A_MADE_UP_PERSON_KEY,
}
const asAgent = (id: string, key?: string, session?: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string) => asAgent(THE_WORKER_ID, A_MADE_UP_OFFICE_KEY, session)

interface Agent { id: string; handle: string; key: string; old: string }

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  // THE STARTING DOOR ASKS WHETHER THE OFFICE'S WORKER IS ON. Set here, so the answer does not depend on a .env.
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  app = (await apiApp()).app
  await app.ready()
  guard = await import('../src/server/lib/grant/secretary-duties.ts')
}, 60_000)
afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  t?.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00')
  await app?.close()
  t?.close()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try { body = reply.json() } catch { body = {} }
  return { status: reply.statusCode, body, raw: reply.body }
}

/** A made-up agent the person registers, with an old id: an alias filed for its canonical id, which is no registry id. */
async function anAgentWithAnOldId(role: string): Promise<Agent> {
  const handle = `made-up-old-id-${role}-${++serial}`
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role, runtime: 'claude-code' })
  expect(started.status, started.raw).toBe(201)
  const id = String(started.body.agent.id)
  const old = `old-id-of-${handle}`
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: old, canonicalId: id }])
  return { id, handle, key: String(started.body.whatToGiveIt?.key ?? ''), old }
}
const asOne = (who: Agent) => asAgent(who.handle, who.key)

function data(id: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data)
}
function setData(id: string, value: Record<string, unknown>): void {
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(value), id)
}
const theDutiesRecordsNaming = (...ids: string[]) =>
  (t.client.sqlite.prepare(`SELECT id FROM records WHERE kind = 'secretary_duties' AND deleted_at IS NULL AND json_extract(data, '$.secretary.id') IN (SELECT value FROM json_each(?))`).all(JSON.stringify(ids)) as { id: string }[]).map((row) => row.id)

/** A decision the person files themselves, which duties may rest on, with its option as the person's words. */
async function aDecision(words: string): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'decision',
    title: 'A made-up decision for duties',
    data: { option_taken: words, because: 'A made-up reason.', decided_by: THE_OWNER, ...governsTheWholeProject(), replaces: [] },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.record.id)
}
const aWarrant = (words: string, ...acting: string[]) => ({ saidBy: THE_PERSON, words, where: 'terminal', when: '2026-10-31 14:00', for: acting })

describe('0. the resolver a write door reads an agent with', () => {
  it('answers an old id and the canonical id with the row, and a made-up id, a handle or a changed spelling with null', async () => {
    const one = await anAgentWithAnOldId(THE_WORKER)
    const { theAgentRowAnIdNames } = await import('../src/server/lib/participants.ts')
    for (const asked of [one.old, one.id]) {
      expect(theAgentRowAnIdNames(asked), asked).toMatchObject({ id: one.id, handle: one.handle })
    }
    for (const asked of [MADE_UP, one.handle, ` ${one.old}`]) expect(theAgentRowAnIdNames(asked), asked).toBeNull()
  })
})

describe("1. the door that writes a secretary's duties", () => {
  it('writes the duties of the agent an old id names, under its canonical id', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const duties = { area: 'A made-up area.', restsOn: [await aDecision('The made-up secretary keeps a made-up area.')] }
    const put = await call('PUT', `/api/secretaries/${secretary.old}/duties`, PERSON, duties)
    expect(put.status, put.raw).toBe(201)
    expect(put.body.record.data).toEqual({ secretary: { kind: 'agent', id: secretary.id }, ...duties })
    expect(put.body.agent.id).toBe(secretary.id)
  })

  it('changes a duties record stored under the old id, by the canonical id, and leaves the stored id', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const decision = await aDecision('The made-up secretary keeps another made-up area.')
    const first = await call('PUT', `/api/secretaries/${secretary.id}/duties`, PERSON, { area: 'A made-up first area.', restsOn: [decision] })
    expect(first.status, first.raw).toBe(201)
    const record = String(first.body.record.id)
    // THE OLD BYTES: the record was written under the old id, before the re-mint.
    setData(record, { ...data(record), secretary: { kind: 'agent', id: secretary.old } })
    const read = await call('GET', `/api/secretaries/${secretary.id}/duties`, PERSON)
    expect(read.status, read.raw).toBe(200)
    expect(read.body.duties?.recordId, read.raw).toBe(record)
    const changed = await call('PUT', `/api/secretaries/${secretary.id}/duties`, PERSON, { area: 'A made-up second area.', restsOn: [decision] })
    expect(changed.status, changed.raw).toBe(200)
    expect(changed.body.written).toBe('changed')
    expect(changed.body.record.id).toBe(record)
    expect(data(record)).toMatchObject({ secretary: { kind: 'agent', id: secretary.old }, area: 'A made-up second area.' })
    expect(theDutiesRecordsNaming(secretary.id, secretary.old)).toEqual([record])
  })

  it('takes the secretary writing its own duties at its old id, with a warrant bound to that id', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const words = 'The made-up secretary may write its own made-up duties.'
    const duties = { area: 'A made-up area of its own.', restsOn: [await aDecision(words)] }
    const put = await call('PUT', `/api/secretaries/${secretary.old}/duties`, asOne(secretary), {
      ...duties,
      warrant: aWarrant(words, guard.theBindingOf(secretary.old, duties)),
    })
    expect(put.status, put.raw).toBe(201)
    // AND AT ITS CANONICAL ID, on the record stored under the old id, with a warrant bound to the canonical id.
    const record = String(put.body.record.id)
    setData(record, { ...data(record), secretary: { kind: 'agent', id: secretary.old } })
    const changed = { ...duties, area: 'A made-up changed area of its own.' }
    const again = await call('PUT', `/api/secretaries/${secretary.id}/duties`, asOne(secretary), {
      ...changed,
      warrant: aWarrant(words, guard.theBindingOf(secretary.id, changed)),
    })
    expect(again.status, again.raw).toBe(200)
    expect(data(record)).toMatchObject({ secretary: { kind: 'agent', id: secretary.old }, area: changed.area })
  })

  it('still answers a made-up id with a 404, and writes nothing', async () => {
    const before = theDutiesRecordsNaming(MADE_UP).length
    const put = await call('PUT', `/api/secretaries/${MADE_UP}/duties`, PERSON, { area: 'A made-up area.', restsOn: [await aDecision('Made-up words.')] })
    expect(put.status, put.raw).toBe(404)
    expect(theDutiesRecordsNaming(MADE_UP).length).toBe(before)
  })
})

describe('2. a field that holds a participant', () => {
  const aWatchHeldBy = (id: string) => ({
    does: 'Made-up: reads the made-up queue every ten minutes and says when it grows.',
    holder: { kind: 'agent', id },
    runsAs: 'background_task',
    endsWhen: { condition: 'the made-up queue is empty' },
    wakes: 'Made-up: wakes its holder when the made-up queue holds more than five entries.',
    stateFile: '/made-up/watch/state.json',
    dailyRestart: 'Made-up: a system timer starts it again at 06:00 each day.',
    lastSeenAlive: '2026-10-31 08:40',
    state: 'running',
  })
  const fileAWatch = (holder: string) =>
    call('POST', '/api/records', PERSON, { kind: 'watch', title: 'A made-up watch', summary: 'A made-up watch kept by a made-up worker.', data: aWatchHeldBy(holder) })

  it('takes a holder named by an old id, and stores it as sent', async () => {
    const holder = await anAgentWithAnOldId(THE_WORKER)
    const filed = await fileAWatch(holder.old)
    expect(filed.status, filed.raw).toBe(201)
    expect(data(String(filed.body.record.id)).holder).toEqual({ kind: 'agent', id: holder.old })
  })

  it('still refuses a holder named by a made-up id with 400', async () => {
    const filed = await fileAWatch(MADE_UP)
    expect(filed.status, filed.raw).toBe(400)
    expect(filed.body.error).toContain(MADE_UP)
  })
})

describe("3. the checks on a secretary's duties record", () => {
  it('files duties naming the secretary by its old id, and refuses a second record for it under its canonical id', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const restsOn = [await aDecision('The made-up secretary keeps a made-up stored area.')]
    const filed = await call('POST', '/api/records', PERSON, { kind: 'secretary_duties', title: 'Made-up duties under an old id', data: { secretary: { kind: 'agent', id: secretary.old }, area: 'A made-up area.', restsOn } })
    expect(filed.status, filed.raw).toBe(201)
    expect(data(String(filed.body.record.id)).secretary).toEqual({ kind: 'agent', id: secretary.old })
    const second = await call('POST', '/api/records', PERSON, { kind: 'secretary_duties', title: 'Made-up second duties', data: { secretary: { kind: 'agent', id: secretary.id }, area: 'A made-up area.', restsOn } })
    expect(second.status, second.raw).toBe(409)
    expect(theDutiesRecordsNaming(secretary.id, secretary.old)).toEqual([String(filed.body.record.id)])
  })

  it('takes the secretary filing its own duties under its old id with its own key', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const words = 'The made-up secretary files its own made-up duties.'
    const duties = { area: 'A made-up area it files.', restsOn: [await aDecision(words)] }
    const title = 'Made-up duties the secretary files under its old id'
    const filed = await call('POST', '/api/records', asOne(secretary), {
      kind: 'secretary_duties',
      title,
      data: { secretary: { kind: 'agent', id: secretary.old }, ...duties },
      warrant: aWarrant(words, title, guard.theBindingOf(secretary.old, duties)),
    })
    expect(filed.status, filed.raw).toBe(201)
  })

  it('takes a supervisor named by its old id, and refuses another secretary naming it by its canonical id', async () => {
    const supervisor = await anAgentWithAnOldId(THE_SUPERVISOR)
    const restsOn = [await aDecision('The made-up secretaries answer for a made-up supervisor.')]
    const one = await anAgentWithAnOldId(THE_SECRETARY)
    const other = await anAgentWithAnOldId(THE_SECRETARY)
    const naming = (secretary: Agent, id: string) => ({ secretary: { kind: 'agent', id: secretary.id }, area: 'A made-up area.', restsOn, supervisors: [{ agent: { kind: 'agent', id }, area: 'A made-up line.' }] })
    const filed = await call('POST', '/api/records', PERSON, { kind: 'secretary_duties', title: 'Made-up duties naming a supervisor', data: naming(one, supervisor.old) })
    expect(filed.status, filed.raw).toBe(201)
    const twice = await call('POST', '/api/records', PERSON, { kind: 'secretary_duties', title: 'Made-up duties naming it again', data: naming(other, supervisor.id) })
    expect(twice.status, twice.raw).toBe(409)
    expect(twice.body.error).toContain(supervisor.handle)
  })

  it('still refuses a supervisor named by a made-up id with 400', async () => {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const restsOn = [await aDecision('The made-up secretary answers for nobody real.')]
    const filed = await call('POST', '/api/records', PERSON, { kind: 'secretary_duties', title: 'Made-up duties naming nobody', data: { secretary: { kind: 'agent', id: secretary.id }, area: 'A made-up area.', restsOn, supervisors: [{ agent: { kind: 'agent', id: MADE_UP }, area: 'A made-up line.' }] } })
    expect(filed.status, filed.raw).toBe(400)
    expect(filed.body.error).toContain(MADE_UP)
  })
})

describe('4. the starting door and the run-key door', () => {
  const entry = (handle: string, state: string, more: Record<string, unknown> = {}) => ({
    state, askedAt: '2026-10-31 13:00:00', askedBy: { who: { kind: 'agent', id: 'made-up-asker' }, session: 'made-up-asking-run' }, handle,
    brief: { path: '/made/up/brief.md', sha256: 'a'.repeat(64), bytes: 1 }, sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up' }, ...more,
  })
  /** A supervisor's run, in the state given, holding one worker run under the key given. */
  function aSupervisorsRun(key: string, value: Record<string, unknown>, state: string): string {
    const run = t.api.createRecord({ kind: 'session', workspaceId: 'default', title: 'A made-up supervisor run', origin: 'fixture', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
    setData(run, { ...data(run), state, workerRuns: { [key]: value } })
    return run
  }
  async function aLauncherRun(run: string, worker: string): Promise<string> {
    const filed = await call('POST', '/api/records', AS_THE_WORKER(), {
      kind: 'session',
      title: 'A made-up launcher run',
      data: { state: 'running', runtime: 'round-launcher', doing: 'starting a made-up worker run; this run runs no model', workingDirectory: '/made/up', startedByMoleOffice: true, extra: { purpose: 'worker', run, worker } },
    })
    expect(filed.status, filed.raw).toBe(201)
    return String(filed.body.record.id)
  }
  const starting = (run: string, agent: string, wrapper: string) => call('POST', `/api/worker/worker-runs/${run}/starting`, AS_THE_WORKER(), { agent, wrapper })

  it('finds the worker by an old id, and takes a launcher naming the other spelling, either way round', async () => {
    const worker = await anAgentWithAnOldId(THE_WORKER)
    // THE ASKING RUN HAS ENDED, so a door that has found the worker and the launcher stops there, at the next check.
    for (const [agent, named] of [[worker.old, worker.old], [worker.id, worker.old], [worker.old, worker.id]] as const) {
      const run = aSupervisorsRun(worker.old, entry(worker.handle, 'wanted'), 'finished')
      const reply = await starting(run, agent, await aLauncherRun(run, named))
      expect(reply.status, `${agent} with a launcher naming ${named}: ${reply.raw}`).toBe(409)
      expect(reply.body.error, `${agent} with a launcher naming ${named}`).toContain('which asked for it, is no longer running')
      expect(Object.keys(data(run).workerRuns)).toEqual([worker.old])
      expect(data(run).workerRuns[worker.old].state).toBe('failed')
    }
  })

  it('mints the worker its key under a launcher naming the old id, for an ask kept under the canonical id', async () => {
    const worker = await anAgentWithAnOldId(THE_WORKER)
    const run = aSupervisorsRun(worker.id, entry(worker.handle, 'wanted'), 'running')
    const launcher = await aLauncherRun(run, worker.old)
    setData(run, { ...data(run), workerRuns: { [worker.id]: entry(worker.handle, 'starting', { starting: { at: '2026-10-31 13:00:01', wrapper: launcher } }) } })
    const filed = await call('POST', '/api/records', AS_THE_WORKER(launcher), {
      kind: 'session',
      title: 'The made-up worker run',
      data: { state: 'running', runtime: 'claude-code', servingAgentId: worker.id, servingAgent: worker.handle, parentAttachment: run },
    })
    expect(filed.status, filed.raw).toBe(201)
    expect(data(run).workerRuns[worker.id], JSON.stringify(data(run).workerRuns)).toMatchObject({ state: 'started', started: { run: filed.body.record.id } })
  })

  it('still refuses a launcher naming a made-up worker, and a made-up worker', async () => {
    const worker = await anAgentWithAnOldId(THE_WORKER)
    const run = aSupervisorsRun(worker.old, entry(worker.handle, 'wanted'), 'finished')
    const madeUpLauncher = await starting(run, worker.id, await aLauncherRun(run, MADE_UP))
    expect(madeUpLauncher.status, madeUpLauncher.raw).toBe(409)
    expect(madeUpLauncher.body.error).toContain('is not a launcher run')
    const madeUpWorker = await starting(run, MADE_UP, await aLauncherRun(run, MADE_UP))
    expect(madeUpWorker.status, madeUpWorker.raw).toBe(409)
    expect(madeUpWorker.body.error).toContain('holds no ask')
    expect(data(run).workerRuns[worker.old].state).toBe('wanted')
  })
})

describe("5. a goal's filed_by", () => {
  const aGoal = (filedBy?: string) => ({
    kind: 'goal',
    title: 'A made-up goal',
    data: { horizon: 'short', what: 'A made-up thing is done.', owner: THE_TEST_OFFICES_OWNER.id, state: 'open', ...(filedBy === undefined ? {} : { filed_by: filedBy }) },
  })

  it("takes the caller's old id, and stores it as sent", async () => {
    const filer = await anAgentWithAnOldId(THE_WORKER)
    const filed = await call('POST', '/api/records', asAgent(filer.id, filer.key), aGoal(filer.old))
    expect(filed.status, filed.raw).toBe(201)
    expect(data(String(filed.body.record.id)).filed_by).toBe(filer.old)
  })

  it('still refuses a made-up filed_by with 403', async () => {
    const filer = await anAgentWithAnOldId(THE_WORKER)
    const filed = await call('POST', '/api/records', asAgent(filer.id, filer.key), aGoal(MADE_UP))
    expect(filed.status, filed.raw).toBe(403)
  })

  it('stores the name the request was made under, and the reader reads each form stored as a stamp', async () => {
    const filer = await anAgentWithAnOldId(THE_WORKER)
    const { readRecordIdentities } = await import('../src/server/lib/registry-aliases/historical-reader.ts')
    const forms = [[asOne(filer), undefined, filer.handle], [asAgent(filer.id, filer.key), undefined, filer.id], [asAgent(filer.id, filer.key), filer.old, filer.old]] as const
    for (const [headers, sent, stored] of forms) {
      const filed = await call('POST', '/api/records', headers, aGoal(sent))
      expect(filed.status, filed.raw).toBe(201)
      const goal = data(String(filed.body.record.id))
      expect(goal.filed_by).toBe(stored)
      const read = readRecordIdentities(t.client.sqlite, 'goal', goal).found.filter((one) => one.path === 'data.filed_by')
      const canonical = stored === filer.old ? filer.id : stored
      expect(read, stored).toEqual([{ path: 'data.filed_by', as: 'value', stored, canonical, site: 'goal.filed_by', parse: 'stamp' }])
    }
  })
})

describe('6. saving default appearances', () => {
  it('writes the agent an old id names once, and skips a made-up id as missing', async () => {
    const mole = await anAgentWithAnOldId(THE_WORKER)
    t.client.sqlite.prepare('UPDATE agents SET pixel_appearance = NULL WHERE id = ?').run(mole.id)
    const preview = await call('POST', '/api/office/appearance-defaults/preview', PERSON, {})
    expect(preview.status, preview.raw).toBe(200)
    const plan = { ...preview.body.plan, agentIds: [mole.old, mole.id, MADE_UP] }
    const saved = await call('POST', '/api/office/appearance-defaults/save', PERSON, { plan })
    expect(saved.status, saved.raw).toBe(200)
    expect(saved.body.updated).toEqual([mole.old])
    expect(saved.body.skipped.map((one: { agentId: string; code: string }) => [one.agentId, one.code])).toEqual([[mole.id, 'already-saved'], [MADE_UP, 'missing']])
    expect((t.client.sqlite.prepare('SELECT pixel_appearance FROM agents WHERE id = ?').get(mole.id) as { pixel_appearance: string | null }).pixel_appearance).not.toBeNull()
  })
})

describe("7. the list of every secretary's duties", () => {
  /** A duties record the person makes for a made-up secretary, then stored under `storedAs`, as bytes written before the re-mint. */
  async function aDutiesRecordStoredUnder(storedAs: (secretary: Agent) => string): Promise<{ secretary: Agent; record: string }> {
    const secretary = await anAgentWithAnOldId(THE_SECRETARY)
    const put = await call('PUT', `/api/secretaries/${secretary.id}/duties`, PERSON, {
      area: 'A made-up listed area.',
      restsOn: [await aDecision('The made-up secretary keeps a made-up listed area.')],
    })
    expect(put.status, put.raw).toBe(201)
    const record = String(put.body.record.id)
    setData(record, { ...data(record), secretary: { kind: 'agent', id: storedAs(secretary) } })
    return { secretary, record }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const theList = async (): Promise<any> => {
    const list = await call('GET', '/api/secretaries/duties', PERSON)
    expect(list.status, list.raw).toBe(200)
    return list.body
  }

  it('lists a record stored under an old id under its secretary, and not under notASecretaryNow', async () => {
    const { secretary, record } = await aDutiesRecordStoredUnder((one) => one.old)
    const list = await theList()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(list.secretaries.find((one: any) => one.agent.id === secretary.id)?.duties?.recordId).toBe(record)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(list.notASecretaryNow.map((one: any) => one.duties.recordId)).not.toContain(record)
  })

  it("says of a record under an old id of an agent that is no secretary what that agent is, and of a made-up id that no agent has it", async () => {
    const worker = await anAgentWithAnOldId(THE_WORKER)
    const underTheWorker = await aDutiesRecordStoredUnder(() => worker.old)
    const underNobody = await aDutiesRecordStoredUnder(() => MADE_UP)
    const list = await theList()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listed = (record: string) => list.notASecretaryNow.find((one: any) => one.duties.recordId === record)
    expect(listed(underTheWorker.record)).toMatchObject({ duties: { secretary: worker.old }, why: `${worker.handle} does not hold the secretary card now.` })
    expect(listed(underNobody.record)).toMatchObject({ duties: { secretary: MADE_UP }, why: `No agent has the registry id ${MADE_UP}.` })
  })
})
