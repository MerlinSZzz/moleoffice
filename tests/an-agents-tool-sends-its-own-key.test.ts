// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S TOOL SENDS THE AGENT'S OWN KEY, UNDER THE AGENT'S OWN NAME. Finding 79 of report
 * 7eQG4ZyWuWCv, piece 3, and a decision of the owner's: only the office's own processes send the
 * office's key, and every agent's tool sends the agent's own key.
 *
 * Each tool below is run for real against a small office stand-in on a free port this test opens.
 * The stand-in writes down the headers of every request and answers with little, so each tool stops
 * soon after its first request. Nothing here talks to a real office.
 *
 *   - With MOLE_AGENT_KEY and MOLE_OFFICE_AGENT set, every request that names an actor carries the
 *     key, and the actor it names is MOLE_OFFICE_AGENT (or the tool's --actor flag, when given). The
 *     office refuses a key sent under another agent's name, so a made-up tool name would be refused.
 *   - With no MOLE_AGENT_KEY, every request names the actor the tool named before keys, and carries
 *     no key. The session hook sends the agent's own key or the run's key whenever it holds one. A
 *     session that names an agent and holds neither sends the name alone and says so once. The office's
 *     key is the hook's last resort only for a session that names no agent and holds no key, on a
 *     computer with no entry key file (none is in this test's folder), and it says so once in its start lines.
 *
 * The key is built in one place, anAgentsToolHeaders in tools/sandbox-common.mjs. Taking the key out
 * of that function turns the "with a key" cases red.
 */
import { spawn } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_SESSION_HOOK_ID } from '../src/shared/participants.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const tool = (name: string) => join(REPO, 'tools', name)

const AGENT = 'made-up-agent-for-a-key-test'
const AGENT_KEY = 'made-up-agent-key-not-a-real-one'
const OFFICE_KEY = 'made-up-office-key-not-a-real-one'
const KEY = 'x-mole-office-key'
const ACTOR = 'x-mole-office-actor-id'

let scratch: string
let home: string
let checkout: string
let office: Server
let officeAt: string
let nobodyAt: string
let asked: IncomingHttpHeaders[] = []

async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  scratch = aTestDatabaseFolder('an-agents-tool-sends-its-key')
  home = join(scratch, 'home')
  mkdirSync(home, { recursive: true })
  // THE OFFICE'S KEY FILE, made up, beside a made-up database path, so a hook that sent the office's
  // key would be seen sending it. keysPathFrom in src/config/settings.mjs puts it beside the database.
  mkdirSync(join(scratch, 'db'), { recursive: true })
  writeFileSync(join(scratch, 'db', 'keys.json'), JSON.stringify({ office: OFFICE_KEY }))
  // A CHECKOUT OUTSIDE THE TEMPORARY DIRECTORY, because the guard asks the office about a delete only
  // there. tests/the-main-world-guard-hook.test.ts makes its own the same way.
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  checkout = aTestDatabaseFolder('tool-key-guard', join(REPO, '.cache'))
  for (const dir of ['.git', 'src/server', 'dist']) mkdirSync(join(checkout, dir), { recursive: true })
  // A PORT NOTHING LISTENS ON, for the world sweep to find a world nobody serves.
  const closed = createServer()
  nobodyAt = await listen(closed)
  await new Promise<void>((done) => closed.close(() => done()))
  office = createServer((req, res) => {
    asked.push(req.headers)
    req.resume()
    const send = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    const path = (req.url ?? '').split('?')[0]
    if (path === '/api/runtime/freshness') return send({ freshness: { verdict: 'as new as the checkout' } })
    if (path === '/api/office/worlds') {
      return send({
        from: 'a stand-in office',
        worlds: [{ id: 'made-up-world', name: 'a made-up world', kind: 'scratch', standing: 'scratch', databaseIdentity: 'x', bornAt: 'then', diedAt: null, address: nobodyAt }],
      })
    }
    return send({})
  })
  officeAt = await listen(office)
  // THE DOCUMENT tools/cluster-register.mjs is handed. The stand-in answers its first request with
  // nothing, so the tool refuses before it reads the document. The document still holds the two
  // regions the tool writes, so it is a document the tool accepts. It is invented and lives in
  // tests/fixtures, because the public copy is to carry no design/ folder.
  copyFileSync(join(REPO, 'tests', 'fixtures', 'an-invented-plan-with-the-register-regions.md'), join(scratch, 'plan.md'))
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(scratch, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
})

