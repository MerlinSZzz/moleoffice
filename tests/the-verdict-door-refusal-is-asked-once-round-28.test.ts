// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VERDICT THE DOOR REFUSES ONLY FOR ITS SHAPE IS ASKED BACK ONCE, IN THE CHECK'S OWN SESSION.
 *
 * Wave 13v round 28. On 12 October 2026 the check 1vAOXp7aiFzW of wave 13j's round loop-2 refused, and its `says` named
 * no chapter, precedent or invariant. At 17:19 the verdict door answered 400 with its refusal rule, "A refusal names what
 * is missing and what says so. ...", nothing was recorded, and the secretary read the verdict by hand. The tool's correction of
 * form asks a new session before the post, and that session does not know the check.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. Its verdict door here is a fake one: it answers each post from a list this file gives it. Its
 * first refusal is the real door's sentence, A_REFUSAL_NAMES and "Nothing was written." as src/server/api/inspection.ts
 * writes it. The model is a stand-in claude on PATH, labelled in its own first lines, which runs no model: it keeps each
 * prompt and the arguments it was started with, and gives the answers this file lists, in order. Every verdict, session
 * and sentence here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - theShapeIsAskedForOnce returns null at its top: the first case exits 1, and the second has no third run.
 *   - The question goes to a new session (no --resume): the first case goes red on the arguments.
 *   - Any 400 is taken for the shape's refusal: "asks nothing when the door's words are not its shape's" has a third run.
 *   - The question goes to a new session when the check's answer names none: "asks nothing when ... names no session"
 *     goes red, exit 0.
 *   - The worker is told only the last refusal: the second case goes red on the message.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { whatSaysTakes } from '../src/config/verdict-keys.mjs'
import { A_REFUSAL_NAMES } from '../src/shared/releasing.ts'
import { theShapeTheDoorTakesFor, whatTheVerdictDoorWouldSay } from '../src/shared/the-verdict-door.ts'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
/** The real door's words for a refusal that names no rule (src/server/api/inspection.ts). */
const THE_DOORS_FIRST_WORDS = `${A_REFUSAL_NAMES} Nothing was written.`
/**
 * A refusal whose `says` names a key the door does not take, so the tool leaves that key out and `says` names no rule.
 * Its one `missing` item names a kind a check refuses for, because since 9 November 2026 an item that names no kind is
 * listed instead of refused (src/config/verdict-kinds.mjs), and this test is about the shape's question, not the list.
 */
const A_REFUSAL = {
  verdict: 'refused',
  check: 'Synthetic: read the brief and the changes. No model ran.',
  missing: [{ what: 'Synthetic: a thing the work lacks.', kind: 'data' }],
  says: { rule: 'Synthetic: a rule named in words the door does not take' },
  chaptersRead: [],
}
/** The same refusal as the door takes it: the tool writes the item's words, and its kind only says what refuses. */
const A_REFUSAL_MISSING = ['Synthetic: a thing the work lacks.']
/** The tool's correction of form before the post, in a new session that does not know the check, gives no object. */
const A_NEW_SESSION_GIVES_NOTHING = { session_id: 'another-session-a-test-made-up', result: 'Synthetic: I did not write this verdict.' }
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
function aFakeDoor(f: Fixture, answers: ((body: Record<string, any>) => { status: number; error?: string })[]): Record<string, any>[] {
  const posts: Record<string, any>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      const body = JSON.parse(raw) as Record<string, any>
      posts.push(body)
      const answer = answers[Math.min(posts.length - 1, answers.length - 1)]!(body)
      reply.statusCode = answer.status
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify(answer.error === undefined ? { verdict: 'refused', toTheWorker: 'Synthetic.', toTheStarter: '', group: null } : { error: answer.error }))
    })
    return true
  }
  // THE RUN NAMES THE AGENT IT SERVES, so a refused verdict has somebody to go to, as on the real door's read.
  f.state.reading = { agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: null } } as never
  return posts
}

const refusedAsTheRule = () => ({ status: 400, error: THE_DOORS_FIRST_WORDS })
const taken = () => ({ status: 201 })

/** What the tool told the worker when the door refused a verdict, or undefined if it told nobody. */
function theRefusalSentOn(f: Fixture): string | undefined {
  const sent = f.state.writes.find((one) => one.path === '/api/records' && one.body['title'] === "The check's verdict was not recorded: the-worker")
  return sent === undefined ? undefined : String(sent.body['data']?.['body'] ?? '')
}

