// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { giveFixtureSeats } from './inspector-tool-fixture.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/** Eligibility fixture update: old sessions omitted their submitted checkout. Eligible fixtures now record the test checkout as workingDirectory. */
/** Fixture update: the meddling inspector edits a note the worker filed, as a run's record is changed only by those who hold the run; the refusal it proves is unchanged. */
/**
 * A WHOLE CHECK, FROM THE TOOL TO THE VERDICT, AGAINST THE REAL SERVER.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, AND IT WAS FOUND BY THE INSPECTOR ON THIS BRANCH
 * ---------------------------------------------------------------------------------------
 *
 * Problem `c5t2eEAGjQjy`. `tools/the-inspector.mjs` keeps what one assembly measured, through
 * `POST /api/checks/<run>/assembled`, before every check. That door patches the run's record. Under
 * the caller's name it left an UPDATE row by the inspector on a record the WORKER had created —
 * which is exactly what `whatTheInspectorChanged` looks for — so the one act,
 * `POST /api/checks/<run>`, then refused with 403 and named the inspector as having changed the
 * work it was checking. Every check the office started would have been unpostable, and the first
 * real one was.
 *
 * THE GUARD WAS NOT WEAKENED TO FIX IT. Criterion C22 is that an inspector which fixes what it
 * found is no longer checking it, and a guard with an exception carved in for one field is a guard
 * somebody carves a second hole in. What was wrong was the attribution: what the office keeps ABOUT
 * a run is not anybody's edit OF it, so the office writes it, under
 * `mole-office/the-api-server`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE RUNS EVERYTHING FOR REAL
 * ---------------------------------------------------------------------------------------
 *
 * The 403 came from the server's own guard reading its own change ledger. A stand-in office cannot
 * produce it, and the two files that already run the tool either stop at `--dry` or answer with a
 * fake office. So this one runs the real tool against the real server on a port of its own, over a
 * real git checkout, and reads the status of the one act. The only stand-in is `claude`, which is a
 * shell script written here, LABELLED as a stand-in in its own first line, that prints a verdict.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Write the assembled field under the caller's name instead of the office's — `actor` in place
 *     of `THE_OFFICE` in `rememberWhatTheCheckWouldRead` — and the first case goes red with the
 *     403 this file exists for.
 *   - The same for `rememberTheCheck`, and the same case goes red once the office has started a
 *     check for the run.
 *   - Take `whatTheInspectorChanged` out of the answer path, and the last case goes red: an
 *     inspector that really did edit the worker's record is then released.
 *   - Stop the tool sending `read` with the assembly, and the case about C30's record goes red.
 *   - Stop `releaseOrRefuse` putting it on the release, and the same case goes red — one case, and
 *     it was three while the code was wrong. That is worth writing down. The first draft wrote
 *     `read: null` onto a release where the check had not said, and the session shape declares that
 *     field optional and refuses a null outright, so EVERY release broke and
 *     tests/an-inspector-releases-or-refuses-in-one-act.test.ts is what said so. A release now omits
 *     the key where there is nothing to say, and `readRelease` still answers null to a reader.
 *   - Take `aWorktreeOfItsOwn()` out and the case goes red the other way: the record then honestly
 *     says the check read the worker's own tree, which is what C30 forbids.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { aMadeUpCheckSession, theInspectorsRowNames } from './inspector-tool-fixture.ts'

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

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''
/**
 * WHERE THE TOOL CUTS ITS CHECK WORKTREE FOR THIS TEST. Told through MOLE_OFFICE_CHECK_WORKTREES, as
 * tests/a-check-runs-in-a-worktree-of-its-own.test.ts tells it, and removed with the repository. Left
 * untold, the real tool cut its worktree under the SHARED folder, and once this test had deleted the
 * repository it was cut from, git could neither deregister nor remove it: two piled up on every run
 * of these two files, silently, because the uuid in the name defeats the tool's collision stop.
 * Problem ZsaOzNfR4leZ, 9 September 2026; measured at two leftovers per run before this line.
 */
let worktrees = ''
let bin = ''
/** The registry id Inspector One was given. A release stores who gave it by this id. */
let inspectorId = ''

