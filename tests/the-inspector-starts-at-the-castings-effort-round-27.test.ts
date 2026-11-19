// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSPECTOR STARTS CLAUDE CODE AT THE EFFORT THE CASTING TABLE NAMES WITH ITS MODEL (wave 13v round 27).
 *
 * Row 11 of the Casting table gives the inspector claude-sonnet-5 at effort max. Until this round GET
 * /api/office/run-models/for/<agent>?place=check named the model and said "Its effort, max, is not passed to this run", and
 * tools/the-inspector.mjs started claude with the model alone. Now the door gives a check the row's effort as `variant`, and
 * the tool passes it as --effort and as CLAUDE_CODE_EFFORT_LEVEL and says it in its start lines. The effort goes with the
 * model it was named with: a --model naming another model gets none. No model or effort is written in the tool.
 *
 * THE OFFICE HERE IS ONE OF THIS BRANCH: the inspector's Casting row carries native data, so the door gives a check the
 * row's selection beside its model, and the tool starts the check from that selection. A --model naming another model goes
 * the old way, by the compatibility list (src/config/launcher-model-compatibility.json), which names no model here, so that
 * check is refused before anything starts.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office whose run-models door answers what each case sets and whose verdict door here is a fake one that
 * answers 201. The model is a stand-in claude on PATH, labelled in its own first lines, which runs no model: it keeps the
 * arguments and the CLAUDE_CODE_EFFORT_LEVEL it was started with, and answers from a file this test writes. Every model
 * name, effort and verdict here is made up. CLAUDE_CODE_EFFORT_LEVEL is pinned to a made-up value of the caller's, so a
 * setting in the shell that runs the test cannot pass or fail a case.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - theEffortFlag gives nothing: the first, second and last cases go red on the arguments.
 *   - The variable is not set on the host: the first, second and last cases go red on the variable.
 *   - The effort is passed under a model --model named instead (theEffortOfTheCheck's model test removed): the third case
 *     goes red on the start line.
 *   - The door gives a check no effort (tests/the-casting-table.test.ts, src/server/lib/run-models.ts): that test goes red.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { aCheckRowsSelection, aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: [{ paths: ['work'], to: 'aRecordMadeUp', how: TRACED_HOW[0], said: 'Synthetic.' }] }
const THE_CALLERS_OWN = 'the-callers-own-setting'
const CAST = { model: 'the-cast-model', variant: 'max', from: 'the role', says: 'The Casting table names the-cast-model for inspector.', selection: aCheckRowsSelection('the-cast-model', 'max') }
const NONE_PASSED = 'No effort is passed, so Claude Code uses its own setting.'

type Run = { argv: string[]; effort: string | null }

/**
 * A STAND-IN claude: answers with `check` when started without --resume, and with `asked` when started with it. Each run's
 * arguments and CLAUDE_CODE_EFFORT_LEVEL are kept, one file each, in the order run.
 */
function standInModel(home: string, check: Record<string, unknown>, asked: Record<string, unknown> = {}): { bin: string; runs: string } {
  const bin = join(home, 'bin')
  const runs = join(home, 'runs-of-the-model')
  mkdirSync(bin)
  mkdirSync(runs)
  const answers = join(home, 'answers.json')
  writeFileSync(answers, JSON.stringify({ check, asked }))
  writeFileSync(
    join(bin, 'claude'),
    [
      `#!${process.execPath}`,
      '// A stand-in for claude, written by a test. It runs no model: it keeps what it was started with and answers from a file.',
      "import { readFileSync, readdirSync, writeFileSync } from 'node:fs'",
      'process.stdin.on("data", () => {})',
      "process.stdin.on('end', () => {",
      `  const n = readdirSync(${JSON.stringify(runs)}).length`,
      `  writeFileSync(${JSON.stringify(runs)} + '/' + n + '.json', JSON.stringify({ argv: process.argv.slice(2), effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null }))`,
      `  const answers = JSON.parse(readFileSync(${JSON.stringify(answers)}, 'utf8'))`,
      "  process.stdout.write(JSON.stringify(process.argv.includes('--resume') ? answers.asked : answers.check))",
      '})',
    ].join('\n'),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  return { bin, runs }
}

function theRuns(runs: string): Run[] {
  return readdirSync(runs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as Run)
}

/** The arguments from --model on, without --resume and the session it names, wherever they stand. */
function fromTheModel(argv: string[]): string[] {
  const resume = argv.indexOf('--resume')
  const without = resume < 0 ? argv : [...argv.slice(0, resume), ...argv.slice(resume + 2)]
  return without.slice(without.indexOf('--model'))
}

/** A FAKE VERDICT DOOR on the fixture office: each post is kept and answered 201. */
function aFakeDoor(f: Fixture): Record<string, any>[] {
  const posts: Record<string, any>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      posts.push(JSON.parse(raw) as Record<string, any>)
      reply.statusCode = 201
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null }))
    })
    return true
  }
  f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null } } as never
  return posts
}

