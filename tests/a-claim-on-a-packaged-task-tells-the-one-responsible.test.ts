// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CLAIM ON A PACKAGED TASK TELLS THE ONE RESPONSIBLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 point 3 says a take opens a conversation with the one responsible for a task. A
 * person's take does that already, through POST /api/delegation/:recordId/take. An agent's take is
 * the ordinary claim — POST /api/claims — and before this piece it told nobody. This file proves the
 * claim now tells the responsible one, and only when the claim really is about a packaged task:
 *
 *   - AN AGENT CLAIMS A PACKAGED TASK, and the one responsible is sent one message from Mole
 *     Office carrying a `lead` to that task, so the reader is taken there in one press.
 *   - THE WORDS SAY AN AGENT CLAIMED IT, and read differently from a person's take outside: a take
 *     outside promises a return from somebody else, a claim stays on this machine and promises none.
 *   - A CLAIM ON A TASK WITH NO PACKAGE, on a record that is not a task even if it wears a package
 *     key, and on a path — even one spelled like a packaged task's id — tells nobody and writes no
 *     message. Most claims are not about packaged tasks and stay as fast and as quiet as they were.
 *   - AN HONEST NOBODY IS A REAL ANSWER. When the change log cannot say who made the task, no message
 *     is sent, the claim still succeeds exactly as it did, and the reply says nobody was told and why.
 *   - THE CLAIM ITSELF IS UNCHANGED. Its reply fields and its three refusals are the ones it always
 *     had, so the door this was added to was not broken by having something added to it.
 *
 * ---------------------------------------------------------------------------------------
 * HOW EACH CASE IS PROVED BY MUTATION
 * ---------------------------------------------------------------------------------------
 *
 * Each test below is proved by breaking the one thing it is about, watching it go red, and putting
 * the file back byte for byte. The mutation is named beside the test it proves.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'

let WORKSPACE = 'panelx'

const HUMAN: Record<string, string> = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

const A_PACKAGE = {
  forTheOutside: 'Build the module on its own and return a zip holding the source.',
  suits: 'own_module',
  acceptance: 'The module runs on its own and its tests pass.',
  acceptanceSource: { file: 'design/flows/ACCEPTANCE.md', criterion: 'F16', commit: '2d7f256e' },
}

const A_TAKE = {
  who: 'ChatGPT (my own account)',
  comesBack: 'A zip holding the module and a one-page note of what it did not finish.',
  byWhen: '2026-09-20',
}

let t: TestDb
let app: FastifyInstance

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

let caseNumber = 0

/** The office is made once for the file. Each case gets its own project, so its task is its own. */
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `claim-case-${String(caseNumber)}`
  HUMAN['x-mole-office-workspace'] = WORKSPACE
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Claim case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. */
async function file(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = HUMAN,
): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** Register a durable agent through the route, as the caller's headers say. */
async function registerAgent(
  handle: string,
  headers: Record<string, string> = HUMAN,
  role?: string,
  workArea?: string[],
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: {
      handle,
      name: handle,
      ...(role === undefined ? {} : { role }),
      ...(workArea === undefined ? {} : { workArea }),
    },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** File a task and package it through the real doors, and hand back the task id. */
async function packagedTask(title: string, headers: Record<string, string> = HUMAN): Promise<string> {
  const taskId = await file('task', title, {}, headers)
  const res = await app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers,
    payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
  })
  expect(res.statusCode, res.body).toBe(201)
  return taskId
}

/** File a session record with a running state, the weak input a live claim can read. */
async function aRunningSession(): Promise<string> {
  return file('session', 'a run for the claim', { state: 'running' })
}

/** File one ordinary claim through POST /api/claims, as one agent. */
async function claimBy(handle: string, run: string, things: { what: 'record' | 'path'; id: string }[]) {
  return app.inject({
    method: 'POST',
    url: '/api/claims',
    headers: asAgent(handle),
    payload: { run, things },
  })
}

