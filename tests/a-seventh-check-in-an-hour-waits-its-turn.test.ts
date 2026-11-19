// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
/**
 * A SEVENTH CHECK IN AN HOUR WAITS ITS TURN. This is wave 13v round 34, the second part of a decision.
 *
 * The decision: at most six checks an hour in one lane. The round 34 brief: "A seventh waits its turn and says why. It is
 * never refused." The secretary's answer to the owner's question of 22 September, kept on the decision record: "the cap counts per
 * lane (one repository row per project), is a setting, and only paces with one sentence to the secretary".
 *
 * WHAT IS PROVED HERE, against a real database, the real server and the real worker pass:
 *
 *   1. THE SEVENTH WAITS. Six checks started in the last hour in the lane hold a seventh. The worker's queue row says how
 *      many started, in which lane, and the most. One pass holds the check with a sentence that says it waits its turn and
 *      is not refused, and starts nothing. The secretary is told in one message, and only once. Once one of the six is
 *      more than an hour old, the next pass starts the check.
 *   2. ANOTHER LANE IS NOT COUNTED. Six checks in another project's repository do not hold a check in this one.
 *   3. THE NUMBER IS A SETTING. MOLE_OFFICE_CHECKS_AN_HOUR=2 paces at two. A value the office cannot use, 7 (over the
 *      owner's six) or "six", holds the check and names the setting; nothing is guessed in its place.
 *   4. ONE PASS COUNTS WHAT IT STARTED. Five in the hour and two checks queued: the pass starts one and holds the other.
 *   5. THE LANE. A run's merge entry names its lane. A run with no entry, in a project with two repositories, has no lane
 *      the office can tell, so its check is not paced, and the queue row says why.
 *
 * WHAT WOULD MAKE EACH CASE GO RED is in the commit that adds the code, with the control run and the restore.
 *
 * Every fixture here is synthetic and says so: the git trees are made under `.logs/` in this checkout and removed after,
 * the records are filed as fixtures, the "checks started earlier" are session records the test files with the fields a
 * started check has, the check tool is tests/fake-inspection-tool.mjs, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
let lane = ''
let otherLane = ''
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const ELSEWHERE = 'elsewhere'
const SETTING = 'MOLE_OFFICE_CHECKS_AN_HOUR'
const THE_WORKER = 'mole-office/the-message-worker'
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
const asTheOffice = as('agent', THE_WORKER)
const theWorker = { type: 'agent' as const, id: 'worker-w' }

const A = 'work/a.txt'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `checks-an-hour-${prefix}-`))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/**
 * A finished run of the worker, sealed at its own tree's tip: a synthetic main holding work/a.txt, and one commit on a
 * branch `work` that changes it. If sealing asks for no check, the person explicitly asks through ask-again.
 * Returns the run id and its real check message; the assertions about holding and pacing stay the same.
 */
async function aSealedRun(): Promise<{ run: string; check: string }> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic checks-an-hour fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic checks-an-hour run',
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

/**
 * A RUN CHECKED EARLIER: a session record filed as a fixture in a state that seals nothing, so the office asks no check
 * of it now and nothing of it waits in the queue beside the case's own check.
 */
function aRunCheckedEarlier(workspaceId = WORKSPACE): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run checked earlier',
    workspaceId,
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'crashed', servingAgent: 'worker-w' },
  }).id
}

/**
 * CHECKS STARTED EARLIER, AS THE WORKER FILES ONE: a session record whose `extra.purpose` is 'inspection' and whose
 * `extra.inspectionRun` names the run it checked. Synthetic: no tool ran for any of them.
 */
function checksStartedEarlier(count: number, run: string, workspaceId = WORKSPACE): string[] {
  return Array.from({ length: count }, (_, n) =>
    t.api.createRecord({
      kind: 'session',
      title: `Synthetic check ${String(n + 1)} of run ${run}, started earlier`,
      workspaceId,
      actor: { type: 'agent', id: THE_WORKER },
      origin: 'fixture',
      data: { state: 'crashed', runtime: 'inspection-tool', servingAgent: 'inspector-one', extra: { purpose: 'inspection', inspectionRun: run } },
    }).id,
  )
}