async function inspect(f: Fixture, bin: string, flags: string[] = []) {
  return f.inspect(['--check', aMadeUpCheckSession(), ...flags], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}`, CLAUDE_CODE_EFFORT_LEVEL: THE_CALLERS_OWN }, true)
}

describe('the effort the Casting table names with the check\'s model', () => {
  // MUTATION: theEffortFlag gives `[]`; this goes red on the arguments. The variable not set on the host: red on `effort`.
  it('is passed as --effort and as CLAUDE_CODE_EFFORT_LEVEL, and said in the start lines, when no --model is given', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = CAST
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: JSON.stringify(A_RELEASE) })
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(1)
    expect(fromTheModel(runs[0]!.argv)).toEqual(['--model', 'the-cast-model', '--effort', 'max'])
    expect(runs[0]!.effort).toBe('max')
    expect(ran.out).toContain('The office gives this check the-cast-model at effort max: The Casting table names the-cast-model for inspector.')
    expect(ran.out).toContain('The check is set to the-cast-model at effort max, with ')
    expect(ran.out).toContain('Running the check through the-cast-model at effort max, with ')
    expect(ran.out).not.toContain(NONE_PASSED)
    expect(posts).toHaveLength(1)
  })

  it('is passed when --model names the same model, as the message worker passes it, and the office is asked once', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = CAST
    aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: JSON.stringify(A_RELEASE) })
    const ran = await inspect(f, model.bin, ['--model', 'the-cast-model'])
    expect(ran.code, ran.err).toBe(0)
    expect(f.state.modelAsked).toHaveLength(1)
    const runs = theRuns(model.runs)
    expect(fromTheModel(runs[0]!.argv)).toEqual(['--model', 'the-cast-model', '--effort', 'max'])
    expect(runs[0]!.effort).toBe('max')
    expect(ran.out).toContain('Running the check through the-cast-model at effort max, with ')
  })

  // MUTATION: theEffortOfTheCheck passes the effort whatever model --model named; this goes red on the start line.
  it('is not passed under another model that --model named, which the compatibility list does not name either, so nothing starts', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = CAST
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: JSON.stringify(A_RELEASE) })
    const ran = await inspect(f, model.bin, ['--model', 'a-model-a-person-typed'])
    expect(ran.code).toBe(1)
    expect(ran.err).toContain("The check did not finish, so no verdict was written: The office gave no native selection for model a-model-a-person-typed, and the launcher's table does not name it. A person or a secretary adds a Casting row, or fills in a Casting row's native fields, on the Casting page. Nothing was started.")
    expect(theRuns(model.runs)).toEqual([])
    expect(posts).toEqual([])
    expect(ran.out).toMatch(new RegExp(`Running the check through a-model-a-person-typed, with [0-9.]+ minutes to finish\\. ${literally(`The office names effort max with the-cast-model, and --model named a-model-a-person-typed, so it is not passed. ${NONE_PASSED}`)}\n`))
    expect(ran.out).not.toContain('The office gives this check')
  })

  it('is not passed when the office names none, and the start line says so', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = { model: 'the-cast-model', variant: null, from: 'the role', says: 'Synthetic: a row with no effort.', selection: aCheckRowsSelection('the-cast-model') }
    aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: JSON.stringify(A_RELEASE) })
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(fromTheModel(runs[0]!.argv)).toEqual(['--model', 'the-cast-model'])
    expect(runs[0]!.effort).toBe(THE_CALLERS_OWN)
    expect(ran.out).toContain('The office gives this check the-cast-model: Synthetic: a row with no effort.')
    expect(ran.out).toMatch(new RegExp(`Running the check through the-cast-model, with [0-9.]+ minutes to finish\\. ${literally(NONE_PASSED)}\n`))
  })

  it('is passed again when the model is asked once more in the check\'s own session', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.checkModel = CAST
    const posts = aFakeDoor(f)
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: 'Here is my verdict.\n\n```json\n{"verdict": "released", "check": "Synthetic: a trailing comma follows",}\n```' },
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(fromTheModel(runs[1]!.argv)).toEqual(['--model', 'the-cast-model', '--effort', 'max'])
    expect(runs[1]!.argv).toContain('--resume')
    expect(runs[1]!.effort).toBe('max')
    expect(posts).toHaveLength(1)
  })
})

function literally(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
