// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START THAT COULD NOT BE REGISTERED ENDS ITS RECORD AS "CRASHED", FOR EVERY RUN.
 *
 * `startOne` starts the run's process and then registers it with POST /api/resources. The office can
 * refuse that registration. Which branch answers the refusal depends on whether the run has a
 * startup gate.
 *
 * WHERE NO GATE IS MADE, the program is running when the refusal arrives. That is a check on every
 * platform, and a conversation run on the Mac and on Windows, where `makeStartupWitness`
 * (src/worker/runtimes/os.ts) answers null. A run still going that no list holds is stopped: it is a
 * process on this machine no list has and no press can end. The branch that stops it
 * (src/worker/index.ts, the `if (adapter.alive(handle))` under `if (!held.ok)`) used to close the
 * run's session record only when `one.inspection` was set, and then with the check's own sentence. A
 * conversation run was stopped and its record stayed "running" for a process that was gone; its
 * caller keeps the message and tries again later with a new record, so nothing else closes the old
 * one.
 *
 * The decision on how such a start ends is this: the record is closed for every run, as
 * "crashed", with the same sentence the caller is given. That is the shape of the `catch` just above
 * the branch, and the sentence over `endTheStartAsCrashed` says every other failed start closes its
 * record the same way. A check is still told its own reason at /api/checks/<run>/tool-ended.
 *
 * ON LINUX, A CONVERSATION RUN HAS A STARTUP GATE. The gate holds the program until the office has
 * registered its process. A refused registration ends the gate, so the program never runs. The
 * branch for this is the `if (!held.ok && startupWitness !== null)` just before the one that stops a
 * running program. It closes the record the same way, as "crashed" with the sentence the caller is
 * given. That sentence is the gate's own, `startupGate.noRegistration`: "The startup gate could not
 * be registered, so the run did not start." It is the right sentence there, because the program
 * never ran. It is followed by the words of the office's refusal, as the branch for a running
 * program keeps them.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. A conversation run: `startOne` answers `ok: false` with the sentence of the branch the platform
 *    takes. On Linux that is the gate's own sentence followed by the words of the office's refusal.
 *    On the Mac and on Windows it is "The run was started and could not be registered, so it was
 *    stopped again: ...". On every platform the record is closed exactly once, with state "crashed"
 *    and `doing` set to that same sentence, before `startOne` returns, and no tool-ended request is
 *    made.
 * 2. A check: a check has no startup gate on any platform, so this case is the same everywhere. The
 *    check is told its reason, and the record is closed exactly once with the sentence "The run was
 *    started and could not be registered, so it was stopped again: ..." rather than the check's
 *    reason.
 *
 * HOW EACH BRANCH IS REACHED. The run really starts. The runtime is the fake adapter, named in the
 * settings' env through MOLE_OFFICE_FAKE_RUNTIME (src/worker/runtimes/fake.ts), running a small
 * script in this test's own temporary folder that stays alive until it is stopped. A check starts
 * the same way through MOLE_OFFICE_FAKE_INSPECTION_TOOL. On Linux the conversation run's script is
 * started behind its startup gate, so it has not begun when POST /api/resources answers. Where no
 * gate is made, the script is running and still alive when POST /api/resources answers, which is
 * what `adapter.alive(handle)` reads.
 *
 * THE STUB answers the doors `startOne` walks before the refusal: GET /api/records/<message> (the
 * typed expected time), POST /api/records (the run's own session record), GET /api/brief (the state
 * of the project), GET /api/office-regulations/chapters (the chapters the run reads), and, for a
 * check, POST /api/checks/<run>/tool-started. It answers POST /api/resources with a refusal. It
 * records every request, so the cases read back exactly which requests were made and in what order.
 *
 * THE PROCESS IS NOT LEFT RUNNING. On Linux the conversation run's gate is ended: its process group
 * is killed before the program behind it runs. Where no gate is made, the branch stops the running
 * program. Either way each case waits for the pid to leave, read off the registration request the
 * stub recorded. On Linux that pid is the gate's own process. That wait is in the case's `finally`,
 * so it runs even when the case itself is red: a red case stops at its first failed expectation, and
 * a check written as the case's last line would never run. The pid is read without an expectation,
 * so a missing one does not replace the case's own failure. A process still there is stopped by its
 * own process group, and the error carries both sentences when the case failed too.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { TheSelectedChapters } from '../src/shared/chapter-edit.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { endGroup, stillRunning } from '../src/worker/runtimes/os.ts'
