// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/** Control and mutation evidence is recorded per criterion 1. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { KEY_HEADER } from '../src/config/key-header.mjs'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
/** The key seal-worker's registration answers it. */
let workerKey = ''
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'seal-worker' }
const directories: string[] = []
const actor = { type: 'agent' as const, id: 'seal-worker' }
function git(dir: string, ...args: string[]) { return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim() }
function tree() {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'seal-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic seal fixture')
  // A FOLDER, because criterion P92's worker grain is folders and the work area below is one.
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}
/** The agent that started every worker here. Since the filing door of round 30 a session for another agent is
 * filed by an agent above it, so a run of another worker is filed, and ended, by this starter. */
const byTheStarter = { type: 'agent' as const, id: 'starter' }
const asTheStarter = { ...headers, 'x-mole-office-actor-id': 'starter' }
function run(data: Record<string, unknown> = {}) {
  const held = { state: 'running', servingAgent: 'seal-worker', cutFrom: 'main', ...data }
  return t.api.createRecord({ kind: 'session', title: 'Synthetic seal fixture', workspaceId: 'default', actor: held.servingAgent === 'seal-worker' ? actor : byTheStarter, origin: 'fixture',
    data: held }).id
}
async function finish(id: string) {
  const asking = t.api.getRecord(id)?.data['servingAgent'] === 'seal-worker' ? headers : asTheStarter
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers: asking, payload: { dataPatch: { state: 'finished' } } })
}
beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; seals = await import('../src/server/lib/sealed-tip.ts')
  const parent = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'starter', name: 'Synthetic starter' } })
  expect(parent.statusCode, parent.body).toBe(201)
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'starter' },
    payload: { handle: 'seal-worker', name: 'Seal fixture worker', workArea: ['work', 'records'] } })
  expect(r.statusCode, r.body).toBe(201)
  workerKey = String(r.json().whatToGiveIt.key)
  const recordsWorker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'starter' },
    payload: { handle: 'records-worker', name: 'Synthetic records-only worker', workArea: [] } })
  expect(recordsWorker.statusCode, recordsWorker.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close(); for (const dir of directories) rmSync(dir, { recursive: true, force: true }) })

