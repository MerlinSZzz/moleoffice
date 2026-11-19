// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK THE OFFICE STARTS RUNS ON THE INSPECTOR'S CASTING ROW, MODEL AND EFFORT, AND NOT ON MOLE_OFFICE_INSPECTION_MODEL.
 * Wave 13j, the round after X4FMBW2bGWp-, point 2 of the check line's brief. Row 11 of the Casting table gives the
 * inspector claude-sonnet-5 at effort max. Each piece of the way was tested on
 * its own before; this file follows one check through all of them, with the fallback set to another model all the time:
 *
 *   1. theQueue puts the row's model on the check's queue row, and the worker's check adapter puts it on the tool's
 *      --model, although its own environment names the fallback;
 *   2. the run-models door the tool asks answers the row's model and effort, from the role and from Casting, and names the
 *      row;
 *   3. the real tool, given that --model and that answer, starts claude with --model claude-sonnet-5 --effort max and
 *      CLAUDE_CODE_EFFORT_LEVEL=max;
 *   4. THE CONTROL CASES. With the row's effort changed to high, the door and the tool say high, so the max above is the
 *      row's and not the owner's rule for claude-sonnet-5, which is also max (src/config/model-efforts.mjs). With the
 *      row's model taken away, the queue row carries none and the adapter and the door name the fallback, so the fallback
 *      was set and would have been used.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is a throwaway database behind the real routes, and the queue and the adapter
 * are the real ones. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a labelled
 * stand-in office that answers the run-models door with the reply the real door gave in case 2 and whose verdict door
 * here is a fake one that answers 201. Claude is a stand-in on PATH that runs no model: it keeps its arguments and
 * CLAUDE_CODE_EFFORT_LEVEL, and answers a made-up release. The fallback model's name is made up.
 *
 * MUTATIONS, RUN ON 16 OCTOBER 2026, each after a control run that was green:
 *   - In theQueue (src/server/lib/worker.ts) the check's queue row was given no model: cases 1, 3 and 4 went red, on the
 *     queue row's model and on --model.
 *   - In tools/the-inspector.mjs theEffortOfTheCheck passed no effort: cases 3 and 4 went red on the arguments.
 * Each was restored with cp and checked with cmp, and the control run again was green.
 */
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import type { TheModelARunGets } from '../src/shared/run-models.ts'
import { InspectionAdapter } from '../src/worker/runtimes/inspection.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
const tip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

const THE_INSPECTOR = 'the-inspector'
const THE_FALLBACK = 'a-fallback-model-nobody-cast'
const THE_CALLERS_OWN = 'the-callers-own-setting'
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: [{ paths: ['work'], to: 'aRecordMadeUp', how: TRACED_HOW[0], said: 'Synthetic.' }] }

let t: TestDb
let app: FastifyInstance
let castingId = 0
let theCheckMessage = ''
const fallbackBefore = process.env['MOLE_OFFICE_INSPECTION_MODEL']

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  return app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await call('POST', '/api/agents/started', headers, payload)
  expect(reply.statusCode, reply.body).toBe(201)
}

async function changeTheRow(cells: Record<string, { value: string | null }>): Promise<void> {
  const reply = await call('PATCH', `/api/casting/rows/${String(castingId)}`, PERSON, cells)
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The inspector's row on the queue for the check message, as the worker reads it. */
async function theChecksQueueRow() {
  const { theQueue } = await import('../src/server/lib/worker.ts')
  const row = theQueue(WORKSPACE).find((one) => one.messageId === theCheckMessage && one.handle === THE_INSPECTOR)
  expect(row?.inspection, 'the check is on the queue for the inspector').toBeDefined()
  return row!
}

/** The tool's command as the worker's check adapter builds it, from the queue row, in an environment naming the fallback. */
function theWorkersCommand(inspection: ConstructorParameters<typeof InspectionAdapter>[0]): { adapter: InspectionAdapter; args: string[] } {
  const adapter = new InspectionAdapter(inspection, { MOLE_OFFICE_INSPECTION_MODEL: THE_FALLBACK })
  const { args } = adapter.commandFor({ session: 's', agent: THE_INSPECTOR, prompt: 'p', cwd: '/tmp', api: 'http://x', workspace: WORKSPACE, outputPath: '/tmp/o' })
  return { adapter, args }
}

const theModelFlag = (args: string[]): string[] => args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)

