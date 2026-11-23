// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PACKAGE KEEPS ITS WORKERS' ACCOUNT. Round FQ, point OP-3.
 *
 * WHAT THIS FILE PROVES, and the doors it proves it through:
 *   1. `POST /api/agents/<worker>/worker-run` takes `package`, `points`, `difficulty` and `why` together, keeps them
 *      on the supervisor's entry and copies them onto the worker's own run as `workerPackage`. A start that names no
 *      package is still taken and keeps none. A start that names a package and leaves out its difficulty, its why or a
 *      point the package does not hold is refused in words, and nothing is written. A brief's own `Difficulty:` line is
 *      the difficulty when the ask names none, and a disagreement between the two is refused.
 *   2. `GET /api/delegation/<task>/workers` lists the workers of one package: name, model, tokens, minutes and how many
 *      times a result went back. Tokens are read only from the run's own usage receipt; a run with no receipt says so
 *      and is never counted as zero. Minutes are the office's own filed and closed times. A hand-back is counted for the
 *      worker whose run its `run` names.
 *   3. `GET /api/delegation/workers?day=…` gives the same package lists for a day, in pages of at most 25 packages.
 *   4. Only the office writes `workerPackage`, on a create and on a patch.
 *
 * EVERYTHING IS MADE UP: the office, its keys, the sandbox folder, its repository (tests/a-made-up-sandbox-repo.ts), its
 * container row, the agents, the Casting row and every model. No worker is started and no model runs: the worker's run
 * is filed through the API as the office files one, and finished as a person finishes a run.
 *
 * MUTATION PROOF is written in the report after a green control run.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/the-message-worker-id.ts'
import { localStamp, parseLocalStamp } from '../src/shared/time.ts'
import { ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE } from '../src/shared/worker-runs.ts'
import { aMadeUpSandboxRepo } from './a-made-up-sandbox-repo.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MODEL = 'a-made-up-worker-model'
const TODAY = '2026-11-17'
const A_DAY_BEFORE = '2026-11-10'

let t: TestDb
let app: FastifyInstance
let scratch: string
let folder = ''
let brief = ''
let aBriefThatMarksHard = ''
let container = ''
let head = ''
let supervisorRun = ''
let supervisorRunKey = ''
let workerModeBefore: string | undefined

const asThePerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_WORKER = (session?: string): Record<string, string> => asAgent(THE_MESSAGE_WORKER_ID, A_MADE_UP_OFFICE_KEY, session)

async function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

const agents = new Map<string, { id: string; key: string }>()
async function started(handle: string, by: Record<string, string> = asThePerson, role?: string): Promise<{ id: string; key: string }> {
  const r = await call('POST', '/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', ...(role === undefined ? {} : { role }) })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const id = (r.body['agent'] as { id: string }).id
  const key = String((r.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  agents.set(handle, { id, key })
  return { id, key }
}
const asOne = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)
const idOf = (handle: string): string => agents.get(handle)!.id

function dataOf(id: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>
}
function writeData(id: string, data: Record<string, any>): void {
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
}
const theWorkerRunOf = (run: string, handle: string): Record<string, any> | undefined =>
  (dataOf(run)['workerRuns'] as Record<string, Record<string, any>> | undefined)?.[idOf(handle)]