describe('sealed submissions', () => {
  it('a-finish-seals-the-tip', async () => {
    const dir = tree(), id = run({ workingDirectory: dir, executionId: 'synthetic-execution', attemptId: 'synthetic-attempt' })
    const r = await finish(id)
    expect(r.statusCode, r.body).toBe(200)
    const first = seals.readRunSeal(id)!
    expect(first.seal.git?.commit).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(first.seal.git?.forkBase).toBe(git(dir, 'rev-parse', 'main'))
    expect(first.seal.git?.files).toEqual([{ path: 'work/a.txt', hash: seals.sealHash('submitted\n'), mode: '100644' }])
    expect(first.seal.area).toEqual(['work', 'records'])
    expect(first.seal.run).toBe(id)
    expect(first.seal.execution).toBe('synthetic-execution')
    expect(first.seal.attempt).toBe('synthetic-attempt')
    const again = await finish(id)
    expect(again.statusCode, again.body).toBe(200)
    expect(seals.readRunSeal(id)?.id).not.toBe(first.id)
    expect(t.api.getRecord(first.id)?.data['seal']).toEqual(first.seal)
    expect(() => t.api.patchRecord(first.id, { title: 'Changed' }, actor)).toThrow(/immutable/)
    expect(() => t.client.sqlite.prepare("UPDATE records SET kind = 'note' WHERE id = ?").run(first.id)).toThrow(/immutable/)
  })
  // Problem Qrcr9t4iT2Id: a worker that commits again after its seal still has the sealed commit under HEAD, and the
  // check reads that commit. Until wave 13s's round 20 this case expected a 409 "tip moved", and the verdict was lost.
  it('a check reads the sealed commit when the worker committed again on top of it', async () => {
    const dir = tree(), id = run({ workingDirectory: dir })
    expect((await finish(id)).statusCode).toBe(200)
    const sealed = seals.readRunSeal(id)!.seal.git!.commit
    writeFileSync(join(dir, 'work', 'a.txt'), 'later\n'); git(dir, 'commit', '-am', 'Later work')
    const r = await app.inject({ method: 'GET', url: '/api/checks/' + id, headers })
    expect(r.statusCode, r.body).toBe(200)
    const submission = r.json().submission
    expect(submission.seal.git.commit).toBe(sealed)
    expect(submission.readFrom).toContain(`moved on to ${git(dir, 'rev-parse', 'HEAD')}`)
    expect(submission.readFrom).toContain('the later commits were not read')
    // The confirm does not take this road: there a tip that moved is still refused.
    expect(() => seals.verifyRunSeal(id)).toThrow(/tip moved/)
  })
  it('a-check-refuses-a-tip-that-moved-after-the-seal', async () => {
    const dir = tree(), id = run({ workingDirectory: dir })
    expect((await finish(id)).statusCode).toBe(200)
    // AMENDED, so HEAD no longer contains the sealed commit, though the sealed commit is still in git's objects.
    writeFileSync(join(dir, 'work', 'a.txt'), 'later\n'); git(dir, 'commit', '-a', '--amend', '-m', 'Synthetic submission, amended')
    const r = await app.inject({ method: 'GET', url: '/api/checks/' + id, headers })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.body).toContain('tip moved')
  })
  // The one way the sealed commit's files can read differently while its id stays the same: the blob's own loose
  // object holds other bytes. Git does not check an object's bytes against its name when it reads it. The office's
  // reads ignore `git replace`, so this is the way. The seal is refused, naming the file.
  it('a check refuses a sealed commit under a later one whose sealed file git now reads with other bytes', async () => {
    const dir = tree(), id = run({ workingDirectory: dir })
    expect((await finish(id)).statusCode).toBe(200)
    const blob = git(dir, 'rev-parse', 'HEAD:work/a.txt')
    writeFileSync(join(dir, 'work', 'a.txt'), 'later\n'); git(dir, 'commit', '-am', 'Later work')
    const loose = join(dir, '.git', 'objects', blob.slice(0, 2), blob.slice(2))
    const other = Buffer.from('not what was sealed\n')
    chmodSync(loose, 0o644)
    writeFileSync(loose, deflateSync(Buffer.concat([Buffer.from(`blob ${String(other.length)}\0`), other])))
    const r = await app.inject({ method: 'GET', url: '/api/checks/' + id, headers })
    expect(r.statusCode, r.body).toBe(409)
    expect(r.body).toContain('Sealed file work/a.txt differs from seal')
  })
  it('names a sealed file whose bytes changed without a commit', async () => {
    const dir = tree(), id = run({ workingDirectory: dir })
    expect((await finish(id)).statusCode).toBe(200)
    writeFileSync(join(dir, 'work', 'a.txt'), 'modified after finish\n')
    expect(() => seals.verifyRunSeal(id)).toThrow(/a.txt/)
  })
  // Problem XH1db0-pOuVy: wave 13t's branch moved tools/kit/* away and made tools/kit a link, and its
  // check answered "Sealed file tools/kit/README.md differs from seal", because the file opened
  // through the link. Git records it as deleted, and the seal is read again the way git reads it.
  it('reads a seal again when the branch turned a folder into a link', async () => {
    const dir = tree()
    mkdirSync(join(dir, 'work', 'kit')); writeFileSync(join(dir, 'work', 'kit', 'README.md'), 'the kit\n')
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic kit folder'); git(dir, 'branch', '-f', 'main', 'HEAD')
    git(dir, 'mv', 'work/kit', 'work/for-agents'); symlinkSync('for-agents', join(dir, 'work', 'kit'))
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic kit folder made a link')
    const id = run({ workingDirectory: dir })
    expect((await finish(id)).statusCode).toBe(200)
    const files = seals.readRunSeal(id)!.seal.git!.files
    expect(files).toContainEqual({ path: 'work/kit/README.md', hash: null, mode: null })
    expect(files).toContainEqual({ path: 'work/kit', hash: seals.sealHash('for-agents'), mode: '120000' })
    expect(seals.verifyRunSeal(id)!.id).toBe(seals.readRunSeal(id)!.id)
  })
  // Wave 13n's round 39: a regular file where the folder was. lstat on work/kit/README.md fails with ENOTDIR,
  // and the finish was refused with a 409. Git records the file as deleted, so the seal reads it as absent.
  it('seals and reads a seal again when the branch put a file where a folder was', async () => {
    const dir = tree()
    mkdirSync(join(dir, 'work', 'kit')); writeFileSync(join(dir, 'work', 'kit', 'README.md'), 'the kit\n')
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic kit folder'); git(dir, 'branch', '-f', 'main', 'HEAD')
    git(dir, 'rm', '-q', '-r', 'work/kit'); writeFileSync(join(dir, 'work', 'kit'), 'now a file\n')
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Synthetic kit folder made a file')
    const id = run({ workingDirectory: dir })
    const finished = await finish(id)
    expect(finished.statusCode, finished.body).toBe(200)
    const files = seals.readRunSeal(id)!.seal.git!.files
    expect(files).toContainEqual({ path: 'work/kit/README.md', hash: null, mode: null })
    expect(files).toContainEqual({ path: 'work/kit', hash: seals.sealHash('now a file\n'), mode: '100644' })
    expect(seals.verifyRunSeal(id)!.id).toBe(seals.readRunSeal(id)!.id)
  })
  it('refuses an unsealable finish without storing finished or a seal', async () => {
    const id = run({ workingDirectory: tree() })
    writeFileSync(join(String(t.api.getRecord(id)!.data['workingDirectory']), 'untracked.txt'), 'not committed')
    const r = await finish(id)
    expect(r.statusCode, r.body).toBe(409)
    expect(r.body).toContain('untracked.txt')
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(seals.readRunSeal(id)).toBeNull()
  })
  it('a-record-only-submission-is-sealed-by-its-manifest', async () => {
    const record = t.api.createRecord({ kind: 'note', title: 'Synthetic record', workspaceId: 'default', actor, origin: 'fixture', data: {} })
    const id = run({ submission: { kind: 'records', records: [record.id] } })
    t.api.patchRecord(record.id, { summary: 'Submitted revision' }, { ...actor, sessionId: id })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const seal = seals.readRunSeal(id)!.seal
    expect(seal.git).toBeNull()
    expect(seal.records!.records[0]!.before!.seq).toBe(1)
    expect(seal.records!.records[0]!.after.seq).toBe(2)
    // POINTERS AND HASHES, NEVER COPIES. Criterion C34: the seal names the revision and its hash,
    // and the content is read from the revisions table by the pointer.
    expect(seal.records!.records[0]!.after.record).toBe(record.id)
    expect(seal.records!.records[0]!.after.hash).toHaveLength(64)
    expect(Object.keys(seal.records!.records[0]!.after).sort()).toEqual(['hash', 'id', 'record', 'seq'])
    const sealedRevision = seal.records!.records[0]!.after.id
    t.api.patchRecord(record.id, { title: 'Concurrent later title', summary: 'Concurrent later revision' }, actor)
    // A LATER EDIT DOES NOT MOVE WHAT THE SEAL NAMES. The pointer still leads to the submitted row.
    expect(seals.verifyRunSeal(id)!.seal.records!.records[0]!.after.id).toBe(sealedRevision)
    expect(
      (t.client.sqlite.prepare('SELECT summary FROM revisions WHERE id = ?').get(sealedRevision) as { summary: string }).summary,
    ).toBe('Submitted revision')
    const read = await app.inject({ method: 'GET', url: '/api/checks/' + id, headers })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().submission.seal.records.records[0].after.seq).toBe(2)
    expect(read.json().wrote[0].title).toBe('Synthetic record')
  })
  it('mixed work retains full deleted link evidence and both submissions', async () => {
    const left = t.api.createRecord({ kind: 'note', title: 'Synthetic left', workspaceId: 'default', actor, origin: 'fixture', data: {} })
    const right = t.api.createRecord({ kind: 'note', title: 'Synthetic right', workspaceId: 'default', actor, origin: 'fixture', data: {} })
    const id = run({ workingDirectory: tree(), submission: { kind: 'mixed', records: [right.id, left.id] } })
    const link = t.api.createLink({ fromId: left.id, toId: right.id, type: 'about', actor: { ...actor, sessionId: id } })
    t.client.sqlite.prepare('DELETE FROM links WHERE id = ?').run(link.id)
    expect((await finish(id)).statusCode).toBe(200)
    const seal = seals.readRunSeal(id)!.seal
    expect(seal.kind).toBe('mixed')
    expect(seal.git!.commit).toMatch(/^[a-f0-9]{40}$/)
    expect(seal.records!.records.map((r) => r.id)).toEqual([left.id, right.id].sort())
    // A LINK DELETED BEFORE THE SEAL IS NOT PINNED. A seal pins each link that stands when it is made, with a sealed
    // record at either end, by its id and the hash of its row (round BM, item 2aq); it copies no link, as criterion C34
    // says. This one was gone before the finish, so the seal's list of links is empty.
    expect(Object.keys(seal.records!).sort()).toEqual(['baseline', 'dependencies', 'links', 'records', 'says', 'through', 'workspace'])
    expect(seal.records!.links).toEqual([])
  })
  it('rejects a verdict for a different seal before recording a release', async () => {
    const id = run({ workingDirectory: tree() })
    expect((await finish(id)).statusCode).toBe(200)
    const lib = await import('../src/server/lib/inspection.ts')
    expect(() => lib.releaseOrRefuse({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'starter' },
      how: 'its starter', inspector: null, actor: { type: 'agent', id: 'starter' },
      check: { verdict: 'released', check: 'Synthetic verdict', missing: [], says: null, chaptersRead: [], read: null } })).toThrow(/current seal/)
    expect(t.api.getRecord(id)?.data['released']).toBeUndefined()
  })
  it('keeps unusual and off-area committed paths in the complete file list', async () => {
    const dir = tree()
    const strange = 'outside space\nname.txt'
    writeFileSync(join(dir, strange), 'outside\\n')
    git(dir, 'add', '.'); git(dir, 'commit', '-m', 'Unusual path')
    const seal = seals.captureGit(dir, 'main', ['work'])
    expect(seal.files.map((file) => file.path)).toEqual(['work/a.txt', strange].sort())
  })

  it('a browser finishes a run and reads the immutable seal from the check door', async () => {
    const { chromium } = await import('playwright')
    const address = await app.listen({ port: 0, host: '127.0.0.1' })
    const browser = await chromium.launch()
    try {
      // THE WORKER'S OWN KEY BESIDE ITS NAME, as its registration answered it, so the browser that ends the worker's run
      // proves the name it sends.
      const asTheWorker = { ...headers, [KEY_HEADER]: workerKey }
      const page = await browser.newPage({ extraHTTPHeaders: asTheWorker })
      const id = run({ workingDirectory: tree() })
      await page.goto(address + '/api/checks/' + id)
      const response = await page.evaluate(async ({ id, headers }) => {
        const finished = await fetch('/api/records/' + id, { method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ dataPatch: { state: 'finished' } }) })
        const read = await fetch('/api/checks/' + id, { headers })
        return { status: finished.status, read: await read.json() }
      }, { id, headers: asTheWorker })
      expect(response.status).toBe(200)
      expect(response.read.submission.seal.run).toBe(id)
      expect(response.read.submission.seal.git.files[0].hash).toBe(seals.sealHash('submitted\n'))
    } finally { await browser.close() }
  }, 60_000)

})

