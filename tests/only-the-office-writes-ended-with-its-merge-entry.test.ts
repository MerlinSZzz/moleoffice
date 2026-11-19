// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * ONLY THE OFFICE WRITES endedWithItsMergeEntry. The record door refuses it from every caller.
 *
 * Problem bYQqQZ-InXVt. A session record whose data holds `endedWithItsMergeEntry` stands closed in `howARunStands`,
 * and its page says the merge queue's check again refused it and the office ended it with its merge entry. The office
 * writes the field in one place: `testOrBounce` in src/server/lib/merge-state-machine.ts, through `patchRecord` as the
 * office, in the same transaction as the refused bounce of the entry. Before this, POST and PATCH /api/records did not
 * refuse the field, so an agent could write it on its own refused run, and the run read closed with a sentence saying
 * the office ended it. Wave 12a closed the same gap for `needsNoCheck` (report cV--Szpgg3Ju), and this follows it.
 *
 * WHAT IS PROVED HERE, against a real database, the real merge queue doors and the real checks door:
 *   1. A create whose data carries the field is refused, from an agent and from the person, and files nothing.
 *   2. A dataPatch carrying it on an agent's own refused run is refused, from the agent and from the person, and the
 *      run reads exactly as before.
 *   3. A whole `data` that adds, changes or drops it is refused. One that carries the stored value back unchanged is
 *      not refused by this rule.
 *   4. The office's own path still writes it: a check again that refuses bounces the entry, and the run stands closed
 *      with the office's sentence.
 *
 * MUTATION PROOFS, each run alone after a control, recorded in the commit message:
 *   - the dataPatch refusal taken out of PATCH /api/records/:id: case 2 goes red, the agent's write answers 200 and
 *     the run reads closed;
 *   - the create refusal taken out of POST /api/records: case 1 goes red;
 *   - the whole-data refusal taken out of PATCH /api/records/:id: case 3 goes red.
 *
 * Every fixture here is synthetic: the git folders are made under `.logs/` in this checkout and removed after, and
 * nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { ABSENT } from '../src/shared/merge-queue.ts'
import { ENDED_WITH_ITS_MERGE_ENTRY, endedWithItsMergeEntrySays, howARunStands, readEndedWithItsMergeEntry } from '../src/shared/releasing.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []

const WORKSPACE = 'default'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asInspector = as('agent', 'eo-inspector')
const asSupervisor = as('agent', 'eo-supervisor')
const asWorker = as('agent', 'eo-worker')
const asTheOffice = as('agent', 'mole-office/the-message-worker')

const A = 'work/a.txt'
const B = 'work/b.txt'

/** The refusal the record door answers to any caller that writes endedWithItsMergeEntry. */
const ONLY_THE_OFFICE =
  "The office writes endedWithItsMergeEntry on a merge entry's check-again run when that check refuses and the entry bounces. Nothing was written."

/** An ending as somebody who is not the office would write it. */
const AN_ENDING = {
  entry: 'synthetic-entry',
  at: '2026-09-25 09:00:00',
  because: 'Synthetic: written by somebody who is not the office.',
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory inside this checkout's `.logs/`, removed after the file. */
function scratch(prefix: string): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', `ended-with-entry-${prefix}-`))
  made.push(dir)
  return dir
}

/** A synthetic tree: main holds two files; the branch `work` changes both. */
function tree(): string {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic ended-with-entry fixture')
  mkdirSync(join(dir, 'work'), { recursive: true })
  for (const path of [A, B]) writeFileSync(join(dir, path), `${path} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  for (const path of [A, B]) writeFileSync(join(dir, path), `${path} before.\n${path} submitted.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic submission')
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

interface Seal { id: string; hash: string; commit: string; forkBase: string; files: { path: string; hash: string | null }[] }

function theSealOf(run: string): Seal {
  const id = t.api.getRecord(run)!.data['sealedTip'] as string
  const seal = t.api.getRecord(id)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: Seal['files'] } }
  return { id, hash: seal.hash, commit: seal.git.commit, forkBase: seal.git.forkBase, files: seal.git.files }
}

function contentOf(seal: Seal): Record<string, string> {
  return Object.fromEntries(seal.files.map((one) => [one.path, one.hash ?? ABSENT]))
}

/** A finished run of the worker in its own tree, sealed at the tree's tip. */
async function aSealedRun(): Promise<{ run: string; dir: string; seal: Seal }> {
  const dir = tree()
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic ended-with-entry run',
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'eo-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'eo-worker', cutFrom: 'main', workingDirectory: dir },
  }).id
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  return { run, dir, seal: theSealOf(run) }
}

