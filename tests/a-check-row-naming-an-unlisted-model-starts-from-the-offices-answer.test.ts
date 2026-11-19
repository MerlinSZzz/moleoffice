// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK ROW NAMING A MODEL ABSENT FROM src/config/launcher-model-compatibility.json STARTS FROM THE OFFICE'S ANSWER.
 *
 * The owner's goal is that any model, variant and thinking level works with no code change. The inspector's Casting row
 * in force may carry native data, as a builder's row may. Before this change GET /api/office/run-models/for/<agent>?place=check
 * gave a check the row's model and effort and no selection, and tools/the-inspector.mjs looked the model up in the
 * compatibility list, which names a fixed set of models, and refused every other one before anything started. Now the
 * door gives a check the row's selection, under the same rule as a builder's, and the tool starts the check from it. The
 * list is read only when the office gives no selection, or when --model names a model the selection does not name.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office in the first part of each case is the real server on a fresh test database,
 * and the row is written through the Casting door as the person. The office in the second part is
 * tests/inspector-tool-fixture.ts, a labelled stand-in whose run-models door answers what the real door answered in the
 * first part, and whose verdict door here is a fake one that answers 201. The tool is the real one, run --on-the-host.
 * The model is a stand-in claude or codex on PATH, labelled in its own first lines, which runs no model: it keeps the
 * arguments and the CLAUDE_CODE_EFFORT_LEVEL it was started with. Every model name and effort is made up for each run, so
 * the compatibility list names none of them, and the test says so before it relies on it.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - answer() in src/server/lib/run-models.ts attaches a selection for a builder only: the first two cases go red on the
 *     office's answer.
 *   - The tool leaves the selection unread: the first two cases go red on the refusal, and the third on its message.
 */
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckRowsSelection, aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_INSPECTOR = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'inspector-one', 'x-mole-office-workspace': WORKSPACE }
const THE_REFUSAL = 'No complete native selection or exact legacy compatibility data is available'
const THREAD = '01234567-89ab-cdef-0123-456789abcdef'
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: [{ paths: ['work'], to: 'aRecordMadeUp', how: TRACED_HOW[0], said: 'Synthetic.' }] }

let t: TestDb
let app: FastifyInstance
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' } })
  expect(made.statusCode, made.body).toBe(201)
})
afterAll(async () => {
  await app.close()
  t.close()
})

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

/** A model, its native name and an effort made up for this run, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, native: `native-${key}`, effort: `effort-${key}` }
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  for (const name of [made.model, made.native]) expect(listed.aliases[name] ?? listed.startValues[name]).toBeUndefined()
  return made
}

/** THE INSPECTOR'S ROW IN FORCE, written as the person, naming `made` on `program` with native data. Its id. */
async function theInspectorsRow(program: 'claude-code' | 'codex', made: ReturnType<typeof unseen>): Promise<number> {
  const row = { program: { value: program }, model: { value: made.model }, effort: { value: made.effort }, native: { model: made.native, provider: null, variant: null } }
  const taken = (await app.inject({ method: 'GET', url: `/api/casting/for/inspector?project=${WORKSPACE}`, headers: AS_THE_PERSON })).json() as { casting: { id: number } | null }
  const written = taken.casting === null
    ? await app.inject({ method: 'POST', url: '/api/casting/inspector', headers: AS_THE_PERSON, payload: row })
    : await app.inject({ method: 'PATCH', url: `/api/casting/rows/${String(taken.casting.id)}`, headers: AS_THE_PERSON, payload: row })
  expect([200, 201], written.body).toContain(written.statusCode)
  return (written.json() as { casting: { id: number } }).casting.id
}

type Run = { program: string; argv: string[]; effort: string | null }

/**
 * A STAND-IN claude AND codex on PATH, and a fake verdict door on the fixture office. Each run's program, arguments and
 * CLAUDE_CODE_EFFORT_LEVEL are kept, one file each; each answers a release in its own program's envelope.
 */
function standIns(f: Fixture): { bin: string; runs: () => Run[]; posts: Record<string, unknown>[] } {
  const bin = join(f.home, 'bin')
  const runs = join(f.home, 'runs-of-the-model')
  mkdirSync(bin)
  mkdirSync(runs)
  const script = [
    `#!${process.execPath}`,
    '// A stand-in for claude and codex, written by a test. It runs no model: it keeps what it was started with and answers a release.',
    "import { readdirSync, writeFileSync } from 'node:fs'",
    "import { basename } from 'node:path'",
    'const program = basename(process.argv[1])',
    'process.stdin.on("data", () => {})',
    "process.stdin.on('end', () => {",
    `  const n = readdirSync(${JSON.stringify(runs)}).length`,
    `  writeFileSync(${JSON.stringify(runs)} + '/' + n + '.json', JSON.stringify({ program, argv: process.argv.slice(2), effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null }))`,
    `  const text = ${JSON.stringify(JSON.stringify(A_RELEASE))}`,
    `  if (program === 'claude') process.stdout.write(JSON.stringify({ type: 'result', session_id: ${JSON.stringify(THREAD)}, result: text, is_error: false }))`,
    `  else process.stdout.write([{ type: 'thread.started', thread_id: ${JSON.stringify(THREAD)} }, { type: 'item.completed', item: { type: 'agent_message', text } },`,
    "    { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }].map((event) => JSON.stringify(event)).join('\\n') + '\\n')",
    '})',
  ].join('\n')
  for (const name of ['claude', 'codex']) {
    writeFileSync(join(bin, name), script)
    chmodSync(join(bin, name), 0o755)
  }
  const posts: Record<string, unknown>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      posts.push(JSON.parse(raw) as Record<string, unknown>)
      reply.statusCode = 201
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null }))
    })
    return true
  }
  f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null } } as never
  const read = () => readdirSync(runs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as Run)
  return { bin, runs: read, posts }
}

