// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ACCOUNT SIGN-IN ANSWERS ONLY THE ADDRESS ITS TOOL DECLARES, AND NOTHING IT STARTS IS TOLD TO OPEN A BROWSER. Wave
 * 13u, round 242.
 *
 * POST /api/harnesses/:id/sign-in starts the tool's own sign-in (`startTheToolsOwnSignIn`,
 * src/server/lib/setting-up-an-agent-tool.ts), and its answer carries the one address a page may open
 * (`theAddressThePageMayOpen`), read against the tool's declaration in src/server/lib/harnesses.ts.
 *
 *   1. Codex's sign-in starts as `codex login --device-auth`. The answer is the declared device page and the code the
 *      tool printed, and never the address the tool printed.
 *   2. Claude Code's printed address is answered only when it is https, its host is the declared host exactly, and it
 *      has no user part and no port. http, another host, a host that only ends with the declared one, a user part
 *      before the declared host, a port, and no address at all are each refused with their code, and the refused
 *      address is not answered.
 *   3. Nothing the server starts for a sign-in is told to open a browser: each starts with only its declared words, and
 *      no browser program on the PATH is run.
 *   4. Claude Code's sign-in, and every other, starts with BROWSER set to the program that opens nothing, on Linux and
 *      the Mac. Its answer says no second tab may open only on Linux, where Claude Code is known to read BROWSER.
 *
 * WHAT IS MADE UP. The tools are scripts on a made-up PATH in this test's temp folder (tests/made-up-agent-tools.ts),
 * and the browser programs beside them only write down that they ran. The refused addresses are on example.invalid
 * names or made-up hosts, and no address is opened. No account and no key is used.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_DEVICE_CODE, A_SIGN_IN_ADDRESS, withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
let stopTheSignIns: () => void = () => undefined
type TheCheck = (typeof import('../src/server/lib/setting-up-an-agent-tool.ts'))['theAddressThePageMayOpen']
let theAddressThePageMayOpen: TheCheck
let claudeCode: Parameters<TheCheck>[0]
let codex: Parameters<TheCheck>[0]

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The programs a sign-in could open a browser with, by their names on Linux and the Mac. Each only writes down that it ran. */
const BROWSER_PROGRAMS = ['xdg-open', 'open', 'sensible-browser', 'x-www-browser', 'www-browser', 'gio', 'firefox', 'google-chrome', 'chromium']

/** The program a sign-in is given as its browser on Linux and the Mac, which opens nothing (setting-up-an-agent-tool.ts). */
const A_BROWSER_THAT_OPENS_NOTHING = 'true'

async function startTheSignIn(tool: string) {
  const reply = await withThePath(tools.dir, () => app.inject({ method: 'POST', url: `/api/harnesses/${tool}/sign-in`, headers: PERSON }))
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const setting = await import('../src/server/lib/setting-up-an-agent-tool.ts')
  stopTheSignIns = setting.stopTheSignIns
  theAddressThePageMayOpen = setting.theAddressThePageMayOpen
  const { theHarness } = await import('../src/server/lib/harnesses.ts')
  const found = { claude: theHarness('claude-code'), codex: theHarness('codex') }
  if (found.claude === undefined || found.codex === undefined) throw new Error('Claude Code or Codex is not declared in src/server/lib/harnesses.ts.')
  claudeCode = found.claude
  codex = found.codex
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['codex', 'claude'] })
  for (const program of BROWSER_PROGRAMS) {
    const file = join(tools.dir, program)
    writeFileSync(file, `#!/bin/sh\necho '${program}' >> '${join(tools.dir, 'browsers-run.txt')}'\n`)
    chmodSync(file, 0o755)
  }
}, 60_000)

// EACH CASE STARTS ITS OWN SIGN-IN, so the one a case started is stopped before the next.
afterEach(() => stopTheSignIns())

afterAll(async () => {
  stopTheSignIns()
  await app?.close()
  t?.close()
})

/** The declared sign-in of a tool, as src/server/lib/harnesses.ts gives it. */
function theDeclared(one: typeof codex): { devicePage?: string; host?: string } {
  if (one.signIn === null) throw new Error(`${one.name} declares no sign-in.`)
  return one.signIn
}

describe("1. Codex's sign-in", () => {
  it('starts with --device-auth, and answers the declared device page and the code, never what the tool printed', async () => {
    const devicePage = theDeclared(codex).devicePage
    expect(devicePage).toBe('https://auth.openai.com/codex/device')
    tools.printsTheAddress(A_SIGN_IN_ADDRESS)
    const started = await startTheSignIn('codex')
    expect(started.status, started.raw).toBe(200)
    expect(started.body).toMatchObject({ harness: 'codex', address: devicePage, noAddress: null, code: A_DEVICE_CODE, takesACode: false })
    expect(started.raw).not.toContain(A_SIGN_IN_ADDRESS)
    expect(tools.runs().filter((run) => run.program === 'codex' && run.args[0] === 'login').map((run) => run.args)).toEqual([['login', '--device-auth']])
  })
})