interface Run {
  readonly command: string
  readonly args: readonly string[]
  readonly stdin?: string
  readonly cwd?: string
}

/** Run one tool to its end, asynchronously, because the stand-in answers from this same process. */
async function run(what: Run, env: Record<string, string>): Promise<{ status: number | null; output: string; asked: IncomingHttpHeaders[] }> {
  asked = []
  const child = spawn(what.command, [...what.args], { cwd: what.cwd ?? scratch, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d: Buffer) => { output += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => { output += d.toString('utf8') })
  child.stdin.end(what.stdin ?? '')
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, output, asked }
}

/** The environment of every run: no office of the launcher's, this test's own HOME and stand-in. */
function theEnvironment(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY', 'SANDBOX_DIR', 'MOLE_OFFICE_URL']) {
    delete env[name]
  }
  return {
    ...env,
    HOME: home,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_API: officeAt,
    MOLE_OFFICE_DB: join(scratch, 'db', 'panelx.db'),
    ...extra,
  }
}

const node = (file: string, ...args: string[]): Run => ({ command: process.execPath, args: [file, ...args] })

interface Case {
  readonly name: string
  readonly run: Run
  /** The actor the tool named before keys, which it still names when it holds no key. */
  readonly withoutAKey: string
  /** The actor it names with a key: MOLE_OFFICE_AGENT unless the case gives a flag. */
  readonly withAKey?: string
}

const CASES: readonly Case[] = [
  { name: 'tools/brief.mjs', run: node(tool('brief.mjs'), '--json'), withoutAKey: 'mole-office/brief.mjs' },
  {
    name: 'tools/cluster-register.mjs',
    run: node(tool('cluster-register.mjs'), '--check', '--document', 'plan.md'),
    withoutAKey: 'tools/cluster-register.mjs',
  },
  { name: 'tools/dup-keys.mjs', run: node(tool('dup-keys.mjs'), 'full', 'dup-keys-out.json'), withoutAKey: 'claude-code/dup-keys-census' },
  {
    name: 'tools/file-the-work-each-decision-created.mjs',
    run: node(tool('file-the-work-each-decision-created.mjs')),
    withoutAKey: 'claude-code/builder-ce',
  },
  {
    name: 'tools/file-the-work-each-decision-created.mjs with --actor',
    run: node(tool('file-the-work-each-decision-created.mjs'), '--actor', 'made-up-caller-by-flag'),
    withoutAKey: 'made-up-caller-by-flag',
    withAKey: 'made-up-caller-by-flag',
  },
  { name: 'tools/give-every-citizen-a-card.mjs', run: node(tool('give-every-citizen-a-card.mjs')), withoutAKey: AGENT },
  {
    name: 'tools/how-long-to-the-first-write.mjs',
    // The stand-in is at MOLE_OFFICE_API, so the tool takes it for the live office and needs its flag
    // to go on. The live office is never reached from here.
    run: node(tool('how-long-to-the-first-write.mjs'), '--api', '<office>', '--route', 'brief', '--i-know-this-is-the-live-server'),
    withoutAKey: 'mole-office/how-long-to-the-first-write',
  },
  { name: 'tools/pick-pages.mjs', run: node(tool('pick-pages.mjs')), withoutAKey: 'claude-code/builder-a-pointing-box' },
  { name: 'tools/repair-promoted-decisions.mjs', run: node(tool('repair-promoted-decisions.mjs')), withoutAKey: 'claude-code/builder-bx' },
  { name: 'tools/rules-chapters.mjs', run: node(tool('rules-chapters.mjs'), '--check'), withoutAKey: 'tools/rules-chapters.mjs' },
  {
    name: 'tools/close-worlds-nobody-serves.mjs',
    run: node(tool('close-worlds-nobody-serves.mjs'), '--close'),
    withoutAKey: 'mole-office/the-world-sweep',
  },
  {
    name: 'for-agents/main-world-guard.mjs',
    run: {
      ...node(join(REPO, 'for-agents', 'main-world-guard.mjs'), '--agent', 'made-up-guarded-agent'),
      stdin: '<guard payload>',
    },
    withoutAKey: 'made-up-guarded-agent',
    withAKey: 'made-up-guarded-agent',
  },
]

