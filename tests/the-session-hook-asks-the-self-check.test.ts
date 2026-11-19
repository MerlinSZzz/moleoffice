// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK ASKS THE SHARED SELF-CHECK BEFORE IT FILES (invariant 9).
 *
 * These are stand-ins, as in every-reply-says-which-world-answered.test.ts: each answers with a
 * world header and health body, and records the hook's requests. A real scratch file gives the
 * declared database a readable identity. No request goes to the live office.
 */
import { spawn } from 'node:child_process'
import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { theAnswerInWords, theWorldTheDeclarationNames, whatAnswersForThisOffice } from '../src/config/the-self-check.mjs'
import { WORLD_HEADER, formatWorldHeader, worldInWords, type WorldOnTheWire } from '../src/config/world-header.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const hook = join(repo, 'tools/session-hook.mjs')
let scratch: string
let database: string
let world: WorldOnTheWire
let fake: Server | null
let api: string
let conversation: string
let asked: { method: string; path: string; headers: IncomingHttpHeaders }[]

beforeEach(() => {
  scratch = aTestDatabaseFolder('hook-self-check')
  database = join(scratch, 'stand-in.db')
  writeFileSync(database, 'a stand-in database file, only its identity is read')
  world = { database: databaseIdentity(database).id, repository: repo, port: '12345', head: 'abc1234', standing: 'scratch' }
  conversation = `hook-self-check-${Math.random().toString(36).slice(2)}`
  asked = []
  fake = null
})

afterEach(async () => {
  if (fake !== null) await new Promise<void>((done) => fake!.close(() => done()))
  rmSync(join(repo, '.logs', `session-${conversation}.json`), { force: true })
  rmSync(scratch, { recursive: true, force: true })
})

async function standIn(header: string | null, health: unknown = { ok: true }, dropHealth = false): Promise<void> {
  fake = createServer((req, res) => {
    asked.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers })
    req.resume()
    if (req.url === '/api/health' && dropHealth) {
      req.socket.destroy()
      return
    }
    if (header !== null) res.setHeader(WORLD_HEADER, header)
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(
      req.url === '/api/health' ? health
        : req.method === 'POST' && req.url === '/api/records' ? { record: { id: 'sELFcheck01', title: 'filed by a stand-in' } }
          : { ok: true },
    ))
  })
  await new Promise<void>((done) => fake!.listen(0, '127.0.0.1', done))
  const address = fake.address()
  if (address === null || typeof address === 'string') throw new Error('the stand-in has no port')
  api = `http://127.0.0.1:${String(address.port)}`
}

function runHook(source?: string): Promise<string> {
  return new Promise((done, fail) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: scratch,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_PORT: world.port,
      MOLE_OFFICE_DB: database,
      MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
      MOLE_OFFICE_WORKSPACE: 'default',
    }
    // The hook supplies its own identity; no inherited agent, run or key decides this stand-in's case.
    for (const key of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'TMUX_PANE']) delete env[key]
    const child = spawn(process.execPath, [hook, 'start'], { cwd: repo, env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('error', fail)
    child.on('close', (code) => code === 0 ? done(stdout) : fail(new Error(`hook exited ${String(code)}: ${stderr}`)))
    child.stdin.end(JSON.stringify({ session_id: conversation, ...(source === undefined ? {} : { source }) }))
  })
}

const healthyLine = (): string =>
  `This session is filed in the world this checkout declares: ${worldInWords(world)}. ` +
  'The database, the checkout and the port are what was checked. The commit is what the running code was ' +
  'loaded from, which GET /api/runtime/freshness compares with the checkout.'
const writes = () => asked.filter((one) => one.method !== 'GET')
const note = () => join(repo, '.logs', `session-${conversation}.json`)

/** Read the same reply through the self-check, without another request to the stand-in. */
async function selfCheckLines(header: string | null, health: unknown = { ok: true }): Promise<string[]> {
  const answering = await whatAnswersForThisOffice({
    address: api,
    expected: theWorldTheDeclarationNames({ databasePath: database, apiPort: Number(world.port) }),
    asks: 1,
    fetchImpl: async () => new Response(JSON.stringify(health), {
      headers: header === null ? {} : { [WORLD_HEADER]: header },
    }),
  })
  return theAnswerInWords(answering).map((line) => `  ${line}`)
}

