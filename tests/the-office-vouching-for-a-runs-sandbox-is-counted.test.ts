// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE VOUCHES FOR A RUN'S SANDBOX, AND COUNTS EACH TIME IT CANNOT. Wave 13r round O, BS-28 of round H's table
 * (d6SnhY430pQe and XTEcIEuD-E1o).
 *
 * The gate the-office-vouches-for-a-runs-sandbox is decided in one place, `theSandboxFolderOf` in
 * src/server/lib/sealed-tip.ts, and counted there. It is met when a run names a sandbox and the office cannot vouch for
 * it. A run that names none, and a sandbox the office vouches for, are not encounters, and nor is a new run's field held
 * against its filer's, which is not that run's own sandbox (aGqCz6yk3aGV).
 *
 * A READER THAT REFUSES INSIDE A WRITE loses that count when the write is taken back. It hands its refusal to
 * `aRefusalForAnUnvouchedSandbox`, which hands it to `gateMetAgainOnceTheWriteIsTakenBack` in
 * src/server/lib/gate-counts.ts, so the count is made once more after the write is taken back, and only then. Outside a
 * write that function does nothing, since the first count was kept, and in a check of a write it does nothing either.
 * The two readers that do so are the write from a run (src/server/lib/records.ts) and the hand start
 * (src/server/lib/worker-runs.ts). Each refusal keeps its status, its sentence and its code.
 *
 * The sandboxes are rows in the resources ledger as `tools/sandbox.mjs up` registers them; their folders are made-up
 * names and nothing is made on disk. Every request goes through the real doors with `app.inject`. No assertion prints a
 * key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   In src/server/lib/sealed-tip.ts:
 *   a. The count taken out of `theSandboxFolderOf`: the first case goes red, and so does the third at the PATCH, which
 *      asks before its write begins, so the count kept there is the one `theSandboxFolderOf` makes.
 *   b. A run with no sandbox field counted too: the first case goes red.
 *   c. A sandbox the office vouches for counted too: the first case goes red, and so does the fourth at the PATCH.
 *   d. `aRefusalForAnUnvouchedSandbox` hands every refusal on, whether or not the run names a sandbox: the hand start's
 *      run with no field is counted, and the last case goes red.
 *   In src/server/lib/gate-counts.ts, `gateMetAgainOnceTheWriteIsTakenBack`:
 *   e. It counts nothing at all: the second, third and last cases go red.
 *   f. It counts outside a write as well: the kept count is made twice, and the second and third cases go red.
 *   g. It counts in a check of a write as well: the second and third cases go red.
 *   h. It hands on a count made twice: the second, third and last cases go red.
 *   In src/server/lib/records.ts:
 *   i. The write from a run's refusal not handed on: the third case goes red.
 *   j. The new run's field's refusal handed on with that field as the run: the fourth case goes red.
 *   k. The new run's field read by `theSandboxFolderOf`, the form that counts: the fourth case goes red at the PATCH. At
 *      the POST the count would go with the refused write, so the PATCH is what shows it.
 *   In src/server/lib/worker-runs.ts:
 *   l. The hand start's refusal not handed on: the last case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const GATE = 'the-office-vouches-for-a-runs-sandbox'
const ALPHA = '/synthetic/sandboxes/alpha'
const BETA = '/synthetic/sandboxes/beta'
/** Words of the refusals, enough to tell which one answered. */
const NOT_VOUCHED_FOR = 'the office cannot vouch for that sandbox'
const NOT_THE_FILERS_SANDBOX = 'A run filed from inside a sandbox is in that same sandbox'

let t: TestDb
let app: FastifyInstance | undefined
beforeEach(async () => { t = await freshDb() })
afterEach(async () => { await app?.close(); app = undefined; t.close() })

/** The gate's counts over every day, read past every door. */
function counted(): {would_stop: number; stopped: number; reminded: number} {
  return t.client.sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS would_stop, COALESCE(SUM(stopped), 0) AS stopped, COALESCE(SUM(reminded), 0) AS reminded FROM gate_counts WHERE gate = ?').get(GATE) as {would_stop: number; stopped: number; reminded: number}
}

