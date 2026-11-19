// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RULES EXPORT SENDS THE RUN'S OWN KEY FROM ITS OFFICE TOOL FILE WHEN ITS ENVIRONMENT HOLDS NONE.
 *
 * The launcher takes the key out of a Claude Code run's shell. That shell holds only MOLE_OFFICE_TOOL_CONFIGURATION, the
 * path of the run's office tool file, and the file holds the run's key. tools/rules-chapters.mjs took its key from the
 * environment alone, so from a run's shell it sent no key and the office answered 403. It now looks for a key in the
 * order officeHeaders in tools/sandbox-common.mjs uses: the environment's key first (theAgentKey), then the run's own key
 * from that file, read by theRunsKeyFromItsOfficeToolFile (src/config/run-permissions.mjs) for MOLE_OFFICE_AGENT and
 * MOLE_OFFICE_SESSION only, and otherwise no key.
 *
 * WHAT IS PROVED
 *   1. A file that names this agent and this run, kept from everyone else, gives its key. Every request names the agent
 *      as its actor, carries the key, and names the run as its session. The output never holds the key.
 *   2. A file that names another run, one that names another agent, and one that others may read each give no key. The
 *      headers are then those from before keys: the tool's own name as the actor, no key and no session.
 *   3. The environment's key comes first, and its headers are as before: no session header.
 *   4. A refusal of a request that carried no key says why no key was sent. It names the file and what the file names,
 *      and never the key. When the file was not read because MOLE_OFFICE_AGENT or MOLE_OFFICE_SESSION is not set, it
 *      names the one that is not set.
 *   5. With the file's key, every other header is the one the tool sends with no key.
 *
 * HOW. A server this file starts on 127.0.0.1 stands in for the office. It keeps the headers of each request and answers
 * {}, or 403 where a case says so, so the tool stops after its first request. The tool runs with --check and writes
 * nothing in the checkout. Every agent, run, key and file here is made up, in a scratch folder of this file's own under
 * the system's temporary folder. The office tool file is written in the shape the launcher writes, by
 * aClaudeCommandsOfficeTool in src/config/run-permissions.mjs, which needs no database. The environment of every run
 * holds none of the office variables of the process that runs this test, so no real office tool file is read. Nothing
 * here reaches an office.
 *
 * MUTATIONS, each proved red in the round that adds this file, in tools/rules-chapters.mjs: the key comes from the
 * environment only (1, 5); the file is read before the environment (3); the session header is left out (1); the file is
 * read by a reader of the tool's own with no check of its mode (2); the file is read for the run it names itself, or
 * for the agent it names itself (2); the refusal says nothing about the key (4); the file is read even when a variable
 * is not set (4); the file's key goes with officeHeaders' headers (5).
 */
import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { THE_AGENT_KEY } from '../for-agents/agent-key.mjs'
import { aClaudeCommandsOfficeTool, IN_A_SANDBOX, OFFICE_TOOL_CONFIGURATION } from '../src/config/run-permissions.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { ACTOR_HEADERS } from '../src/shared/request-headers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
/** The tool, by its path in the checkout. With no key it names itself by that path. */
const THE_TOOL = 'tools/rules-chapters.mjs'

// MADE-UP VALUES. No office issued any of these keys, and no agent or run of an office has these names.
const AGENT = 'made-up-agent-of-a-rules-export'
const OTHER_AGENT = 'another-made-up-agent'
const RUN = 'aMadeUpRun01'
const OTHER_RUN = 'anotherMadeUpRun02'
const FILE_KEY = 'made-up-key-in-the-runs-office-tool-file'
const ENVIRONMENT_KEY = 'made-up-key-in-the-environment'
const ACTOR = ACTOR_HEADERS.id
const SESSION = ACTOR_HEADERS.session

/**
 * The names no run of the tool inherits from the process that runs this test. The names of the key's two variables,
 * the office tool file's and the sandbox's are read from their exports. MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION,
 * MOLE_OFFICE_WORKSPACE, MOLE_OFFICE_API, MOLE_OFFICE_URL and MOLE_OFFICE_DB are written out, here and below, as
 * tests/an-agents-tool-sends-its-own-key.test.ts writes them: no export holds one of them by its own name.
 */
