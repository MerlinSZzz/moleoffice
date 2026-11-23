// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES CHECKER SAYS WHERE A FILE CAME FROM, AND SAYS SO WHEN IT COULD NOT LOOK.
 *
 * The decision of 23 September 2026, A2, agreed that morning, and acceptance finding
 * 45. The checker's comparison with an original could be switched off, or pointed
 * at the new file itself, and either way it said nothing:
 *   - The first half was found on entry k5U_ec8zgO9U. A `source` that was a path followed by prose
 *     named no file, so the comparison never ran and no line said so.
 *   - The second half was found on the same entry. A `source` that was the staged file itself was
 *     called "byte for byte the file at its source".
 *
 * WHAT IS PROVED
 *   1. An absolute source that is not a file here is said, and the file is handed on.
 *   2. A source inside the folder the entry was staged in, or the folder it was held in, is not an
 *      original, and the checker says so.
 *   3. An original a files seal recorded counts only where the run could not have written it (the
 *      rule): `couldWrite` true or null hands the file on, and false lets the comparison decide it.
 *   4. An original that changed after the run finished is a decided failure, by name.
 *   5. The one named repair, trailing-nul-trim, is recomputed from both files. Only a NUL tail passes.
 *   6. A faithful copy over the 256 MiB content limit is decided by its hash, in the words the landing
 *      repeats (TUD14-5BmQOc), but never for a protected path.
 *   7. A protected target is decided as `protected` beside being handed on, so the queue can tell it
 *      from any other handed-on path without reading a sentence.
 *
 * MUTATION PROOF, each run alone on 23 September 2026 in tools/checks/files-changeset.mjs, with what it
 * turned red:
 *   - the loud line taken out, the old silent skip back: case 1 red, the file handed on only as "No
 *     content check exists", with no word that nothing was compared. (A first try that blanked the
 *     whole branch went red by crashing in `within`, which proves nothing; it was redone as this.)
 *   - a staged or held file taken as its original: case 2 red;
 *   - `couldWrite` ignored: case 3 red, an original inside the sandbox decided as one;
 *   - a changed original not refused: case 4 red, exit 0;
 *   - the NUL tail not checked: case 5 red, "not padding" passed as a repair;
 *   - a faithful copy over the limit handed on as before: case 6 red; the protected check dropped from
 *     that rule: case 6 red on the protected path decided by its hash;
 *   - `protected` not recorded as decided: case 7 red.
 * And after the check of run 5OEGnN3JXrRs:
 *   - the null sentence naming only the benign case again: case 3 red, and the merge tool's origin case
 *     with it.
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync, ftruncateSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'checks', 'files-changeset.mjs')

let place = ''
let world = ''
let originals = ''

interface Verdict {
  decided: { path: string; check: string; ok: boolean; detail: string }[]
  needsJudgment: { path: string; why: string }[]
  error?: string
}
interface Ran { status: number | null; stderr: string; verdict: Verdict }

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

/** A changeset folder with its blobs and a manifest; `top` adds top-level keys such as stagedAt. */
function changeset(operations: unknown[], blobs: Record<string, Buffer | string> = {}, top: Record<string, unknown> = {}): { manifest: string; folder: string } {
  const folder = mkdtempSync(join(place, 'change-'))
  for (const [path, bytes] of Object.entries(blobs)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), bytes)
  }
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ operations, ...top }))
  return { manifest: join(folder, 'manifest.json'), folder }
}

function check(manifest: string): Promise<Ran> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, '--manifest', manifest, '--root', world], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk: Buffer) => (stderr += String(chunk)))
    child.on('close', (status) => {
      let verdict: Verdict
      try {
        verdict = JSON.parse(stdout) as Verdict
      } catch {
        verdict = { decided: [], needsJudgment: [], error: `not JSON: ${stdout.slice(0, 300)} ${stderr.slice(0, 300)}` }
      }
      done({ status, stderr, verdict })
    })
  })
}

const judged = (ran: Ran): string => ran.verdict.needsJudgment.map((one) => one.why).join(' ')
const decided = (ran: Ran, check: string) => ran.verdict.decided.filter((one) => one.check === check)

/** A file of this many zero bytes, made sparse, so a quarter-gigabyte costs no disk. */
function zeros(path: string, size: number): void {
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'w')
  try {
    ftruncateSync(fd, size)
  } finally {
    closeSync(fd)
  }
}

