// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A STOPPED CHECK CANNOT LAND EITHER VERDICT WITH THE INSPECTOR'S OWN AGENT KEY.
 * Problem dbygn38VFgti, part b; the secretary's rule 32A_TmNldtFa.
 * Every agent, session and key belongs to this fresh synthetic database. The real stop door
 * finds no process row, revokes the check's run key and answers 409; no process is started or signalled.
 * Mutations: omit either refusal, count running as ended, require a header, move the guard out
 * of answerTheCheck's catch, or read a live key as revoked. Each has a separate failing case below.
 * V7, added by wave 13n's supervisor: a key row with no reason quoted as if a reason were recorded turns case 8 red.
 * Case 9 is the secretary's gap 1 (hYSaAc6dw4_Y): a header that is not a record id is refused with 400 before the body is read.
 * GAP 3 (the rule of 21 Oct 2026): after a stop, nothing the check's inspector writes lands. Its assembly is refused as its
 * verdict is (cases 1, 2, 3, 7 and 8 now expect the assembly refused too), its messages are refused at the record door (11),
 * an inspector's write there that names no session is taken as before (12), another agent's writes are untouched (13), and the stop door tells
 * the checked run's starter once (14).
 * V8: drop that shape check, or move it after the body is read, and case 9 turns red.
 * THE SESSION-HEADER BINDING ANSWERS FIRST (problem TwH5ICyRxLVd; xnA2sRB9NnUM): a header the inspector's own
 * agent key does not hold gets its 403 in http.ts's actorFrom, before this door. Cases 3, 7 and 9 send the office's key,
 * as the check tool does, so they still reach the door's 409 and 400. Added by wave 13s's supervisor: take every key as
 * given (the binding's 403s in cases 4, 5, 6 and 10 turn red), drop the door's 409 for an ended session with no key
 * (cases 3 and 7 turn red), or run the door's check before the binding (case 10 turns red).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const STARTER = 'stopped-check-starter'
const WORKER = 'stopped-check-worker'
const INSPECTOR = 'stopped-check-inspector'
/** The door's own sentence for a header that is not a record id; it quotes nothing the caller sent. */
const NOT_A_RECORD_ID =
  "This verdict is refused: the x-mole-office-session header does not hold a record id. That header must hold the id " +
  "of the check's own session, which is 12 characters, each a letter, a digit, - or _. This door never looks a session " +
  'up by its title or by a name. Nothing was written.'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}
let t: TestDb
let app: FastifyInstance
let starterKey = ''
let inspectorKey = ''
let officeKey = ''

function asAgent(id: string, key?: string, session?: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id,
    'x-mole-office-workspace': 'default',
    ...(key === undefined ? {} : { 'x-mole-office-key': key }),
    ...(session === undefined ? {} : { 'x-mole-office-session': session }),
  }
}

async function register(handle: string, role: string, headers: Record<string, string>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: handle, role, ...(role === 'worker' ? { workArea: ['src'] } : {}) } })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = reply.json().whatToGiveIt?.key as string | undefined
  expect(typeof key === 'string' && key.length === 64, 'registration must mint a synthetic agent key').toBe(true)
  return key ?? ''
}

function session(state: string, extra?: Record<string, unknown>, doing = 'Synthetic: checking this run'): string {
  return t.api.createRecord({ kind: 'session', title: `Synthetic check in ${state}`, workspaceId: 'default',
    actor: { type: 'agent', id: STARTER }, origin: 'fixture',
    data: { state, servingAgent: INSPECTOR, ...(doing === '' ? {} : { doing }), ...(extra === undefined ? {} : { extra }) } }).id
}

/** The same legacy unsealed-run fixture as a-verdict-comes-with-a-key, assembled by the real door. */
async function aRunUnderCheck(): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(WORKER),
    payload: { kind: 'session', title: 'Synthetic work under check',
      data: { state: 'running', servingAgent: WORKER, workingDirectory: process.cwd(), doing: 'Synthetic work' } } })
  expect(made.statusCode, made.body).toBe(201)
  const id = made.json().record.id as string
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(id)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(id)
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${id}/assembled`,
    headers: asAgent(INSPECTOR, inspectorKey), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  return id
}

/** The test's own process keeps this synthetic recipient reachable while the guard is tested. */
async function holdRecipient(handle: string): Promise<void> {
  const holder = t.api.createRecord({ kind: 'session', title: 'A synthetic holder', workspaceId: 'default', actor: t.api.HUMAN,
    data: { state: 'running', runtime: 'claude-code' } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
  const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(handle)}/hold`, headers: AS_THE_PERSON,
    payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
  expect(held.statusCode, held.body).toBe(201)
}

