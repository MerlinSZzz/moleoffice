// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
/**
 * A RUN WHOSE WORK IS A FOLDER OF FILES IS SEALED FROM THAT FOLDER, WITH NO GIT AT ALL.
 *
 * Option A of a decision, with a read path added as suggested in proposal
 * yTg28XxSOqdE. It is the piece the sandbox v1 handback left open
 * as P12: "the real fix is a check that can read a files entry".
 *
 * WHY. A seal could only be git work or records. A run whose whole contribution is bytes that were
 * never in any repository — carved off a disk after the September deletion — had to invent a git
 * history to be sealed at all, and its finish then refused because the staged files were "outside its
 * commit" (acceptance finding 43). One agent spent six rounds on that mechanism while his bytes were
 * right every time.
 *
 * WHAT IS PROVED
 *   1. A files run finishes with its bytes outside any commit, and the seal names every staged file by
 *      its path, its sha256 and its mode, with the folder it was read from and the one it lands in.
 *   2. The mode is 100755 when any execute bit is set, and 100644 otherwise.
 *   3. A symbolic link anywhere in the staged folder is refused by name, and nothing is stored.
 *   4. Anything inside a .git folder is refused, so a repository cannot be passed off as a folder.
 *   5. An empty folder, a relative path, a path that is not a folder, and a folder that is itself a
 *      link are each refused.
 *   6. A staged file changed or removed after the seal is named by the verification; a file ADDED
 *      after the seal changes nothing the seal holds, so it can never land as sealed work.
 *
 * MUTATION PROOF, named. In src/server/lib/sealed-tip.ts: send a files run through captureGit and case
 * 1 goes red with "outside its commit"; record every file as 100644 and case 2 goes red; skip the
 * re-hash in verifyRunSeal and case 6 goes red.
 *
 * THE LINK REFUSAL IS TWO LAYERS, AND ONE MUTATION DOES NOT REMOVE IT. The walk refuses a link it sees
 * with lstat, and the open refuses one again with O_NOFOLLOW, which also closes the moment between
 * looking and reading. Taking only the lstat check out still refuses the link — as "neither a file nor
 * a folder" — so case 3 goes red on its wording, not because a link was followed. Taking BOTH out
 * (stat instead of lstat, and no O_NOFOLLOW) genuinely follows the link: the finish succeeds with a
 * seal holding /etc/hostname's bytes, and case 3 goes red on the 200. Both were run on 23 September
 * 2026 and both are red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'files-worker' }
const actor = { type: 'agent' as const, id: 'files-worker' }
const folders: string[] = []

/** A staged folder shaped like a recovery: the paths the files will land at, under a scratch root. */
function staged(files: Record<string, string> = { 'runs/console_1/E1a/ticks.jsonl': '{"t":1}\n', 'runs/console_1/RECOVERY.md': '# recovered\n' }): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'files-seal-'))
  folders.push(dir)
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

function aRoot(): string {
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'files-root-'))
  folders.push(dir)
  return dir
}

function run(stagedAt: string, root: string = aRoot()): string {
  return t.api.createRecord({
    kind: 'session', title: 'Synthetic files run', workspaceId: 'default', actor, origin: 'fixture',
    data: { state: 'running', servingAgent: 'files-worker', submission: { kind: 'files', stagedAt, root } },
  }).id
}

async function finish(id: string) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { state: 'finished' } } })
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; seals = await import('../src/server/lib/sealed-tip.ts')
  const parent = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }, payload: { handle: 'files-starter', name: 'Synthetic starter' } })
  expect(parent.statusCode, parent.body).toBe(201)
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...headers, 'x-mole-office-actor-id': 'files-starter' },
    payload: { handle: 'files-worker', name: 'Synthetic files worker', workArea: ['runs'] } })
  expect(worker.statusCode, worker.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close(); for (const dir of folders) rmSync(dir, { recursive: true, force: true }) })