import { FAKE_RUNTIME_SETTING } from '../src/worker/runtimes/fake.ts'
import { FAKE_INSPECTION_TOOL_SETTING } from '../src/worker/runtimes/inspection.ts'

const MADE_UP_SESSION = 'made-up-unregistered-run'
const MADE_UP_MESSAGE = 'made-up-unregistered-message'
const MADE_UP_CHECKED_RUN = 'made-up-checked-run'
const MADE_UP_MODEL = 'made-up-unregistered-model'
const THE_REFUSAL = 'Made up: the ledger refused to write this process into any list.'
const THE_CALLERS_SENTENCE = `The run was started and could not be registered, so it was stopped again: ${THE_REFUSAL}`

let db: TestDb, app: FastifyInstance, scratch: string
let choice: TheSelectedChapters
let staysAlive: string, checkStaysAlive: string

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-unregistered-start-'))
  // THE TWO SCRIPTS THE FAKE ADAPTERS RUN. Each stays alive until the branch stops it, so the run is
  // still going when the registration refusal arrives, which is the branch under test.
  staysAlive = join(scratch, 'stays-alive.mjs')
  checkStaysAlive = join(scratch, 'check-stays-alive.mjs')
  writeFileSync(staysAlive, 'setInterval(() => {}, 1_000)\n')
  writeFileSync(checkStaysAlive, 'setInterval(() => {}, 1_000)\n')
  const person = {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': 'default',
    ...thePersonsKeyHeader(),
  }
  const answered = await app.inject({ url: '/api/office-regulations/chapters', headers: person })
  expect(answered.statusCode, answered.body).toBe(200)
  choice = answered.json() as TheSelectedChapters
}, 60_000)

afterAll(async () => {
  await app.close()
  db.close()
  rmSync(scratch, { recursive: true, force: true })
})

/** The made-up message a conversation run answers, with the runtime the fake adapter wears. */
function theWaitingMessage(): unknown {
  return {
    messageId: MADE_UP_MESSAGE,
    workspaceId: 'default',
    to: { kind: 'agent', id: 'made-up-unregistered-reader' },
    handle: 'made-up-unregistered-reader',
    runtime: 'codex',
    model: MADE_UP_MODEL,
    body: 'A made-up message for a run that starts and cannot be registered.',
    sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    sentAt: '2026-10-17 05:00',
    resume: null,
    hops: 0,
  }
}

/** The made-up check whose tool starts and cannot be registered. */
function theWaitingCheck(): unknown {
  return {
    messageId: MADE_UP_MESSAGE,
    workspaceId: 'default',
    to: { kind: 'agent', id: 'made-up-unregistered-inspector' },
    handle: 'made-up-unregistered-inspector',
    runtime: 'inspection-tool',
    inspection: { run: MADE_UP_CHECKED_RUN, checkout: null, model: MADE_UP_MODEL },
    body: 'A made-up message for a check that starts and cannot be registered.',
    sentBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    sentAt: '2026-10-17 05:00',
    resume: null,
    hops: 0,
  }
}

function theSettings(): unknown {
  return {
    api: 'http://made-up-office.invalid',
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 1,
    hops: 4,
    outputRoot: scratch,
    env: {
      PATH: process.env['PATH'] ?? '/usr/local/bin:/usr/bin:/bin',
      MOLE_OFFICE_DB: db.file,
      [FAKE_RUNTIME_SETTING]: staysAlive,
      [FAKE_INSPECTION_TOOL_SETTING]: checkStaysAlive,
    },
  }
}

