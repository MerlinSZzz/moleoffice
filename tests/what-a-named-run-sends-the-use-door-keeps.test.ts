// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A NAMED RUN SENDS, THE USE DOOR KEEPS: tools/run-named-tests.mjs against the real POST /api/toolset/uses.
 *
 * Wave 13n, message Vue3ni42wa94: a named run's result for each test file goes in the table test_file_runs
 * (migration 0279), through the use door, with no new route. Two workers built the two sides apart.
 * tests/a-named-run-sends-each-files-result.test.ts proves what the tool sends, against a stand-in office.
 * tests/a-named-run-keeps-each-files-result.test.ts proves what the door keeps, from bodies written by hand. Each side
 * could change its shape with its own test still green, so this file runs the two together. The tool runs as a child
 * with a stand-in vitest. A small server in this test hands each request the tool sends to the real app with
 * app.inject, with the tool's own headers less its key, and gives the tool the app's answer.
 *
 * WHAT IS PROVED
 *   1. A clean repository and three named files, one passed, one failed and one the report leaves out: the door
 *      answers 201, and test_file_runs holds three rows on the one use, as the tool sent them, with the HEAD commit
 *      and the change none. The tool says the door stored 3.
 *   2. A changed tracked file: the door keeps the HEAD commit and the tool's 16-character change hash.
 *   3. A folder that is not a git checkout: the door keeps the commit and the change as null.
 * In each case the app was handed exactly one request, the tool keeps vitest's exit code, and the one row in tool_uses
 * is on the run the tool named. The tool's test-batches seat (tools/test-batch-seat.mjs) is not this file's join: the
 * server grants it and takes it back itself, and hands on the rest. tests/the-test-tool-takes-a-test-batch-seat.test.ts
 * joins the seat to its own doors.
 *
 * Every key here is made up. The app's database is a fresh one of the test's own, and nothing reaches an office.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_TEST_FILES_TOOL } from '../src/shared/toolset.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']
const THE_KEY = 'mok_a-made-up-key-for-a-joined-named-run-01'
const THE_AGENT = 'named-tests-joined-tester'
/** The headers the server hands on to the app. The key is not one of them: the test app takes an agent's name unchecked. */
const HANDED_ON = ['content-type', 'x-mole-office-workspace', 'x-mole-office-actor-type', 'x-mole-office-actor-id', 'x-mole-office-session', 'x-mole-office-purpose']

let t: TestDb
let app: FastifyInstance
let run = ''
let root = ''
let server: Server
let api = ''
let WORKSPACE = 'default'
let caseNumber = 0
/** The uses the office already held when this case started, so the case's own use can be told apart. */
let usesAtStart: string[] = []
/** The file rows the office already held when this case started, so every row the case added can be read. */
let fileRowsAtStart: string[] = []
/** The status of each answer the app gave the tool, in order. */
let answered: number[] = []
const THE_SEAT = 'seat-of-the-joined-run'
const THE_ROW = 'row-of-the-joined-run'

/** The server's own answer to the test-batches seat's two doors, or null for a request it hands on. */
function theSeatsAnswer(url: string): unknown {
  if (url === 'POST /api/slots/acquire') return { slot: { id: THE_SEAT, state: 'granted', seat: 1, position: null }, asked: 'new', handedOn: [], says: 'Granted.' }
  if (url === `POST /api/slots/${THE_SEAT}/release`) return { released: true, id: THE_SEAT, says: 'Given back.' }
  return null
}

/**
 * The server's own answer to the tool's own process row, or null for a request it hands on. The row is not this
 * file's join: it is proved in the-test-tool-registers-its-own-background-process, and the use door is what is read.
 */
