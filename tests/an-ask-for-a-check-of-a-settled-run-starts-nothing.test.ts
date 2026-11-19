// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASK FOR A CHECK OF A RUN THAT IS ALREADY SETTLED STARTS NOTHING, AND ITS DELIVERY SAYS WHY (wave 13j, the round
 * after the check line's round 14, the stale check asks). The secretary's words, messages spf8AMaAfEZc and NDfOy-a1cmZv: a
 * settled run's queued ask is no check, whether the run was released, superseded, closed unchecked, landed by hand,
 * confirmed, ended with its merge entry, or needs no check. "An ask that a check answered with a refusal is answered
 * too ... an old ask for a refused run, with no newer ask, counts as settled for this rule." The checks-only worker
 * asks the queue to mark settled asks delivered in its reading, with the run, how it was settled and that no check
 * was started beside each delivery. Other worker modes keep the needs-no-run path.
 *
 * WHAT IS PROVED HERE, against a real database, the real server and the real worker pass in merges-only mode with
 * checks on, the mode the office's own worker runs in:
 *
 *   1. THE CONTROL. An ask for a run nobody settled is a check row, needs a run, and one pass starts it.
 *   2. RELEASED, SUPERSEDED, CLOSED UNCHECKED, LANDED BY HAND AND CONFIRMED. Each settled run's ask is no check row. Its
 *      row needs no run, and the reason names the run, says the run is settled and no check was started, and then
 *      says how, in the run's own sentence. One pass marks the delivery delivered with that reason, starts nothing,
 *      and writes no execution on the run.
 *   3. A REFUSAL WRITTEN AFTER THE ASK answers it: the same.
 *   4. A REFUSAL STAMPED BEFORE THE ASK does not answer it, so the ask stays a check. The office marks a refusal
 *      reworked before it asks again, so this is only a check of an older ask racing a rework; it is kept queued.
 *   5. ASKED AGAIN AFTER A REFUSAL: the refusal is reworked, and the new ask is a check.
 *   6. MUTED BY THE INSPECTOR. The inspector has muted `aCheckWasQueued`, the kind of the office's ask, and the run is
 *      settled. The ask is still marked delivered with the settled sentence, and the row claims no hold. A personal
 *      notice rule holds real notices, and marking a settled run's ask is the office closing its own record: it wakes
 *      nobody and asks nothing (message U2YtX3pvw3Dt, the carry after DPL2JirW5a-b).
 *   7. MUTED, WITH THE NOTICE-RULE GATE AT OFF (wave 13r round M, item 5). The same ask is marked the same way, and its
 *      row does not name the notice rule in `wouldHaveHeld`: at block the rule would not have held it either, so the
 *      gate is not counted for it. The needs-no-run door counts each hold that row names.
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every run here is synthetic and says so. The git trees and the worker's output folder are made under the system's
 * temporary folder and removed after. The check tool is tests/fake-inspection-tool.mjs, so no model is called, and
 * nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { GATES } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp, parseAnyStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let inspection: typeof import('../src/server/lib/inspection.ts')
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const LIVE = new Set(['submitted', 'pinned', 'judged', 'integrating', 'reinspecting', 'testing', 'landing'])
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const asStranger = as('agent', 'a-stranger')
const theWorker = { type: 'agent' as const, id: 'worker-w' }
const thePerson = { type: 'human' as const, id: THE_PERSON }
const A = 'work/a.txt'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory under the system's temporary folder, removed after the file. */
function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `settled-ask-${prefix}-`)))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A stamp in the office's own form, `ms` from now. */
const aStamp = (ms: number): string => localStamp(new Date(Date.now() + ms))

/**
 * A finished run of the worker, sealed at its own tree's tip: a synthetic main holding work/a.txt, and one commit on a
 * branch `work` that changes it. If sealing asks for no check, the person explicitly asks through ask-again.
 * Returns the run id and its real check message; settlement and delivery assertions stay the same.
 */
