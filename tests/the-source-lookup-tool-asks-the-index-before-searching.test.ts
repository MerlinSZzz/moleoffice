// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SOURCE LOOKUP ASKS THE INDEX BEFORE ANY SEARCH: tools/source-lookup.mjs.
 *
 * The tool takes one name or several in one step. It asks GET /api/source/where once for each name,
 * with the run's identity, and checks every path it is given in the local checkout. A path that is
 * current is answered with its line, and that name is not searched. For the names with no current
 * answer, the tool says so first, in one short line for all of them, and only then searches each. It
 * searches only the paths given after "--", or the whole checkout when none is given, and prints each
 * file with how many of its lines name the name, never the lines. A path the index lists that this
 * checkout does not have, or a file that no longer mentions the name, is said to be stale and is never
 * answered as current.
 *
 * The office here is a made-up one: a fresh database and a throwaway tree, served by the source
 * routes and reached through the tool's own request helper. The search is replaced by a counter,
 * except in the tests that run the real git grep on a git copy of the tree.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { trackApiRoutes } from '../src/server/api/kinds.ts'
import { askTheOffice, THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { lookUpBeforeSearching, readTheCommand } from '../tools/source-lookup.mjs'

let db: TestDb
let app: FastifyInstance
const scratch: string[] = []
let tree: string

const FILES: Record<string, string> = {
  'src/alpha/finder.ts': "// The made-up module's one file.\n\nexport function findTheThing(): string {\n  return 'found'\n}\n",
  'src/alpha/index.ts': 'export const alphaIndex = 0\n',
  'src/beta/helper.ts': 'export const helperValue = 1\n',
}

/** The run's identity as the runner sets it. The made-up office reads only the project. */
const ENV = {
  MOLE_OFFICE_API: 'http://127.0.0.1:9',
  MOLE_OFFICE_AGENT: 'a-made-up-agent',
  MOLE_OFFICE_SESSION: 'a-made-up-run',
  MOLE_OFFICE_WORKSPACE: 'default',
}

/** What the live office answered on 28 October 2026 for this door, which it does not have. */
const AN_OLDER_OFFICES_404 = JSON.stringify({
  error:
    'No such endpoint: GET /api/source/where?name=findTheThing. "source" is a family this server has; its 3 doors are ' +
    'listed below, and GET /api lists every door with a line each.',
  opening: 'Open one family with GET /api/families/<name> or GET /api?family=<name>; GET /api lists every door with a line each.',
  endpoints: ['GET /api/source', 'GET /api/source/coverage', 'POST /api/source/reindex'],
})

const theMadeUpOffice = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const res = await app.inject({
    method: 'GET',
    url: url.pathname + url.search,
    headers: init?.headers as Record<string, string>,
  })
  return new Response(res.body, { status: res.statusCode })
}) as typeof fetch

type Counted = { path: string; count: number }

/** The search, replaced by a counter that answers the files it is given. */
function aSearch(files: Counted[] = []): {
  calls: string[]
  pathsGiven: string[][]
  search: (name: string, checkout: string, paths: string[]) => { files: Counted[]; left: number }
} {
  const calls: string[] = []
  const pathsGiven: string[][] = []
  return { calls, pathsGiven, search: (name, _checkout, paths) => { calls.push(name); pathsGiven.push(paths); return { files, left: 0 } } }
}

/** A copy of the tree the index was built from, for a checkout that has moved on since the scan. */
function aCheckoutThatMovedOn(change: (root: string) => void): string {
  const root = mkdtempSync(join(tmpdir(), 'source-lookup-checkout-'))
  scratch.push(root)
  cpSync(tree, root, { recursive: true })
  change(root)
  return root
}

/** A git copy of the tree with these files added, so the real git grep can run on it. */
function aGitCheckoutWith(files: Record<string, string>): string {
  return aCheckoutThatMovedOn((root) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    execFileSync('git', ['init', '-q'], { cwd: root })
    execFileSync('git', ['add', '.'], { cwd: root })
  })
}

/** The lines of a result that list a file the search found. */
const fileLines = (text: string) => text.split('\n').filter((line) => /^ {2}\S.* \(\d+ lines?\)$/.test(line))

/** The lines of a result that say the index has no current answer. */
const noAnswerLines = (text: string) => text.split('\n').filter((line) => line.includes('no current answer'))

