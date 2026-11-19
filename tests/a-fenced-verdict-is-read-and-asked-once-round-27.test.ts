// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VERDICT IN A CODE FENCE IS NOT LOST, AND ONE THAT CANNOT BE READ IS ASKED FOR AGAIN ONCE, IN THE CHECK'S OWN SESSION.
 *
 * Wave 13v round 27. On 12 October 2026 check d_9QP5tIls6u (wave 13r round 28f) ended with a whole refusal written as
 * "Verification complete. Here is my final verdict." and a ```json fence. tools/the-inspector.mjs said "The check did not
 * end with a verdict" and wrote nothing. Its words as the model wrote them were not kept, so which of the two ways a
 * fence was lost happened is not known: a fence with a brace in the words after it, which the walk from the last `}`
 * cannot get past, or a fenced object that is not JSON or not a verdict. Both are here.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office whose verdict door here is a fake one that keeps each post and answers 201. The model is a
 * stand-in claude on PATH, labelled in its own first lines, which runs no model: it keeps each prompt and the arguments
 * it was started with, and answers from a file this test writes. Every verdict here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - theVerdictIn reads no fence: the first case exits 1, and the second loses its sentence.
 *   - The sentence is not added to the check: the first, second and fourth cases go red on the posted check.
 *   - The question goes to a new session when the check's answer names none: "asks nothing when the check's answer names
 *     no session" goes red on the second run of the model.
 *
 * Its last case, that an answer with no fence and no verdict ends the tool, was changed in wave 13j, the round after
 * X4FMBW2bGWp-: such an answer is asked once too. Its cases are the last describe here.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: [{ paths: ['work'], to: 'aRecordMadeUp', how: TRACED_HOW[0], said: 'Synthetic.' }] }
const FROM_A_FENCE = "The check's answer is not bare JSON, so its verdict was read from the last fenced JSON object in it."
const fenced = (text: string) => `Verification complete. Here is my final verdict.\n\n\`\`\`json\n${text}\n\`\`\``
const ASKED = "so the model was asked once, in the check's own session, to write its verdict again as one JSON object"

/**
 * A STAND-IN claude: answers the check with `check` when started without --resume, and the question asked back with
 * `asked` when started with it. Each run's prompt and arguments are kept, one file each, in the order run.
 */
function standInModel(home: string, check: Record<string, unknown>, asked: Record<string, unknown>): { bin: string; runs: string } {
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
      '// A stand-in for claude, written by a test. It runs no model: it keeps what it was given and answers from a file.',
      "import { readFileSync, readdirSync, writeFileSync } from 'node:fs'",
      'let prompt = ""',
      'process.stdin.on("data", (part) => { prompt += String(part) })',
      "process.stdin.on('end', () => {",
      `  const n = readdirSync(${JSON.stringify(runs)}).length`,
      `  writeFileSync(${JSON.stringify(runs)} + '/' + n + '.json', JSON.stringify({ argv: process.argv.slice(2), prompt }))`,
      `  const answers = JSON.parse(readFileSync(${JSON.stringify(answers)}, 'utf8'))`,
      "  process.stdout.write(JSON.stringify(process.argv.includes('--resume') ? answers.asked : answers.check))",
      '})',
    ].join('\n'),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  return { bin, runs }
}

/** Each run of the stand-in model, in the order run. */
function theRuns(runs: string): { argv: string[]; prompt: string }[] {
  return readdirSync(runs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as { argv: string[]; prompt: string })
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

async function inspect(f: Fixture, bin: string) {
  return f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
}

describe('a verdict in a code fence', () => {
  // MUTATION: theVerdictIn reads no fence (`const text = null`); this exits 1 and posts nothing.
  it('is read when words after the fence hold a brace, which the walk from the last brace cannot pass, and is said to be so in the output and the check', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: `${fenced(JSON.stringify(A_RELEASE, null, 2))}\n\nThe {brace} in this sentence is prose.` }, {})
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(ran.out).toContain(FROM_A_FENCE)
    expect(posts).toHaveLength(1)
    expect(posts[0]!['verdict']).toBe('released')
    expect(posts[0]!['check']).toBe(`${A_RELEASE.check}\n\n${FROM_A_FENCE}`)
  })

  // MUTATION: leave the sentence out of the check (`howItWasRead !== null` made `false`); this goes red on the post.
  it('carries the sentence when the walk finds the fenced object itself, as for an answer shaped like d_9QP5tIls6u\'s', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: fenced(JSON.stringify(A_RELEASE, null, 2)) }, {})
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(FROM_A_FENCE)
    expect(posts[0]!['check']).toBe(`${A_RELEASE.check}\n\n${FROM_A_FENCE}`)
  })

  it('adds nothing to an answer that is bare JSON', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: JSON.stringify(A_RELEASE) }, {})
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).not.toContain('not bare JSON')
    expect(posts[0]!['check']).toBe(A_RELEASE.check)
  })
})

