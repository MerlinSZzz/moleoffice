// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HOST JOB RUNNER THE LEDGER CANNOT FILE IS STOPPED, so the office leaves no runner of its own off the ledger.
 *
 * Inspector's refusal of wave 13q round 59 (run JeTdiFUhgyr7), its second point. When the office's runner could not be
 * filed in the ledger, the office said so and left the runner running. The ledger is what a person tidying up reads, so
 * a process the office started and the ledger does not hold could not be found from it. Now the office asks the
 * runner's group to stop at once, by the group it recorded at the start, and says why.
 *
 * The office here answers through `inject`, inside the test process, on a database in this test's own folder. The
 * keeper is given a session row that does not exist, so the ledger refuses every row, and a stand-in for the OS
 * layer's start, which starts `sleep` in a group of its own. The tool registered is a stand-in that never runs.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Each runner the ledger refuses is asked to stop, and its group is gone within seconds. The words name its
 *      process and say that it could not be filed and was asked to stop. The office starts another, up to its bound,
 *      and no runner of this office is left running or filed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - the stop taken out of the keeper's refused registration: case 1 goes red (the first runner keeps running).
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { theSha256Of } from '../src/config/host-tools.mjs'
import { AT_MOST_STARTS } from '../src/server/lib/host-job-runner-bounds.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** A session row id that no record has, so the ledger refuses the runner's row. */
const NO_SUCH_SESSION = 'no-such-sessn'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

type HowItEnded = { code: number | null; signal: string | null; error: string | null }

let t: TestDb
let app: FastifyInstance
let secretarysKey = ''
const started: number[] = []
const said: string[] = []

async function send(path: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; body: any; text: string }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as Record<string, unknown> })
  return { status: reply.statusCode, body: reply.json(), text: reply.body }
}

/** Is any process of this group still there? */
function aGroupIsThere(pgid: number): boolean {
  try {
    process.kill(-pgid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
}

async function until<T>(what: string, read: () => T, done: (value: T) => boolean, ms: number): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const value = read()
    if (done(value)) return value
    if (Date.now() > end) throw new Error(`${what}: not within ${String(ms)} ms. Last seen: ${JSON.stringify(value)}. Said:\n${said.join('\n')}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** The OS layer's start, stood in: `sleep` in a group of its own, as the runner is started in one. */
function aStandInRunner(): { pid: number; pgid: number; ended: Promise<HowItEnded> } {
  const child = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' })
  const ended = new Promise<HowItEnded>((done) => {
    child.once('error', (error) => done({ code: null, signal: null, error: error.message }))
    child.once('exit', (code, signal) => done({ code, signal, error: null }))
  })
  if (child.pid === undefined) throw new Error('The stand-in runner was given no pid.')
  child.unref()
  started.push(child.pid)
  return { pid: child.pid, pgid: child.pid, ended }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const scratch = aTestDatabaseFolder('host-job-runner-unfiled')
  mkdirSync(join(scratch, 'bin'))
  // MODE 755 WHATEVER THE UMASK, since a program in a folder others may write is refused.
  chmodSync(join(scratch, 'bin'), 0o755)
  mkdirSync(join(scratch, 'work'))
  const path = join(scratch, 'bin', 'never-run')
  writeFileSync(path, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  chmodSync(path, 0o755)
  app = (await apiApp()).app
  await app.ready()

  const asker = await send('/api/agents/started', AS_THE_PERSON, { handle: 'a-lab-worker', name: 'a-lab-worker', role: 'worker', runtime: 'claude-code' })
  expect(asker.status, asker.text.slice(0, 300)).toBe(201)
  const secretary = await send('/api/agents/started', AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.handle, role: 'secretary', runtime: 'claude-code' })
  expect(secretary.status, secretary.text.slice(0, 300)).toBe(201)
  secretarysKey = String(secretary.body.whatToGiveIt?.key ?? '')
  const words = await send('/api/records', AS_THE_PERSON, { kind: 'note', title: 'What the person said about host tools', data: { body: 'the office registers a stand-in host tool' } })
  expect(words.status, words.text.slice(0, 300)).toBe(201)
  const decided = await send('/api/records', AS_THE_PERSON, {
    kind: 'decision',
    title: 'The office registers a stand-in host tool',
    data: {
      ...governsTheWholeProject(),
      replaces: [], option_taken: 'register the stand-in', because: 'this test office needs one tool, so that a runner is started', decided_by: THE_OWNER, authority: 'the owner said so', authority_reference: words.body.record.id },
  })
  expect(decided.status, decided.text.slice(0, 300)).toBe(201)
  const registered = await send(
    '/api/host-tools',
    { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle, 'x-mole-office-key': secretarysKey },
    {
      declaration: {
        name: 'never-run',
        what: 'a stand-in for this test only, registered so that the office starts a runner, and never run',
        program: { path, sha256: theSha256Of(path) },
        argv: [],
        arguments: {},
        folder: join(scratch, 'work'),
        timeLimitSeconds: 20,
        outputs: [],
        logLines: 20,
        mayAsk: { agents: [asker.body.agent.id] },
      },
      decision: decided.body.record.id,
    },
  )
  expect(registered.status, registered.text.slice(0, 500)).toBe(201)
}, 60_000)

afterAll(async () => {
  for (const pgid of started) {
    if (aGroupIsThere(pgid)) process.kill(-pgid, 'SIGKILL')
  }
  await app?.close()
  t?.close()
})

it('1: each runner the ledger refuses is asked to stop, its group is gone, and the office starts the next up to its bound', async () => {
  // AFTER freshDb, so the keeper writes to this test's database.
  const { keepTheHostJobRunner, whatTheHostJobRunnerIs, notFiledSoAskedToStop } = await import('../src/server/lib/host-job-runner.ts')
  // NOT UNDER A TEST RUNNER for the keeper's first look only, which it makes before it returns. It starts none under one.
  const before = { VITEST: process.env['VITEST'], VITEST_WORKER_ID: process.env['VITEST_WORKER_ID'] }
  delete process.env['VITEST']
  delete process.env['VITEST_WORKER_ID']
  let keeper: Awaited<ReturnType<typeof keepTheHostJobRunner>>
  try {
    keeper = keepTheHostJobRunner({
      workspaceId: 'default',
      sessionRecordId: NO_SUCH_SESSION,
      api: 'http://127.0.0.1:9',
      checkout: REPO,
      say: (line) => said.push(line),
      probe: { platform: 'linux', startTheHostJobRunner: aStandInRunner },
      lookMs: 600_000,
    })
  } finally {
    for (const [name, value] of Object.entries(before)) if (value !== undefined) process.env[name] = value
  }
  await until('Each start the bound allows, each group gone', () => started.map((pgid) => [pgid, aGroupIsThere(pgid)]), (all) => all.length === AT_MOST_STARTS && all.every(([, there]) => there === false), 15_000)
  await keeper.stop()
  expect(started.length, said.join('\n')).toBe(AT_MOST_STARTS)
  for (const pid of started) {
    expect(said.filter((line) => line.includes(notFiledSoAskedToStop(pid, pid))), said.join('\n')).toHaveLength(1)
  }
  expect(whatTheHostJobRunnerIs().running).toBe(false)
  expect(t.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'process' AND key IN (" + started.map(() => '?').join(', ') + ')').get(...started.map(String))).toEqual({ n: 0 })
}, 30_000)