/** The nearest line above a line of the result that is not itself indented: what that line is listed under. */
function listedUnder(text: string, line: string): string | undefined {
  const lines = text.split('\n')
  return lines.slice(0, lines.indexOf(line)).reverse().find((one) => !one.startsWith('  '))
}

/** What the made-up office's door answers for a name, read from the door itself. */
async function theDoorSays(name: string): Promise<{ noAnswer: string | null; index: { builtAt: string } }> {
  const answer = await askTheOffice({ method: 'GET', path: `/api/source/where?name=${encodeURIComponent(name)}` }, { fetchImpl: theMadeUpOffice, env: ENV })
  return JSON.parse(answer.body)
}

beforeAll(async () => {
  db = await freshDb()
  const source = await import('../src/server/api/source.ts')
  const http = await import('../src/server/lib/http.ts')
  const map = await import('../src/server/lib/implementation.ts')
  const repos = await import('../src/server/lib/repositories.ts')

  tree = mkdtempSync(join(tmpdir(), 'source-lookup-tree-'))
  scratch.push(tree)
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(tree, path)), { recursive: true })
    writeFileSync(join(tree, path), text)
  }
  const repositoryId = repos.registerRepository({ workspaceId: 'default', name: 'made-up', root: tree, actor: db.api.HUMAN }).id
  map.rebuildRepository({ workspaceId: 'default', repositoryId, actor: db.api.HUMAN })
  const record = db.api.createRecord({
    workspaceId: 'default',
    kind: 'module',
    title: 'Finding things',
    data: { context: 'A made-up module that finds things.', parts: [] },
    actor: db.api.HUMAN,
  })
  map.declareRelationship({ workspaceId: 'default', recordId: record.id, repositoryId, pattern: 'src/alpha/**', actor: db.api.HUMAN })

  app = Fastify()
  trackApiRoutes(app)
  http.installErrorHandling(app)
  await app.register(source.sourceRoutes, { prefix: '/api' })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  db.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

// ---- criterion 1: a name the index knows is answered without a search

describe('a name the source index knows', () => {
  it('is answered from the index with its line, and nothing is searched', async () => {
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(calls).toEqual([])
    expect(result.searched).toEqual([])
    expect(result.exitCode).toBe(0)
    expect(result.current.map((one: { path: string; line: number | null }) => `${one.path}:${String(one.line)}`)).toEqual(['src/alpha/finder.ts:3'])
    expect(result.text).toContain('src/alpha/finder.ts:3')
    expect(result.text).toContain('Finding things')
    expect(result.text).not.toContain('no current answer')
  })

  it('is answered from the index when paths to search are given too, and nothing is searched', async () => {
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search, paths: ['src/beta'] })
    expect(calls).toEqual([])
    expect(result.current.map((one: { path: string }) => one.path)).toEqual(['src/alpha/finder.ts'])
  })

  it('answers a module by its title with the files it claims, and nothing is searched', async () => {
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['finding things'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(calls).toEqual([])
    expect(result.current.map((one: { path: string }) => one.path)).toEqual(['src/alpha/finder.ts', 'src/alpha/index.ts'])
  })
})

// ---- criterion 2: a name the index does not know is said, and only then searched