const RECORDING = Buffer.from('{"t":1}\n{"t":2}\n')
/** An add of the recording to a path the checker has no content reader for, so only its origin can decide it. */
const addOf = (extra: Record<string, unknown> = {}, target = 'runs/r.bin') => ({ op: 'add', target, blob: 'r.bin', before_hash: 'absent', after_hash: sha256(RECORDING), source: 'written by a test', ...extra })

beforeAll(() => {
  mkdirSync(join(REPO, '.scratch'), { recursive: true })
  place = aTestDatabaseFolder('checks-origin', join(REPO, '.scratch'))
  world = join(place, 'world')
  originals = join(place, 'originals')
  mkdirSync(join(world, '.mole-office'), { recursive: true })
  copyFileSync(join(REPO, '.mole-office', 'protected.json'), join(world, '.mole-office', 'protected.json'))
  mkdirSync(join(world, 'runs'), { recursive: true })
  mkdirSync(originals, { recursive: true })
  writeFileSync(join(originals, 'r.bin'), RECORDING)
  writeFileSync(join(originals, 'padded.bin'), Buffer.concat([RECORDING, Buffer.alloc(1174)]))
  writeFileSync(join(originals, 'not-padding.bin'), Buffer.concat([RECORDING, Buffer.from('x'), Buffer.alloc(10)]))
})

afterAll(() => {
  if (place !== '') rmSync(place, { recursive: true, force: true })
})

describe('a source the checker could not compare', () => {
  it('says so when an absolute source names no file here, and hands the file on', async () => {
    const said = `${join(originals, 'r.bin')} with its trailing NUL block padding removed`
    const ran = await check(changeset([addOf({ source: said })], { 'r.bin': RECORDING }).manifest)
    expect(ran.status, JSON.stringify(ran.verdict)).toBe(0)
    expect(judged(ran)).toContain(`Source bytes not compared: ${said} is not a file on this machine`)
    expect(decided(ran, 'source-bytes')).toEqual([])
  })

  it('does not take the staged file, or the held one, as its own original', async () => {
    const staged = join(place, 'staged')
    mkdirSync(join(staged, 'runs'), { recursive: true })
    writeFileSync(join(staged, 'runs', 'r.bin'), RECORDING)
    const fromStaged = await check(changeset([addOf({ source: join(staged, 'runs', 'r.bin') })], { 'r.bin': RECORDING }, { stagedAt: staged }).manifest)
    expect(judged(fromStaged)).toContain('inside the folder this entry was staged in, so it is the new file itself and not an original')
    expect(decided(fromStaged, 'source-bytes')).toEqual([])

    const held = changeset([], { 'r.bin': RECORDING })
    writeFileSync(held.manifest, JSON.stringify({ operations: [addOf({ source: join(held.folder, 'r.bin') })] }))
    const fromTheHold = await check(held.manifest)
    expect(judged(fromTheHold)).toContain('in the folder this entry was held in, so it is the new file itself')
    expect(decided(fromTheHold, 'source-bytes')).toEqual([])
  })
})