/** Every check started so far is made two hours old, so a case counts only the checks it starts itself. */
function theHourBeforeIsEmpty(): void {
  const twoHoursAgo = localStamp(new Date(Date.now() - 2 * 3_600_000))
  t.client.sqlite
    .prepare("UPDATE records SET created_at = ? WHERE kind = 'session' AND json_extract(data, '$.extra.purpose') = 'inspection'")
    .run(twoHoursAgo)
}

/** One session record made more than an hour old. */
function moreThanAnHourAgo(session: string): void {
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(localStamp(new Date(Date.now() - 61 * 60_000)), session)
}

interface ThePace { lane?: string; started?: number; most?: number; notPaced?: string; cannotPace?: string }
interface TheRow { messageId: string; to: { kind: string; id: string }; inspection: { run: string; pace?: ThePace } }

/** The worker's queue row for a check's message, read through the real door. */
async function theRowOf(message: string): Promise<TheRow> {
  const r = await call('GET', '/api/worker/queue', {})
  expect(r.status, r.raw).toBe(200)
  const queue = r.body['queue'] as (TheRow & { handle: string; inspection?: TheRow['inspection'] })[]
  const row = queue.find((one) => one.messageId === message && one.inspection !== undefined)
  const rows = queue.map((one) => `${one.messageId} to ${one.handle}${one.inspection === undefined ? '' : ' (a check)'}`).join('; ')
  expect(row?.inspection, `no check row for ${message}; the queue: ${rows}`).toBeDefined()
  return row as TheRow
}

/** Whether a check of the run has started: the office wrote its execution on the run. */
function itStarted(run: string): boolean {
  return (t.api.getRecord(run)!.data['theCheck'] as { execution?: unknown } | undefined)?.execution !== undefined
}

/** The messages that tell somebody a check waits its turn, about one run, oldest first. */
function theSecretaryWasTold(run: string): { id: string; body: string; to: { kind: string; id: string }[] }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'aCheckWaitsItsTurn' ORDER BY rowid")
    .all(run) as { id: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { body: string; to: { kind: string; id: string }[] }
    return { id: row.id, body: data.body, to: data.to }
  })
}

/** The registry id of an agent, by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/**
 * The worker's sentence for a check this pass held, as the inspector's delivery row holds it. The check message also goes
 * to the run's own agent as a line that needs no run, which the pass lists as held too, so the pass's list alone cannot say
 * which sentence is the check's.
 */
function heldBecause(pass: Awaited<ReturnType<typeof onePass>>, message: string): string {
  expect(pass.held.some((one) => one.messageId === message), `the pass did not hold ${message}: ${JSON.stringify(pass.held)}`).toBe(true)
  expect(pass.started.some((one) => one.messageId === message), `the pass started ${message}`).toBe(false)
  const delivery = t.client.sqlite
    .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
    .get(message, theIdOf('inspector-one')) as { mark: string; because: string | null } | undefined
  expect(delivery?.mark, `the check ${message} is not queued for inspector-one`).toBe('queued')
  return delivery!.because ?? ''
}

/** Let every check this file started end, so nothing outlives the case that started it. */
async function untilTheStartedChecksEnd(): Promise<void> {
  const until = Date.now() + 30_000
  while (watching.length > 0 && Date.now() < until) {
    await new Promise((go) => setTimeout(go, 100))
    await onePass(settings, watching)
  }
  expect(watching, 'a started check did not end').toEqual([])
}

beforeAll(async () => {
  t = await freshDb()
  const workspaces = await import('../src/server/lib/workspaces.ts')
  workspaces.createWorkspace({ id: ELSEWHERE, title: 'Synthetic: another project', note: 'a synthetic project with a repository of its own' })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
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
  lane = realpathSync(scratch('main'))
  otherLane = realpathSync(scratch('elsewhere'))
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: lane, actor: { type: 'human', id: THE_PERSON } })
  repositories.registerRepository({ workspaceId: ELSEWHERE, name: 'fixture-elsewhere', root: otherLane, actor: { type: 'human', id: THE_PERSON } })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    // ROOM FOR EVERY RUN this file starts, so the worker's own limit on runs at once never holds a check here.
    runs: 9,
    hops: 3,
    outputRoot: realpathSync(mkdtempSync(join(tmpdir(), 'checks-an-hour-worker-'))),
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
  made.push(settings.outputRoot)
}, 60_000)

