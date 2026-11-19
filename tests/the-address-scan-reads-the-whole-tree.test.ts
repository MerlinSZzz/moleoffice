// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADDRESS SCAN READS THE WHOLE TREE: tools/merge-tool/addresses.mjs's screenTheTree, its program
 * tools/merge-tool/the-address-scan.mjs, and the merge queue's gate that runs it at each landing. The address gate
 * (tests/the-address-gate.test.ts) reads only the lines an entry adds, so the addresses main already held stayed. This
 * scan reads every file of one commit's tree, as the gate reads an added line, and lets through what the gate lets
 * through.
 *
 * Each case that scans makes a throwaway repository and scans one of its commits:
 *
 *   1. an address in each refused range, on a line of any file of the tree, is refused by file, line, column and the
 *      kind of its range, though no change added it; neither the refusal, the screen nor the sentence holds the address;
 *   2. it reads the commit's tree, not the work tree: a change made after the commit, an untracked file and a file
 *      the commit deleted are not read;
 *   3. a binary file is read byte by byte and refused by file and byte; a compressed file is named and not read;
 *   4. a hit inside an allow-list entry's text, in that entry's file, is let through and named by the entry's key;
 *   6. the program prints each refused address by file, line and kind, and never the address; it exits 1 when it
 *      refused one, 0 when it refused none, and 2 for a commit the repository does not have; the merge tool's list of
 *      programs names it;
 *   7. the repository's own tree at HEAD holds no refused address, and every allow-list entry lets one through there;
 *   8. integrate scans the tree of the landing commit after the regeneration, before the commit-address gate and the
 *      build, and bounces the entry as the guard "addresses".
 *
 * Every refused address here is written apart by `at`, so this file holds none written out. Each is made up. An
 * address written out here is loopback, the unspecified address or in a documentation range, which the scan lets
 * through.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { ALLOWED } from '../tools/merge-tool/addresses-allowed.mjs'
import * as addresses from '../tools/merge-tool/addresses.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_PROGRAM = join(REPO, 'tools/merge-tool/the-address-scan.mjs')

/** The scan and its two sentences, read by name so this file loads before they exist. */
type TheScan = (what: { repo: string; commit: string; allowed?: readonly { key: string; why: string; file: string; text: string }[] }) => {
  commit: string
  read: { files: number; lines: number; notText: string[]; binary: string[] }
  refused: Record<string, unknown>[]
  letThrough: Record<string, unknown>[]
}
const screenTheTree = (...args: Parameters<TheScan>): ReturnType<TheScan> => (Reflect.get(addresses, 'screenTheTree') as TheScan)(...args)
const theTreeRefusalSaid = (screen: ReturnType<TheScan>): string | null => (Reflect.get(addresses, 'theTreeRefusalSaid') as (s: unknown) => string | null)(screen)
const theTreeSaid = (screen: ReturnType<TheScan>): string => (Reflect.get(addresses, 'theTreeSaid') as (s: unknown) => string)(screen)

/** A made-up address, written apart so this file holds none. */
const at = (...parts: (number | string)[]): string => parts.join('.')

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Git in a fixture, with no system or user settings and an invented author. */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim()
}

function write(dir: string, files: Record<string, string | Buffer | null>): void {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(dir, path))
      continue
    }
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

/** A repository with one commit for each set of files, each on the one before; the last commit's id. */
function aRepository(...commits: Record<string, string | Buffer | null>[]): { dir: string; commit: string } {
  const dir = mkdtempSync(join(tmpdir(), 'address-scan-'))
  made.push(dir)
  git(dir, 'init', '--quiet', '-b', 'main')
  write(dir, { 'README.md': 'A synthetic repository for the address scan.\n' })
  for (const files of commits) {
    write(dir, files)
    git(dir, 'add', '-A')
    git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'a commit')
  }
  return { dir, commit: git(dir, 'rev-parse', 'HEAD') }
}