const NOT_INHERITED = [
  'MOLE_OFFICE_API',
  'MOLE_OFFICE_WORKSPACE',
  'MOLE_OFFICE_SESSION',
  'MOLE_OFFICE_AGENT',
  THE_AGENT_KEY.value,
  THE_AGENT_KEY.file,
  OFFICE_TOOL_CONFIGURATION,
  IN_A_SANDBOX,
  'MOLE_OFFICE_URL',
]

let scratch = ''
let office: Server
let officeAt = ''
let refusing = false
let asked: IncomingHttpHeaders[] = []

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-rules-export-key-'))
  mkdirSync(join(scratch, 'home'), { recursive: true })
  mkdirSync(join(scratch, 'db'), { recursive: true })
  office = createServer((req, res) => {
    asked.push(req.headers)
    req.resume()
    res.writeHead(refusing ? 403 : 200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(refusing ? { error: 'a made-up refusal from the stand-in office' } : {}))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', () => done()))
  officeAt = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await new Promise<void>((done) => office.close(() => done()))
  rmSync(scratch, { recursive: true, force: true })
})

beforeEach(() => {
  refusing = false
})

/** A run's office tool file, as the launcher writes it, naming `agent`'s run `session` and holding `key`, with `mode`. */
function anOfficeToolFile(name: string, { agent = AGENT, session = RUN, key = FILE_KEY, mode = 0o600 } = {}): string {
  const path = join(scratch, name)
  const made = aClaudeCommandsOfficeTool(
    ['claude'],
    { MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: session, [THE_AGENT_KEY.value]: key, MOLE_OFFICE_API: officeAt, MOLE_OFFICE_WORKSPACE: 'a-made-up-project' },
    path,
  )
  expect(made.configuration, 'the launcher gives a Claude Code command an office tool configuration').not.toBeNull()
  writeFileSync(path, `${JSON.stringify(made.configuration)}\n`, { mode: 0o600 })
  chmodSync(path, mode)
  expect(statSync(path).mode & 0o777, `${path} has the mode this case asks for`).toBe(mode)
  return path
}

/** The environment of every run: none of the office variables above, this test's stand-in and scratch, and `extra`. */
function theEnvironment(extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(process.env)) if (value !== undefined) env[name] = value
  for (const name of NOT_INHERITED) delete env[name]
  return { ...env, HOME: join(scratch, 'home'), MOLE_OFFICE_API: officeAt, MOLE_OFFICE_DB: join(scratch, 'db', 'panelx.db'), ...extra }
}

