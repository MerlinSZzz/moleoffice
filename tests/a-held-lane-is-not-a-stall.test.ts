// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A MERGE TOOL RUN THAT FINDS ITS LANE HELD BY ANOTHER ENTRY IS NOT A STALL. Wave 13k round 3, item 1 (problem
 * jaEGPrS3cVxe), under the secretary's choice (a) in message gHkP4Hd2wNnx.
 *
 * On 25 September 2026 at 16:33 four merge tool runs each pinned a submitted entry. The office judged each one
 * at once, because a release already covered it. Each run then went straight on to take the lane, which entry
 * ReXjVusUX4Ff held, met the office's 409, and exited 1, so the worker marked its session crashed. This file
 * runs the same sequence with the real tool, against the real app on a port of its own and a throwaway database.
 *
 * WHAT IS PROVED:
 *
 *   1. The tool, handed a submitted entry while another entry holds the lane, pins it, meets the 409 at the
 *      integrating step, and ends ok (exit 0, and its ending line says ok). Its words name the entry holding the
 *      lane. It reports no step after the refused one.
 *   2. The office counts no stall for that ending, says so in `stalls.says`, and keeps the entry judged with its
 *      mark. The worker's list leaves the entry off while the lane is held, and lists it once the lane is let go.
 *   3. Three more runs handed the judged entry while the lane is held each end the same way. After them the entry
 *      is still judged and not bounced, with no stall counted.
 *   4. THE CONTROL: a run that ends without moving its entry for any other reason is counted as before, both for a
 *      judged entry whose lane is free and for a submitted entry while the lane is held.
 *
 * Every fixture here is synthetic and says so: the git repositories are made under `.logs/` in this checkout and
 * removed after, the records are filed as fixtures, and nothing reaches the live server. Each tool process is
 * started in its own process group, waited for to its end, and any group still listed is killed after the file.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

import { gateNamed } from '../src/config/gates.mjs'
const MAX_TOOL_RUNS_IN_ONE_PLACE = Number(gateNamed('tool-runs-in-one-place').defaults.ordinary)
import { MERGE_TOOL_ENDING_LINE } from '../src/config/merge-tool.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
/** The stand-in for tools/sandbox.mjs that the merge tool's tests use. No sandbox is started here, since no run gets past the lane. */
const SANDBOX_TOOL = join(REPO, 'tests', 'stand-in-sandbox-tool.mjs')
const THE_WORKER = 'mole-office/the-message-worker'
const WORKSPACE = 'default'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asWorker = as('agent', 'lane-worker')
const asInspector = as('agent', 'lane-inspector')
const asTheOffice = as('agent', THE_WORKER)