/** Make the check's run-key row in the test database; the inspector's agent key stays separate. */
async function aCheckWithARunKey(): Promise<{ id: string; keyId: string }> {
  const inspectorId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0')
    .get(INSPECTOR) as { id: string }).id
  const { makeARunKey } = await import('../src/server/lib/keys.ts')
  const keyId = makeARunKey(inspectorId, null).heldKeyId
  return { id: session('running', { runKeyId: keyId }), keyId }
}

/** `as.key` is the key both requests carry. `as.assembled` is the assembly's answer where the binding refuses the header. */
async function verdict(run: string, check?: string, kind: 'released' | 'refused' = 'released', as: { key?: string; assembled?: number } = {}) {
  const key = as.key ?? inspectorKey
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`,
    headers: asAgent(INSPECTOR, key, check), payload: { changes: [] } })
  // These headers already have their own 400 refusal in http.ts's actorFrom, before either door's handler.
  if (check?.trim() !== '' && (check === undefined || t.api.getRecord(check)?.kind !== 'note')) {
    expect(assembled.statusCode, assembled.body).toBe(as.assembled ?? 201)
  }
  return app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(INSPECTOR, key, check),
    payload: { verdict: kind, check: 'Synthetic: the check reached its verdict.', chaptersRead: [],
      ...(kind === 'refused' ? { missing: ['Synthetic missing work'], says: { invariant: 1 } } : {}) } })
}

/** The binding's 403, from http.ts's actorFrom before the door: the header, why the key does not hold it, and the rule. */
function refusedByTheBinding(reply: { statusCode: number; body: string; json: () => { error?: unknown } }, header: string, because: string): void {
  expect(reply.statusCode, reply.body).toBe(403)
  const error = String(reply.json().error)
  expect(error).toContain(`x-mole-office-session names "${header}", and ${because}.`)
  expect(error).toContain('only when the key it carries holds that run')
  expect(error).toMatch(/Nothing was written\.$/)
}

function noVerdictWasStored(run: string): void {
  expect(t.api.getRecord(run)!.data['released']).toBeUndefined()
  expect(t.api.getRecord(run)!.data['refused']).toBeUndefined()
}

function refusalWasRecorded(run: string, error: string, status = 409): void {
  const flow = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?")
    .get(run) as { data: string }
  const steps = JSON.parse(flow.data).stepsTaken as { outcome: string; refusal?: unknown }[]
  expect(steps.at(-1)).toMatchObject({ outcome: 'refused by the verdict door', refusal: { said: error, status } })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  starterKey = await register(STARTER, 'secretary', AS_THE_PERSON)
  inspectorKey = await register(INSPECTOR, 'inspector', AS_THE_PERSON)
  await register(WORKER, 'worker', asAgent(STARTER, starterKey))
  officeKey = (JSON.parse(readFileSync(join(dirname(t.file), 'keys.json'), 'utf8')) as { office: string }).office
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the verdict door reads the named check session', () => {
  it.each(['released', 'refused'] as const)('(1, 2) refuses %s after the real stop door revoked its run key without signalling', async (kind) => {
    const run = await aRunUnderCheck()
    const check = await aCheckWithARunKey()
    const stop = await app.inject({ method: 'POST', url: `/api/runtime/runs/${check.id}/stop`,
      headers: asAgent(STARTER, starterKey), payload: { why: 'Synthetic: this check was stopped' } })
    expect(stop.statusCode, stop.body).toBe(409)
    expect(stop.json().error).toContain('no process group')
    const key = t.client.sqlite.prepare('SELECT revoked_at, revoked_because FROM held_keys WHERE id = ?')
      .get(check.keyId) as { revoked_at: string; revoked_because: string }
    expect(key.revoked_because).toBe(`The agent ${STARTER} revoked run ${check.id}'s key through its stop door: Synthetic: this check was stopped.`)
    const reply = await verdict(run, check.id, kind, { assembled: 409 })
    const error = String(reply.json().error)
    // Keep this before the status assertion: V5 must fail because the refusal lost its flow step.
    refusalWasRecorded(run, error)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(error).toContain(check.id)
    expect(error).toContain(key.revoked_at)
    expect(error).toContain(key.revoked_because)
    expect(error).toMatch(/Nothing was written\.$/)
    noVerdictWasStored(run)
  })

  it.each(['finished', 'crashed', 'paused', 'orphaned'])('(3) refuses a keyless session in %s, naming its doing line', async (state) => {
    const run = await aRunUnderCheck()
    const doing = `Synthetic: the ${state} check stopped here`
    const check = session(state, undefined, doing)
    // THE OFFICE'S KEY, as the check tool sends it, holds any run, so the request reaches the door's own refusal.
    const reply = await verdict(run, check, 'released', { key: officeKey, assembled: 409 })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toContain(check)
    expect(reply.json().error).toContain(state)
    expect(reply.json().error).toContain(doing)
    expect(reply.json().error).toMatch(/Nothing was written\.$/)
    noVerdictWasStored(run)
  })

  it('(3) names an empty doing line on an ended keyless session', async () => {
    const run = await aRunUnderCheck()
    const reply = await verdict(run, session('finished', undefined, ''), 'released', { key: officeKey, assembled: 409 })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toContain('doing line is empty')
    noVerdictWasStored(run)
  })

  it.each(['running', 'idle'])('(4) takes a keyless session in %s', async (state) => {
    const run = await aRunUnderCheck()
    const reply = await verdict(run, session(state))
    expect(reply.statusCode, reply.body).toBe(201)
    expect(t.api.getRecord(run)!.data['released']).toBeDefined()
  })

  it('(4) leaves a keyless session in unknown to the binding, which refuses it before the door', async () => {
    const run = await aRunUnderCheck()
    const check = session('unknown')
    const reply = await verdict(run, check, 'released', { assembled: 403 })
    refusedByTheBinding(reply, check, 'nobody can say that run is still running, because its record holds no state the office can read')
    noVerdictWasStored(run)
  })

  it.each(['running'])('(5) takes a session with a live key even when its state is %s', async (state) => {
    const run = await aRunUnderCheck()
    const check = await aCheckWithARunKey()
    // A live key wins over an old state; direct fixture change leaves its key live intentionally.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(state, check.id)
    const reply = await verdict(run, check.id)
    expect(reply.statusCode, reply.body).toBe(201)
  })

  it('(5) leaves a session with a live run key in finished to the binding: the inspector’s agent key does not hold an ended run', async () => {
    const run = await aRunUnderCheck()
    const check = await aCheckWithARunKey()
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run('finished', check.id)
    const reply = await verdict(run, check.id, 'released', { assembled: 403 })
    refusedByTheBinding(reply, check.id, 'that run has ended (its state is "finished")')
    noVerdictWasStored(run)
  })

  /** The header case 6 sends for each name. */
  function theHeaderNaming(which: string): string | undefined {
    let header: string | undefined
    if (which === 'blank') header = '   '
    // Record-id shaped, naming no record: the secretary's rule for (b) takes these as today. Ids made before
    // decision cvQAUoJTDYbB may begin with - or _, so that shape is an id too. The binding answers both before the door:
    // no run of either id is filed, so the inspector's agent key holds neither.
    if (which === 'missing record') header = 'synthNoSuch1'
    if (which === 'missing record with an old first character') header = '_synthNoSuch'
    if (which === 'other kind') header = t.api.createRecord({ kind: 'note', title: 'Synthetic non-session',
      workspaceId: 'default', actor: { type: 'agent', id: STARTER }, origin: 'fixture', data: { body: 'Synthetic note' } }).id
    if (which === 'deleted' || which === 'other project') {
      header = session('finished')
      if (which === 'deleted') t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-10-17 12:00:00' WHERE id = ?").run(header)
      else t.client.sqlite.prepare("UPDATE records SET workspace_id = 'synthetic-other-project' WHERE id = ?").run(header)
    }
    return header
  }

  it.each(['absent', 'blank', 'other kind'])('(6) preserves today’s answer for a header naming %s', async (which) => {
    const run = await aRunUnderCheck()
    const header = theHeaderNaming(which)
    const reply = await verdict(run, header)
    // http.ts's shared actor reader already refuses these two headers; the session guard adds no refusal.
    expect(reply.statusCode, reply.body).toBe(which === 'blank' || which === 'other kind' ? 400 : 201)
    if (which === 'blank' || which === 'other kind') noVerdictWasStored(run)
  })

  // WHAT THE BINDING SAYS OF EACH, in lib/the-run-a-key-holds.ts. Another project's session is read by its id, and has ended.
  it.each([
    ['missing record', 'no run of that name or id is filed in this office'],
    ['missing record with an old first character', 'no run of that name or id is filed in this office'],
    ['deleted', "that run's session record is deleted"],
    ['other project', 'that run has ended (its state is "finished")'],
  ])('(6) leaves a header naming %s to the binding, which refuses it before the door', async (which, because) => {
    const run = await aRunUnderCheck()
    const header = theHeaderNaming(which)!
    const reply = await verdict(run, header, 'released', { assembled: 403 })
    refusedByTheBinding(reply, header, because)
    noVerdictWasStored(run)
  })

  it.each(['finished', 'running'])('(7) reads a missing key row as no key for a session in %s', async (state) => {
    const run = await aRunUnderCheck()
    const check = session(state, { runKeyId: 'synthetic-key-row-that-does-not-exist' })
    // The ended session is the door's 409, so it carries the office's key as case 3 does. The running one is unchanged.
    const reply = await verdict(run, check, 'released', state === 'finished' ? { key: officeKey, assembled: 409 } : {})
    expect(reply.statusCode, reply.body).toBe(state === 'finished' ? 409 : 201)
    if (state === 'finished') {
      expect(reply.json().error).toContain(check)
      expect(reply.json().error).toContain('finished')
      expect(reply.json().error).toContain('Synthetic: checking this run')
      noVerdictWasStored(run)
    }
  })

  it('(8) says no reason was recorded when the revoked key row holds none, and quotes nothing as the reason', async () => {
    const run = await aRunUnderCheck()
    const check = await aCheckWithARunKey()
    // Every writer of held_keys sets a reason, and the column allows none, so this row is written directly.
    t.client.sqlite.prepare("UPDATE held_keys SET revoked_at = '2026-10-18 12:00:00', revoked_because = NULL WHERE id = ?")
      .run(check.keyId)
    const reply = await verdict(run, check.id, 'released', { assembled: 409 })
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.json().error).toContain('its run key was revoked at 2026-10-18 12:00:00. No reason was recorded for it. Nothing was written.')
    expect(reply.json().error).not.toContain('The recorded reason is')
    noVerdictWasStored(run)
  })

  it.each([
    ['the title of a finished keyless session', 'title'],
    ['a 25-character name', 'synthetic-session-name-25'],
    ['11 id characters', 'synthetic11'],
    ['13 id characters', 'synthetic0013'],
    ['12 characters with a dot', 'synthetic.12'],
  ])('(9) refuses a header holding %s with 400, before the body is read, and stores nothing', async (_which, given) => {
    const run = await aRunUnderCheck()
    const ended = session('finished')
    const header = given === 'title' ? t.api.getRecord(ended)!.title : given
    // verdict() also asserts that the assembled door still takes this header with 201: the shape rule is the verdict door's only.
    // The office's key, as the check tool sends it, holds any header, so the request reaches the door's own 400.
    const reply = await verdict(run, header, 'released', { key: officeKey })
    const error = String(reply.json().error)
    refusalWasRecorded(run, error, 400)
    expect(reply.statusCode, reply.body).toBe(400)
    expect(error).toBe(NOT_A_RECORD_ID)
    // Not read by title: the finished session it names is neither found nor named.
    expect(error).not.toContain(ended)
    noVerdictWasStored(run)
  })

  it('(9) gives the header refusal, not the body\'s, when the body is malformed too', async () => {
    const run = await aRunUnderCheck()
    const header = 'synthetic.12'
    // The office's key, as in the case above, so the door's own 400 is what answers.
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`,
      headers: asAgent(INSPECTOR, officeKey, header), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(INSPECTOR, officeKey, header),
      payload: { verdict: 'released' } })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.json().error).toBe(NOT_A_RECORD_ID)
    noVerdictWasStored(run)
  })

  it('(10) answers a key that does not hold a stopped check’s session with the binding’s 403, not the door’s 409', async () => {
    const run = await aRunUnderCheck()
    const check = session('finished', undefined, 'Synthetic: the finished check stopped here')
    // ANOTHER RUN'S KEY: the worker's run key, minted on its starter's path. It holds the worker's run and no other.
    const workers = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(STARTER, starterKey),
      payload: { kind: 'session', title: 'Synthetic worker run', data: { state: 'running', servingAgent: WORKER, doing: 'Synthetic: the worker at work' } } })
    expect(workers.statusCode, workers.body).toBe(201)
    const key = workers.json().runKey?.key as string | undefined
    expect(typeof key === 'string' && key.length === 64, 'the worker’s run must be minted a synthetic run key').toBe(true)
    const reply = await app.inject({ method: 'POST', url: `/api/checks/${run}`, headers: asAgent(WORKER, key, check),
      payload: { verdict: 'released', check: 'Synthetic: the check reached its verdict.', chaptersRead: [] } })
    refusedByTheBinding(reply, check, `this key is the run key of run ${String(workers.json().record.id)}, not of that run`)
    noVerdictWasStored(run)
  })
})

describe("after a stop, nothing the check's inspector writes lands", () => {
  /** The inspector's agent id in the registry, which a message's `to` names. */
  const theRegistryIdOf = (handle: string): string =>
    (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
  const messagesAbout = (run: string): { body: string; to: { kind: string; id: string }[]; extra?: Record<string, unknown> }[] =>
    (t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { data: string }[])
      .map((row) => JSON.parse(row.data))
  const titled = (title: string): number =>
    (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND title = ?").get(title) as { n: number }).n
  async function aStoppedCheckOf(run: string): Promise<{ id: string; keyId: string }> {
    const check = await aCheckWithARunKey()
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`,
      headers: asAgent(INSPECTOR, inspectorKey, check.id), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const stop = await app.inject({ method: 'POST', url: `/api/runtime/runs/${check.id}/stop`,
      headers: asAgent(STARTER, starterKey), payload: { why: 'Synthetic: this check was stopped' } })
    expect(stop.statusCode, stop.body).toBe(409)
    return check
  }

  it('(11) refuses the assembly and the message the stopped check would send its run on, naming the stop', async () => {
    const run = await aRunUnderCheck()
    const check = await aStoppedCheckOf(run)
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`,
      headers: asAgent(INSPECTOR, inspectorKey, check.id), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(409)
    expect(assembled.json().error).toContain(`Session ${check.id}`)
    expect(assembled.json().error).toContain('its run key was revoked')
    expect(assembled.json().error).toMatch(/Nothing was written\.$/)
    const title = "Synthetic: the stopped check's verdict was not recorded"
    const told = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(INSPECTOR, inspectorKey, check.id),
      payload: { kind: 'message', title, data: { body: 'Synthetic', to: [{ kind: 'agent', id: theRegistryIdOf(WORKER) }] } } })
    expect(told.statusCode, told.body).toBe(409)
    expect(told.json().error).toContain(`Session ${check.id}`)
    expect(told.json().error).toMatch(/Nothing was written\.$/)
    expect(titled(title)).toBe(0)
  })

  it("(12) takes an inspector's write at the record door that names no session, as before, and a --dry assembly and the check's own session with none", async () => {
    // SEVERAL OF THE INSPECTOR'S WRITES NAME NO SESSION ON PURPOSE (its notes on a problem, the check's own session filed before
    // there is one; the messages its refusals send on do carry the check's session), so only a header that names a stopped session
    // is refused, never a missing one.
    const run = await aRunUnderCheck()
    await holdRecipient(WORKER)
    const told = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(INSPECTOR, inspectorKey),
      payload: { kind: 'message', title: 'Synthetic: no session named', data: { body: 'Synthetic', to: [{ kind: 'agent', id: theRegistryIdOf(WORKER) }] } } })
    expect(told.statusCode, told.body).toBe(201)
    // A --dry assembly runs no model and has no check session, so it names none on purpose, and is taken as before.
    const dry = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent(INSPECTOR, inspectorKey), payload: { changes: [] } })
    expect(dry.statusCode, dry.body).toBe(201)
    // AND THE CHECK'S OWN SESSION, which an inspector files before it has one to name, is taken with none too.
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(INSPECTOR, inspectorKey),
      payload: { kind: 'session', title: 'Synthetic: a check filed by hand', data: { state: 'running', doing: 'Synthetic: checking a run' } } })
    expect(filed.statusCode, filed.body).toBe(201)
  })

  it("(13) takes another agent's message as before, even under a session that has ended", async () => {
    const ended = session('finished')
    await holdRecipient(STARTER)
    const told = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(WORKER, officeKey, ended),
      payload: { kind: 'message', title: 'Synthetic: a note after the run', data: { body: 'Synthetic', to: [{ kind: 'agent', id: theRegistryIdOf(STARTER) }] } } })
    expect(told.statusCode, told.body).toBe(201)
    const noHeader = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(STARTER, starterKey),
      payload: { kind: 'message', title: 'Synthetic: a note with no session', data: { body: 'Synthetic', to: [{ kind: 'agent', id: theRegistryIdOf(WORKER) }] } } })
    expect(noHeader.statusCode, noHeader.body).toBe(201)
  })

  it("(14) tells the checked run's starter once that the stopped check's verdict will not count, and says nothing when the stopped run is no check", async () => {
    const run = await aRunUnderCheck()
    const check = await aStoppedCheckOf(run)
    const told = messagesAbout(run).filter((one) => one.extra?.['aCheckWasStopped'] !== undefined)
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([{ kind: 'agent', id: theRegistryIdOf(STARTER) }])
    expect(told[0]!.body).toContain(check.id)
    expect(told[0]!.body).toContain(run)
    expect(told[0]!.body).toContain('Synthetic: this check was stopped')
    expect(told[0]!.body).toContain('will not count')
    // A SECOND STOP REVOKES NOTHING MORE, so it says nothing more.
    const again = await app.inject({ method: 'POST', url: `/api/runtime/runs/${check.id}/stop`,
      headers: asAgent(STARTER, starterKey), payload: { why: 'Synthetic: stopped again' } })
    expect(again.statusCode, again.body).toBe(409)
    expect(messagesAbout(run).filter((one) => one.extra?.['aCheckWasStopped'] !== undefined)).toHaveLength(1)
    // A RUN THAT ASSEMBLED NO CHECK is stopped with no such message to anybody.
    const notACheck = await aCheckWithARunKey()
    const counted = (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_type(data, '$.extra.aCheckWasStopped') = 'object'").get() as { n: number }).n
    const stop = await app.inject({ method: 'POST', url: `/api/runtime/runs/${notACheck.id}/stop`,
      headers: asAgent(STARTER, starterKey), payload: { why: 'Synthetic: not a check' } })
    expect(stop.statusCode, stop.body).toBe(409)
    expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_type(data, '$.extra.aCheckWasStopped') = 'object'").get() as { n: number }).n).toBe(counted)
  })

  it('tells the current owner when a check stops after a hand-over', async () => {
    await register('synthetic-stopped-owner', 'secretary', AS_THE_PERSON)
    const run = await aRunUnderCheck()
    const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
    if (columns.some((column) => column.name === 'owner_id')) {
      setFixtureOwner(t.client.sqlite, theRegistryIdOf('synthetic-stopped-owner'), theRegistryIdOf(WORKER), 'id')
    }
    await aStoppedCheckOf(run)
    const told = messagesAbout(run).filter((one) => one.extra?.['aCheckWasStopped'] !== undefined)
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([{ kind: 'agent', id: theRegistryIdOf('synthetic-stopped-owner') }])
  })
})
