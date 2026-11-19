// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every office, record, name, path and value in this test is made up. No merge tool or worker starts.
 * The step and tool doors run against a throwaway database and git repository.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

import { gateNamed } from '../src/config/gates.mjs'
import { ABSENT } from '../src/shared/merge-queue.ts'
import { createHash } from 'node:crypto'
import { theRunReportsForTheQueue } from './a-report-the-merge-queue-reads.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'

const THE_WORKER = 'mole-office/the-message-worker'
const WORKSPACE = 'default'

const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
const asPerson = as('human', THE_TEST_OFFICES_OWNER.id)
const asSecretary = as('agent', 'made-up-secretary')
const asWorker = as('agent', 'made-up-worker')
const asInspector = as('agent', 'made-up-inspector')
const asTheOffice = as('agent', THE_WORKER)

let t: TestDb
let app: FastifyInstance
let base: string
let main: string
let repository: string
let queue: typeof import('../src/server/lib/merge-queue.ts')
let names = 0

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const SYNTHETIC_AUTHOR = { GIT_AUTHOR_NAME: 'Made-up', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Made-up', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }
const commit = (dir: string, message: string): void => {
  execFileSync('git', ['-C', dir, 'commit', '-q', '--allow-empty', '-m', message], { stdio: 'ignore', env: { ...process.env, ...SYNTHETIC_AUTHOR } })
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

const step = (id: string, name: string, facts: Record<string, unknown>) => call('POST', `/api/merge-queue/${id}/step`, asTheOffice, { step: name, facts })

/** A worker's clone of main with one commit on `work`, sealed as a finished run, submitted, and released by the inspector. */
async function aReleasedEntry(staged: Record<string, string> = {}) {
  names += 1
  const name = `entry-${String(names)}`
  const dir = join(base, name)
  execFileSync('git', ['clone', '-q', main, dir], { stdio: 'ignore' })
  git(dir, 'switch', '-q', '-c', 'work')
  writeFileSync(join(dir, 'src', `${name}.txt`), `Made-up change ${name}.\n`)
  const stagedAt = join(dir, 'src', 'out')
  mkdirSync(stagedAt, { recursive: true })
  for (const [path, text] of Object.entries(staged)) {
    mkdirSync(dirname(join(stagedAt, path)), { recursive: true })
    writeFileSync(join(stagedAt, path), text)
  }
  git(dir, 'add', '-A')
  commit(dir, `Made-up submission ${name}`)
  const run = t.api.createRecord({
    kind: 'session',
    title: `Made-up run ${name}`,
    workspaceId: WORKSPACE,
    actor: { type: 'agent', id: 'made-up-worker' },
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'made-up-worker', cutFrom: 'main', workingDirectory: realpathSync(dir) },
  }).id
  expect((await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })).status).toBe(200)
  const submitted = await call('POST', '/api/merge-queue', asWorker, { run, changeset: { adapter: 'git', repository, branch: name } })
  expect(submitted.status, submitted.raw).toBe(201)
  const sealId = String(t.api.getRecord(run)!.data['sealedTip'])
  const seal = t.api.getRecord(sealId)!.data['seal'] as { hash: string; git: { commit: string; forkBase: string; files: { path: string; hash: string }[] } }
  const read = { sealId, sealHash: seal.hash, worktree: realpathSync(dir), tip: seal.git.commit, ofItsOwn: true, says: 'Made-up: a check of its own detached tree.' }
  const assembled = await call('POST', `/api/checks/${run}/assembled`, asInspector, {
    changes: seal.git.files.map((one) => ({ path: one.path, changes: 'a synthetic diff' })),
    base: { ref: seal.git.forkBase, how: 'fork point', says: 'Made-up: the fixed fork base of the seal.' },
    read,
  })
  expect(assembled.status, assembled.raw).toBe(201)
  const verdict = await call('POST', `/api/checks/${run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, seal.git.files.map((one) => one.path)), check: 'Made-up: read the changes and found nothing missing.', chaptersRead: [], read })
  expect(verdict.status, verdict.raw).toBe(201)
  return { id: String(submitted.body['entry'].id), run, dir, stagedAt, seal: { id: sealId, hash: seal.hash }, commit: seal.git.commit, content: Object.fromEntries(seal.git.files.map((one) => [one.path, one.hash])) }
}

/** Take a released entry to testing on main as it stands now, through the step door as the merge tool would. */
async function aTestingEntry(): Promise<{ id: string; run: string; mainAt: string; commit: string }> {
  const one = await aReleasedEntry()
  const mainAt = git(main, 'rev-parse', 'HEAD')
  expect((await step(one.id, 'pinned', { files: one.content })).body['entry'].state).toBe('judged')
  expect((await step(one.id, 'integrating', {})).body['entry'].state).toBe('integrating')
  expect((await step(one.id, 'integrated', { result: one.commit, mainAt, files: one.content })).body['entry'].state).toBe('testing')
  return { id: one.id, run: one.run, mainAt, commit: one.commit }
}

async function aLandingEntry(): Promise<{ id: string; run: string; mainAt: string; commit: string }> {
  const one = await aTestingEntry()
  const { mainAt } = one
  expect((await step(one.id, 'tested', { green: true, log: '/made-up/suite.log', ran: 1, passed: 1 })).status).toBe(200)
  const landing = await step(one.id, 'landing', { mainAt })
  expect(landing.status, landing.raw).toBe(200)
  expect(landing.body['entry'].state).toBe('landing')
  return { id: one.id, run: one.run, mainAt, commit: one.commit }
}

const ROWS = [
  ['the-seal-matches-the-entry', 'MOLE_OFFICE_GATE_THE_SEAL_MATCHES_THE_ENTRY'],
  ['pinned-content-is-the-submission', 'MOLE_OFFICE_GATE_PINNED_CONTENT_IS_THE_SUBMISSION'],
  ['files-entry-bytes-are-sealed', 'MOLE_OFFICE_GATE_FILES_ENTRY_BYTES_ARE_SEALED'],
  ['files-entry-matches-its-files-seal', 'MOLE_OFFICE_GATE_FILES_ENTRY_MATCHES_ITS_FILES_SEAL'],
  ['landing-only-on-the-tested-main', 'MOLE_OFFICE_GATE_LANDING_ONLY_ON_THE_TESTED_MAIN'],
  ['only-what-was-tested-lands', 'MOLE_OFFICE_GATE_ONLY_WHAT_WAS_TESTED_LANDS'],
] as const
const once = { would_stop: 1, stopped: 1, reminded: 0 }
const twice = { would_stop: 2, stopped: 2, reminded: 0 }
function count(gate: string) {
  return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get(gate)
}
async function entry(id: string) {
  const r = await call('GET', `/api/merge-queue/${id}`, asSecretary)
  expect(r.status, r.raw).toBe(200)
  return r.body['entry']
}
function changeSeal(id: string, field: 'hash' | 'id', value: string) {
  t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, ?) WHERE id = ?').run(`$.seal.${field}`, value, id)
}
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex')
const FILES_CHECKER = 'tools/checks/files-changeset.mjs'
const B0 = '{"b":"Made-up old text"}\n'
const B1 = '{"b":"Made-up new text"}\n'
const RUN = '#!/bin/sh\necho Made-up\n'
const SEALED = 'Made-up sealed bytes.\n'
const UNSEALED = 'Made-up unsealed bytes.\n'
const add = { op: 'add', path: 'bin/run.sh', before: ABSENT, after: sha256(RUN), mode: '100755', source: 'Made-up source' }
const modify = { op: 'modify', path: 'notes/b.json', before: sha256(B0), after: sha256(B1), source: 'Made-up source' }
const handedOn = [{ path: 'notes/b.json', why: 'Made-up: the checker needs an inspector to read this file.' }]
let filesArea: string
const filesRoot = () => realpathSync(mkdtempSync(join(filesArea, 'made-up-root-')))

async function aFilesEntry(sealed: { run: string; stagedAt: string }, operations: Record<string, unknown>[], root = filesRoot()) {
  const r = await call('POST', '/api/merge-queue', asWorker, { run: sealed.run, changeset: { adapter: 'files', root, stagedAt: sealed.stagedAt, operations } })
  expect(r.status, r.raw).toBe(201)
  return { id: String(r.body['entry'].id), root }
}
function pinFiles(id: string, operations: Record<string, unknown>[], needsJudgment: { path: string; why: string }[] = []) {
  return step(id, 'pinned', { files: Object.fromEntries(operations.map(one => [String(one['path']), one['after']])), checker: { tool: FILES_CHECKER, decided: [], needsJudgment } })
}
async function aFilesSealedRun() {
  const stagedAt = realpathSync(mkdtempSync(join(base, 'made-up-staged-')))
  const root = filesRoot()
  mkdirSync(join(stagedAt, 'bin'), { recursive: true })
  mkdirSync(join(stagedAt, 'notes'), { recursive: true })
  mkdirSync(join(root, 'notes'), { recursive: true })
  writeFileSync(join(stagedAt, 'bin', 'run.sh'), RUN)
  chmodSync(join(stagedAt, 'bin', 'run.sh'), 0o755)
  writeFileSync(join(stagedAt, 'notes', 'b.json'), B1)
  writeFileSync(join(root, 'notes', 'b.json'), B0)
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up files run', workspaceId: WORKSPACE, actor: { type: 'agent', id: 'made-up-worker' }, origin: 'fixture', data: { state: 'running', servingAgent: 'made-up-worker', submission: { kind: 'files', stagedAt, root } } }).id
  theRunReportsForTheQueue(t, run, { type: 'agent', id: 'made-up-worker' })
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished' } })
  expect(finished.status, finished.raw).toBe(200)
  const id = String(t.api.getRecord(run)!.data['sealedTip'])
  return { run, root, stagedAt, seal: { id, hash: (t.api.getRecord(id)!.data['seal'] as { hash: string }).hash } }
}
async function releasedReading(sealed: Awaited<ReturnType<typeof aFilesSealedRun>>, before: Record<string, string>) {
  const read = { sealId: sealed.seal.id, sealHash: sealed.seal.hash, worktree: '/made-up/a-copy-of-its-own', ofItsOwn: true, says: 'Made-up: a copy checked against the seal.', staged: sealed.stagedAt, before }
  const changes = ['bin/run.sh', 'notes/b.json'].map(path => ({ path, changes: 'Made-up change' }))
  const assembled = await call('POST', `/api/checks/${sealed.run}/assembled`, asInspector, { changes, base: null, read })
  expect(assembled.status, assembled.raw).toBe(201)
  const released = await call('POST', `/api/checks/${sealed.run}`, asInspector, { verdict: 'released', traced: syntheticTrace(t, changes.map(one => one.path)), check: 'Made-up: read the files and what they replace.', chaptersRead: [], read })
  expect(released.status, released.raw).toBe(201)
}
function bounced(r: Awaited<ReturnType<typeof step>>, path: string, words: string) {
  expect(r.status, r.raw).toBe(200)
  expect(r.body['entry'].state).toBe('bounced')
  expect(r.body['entry'].machine.bounced).toMatchObject({ reason: 'unjudged', files: [path] })
  expect(r.body['entry'].machine.bounced.says).toContain(words)
}

describe('Made-up merge queue server guards', () => {
  // The six rows keep block as their only position and use their setting's words. M13 and M14 turn this red.
  it('keeps six block-only rows, their settings door and their page words', async () => {
    const { GATES } = await import('../src/config/gates.mjs')
    for (const [id, setting] of ROWS) {
      expect(GATES.find(row => row.id === id), id).toEqual({ id, class: 'quality', group: 'the-merge-queue', setting, positions: { kind: 'block-remind-off', allowed: ['block'] }, whoMayChange: 'the-person', defaults: { buildsMoleOffice: 'block', ordinary: 'block' }, countedBy: 'the-server', looksAgain: null })
      for (const value of ['remind', 'off']) {
        const refused = await call('POST', '/api/office/settings', asPerson, { changes: [{ name: setting, value }], because: 'Made-up reason for a gate' })
        expect(refused.status, refused.raw).toBe(400)
        expect(refused.body['error']).toContain(setting)
        expect(t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting)).toBeUndefined()
      }
      const saved = await call('POST', '/api/office/settings', asPerson, { changes: [{ name: setting, value: 'block' }], because: 'Made-up reason for a gate' })
      expect(saved.status, saved.raw).toBe(200)
      const words = (SETTING_WORDS as Record<string, string>)[setting]
      expect(words).toEqual(expect.any(String))
      expect(theWordAPageDraws('en', `gates.row.${id}`), id).toBe(words)
      expect(theWordAPageDraws('en', `settingsWords.${setting}`), id).toBe(words)
      expect(count(id)).toBeUndefined()
    }
  })

  // Each bad git seal is refused before a pin writes anything, and a good seal adds no count. M1 turns this red.
  it('counts git seal refusals once each and leaves a true seal alone', async () => {
    const first = await aReleasedEntry()
    changeSeal(first.id, 'hash', 'a'.repeat(64))
    const hash = await step(first.id, 'pinned', { files: first.content })
    expect(hash.status, hash.raw).toBe(409)
    expect(hash.body['error']).toContain('does not hash to what merge entry')
    expect((await entry(first.id)).state).toBe('submitted')
    expect(count(ROWS[0][0])).toEqual(once)
    const second = await aReleasedEntry()
    changeSeal(second.id, 'id', second.run)
    const kind = await step(second.id, 'pinned', { files: second.content })
    expect(kind.status, kind.raw).toBe(409)
    expect(kind.body['error']).toContain('which is not a seal here')
    expect((await entry(second.id)).state).toBe('submitted')
    expect(count(ROWS[0][0])).toEqual(twice)
    const trueSeal = await aReleasedEntry()
    expect((await step(trueSeal.id, 'pinned', { files: trueSeal.content })).body['entry'].state).toBe('judged')
    expect(count(ROWS[0][0])).toEqual(twice)
  })

  // A files pin compares content before asking its seal. M1 and M2 turn this red.
  it('counts a files seal refusal after content, keeping the content refusal first', async () => {
    const sealed = await aFilesSealedRun()
    const first = await aFilesEntry(sealed, [modify], sealed.root)
    changeSeal(first.id, 'hash', 'a'.repeat(64))
    const badSeal = await pinFiles(first.id, [modify])
    expect(badSeal.status, badSeal.raw).toBe(409)
    expect(badSeal.body['error']).toContain('does not hash to what merge entry')
    expect((await entry(first.id)).state).toBe('submitted')
    expect(count(ROWS[0][0])).toEqual(once)
    const other = await aFilesSealedRun()
    const second = await aFilesEntry(other, [modify], other.root)
    changeSeal(second.id, 'hash', 'a'.repeat(64))
    const content = await step(second.id, 'pinned', { files: { 'notes/b.json': sha256(B0) } })
    expect(content.status, content.raw).toBe(422)
    expect(content.body['error']).toContain('The pinned content is not what merge entry')
    expect((await entry(second.id)).state).toBe('submitted')
    expect(count(ROWS[1][0])).toEqual(once)
    expect(count(ROWS[0][0])).toEqual(once)
  })

  // Wrong pinned content changes no entry fields; retrying with true content does not count. M2 turns this red.
  it('counts a wrong git pin and accepts the true content without another count', async () => {
    const one = await aReleasedEntry()
    const before = t.api.getRecord(one.id)!.data
    const files = { ...one.content, [Object.keys(one.content)[0]!]: 'a'.repeat(64) }
    const refused = await step(one.id, 'pinned', { files })
    expect(refused.status, refused.raw).toBe(422)
    expect(refused.body['error']).toContain('The pinned content is not what merge entry')
    expect(refused.body['error']).toContain('Nothing was written.')
    expect(t.api.getRecord(one.id)!.data).toEqual(before)
    expect(count(ROWS[1][0])).toEqual(once)
    expect((await step(one.id, 'pinned', { files: one.content })).body['entry'].state).toBe('judged')
    expect(count(ROWS[1][0])).toEqual(once)
  })

  // Only bytes absent from a git seal count here; a checker needing a reading does not. M3, M4 and M12 turn this red.
  it('counts unsealed files bytes at the pin and excludes checker bounces at pin and integrate', async () => {
    const sealed = await aReleasedEntry({ 'report-files/a.txt': SEALED })
    const operation = (path: string, text: string) => ({ op: 'add', path, before: ABSENT, after: sha256(text), source: 'Made-up source' })
    const mixed = [operation('report-files/a.txt', SEALED), operation('report-files/b.txt', UNSEALED)]
    const one = await aFilesEntry(sealed, mixed)
    bounced(await pinFiles(one.id, mixed), 'report-files/b.txt', 'are not among the files seal')
    expect(count(ROWS[2][0])).toEqual(once)
    expect(count(ROWS[3][0])).toBeUndefined()
    const operations = [operation('report-files/a.txt', SEALED)]
    const unread = await aFilesEntry(sealed, operations)
    bounced(await pinFiles(unread.id, operations, [{ path: 'report-files/a.txt', why: 'Made-up: no content check can read this.' }]), 'report-files/a.txt', 'No check can read a files entry yet')
    expect(count(ROWS[2][0])).toEqual(once)
    expect(count(ROWS[3][0])).toBeUndefined()
    const later = await aFilesEntry(sealed, operations)
    expect((await pinFiles(later.id, operations)).body['entry'].state).toBe('judged')
    expect((await step(later.id, 'integrating', {})).body['entry'].state).toBe('integrating')
    const integrated = await step(later.id, 'integrated', { result: 'landing-plan-sha256:made-up', mainAt: 'folder-sha256:made-up', files: { 'report-files/a.txt': sha256(SEALED) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [{ path: 'report-files/a.txt', why: 'Made-up: now protected.' }] } })
    bounced(integrated, 'report-files/a.txt', 'Made-up: now protected.')
    expect(integrated.body['entry'].occupies).toBeNull()
    expect(count(ROWS[2][0])).toEqual(once)
    expect(count(ROWS[3][0])).toBeUndefined()
  })

  // A files seal binds bytes to their path, while a protected-file bounce is not counted here. M12 turns this red.
  it('counts a files seal path mismatch and excludes a protected file handed on at the pin', async () => {
    const sealed = await aFilesSealedRun()
    const operations = [{ ...add, path: 'bin/elsewhere.sh' }]
    const one = await aFilesEntry(sealed, operations, sealed.root)
    bounced(await pinFiles(one.id, operations), 'bin/elsewhere.sh', 'bin/elsewhere.sh: seal')
    expect(count(ROWS[3][0])).toEqual(once)
    expect(count(ROWS[2][0])).toBeUndefined()
    const protectedRun = await aFilesSealedRun()
    const protectedEntry = await aFilesEntry(protectedRun, [modify], protectedRun.root)
    const pin = await step(protectedEntry.id, 'pinned', { files: { 'notes/b.json': sha256(B1) }, checker: { tool: FILES_CHECKER, decided: [{ path: 'notes/b.json', check: 'protected', ok: true, detail: 'Made-up protected area.' }], needsJudgment: handedOn } })
    bounced(pin, 'notes/b.json', "never lands such a path on a model's release alone")
    expect(count(ROWS[3][0])).toEqual(once)
    expect(count(ROWS[2][0])).toBeUndefined()
  })

  // A release must read a modify's old text and judge each handed-on path. M5 turns this red.
  it('counts files seal bounces where a release is heard, once for each entry', async () => {
    const unread = await aFilesSealedRun()
    const first = await aFilesEntry(unread, [modify], unread.root)
    expect((await pinFiles(first.id, [modify])).body['entry'].state).toBe('pinned')
    await releasedReading(unread, {})
    const one = await entry(first.id)
    expect(one.state).toBe('bounced')
    expect(one.machine.bounced).toMatchObject({ reason: 'unjudged', files: ['notes/b.json'] })
    expect(one.machine.bounced.says).toContain('the check saw no file landed here')
    expect(count(ROWS[3][0])).toEqual(once)
    const untold = await aFilesSealedRun()
    const second = await aFilesEntry(untold, [modify], untold.root)
    expect((await pinFiles(second.id, [modify], handedOn)).body['entry'].state).toBe('pinned')
    await releasedReading(untold, { 'notes/b.json': sha256(B0) })
    const two = await entry(second.id)
    expect(two.state).toBe('bounced')
    expect(two.machine.bounced.says).toContain('does not name it with a line of its own in `judged`')
    expect(count(ROWS[3][0])).toEqual(twice)
  })

  // A stored change stands in for a state no door produces today, because a run is released once.
  // This proves the count sits beside the integrating step's bounce. M6 turns this red.
  it('counts a files seal bounce at integrating after its stored release no longer covers it', async () => {
    const sealed = await aFilesSealedRun()
    const one = await aFilesEntry(sealed, [modify], sealed.root)
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    expect((await pinFiles(one.id, [modify])).body['entry'].state).toBe('judged')
    expect(count(ROWS[3][0])).toBeUndefined()
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.released.read.before', json(?)) WHERE id = ?").run('{}', sealed.run)
    bounced(await step(one.id, 'integrating', {}), 'notes/b.json', 'the check saw no file landed here')
    expect((await entry(one.id)).occupies).toBeNull()
    expect(count(ROWS[3][0])).toEqual(once)
  })

  // The landing compare-and-swap refuses a different main after green tests. M7 turns this red.
  it('counts landing on another main and keeps the entry at testing', async () => {
    const one = await aTestingEntry()
    expect((await step(one.id, 'tested', { green: true, log: '/made-up/suite.log', ran: 1, passed: 1 })).status).toBe(200)
    const before = t.api.getRecord(one.id)!.data
    const refused = await step(one.id, 'landing', { mainAt: 'a'.repeat(40) })
    expect(refused.status, refused.raw).toBe(422)
    expect(refused.body['error']).toContain('would land merge entry')
    expect(refused.body['error']).toContain('and the entry was integrated on')
    expect(t.api.getRecord(one.id)!.data).toEqual(before)
    expect((await entry(one.id)).state).toBe('testing')
    expect(count(ROWS[4][0])).toEqual(once)
  })

  // Only a git landing's main-moved counts, whether it returns to judged or bounces as churn. M8, M9 and M10 turn this red.
  it('counts both git main-moved outcomes and excludes moves while testing and files landings', async () => {
    const normal = await aLandingEntry()
    const back = await step(normal.id, 'main-moved', { mainAt: 'a'.repeat(40) })
    expect(back.status, back.raw).toBe(200)
    expect(back.body['entry'].state).toBe('judged')
    expect(count(ROWS[4][0])).toEqual(once)
    vi.stubEnv('MOLE_OFFICE_LANDING_ATTEMPTS', '1')
    const churn = await aLandingEntry()
    expect((await step(churn.id, 'main-moved', { mainAt: 'b'.repeat(40) })).body['entry'].state).toBe('judged')
    expect(count(ROWS[4][0])).toEqual(twice)
    expect((await step(churn.id, 'integrating', {})).body['entry'].state).toBe('integrating')
    const held = t.api.getRecord(churn.id)!.data['integration'] as { result: string; files: Record<string, string> }
    expect((await step(churn.id, 'integrated', { result: held.result, files: held.files, mainAt: churn.mainAt })).body['entry'].state).toBe('testing')
    expect((await step(churn.id, 'tested', { green: true, log: '/made-up/suite.log' })).status).toBe(200)
    expect((await step(churn.id, 'landing', { mainAt: churn.mainAt })).body['entry'].state).toBe('landing')
    const bouncedAsChurn = await step(churn.id, 'main-moved', { mainAt: 'c'.repeat(40) })
    expect(bouncedAsChurn.body['entry'].state).toBe('bounced')
    expect(bouncedAsChurn.body['entry'].machine.bounced.reason).toBe('churn')
    expect(count(ROWS[4][0])).toEqual({ would_stop: 3, stopped: 3, reminded: 0 })
    expect(count('landing-attempts')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
    const testing = await aTestingEntry()
    expect((await step(testing.id, 'main-moved-while-testing', { mainAt: 'd'.repeat(40) })).body['entry'].state).toBe('judged')
    expect(count(ROWS[4][0])).toEqual({ would_stop: 3, stopped: 3, reminded: 0 })
    const sealed = await aFilesSealedRun()
    const files = await aFilesEntry(sealed, [modify], sealed.root)
    expect((await pinFiles(files.id, [modify])).body['entry'].state).toBe('pinned')
    await releasedReading(sealed, { 'notes/b.json': sha256(B0) })
    expect((await step(files.id, 'integrating', {})).body['entry'].state).toBe('integrating')
    expect((await step(files.id, 'integrated', { result: 'landing-plan-sha256:made-up', mainAt: 'folder-sha256:made-up', files: { 'notes/b.json': sha256(B1) }, checker: { tool: FILES_CHECKER, decided: [], needsJudgment: [] } })).body['entry'].state).toBe('testing')
    expect((await step(files.id, 'tested', { green: true, log: '/made-up/files.log' })).status).toBe(200)
    expect((await step(files.id, 'landing', { mainAt: 'folder-sha256:made-up' })).body['entry'].state).toBe('landing')
    expect((await step(files.id, 'main-moved', { mainAt: 'folder-sha256:made-up-later' })).body['entry'].state).toBe('judged')
    expect(count(ROWS[4][0])).toEqual({ would_stop: 3, stopped: 3, reminded: 0 })
  })

  // A landed report must name the tested commit; the correct retry adds no count. M11 turns this red.
  it('counts a different landed commit and accepts exactly what was tested', async () => {
    const one = await aLandingEntry()
    const before = t.api.getRecord(one.id)!.data
    const refused = await step(one.id, 'landed', { mainAfter: 'a'.repeat(40) })
    expect(refused.status, refused.raw).toBe(422)
    expect(refused.body['error']).toContain('and what was tested is')
    expect(t.api.getRecord(one.id)!.data).toEqual(before)
    expect((await entry(one.id)).state).toBe('landing')
    expect(count(ROWS[5][0])).toEqual(once)
    const landed = await step(one.id, 'landed', { mainAfter: one.commit })
    expect(landed.status, landed.raw).toBe(200)
    expect(landed.body['entry'].state).toBe('merged')
    expect(count(ROWS[5][0])).toEqual(once)
  })
})

beforeAll(async () => {
  t = await freshDb()
  base = realpathSync(mkdtempSync(join(tmpdir(), 'made-up-queue-guards-')))
  app = (await apiApp()).app
  queue = await import('../src/server/lib/merge-queue.ts')
  for (const [handle, role, payload] of [
    ['made-up-secretary', 'secretary', {}],
    ['made-up-inspector', 'inspector', {}],
    ['made-up-worker', undefined, { workArea: ['src'] }],
  ] as const) {
    const r = await call('POST', '/api/agents/started', asPerson, { handle, name: `Made-up ${handle}`, ...(role === undefined ? {} : { role }), ...payload })
    expect(r.status, r.raw).toBe(201)
  }
  filesArea = realpathSync(mkdtempSync(join(base, 'made-up-files-area-')))
  const area = await call('POST', '/api/participants/agent/made-up-worker/files-area', asPerson, { filesArea: [filesArea], because: 'Made-up files area' })
  expect(area.status, area.raw).toBe(200)
  main = join(base, 'main')
  mkdirSync(join(main, 'src'), { recursive: true })
  git(main, 'init', '-q', '-b', 'main')
  writeFileSync(join(main, 'src', 'a.txt'), 'Made-up baseline.\n')
  git(main, 'add', '-A')
  commit(main, 'Made-up baseline')
  main = realpathSync(main)
  const repositories = await import('../src/server/lib/repositories.ts')
  repository = repositories.registerRepository({ workspaceId: WORKSPACE, name: 'made-up-repository', root: main, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } }).id
}, 60_000)

beforeEach(() => {
  t.client.sqlite.prepare('DELETE FROM gate_counts').run()
  vi.stubEnv('MOLE_OFFICE_LANDING_ATTEMPTS', gateNamed('landing-attempts').defaults.ordinary)
})

// Free the git lane even when a case fails while it holds it.
afterEach(async () => {
  const holder = queue.whoOccupies(main)
  if (holder !== null) {
    if (holder.state === 'landing') await step(holder.entry, 'main-moved', { mainAt: '0'.repeat(40) })
    await call('POST', `/api/merge-queue/${holder.entry}/withdraw`, asPerson, { because: 'Made-up: the case is over.' })
  }
  vi.unstubAllEnvs()
})
afterAll(async () => {
  await app?.close()
  t?.close()
  if (base !== undefined) rmSync(base, { recursive: true, force: true })
})