let t: TestDb
let app: FastifyInstance
let api: string
let base: string
let main: string
let repository: string
let queue: typeof import('../src/server/lib/merge-queue.ts')
const groups = new Set<number>()

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const SYNTHETIC_AUTHOR = { GIT_AUTHOR_NAME: 'Synthetic', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A worker's clone of main with one commit on `work`, sealed as a finished run, and submitted. */
async function anEntry(name: string): Promise<{ id: string; run: string }> {
  const dir = join(base, `worker-${name}`)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', `${name}.txt`), `Synthetic change ${name}.\n`)
  git(dir, 'add', '-A')
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', `Synthetic submission ${name}`], { stdio: 'ignore', env: { ...withoutInheritedEffort(), ...SYNTHETIC_AUTHOR } })
  const run = t.api.createRecord({
    kind: 'session',
    title: `Synthetic run ${name}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'lane-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'lane-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: `work-${name}` } })
  expect(submitted.status, submitted.raw).toBe(201)
  return { id: String(submitted.body['entry'].id), run }
}

/** The inspector releases the run, through the real check doors, naming its seal, the seal's hash and its tip. */
async function release(run: string): Promise<void> {
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: String(t.api.getRecord(run)!.data['workingDirectory']), tip: seal.git.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Synthetic: read the changes and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
}

/** The sealed content of a run, as the pin step reports it. */
function contentOf(run: string): Record<string, string> {
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const files = (t.api.getRecord(sealId)!.data['seal'] as { git: { files: { path: string; hash: string }[] } }).git.files
  return Object.fromEntries(files.map((one) => [one.path, one.hash]))
}

/** An entry that holds the lane: submitted, released, pinned and in integrating, through the office's own doors. */
async function anEntryHoldingTheLane(name: string): Promise<string> {
  const holder = await anEntry(name)
  await release(holder.run)
  const pinned = await call('POST', `/api/merge-queue/${holder.id}/step`, asTheOffice, { step: 'pinned', facts: { files: contentOf(holder.run) } })
  expect(pinned.status, pinned.raw).toBe(200)
  expect(pinned.body['entry'].state).toBe('judged')
  const taken = await call('POST', `/api/merge-queue/${holder.id}/step`, asTheOffice, { step: 'integrating', facts: {} })
  expect(taken.status, taken.raw).toBe(200)
  expect(taken.body['entry'].state).toBe('integrating')
  return holder.id
}

function entry(id: string): Record<string, any> {
  return queue.readMergeEntry(t.api.getRecord(id)!) as unknown as Record<string, any>
}

const wantedByTheWorker = (): string[] => queue.theMergeToolWork(WORKSPACE).wanted.map((one) => one.id)

interface Ending { code: number | null; ending: { ok: boolean; says: string }; out: string; err: string }

/** The real tool, run as the worker runs it, in its own process group, waited for to its end. */
async function runTheTool(id: string): Promise<Ending> {
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
  const child = spawn(
    process.execPath,
    [TOOL, '--entry', id, '--session', session, '--api', api, '--workspace', WORKSPACE, '--workdir', join(base, 'work', id), '--office-for', '30', '--sandbox-tool', SANDBOX_TOOL, '--sandboxes', join(base, 'sandboxes')],
    { cwd: REPO, env: { ...withoutInheritedEffort(), MOLE_OFFICE_API: api }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const code = await new Promise<number | null>((resolve) => child.on('exit', resolve))
  groups.delete(child.pid!)
  // AND THE RUN'S SESSION ENDS, as the worker's next pass ends it (closeAMergeToolRun). While a run of the tool still
  // says running, the office offers its entry to no second run (problem JdaAnCvmgy-P).
  t.api.patchRecord(session, { dataPatch: { state: code === 0 ? 'finished' : 'crashed' } }, { type: 'agent', id: THE_WORKER })
  const line = out.split('\n').filter((one) => one.startsWith(MERGE_TOOL_ENDING_LINE)).at(-1)
  expect(line, out + err).toBeDefined()
  return { code, ending: JSON.parse(line!.slice(MERGE_TOOL_ENDING_LINE.length)) as Ending['ending'], out, err }
}

/** The steps the office accepted for an entry, read off its revisions: every state it moved into, in order. */
function statesOf(id: string): string[] {
  const rows = t.client.sqlite.prepare("SELECT json_extract(data, '$.state') AS state FROM revisions WHERE record_id = ? ORDER BY seq").all(id) as { state: string | null }[]
  return rows.map((row) => row.state).filter((state, i, all): state is string => state !== null && state !== all[i - 1])
}

beforeAll(async () => {
  t = await freshDb()
  mkdirSync(join(REPO, '.logs'), { recursive: true })
  base = realpathSync(mkdtempSync(join(REPO, '.logs', 'held-lane-')))
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  queue = await import('../src/server/lib/merge-queue.ts')
  const started = await call('POST', '/api/agents/started', asPerson, { handle: 'lane-worker', name: 'Synthetic lane-worker', workArea: ['src'] })
  expect(started.status, started.raw).toBe(201)
  const inspector = await call('POST', '/api/agents/started', asPerson, { handle: 'lane-inspector', name: 'Synthetic lane-inspector', role: 'inspector' })
  expect(inspector.status, inspector.raw).toBe(201)
  main = join(base, 'main')
  mkdirSync(join(main, 'src'), { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'src', 'a.txt'), 'Synthetic baseline.\n')
  git(main, 'add', '-A')
  execFileSync('git', ['-C', main, 'commit', '-q', '-m', 'Synthetic baseline'], { stdio: 'ignore', env: { ...withoutInheritedEffort(), ...SYNTHETIC_AUTHOR } })
  main = realpathSync(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-held-lane', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
}, 60_000)

/** FREE THE LANE AFTER EACH CASE, so a case that failed part way does not hold the lane against the next one. */
afterEach(async () => {
  const holder = queue.whoOccupies(main)
  if (holder !== null) await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Synthetic: the case is over; the lane is freed for the next one.' })
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await app?.close()
  t?.close()
  if (base !== undefined) rmSync(base, { recursive: true, force: true })
})

describe('a merge tool run that finds its lane held by another entry', () => {
  it('ends ok naming the holder, is not counted as a stall, and the entry waits judged for the lane', async () => {
    const holder = await anEntryHoldingTheLane('holder')
    // THE 16:33 SEQUENCE: submitted, with a release already covering it, so the pin judges it at once.
    const waiting = await anEntry('waiting')
    await release(waiting.run)
    expect(entry(waiting.id).state).toBe('submitted')
    // A SUBMITTED ENTRY IS HANDED TO THE TOOL WHATEVER HOLDS THE LANE, because pinning takes no lane.
    expect(wantedByTheWorker()).toContain(waiting.id)

    const first = await runTheTool(waiting.id)
    expect(first.code, first.out + first.err).toBe(0)
    expect(first.ending.ok).toBe(true)
    expect(first.ending.says).toContain(`is held by merge entry ${holder}, which is integrating, so the entry stays judged`)
    // NOTHING ELSE WAS REPORTED: the pin moved it, and the refused integrating step moved nothing.
    expect(statesOf(waiting.id)).toEqual(['submitted', 'pinned', 'judged'])
    const afterFirst = entry(waiting.id)
    expect(afterFirst.state).toBe('judged')
    // THE TOOL'S WORDS ARE ON THE ENTRY, which is what the worker compares to say finished rather than crashed.
    expect(afterFirst.tool).toMatchObject({ reason: first.ending.says, endedAt: expect.any(String) })
    expect(afterFirst.toolWanted).toEqual({ since: expect.any(String) })
    expect(afterFirst.machine.stalls).toMatchObject({ runs: 0 })
    expect(afterFirst.machine.stalls.says).toContain(`held by merge entry ${holder}`)
    expect(afterFirst.machine.stalls.says).toContain('did not count this run')
    expect(wantedByTheWorker()).not.toContain(waiting.id)

    // THREE MORE RUNS, each handed the judged entry itself, as a worker would be if the lane were taken between its
    // list and the tool's step. Each start takes the mark; each ending finds the lane held and writes the mark again.
    for (let run = 1; run <= MAX_TOOL_RUNS_IN_ONE_PLACE; run += 1) {
      const again = await runTheTool(waiting.id)
      expect(again.code, again.out + again.err).toBe(0)
      expect(again.ending.says).toContain(`is held by merge entry ${holder}`)
      const after = entry(waiting.id)
      expect(after.state, `after run ${String(run)}: ${JSON.stringify(after.machine.bounced ?? null)}`).toBe('judged')
      expect(after.machine.stalls).toMatchObject({ runs: 0 })
      expect(after.toolWanted).toEqual({ since: expect.any(String) })
      expect(wantedByTheWorker()).not.toContain(waiting.id)
    }
    expect(entry(waiting.id).machine.bounced).toBeUndefined()

    // THE LANE LET GO: the worker is handed the entry again, with its mark.
    const withdrawn = await call('POST', `/api/merge-queue/${holder}/withdraw`, asPerson, { because: 'Synthetic: the case lets the lane go.' })
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(wantedByTheWorker()).toContain(waiting.id)
    const done = await call('POST', `/api/merge-queue/${waiting.id}/withdraw`, asPerson, { because: 'Synthetic: the case is over.' })
    expect(done.status, done.raw).toBe(200)
  }, 120_000)

  it('still counts a run that ends without moving its entry for any other reason', async () => {
    const aToolRunThatEnds = async (id: string, reason: string): Promise<Record<string, any>> => {
      const session = t.api.createRecord({ kind: 'session', title: 'Synthetic merge tool run', workspaceId: WORKSPACE, actor: { type: 'agent', id: THE_WORKER }, origin: 'fixture', data: { state: 'running', runtime: 'merge-tool' } }).id
      expect((await call('POST', `/api/merge-queue/${id}/tool-started`, asTheOffice, { session, log: '/synthetic/the-merger.log' })).status).toBe(200)
      const ended = await call('POST', `/api/merge-queue/${id}/tool-ended`, asTheOffice, { session, reason })
      expect(ended.status, ended.raw).toBe(200)
      t.api.patchRecord(session, { dataPatch: { state: 'crashed' } }, { type: 'agent', id: THE_WORKER })
      return ended.body['entry']
    }
    // A JUDGED ENTRY WHOSE LANE IS FREE: its run could have taken the lane, so the ending counts.
    const free = await anEntry('free')
    await release(free.run)
    expect((await call('POST', `/api/merge-queue/${free.id}/step`, asTheOffice, { step: 'pinned', facts: { files: contentOf(free.run) } })).body['entry'].state).toBe('judged')
    expect((await aToolRunThatEnds(free.id, 'Synthetic: crashed while the lane was free.')).machine.stalls).toMatchObject({ runs: 1 })
    // A SUBMITTED ENTRY WHILE ANOTHER HOLDS THE LANE: the held lane is not what stopped a pin, so the ending counts.
    const holder = await anEntryHoldingTheLane('holder-two')
    const submitted = await anEntry('submitted')
    expect((await aToolRunThatEnds(submitted.id, 'Synthetic: crashed before the pin.')).machine.stalls).toMatchObject({ runs: 1 })
    expect(entry(submitted.id).state).toBe('submitted')
    for (const id of [holder, free.id, submitted.id]) {
      expect((await call('POST', `/api/merge-queue/${id}/withdraw`, asPerson, { because: 'Synthetic: the case is over.' })).status).toBe(200)
    }
  }, 120_000)
})
