// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LAUNCHED RUN IS TOLD IN ONE QUIET LINE. Wave 13t, round W43.
 *
 * A round launched in a sandbox talks to the office that holds its run, which is another world's: the sandbox's own
 * checkout declares its own database and port. So the session hook printed, at every start and after every compaction,
 * a warning that the office is not the one this checkout declares, though nothing was wrong. The launcher names the run
 * in MOLE_OFFICE_SESSION, and writes the run's `sandbox` field when it files it, which nobody else may write. Now the
 * hook asks the office answering for that run. When it holds it as a run whose sandbox folder holds this checkout, the
 * hook says so in one line, and still writes nothing. Measured with a stand-in office and the hook itself:
 *   1. at the start, a run the office holds in a sandbox that holds this checkout is said in one line, beginning
 *      "MOLE OFFICE —", naming the run, the office's address and the sandbox's folder; nothing is written;
 *   2. after a compaction, the same run is taken as this session's office: the role comes first and the warning is not
 *      printed; tests/the-hook-after-a-compaction-files-into-its-office.test.ts proves what it then files;
 *   3. with no run named, the warning is printed as before, and no run is read;
 *   4. a run with no sandbox, a run in another folder, a record that is not a run, and a run the office does not hold
 *      each leave the warning exactly as it is with no run named;
 *   5. after a compaction, a run with no sandbox leaves the warning exactly as it is with no run named.
 *
 * Each case compares the hook's words with its own words in another case, so no sentence of the hook is copied here.
 * No request goes to the live office.
 *
 * MUTATIONS, in for-agents/session-hook.mjs, with the cases each turned red when it was run:
 *   - the run is never read: cases 1, 2 and 4 go red;
 *   - any run the office holds is taken, with or without a sandbox: cases 4 and 5 go red;
 *   - any sandbox folder is taken, whether it holds this checkout or not: case 4 goes red;
 *   - a record of any kind is taken: case 4 goes red;
 *   - after a compaction the warning is kept for a launched run: case 2 goes red;
 *   - after a compaction a launched run is said in one quiet line and nothing more: case 2 goes red;
 *   - the run is asked for when the environment names none: case 3 goes red.
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const hook = join(repo, 'tools/session-hook.mjs')
const RUN = 'aLaunchedRun'
const MARK = 'MOLE OFFICE —'
let scratch: string
let database: string
let port: string
let fake: Server | null
let api: string
let conversation: string
let asked: string[]
/** What the stand-in answers to GET /api/records/<RUN>: a status and a body, or null for no such record. */
let theRun: { status: number; body: unknown } | null

beforeEach(async () => {
  scratch = aTestDatabaseFolder('a-launched-run')
  database = join(scratch, 'stand-in.db')
  writeFileSync(database, 'a stand-in database file, only its identity is read')
  port = '12345'
  conversation = `a-launched-run-${Math.random().toString(36).slice(2)}`
  asked = []
  theRun = null
  // ANOTHER WORLD ANSWERS, as the live office answers a sandbox's session: another database, checkout and port.
  const another = formatWorldHeader({
    database: '9999999999999999', repository: '/somewhere/else', port: '23456', head: 'abc1234', standing: 'canonical',
  })
  expect(databaseIdentity(database).id).not.toBe('9999999999999999')
  fake = createServer((req, res) => {
    asked.push(`${req.method ?? ''} ${req.url ?? ''}`)
    req.resume()
    res.setHeader(WORLD_HEADER, another)
    res.setHeader('content-type', 'application/json')
    if (req.method === 'GET' && req.url === `/api/records/${RUN}`) {
      res.statusCode = theRun?.status ?? 404
      res.end(JSON.stringify(theRun?.body ?? { error: 'the stand-in holds no such record' }))
      return
    }
    res.end(JSON.stringify(req.url === '/api/health' ? { ok: true } : {}))
  })
  await new Promise<void>((done) => fake!.listen(0, '127.0.0.1', done))
  const address = fake.address()
  if (address === null || typeof address === 'string') throw new Error('the stand-in has no port')
  api = `http://127.0.0.1:${String(address.port)}`
})

afterEach(async () => {
  if (fake !== null) await new Promise<void>((done) => fake!.close(() => done()))
  rmSync(join(repo, '.logs', `session-${conversation}.json`), { force: true })
  rmSync(scratch, { recursive: true, force: true })
})