async function aSealedRun(): Promise<{ run: string; check: string }> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic settled-ask fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic settled-ask run',
    workspaceId: WORKSPACE,
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir, doing: 'Synthetic: the run changes work/a.txt.' },
  }).id
  writeFileSync(join(dir, A), `${A} changed by ${dir}.\n`)
  git(dir, 'commit', '-q', '-am', 'Synthetic work of the run')
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  if (!(t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message) {
    const asked = await call('POST', `/api/checks/${run}/ask-again`, asPerson, {})
    expect(asked.status, asked.raw).toBe(200)
  }
  const check = (t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message ?? ''
  expect(check, `the office asked for no check of ${run}`).not.toBe('')
  return { run, check }
}

interface TheRow { messageId: string; to: { kind: string; id: string }; inspection?: { run: string }; needsNoRun: string | null; askOfASettledRun?: true; heldByNoticeRule?: string; wouldHaveHeld?: string[] }

/** The worker's queue row for a message to inspector-one, read through the real door. */
async function theRowOf(message: string): Promise<TheRow> {
  const r = await call('GET', '/api/worker/queue', {})
  expect(r.status, r.raw).toBe(200)
  const row = (r.body['queue'] as (TheRow & { handle: string })[]).find((one) => one.messageId === message && one.handle === 'inspector-one')
  expect(row, `no queue row for ${message}`).toBeDefined()
  return row!
}

/** Whether a check of the run has started: the office wrote its execution on the run. */
function itStarted(run: string): boolean {
  return (t.api.getRecord(run)!.data['theCheck'] as { execution?: unknown } | undefined)?.execution !== undefined
}

/** The registry id of an agent, by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/** The check's delivery to inspector-one: its mark and the reason beside it. */
function theDeliveryOf(message: string): { mark: string; because: string | null } {
  const delivery = t.client.sqlite
    .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
    .get(message, theIdOf('inspector-one')) as { mark: string; because: string | null } | undefined
  expect(delivery, `the check ${message} was never delivered to inspector-one`).toBeDefined()
  return delivery!
}

/** The reason a settled run's ask needs no check: the run, that it is settled, that no check was started, and how. */
function theReasonFor(run: string): string {
  const stands = inspection.whereARunStands(t.api.getRecord(run)!)
  return `This message asked for a check of run ${run}, and that run is settled, so no check was started for it. How it was settled: ${stands.says}`
}

/** One settlement, written the way its own door writes it. Every value is synthetic. */
function settle(run: string, how: 'released' | 'superseded' | 'closedUnchecked' | 'landedByHand' | 'confirmed' | 'refusedAfter' | 'refusedBefore'): void {
  const because = 'Synthetic: the settled-ask test settles the run.'
  const inspector = { kind: 'agent', id: 'inspector-one' }
  const asked = (t.api.getRecord(run)!.data['theCheck'] as { askedAt: string }).askedAt
  const release = { by: inspector, at: aStamp(60_000), how: 'an inspector', check: 'synthetic-check' }
  const refusal = (at: string) => ({ by: inspector, at, check: 'synthetic-check', missing: ['Synthetic: something is missing.'], chapter: 5, group: 'synthetic-group' })
  if (how === 'released') writeAVerdictAsItsDoorWould(t, run, { released: release })
  else if (how === 'confirmed') writeAVerdictAsItsDoorWould(t, run, { released: release, confirmed: { by: { kind: 'person', id: THE_PERSON }, at: aStamp(120_000), because } })
  else if (how === 'refusedAfter') writeAVerdictAsItsDoorWould(t, run, { refused: refusal(aStamp(60_000)) })
  else if (how === 'refusedBefore') {
    // AN OLDER CHECK'S REFUSAL, stamped a minute before this ask was written.
    writeAVerdictAsItsDoorWould(t, run, { refused: refusal(localStamp(new Date(parseAnyStamp(asked)!.getTime() - 60_000))) })
  } else if (how === 'closedUnchecked') {
    t.doors.asTheDoorOf('closedUnchecked', () => t.api.patchRecord(run, { dataPatch: { closedUnchecked: { by: { kind: 'person', id: THE_PERSON }, at: aStamp(60_000), because } } }, thePerson))
  } else {
    const value = how === 'superseded'
      ? { by: 'Synthetic-later', at: aStamp(60_000), byWhom: { kind: 'person', id: THE_PERSON }, because }
      : { commit: 'a'.repeat(40), lane: '/synthetic/lane', by: { kind: 'person', id: THE_PERSON }, at: aStamp(60_000), because,
          contains: { how: 'ancestor', laterCommit: 'a'.repeat(40), commits: [{ commit: 'a'.repeat(40), as: 'a'.repeat(40) }] } }
    t.doors.asTheDoorOf(how, () => t.api.patchRecord(run, { dataPatch: { theCheck: { [how]: value } } }, thePerson))
  }
}

/** Let every check this file started end, so nothing outlives the case that started it. */
async function untilTheStartedChecksEnd(): Promise<void> {
  const until = Date.now() + 30_000
  while (watching.length > 0 && Date.now() < until) {
    await new Promise((go) => setTimeout(go, 100))
    await onePass(settings, watching, [])
  }
  expect(watching, 'a started check did not end').toEqual([])
}

/** Close a run this case left asking, so a later case's pass does not start its check. */
function putAway(run: string): void {
  if (!itStarted(run)) settle(run, 'closedUnchecked')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  inspection = await import('../src/server/lib/inspection.ts')
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work'] })
  await register(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: scratch('main'), actor: thePerson })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 9,
    hops: 3,
    outputRoot: scratch('worker'),
    mergesOnly: true,
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
  const on = await call('POST', '/api/office/checks-in-merges-only', { ...asPerson, 'content-type': 'application/json' }, { on: true, because: 'Synthetic: the settled-ask test runs its checks.' })
  expect(on.status, on.raw).toBe(200)
}, 60_000)

