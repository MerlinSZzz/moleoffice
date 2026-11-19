// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE'S REQUIREMENTS ARE FILED AS BACKLOG ITEMS, ONE RECORD PER ITEM, WITH EACH ITEM'S WORDS WHOLE. Wave 13r, item
 * 19 (e), part 1. tools/file-backlog-items.mjs reads a line's requirement file and files each numbered item as a
 * backlog_item record through the run's own office tool (tools/office-request.mjs).
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, asked through a fetch
 * stand-in that hands each request to app.inject. The agent is a made-up agent holding the key the office answered.
 * Every file, line, item and word here is made up. An office with no backlog door answers with the server's own words
 * for a door it does not have (`noSuchEndpoint`), so the words the tool reads in that 404 are the server's.
 *
 * THE CASES, in order:
 *   1. the file is read into items: a numbered line starts an item, a line that names an item by its number goes to
 *      that item, any other line goes to the item the line above went to; the lines before the first item and the
 *      blank lines are not filed, and the tool says which they were; a dry run prints this and asks nothing;
 *   2. the tool files one record per item: its words byte for byte in why, its place in the file as order, who placed
 *      it, and a source naming the file, its lines and its SHA-256. No state, done-when or date is written, since the
 *      file does not say them, and the office lists state and doneWhen as missing. The line's backlog answers the
 *      items in the file's order;
 *   3. a file that numbers an item twice, names an item it does not hold, or holds no item is refused, and nothing is
 *      asked or filed;
 *   4. a line that already has items in the office is refused, and nothing is filed;
 *   5. an office with no backlog door (the live office on 29 October 2026 answers 404) is refused, and nothing is
 *      filed;
 *   6. a refusal part way names the records already filed and the item refused;
 *   7. the command line refuses a missing line, file or placer, and a placer that is not kind:id;
 *   8. the line is read back at the request helper's own limit, so a line whose answer is longer than that is filed
 *      and then refused as cut, naming the records filed.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - a line that names an item by its number no longer goes to that item: cases 1, 2 and 3 are red;
 *   - an item's lines are filed joined by spaces in place of line ends: case 2 is red;
 *   - a line that already has items in the office is no longer refused: case 4 is red;
 *   - the 404 of an office with no backlog door is no longer named, so the general refusal answers: case 5 is red.
 * And on 30 October 2026:
 *   - the read-back raises the helper's limit again: case 8 is red, and so is the release check's test that names
 *     every read allowed to raise it (tests/the-release-check-reads-one-gate-row.test.ts);
 *   - a cut read-back is no longer named as cut: case 8 is red.
 */

import type { FastifyInstance } from 'fastify'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { noSuchEndpoint } from '../src/server/api/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { fileBacklogItems, main, readARequirementsFile } from '../tools/file-backlog-items.mjs'
import { THE_LONGEST_REPLY } from '../tools/office-request.mjs'

const FILER = 'backlog-filing-worker'
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
/** The run's identity, as the runner sets it. Its session is a running run of the agent, filed before the cases. */
const ENV: Record<string, string> = {
  MOLE_OFFICE_API: 'http://127.0.0.1:9',
  MOLE_OFFICE_AGENT: FILER,
  MOLE_OFFICE_SESSION: '',
  MOLE_OFFICE_WORKSPACE: 'default',
}
const PLACED_BY = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }

/** What an office with no backlog door answers for it, made by the server's own answer for a door it does not have. */
const AN_OLDER_OFFICES_404 = JSON.stringify(noSuchEndpoint('GET', '/api/backlog?line=made-up-line', []))

const A_FILE = [
  '# made-up-line: a made-up requirement list',
  '(Made up for this test: this preamble is not an item.)',
  '1. Made-up first item: paint the made-up fence.',
  '2. Made-up second item: water the made-up beds.',
  'For your knowledge, from nobody: a made-up note that belongs to the item above.',
  '   2b. Made-up item 2b: a sub-item with its own number.',
  '   2b, a later word on 2b: made up.',
  '   (1) a made-up question under the later word on 2b.',
  '',
  '3. Made-up third item, with hex that is not a key: 0123456789abcdef.',
  '   Item 1 settled: a made-up answer that names item 1.',
  '',
].join('\n')
const LINES = A_FILE.split('\n')
const words = (...numbers: number[]) => numbers.map((n) => LINES[n - 1]).join('\n')

