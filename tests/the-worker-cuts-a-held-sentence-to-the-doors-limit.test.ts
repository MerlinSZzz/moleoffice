// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE WORKER CUTS A SENTENCE FOR A DELIVERY TO THE HELD DOOR'S LIMIT, AND MARKS THE CUT.
 *
 * The held door (`heldBody` in src/server/api/worker.ts) takes a sentence of at most 500 characters and refuses a longer
 * one whole, with 400. On a Windows 11 machine (wave 13t, round W9, the first label) the worker stopped a run whose
 * registration was refused, and its sentence saying so was over 500 characters. The door refused it, so the delivery
 * still said only that the owner had pressed to start, and the worker sent the same sentence again on every pass. A
 * person could not see why nothing ran.
 *
 * The worker now cuts such a sentence to 500 characters before it sends it: the first 499, then "…", which says it was
 * cut. A sentence of 500 or fewer is sent whole. Both places that write to the held door cut it: the sentence that a
 * message is held (`sayItIsHeld`), and the sentence on a watched run's row (`sayOnTheRow`).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED, through the real held door, over the listener
 * ---------------------------------------------------------------------------------------
 *
 *   1. A refusal to start of 700 characters reaches the delivery as its first 499 characters and "…". The door
 *      refuses none of the worker's sentences for it. The worker remembers the cut sentence, and the next pass, with
 *      nothing changed, sends nothing.
 *   2. A refusal to start of exactly 500 characters reaches the delivery whole, with no mark. One of 501 is cut.
 *   3. A run that ended without answering, whose sentence is over 500 characters, has its row cut the same way, and
 *      the door refuses none of the worker's sentences for it.
 * A refusal to start is made long with a checkout folder that is not there, whose path the refusal names. The run of
 * case 3 is a stand-in this file writes, which prints 800 characters on its error channel and nothing else, and exits 1.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the report of the run that added this file)
 * ---------------------------------------------------------------------------------------
 *
 *   - nothing is cut, as before this file: cases 1, 2 and 3 go red;
 *   - `sayItIsHeld` does not cut: cases 1 and 2 go red;
 *   - `sayOnTheRow` does not cut: case 3 goes red;
 *   - the cut is made with no mark: cases 1, 2 and 3 go red;
 *   - a sentence of exactly 500 is cut as well: case 2 goes red;
 *   - `sayItIsHeld` remembers the sentence before the cut: case 1 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onePass, refuseAWorkingDirectory, whatTheWorkerLastSaidAbout, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let folder: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