it('pins dependency revisions and both sides of link changes', async () => {
  const dependent = t.api.createRecord({ kind: 'note', title: 'Synthetic dependency', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  const submitted = t.api.createRecord({ kind: 'note', title: 'Synthetic dependent submission', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  const link = t.api.createLink({ fromId: submitted.id, toId: dependent.id, type: 'derived_from', actor })
  const id = run({ submission: { kind: 'records', records: [submitted.id] } })
  t.client.sqlite.prepare("UPDATE links SET type = 'consumes' WHERE id = ?").run(link.id)
  expect((await finish(id)).statusCode).toBe(200)
  t.api.patchRecord(dependent.id, { title: 'Later dependency content' }, actor)
  const manifest = seals.verifyRunSeal(id)!.seal.records!
  // THE DEPENDENCY IS PINNED BY POINTER, and the pointer still names the revision that held
  // "Synthetic dependency" after a later edit gave the record another title.
  expect(manifest.dependencies[0]!.record).toBe(dependent.id)
  expect(manifest.dependencies[0]!.hash).toHaveLength(64)
  expect(
    (t.client.sqlite.prepare('SELECT title FROM revisions WHERE id = ?').get(manifest.dependencies[0]!.id) as { title: string }).title,
  ).toBe('Synthetic dependency')
  // AND THE LINK IS PINNED AS IT STOOD AT THE SEAL, by its id and the hash of its row, and its row is not copied
  // (criterion C34; round BM, item 2aq). Its change before the seal is in that hash, not in the seal.
  expect(manifest.links?.map((one) => one.id)).toEqual([link.id])
  expect(manifest.links![0]!.hash).toHaveLength(64)
})
it('refuses confirmation of a release for a superseded seal', async () => {
  const id = run({ workingDirectory: tree() })
  expect((await finish(id)).statusCode).toBe(200)
  const first = seals.readRunSeal(id)!
  const lib = await import('../src/server/lib/inspection.ts')
  lib.releaseOrRefuse({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'starter' }, how: 'its starter', inspector: null, actor: { type: 'agent', id: 'starter' },
    check: { verdict: 'released', traced: syntheticTrace(t, first.seal.git!.files.map((one) => one.path)), check: 'Synthetic matching check.', missing: [], says: null, chaptersRead: [], read: { worktree: first.seal.git!.directory, tip: first.seal.git!.commit, ofItsOwn: true, sealId: first.id, sealHash: first.seal.hash, says: 'Read exact seal.' } } })
  // A WRITE SAYING THE RUN IS FINISHED AGAIN NO LONGER SEALS A RELEASED RUN (wave 13s round 3): the pointer stays.
  expect((await finish(id)).statusCode).toBe(200)
  expect(seals.readRunSeal(id)!.id).toBe(first.id)
  // A SUPERSEDED SEAL, as the record door made one before that change and as an older database can still hold.
  const resealed = seals.sealFinishedRun(id, { ...t.api.getRecord(id)!.data }, { type: 'agent', id: 'seal-worker' }, undefined)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.sealedTip', ?) WHERE id = ?").run(resealed.sealedTip, id)
  expect(seals.readRunSeal(id)!.id).not.toBe(first.id)
  expect(() => lib.confirmTheReport({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'starter' }, actor: { type: 'agent', id: 'starter' }, because: 'Synthetic stale confirmation' })).toThrow(/current seal/)
  expect(t.api.getRecord(id)!.data['confirmed']).toBeUndefined()
})

it('refuses an assembly that names the wrong seal or fork base', async () => {
  const id = run({ workingDirectory: tree() })
  expect((await finish(id)).statusCode).toBe(200)
  const response = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/assembled', headers: { ...headers, 'x-mole-office-actor-id': 'starter' }, payload: { changes: [], base: { ref: 'wrong-base', how: 'fork point', says: 'Synthetic wrong base' } } })
  expect(response.statusCode, response.body).toBe(409)
  expect(response.body).toContain('current seal')
})

it('seals against main when cutFrom resolves to the submitted HEAD, then retains that fork', async () => {
  const dir = tree(), id = run({ workingDirectory: dir, cutFrom: 'work' })
  expect((await finish(id)).statusCode).toBe(200)
  const first = seals.readRunSeal(id)!.seal.git!
  expect(first.forkBase).toBe(git(dir, 'rev-parse', 'main'))
  expect(first.files.map((one) => one.path)).toEqual(['work/a.txt'])
  git(dir, 'branch', '-f', 'main', 'HEAD')
  expect((await finish(id)).statusCode).toBe(200)
  expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(first.forkBase)
})

it('seals records with no code area and pins the actual revisions without borrowing a later code assignment', async () => {
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic records-only result', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  for (const servingAgent of ['records-worker', 'seal-worker']) {
    const id = run({ servingAgent, submission: { kind: 'records', records: [record.id] } })
    const response = await finish(id)
    expect(response.statusCode, response.body).toBe(200)
    const held = seals.verifyRunSeal(id)!.seal
    expect(held.area).toEqual([])
    expect(held.git).toBeNull()
    expect(held.records!.records.map(one => one.id)).toEqual([record.id])
    expect(
      (t.client.sqlite.prepare('SELECT title FROM revisions WHERE id = ?').get(held.records!.records[0]!.after.id) as { title: string }).title,
    ).toBe('Synthetic records-only result')
  }
})

it('still refuses empty or invalid record scope and code or mixed submissions without a code area', async () => {
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic scope boundary', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  for (const records of [[], [record.id, record.id], ['missing-submitted-record']]) {
    const id = run({ servingAgent: 'records-worker', submission: { kind: 'records', records } })
    const response = await finish(id)
    expect(response.statusCode, response.body).toBe(409)
    expect(seals.readRunSeal(id)).toBeNull()
    expect(t.api.getRecord(id)!.data['state']).toBe('running')
  }
  for (const kind of ['git', 'mixed']) {
    const id = run({ servingAgent: 'records-worker', workingDirectory: tree(), submission: { kind, records: [record.id] } })
    const response = await finish(id)
    expect(response.statusCode, response.body).toBe(409)
    expect(response.body).toContain('no registered work area')
    expect(seals.readRunSeal(id)).toBeNull()
  }
})