/** The case's command with the stand-in's address and the guard's payload put in. */
function filledIn(what: Run): Run {
  const payload = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf dist' }, cwd: checkout })
  return {
    ...what,
    args: what.args.map((one) => (one === '<office>' ? officeAt : one)),
    ...(what.stdin === '<guard payload>' ? { stdin: payload } : {}),
  }
}

/** The requests that name an actor. A tool must have made at least one, or the case proved nothing. */
function namingAnActor(got: { output: string; asked: IncomingHttpHeaders[] }, name: string): IncomingHttpHeaders[] {
  const naming = got.asked.filter((one) => one[ACTOR] !== undefined)
  expect(naming.length, `${name} made no request that names an actor. What it printed:\n${got.output}`).toBeGreaterThan(0)
  return naming
}

describe('an agent’s tool sends the agent’s own key, under the agent’s own name', () => {
  for (const one of CASES) {
    it(`${one.name}: with MOLE_AGENT_KEY, the key goes under the caller's own name`, async () => {
      const got = await run(filledIn(one.run), theEnvironment({ MOLE_AGENT_KEY: AGENT_KEY, MOLE_OFFICE_AGENT: AGENT }))
      for (const headers of namingAnActor(got, one.name)) {
        expect(headers[ACTOR], got.output).toBe(one.withAKey ?? AGENT)
        expect(headers[KEY] === AGENT_KEY, `${one.name} did not send the agent's key`).toBe(true)
      }
    }, 60_000)

    it(`${one.name}: with no MOLE_AGENT_KEY, the headers are as they were before keys`, async () => {
      const got = await run(filledIn(one.run), theEnvironment({ MOLE_OFFICE_AGENT: AGENT }))
      for (const headers of namingAnActor(got, one.name)) {
        expect(headers[ACTOR], got.output).toBe(one.withoutAKey)
        expect(headers[KEY] === undefined, `${one.name} sent a key it does not hold`).toBe(true)
      }
    }, 60_000)
  }
})