/** Every gate's counts, to say a write left them all as they were. */
function everyCount(): unknown[] {
  return t.client.sqlite.prepare('SELECT gate, day, would_stop, stopped, reminded, ignored, heeded FROM gate_counts ORDER BY gate, day').all()
}

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named. */
function aContainerRow(folder: string): string {
  const id = `row-${Math.random().toString(36).slice(2, 10)}`
  const name = folder.split('/').at(-1)!
  t.client.sqlite
    .prepare(
      'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by, released_at) ' +
        "VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-18 10:00:00', 'agent:fixture', NULL)",
    )
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)
  return id
}

/** The sandbox field as tools/sandbox-common.mjs writes it. */
const sandbox = (row: string, folder: string): Record<string, unknown> => ({ template: 'mole-office-dev', container: row, folder })

it('counts a run whose sandbox the office cannot vouch for, once each time it is asked, and nothing else', async () => {
  const { theSandboxFolderOf } = await import('../src/server/lib/sealed-tip.ts')
  const alpha = aContainerRow(ALPHA)
  // NOT ENCOUNTERS: no field, an empty one, and a sandbox the office vouches for.
  expect(theSandboxFolderOf({})).toBeNull()
  expect(theSandboxFolderOf({ sandbox: null })).toBeNull()
  expect(theSandboxFolderOf({ sandbox: sandbox(alpha, ALPHA) })).toBe(ALPHA)
  expect(counted()).toEqual({ would_stop: 0, stopped: 0, reminded: 0 })
  // ENCOUNTERS, each counted once and as stopped, the gate's one position: the older field with no folder, a row nobody
  // registered, and another sandbox's row.
  expect(theSandboxFolderOf({ sandbox: { template: 'mole-office-dev', container: alpha } })).toBeNull()
  expect(counted()).toEqual({ would_stop: 1, stopped: 1, reminded: 0 })
  expect(theSandboxFolderOf({ sandbox: sandbox('a-row-nobody-registered', ALPHA) })).toBeNull()
  expect(theSandboxFolderOf({ sandbox: sandbox(alpha, BETA) })).toBeNull()
  expect(counted()).toEqual({ would_stop: 3, stopped: 3, reminded: 0 })
})