/** A verdict on a run through the real checks door: the assembly first, then the verdict. */
async function verdict(run: string, body: Record<string, unknown>, read: Record<string, unknown> = {}) {
  const seal = theSealOf(run)
  const worktree = String(t.api.getRecord(run)!.data['workingDirectory'])
  const whatWasRead = { sealId: seal.id, sealHash: seal.hash, worktree, tip: seal.commit, ofItsOwn: true, says: 'Synthetic: a check of its own detached tree.', ...read }
  const only = read['only'] as string[] | undefined
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.forkBase, how: 'fork point', says: 'Synthetic: the fixed fork base of the seal.' },
    read: whatWasRead,
    ...(only === undefined ? {} : { only }),
  })
  expect(assembled.status, assembled.raw).toBe(201)
  return call('POST', `/api/checks/${run}`, asInspector, { chaptersRead: [], read: whatWasRead, ...(body['verdict'] === 'released' ? { traced: syntheticTrace(t, only ?? seal.files.map((one) => one.path)) } : {}), ...body })
}
const release = (run: string, read: Record<string, unknown> = {}) => verdict(run, { verdict: 'released', check: 'Synthetic: read the changes.' }, read)
const refuse = (run: string, read: Record<string, unknown> = {}) =>
  verdict(run, { verdict: 'refused', check: 'Synthetic: read the changes.', missing: ['The test would pass with the feature deleted.'], says: { chapter: 5 } }, read)

const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })

/** A clone of the worker's tree with `work` put on top of a moved main, and file A changed by that. */
function aCloneOnTopOfMain(dir: string): { clone: string; mainAt: string; result: string; files: Record<string, string> } {
  const clone = scratch('clone')
  execFileSync('git', ['clone', '-q', dir, clone])
  git(clone, 'config', 'user.email', 'fixture@example.invalid')
  git(clone, 'config', 'user.name', 'Synthetic ended-with-entry clone')
  git(clone, 'checkout', '-q', 'main')
  writeFileSync(join(clone, 'work', 'other.txt'), 'main moved on.\n')
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '-m', 'Synthetic: main moved')
  git(clone, 'checkout', '-q', 'work')
  git(clone, 'rebase', '-q', 'main')
  writeFileSync(join(clone, A), `${A} before.\n${A} submitted.\n${A} merged with main.\n`)
  git(clone, 'add', '.')
  git(clone, 'commit', '-q', '--amend', '--no-edit')
  const files = Object.fromEntries(
    [A, B].map((path) => [path, createHash('sha256').update(execFileSync('git', ['-C', clone, 'cat-file', 'blob', `HEAD:${path}`])).digest('hex')]),
  )
  return { clone, mainAt: git(clone, 'rev-parse', 'main'), result: git(clone, 'rev-parse', 'HEAD'), files }
}

/** The merge entry, the office's check-again run for it, and the clone that run read. */
let entryId = ''
let checkAgain = ''
/** The worker's own run, refused by the checks door, in rebuttal. */
let ownRefused = ''

const sessions = () => (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'").get() as { n: number }).n
const revisions = (id: string) => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  for (const [by, payload] of [
    [asPerson, { handle: 'eo-inspector', name: 'Synthetic eo-inspector', role: 'inspector' }],
    [asPerson, { handle: 'eo-supervisor', name: 'Synthetic eo-supervisor', role: 'supervisor' }],
    [asSupervisor, { handle: 'eo-worker', name: 'Synthetic eo-worker', role: 'worker', workArea: ['work'] }],
  ] as const) {
    const r = await call('POST', '/api/agents/started', by, payload)
    expect(r.status, r.raw).toBe(201)
  }
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: realpathSync(scratch('main')), actor: { type: 'human', id: THE_PERSON } })

  // THE OFFICE'S CHECK-AGAIN RUN, through the queue's own steps: the entry is released and judged, the integration
  // changes file A, so the office files a check again of A.
  const one = await aSealedRun()
  const filed = await call('POST', '/api/merge-queue', asSupervisor, { run: one.run, changeset: { adapter: 'git', repository: 'fixture-main', branch: 'work' } })
  expect(filed.status, filed.raw).toBe(201)
  entryId = String(filed.body['entry'].id)
  expect((await release(one.run)).status).toBe(201)
  expect((await step(entryId, 'pinned', { files: contentOf(one.seal) })).body['entry'].state).toBe('judged')
  expect((await step(entryId, 'integrating', {})).status).toBe(200)
  const onTop = aCloneOnTopOfMain(one.dir)
  const integrated = await step(entryId, 'integrated', { result: onTop.result, mainAt: onTop.mainAt, clone: onTop.clone, files: onTop.files })
  expect(integrated.status, integrated.raw).toBe(200)
  expect(integrated.body['entry'].state).toBe('reinspecting')
  checkAgain = String(integrated.body['entry'].machine.reinspection.run)
  // THE OFFICE'S OWN PATH: the check again refuses, the entry bounces, and the office ends the run with it.
  const refused = await refuse(checkAgain, { worktree: onTop.clone, only: [A] })
  expect(refused.status, refused.raw).toBe(201)

  // THE WORKER'S OWN RUN, refused by an inspector: it stands in rebuttal and nobody ended it.
  ownRefused = (await aSealedRun()).run
  const own = await refuse(ownRefused)
  expect(own.status, own.raw).toBe(201)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the office ends a check-again run with its merge entry', () => {
  it('writes the field as the office, in the refused bounce, and the run stands closed with its sentence', async () => {
    const entry = await call('GET', `/api/merge-queue/${entryId}`, asPerson)
    expect(entry.status, entry.raw).toBe(200)
    expect(entry.body['entry'].state).toBe('bounced')
    expect(entry.body['entry'].machine.bounced).toMatchObject({ reason: 'refused' })

    const row = t.client.sqlite
      .prepare("SELECT actor_id AS id FROM changes WHERE record_id = ? AND field = 'data.endedWithItsMergeEntry'")
      .all(checkAgain) as { id: string }[]
    expect(row.map((one) => one.id)).toEqual(['mole-office/the-api-server'])

    const data = t.api.getRecord(checkAgain)!.data
    const ended = readEndedWithItsMergeEntry(data[ENDED_WITH_ITS_MERGE_ENTRY])
    expect(ended).toMatchObject({ entry: entryId, because: `Ended with merge entry ${entryId}, which its refusal bounced; nobody works in a check-again run.` })
    const stands = howARunStands(data)
    expect(stands).toMatchObject({ standing: 'closed', waitingFor: null, unreleasedFinish: false })
    expect(stands.says).toBe(endedWithItsMergeEntrySays(ended!, sayInEnglish))
  })
})

