// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THE OFFICE STARTS FOR A MESSAGE IS HANDED THE PERSON'S MARK, AS THE WAITER HANDS IT.
 *
 * The person may mark a message to an agent Just ask, Proposal first, Align or Give options, and the agent must follow
 * the mark. The waiter and the dsh hooks hand the mark over as one line of the envelope, last before the words. A run
 * the worker starts for the message is handed the same line in its prompt, on each of the three paths that start a run
 * for a message: from the queue, as the carry-on of a run a restart cut off, and as the resume the person pressed. The
 * line is worked out once, by `deliveryEnvelope` in src/shared/messages.ts, from the mark the message record holds.
 *
 * WHAT IS PROVED HERE, against a real office on a free port, the real waiter and the real worker pass, with the fake
 * runtime keeping every prompt it is given:
 *
 *   (a) A message the person marked Just ask, from the queue: the run's prompt holds the mark line, and it is the line
 *       the waiter hands over for the same message. In both it is the last line before the words.
 *   (b) The same for Proposal first.
 *   (f) The same for Align, the third flag the office ships.
 *   (g) The same for Give options, the fourth flag the office ships. On the code before that flag, its message is
 *       refused when it is sent, so (g) and the cases that share its messages fail there.
 *   (c) A message with no mark gives a prompt with no mark line, and the waiter hands over none either. The prompt for
 *       (a) with its mark line taken out equals the prompt for (c), once each message's own id and each run's own id
 *       are replaced by one word, so the mark changes nothing else in the prompt. The five messages have the same
 *       words, sender and recipients, and all five are sent before any of their runs starts. Both runs must have
 *       been handed the brief: a run whose brief read is late starts without it, and that difference is not the mark.
 *   (d) A run a restart cut off, for a message marked Just ask: the run that carries it on is handed the mark line,
 *       last before the words.
 *   (e) A run the person stopped and then pressed resume on, for a message marked Proposal first: the resumed run is
 *       handed the mark line, last before the words.
 *
 * The mark's words are read from `whatTheMarkAsks`, never copied here. The messages and names are made up for this
 * test.
 *
 * WHY ONE FILE AND NOT A CASE EACH IN THE RESTART AND RESUME TESTS. Every case needs a fake runtime that keeps the
 * prompt it was given, and neither of those files starts one: the restart test runs the fake runtime as it is, and the
 * resume test starts whole office processes. A run the person stops mid-turn after it named its conversation is
 * listed as one the person may resume, so the resume path is reached here in this test's own office, through the same
 * doors and the same `startTheResumesThePersonAsked`.
 *
 * MUTATIONS, each after a green control run, then restored:
 *   - the `deliveryEnvelope` call in src/worker/prompt.ts passes no `intent`: (a), (b), (d) and (e) go red, (c) stays
 *     green;
 *   - `whatARunWasDelivering` in src/server/lib/worker.ts returns no `intent`: (d) and (e) go red;
 *   - the queue path in src/worker/index.ts takes no `intent` from the message record: (a) and (b) go red;
 *   - the brief read in `startOne` in src/worker/index.ts waits 1 ms instead of `BRIEF_DEADLINE_MS`, so every run
 *     starts without the brief: only the comparison of (c) goes red, and it says why. (`BRIEF_DEADLINE_MS` itself at
 *     1 also cuts off the read of the chapters, and then no run starts at all.)
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_BRIEF_HEADING } from '../src/shared/briefing.ts'
import { whatTheMarkAsks, type IntentMark } from '../src/shared/intent-mark.ts'
import { DELIVERY_ENVELOPE } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const WAITER = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

const JUST_ASK: IntentMark = 'just-ask'
const PROPOSAL_FIRST: IntentMark = 'proposal-first'
const ALIGN: IntentMark = 'align'
const GIVE_OPTIONS: IntentMark = 'give-options'

