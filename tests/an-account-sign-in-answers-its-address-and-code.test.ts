// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ACCOUNT SIGN-IN ANSWERS THE ADDRESS AND DEVICE CODE THE TOOL PRINTED, AND THE SIGNED-IN READING TURNS TO YES WHEN
 * THE TOOL SAYS SO. Wave 13u, round 242.
 *
 * POST /api/harnesses/:id/sign-in (src/server/api/terminal-harnesses.ts) starts the tool's own account sign-in
 * (`startTheToolsOwnSignIn`, src/server/lib/setting-up-an-agent-tool.ts): `codex login --device-auth` for Codex with
 * ChatGPT, and `claude auth login --claudeai` for Claude Code with a Claude account. The answer carries the address a
 * page may open, which is Codex's declared device page and the address Claude Code printed on its declared host, and
 * the device code the tool printed. GET /api/harnesses/:id/signed-in reads the tool's own
 * status, and says whether the sign-in is still running. The sign-in is the person's alone. The reading is the person's,
 * or a secretary's under the person's grant where this office's list of what the grant carries allows it.
 *
 *   1. For Codex and for Claude Code: the answer carries the address and the code; the reading says not signed in,
 *      with the sign-in running; a second press answers the first; and when the made-up tool says it is signed in, the
 *      reading says yes and the sign-in is no longer running.
 *   2. OpenCode has no account sign-in here, and is refused in words. Nothing is started.
 *   3. An agent is refused at both doors, as at the provider key doors. Nothing is started.
 *   4. A secretary holding the person's grant reads whether a tool is signed in, once this office's list says the grant
 *      carries that door, and is still refused at the sign-in. Nothing is started.
 *   5. Another agent is still refused at the reading, with the list as case 4 left it.
 *
 * WHAT IS MADE UP. The tools are scripts on a made-up PATH in this test's temp folder (tests/made-up-agent-tools.ts).
 * A made-up sign-in prints an address and a made-up code, and waits until this file writes the file that stands for
 * the person finishing in the browser. No account and no key is used, and no browser is opened. The secretary and its grant
 * are made up, and the person gives the grant and the list's answer through the real doors.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_DEVICE_CODE, A_SIGN_IN_ADDRESS, withThePath, writeTheMadeUpTools, type AMadeUpProgram, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
let stopTheSignIns: () => void = () => undefined
const PERSON_KEY = randomBytes(32).toString('hex')
let anAgentsKey = ''
const AN_AGENT = 'example-worker'
const A_SECRETARY = 'example-secretary'
let aSecretarysKey = ''
let forgetTheWorldsOwnAuthority: () => void = () => undefined
const world = new Map<string, string | undefined>()

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
/** The person proved by the person's key, as the doors that start an agent, raise one and change the list ask. */
const THE_PERSON_PROVED = { ...PERSON, 'x-mole-office-key': PERSON_KEY }
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string> = PERSON, payload?: object) {
  const reply = await withThePath(tools.dir, () => app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) }))
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

