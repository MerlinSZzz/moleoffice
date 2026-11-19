// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN NAMES ONLY THE SANDBOX IT WAS FILED FROM. Round 63, item 2, on the rule chosen (option 2).
 *
 * A files seal trusts a run's `sandbox` field to say where the run could not have written. Before this, any agent's key
 * could put any sandbox on a run it filed. The rule is asked at the write that puts the field on a run: the POST that
 * files it, or the first PATCH. The session the write came from is its x-mole-office-session, which a keyed write may
 * name only when its key holds that run (tests/a-session-header-is-bound-to-its-key.test.ts).
 *
 *   1. The person, the office's key and the person's tool key: as before.
 *   2. A WRITE FROM A SESSION THAT IS IN A SANDBOX names that same sandbox, or is refused, and the refusal names the
 *      container row. The same sandbox is the same folder and the same name. The row may be the current one or an
 *      earlier row of the same sandbox, before or after the container was made again. A session whose own sandbox the
 *      office cannot vouch for (src/server/lib/sealed-tip.ts, `theSandboxFolderOf`) names none.
 *   3. A WRITE FROM A SESSION THAT IS IN NO SANDBOX, or that names no session, is a host filing. It is admitted only with
 *      the secretary's own agent key, never a run's key and never a key acting for another run, from a running session
 *      that key holds by the agent's own clause of the session header's rule. Otherwise it is refused, naming the rule.
 *   4. A write with no key: as before.
 *
 * And the field is written once. Nothing after the filing changes a stored one: tools/sandbox-start.mjs writes it with
 * `--run` only where none is stored, and refuses a run that already names another. So every later write that changes it
 * is refused, naming that rule, before any other rule is asked, and only the person may change it.
 *
 * Every request goes through the real doors with `app.inject`. No assertion prints a key. The sandboxes are rows in the
 * resources ledger as `tools/sandbox.mjs up` registers them; their folders are names and nothing is made on disk.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone, in src/server/lib/records.ts unless it says otherwise
 * ---------------------------------------------------------------------------------------
 *
 *   a. Any agent key admitted in a host filing (case 3): "a supervisor's own key", "a worker's own key" and the
 *      grandchild case go red.
 *   b. Every host filing refused: "the secretary's own key from its terminal" and "the coordinator's shape, with a sandbox field"
 *      go red. "the coordinator's shape, with no sandbox field" stays green: a filing with no field is not asked about one.
 *   c. The write-once check taken out, so the change is let through to the later checks: "a run key repoints its own
 *      run" goes red on the words it is refused with.
 *   d. The comparison of the two sandboxes taken out, so any sandbox the office can vouch for is admitted: "another
 *      sandbox's row" goes red, at the POST.
 *   e. The two sandboxes compared by container row rather than by folder: "a container made again" goes red.
 *   f. The filer's own sandbox not asked, only the new run's: "a filer whose sandbox names no folder" goes red.
 *   g. The filer's sandbox read as one nobody can vouch for: "in its own sandbox", "another sandbox's row" and "a
 *      container made again" go red.
 *   h. The PATCH door asking about the stored data rather than the new value: "another sandbox's row" goes red, at the
 *      PATCH, where the stored data has no sandbox.
 *   i. The rule asked of a filing that carries no sandbox field (the POST door's guard and the guard on an empty value
 *      taken out): "a filing with no sandbox field" goes red, and so do the cases whose own fixture files a run with no
 *      field from a sandbox or from the host.
 *   j. The rule asked of a write with no key: "a write with no key" goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** The words of each refusal, as the office says them. */
const NOT_THE_FILERS_SANDBOX = 'A run filed from inside a sandbox is in that same sandbox'
const THE_FILERS_SANDBOX_IS_NOT_VOUCHED_FOR = 'the office cannot vouch for that sandbox'
const ONLY_A_HOST_FILING = 'names a sandbox only when it is a host filing'
const WRITTEN_ONCE = "A run's sandbox is written once"

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
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

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a refusal, for the assertions on what it names. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent through the starter door, as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string>, role: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, said(made.body)).toBe(201)
  const key = String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return key
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

function theRecordOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf(handle)) as { id: string }).id
}

/** A container row as `tools/sandbox.mjs up` registers one on the host, for the folder named, open or released. */
function aContainerRow(folder: string, released = false): string {
  const id = `row-${Math.random().toString(36).slice(2, 10)}`
  const name = folder.split('/').at(-1)!
  t.client.sqlite
    .prepare(
      'INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by, released_at) ' +
        "VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-18 10:00:00', 'agent:fixture', ?)",
    )
    .run(id, `mole-office-sandbox-${name}`, `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`, released ? '2026-10-18 11:00:00' : null)
  return id
}