it('assembles a records check with an explicit null base and the matching record seal', async () => {
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic record check', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  const id = run({ submission: { kind: 'records', records: [record.id] } })
  expect((await finish(id)).statusCode).toBe(200)
  const held = seals.readRunSeal(id)!
  const checker = { ...headers, 'x-mole-office-actor-id': 'starter' }
  const read = { sealId: held.id, sealHash: held.seal.hash, worktree: 'record manifest ' + held.id, ofItsOwn: true, says: 'Synthetic check of the pinned record manifest.' }
  const prompt = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/prompt', headers: checker, payload: { changes: [], base: null } })
  expect(prompt.statusCode, prompt.body).toBe(200)
  expect(prompt.json().prompt).toContain('No Git base is required')
  expect(prompt.json().prompt).not.toContain('NOBODY SAID WHICH COMMIT')
  expect(prompt.json().prompt).toContain(held.seal.records!.records[0]!.after.hash)
  const assembled = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/assembled', headers: checker, payload: { changes: [], base: null, read } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  expect(assembled.json().whatTheCheckWouldRead.says).toContain('no Git base is required')
  const wrong = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/assembled', headers: checker, payload: { changes: [], base: null, read: { ...read, sealHash: 'wrong-hash' } } })
  expect(wrong.statusCode, wrong.body).toBe(409)
  for (const payload of [{ changes: [], base: { ref: 'invented', how: 'typed', says: 'Synthetic false Git baseline' } }, { changes: [{ path: 'invented', changes: 'Synthetic false code change' }], base: null }]) {
    const response = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/prompt', headers: checker, payload })
    expect(response.statusCode, response.body).toBe(400)
  }
})