it('makes a count its write took back once, after the write is taken back, and nothing outside a write or in a check', async () => {
  const { gateMet, gateMetAgainOnceTheWriteIsTakenBack, countARefusalItsWriteTookBack } = await import('../src/server/lib/gate-counts.ts')
  const { whileChecking } = await import('../src/server/lib/only-checking.ts')
  const { sqlite } = await import('../src/server/db/client.ts')
  const count = (): void => { gateMet(GATE) }
  // OUTSIDE A WRITE the site's own count is kept, so handing its refusal on counts nothing more.
  count()
  const outside = gateMetAgainOnceTheWriteIsTakenBack(new Error('a refusal outside a write'), count)
  countARefusalItsWriteTookBack(outside)
  expect(counted().would_stop).toBe(1)
  // INSIDE A WRITE the site's count goes with the write, and is made once more after it, however often the refusal is
  // handed on and however often the error handler asks.
  const inside = new Error('a refusal inside a write')
  expect(() => sqlite.transaction(() => {
    count()
    throw gateMetAgainOnceTheWriteIsTakenBack(gateMetAgainOnceTheWriteIsTakenBack(inside, count), count)
  })()).toThrow(inside)
  expect(counted().would_stop).toBe(1)
  countARefusalItsWriteTookBack(inside)
  expect(counted().would_stop).toBe(2)
  countARefusalItsWriteTookBack(inside)
  expect(counted().would_stop).toBe(2)
  // IN A CHECK OF A WRITE nothing is counted, before or after.
  const checked = new Error('a refusal in a check')
  expect(() => whileChecking(() => sqlite.transaction(() => {
    count()
    throw gateMetAgainOnceTheWriteIsTakenBack(checked, count)
  })())).toThrow(checked)
  countARefusalItsWriteTookBack(checked)
  expect(counted()).toEqual({ would_stop: 2, stopped: 2, reminded: 0 })
})

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
function asAgent(handle: string, key?: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }), ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}
async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app!.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}
function said(body: Record<string, unknown>): string { return String(body['error'] ?? body['message'] ?? JSON.stringify(body)) }
async function register(handle: string, by: Record<string, string>, role: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(/^[0-9a-f]{64}$/.test(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}
function theRecordOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf(handle)) as { id: string }).id
}
const aRunFiling = (handle: string, extra: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ kind: 'session', title: `${handle} at work`, data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra } })
async function fileARun(handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<{ status: number; body: Record<string, unknown>; id: string; runKey: string }> {
  const filed = await ask('POST', '/api/records', headers, aRunFiling(handle, extra))
  return { ...filed, id: String((filed.body['record'] as { id?: string } | undefined)?.id ?? ''), runKey: String((filed.body['runKey'] as { key?: string } | undefined)?.key ?? '') }
}

/**
 * The chain tests/a-run-names-only-the-sandbox-it-was-filed-from.test.ts builds: the secretary files a supervisor's run
 * from its terminal, and the person puts the sandbox field on it. The supervisor's run in alpha registers its worker.
 */
async function theChain(): Promise<{ alpha: string; supervisorKey: string; inAlpha: { id: string; runKey: string }; aSupervisorsRunIn: (field: Record<string, unknown> | null) => Promise<{ id: string; runKey: string }> }> {
  app = (await apiApp()).app
  await app.ready()
  const alpha = aContainerRow(ALPHA)
  const secretaryKey = await register('the-secretary', AS_THE_PERSON, 'secretary')
  const supervisorKey = await register('a-supervisor', asAgent('the-secretary', secretaryKey), 'supervisor')
  const terminal = await ask('POST', '/api/records', asAgent('the-secretary'), {
    kind: 'session', title: 'a terminal of the person’s, bound to the-secretary',
    data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: 'default', agentId: theRecordOf('the-secretary') }] },
  })
  expect(terminal.status, said(terminal.body)).toBe(201)
  const secretarysTerminal = String((terminal.body['record'] as { id: string }).id)
  async function aSupervisorsRunIn(field: Record<string, unknown> | null): Promise<{ id: string; runKey: string }> {
    const run = await fileARun('a-supervisor', asAgent('the-secretary', secretaryKey, secretarysTerminal))
    expect(run.status, said(run.body)).toBe(201)
    if (field !== null) {
      const put = await ask('PATCH', `/api/records/${run.id}`, AS_THE_PERSON, { dataPatch: { sandbox: field } })
      expect(put.status, said(put.body)).toBe(200)
    }
    return run
  }
  const inAlpha = await aSupervisorsRunIn(sandbox(alpha, ALPHA))
  await register('a-worker', asAgent('a-supervisor', inAlpha.runKey), 'worker')
  return { alpha, supervisorKey, inAlpha, aSupervisorsRunIn }
}