beforeAll(async () => {
  // NO SECRETARY OF THE WORLD THIS TEST RUNS IN, so the registry's own card is the one the grant check reads.
  for (const name of ['MOLE_OFFICE_WORLD_STARTED_BY', 'MOLE_OFFICE_WORLD_SECRETARIES']) {
    world.set(name, process.env[name])
    delete process.env[name]
  }
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  stopTheSignIns = (await import('../src/server/lib/setting-up-an-agent-tool.ts')).stopTheSignIns
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['codex', 'claude', 'opencode'] })
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { ...PERSON, 'x-mole-office-key': PERSON_KEY }, payload: { handle: AN_AGENT, name: AN_AGENT, workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  anAgentsKey = ((made.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: THE_PERSON_PROVED, payload: { handle: A_SECRETARY, name: A_SECRETARY, role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)
  aSecretarysKey = ((secretary.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  const raised = await app.inject({ method: 'POST', url: `/api/roles/elevation/${A_SECRETARY}`, headers: THE_PERSON_PROVED, payload: { reason: 'A made-up grant for the sign-in test.' } })
  expect(raised.statusCode, raised.body).toBe(201)
}, 60_000)

afterAll(async () => {
  stopTheSignIns()
  await app?.close()
  t?.close()
  for (const [name, value] of world) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
  forgetTheWorldsOwnAuthority()
})

/**
 * Each sign-in, what its made-up tool prints, and the address the answer carries: Codex's declared device page whatever
 * it printed, and for Claude Code the address it printed, which is on its declared host. Both addresses are read from
 * the declarations in src/server/lib/harnesses.ts.
 */
const SIGN_INS: { tool: string; program: AMadeUpProgram; asked: string; started: string; prints: string; address: string }[] = [
  { tool: 'codex', program: 'codex', asked: 'codex login status', started: 'login --device-auth', prints: A_SIGN_IN_ADDRESS, address: 'https://auth.openai.com/codex/device' },
  {
    tool: 'claude-code',
    program: 'claude',
    asked: 'claude auth status --json',
    started: 'auth login --claudeai',
    prints: 'https://claude.com/made-up-sign-in?code=true',
    address: 'https://claude.com/made-up-sign-in?code=true',
  },
]

describe("an agent tool's own account sign-in", () => {
  for (const { tool, program, asked, started, prints, address } of SIGN_INS) {
    it(`1. ${tool}: answers the address and code, and the reading turns to signed in when the tool says so`, async () => {
      tools.printsTheAddress(prints)
      const first = await call('POST', `/api/harnesses/${tool}/sign-in`)
      expect(first.status, first.raw).toBe(200)
      expect(first.body).toMatchObject({ harness: tool, address, code: A_DEVICE_CODE, already: false })
      expect(tools.runs().filter((one) => one.program === program && one.args.join(' ') === started)).toHaveLength(1)

      const waiting = await call('GET', `/api/harnesses/${tool}/signed-in`)
      expect(waiting.status, waiting.raw).toBe(200)
      expect(waiting.body).toEqual({ harness: tool, signedIn: { answer: 'no', asked }, signingIn: true, narrowedByPermission: null })

      // A SECOND PRESS WHILE IT RUNS answers the first, and starts nothing.
      const again = await call('POST', `/api/harnesses/${tool}/sign-in`)
      expect(again.status, again.raw).toBe(200)
      expect(again.body).toEqual({ ...first.body, already: true })
      expect(tools.runs().filter((one) => one.program === program && one.args.join(' ') === started)).toHaveLength(1)

      // THE PERSON FINISHES IN THE BROWSER, which the made-up tool stands in for.
      tools.finishTheSignIn(program)
      await expect
        .poll(async () => (await call('GET', `/api/harnesses/${tool}/signed-in`)).body, { timeout: 10_000, interval: 100 })
        .toEqual({ harness: tool, signedIn: { answer: 'yes', asked }, signingIn: false, narrowedByPermission: null })
    }, 30_000)
  }

  it('2. refuses OpenCode, which has no account sign-in here, and starts nothing', async () => {
    const refused = await call('POST', '/api/harnesses/opencode/sign-in')
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.body['code'], refused.raw).toBe('harnessNoSignIn')
    expect(tools.runs().filter((one) => one.program === 'opencode')).toEqual([])
  })

  it('3. refuses an agent at the sign-in and at the signed-in reading, and starts nothing', async () => {
    const asTheAgent = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AN_AGENT, 'x-mole-office-key': anAgentsKey }
    const before = tools.runs().length
    for (const [method, url] of [['POST', '/api/harnesses/codex/sign-in'], ['GET', '/api/harnesses/codex/signed-in']] as const) {
      const refused = await call(method, url, asTheAgent)
      expect(refused.status, `${method} ${url}: ${refused.raw}`).toBe(403)
    }
    expect(tools.runs()).toHaveLength(before)
  })

  it("4. a secretary holding the person's grant reads whether a tool is signed in where the list allows it, and still not the sign-in", async () => {
    const answered = await call('POST', '/api/office/what-the-grant-carries', THE_PERSON_PROVED, { changes: [{ door: 'harnesses.signed-in', answer: 'may-press' }] })
    expect(answered.status, answered.raw).toBe(200)
    const read = await call('GET', '/api/harnesses/codex/signed-in', asAgent(A_SECRETARY, aSecretarysKey))
    expect(read.status, read.raw).toBe(200)
    expect(read.body, read.raw).toMatchObject({ harness: 'codex', signedIn: { asked: 'codex login status' }, signingIn: false })

    const before = tools.runs().length
    const refused = await call('POST', '/api/harnesses/codex/sign-in', asAgent(A_SECRETARY, aSecretarysKey))
    expect(refused.status, refused.raw).toBe(403)
    expect(tools.runs()).toHaveLength(before)
  })

  it('5. refuses another agent at the signed-in reading, with the list as case 4 left it', async () => {
    const refused = await call('GET', '/api/harnesses/codex/signed-in', asAgent(AN_AGENT, anAgentsKey))
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.body['code'], refused.raw).toBe('harnessesOnlyThePerson')
  })
})
