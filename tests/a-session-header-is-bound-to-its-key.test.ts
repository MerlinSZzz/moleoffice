// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE'S SESSION HEADER IS BOUND TO ITS KEY. Problem TwH5ICyRxLVd, round 63, with the conditions two agents set.
 *
 * On a write that carries a key, x-mole-office-session is taken only when it names a running session the key holds:
 *
 *   - the run the run key was minted for, read from the mint's own revision and never from `data.extra.runKeyId`;
 *   - a run that run's key started, where the key acts for it (lib/acting-for.ts);
 *   - for an agent's own key, a running session that serves that agent or ran as it, or that the same agent filed with
 *     a key of its own and that serves no other agent (the session hook's filing).
 *
 * The office's key, the person's key file and the person's own device and tool keys are taken as given. A visitor's
 * credential is not the person. A finished or sealed run's own key may name its own run after the end, and no other
 * ended run. A dispatched run's key (agent_runs) holds one session: the newest one the office's key filed naming its run
 * in `extra.agentRun`, as tools/agent-worker.mjs files it, while the run is claimed or running. Any other session is
 * refused. A terminal's run key is bound when the run is opened, and bound again when it is opened again, in the
 * transaction that revokes the old key; only the newest binding counts. A request with no key and a session header is unchanged, except at a door to a
 * key, where it is refused.
 *
 * Every request goes through the real doors with `app.inject`. No assertion prints a key.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. The new check taken out of `actorFrom` (src/server/lib/http.ts): every case of "the keys that do not hold" goes
 *      red, and the door-to-a-key case.
 *   b. "Minted for" read from `data.extra.runKeyId` on the newest record that names the key, in place of the mint's
 *      revision: "a run key copied onto another session" and "a PATCH copying the new key's id" go red.
 *   c. The terminal's open binds with a plain patch again, as before (src/server/lib/terminal-agents.ts): "an opened
 *      terminal's key" goes red, because the clock moved between the key and the patch.
 *   d. The revocation condition taken out of the reopen binding's reading (src/server/lib/keys.ts): "a binding written
 *      without revoking the old key" goes red.
 *   e. Any binding admitted rather than the newest: "after a reopen" goes red on the old key's words.
 *   f. The revoke's answer not checked in `replaceTheRunKeyOfAReopenedRun` (src/server/lib/records.ts): "a reopen whose
 *      revoke fails" goes red.
 *   g. Gone with the refusal it proved: a dispatched run's key now holds the session its worker filed. Its cases are
 *      under "a dispatched run's key", and no mutation of them has been run.
 *   h. The finished-run branch admits any session: "a finished run's own key" goes red on the sibling.
 *   i. The person's device kind held to the rule: "the person's key and device key" goes red.
 *   j. The filer's clause taken out: "is named by the agent's own key" goes red.
 *   k. The filer's clause tied to the key that filed the session rather than to its agent: "after its key is replaced"
 *      goes red.
 *   l. The filer's clause without "serving no other agent": "names another agent as the one it serves" goes red.
 *   m. The filer's clause without its check of who filed: "another agent's key, nor ... when the office filed it" goes
 *      red.
 *   n. The `ranAs` clause taken out (src/server/lib/the-run-a-key-holds.ts): "ran as it, and serves nobody (the coordinator's
 *      shape)" goes red.
 */

import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'


let t: TestDb
let app: FastifyInstance
let officeKey = ''
let personKey = ''

/** The words every refusal of a keyed session header carries. */
const THE_RULE = 'only when the key it carries holds that run'

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
function asAgent(handle: string, key?: string, session?: string, workspace = 'default'): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspace,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

/** The office's own worker, proved by the office's key. */
const asTheOffice = (session?: string): Record<string, string> => asAgent('mole-office/the-message-worker', officeKey, session)