afterEach(async () => {
  await untilTheStartedChecksEnd()
  const listed = await call('GET', '/api/merge-queue', asStranger)
  for (const one of (listed.body['lanes'] ?? []) as { entries: { id: string; state: string }[] }[]) {
    for (const entry of one.entries) {
      if (LIVE.has(entry.state)) await call('POST', `/api/merge-queue/${entry.id}/withdraw`, asPerson, { because: 'the case is over' })
    }
  }
}, 60_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The settled-ask test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('an ask for a check of a run nobody settled', () => {
  it('1: is a check row, needs a run, and one pass starts it', async () => {
    const { run, check } = await aSealedRun()
    const row = await theRowOf(check)
    expect(row.inspection?.run).toBe(run)
    expect(row.needsNoRun).toBeNull()
    const pass = await onePass(settings, watching, [])
    expect(pass.started.some((one) => one.messageId === check), JSON.stringify(pass)).toBe(true)
    expect(itStarted(run)).toBe(true)
  })
})

describe('an ask for a check of a run that is settled', () => {
  for (const [how, words] of [
    ['released', 'Released by'],
    ['superseded', 'Superseded by run Synthetic-later'],
    ['closedUnchecked', 'Synthetic: the settled-ask test settles the run.'],
    ['landedByHand', 'a'.repeat(12)],
    ['confirmed', 'confirmed the report'],
    ['refusedAfter', 'A check refused to release this run'],
  ] as const) {
    it(`${how === 'refusedAfter' ? '3' : '2'}: ${how === 'refusedAfter' ? 'refused after it was asked' : how}, is no check, and one pass marks it delivered with the reason and starts nothing`, async () => {
      const { run, check } = await aSealedRun()
      settle(run, how)
      const reason = theReasonFor(run)
      expect(reason).toContain(words)

      const row = await theRowOf(check)
      expect(row.inspection).toBeUndefined()
      expect(row.needsNoRun).toBe(reason)

      const pass = await onePass(settings, watching, [])
      expect(pass.started.some((one) => one.messageId === check), JSON.stringify(pass)).toBe(false)
      expect(pass.held).toContainEqual({ messageId: check, because: reason })
      expect(theDeliveryOf(check)).toEqual({ mark: 'delivered', because: reason })
      expect(itStarted(run)).toBe(false)
      expect(watching).toEqual([])
    })
  }
})

describe('an ask for a check of a run whose refusal does not answer it', () => {
  it('4: stays a check when the refusal is stamped before the ask', async () => {
    const { run, check } = await aSealedRun()
    settle(run, 'refusedBefore')
    expect(inspection.whereARunStands(t.api.getRecord(run)!).standing).toBe('rebuttal')
    const row = await theRowOf(check)
    expect(row.inspection?.run).toBe(run)
    expect(row.needsNoRun).toBeNull()
    putAway(run)
  })

  it('5: is a new check when the run is asked again after its refusal', async () => {
    const { run, check } = await aSealedRun()
    settle(run, 'refusedAfter')
    const again = await call('POST', `/api/checks/${run}/ask-again`, { ...asPerson, 'content-type': 'application/json' }, {})
    expect(again.status, again.raw).toBe(200)
    const asked = (t.api.getRecord(run)!.data['theCheck'] as { message: string }).message
    expect(asked).not.toBe(check)
    expect(inspection.whereARunStands(t.api.getRecord(run)!).standing).toBe('inspecting')
    const row = await theRowOf(asked)
    expect(row.inspection?.run).toBe(run)
    expect(row.needsNoRun).toBeNull()
    putAway(run)
  })
})

describe('an ask for a check of a settled run, whose kind the inspector has muted', () => {
  it('6: is still marked delivered with the settled reason, with no hold and no slot', async () => {
    const { agentByHandle } = await import('../src/server/lib/participants.ts')
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    const asTheInspector = {
      ...as('agent', 'inspector-one'),
      'x-mole-office-key': makeAnAgentKey(agentByHandle('inspector-one')!.id, null),
      'content-type': 'application/json',
    }
    const muted = await call('PUT', '/api/messages/notice-rules', asTheInspector, { mutedKinds: ['aCheckWasQueued'], because: 'Synthetic: the inspector mutes the office\'s ask.', ifVersion: null })
    expect(muted.status, muted.raw).toBe(200)
    expect(muted.body['mutedKinds']).toEqual(['aCheckWasQueued'])
    try {
      const { run, check } = await aSealedRun()
      settle(run, 'released')
      const reason = theReasonFor(run)

      const row = await theRowOf(check)
      expect(row.inspection).toBeUndefined()
      expect(row.needsNoRun).toBe(reason)
      expect(row.askOfASettledRun).toBe(true)
      expect(row.heldByNoticeRule).toBeUndefined()

      const pass = await onePass(settings, watching, [])
      expect(pass.started.some((one) => one.messageId === check), JSON.stringify(pass)).toBe(false)
      expect(pass.held.filter((one) => one.messageId === check)).toEqual([{ messageId: check, because: reason }])
      expect(theDeliveryOf(check)).toEqual({ mark: 'delivered', because: reason })
      expect(itStarted(run)).toBe(false)
      expect(watching).toEqual([])
    } finally {
      const back = await call('PUT', '/api/messages/notice-rules', asTheInspector, { mutedKinds: [], because: 'Synthetic: the case is over.', ifVersion: muted.body['version'] })
      expect(back.status, back.raw).toBe(200)
    }
  })
})

describe('an ask for a check of a settled run, whose kind the inspector has muted, with the notice-rule gate at off', () => {
  it('7: is marked the same way, names no hold it went past, and the notice-rule gate is not counted', async () => {
    const { agentByHandle } = await import('../src/server/lib/participants.ts')
    const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
    const asTheInspector = {
      ...as('agent', 'inspector-one'),
      'x-mole-office-key': makeAnAgentKey(agentByHandle('inspector-one')!.id, null),
      'content-type': 'application/json',
    }
    const asThePerson = { ...asPerson, ...thePersonsKeyHeader(join(dirname(t.file), 'keys.json')), 'content-type': 'application/json' }
    const gate = GATES.find((row) => row.id === 'held-by-a-notice-rule')!
    const setTheGate = async (value: 'off' | null): Promise<void> => {
      const saved = await call('POST', '/api/office/settings', asThePerson, { changes: [{ name: gate.setting, value }], because: 'Synthetic: the settled-ask test sets the notice-rule gate.' })
      expect(saved.status, saved.raw).toBe(200)
    }
    const counted = () => t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped FROM gate_counts WHERE gate = ?').get(gate.id)
    // CASE 6 SAVED THE INSPECTOR'S RULES ALREADY, so this save names the version it read.
    const read = await call('GET', '/api/messages/notice-rules', asTheInspector)
    expect(read.status, read.raw).toBe(200)
    const muted = await call('PUT', '/api/messages/notice-rules', asTheInspector, { mutedKinds: ['aCheckWasQueued'], because: 'Synthetic: the inspector mutes the office\'s ask.', ifVersion: read.body['version'] })
    expect(muted.status, muted.raw).toBe(200)
    await setTheGate('off')
    try {
      const { run, check } = await aSealedRun()
      settle(run, 'released')
      const reason = theReasonFor(run)

      const row = await theRowOf(check)
      expect(row.needsNoRun).toBe(reason)
      expect(row.askOfASettledRun).toBe(true)
      expect(row.heldByNoticeRule).toBeUndefined()
      expect(row.wouldHaveHeld).toBeUndefined()

      const before = counted()
      const pass = await onePass(settings, watching, [])
      expect(pass.held.filter((one) => one.messageId === check)).toEqual([{ messageId: check, because: reason }])
      expect(theDeliveryOf(check)).toEqual({ mark: 'delivered', because: reason })
      expect(counted()).toEqual(before)
    } finally {
      await setTheGate(null)
      const back = await call('PUT', '/api/messages/notice-rules', asTheInspector, { mutedKinds: [], because: 'Synthetic: the case is over.', ifVersion: muted.body['version'] })
      expect(back.status, back.raw).toBe(200)
    }
  })
})
