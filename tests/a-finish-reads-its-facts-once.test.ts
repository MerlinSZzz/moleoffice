// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISH THAT SEALS ASKS THE SEAL-READ THREAD FOR THE RUN'S FACTS ONCE (src/server/lib/a-finish-reads-git-apart.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A finish that seals read the run's facts on the thread for the gate, and then read them again beside the seal's
 * question. On a made-up repository of 300 commits one read of the facts took 8 to 12 s, so such a finish took 16 to
 * 24 s.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A finish that seals has the facts read once, and then the seal's question alone, and it seals what the
 *      synchronous read seals.
 *   2. A tree edited after the facts were read and before the seal's question is read whole again, and the finish is
 *      refused as the synchronous read refuses it. The facts of one tree are never joined to the seal of another.
 *
 * Every repository and the office are made here in the system's temporary folder.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { FINISHED_STATES } from '../src/config/finished.mjs'
import { STILL_GOING_STATES } from '../src/config/still-going.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aRepository, asAgent, git, theOfficesCheckers } from './a-seal-read-fixture.ts'
import { freshDb, type TestDb } from './helpers.ts'

const WHO = 'a-finisher-of-one-facts-read'

let t: TestDb
let app: FastifyInstance
let folder = ''
let made = 0
const logged: Record<string, unknown>[] = []
let sealing: typeof import('../src/server/lib/sealed-tip.ts')
let errors: typeof import('../src/server/lib/panel-error.ts')

beforeAll(async () => {
  folder = mkdtempSync(join(tmpdir(), 'mo-facts-once-'))
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  copyTheDefaultRegulationsOnce()
  const { buildApp } = await import('../src/server/index.ts')
  let partial = ''
  const logStream = {
    write(msg: string) {
      partial += msg
      for (let end = partial.indexOf('\n'); end !== -1; end = partial.indexOf('\n')) {
        const line = partial.slice(0, end)
        partial = partial.slice(end + 1)
        if (line.trim() !== '') logged.push(JSON.parse(line) as Record<string, unknown>)
      }
    },
  }
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream })).app
  await app.ready()
  sealing = await import('../src/server/lib/sealed-tip.ts')
  errors = await import('../src/server/lib/panel-error.ts')
  await theOfficesCheckers(app)
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: { handle: WHO, name: WHO, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(started.statusCode, started.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

/** A repository with one commit on main, and the branch `worker` checked out. */
function aTree(): string {
  made += 1
  const dir = aRepository(join(folder, `repository-${String(made)}`))
  git(dir, 'switch', '-qc', 'worker')
  return dir
}

/** The run's own commit on `worker`, made after the run was filed. */
function theRunsCommit(dir: string): void {
  writeFileSync(join(dir, 'work', 'mine.txt'), 'the run\'s own\n')
  git(dir, 'add', '-A')
  git(dir, 'commit', '-qm', 'The run\'s own commit')
}

/** A run of WHO's in `dir`, running, filed by the agent itself, so no reminder is given before its seal. */
async function aRunIn(dir: string): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(WHO),
    payload: { kind: 'session', title: 'A run whose finish is read', data: { state: STILL_GOING_STATES[0], servingAgent: WHO, doing: 'a finish under test', workingDirectory: dir, cutFrom: 'main' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/**
 * FINISH `id`, AND RUN `meanwhile` AS SOON AS THE THREAD'S FIRST ANSWER REACHES THE SERVER, before the pass that uses it:
 * the answer comes as the thread's 'message' event, and the pass waits on a promise that event resolves.
 */
async function finishWith(id: string, meanwhile: () => void = () => {}) {
  const emit = Worker.prototype.emit
  let answers = 0
  Worker.prototype.emit = function (this: Worker, event: string | symbol, ...args: unknown[]): boolean {
    const handed = emit.call(this, event, ...args)
    const finished = event === 'message' ? (args[0] as { outcome?: { finished?: unknown } }).outcome?.finished : undefined
    if (finished !== undefined && ++answers === 1) meanwhile()
    return handed
  }
  try {
    const mark = logged.length
    const reply = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asAgent(WHO), payload: { dataPatch: { state: FINISHED_STATES[0] }, remindBeforeTheSeal: false } })
    const lines = logged.slice(mark).filter((one) => 'finishParts' in one).map((one) => String(one['msg']))
    expect(lines, 'a finish logs one line of its parts').toHaveLength(1)
    const reads = [...(lines[0] ?? '').matchAll(/the git read apart after pass \d+, for (\d+) of the facts and (\d+) of the seal/g)].map((one) => [Number(one[1]), Number(one[2])])
    return { reply, reads, line: lines[0] ?? '' }
  } finally {
    Worker.prototype.emit = emit
  }
}

it('reads the facts once and then the seal alone, and seals what the synchronous read seals', async () => {
  const dir = aTree()
  const id = await aRunIn(dir)
  theRunsCommit(dir)
  const { reply, reads, line } = await finishWith(id)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reads, `the facts were read again with the seal: ${line}`).toEqual([[1, 0], [0, 1]])
  expect(JSON.stringify(sealing.readRunSeal(id)?.seal.git), 'the seal is not the one the synchronous read makes').toBe(JSON.stringify(sealing.theGitOfASeal(dir, null, 'main', ['work'])))
}, 60_000)

it('reads a tree edited between the facts and the seal whole again, and refuses it as the synchronous read does', async () => {
  const dir = aTree()
  const id = await aRunIn(dir)
  theRunsCommit(dir)
  const { reply, reads, line } = await finishWith(id, () => writeFileSync(join(dir, 'work', 'mine.txt'), 'edited after the facts were read\n'))
  expect(reply.statusCode, reply.body).toBe(409)
  let synchronous = ''
  try {
    sealing.theGitOfASeal(dir, null, 'main', ['work'])
  } catch (err) {
    expect(err).toBeInstanceOf(errors.PanelError)
    synchronous = (err as Error).message
  }
  expect(synchronous, 'the synchronous read sealed the edited tree, so there is no refusal to compare').not.toBe('')
  expect((reply.json() as { error: string }).error).toBe(synchronous)
  expect(reads, `the edited tree was not read whole again: ${line}`).toEqual([[1, 0], [0, 1], [1, 1]])
  expect(sealing.readRunSeal(id), 'the edited tree was sealed').toBeFalsy()
  expect((t.api.getRecord(id) as unknown as { data: Record<string, unknown> }).data['state']).toBe(STILL_GOING_STATES[0])
}, 60_000)
