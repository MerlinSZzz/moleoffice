// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY THE PERSON TYPES REACHES THE TOOL'S OWN LOGIN ON STANDARD INPUT, ONCE, AND IS KEPT NOWHERE. Wave 13u, round 242.
 *
 * POST /api/harnesses/:id/key (src/server/api/terminal-harnesses.ts) gives the key to the tool's own login
 * (`giveTheKeyToTheToolsOwnLogin`, src/server/lib/setting-up-an-agent-tool.ts): `codex login --with-api-key` with the
 * key and a newline on its standard input, and `opencode auth login -p <provider> -m "API key"` with the key and a
 * carriage return, which is what OpenCode 1.18.31 needs to submit it. Then it answers what the tool's own status says.
 *
 *   1. The made-up codex reads the key once on its standard input, ended with a newline, and the answer is its status.
 *   2. The made-up opencode reads the key once, ended with a carriage return, for the provider asked.
 *   3. A body the door cannot read is refused in the door's own words, which do not hold the key, and nothing is sent.
 *   4. Claude Code is refused: it signs in with an account. Nothing is sent.
 *   5. A secretary under the person's grant, and another agent, are refused, as at the provider key doors. Nothing is
 *      sent.
 *   6. Afterwards the key is in no request log line, change row, api_calls row, reply, file of the office's, environment
 *      or command line.
 *
 * WHAT IS MADE UP. The tools are scripts on a made-up PATH in this test's temp folder (tests/made-up-agent-tools.ts),
 * which write down what they read. The key is made up for this run, and no real key or account is used. The request log
 * is the office's own one-line-per-request log, written to this file's stream.
 */

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
const PERSON_KEY = randomBytes(32).toString('hex')
const keys = new Map<string, string>()
const SECRETARY = 'example-secretary-one'
const ANOTHER_AGENT = 'example-worker'

/** The key every case types. Made up for this run, and never a real key. */
const A_MADE_UP_KEY = `made-up-key-for-a-test-only-${randomBytes(6).toString('hex')}`

/** Every line the office's request log wrote, and every reply's body. */
const logLines: string[] = []
const replies: string[] = []

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object | string) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  replies.push(reply.body)
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

/** Give a key at a tool's key door, on the made-up PATH. */
function giveTheKey(tool: string, headers: Record<string, string>, payload: object | string) {
  return withThePath(tools.dir, () => call('POST', `/api/harnesses/${tool}/key`, headers, payload))
}

async function startAnAgent(handle: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { handle, name: handle, workArea: ['src'] })
  expect(made.status, made.raw).toBe(201)
  const key = (made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''
  expect(key, `no key was given to ${handle}`).not.toBe('')
  keys.set(handle, key)
}

