// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A USE LINE THE TOOL DID NOT SEND IS MARKED WHERE USE LINES ARE READ. Wave 13n round R, item 2i (problem r9ob5kZmvzyV).
 *
 * A key in a shell can still be used by hand, so the key alone does not say whether tools/use-line.mjs sent a line. The
 * tool sends a proof beside each line, made from the key it sends and the words of the line. The office checks it and
 * keeps what it found on the line. A hand-sent line is a reminder in the seal preview, not a refusal.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A line tools/use-line.mjs sends with the run's own key is unmarked in GET /api/toolset/runs/<run>/uses.
 *   2. A line sent by hand with the same run key and no proof is marked, and the mark says it may have been written by hand.
 *      The door's reply to that line says it is marked.
 *   3. A copy of the tool's whole request with other words is marked: the proof does not match.
 *   4. The tool's proof sent with the same words and session under another key is marked: the proof does not match.
 *   5. A line with files and tree is unmarked, and so is the second send without them that an office older than
 *      migration 0279 asks for.
 *   6. A line the office wrote without checking says so, and is not called hand-sent.
 *   7. The seal preview names each hand-sent named-tests line by its place and words, as a likely item about test proof.
 *      A run whose lines all came through the tool gets no such item.
 *
 * Every repository is made here in the system's temporary folder; every key, run and line is made up. Nothing here reaches
 * an office other than the one this file makes.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION AND RESTORE: in the round R report of the run that added this file.
 * ---------------------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_FILES_TOOL } from '../src/shared/toolset.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { writeAUseLine } from '../tools/use-line.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-whose-lines-are-marked'
const THE_OFFICE_WORKER = 'mole-office/the-message-worker'
/** The variables tools/use-line.mjs reads from this process. Each is taken out for the file and put back after it. */
const THE_TOOLS_VARIABLES = ['MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION'] as const
/** Headers that belong to one connection, which a copy of a request does not carry. */
const ONE_CONNECTIONS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive'])

let t: TestDb
let app: FastifyInstance
let server: Server
let api = ''
const directories: string[] = []
const before: Partial<Record<(typeof THE_TOOLS_VARIABLES)[number], string>> = {}

/** Each request the tool sent, as the stand-in between it and the office heard it, in order. */
let heard: { headers: Record<string, string>; body: Record<string, unknown> }[] = []
/** When true, the stand-in answers a body with files as an office older than migration 0279 does, and sends nothing on. */
let refuseFiles = false

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_OFFICE_WORKER,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** The headers of one request, one value each, without those of its connection. */
function theHeadersOf(headers: IncomingHttpHeaders): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (ONE_CONNECTIONS.has(name) || value === undefined) continue
    kept[name] = Array.isArray(value) ? value.join(', ') : value
  }
  return kept
}