/** One record, read back by id through the route. */
async function recordNow(id: string): Promise<{ id: string; kind: string; title: string; data: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: HUMAN })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { record: { id: string; kind: string; title: string; data: Record<string, unknown> } }).record
}

/** Every message record's id, oldest first, read straight off the store so a delta can be counted. */
function messageIds(): string[] {
  return (
    t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' ORDER BY rowid").all() as { id: string }[]
  ).map((one) => one.id)
}

/** The messages a request added, in order. */
function addedMessages(before: readonly string[]): string[] {
  return messageIds().filter((id) => !before.includes(id))
}

// ============================================================================ the message

describe('a claim on a packaged task tells the one responsible', () => {
  /**
   * MUTATION that turns this red, after a control run: change the `lead` argument of the
   * `writeASystemLineToOne` call in `tellTheResponsibleForPackagedTasks` in src/server/api/claims.ts
   * from the task target to `undefined`. The message is still written, so only the lead assertion
   * fails, which is what says the lead is really part of the answer.
   */
  it('sends the responsible one one message carrying a lead to the task', async () => {
    await registerAgent('f16-owner')
    const taskId = t.api.createRecord({
      kind: 'task',
      title: 'A task an agent owns',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'f16-owner', stated: true },
    }).id
    const packaged = await app.inject({
      method: 'POST',
      url: `/api/delegation/${taskId}/package`,
      headers: HUMAN,
      payload: { ...A_PACKAGE, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))] },
    })
    expect(packaged.statusCode, packaged.body).toBe(201)

    await registerAgent('f16-claimer', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const before = messageIds()

    const res = await claimBy('f16-claimer', run, [{ what: 'record', id: taskId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as {
      packageTold: { recordId: string; responsible: { who: unknown }; toldId: string | null }[]
    }
    expect(body.packageTold).toHaveLength(1)
    const told = body.packageTold[0]
    expect(told).toBeDefined()
    if (told === undefined) return
    expect(told.recordId).toBe(taskId)
    expect(told.responsible.who).toEqual({ kind: 'agent', id: idOf('f16-owner') })
    expect(told.toldId).not.toBe(null)

    // EXACTLY ONE MESSAGE, and it is the one the reply named. A claim that wrote a second line
    // nobody asked for would be the quiet kind of change this piece must not make.
    expect(addedMessages(before)).toEqual([told.toldId])

    const message = await recordNow(told.toldId as string)
    expect(message.kind).toBe('message')
    expect(message.data['to']).toEqual([{ kind: 'agent', id: idOf('f16-owner') }])
    expect(message.data['sentBy']).toEqual(moleOffice())
    // toMatchObject, NOT toEqual: the record-write layer canonicalises a Context field and adds its
    // own defaults for keys this door never set. What matters is that the lead points at this task.
    expect(message.data['lead']).toMatchObject({ target: { kind: 'record', recordId: taskId, workspaceId: WORKSPACE } })
  })

  /**
   * MUTATION that turns this red, after a control run: change the `line` of `aClaimTookThePackage`
   * in src/server/api/claims.ts to the person's take wording, `"${title}" was taken outside the
   * office`. The claim message then reads as an outside take and the difference is gone.
   */
  it('words it as an agent claim, which reads differently from a person\'s take outside', async () => {
    // NEUTRAL TITLES ON PURPOSE: the words under test must come from the door's own sentence and not
    // from a task title that happens to hold them, or the assertion would pass on any wording.
    const claimed = await packagedTask('Words: the package an agent holds')
    const taken = await packagedTask('Words: the package a person promises out')
    await registerAgent('f16-worder', HUMAN, undefined, ['src'])
    const run = await aRunningSession()

    const claimRes = await claimBy('f16-worder', run, [{ what: 'record', id: claimed }])
    expect(claimRes.statusCode, claimRes.body).toBe(201)
    const claimBody = claimRes.json() as { packageTold: { toldId: string | null }[] }
    const claimMessage = await recordNow(claimBody.packageTold[0]?.toldId as string)
    expect(String(claimMessage.data['body'])).toContain('claimed by an agent')
    expect(String(claimMessage.data['saidInFull'])).toContain('f16-worder')
    // THE DISTINCTION THE READER NEEDS: this is not a promise from somebody outside.
    expect(String(claimMessage.data['saidInFull'])).toContain('not a person promising the work to somebody outside')

    const takeRes = await app.inject({
      method: 'POST',
      url: `/api/delegation/${taken}/take`,
      headers: HUMAN,
      payload: A_TAKE,
    })
    expect(takeRes.statusCode, takeRes.body).toBe(201)
    const takeBody = takeRes.json() as { toldId: string | null }
    const takeMessage = await recordNow(takeBody.toldId as string)
    expect(String(takeMessage.data['body'])).toContain('was taken outside the office')
    expect(String(takeMessage.data['body'])).not.toContain('claimed by an agent')
    expect(claimMessage.data['body']).not.toBe(takeMessage.data['body'])
  })
})

