// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S GATE AGAINST A NEW IPv4 ADDRESS ANYWHERE IN THE REPOSITORY (the tool maintainer, 18 October 2026; the coordinator
 * AqIdXNNcfoaT and ZOv1X8SZ4ZuN): tools/merge-tool/addresses.mjs, with its allow-list in
 * tools/merge-tool/addresses-allowed.mjs.
 *
 * Each case that screens makes a throwaway repository with a main and an entry on it, and screens main...entry as
 * integrate does:
 *
 *   1. an address in each refused range, on an added line of a path that ships or of one that does not, is refused by
 *      file, line, column and the kind of its range, and neither the refusal nor the screen holds the address;
 *   2. loopback, the unspecified address and the three documentation ranges pass, and so does what only looks like an
 *      address: a version, an OID, five numbers, a number past 255;
 *   3. a number written with leading zeros is read by its value;
 *   4. a line already on main never blocks, even in a file the entry changes, and a deleted file is not read;
 *   5. a hit inside an allow-list entry's text, in that entry's file, is let through and named by the entry's key;
 *   7. integrate runs the gate after the owner-content gate and before the regeneration, the build and the suite;
 *   8. an address right after a dot is read, as in a host name, and a run of five numbers is still not one;
 *   9. a binary file an entry adds or changes is read byte by byte and refused by file and byte, never repeating the
 *      address; one already in main's copy of the file never blocks; a compressed file is named and not read.
 *
 * Every refused address here is written apart by `at`, so this file holds none written out. Most are made up; two are
 * well-known public DNS resolvers, which name nobody's own machine. An address written out here is loopback, the
 * unspecified address or in a documentation range, which the gate lets through.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { screenTheAddedLines, theAddressesOn, theRefusalSaid, theScreenSaid } from '../tools/merge-tool/addresses.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))

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

/** A repository whose main holds `files`, and an entry on it that changes `changes`. */
function anEntry(files: Record<string, string>, changes: Record<string, string | Buffer | null>): { dir: string; base: string; head: string } {
  const dir = mkdtempSync(join(tmpdir(), 'address-gate-'))
  made.push(dir)
  git(dir, 'init', '--quiet', '-b', 'main')
  write(dir, { 'README.md': 'A synthetic repository for the address gate.\n', ...files })
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '-m', 'main')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '--quiet', '-b', 'entry')
  write(dir, changes)
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'entry')
  return { dir, base, head: git(dir, 'rev-parse', 'HEAD') }
}