/** Every file under `dir`, except those under `except`. */
function everyFileIn(dir: string, except: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (path === except) continue
    if (statSync(path).isDirectory()) found.push(...everyFileIn(path, except))
    else found.push(path)
  }
  return found
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'info', logStream: { write: (line) => logLines.push(line) } })).app
  await app.ready()
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  for (const handle of [SECRETARY, ANOTHER_AGENT]) await startAnAgent(handle)
  t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE handle = ?").run(SECRETARY)
  const raised = await call('POST', `/api/roles/elevation/${SECRETARY}`, { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.raw).toBe(201)
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['codex', 'opencode', 'claude'] })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the key goes to the tool's own login on standard input, once", () => {
  it('1. codex reads it once, ended with a newline, and the answer is what its own status says', async () => {
    const given = await giveTheKey('codex', PERSON, { key: A_MADE_UP_KEY })
    expect(given.status, given.raw).toBe(200)
    expect(given.body).toEqual({ harness: 'codex', provider: null, signedIn: { answer: 'yes', asked: 'codex login status' }, narrowedByPermission: null })
    expect(tools.logins()).toEqual([{ program: 'codex', args: ['login', '--with-api-key'], stdin: `${A_MADE_UP_KEY}\n` }])
  })

  it('2. opencode reads it once, ended with a carriage return, for the provider asked', async () => {
    const given = await giveTheKey('opencode', PERSON, { provider: 'opencode-go', key: A_MADE_UP_KEY })
    expect(given.status, given.raw).toBe(200)
    expect(given.body).toEqual({ harness: 'opencode', provider: 'opencode-go', signedIn: { answer: 'yes', asked: 'opencode auth list' }, narrowedByPermission: null })
    expect(tools.logins().slice(1)).toEqual([
      { program: 'opencode', args: ['auth', 'login', '-p', 'opencode-go', '-m', 'API key'], stdin: `${A_MADE_UP_KEY}\r` },
    ])
  })

  it('3. a body the door cannot read is refused in its own words, without the key, and nothing is sent', async () => {
    // THE KEY UNQUOTED, so JSON.parse's own words on Node 22 quote the start of it.
    const broken = await giveTheKey('codex', { ...PERSON, 'content-type': 'application/json' }, `{"key":${A_MADE_UP_KEY}}`)
    expect(broken.status, broken.raw).toBe(400)
    expect(broken.body['code'], broken.raw).toBe('harnessKeyShape')
    const another = await giveTheKey('codex', PERSON, { key: A_MADE_UP_KEY, also: A_MADE_UP_KEY })
    expect(another.status, another.raw).toBe(400)
    expect(another.body['code'], another.raw).toBe('harnessKeyShape')
    expect(tools.logins()).toHaveLength(2)
  })

  it('4. refuses Claude Code, which signs in with an account, and sends nothing', async () => {
    const claude = await giveTheKey('claude-code', PERSON, { key: A_MADE_UP_KEY })
    expect(claude.status, claude.raw).toBe(409)
    expect(claude.body['code'], claude.raw).toBe('harnessSignsInWithAnAccount')
    expect(tools.logins()).toHaveLength(2)
  })

  it('5. refuses a secretary under the grant and another agent, and sends nothing', async () => {
    for (const handle of [SECRETARY, ANOTHER_AGENT]) {
      const refused = await giveTheKey('codex', asAgent(handle), { key: A_MADE_UP_KEY })
      expect(refused.status, `${handle}: ${refused.raw}`).toBe(403)
    }
    expect(tools.logins()).toHaveLength(2)
  })

  it('6. afterwards the key is in no log line, change row, api_calls row, reply, office file, environment or command line', async () => {
    // THE ROWS AND LINES WERE WRITTEN: the doors were logged and counted, and none of it holds the key.
    await expect.poll(() => (t.client.sqlite.prepare("SELECT count(*) AS n FROM api_calls WHERE operation = 'harnesses.key'").get() as { n: number }).n).toBeGreaterThanOrEqual(2)
    expect(logLines.some((line) => line.includes('/api/harnesses/codex/key'))).toBe(true)
    for (const line of logLines) expect(line).not.toContain(A_MADE_UP_KEY)
    expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM changes').all())).not.toContain(A_MADE_UP_KEY)
    expect(JSON.stringify(t.client.sqlite.prepare('SELECT * FROM api_calls').all())).not.toContain(A_MADE_UP_KEY)
    for (const reply of replies) expect(reply).not.toContain(A_MADE_UP_KEY)
    // EVERY FILE OF THE OFFICE'S, the database and its journal among them. The made-up tools' own record is left out.
    for (const file of everyFileIn(dirname(t.file), tools.dir)) {
      expect(readFileSync(file).includes(A_MADE_UP_KEY), file).toBe(false)
    }
    for (const [name, value] of Object.entries(process.env)) expect(value ?? '', name).not.toContain(A_MADE_UP_KEY)
    // WHAT EACH TOOL WAS STARTED WITH: its words and its whole environment.
    expect(tools.runs().length).toBeGreaterThan(0)
    for (const run of tools.runs()) {
      expect(run.args.join(' ')).not.toContain(A_MADE_UP_KEY)
      expect(JSON.stringify(run.env)).not.toContain(A_MADE_UP_KEY)
    }
  })
})
