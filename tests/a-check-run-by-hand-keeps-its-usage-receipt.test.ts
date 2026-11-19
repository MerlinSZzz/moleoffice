// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A CHECK RUN BY HAND KEEPS ITS USAGE RECEIPT, AGAINST THE REAL SERVER.
 *
 * Criterion U3: every check writes on its record the tokens its model spent. Problem Ev1f_CZ6roye,
 * and the secretary's answer vFGUngaLB98_ of 25 September 2026. Since 22 September checks have been run by
 * hand: `node tools/the-inspector.mjs ... --check <session>`, with a session record somebody filed
 * for the check. No worker reads that tool's output, so nothing stored the receipt. The tool now
 * stores it itself on the check's own session record, when that session was not filed by the
 * office's worker (the worker's runtime word is `inspection-tool`, and the worker stores it then).
 *
 * WHY THE REAL SERVER. A stand-in office proves the tool sends the PATCH, and
 * tests/an-inspector-that-changed-the-work-has-its-check-thrown-away.test.ts does that. Only the real
 * door can say it takes the PATCH from the inspector, on a session somebody else filed, and that the
 * PATCH does not stop the verdict being posted. The only stand-in is `claude`, a shell script this
 * file writes, labelled as a stand-in in its own first line. No model runs.
 *
 * THE MUTATION. Control first: both cases green. Then `theUsageIsKept` in tools/the-inspector.mjs
 * sends no PATCH, and both cases go red: the session has no `usageReceipt`. Restored, both green.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { theInspectorsRowNames } from './inspector-tool-fixture.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { claudeUsage } from '../src/config/usage.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** A Claude Code envelope from a run that spent tokens. Made up by this test; no model ran. */
const SPENT = {
  type: 'result',
  duration_ms: 225050,
  num_turns: 30,
  session_id: '33333333-3333-3333-3333-333333333333',
  total_cost_usd: 0.67,
  usage: { input_tokens: 22, cache_creation_input_tokens: 91900, cache_read_input_tokens: 1052191, output_tokens: 9457 },
  modelUsage: { 'claude-sonnet-5': {} },
}

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''
let worktrees = ''
let bin = ''
let workers = 0

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function file(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** A worker of its own and a finished run, as tests/a-whole-check-reaches-its-verdict.test.ts makes them. */
async function aFinishedRun(): Promise<string> {
  workers += 1
  const handle = `the-worker-${String(workers)}`
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: `The Worker ${String(workers)}`, role: 'worker', workArea: ['work'] })
  return file(asAgent(handle), {
    kind: 'session',
    title: 'A run checked by hand',
    data: { state: 'finished', servingAgent: handle, workingDirectory: checkout, doing: 'the work under check', cutFrom: 'main' },
  })
}

/** The check's own session, filed the way a check run by hand is filed: a Claude Code session. */
function aSessionForTheCheck(run: string): Promise<string> {
  return file(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    kind: 'session',
    title: `Check of run ${run}, run by hand. Filed by a test.`,
    data: { state: 'running', runtime: 'claude-code', servingAgent: 'inspector-one', workingDirectory: REPO, doing: 'checking a run, by hand' },
  })
}

/** Put a `claude` on PATH that prints the envelope and exits with the code given. */
function standInClaude(envelope: Record<string, unknown>, code: number): void {
  writeFileSync(join(bin, 'envelope.json'), JSON.stringify(envelope))
  const script = join(bin, 'claude')
  writeFileSync(script, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\ncat >/dev/null; cat "${bin}/envelope.json"; exit ${String(code)}\n`)
  chmodSync(script, 0o755)
}

function inspect(run: string, check: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [INSPECTOR, '--run', run, '--check', check, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--model', 'none', '--on-the-host'],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_CHECK_WORKTREES: worktrees, PATH: `${bin}:${process.env.PATH ?? ''}` }, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

async function receiptOn(session: string): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${session}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { record: { data: Record<string, unknown> } }).record.data['usageReceipt']
}

/** The receipt the worker would build from the tool's line: the envelope without its answer. */
function theReceiptFor(envelope: Record<string, unknown>): unknown {
  const { result: _answer, ...usageOnly } = envelope
  return JSON.parse(JSON.stringify(claudeUsage(JSON.stringify(usageOnly))))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  giveFixtureSeats(app)
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names the model --model names below, none, with native
  // data, so the check starts from the row's selection and not from the compatibility list, which names no such model.
  await theInspectorsRowNames(app, 'none', AS_THE_PERSON)

  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-hand-run-check-'))
  worktrees = mkdtempSync(join(tmpdir(), 'mole-office-check-worktrees-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\nAnd what the worker built.\n')
  git('commit', '-qam', 'The work under check')
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(checkout, { recursive: true, force: true })
  rmSync(worktrees, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

describe('a check run by hand', () => {
  it('keeps the receipt of a model that ran out of turns, though the check wrote no verdict', async () => {
    const run = await aFinishedRun()
    const session = await aSessionForTheCheck(run)
    const envelope = { ...SPENT, subtype: 'error_max_turns', is_error: true }
    standInClaude(envelope, 1)
    const ran = await inspect(run, session)
    expect(ran.code, ran.err).toBe(1)
    expect(ran.err).toContain('The check did not finish, so no verdict was written: claude exited 1.')
    expect(await receiptOn(session)).toEqual(theReceiptFor(envelope))
  })

  it('keeps the receipt of a check that reached its verdict, and the verdict is still posted', async () => {
    const run = await aFinishedRun()
    const session = await aSessionForTheCheck(run)
    const verdict = { verdict: 'released', traced: syntheticTrace(t, ['work/the-work.txt']), check: 'A check this test made up. No model ran.', chaptersRead: [] }
    const envelope = { ...SPENT, subtype: 'success', is_error: false, result: JSON.stringify(verdict) }
    standInClaude(envelope, 0)
    const ran = await inspect(run, session)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('The check answered: released.')
    expect(await receiptOn(session)).toEqual(theReceiptFor(envelope))
  })
})