it('does not accept a null Git base for code or mixed seals', async () => {
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic mixed check', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  for (const kind of ['git', 'mixed']) {
    const id = run({ workingDirectory: tree(), submission: { kind, records: [record.id] } })
    expect((await finish(id)).statusCode).toBe(200)
    for (const route of ['prompt', 'assembled']) {
      const response = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/' + route, headers: { ...headers, 'x-mole-office-actor-id': 'starter' }, payload: { changes: [], base: null } })
      expect(response.statusCode, response.body).toBe(400)
      expect(response.body).toContain('only valid for a sealed records or files submission')
    }
  }
})

it('keeps a reused agent’s registration task separate from every task explicitly linked to its new run', async () => {
  const task = (title: string) => t.api.createRecord({ kind: 'task', title, workspaceId: 'default', actor, origin: 'fixture', data: { command: title + ' synthetic instructions' } })
  const old = task('Synthetic old read-only task'), current = task('Synthetic new implementation task'), other = task('Synthetic additional task')
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'starter' },
    payload: { handle: 'reused-brief-worker', name: 'Synthetic reused worker', startedFor: old.id, workArea: [] } })
  expect(registered.statusCode, registered.body).toBe(201)
  const prior = run({ servingAgent: 'reused-brief-worker' })
  t.api.createLink({ fromId: prior, toId: old.id, type: 'about', actor })
  const before = t.api.getRecord(prior)
  const id = run({ servingAgent: 'reused-brief-worker', submission: { kind: 'records', records: [current.id] } })
  const links = [current, other].map(record => t.api.createLink({ fromId: id, toId: record.id, type: 'about', actor }))
  expect((await finish(id)).statusCode).toBe(200)
  const response = await app.inject({ url: '/api/checks/' + id, headers })
  expect(response.statusCode, response.body).toBe(200)
  const brief = response.json().brief
  expect(brief.startedFor.id).toBe(old.id)
  expect(brief.sessionTasks.map((one: { record: { id: string } }) => one.record.id).sort()).toEqual([current.id, other.id].sort())
  expect(brief.sessionTasks.map((one: { source: { linkId: string } }) => one.source.linkId).sort()).toEqual(links.map(one => one.id).sort())
  expect(brief.sessionTasks.every((one: { source: { sessionId: string; kind: string; taskReading: string } }) => one.source.sessionId === id && one.source.kind === 'explicit-about-link' && one.source.taskReading === 'current-record')).toBe(true)
  const prompt = await app.inject({ method: 'POST', url: '/api/checks/' + id + '/prompt', headers: { ...headers, 'x-mole-office-actor-id': 'starter' }, payload: { changes: [], base: null } })
  expect(prompt.statusCode, prompt.body).toBe(200)
  expect(prompt.json().prompt).toContain(current.data.command)
  expect(prompt.json().prompt).toContain(other.data.command)
  expect(prompt.json().prompt).toContain('do not select one task, grant permission')
  expect(t.api.getRecord(prior)).toEqual(before)
  const oldReading = await app.inject({ url: '/api/checks/' + prior, headers })
  expect(oldReading.json().brief.sessionTasks.map((one: { record: { id: string } }) => one.record.id)).toEqual([old.id])
})

