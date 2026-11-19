// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE THE DOOR REFUSES ONLY BECAUSE ITS TRACE NAMES RECORDS THE OFFICE DOES NOT HOLD IS ASKED BACK ONCE, IN THE
 * CHECK'S OWN SESSION.
 *
 * Wave 13v round 33. At 05:33 on 13 October 2026 a check of wave 13x's round 17f decided "released", but it had written
 * "chapter 10" where a trace line's `to` takes a record id. The verdict door answered 400, "The trace names records the
 * office does not hold: chapter 10 (src/shared/words/en.ts, src/shared/words/zh.ts)", and the release was lost (check
 * CXCtvckdwXo9). The body fitted the door's shape, so round 28's question about the shape did not see it.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. Its verdict door here is a fake one: it answers each post from a list this file gives it, and
 * its refusal is the real door's sentence, written by the one function the real door writes it with
 * (src/shared/releasing.ts). The model is a stand-in claude on PATH, labelled in its own first lines, which runs no model:
 * it keeps each prompt and the arguments it was started with, and gives the answers this file lists, in order. Every
 * verdict, session, trace line and record id here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - theRecordsATraceNamesAreAskedForOnce returns null at its top: the first case exits 1 after one post.
 *   - The question goes to a new session (no --resume): the first case goes red on the arguments.
 *   - The tool reads a sentence naming a line the verdict did not post as this refusal: "asks nothing when the door names
 *     a line this verdict did not post" goes red on a second run of the model.
 *   - The question goes to a new session when the check's answer names none: "asks nothing when ... names no session"
 *     goes red, exit 0.
 *   - The worker is told only the last refusal: the second case goes red on the message.
 *   - The tool does not see that the answer still names a record the door said it does not hold: the second case goes red.
 *   - The reader does not trim `to` as the door does: the reader's case goes red.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { aTraceNamingRecordsNotHeldSays, theRecordsATraceNamedThatAreNotHeld, TRACED_HOW } from '../src/shared/releasing.ts'
import { theShapeTheDoorTakesFor } from '../src/shared/the-verdict-door.ts'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
const EN = 'src/shared/words/en.ts'
const ZH = 'src/shared/words/zh.ts'
const line = (paths: string[], to: string, said: string) => ({ paths, to, how: TRACED_HOW[0], said })
/** The check's trace: one line names a chapter in words where a record id belongs, one names a made-up record id. */
const AS_THE_CHECK_TRACED = [
  line([EN, ZH], 'chapter 10', 'Synthetic: the words a person reads.'),
  line(['work'], 'aRecordMadeUp', 'Synthetic: the brief asked for this change.'),
]
const A_RELEASE = { verdict: 'released', check: 'Synthetic: read the brief and the changes. No model ran.', chaptersRead: [], traced: AS_THE_CHECK_TRACED }
/** The real door's sentence for that trace: it holds aRecordMadeUp here, and no record whose id is "chapter 10". */
const THE_DOORS_FIRST_WORDS = aTraceNamingRecordsNotHeldSays([{ to: 'chapter 10', paths: [EN, ZH] }])
const CORRECTED = [line([EN, ZH], 'aChapterRecordMadeUp', 'Synthetic: the words a person reads.'), AS_THE_CHECK_TRACED[1]!]
const ONLY = 'only because `traced` names records the office does not hold'
const ASKED = "so the model was asked once, in the check's own session, to correct it"

/**
 * A STAND-IN claude: gives `answers` in order, one to each run, and the last again once they run out. Each run's prompt
 * and arguments are kept, one file each, in the order run.
 */