/** A run filed by the office's worker at commit A, with commit B on its branch adding a test file. Made-up repository. */
async function aRun(): Promise<{ id: string; key: string; b: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-marked-lines-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic marked-lines test')
  git(dir, 'config', 'user.email', 'marked-lines@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  writeFileSync(join(dir, 'work/a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic run whose use lines are marked',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'testing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  writeFileSync(join(dir, 'work/made-up.test.ts'), 'it("is made up", () => {})\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit B')
  return { id: body.record.id, key, b: git(dir, 'rev-parse', 'HEAD') }
}

/** One line sent by tools/use-line.mjs, from a shell that holds `key` as MOLE_AGENT_KEY, to the stand-in. */
async function byTheTool(run: string, key: string, use: { tool: string; said: string; files?: unknown[]; tree?: unknown }): Promise<{ written: boolean; why: string; words: string }> {
  process.env['MOLE_AGENT_KEY'] = key
  try {
    return await writeAUseLine({ ...(use as { tool: string; said: string }), office: { api, workspace: 'default', agent: HANDLE, session: run } })
  } finally {
    delete process.env['MOLE_AGENT_KEY']
  }
}

/** One line sent straight to the office's use door, as a hand would send it, and the door's reply. */
async function byHand(headers: Record<string, string>, body: Record<string, unknown>): Promise<{ proof?: unknown; says?: string }> {
  const sent = await app.inject({ method: 'POST', url: '/api/toolset/uses', headers, payload: body })
  expect(sent.statusCode, sent.body.slice(0, 400)).toBe(201)
  return sent.json() as { proof?: unknown; says?: string }
}

interface AUseAsRead { seq: number; said: string; proof?: unknown; mark?: unknown }

/** The run's uses as GET /api/toolset/runs/<run>/uses answers them, oldest first. */
async function theUsesOf(run: string): Promise<AUseAsRead[]> {
  const got = await app.inject({ method: 'GET', url: `/api/toolset/runs/${run}/uses`, headers: AS_THE_PERSON })
  expect(got.statusCode, got.body.slice(0, 300)).toBe(200)
  return [...(got.json() as { uses: AUseAsRead[] }).uses].reverse()
}

const aNamedTestsLine = (exited: number) => `named 1 file (work/made-up.test.ts); vitest exited ${String(exited)}`

beforeAll(async () => {
  for (const name of THE_TOOLS_VARIABLES) {
    const value = process.env[name]
    if (value !== undefined) before[name] = value
    delete process.env[name]
  }
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  const actor = { type: 'human' as const, id: THE_PERSON }
  const category = t.api.createRecord({ workspaceId: 'default', kind: 'tool_category', title: 'Synthetic tools', data: { says: 'Test fixtures.' }, actor }).id
  for (const slug of [THE_TEST_FILES_TOOL, 'sandbox']) {
    t.api.createRecord({ workspaceId: 'default', kind: 'tool', title: slug, data: { entry: 'tool', slug, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor })
  }

  // THE STAND-IN BETWEEN THE TOOL AND THE OFFICE: it keeps each request the tool sent and hands it on whole.
  server = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      const headers = theHeadersOf(req.headers)
      const body = JSON.parse(text === '' ? '{}' : text) as Record<string, unknown>
      heard.push({ headers, body })
      if (refuseFiles && body['files'] !== undefined) {
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'The use is an object: Unrecognized key: "files". Nothing was written.' }))
        return
      }
      void app.inject({ method: (req.method ?? 'GET') as 'POST', url: req.url ?? '/', headers, payload: text }).then((answer) => {
        res.writeHead(answer.statusCode, { 'content-type': String(answer.headers['content-type'] ?? 'application/json') })
        res.end(answer.body)
      })
    })
  })
  await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await new Promise<void>((closed) => server?.close(() => closed()))
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
  for (const name of THE_TOOLS_VARIABLES) {
    if (before[name] === undefined) delete process.env[name]
    else process.env[name] = before[name]
  }
})

