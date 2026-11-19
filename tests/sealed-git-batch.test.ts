// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic Git fixtures. The real 169-path timing input is measured separately in cache. */
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let seals: typeof import('../src/server/lib/sealed-tip.ts')
let resources: typeof import('../src/server/lib/resources.ts')
const directories: string[] = []
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}
function commit(dir: string): void { git(dir, 'add', '-A'); git(dir, 'commit', '-qm', 'Synthetic committed input') }
function tree() {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-git-batch-')); directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic Git batch fixture'); git(dir, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'anchor.txt'), 'baseline\n')
  writeFileSync(join(dir, 'deleted.txt'), 'will be deleted\n')
  writeFileSync(join(dir, '.gitignore'), 'ignored/\nelsewhere/\n')
  commit(dir)
  const base = git(dir, 'rev-parse', 'HEAD'); git(dir, 'switch', '-qc', 'submitted')
  return { dir, base }
}
beforeAll(async () => {
  t = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  seals = await import('../src/server/lib/sealed-tip.ts')
})
afterEach(() => vi.restoreAllMocks())
afterAll(() => { t?.close(); for (const dir of directories) rmSync(dir, { recursive: true, force: true }) })

it('keeps every binary, unusual, executable, symlink and deleted path without per-file Git processes', () => {
  const { dir, base } = tree()
  const expected: { path: string; hash: string | null; mode: string | null }[] = []
  for (let i = 0; i < 96; i++) {
    const path = `file-${String(i).padStart(3, '0')}.bin`, bytes = Buffer.from([i, 0, 10, 255, 128, 13])
    writeFileSync(join(dir, path), bytes); expected.push({ path, hash: digest(bytes), mode: '100644' })
  }
  const unusual = 'name with space\tand\nline.bin', bytes = Buffer.from([0, 255, 10, 0, 195, 169])
  writeFileSync(join(dir, unusual), bytes); expected.push({ path: unusual, hash: digest(bytes), mode: '100644' })
  writeFileSync(join(dir, 'run.sh'), '#!/bin/sh\nexit 0\n'); chmodSync(join(dir, 'run.sh'), 0o755)
  expected.push({ path: 'run.sh', hash: digest('#!/bin/sh\nexit 0\n'), mode: '100755' })
  const target = 'missing target\nwith space'; symlinkSync(target, join(dir, 'dangling-link'))
  expected.push({ path: 'dangling-link', hash: digest(target), mode: '120000' })
  writeFileSync(join(dir, 'empty'), ''); expected.push({ path: 'empty', hash: digest(''), mode: '100644' })
  rmSync(join(dir, 'deleted.txt')); expected.push({ path: 'deleted.txt', hash: null, mode: null }); commit(dir)
  const reads = vi.spyOn(resources, 'readGit')
  const actual = seals.captureGit(dir, base, ['anchor.txt'])
  // A FIRST SEAL SAYS WHY IT READ ITS BASE: a full commit is the one the run's record names.
  const forkBaseSays = `The fork base is the merge base of the tip and ${base}. The run's record names this commit.`
  expect(actual).toEqual({ repository: join(dir, '.git'), directory: dir, forkBase: base, forkBaseSays, commit: git(dir, 'rev-parse', 'HEAD'), files: expected.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) })
  // The measured defect was two new Git processes per changed file. This bound catches its return.
  expect(reads.mock.calls.length).toBeLessThanOrEqual(16)
})

it('preserves a per-object 64 MiB allowance when the aggregate exceeds 64 MiB', () => {
  const { dir, base } = tree()
  const expected = []
  for (const [path, fill] of [['large-a.bin', 17], ['large-b.bin', 231]] as const) {
    const bytes = Buffer.alloc(34 * 1024 * 1024, fill); bytes[1234] = 0; bytes[4321] = 10
    writeFileSync(join(dir, path), bytes); expected.push({ path, hash: digest(bytes), mode: '100644' })
  }
  commit(dir)
  expect(seals.captureGit(dir, base, ['anchor.txt']).files).toEqual(expected)
}, 120_000)

// A FILE OVER 64 MiB IS SEALED, NOT REFUSED (acceptance finding 23, 22 September 2026). The seal used
// to refuse any blob over one batch read's 64 MiB, so the files lane could not carry the
// recovered recordings of 75.7 and 83.5 MB. Now a large file is read from disk in pieces, and git's
// own name for its bytes must be the committed blob.
it('seals an individual object over 64 MiB, with the SHA-256 of its bytes', () => {
  const { dir, base } = tree()
  const bytes = Buffer.alloc(65 * 1024 * 1024, 6); bytes[77] = 0; bytes[65 * 1024 * 1024 - 1] = 10
  writeFileSync(join(dir, 'large.bin'), bytes); commit(dir)
  expect(seals.captureGit(dir, base, ['anchor.txt']).files).toEqual([{ path: 'large.bin', hash: digest(bytes), mode: '100644' }])
}, 120_000)

it('refuses a file over 64 MiB whose bytes on disk are not the committed blob, even when git reports it unchanged', () => {
  const { dir, base } = tree()
  const bytes = Buffer.alloc(65 * 1024 * 1024, 6); writeFileSync(join(dir, 'large.bin'), bytes); commit(dir)
  // SAME SIZE, ONE BYTE CHANGED, and git told not to look: the dirty check passes, so only the
  // comparison with the committed blob can catch it.
  git(dir, 'update-index', '--assume-unchanged', 'large.bin')
  bytes[1000] = 7; writeFileSync(join(dir, 'large.bin'), bytes)
  expect(git(dir, 'status', '--porcelain')).toBe('')
  expect(() => seals.captureGit(dir, base, ['anchor.txt'])).toThrow('The content of large.bin differs from the submitted commit.')
}, 120_000)