it('uses a manual session’s explicit binding in its own project without rewriting the session or guessing another identity', async () => {
  const lib = await import('../src/server/lib/inspection.ts')
  const mapped = t.client.sqlite.prepare('SELECT a.record_id AS id FROM agent_records a JOIN agents g ON g.id=a.agent_id WHERE g.handle=?').get('records-worker') as { id: string }
  const ranAs = [{ workspaceId: 'default', agentId: mapped.id }]
  const record = t.api.createRecord({ kind: 'note', title: 'Synthetic manually bound result', workspaceId: 'default', actor, origin: 'fixture', data: {} })
  const session = t.api.createRecord({ kind: 'session', title: 'Synthetic manual attachment', workspaceId: 'default', actor: byTheStarter, origin: 'fixture',
    data: { state: 'running', ranAs, submission: { kind: 'records', records: [record.id] } } })
  expect(lib.theAgentOfARun(session)?.handle).toBe('records-worker')
  expect(lib.theAgentOfARun({ data: { ranAs } })).toBeNull()
  expect(lib.theAgentOfARun({ workspaceId: 'elsewhere', data: { ranAs } })).toBeNull()
  expect(lib.theAgentOfARun({ workspaceId: 'default', data: { ranAs: [...ranAs, ...ranAs] } })).toBeNull()
  // Exercise reader inputs directly; this does not claim the write API can store them.
  for (const servingAgent of [null, undefined, '', ' ', 0, false, {}, []]) {
    expect(lib.theAgentOfARun({ workspaceId: 'default', data: { servingAgent, ranAs } }), `explicit ${String(servingAgent)}`).toBeNull()
  }
  expect(lib.theAgentOfARun({ workspaceId: 'default', data: { servingAgent: 'missing-agent', ranAs } })).toBeNull()
  expect(lib.theAgentOfARun({ workspaceId: 'default', data: { servingAgent: 'seal-worker', ranAs } })?.handle).toBe('seal-worker')
  expect((await finish(session.id)).statusCode).toBe(200)
  expect(seals.verifyRunSeal(session.id)!.seal.area).toEqual([])
  // ASKED AS ITS STARTER, one of the two that may answer the check: the eligibility door also refuses a caller that the
  // verdict door would refuse, and seal-worker is neither the inspector nor records-worker's starter.
  const eligibility = await app.inject({ url: '/api/checks/' + session.id + '/eligibility', headers: asTheStarter })
  expect(eligibility.statusCode, eligibility.body).toBe(200)
  expect(eligibility.json().eligible).toBe(true)
  expect(t.api.getRecord(session.id)!.data['ranAs']).toEqual(ranAs)
  expect(t.api.getRecord(session.id)!.data['servingAgent']).toBeUndefined()
})