/** A task carrying a readable package made for work inside the office. */
async function aTaskWithAPackage(pointIds: string[], title = `A made-up packaged task ${randomUUID().slice(0, 8)}`): Promise<string> {
  const r = await call('POST', '/api/records', asThePerson, {
    kind: 'task',
    title,
    data: {
      state: 'todo',
      package: {
        bundleId: `made-up-bundle-${randomUUID().slice(0, 8)}`,
        forTheOutside: 'Do the made-up work and return it.',
        acceptance: 'The made-up points are done.',
        parent: { kind: 'decision', id: 'made-up-parent' },
        lines: ['a made-up line'],
        pointIds,
        at: '2026-11-17 09:00:00',
        by: { actorType: 'human', actorId: THE_PERSON },
      },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

const ask = (handle: string, body: Record<string, unknown>, briefPath = brief) =>
  call('POST', `/api/agents/${idOf(handle)}/worker-run`, asAgent('xp-boss', supervisorRunKey, supervisorRun), { brief: briefPath, runtime: 'claude-code', model: A_MODEL, ...body })

/** The message worker's launcher run for one worker ask, filed with the office's key. */
async function aLauncherRun(handle: string): Promise<string> {
  const r = await call('POST', '/api/records', AS_THE_WORKER(), {
    kind: 'session',
    title: `A made-up launcher run for ${handle}`,
    data: {
      state: 'running',
      runtime: 'round-launcher',
      doing: 'starting a made-up worker run; this run runs no model',
      workingDirectory: CHECKOUT,
      startedByMoleOffice: true,
      extra: { purpose: 'worker', run: supervisorRun, worker: idOf(handle) },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

/** Ask, start, and file the worker's run as the office files it. */
async function startWorker(handle: string, body: Record<string, unknown>, startedAt = '2026-11-17 10:00:00'): Promise<{ run: string; key: string }> {
  const asked = await ask(handle, body)
  expect(asked.status, JSON.stringify(asked.body)).toBe(202)
  const launcher = await aLauncherRun(handle)
  const starting = await call('POST', `/api/worker/worker-runs/${supervisorRun}/starting`, AS_THE_WORKER(), { agent: idOf(handle), wrapper: launcher })
  expect(starting.status, JSON.stringify(starting.body)).toBe(200)
  const filed = await call('POST', '/api/records', AS_THE_WORKER(launcher), {
    kind: 'session',
    title: `A made-up worker run of ${handle}`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      model: A_MODEL,
      servingAgent: handle,
      servingAgentId: idOf(handle),
      workingDirectory: CHECKOUT,
      cutFrom: head,
      parentAttachment: supervisorRun,
      sandbox: { template: 'mole-office-dev', container, folder },
      startedAt,
    },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return { run: String(filed.body['record'].id), key: String(filed.body['runKey']?.key) }
}

/** Finish a made-up run as a person does, with a note it submits. */
async function finish(run: string): Promise<void> {
  const note = await call('POST', '/api/records', asThePerson, { kind: 'note', title: `A made-up note that run ${run} submits` })
  expect(note.status, JSON.stringify(note.body)).toBe(201)
  const done = await call('PATCH', `/api/records/${run}`, asThePerson, {
    dataPatch: { state: 'finished', closedAt: `${TODAY} 10:30:00`, submission: { kind: 'records', records: [String(note.body['record'].id)] } },
  })
  expect(done.status, JSON.stringify(done.body)).toBe(200)
}

beforeAll(async () => {
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-package-workers-'))

  await started('xp-quill', asThePerson, 'secretary')
  await started('xp-boss', asOne('xp-quill'))
  for (const handle of ['xp-accounted', 'xp-noreceipt', 'xp-running', 'xp-old', 'xp-all', 'xp-nodifficulty', 'xp-nowhy', 'xp-badpoint', 'xp-nopackagepoints', 'xp-pointswithoutpackage', 'xp-briefmark', 'xp-conflict', 'xp-nofiling', 'xp-label', 'xp-nolabel', 'xp-notime', 'xp-custom', 'xp-written']) {
    await started(handle, asOne('xp-boss'))
  }

  folder = join(realpathSync(scratch), 'sandboxes', 'xp-package-sandbox')
  mkdirSync(folder, { recursive: true })
  brief = join(folder, 'brief.md')
  writeFileSync(brief, '# A made-up brief for a worker\n\nDo the made-up work.\n')
  aBriefThatMarksHard = join(folder, 'brief-hard.md')
  writeFileSync(aBriefThatMarksHard, '# A made-up brief for a worker\n\nDifficulty: hard\n\nDo the made-up work.\n')
  const repo = aMadeUpSandboxRepo(folder, CHECKOUT)
  head = repo.head
  container = `row-${randomBytes(5).toString('hex')}`
  t.client.sqlite
    .prepare("INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-11-17 09:00:00', 'agent:fixture')")
    .run(container, 'mole-office-sandbox-xp-package-sandbox', `Sandbox xp-package-sandbox, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`)

  for (const name of ['hard', 'simple', 'reviewing']) {
    const label = await call('POST', '/api/casting/labels', asThePerson, { name })
    expect(label.status, JSON.stringify(label.body)).toBe(201)
  }

  const casting = await call('POST', '/api/casting/worker', asThePerson, { project: 'default', program: { value: 'claude-code' }, model: { value: A_MODEL }, effort: { value: 'high' } })
  expect(casting.status, JSON.stringify(casting.body)).toBe(201)

  const terminal = await call('POST', '/api/records', asOne('xp-quill'), { kind: 'session', title: 'The secretary in a terminal', data: { state: 'running', runtime: 'claude-code' } })
  expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
  const supervisor = await call('POST', '/api/records', asAgent('xp-quill', agents.get('xp-quill')!.key, String(terminal.body['record'].id)), {
    kind: 'session',
    title: 'A made-up supervisor run of xp-boss',
    data: {
      state: 'running',
      servingAgent: 'xp-boss',
      servingAgentId: idOf('xp-boss'),
      runtime: 'claude-code',
      model: `${A_MODEL}-supervisor`,
      workingDirectory: CHECKOUT,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container, folder },
    },
  })
  expect(supervisor.status, JSON.stringify(supervisor.body)).toBe(201)
  supervisorRun = String(supervisor.body['record'].id)
  supervisorRunKey = String(supervisor.body['runKey']?.key)
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('1. starting a worker names its package, its points, its difficulty and why', () => {
  const PACKAGE_POINTS = ['xp-point-1', 'xp-point-2']
  let packageTask = ''

  beforeAll(async () => {
    packageTask = await aTaskWithAPackage(PACKAGE_POINTS)
  })

  it('keeps the package on the ask and on the worker’s run, and reads it on the supervisor’s page', async () => {
    const asked = await ask('xp-all', { package: packageTask, points: PACKAGE_POINTS, difficulty: 'hard', why: 'It holds the two points this worker is fastest at.' })
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const stored = theWorkerRunOf(supervisorRun, 'xp-all')!
    expect(stored['package']).toEqual({
      task: packageTask,
      points: PACKAGE_POINTS,
      difficulty: 'hard',
      why: 'It holds the two points this worker is fastest at.',
      askedAt: stored['askedAt'],
    })

    const answer = await call('GET', `/api/records/${supervisorRun}`, asThePerson)
    expect(answer.status, JSON.stringify(answer.body)).toBe(200)
    const row = (answer.body['workers'] as { workers: Record<string, any>[] }).workers.find((one) => one['agent'] === idOf('xp-all'))!
    expect(row['package']).toEqual({
      task: packageTask,
      title: expect.stringContaining('A made-up packaged task'),
      points: PACKAGE_POINTS,
      difficulty: 'hard',
      why: 'It holds the two points this worker is fastest at.',
      askedAt: expect.any(String),
    })
  })

  it('takes a start that names no package, and shows it as naming none', async () => {
    const asked = await ask('xp-old', {})
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    expect(theWorkerRunOf(supervisorRun, 'xp-old')?.['package']).toBeUndefined()
    const answer = await call('GET', `/api/records/${supervisorRun}`, asThePerson)
    const row = (answer.body['workers'] as { workers: Record<string, any>[] }).workers.find((one) => one['agent'] === idOf('xp-old'))!
    expect(row['package']).toBeNull()
  })

  it('takes the difficulty the brief marks when the ask names none', async () => {
    const asked = await ask('xp-briefmark', { package: packageTask, points: PACKAGE_POINTS, why: 'The brief says how hard it is.' }, aBriefThatMarksHard)
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    expect(theWorkerRunOf(supervisorRun, 'xp-briefmark')?.['package']?.['difficulty']).toBe('hard')
  })

  it('refuses a package with no difficulty, a package with no why, and a point the package does not hold, writing nothing', async () => {
    const cases: { handle: string; body: Record<string, unknown>; says: string[] }[] = [
      { handle: 'xp-nodifficulty', body: { package: packageTask, points: PACKAGE_POINTS, why: 'A made-up reason.' }, says: ['difficulty'] },
      { handle: 'xp-nowhy', body: { package: packageTask, points: PACKAGE_POINTS, difficulty: 'simple' }, says: ['why'] },
      { handle: 'xp-badpoint', body: { package: packageTask, points: ['xp-point-1', 'xp-stranger'], difficulty: 'simple', why: 'A made-up reason.' }, says: ['xp-stranger', 'xp-point-1', 'xp-point-2'] },
      { handle: 'xp-nopackagepoints', body: { package: packageTask, difficulty: 'simple', why: 'A made-up reason.' }, says: ['points'] },
      { handle: 'xp-pointswithoutpackage', body: { points: PACKAGE_POINTS, difficulty: 'simple', why: 'A made-up reason.' }, says: ['package'] },
    ]
    for (const one of cases) {
      const r = await ask(one.handle, one.body)
      expect(r.status, `${one.handle}: ${JSON.stringify(r.body)}`).toBe(400)
      for (const word of one.says) expect(r.body['error'], one.handle).toContain(word)
      expect(theWorkerRunOf(supervisorRun, one.handle), `${one.handle} wrote an ask`).toBeUndefined()
    }
  })

  it('reads a difficulty through the labels taken now, and refuses one that is no label', async () => {
    // THE LABELS ARE READ IN ONE PLACE: a word is lower-cased and trimmed, and `simple` is still the label it names.
    const spaced = await ask('xp-label', { package: packageTask, points: PACKAGE_POINTS, difficulty: ' Simple ', why: 'A made-up reason.' })
    expect(spaced.status, JSON.stringify(spaced.body)).toBe(202)
    expect(theWorkerRunOf(supervisorRun, 'xp-label')?.['package']?.['difficulty']).toBe('simple')
    // A WORD THAT IS NOT A LABEL IS STILL REFUSED, and the refusal names the labels taken now.
    const noLabel = await ask('xp-nolabel', { package: packageTask, points: PACKAGE_POINTS, difficulty: 'middling', why: 'A made-up reason.' })
    expect(noLabel.status, JSON.stringify(noLabel.body)).toBe(400)
    expect(noLabel.body['error']).toContain('middling')
    expect(noLabel.body['error']).toContain('hard')
    expect(noLabel.body['error']).toContain('simple')
    expect(theWorkerRunOf(supervisorRun, 'xp-nolabel'), 'a refused label wrote an ask').toBeUndefined()
  })

  it('accepts a label made for the office as a package difficulty', async () => {
    const r = await ask('xp-custom', { package: packageTask, points: PACKAGE_POINTS, difficulty: 'reviewing', why: 'This package needs a review.' })
    expect(r.status, JSON.stringify(r.body)).toBe(202)
    expect(theWorkerRunOf(supervisorRun, 'xp-custom')?.['package']?.['difficulty']).toBe('reviewing')
  })

  it('refuses a difficulty that disagrees with the one the brief marks', async () => {
    const r = await ask('xp-conflict', { package: packageTask, points: PACKAGE_POINTS, difficulty: 'simple', why: 'A made-up reason.' }, aBriefThatMarksHard)
    expect(r.status, JSON.stringify(r.body)).toBe(400)
    expect(r.body['error']).toContain('hard')
    expect(r.body['error']).toContain('simple')
  })
})

describe('2. a package keeps its workers’ account', () => {
  const POINTS = ['xp-account-point-1', 'xp-account-point-2']
  let packageTask = ''
  let accountedRun = ''
  let noReceiptRun = ''
  let runningRun = ''

  beforeAll(async () => {
    packageTask = await aTaskWithAPackage(POINTS)
    const body = { package: packageTask, points: POINTS, difficulty: 'simple', why: 'These two points belong to this worker.' }
    accountedRun = (await startWorker('xp-accounted', body)).run
    noReceiptRun = (await startWorker('xp-noreceipt', body)).run
    runningRun = (await startWorker('xp-running', body)).run
    await finish(accountedRun)
    await finish(noReceiptRun)
    const receipt = await call('PATCH', `/api/records/${accountedRun}`, asThePerson, {
      dataPatch: { usageReceipt: { inputTokens: 1000, outputTokens: 500, inputIncludesCached: true, costUsd: 0.02 } },
    })
    expect(receipt.status, JSON.stringify(receipt.body)).toBe(200)
    // THIRTY MINUTES, exactly, between the office's own start and end of the accounted run.
    const data = dataOf(accountedRun)
    data['closedAt'] = data['closedAt'] ?? `${TODAY} 11:30:00`
    const closed = parseLocalStamp(String(data['closedAt']))!
    data['startedAt'] = localStamp(new Date(closed - 30 * 60_000)).slice(0, 19)
    writeData(accountedRun, data)
    // A HAND-BACK NAMING THE ACCOUNTED WORKER'S RUN, and one that names no worker at all.
    const pkg = dataOf(packageTask)['package']
    pkg['handedBack'] = [
      { by: { actorType: 'agent', actorId: idOf('xp-accounted') }, at: '2026-11-17 11:00:00', order: 1, points: [{ pointId: POINTS[0], outcome: 'done', words: 'Done.' }], run: accountedRun },
      { by: { actorType: 'agent', actorId: idOf('xp-noreceipt') }, at: '2026-11-17 11:05:00', order: 2, points: [{ pointId: POINTS[1], outcome: 'done', words: 'Done.' }] },
    ]
    const task = dataOf(packageTask)
    task['package'] = pkg
    writeData(packageTask, task)
    // THE ASKS BELONG TO AN EARLIER DAY, so the day read below counts only its own packages.
    for (const run of [accountedRun, noReceiptRun, runningRun]) {
      const worker = dataOf(run)
      worker['workerPackage']['askedAt'] = `${A_DAY_BEFORE} 10:00:00`
      writeData(run, worker)
    }
    for (const handle of ['xp-accounted', 'xp-noreceipt', 'xp-running']) {
      const supervisor = dataOf(supervisorRun)
      supervisor['workerRuns'][idOf(handle)]['package']['askedAt'] = `${A_DAY_BEFORE} 10:00:00`
      writeData(supervisorRun, supervisor)
    }
  }, 60_000)

  it('lists the package’s workers, models, tokens, minutes and results that went back', async () => {
    const r = await call('GET', `/api/delegation/${packageTask}/workers`, asThePerson)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    const body = r.body as Record<string, any>
    expect(body['task']).toBe(packageTask)
    expect(body['title']).toContain('A made-up packaged task')
    expect(body['pointIds']).toEqual(POINTS)
    expect(body['workers']).toHaveLength(3)

    const accounted = body['workers'].find((one: Record<string, any>) => one['runId'] === accountedRun)
    expect(accounted['handle']).toBe('xp-accounted')
    expect(accounted['model']).toBe(A_MODEL)
    expect(accounted['state']).toBe('finished')
    expect(accounted['tokens']).toEqual({ input: 1000, output: 500, total: 1500, read: true, notRead: null })
    expect(accounted['minutes']).toMatchObject({ minutes: 30, running: false, notCounted: null })
    expect(accounted['wentBack']).toBe(1)
    expect(accounted['difficulty']).toBe('simple')
    expect(accounted['points']).toEqual(POINTS)

    const noReceipt = body['workers'].find((one: Record<string, any>) => one['runId'] === noReceiptRun)
    expect(noReceipt['tokens']['read']).toBe(false)
    expect(noReceipt['tokens']['total']).toBeNull()
    expect(noReceipt['tokens']['notRead']).toContain('receipt')
    expect(noReceipt['minutes']['minutes']).toBe(30)
    expect(noReceipt['wentBack']).toBe(0)

    const running = body['workers'].find((one: Record<string, any>) => one['runId'] === runningRun)
    expect(running['state']).toBe('running')
    expect(running['minutes']['running']).toBe(true)
    expect(running['minutes']['minutes']).toBeNull()
    expect(running['minutes']['notCounted']).toContain('still')

    expect(body['handbacks']).toEqual({ total: 2, byWorkers: 1, notNamingAWorker: 1 })
  })

  it('keeps a worker account for an ask whose worker was never filed', async () => {
    const body = { package: packageTask, points: POINTS, difficulty: 'hard', why: 'It cannot start yet.' }
    const asked = await ask('xp-nofiling', body)
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const r = await call('GET', `/api/delegation/${packageTask}/workers`, asThePerson)
    const row = (r.body['workers'] as Record<string, any>[]).find((one) => one['handle'] === 'xp-nofiling')
    expect(row!['runId']).toBeNull()
    expect(row!['state']).toBeNull()
    expect(row!['asked']).toBe('wanted')
    expect(row!['tokens']['read']).toBe(false)
    expect(row!['tokens']['notRead']).toContain('No run')
    expect(row!['minutes']['minutes']).toBeNull()
    expect(row!['minutes']['notCounted']).toContain('No run')
  })

  it('refuses a write in anyone else’s name to a run that holds a worker package, on a create and on a patch', async () => {
    const created = await call('POST', '/api/records', asOne('xp-boss'), {
      kind: 'session',
      title: 'A made-up run that tries to write its own worker package',
      data: { state: 'running', runtime: 'claude-code', workerPackage: { task: packageTask, points: POINTS, difficulty: 'simple', why: 'A made-up reason.', askedAt: '2026-11-17 10:00:00' } },
    })
    expect(created.status).toBe(403)
    expect(created.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE)
    const patched = await call('PATCH', `/api/records/${accountedRun}`, asOne('xp-boss'), {
      dataPatch: { workerPackage: { task: packageTask, points: POINTS, difficulty: 'simple', why: 'A made-up reason.', askedAt: '2026-11-17 10:00:00' } },
    })
    expect(patched.status).toBe(403)
    expect(patched.body['error']).toBe(ONLY_THE_OFFICE_WRITES_THE_WORKER_PACKAGE)
  })
})

describe('3. a day’s packages are read in pages of at most 25', () => {
  const DAY = '2026-11-16'
  const tasks: string[] = []

  let deleted = ''
  let notATask = ''
  let noPackage = ''

  beforeAll(async () => {
    const supervisor = dataOf(supervisorRun)
    const workerRuns = (supervisor['workerRuns'] ?? {}) as Record<string, Record<string, any>>
    const anAsk = (key: string, task: string, minute: number, points: string[]): Record<string, any> => ({
      state: 'wanted',
      askedAt: `${DAY} 12:${String(minute).padStart(2, '0')}:00`,
      askedBy: { who: { kind: 'agent', id: idOf('xp-boss') }, session: supervisorRun },
      handle: key,
      brief: { path: join(folder, 'brief.md'), sha256: 'a'.repeat(64), bytes: 1 },
      sandbox: { folder, instance: 'xp-package-sandbox', container },
      package: { task, points, difficulty: 'simple', why: 'A made-up day reason.', askedAt: `${DAY} 12:${String(minute).padStart(2, '0')}:00` },
    })
    for (let n = 0; n < 26; n += 1) {
      const task = await aTaskWithAPackage([`xp-day-point-${String(n)}`], `A made-up day package ${String(n)}`)
      tasks.push(task)
      workerRuns[`made-up-day-worker-${String(n)}`] = anAsk(`made-up-day-worker-${String(n)}`, task, n, [`xp-day-point-${String(n)}`])
    }
    // THREE PACKAGES ASKED FOR ON THE SAME DAY THAT THE OFFICE CANNOT PUT ON A PAGE. They are counted out of the page
    // and out of its total, with the reason each was left out, rather than dropped silently after paging.
    deleted = await aTaskWithAPackage(['xp-day-deleted-point'], 'A made-up package whose task is deleted')
    workerRuns['made-up-day-deleted'] = anAsk('made-up-day-deleted', deleted, 26, ['xp-day-deleted-point'])
    const note = await call('POST', '/api/records', asThePerson, { kind: 'note', title: 'A made-up record that is not a task' })
    expect(note.status, JSON.stringify(note.body)).toBe(201)
    notATask = String(note.body['record'].id)
    workerRuns['made-up-day-not-a-task'] = anAsk('made-up-day-not-a-task', notATask, 27, ['xp-day-note-point'])
    const bare = await call('POST', '/api/records', asThePerson, { kind: 'task', title: 'A made-up task with no package', data: {} })
    expect(bare.status, JSON.stringify(bare.body)).toBe(201)
    noPackage = String(bare.body['record'].id)
    workerRuns['made-up-day-no-package'] = anAsk('made-up-day-no-package', noPackage, 28, ['xp-day-bare-point'])
    supervisor['workerRuns'] = workerRuns
    writeData(supervisorRun, supervisor)
    t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-11-17 12:59:00' WHERE id = ?").run(deleted)
  }, 60_000)

  it('gives 25 packages on the first page and the rest on the second, and the same list as one package’s own door', async () => {
    const first = await call('GET', `/api/delegation/workers?day=${DAY}&page=1`, asThePerson)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body['packages']).toHaveLength(25)
    expect(first.body['page']).toMatchObject({ number: 1, size: 25, total: 26, hasMore: true })
    // THE THREE THE OFFICE CANNOT READ ARE COUNTED OUT BEFORE PAGING, and each says why.
    expect(first.body['leftOut']['count']).toBe(3)
    expect(first.body['leftOut']['packages']).toEqual(expect.arrayContaining([
      expect.objectContaining({ task: deleted, because: expect.stringContaining('deleted') }),
      expect.objectContaining({ task: notATask, because: expect.stringContaining('not a task') }),
      expect.objectContaining({ task: noPackage, because: expect.stringContaining('no package') }),
    ]))
    expect(first.body['leftOut']['says']).toContain('3')

    const second = await call('GET', `/api/delegation/workers?day=${DAY}&page=2`, asThePerson)
    expect(second.status, JSON.stringify(second.body)).toBe(200)
    expect(second.body['packages']).toHaveLength(1)
    expect(second.body['page']).toMatchObject({ number: 2, size: 25, total: 26, hasMore: false })

    const ids = [...(first.body['packages'] as { package: { task: string } }[]), ...(second.body['packages'] as { package: { task: string } }[])].map((one) => one.package.task)
    expect(new Set(ids).size).toBe(26)
    expect(new Set(ids)).toEqual(new Set(tasks))

    const one = (first.body['packages'] as { package: Record<string, any> }[])[0]!.package
    const alone = await call('GET', `/api/delegation/${String(one['task'])}/workers`, asThePerson)
    expect(alone.status, JSON.stringify(alone.body)).toBe(200)
    const { narrowedByPermission: _narrowed, ...alonePackage } = alone.body as Record<string, unknown>
    expect(one).toEqual(alonePackage)
  })

  it('refuses a day that is not a day, and a page size above 25', async () => {
    expect((await call('GET', '/api/delegation/workers?day=not-a-day', asThePerson)).status).toBe(400)
    expect((await call('GET', `/api/delegation/workers?day=${DAY}&size=26`, asThePerson)).status).toBe(400)
  })
})

describe('5. a row is never given a time the office did not record', () => {
  it('refuses to read a worker row whose ask has no time, rather than showing the time of the read', async () => {
    const task = await aTaskWithAPackage(['xp-notime-point'], 'A made-up package with a row that has no time')
    const { run } = await startWorker('xp-notime', { package: task, points: ['xp-notime-point'], difficulty: 'simple', why: 'A made-up reason.' })
    // THE SUPERVISOR'S ASK IS TAKEN AWAY, and the run's own package loses its asked time. The run's record time is the
    // only place left, and it is empty.
    const supervisor = dataOf(supervisorRun)
    delete supervisor['workerRuns'][idOf('xp-notime')]
    writeData(supervisorRun, supervisor)
    const worker = dataOf(run)
    delete worker['workerPackage']['askedAt']
    writeData(run, worker)
    t.client.sqlite.prepare("UPDATE records SET created_at = '' WHERE id = ?").run(run)
    const read = await call('GET', `/api/delegation/${task}/workers`, asThePerson)
    expect(read.status, JSON.stringify(read.body)).toBe(409)
    expect(read.body['error']).toContain('time')
    expect(read.body['error']).toContain('not recorded')
    expect(read.body).toMatchObject({ code: 'packageWorkerAskHasNoTime', values: { worker: 'xp-notime' } })
  })
})

describe('6. a supervisor’s run that asked a packaged worker can still be written', () => {
  it('takes a change of its doing line and a finish after its ask kept the package', async () => {
    const terminal = await call('POST', '/api/records', asOne('xp-quill'), { kind: 'session', title: 'A made-up secretary run in a terminal', data: { state: 'running', runtime: 'claude-code' } })
    expect(terminal.status, JSON.stringify(terminal.body)).toBe(201)
    const run = await call('POST', '/api/records', asAgent('xp-quill', agents.get('xp-quill')!.key, String(terminal.body['record'].id)), {
      kind: 'session',
      title: 'A made-up supervisor run of xp-boss that is written after a packaged ask',
      data: {
        state: 'running',
        servingAgent: 'xp-boss',
        servingAgentId: idOf('xp-boss'),
        runtime: 'claude-code',
        model: `${A_MODEL}-supervisor`,
        workingDirectory: CHECKOUT,
        cutFrom: head,
        sandbox: { template: 'mole-office-dev', container, folder },
      },
    })
    expect(run.status, JSON.stringify(run.body)).toBe(201)
    const runId = String(run.body['record'].id)
    const runKey = String(run.body['runKey']?.key)
    const task = await aTaskWithAPackage(['xp-written-point'])
    const asked = await call('POST', `/api/agents/${idOf('xp-written')}/worker-run`, asAgent('xp-boss', runKey, runId), { brief, runtime: 'claude-code', model: A_MODEL, package: task, points: ['xp-written-point'], difficulty: 'simple', why: 'A made-up reason.' })
    expect(asked.status, JSON.stringify(asked.body)).toBe(202)
    const kept = theWorkerRunOf(runId, 'xp-written')?.['package']
    expect(kept).toMatchObject({ task })
    const patched = await call('PATCH', `/api/records/${runId}`, asAgent('xp-boss', runKey, runId), { dataPatch: { doing: 'A made-up line written after a packaged ask' } })
    expect(patched.status, JSON.stringify(patched.body)).toBe(200)
    await finish(runId)
    expect(theWorkerRunOf(runId, 'xp-written')?.['package']).toEqual(kept)
  })
})