describe('the address scan reads every file of the tree at one commit', () => {
  it.each([
    ['tests/a.test.ts', at(10, 20, 30, 40), 'a private-network address (10/8)'],
    ['design/b.md', at(172, 31, 1, 2), 'a private-network address (172.16/12)'],
    ['docs/c.md', at(192, 168, 7, 8), 'a private-network address (192.168/16)'],
    ['tools/d.mjs', at(100, 99, 1, 2), 'a shared address of a carrier or a tailnet (100.64/10)'],
    ['src/server/e.ts', at(169, 254, 9, 9), 'a link-local address (169.254/16)'],
    ['public/g.txt', at(9, 9, 9, 9), 'an address in no private or special range'],
  ])('refuses an address on a line of %s that no change added, by file, line, column and range, and never repeats it', (file, address, kind) => {
    // The address is in the first commit, and the commit scanned changes another file.
    const { dir, commit } = aRepository({ [file]: `the first line\nreached at ${address} today\n` }, { 'other.md': 'nothing here\n' })
    const screen = screenTheTree({ repo: dir, commit })
    expect(screen.refused).toEqual([{ file, line: 2, column: 12, kind }])
    expect(screen.commit).toBe(commit)
    const said = theTreeRefusalSaid(screen)
    expect(said).toContain(`${file} line 2 column 12, ${kind}`)
    for (const words of [said, JSON.stringify(screen), theTreeSaid(screen)]) expect(words).not.toContain(address)
  })

  it('lets loopback, the unspecified address and the documentation ranges through, and reads each address on a line', () => {
    const line = `listen 0.0.0.0, reach 127.0.0.1, document 192.0.2.10 198.51.100.7 203.0.113.200, peers ${at(10, 0, 0, 1)} and ${at(8, 8, 4, 4)}\n`
    const { dir, commit } = aRepository({ 'docs/net.md': line })
    expect(screenTheTree({ repo: dir, commit }).refused).toEqual([
      { file: 'docs/net.md', line: 1, column: 88, kind: 'a private-network address (10/8)' },
      { file: 'docs/net.md', line: 1, column: 101, kind: 'an address in no private or special range' },
    ])
  })

  it("reads the commit's tree, not the work tree: not a change made after it, an untracked file or a file it deleted", () => {
    const { dir, commit } = aRepository({ 'kept.md': 'clean\n', 'gone.md': `was at ${at(10, 1, 1, 1)}\n` }, { 'gone.md': null })
    write(dir, { 'kept.md': `now at ${at(10, 2, 2, 2)}\n`, 'untracked.md': `at ${at(10, 3, 3, 3)}\n` })
    const screen = screenTheTree({ repo: dir, commit })
    expect(screen.refused).toEqual([])
    expect(screen.read).toEqual({ files: 2, lines: 2, notText: [], binary: [] })
  })

  it('reads a binary file byte by byte and refuses an address in it by file and byte; a compressed file is named and not read', () => {
    const address = at(10, 1, 1, 1)
    const bytes = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(`host=${address};`), Buffer.from([0, 255])])
    const gzipped = Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3]), Buffer.from(address), Buffer.from([0])])
    const { dir, commit } = aRepository({ 'assets/blob.bin': bytes, 'assets/clean.bin': Buffer.from([0, 1, 2, 3, 4]), 'out/a.db.gz': gzipped })
    const screen = screenTheTree({ repo: dir, commit })
    expect(screen.refused).toEqual([{ file: 'assets/blob.bin', byte: 10, kind: 'a private-network address (10/8)' }])
    expect(screen.read.binary).toEqual(['assets/blob.bin', 'assets/clean.bin'])
    expect(screen.read.notText).toEqual(['out/a.db.gz'])
    const said = theTreeRefusalSaid(screen)
    expect(said).toContain('assets/blob.bin byte 10, a private-network address (10/8)')
    for (const words of [said, JSON.stringify(screen), theTreeSaid(screen)]) expect(words).not.toContain(address)
    expect(theTreeSaid(screen)).toContain('2 binary files read byte by byte')
    expect(theTreeSaid(screen)).toContain('1 file not text: out/a.db.gz')
  })

  it("lets through a hit an allow-list entry covers in its own file, and names the entry's key", () => {
    const resolver = at(9, 9, 9, 9)
    const why = "A public resolver an isolation test tries to reach; it names nobody's own machine."
    const allowed = [{ key: 'a public resolver', why, file: 'tests/reach.test.ts', text: `'${resolver}'` }]
    const line = `const outside = '${resolver}'\n`
    const { dir, commit } = aRepository({ 'tests/reach.test.ts': line, 'tests/other.test.ts': line, 'tests/bare.test.ts': `reach ${resolver} bare\n` })
    const screen = screenTheTree({ repo: dir, commit, allowed })
    expect(screen.letThrough).toEqual([{ file: 'tests/reach.test.ts', line: 1, column: 18, kind: 'an address in no private or special range', key: 'a public resolver', why }])
    expect(screen.refused.map((one) => one.file).sort()).toEqual(['tests/bare.test.ts', 'tests/other.test.ts'])
    expect(theTreeSaid(screen)).toContain('1 let through by "a public resolver"')
  })

})