/**
 * The words of (a), (b), (c), (f) and (g), the same in all five. The fake runtime waits on them until it is stopped, so each case
 * stops its run as the person does before the next starts. A run that answers and ends could not be filed here: its agent
 * has no work area, and the office refuses the ending of a run with neither a submission nor a work area.
 */
const THE_SAME_WORDS = 'please hang: which of the two fixtures should the bench use first?'

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let prompts = ''
let settings: WorkerSettings
let watching: Parameters<typeof onePass>[1] = []
/** Every waiter this file started, killed by the pid recorded at start. */
const waiters: ChildProcess[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

/** Register an agent through the starter door and answer its registry id. */
async function started(handle: string): Promise<string> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code' })
  expect(reply.status, reply.text).toBe(201)
  const key = (reply.json['whatToGiveIt'] as { key: string }).key
  writeFileSync(join(scratch, `${handle}.key`), key, { mode: 0o600 })
  return (reply.json['agent'] as { id: string }).id
}

/**
 * The person writes one message, with the mark when one is given, and answers its record id. Each case sends when no run
 * of its recipients is going, so the answer is the one `theAnswerToAWriteInATestOffice` names.
 */
async function thePersonSends(to: string[], body: string, intent: IntentMark | null): Promise<string> {
  const record = {
    kind: 'message',
    title: body.slice(0, 40),
    data: { body, to: to.map((id) => ({ kind: 'agent', id })), ...(intent === null ? {} : { intent }) },
  }
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, record)
  expect(filed.status, filed.text).toBe(theAnswerToAWriteInATestOffice(AS_THE_PERSON, record))
  return (filed.json['record'] as { id: string }).id
}

/** The person's press that lets the office start an agent for a message. */
async function thePersonPressesStart(messageId: string): Promise<void> {
  const pressed = await inject('POST', `/api/messages/${messageId}/start-an-agent`, AS_THE_PERSON, {})
  expect(pressed.status, pressed.text).toBe(200)
}

/** A session record for a waiter to name. */
async function aSession(title: string): Promise<string> {
  const filed = await inject('POST', '/api/records', AS_THE_PERSON, { kind: 'session', title, data: { state: 'running' } })
  expect(filed.status, filed.text).toBe(201)
  return (filed.json['record'] as { id: string }).id
}