/** The run-models door, asked as the tool asks it: as the checking agent, for the place of a check. */
async function whatTheDoorGivesTheCheck(): Promise<TheModelARunGets> {
  const reply = await call('GET', `/api/office/run-models/for/${THE_INSPECTOR}?place=check`, asAgent(THE_INSPECTOR))
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as TheModelARunGets
}

type Run = { argv: string[]; effort: string | null }

/** A STAND-IN claude that answers a made-up release and keeps each run's arguments and CLAUDE_CODE_EFFORT_LEVEL. */
function standInModel(home: string): { bin: string; runs: string } {
  const bin = join(home, 'bin')
  const runs = join(home, 'runs-of-the-model')
  mkdirSync(bin)
  mkdirSync(runs)
  writeFileSync(
    join(bin, 'claude'),
    [
      `#!${process.execPath}`,
      '// A stand-in for claude, written by a test. It runs no model: it keeps what it was started with and answers a made-up release.',
      "import { readdirSync, writeFileSync } from 'node:fs'",
      'process.stdin.on("data", () => {})',
      "process.stdin.on('end', () => {",
      `  const n = readdirSync(${JSON.stringify(runs)}).length`,
      `  writeFileSync(${JSON.stringify(runs)} + '/' + n + '.json', JSON.stringify({ argv: process.argv.slice(2), effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null }))`,
      `  process.stdout.write(${JSON.stringify(JSON.stringify({ session_id: 'a-made-up-session', result: JSON.stringify(A_RELEASE) }))})`,
      '})',
    ].join('\n'),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  return { bin, runs }
}

function theRuns(runs: string): Run[] {
  return readdirSync(runs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as Run)
}

/**
 * The real tool, run on the host against the stand-in office, which answers the run-models door with what the real door
 * answered. It is started with the --model the worker's command carries, and with the fallback in its environment. Its
 * stand-in claude's runs, and what it printed.
 */
async function theToolRuns(answered: TheModelARunGets, model: string): Promise<{ runs: Run[]; out: string }> {
  fixture = await inspectorFixture()
  const f = fixture
  f.state.checkModel = answered as unknown as Record<string, unknown>
  f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null } } as never
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    request.on('data', () => {})
    request.on('end', () => {
      reply.statusCode = 201
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null }))
    })
    return true
  }
  const claude = standInModel(f.home)
  const ran = await f.inspect(['--check', aMadeUpCheckSession(), '--model', model], {
    HOME: f.home, PATH: `${claude.bin}:${process.env['PATH'] ?? ''}`, CLAUDE_CODE_EFFORT_LEVEL: THE_CALLERS_OWN, MOLE_OFFICE_INSPECTION_MODEL: THE_FALLBACK,
  }, true)
  expect(ran.code, ran.err).toBe(0)
  expect(f.state.modelAsked).toHaveLength(1)
  return { runs: theRuns(claude.runs), out: ran.out }
}

/** The arguments from --model on, up to --resume when there is one. */
function fromTheModel(argv: string[]): string[] {
  const end = argv.indexOf('--resume')
  return argv.slice(argv.indexOf('--model'), end < 0 ? argv.length : end)
}

