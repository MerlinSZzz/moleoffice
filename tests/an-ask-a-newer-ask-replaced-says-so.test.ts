// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASK FOR A CHECK THAT A NEWER ASK REPLACED IS DELIVERED WITH A SENTENCE THAT IS TRUE OF IT (wave 13j, the round after
 * 4POnktTo8xhR, item B). The secretary: "An ask a newer ask replaced is delivered with a reason that is not true of it. Give it
 * a true sentence of its own." Asking for a check again writes a new ask, and the run's check names the new one. The old
 * ask can still be queued, and until this round it was delivered with the sentence for a line saying what happened in a
 * group: "Mole Office wrote this line to say what happened in this group, and a line like that is for people to read."
 *
 * WHAT IS PROVED HERE, against a real database, the real server and the real worker pass in the ordinary mode, the one
 * mode that delivers a line Mole Office wrote without a run:
 *
 *   1. THE CONTROL. The newer ask is the check: its row to the inspector carries the check, and needs a run.
 *   2. THE REPLACED ASK'S ROWS, to the inspector and to the run's own agent, say that a newer ask replaced it, name the
 *      newer ask, and say that no check is started for it. The newer ask's row to the run's own agent keeps the general
 *      sentence, because it was not replaced.
 *   3. ONE PASS delivers the replaced ask with that sentence to both, starts no check for it, and starts the newer ask's
 *      check.
 *
 * CONTROL: red before the change. MUTATION: in the commit that adds the code.
 *
 * Every run here is synthetic and says so. The git trees and the worker's output folder are made under the system's
 * temporary folder and removed after. The check tool is tests/fake-inspection-tool.mjs, so no model is called, and
 * nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSupervisor = as('agent', 'super-r')
const asWorker = as('agent', 'worker-w')
const theWorker = { type: 'agent' as const, id: 'worker-w' }
const thePerson = { type: 'human' as const, id: THE_PERSON }
const A = 'work/a.txt'

/** The sentence a line saying what happened in a group is delivered with, and which is not true of an ask. */
const THE_GENERAL_SENTENCE =
  'Mole Office wrote this line to say what happened in this group, and a line like that is for people to read. ' +
  'No run was started for it and nothing was spent. It is here in full.'

/** The sentence a replaced ask is delivered with: the run, the newer ask, and that no check is started for it. */
const replaced = (run: string, newer: string): string =>
  `This message asked for a check of run ${run}, and a newer ask, message ${newer}, replaced it. No check is started for this message.`

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory under the system's temporary folder, removed after the file. */
function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `replaced-ask-${prefix}-`)))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** The message the run's check names now. */
function theAskOf(run: string): string {
  const message = (t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message ?? ''
  expect(message, `the office asked for no check of ${run}`).not.toBe('')
  return message
}

/**
 * A finished run of the worker, sealed at its own tree's tip, and asked for its check twice while the first ask is still
 * queued: the second time by the person through ask-again. Returns the run and both asks.
 */
async function aRunAskedTwice(): Promise<{ run: string; first: string; newer: string }> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic replaced-ask fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic replaced-ask run',
    workspaceId: WORKSPACE,
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-w', cutFrom: 'main', workingDirectory: dir, doing: 'Synthetic: the run changes work/a.txt.' },
  }).id
  writeFileSync(join(dir, A), `${A} changed by ${dir}.\n`)
  git(dir, 'commit', '-q', '-am', 'Synthetic work of the run')
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  const askAgain = async () => {
    const again = await call('POST', `/api/checks/${run}/ask-again`, { ...asPerson, 'content-type': 'application/json' }, {})
    expect(again.status, again.raw).toBe(200)
  }
  // IF SEALING ASKED FOR NO CHECK, the person's ask-again is the first ask.
  if (!(t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message) await askAgain()
  const first = theAskOf(run)
  await askAgain()
  const newer = theAskOf(run)
  expect(newer).not.toBe(first)
  return { run, first, newer }
}

interface TheRow { messageId: string; handle: string; inspection?: { run: string }; needsNoRun: string | null }

/** The worker's queue row for one message to one agent, read through the real door of this file's own office. */
async function theRowOf(message: string, handle: string): Promise<TheRow> {
  const r = await call('GET', '/api/worker/queue', {})
  expect(r.status, r.raw).toBe(200)
  const row = (r.body['queue'] as TheRow[]).find((one) => one.messageId === message && one.handle === handle)
  expect(row, `no queue row for ${message} to ${handle}`).toBeDefined()
  return row!
}

/** The registry id of an agent, by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/** One message's delivery to one agent: its mark and the reason beside it. */
function theDeliveryOf(message: string, handle: string): { mark: string; because: string | null } {
  const delivery = t.client.sqlite
    .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
    .get(message, theIdOf(handle)) as { mark: string; because: string | null } | undefined
  expect(delivery, `${message} was never delivered to ${handle}`).toBeDefined()
  return delivery!
}

let asked: { run: string; first: string; newer: string }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asPerson, { handle: 'super-r', name: 'Super R', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-w', name: 'Worker W', role: 'worker', workArea: ['work'] })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: scratch('main'), actor: thePerson })
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: process.cwd(),
    runs: 9,
    hops: 3,
    outputRoot: scratch('worker'),
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
  asked = await aRunAskedTwice()
}, 60_000)

afterAll(async () => {
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The replaced-ask test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('an ask for a check that a newer ask replaced', () => {
  it('1: the newer ask is the check, and needs a run', async () => {
    const row = await theRowOf(asked.newer, 'inspector-one')
    expect(row.inspection?.run).toBe(asked.run)
    expect(row.needsNoRun).toBeNull()
  })

  it('2: the replaced ask says a newer ask replaced it, to the inspector and to the run\'s own agent', async () => {
    const sentence = replaced(asked.run, asked.newer)
    for (const handle of ['inspector-one', 'worker-w']) {
      const row = await theRowOf(asked.first, handle)
      expect(row.inspection).toBeUndefined()
      expect(row.needsNoRun).toBe(sentence)
    }
    // THE NEWER ASK WAS NOT REPLACED, so its copy to the run's own agent keeps the general sentence.
    expect((await theRowOf(asked.newer, 'worker-w')).needsNoRun).toBe(THE_GENERAL_SENTENCE)
  })

  it('3: one pass delivers it with that sentence, starts no check for it, and starts the newer ask\'s check', async () => {
    const sentence = replaced(asked.run, asked.newer)
    const pass = await onePass(settings, watching, [])
    expect(pass.started.some((one) => one.messageId === asked.first), JSON.stringify(pass)).toBe(false)
    expect(pass.started.some((one) => one.messageId === asked.newer), JSON.stringify(pass)).toBe(true)
    expect(pass.held.filter((one) => one.messageId === asked.first)).toEqual([
      { messageId: asked.first, because: sentence },
      { messageId: asked.first, because: sentence },
    ])
    expect(theDeliveryOf(asked.first, 'inspector-one')).toEqual({ mark: 'delivered', because: sentence })
    expect(theDeliveryOf(asked.first, 'worker-w')).toEqual({ mark: 'delivered', because: sentence })
    const until = Date.now() + 30_000
    while (watching.length > 0 && Date.now() < until) {
      await new Promise((go) => setTimeout(go, 100))
      await onePass(settings, watching, [])
    }
    expect(watching, 'the newer ask\'s check did not end').toEqual([])
  }, 60_000)
})
