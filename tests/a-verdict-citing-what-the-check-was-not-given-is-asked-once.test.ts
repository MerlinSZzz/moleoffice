// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VERDICT THAT CITES A BASIS THE CHECK WAS NOT GIVEN IS NEVER LOST: THE CHECK TOOL HOLDS IT TO THE RUN'S SAVED ROUND
 * CHAPTERS BEFORE IT POSTS, AND ASKS THE CHECK'S OWN SESSION ONCE TO CORRECT IT.
 *
 * Round BL, item 2ao. A run that saved its round chapters (data.extra.roundChapters) bounds what a verdict may cite: the
 * verdict door holds it to checkSavedChapterClaims (src/shared/round-chapters/manifest.ts), which refuses any precedent, a
 * chapter that was not delivered and a reading above the delivered level. The tool posted such a verdict, the door refused
 * it with 400, no question the tool asks once matched the door's words, and the verdict went to the worker while the run
 * stayed inspecting: a whole check was lost.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. Its reading of the run names saved chapters this file makes up. Its verdict door is a fake one
 * that holds each post to the real rule, checkSavedChapterClaims, and answers 400 with the rule's own words where the rule
 * refuses, as the real door does. The model is a stand-in claude on PATH, labelled in its own first lines, which runs no
 * model: it keeps each prompt and the arguments it was started with, and gives the answers this file lists, in order.
 * Every verdict, session, chapter name and record id here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - The tool posts without holding the verdict to the saved chapters: the second and third cases go red.
 *   - The tool exits 1 after the second bad answer: the third case goes red on the exit code.
 *   - The shape's question offers `says` from whatSaysTakes() again: the first case goes red on `precedent`.
 *   - The tool says nothing when the office's reading names no saved chapters: the last-but-one case goes red.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SAYS_KEYS, WHAT_SAYS_NAMES } from '../src/config/verdict-keys.mjs'
import * as ending from '../src/config/inspection-ending.mjs'
import { A_REFUSAL_NAMES } from '../src/shared/releasing.ts'
import { checkSavedChapterClaims, type RoundChapters } from '../src/shared/round-chapters/manifest.ts'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'
/** WHAT THE OFFICE'S READING OF THE RUN SAYS IT SAVED: chapter 2 at outline, and the office's name for each chapter. */
const SAVED = { chapters: [{ chapter: 2, level: 'outline' }], chapterNames: [{ n: 2, label: 'Made-up chapter two' }, { n: 5, label: 'Made-up chapter five' }] }
/** The rule reads only the chapters of a saved selection, so a selection of those alone is enough to ask it. */
const SAVED_SELECTION = { chapters: SAVED.chapters } as unknown as RoundChapters
/**
 * A refusal that cites a precedent, which no saved selection delivers. Every other field fits the door. Its one
 * `missing` item names a kind a check refuses for, because since 9 November 2026 an item that names no kind is
 * listed instead of refused (src/config/verdict-kinds.mjs), and this test is about the saved-chapters question.
 */
const A_PRECEDENT_REFUSAL = {
  verdict: 'refused',
  check: 'Synthetic: read the brief and the changes. No model ran.',
  missing: [{ what: 'Synthetic: a thing the work lacks.', kind: 'data' }],
  says: { precedent: 'aPrecedentMadeUp' },
  chaptersRead: [{ chapter: 2, level: 'outline' }],
}
/** The same refusal as the door takes it: the tool writes the item's words, and its kind only says what refuses. */
const A_PRECEDENT_MISSING = ['Synthetic: a thing the work lacks.']
/** The sentence that says where a decision or a precedent goes when none was given to the check. */
const THE_DECISION_SENTENCE = 'No decision or precedent was given to this check. To name one, write its record id in the text of `check`.'
/** What the tool says when the office's reading of the run does not say whether the run saved round chapters. */
const IT_COULD_NOT_CHECK =
  "This tool could not hold the verdict to the run's saved round chapters before posting it: the office's reading of the run " +
  'does not say whether the run saved any. The verdict is posted as it stands, and the verdict door checks it.'