describe("the session hook sends the agent's own key or the run's key, and the office's only when it holds neither", () => {
  const hook: Run = {
    ...node(tool('session-hook.mjs'), 'start'),
    stdin: JSON.stringify({ session_id: 'made-up-conversation', hook_event_name: 'SessionStart' }),
  }
  const hookIn = (): Run => ({ ...hook, cwd: home })
  // A KEY FILE AND A RUN'S OFFICE TOOL CONFIGURATION, both made up here and kept from other users, as
  // register-myself.mjs --key-file and the launcher write them. A key file holds 64 hexadecimal characters.
  const AGENT_FILE_KEY = 'f00d'.repeat(16)
  const RUN = 'made-up-run-for-a-key-test'
  const RUN_KEY = 'made-up-run-key-not-a-real-one'
  let keyFile: string
  let toolConfiguration: string

  beforeAll(() => {
    // IN EVERY CASE THE OFFICE'S KEY FILE IS IN PLACE AND READABLE, so a case that sees no office key is not
    // one where the hook found none to send.
    const officeKeys = JSON.parse(readFileSync(join(scratch, 'db', 'keys.json'), 'utf8')) as { office?: unknown }
    expect(officeKeys.office, 'the office key file is not in place').toBe(OFFICE_KEY)
    keyFile = join(scratch, 'agent-key')
    writeFileSync(keyFile, `${AGENT_FILE_KEY}\n`, { mode: 0o600 })
    chmodSync(keyFile, 0o600)
    toolConfiguration = join(scratch, 'office-tool.json')
    writeFileSync(
      toolConfiguration,
      JSON.stringify({ mcpServers: { mole_office: { env: { MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: RUN_KEY } } } }),
      { mode: 0o600 },
    )
    chmodSync(toolConfiguration, 0o600)
  })

  /** The environment of a hook case: as every run's, and with no key of the shell that runs this test. */
  function theHooksEnvironment(extra: Record<string, string>): Record<string, string> {
    const env = theEnvironment({})
    for (const name of ['MOLE_AGENT_KEY_FILE', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
    return { ...env, ...extra }
  }

  /** How many times the output names the variable the hook's last-resort line tells the person to set. */
  const timesTheKeyFileIsNamed = (output: string): number => output.split('MOLE_AGENT_KEY_FILE').length - 1
  /** Whether the output shows the office's key or the path of its key file. */
  const showsTheOfficesKey = (output: string): boolean => output.includes(OFFICE_KEY) || output.includes(join(scratch, 'db', 'keys.json'))

  it("with MOLE_AGENT_KEY and a named agent, the agent's key goes under that agent", async () => {
    const got = await run(hookIn(), theHooksEnvironment({ MOLE_AGENT_KEY: AGENT_KEY, MOLE_OFFICE_AGENT: AGENT }))
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY] === AGENT_KEY, 'the hook did not send the agent key').toBe(true)
    }
  }, 60_000)

  it("with MOLE_AGENT_KEY_FILE and a named agent, the key in that file goes under the agent", async () => {
    const got = await run(hookIn(), theHooksEnvironment({ MOLE_AGENT_KEY_FILE: keyFile, MOLE_OFFICE_AGENT: AGENT }))
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY] === AGENT_FILE_KEY, 'the hook did not send the key in the key file').toBe(true)
    }
    expect(got.output.includes(AGENT_FILE_KEY), 'the hook printed the key').toBe(false)
  }, 60_000)

  it("with the run's key in the office tool configuration for this agent and run, that key goes under the agent", async () => {
    const got = await run(
      hookIn(),
      theHooksEnvironment({ MOLE_OFFICE_TOOL_CONFIGURATION: toolConfiguration, MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN }),
    )
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY] === RUN_KEY, "the hook did not send the run's key").toBe(true)
    }
    expect(got.output.includes(RUN_KEY), 'the hook printed the key').toBe(false)
  }, 60_000)

  it('with neither key and an agent named, the name goes alone, with no key and never the office’s, and the hook says so once', async () => {
    const { aNamedAgentWithoutAKeyLine } = await import('../src/config/the-entrys-agent.mjs')
    const got = await run(hookIn(), theHooksEnvironment({ MOLE_OFFICE_AGENT: AGENT }))
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY] === undefined, 'the hook sent a key under a name that holds none').toBe(true)
    }
    expect(got.output.split(aNamedAgentWithoutAKeyLine(AGENT)).length - 1, `the hook did not say once that it sent the name alone:\n${got.output}`).toBe(1)
    expect(timesTheKeyFileIsNamed(got.output), `the hook took its last resort though it names an agent:\n${got.output}`).toBe(0)
    expect(showsTheOfficesKey(got.output), "the hook printed the office's key or its file's path").toBe(false)
  }, 60_000)

  it('with MOLE_AGENT_KEY and no agent named, no request carries a key, under the hook’s own name', async () => {
    const got = await run(hookIn(), theHooksEnvironment({ MOLE_AGENT_KEY: AGENT_KEY }))
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(THE_SESSION_HOOK_ID)
      expect(headers[KEY] === undefined, 'the hook sent a key under a name that is not its holder’s').toBe(true)
    }
    expect(timesTheKeyFileIsNamed(got.output), `the hook took its last resort though it holds a key:\n${got.output}`).toBe(0)
  }, 60_000)

  // THE HOOK'S OWN NAME, which no agent can register. MUTATION: put 'claude-code' back as the name the hook falls back
  // to in for-agents/session-hook.mjs, and this case goes red.
  it("with neither key and no agent named, as in the person's own session, the office's key goes under the hook’s own name, and the hook says so once", async () => {
    const got = await run(hookIn(), theHooksEnvironment({}))
    for (const headers of namingAnActor(got, 'the session hook')) {
      expect(headers[ACTOR], got.output).toBe(THE_SESSION_HOOK_ID)
      expect(headers[KEY] === OFFICE_KEY, "the hook did not send the office's key").toBe(true)
    }
    expect(got.output, "the hook did not say that it used the office's key").toContain("with the office's key, as its last resort")
    expect(timesTheKeyFileIsNamed(got.output), `the hook did not say once how to get a key:\n${got.output}`).toBe(1)
    expect(showsTheOfficesKey(got.output), "the hook printed the office's key or its file's path").toBe(false)
  }, 60_000)
})