describe("2. Claude Code's printed address", () => {
  it('is answered when it is https, on the declared host exactly, with no user part and no port', () => {
    expect(theDeclared(claudeCode).host).toBe('claude.com')
    expect(theAddressThePageMayOpen(claudeCode, 'https://claude.com/made-up-sign-in?code=true')).toEqual({ address: 'https://claude.com/made-up-sign-in?code=true', noAddress: null })
  })

  const REFUSED: [string, string | null, string][] = [
    ['http', 'http://claude.com/made-up-sign-in', 'notHttps'],
    ['another host', 'https://sign-in.example.invalid/made-up-sign-in', 'anotherHost'],
    ['a host that only ends with the declared one', 'https://notclaude.com/made-up-sign-in', 'anotherHost'],
    ['a name under the declared host', 'https://login.claude.com/made-up-sign-in', 'anotherHost'],
    ['the declared host before another', 'https://claude.com.example.invalid/made-up-sign-in', 'anotherHost'],
    ['the declared host as a user part', 'https://claude.com@elsewhere.example.invalid/made-up-sign-in', 'hasAUser'],
    ['a port', 'https://claude.com:8443/made-up-sign-in', 'hasAPort'],
    ['words that are no address', 'https://[claude.com/made-up-sign-in', 'notAnAddress'],
    ['no address at all', null, 'printedNone'],
  ]
  for (const [what, printed, code] of REFUSED) {
    it(`is refused with ${code}: ${what}`, () => {
      const answered = theAddressThePageMayOpen(claudeCode, printed)
      expect(answered.address).toBeNull()
      expect(answered.noAddress?.code).toBe(code)
      if (printed !== null) expect(answered.noAddress?.says).not.toContain(printed)
    })
  }

  it('is refused at the door, and the address the tool printed is not answered', async () => {
    const printed = 'https://claude.com@elsewhere.example.invalid/made-up-sign-in'
    tools.printsTheAddress(printed)
    const started = await startTheSignIn('claude-code')
    expect(started.status, started.raw).toBe(200)
    expect(started.body).toMatchObject({ harness: 'claude-code', address: null, noAddress: { code: 'hasAUser' }, code: A_DEVICE_CODE })
    expect(started.raw).not.toContain('elsewhere.example.invalid')
  })

  it('is refused at the door when the tool printed none', async () => {
    tools.printsTheAddress(null)
    const started = await startTheSignIn('claude-code')
    expect(started.status, started.raw).toBe(200)
    expect(started.body).toMatchObject({ harness: 'claude-code', address: null, noAddress: { code: 'printedNone' } })
  }, 20_000)
})

describe('3. nothing the server starts for a sign-in is told to open a browser', () => {
  it('starts each sign-in with its declared words only, and runs no browser program', async () => {
    tools.printsTheAddress('https://claude.com/made-up-sign-in')
    for (const tool of ['codex', 'claude-code']) expect((await startTheSignIn(tool)).status).toBe(200)
    const signIns = tools.runs().filter((run) => run.args.join(' ') !== '--version' && !run.args.join(' ').includes('status'))
    expect(signIns.length).toBeGreaterThan(0)
    for (const run of signIns) {
      expect(['login --device-auth', 'auth login --claudeai'], run.program).toContain(run.args.join(' '))
    }
    expect(existsSync(join(tools.dir, 'browsers-run.txt')) ? readFileSync(join(tools.dir, 'browsers-run.txt'), 'utf8') : '').toBe('')
  })
})

describe.skipIf(process.platform === 'win32')('4. on Linux and the Mac, a sign-in is given a browser that opens nothing', () => {
  it("starts Claude Code's sign-in, and Codex's, with BROWSER set to the program that opens nothing", async () => {
    tools.printsTheAddress('https://claude.com/made-up-sign-in')
    const before = tools.runs().length
    for (const tool of ['claude-code', 'codex']) {
      const started = await startTheSignIn(tool)
      expect(started.status, started.raw).toBe(200)
      expect(started.body['aSecondTabMayOpen'], tool).toBe(tool === 'claude-code' && process.platform !== 'linux')
    }
    const signIns = tools.runs().slice(before).filter((run) => ['login --device-auth', 'auth login --claudeai'].includes(run.args.join(' ')))
    expect(signIns.map((run) => run.program).sort()).toEqual(['claude', 'codex'])
    for (const run of signIns) expect(run.env['BROWSER'], run.program).toBe(A_BROWSER_THAT_OPENS_NOTHING)
  })
})