describe('the address scan as a program', () => {
  const run = (dir: string, ...args: string[]) => spawnSync(process.execPath, [THE_PROGRAM, ...args], { cwd: dir, encoding: 'utf8', timeout: 30_000 })

  it('prints each refused address by file, line and kind, never the address, and exits 1', () => {
    const one = at(10, 7, 7, 7)
    const two = at(100, 100, 1, 2)
    const { dir, commit } = aRepository({ 'docs/a.md': `one at ${one}\n`, 'tools/b.mjs': `\n\nconst peer = '${two}'\n` })
    const ran = run(dir)
    expect(ran.status).toBe(1)
    expect(ran.stdout.split('\n')).toEqual([
      'docs/a.md line 1 column 8, a private-network address (10/8)',
      'tools/b.mjs line 3 column 15, a shared address of a carrier or a tailnet (100.64/10)',
      `The address scan read 5 lines in 3 files at ${commit}: 2 refused.`,
      '',
    ])
    for (const words of [ran.stdout, ran.stderr]) {
      expect(words).not.toContain(one)
      expect(words).not.toContain(two)
    }
  })

  it('scans the commit it is named, exits 0 when it refused none, and exits 2 for a commit the repository does not have', () => {
    const { dir } = aRepository({ 'docs/a.md': 'nothing\n' }, { 'docs/a.md': `now at ${at(10, 7, 7, 7)}\n` })
    const first = git(dir, 'rev-parse', 'HEAD~1')
    const clean = run(dir, first)
    expect(clean.status).toBe(0)
    expect(clean.stdout).toBe(`The address scan read 2 lines in 2 files at ${first}: none refused.\n`)
    const missing = run(dir, 'no-such-commit')
    expect(missing.status).toBe(2)
    expect(missing.stdout).toBe('')
    expect(missing.stderr).toContain('no-such-commit')
  })

})

describe("the repository's own tree", () => {
  it('holds no refused address at HEAD, and every allow-list entry lets one through there', () => {
    const screen = screenTheTree({ repo: REPO, commit: 'HEAD' })
    expect(screen.refused).toEqual([])
    const used = new Set(screen.letThrough.map((one) => one.key))
    expect(ALLOWED.map((one) => one.key).filter((key) => !used.has(key))).toEqual([])
  }, 60_000)
})

describe('the merge queue runs the address scan at each landing', () => {
  it('scans the landing commit after the regeneration, before the commit-address gate and the build, and bounces the entry as the guard "addresses"', () => {
    const integrate = readFileSync(join(REPO, 'tools/merge-tool/integrate.mjs'), 'utf8')
    const regenerated = integrate.indexOf('await regenerateOnTop(clone, M, Cprime')
    const landing = integrate.indexOf("landingMessage(source.title, source)")
    const scan = integrate.indexOf('const treeScreen = addresses.screenTheTree({ repo: clone, commit: Cfinal })')
    const commitGate = integrate.indexOf("await import('./commit-addresses.mjs')")
    expect(regenerated).toBeGreaterThan(0)
    expect(landing).toBeGreaterThan(regenerated)
    expect(scan).toBeGreaterThan(landing)
    expect(commitGate).toBeGreaterThan(scan)
    const between = integrate.slice(scan, commitGate)
    expect(between).toMatch(/step\(\s*'guard-failed',\s*\{[^}]*guard: 'addresses'/)
    expect(between).toContain("join(WORKDIR, 'checks', 'addresses-in-the-tree.json')")
    expect(between).toContain('addresses.theTreeRefusalSaid(treeScreen)')
  })
})
