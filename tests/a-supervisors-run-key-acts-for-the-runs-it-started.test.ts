// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR'S RUN KEY ACTS FOR THE RUNS OF AGENTS IT REGISTERED AND STARTED, WHILE THOSE RUNS RUN. The owner's
 * decision, item 7 (29 September 2026), on problem 296sqTPPdWsQ: an in-process subagent shares its supervisor's
 * environment, so it sends the supervisor's run key and names itself and its own run, and no key is put on
 * disk.
 *
 *   1. The supervisor's run key, with the subagent's name and its running run in the headers, writes as the subagent in
 *      that run, and the change row still names whose key it was. Without the run named, it is refused as before.
 *   2. Not for a run that has ended.
 *   3. Not for a run that was not started from the run whose key it is.
 *   4. Not for an agent its holder did not register.
 *   5. Not with the supervisor's own registration key: only a run key has a run whose children it may act for.
 *   6. Not once the supervisor's own run has ended: its key is revoked and proves nobody.
 *
 * Each refusal says which part of the rule did not hold. Every agent is registered through POST /api/agents/started,
 * and every request goes through the real doors with `app.inject`. No assertion prints a key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. `letARunKeyActForTheRunsItStarted()` taken out of `buildApp` (src/server/index.ts): every case goes red, because
 *      nothing acts for anything and no refusal names a part of the rule.
 *   b. The ended-run condition taken out of src/server/lib/acting-for.ts: case 2 goes red.
 *   c. The parent run's own key not compared with the key the request carries: cases 5 and 6 go red, because the
 *      supervisor's registration key then acts, and case 6 counts that second write. (Case 3's run names no run as its
 *      parent, which is refused either way.)
 *   d. The registered-starter condition taken out: case 4 goes red.
 *   e. The acting-for branch of `provedHolder` taken out of `actorFrom` (src/server/lib/http.ts): cases 1 and 6 go red
 *      on the change row.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null): boolean {
  return value !== null && /^[0-9a-f]{64}$/.test(value)
}

/** An agent's own headers: its name, and its key and its run where it sends them. */
function asAgent(handle: string, key?: string, session?: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** Register an agent through the starter door, as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string>, role?: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** File a running session serving `handle`, with the headers given, and hand back its id and any key it was minted. */
async function fileARun(handle: string, headers: Record<string, string>, extra: Record<string, unknown> = {}): Promise<{ id: string; runKey: string | null }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return {
    id: String((filed.body['record'] as { id?: string } | undefined)?.id ?? ''),
    runKey: (filed.body['runKey'] as { key?: string } | undefined)?.key ?? null,
  }
}

/** Write a note with the headers given, and read the change row it left: who, in which run, and whose key proved it. */
async function writeANote(
  headers: Record<string, string>,
  title: string,
): Promise<{ status: number; body: Record<string, unknown>; row: { type: string; id: string; session: string | null; holder: unknown } | undefined }> {
  const note = await ask('POST', '/api/records', headers, { kind: 'note', title, data: { body: title } })
  const id = String((note.body['record'] as { id?: string } | undefined)?.id ?? '')
  const row = t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id, session_id AS session, proved_holder AS holder FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(id) as { type: string; id: string; session: string | null; holder: string | null } | undefined
  return { status: note.status, body: note.body, row: row === undefined ? undefined : { ...row, holder: row.holder === null ? null : JSON.parse(row.holder) } }
}

