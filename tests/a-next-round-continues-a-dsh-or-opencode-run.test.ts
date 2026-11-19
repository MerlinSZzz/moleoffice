// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT-ROUND DOOR CONTINUES A DSH OR OPENCODE RUN, AND TAKES ITS PROVIDERS FROM THE DATA FILE.
 *
 * src/server/lib/next-round.ts refused every runtime but claude-code and codex, though tools/sandbox.mjs round starts
 * all four, and it refused an OpenCode model such as opencode-go/deepseek-v4.1-flash because a runtime with no provider
 * in src/config/runtime-native-providers.json could name only a model with no slash. This file asks the office for a
 * next round of a dsh run, an opencode run and a claude-code run, files the launcher run, and calls the starting door.
 * The provider file is mocked with providers the test invents, and the program map with one more runtime, so the door
 * accepts and refuses by those two data sources alone.
 *
 * WHAT GOES RED WHEN THE FAULT COMES BACK:
 *   - the runtime list without dsh: the dsh case and the OpenCode case are refused;
 *   - an openai literal in place of the provider list: the Codex model under the made-up provider is refused, and both
 *     other-provider refusals stop naming the provider in the file;
 *   - a runtime list built in the door instead of read: the kimi case is refused;
 *   - the cap counting dsh: the dsh round waits behind a full Claude cap, and the starting door refuses it.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const made = vi.hoisted(() => {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return {
    key,
    providers: Object.freeze({ codex: `codex-provider-${key}`, 'claude-code': `claude-provider-${key}`, kimi: `kimi-provider-${key}` }),
    program: `made-up-program-${key}`,
    other: `other-provider-${key}`,
  }
})
vi.mock('../src/config/runtime-native-providers.json', async (importOriginal) => {
  const real = (await importOriginal<{ default: Record<string, { program: string; provider: string | null; fastMode: boolean }> }>()).default
  return {
    default: Object.freeze({
      ...real,
      codex: { ...real['codex']!, provider: made.providers.codex },
      'claude-code': { ...real['claude-code']!, provider: made.providers['claude-code'] },
      kimi: { program: made.program, provider: made.providers.kimi, fastMode: false },
    }),
  }
})
// THE RUNTIME THE TEST ADDS TO THE MAP THE DOOR READS: kimi, with a program this checkout does not have, so the door
// must accept that runtime only because the map says so.
vi.mock('../src/config/launcher-selection.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/launcher-selection.mjs')>()
  return { ...real, THE_PROGRAM_A_RUNTIME_RUNS: Object.freeze({ ...real.THE_PROGRAM_A_RUNTIME_RUNS, kimi: made.program }) }
})

const WORKSPACE = 'default'
const THE_WORKER_ID = 'mole-office/the-message-worker'
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const THE_CAP = 'MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE'
let asThePerson: Record<string, string> = {}
const asTheWorker = (): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_WORKER_ID,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
})

let t: TestDb
let app: FastifyInstance
let scratch = ''
let starterId = ''
let asTheStarter: Record<string, string> = {}
let workerModeBefore: string | undefined

