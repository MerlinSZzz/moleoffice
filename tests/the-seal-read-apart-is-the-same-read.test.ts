// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S SEAL READ ON THE SEAL-READ THREAD IS THE READ THE REQUEST THREAD MAKES, BYTE FOR BYTE (item 2o of the
 * requirement list, criterion b).
 *
 * The check doors read a run's seal on a thread of their own (src/server/lib/the-seal-read-apart.ts), and use what came
 * back where they called `verifyRunSeal` before. Here each tree is read both ways, `verifyRunSeal` on this thread and
 * the thread's read handed to `theSealReadApartOrHere`, and the two answers or the two refusals must be the same JSON:
 * every field of the seal and of `readFrom`, and of a refusal its words, status, code and the rest. A git seal must have
 * been read on the thread, and a run with no git seal where it is used, or the case compares a read with itself.
 *
 * The thread's git keeps the guard of src/config/guarded-git.mjs: the repository of one case names a core.fsmonitor that
 * leaves a marker, and the thread's read must leave none, where git without the guard leaves it.
 *
 * And a read waiting when the thread ends is refused with 503 in the office's own words, never read on this thread
 * instead, and the next read starts a new thread.
 *
 * MUTATIONS (wave 13n round U), each after a control run, each put back:
 *   - one byte of the thread's answer changed in `theSealReadApartOrHere`: the answering cases go red.
 *   - the guard dropped from the office's git reader: the guard case goes red, by the marker.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { aGitThatWaits, aRepository, aSealedRun, asAgent, git, theOfficesCheckers, WORKSPACE, type AGitThatWaits } from './a-seal-read-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type TheReadApart = typeof import('../src/server/lib/the-seal-read-apart.ts')
type HowASealIsVerified = import('../src/server/lib/the-seal-read-apart.ts').HowASealIsVerified

let t: TestDb
let app: FastifyInstance
let scratch = ''
let repository = ''
let held: AGitThatWaits
let apart: TheReadApart
let verifyRunSeal: typeof import('../src/server/lib/sealed-tip.ts').verifyRunSeal

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-seal-read-apart-'))
  // FIRST ON PATH BEFORE THE THREAD STARTS, which copies this process's environment when it starts.
  held = aGitThatWaits(scratch)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // After `freshDb`, so these are the modules the app loaded, and a PanelError from one is a PanelError of the other.
  apart = await import('../src/server/lib/the-seal-read-apart.ts')
  ;({ verifyRunSeal } = await import('../src/server/lib/sealed-tip.ts'))
  await theOfficesCheckers(app)
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle: OF_RECORDS.id, name: 'A Worker Of Records', role: 'worker', workArea: ['work'] },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  repository = aRepository(join(scratch, 'repository'))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  held?.remove()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** An answer or a refusal as one string, with every field a door's reply could carry. */
function said(read: () => unknown): string {
  try {
    return JSON.stringify({ answered: read() })
  } catch (err) {
    if (!(err instanceof t.api.PanelError)) throw err
    const { message, status, detail, elsewhere, reason, code, values, recorded } = err
    return JSON.stringify({ refused: { message, status, detail, elsewhere, reason, code, values, recorded } })
  }
}

/** The seal of `run` read both ways, the request thread's first. */
async function bothWays(run: string, how: HowASealIsVerified): Promise<{ here: string; there: string; readOn: string }> {
  const here = said(() => verifyRunSeal(run, how))
  const read = await apart.theSealReadApart(run, how)
  return { here, there: said(() => apart.theSealReadApartOrHere(run, how, read)), readOn: read.readOn }
}

/** A worker of records, and a run of it that wrote one note, not finished and so not sealed. */
const OF_RECORDS = { type: 'agent' as const, id: 'a-worker-of-records' }
function aRunOfRecords(): string {
  const note = t.api.createRecord({ kind: 'note', title: 'The work of a run of records', workspaceId: WORKSPACE, actor: OF_RECORDS, origin: 'fixture', data: {} })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'A run of records',
    workspaceId: WORKSPACE,
    actor: OF_RECORDS,
    origin: 'fixture',
    data: { state: 'running', servingAgent: OF_RECORDS.id, submission: { kind: 'records', records: [note.id] } },
  }).id
  t.api.patchRecord(note.id, { summary: 'What this run wrote' }, { ...OF_RECORDS, sessionId: run })
  return run
}