async function runData(session: string): Promise<Record<string, unknown>> {
  const read = await inject('GET', `/api/records/${session}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return (read.json['record'] as { data: Record<string, unknown> }).data
}

/** Start the waiter for one handle, and answer what it printed once it has stopped. */
async function theWaiterSays(handle: string, session: string): Promise<string> {
  const child = spawn(process.execPath, [WAITER, '--agent', handle, '--session', session, '--api', api, '--workspace', 'default'], {
    env: { ...withoutInheritedEffort(), MOLE_AGENT_KEY: '', MOLE_OFFICE_TOOL_CONFIGURATION: '', MOLE_AGENT_KEY_FILE: join(scratch, `${handle}.key`), MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' },
  })
  waiters.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const code = await Promise.race([
    new Promise<number>((go) => child.on('exit', (exit) => go(exit ?? -1))),
    new Promise<null>((go) => setTimeout(() => go(null), 42_000)),
  ])
  expect(code, `the waiter never stopped: ${printed}`).toBe(0)
  return printed
}

/** One prompt the fake runtime was given, with the conversation it was asked to resume, or null for a new one. */
interface AKeptPrompt {
  file: string
  prompt: string
  resume: string | null
}

/** Every prompt kept so far, oldest first. */
function theKeptPrompts(): AKeptPrompt[] {
  return readdirSync(prompts)
    .sort()
    .map((file) => ({ file, ...(JSON.parse(readFileSync(join(prompts, file), 'utf8')) as Omit<AKeptPrompt, 'file'>) }))
}

/** The kept prompts handed over for one message, oldest first. */
function thePromptsFor(messageId: string): AKeptPrompt[] {
  return theKeptPrompts().filter((kept) => kept.prompt.split('\n').includes(DELIVERY_ENVELOPE.whatItAnswers(messageId)))
}

/** Run worker passes until something is true, or fail saying what never happened. */
async function passUntil(what: string, ready: () => Promise<boolean> | boolean, within = 30_000): Promise<void> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (await ready()) return
    expect(Date.now(), `${what} never happened`).toBeLessThan(deadline)
    await new Promise((go) => setTimeout(go, 100))
  }
}

/**
 * THE LAST LINE BEFORE THE WORDS of one message, in some handed-over text: the line above the first line of the words
 * that comes after the envelope's line naming the message, with blank lines passed over.
 */
function theLastLineBeforeTheWords(text: string, messageId: string, words: string): string {
  const lines = text.split('\n')
  const named = lines.indexOf(DELIVERY_ENVELOPE.whatItAnswers(messageId))
  expect(named, `no line names message ${messageId} in:\n${text}`).toBeGreaterThan(-1)
  const first = words.split('\n')[0]!.trim()
  const at = lines.findIndex((line, index) => index > named && line.trim() === first)
  expect(at, `the words of message ${messageId} are not after its envelope in:\n${text}`).toBeGreaterThan(named)
  let before = at - 1
  while (before > named && lines[before]!.trim() === '') before -= 1
  return lines[before]!
}

/** How many lines of some text are the sentence of a mark. */
function markLines(text: string): number {
  const sentences = [whatTheMarkAsks(JUST_ASK), whatTheMarkAsks(PROPOSAL_FIRST), whatTheMarkAsks(ALIGN), whatTheMarkAsks(GIVE_OPTIONS)]
  return text.split('\n').filter((line) => sentences.includes(line.trim())).length
}

/** Some text with every one of the given ids replaced by one word. */
function withTheIdsAsOneWord(text: string, ids: readonly string[]): string {
  return ids.reduce((so, id) => so.split(id).join('THE-ID'), text)
}

/** Stop a run's process by its group and wait until it really has gone. */
async function theProcessIsGone(run: (typeof watching)[number]): Promise<void> {
  run.adapter.stop(run.handle, 'a restart of the API is being made to cut it off')
  const deadline = Date.now() + 10_000
  while (run.adapter.alive(run.handle)) {
    if (Date.now() >= deadline) throw new Error(`run ${run.session} would not stop`)
    await new Promise((go) => setTimeout(go, 50))
  }
}

/** The one process row of a run on the ledger, released rows included when asked. */
async function theProcessRow(session: string, includeReleased = false): Promise<{ id: string; releasedAt: string | null }> {
  const rows = await inject('GET', `/api/resources?sessionRecordId=${session}${includeReleased ? '&includeReleased=true' : ''}`, AS_THE_PERSON)
  expect(rows.status, rows.text).toBe(200)
  const resources = (rows.json['resources'] ?? []) as { id: string; type: string; releasedAt: string | null }[]
  return one(resources.filter((r) => r.type === 'process'), `the ledger row for run ${session}`)
}

/**
 * THE PERSON STOPS A RUN, through the door the person's stop button presses, and the worker passes until it has let the run
 * go. The run is then crashed and interrupted, as a run the person stopped is.
 */
async function thePersonStops(session: string, why: string): Promise<void> {
  const row = await theProcessRow(session)
  const stopped = await inject('POST', '/api/runtime/stop', AS_THE_PERSON, { resourceId: row.id, why })
  expect(stopped.status, stopped.text).toBe(200)
  expect(stopped.json['stopped'], stopped.text).toBe(true)
  await passUntil(`the worker letting run ${session} go`, () => !watching.some((run) => run.session === session))
}

/**
 * MAKE THE THREE MARKS A RESTART LEAVES on a run that is going now, as tests/a-restart-never-loses-a-run.test.ts makes
 * them: its process is gone, its ledger row is released through the product's door, and its record is moved behind
 * this server's own loading. Then this worker forgets it, as a worker restarted with its server does.
 */
async function aRestartCutsItOff(session: string): Promise<void> {
  const mine = one(watching.filter((run) => run.session === session), `the run ${session} in this worker's list`)
  await theProcessIsGone(mine)
  const row = await theProcessRow(session)
  const released = await inject('POST', `/api/resources/${row.id}/release`, AS_THE_PERSON, {
    note: 'the process ended and the next start found it gone',
    // FORCED, BECAUSE THE SESSION RECORD STILL SAYS RUNNING, which is the state a restart leaves.
    force: true,
  })
  expect(released.json['outcome'], released.text).toBeDefined()
  expect((await theProcessRow(session, true)).releasedAt, 'the ledger row was not closed, so this is not a restart').not.toBeNull()
  const stamp = t.api.localStamp(new Date(Date.now() - 60 * 60_000))
  // IMPORTED HERE: src/server/lib/worker.ts opens the database when it loads, and it may only once `freshDb` named one.
  const { thisServerLoadedAt } = await import('../src/server/lib/worker.ts')
  expect(stamp < thisServerLoadedAt(), 'the aged stamp is not before this server loaded').toBe(true)
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(stamp, session)
  watching = watching.filter((run) => run.session !== session)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // ONE BRIEF READ BEFORE ANY RUN STARTS. The brief ranks the open work on a thread of its own, which the first attention
  // read starts (src/server/lib/attention-thread.ts), and in a checkout that thread loads its TypeScript through tsx. A
  // run whose brief read is later than the worker waits starts without the brief. On the test box on 17 November 2026,
  // the first run here was that late, so its prompt differed from the next run's for a reason that is not the mark.
  const warmed = await inject('GET', '/api/brief', AS_THE_PERSON)
  expect(warmed.status, warmed.text).toBe(200)
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-run-is-handed-the-mark-'))
  prompts = join(scratch, 'prompts')
  mkdirSync(prompts)
  // THE FAKE RUNTIME, WITH EVERY PROMPT IT IS GIVEN KEPT FIRST, and the conversation it was asked to resume. The worker
  // hands a run its prompt as the first argument, so this wrapper keeps a copy and then does what the fake runtime does.
  const wrapper = join(scratch, 'fake-runtime-that-keeps-its-prompts.mjs')
  writeFileSync(
    wrapper,
    `import { writeFileSync } from 'node:fs'\n` +
      `const args = process.argv.slice(2)\n` +
      `const at = args.indexOf('--resume')\n` +
      `writeFileSync(${JSON.stringify(prompts)} + '/' + String(Date.now()).padStart(15, '0') + '-' + String(process.pid) + '.json', ` +
      `JSON.stringify({ prompt: args[0] ?? '', resume: at === -1 ? null : (args[at + 1] ?? null) }))\n` +
      `await import(${JSON.stringify(pathToFileURL(FAKE).href)})\n`,
  )
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: join(scratch, 'runs'),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: wrapper },
  }
  // THE FOLDER THE OFFICE STARTS ITS RUNS IN IS THIS TEST'S CHECKOUT, as the office's setting names it. A resume is
  // refused for a run that worked in a folder other than the one that setting names, and this test's worker starts its
  // runs in the checkout above.
  expect(process.env['MOLE_OFFICE_WORKER_CHECKOUT'], 'the setting is this test\'s to set').toBeUndefined()
  process.env['MOLE_OFFICE_WORKER_CHECKOUT'] = settings.checkout
}, 60_000)

