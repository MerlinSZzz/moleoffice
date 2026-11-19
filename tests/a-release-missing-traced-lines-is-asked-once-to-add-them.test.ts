// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE THE DOOR REFUSES ONLY FOR PATHS WITH NO TRACED LINE IS ASKED BACK ONCE, IN THE CHECK'S OWN SESSION.
 *
 * Wave 13y round 23. Between 00:30 and 02:30 on 12 October 2026 three checks on Sonnet chose release and gave no
 * `traced` line for most of the paths they judged: dskE2FcwWb41 (wave 13v round 26), kJ4RcZovw7pm (wave 13r round 28d)
 * and 7cWnj67ylD8U (wave 13j loop-1). The verdict door answered 400, "A release gives a line in `traced` for every path
 * this check judged, and this one gives none for ...", the run stayed inspecting, and a whole check was lost each time.
 * The tool's correction of a verdict's form could not see it: the body fitted the door's shape, and only the door knows
 * which paths a check judged.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. Its verdict door here is a fake one: it answers each post from a list this file gives it,
 * and its refusal is the real door's sentence, written by the one function the real door writes it with
 * (src/shared/releasing.ts). The model is a stand-in claude on PATH, labelled in its own first lines, which runs no
 * model: it keeps each prompt and the arguments it was started with, and answers from a file this test writes. Every
 * trace line and record id here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - The reader in tools/the-inspector.mjs never finds the paths (theMissingTracesAreAskedForOnce returns null at its
 *     top), and "asks once, in the same session ..." goes red: the tool exits 1 after one post.
 *   - The tool asks again after a second refusal, and "asks once and no more ..." goes red on the third run of the model.
 *   - The tool takes any refusal for one of missing trace lines, and "asks nothing ... for another reason" goes red on
 *     the second run of the model.
 *   - The tool asks a new session when the check's answer names none, and "asks nothing when the check's answer names no
 *     session" goes red: the new session's lines are posted and the tool exits 0.
 *   - The question goes to a new session even when the check's is named (no --resume), and the first case goes red on
 *     the arguments the model was started with.
 *   - The reader takes a sentence with more after it, and the reader's case goes red.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aReleaseWithoutATraceSays, thePathsAReleaseLeftUntraced, TRACED_HOW } from '../src/shared/releasing.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
const ONE = 'tools/one-the-check-did-not-trace.mjs'
const TWO = 'tests/two-the-check-did-not-trace.test.ts'
const line = (paths: string[], said: string) => ({ paths, to: 'aRecordMadeUp', how: TRACED_HOW[0], said })
/** The one line the check wrote: for the work, and for neither path the door names. */
const AS_THE_CHECK_TRACED = [line(['work'], 'Synthetic: the brief asked for this change.')]
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: AS_THE_CHECK_TRACED }

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

/** A FAKE VERDICT DOOR on the fixture office: each post is kept and answered from `answers`, the last one again once they run out. */
function aFakeDoor(f: Fixture, answers: { status: number; error?: string }[]): Record<string, any>[] {
  const posts: Record<string, any>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      posts.push(JSON.parse(raw) as Record<string, any>)
      const answer = answers[Math.min(posts.length - 1, answers.length - 1)]!
      reply.statusCode = answer.status
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify(answer.error === undefined ? { verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null } : { error: answer.error }))
    })
    return true
  }
  // THE RUN NAMES THE AGENT IT SERVES, so a refused verdict has somebody to go to, as on the real door's read.
  f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null } } as never
  return posts
}

/** What the tool told the worker when the door refused a verdict, or undefined if it told nobody. */
function theRefusalSentOn(f: Fixture): string | undefined {
  const sent = f.state.writes.find((one) => one.path === '/api/records' && one.body['title'] === "The check's verdict was not recorded: the-worker")
  return sent === undefined ? undefined : String(sent.body['data']?.['body'] ?? '')
}

async function inspect(f: Fixture, bin: string) {
  return f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
}