describe('the address gate reads the lines an entry adds, in every path', () => {
  it.each([
    ['tests/a.test.ts', at(10, 20, 30, 40), 'a private-network address (10/8)'],
    ['design/b.md', at(172, 31, 1, 2), 'a private-network address (172.16/12)'],
    ['docs/c.md', at(192, 168, 7, 8), 'a private-network address (192.168/16)'],
    ['tools/d.mjs', at(100, 99, 1, 2), 'a shared address of a carrier or a tailnet (100.64/10)'],
    ['src/server/e.ts', at(169, 254, 9, 9), 'a link-local address (169.254/16)'],
    ['scripts/f.mjs', at(239, 1, 2, 3), 'a multicast address (224/4)'],
    ['.env.example', at(250, 1, 2, 3), 'a reserved or broadcast address (240/4)'],
    ['README.md', at(0, 1, 2, 3), 'an address of this network (0/8)'],
    ['public/g.txt', at(9, 9, 9, 9), 'an address in no private or special range'],
  ])('refuses an address on an added line of %s, by file, line, column and range, and never repeats the address', (file, address, kind) => {
    const { dir, base, head } = anEntry({ [file]: 'the first line\n' }, { [file]: `the first line\nreached at ${address} today\n` })
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(screen.refused).toEqual([{ file, line: 2, column: 12, kind }])
    const said = theRefusalSaid(screen)
    expect(said).toContain(`${file} line 2 column 12, ${kind}`)
    expect(said).not.toContain(address)
    expect(JSON.stringify(screen)).not.toContain(address)
    expect(theScreenSaid(screen)).not.toContain(address)
  })

  it('refuses each address on a line, at its own column', () => {
    const line = `peers ${at(10, 0, 0, 1)}, ${at(100, 64, 0, 1)} and ${at(8, 8, 4, 4)}`
    expect(theAddressesOn(line).map((one) => [one.at, one.kind])).toEqual([
      [6, 'a private-network address (10/8)'],
      [16, 'a shared address of a carrier or a tailnet (100.64/10)'],
      [31, 'an address in no private or special range'],
    ])
  })

  it('lets loopback, the unspecified address and the three documentation ranges through', () => {
    expect(theAddressesOn('127.0.0.1 127.8.9.10 0.0.0.0 192.0.2.10 198.51.100.7 203.0.113.200 ::ffff:127.0.0.1')).toEqual([])
    // The edges of each range: the address just past one is refused.
    expect(theAddressesOn(`${at(192, 0, 3, 0)} ${at(198, 51, 101, 0)} ${at(203, 0, 114, 0)} ${at(128, 0, 0, 1)} ${at(0, 0, 0, 1)}`)).toHaveLength(5)
    expect(theAddressesOn(`${at(100, 63, 255, 255)} ${at(100, 128, 0, 0)} ${at(172, 15, 0, 1)} ${at(172, 32, 0, 1)}`).map((one) => one.kind)).toEqual([
      'an address in no private or special range',
      'an address in no private or special range',
      'an address in no private or special range',
      'an address in no private or special range',
    ])
  })

  it('reads no version, OID, run of five numbers or number past 255 as an address', () => {
    expect(theAddressesOn('node v22.23.2, OID 1.3.6.1.4.1.311, 10.20.30.40.50, 256.1.1.1, 1.2.3, 1.2.3.1000, 9999.1.1.1')).toEqual([])
  })

  it('finds an address inside a host name or after letters, and after a colon of an IPv6 form', () => {
    expect(theAddressesOn(`http://${at(10, 1, 2, 3)}.nip.io:80/`).map((one) => one.kind)).toEqual(['a private-network address (10/8)'])
    // RIGHT AFTER A DOT TOO: a host name's dot, or a sentence's, is not a number's.
    expect(theAddressesOn(`ssh host.${at(10, 1, 2, 3)}`).map((one) => [one.at, one.kind])).toEqual([[9, 'a private-network address (10/8)']])
    expect(theAddressesOn(`.${at(172, 16, 5, 4)}:22`).map((one) => one.at)).toEqual([1])
    // A dot after a digit is a number's, so a run of five numbers is still not read from its second.
    expect(theAddressesOn(`v2.${at(10, 1, 2, 3)} and 2.${at(10, 1, 2, 3)}`)).toEqual([])
    expect(theAddressesOn(`ip=${at(192, 168, 0, 1)}`).map((one) => one.at)).toEqual([3])
    expect(theAddressesOn(`::ffff:${at(100, 101, 102, 103)}`).map((one) => one.at)).toEqual([7])
  })

  it('reads a number written with leading zeros by its value', () => {
    expect(theAddressesOn(`at ${at('010', '020', '030', '040')}`).map((one) => one.kind)).toEqual(['a private-network address (10/8)'])
    expect(theAddressesOn('at 127.000.000.001 and 192.000.002.010')).toEqual([])
  })

  it('never blocks on a line already on main, even in a file the entry changes, and reads no deleted file', () => {
    const old = `kept at ${at(10, 9, 8, 7)}\n`
    const { dir, base, head } = anEntry(
      { 'design/old.md': old, 'tests/gone.test.ts': old },
      { 'design/old.md': `${old}a new line with no address\n`, 'tests/gone.test.ts': null },
    )
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(screen.refused).toEqual([])
    expect(screen.read).toEqual({ files: 1, lines: 1, notText: [], binary: [] })
  })

  it('reads the bytes of a binary file the entry adds, and refuses an address in them by file and byte, never repeating it', () => {
    const address = at(10, 1, 1, 1)
    const bytes = Buffer.concat([Buffer.from([0, 1, 2, 3]), Buffer.from(`host=${address};`), Buffer.from([0, 255])])
    const { dir, base, head } = anEntry({}, { 'assets/blob.bin': bytes, 'assets/clean.bin': Buffer.from([0, 1, 2, 3, 4]) })
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(screen.refused).toEqual([{ file: 'assets/blob.bin', byte: 10, kind: 'a private-network address (10/8)' }])
    expect(screen.read.binary).toEqual(['assets/blob.bin', 'assets/clean.bin'])
    expect(screen.read.notText).toEqual([])
    const said = theRefusalSaid(screen)
    expect(said).toContain('assets/blob.bin byte 10, a private-network address (10/8)')
    for (const words of [said, JSON.stringify(screen), theScreenSaid(screen)]) expect(words).not.toContain(address)
    expect(theScreenSaid(screen)).toContain('2 binary files read byte by byte')
  })

  it("never blocks on an address already in main's copy of a binary file the entry changes, and refuses one it adds", () => {
    const kept = at(10, 2, 2, 2)
    const added = at(192, 168, 3, 3)
    const onMain = Buffer.concat([Buffer.from([0, 9]), Buffer.from(`a=${kept}`), Buffer.from([0])])
    const { dir, base, head } = anEntry({ 'data/fixture.db': onMain as unknown as string }, {
      'data/fixture.db': Buffer.concat([Buffer.from([0, 9, 9]), Buffer.from(`a=${kept} b=${added}`), Buffer.from([0])]),
    })
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(screen.refused).toEqual([{ file: 'data/fixture.db', byte: 17, kind: 'a private-network address (192.168/16)' }])
  })

  it('names a compressed file and reads nothing in it, as its bytes say nothing until it is unpacked', () => {
    const gzipped = Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3]), Buffer.from(`${at(10, 1, 1, 1)}`), Buffer.from([0])])
    const zipped = Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4, 0, 0]), Buffer.from(`${at(10, 1, 1, 1)}`), Buffer.from([0])])
    const { dir, base, head } = anEntry({}, { 'out/a.db.gz': gzipped, 'out/b.zip': zipped })
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(screen.refused).toEqual([])
    expect(screen.read.notText).toEqual(['out/a.db.gz', 'out/b.zip'])
    expect(screen.read.binary).toEqual([])
  })

  it("lets through a hit an allow-list entry covers in its own file, and names the entry's key", () => {
    const resolver = at(9, 9, 9, 9)
    const allowed = [{ key: 'a public resolver', why: "A public resolver an isolation test tries to reach; it names nobody's own machine.", file: 'tests/reach.test.ts', text: `'${resolver}'` }]
    const line = `const outside = '${resolver}'\n`
    const { dir, base, head } = anEntry({}, { 'tests/reach.test.ts': line, 'tests/other.test.ts': line, 'tests/bare.test.ts': `reach ${resolver} bare\n` })
    const screen = screenTheAddedLines({ repo: dir, base, head, allowed })
    expect(screen.letThrough).toEqual([{ file: 'tests/reach.test.ts', line: 1, column: 18, kind: 'an address in no private or special range', key: 'a public resolver', why: "A public resolver an isolation test tries to reach; it names nobody's own machine." }])
    // Another file, and a line where the entry's text does not hold the whole hit, are refused.
    expect(screen.refused.map((one) => one.file).sort()).toEqual(['tests/bare.test.ts', 'tests/other.test.ts'])
    expect(theScreenSaid(screen)).toContain('"a public resolver"')
    expect(theRefusalSaid(screenTheAddedLines({ repo: dir, base, head, allowed: [{ ...allowed[0]!, text: `'${at(9, 9, 9)}` }] }))).toContain('tests/reach.test.ts line 1 column 18')
  })

  it('says nothing to refuse when the entry adds no address outside the ranges it lets through', () => {
    const { dir, base, head } = anEntry({}, { 'docs/net.md': 'listen on 0.0.0.0, reach 127.0.0.1, document 192.0.2.10\n' })
    const screen = screenTheAddedLines({ repo: dir, base, head })
    expect(theRefusalSaid(screen)).toBeNull()
    expect(theScreenSaid(screen)).toBe('The address gate read 1 added line in 1 file: none refused.')
  })
})


describe('the merge queue runs the address gate before the suite', () => {
  it('runs it in integrate after the owner-content gate and before the regeneration and the build, and bounces the entry as the guard "addresses"', () => {
    const integrate = readFileSync(join(REPO, 'tools/merge-tool/integrate.mjs'), 'utf8')
    const owner = integrate.indexOf('const refusal = theRefusalSaid(screen)')
    const gate = integrate.indexOf('const addressScreen = addresses.screenTheAddedLines({ repo: clone, base: M, head: Cprime })')
    const regenerated = integrate.indexOf('await regenerateOnTop(clone, M, Cprime')
    expect(owner).toBeGreaterThan(0)
    expect(gate).toBeGreaterThan(owner)
    expect(regenerated).toBeGreaterThan(gate)
    expect(integrate.slice(owner, gate)).toContain("await import('./addresses.mjs')")
    expect(integrate.slice(gate, regenerated)).toMatch(/step\(\s*'guard-failed',\s*\{[^}]*guard: 'addresses'/)
    expect(integrate.slice(gate, regenerated)).toContain("join(WORKDIR, 'checks', 'addresses.json')")
  })
})