describe('a name the source index does not know', () => {
  it('is said to have no answer in the index first, and then searched once, in the paths given', async () => {
    const { calls, pathsGiven, search } = aSearch([{ path: 'src/elsewhere.ts', count: 1 }])
    const result = await lookUpBeforeSearching({ names: ['nothingCalledThis'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search, paths: ['src', 'tests'] })
    expect(calls).toEqual(['nothingCalledThis'])
    expect(pathsGiven).toEqual([['src', 'tests']])
    expect(result.searched).toEqual(['nothingCalledThis'])
    expect(result.exitCode).toBe(0)
    const said = result.text.indexOf('The source index has no current answer for "nothingCalledThis"')
    expect(said).toBeGreaterThanOrEqual(0)
    expect(result.text.indexOf('src/elsewhere.ts (1 line)')).toBeGreaterThan(said)
  })

  it('exits 1 and says so when the search finds nothing either', async () => {
    const { search } = aSearch([])
    const result = await lookUpBeforeSearching({ names: ['nothingCalledThis'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(result.exitCode).toBe(1)
    expect(result.text).toContain('The search found nothing either')
  })

  it('searches with git grep only the paths it is given', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName\n', 'wanted/two.txt': 'aNeedleName\n', 'other/three.txt': 'aNeedleName\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['wanted/one.txt', 'wanted'] })
    expect(result.searched).toEqual(['aNeedleName'])
    expect(result.exitCode).toBe(0)
    expect(fileLines(result.text)).toEqual(['  wanted/one.txt (1 line)', '  wanted/two.txt (1 line)'])
  })

  it('prints each file with how many of its lines name the name, and never the lines', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName in words nobody asked for\nnot here\naNeedleName again\naNeedleName and once more\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['wanted'] })
    expect(fileLines(result.text)).toEqual(['  wanted/one.txt (3 lines)'])
    expect(result.text).not.toContain('words nobody asked for')
    expect(result.text).not.toContain('once more')
  })

  it('prints at most 40 files and counts the rest', async () => {
    const files = Object.fromEntries(Array.from({ length: 45 }, (_, n) => [`many/file-${String(n).padStart(2, '0')}.txt`, 'aNeedleName\n']))
    const checkout = aGitCheckoutWith(files)
    const result = await lookUpBeforeSearching({ names: ['aNeedleName'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['many'] })
    expect(fileLines(result.text)).toHaveLength(40)
    expect(result.text).toContain('and 5 more files not shown')
  })

  it('searches the whole checkout when no path is given, and says so', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName\n', 'other/three.txt': 'aNeedleName\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName'], checkout, env: ENV, fetchImpl: theMadeUpOffice })
    expect(result.text).toContain('the whole checkout')
    expect(fileLines(result.text)).toEqual(['  other/three.txt (1 line)', '  wanted/one.txt (1 line)'])
  })

  it('says a path that names no file in this checkout, and lists nothing', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['wanted', 'nowhere-at-all'] })
    expect(result.exitCode).toBe(3)
    expect(result.text).toContain('The search could not run')
    expect(result.text).toContain('nowhere-at-all')
    expect(fileLines(result.text)).toEqual([])
  })
})

// ---- the command: one name or several, then the paths to search after --

describe('the command', () => {
  it('reads the paths to search after --, every word after it a path', () => {
    expect(readTheCommand(['aName', '--', 'src', 'tests'])).toMatchObject({ names: ['aName'], paths: ['src', 'tests'] })
    expect(readTheCommand(['aName', '--limit', '5', '--', '--odd-name'])).toMatchObject({ names: ['aName'], limit: 5, paths: ['--odd-name'] })
  })

  it('has no paths when none is given, and refuses a -- with no path after it', () => {
    expect(readTheCommand(['aName'])).toMatchObject({ names: ['aName'], paths: [] })
    expect(readTheCommand(['aName', '--'])).toMatchObject({ refused: expect.stringContaining('after --') })
  })

  it('takes several names in one step, every word before -- that is not an option', () => {
    expect(readTheCommand(['one', 'two'])).toMatchObject({ names: ['one', 'two'], paths: [] })
    expect(readTheCommand(['one', '--limit', '5', 'two', 'three', '--', 'src'])).toMatchObject({ names: ['one', 'two', 'three'], limit: 5, paths: ['src'] })
  })

  it('refuses a step that names nothing to look for', () => {
    expect(readTheCommand([])).toHaveProperty('refused')
    expect(readTheCommand(['--', 'src'])).toHaveProperty('refused')
  })
})

// ---- criterion 3: a stale entry is said, never answered as current