/** Register an agent, and answer the registry id it was given. That id is not its handle. */
async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/**
 * A WORKER OF ITS OWN, AND A FINISHED RUN IT FILED FOR ITSELF.
 *
 * ONE WORKER PER CASE. It was written that way on 7 September because it had to be: releasing a run
 * patched that run's record as the INSPECTOR, and `whatTheInspectorChanged` asks whether the
 * inspector has changed any record this worker created, so a second check of the same worker was
 * refused by the release it had itself been given. This file's own note called that "a fact about
 * the guard rather than tidiness", and it was wrong: it was problem `Ugp91kRzNJbd`, and the fix is
 * that the verdict fields are the office's bookkeeping and are written as the office.
 *
 * SO ONE WORKER PER CASE IS NOW ONLY TIDINESS, and it is kept for that: each case below says what
 * it means without depending on what the case above did.
 * `tests/a-second-check-is-not-refused-by-the-first.test.ts` is what holds the fix.
 */
let workers = 0
async function aWorkerWithAFinishedRun(title: string): Promise<{ handle: string; run: string }> {
  workers += 1
  const handle = `the-worker-${String(workers)}`
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: `The Worker ${String(workers)}`, role: 'worker', workArea: ['work'] })
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: checkout, doing: 'the work under check', cutFrom: 'main' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return { handle, run: (reply.json() as { record: { id: string } }).record.id }
}

/** Put a `claude` on PATH that prints what the body says and nothing else. */
function standInClaude(body: string): void {
  const file = join(bin, 'claude')
  writeFileSync(file, `#!/bin/sh\n# A STAND-IN FOR THE claude COMMAND, written by a test. It runs no model.\n${body}\n`)
  chmodSync(file, 0o755)
}