afterEach(async () => {
  delete process.env[SETTING]
  await untilTheStartedChecksEnd()
  const listed = await call('GET', '/api/merge-queue', asStranger)
  for (const one of (listed.body['lanes'] ?? []) as { entries: { id: string; state: string }[] }[]) {
    for (const entry of one.entries) {
      if (LIVE.has(entry.state)) await call('POST', `/api/merge-queue/${entry.id}/withdraw`, asPerson, { because: 'the case is over' })
    }
  }
}, 60_000)

afterAll(async () => {
  delete process.env[SETTING]
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The checks-an-hour test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

// ============================================================================ 1. the seventh waits

describe('a seventh check in an hour in one lane', () => {
  it('waits its turn, says why and that it is not refused, and the secretary is told once', async () => {
    theHourBeforeIsEmpty()
    const six = checksStartedEarlier(6, aRunCheckedEarlier())
    const { run, check } = await aSealedRun()

    const row = await theRowOf(check)
    expect(row.inspection.run).toBe(run)
    expect(row.inspection.pace).toEqual({ lane, started: 6, most: 6 })

    const pass = await onePass(settings, watching)
    const because = heldBecause(pass, check)
    expect(because).toContain('The check waits its turn')
    expect(because).toContain(`6 checks have started in the lane ${lane} in the last hour`)
    expect(because).toContain('at most 6 start in one lane in an hour')
    expect(because).toContain(`in one lane in an hour (setting ${SETTING})`)
    expect(because).toContain(SETTING)
    expect(because).toContain('It is not refused')
    expect(pass.started.find((one) => one.messageId === check)).toBeUndefined()
    expect(itStarted(run)).toBe(false)

    // THE DELIVERY SAYS IT, where a person reading the message sees why it waits.
    const delivery = t.client.sqlite
      .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
      .get(check, row.to.id) as { mark: string; because: string }
    expect(delivery).toEqual({ mark: 'queued', because })

    // THE SECRETARY HEARS ONE SENTENCE, addressed to the card's holder alone, and quiet.
    const told = theSecretaryWasTold(run)
    expect(told).toHaveLength(1)
    expect(told[0]!.to).toEqual([{ kind: 'agent', id: theIdOf(THE_TEST_OFFICES_SECRETARY.handle) }])
    expect(told[0]!.body).toContain(`run ${run}`)
    expect(told[0]!.body).toContain(because)

    // ONCE: the door that writes the held sentence is asked again with the same sentence, and a second pass runs.
    const again = await call('POST', `/api/worker/messages/${check}/held`, asTheOffice, { to: row.to, because })
    expect(again.status, again.raw).toBe(200)
    const second = await onePass(settings, watching)
    expect(second.started.find((one) => one.messageId === check)).toBeUndefined()
    expect(theSecretaryWasTold(run)).toHaveLength(1)

    // ITS TURN COMES: one of the six is now more than an hour old, and the next pass starts the check.
    moreThanAnHourAgo(six[0]!)
    expect((await theRowOf(check)).inspection.pace).toEqual({ lane, started: 5, most: 6 })
    const turn = await onePass(settings, watching)
    expect(turn.started.find((one) => one.messageId === check), JSON.stringify(turn.held)).toBeDefined()
    expect(itStarted(run)).toBe(true)
  })
})

// ============================================================================ 2. another lane

describe('checks in another lane', () => {
  it('do not hold a check in this one', async () => {
    theHourBeforeIsEmpty()
    checksStartedEarlier(6, aRunCheckedEarlier(ELSEWHERE), ELSEWHERE)
    checksStartedEarlier(5, aRunCheckedEarlier())
    const { run, check } = await aSealedRun()
    expect((await theRowOf(check)).inspection.pace).toEqual({ lane, started: 5, most: 6 })
    const pass = await onePass(settings, watching)
    expect(pass.started.find((one) => one.messageId === check), JSON.stringify(pass.held)).toBeDefined()
    expect(itStarted(run)).toBe(true)
  })
})

// ============================================================================ 3. the setting

describe(`the number, read from ${SETTING}`, () => {
  it('paces at the number set, and a number the office cannot use holds the check and names the setting', async () => {
    theHourBeforeIsEmpty()
    checksStartedEarlier(2, aRunCheckedEarlier())
    const { run, check } = await aSealedRun()

    process.env[SETTING] = '2'
    expect((await theRowOf(check)).inspection.pace).toEqual({ lane, started: 2, most: 2 })
    const two = heldBecause(await onePass(settings, watching), check)
    expect(two).toContain(`2 checks have started in the lane ${lane} in the last hour`)
    expect(two).toContain('at most 2 start in one lane in an hour')
    expect(itStarted(run)).toBe(false)

    for (const cannot of ['7', 'six']) {
      process.env[SETTING] = cannot
      const pace = (await theRowOf(check)).inspection.pace
      expect(pace?.cannotPace).toContain(`${SETTING} is "${cannot}"`)
      const because = heldBecause(await onePass(settings, watching), check)
      expect(because).toBe(pace?.cannotPace)
      expect(because).toContain('a whole number from 1 to 6')
      expect(because).toContain('in one lane is the most the office allows')
      expect(because).toContain('It is not refused')
      expect(itStarted(run)).toBe(false)
    }

    delete process.env[SETTING]
    expect((await theRowOf(check)).inspection.pace).toEqual({ lane, started: 2, most: 6 })
    const pass = await onePass(settings, watching)
    expect(pass.started.find((one) => one.messageId === check), JSON.stringify(pass.held)).toBeDefined()
    expect(itStarted(run)).toBe(true)
  })
})

// ============================================================================ 4. one pass

describe('one pass that could start two checks', () => {
  it('counts the check it started, and holds the one that would be the seventh', async () => {
    theHourBeforeIsEmpty()
    checksStartedEarlier(5, aRunCheckedEarlier())
    const first = await aSealedRun()
    const second = await aSealedRun()
    expect((await theRowOf(first.check)).inspection.pace).toEqual({ lane, started: 5, most: 6 })
    expect((await theRowOf(second.check)).inspection.pace).toEqual({ lane, started: 5, most: 6 })

    const pass = await onePass(settings, watching)
    const ours = [first, second]
    const started = ours.filter((one) => pass.started.some((s) => s.messageId === one.check))
    const held = ours.filter((one) => !started.includes(one))
    expect(started, JSON.stringify(pass)).toHaveLength(1)
    expect(held, JSON.stringify(pass)).toHaveLength(1)
    expect(heldBecause(pass, held[0]!.check)).toContain(`6 checks have started in the lane ${lane} in the last hour`)
    expect(itStarted(held[0]!.run)).toBe(false)

    // AND IT STARTS ONCE THE HOUR HAS ROOM, so nothing this case queued is left waiting.
    await untilTheStartedChecksEnd()
    theHourBeforeIsEmpty()
    const later = await onePass(settings, watching)
    expect(later.started.find((one) => one.messageId === held[0]!.check), JSON.stringify(later.held)).toBeDefined()
  })
})

// ============================================================================ 5. the lane

describe('the lane a check counts in', () => {
  it('is its run’s merge entry’s, and a run whose lane cannot be told is not paced, and its row says why', async () => {
    theHourBeforeIsEmpty()
    const repositories = await import('../src/server/lib/repositories.ts')
    repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-second', root: realpathSync(scratch('second')), actor: { type: 'human', id: THE_PERSON } })

    const submitted = await aSealedRun()
    const entry = await call('POST', '/api/merge-queue', asSupervisor, { run: submitted.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })
    expect(entry.status, entry.raw).toBe(201)
    checksStartedEarlier(6, submitted.run)
    expect((await theRowOf(submitted.check)).inspection.pace).toEqual({ lane, started: 6, most: 6 })

    const { run, check } = await aSealedRun()
    const pace = (await theRowOf(check)).inspection.pace
    expect(pace?.lane).toBeUndefined()
    expect(pace?.notPaced).toContain(`run ${run}`)
    expect(pace?.notPaced).toContain('no merge entry')
    expect(pace?.notPaced).toContain('2 registered repositories')

    const pass = await onePass(settings, watching)
    expect(heldBecause(pass, submitted.check)).toContain('The check waits its turn')
    expect(pass.started.find((one) => one.messageId === check), JSON.stringify(pass.held)).toBeDefined()
    expect(itStarted(run)).toBe(true)
    expect(itStarted(submitted.run)).toBe(false)
  })
})