function standInModel(home: string, answers: Record<string, unknown>[]): { bin: string; runs: string } {
  const bin = join(home, 'bin')
  const runs = join(home, 'runs-of-the-model')
  mkdirSync(bin)
  mkdirSync(runs)
  const file = join(home, 'answers.json')
  writeFileSync(file, JSON.stringify(answers))
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
      `  const answers = JSON.parse(readFileSync(${JSON.stringify(file)}, 'utf8'))`,
      '  process.stdout.write(JSON.stringify(answers[Math.min(n, answers.length - 1)]))',
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

/** The arguments after --resume, or none. */
const resumed = (argv: string[]) => (argv.includes('--resume') ? argv.slice(argv.indexOf('--resume'), argv.indexOf('--resume') + 2) : [])

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

describe('a release the door refuses only because its trace names records the office does not hold', () => {
  // MUTATION: theRecordsATraceNamesAreAskedForOnce returns null at its top in tools/the-inspector.mjs; this goes red, exit 1.
  // MUTATION: theCheckIsAskedOnceToCorrect asks with no `resume`; this goes red on the arguments of the second run.
  it("asks once, in the check's own session, with the door's words and the shape of `traced`, takes back only `traced`, says so, and posts again", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [{ status: 400, error: THE_DOORS_FIRST_WORDS }, { status: 201 }])
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: `Synthetic: chapter 10's record.\n${JSON.stringify({ traced: CORRECTED, verdict: 'refused' })}` },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)

    // ONCE, IN THE CHECK'S OWN SESSION, with the door's words, the shape of `traced` and the ids the office does not hold.
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[0]!.argv)).toEqual([])
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])
    expect(runs[1]!.prompt).toContain(`The door's words: ${THE_DOORS_FIRST_WORDS}`)
    expect(runs[1]!.prompt).toContain(`The shape the door takes for \`traced\`, as JSON Schema:\n${theShapeTheDoorTakesFor(['traced'])}`)
    expect(runs[1]!.prompt).toContain('The office holds no record with the id "chapter 10".')

    // ONLY `traced` IS TAKEN BACK: the verdict the answer also wrote is left out, and everything else is as the check wrote it.
    expect(posts).toHaveLength(2)
    expect(posts[0]!['traced']).toEqual(AS_THE_CHECK_TRACED)
    expect(posts[1]!['traced']).toEqual(CORRECTED)
    expect(posts[1]!['verdict']).toBe('released')
    expect(ran.out).toContain('The answer also wrote verdict, which it was not asked for; that was left out.')

    // SAID AT THE START AND AT THE END, in the same log lines as the shape's question, and in the check sentence posted.
    const said = `The verdict door refused the verdict ${ONLY} (${THE_DOORS_FIRST_WORDS}), ${ASKED}, and did.`
    expect(ran.out).toContain(`The verdict door refused the verdict ${ONLY}. Asking the check's own session ${SESSION} once to correct it.`)
    expect(ran.out).toContain(said)
    expect(String(posts[1]!['check']).startsWith(A_RELEASE.check)).toBe(true)
    expect(String(posts[1]!['check']).endsWith(`\n\n${said}`)).toBe(true)
    expect(theRefusalSentOn(f)).toBeUndefined()
  })

  // MUTATION: drop `if (renamed !== null) refusedFirst = ...` in tools/the-inspector.mjs; this goes red on the worker's message.
  // MUTATION: the `still` of theRecordsATraceNamesAreAskedForOnce answers null; this goes red on "still names".
  it('asks once and no more when the second answer is refused too, says what the answer still names, and says both refusals', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const SECOND = aTraceNamingRecordsNotHeldSays([{ to: 'chapter 10', paths: [ZH] }])
    const posts = aFakeDoor(f, [{ status: 400, error: THE_DOORS_FIRST_WORDS }, { status: 400, error: SECOND }])
    const STILL = [line([EN], 'aChapterRecordMadeUp', 'Synthetic: the English words.'), line([ZH], 'chapter 10', 'Synthetic: the Chinese words.'), AS_THE_CHECK_TRACED[1]!]
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: JSON.stringify({ traced: STILL }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(2)
    expect(posts).toHaveLength(2)
    expect(posts[1]!['traced']).toEqual(STILL)
    expect(ran.out).toContain(`, ${ASKED}, and its answer still names chapter 10, which the door said the office does not hold.`)
    expect(withoutTheTimes(ran.out)).toContain(`The verdict door refused the verdict again, with HTTP 400: ${SECOND}\nIts first refusal, before the model was asked: ${THE_DOORS_FIRST_WORDS}\n`)
    const told = theRefusalSentOn(f)
    expect(told).toContain(`The door refused it twice. What it said the first time, word for word (HTTP 400): ${THE_DOORS_FIRST_WORDS}`)
    expect(told).toContain("The model was then asked once, in the check's own session, to correct the records its trace names, and the verdict was posted again.")
    expect(told).toContain(`What the door said the second time, word for word: ${SECOND}`)
  })

  // MUTATION: theRecordsATraceNamedThatAreNotHeld ends with `return named` instead of `return null`; this goes red on a
  // second run of the model.
  it('asks nothing when the door names a line this verdict did not post, and the refusal goes on as before', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const OTHER = aTraceNamingRecordsNotHeldSays([{ to: 'notInThisVerdict', paths: ['work'] }])
    const posts = aFakeDoor(f, [{ status: 400, error: OTHER }])
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_RELEASE) },
      { session_id: SESSION, result: JSON.stringify({ traced: CORRECTED }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(ran.out).not.toContain("Asking the check's own session")
    const told = theRefusalSentOn(f)
    expect(told).toContain(`What the door said, word for word: ${OTHER}`)
    expect(told).not.toContain('refused it twice')
  })

  // MUTATION: drop the guard on `session === null` in theCheckIsAskedOnceToCorrect, so the question goes to a new session;
  // this goes red: the new session's `traced` is posted and the tool exits 0.
  it("asks nothing when the check's answer names no session, and the refusal goes on as it stands", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [{ status: 400, error: THE_DOORS_FIRST_WORDS }, { status: 201 }])
    const model = standInModel(f.home, [
      { result: JSON.stringify(A_RELEASE) },
      { result: JSON.stringify({ traced: CORRECTED }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(ran.out).toContain(
      `The verdict door refused the verdict ${ONLY}, but the check's answer names no session of its own, ` +
        'and a correction from any other session would not be its judgement, so the refusal goes on as it stands.',
    )
    expect(theRefusalSentOn(f)).toContain(`What the door said, word for word: ${THE_DOORS_FIRST_WORDS}`)
  })
})