interface Asked {
  method: string
  path: string
  body: unknown
}

/**
 * The stub every case starts from. It records every request it is given, answers the doors the start
 * needs before the refusal, and refuses POST /api/resources with a made-up sentence. `order` records
 * that a close or a check ending was seen, so a case can prove the order the branch used.
 */
function theStub(asked: Asked[], order: string[]): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    asked.push({ method, path, body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null })
    if (method === 'PATCH' && path === `/api/records/${MADE_UP_SESSION}`) {
      if (closesTheRecord(asked[asked.length - 1]!)) order.push('the record was closed')
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION } }), { status: 200 })
    }
    if (method === 'POST' && path === '/api/records') {
      return new Response(JSON.stringify({ record: { id: MADE_UP_SESSION }, runKey: { key: 'made-up-unregistered-key' } }), { status: 201 })
    }
    if (path === `/api/records/${MADE_UP_MESSAGE}`) return new Response(JSON.stringify({ record: { data: {} } }), { status: 200 })
    if (path === '/api/brief') return new Response(JSON.stringify({ head: 'A made-up brief.' }), { status: 200 })
    if (path === '/api/office-regulations/chapters') return new Response(JSON.stringify(choice), { status: 200 })
    if (method === 'POST' && path === `/api/checks/${MADE_UP_CHECKED_RUN}/tool-started`) return new Response(JSON.stringify({ ok: true }), { status: 200 })
    if (method === 'POST' && path === `/api/checks/${MADE_UP_CHECKED_RUN}/tool-ended`) {
      order.push('the check was told its tool ended')
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    if (method === 'POST' && path === '/api/resources') return new Response(THE_REFUSAL, { status: 403 })
    return new Response('Made-up unavailable door', { status: 503 })
  }
}

/**
 * Whether a request closes the run's record: a PATCH that sets its state to "crashed". The PATCHes that write how far
 * the start got, the probe, the program and its version and the launch, close nothing.
 */
function closesTheRecord(one: Asked): boolean {
  return one.method === 'PATCH' && one.path === `/api/records/${MADE_UP_SESSION}` &&
    (one.body as { dataPatch?: { state?: unknown } } | null)?.dataPatch?.state === 'crashed'
}

/** Every PATCH that closed the run's record, as the stub saw them. */
function theCloses(asked: Asked[]): Asked[] {
  return asked.filter(closesTheRecord)
}

/** The pid the registration request named, or null because the start never reached that door. */
function thePidItAskedAbout(asked: Asked[]): number | null {
  const registration = asked.find((one) => one.method === 'POST' && one.path === '/api/resources')
  const key = (registration?.body as { key?: unknown } | null)?.key
  return typeof key === 'string' && key !== '' ? Number(key) : null
}

/**
 * Wait for the stopped process to leave, and stop it by its own group if it is still there.
 * Answers the sentence to fail with, or null because the process is gone. No expectation is used
 * to read the pid, so a missing one does not replace the case's own failure when it runs in a
 * case's `finally`.
 */
async function theProcessLeftOrWasStopped(asked: Asked[]): Promise<string | null> {
  const pid = thePidItAskedAbout(asked)
  if (pid === null) {
    return 'No process was recorded: the start never reached POST /api/resources, so whether the run was stopped cannot be checked.'
  }
  const until = Date.now() + 5_000
  while (stillRunning(pid) && Date.now() < until) await new Promise((done) => setTimeout(done, 25))
  if (!stillRunning(pid)) return null
  endGroup(pid, 'SIGKILL')
  return `The run's process group ${String(pid)} was still running after its start could not be registered.`
}