/** A run record as the stand-in holds it. */
function aRun(kind: string, sandbox: unknown): { status: number; body: unknown } {
  return { status: 200, body: { record: { id: RUN, kind, title: 'a launched round', data: { state: 'running', ...(sandbox === undefined ? {} : { sandbox }) } } } }
}
const aSandbox = (folder: string) => ({ template: 'mole-office-dev', container: 'aContainerRow', folder })

/** The hook, started as Claude Code starts it, with MOLE_OFFICE_SESSION naming `session` or not set. */
function runHook(session: string | null, source?: string): Promise<string> {
  return new Promise((done, fail) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: scratch,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_PORT: port,
      MOLE_OFFICE_DB: database,
      MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
      MOLE_OFFICE_WORKSPACE: 'default',
    }
    for (const key of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'TMUX_PANE']) delete env[key]
    if (session !== null) env['MOLE_OFFICE_SESSION'] = session
    const child = spawn(process.execPath, [hook, 'start'], { cwd: repo, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', fail)
    child.on('close', (code) => code === 0 ? done(stdout.trim()) : fail(new Error(`hook exited ${String(code)}: ${stderr}`)))
    child.stdin.end(JSON.stringify({ session_id: conversation, ...(source === undefined ? {} : { source }) }))
  })
}

const writes = () => asked.filter((one) => !one.startsWith('GET '))
const note = () => join(repo, '.logs', `session-${conversation}.json`)

/** The hook's words, and what it asked, with no run named: the warning as it was before. */
async function theWarning(source?: string): Promise<{ said: string; asked: string[] }> {
  const said = await runHook(null, source)
  const then = [...asked]
  asked = []
  return { said, asked: then }
}

describe('a launched run is told in one quiet line', () => {
  it.each([
    ['the sandbox folder holds this checkout', () => dirname(repo)],
    ['the sandbox folder is this checkout', () => repo],
  ])('1: at the start, a run the office holds in a sandbox, where %s, is said in one line', async (_, folder) => {
    const warning = await theWarning()
    theRun = aRun('session', aSandbox(folder()))
    const said = await runHook(RUN)
    expect(said).not.toContain('\n')
    expect(said.startsWith(`${MARK} `)).toBe(true)
    expect(said).toContain(RUN)
    expect(said).toContain(api)
    expect(said).toContain(folder())
    expect(said).not.toBe(warning.said)
    expect(asked).toEqual(['GET /api/health', `GET /api/records/${RUN}`])
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })

  it('2: after a compaction, the same run is taken as this session\'s office: the hook goes on after its first line, and the warning is not printed', async () => {
    const warning = await theWarning('compact')
    theRun = aRun('session', aSandbox(dirname(repo)))
    const said = await runHook(RUN, 'compact')
    const firstLineOfTheWarning = warning.said.split('\n')[0]!
    const itsOpening = firstLineOfTheWarning.slice(0, firstLineOfTheWarning.indexOf('.') + 1)
    const lines = said.split('\n')
    expect(lines[0]!.startsWith(`${itsOpening} `)).toBe(true)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).not.toBe(firstLineOfTheWarning)
    expect(said).not.toContain(warning.said.split('\n')[1]!)
    expect(asked.slice(0, 2)).toEqual([`GET /api/after-a-compaction?run=${RUN}`, `GET /api/records/${RUN}`])
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })
})

describe('the warning stays for a session with no office of its own', () => {
  it('3: with no run named, the warning is printed, and no run is read', async () => {
    const warning = await theWarning()
    expect(warning.said).toContain('\n')
    expect(warning.said.startsWith(MARK)).toBe(false)
    expect(warning.asked).toEqual(['GET /api/health'])
    expect(existsSync(note())).toBe(false)
  })

  it.each([
    ['a run with no sandbox', () => aRun('session', undefined)],
    ['a run in a sandbox whose folder does not hold this checkout', () => aRun('session', aSandbox(join(dirname(repo), 'another-sandbox')))],
    ['a record that is not a run', () => aRun('report', aSandbox(dirname(repo)))],
    ['a run the office does not hold', () => null],
  ])('4: %s leaves the warning exactly as it is with no run named', async (_, run) => {
    const warning = await theWarning()
    theRun = run()
    const said = await runHook(RUN)
    expect(said).toBe(warning.said)
    expect(asked).toEqual(['GET /api/health', `GET /api/records/${RUN}`])
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })

  it('5: after a compaction, a run with no sandbox leaves the warning exactly as it is with no run named', async () => {
    const warning = await theWarning('compact')
    theRun = aRun('session', undefined)
    const said = await runHook(RUN, 'compact')
    expect(said).toBe(warning.said)
    expect(said).toContain('\n')
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })
})
