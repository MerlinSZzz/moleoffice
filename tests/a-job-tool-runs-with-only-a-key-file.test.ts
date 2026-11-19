// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A JOB TOOL RUNS WHEN ITS AGENT HOLDS ONLY A KEY FILE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Three tools a timer runs as an agent of their own ask the office through officeHeaders (tools/sandbox-common.mjs):
 * tools/run-the-login-reading.mjs, tools/run-the-timing-job.mjs and tools/run-the-test-catches-job.mjs. officeHeaders
 * sends the key theAgentKey reads (for-agents/agent-key.mjs), from the file MOLE_AGENT_KEY_FILE names or from
 * MOLE_AGENT_KEY. But each of the three built its doors only when MOLE_AGENT_KEY itself was set, so an agent given
 * its key as a file could run none of them. Now each asks theAgentKey whether it holds a key, and sends the key it
 * read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * Each tool's own productionDoors(), and one ask through the doors it builds, to a stand-in office of this file's own
 * that writes down what it was asked and answers with an empty counter list. No office is reached. The key is made up,
 * and it is in a file of this test's own folder. The timing tool makes its state folder under the sandboxes folder,
 * which in a test is under the test file's own home (tests/a-test-writes-into-no-home-but-its-own.ts).
 *
 *   1. With only a key file, each tool builds its doors, and its ask carries the file's key under the tool's agent.
 *   2. With a key file other users may read, each tool refuses in the reader's own words.
 *
 * Without any key each tool still refuses in its own sentence: the tool's own test file proves that, for each of the
 * five variables it needs.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. tools/run-the-login-reading.mjs asks for MOLE_AGENT_KEY again where it asked whether theAgentKey read a key: its
 *      case 1 goes red, on the tool's own refusal. Its case 2 stays green, because the reader is still asked first and
 *      refuses the file. Before the change all six cases were red.
 *   b. tools/run-the-timing-job.mjs does not hand on the key it read, so its headers go without one: its case 1 goes
 *      red on the key.
 *   c. tools/run-the-test-catches-job.mjs catches the reader's refusal and refuses in its own sentence: its case 2
 *      goes red on the words.
 *   d. tools/run-the-login-reading.mjs asks at another path: its case 1 goes red on the path asked.
 *   e. tools/run-the-test-catches-job.mjs names its session where its agent goes: its case 1 goes red on the agent.
 *   f. for-agents/agent-key.mjs takes a key file other users may read: every case 2 goes red on its first check.
 */
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { theAgentKey } from '../for-agents/agent-key.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { productionDoors as theLoginReadingsDoors } from '../tools/run-the-login-reading.mjs'
import { productionDoors as theTestCatchesDoors } from '../tools/run-the-test-catches-job.mjs'
import { productionDoors as theTimingJobsDoors } from '../tools/run-the-timing-job.mjs'

/** MADE UP. The key is no office's key, and the agent and session are no office's. */
const THE_KEY = 'e'.repeat(64)
const THE_AGENT = 'synthetic-job-runner'
const THE_SESSION = 'synthetic-session'
const SIX = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE'] as const

interface Doors {
  ask: (method: string, path: string, body?: unknown) => Promise<unknown>
}
const TOOLS: readonly { tool: string; doors: () => Doors }[] = [
  { tool: 'tools/run-the-login-reading.mjs', doors: theLoginReadingsDoors },
  { tool: 'tools/run-the-timing-job.mjs', doors: theTimingJobsDoors },
  { tool: 'tools/run-the-test-catches-job.mjs', doors: theTestCatchesDoors },
]

let dir = ''
let office: Server
let address = ''
let asked: { path: string; headers: IncomingHttpHeaders }[] = []
let saved: Record<string, string | undefined> = {}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'a-job-tools-key-file-'))
  office = createServer((request, response) => {
    asked.push({ path: request.url ?? '', headers: request.headers })
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ counters: [] }))
  })
  await new Promise<void>((listening) => office.listen(0, '127.0.0.1', listening))
  address = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})
afterAll(async () => {
  await new Promise<void>((closed) => office.close(() => closed()))
  if (dir !== '') rmSync(dir, { recursive: true, force: true })
})
beforeEach(() => {
  asked = []
  saved = Object.fromEntries(SIX.map((name) => [name, process.env[name]]))
})
afterEach(() => {
  for (const name of SIX) {
    if (saved[name] === undefined) delete process.env[name]
    else process.env[name] = saved[name]
  }
})

/** The agent's environment: an address, project, agent and session, and its key only as the file at `keyFile`. */
function onlyAKeyFile(keyFile: string): void {
  process.env['MOLE_OFFICE_API'] = address
  process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
  process.env['MOLE_OFFICE_AGENT'] = THE_AGENT
  process.env['MOLE_OFFICE_SESSION'] = THE_SESSION
  delete process.env['MOLE_AGENT_KEY']
  process.env['MOLE_AGENT_KEY_FILE'] = keyFile
}

/** A key file holding the made-up key and a line end, mode `mode`, as tools/register-a-run.mjs writes one. */
function aKeyFile(name: string, mode = 0o600): string {
  const path = join(dir, `${name}.key`)
  writeFileSync(path, `${THE_KEY}\n`, { mode })
  chmodSync(path, mode)
  return path
}

/** What a call threw, or a sentence saying it threw nothing. */
function theRefusal(call: () => unknown): string {
  try {
    call()
    return 'nothing was refused'
  } catch (why) {
    return why instanceof Error ? why.message : String(why)
  }
}

describe('a job tool runs when its agent holds only a key file', () => {
  it.each(TOOLS)('case 1: $tool builds its doors, and its ask carries the file’s key under its agent', async ({ tool, doors }) => {
    onlyAKeyFile(aKeyFile(`only-a-file-${tool.replace(/\W+/g, '-')}`))

    const built = doors()
    await built.ask('GET', '/api/counters')

    expect(asked.map((one) => one.path)).toEqual(['/api/counters'])
    expect(asked[0]!.headers[KEY_HEADER], 'the key the file holds was not sent').toBe(THE_KEY)
    expect(asked[0]!.headers['x-mole-office-actor-id']).toBe(THE_AGENT)
  })

  it.each(TOOLS)('case 2: $tool refuses a key file other users may read, in the reader’s own words', ({ tool, doors }) => {
    onlyAKeyFile(aKeyFile(`readable-${tool.replace(/\W+/g, '-')}`, 0o644))
    const theReaders = theRefusal(() => theAgentKey(process.env))
    expect(theReaders, 'the reader took a file other users may read').not.toBe('nothing was refused')

    expect(theRefusal(doors)).toBe(theReaders)
  })
})