it('closes a conversation run’s record as crashed with the sentence the caller is given', async () => {
  const rules = await import('../src/worker/rules.ts')
  const { startOne } = await import('../src/worker/index.ts')
  const writer = vi.spyOn(rules, 'writeRulesInto').mockReturnValue({
    file: 'AGENTS.md',
    path: join(scratch, 'AGENTS.md'),
    written: true,
    because: 'A made-up rules file was written for this test.',
  })
  const asked: Asked[] = [], order: string[] = []
  vi.stubGlobal('fetch', theStub(asked, order))
  let theCaseFailedWith: Error | null = null
  try {
    const result = await startOne(theWaitingMessage() as Parameters<typeof startOne>[0], theSettings() as Parameters<typeof startOne>[1], [])
    order.push('startOne returned')
    expect(result.ok).toBe(false)
    const because = (result as { ok: false; because: string }).because
    // THE SENTENCE OF THE BRANCH THE PLATFORM TAKES. On Linux the startup gate's, because the program never ran, followed by the office's refusal.
    expect(because).toBe(process.platform === 'linux' ? `${sayInEnglish('startupGate.noRegistration')} ${THE_REFUSAL}` : THE_CALLERS_SENTENCE)
    const closes = theCloses(asked)
    expect(closes).toHaveLength(1)
    expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: because } })
    expect(order).toEqual(['the record was closed', 'startOne returned'])
    // A conversation run has no check to tell: no tool-ended request is made for it.
    expect(asked.filter((one) => one.path.endsWith('/tool-ended'))).toEqual([])
  } catch (err) {
    theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
  } finally {
    // THE PROCESS CHECK RUNS EVEN WHEN THE CASE IS RED, and the restores come after it.
    const theProcessSays = await theProcessLeftOrWasStopped(asked)
    writer.mockRestore()
    vi.unstubAllGlobals()
    if (theProcessSays !== null) {
      throw new Error(
        theCaseFailedWith === null
          ? theProcessSays
          : `${theCaseFailedWith.message}\nAnd the process check failed too: ${theProcessSays}`,
      )
    }
  }
  if (theCaseFailedWith !== null) throw theCaseFailedWith
})

it('tells the check its reason and closes the record with the sentence the caller is given', async () => {
  const rules = await import('../src/worker/rules.ts')
  const { startOne } = await import('../src/worker/index.ts')
  const writer = vi.spyOn(rules, 'writeRulesInto').mockReturnValue({
    file: 'AGENTS.md',
    path: join(scratch, 'AGENTS.md'),
    written: true,
    because: 'A made-up rules file was written for this test.',
  })
  const asked: Asked[] = [], order: string[] = []
  vi.stubGlobal('fetch', theStub(asked, order))
  let theCaseFailedWith: Error | null = null
  try {
    const result = await startOne(theWaitingCheck() as Parameters<typeof startOne>[0], theSettings() as Parameters<typeof startOne>[1], [])
    order.push('startOne returned')
    expect(result.ok).toBe(false)
    const because = (result as { ok: false; because: string }).because
    expect(because).toBe(THE_CALLERS_SENTENCE)
    const told = asked.filter((one) => one.method === 'POST' && one.path === `/api/checks/${MADE_UP_CHECKED_RUN}/tool-ended`)
    expect(told).toHaveLength(1)
    expect(told[0]?.body).toEqual({
      session: MADE_UP_SESSION,
      reason: `The check could not be registered in the process ledger: ${THE_REFUSAL}`,
    })
    const closes = theCloses(asked)
    expect(closes).toHaveLength(1)
    expect(closes[0]?.body).toEqual({ dataPatch: { state: 'crashed', doing: because } })
    expect(order).toEqual(['the check was told its tool ended', 'the record was closed', 'startOne returned'])
  } catch (err) {
    theCaseFailedWith = err instanceof Error ? err : new Error(String(err))
  } finally {
    // THE PROCESS CHECK RUNS EVEN WHEN THE CASE IS RED, and the restores come after it.
    const theProcessSays = await theProcessLeftOrWasStopped(asked)
    writer.mockRestore()
    vi.unstubAllGlobals()
    if (theProcessSays !== null) {
      throw new Error(
        theCaseFailedWith === null
          ? theProcessSays
          : `${theCaseFailedWith.message}\nAnd the process check failed too: ${theProcessSays}`,
      )
    }
  }
  if (theCaseFailedWith !== null) throw theCaseFailedWith
})
