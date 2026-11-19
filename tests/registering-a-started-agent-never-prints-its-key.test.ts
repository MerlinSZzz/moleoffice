// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REGISTERING A STARTED AGENT NEVER PRINTS ITS KEY (problem PImMRnU2Ph1B).
 *
 * tools/register-a-started-agent.mjs printed the new agent's key on its output. When the starter is an agent,
 * that output is kept in the starter's log and conversation, which any process of the same user can read. Now the
 * key goes only to the file named by --key-file, a new file of mode 0600, and neither the plain lines nor --json
 * carry it. --key-file is required, and is checked before the request, so a registration never answers a key
 * with nowhere to put it.
 *
 * It runs the tool against a real API on a fresh database, on a port of its own. No model is called.
 *
 * THE PATHS A REAL OFFICE DOES NOT TAKE ON ASKING — a refusal that holds a key, a reply that is not JSON, a key file
 * that appears while the request is out — are answered by a stand-in office in this file, a plain HTTP server that
 * gives one canned reply. The key in those replies is made up here, from random bytes, and is no agent's key.
 * Each of those cases is red when a print of the key is put into its branch of the tool.
 *
 * THE STARTED AGENT IS GIVEN THE FILE'S PATH, NEVER THE KEY. The tool tells its starter to give the started agent the
 * key file's full path as MOLE_AGENT_KEY_FILE, and for-agents/agent-key.mjs reads the key from that file into the key
 * header of each request. So the key is in no environment, the started agent's included. The starter's own key is read
 * the same way, from MOLE_AGENT_KEY_FILE or MOLE_AGENT_KEY, and both at once is refused before any request.
 */
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const TOOL = `${CHECKOUT}/tools/register-a-started-agent.mjs`
const WORKSPACE = 'default'
const PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let api = ''
/** A folder this test made, and removes at the end. */
let folder = ''

/** A made-up key, from random bytes, which the stand-in office puts in its replies. It is no agent's key. */
const MADE_UP_KEY = randomBytes(32).toString('hex')
/** The stand-in office: what it answers next, what it does first, how many requests reached it, and their headers. */
const standIn: { status: number; body: string; first: () => void; requests: number; heard: IncomingHttpHeaders[] } = { status: 500, body: '', first: () => {}, requests: 0, heard: [] }
let standInServer: Server
let standInApi = ''

function run(args: string[], extra: Record<string, string> = {}): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const env = { ...process.env }
    delete env['MOLE_AGENT_KEY']
    delete env['MOLE_AGENT_KEY_FILE']
    delete env['MOLE_OFFICE_API']
    Object.assign(env, extra)
    const child = spawn(process.execPath, [TOOL, ...args], { cwd: CHECKOUT, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (data) => { out += String(data) })
    child.stderr.on('data', (data) => { err += String(data) })
    child.on('close', (code) => resolve({ code, out, err }))
  })
}

const common = (handle: string) => ['--handle', handle, '--name', `Agent ${handle}`, '--role', 'worker', '--area', 'src', '--as', 'key-starter', '--workspace', WORKSPACE, '--api', api]

function registered(handle: string): boolean {
  const row = t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'agent' AND json_extract(data, '$.handle') = ?").get(handle) as { n: number }
  return row.n > 0
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: 'key-starter', name: 'Key starter', role: 'secretary', runtime: 'claude-code' } })
  if (reply.statusCode !== 201 && reply.statusCode !== 200) throw new Error(`the starter was not registered: ${String(reply.statusCode)} ${reply.body}`)
  folder = mkdtempSync(join(tmpdir(), 'register-key-'))
  standInServer = createServer((request, response) => {
    standIn.requests += 1
    standIn.heard.push(request.headers)
    request.resume()
    request.on('end', () => {
      standIn.first()
      response.writeHead(standIn.status, { 'content-type': 'application/json' })
      response.end(standIn.body)
    })
  })
  await new Promise<void>((resolve) => standInServer.listen(0, '127.0.0.1', resolve))
  standInApi = `http://127.0.0.1:${String((standInServer.address() as AddressInfo).port)}`
}, 120_000)

/** The tool's arguments, pointed at the stand-in office instead of the real API. */
const atTheStandIn = (handle: string) => [...common(handle).slice(0, -1), standInApi]