describe("a run's seal read on its own thread is the read the request thread makes", () => {
  it('a worktree at its sealed commit, read in the worktree: the same seal', async () => {
    const { run } = await aSealedRun(app, repository, 'clean')
    const read = await bothWays(run, { underALaterCommit: true })
    expect(read.readOn).toBe('its own thread')
    expect(read.here).toMatch(/^\{"answered":\{"id":/u)
    expect(read.there).toBe(read.here)
  })

  it('the same seal read from its repository, as the verdict reads it: the same seal and the same readFrom', async () => {
    const { run } = await aSealedRun(app, repository, 'from-its-repository')
    const read = await bothWays(run, { fromItsRepository: true })
    expect(read.readOn).toBe('its own thread')
    expect(read.here).toContain('"readFrom":')
    expect(read.there).toBe(read.here)
  })

  it('a worktree that committed again after its seal: the seal read under the later commit, the same', async () => {
    const { run, directory } = await aSealedRun(app, repository, 'later')
    writeFileSync(join(directory, 'work', 'later.txt'), 'Changed in a commit after the seal.\n')
    git(directory, 'commit', '-qam', 'A commit after the seal')
    const read = await bothWays(run, { underALaterCommit: true })
    expect(read.readOn).toBe('its own thread')
    expect(read.here).toContain('"readFrom":')
    expect(read.there).toBe(read.here)
  })

  it('a sealed file changed in the worktree: the same refusal, word for word, status and all', async () => {
    const { run, directory, changed } = await aSealedRun(app, repository, 'changed')
    writeFileSync(join(directory, changed[0] ?? ''), 'Changed after the seal, and not committed.\n')
    const read = await bothWays(run, { underALaterCommit: true })
    expect(read.readOn).toBe('its own thread')
    expect(read.here).toMatch(/^\{"refused":\{"message":"Sealed file work\/changed\.txt differs from seal .*"status":409/u)
    expect(read.there).toBe(read.here)
  })

  it('a run with no seal: nothing, read where it is used', async () => {
    const run = aRunOfRecords()
    const read = await bothWays(run, { underALaterCommit: true })
    expect(read.readOn).toBe('where it is used')
    expect(read.here).toBe('{"answered":null}')
    expect(read.there).toBe(read.here)
  })

  it('a seal of records, which starts no git: read where it is used, the same', async () => {
    const run = aRunOfRecords()
    const finished = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(OF_RECORDS.id), payload: { dataPatch: { state: 'finished' } } })
    expect(finished.statusCode, finished.body).toBe(200)
    const read = await bothWays(run, { underALaterCommit: true })
    expect(read.readOn).toBe('where it is used')
    expect(read.here).toMatch(/^\{"answered":\{"id":.*"kind":"records"/u)
    expect(read.there).toBe(read.here)
  })

  it("the thread's git keeps the guard: a core.fsmonitor the repository names does not run", async () => {
    const guarded = aRepository(join(scratch, 'guarded'))
    const { run, directory } = await aSealedRun(app, guarded, 'guarded')
    const marker = join(scratch, 'the-fsmonitor-ran')
    const monitor = join(scratch, 'a-fsmonitor')
    writeFileSync(monitor, `#!/bin/sh\ntouch '${marker}'\nexit 1\n`, { mode: 0o755 })
    git(guarded, 'config', 'core.fsmonitor', monitor)
    const read = await apart.theSealReadApart(run, { underALaterCommit: true })
    expect(read.readOn).toBe('its own thread')
    expect(read.readOn === 'its own thread' && 'verified' in read.outcome, JSON.stringify(read)).toBe(true)
    expect(existsSync(marker), "the thread's git ran the repository's fsmonitor").toBe(false)
    // THE CONTROL: the same listing without the guard runs it, so the marker above could have appeared.
    execFileSync('git', ['-C', directory, 'ls-files', '--others'], { stdio: 'ignore' })
    expect(existsSync(marker), 'git without the guard did not run the fsmonitor, so the case above proves nothing').toBe(true)
  })

  it('a read waiting when the thread ends is refused with 503 in its own words, and the next read starts a new thread', async () => {
    const { run } = await aSealedRun(app, repository, 'ended')
    held.holdAt('ls-files')
    const waiting = apart.theSealReadApart(run, { underALaterCommit: true }).then(
      () => 'read',
      (err: unknown) => err,
    )
    await held.reached()
    await apart.endTheSealReadThread()
    held.letGo()
    const refused = await waiting
    expect(refused).toBeInstanceOf(t.api.PanelError)
    expect((refused as InstanceType<typeof t.api.PanelError>).status).toBe(503)
    expect((refused as Error).message).toBe(
      "The office reads a run's seal again on a thread of its own, so that it answers other requests meanwhile, and the server closed before the thread answered. " +
        `So the seal of run ${run} was not read, and nothing was written. It is not read on the request thread instead. Ask again: the next read starts a new thread.`,
    )
    const again = await bothWays(run, { underALaterCommit: true })
    expect(again.readOn).toBe('its own thread')
    expect(again.there).toBe(again.here)
  })
})