describe('an entry of the index that this checkout has moved away from', () => {
  it('is said to be stale when its file is not in this checkout, never answered, and then searched', async () => {
    const checkout = aCheckoutThatMovedOn((root) => renameSync(join(root, 'src/alpha/finder.ts'), join(root, 'src/alpha/found.ts')))
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(result.current).toEqual([])
    expect(result.stale.map((one: { path: string }) => one.path)).toEqual(['src/alpha/finder.ts'])
    expect(result.text).toContain('Stale: src/alpha/finder.ts')
    expect(result.text).toContain('not in this checkout')
    expect(result.text).not.toContain('src/alpha/finder.ts:')
    expect(result.text).toContain('The source index has no current answer for "findTheThing"')
    expect(calls).toEqual(['findTheThing'])
  })

  it('is said to be stale when its file no longer mentions the name', async () => {
    const checkout = aCheckoutThatMovedOn((root) => writeFileSync(join(root, 'src/alpha/finder.ts'), 'export function foundIt() {}\n'))
    const { search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(result.current).toEqual([])
    expect(result.text).toContain('Stale: src/alpha/finder.ts')
    expect(result.text).toContain('no longer mentions "findTheThing"')
  })

  it('keeps the current files of a module and says which of its files moved', async () => {
    const checkout = aCheckoutThatMovedOn((root) => unlinkSync(join(root, 'src/alpha/index.ts')))
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['Finding things'], checkout, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(result.current.map((one: { path: string }) => one.path)).toEqual(['src/alpha/finder.ts'])
    expect(result.stale.map((one: { path: string }) => one.path)).toEqual(['src/alpha/index.ts'])
    expect(calls).toEqual([])
  })
})

// ---- criterion 4: an older office's 404 is said, and then the name is searched

describe('an office that cannot answer from the source index', () => {
  it('is quoted when it is an older office without the door, and then the name is searched', async () => {
    const { calls, search } = aSearch()
    const olderOffice = (async () => new Response(AN_OLDER_OFFICES_404, { status: 404 })) as typeof fetch
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: ENV, fetchImpl: olderOffice, search })
    expect(result.text).toContain('The source index has no current answer for "findTheThing"')
    expect(result.text).toContain('The office answered 404')
    expect(result.text).toContain('No such endpoint: GET /api/source/where')
    expect(calls).toEqual(['findTheThing'])
  })

  it('is said when the office cannot be asked at all, and then the name is searched', async () => {
    const { calls, search } = aSearch()
    const { MOLE_OFFICE_SESSION: _left, ...withoutTheRun } = ENV
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: withoutTheRun, fetchImpl: theMadeUpOffice, search })
    expect(result.text).toContain('The office could not be asked')
    expect(result.text).toContain('MOLE_OFFICE_SESSION')
    expect(calls).toEqual(['findTheThing'])
  })

  it('is said when its answer is not a lookup, and then the name is searched', async () => {
    const { calls, search } = aSearch()
    const notALookup = (async () => new Response('{"something":"else"}', { status: 200 })) as typeof fetch
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: ENV, fetchImpl: notALookup, search })
    expect(result.text).toContain('could not be read as a source lookup')
    expect(calls).toEqual(['findTheThing'])
  })

  it('is said when its answer is longer than the tool reads, never answered from, and then the name is searched', async () => {
    const { calls, search } = aSearch()
    // A made-up answer: the door gives at most 100 files. The tool reads at most THE_LONGEST_REPLY characters of any answer.
    const real: any = await theDoorSays('findTheThing')
    const files = [...real.files, ...Array.from({ length: 600 }, (_, i) => ({ ...real.files[0], path: `src/alpha/made-up-${String(i)}.ts` }))]
    const body = JSON.stringify({ ...real, files })
    expect(body.length).toBeGreaterThan(THE_LONGEST_REPLY)
    const tooLong = (async () => new Response(body, { status: 200 })) as typeof fetch
    const result = await lookUpBeforeSearching({ names: ['findTheThing'], checkout: tree, env: ENV, fetchImpl: tooLong, search })
    expect(result.text).toContain(`The office's answer was longer than the ${String(THE_LONGEST_REPLY)} characters this tool reads, so it was not read.`)
    expect(result.current).toEqual([])
    expect(calls).toEqual(['findTheThing'])
  })
})

// ---- criterion 5: several names in one step