/** Set what the stand-in office answers next. */
function standInAnswers(status: number, body: string, first: () => void = () => {}): void {
  Object.assign(standIn, { status, body, first })
}

afterAll(async () => {
  await new Promise<void>((resolve) => (standInServer === undefined ? resolve() : standInServer.close(() => resolve())))
  await app?.close()
  t?.close()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

describe('tools/register-a-started-agent.mjs and the started agent\'s key', () => {
  it('refuses before any request when no --key-file is given, and registers nothing', async () => {
    const ran = await run(common('key-none'))
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain('with --key-file')
    expect(ran.err).toContain('Nothing was registered.')
    expect(registered('key-none')).toBe(false)
  }, 90_000)

  it('refuses before any request when the key file already exists, and leaves the file as it was', async () => {
    const file = join(folder, 'already-there.key')
    writeFileSync(file, 'somebody else\n')
    const ran = await run([...common('key-existing'), '--key-file', file])
    expect(ran.code, ran.err).toBe(2)
    expect(ran.err).toContain('already exists')
    expect(readFileSync(file, 'utf8')).toBe('somebody else\n')
    expect(registered('key-existing')).toBe(false)
  }, 90_000)

  it('writes the key to the key file, readable only by its owner, and prints only the file\'s path', async () => {
    const file = join(folder, 'plain.key')
    const ran = await run([...common('key-plain'), '--key-file', file])
    expect(ran.code, ran.err).toBe(0)
    const key = readFileSync(file, 'utf8').trim()
    expect(key.length).toBeGreaterThanOrEqual(32)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(ran.out).toContain(file)
    expect(ran.out).not.toContain(key)
    expect(ran.err).not.toContain(key)
    // The office's sentence says the key is shown here; this tool never shows it, so it does not repeat that.
    expect(ran.out).not.toContain('This is the only time this key is shown')
  }, 90_000)

  it('tells the starter to give the started agent the key file\'s path, and that path is all the started agent needs', async () => {
    const file = join(folder, 'by-its-path.key')
    const ran = await run([...common('key-by-path'), '--key-file', file])
    expect(ran.code, ran.err).toBe(0)
    const key = readFileSync(file, 'utf8').trim()
    // THE PLAIN LINES NAME THE FILE VARIABLE, and never the variable that would hold the key itself.
    expect(ran.out).toContain('MOLE_AGENT_KEY_FILE')
    expect(ran.out.match(/MOLE_AGENT_KEY(?!_FILE)/g), 'a line tells the starter to put the key itself in an environment').toBeNull()
    // AND WHAT THE STARTED AGENT'S TOOLS READ, given only that path, is the key the office answered.
    const { theAgentKey } = await import('../for-agents/agent-key.mjs')
    expect(theAgentKey({ MOLE_AGENT_KEY_FILE: file }) === key, 'the key read from the file is not the key written to it').toBe(true)
    const help = await run(['--help'])
    expect(help.err).toContain('MOLE_AGENT_KEY_FILE')
  }, 90_000)

  it('sends the starter\'s own key read from MOLE_AGENT_KEY_FILE, and refuses a key given twice before any request', async () => {
    // A MADE-UP STARTER KEY, from random bytes, in a file of mode 0600. It is no agent's key.
    const starterKey = randomBytes(32).toString('hex')
    const keyFile = join(folder, 'the-starters-own.key')
    writeFileSync(keyFile, `${starterKey}\n`, { mode: 0o600 })
    standInAnswers(403, JSON.stringify({ error: 'Test: refused.' }))
    const sent = standIn.heard.length
    const ran = await run([...atTheStandIn('key-starter-file'), '--key-file', join(folder, 'starter-file.key')], { MOLE_AGENT_KEY_FILE: keyFile })
    expect(ran.code, ran.err).toBe(1)
    expect(standIn.heard.slice(sent).map((headers) => headers[KEY_HEADER] === starterKey), 'the starter\'s key from its file was not sent').toEqual([true])
    expect(ran.out + ran.err).not.toContain(starterKey)

    const before = standIn.requests
    const twice = await run([...atTheStandIn('key-starter-twice'), '--key-file', join(folder, 'starter-twice.key')], { MOLE_AGENT_KEY_FILE: keyFile, MOLE_AGENT_KEY: starterKey })
    expect(twice.code, twice.err).toBe(2)
    expect(twice.err).toContain('MOLE_AGENT_KEY_FILE')
    expect(twice.err).toContain('Nothing was registered.')
    expect(twice.out + twice.err).not.toContain(starterKey)
    expect(standIn.requests).toBe(before)
  }, 90_000)

  it('with --json, prints the reply with the key taken out and the key file\'s path in its place', async () => {
    const file = join(folder, 'json.key')
    const ran = await run([...common('key-json'), '--key-file', file, '--json'])
    expect(ran.code, ran.err).toBe(0)
    const key = readFileSync(file, 'utf8').trim()
    expect(key.length).toBeGreaterThanOrEqual(32)
    expect(ran.out).not.toContain(key)
    expect(ran.err).not.toContain(key)
    const said = JSON.parse(ran.out) as { whatToGiveIt: Record<string, unknown> }
    expect(Object.hasOwn(said.whatToGiveIt, 'key')).toBe(false)
    expect(said.whatToGiveIt['keyFile']).toBe(file)
    // The office's sentence says the key is shown here; --json agrees with the plain lines and leaves it out.
    expect(ran.out).not.toContain('This is the only time this key is shown')
  }, 90_000)

  it('refuses before any request when the key file\'s folder cannot be written to, and says why', async () => {
    const readOnly = join(folder, 'read-only')
    mkdirSync(readOnly)
    chmodSync(readOnly, 0o555)
    const before = standIn.requests
    try {
      const ran = await run([...atTheStandIn('key-read-only'), '--key-file', join(readOnly, 'agent.key')])
      expect(ran.code, ran.err).toBe(2)
      expect(ran.err).toContain('could not be made')
      expect(ran.err).toContain('Nothing was registered.')
      expect(standIn.requests).toBe(before)
      expect(existsSync(join(readOnly, 'agent.key'))).toBe(false)
    } finally {
      chmodSync(readOnly, 0o755)
    }
  }, 90_000)

  it('does not print the key when the office refuses the registration with a key in its answer', async () => {
    const file = join(folder, 'refused.key')
    standInAnswers(403, JSON.stringify({ error: 'Test: refused.', whatToGiveIt: { handle: 'key-refused', key: MADE_UP_KEY } }))
    const ran = await run([...atTheStandIn('key-refused'), '--key-file', file])
    expect(ran.code, ran.err).toBe(1)
    expect(ran.err).toContain('refused the registration (403)')
    expect(ran.out + ran.err).not.toContain(MADE_UP_KEY)
    expect(existsSync(file)).toBe(false)
  }, 90_000)

  it('does not print an answer that is not JSON, whether it came with success or with a refusal', async () => {
    for (const status of [201, 500]) {
      const file = join(folder, `not-json-${String(status)}.key`)
      standInAnswers(status, `Test: an answer that is not JSON, holding the key ${MADE_UP_KEY}`)
      const ran = await run([...atTheStandIn(`key-not-json-${String(status)}`), '--key-file', file])
      expect(ran.code, ran.err).toBe(1)
      expect(ran.err).toContain('not JSON')
      expect(ran.out + ran.err).not.toContain(MADE_UP_KEY)
    }
  }, 90_000)

  it('does not print the key when the key file cannot be written after the office answered it', async () => {
    const file = join(folder, 'taken-meanwhile.key')
    // SOMETHING TAKES THE FILE'S NAME WHILE THE REQUEST IS OUT, so the write after the reply fails.
    standInAnswers(
      201,
      JSON.stringify({ agent: { name: 'Agent key-taken' }, whatToGiveIt: { handle: 'key-taken', key: MADE_UP_KEY } }),
      () => writeFileSync(file, 'somebody else\n'),
    )
    const ran = await run([...atTheStandIn('key-taken'), '--key-file', file])
    expect(ran.code, ran.err).toBe(1)
    expect(ran.err).toContain('could not be written')
    expect(ran.out + ran.err).not.toContain(MADE_UP_KEY)
    expect(readFileSync(file, 'utf8')).toBe('somebody else\n')
  }, 90_000)
})