function theOwnRowAnswer(url: string): unknown {
  if (url === 'POST /api/resources') return { resource: { id: THE_ROW, type: 'process' } }
  if (url === `POST /api/resources/${THE_ROW}/release`) return { resource: { id: THE_ROW } }
  return null
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `default-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: WORKSPACE, title: 'Mole Office' } })
  expect(made.statusCode, made.body).toBe(201)
  const actor = { type: 'agent', id: THE_AGENT } as const
  run = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'A synthetic named-test run', data: { state: 'running' }, actor }).id
  const category = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool_category', title: 'Synthetic tools', data: { says: 'Test fixtures.' }, actor }).id
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'tool', title: THE_TEST_FILES_TOOL, data: { entry: 'tool', slug: THE_TEST_FILES_TOOL, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor })
  usesAtStart = (t.client.sqlite.prepare('SELECT id FROM tool_uses').all() as { id: string }[]).map((one) => one.id)
  fileRowsAtStart = (t.client.sqlite.prepare('SELECT id FROM test_file_runs').all() as { id: string }[]).map((one) => one.id)
  root = mkdtempSync(join(tmpdir(), 'a-joined-named-run-'))
  mkdirSync(join(root, 'tests'))
  answered = []
  server = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      const seat = theSeatsAnswer(`${req.method ?? ''} ${req.url ?? ''}`)
      if (seat !== null) {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(seat))
        return
      }
      const row = theOwnRowAnswer(`${req.method ?? ''} ${req.url ?? ''}`)
      if (row !== null) {
        // THE LEDGER'S OWN DOOR ANSWERS 201 with the row it wrote. The tool takes only that; a 200 means no row.
        res.statusCode = 201
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(row))
        return
      }
      void handOn(req.method ?? 'GET', req.url ?? '/', req.headers, text).then(({ status, type, body }) => {
        answered.push(status)
        res.statusCode = status
        res.setHeader('content-type', type)
        res.end(body)
      })
    })
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
})

afterEach(async () => {
  await new Promise<void>((closed) => server.close(() => closed()))
  rmSync(root, { recursive: true, force: true })
})

/** One request the tool sent, answered by the real app. */
async function handOn(method: string, url: string, heard: IncomingHttpHeaders, payload: string): Promise<{ status: number; type: string; body: string }> {
  const headers: Record<string, string> = {}
  for (const name of HANDED_ON) {
    const value = heard[name]
    if (typeof value === 'string') headers[name] = value
  }
  const res = await app.inject({ method: method as 'POST', url, headers, payload })
  return { status: res.statusCode, type: String(res.headers['content-type'] ?? 'application/json'), body: res.body }
}

/** Writes a file under the case's folder, making its folders, and gives its absolute path. */
function put(path: string, text = "test('x', () => {})\n"): string {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, text)
  return full
}

/** The first 16 lowercase hex characters of a file's SHA-256. */
function hashOf(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16)
}

/** Runs git in the case's folder with no shell, and gives its trimmed output; fails the case when git fails. */
function git(args: string[]): string {
  const ran = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  expect(ran.status, `git ${args.join(' ')} said: ${ran.stderr}`).toBe(0)
  return ran.stdout.trim()
}

/** Commits everything in the case's folder, with the identity on the command, and gives HEAD. */
function commitAll(): string {
  git(['add', '.'])
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'a commit'])
  return git(['rev-parse', '--verify', 'HEAD^{commit}'])
}

/** A stand-in vitest: it writes the report items given and exits 3, so the exit code can be told. */
function standIn(items: unknown[]): string {
  return put(
    'stand-in-vitest.mjs',
    `import { writeFileSync } from 'node:fs'
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: ${JSON.stringify(items)} }))
process.exit(3)
`,
  )
}

/** The tool as a child, sending to this test's server, with the four office variables and a made-up key. */
function runTool(words: string[]): Promise<{ code: number | null; out: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
  Object.assign(env, { MOLE_OFFICE_API: api, MOLE_OFFICE_SESSION: run, MOLE_OFFICE_WORKSPACE: WORKSPACE, MOLE_OFFICE_AGENT: THE_AGENT, MOLE_AGENT_KEY: THE_KEY })
  return new Promise((done) => {
    const child = spawn(process.execPath, [TOOL, ...words], { cwd: root, env })
    let out = ''
    child.stdout.on('data', (chunk) => (out += String(chunk)))
    child.stderr.on('data', (chunk) => (out += String(chunk)))
    child.on('close', (code) => done({ code, out }))
  })
}

interface FileRow { id: string; use_id: string; file: string; result: string; seconds: number | null; test_file_hash: string | null; tree_commit: string | null; tree_change: string | null }

/** The one use this case added, on the tool's run, and its file rows by path. */
function theOneUse(): { said: string; files: Omit<FileRow, 'id' | 'use_id'>[] } {
  const uses = t.client.sqlite.prepare('SELECT id, run_id, tool, said FROM tool_uses').all() as { id: string; run_id: string; tool: string; said: string }[]
  // THE READING STAYS OVER EVERY USE THE OFFICE HOLDS, and what the case must see is that it added one.
  const made = uses.filter((one) => !usesAtStart.includes(one.id))
  expect(made).toHaveLength(1)
  expect(made[0]).toMatchObject({ run_id: run, tool: THE_TEST_FILES_TOOL })
  const rows = t.client.sqlite.prepare('SELECT id, use_id, file, result, seconds, test_file_hash, tree_commit, tree_change FROM test_file_runs ORDER BY file').all() as FileRow[]
  // EVERY FILE ROW THE CASE ADDED IS ON ITS ONE USE, as every row was when each case had an office of its own.
  const added = rows.filter((one) => !fileRowsAtStart.includes(one.id))
  for (const row of added) expect(row.use_id).toBe(made[0]!.id)
  return { said: made[0]!.said, files: added.map(({ id: _id, use_id: _use, ...row }) => row) }
}

describe('what a named run sends, the use door keeps', () => {
  it('1. keeps passed, failed and no result, with their seconds and hashes, the HEAD commit and none', async () => {
    git(['init', '--quiet'])
    writeFileSync(join(root, '.gitignore'), '.logs\nstand-in-vitest.mjs\n')
    const one = put('tests/one.test.ts')
    const two = put('tests/two.test.ts', "test('two', () => {})\n")
    const three = put('tests/three.test.ts', "test('three', () => {})\n")
    const head = commitAll()
    const vitest = standIn([
      { name: one, status: 'passed', startTime: 1000, endTime: 2234.567 },
      { name: two, status: 'failed', startTime: 5000, endTime: 6500 },
    ])
    const ran = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts', 'tests/two.test.ts', 'tests/three.test.ts'])
    expect(answered, ran.out).toEqual([201])
    expect(ran.code, ran.out).toBe(3)
    expect(ran.out).toContain(`The use was written on the run ${run}, with 3 test file results.`)
    const use = theOneUse()
    expect(use.said).toMatch(/^named 3 files /)
    expect(use.files).toEqual([
      { file: 'tests/one.test.ts', result: 'passed', seconds: 1.235, test_file_hash: hashOf(one), tree_commit: head, tree_change: 'none' },
      { file: 'tests/three.test.ts', result: 'no result', seconds: null, test_file_hash: hashOf(three), tree_commit: head, tree_change: 'none' },
      { file: 'tests/two.test.ts', result: 'failed', seconds: 1.5, test_file_hash: hashOf(two), tree_commit: head, tree_change: 'none' },
    ])
  })

  it('2. keeps the HEAD commit and the change hash of a changed tracked file', async () => {
    git(['init', '--quiet'])
    writeFileSync(join(root, '.gitignore'), '.logs\nstand-in-vitest.mjs\n')
    writeFileSync(join(root, 'tracked.txt'), 'one\n')
    const one = put('tests/one.test.ts')
    const head = commitAll()
    writeFileSync(join(root, 'tracked.txt'), 'two\n')
    const vitest = standIn([{ name: one, status: 'passed', startTime: 0, endTime: 250 }])
    const ran = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(answered, ran.out).toEqual([201])
    expect(ran.code, ran.out).toBe(3)
    const [row] = theOneUse().files
    expect(row).toMatchObject({ file: 'tests/one.test.ts', result: 'passed', seconds: 0.25, test_file_hash: hashOf(one), tree_commit: head })
    expect(row!.tree_change).toMatch(/^[0-9a-f]{16}$/)
  })

  it('3. keeps the commit and the change as null for a folder that is not a git checkout', async () => {
    const one = put('tests/one.test.ts')
    const vitest = standIn([{ name: one, status: 'failed', startTime: 0, endTime: 1000 }])
    const ran = await runTool(['--root', root, '--vitest', vitest, 'tests/one.test.ts'])
    expect(answered, ran.out).toEqual([201])
    expect(ran.code, ran.out).toBe(3)
    expect(theOneUse().files).toEqual([
      { file: 'tests/one.test.ts', result: 'failed', seconds: 1, test_file_hash: hashOf(one), tree_commit: null, tree_change: null },
    ])
  })
})