const cannotTellText = (lines: string[]): string => [
  `WHETHER THE MOLE OFFICE ANSWERING ON ${api} IS THE ONE THIS CHECKOUT DECLARES CANNOT BE TOLD, so this session has NOT been filed.`,
  ...lines,
  "Look at this checkout's database, checkout and port settings, and GET /api/runtime on the office answering for what it could not read.",
  'Nothing was written. Anything you want kept has to be filed by hand, once you know what you are talking to.',
].join('\n')

/** MUTATION: treat cannot-tell as healthy. Every unknown-fact case must refuse all writes. */
describe('the hook refuses to file when a declared fact cannot be read', () => {
  it.each(['unknown', ''])('names an unreadable checkout on the office answering (%j)', async (value) => {
    const header = formatWorldHeader({ ...world, repository: value })
    await standIn(header)
    const said = await runHook()
    expect(said.trim()).toBe(cannotTellText(await selfCheckLines(header)))
    expect(asked.map((one) => `${one.method} ${one.path}`)).toEqual(['GET /api/health'])
    expect(existsSync(note())).toBe(false)
  })

  it('names an unreadable database on this checkout', async () => {
    rmSync(database)
    const header = formatWorldHeader(world)
    await standIn(header)
    const said = await runHook()
    expect(said.trim()).toBe(cannotTellText(await selfCheckLines(header)))
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })

  it('names an unreadable database on both sides', async () => {
    rmSync(database)
    const header = formatWorldHeader({ ...world, database: 'unknown' })
    await standIn(header)
    const said = await runHook()
    expect(said.trim()).toBe(cannotTellText(await selfCheckLines(header)))
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })
})