/** Run the tool with --check to its end, asynchronously, because the stand-in answers from this same process. */
async function run(env: Record<string, string>): Promise<{ status: number | null; output: string; asked: IncomingHttpHeaders[] }> {
  asked = []
  const child = spawn(process.execPath, [join(REPO, THE_TOOL), '--check'], { cwd: scratch, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (d: Buffer) => { output += d.toString('utf8') })
  child.stderr.on('data', (d: Buffer) => { output += d.toString('utf8') })
  const status = await new Promise<number | null>((done) => child.on('close', (code) => done(code)))
  return { status, output, asked }
}

/** The requests the tool made. It must have made at least one, or the case proved nothing. */
function requestsOf(got: { output: string; asked: IncomingHttpHeaders[] }): IncomingHttpHeaders[] {
  expect(got.asked.length, `the tool made no request. What it printed:\n${got.output}`).toBeGreaterThan(0)
  return got.asked
}

/** Each request carries the headers from before keys: the tool's own name as the actor, no key and no session. */
function asBeforeKeys(got: { output: string; asked: IncomingHttpHeaders[] }): void {
  for (const headers of requestsOf(got)) {
    expect(headers[ACTOR], got.output).toBe(THE_TOOL)
    expect(headers[KEY_HEADER], got.output).toBeUndefined()
    expect(headers[SESSION], got.output).toBeUndefined()
  }
}

describe("the rules export sends the run's own key from its office tool file", () => {
  it("the file's key goes under the run's agent, with its run", async () => {
    const got = await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: anOfficeToolFile('the-runs-own.json') }))
    for (const headers of requestsOf(got)) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY_HEADER], got.output).toBe(FILE_KEY)
      expect(headers[SESSION], got.output).toBe(RUN)
    }
    expect(got.output).not.toContain(FILE_KEY)
  }, 60_000)

  it('a file that names another run gives no key', async () => {
    const file = anOfficeToolFile('another-run.json', { session: OTHER_RUN })
    asBeforeKeys(await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file })))
  }, 60_000)

  it('a file that names another agent gives no key', async () => {
    const file = anOfficeToolFile('another-agent.json', { agent: OTHER_AGENT })
    asBeforeKeys(await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file })))
  }, 60_000)

  it('a file that others may read gives no key', async () => {
    const file = anOfficeToolFile('others-may-read.json', { mode: 0o644 })
    asBeforeKeys(await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file })))
  }, 60_000)

  it("the environment's key comes first, with the headers it had before", async () => {
    const file = anOfficeToolFile('beside-the-environments-key.json')
    const got = await run(theEnvironment({ [THE_AGENT_KEY.value]: ENVIRONMENT_KEY, MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file }))
    for (const headers of requestsOf(got)) {
      expect(headers[ACTOR], got.output).toBe(AGENT)
      expect(headers[KEY_HEADER], got.output).toBe(ENVIRONMENT_KEY)
      expect(headers[SESSION], got.output).toBeUndefined()
    }
  }, 60_000)

  it('a refusal says why no key was sent', async () => {
    const file = anOfficeToolFile('refused-for-another-run.json', { session: OTHER_RUN })
    refusing = true
    const got = await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file }))
    asBeforeKeys(got)
    expect(got.status, got.output).not.toBe(0)
    expect(got.output).toContain(file)
    expect(got.output).toContain(OTHER_RUN)
    expect(got.output).not.toContain(FILE_KEY)
  }, 60_000)

  it('a refusal names the variable that is not set, when the file was not read', async () => {
    const file = anOfficeToolFile('not-read.json')
    refusing = true
    const noRun = await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, [OFFICE_TOOL_CONFIGURATION]: file }))
    asBeforeKeys(noRun)
    expect(noRun.status, noRun.output).not.toBe(0)
    expect(noRun.output).toContain('MOLE_OFFICE_SESSION')
    expect(noRun.output).not.toContain('MOLE_OFFICE_AGENT')
    const noAgent = await run(theEnvironment({ MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: file }))
    asBeforeKeys(noAgent)
    expect(noAgent.status, noAgent.output).not.toBe(0)
    expect(noAgent.output).toContain('MOLE_OFFICE_AGENT')
    expect(noAgent.output).not.toContain('MOLE_OFFICE_SESSION')
    for (const got of [noRun, noAgent]) expect(got.output).not.toContain(FILE_KEY)
  }, 60_000)

  it("with the file's key, every other header is the one the tool sends with no key", async () => {
    const withTheKey = await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: anOfficeToolFile('compared.json') }))
    const withNone = await run(theEnvironment({ MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, [OFFICE_TOOL_CONFIGURATION]: anOfficeToolFile('compared-another-run.json', { session: OTHER_RUN }) }))
    const [keyed] = requestsOf(withTheKey)
    const [keyless] = requestsOf(withNone)
    expect(keyed?.[KEY_HEADER], withTheKey.output).toBe(FILE_KEY)
    expect(keyless?.[KEY_HEADER], withNone.output).toBeUndefined()
    const theRest = (headers: IncomingHttpHeaders | undefined): IncomingHttpHeaders => {
      const rest = { ...headers }
      for (const name of [ACTOR, KEY_HEADER, SESSION]) delete rest[name]
      return rest
    }
    expect(theRest(keyed)).toEqual(theRest(keyless))
  }, 60_000)
})