describe('a release the door refuses only for missing traced lines', () => {
  // MUTATION: theMissingTracesAreAskedForOnce returns null at its top in tools/the-inspector.mjs; this goes red, exit 1.
  // MUTATION: leave `--resume` out of the host's arguments in runClaudeOnTheHost; this goes red on the arguments.
  it("asks once, in the same session, for a line for each path the door names, adds only those lines, says so, and posts again", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [{ status: 400, error: aReleaseWithoutATraceSays([ONE, TWO]) }, { status: 201 }])
    const forOne = line([ONE], 'Synthetic: the model traced this path itself.')
    const forTwo = line([TWO, 'work'], 'Synthetic: and this one, beside the work.')
    const stray = line(['README.md'], 'Synthetic: a line for a path the door did not name.')
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: `Here are the lines.\n${JSON.stringify({ traced: [forOne, forTwo, stray] })}` },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)

    // ONCE, AND IN THE CHECK'S OWN SESSION, shown the door's words and each path it named.
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(runs[0]!.argv).not.toContain('--resume')
    expect(runs[1]!.argv.slice(runs[1]!.argv.indexOf('--resume'), runs[1]!.argv.indexOf('--resume') + 2)).toEqual(['--resume', SESSION])
    expect(runs[1]!.prompt).toContain(`The door's words: ${aReleaseWithoutATraceSays([ONE, TWO])}`)
    expect(runs[1]!.prompt).toContain(`one to a line:\n${ONE}\n${TWO}\n`)

    // POSTED TWICE. The second carries the check's own line and the model's two lines for the named paths, in that
    // order and as written: no line of the tool's, and not the stray line.
    expect(posts).toHaveLength(2)
    expect(posts[0]!['traced']).toEqual(AS_THE_CHECK_TRACED)
    expect(posts[1]!['traced']).toEqual([...AS_THE_CHECK_TRACED, forOne, forTwo])
    expect(ran.out).toContain('The answer also wrote 1 line that names none of those paths, which it was not asked for; that was left out.')

    // SAID IN THE TOOL'S OUTPUT AND IN THE VERDICT.
    const said = `The verdict door refused the release because \`traced\` gave no line for ${ONE}, ${TWO}, so the model was asked once, in the check's own session, to add them, and did.`
    expect(ran.out).toContain(said)
    expect(posts[1]!['check']).toBe(`${A_RELEASE.check}\n\n${said}`)
    expect(theRefusalSentOn(f)).toBeUndefined()
  })

  // MUTATION: ask in a loop of two in tools/the-inspector.mjs (`for (let n = 0; n < 2 && !posted.ok; n += 1)`); this goes
  // red on the third run of the model.
  it('asks once and no more: a second refusal goes on to the worker as every refused verdict does', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [{ status: 400, error: aReleaseWithoutATraceSays([ONE, TWO]) }, { status: 400, error: aReleaseWithoutATraceSays([TWO]) }])
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: JSON.stringify({ traced: [line([ONE], 'Synthetic: only the first path.')] }) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(2)
    expect(posts).toHaveLength(2)
    const said = `so the model was asked once, in the check's own session, to add them, and its answer still gives none for ${TWO}.`
    expect(ran.out).toContain(said)
    expect(posts[1]!['check']).toContain(said)
    expect(ran.out).toContain('The verdict door refused the verdict again, so it goes on as a refused verdict does; the model is not asked a second time.')

    // AS TODAY: the worker gets the door's second refusal word for word, and the verdict as the check wrote it.
    const toTheWorker = theRefusalSentOn(f)
    expect(toTheWorker, 'the refused verdict was not sent on').toBeDefined()
    expect(toTheWorker).toContain(`What the door said, word for word: ${aReleaseWithoutATraceSays([TWO])}`)
    expect(toTheWorker).toContain(JSON.stringify(A_RELEASE, null, 2))
  })

  // MUTATION: read any refusal as one naming the work in tools/the-inspector.mjs
  // (`thePathsAReleaseLeftUntraced(doorSaid) ?? ['work']`); this goes red on the second run of the model.
  it('asks nothing when the door refuses for another reason, and the refusal goes on as before', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    // A REFUSAL NO QUESTION COVERS. Until wave 13v round 33 this was the door's refusal of a trace naming records the office
    // does not hold, and since that round the tool asks the check's session about that one too
    // (tests/a-trace-naming-no-record-is-asked-once-round-33.test.ts).
    const another = 'Synthetic: the door refused for a reason no question of the tool covers. Nothing was written; the check can be asked again.'
    const posts = aFakeDoor(f, [{ status: 400, error: another }])
    const model = standInModel(
      f.home,
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: JSON.stringify({ traced: [line([ONE], 'Synthetic: never asked for.')] }) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(ran.out).not.toContain('Asking the check')
    expect(theRefusalSentOn(f)).toContain(`What the door said, word for word: ${another}`)
  })

  // MUTATION: replace `if (session === null) {` with `if (false) {` in tools/the-inspector.mjs, so a new session is asked;
  // this goes red: its lines are posted and the tool exits 0.
  it("asks nothing when the check's answer names no session, because a trace from another session is not the check's", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [{ status: 400, error: aReleaseWithoutATraceSays([ONE]) }, { status: 201 }])
    const model = standInModel(
      f.home,
      { result: JSON.stringify(A_RELEASE) },
      { result: JSON.stringify({ traced: [line([ONE], 'Synthetic: from a session that never judged it.')] }) },
    )
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(ran.out).toContain("names no session of its own, and a trace from any other session would not be its judgement")
    expect(theRefusalSentOn(f)).toContain(aReleaseWithoutATraceSays([ONE]))
  })
})

describe("the door's sentence and the tool's reading of it are one", () => {
  // MUTATION: drop the `!said.endsWith(after)` test in thePathsAReleaseLeftUntraced; this goes red.
  it('reads back the paths of the sentence the door writes, and nothing from any other sentence', () => {
    expect(thePathsAReleaseLeftUntraced(aReleaseWithoutATraceSays([ONE]))).toEqual([ONE])
    expect(thePathsAReleaseLeftUntraced(aReleaseWithoutATraceSays([ONE, TWO, 'work']))).toEqual([ONE, TWO, 'work'])
    expect(thePathsAReleaseLeftUntraced(`${aReleaseWithoutATraceSays([ONE])} And another fault.`)).toBeNull()
    expect(thePathsAReleaseLeftUntraced(`The check says: ${aReleaseWithoutATraceSays([ONE])}`)).toBeNull()
    expect(thePathsAReleaseLeftUntraced(aReleaseWithoutATraceSays([]))).toBeNull()
    expect(thePathsAReleaseLeftUntraced('The check traced.0.paths: Invalid input: expected array, received undefined')).toBeNull()
  })
})