async function ask(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** The words of a refusal, for the assertions on what it names. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

/** Register an agent through the starter door, as `by`, and hand back the key it was answered. */
async function register(handle: string, by: Record<string, string>, role = 'worker'): Promise<string> {
  const made = await ask('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role })
  expect(made.status, said(made.body)).toBe(201)
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
  expect(filed.status, said(filed.body)).toBe(201)
  return {
    id: String((filed.body['record'] as { id?: string } | undefined)?.id ?? ''),
    runKey: (filed.body['runKey'] as { key?: string } | undefined)?.key ?? null,
  }
}

/** Write a note with the headers given, and read the change row it left: who, in which run, and whose key proved it. */
async function writeANote(
  headers: Record<string, string>,
  title: string,
): Promise<{ status: number; body: Record<string, unknown>; row: { id: string; session: string | null } | undefined }> {
  const note = await ask('POST', '/api/records', headers, { kind: 'note', title, data: { body: title } })
  const id = String((note.body['record'] as { id?: string } | undefined)?.id ?? '')
  const row = t.client.sqlite
    .prepare("SELECT actor_id AS id, session_id AS session FROM changes WHERE record_id = ? AND op = 'create' LIMIT 1")
    .get(id) as { id: string; session: string | null } | undefined
  return { status: note.status, body: note.body, row }
}

/** The key row a run's record names now. */
function theKeyIdOf(run: string): string {
  return (t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS id FROM records WHERE id = ?").get(run) as { id: string }).id
}

function notesTitled(title: string): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'note' AND title = ?").get(title) as { n: number }).n
}

/** A refusal of the session header: 403, it names the session and the rule, and nothing was written. */
function expectRefused(wrote: { status: number; body: Record<string, unknown> }, session: string, title: string): void {
  expect(wrote.status, said(wrote.body)).toBe(403)
  expect(said(wrote.body)).toContain(`"${session}"`)
  expect(said(wrote.body)).toContain(THE_RULE)
  expect(notesTitled(title), 'a refused write was stored all the same').toBe(0)
}

let launcherKey = ''
let supervisorsOwnKey = ''
let supervisorsRun = ''
let supervisorsRunKey = ''
let workersRun = ''

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'panelx', title: 'Synthetic office', note: 'Only the dispatched case of this test uses it.' })
  app = (await apiApp()).app
  await app.ready()
  const keys = JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { person: string; office: string }
  officeKey = keys.office
  personKey = keys.person
  // THE LAUNCHER STARTS THE AGENTS, AND A RUN IT FILES IS MINTED A KEY ON THE STARTER'S PATH.
  launcherKey = await register('the-launcher', AS_THE_PERSON, 'supervisor')
  supervisorsOwnKey = await register('a-supervisor', asAgent('the-launcher', launcherKey), 'supervisor')
  const run = await fileARun('a-supervisor', asAgent('the-launcher', launcherKey))
  expect(isAKey(run.runKey), 'the supervisor’s run was minted no key').toBe(true)
  supervisorsRun = run.id
  supervisorsRunKey = run.runKey ?? ''
  await register('a-worker', asAgent('the-launcher', launcherKey))
  workersRun = (await fileARun('a-worker', asAgent('the-launcher', launcherKey))).id
}, 120_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