it('keeps dirty and untracked refusals and allows ignored files inside and outside the area', () => {
  const { dir, base } = tree(); writeFileSync(join(dir, 'new.txt'), 'committed'); commit(dir)
  writeFileSync(join(dir, 'anchor.txt'), 'dirty')
  expect(() => seals.captureGit(dir, base, ['ignored'])).toThrow(/anchor.txt/)
  git(dir, 'restore', 'anchor.txt'); writeFileSync(join(dir, 'untracked.txt'), 'unknown')
  expect(() => seals.captureGit(dir, base, ['ignored'])).toThrow(/untracked.txt/)
  // AN IGNORED FILE INSIDE THE AREA IS NOT WORK OUTSIDE THE COMMIT. Git never tracks it, so it can
  // never reach main, and the seal neither refuses over it nor names it among the files it seals.
  rmSync(join(dir, 'untracked.txt')); mkdirSync(join(dir, 'ignored')); writeFileSync(join(dir, 'ignored', 'held.txt'), 'ignored')
  expect(seals.captureGit(dir, base, ['ignored']).files).toEqual([{ path: 'new.txt', hash: digest('committed'), mode: '100644' }])
  mkdirSync(join(dir, 'elsewhere')); writeFileSync(join(dir, 'elsewhere', 'allowed.txt'), 'outside')
  expect(seals.captureGit(dir, base, ['ignored']).files).toEqual([{ path: 'new.txt', hash: digest('committed'), mode: '100644' }])
})

it('still refuses a file replaced by a same-named directory instead of reporting only a deletion', () => {
  const { dir, base } = tree(); rmSync(join(dir, 'deleted.txt')); mkdirSync(join(dir, 'deleted.txt'))
  writeFileSync(join(dir, 'deleted.txt', 'child'), 'directory child'); commit(dir)
  expect(() => seals.captureGit(dir, base, ['anchor.txt'])).toThrow(/deleted.txt/)
})

it('still refuses committed submodules', () => {
  const { dir, base } = tree(); mkdirSync(join(dir, 'submodule'))
  git(dir, 'update-index', '--add', '--cacheinfo', `160000,${base},submodule`); git(dir, 'commit', '-qm', 'Synthetic gitlink')
  expect(() => seals.captureGit(dir, base, ['anchor.txt'])).toThrow('The submitted Git work cannot be sealed: submodule is a submodule, which this reader does not read.')
})

it('uses the supplied fixed ancestor even when the original branch moves', () => {
  const { dir, base } = tree(); writeFileSync(join(dir, 'new.txt'), 'submitted'); commit(dir)
  git(dir, 'branch', '-f', 'main', 'HEAD')
  const captured = seals.captureGit(dir, base, ['anchor.txt'], true)
  expect(captured.forkBase).toBe(base)
  expect(captured.files).toEqual([{ path: 'new.txt', hash: digest('submitted'), mode: '100644' }])
  expect(() => seals.captureGit(dir, 'missing-fixed-ancestor', ['anchor.txt'], true)).toThrow(/cannot be sealed/)
})

it('refuses bytes changed after the initial dirty scan and before their content comparison', () => {
  const { dir, base } = tree(); writeFileSync(join(dir, 'new.txt'), 'submitted'); commit(dir)
  const realRead = resources.readGit
  vi.spyOn(resources, 'readGit').mockImplementation((...readArgs) => {
    const [, args] = readArgs
    const bytes = realRead(...readArgs)
    if (args[0] === 'cat-file' && (args[1] === '--batch' || args[1] === 'blob')) writeFileSync(join(dir, 'new.txt'), 'changed during capture')
    return bytes
  })
  expect(() => seals.captureGit(dir, base, ['anchor.txt'])).toThrow(/content of new.txt differs/)
})

it.each(['tree-truncated', 'tree-omitted', 'tree-repeated', 'size-count', 'size-oid', 'body-short', 'body-oid', 'body-extra'] as const)(
  'refuses incomplete or inconsistent Git output: %s', fault => {
    const { dir, base } = tree(); writeFileSync(join(dir, 'new.txt'), 'submitted\n\0binary'); commit(dir)
    const realRead = resources.readGit
    vi.spyOn(resources, 'readGit').mockImplementation((...readArgs) => {
      const [, args] = readArgs
      const bytes = realRead(...readArgs)
      if (args[0] === 'ls-tree') {
        if (fault === 'tree-truncated') return bytes.subarray(0, -1)
        if (fault === 'tree-omitted') return Buffer.alloc(0)
        if (fault === 'tree-repeated') return Buffer.concat([bytes, bytes])
      }
      if (args[1] === '--batch-check') {
        if (fault === 'size-count') return Buffer.concat([bytes, bytes])
        if (fault === 'size-oid') return Buffer.from('0'.repeat(40) + bytes.toString().slice(40))
      }
      if (args[1] === '--batch') {
        if (fault === 'body-short') return bytes.subarray(0, -2)
        if (fault === 'body-oid') return Buffer.concat([Buffer.from('0'.repeat(40)), bytes.subarray(40)])
        if (fault === 'body-extra') return Buffer.concat([bytes, Buffer.from('unexpected')])
      }
      return bytes
    })
    expect(() => seals.captureGit(dir, base, ['anchor.txt'])).toThrow(/cannot be sealed/)
    expect(readFileSync(join(dir, 'new.txt'))).toEqual(Buffer.from('submitted\n\0binary'))
  },
)