describe('a files run is sealed from its staged folder', () => {
  it('finishes with its bytes outside any commit, and names every file by path, sha256 and mode', async () => {
    const dir = staged(), root = aRoot(), id = run(dir, root)
    const r = await finish(id)
    expect(r.statusCode, r.body).toBe(200)
    const held = seals.readRunSeal(id)!
    expect(held.seal.kind).toBe('files')
    // NO GIT AT ALL: that is the whole point, and it is what lets a recovery finish.
    expect(held.seal.git).toBeNull()
    expect(held.seal.files?.stagedAt).toBe(dir)
    expect(held.seal.files?.root).toBe(root)
    expect(held.seal.files?.files).toEqual([
      { path: 'runs/console_1/E1a/ticks.jsonl', hash: seals.sealHash('{"t":1}\n'), mode: '100644' },
      { path: 'runs/console_1/RECOVERY.md', hash: seals.sealHash('# recovered\n'), mode: '100644' },
    ])
    expect(held.seal.area).toEqual(['runs'])
    expect(seals.verifyRunSeal(id)?.id).toBe(held.id)
  })

  it('records 100755 for a file with an execute bit and 100644 for one without', async () => {
    const dir = staged({ 'tools/run.sh': '#!/bin/sh\n', 'data/plain.txt': 'plain\n' })
    chmodSync(join(dir, 'tools', 'run.sh'), 0o755)
    chmodSync(join(dir, 'data', 'plain.txt'), 0o644)
    const id = run(dir)
    expect((await finish(id)).statusCode).toBe(200)
    const modes = Object.fromEntries((seals.readRunSeal(id)!.seal.files?.files ?? []).map((one) => [one.path, one.mode]))
    expect(modes).toEqual({ 'data/plain.txt': '100644', 'tools/run.sh': '100755' })
  })

  it('refuses a symbolic link anywhere in the folder, by name, and stores neither a finish nor a seal', async () => {
    const dir = staged()
    symlinkSync('/etc/hostname', join(dir, 'runs', 'console_1', 'elsewhere'))
    const id = run(dir)
    const r = await finish(id)
    expect(r.statusCode, r.body).toBe(409)
    expect(r.body).toContain('runs/console_1/elsewhere')
    expect(r.body).toMatch(/link/i)
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
    expect(seals.readRunSeal(id)).toBeNull()
  })

  it('refuses anything inside a .git folder, so a repository cannot be passed off as a folder', async () => {
    const dir = staged({ 'runs/a.jsonl': '{}\n', '.git/HEAD': 'ref: refs/heads/main\n' })
    const r = await finish(run(dir))
    expect(r.statusCode, r.body).toBe(409)
    expect(r.body).toContain('.git')
  })

  it('refuses an empty folder, a relative path, a path that is not a folder, and a folder that is a link', async () => {
    const empty = mkdtempSync(join(process.cwd(), '.logs', 'files-empty-')); folders.push(empty)
    const aFile = join(staged(), 'runs', 'console_1', 'RECOVERY.md')
    const real = staged(), link = join(aRoot(), 'a-link-to-a-folder')
    symlinkSync(real, link)
    for (const [stagedAt, says] of [[empty, /no files/i], ['relative/folder', /absolute/i], [aFile, /not a folder/i], [link, /link/i]] as const) {
      const r = await finish(run(stagedAt))
      expect(r.statusCode, `${stagedAt}: ${r.body}`).toBe(409)
      expect(r.body).toMatch(says)
    }
  })

  it('names a staged file changed or removed after the seal, and ignores one added after it', async () => {
    const changed = staged(), changedId = run(changed)
    expect((await finish(changedId)).statusCode).toBe(200)
    writeFileSync(join(changed, 'runs', 'console_1', 'RECOVERY.md'), '# edited after the seal\n')
    expect(() => seals.verifyRunSeal(changedId)).toThrow(/RECOVERY\.md/)

    const removed = staged(), removedId = run(removed)
    expect((await finish(removedId)).statusCode).toBe(200)
    unlinkSync(join(removed, 'runs', 'console_1', 'E1a', 'ticks.jsonl'))
    expect(() => seals.verifyRunSeal(removedId)).toThrow(/ticks\.jsonl/)

    // A FILE ADDED AFTER THE SEAL is not sealed: the seal still holds exactly what it held, and the
    // queue binds an entry to sealed paths at sealed hashes, so the addition can never land as this work.
    const added = staged(), addedId = run(added)
    expect((await finish(addedId)).statusCode).toBe(200)
    const before = seals.readRunSeal(addedId)!.seal.files?.files
    writeFileSync(join(added, 'runs', 'late.txt'), 'added after the seal\n')
    expect(seals.verifyRunSeal(addedId)?.seal.files?.files).toEqual(before)
  })
})