describe('the keys that hold the run they name', () => {
  it("an agent's own key names a running session that serves it, and a run key names its own run (the tool maintainer's shape)", async () => {
    const own = await writeANote(asAgent('a-supervisor', supervisorsOwnKey, supervisorsRun), 'own key, own run')
    expect(own.status, said(own.body)).toBe(201)
    expect(own.row?.session).toBe(supervisorsRun)
    const minted = await writeANote(asAgent('a-supervisor', supervisorsRunKey, supervisorsRun), 'run key, its run')
    expect(minted.status, said(minted.body)).toBe(201)
    expect(minted.row?.session).toBe(supervisorsRun)
  })

  it("an agent's own key names a running session the agent filed for itself (the login reading's shape)", async () => {
    const key = await register('a-timer', asAgent('the-launcher', launcherKey))
    const run = await fileARun('a-timer', asAgent('a-timer', key))
    expect(run.runKey, 'an agent filing its own run is no starter, so no run key was expected').toBeNull()
    const wrote = await writeANote(asAgent('a-timer', key, run.id), 'the timer’s own run')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(run.id)
  })

  // AN OLD SESSION, FILED BY THE AGENT BEFORE KEYS PROVED A WRITE: its first revision has no proof, it serves nobody,
  // and its ranAs names the agent's record, which agent_records maps to the agent.
  it("an agent's own key names a running session that ran as it, and serves nobody (the coordinator's shape)", async () => {
    const key = await register('a-coordinator', asAgent('the-launcher', launcherKey))
    const record = (t.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(idOf('a-coordinator')) as { id: string }).id
    const filed = await ask('POST', '/api/records', asAgent('a-coordinator'), {
      kind: 'session',
      title: 'a terminal of the person’s, bound to the coordinator',
      data: { state: 'running', runtime: 'claude-code', ranAs: [{ workspaceId: 'default', agentId: record }] },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    const run = String((filed.body['record'] as { id: string }).id)
    expect(t.client.sqlite.prepare("SELECT json_extract(data, '$.servingAgentId') AS s FROM records WHERE id = ?").get(run)).toEqual({ s: null })
    expect(t.client.sqlite.prepare('SELECT actor_id AS actor, proved_by AS proof FROM revisions WHERE record_id = ? AND seq = 1').get(run)).toEqual({ actor: 'a-coordinator', proof: null })
    const wrote = await writeANote(asAgent('a-coordinator', key, run), 'the coordinator in its terminal')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(run)
  })

  it('a run key acts for a run its holder started', async () => {
    await register('a-subagent', asAgent('a-supervisor', supervisorsRunKey))
    const sub = await fileARun('a-subagent', asAgent('a-supervisor', supervisorsRunKey, supervisorsRun), { parentAttachment: supervisorsRun })
    const wrote = await writeANote(asAgent('a-subagent', supervisorsRunKey, sub.id), 'the subagent in its run')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row).toEqual({ id: 'a-subagent', session: sub.id })
  })

  it("the office's key names any run", async () => {
    const wrote = await writeANote(asTheOffice(workersRun), 'the office in the worker’s run')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(workersRun)
  })

  it("the person's key and the person's device key name any run", async () => {
    const byFile = await writeANote({ ...AS_THE_PERSON, 'x-mole-office-key': personKey, 'x-mole-office-session': workersRun }, 'the person in the worker’s run')
    expect(byFile.status, said(byFile.body)).toBe(201)
    const { holdTheKeyWhoseHashIs, keyHash } = await import('../src/server/lib/keys.ts')
    const device = randomBytes(32).toString('hex')
    holdTheKeyWhoseHashIs('person-device', THE_PERSON, keyHash(device), null)
    const byDevice = await writeANote({ ...AS_THE_PERSON, 'x-mole-office-key': device, 'x-mole-office-session': workersRun }, 'the person’s device in the worker’s run')
    expect(byDevice.status, said(byDevice.body)).toBe(201)
    expect(byDevice.row?.session).toBe(workersRun)
  })

  it('a request with no key and a session header is unchanged away from the doors to a key', async () => {
    const wrote = await writeANote(asAgent('a-supervisor', undefined, supervisorsRun), 'no key, a run named')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(supervisorsRun)
  })
})

describe('a session an agent filed for itself, serving no other agent (the session hook\'s shape)', () => {
  /** File a session as the session hook does: with the headers given, no session header, and no agent it serves. */
  async function asTheHookFilesIt(headers: Record<string, string>, title: string, extra: Record<string, unknown> = {}): Promise<string> {
    const filed = await ask('POST', '/api/records', headers, {
      kind: 'session',
      title,
      data: { state: 'running', runtime: 'claude-code', doing: 'Nobody has described this run yet.', ...extra },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    return String((filed.body['record'] as { id: string }).id)
  }

  it("is named by the agent's own key", async () => {
    const key = await register('a-hooked-agent', asAgent('the-launcher', launcherKey))
    const run = await asTheHookFilesIt(asAgent('a-hooked-agent', key), 'the run the hook filed')
    const wrote = await writeANote(asAgent('a-hooked-agent', key, run), 'the agent in the run its hook filed')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(run)
  })

  it("is named by the agent's new key after its key is replaced", async () => {
    const key = await register('a-rekeyed-agent', asAgent('the-launcher', launcherKey))
    const run = await asTheHookFilesIt(asAgent('a-rekeyed-agent', key), 'the run filed before the new key')
    const given = await ask('POST', '/api/participants/agent/a-rekeyed-agent/new-key', asAgent('the-launcher', launcherKey), { because: 'this test replaces it' })
    expect(given.status, said(given.body)).toBe(201)
    const replaced = String(given.body['key'])
    expect(isAKey(replaced), 'the new-key door answered no key').toBe(true)
    const wrote = await writeANote(asAgent('a-rekeyed-agent', replaced, run), 'the agent’s new key in the run its old key filed')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(run)
  })

  it('is not named by another agent\'s key, nor by its own key when the office filed it', async () => {
    const key = await register('a-filing-agent', asAgent('the-launcher', launcherKey))
    const theirs = await asTheHookFilesIt(asAgent('a-filing-agent', key), 'a run another agent filed')
    const title = 'the supervisor in a run another agent filed'
    expectRefused(await writeANote(asAgent('a-supervisor', supervisorsOwnKey, theirs), title), theirs, title)
    const offices = await asTheHookFilesIt(asTheOffice(), 'a run the office filed for nobody')
    const second = 'the agent in a run the office filed'
    expectRefused(await writeANote(asAgent('a-filing-agent', key, offices), second), offices, second)
  })

  it("is not named by the filer's key when it names another agent as the one it serves", async () => {
    const key = await register('a-filer-for-another', asAgent('the-launcher', launcherKey))
    // AN AGENT MAY NOT FILE A SESSION FOR ANOTHER, so the person names the other agent on it after.
    const run = await asTheHookFilesIt(asAgent('a-filer-for-another', key), 'a run the person gave to the worker')
    const given = await ask('PATCH', `/api/records/${run}`, { ...AS_THE_PERSON, 'x-mole-office-key': personKey }, { dataPatch: { servingAgentId: idOf('a-worker'), servingAgent: 'a-worker' } })
    expect(given.status, said(given.body)).toBe(200)
    const title = 'the filer in the run that serves the worker'
    expectRefused(await writeANote(asAgent('a-filer-for-another', key, run), title), run, title)
  })
})

describe('the keys that do not', () => {
  it("an agent's own key may not name another agent's run", async () => {
    const title = 'the supervisor in the worker’s run'
    expectRefused(await writeANote(asAgent('a-supervisor', supervisorsOwnKey, workersRun), title), workersRun, title)
  })

  it("an agent's own key may not name another agent's terminal session", async () => {
    const { fileATerminalsRunAndItsKey } = await import('../src/server/lib/terminal-agents.ts')
    const opened = fileATerminalsRunAndItsKey({
      agent: { id: idOf('a-worker'), handle: 'a-worker' },
      runtime: 'claude-code',
      folder: dirname(t.file),
      providerSession: null,
      workspaceId: 'default',
      actor: { type: 'human', id: THE_PERSON, sessionId: null, provedBy: 'the-person-key' },
      title: 'a-worker in a terminal',
      doing: 'Works in a terminal the office holds, opened by the person.',
      extra: {},
    })
    const title = 'the supervisor in the worker’s terminal'
    expectRefused(await writeANote(asAgent('a-supervisor', supervisorsOwnKey, opened.session), title), opened.session, title)
  })

  it('a run key may not name a run of its agent that it was not made for', async () => {
    const host = await fileARun('a-supervisor', asAgent('the-launcher', launcherKey))
    const title = 'the supervisor’s run key in its other run'
    const wrote = await writeANote(asAgent('a-supervisor', supervisorsRunKey, host.id), title)
    expectRefused(wrote, host.id, title)
    expect(said(wrote.body)).toContain(`the run key of run ${supervisorsRun}`)
  })

  it("a visitor's credential is not the person, and is held to the rule", async () => {
    const visitor = await ask('POST', '/api/office/visitors', AS_THE_PERSON, {
      handle: 'a-visitor',
      name: 'a-visitor',
      role: 'worker',
      conversationPath: '/transcripts/a-visitor',
      startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/loquat`,
      runtime: 'claude-code',
      sessionRecord: 'sess-a-visitor',
    })
    expect(visitor.status, said(visitor.body)).toBe(201)
    const credential = (visitor.body['credential'] as { id: string }).id
    const confirmed = await ask('POST', `/api/office/visitors/${credential}/confirm`, AS_THE_PERSON)
    expect(confirmed.status, said(confirmed.body)).toBe(200)
    const title = 'the visitor in the worker’s run'
    expectRefused(await writeANote(asAgent('a-visitor', String(visitor.body['token']), workersRun), title), workersRun, title)
  })

  it('a key may not name a run nobody filed', async () => {
    const title = 'under a run name nobody filed'
    const wrote = await writeANote(asAgent('a-supervisor', supervisorsOwnKey, 'a-run-nobody-filed'), title)
    expectRefused(wrote, 'a-run-nobody-filed', title)
    expect(said(wrote.body)).toContain('no run of that name or id is filed')
  })

  it('a run key copied onto another session by a PATCH holds nothing there', async () => {
    const run = await fileARun('a-worker', asAgent('the-launcher', launcherKey))
    const other = await fileARun('a-worker', asAgent('the-launcher', launcherKey))
    const copied = await ask('PATCH', `/api/records/${other.id}`, asAgent('the-launcher', launcherKey), { dataPatch: { extra: { runKeyId: theKeyIdOf(run.id) } } })
    expect(copied.status, said(copied.body)).toBe(200)
    const title = 'the run key in the run its id was copied onto'
    expectRefused(await writeANote(asAgent('a-worker', run.runKey ?? '', other.id), title), other.id, title)
    const own = await writeANote(asAgent('a-worker', run.runKey ?? '', run.id), 'the run key in its own run')
    expect(own.status, said(own.body)).toBe(201)
  })

  it('a keyless request at a door to a key may not name a run, and nothing is written as that run', async () => {
    const asked = await ask('POST', '/api/agents/register-myself', asAgent('a-newcomer', undefined, supervisorsRun), {
      handle: 'a-newcomer',
      name: 'The agent a-newcomer',
      workingDirectory: dirname(t.file),
    })
    expect(asked.status, said(asked.body)).toBe(403)
    expect(said(asked.body)).toContain(`"${supervisorsRun}"`)
    expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM agents WHERE handle = 'a-newcomer'").get()).toEqual({ n: 0 })
    expect(t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM changes WHERE session_id = ? AND actor_id = 'a-newcomer'").get(supervisorsRun)).toEqual({ n: 0 })
  })
})

describe("a finished run's own key, after its end", () => {
  it('names its own run for the receipt, and no other ended run', async () => {
    await register('a-finisher', AS_THE_PERSON)
    const filed = async (title: string): Promise<{ id: string; key: string }> => {
      const made = await ask('POST', '/api/records', asTheOffice(), {
        kind: 'session',
        title,
        data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf('a-finisher'), doing: title },
      })
      expect(made.status, said(made.body)).toBe(201)
      const key = String((made.body['runKey'] as { key?: string } | undefined)?.key)
      expect(isAKey(key), 'the office minted the run no key').toBe(true)
      return { id: String((made.body['record'] as { id: string }).id), key }
    }
    const note = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'note', title: 'what the runs submit', data: { body: 'a note' } })
    const submitted = String((note.body['record'] as { id: string }).id)
    const run = await filed('a round that finishes')
    const sibling = await filed('a round beside it that finishes too')
    for (const one of [run, sibling]) {
      const ended = await ask('PATCH', `/api/records/${one.id}`, asTheOffice(), { dataPatch: { state: 'finished', submission: { kind: 'records', records: [submitted] } } })
      expect(ended.status, said(ended.body)).toBe(200)
    }
    const receipt = { runtime: 'claude-code', model: 'a-model-for-this-test', inputTokens: 100, cachedInputTokens: 10, outputTokens: 5, inputIncludesCached: true }
    const own = await ask('PATCH', `/api/records/${run.id}`, asAgent('a-finisher', run.key, run.id), { dataPatch: { usageReceipt: receipt } })
    expect(own.status, said(own.body)).toBe(200)
    const elsewhere = await ask('PATCH', `/api/records/${run.id}`, asAgent('a-finisher', run.key, sibling.id), { dataPatch: { usageReceipt: { ...receipt, outputTokens: 6 } } })
    expect(elsewhere.status, said(elsewhere.body)).toBe(403)
    expect(said(elsewhere.body)).toContain(`"${sibling.id}"`)
    expect(said(elsewhere.body)).toContain(THE_RULE)
    expect(t.client.sqlite.prepare("SELECT json_extract(data, '$.usageReceipt.outputTokens') AS n FROM records WHERE id = ?").get(run.id)).toEqual({ n: 5 })
  })
})

/**
 * A DISPATCHED RUN'S KEY, AS tools/agent-worker.mjs SERVES THE RUN.
 *
 * The person dispatches a conversation. The office's key claims the run for the worker's own session, and then files
 * the run's session naming the run in `extra.agentRun` and the worker as its parent, as `fileThisRunsRecord` does.
 * The run writes with the key its dispatch made and that session in its header.
 *
 *   1. The session the office's key filed for the run: accepted, and the change row names that session.
 *   2. A newer session filed the same way takes the key, and the older one is refused. A session the run's own key
 *      filed, or the person's key filed, naming the run, is refused. A session the office's key filed for another
 *      dispatched run is refused, and that run's own key holds it. Once the run is declined, so it is no longer
 *      claimed or running while its key stays live, its session is refused.
 */
describe("a dispatched run's key", () => {
  type ADispatchedRun = { id: string; actorId: string; key: string }
  const THE_OFFICES_WORKER = 'mole-office/the-message-worker'
  let worker = ''
  let first: ADispatchedRun
  let other: ADispatchedRun
  let firstSession = ''

  const thePerson = (): Record<string, string> => ({
    'content-type': 'application/json',
    'x-mole-office-workspace': 'panelx',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    'x-mole-office-key': personKey,
  })
  /** The office's key, as the worker sends it: in the project it files in, under the worker's own session. */
  const theWorker = (session?: string): Record<string, string> => asAgent(THE_OFFICES_WORKER, officeKey, session, 'panelx')
  /** The office's key at the run doors, which take no project. */
  const theWorkerAtTheRunDoors = (): Record<string, string> => ({
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': THE_OFFICES_WORKER,
    'x-mole-office-key': officeKey,
  })
  /** The run's own writes: its writer, the key its dispatch made, and the session it names. */
  const asTheRun = (run: ADispatchedRun, session: string): Record<string, string> => asAgent(run.actorId, run.key, session, 'panelx')

  /** One conversation dispatched by the person, and its run claimed for the worker's session by the office's key. */
  async function dispatchedAndClaimed(title: string): Promise<ADispatchedRun> {
    const thread = await ask('POST', '/api/agent/threads', thePerson(), { title, mode: 'review' })
    expect(thread.status, said(thread.body)).toBe(201)
    const threadId = String((thread.body['thread'] as { id: string }).id)
    const message = await ask('POST', `/api/agent/threads/${threadId}/messages`, thePerson(), { intent: 'change', body: 'File a synthetic note in this test office.', recipient: { kind: 'new' } })
    expect(message.status, said(message.body)).toBe(201)
    const dispatched = await ask('POST', `/api/agent/threads/${threadId}/dispatch`, thePerson())
    expect(dispatched.status, said(dispatched.body)).toBe(201)
    const id = String((dispatched.body['runs'] as { id: string }[])[0]!.id)
    const claimed = await ask('POST', `/api/agent/runs/${id}/claim`, theWorkerAtTheRunDoors(), { worker })
    expect(claimed.status, said(claimed.body)).toBe(200)
    const key = String(claimed.body['runKey'])
    expect(isAKey(key), 'the claim answered no run key').toBe(true)
    const request = JSON.parse((t.client.sqlite.prepare('SELECT request FROM agent_runs WHERE id = ?').get(id) as { request: string }).request) as { actorId: string }
    return { id, actorId: request.actorId, key }
  }

  /** A session naming the run in `extra.agentRun`, filed with the headers given; by default as the worker files it. */
  async function aSessionFor(run: string, headers: Record<string, string> = theWorker(worker), parent: string | null = worker): Promise<string> {
    const filed = await ask('POST', '/api/records', headers, {
      kind: 'session',
      title: `agent run ${run}`,
      data: {
        state: 'running',
        runtime: 'claude-code',
        doing: `serving agent run ${run}`,
        ...(parent === null ? {} : { parentAttachment: parent }),
        extra: { agentRun: run },
      },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    return String((filed.body['record'] as { id: string }).id)
  }

  beforeAll(async () => {
    const filed = await ask('POST', '/api/records', theWorker(), {
      kind: 'session',
      title: 'the agent worker',
      data: { state: 'running', runtime: 'claude-code', doing: 'serves dispatched runs' },
    })
    expect(filed.status, said(filed.body)).toBe(201)
    worker = String((filed.body['record'] as { id: string }).id)
    first = await dispatchedAndClaimed('Synthetic dispatched brief')
    other = await dispatchedAndClaimed('Another synthetic dispatched brief')
  }, 120_000)

  it("1. holds the session the office's key filed for its run, and the change row names that session", async () => {
    firstSession = await aSessionFor(first.id)
    const wrote = await writeANote(asTheRun(first, firstSession), 'a dispatched run writes in its session')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(firstSession)
  })

  it('2. a newer session filed the same way takes the key, and the older one is refused', async () => {
    const newer = await aSessionFor(first.id)
    const title = 'a dispatched run writes in its older session'
    expectRefused(await writeANote(asTheRun(first, firstSession), title), firstSession, title)
    const wrote = await writeANote(asTheRun(first, newer), 'a dispatched run writes in its newer session')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(newer)
    firstSession = newer
  })

  it("2. a session another key filed naming the run, or the office's key filed for another run, is refused", async () => {
    const byItsOwnKey = await aSessionFor(first.id, asAgent(first.actorId, first.key, undefined, 'panelx'), null)
    const ownTitle = 'a dispatched run writes in a session its own key filed'
    expectRefused(await writeANote(asTheRun(first, byItsOwnKey), ownTitle), byItsOwnKey, ownTitle)
    const byThePerson = await aSessionFor(first.id, thePerson(), null)
    const personTitle = 'a dispatched run writes in a session the person filed'
    expectRefused(await writeANote(asTheRun(first, byThePerson), personTitle), byThePerson, personTitle)
    const forTheOther = await aSessionFor(other.id)
    const otherTitle = "a dispatched run writes in another run's session"
    expectRefused(await writeANote(asTheRun(first, forTheOther), otherTitle), forTheOther, otherTitle)
    const itsOwn = await writeANote(asTheRun(other, forTheOther), 'the other dispatched run writes in its session')
    expect(itsOwn.status, said(itsOwn.body)).toBe(201)
    // NEITHER OF THE TWO FILINGS BY ANOTHER KEY MOVED THE KEY: the newest the office's key filed still holds it.
    const still = await writeANote(asTheRun(first, firstSession), 'a dispatched run still writes in its newest session')
    expect(still.status, said(still.body)).toBe(201)
  })

  it('2. once its run is declined, no longer claimed or running while its key stays live, the session is refused', async () => {
    const declined = await ask('POST', `/api/agent/runs/${first.id}/result`, theWorkerAtTheRunDoors(), { error: 'This worker cannot serve this run.', declined: true })
    expect(declined.status, said(declined.body)).toBe(200)
    const title = 'a declined run writes in its session'
    expectRefused(await writeANote(asTheRun(first, firstSession), title), firstSession, title)
  })
})

describe("a terminal's run key", () => {
  /**
   * THE CLOCK MOVES ONE SECOND EACH TIME A KEY ROW IS WRITTEN, and stands still otherwise. So a patch written after the
   * key lands a second after the key's `made_at`, and only a binding written at the key's own moment can match it.
   */
  let agent = { id: '', handle: 'a-terminal-agent' }
  const AS_THE_PRESS = { type: 'human' as const, id: THE_PERSON, sessionId: null, provedBy: 'the-person-key' as const }
  type Lib = {
    open: (title: string) => { session: string; key: string | null }
    reopen: (session: string) => string | null
    oldKeyOf: (session: string) => { id: string; proof: string | null }
  }
  let lib: Lib

  beforeAll(async () => {
    await register(agent.handle, AS_THE_PERSON)
    agent = { id: idOf(agent.handle), handle: agent.handle }
    const terminals = await import('../src/server/lib/terminal-agents.ts')
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-18T09:00:00.000Z') })
    t.client.sqlite.function('a_key_moves_the_clock', () => {
      vi.setSystemTime(Date.now() + 1000)
      return null
    })
    t.client.sqlite.exec('CREATE TEMP TRIGGER the_clock_moves_with_a_key AFTER INSERT ON held_keys BEGIN SELECT a_key_moves_the_clock(); END')
    const oldKeyOf = (session: string): { id: string; proof: string | null } => {
      const id = theKeyIdOf(session)
      const row = t.client.sqlite.prepare('SELECT mint_proved_by AS proof FROM held_keys WHERE id = ?').get(id) as { proof: string | null }
      return { id, proof: row.proof }
    }
    lib = {
      open: (title) =>
        terminals.fileATerminalsRunAndItsKey({
          agent,
          runtime: 'claude-code',
          folder: dirname(t.file),
          providerSession: null,
          workspaceId: 'default',
          actor: AS_THE_PRESS,
          title,
          doing: 'Works in a terminal the office holds, opened by the person.',
          extra: {},
        }),
      reopen: (session) => terminals.giveAReopenedRunANewKey(session, agent.id, oldKeyOf(session) as never),
      oldKeyOf,
    }
  })

  const asTheTerminal = (key: string, session: string): Record<string, string> => asAgent(agent.handle, key, session)

  it("an opened terminal's key names its own session", async () => {
    const opened = lib.open('a terminal opened by the person')
    expect(isAKey(opened.key), 'the press was given no key').toBe(true)
    const wrote = await writeANote(asTheTerminal(opened.key ?? '', opened.session), 'the terminal in its run')
    expect(wrote.status, said(wrote.body)).toBe(201)
    expect(wrote.row?.session).toBe(opened.session)
  })

  it('after a reopen, the new key names the run and the old key does not', async () => {
    const opened = lib.open('a terminal opened again')
    const before = opened.key ?? ''
    const after = lib.reopen(opened.session)
    expect(isAKey(after), 'the reopen made no key').toBe(true)
    const now = await writeANote(asTheTerminal(after ?? '', opened.session), 'the new key in the reopened run')
    expect(now.status, said(now.body)).toBe(201)
    const title = 'the old key in the reopened run'
    const old = await writeANote(asTheTerminal(before, opened.session), title)
    expectRefused(old, opened.session, title)
    expect(said(old.body)).toContain('a new key replaced it')
  })

  it("a PATCH copying the new key's id onto another session gives nothing", async () => {
    const opened = lib.open('a terminal whose new key is copied')
    const after = lib.reopen(opened.session) ?? ''
    const other = await fileARun(agent.handle, AS_THE_PERSON)
    const copied = await ask('PATCH', `/api/records/${other.id}`, AS_THE_PERSON, { dataPatch: { extra: { runKeyId: theKeyIdOf(opened.session) } } })
    expect(copied.status, said(copied.body)).toBe(200)
    const title = 'the new key in the session its id was copied onto'
    expectRefused(await writeANote(asTheTerminal(after, other.id), title), other.id, title)
  })

  it('a binding written without revoking the old key counts for nothing', async () => {
    const opened = lib.open('a terminal given a key with no revocation')
    // THE CLOCK STANDS STILL FROM HERE, so a plain patch lands at its key's own moment, as a reopen binding does.
    t.client.sqlite.exec('DROP TRIGGER the_clock_moves_with_a_key')
    try {
      const { makeARunKey } = await import('../src/server/lib/keys.ts')
      const { patchRecord } = await import('../src/server/lib/records.ts')
      const made = makeARunKey(agent.id, 'the-persons-press')
      patchRecord(opened.session, { dataPatch: { extra: { runKeyId: made.heldKeyId } } }, { type: 'system', id: 'mole-office', sessionId: null })
      const title = 'the unrevoked binding’s key'
      expectRefused(await writeANote(asTheTerminal(made.key, opened.session), title), opened.session, title)
      const first = await writeANote(asTheTerminal(opened.key ?? '', opened.session), 'the first key, still the newest binding')
      expect(first.status, said(first.body)).toBe(201)
    } finally {
      t.client.sqlite.exec('CREATE TEMP TRIGGER the_clock_moves_with_a_key AFTER INSERT ON held_keys BEGIN SELECT a_key_moves_the_clock(); END')
    }
  })

  it('a reopen whose revoke fails binds nothing, and neither key names the run', async () => {
    const opened = lib.open('a terminal whose old key was revoked first')
    const old = lib.oldKeyOf(opened.session)
    const { revokeTheKeyNamed } = await import('../src/server/lib/keys.ts')
    const terminals = await import('../src/server/lib/terminal-agents.ts')
    expect(revokeTheKeyNamed(old.id, 'Revoked by this test before the reopen.')).toBe(true)
    const keysBefore = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys').get() as { n: number }).n
    const revisionsBefore = (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(opened.session) as { n: number }).n
    expect(() => terminals.giveAReopenedRunANewKey(opened.session, agent.id, old as never)).toThrow()
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys').get() as { n: number }).n, 'a key row was left behind').toBe(keysBefore)
    expect((t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(opened.session) as { n: number }).n).toBe(revisionsBefore)
    expect(theKeyIdOf(opened.session)).toBe(old.id)
    const title = 'the revoked key after the failed reopen'
    expectRefused(await writeANote(asTheTerminal(opened.key ?? '', opened.session), title), opened.session, title)
  })

})