/** The words of a refusal, for the assertions on what it names. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

let launcherKey = ''
let supervisorsOwnKey = ''
let supervisorsRunKey = ''
let supervisorsRun = ''
let subagentsRun = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE LAUNCHER STARTS THE SUPERVISOR, AND THE SUPERVISOR'S RUN IS MINTED A KEY ON THE STARTER'S PATH.
  launcherKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  supervisorsOwnKey = await register('a-supervisor', { ...asAgent('the-launcher', launcherKey) }, 'supervisor')
  const run = await fileARun('a-supervisor', asAgent('the-launcher', launcherKey))
  expect(isAKey(run.runKey), 'the supervisor’s run was minted no key').toBe(true)
  supervisorsRun = run.id
  supervisorsRunKey = run.runKey ?? ''
  // THE SUPERVISOR REGISTERS ITS SUBAGENT WITH ITS RUN KEY, AND FILES THE SUBAGENT'S RUN FROM ITS OWN.
  await register('a-subagent', asAgent('a-supervisor', supervisorsRunKey))
  const sub = await fileARun('a-subagent', asAgent('a-supervisor', supervisorsRunKey, supervisorsRun), { parentAttachment: supervisorsRun })
  subagentsRun = sub.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a supervisor’s run key acts for the runs it started', () => {
  it('writes as the subagent in its running run, and the change row names whose key it was', async () => {
    const wrote = await writeANote(asAgent('a-subagent', supervisorsRunKey, subagentsRun), 'written by the subagent')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.type).toBe('agent')
    expect(wrote.row?.id).toBe('a-subagent')
    expect(wrote.row?.session).toBe(subagentsRun)
    // THE KEY WAS THE SUPERVISOR'S, and the row says so.
    expect(wrote.row?.holder, 'the change row does not name whose key it was').toEqual({ id: idOf('a-supervisor'), how: 'an-agent-key', claimed: 'a-subagent' })
    // AND A READ, as the subagent.
    const read = await ask('GET', `/api/records/${subagentsRun}`, asAgent('a-subagent', supervisorsRunKey, subagentsRun))
    expect(read.status, said(read.body)).toBe(200)

    // WITHOUT ITS RUN NAMED, it is one agent's key under another's name, refused as before, and nothing is said of a run.
    const bare = await writeANote(asAgent('a-subagent', supervisorsRunKey), 'no run named')
    expect(bare.status).toBe(403)
    expect(said(bare.body)).toContain('the two must name the same agent')
    expect(said(bare.body)).not.toContain('madeUpobketi')
  })

  it('does not act for a run that has ended', async () => {
    const ended = await fileARun('a-subagent', asAgent('a-supervisor', supervisorsRunKey, supervisorsRun), { parentAttachment: supervisorsRun })
    const over = await ask('PATCH', `/api/records/${ended.id}`, asAgent('a-supervisor', supervisorsRunKey), { dataPatch: { state: 'crashed' } })
    expect(over.status, said(over.body)).toBe(200)
    const wrote = await writeANote(asAgent('a-subagent', supervisorsRunKey, ended.id), 'into an ended run')
    expect(wrote.status).toBe(403)
    expect(said(wrote.body)).toContain(`run ${ended.id} has ended`)
  })

  it('does not act for a run that was not started from the run whose key it is', async () => {
    // NO PARENT AT ALL. It named an id that is no run until the records door began refusing a parent that is no session
    // the caller may name (problem NlOyicZP_Jjt); a run with no parent was not started from the key's run either.
    const elsewhere = await fileARun('a-subagent', asAgent('a-supervisor', supervisorsRunKey, supervisorsRun))
    const wrote = await writeANote(asAgent('a-subagent', supervisorsRunKey, elsewhere.id), 'from another run')
    expect(wrote.status).toBe(403)
    expect(said(wrote.body)).toContain('was not started from the run this key belongs to')
  })

  it('does not act for an agent its holder did not register', async () => {
    // THE LAUNCHER'S AGENT, NOT THE SUPERVISOR'S, with a run under the supervisor's run all the same. The launcher files
    // it: since the filing door (round 30) the supervisor, which is not above the launcher's agent, may not.
    await register('the-launchers-own', asAgent('the-launcher', launcherKey))
    const run = await fileARun('the-launchers-own', asAgent('the-launcher', launcherKey), { parentAttachment: supervisorsRun })
    expect(run.id, 'the launcher could not file a run of its own agent').not.toBe('')
    const wrote = await writeANote(asAgent('the-launchers-own', supervisorsRunKey, run.id), 'for somebody else’s agent')
    expect(wrote.status).toBe(403)
    expect(said(wrote.body)).toContain('"the-launchers-own" was not registered by the agent this key belongs to')
  })

  it('does not act with the supervisor’s own registration key, which is no run’s key', async () => {
    const wrote = await writeANote(asAgent('a-subagent', supervisorsOwnKey, subagentsRun), 'with the registration key')
    expect(wrote.status).toBe(403)
    expect(said(wrote.body)).toContain('was not started from the run this key belongs to')
  })

  it('stops acting once the supervisor’s own run has ended, because its key goes with it', async () => {
    const over = await ask('PATCH', `/api/records/${supervisorsRun}`, asAgent('the-launcher', launcherKey), { dataPatch: { state: 'crashed' } })
    expect(over.status, said(over.body)).toBe(200)
    const wrote = await writeANote(asAgent('a-subagent', supervisorsRunKey, subagentsRun), 'after the supervisor’s run ended')
    // A REVOKED KEY PROVES NOBODY: whatever the name path answers, no key proved this write.
    expect(wrote.row?.holder ?? null, 'a revoked key still proved the write').toBeNull()
    const proved = t.client.sqlite
      .prepare("SELECT COUNT(DISTINCT record_id) AS n FROM changes WHERE actor_id = 'a-subagent' AND session_id = ? AND proved_holder IS NOT NULL")
      .get(subagentsRun) as { n: number }
    expect(proved.n, 'only the write made while both runs ran was proved by the supervisor’s key').toBe(1)
  })
})