/** Every answer of the held door, in order: which message, and its status. */
const heldAnswers: { messageId: string; status: number }[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_OWNER): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { status: reply.statusCode, said: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}
async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}
/** A message to a fresh agent, and the person's press to start one for it, which such a message waits for. */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } })
  const id = (filed.said['record'] as { id: string }).id
  const pressed = await post(`/api/messages/${id}/start-an-agent`, {})
  expect(pressed.status, JSON.stringify(pressed.said).slice(0, 300)).toBe(200)
  return id
}
async function sentenceOn(messageId: string): Promise<string | null> {
  const read = (await get(`/api/messages/${messageId}`)) as { message?: { deliveries?: { because: string | null }[] } }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`).because
}
function answersFor(messageId: string): number[] {
  return heldAnswers.filter((a) => a.messageId === messageId).map((a) => a.status)
}
/** The message leaves the queue, read by the agent it was sent to, so later cases start nothing for it. */
async function readBy(agentId: string, messageId: string): Promise<void> {
  const seen = await post(`/api/messages/${messageId}/mark`, { mark: 'seen' }, { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agentId })
  expect(seen.status, JSON.stringify(seen.said).slice(0, 300)).toBe(200)
}

/** A checkout folder that is not there, whose refusal to start in it is `length` characters long. */
function aFolderThatIsNotThere(length: number): string {
  const base = join(folder, 'not-there')
  const around = String(refuseAWorkingDirectory(base, base)).length - base.length
  let path = base
  while (length - around - path.length > 41) path += `/${'a-folder-that-is-not-there-'.padEnd(40, 'x')}`
  path += 'x'.repeat(length - around - path.length)
  expect(refuseAWorkingDirectory(path, path), 'the refusal is not the length asked for').toHaveLength(length)
  return path
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  app.addHook('onResponse', async (req, reply) => {
    const held = /\/api\/worker\/messages\/([^/]+)\/held$/.exec(req.url)
    if (req.method === 'POST' && held !== null) heldAnswers.push({ messageId: held[1]!, status: reply.statusCode })
  })
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  folder = aTestDatabaseFolder('held-cut')
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: join(folder, 'runs'),
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const run of [...watching]) {
    try {
      run.adapter.stop(run.handle, 'the test file has finished')
    } catch {
      continue
    }
  }
  const deadline = Date.now() + 2_000
  while (watching.some((run) => run.adapter.alive(run.handle)) && Date.now() < deadline) {
    await new Promise((go) => setTimeout(go, 20))
  }
  await app.close()
  t.close()
  rmSync(folder, { recursive: true, force: true })
})

describe('a sentence that a message is held', () => {
  let agentId = ''
  let first = ''
  let second = ''

  it('1: is cut to the door\'s limit and marked, reaches the delivery, and is said once', async () => {
    agentId = await anAgent('held-cut')
    first = await messageTo(agentId, 'The first message, whose run cannot start in a folder that is not there.')
    const at = { ...settings, checkout: aFolderThatIsNotThere(700) }
    const report = await onePass(at, watching)
    const whole = one(report.held.filter((h) => h.messageId === first), 'the held message').because
    expect(whole).toHaveLength(700)
    const cut = `${whole.slice(0, 499)}…`
    expect(await sentenceOn(first)).toBe(cut)
    expect(answersFor(first), 'the door refused a sentence').toEqual([200])
    expect(whatTheWorkerLastSaidAbout({ messageId: first, to: { kind: 'agent', id: agentId } })).toBe(cut)
    await onePass(at, watching)
    expect(answersFor(first), 'the same sentence was said again').toEqual([200])
  })

  it('2: of exactly 500 characters reaches the delivery whole, and one of 501 is cut', async () => {
    second = await messageTo(agentId, 'A second message, held for the same reason.')
    const atTheLimit = await onePass({ ...settings, checkout: aFolderThatIsNotThere(500) }, watching)
    const whole = one(atTheLimit.held.filter((h) => h.messageId === second), 'the held message').because
    expect(whole).toHaveLength(500)
    expect(await sentenceOn(second)).toBe(whole)
    const overIt = await onePass({ ...settings, checkout: aFolderThatIsNotThere(501) }, watching)
    const longer = one(overIt.held.filter((h) => h.messageId === second), 'the held message').because
    expect(longer).toHaveLength(501)
    expect(await sentenceOn(second)).toBe(`${longer.slice(0, 499)}…`)
    expect(answersFor(second), 'the door refused a sentence').toEqual([200, 200])
    await readBy(agentId, first)
    await readBy(agentId, second)
  })
})

describe('a sentence on a watched run\'s row', () => {
  it('3: is cut to the door\'s limit and marked when the run ended without answering', async () => {
    const standIn = join(folder, 'a-run-that-fails-at-length.mjs')
    writeFileSync(standIn, `process.stderr.write(${JSON.stringify('This stand-in fails on purpose and says so at length. '.repeat(15))})\nprocess.exit(1)\n`)
    const at = { ...settings, runs: 8, env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: standIn } }
    const agentId = await anAgent('ended-cut')
    const messageId = await messageTo(agentId, 'A message whose run fails with a long error.')
    const started = await onePass(at, watching)
    one(started.started.filter((s) => s.messageId === messageId), 'the run for this message')
    let whole: string | null = null
    for (let i = 0; i < 200 && whole === null; i += 1) {
      const pass = await onePass(at, watching)
      whole = pass.failed.find((f) => f.messageId === messageId)?.because ?? null
      if (whole === null) await new Promise((go) => setTimeout(go, 50))
    }
    expect(whole, 'the worker never saw the run end').not.toBeNull()
    expect(whole).toMatch(/^The run ended without answering\./)
    expect(whole!.length).toBeGreaterThan(500)
    expect(await sentenceOn(messageId)).toBe(`${whole!.slice(0, 499)}…`)
    expect(answersFor(messageId).length, 'the worker wrote nothing on the row').toBeGreaterThan(0)
    expect(answersFor(messageId).filter((status) => status !== 200), 'the door refused a sentence').toEqual([])
  }, 60_000)
})