const ASKED = "so the model was asked once, in the check's own session, to correct them"

/** The rule's own words for a verdict that cites `says` and claims `chaptersRead`; a citation the rule takes is a test's mistake. */
function theRulesWords(says: Record<string, unknown> | null, chaptersRead: { chapter: number; level: string }[] = []): string {
  try {
    checkSavedChapterClaims(SAVED_SELECTION, { chaptersRead: chaptersRead as never, says: says as never })
  } catch (why) {
    return (why as Error).message
  }
  throw new Error(`The rule takes ${JSON.stringify(says)}; this test meant a citation it refuses.`)
}
const FIRST = theRulesWords({ precedent: 'aPrecedentMadeUp' })

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

/** THE RULE'S ANSWER TO A POST, as the real door gives it: 400 with the rule's words where it refuses, 201 where it takes. */
function theRuleAtTheDoor(body: Record<string, any>): { status: number; error?: string } {
  try {
    checkSavedChapterClaims(SAVED_SELECTION, { chaptersRead: Array.isArray(body['chaptersRead']) ? body['chaptersRead'] : [], says: body['says'] ?? null })
  } catch (why) {
    return { status: 400, error: (why as Error).message }
  }
  return { status: 201 }
}
const taken = () => ({ status: 201 })

/**
 * A FAKE VERDICT DOOR on the fixture office: each post is kept and answered by `answer`. The reading of the run names the
 * agent it serves, so a refused verdict has somebody to go to, a starter who is not that agent, and `savedChapters` as the
 * case gives it; `undefined` leaves it out, as an office older than this round answers.
 */
function aFakeDoor(f: Fixture, answer: (body: Record<string, any>) => { status: number; error?: string }, savedChapters: unknown): Record<string, any>[] {
  const posts: Record<string, any>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      const body = JSON.parse(raw) as Record<string, any>
      posts.push(body)
      const said = answer(body)
      reply.statusCode = said.status
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify(said.error === undefined ? { verdict: body['verdict'], toTheWorker: 'Synthetic.', toTheStarter: '', group: null } : { error: said.error }))
    })
    return true
  }
  f.state.reading = {
    agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: { kind: 'agent', id: 'theStartersId' } },
    ...(savedChapters === undefined ? {} : { savedChapters }),
  } as never
  return posts
}

/** The check's own session record, as the office answers it: a session the worker filed for this tool. */
function theCheckSession(f: Fixture, check: string): void {
  f.state.records[check] = {
    status: 200,
    body: { record: { id: check, kind: 'session', title: 'Synthetic check session', data: { runtime: 'inspection-tool', extra: { purpose: 'inspection' } } }, version: 'synthetic-version-1' },
  }
}

/** What the tool sent with `title`, or undefined if it sent nothing so titled. */
function theMessage(f: Fixture, title: string): string | undefined {
  const sent = f.state.writes.find((one) => one.path === '/api/records' && one.body['title'] === title)
  return sent === undefined ? undefined : String(sent.body['data']?.['body'] ?? '')
}
const toTheWorker = (f: Fixture) => theMessage(f, "The check's verdict was not recorded: the-worker")
const toTheStarter = (f: Fixture) => theMessage(f, "A check's verdict was not recorded: the-worker")

/** Every write the tool sent to its own check session's record. */
const theWritesOnTheSession = (f: Fixture, check: string) => f.state.writes.filter((one) => one.path === `/api/records/${encodeURIComponent(check)}`)