let t: TestDb
let app: FastifyInstance
let folder = ''
const before: Record<string, string | undefined> = {}

const theMadeUpOffice = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  const res = await app.inject({
    method: (init?.method ?? 'GET') as 'GET' | 'POST',
    url: url.pathname + url.search,
    headers: init?.headers as Record<string, string>,
    ...(init?.body === undefined || init.body === null ? {} : { payload: String(init.body) }),
  })
  return new Response(res.body, { status: res.statusCode, headers: { 'content-type': String(res.headers['content-type'] ?? 'application/json') } })
}) as typeof fetch

/** A fetch that counts what it is asked and asks nothing. */
function nothingAsked() {
  const asked: string[] = []
  const fetchImpl = (async (input: string | URL | Request) => {
    asked.push(String(input))
    throw new Error('nothing may be asked')
  }) as typeof fetch
  return { asked, fetchImpl }
}

function aFile(text: string, name = 'REQUIREMENTS.md'): string {
  const path = join(folder, name)
  writeFileSync(path, text)
  return path
}

function itemsStored(line?: string): number {
  const where = line === undefined ? '' : ` AND json_extract(data, '$.line') = '${line}'`
  return (t.client.sqlite.prepare(`SELECT count(*) AS n FROM records WHERE kind = 'backlog_item'${where}`).get() as { n: number }).n
}

async function readTheLine(line: string) {
  const read = await app.inject({ method: 'GET', url: `/api/backlog?line=${line}`, headers: PERSON })
  expect(read.statusCode, read.body).toBe(200)
  return read.json() as { items: { id: string; title: string; data: Record<string, unknown> }[] }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: FILER, name: FILER, role: THE_WORKER } })
  expect(started.statusCode, started.body).toBe(201)
  before['MOLE_AGENT_KEY'] = process.env['MOLE_AGENT_KEY']
  process.env['MOLE_AGENT_KEY'] = String(started.json().whatToGiveIt?.key ?? '')
  // A WRITE NAMES A RUN ITS KEY HOLDS: for an agent's own key, a running run that serves the agent.
  const run = t.api.createRecord({ kind: 'session', title: 'A made-up run that files a line', workspaceId: 'default', actor: { type: 'human', id: THE_PERSON }, origin: 'fixture', data: { state: 'running', servingAgent: FILER } })
  ENV['MOLE_OFFICE_SESSION'] = run.id
  folder = mkdtempSync(join(tmpdir(), 'backlog-filing-'))
}, 60_000)

afterAll(async () => {
  if (before['MOLE_AGENT_KEY'] === undefined) delete process.env['MOLE_AGENT_KEY']
  else process.env['MOLE_AGENT_KEY'] = before['MOLE_AGENT_KEY']
  if (folder) rmSync(folder, { recursive: true, force: true })
  await app?.close()
  t?.close()
})