// ============================================================================ nothing extra happens

describe('a claim that is not about a packaged task tells nobody', () => {
  /**
   * MUTATION that turns this red, after a control run: delete the
   * `if (packageOf(record.data) === null) continue` guard in `tellTheResponsibleForPackagedTasks` in
   * src/server/api/claims.ts. An unpackaged task then also tells the responsible one.
   */
  it('tells nobody and writes no message when the task has no package', async () => {
    const taskId = await file('task', 'A task nobody packaged')
    await registerAgent('f16-plain', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const before = messageIds()

    const res = await claimBy('f16-plain', run, [{ what: 'record', id: taskId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { packageTold: unknown[] }
    expect(body.packageTold).toEqual([])
    expect(addedMessages(before)).toEqual([])
  })

  /**
   * MUTATION that turns this red, after a control run: delete the `if (record.kind !== 'task')
   * continue` guard in `tellTheResponsibleForPackagedTasks` in src/server/api/claims.ts. The module
   * below carries a real package copied onto it bypassing the write gate, so without the kind guard
   * the claim would tell somebody about a record that is not a task.
   */
  it('tells nobody when the claimed record is not a task, even if it carries a package key', async () => {
    const taskId = await packagedTask('The shape a module may not wear')
    const task = await recordNow(taskId)
    const moduleId = await file('module', 'A module wearing a package key')
    writeDataBypassingTheGate(t, moduleId, { package: task.data['package'] })

    await registerAgent('f16-notask', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const before = messageIds()

    const res = await claimBy('f16-notask', run, [{ what: 'record', id: moduleId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { packageTold: unknown[] }
    expect(body.packageTold).toEqual([])
    expect(addedMessages(before)).toEqual([])
  })

  /**
   * MUTATION that turns this red, after a control run: delete the `if (thing.what !== 'record')
   * continue` guard in `tellTheResponsibleForPackagedTasks` in src/server/api/claims.ts. The path
   * below is spelled with a packaged task's id, so without the `what` guard the path would be read
   * as that task and tell somebody.
   */
  it('tells nobody when the claim names a path, even one spelled like a packaged task id', async () => {
    const taskId = await packagedTask('A packaged task a path is spelled like')
    await registerAgent('f16-path', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const before = messageIds()

    const res = await claimBy('f16-path', run, [{ what: 'path', id: taskId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as { packageTold: unknown[] }
    expect(body.packageTold).toEqual([])
    expect(addedMessages(before)).toEqual([])
  })
})

// ============================================================================ an honest nobody

describe('an honest nobody is a real answer', () => {
  /**
   * MUTATION that turns this red, after a control run: replace the `told.push({...})` inside the
   * `responsible.who === null` branch of `tellTheResponsibleForPackagedTasks` in
   * src/server/api/claims.ts with `continue`, so a claim nobody can be told about says nothing at
   * all instead of saying so.
   */
  it('still claims successfully and says nobody was told and why when responsibility cannot be worked out', async () => {
    const taskId = await packagedTask('Nobody can say who made this')
    t.client.sqlite.prepare("DELETE FROM changes WHERE record_id = ? AND op = 'create'").run(taskId)

    await registerAgent('f16-nobody', HUMAN, undefined, ['src'])
    const run = await aRunningSession()
    const before = messageIds()

    const res = await claimBy('f16-nobody', run, [{ what: 'record', id: taskId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as {
      claim: { id: string; state: string }
      packageTold: { toldId: string | null; responsible: { who: unknown; why: string }; note: string }[]
    }
    // THE CLAIM STILL SUCCEEDS, which is the half that must not break.
    expect(body.claim.state).toBe('live')
    expect(body.packageTold).toHaveLength(1)
    const told = body.packageTold[0]
    expect(told).toBeDefined()
    if (told === undefined) return
    expect(told.toldId).toBe(null)
    expect(told.responsible.who).toBe(null)
    expect(told.responsible.why).toContain('no create row')
    expect(told.note).toContain('nobody was told')
    // AND NOTHING PRETENDED A MESSAGE WENT SOMEWHERE IT DID NOT.
    expect(addedMessages(before)).toEqual([])
  })
})

// ============================================================================ the claim is unchanged

describe('the claim itself is unchanged', () => {
  /**
   * MUTATION that turns this red, after a control run: delete `heldForACheck: filed.heldForACheck,`
   * from the reply in the POST /claims handler in src/server/api/claims.ts. A field the door always
   * answered with then goes missing, which is the kind of change this piece must not make.
   */
  it('keeps the fields it always had, and the refusals it always gave', async () => {
    const moduleId = await file('module', 'A module to claim plainly')
    await registerAgent('f16-unchanged', HUMAN, undefined, ['src'])
    const run = await aRunningSession()

    const res = await claimBy('f16-unchanged', run, [{ what: 'record', id: moduleId }])
    expect(res.statusCode, res.body).toBe(201)
    const body = res.json() as Record<string, unknown>
    // ONE KEY PER FIELD THE DOOR ALWAYS ANSWERED WITH. The disclosure layer adds
    // `narrowedByPermission` to every reply, so this is presence per field rather than the whole set.
    for (const key of ['claim', 'groupsOpened', 'heldForACheck', 'packageTold', 'workspaceId']) {
      expect(body, `the reply lost its "${key}"`).toHaveProperty(key)
    }
    const claim = body['claim'] as Record<string, unknown>
    for (const key of [
      'id',
      'workspaceId',
      'claimant',
      'run',
      'things',
      'openedAt',
      'renewedAt',
      'releasedAt',
      'releasedBecause',
      'state',
      'from',
    ]) {
      expect(claim, `the claim lost its "${key}"`).toHaveProperty(key)
    }
    expect(claim['state']).toBe('live')
    expect(body['groupsOpened']).toEqual([])
    expect(body['heldForACheck']).toEqual([])

    // A CLAIM THAT NAMES NOTHING is still refused with the sentence it always gave.
    const nothing = await app.inject({
      method: 'POST',
      url: '/api/claims',
      headers: asAgent('f16-unchanged'),
      payload: { run, things: [] },
    })
    expect(nothing.statusCode, nothing.body).toBe(400)
    expect(nothing.body).toContain('names nothing')

    // A CLAIM WHOSE RUN THIS PROJECT DOES NOT HOLD is still refused by name.
    const norun = await claimBy('f16-unchanged', 'nosuchrun12', [{ what: 'record', id: moduleId }])
    expect(norun.statusCode, norun.body).toBe(400)
    expect(norun.body).toContain('nosuchrun12')

    // AN UNREGISTERED CLAIMANT is still refused, pointing at the registry.
    const nobody = await claimBy('nobody-registered', run, [{ what: 'record', id: moduleId }])
    expect(nobody.statusCode, nobody.body).toBe(403)
    expect(nobody.body).toContain('GET /api/participants')
  })
})