async function inspect(f: Fixture, bin: string, flags: string[] = []) {
  return f.inspect(['--check', aMadeUpCheckSession(), ...flags], {
    HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}`, CLAUDE_CODE_EFFORT_LEVEL: 'the-callers-own-setting', OPENAI_API_KEY: 'a-made-up-key',
  }, true)
}

/** The value after `flag`, where the command has it once; it fails the case when the flag is missing or repeated. */
function theOne(argv: string[], flag: string): string | undefined {
  expect(argv.filter((word) => word === flag), `${flag} in ${JSON.stringify(argv)}`).toHaveLength(1)
  return argv[argv.indexOf(flag) + 1]
}

describe("a check row naming a model absent from the compatibility list starts from the office's answer", () => {
  // MUTATION: answer() attaches a selection for a builder only; red on the office's selection. The tool leaves the
  // selection unread; red on the exit code, with the refusal.
  it('on Claude Code: the office gives the row\'s selection, and the tool starts claude with its native model and effort', async () => {
    const made = unseen()
    const id = await theInspectorsRow('claude-code', made)
    const answered = await app.inject({ method: 'GET', url: '/api/office/run-models/for/inspector-one?place=check', headers: AS_THE_INSPECTOR })
    expect(answered.statusCode, answered.body).toBe(200)
    const said = answered.json() as Record<string, unknown>
    const exact = (await app.inject({ method: 'GET', url: `/api/casting/rows/${String(id)}/selection`, headers: AS_THE_PERSON })).json() as { selection: unknown }
    expect(said['selection']).toEqual(exact.selection)
    expect(said['selection']).toMatchObject({ runtime: 'claude-code', model: made.model, native: { model: made.native, provider: null, variant: null, effort: made.effort }, casting: { id } })
    expect(said).toMatchObject({ runtime: 'claude-code', model: made.model, variant: made.effort, from: 'the role' })

    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = said
    const model = standIns(f)
    const ran = await inspect(f, model.bin)
    expect(ran.err).not.toContain(THE_REFUSAL)
    expect(ran.code, ran.err).toBe(0)
    const runs = model.runs()
    expect(runs.map((run) => run.program)).toEqual(['claude'])
    expect(theOne(runs[0]!.argv, '--model')).toBe(made.native)
    expect(theOne(runs[0]!.argv, '--effort')).toBe(made.effort)
    expect(runs[0]!.effort).toBe(made.effort)
    expect(runs[0]!.argv).not.toContain(made.model)
    expect(model.posts).toHaveLength(1)
  })

  it('on Codex: the office gives the row\'s selection under the name it is set with, and the tool starts codex with its native model and effort', async () => {
    const made = unseen()
    const id = await theInspectorsRow('codex', made)
    const answered = await app.inject({ method: 'GET', url: '/api/office/run-models/for/inspector-one?place=check', headers: AS_THE_INSPECTOR })
    expect(answered.statusCode, answered.body).toBe(200)
    const said = answered.json() as Record<string, unknown>
    expect(said['selection']).toMatchObject({ runtime: 'codex', model: made.model, native: { model: made.native, provider: null, variant: null, effort: made.effort }, casting: { id } })
    // A check keeps the model's name as it is set: the openai/ name is a builder's, in src/server/api/run-models.ts.
    expect(said).toMatchObject({ runtime: 'codex', model: made.model, variant: made.effort, from: 'the role' })

    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = said
    const model = standIns(f)
    const ran = await inspect(f, model.bin)
    expect(ran.err).not.toContain(THE_REFUSAL)
    expect(ran.code, ran.err).toBe(0)
    const runs = model.runs()
    expect(runs.map((run) => run.program)).toEqual(['codex'])
    expect(theOne(runs[0]!.argv, '-m')).toBe(made.native)
    expect(runs[0]!.argv).toContain(`model_reasoning_effort=${JSON.stringify(made.effort)}`)
    expect(runs[0]!.argv).not.toContain(made.model)
    expect(model.posts).toHaveLength(1)
  })

  // MUTATION: the tool leaves the selection unread; red on the message, since the list's refusal is said instead.
  it('ends the tool with nothing started and no verdict when the selection the office gives is malformed', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const made = unseen()
    f.state.checkModel = { model: made.model, from: 'the role', says: 'Synthetic: a row.', selection: { ...aCheckRowsSelection(made.model), native: { model: made.native } } }
    const model = standIns(f)
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('The launcher selection is malformed or incomplete. Nothing was started.')
    expect(ran.err).not.toContain(THE_REFUSAL)
    expect(model.runs()).toEqual([])
    expect(model.posts).toEqual([])
  })

  it('goes by the compatibility list when --model names a model the row does not name, and passes no effort', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const made = unseen()
    f.state.checkModel = { model: made.model, variant: made.effort, from: 'the role', says: 'Synthetic: a row.', selection: aCheckRowsSelection(made.model, made.effort) }
    const model = standIns(f)
    const listed = 'claude-sonnet-5'
    expect((LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string> }).aliases[listed]).toBeDefined()
    const ran = await inspect(f, model.bin, ['--model', listed])
    expect(ran.code, ran.err).toBe(0)
    const runs = model.runs()
    expect(theOne(runs[0]!.argv, '--model')).toBe(listed)
    expect(runs[0]!.argv).not.toContain('--effort')
    expect(runs[0]!.effort).toBe('the-callers-own-setting')
    expect(ran.out).toContain(`The office names effort ${made.effort} with ${made.model}, and --model named ${listed}, so it is not passed.`)
  })
})