/** The sandbox field as tools/sandbox-common.mjs writes it. */
const sandbox = (row: string, folder: string): Record<string, unknown> => ({ template: 'mole-office-dev', container: row, folder })

/** A running session serving `handle`, filed with the headers given. Answers the reply, its id and any key it was minted. */
async function fileARun(
  handle: string,
  headers: Record<string, string>,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown>; id: string; runKey: string | null }> {
  const filed = await ask('POST', '/api/records', headers, {
    kind: 'session',
    title: `${handle} at work`,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
  return {
    ...filed,
    id: String((filed.body['record'] as { id?: string } | undefined)?.id ?? ''),
    runKey: (filed.body['runKey'] as { key?: string } | undefined)?.key ?? null,
  }
}

/** A terminal session an agent filed for itself with its own key, as the session hook files one: it serves nobody. */
async function aTerminalOf(handle: string, key: string): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(handle, key), { kind: 'session', title: `${handle} in a terminal`, data: { state: 'running', runtime: 'claude-code' } })
  expect(filed.status, said(filed.body)).toBe(201)
  return String((filed.body['record'] as { id: string }).id)
}

/**
 * A SUPERVISOR'S RUN IN A SANDBOX, AND ITS RUN KEY. The secretary files it from its terminal with no sandbox field, and the
 * person puts the field on it, so no fixture rests on the host filing the cases below are about (mutation b).
 */
async function aSupervisorsRunIn(field: Record<string, unknown>): Promise<{ id: string; runKey: string }> {
  const run = await fileARun('a-supervisor', asAgent('the-secretary', secretaryKey, secretarysTerminal))
  expect(run.status, said(run.body)).toBe(201)
  expect(isAKey(run.runKey), 'the supervisor’s run was minted no key').toBe(true)
  const put = await ask('PATCH', `/api/records/${run.id}`, AS_THE_PERSON, { dataPatch: { sandbox: field } })
  expect(put.status, said(put.body)).toBe(200)
  return { id: run.id, runKey: run.runKey ?? '' }
}

/**
 * A TERMINAL OF THE PERSON'S, BOUND TO AN AGENT: filed with no key, it ran as that agent and serves nobody. The secretary's
 * own key holds it by the agent's own clause, so a host filing comes from it, and no fixture rests on a keyed filing that
 * names no run (mutation i).
 */
async function aTerminalBoundTo(handle: string): Promise<string> {
  const terminal = await ask('POST', '/api/records', asAgent(handle), {
    kind: 'session',
    title: `a terminal of the person’s, bound to ${handle}`,
    data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: 'default', agentId: theRecordOf(handle) }] },
  })
  expect(terminal.status, said(terminal.body)).toBe(201)
  return String((terminal.body['record'] as { id: string }).id)
}

function sessionsTitled(title: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND title = ?").get(title) as { n: number }).n
}

function theSandboxOn(run: string): unknown {
  const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.sandbox') AS s FROM records WHERE id = ?").get(run) as { s: string | null }
  return row.s === null ? null : JSON.parse(row.s)
}

/** A refusal: 403, with the words given, and no session of that title stored. */
function expectRefused(wrote: { status: number; body: Record<string, unknown> }, words: string[], title?: string): void {
  expect(wrote.status, said(wrote.body)).toBe(403)
  for (const one of words) expect(said(wrote.body)).toContain(one)
  if (title !== undefined) expect(sessionsTitled(title), 'a refused filing was stored all the same').toBe(0)
}

const ALPHA = '/synthetic/sandboxes/alpha'
const BETA = '/synthetic/sandboxes/beta'
const GAMMA = '/synthetic/sandboxes/gamma'
let alpha = ''
let beta = ''
let gammaBefore = ''
let gammaAfter = ''