async function inspect(f: Fixture, bin: string, check: string) {
  return f.inspect(['--check', check], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
}

describe("a verdict held to the run's saved round chapters before it is posted", () => {
  // MUTATION: theShapeIsAskedForOnce's line about `says` is built from whatSaysTakes() under saved chapters too; this goes
  // red on `precedent`.
  it("the shape's question, under saved chapters, offers `says` a key exactly when the rule takes a citation of it alone", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    // A `says` with a key the door does not take: the tool leaves the key out, and the door refuses `says` for naming nothing.
    const posts = aFakeDoor(f, (body) => (posts.length === 1 ? { status: 400, error: `${A_REFUSAL_NAMES} Nothing was written.` } : theRuleAtTheDoor(body)), SAVED)
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify({ ...A_PRECEDENT_REFUSAL, says: { rule: 'Synthetic: a rule named in words the door does not take' } }) },
      { session_id: 'another-session-a-test-made-up', result: 'Synthetic: I did not write this verdict.' },
      { session_id: SESSION, result: JSON.stringify({ says: { chapter: 2 } }) },
    ])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.err).toBe(0)
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(3)
    expect(resumed(runs[2]!.argv)).toEqual(['--resume', SESSION])
    const cited: Record<string, unknown> = { chapter: SAVED.chapters[0]!.chapter, invariant: 1, precedent: 'aPrecedentMadeUp' }
    expect(SAYS_KEYS.filter((key) => key in cited)).toEqual(SAYS_KEYS)
    // WHAT THE QUESTION OFFERS IS ITS OWN LINE ABOUT `says`. It also quotes the door's words word for word, and those are
    // A_REFUSAL_NAMES, which name every key the door's shape takes.
    const offer = runs[2]!.prompt.split('\n\n').find((part) => part.startsWith('`says` names '))
    expect(offer, "the question's own line about `says`").toBeDefined()
    for (const key of SAYS_KEYS) {
      let passes = true
      try { checkSavedChapterClaims(SAVED_SELECTION, { chaptersRead: [], says: { [key]: cited[key] } as never }) } catch { passes = false }
      const offered = offer!.includes(`\`${key}\` (${(WHAT_SAYS_NAMES as Record<string, string>)[key]}`)
      expect(offered, `whether the question offers \`${key}\``).toBe(passes)
    }
    expect(runs[2]!.prompt).toContain(THE_DECISION_SENTENCE)
    expect(posts.at(-1)!['says']).toEqual({ chapter: 2 })
  })

  // MUTATION: the tool posts without holding the verdict to the saved chapters; this goes red, exit 1 after a refused post.
  it("asks the check's own session once, with the rule's words, and posts the corrected verdict once", async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const check = aMadeUpCheckSession()
    theCheckSession(f, check)
    const posts = aFakeDoor(f, theRuleAtTheDoor, SAVED)
    const WITH_THE_ID = 'Synthetic: read the brief and the changes, against the made-up precedent aPrecedentMadeUp. No model ran.'
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_PRECEDENT_REFUSAL) },
      { session_id: SESSION, result: `Synthetic: invariant 1 says so.\n${JSON.stringify({ says: { invariant: 1 }, check: WITH_THE_ID, verdict: 'released' })}` },
    ])
    const ran = await inspect(f, model.bin, check)
    expect(ran.code, ran.err).toBe(0)

    // ONCE, IN THE CHECK'S OWN SESSION, with the rule's own words and the line about `says` the rule takes.
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])
    expect(runs[1]!.prompt).toContain(`The rule's words: ${FIRST}`)
    expect(runs[1]!.prompt).toContain(THE_DECISION_SENTENCE)

    // POSTED ONCE, CORRECTED: only `says` and `check` are taken back, and the check sentence says what happened.
    expect(posts).toHaveLength(1)
    expect(posts[0]!['says']).toEqual({ invariant: 1 })
    expect(posts[0]!['verdict']).toBe('refused')
    expect(posts[0]!['missing']).toEqual(A_PRECEDENT_MISSING)
    const said = `This tool refused the verdict before posting it (${FIRST}), ${ASKED}, and did.`
    expect(String(posts[0]!['check'])).toBe(`${WITH_THE_ID}\n\n${said}`)
    expect(ran.out).toContain('The check answered: refused.')
    expect(toTheWorker(f)).toBeUndefined()
    expect(theWritesOnTheSession(f, check)).toEqual([])
  })

  // MUTATION: the tool exits 1, not CHECK_ENDED_WITH_NO_VERDICT, after the second bad answer; this goes red on the exit code.
  it('posts nothing after a second bad answer, keeps the verdict and both refusals on its own session, tells the worker, and exits 42', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const check = aMadeUpCheckSession()
    theCheckSession(f, check)
    const posts = aFakeDoor(f, theRuleAtTheDoor, SAVED)
    const ANSWER = `Synthetic: chapter 5 says so.\n${JSON.stringify({ says: { chapter: 5 } })}`
    const model = standInModel(f.home, [
      { session_id: SESSION, result: JSON.stringify(A_PRECEDENT_REFUSAL) },
      { session_id: SESSION, result: ANSWER },
    ])
    const ran = await inspect(f, model.bin, check)
    expect(ran.code, ran.out + ran.err).toBe(ending.CHECK_ENDED_WITH_NO_VERDICT)
    expect(posts).toEqual([])
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])

    // THE VERDICT WORD FOR WORD, AND BOTH REFUSALS, in the tool's own error output and in the worker's message.
    const verdict = JSON.stringify({ ...A_PRECEDENT_REFUSAL, missing: A_PRECEDENT_MISSING }, null, 2)
    const SECOND = theRulesWords({ chapter: 5 })
    for (const words of [verdict, FIRST, SECOND]) expect(withoutTheTimes(ran.err)).toContain(words)
    const told = toTheWorker(f)
    expect(told).toContain('this check tool refused its verdict before posting it, so the verdict door never saw it')
    for (const words of [verdict, FIRST, SECOND]) expect(told).toContain(words)
    // THE STARTER IS TOLD THAT A CHECK HAPPENED, AND IS NEVER SENT THE CHECK.
    const starter = toTheStarter(f)
    expect(starter).toBeDefined()
    for (const words of ['aPrecedentMadeUp', FIRST, SECOND]) expect(starter).not.toContain(words)

    // KEPT ON THE CHECK'S OWN SESSION, under the one key the office reads, beside what that session already held.
    const KEY = (ending as unknown as Record<string, unknown>)['THE_UNPOSTED_VERDICT']
    expect(typeof KEY, 'src/config/inspection-ending.mjs declares the key the words are kept under').toBe('string')
    const writes = theWritesOnTheSession(f, check)
    expect(writes).toHaveLength(1)
    expect(writes[0]!.body['ifVersion']).toBe('synthetic-version-1')
    expect(writes[0]!.body['dataPatch']).toEqual({ extra: { purpose: 'inspection', [KEY as string]: { verdict, answer: ANSWER, refusals: [FIRST, SECOND] } } })
  })

  // MUTATION: the tool says nothing when the reading names no saved chapters; this goes red on the line.
  it('says in one line that it could not check the verdict when the reading of the run names no saved chapters, and posts it as before', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, theRuleAtTheDoor, undefined)
    const model = standInModel(f.home, [{ session_id: SESSION, result: JSON.stringify(A_PRECEDENT_REFUSAL) }])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.out).toContain(`${IT_COULD_NOT_CHECK}\n`)
    expect(ran.code).toBe(1)
    expect(posts).toHaveLength(1)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(toTheWorker(f)).toContain(`What the door said, word for word: ${FIRST}`)
  })

  it('checks nothing and says nothing of it when the reading of the run says it saved no round chapters', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    const posts = aFakeDoor(f, taken, null)
    const model = standInModel(f.home, [{ session_id: SESSION, result: JSON.stringify(A_PRECEDENT_REFUSAL) }])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.err).toBe(0)
    expect(posts).toHaveLength(1)
    expect(posts[0]!['says']).toEqual(A_PRECEDENT_REFUSAL.says)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(ran.out).not.toContain("could not hold the verdict to the run's saved round chapters")
  })
})