describe('several names in one step', () => {
  it('answers each name the index knows from the index, and searches only the others, each in the paths given', async () => {
    const { calls, pathsGiven, search } = aSearch([{ path: 'src/elsewhere.ts', count: 1 }])
    const result = await lookUpBeforeSearching({ names: ['findTheThing', 'nothingCalledThis', 'norThisOne'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search, paths: ['src'] })
    expect(calls).toEqual(['nothingCalledThis', 'norThisOne'])
    expect(pathsGiven).toEqual([['src'], ['src']])
    expect(result.searched).toEqual(['nothingCalledThis', 'norThisOne'])
    expect(result.current.map((one: { name: string; path: string; line: number | null }) => `${one.name} ${one.path}:${String(one.line)}`)).toEqual(['findTheThing src/alpha/finder.ts:3'])
    expect(result.exitCode).toBe(0)
  })

  it('searches nothing when the index answers every name', async () => {
    const { calls, search } = aSearch()
    const result = await lookUpBeforeSearching({ names: ['findTheThing', 'Finding things'], checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search })
    expect(calls).toEqual([])
    expect(result.searched).toEqual([])
    expect(result.exitCode).toBe(0)
    expect(noAnswerLines(result.text)).toEqual([])
  })

  it('lists the files git grep finds for each name under that name', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName\n', 'wanted/two.txt': 'otherNeedle\notherNeedle\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName', 'otherNeedle'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['wanted'] })
    expect(result.exitCode).toBe(0)
    expect(fileLines(result.text)).toEqual(['  wanted/one.txt (1 line)', '  wanted/two.txt (2 lines)'])
    expect(listedUnder(result.text, '  wanted/one.txt (1 line)')).toContain('"aNeedleName"')
    expect(listedUnder(result.text, '  wanted/one.txt (1 line)')).not.toContain('"otherNeedle"')
    expect(listedUnder(result.text, '  wanted/two.txt (2 lines)')).toContain('"otherNeedle"')
    expect(listedUnder(result.text, '  wanted/two.txt (2 lines)')).not.toContain('"aNeedleName"')
  })

  it('exits 1 when a name is found nowhere, and names that name and no other as found nowhere', async () => {
    const checkout = aGitCheckoutWith({ 'wanted/one.txt': 'aNeedleName\n' })
    const result = await lookUpBeforeSearching({ names: ['aNeedleName', 'notAnywhereHere'], checkout, env: ENV, fetchImpl: theMadeUpOffice, paths: ['wanted'] })
    expect(result.exitCode).toBe(1)
    expect(fileLines(result.text)).toEqual(['  wanted/one.txt (1 line)'])
    const nowhere = result.text.split('\n').filter((line) => line.includes('found nothing'))
    expect(nowhere).toHaveLength(1)
    expect(nowhere[0]).toContain('"notAnywhereHere"')
    expect(nowhere[0]).not.toContain('"aNeedleName"')
  })
})

// ---- criterion 6: one short no-answer line for the whole step

describe('the names the index has no current answer for', () => {
  it("are said in one line for the whole step, with the index's scan and without the door's own sentence", async () => {
    for (const names of [['nothingCalledThis'], ['nothingCalledThis', 'findTheThing', 'norThisOne']]) {
      const { search } = aSearch([{ path: 'src/elsewhere.ts', count: 1 }])
      const result = await lookUpBeforeSearching({ names, checkout: tree, env: ENV, fetchImpl: theMadeUpOffice, search })
      const said = noAnswerLines(result.text)
      expect(said).toHaveLength(1)
      for (const name of names.filter((one) => one !== 'findTheThing')) {
        const door = await theDoorSays(name)
        expect(said[0]).toContain(`"${name}"`)
        expect(said[0]).toContain(door.index.builtAt)
        expect(door.noAnswer).not.toBeNull()
        expect(result.text).not.toContain(door.noAnswer)
      }
      expect(said[0]).not.toContain('"findTheThing"')
      expect(result.text.split('\n').filter((line) => line.startsWith('Searching '))).toHaveLength(1)
    }
  })

  it("quote an older office's 404 once for the whole step, ask that office nothing more, and are each searched", async () => {
    const { calls, search } = aSearch()
    let asked = 0
    const olderOffice = (async () => {
      asked += 1
      return new Response(AN_OLDER_OFFICES_404, { status: 404 })
    }) as typeof fetch
    const result = await lookUpBeforeSearching({ names: ['findTheThing', 'nothingCalledThis'], checkout: tree, env: ENV, fetchImpl: olderOffice, search })
    expect(asked).toBe(1)
    expect(result.text.split('No such endpoint')).toHaveLength(2)
    const said = noAnswerLines(result.text)
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('"findTheThing"')
    expect(said[0]).toContain('"nothingCalledThis"')
    expect(said[0]).toContain('The office answered 404')
    expect(calls).toEqual(['findTheThing', 'nothingCalledThis'])
  })
})