let secretaryKey = ''
let secretarysTerminal = ''
let supervisorKey = ''
let workerKey = ''
let leadKey = ''
/** The supervisor's run in sandbox alpha, and its run key. */
let inAlpha = ''
let inAlphaKey = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  alpha = aContainerRow(ALPHA)
  beta = aContainerRow(BETA)
  gammaBefore = aContainerRow(GAMMA, true)
  gammaAfter = aContainerRow(GAMMA)

  secretaryKey = await register('the-secretary', AS_THE_PERSON, 'secretary')
  supervisorKey = await register('a-supervisor', asAgent('the-secretary', secretaryKey), 'supervisor')
  await register('an-inspector', AS_THE_PERSON, 'inspector')
  secretarysTerminal = await aTerminalBoundTo('the-secretary')
  const run = await aSupervisorsRunIn(sandbox(alpha, ALPHA))
  inAlpha = run.id
  inAlphaKey = run.runKey
  // THE SUPERVISOR'S WORKER, REGISTERED FROM INSIDE THE SANDBOX with the run's key, as item 1's subagent is.
  workerKey = await register('a-worker', asAgent('a-supervisor', inAlphaKey), 'worker')
  // AND A SECOND SUPERVISOR UNDER IT, AND THAT ONE'S HELPER, so every agent above the helper in the chain of starters may
  // file a run for it.
  leadKey = await register('a-lead', asAgent('a-supervisor', inAlphaKey), 'supervisor')
  await register('a-helper', asAgent('a-lead', leadKey), 'worker')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a write from inside a sandbox names that sandbox', () => {
  it('files a run in its own sandbox, and puts its own sandbox on a run with the first PATCH', async () => {
    const filed = await fileARun('a-worker', asAgent('a-supervisor', inAlphaKey, inAlpha), { sandbox: sandbox(alpha, ALPHA) })
    expect(filed.status, said(filed.body)).toBe(201)
    expect(theSandboxOn(filed.id)).toEqual(sandbox(alpha, ALPHA))
    const bare = await fileARun('a-worker', asAgent('a-supervisor', inAlphaKey, inAlpha))
    expect(bare.status, said(bare.body)).toBe(201)
    const patched = await ask('PATCH', `/api/records/${bare.id}`, asAgent('a-supervisor', inAlphaKey, inAlpha), { dataPatch: { sandbox: sandbox(alpha, ALPHA) } })
    expect(patched.status, said(patched.body)).toBe(200)
    expect(theSandboxOn(bare.id)).toEqual(sandbox(alpha, ALPHA))
  })

  it("refuses another sandbox's row, by its id, on the POST and on the first PATCH", async () => {
    const title = 'a-worker sent to beta'
    const filed = await ask('POST', '/api/records', asAgent('a-supervisor', inAlphaKey, inAlpha), {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-worker'), servingAgent: 'a-worker', sandbox: sandbox(beta, BETA) },
    })
    expectRefused(filed, [NOT_THE_FILERS_SANDBOX, `"${beta}"`], title)
    const bare = await fileARun('a-worker', asAgent('a-supervisor', inAlphaKey, inAlpha))
    expect(bare.status, said(bare.body)).toBe(201)
    const patched = await ask('PATCH', `/api/records/${bare.id}`, asAgent('a-supervisor', inAlphaKey, inAlpha), { dataPatch: { sandbox: sandbox(beta, BETA) } })
    expectRefused(patched, [NOT_THE_FILERS_SANDBOX, `"${beta}"`])
    expect(theSandboxOn(bare.id)).toBeNull()
  })

  it('accepts a row of its own sandbox from before or after the container was made again', async () => {
    const before = await aSupervisorsRunIn(sandbox(gammaBefore, GAMMA))
    const toTheNewRow = await fileARun('a-worker', asAgent('a-supervisor', before.runKey, before.id), { sandbox: sandbox(gammaAfter, GAMMA) })
    expect(toTheNewRow.status, said(toTheNewRow.body)).toBe(201)
    const after = await aSupervisorsRunIn(sandbox(gammaAfter, GAMMA))
    const toTheOldRow = await fileARun('a-worker', asAgent('a-supervisor', after.runKey, after.id), { sandbox: sandbox(gammaBefore, GAMMA) })
    expect(toTheOldRow.status, said(toTheOldRow.body)).toBe(201)
  })

  it('refuses a filer whose own sandbox names no folder, so the office cannot vouch for it', async () => {
    // THE OLDER SHAPE OF THE FIELD, before it named a folder.
    const old = await aSupervisorsRunIn({ template: 'mole-office-dev', container: alpha })
    const title = 'a-worker from a run with no folder'
    const filed = await ask('POST', '/api/records', asAgent('a-supervisor', old.runKey, old.id), {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-worker'), servingAgent: 'a-worker', sandbox: sandbox(alpha, ALPHA) },
    })
    expectRefused(filed, [THE_FILERS_SANDBOX_IS_NOT_VOUCHED_FOR], title)
  })
})