describe('the record door and endedWithItsMergeEntry', () => {
  it('refuses a create carrying it, from an agent and from the person, and files nothing', async () => {
    const before = sessions()
    const answers = []
    for (const who of [asWorker, asPerson]) {
      const r = await call('POST', '/api/records', who, {
        kind: 'session',
        title: 'Synthetic run that claims the office ended it',
        data: { state: 'finished', servingAgent: 'eo-worker', [ENDED_WITH_ITS_MERGE_ENTRY]: AN_ENDING },
      })
      answers.push({ status: r.status, error: r.body['error'] })
    }
    expect({ answers, filed: sessions() - before }).toEqual({
      answers: [
        { status: 403, error: ONLY_THE_OFFICE },
        { status: 403, error: ONLY_THE_OFFICE },
      ],
      filed: 0,
    })
  })

  it("refuses a dataPatch carrying it on an agent's own refused run, from the agent and from the person, and the run reads exactly as before", async () => {
    const before = howARunStands(t.api.getRecord(ownRefused)!.data)
    expect(before.standing).toBe('rebuttal')
    const seq = revisions(ownRefused)
    for (const who of [asWorker, asPerson]) {
      const r = await call('PATCH', `/api/records/${ownRefused}`, who, { dataPatch: { [ENDED_WITH_ITS_MERGE_ENTRY]: AN_ENDING } })
      const after = howARunStands(t.api.getRecord(ownRefused)!.data)
      // ONE COMPARISON, so that with the refusal removed the failure shows both the 200 and the run reading closed.
      expect({ status: r.status, error: r.body['error'], standing: after.standing, says: after.says }).toEqual({
        status: 403,
        error: ONLY_THE_OFFICE,
        standing: 'rebuttal',
        says: before.says,
      })
      expect(after).toEqual(before)
    }
    expect(revisions(ownRefused)).toBe(seq)
  })

  it('refuses a whole data that adds, changes or drops it, and not one that carries the stored value back unchanged', async () => {
    const own = t.api.getRecord(ownRefused)!.data
    const added = await call('PATCH', `/api/records/${ownRefused}`, asPerson, { data: { ...own, [ENDED_WITH_ITS_MERGE_ENTRY]: AN_ENDING } })
    const stored = t.api.getRecord(checkAgain)!.data
    const { [ENDED_WITH_ITS_MERGE_ENTRY]: kept, ...without } = stored
    const changed = await call('PATCH', `/api/records/${checkAgain}`, asPerson, {
      data: { ...stored, [ENDED_WITH_ITS_MERGE_ENTRY]: { ...(kept as object), because: 'Synthetic: changed.' } },
    })
    const dropped = await call('PATCH', `/api/records/${checkAgain}`, asPerson, { data: without, replace: true })
    expect([added, changed, dropped].map((r) => ({ status: r.status, error: r.body['error'] }))).toEqual([
      { status: 403, error: ONLY_THE_OFFICE },
      { status: 403, error: ONLY_THE_OFFICE },
      { status: 403, error: ONLY_THE_OFFICE },
    ])
    expect(t.api.getRecord(ownRefused)!.data).not.toHaveProperty(ENDED_WITH_ITS_MERGE_ENTRY)
    expect(t.api.getRecord(checkAgain)!.data[ENDED_WITH_ITS_MERGE_ENTRY]).toEqual(kept)

    // A WHOLE data THAT KEEPS THE ENDING GETS PAST THIS RULE, and the write happens.
    const same = await call('PATCH', `/api/records/${checkAgain}`, asPerson, { data: { ...stored, doing: 'Synthetic: the doing line rewritten, the ending kept.' } })
    expect(same.status, same.raw).toBe(200)
    const now = t.api.getRecord(checkAgain)!.data
    expect(now['doing']).toBe('Synthetic: the doing line rewritten, the ending kept.')
    expect(now[ENDED_WITH_ITS_MERGE_ENTRY]).toEqual(kept)
    expect(howARunStands(now).standing).toBe('closed')
  })
})