describe('the hook keeps the known-world paths and words', () => {
  /** MUTATION: drop the self-check's unhealthy sentences. Every line must be carried into the brief. */
  it('files an unhealthy office with the existing line and the office own reasons', async () => {
    const header = formatWorldHeader(world)
    const health = { ok: false, wrong: ['the stand-in cannot read its settings', 'the stand-in supervisor failed'] }
    await standIn(header, health)
    const said = await runHook()
    expect(said).toContain([healthyLine(), ...await selfCheckLines(header, health)].join('\n'))
    expect(writes().some((one) => one.method === 'POST' && one.path === '/api/records')).toBe(true)
    expect(existsSync(note())).toBe(true)
    expect(writes().every((one) => one.headers['x-mole-office-home'] === world.database)).toBe(true)
  })

  /** MUTATION: drop the hook's headers. The one health ask must say its workspace and identity. */
  it('asks health once with its headers and files a healthy office with the existing line', async () => {
    await standIn(formatWorldHeader(world))
    const said = await runHook()
    expect(said).toContain(healthyLine())
    expect(said).not.toContain('\n  ')
    const health = asked.filter((one) => one.path === '/api/health')
    expect(health).toHaveLength(1)
    const filing = writes().find((one) => one.method === 'POST' && one.path === '/api/records')
    expect(filing).toBeDefined()
    expect(health[0]!.headers['x-mole-office-workspace']).toBe('default')
    expect(health[0]!.headers['x-mole-office-actor-type']).toBe('agent')
    expect(health[0]!.headers['x-mole-office-actor-id']).toBe(filing!.headers['x-mole-office-actor-id'])
    expect(health[0]!.headers['x-mole-office-actor-id']).toBeTruthy()
    expect(filing!.headers['x-mole-office-home']).toBe(world.database)
    expect(existsSync(note())).toBe(true)
  })

  /** MUTATIONS: file on wrong-world, or drop its self-check sentences. Both forms must refuse in full. */
  it('files nothing for a different world and keeps every existing refusal line', async () => {
    const other = { ...world, database: '9999999999999999', port: '23456' }
    const header = formatWorldHeader(other)
    await standIn(header)
    const said = await runHook()
    expect(said.trim()).toBe([
      `THE MOLE OFFICE ANSWERING ON ${api} IS NOT THE ONE THIS CHECKOUT DECLARES, so this session has NOT been filed.`,
      ...await selfCheckLines(header),
      'Filing into it would put this run in a database nobody is reading. What answers there is another world\'s office',
      '(the live one, when this session runs in a sandbox), and it is not this session\'s to stop. Point this session at the',
      'office its checkout declares, or start that office, then start a new session. Nothing was written.',
    ].join('\n'))
    expect(asked.map((one) => `${one.method} ${one.path}`)).toEqual(['GET /api/health'])
    expect(existsSync(note())).toBe(false)
  })

  /**
   * A WRONG WORLD IS NEVER TOLD TO BE STOPPED (19 October 2026; yGL4JyF0d867, from wave 13k). In a sandbox the
   * office answering is the live one by design, while the checkout declares the sandbox's own world, so this branch is the
   * normal case there, and advice to stop what answers was advice to stop the live office. MUTATION: put the old "Stop
   * whatever is on that port" back, and this case and the one above turn red.
   */
  it.each([
    ['another world', (): string | null => formatWorldHeader({ ...world, database: '9999999999999999', port: '23456' })],
    ['no world', (): string | null => null],
  ] as const)('advises no stop of what answers when it names %s', async (_which, header) => {
    await standIn(header())
    const said = await runHook()
    expect(said).not.toMatch(/\bstop (whatever|it|that|the)\b/i)
    expect(existsSync(note())).toBe(false)
  })

  /** MUTATION: file on wrong-world (no world). Keep the hook's first and closing lines verbatim. */
  it('files nothing for a reply naming no world and keeps every existing refusal line', async () => {
    await standIn(null)
    const said = await runHook()
    expect(said.trim()).toBe([
      `THE MOLE OFFICE ANSWERING ON ${api} DID NOT SAY WHICH WORLD IT IS, so this session has NOT been filed.`,
      ...await selfCheckLines(null),
      'Something other than the Mole Office server this checkout builds is answering on that address, or it is a',
      'version of it from before the header existed. Find out what is on that port before writing anything to it:',
      '    ss -ltnp | grep ' + world.port,
      'Nothing was written. Anything you want kept has to be filed by hand, once you know what you are talking to.',
    ].join('\n'))
    expect(asked.map((one) => `${one.method} ${one.path}`)).toEqual(['GET /api/health'])
    expect(existsSync(note())).toBe(false)
  })

  /** MUTATION: add a retry or refuse on not-answering. Silence leaves filing to the existing path. */
  it('asks only once when health does not answer, files as before, and adds no world line', async () => {
    await standIn(formatWorldHeader(world), { ok: true }, true)
    const said = await runHook()
    expect(asked.filter((one) => one.path === '/api/health')).toHaveLength(1)
    expect(writes().some((one) => one.method === 'POST' && one.path === '/api/records')).toBe(true)
    expect(existsSync(note())).toBe(true)
    expect(said).not.toContain('This session is filed in the world this checkout declares:')
    expect(said).not.toContain('THE MOLE OFFICE ANSWERING')
    expect(said).not.toContain('Nothing answers for this office:')
    expect(said).not.toContain('\n  ')
    expect(writes().every((one) => one.headers['x-mole-office-home'] === undefined)).toBe(true)
  })
})

/**
 * AFTER A COMPACTION THE WORLD IS READ OFF THE ONE READ'S OWN HEADER (wave 13k round 46), through the self-check.
 * MUTATION: print and write on a mismatch. Nothing from the reply is printed as this office's, and nothing is written.
 */
it('after a compaction, prints nothing from a different world as this office\'s and writes nothing', async () => {
  const other = { ...world, database: '9999999999999999', port: '23456' }
  await standIn(formatWorldHeader(other))
  const said = await runHook('compact')
  expect(asked.map((one) => `${one.method} ${one.path}`)).toEqual(['GET /api/after-a-compaction'])
  expect(said.split('\n')[0]).toBe(
    'MOLE OFFICE — after a compaction. The office that answered GET /api/after-a-compaction is not shown to be the one ' +
      "this checkout declares, so nothing it said is printed here as this office's, and nothing was recorded.",
  )
  expect(said).toContain(`THE MOLE OFFICE ANSWERING ON ${api} IS NOT THE ONE THIS CHECKOUT DECLARES, so this session has NOT been filed.`)
  expect(said).not.toContain('Your role:')
  expect(writes()).toEqual([])
  expect(existsSync(note())).toBe(false)
})