describe('a write from outside every sandbox is a host filing, and only the secretary makes one', () => {
  it("admits the secretary's own key from its terminal", async () => {
    const filed = await fileARun('a-helper', asAgent('the-secretary', secretaryKey, secretarysTerminal), { sandbox: sandbox(beta, BETA) })
    expect(filed.status, said(filed.body)).toBe(201)
    expect(theSandboxOn(filed.id)).toEqual(sandbox(beta, BETA))
  })

  it("refuses a supervisor's own key from a session in no sandbox", async () => {
    const terminal = await aTerminalOf('a-supervisor', supervisorKey)
    const title = 'a-helper sent by a supervisor on the host'
    const filed = await ask('POST', '/api/records', asAgent('a-supervisor', supervisorKey, terminal), {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-helper'), servingAgent: 'a-helper', sandbox: sandbox(beta, BETA) },
    })
    expectRefused(filed, [ONLY_A_HOST_FILING], title)
  })

  // A WORKER FILES A RUN FOR NO OTHER AGENT, and one for itself never names a sandbox, so this session serves nobody.
  it("refuses a worker's own key from a session in no sandbox", async () => {
    const terminal = await aTerminalOf('a-worker', workerKey)
    const title = 'a session a worker on the host put in beta'
    const filed = await ask('POST', '/api/records', asAgent('a-worker', workerKey, terminal), {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', sandbox: sandbox(beta, BETA) },
    })
    expectRefused(filed, [ONLY_A_HOST_FILING], title)
  })

  it("refuses a grandchild naming another sandbox, by the child's own key and by the run key acting for the child", async () => {
    // STARTED FROM THE SUPERVISOR'S RUN, which a run key acting for another run asks of that run (lib/acting-for.ts).
    const child = await fileARun('a-lead', asAgent('a-supervisor', inAlphaKey, inAlpha), { parentAttachment: inAlpha })
    expect(child.status, said(child.body)).toBe(201)
    expect(isAKey(child.runKey), 'the child run was minted no key').toBe(true)
    const byItsOwnKey = 'a grandchild by the child’s key'
    const own = await ask('POST', '/api/records', asAgent('a-lead', child.runKey ?? '', child.id), {
      kind: 'session',
      title: byItsOwnKey,
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-helper'), servingAgent: 'a-helper', sandbox: sandbox(beta, BETA) },
    })
    expectRefused(own, [ONLY_A_HOST_FILING], byItsOwnKey)
    const actingFor = 'a grandchild by the run key acting for the child'
    const acting = await ask('POST', '/api/records', asAgent('a-lead', inAlphaKey, child.id), {
      kind: 'session',
      title: actingFor,
      data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf('a-helper'), servingAgent: 'a-helper', sandbox: sandbox(beta, BETA) },
    })
    expectRefused(acting, [ONLY_A_HOST_FILING], actingFor)
  })

  // THE COORDINATOR'S SHAPE: the secretary's own key, from a terminal of the person's bound to it (it ran as the secretary and
  // serves nobody), filing what tools/register-a-run.mjs files for a check of a run in a check worktree.
  async function argusFilesACheck(title: string, extra: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
    const at = await aTerminalBoundTo('the-secretary')
    return ask('POST', '/api/records', asAgent('the-secretary', secretaryKey, at), {
      kind: 'session',
      title,
      data: {
        state: 'running',
        runtime: 'claude-code',
        model: 'synthetic-model',
        servingAgent: 'an-inspector',
        servingAgentId: idOf('an-inspector'),
        ranAs: [{ workspaceId: 'default', agentId: theRecordOf('an-inspector') }],
        workingDirectory: '/synthetic/worktrees/check-of-a-run',
        tip: 'a'.repeat(40),
        cutFrom: 'main',
        startedAt: '2026-10-18 10:00:00',
        parentAttachment: at,
        ...extra,
      },
    })
  }

  it("admits the coordinator's shape, with no sandbox field", async () => {
    const filed = await argusFilesACheck('A run of an-inspector', {})
    expect(filed.status, said(filed.body)).toBe(201)
  })

  it("admits the coordinator's shape, with a sandbox field, as a host filing", async () => {
    const filed = await argusFilesACheck('A run of an-inspector in beta', { sandbox: sandbox(beta, BETA) })
    expect(filed.status, said(filed.body)).toBe(201)
  })
})

describe('the field is written once', () => {
  it('refuses a run key that repoints its own run at another sandbox, naming that rule', async () => {
    const patched = await ask('PATCH', `/api/records/${inAlpha}`, asAgent('a-supervisor', inAlphaKey, inAlpha), { dataPatch: { sandbox: sandbox(beta, BETA) } })
    expectRefused(patched, [WRITTEN_ONCE])
    expect(theSandboxOn(inAlpha)).toEqual(sandbox(alpha, ALPHA))
  })
})

describe('what is as before', () => {
  it('a filing with no sandbox field, from a sandbox and from the host', async () => {
    const fromASandbox = await fileARun('a-worker', asAgent('a-supervisor', inAlphaKey, inAlpha))
    expect(fromASandbox.status, said(fromASandbox.body)).toBe(201)
    const terminal = await aTerminalOf('a-supervisor', supervisorKey)
    const fromTheHost = await fileARun('a-helper', asAgent('a-supervisor', supervisorKey, terminal))
    expect(fromTheHost.status, said(fromTheHost.body)).toBe(201)
  })

  it('a write with no key', async () => {
    const filed = await fileARun('a-helper', asAgent('a-supervisor'), { sandbox: sandbox(beta, BETA) })
    expect(filed.status, said(filed.body)).toBe(201)
  })
})