describe('a fenced object that cannot be read as a verdict', () => {
  it('is asked for once, in the check\'s own session, as one JSON object, and the verdict the model writes again is posted with what happened said', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: fenced('{"verdict": "released", "check": "Synthetic: a trailing comma follows",}') },
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(runs[0]!.argv).not.toContain('--resume')
    expect(runs[1]!.argv.slice(runs[1]!.argv.indexOf('--resume'), runs[1]!.argv.indexOf('--resume') + 2)).toEqual(['--resume', SESSION])
    expect(runs[1]!.prompt).toContain('Why it could not be read: the last fenced JSON object in it is not JSON: ')
    expect(runs[1]!.prompt).toContain('Answer with the same verdict as one JSON object and nothing else: no words before or after it, and no code fence.')
    expect(posts).toHaveLength(1)
    const said = new RegExp(`^${literally(A_RELEASE.check)}\\n\\nThe check's answer is not bare JSON, and the last fenced JSON object in it is not JSON: .+, ${literally(ASKED)}, and did\\.$`)
    expect(posts[0]!['check']).toMatch(said)
    expect(ran.out).toContain(`${ASKED}, and did.`)
  })

  it('is asked for when it is JSON but not a verdict, and the model is asked once and no more', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: fenced('{"verdict": "refuse", "check": "Synthetic: a word the verdict does not have"}') },
      { session_id: SESSION, result: fenced('{"verdict": "refuse", "check": "Synthetic: the same again"}') },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(42)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(runs[1]!.prompt).toContain('the last fenced JSON object in it is JSON but not a verdict: a verdict has `verdict` "released" or "refused" and a `check` sentence that is not empty')
    expect(posts).toHaveLength(0)
    expect(ran.err).toContain(`${ASKED}, and its second answer gave none either (the last fenced JSON object in it is JSON but not a verdict`)
    expect(withoutTheTimes(ran.err)).toContain('What it said when asked:\nVerification complete.')
  })

  // MUTATION: drop the guard on `session === null` in theVerdictTheCheckGave, so the question goes to a new session;
  // this goes red on the second run of the model.
  it('asks nothing when the check\'s answer names no session, and writes no verdict', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { result: fenced('{"verdict": "released", "check": "Synthetic",}') }, { result: JSON.stringify(A_RELEASE) })
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(0)
    expect(ran.err).toContain('The answer names no session of its own, and a verdict from any other session would not be its judgement, so no verdict was written.')
  })

})

/**
 * AN ANSWER WITH NO FENCE AND NO VERDICT IS ASKED ONCE TOO, for the verdict it reached (wave 13j, the round after
 * X4FMBW2bGWp-, point 4a of the check line's brief). Until then such an answer ended the tool, and the whole check had to
 * run again. It is asked in the same session, to make no new judgement, and to say so when it reached none.
 *
 * MUTATION, RUN ON 16 OCTOBER 2026, after a green control: the early exit for an answer with no fence put back in
 * theVerdictTheCheckGave. The first case here went red on the exit code and the second on the second run of the model.
 * Restored with cp and checked with cmp, and the control run again was green.
 */
describe('an answer with no fence and no verdict', () => {
  const NO_FENCE_ASKED = "The check did not end with a verdict: it holds no JSON object that is a verdict, so the model was asked once, in the check's own session, to write the verdict it reached as one JSON object"

  it('is asked once, in the check\'s own session, for the verdict it reached, and the verdict it writes is posted with what happened said', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: 'Verification complete. Synthetic: the tests pass and I release the run.' },
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(runs[1]!.argv.slice(runs[1]!.argv.indexOf('--resume'), runs[1]!.argv.indexOf('--resume') + 2)).toEqual(['--resume', SESSION])
    expect(runs[1]!.prompt).toContain('Its answer ended with no verdict this tool could read, and this asks you once, in this same session, to write the verdict you reached.')
    expect(runs[1]!.prompt).toContain('Write the judgement you already made; do not make a new one now. If you reached no verdict, say so in one sentence and write no JSON object.')
    expect(posts).toHaveLength(1)
    expect(posts[0]!['check']).toBe(`${A_RELEASE.check}\n\n${NO_FENCE_ASKED}, and did.`)
  })

  it('writes nothing when its second answer gives no verdict either, and the model is asked once and no more', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f)
    const model = standInModel(f.home, { session_id: SESSION, result: 'Verification complete. I could not decide.' }, { session_id: SESSION, result: 'Synthetic: I reached no verdict.' })
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(42)
    expect(theRuns(model.runs)).toHaveLength(2)
    expect(posts).toHaveLength(0)
    expect(ran.err).toContain(`${NO_FENCE_ASKED}, and its second answer gave none either (it holds no JSON object that is a verdict), so no verdict was written.`)
    expect(withoutTheTimes(ran.err)).toContain('What it said when asked:\nSynthetic: I reached no verdict.')
    expect(ran.err).toContain('The message worker can report this ending to the office, which allows at most one new whole check.')
    expect(ran.err).not.toContain('Its starter can ask again.')
  })
})


it.each([false, true])('gives no no-verdict ending when model call %s fails to finish', async secondCall => {
  fixture = await inspectorFixture()
  const f = fixture
  const posts = aFakeDoor(f)
  const failure = { session_id: SESSION, is_error: true, subtype: 'error_max_turns', result: 'Synthetic: did not finish.' }
  const completed = { session_id: SESSION, result: 'Synthetic: I reached no verdict.' }
  const model = standInModel(f.home, secondCall ? completed : failure, failure)
  const ran = await inspect(f, model.bin)
  expect(ran.code).toBe(1)
  expect(theRuns(model.runs)).toHaveLength(secondCall ? 2 : 1)
  expect(posts).toHaveLength(0)
})

function literally(text: string) { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