describe('a use line the tool did not send is marked where use lines are read', () => {
  it('1 and 2: a line the tool sent is unmarked, and a line sent by hand with the same run key is marked', async () => {
    const { id, key } = await aRun()
    heard = []
    const sent = await byTheTool(id, key, { tool: 'sandbox', said: 'started one worker' })
    expect(sent, sent.words).toMatchObject({ written: true })
    expect(heard).toHaveLength(1)
    const replied = await byHand(asTheRun(id, key), { tool: 'sandbox', said: 'started one worker' })
    expect(replied.proof).toBe('none')
    expect(replied.says).toContain('It is marked where use lines are read: No proof that tools/use-line.mjs sent it')

    const [fromTheTool, byAHand] = await theUsesOf(id)
    expect(fromTheTool).toMatchObject({ seq: 1, said: 'started one worker', proof: 'matches', mark: null })
    expect(byAHand).toMatchObject({ seq: 2, said: 'started one worker', proof: 'none' })
    expect(byAHand?.mark).toEqual(expect.stringContaining('No proof that tools/use-line.mjs sent it'))
    expect(byAHand?.mark).toEqual(expect.stringContaining('written by hand'))
  })

  it("3 and 4: the tool's proof copied onto other words, or sent under another key, does not match", async () => {
    const { id, key } = await aRun()
    heard = []
    expect(await byTheTool(id, key, { tool: 'sandbox', said: 'started one worker' })).toMatchObject({ written: true })
    const copied = heard[0]!.headers
    // The whole request again, with other words: the key, the session and the proof are the tool's.
    await byHand(copied, { tool: 'sandbox', said: 'started two workers' })
    // The same words and session with the tool's proof, sent under the office worker's key.
    await byHand({ ...copied, 'x-mole-office-actor-id': THE_OFFICE_WORKER, 'x-mole-office-key': A_MADE_UP_OFFICE_KEY }, { tool: 'sandbox', said: 'started one worker' })

    const [tools, otherWords, otherKey] = await theUsesOf(id)
    expect(tools).toMatchObject({ seq: 1, proof: 'matches', mark: null })
    for (const one of [otherWords, otherKey]) {
      expect(one?.proof).toBe('does not match')
      expect(one?.mark).toEqual(expect.stringContaining('No proof that tools/use-line.mjs sent it'))
      expect(one?.mark).toEqual(expect.stringContaining('does not match'))
    }
    expect(otherWords).toMatchObject({ seq: 2, said: 'started two workers' })
    expect(otherKey).toMatchObject({ seq: 3, said: 'started one worker' })
  })

  it('5: a line with files and tree is unmarked, and so is the second send without them', async () => {
    const { id, key, b } = await aRun()
    const files = [{ file: 'work/made-up.test.ts', result: 'passed', seconds: 0.5, testFileHash: '0123456789abcdef' }]
    const tree = { commit: b, change: 'none' }
    expect(await byTheTool(id, key, { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(0), files, tree })).toMatchObject({ written: true, why: 'written' })
    refuseFiles = true
    heard = []
    try {
      expect(await byTheTool(id, key, { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(1), files, tree })).toMatchObject({ written: true, why: 'written without files' })
    } finally {
      refuseFiles = false
    }
    expect(heard.map((one) => one.body['files'] === undefined)).toEqual([false, true])

    const [withFiles, without] = await theUsesOf(id)
    expect(withFiles).toMatchObject({ seq: 1, said: aNamedTestsLine(0), proof: 'matches', mark: null })
    expect(without).toMatchObject({ seq: 2, said: aNamedTestsLine(1), proof: 'matches', mark: null })
  })

  it('6: a line the office wrote without checking says nobody checked, and is not called hand-sent', async () => {
    const { id } = await aRun()
    const { writeAUse } = await import('../src/server/lib/toolset.ts')
    writeAUse({ workspaceId: 'default', actor: { type: 'agent', id: HANDLE, sessionId: id }, tool: 'sandbox', said: 'written by the office itself' })
    const [one] = await theUsesOf(id)
    expect(one).toMatchObject({ seq: 1, proof: null })
    expect(one?.mark).toEqual(expect.stringContaining('Not known whether tools/use-line.mjs sent it'))
    expect(one?.mark).not.toEqual(expect.stringContaining('by hand'))
  })

  it('7: the seal preview names each hand-sent named-tests line, and says nothing when the tool sent them all', async () => {
    const mixed = await aRun()
    expect(await byTheTool(mixed.id, mixed.key, { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(0) })).toMatchObject({ written: true })
    await byHand(asTheRun(mixed.id, mixed.key), { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(1) })
    expect(await byTheTool(mixed.id, mixed.key, { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(0) })).toMatchObject({ written: true })
    const reminded = await app.inject({ method: 'PATCH', url: `/api/records/${mixed.id}`, headers: asTheRun(mixed.id, mixed.key), payload: { dataPatch: { state: 'finished', tip: mixed.b } } })
    expect(reminded.statusCode, reminded.body.slice(0, 600)).toBe(200)
    const items = (reminded.json() as { beforeTheSeal: { items: { key: string; about: string; says: string; mechanical?: boolean }[] } }).beforeTheSeal.items
    const marked = items.find((one) => one.key === 'test-lines:not-from-the-tool')
    expect(marked, JSON.stringify(items.map((one) => one.key))).toMatchObject({ about: 'test proof', mechanical: false })
    expect(marked?.says).toContain(`use 2 ("${aNamedTestsLine(1)}")`)
    expect(marked?.says).toContain('No proof that tools/use-line.mjs sent it')
    expect(marked?.says).not.toContain('use 1 ')
    expect(marked?.says).not.toContain('use 3 ')
    // No item asks for a control, a mutation and a restore of the changed test.
    expect(items.map((one) => one.key)).not.toContain('test:work/made-up.test.ts')

    const allByTheTool = await aRun()
    for (const exited of [0, 1, 0]) {
      expect(await byTheTool(allByTheTool.id, allByTheTool.key, { tool: THE_TEST_FILES_TOOL, said: aNamedTestsLine(exited) })).toMatchObject({ written: true })
    }
    const clean = await app.inject({ method: 'PATCH', url: `/api/records/${allByTheTool.id}`, headers: asTheRun(allByTheTool.id, allByTheTool.key), payload: { dataPatch: { state: 'finished', tip: allByTheTool.b } } })
    expect(clean.statusCode, clean.body.slice(0, 600)).toBe(200)
    const keys = (clean.json() as { beforeTheSeal: { items: { key: string }[] } }).beforeTheSeal.items.map((one) => one.key)
    expect(keys).not.toContain('test-lines:not-from-the-tool')
    expect(keys).not.toContain('test:work/made-up.test.ts')
  })
})