afterAll(async () => {
  delete process.env['MOLE_OFFICE_WORKER_CHECKOUT']
  for (const child of waiters) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is where a waiter that ended itself is.
    }
  }
  for (const run of watching.splice(0, watching.length)) run.adapter.stop(run.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a run the office starts from the queue is handed the mark the waiter hands over', () => {
  /**
   * THE FIVE MESSAGES, (c), (a), (b), (f) and (g), each with the same words to the same two agents, all sent before any run
   * starts. So each run reads the same office: the brief a run is handed carries the person's latest messages, and a
   * message sent between two runs would make their prompts differ for a reason that is not the mark.
   */
  const sent = new Map<IntentMark | null, string>()
  /** What the waiter handed over, the five messages in one hand-over. */
  let waiter = ''
  /** What each run was handed, and the run's own id. */
  const handed = new Map<IntentMark | null, { prompt: string; session: string }>()

  beforeAll(async () => {
    const byRun = await started('mark-reads-by-run')
    const byWaiter = await started('mark-reads-by-waiter')
    for (const intent of [null, JUST_ASK, PROPOSAL_FIRST, ALIGN, GIVE_OPTIONS]) {
      sent.set(intent, await thePersonSends([byRun, byWaiter], THE_SAME_WORDS, intent))
    }
    waiter = await theWaiterSays('mark-reads-by-waiter', await aSession('the waiting terminal'))
    for (const messageId of sent.values()) expect(waiter, waiter).toContain(DELIVERY_ENVELOPE.whatItAnswers(messageId))
  }, 90_000)

  /** The person presses start for one message, and its run's prompt is read. The run is stopped before the next. */
  async function theRunIsHanded(intent: IntentMark | null): Promise<{ messageId: string; prompt: string }> {
    const messageId = sent.get(intent)!
    await thePersonPressesStart(messageId)
    await passUntil(`a run for message ${messageId}`, () => thePromptsFor(messageId).length > 0)
    const prompt = one(thePromptsFor(messageId), `the one prompt handed over for message ${messageId}`).prompt
    const session = one(watching.filter((run) => run.messageId === messageId), `the run for message ${messageId}`).session
    handed.set(intent, { prompt, session })
    await thePersonStops(session, 'this case has read the prompt, and the next case starts its own run')
    return { messageId, prompt }
  }

  it('(c) a message with no mark gives a prompt with no mark line, and the waiter hands over none', async () => {
    const no = await theRunIsHanded(null)
    expect(markLines(no.prompt), no.prompt).toBe(0)
    expect(theLastLineBeforeTheWords(no.prompt, no.messageId, THE_SAME_WORDS)).toBe(DELIVERY_ENVELOPE.whatItAnswers(no.messageId))
    expect(theLastLineBeforeTheWords(waiter, no.messageId, THE_SAME_WORDS).trim(), waiter).toBe(DELIVERY_ENVELOPE.whatItAnswers(no.messageId))
  }, 120_000)

  it('(a) Just ask: the prompt holds the waiter\'s mark line, last before the words in both', async () => {
    const asked = await theRunIsHanded(JUST_ASK)
    const line = whatTheMarkAsks(JUST_ASK)
    expect(line).not.toBeNull()
    expect(theLastLineBeforeTheWords(waiter, asked.messageId, THE_SAME_WORDS).trim(), waiter).toBe(line)
    expect(theLastLineBeforeTheWords(asked.prompt, asked.messageId, THE_SAME_WORDS), asked.prompt).toBe(
      theLastLineBeforeTheWords(waiter, asked.messageId, THE_SAME_WORDS),
    )
    expect(markLines(asked.prompt), asked.prompt).toBe(1)
  }, 120_000)

  it('(b) Proposal first: the prompt holds the waiter\'s mark line, last before the words in both', async () => {
    const proposal = await theRunIsHanded(PROPOSAL_FIRST)
    const line = whatTheMarkAsks(PROPOSAL_FIRST)
    expect(line).not.toBeNull()
    expect(theLastLineBeforeTheWords(waiter, proposal.messageId, THE_SAME_WORDS).trim(), waiter).toBe(line)
    expect(theLastLineBeforeTheWords(proposal.prompt, proposal.messageId, THE_SAME_WORDS), proposal.prompt).toBe(
      theLastLineBeforeTheWords(waiter, proposal.messageId, THE_SAME_WORDS),
    )
    expect(markLines(proposal.prompt), proposal.prompt).toBe(1)
  }, 120_000)

  it('(f) Align: the prompt holds the waiter\'s mark line, last before the words in both', async () => {
    const aligned = await theRunIsHanded(ALIGN)
    const line = whatTheMarkAsks(ALIGN)
    expect(line).not.toBeNull()
    expect(theLastLineBeforeTheWords(waiter, aligned.messageId, THE_SAME_WORDS).trim(), waiter).toBe(line)
    expect(theLastLineBeforeTheWords(aligned.prompt, aligned.messageId, THE_SAME_WORDS), aligned.prompt).toBe(
      theLastLineBeforeTheWords(waiter, aligned.messageId, THE_SAME_WORDS),
    )
    expect(markLines(aligned.prompt), aligned.prompt).toBe(1)
  }, 120_000)

  it('(g) Give options: the prompt holds the waiter\'s mark line, last before the words in both', async () => {
    const options = await theRunIsHanded(GIVE_OPTIONS)
    const line = whatTheMarkAsks(GIVE_OPTIONS)
    expect(line).not.toBeNull()
    expect(theLastLineBeforeTheWords(waiter, options.messageId, THE_SAME_WORDS).trim(), waiter).toBe(line)
    expect(theLastLineBeforeTheWords(options.prompt, options.messageId, THE_SAME_WORDS), options.prompt).toBe(
      theLastLineBeforeTheWords(waiter, options.messageId, THE_SAME_WORDS),
    )
    expect(markLines(options.prompt), options.prompt).toBe(1)
  }, 120_000)

  it('(c) the prompt for Just ask with its mark line taken out is the prompt for no mark', () => {
    const asked = handed.get(JUST_ASK)
    const no = handed.get(null)
    expect(asked, 'case (a) did not run').toBeDefined()
    expect(no, 'case (c) did not run').toBeDefined()
    // BOTH RUNS WERE HANDED THE BRIEF, or their prompts differ for a reason that is not the mark.
    for (const [which, run] of [['Just ask', asked!], ['no mark', no!]] as const) {
      expect(
        run.prompt.split('\n')[0],
        `the run for the message with ${which} started without the brief, as a run does when GET /api/brief answers ` +
          'later than the worker waits, so the two prompts cannot be compared',
      ).toBe(THE_BRIEF_HEADING)
    }
    // HOW MANY MARK LINES (a) HOLDS IS (a)'S OWN QUESTION, so this asks only what is left once they are taken out.
    const line = whatTheMarkAsks(JUST_ASK)!
    const withoutTheMark = asked!.prompt.split('\n').filter((one) => one !== line).join('\n')
    // EACH MESSAGE'S ID, AND EACH RUN'S OWN ID, is replaced by one word. A prompt names its run in the line that asks
    // which direction the round serves and in the path of the file of what the agent knows, and no two runs share one.
    expect(withTheIdsAsOneWord(withoutTheMark, [sent.get(JUST_ASK)!, asked!.session])).toBe(
      withTheIdsAsOneWord(no!.prompt, [sent.get(null)!, no!.session]),
    )
  })
})

