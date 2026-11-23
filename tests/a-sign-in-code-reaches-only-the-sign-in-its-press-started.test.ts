// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CODE A SIGN-IN PAGE SHOWS REACHES ONLY THE SIGN-IN ITS PRESS STARTED, ONCE, AND IS KEPT NOWHERE. Wave 13u,
 * round 242.
 *
 * POST /api/harnesses/:id/sign-in/code (src/server/api/terminal-harnesses.ts) takes the id the sign-in's start answered
 * and the code Claude Code's sign-in page showed the person. `giveTheCodeToTheSignIn`
 * (src/server/lib/setting-up-an-agent-tool.ts) writes the code and a newline once to that sign-in's standard input and
 * closes it.
 *
 *   1. The code reaches the sign-in that press started, once, ended with a newline, and its input is closed. The answer
 *      names the sign-in and does not hold the code.
 *   2. A second code to the same sign-in is refused, and nothing more is written.
 *   3. An id that names no sign-in started here for this tool is refused: a made-up id, and another tool's sign-in.
 *   4. A sign-in that takes no code (Codex's) is refused.
 *   5. A sign-in that ended, and one past its ten minutes, are refused.
 *   6. A body of another shape is refused in the door's own words, without the code.
 *   7. Only the person: a secretary under the person's grant and another agent are refused, and nothing is written.
 *   8. Afterwards the code is in no request log line, no row of any table (changes and api_calls among them), no
 *      reply, no file of the office's, no environment and no command line.
 *
 * WHAT IS MADE UP. The tools are scripts on a made-up PATH in this test's temp folder (tests/made-up-agent-tools.ts),
 * which write down what their sign-in read on its standard input. The code is made up for this run. No account is used
 * and no browser is opened. The request log is the office's own one-line-per-request log, written to this file's stream.
 */

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
let stopTheSignIns: () => void = () => undefined
const PERSON_KEY = randomBytes(32).toString('hex')
const keys = new Map<string, string>()
const SECRETARY = 'example-secretary-one'
const ANOTHER_AGENT = 'example-worker'

/** The code every case types. Made up for this run, in the shape of a login code, and never a real one. */
const A_MADE_UP_CODE = `madeUpCode${randomBytes(9).toString('base64url')}#made-up-state`

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

/** Ask a door of an agent tool, on the made-up PATH. */
function onThePath(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object | string) {
  return withThePath(tools.dir, () => call(method, url, headers, payload))
}

/** Start a tool's sign-in as the person, and answer the id its start answered. */
async function startTheSignIn(tool: string): Promise<string> {
  const started = await onThePath('POST', `/api/harnesses/${tool}/sign-in`, PERSON)
  expect(started.status, started.raw).toBe(200)
  const id = started.body['id']
  if (typeof id !== 'string' || id === '') throw new Error(`The sign-in of ${tool} answered no id: ${started.raw}`)
  return id
}

function giveTheCode(tool: string, headers: Record<string, string>, payload: object | string) {
  return onThePath('POST', `/api/harnesses/${tool}/sign-in/code`, headers, payload)
}

/** What the made-up claude's sign-ins read on their standard input, each written down when the input was closed. */
const whatTheSignInsRead = () => tools.logins().filter((one) => one.program === 'claude')

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
  stopTheSignIns = (await import('../src/server/lib/setting-up-an-agent-tool.ts')).stopTheSignIns
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['codex', 'claude'] })
  tools.printsTheAddress('https://claude.com/made-up-sign-in?code=true')
  for (const handle of [SECRETARY, ANOTHER_AGENT]) await startAnAgent(handle)
  t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE handle = ?").run(SECRETARY)
  const raised = await call('POST', `/api/roles/elevation/${SECRETARY}`, { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.raw).toBe(201)
}, 60_000)

afterAll(async () => {
  stopTheSignIns()
  await app?.close()
  t?.close()
})