/**
 * THE OFFICE'S SIDE OF A CHECK OF A FILES RUN (part 4 of the design). A seal nobody can check would
 * stop a recovery one door later, so each door a check goes through is proved here for a files run:
 * eligibility, the prompt, the assembly, and the release the queue reads.
 *
 * MUTATION PROOF, named, each run alone on 23 September 2026, with what each one actually turned red:
 *   - take `filesSealed` out of the eligibility facts: case 7 goes red with "a resolvable submitted tip
 *     is unknown", and so do 8, 9 and 10, because every door asks eligibility first;
 *   - drop the files branch of baseForSubmission: case 8 goes red because the null base a files check
 *     needs is refused ("only valid for a sealed records or files submission"), and 9 and 10 on the
 *     same refusal;
 *   - drop the check that the changes are exactly the sealed files: case 9 goes red, a list short of
 *     one sealed file answered 200;
 *   - leave `before` out of asTheReleaseSpellsIt: case 10 goes red, the release carries no before;
 *   - leave the files facts out of readWhatWasRead in src/shared/releasing.ts: case 10 goes red on the
 *     read-back, although the stored release holds them — the bug this case missed until it read back;
 *   - drop the files sentence about the base: case 8 goes red, the prompt no longer says why there is
 *     no base.
 */