describe('a run the office starts for a message another run was delivering is handed its mark', () => {
  it('a run is held, not started, when the office cannot say what the message\'s flag asks', async () => {
    const handle = 'mark-reads-failed-door'
    const assembledAgent = await started(handle)
    const messageRecord = { kind: 'message', title: THE_SAME_WORDS.slice(0, 40), data: { body: THE_SAME_WORDS, to: [{ kind: 'agent', id: assembledAgent }], intent: JUST_ASK } }
    const sent = await inject('POST', '/api/records', AS_THE_PERSON, messageRecord)
    expect(sent.status, sent.text).toBe(409)
    const messageId = (sent.json['record'] as { id: string }).id
    await thePersonPressesStart(messageId)
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, init) => String(url).includes(`/api/messages/${messageId}`)
      ? new Response(JSON.stringify({ error: 'The message door did not answer.' }), { status: 503, headers: { 'content-type': 'application/json' } })
      : realFetch(url, init)
    try {
      const report = await onePass(settings, watching)
      const why = report.held.find((one) => one.messageId === messageId)
      expect(why, JSON.stringify(report)).toBeDefined()
      expect(why!.because).toContain('reading of this message')
      expect(thePromptsFor(messageId), 'a run was started without what the flag asks').toHaveLength(0)
    } finally {
      globalThis.fetch = realFetch
    }
    // THE MESSAGE IS PUT AWAY, so no later pass starts a run for it and takes one of this file's two
    // run slots away from (e), whose own run then never starts.
    const putAway = await inject('DELETE', `/api/records/${messageId}`, AS_THE_PERSON)
    expect(putAway.status, putAway.text).toBe(200)
  }, 120_000)

  it('(d) a run a restart cut off, for a message marked Just ask: the run carrying it on holds the mark line', async () => {
    const agentId = await started('mark-carried-on')
    const words = 'please hang, and this run is carried on after a restart.'
    const messageId = await thePersonSends([agentId], words, JUST_ASK)
    await thePersonPressesStart(messageId)
    await passUntil(`a run for message ${messageId}`, () => watching.some((run) => run.messageId === messageId))
    const session = one(watching.filter((run) => run.messageId === messageId), 'the run started for this message').session
    // A RUN THAT KNOWS ITS CONVERSATION FROM ITS START is the one a restart can carry on.
    const named = await inject('PATCH', `/api/records/${session}`, AS_THE_PERSON, { dataPatch: { providerSession: 'fake-a-conversation' } })
    expect(named.status, named.text).toBe(200)
    await aRestartCutsItOff(session)

    await passUntil('the carry-on of the cut-off run', () => thePromptsFor(messageId).some((kept) => kept.resume === 'fake-a-conversation'))
    const carried = one(
      thePromptsFor(messageId).filter((kept) => kept.resume === 'fake-a-conversation'),
      'the prompt of the run carrying it on',
    ).prompt
    expect(theLastLineBeforeTheWords(carried, messageId, words), carried).toBe(whatTheMarkAsks(JUST_ASK))
    expect(markLines(carried), carried).toBe(1)
  }, 120_000)

  it('(e) a run the person pressed resume on, for a message marked Proposal first: the resumed run holds the mark line', async () => {
    const agentId = await started('mark-resumed')
    const words = 'please name the conversation and hang, and this run is resumed by a press.'
    const messageId = await thePersonSends([agentId], words, PROPOSAL_FIRST)
    await thePersonPressesStart(messageId)
    await passUntil(`a run for message ${messageId}`, () => watching.some((run) => run.messageId === messageId))
    const session = one(watching.filter((run) => run.messageId === messageId), 'the run started for this message').session
    let conversation = ''
    await passUntil(`run ${session} naming its conversation`, async () => {
      const said = (await runData(session))['providerSession']
      conversation = typeof said === 'string' ? said : ''
      return conversation !== ''
    })

    // THE PERSON STOPS IT MID-TURN, so it is an interrupted run with a conversation, and then presses resume.
    await thePersonStops(session, 'the person stopped it to resume it later')
    const pressed = await inject('POST', `/api/office/interrupted-runs/${session}/resume`, AS_THE_PERSON)
    expect(pressed.status, pressed.text).toBe(200)

    await passUntil('the resume the person pressed', () => thePromptsFor(messageId).some((kept) => kept.resume === conversation))
    const resumed = one(thePromptsFor(messageId).filter((kept) => kept.resume === conversation), 'the prompt of the resumed run').prompt
    expect(theLastLineBeforeTheWords(resumed, messageId, words), resumed).toBe(whatTheMarkAsks(PROPOSAL_FIRST))
    expect(markLines(resumed), resumed).toBe(1)
  }, 120_000)
})