beforeAll(async () => {
  // THE FALLBACK IS SET IN THE OFFICE'S OWN ENVIRONMENT, which the queue and the door read, for the whole file.
  process.env['MOLE_OFFICE_INSPECTION_MODEL'] = THE_FALLBACK
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary', runtime: 'claude-code' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'checked-worker', name: 'Checked worker', role: 'worker', runtime: 'claude-code', workArea: ['src'] })
  await register(PERSON, { handle: THE_INSPECTOR, name: 'The inspector', role: 'inspector', runtime: 'claude-code' })

  const cells = { program: { value: 'claude-code' }, model: { value: 'claude-sonnet-5' }, effort: { value: 'max' } }
  const marked = ((await call('GET', '/api/casting/for/inspector', PERSON)).json() as { casting: { id: number } | null }).casting
  if (marked === null) {
    const added = await call('POST', '/api/casting/inspector', PERSON, cells)
    expect(added.statusCode, added.body).toBe(201)
    castingId = (added.json() as { casting: { id: number } }).casting.id
  } else {
    castingId = marked.id
    await changeTheRow(cells)
  }

  const run = await call('POST', '/api/records', asAgent('checked-worker'), {
    kind: 'session',
    title: 'A run the office checks',
    data: { state: 'running', servingAgent: 'checked-worker', cutFrom: 'main', tip, doing: 'building' },
  })
  expect(run.statusCode, run.body).toBe(201)
  const runId = (run.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(runId)
  const finished = await call('PATCH', `/api/records/${runId}`, asAgent('checked-worker'), { dataPatch: { state: 'finished', doing: 'done' } })
  expect(finished.statusCode, finished.body).toBe(200)
  theCheckMessage = (finished.json() as { theCheck?: { message?: string } }).theCheck?.message ?? ''
  expect(theCheckMessage, finished.body).not.toBe('')
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (fallbackBefore === undefined) delete process.env['MOLE_OFFICE_INSPECTION_MODEL']
  else process.env['MOLE_OFFICE_INSPECTION_MODEL'] = fallbackBefore
})

describe('a check the office starts, with the inspector cast as claude-sonnet-5 at effort max', () => {
  // MUTATION: theQueue gives the check's row no model; the adapter then names the fallback, and this goes red.
  it('1: carries the row\'s model on its queue row and on the tool\'s --model, past the fallback in the worker\'s environment', async () => {
    const row = await theChecksQueueRow()
    expect(row.inspection!.model).toBe('claude-sonnet-5')
    const { adapter, args } = theWorkersCommand(row.inspection!)
    expect(adapter.modelItWouldUse()).toBe('claude-sonnet-5')
    expect(theModelFlag(args)).toEqual(['--model', 'claude-sonnet-5'])
  })

  it('2: is answered the row\'s model and effort by the door the tool asks, from the role and from Casting, with the row named', async () => {
    const answered = await whatTheDoorGivesTheCheck()
    expect(answered).toMatchObject({
      runtime: 'claude-code', model: 'claude-sonnet-5', variant: 'max', effort: 'max',
      from: 'the role', effortFrom: 'Casting', casting: { id: castingId, scope: 'every project' },
    })
    expect(answered.says).toBe('The Casting table names claude-sonnet-5 for inspector. The run gets effort max from the Casting row for inspector.')
  })

  // MUTATION: theEffortOfTheCheck passes no effort; this and case 4 go red on the arguments.
  it('3: starts claude with --model claude-sonnet-5 --effort max and CLAUDE_CODE_EFFORT_LEVEL=max', async () => {
    const { args } = theWorkersCommand((await theChecksQueueRow()).inspection!)
    const { runs, out } = await theToolRuns(await whatTheDoorGivesTheCheck(), theModelFlag(args)[1]!)
    expect(runs).toHaveLength(1)
    expect(fromTheModel(runs[0]!.argv)).toEqual(['--model', 'claude-sonnet-5', '--effort', 'max'])
    expect(runs[0]!.effort).toBe('max')
    expect(out).toContain('Running the check through claude-sonnet-5 at effort max, with ')
    expect(out).not.toContain(THE_FALLBACK)
  })

  it('4: says the row\'s other effort when the row changes, and the fallback when the row names no model', async () => {
    await changeTheRow({ effort: { value: 'high' } })
    const high = await whatTheDoorGivesTheCheck()
    expect(high).toMatchObject({ model: 'claude-sonnet-5', variant: 'high', effortFrom: 'Casting' })
    const { args } = theWorkersCommand((await theChecksQueueRow()).inspection!)
    const atHigh = await theToolRuns(high, theModelFlag(args)[1]!)
    expect(fromTheModel(atHigh.runs[0]!.argv)).toEqual(['--model', 'claude-sonnet-5', '--effort', 'high'])
    expect(atHigh.runs[0]!.effort).toBe('high')

    await changeTheRow({ model: { value: null }, effort: { value: null } })
    const row = await theChecksQueueRow()
    expect(row.inspection!.model).toBeUndefined()
    expect(theModelFlag(theWorkersCommand(row.inspection!).args)).toEqual(['--model', THE_FALLBACK])
    expect(await whatTheDoorGivesTheCheck()).toMatchObject({ model: THE_FALLBACK, from: 'the settings file' })
    await changeTheRow({ model: { value: 'claude-sonnet-5' }, effort: { value: 'max' } })
  })
})