describe('an original a files seal recorded', () => {
  const origin = (couldWrite: boolean | null, path = join(originals, 'r.bin'), sha = sha256(RECORDING)) => ({ path, sha256: sha, couldWrite })

  it('counts only where the run could not have written it', async () => {
    const inside = await check(changeset([addOf({ origin: origin(true) })], { 'r.bin': RECORDING }).manifest)
    expect(judged(inside)).toContain('lies inside the sandbox the run worked in')
    expect(decided(inside, 'source-bytes')).toEqual([])

    const unknown = await check(changeset([addOf({ origin: origin(null) })], { 'r.bin': RECORDING }).manifest)
    // NULL IS TWO CASES, and the sentence may not read as the benign one alone: no sandbox recorded, or a
    // folder its ledger row does not vouch for, the lookalike (the check of run 5OEGnN3JXrRs).
    expect(judged(unknown)).toContain('The office cannot say where the run could write: it recorded no sandbox for the run, or one whose folder')
    expect(decided(unknown, 'source-bytes')).toEqual([])

    const outside = await check(changeset([addOf({ origin: origin(false) })], { 'r.bin': RECORDING }).manifest)
    expect(outside.status, JSON.stringify(outside.verdict)).toBe(0)
    expect(decided(outside, 'origin')).toMatchObject([{ ok: true }])
    expect(decided(outside, 'source-bytes')).toMatchObject([{ ok: true, detail: expect.stringContaining(`byte for byte its original ${join(originals, 'r.bin')} (sha256 ${sha256(RECORDING)})`) }])
    // A FAITHFUL COPY OF A TYPE THE CHECKER HAS NO READER FOR IS NOT HANDED ON, which is the point of
    // knowing the original: nothing is left for a model to judge.
    expect(outside.verdict.needsJudgment).toEqual([])
  })

  it('refuses by name an original that changed after the run finished', async () => {
    const ran = await check(changeset([addOf({ origin: origin(false, join(originals, 'r.bin'), sha256('what it held at finish')) })], { 'r.bin': RECORDING }).manifest)
    expect(ran.status).toBe(1)
    expect(decided(ran, 'origin')).toMatchObject([{ ok: false, detail: expect.stringContaining('changed after the run finished') }])
  })

  it('recomputes the trailing NUL repair from both files, and passes only a NUL tail', async () => {
    const padded = join(originals, 'padded.bin')
    const repaired = await check(changeset([addOf({ origin: { ...origin(false, padded, sha256(Buffer.concat([RECORDING, Buffer.alloc(1174)]))), transform: 'trailing-nul-trim' } })], { 'r.bin': RECORDING }).manifest)
    expect(repaired.status, JSON.stringify(repaired.verdict)).toBe(0)
    expect(decided(repaired, 'source-bytes')).toMatchObject([{ ok: true, detail: expect.stringContaining('with 1174 trailing NUL bytes removed') }])
    expect(repaired.verdict.needsJudgment).toEqual([])

    const notPadding = join(originals, 'not-padding.bin')
    const wrong = await check(changeset([addOf({ origin: { ...origin(false, notPadding, sha256(Buffer.concat([RECORDING, Buffer.from('x'), Buffer.alloc(10)]))), transform: 'trailing-nul-trim' } })], { 'r.bin': RECORDING }).manifest)
    expect(judged(wrong)).toContain(`holds a byte that is not NUL at byte ${String(RECORDING.length)}`)
    expect(decided(wrong, 'source-bytes')).toEqual([])
  })
})

describe('a file over the content limit', () => {
  const SIZE = 256 * 1024 * 1024 + 1

  it('is decided by its hash when it is a faithful copy, in the words the landing repeats, and never where it is protected', async () => {
    const original = join(place, 'big', 'original.bin')
    zeros(original, SIZE)
    const hash = createHash('sha256')
    const piece = Buffer.alloc(8 * 1024 * 1024)
    for (let left = SIZE; left > 0; left -= Math.min(left, piece.length)) hash.update(piece.subarray(0, Math.min(left, piece.length)))
    const digest = hash.digest('hex')
    const folder = mkdtempSync(join(place, 'change-'))
    zeros(join(folder, 'big.bin'), SIZE)
    const entry = (target: string) => ({ op: 'add', target, blob: 'big.bin', before_hash: 'absent', after_hash: digest, source: 'a test', origin: { path: original, sha256: digest, couldWrite: false } })
    writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ operations: [entry('runs/big.bin')] }))
    const ran = await check(join(folder, 'manifest.json'))
    expect(ran.status, JSON.stringify(ran.verdict)).toBe(0)
    expect(decided(ran, 'content-limit')).toMatchObject([{ ok: true, detail: expect.stringContaining('over the 256 MiB content limit; decided by its hash') }])
    expect(decided(ran, 'content-limit')[0]!.detail).toContain(`its original ${original} (sha256 ${digest})`)
    expect(ran.verdict.needsJudgment).toEqual([])

    writeFileSync(join(folder, 'manifest.json'), JSON.stringify({ operations: [entry('data/second.db')] }))
    const guarded = await check(join(folder, 'manifest.json'))
    expect(decided(guarded, 'content-limit')).toEqual([])
    expect(judged(guarded)).toContain('more than the 268435456 this checker reads for a content check')
  }, 60_000)
})

describe('where it lands', () => {
  it('records a protected target as decided, beside handing it on', async () => {
    const ran = await check(changeset([{ op: 'add', target: 'data/second.db', blob: 's.db', before_hash: 'absent', after_hash: sha256('x'), source: 'a test' }], { 's.db': 'x' }).manifest)
    expect(ran.status).toBe(0)
    expect(decided(ran, 'protected')).toMatchObject([{ path: 'data/second.db', ok: true, detail: expect.stringContaining('"data/*.db*"') }])
    expect(judged(ran)).toContain('protected area')
  })
})