async function inspect(f: Fixture, bin: string) {
  return f.inspect(['--check', aMadeUpCheckSession()], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
}

describe('a verdict the door refuses only for its shape', () => {
  // MUTATION: theShapeIsAskedForOnce returns null at its top in tools/the-inspector.mjs; this goes red, exit 1.
  // MUTATION: the question is asked with no `resume`; this goes red on the arguments of the third run.
  it("asks once, in the check's own session, with the door's words and the shape of `says`, takes back only `says`, says so, and posts again", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [refusedAsTheRule, taken])
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_REFUSAL) },
      A_NEW_SESSION_GIVES_NOTHING,
      { session_id: SESSION, result: `Synthetic: the rule is chapter 5.\n${JSON.stringify({ says: { chapter: 5 }, verdict: 'released' })}` },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code, ran.err).toBe(0)

    // ONCE, IN THE CHECK'S OWN SESSION, after the correction of form in a new one.
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(3)
    expect(resumed(runs[0]!.argv)).toEqual([])
    expect(resumed(runs[1]!.argv)).toEqual([])
    expect(resumed(runs[2]!.argv)).toEqual(['--resume', SESSION])
    expect(runs[2]!.prompt).toContain(`The door's words: ${THE_DOORS_FIRST_WORDS}`)
    expect(runs[2]!.prompt).toContain(`The shape the door takes for \`says\`, as JSON Schema:\n${theShapeTheDoorTakesFor(['says'])}`)
    expect(runs[2]!.prompt).toContain(`\`says\` names ${whatSaysTakes()}.`)

    // ONLY `says` IS TAKEN BACK: the verdict the answer also wrote is left out, and everything else is as the check wrote it.
    expect(posts).toHaveLength(2)
    expect(posts[0]!['says']).toEqual({})
    expect(posts[1]!['says']).toEqual({ chapter: 5 })
    expect(posts[1]!['verdict']).toBe('refused')
    expect(posts[1]!['missing']).toEqual(A_REFUSAL_MISSING)
    expect(ran.out).toContain('The answer also wrote verdict, which it was not asked for; that was left out.')

    // SAID AT THE START AND AT THE END, in the output and in the check sentence that is posted.
    const said = `The verdict door refused the verdict only for the shape of \`says\` (${THE_DOORS_FIRST_WORDS}), ${ASKED}, and did.`
    expect(ran.out).toContain(`The verdict door refused the verdict only for the shape of \`says\`. Asking the check's own session ${SESSION} once to correct it.`)
    expect(ran.out).toContain(said)
    expect(String(posts[1]!['check']).endsWith(`\n\n${said}`)).toBe(true)
    expect(theRefusalSentOn(f)).toBeUndefined()
  })

  // MUTATION: theRefusedVerdictIsDelivered is not given the first refusal; this goes red on the worker's message.
  it('asks once and no more when the second answer is refused too, and says both refusals', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const second = (body: Record<string, any>) => ({ status: 400, error: whatTheVerdictDoorWouldSay(body)?.said ?? 'Synthetic: the fake door found nothing wrong.' })
    const posts = aFakeDoor(f, [refusedAsTheRule, second])
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_REFUSAL) },
      A_NEW_SESSION_GIVES_NOTHING,
      { session_id: SESSION, result: JSON.stringify({ says: { rule: 'Synthetic: still no chapter, precedent or invariant' } }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(3)
    expect(posts).toHaveLength(2)
    const secondWords = second(posts[1]!).error
    expect(secondWords).toMatch(/^The check says: /)
    expect(ran.out).toContain(`, ${ASKED}, and the door's shape still refuses the answer: ${secondWords}`)
    expect(withoutTheTimes(ran.out)).toContain(`The verdict door refused the verdict again, with HTTP 400: ${secondWords}\nIts first refusal, before the model was asked: ${THE_DOORS_FIRST_WORDS}\n`)
    const told = theRefusalSentOn(f)
    expect(told).toContain(`The door refused it twice. What it said the first time, word for word (HTTP 400): ${THE_DOORS_FIRST_WORDS}`)
    expect(told).toContain(`What the door said the second time, word for word: ${secondWords}`)
  })

  // MUTATION: drop `would.said !== doorSaid` from theShapeIsAskedForOnce; this goes red on a third run of the model.
  it("asks nothing when the door's words are not its shape's, and the refusal goes on as before", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const OTHER = "Synthetic: the door refused for a reason that is not the verdict's shape. Nothing was written."
    const posts = aFakeDoor(f, [() => ({ status: 400, error: OTHER })])
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_REFUSAL) },
      A_NEW_SESSION_GIVES_NOTHING,
      { session_id: SESSION, result: JSON.stringify({ says: { chapter: 5 } }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(2)
    expect(posts).toHaveLength(1)
    expect(ran.out).not.toContain("Asking the check's own session")
    const told = theRefusalSentOn(f)
    expect(told).toContain(`What the door said, word for word: ${OTHER}`)
    expect(told).not.toContain('refused it twice')
  })

  // MUTATION: drop the guard on `session === null` in theCheckIsAskedOnceToCorrect, which theShapeIsAskedForOnce asks
  // through, so the question goes to a new session; this goes red: the new session's `says` is posted and the tool exits 0.
  it("asks nothing when the check's answer names no session, and the refusal goes on as it stands", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, [refusedAsTheRule, taken])
    const model = standInModel(f.home, [
      { result: JSON.stringify(A_REFUSAL) },
      A_NEW_SESSION_GIVES_NOTHING,
      { result: JSON.stringify({ says: { chapter: 5 } }) },
    ])
    const ran = await inspect(f, model.bin)
    expect(ran.code).toBe(1)
    expect(theRuns(model.runs)).toHaveLength(2)
    expect(posts).toHaveLength(1)
    expect(ran.out).toContain(
      "The verdict door refused the verdict only for the shape of `says`, but the check's answer names no session of its own, " +
        'and a correction from any other session would not be its judgement, so the refusal goes on as it stands.',
    )
    expect(theRefusalSentOn(f)).toContain(`What the door said, word for word: ${THE_DOORS_FIRST_WORDS}`)
  })
})