describe("the door's sentence and the tool's reading of it are one", () => {
  // MUTATION: in theRecordsATraceNamedThatAreNotHeld, build the line from `to` as posted, not trimmed; this goes red.
  it('reads back the ids of the lines the door names, trimmed as the door reads them, and nothing from any other sentence', () => {
    const one = line([EN, ZH], 'chapter 10', 'Synthetic.')
    const two = line(['work'], 'aRecordMadeUp', 'Synthetic.')
    const three = line(['tests/three.test.ts'], 'chapter 10', 'Synthetic.')
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one]), [one, two])).toEqual(['chapter 10'])
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one, three]), [one, two, three])).toEqual(['chapter 10'])
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one, two]), [one, two])).toEqual(['chapter 10', 'aRecordMadeUp'])
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one]), [{ ...one, to: '  chapter 10 ' }])).toEqual(['chapter 10'])
    expect(theRecordsATraceNamedThatAreNotHeld(`${aTraceNamingRecordsNotHeldSays([one])} And another fault.`, [one])).toBeNull()
    expect(theRecordsATraceNamedThatAreNotHeld(`The check says: ${aTraceNamingRecordsNotHeldSays([one])}`, [one])).toBeNull()
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one]), [two])).toBeNull()
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([one]), undefined)).toBeNull()
    expect(theRecordsATraceNamedThatAreNotHeld(aTraceNamingRecordsNotHeldSays([]), [one])).toBeNull()
  })
})