describe('the code a sign-in page shows goes to the sign-in its press started, once', () => {
  let first = ''

  it('7. refuses a secretary under the grant and another agent, and writes nothing', async () => {
    first = await startTheSignIn('claude-code')
    for (const handle of [SECRETARY, ANOTHER_AGENT]) {
      const refused = await giveTheCode('claude-code', asAgent(handle), { signIn: first, code: A_MADE_UP_CODE })
      expect(refused.status, `${handle}: ${refused.raw}`).toBe(403)
    }
    expect(whatTheSignInsRead()).toEqual([])
  })

  it('6. refuses a body of another shape in its own words, without the code, and writes nothing', async () => {
    // THE CODE UNQUOTED, so JSON.parse's own words on Node 22 quote the start of it.
    const broken = await giveTheCode('claude-code', { ...PERSON, 'content-type': 'application/json' }, `{"signIn":"${first}","code":${A_MADE_UP_CODE}}`)
    expect(broken.status, broken.raw).toBe(400)
    expect(broken.body['code'], broken.raw).toBe('harnessSignInCodeShape')
    for (const payload of [
      { signIn: first, code: A_MADE_UP_CODE, also: A_MADE_UP_CODE },
      { signIn: first, code: `${A_MADE_UP_CODE}\nmore` },
      { signIn: first, code: '' },
      { code: A_MADE_UP_CODE },
    ]) {
      const refused = await giveTheCode('claude-code', PERSON, payload)
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.body['code'], refused.raw).toBe('harnessSignInCodeShape')
    }
    expect(whatTheSignInsRead()).toEqual([])
  })

  it('3. refuses an id that names no sign-in started here for this tool, and writes nothing', async () => {
    const unknown = await giveTheCode('claude-code', PERSON, { signIn: 'made-up-sign-in-id', code: A_MADE_UP_CODE })
    expect(unknown.status, unknown.raw).toBe(404)
    expect(unknown.body['code'], unknown.raw).toBe('harnessNoSuchSignIn')
    const codexs = await startTheSignIn('codex')
    const anotherTools = await giveTheCode('claude-code', PERSON, { signIn: codexs, code: A_MADE_UP_CODE })
    expect(anotherTools.status, anotherTools.raw).toBe(404)
    expect(anotherTools.body['code'], anotherTools.raw).toBe('harnessNoSuchSignIn')
    expect(whatTheSignInsRead()).toEqual([])
  })

  it('4. refuses a sign-in that takes no code, and writes nothing', async () => {
    const codexs = await startTheSignIn('codex')
    const refused = await giveTheCode('codex', PERSON, { signIn: codexs, code: A_MADE_UP_CODE })
    expect(refused.status, refused.raw).toBe(409)
    expect(refused.body['code'], refused.raw).toBe('harnessSignInTakesNoCode')
    expect(tools.logins().filter((one) => one.program === 'codex')).toEqual([])
  })

  it('5a. refuses a sign-in past its ten minutes, and writes nothing', async () => {
    const realNow = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(realNow + 10 * 60 * 1000 + 1)
    try {
      const refused = await giveTheCode('claude-code', PERSON, { signIn: first, code: A_MADE_UP_CODE })
      expect(refused.status, refused.raw).toBe(409)
      expect(refused.body['code'], refused.raw).toBe('harnessSignInEnded')
    } finally {
      clock.mockRestore()
    }
    expect(whatTheSignInsRead()).toEqual([])
  })

  it('1. reaches the sign-in once, ended with a newline, and closes its input; the answer does not hold the code', async () => {
    const given = await giveTheCode('claude-code', PERSON, { signIn: first, code: ` ${A_MADE_UP_CODE} ` })
    expect(given.status, given.raw).toBe(200)
    expect(given.body).toEqual({ harness: 'claude-code', signIn: first, codeGiven: true, narrowedByPermission: null })
    // THE MADE-UP SIGN-IN WRITES DOWN WHAT IT READ ONLY WHEN ITS INPUT IS CLOSED, so one line here is the input closed.
    await expect.poll(() => whatTheSignInsRead(), { timeout: 10_000, interval: 50 }).toEqual([
      { program: 'claude', args: ['auth', 'login', '--claudeai'], stdin: `${A_MADE_UP_CODE}\n` },
    ])
  })

  it('2. refuses a second code to the same sign-in, and writes nothing more', async () => {
    const again = await giveTheCode('claude-code', PERSON, { signIn: first, code: A_MADE_UP_CODE })
    expect(again.status, again.raw).toBe(409)
    expect(again.body['code'], again.raw).toBe('harnessSignInCodeGiven')
    expect(whatTheSignInsRead()).toHaveLength(1)
  })

  it('5b. refuses a sign-in that ended, and writes nothing', async () => {
    tools.finishTheSignIn('claude')
    await expect
      .poll(async () => (await onThePath('GET', '/api/harnesses/claude-code/signed-in', PERSON)).body['signingIn'], { timeout: 10_000, interval: 100 })
      .toBe(false)
    const ended = await giveTheCode('claude-code', PERSON, { signIn: first, code: A_MADE_UP_CODE })
    expect(ended.status, ended.raw).toBe(409)
    expect(ended.body['code'], ended.raw).toBe('harnessSignInEnded')
    expect(whatTheSignInsRead()).toHaveLength(1)
  })

  it('8. afterwards the code is in no log line, table row, reply, office file, environment or command line', async () => {
    // THE ROWS AND LINES WERE WRITTEN: the door was logged and counted, and none of it holds the code.
    await expect.poll(() => (t.client.sqlite.prepare("SELECT count(*) AS n FROM api_calls WHERE operation = 'harnesses.sign-in-code'").get() as { n: number }).n).toBeGreaterThanOrEqual(2)
    expect(logLines.some((line) => line.includes('/api/harnesses/claude-code/sign-in/code'))).toBe(true)
    for (const line of logLines) expect(line).not.toContain(A_MADE_UP_CODE)
    // EVERY TABLE, the changes, the api_calls and the usage rows among them.
    const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    expect(tables.map((one) => one.name)).toEqual(expect.arrayContaining(['changes', 'api_calls']))
    for (const { name } of tables) {
      expect(JSON.stringify(t.client.sqlite.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()), name).not.toContain(A_MADE_UP_CODE)
    }
    for (const reply of replies) expect(reply).not.toContain(A_MADE_UP_CODE)
    // EVERY FILE OF THE OFFICE'S, the database and its journal among them. The made-up tools' own record is left out.
    for (const file of everyFileIn(dirname(t.file), tools.dir)) {
      expect(readFileSync(file).includes(A_MADE_UP_CODE), file).toBe(false)
    }
    for (const [name, value] of Object.entries(process.env)) expect(value ?? '', name).not.toContain(A_MADE_UP_CODE)
    // WHAT EACH TOOL WAS STARTED WITH: its words and its whole environment.
    expect(tools.runs().length).toBeGreaterThan(0)
    for (const run of tools.runs()) {
      expect(run.args.join(' ')).not.toContain(A_MADE_UP_CODE)
      expect(JSON.stringify(run.env)).not.toContain(A_MADE_UP_CODE)
    }
  })
})