async function call(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

/** An agent of this test's own, registered with the runtime and card the run will name. Its registry id. */
async function started(handle: string, runtime: string, role = 'supervisor'): Promise<string> {
  const r = await call('POST', '/api/agents/started', asTheStarter, { handle, name: handle, runtime, role })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return (r.body['agent'] as { id: string }).id
}

/** A container row of the ledger that vouches for the sandbox folder, as `tools/sandbox.mjs up` writes one. */
function aContainerRow(folder: string, name: string): string {
  const id = `row-${randomUUID()}`
  t.client.sqlite
    .prepare(
      "INSERT INTO session_resources (id, workspace_id, session_record_id, type, key, detail, registered_at, registered_by) VALUES (?, 'default', 'fixture-session', 'container', ?, ?, '2026-10-30 10:00:00', 'agent:fixture')",
    )
    .run(
      id,
      `mole-office-sandbox-${name}`,
      `Sandbox ${name}, from the template mole-office-dev; ${theWordsNamingTheFolder(folder)} Started by node tools/sandbox.mjs up.`,
    )
  return id
}

/** A made-up sandbox folder with a brief in it, and the container row that vouches for it. */
function aSandbox(name: string): { folder: string; brief: string; container: string } {
  const folder = join(realpathSync(scratch), 'sandboxes', name)
  mkdirSync(folder, { recursive: true })
  const brief = join(folder, 'brief.md')
  writeFileSync(brief, `# A made-up brief for ${name}\n\nDo the made-up next round.\n`)
  return { folder, brief, container: aContainerRow(folder, name) }
}

/** The agent's last run, started in a sandbox and filed by its starter, as the launcher files one. It has ended. */
function aSandboxRun(
  handle: string,
  agentId: string,
  sandbox: { folder: string; container: string },
  runtime: string,
  model: string,
): string {
  return t.api.createRecord({
    kind: 'session',
    title: `A made-up round of ${handle}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: starterId },
    origin: 'fixture',
    data: {
      state: 'running',
      servingAgent: handle,
      servingAgentId: agentId,
      runtime,
      model,
      workingDirectory: scratch,
      cutFrom: 'main',
      sandbox: { template: 'mole-office-dev', container: sandbox.container, folder: sandbox.folder },
    },
  }).id
}

/** The worker's launcher run for one round, filed with the office's key as the worker files it. */
async function aLauncherRun(round: string): Promise<string> {
  const r = await call('POST', '/api/records', asTheWorker(), {
    kind: 'session',
    title: `A made-up launcher run for the round after ${round}`,
    data: {
      state: 'running',
      runtime: 'round-launcher',
      doing: 'starting a made-up next round; this run runs no model',
      workingDirectory: scratch,
      startedByMoleOffice: true,
      extra: { purpose: 'round', round },
    },
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['record'].id)
}

/** A run of `runtime` with `model`, and the next-round door's answer to the ask for its next round. */
async function theAskFor(runtime: string, model: string, role = 'supervisor'): Promise<{ status: number; body: Record<string, any>; run: string; handle: string; agentId: string }> {
  const handle = `nr-${runtime}-${randomUUID().slice(0, 8)}`
  const agentId = await started(handle, runtime, role)
  const sandbox = aSandbox(`${runtime}-sandbox-${handle}`)
  const run = aSandboxRun(handle, agentId, sandbox, runtime, model)
  const asked = await call('POST', `/api/agents/${handle}/next-round`, asThePerson, { brief: sandbox.brief })
  return { status: asked.status, body: asked.body, run, handle, agentId }
}

/** A run of `runtime` with `model`, and the ask for its next round, with nothing started yet. */
async function anAsk(runtime: string, model: string, role = 'supervisor'): Promise<{ run: string; handle: string; agentId: string }> {
  const { status, body, run, handle, agentId } = await theAskFor(runtime, model, role)
  expect(status, JSON.stringify(body)).toBe(202)
  return { run, handle, agentId }
}

/** Ask for a next round of a run of `runtime` with `model`, file the launcher, and ask the starting door. */
async function aContinuation(runtime: string, model: string, role = 'supervisor'): Promise<{ status: number; body: Record<string, any>; run: string }> {
  const { run } = await anAsk(runtime, model, role)
  const wrapper = await aLauncherRun(run)
  const startedRound = await call('POST', `/api/worker/rounds/${run}/starting`, asTheWorker(), { wrapper })
  return { status: startedRound.status, body: startedRound.body, run }
}

/** A live process row of a run, as the office writes one; this test process stands for the run's own program. */
async function aLiveProcessRow(run: string): Promise<string> {
  const r = await call('POST', '/api/resources', asThePerson, {
    sessionRecordId: run,
    type: 'process',
    key: String(process.pid),
    detail: 'A synthetic process of this test',
    adopting: 'this test process stands for the made-up run’s own process, so the run reads as going',
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return String(r.body['resource'].id)
}

beforeAll(async () => {
  workerModeBefore = process.env['MOLE_OFFICE_MESSAGE_WORKER']
  process.env['MOLE_OFFICE_MESSAGE_WORKER'] = 'on'
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-next-round-continues-'))
  asThePerson = {
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(dirname(t.file), 'keys.json')),
  }
  // THE STARTER FILES EACH RUN'S SANDBOX, as the launcher does; a run never names its own.
  const starter = await call('POST', '/api/agents/started', asThePerson, { handle: 'nr-starter', name: 'nr-starter', runtime: 'claude-code', role: 'secretary' })
  expect(starter.status, JSON.stringify(starter.body)).toBe(201)
  starterId = (starter.body['agent'] as { id: string }).id
  asTheStarter = { ...asThePerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'nr-starter' }
  // THE OFFICE'S OWN KEY IS THE ONE THE WORKER USES, not the starter's; the starter key is for filing the runs.
  const starterKey = String((starter.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  expect(starterKey).not.toBe('')
  asTheStarter['x-mole-office-key'] = starterKey
}, 60_000)

afterAll(async () => {
  if (workerModeBefore === undefined) delete process.env['MOLE_OFFICE_MESSAGE_WORKER']
  else process.env['MOLE_OFFICE_MESSAGE_WORKER'] = workerModeBefore
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('the next-round door continues dsh, opencode and the runtime the data names', () => {
  it('starts a dsh next round on the run’s own model', async () => {
    const r = await aContinuation('dsh', 'deepseek-v4.1-flash')
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'dsh', model: 'deepseek-v4.1-flash' })
  })

  it('starts an opencode next round on a model named with its provider', async () => {
    const model = 'opencode-go/deepseek-v4.1-flash'
    const r = await aContinuation('opencode', model)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'opencode', model })
  })

  it('refuses another provider’s model for Claude Code at the ask, in words that name the run, the model and the runtime', async () => {
    const model = `${made.other}/model-${randomUUID()}`
    const r = await theAskFor('claude-code', model)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    expect(r.body['error']).toMatch(/ Nothing was written\.$/)
    expect(r.body['error']).toContain('cannot use for continuation')
    expect(r.body['error']).toContain(`Run ${r.run}`)
    expect(r.body['error']).toContain(model)
    expect(r.body['error']).toContain('claude-code')
    expect(r.body['error']).toContain(`provider ${made.providers['claude-code']}`)
  })

  it('takes and refuses a model by the runtime list and the provider list the test writes', async () => {
    // A RUNTIME THE TEST ADDS TO THE MAP: kimi is a runtime the schema knows, and this checkout's map has no program
    // for it, so the door takes it only because the map it reads says so.
    const own = `${made.providers.kimi}/model-${randomUUID()}`
    const taken = await aContinuation('kimi', own)
    expect(taken.status, JSON.stringify(taken.body)).toBe(200)
    expect(taken.body['round']).toMatchObject({ runtime: 'kimi', model: own })

    const other = `${made.other}/model-${randomUUID()}`
    const refused = await theAskFor('kimi', other)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body['error']).toMatch(/ Nothing was written\.$/)
    expect(refused.body['error']).toContain('cannot use for continuation')
    expect(refused.body['error']).toContain(`Run ${refused.run}`)
    expect(refused.body['error']).toContain(other)
    expect(refused.body['error']).toContain('kimi')
    expect(refused.body['error']).toContain(`provider ${made.providers.kimi}`)

    // AND A CODEX MODEL UNDER THE MADE-UP CODEX PROVIDER: an openai literal here would refuse it.
    const codexModel = `${made.providers.codex}/model-${randomUUID()}`
    const codex = await aContinuation('codex', codexModel)
    expect(codex.status, JSON.stringify(codex.body)).toBe(200)
    expect(codex.body['round']).toMatchObject({ runtime: 'codex', model: codexModel })
  })

  it('starts a native row in force on its selection, whatever provider its Office model names', async () => {
    const model = `${made.other}/model-${randomUUID()}`
    const added = await call('POST', '/api/casting/worker', asThePerson, {
      program: { value: 'claude-code' }, model: { value: model }, effort: { value: `effort-${randomUUID()}` },
      native: { model: `native-${randomUUID()}`, provider: null, variant: null },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const row = Number(added.body['casting'].id)
    try {
      const marked = await call('POST', `/api/casting/rows/${String(row)}/mark`, asThePerson)
      expect(marked.status, JSON.stringify(marked.body)).toBe(200)
      // THE ROW'S SELECTION IS WHAT THE LAUNCHER STARTS, so its Office model is a label and is read for no provider.
      const selection = await call('GET', `/api/casting/rows/${String(row)}/selection`, asThePerson)
      expect(selection.status, JSON.stringify(selection.body)).toBe(200)
      const r = await aContinuation('claude-code', model, 'worker')
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model, selection: selection.body['selection'] })
    } finally {
      const removed = await call('DELETE', `/api/casting/rows/${String(row)}`, asThePerson)
      expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    }
  })

  it('does not hold a dsh round behind a full Claude cap, while a claude-code round still waits', async () => {
    const before = process.env[THE_CAP]
    process.env[THE_CAP] = '1'
    let row = ''
    try {
      // ONE CLAUDE SUPERVISOR GOING, with a live process row: the cap is full.
      const goingHandle = `nr-cap-going-${randomUUID().slice(0, 8)}`
      const goingId = await started(goingHandle, 'claude-code')
      const going = t.api.createRecord({
        kind: 'session',
        title: `A made-up claude-code run of ${goingHandle} going now`,
        workspaceId: WORKSPACE,
        actor: { type: 'agent', id: starterId },
        origin: 'fixture',
        data: { state: 'running', servingAgent: goingHandle, servingAgentId: goingId, runtime: 'claude-code', model: 'claude-opus-5-5', doing: 'a made-up run that stands for one going now; no model runs' },
      }).id
      row = await aLiveProcessRow(going)
      const dsh = await anAsk('dsh', 'deepseek-v4.1-flash')
      const claude = await anAsk('claude-code', 'claude-opus-5-5')
      const listed = await call('GET', '/api/worker/rounds', asTheWorker())
      expect(listed.status, JSON.stringify(listed.body)).toBe(200)
      const runs = (listed.body['rounds'] as { run: string; runtime: string }[])
      expect(runs).toContainEqual(expect.objectContaining({ run: dsh.run, runtime: 'dsh' }))
      expect(runs.map((one) => one.run)).not.toContain(claude.run)
      // THE CAP DOES NOT FOLLOW IT INTO THE START: the dsh round starts with the cap full.
      const wrapper = await aLauncherRun(dsh.run)
      const startedRound = await call('POST', `/api/worker/rounds/${dsh.run}/starting`, asTheWorker(), { wrapper })
      expect(startedRound.status, JSON.stringify(startedRound.body)).toBe(200)
      expect(startedRound.body['round']).toMatchObject({ runtime: 'dsh', model: 'deepseek-v4.1-flash' })
    } finally {
      if (row !== '') t.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(row)
      if (before === undefined) delete process.env[THE_CAP]
      else process.env[THE_CAP] = before
    }
  })
})

describe('the round takes the role’s Casting row for the run’s own program', () => {
  // A ROLE NO OTHER CASE OF THIS FILE GIVES A ROW: supervisor. Three rows for it in this test's project, all made up.
  const ROLE = 'supervisor'
  const M = { model: `claude-model-${randomUUID()}`, effort: `effort-${randomUUID()}`, native: `native-${randomUUID()}` }
  const C = { model: `claude-model-${randomUUID()}`, effort: `effort-${randomUUID()}` }
  const O = { model: `opencode-model-${randomUUID()}`, effort: `effort-${randomUUID()}`, native: `native-${randomUUID()}`, provider: `provider-${randomUUID()}` }
  const rows = { marked: 0, otherClaude: 0, opencode: 0 }
  let theOpenCodeSelection: Record<string, any> = {}

  /** Add one row of the role in this test's project, with native fields when given, and answer its id. */
  async function addARow(program: string, model: string, effort: string, native?: { model: string; provider: string | null; variant: string | null }): Promise<number> {
    const added = await call('POST', `/api/casting/${ROLE}`, asThePerson, {
      project: WORKSPACE,
      program: { value: program }, model: { value: model }, effort: { value: effort },
      ...(native === undefined ? {} : { native }),
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    return Number(added.body['casting'].id)
  }

  /** The next round the run keeps, as it reads after the starting door. */
  function theKeptNextRound(run: string): Record<string, any> | undefined {
    return t.api.getRecord(run)?.data['nextRound'] as Record<string, any> | undefined
  }

  beforeAll(async () => {
    rows.marked = await addARow('claude-code', M.model, M.effort, { model: M.native, provider: null, variant: null })
    const marked = await call('POST', `/api/casting/rows/${String(rows.marked)}/mark`, asThePerson)
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    rows.otherClaude = await addARow('claude-code', C.model, C.effort)
    rows.opencode = await addARow('opencode', O.model, O.effort, { model: O.native, provider: O.provider, variant: null })
    const selection = await call('GET', `/api/casting/rows/${String(rows.opencode)}/selection`, asThePerson)
    expect(selection.status, JSON.stringify(selection.body)).toBe(200)
    theOpenCodeSelection = selection.body['selection'] as Record<string, any>
  })

  afterAll(async () => {
    // THE UNMARKED ROWS GO FIRST, because the marked row of a scope may not be removed while others remain.
    for (const id of [rows.opencode, rows.otherClaude, rows.marked]) {
      if (id === 0) continue
      const removed = await call('DELETE', `/api/casting/rows/${String(id)}`, asThePerson)
      expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    }
  })

  it('an opencode round starts the unmarked opencode row, with its effort and its selection, while the marked row casts claude-code', async () => {
    const r = await aContinuation('opencode', O.model, ROLE)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'opencode', model: O.model, selection: theOpenCodeSelection })
    expect(String(r.body['round']?.['modelSays'])).toContain(`Casting row ${String(rows.opencode)}`)
    const kept = theKeptNextRound(r.run)
    expect(kept?.['starting']).toMatchObject({ model: O.model, effort: O.effort })
    expect(String(kept?.['starting']?.['modelSays'])).toContain(`Casting row ${String(rows.opencode)}`)
  })

  it('a claude-code round still starts the marked row, while an unmarked row casts claude-code too', async () => {
    const r = await aContinuation('claude-code', M.model, ROLE)
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body['round']).toMatchObject({ runtime: 'claude-code', model: M.model })
    expect(theKeptNextRound(r.run)?.['starting']).toMatchObject({ model: M.model, effort: M.effort })
  })

  it('a codex round is refused in today’s words when no row in force casts codex', async () => {
    const r = await theAskFor('codex', `codex-model-${randomUUID()}`, ROLE)
    expect(r.status, JSON.stringify(r.body)).toBe(409)
    const says =
      `Casting row ${String(rows.marked)}, in force for ${ROLE}, casts claude-code with ${M.model}, ` +
      `and the round continues run ${r.run} on codex, so it cannot take its model from that row.`
    expect(r.body['error']).toBe(`${says} Nothing was written.`)
  })

  it('an opencode round is refused in words when two rows in force cast opencode and neither casts the run’s model', async () => {
    // TWO OPENCODE GO MODELS, the second row's and the run's. One Go limit covers both, but they are not the same model,
    // so neither row casts the run's model. A run whose model one row casts continues on that row:
    // R12 of tests/a-round-is-started-on-the-row-its-ask-kept.test.ts. Mutation caveat: Go models counted as one model.
    const O2 = { model: `opencode-go/model-${randomUUID()}`, effort: `effort-${randomUUID()}` }
    const second = await addARow('opencode', O2.model, O2.effort)
    try {
      const r = await theAskFor('opencode', `opencode-go/model-${randomUUID()}`, ROLE)
      expect(r.status, JSON.stringify(r.body)).toBe(409)
      const named = [rows.opencode, second].sort((one, two) => one - two).map((one) => String(one)).join(' and ')
      const says =
        `Casting rows ${named}, in force for ${ROLE}, both cast opencode, the runtime of run ${r.run}, ` +
        `and the marked row ${String(rows.marked)} casts claude-code, so the round cannot choose its model from one row.`
      expect(r.body['error']).toBe(`${says} Nothing was written.`)
    } finally {
      const removed = await call('DELETE', `/api/casting/rows/${String(second)}`, asThePerson)
      expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    }
  })
})