describe("a line's requirement file", () => {
  it('1. is read into items by number, and a dry run says what it made of each line and asks nothing', async () => {
    const read = readARequirementsFile(A_FILE)
    expect(read.items.map((one: { number: string; lines: number[] }) => [one.number, one.lines])).toEqual([
      ['1', [3, 11]],
      ['2', [4, 5]],
      ['2b', [6, 7, 8]],
      ['3', [10]],
    ])
    expect(read.items.map((one: { words: string }) => one.words)).toEqual([words(3, 11), words(4, 5), words(6, 7, 8), words(10)])
    expect(read.notFiled).toEqual([1, 2])
    expect(read.blank).toEqual([9])

    const said: string[] = []
    const { asked, fetchImpl } = nothingAsked()
    const result = await fileBacklogItems({ file: aFile(A_FILE, 'dry.md'), line: 'made-up-dry-line', placedBy: PLACED_BY, dryRun: true, env: ENV, fetchImpl, say: (one: string) => said.push(one) })
    expect(asked).toEqual([])
    expect(result.filed).toEqual([])
    const text = said.join('\n')
    expect(text).toContain('item 1: lines 3, 11')
    expect(text).toContain('item 2: lines 4-5')
    expect(text).toContain('item 2b: lines 6-8')
    expect(text).toContain('item 3: line 10')
    expect(text).toContain('Not filed: lines 1-2, before the first item.')
    expect(text).toContain('dry run')
  })

  it('2. is filed one record per item, each with its words whole, its place, who placed it and its source', async () => {
    const path = aFile(A_FILE)
    const sha = createHash('sha256').update(A_FILE).digest('hex')
    const result = await fileBacklogItems({ file: path, line: 'made-up-line', placedBy: PLACED_BY, env: ENV, fetchImpl: theMadeUpOffice, say: () => {} })
    expect(result.filed.map((one: { number: string }) => one.number)).toEqual(['1', '2', '2b', '3'])

    const read = await readTheLine('made-up-line')
    expect(read.items.map((one) => one.id)).toEqual(result.filed.map((one: { id: string }) => one.id))
    const expected = [
      { number: '1', lines: 'lines 3, 11', words: words(3, 11) },
      { number: '2', lines: 'lines 4-5', words: words(4, 5) },
      { number: '2b', lines: 'lines 6-8', words: words(6, 7, 8) },
      { number: '3', lines: 'line 10', words: words(10) },
    ]
    for (const [i, item] of read.items.entries()) {
      const want = expected[i]!
      expect(item.title).toBe(`Item ${want.number} of line made-up-line`)
      expect(item.data).toEqual({
        line: 'made-up-line',
        number: want.number,
        placedBy: PLACED_BY,
        why: want.words,
        order: i + 1,
        source: `${path} ${want.lines}, SHA-256 ${sha}`,
      })
      const one = await app.inject({ method: 'GET', url: `/api/records/${item.id}`, headers: PERSON })
      expect(one.json().incomplete.map((missing: { path: string }) => missing.path).sort()).toEqual(['data.doneWhen', 'data.state'])
    }
  })

  it('3. is refused when it numbers an item twice, names an item it does not hold, or holds no item, and nothing is asked', async () => {
    const stored = itemsStored()
    for (const [text, says] of [
      ['1. Made-up one.\n2. Made-up two.\n1. Made-up one again.\n', 'item 1 is numbered twice, at lines 1 and 3'],
      ['1. Made-up one.\n   7, a made-up word on an item nobody wrote.\n', 'line 2 names item 7, which the file does not hold'],
      ['# Made-up heading\nMade-up words with no number.\n', 'the file holds no numbered item'],
    ] as const) {
      expect(() => readARequirementsFile(text)).toThrow(says)
      const { asked, fetchImpl } = nothingAsked()
      await expect(fileBacklogItems({ file: aFile(text, 'refused.md'), line: 'made-up-refused-line', placedBy: PLACED_BY, env: ENV, fetchImpl, say: () => {} })).rejects.toThrow(says)
      expect(asked).toEqual([])
    }
    expect(itemsStored()).toBe(stored)
  })

  it('4. is refused for a line that already has items in the office, and nothing is filed', async () => {
    const path = aFile('1. Made-up only item.\n', 'once.md')
    await fileBacklogItems({ file: path, line: 'made-up-filed-line', placedBy: PLACED_BY, env: ENV, fetchImpl: theMadeUpOffice, say: () => {} })
    expect(itemsStored('made-up-filed-line')).toBe(1)
    await expect(fileBacklogItems({ file: path, line: 'made-up-filed-line', placedBy: PLACED_BY, env: ENV, fetchImpl: theMadeUpOffice, say: () => {} }))
      .rejects.toThrow('line made-up-filed-line already has 1 item in this office')
    expect(itemsStored('made-up-filed-line')).toBe(1)
  })

  it('5. is refused by an office with no backlog door, and nothing is filed', async () => {
    const stored = itemsStored()
    const asked: string[] = []
    const olderOffice = (async (input: string | URL | Request, init?: RequestInit) => {
      asked.push(`${init?.method ?? 'GET'} ${new URL(String(input)).pathname}`)
      return new Response(AN_OLDER_OFFICES_404, { status: 404, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    await expect(fileBacklogItems({ file: aFile(A_FILE, 'older.md'), line: 'made-up-line', placedBy: PLACED_BY, env: ENV, fetchImpl: olderOffice, say: () => {} }))
      .rejects.toThrow('Filing was refused: this office has no backlog door')
    expect(asked).toEqual(['GET /api/backlog'])
    expect(itemsStored()).toBe(stored)
  })

  it('6. names the records filed before a refusal part way, and the item refused', async () => {
    let posts = 0
    const refusesTheThird = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST' && ++posts === 3) return new Response(JSON.stringify({ error: 'Made-up refusal.' }), { status: 400 })
      return theMadeUpOffice(input, init)
    }) as typeof fetch
    let refusal = ''
    try {
      await fileBacklogItems({ file: aFile(A_FILE, 'part.md'), line: 'made-up-part-line', placedBy: PLACED_BY, env: ENV, fetchImpl: refusesTheThird, say: () => {} })
    } catch (error) {
      refusal = (error as Error).message
    }
    const read = await readTheLine('made-up-part-line')
    expect(read.items.map((one) => one.data['number'])).toEqual(['1', '2'])
    expect(refusal).toContain('item 2b was refused (400): Made-up refusal.')
    for (const item of read.items) expect(refusal).toContain(item.id)
    expect(refusal).toContain('Items 2b and 3 were not filed.')
  })

  it('7. the command line refuses a missing line, file or placer, and a placer that is not kind:id', async () => {
    const path = aFile(A_FILE, 'cli.md')
    for (const [argv, says] of [
      [['--file', path, '--placed-by', `person:${PLACED_BY.id}`], '--line'],
      [['--line', 'made-up-cli-line', '--placed-by', `person:${PLACED_BY.id}`], '--file'],
      [['--line', 'made-up-cli-line', '--file', path], '--placed-by'],
      [['--line', 'made-up-cli-line', '--file', path, '--placed-by', PLACED_BY.id], '--placed-by'],
    ] as const) {
      const said: string[] = []
      const { asked, fetchImpl } = nothingAsked()
      expect(await main([...argv], { env: ENV, fetchImpl, say: (one: string) => said.push(one) })).toBe(2)
      expect(said.join('\n')).toContain(says)
      expect(asked).toEqual([])
    }
  })

  it('8. is read back at the request helper\'s own limit, so a line longer than that is filed and refused as cut', async () => {
    // Two made-up items whose words together are longer than the helper's own limit, so the line's answer is too.
    const long = 'made up '.repeat(Math.ceil(THE_LONGEST_REPLY / 2 / 'made up '.length))
    const text = `1. Made-up long item: ${long}\n2. Made-up long item: ${long}\n`
    let refusal = ''
    try {
      await fileBacklogItems({ file: aFile(text, 'long.md'), line: 'made-up-long-line', placedBy: PLACED_BY, env: ENV, fetchImpl: theMadeUpOffice, say: () => {} })
    } catch (error) {
      refusal = (error as Error).message
    }
    const read = await readTheLine('made-up-long-line')
    expect(JSON.stringify(read).length).toBeGreaterThan(THE_LONGEST_REPLY)
    expect(read.items.map((one) => one.data['why'])).toEqual([`1. Made-up long item: ${long}`, `2. Made-up long item: ${long}`])
    expect(refusal).toContain('Line made-up-long-line was filed, but reading it back')
    expect(refusal).toContain('(200, cut)')
    for (const item of read.items) expect(refusal).toContain(item.id)
  })
})