it('keeps one count for each refusal of a write from a run it cannot vouch for, at the POST and the PATCH, and none for a check', async () => {
  const { alpha, aSupervisorsRunIn } = await theChain()
  // A RUN WHOSE OWN FIELD NAMES NO FOLDER files a worker's run, and is refused: the office cannot vouch for its sandbox.
  const old = await aSupervisorsRunIn({ template: 'mole-office-dev', container: alpha })
  const fromOld = asAgent('a-supervisor', old.runKey, old.id)
  const before = counted().would_stop
  const refused = await fileARun('a-worker', fromOld, { sandbox: sandbox(alpha, ALPHA) })
  expect(refused.status, said(refused.body)).toBe(403)
  expect(said(refused.body)).toContain(NOT_VOUCHED_FOR)
  expect(said(refused.body)).toContain(old.id)
  // THE SAME REFUSAL, NO CODE: the long sentence and the short one, as before the count was handed on.
  expect(Object.keys(refused.body).sort()).toEqual(['error', 'reason'])
  expect(counted().would_stop - before).toBe(1)
  // THE SAME REFUSAL AGAIN, at once, counts one more and no more.
  const again = await fileARun('a-worker', fromOld, { sandbox: sandbox(alpha, ALPHA) })
  expect(again.status, said(again.body)).toBe(403)
  expect(again.body).toEqual(refused.body)
  expect(counted().would_stop - before).toBe(2)
  // A CHECK OF THE SAME FILING is refused alike and counts nothing.
  const checked = await ask('POST', '/api/records/check', fromOld, aRunFiling('a-worker', { sandbox: sandbox(alpha, ALPHA) }))
  expect(checked.status, said(checked.body)).toBe(403)
  expect(checked.body).toEqual(refused.body)
  expect(counted().would_stop - before).toBe(2)
  // THE FIRST PATCH that puts the field on a run filed from there with none is refused the same way, and counted once.
  const bare = await fileARun('a-worker', fromOld)
  expect(bare.status, said(bare.body)).toBe(201)
  const atThePatch = counted().would_stop
  const patched = await ask('PATCH', `/api/records/${bare.id}`, fromOld, { dataPatch: { sandbox: sandbox(alpha, ALPHA) } })
  expect(patched.status, said(patched.body)).toBe(403)
  expect(patched.body).toEqual(refused.body)
  expect(counted().would_stop - atThePatch).toBe(1)
})

it('counts nothing when a new run names a container row nobody registered, which is not the run’s own sandbox', async () => {
  const { inAlpha } = await theChain()
  const fromAlpha = asAgent('a-supervisor', inAlpha.runKey, inAlpha.id)
  const bare = await fileARun('a-worker', fromAlpha)
  expect(bare.status, said(bare.body)).toBe(201)
  const before = everyCount()
  const refused = await fileARun('a-worker', fromAlpha, { sandbox: sandbox('a-row-nobody-registered', ALPHA) })
  expect(refused.status, said(refused.body)).toBe(403)
  expect(said(refused.body)).toContain(NOT_THE_FILERS_SANDBOX)
  // AND AT THE FIRST PATCH, which asks before its write begins, so a count made there would be kept.
  const patched = await ask('PATCH', `/api/records/${bare.id}`, fromAlpha, { dataPatch: { sandbox: sandbox('a-row-nobody-registered', ALPHA) } })
  expect(patched.status, said(patched.body)).toBe(403)
  expect(said(patched.body)).toContain(NOT_THE_FILERS_SANDBOX)
  expect(everyCount()).toEqual(before)
})

it('keeps one count when a hand start is refused because the asking run’s sandbox cannot be vouched for, and none for a run that names none', async () => {
  const { supervisorKey, aSupervisorsRunIn } = await theChain()
  const worker = await ask('POST', '/api/agents/started', asAgent('a-supervisor', supervisorKey), { handle: 'a-hand-worker', name: 'a-hand-worker', noKey: true })
  expect(worker.status, said(worker.body)).toBe(201)
  const handStart = (askedBy: string, brief?: string) =>
    ask('POST', '/api/agents/a-hand-worker/hand-run', asAgent('a-supervisor', supervisorKey), { askedBy, ...(brief === undefined ? {} : { brief }) })
  const unvouched = await aSupervisorsRunIn(sandbox('a-row-nobody-registered', ALPHA))
  const noField = await aSupervisorsRunIn(null)
  // THE SAME REFUSAL as one the wrapper never touches: a hand start with no brief is refused by the hand start's own
  // sentence, at the same status, with no code.
  const noBrief = await handStart(unvouched.id)
  expect(noBrief.status, said(noBrief.body)).toBe(403)
  const before = counted().would_stop
  const refused = await handStart(unvouched.id, '/synthetic/briefs/a-brief.md')
  expect(refused.status, said(refused.body)).toBe(403)
  expect(refused.body).toEqual(noBrief.body)
  expect(counted().would_stop - before).toBe(1)
  // A RUN THAT NAMES NO SANDBOX is refused alike, and is not an encounter.
  const none = await handStart(noField.id, '/synthetic/briefs/a-brief.md')
  expect(none.status, said(none.body)).toBe(403)
  expect(none.body).toEqual(noBrief.body)
  expect(counted().would_stop - before).toBe(1)
})