describe("the office's side of a check of a files run", () => {
  const checker = { ...headers, 'x-mole-office-actor-id': 'files-starter' }
  const PATHS = ['runs/console_1/E1a/ticks.jsonl', 'runs/console_1/RECOVERY.md']
  const changes = (paths: string[] = PATHS) => paths.map((path) => ({ path, changes: `ADDED ${path}: nothing is landed at this path now.\n` }))
  async function aFinishedFilesRun() {
    const dir = staged(), id = run(dir)
    expect((await finish(id)).statusCode).toBe(200)
    return { id, dir, held: seals.readRunSeal(id)! }
  }

  // THE CHECK OF RUN pMPH32kY-Bld, 23 SEPTEMBER 2026, refused A1 for exactly this: the kinds door, the one
  // declaration chapter 4 rule 2 sends a worker to, still said a submission was git, records or mixed,
  // and still said a handed-on path of any files entry bounces because no check can read one.
  it('is described by the kinds door as the office takes it, and so are the bindings of an entry on its seal', async () => {
    const session = await app.inject({ url: '/api/kinds/session', headers })
    expect(session.statusCode, session.body).toBe(200)
    const submission = (session.json().kind.fields as { key: string; description: string }[]).find((one) => one.key === 'submission')!
    for (const word of ['files', '`stagedAt`', '`root`', 'with no git at all']) expect(submission.description).toContain(word)
    const entry = await app.inject({ url: '/api/kinds/merge_entry', headers })
    expect(entry.statusCode, entry.body).toBe(200)
    const rules = (entry.json().kind.rules as string[]).join(' ')
    expect(rules).not.toContain('because no check of a files entry can read it yet')
    expect(rules).toContain('names a sealed path at its sealed hash and mode, in the root the run sealed')
    expect(rules).toContain('a modify replaces exactly the file the check read')
  })

  it('is eligible for a check once finished: its seal stands where a tip stands', async () => {
    const { id } = await aFinishedFilesRun()
    const r = await app.inject({ url: '/api/checks/' + id + '/eligibility', headers: checker })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().eligible, r.body).toBe(true)
  })

  it('assembles its prompt with no git base, says why there is none, and refuses a base sent for one', async () => {
    const { id, held } = await aFinishedFilesRun()
    const prompt = await app.inject({ method: 'POST', url: `/api/checks/${id}/prompt`, headers: checker, payload: { changes: changes(), base: null } })
    expect(prompt.statusCode, prompt.body).toBe(200)
    expect(prompt.json().prompt).toContain(`a folder of files, sealed as ${held.id}`)
    expect(prompt.json().prompt).not.toContain('NOBODY SAID WHICH COMMIT')
    const based = await app.inject({ method: 'POST', url: `/api/checks/${id}/prompt`, headers: checker, payload: { changes: changes(), base: { ref: 'invented', how: 'typed', says: 'Synthetic base for a files run' } } })
    expect(based.statusCode, based.body).toBe(400)
    expect(based.body).toContain('takes no Git base')
  })

  it('refuses changes that leave out a sealed file or add one the seal does not hold', async () => {
    const { id } = await aFinishedFilesRun()
    const short = await app.inject({ method: 'POST', url: `/api/checks/${id}/prompt`, headers: checker, payload: { changes: changes([PATHS[0]!]), base: null } })
    expect(short.statusCode, short.body).toBe(400)
    expect(short.body).toContain(`Not handed over: ${PATHS[1]}`)
    const long = await app.inject({ method: 'POST', url: `/api/checks/${id}/prompt`, headers: checker, payload: { changes: changes([...PATHS, 'runs/invented.txt']), base: null } })
    expect(long.statusCode, long.body).toBe(400)
    expect(long.body).toContain('Not in the seal: runs/invented.txt')
  })

  it('keeps the staged folder and the before hashes from the assembly to the release, where the queue reads them', async () => {
    const { id, dir, held } = await aFinishedFilesRun()
    const before = { 'runs/console_1/RECOVERY.md': seals.sealHash('# an older text\n') }
    const read = { sealId: held.id, sealHash: held.seal.hash, worktree: '/a/copy/of/its/own', ofItsOwn: true, says: 'Synthetic read of a verified copy.', staged: dir, before }
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${id}/assembled`, headers: checker, payload: { changes: changes(), base: null, read } })
    expect(assembled.statusCode, assembled.body).toBe(201)
    const unhashed = await app.inject({ method: 'POST', url: `/api/checks/${id}/assembled`, headers: checker, payload: { changes: changes(), base: null, read: { ...read, before: { 'runs/console_1/RECOVERY.md': 'not-a-sha256' } } } })
    expect(unhashed.statusCode, unhashed.body).toBe(400)
    const lib = await import('../src/server/lib/inspection.ts')
    lib.releaseOrRefuse({ runId: id, workspaceId: 'default', by: { kind: 'agent', id: 'files-starter' }, how: 'its starter', inspector: null, actor: { type: 'agent', id: 'files-starter' },
      check: { verdict: 'released', traced: syntheticTrace(t, [...PATHS]), check: 'Synthetic check of a verified copy.', missing: [], says: null, chaptersRead: [], read } })
    const released = t.api.getRecord(id)!.data['released'] as { read?: Record<string, unknown> }
    expect(released.read?.staged).toBe(dir)
    expect(released.read?.before).toEqual(before)
    // AND READ BACK THE WAY THE QUEUE READS IT. Stored is not enough: until 23 September 2026 the reader
    // rebuilt a stored read field by field and dropped both, so the queue found no before at all.
    const { howARunStands } = await import('../src/shared/releasing.ts')
    const stands = howARunStands(t.api.getRecord(id)!.data)
    expect(stands.released?.read?.staged).toBe(dir)
    expect(stands.released?.read?.before).toEqual(before)
  })
})