/** A verdict envelope shaped the way the real runtime hands one back. */
function printsAVerdict(verdict: 'released' | 'refused'): string {
  const answer =
    verdict === 'released'
      ? { verdict: 'released', traced: syntheticTrace(t, ['work/the-work.txt']), check: 'Read the brief, the chapters and the changes. Nothing is missing.', chaptersRead: [] }
      : {
          verdict: 'refused',
          check: 'Read the brief and the changes.',
          missing: [{ what: 'a test for the thing it built', kind: 'data' }],
          says: { chapter: 5 },
          chaptersRead: [],
        }
  const envelope = JSON.stringify({ result: JSON.stringify(answer) }).replace(/'/gu, "'\\''")
  return `cat >/dev/null; printf '%s' '${envelope}'`
}

function inspect(run: string, flags: string[] = []): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      // THE STAND-IN claude IS ON THIS MACHINE'S PATH, so the model is run here: --on-the-host. The sandbox
      // path is tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts.
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--model', 'none', '--on-the-host', '--check', aMadeUpCheckSession(), ...flags],
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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  giveFixtureSeats(app)
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  bin = mkdtempSync(join(tmpdir(), 'mole-office-a-stand-in-claude-'))
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  inspectorId = await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  // THE OFFICE IS ONE OF THIS BRANCH: the inspector's Casting row names the model --model names below, none, with native
  // data, so the check starts from the row's selection and not from the compatibility list, which names no such model.
  await theInspectorsRowNames(app, 'none', AS_THE_PERSON)

  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-whole-check-'))
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

describe('a whole check', () => {
  it('reaches its verdict: the assembly is kept AND the one act is accepted', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run checked from end to end')
    standInClaude(printsAVerdict('released'))
    const ran = await inspect(run)

    // THE 403 THIS FILE EXISTS FOR would land here, in the tool's own error channel.
    expect(ran.err).not.toContain('403')
    expect(ran.err).not.toContain('changed a record')
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('The check answered: released.')

    // AND BOTH HALVES REALLY HAPPENED: the assembly was kept, and the run was released.
    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const said = read.json() as {
      whatTheCheckWouldRead: { bytes: number; inside: string[] } | null
      stands: { released: { by: { id: string } } | null; unreleasedFinish: boolean }
    }
    expect(said.whatTheCheckWouldRead?.inside).toEqual(['work/the-work.txt'])
    expect(said.stands.unreleasedFinish).toBe(false)
    expect(said.stands.released?.by.id).toBe(inspectorId)
  })

  it('keeps the assembly under the office and not under the inspector, which is why the act passes', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose change ledger is read')
    standInClaude(printsAVerdict('released'))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)

    const changes = await app.inject({ method: 'GET', url: `/api/records/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(changes.statusCode, changes.body).toBe(200)
    const rows = (changes.json() as { changes: { op: string; actorId: string; field: string | null }[] }).changes
    // A change row names the field by its STORED PATH, which is `data.<key>`.
    const kept = rows.filter((one) => one.op !== 'create' && one.field === 'data.whatTheCheckWouldRead')
    expect(kept.length, 'the assembly left no change row at all').toBeGreaterThan(0)
    for (const row of kept) expect(row.actorId).toBe('mole-office/the-api-server')
    // AND NOT ONE UPDATE ROW ON THIS RUN IS THE INSPECTOR'S — except the release itself, which is
    // written after the guard has read the ledger and is the inspector's by design.
    expect(
      rows.filter((one) => one.op !== 'create' && one.actorId === 'inspector-one' && one.field !== 'data.released'),
    ).toEqual([])
  })

  it('says on the record which worktree and which tip it read, in both writes', async () => {
    const { run } = await aWorkerWithAFinishedRun('A run whose check says where it read')
    standInClaude(printsAVerdict('released'))
    const ran = await inspect(run)
    expect(ran.code, ran.err).toBe(0)

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const said = read.json() as {
      whatTheCheckWouldRead: { read?: { worktree: string; tip?: string; ofItsOwn: boolean; says: string } } | null
      stands: { released: { read: { worktree: string; tip: string | null; ofItsOwn: boolean } | null } | null }
    }

    // CRITERION C30 asks for both, on the record. The ASSEMBLY write carries it...
    const onTheRun = said.whatTheCheckWouldRead?.read
    expect(onTheRun, 'the assembly said nothing about which tree it read').not.toBe(undefined)
    expect(onTheRun?.ofItsOwn).toBe(true)
    expect(onTheRun?.worktree).toContain('a-check-of-')
    expect(onTheRun?.tip).toMatch(/^[0-9a-f]{40}$/u)

    // ...and so does the VERDICT write, so the release itself can be read back a year later.
    const onTheRelease = said.stands.released?.read
    expect(onTheRelease, 'the release said nothing about which tree the check read').not.toBe(null)
    expect(onTheRelease?.ofItsOwn).toBe(true)
    expect(onTheRelease?.worktree).toBe(onTheRun?.worktree)
    expect(onTheRelease?.tip).toBe(onTheRun?.tip)

    // AND IT IS THE TREE THE CHECK READ, not the worker's, which is the point of saying it at all.
    expect(onTheRelease?.worktree).not.toBe(checkout)
  })

  it('still refuses the act when the inspector really did change the worker\'s record', async () => {
    const { handle, run } = await aWorkerWithAFinishedRun('A run whose inspector edited it')
    // A note the worker files in its work. The inspector does not hold the run, so it may not change the run's own
    // record, and the record of the worker's it edits below is this one.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent(handle),
      payload: { kind: 'note', title: 'A note the worker wrote in its work', data: { body: 'what the worker wrote' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const note = (filed.json() as { record: { id: string } }).record.id
    // The edit happens inside the model stand-in, after the tool recorded this assembly.
    standInClaude(
      `curl --fail --silent -X PATCH '${api}/api/records/${note}' ` +
      `-H 'content-type: application/json' -H 'x-mole-office-workspace: default' ` +
      `-H 'x-mole-office-actor-type: agent' -H 'x-mole-office-actor-id: inspector-one' ` +
      `--data '{"dataPatch":{"body":"the inspector rewrote what the worker wrote"}}' >/dev/null || exit 1\n` +
      printsAVerdict('released'),
    )
    const ran = await inspect(run)
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('403')

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect((read.json() as { stands: { unreleasedFinish: boolean } }).stands.unreleasedFinish).toBe(true)
  })
})
