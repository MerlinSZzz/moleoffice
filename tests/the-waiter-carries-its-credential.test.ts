// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER A REMOTE AGENT RUNS CAN CARRY ITS OWN CREDENTIAL.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * The visitor flow plan J_RIKvfdVUMn, piece 3, on decision O8xBFKNKXAYGq's credential flow:
 * `tools/hold-the-handle.mjs` used to send only the office's own key, which is a file beside the
 * database and does not exist on another machine, so a confirmed visiting agent's waiter could only
 * call as nobody. Now the waiter sends the credential token on `x-mole-office-credential` and the
 * agent key on `x-mole-office-key` when the environment holds them, keeps sending the office's key
 * only as the fallback that answers on the machine the office runs on, and refuses with one
 * sentence when it holds none of the three and the office named by `--api` is not on this machine.
 *
 * Both secrets are read from the files MOLE_OFFICE_CREDENTIAL_FILE and MOLE_AGENT_KEY_FILE name, or
 * from MOLE_OFFICE_CREDENTIAL and MOLE_AGENT_KEY themselves, and never from a command-line flag, for
 * the reason written at `tools/register-a-started-agent.mjs`: a key on a command line lands in the
 * shell's history and in the process list. A file is what the skill tells an agent to give, so
 * neither secret is in any environment either. A file that is not safe stops the waiter before it
 * asks anything.
 *
 * ---------------------------------------------------------------------------------------
 * NO SECRET REACHES ANY OUTPUT
 * ---------------------------------------------------------------------------------------
 *
 * The token is taken out of the ask door's 201 reply into a local variable, held in a child's
 * environment, and replayed as a header — never printed, never named in a description or an
 * assertion, never written into a file. What these cases assert on the refusal's stderr are the
 * ENVIRONMENT VARIABLE NAMES, which are not secrets.
 *
 * ---------------------------------------------------------------------------------------
 * HOW THE WAITER IS DRIVEN AS A REAL PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The credential and the agent key are built inside the waiter per request, so the proofs here
 * start `tools/hold-the-handle.mjs` as a child of the test, pointing it at a listener that stamps
 * its arrival as another machine — the way tests/waking-a-session-in-each-runtime.test.ts and
 * tests/a-visiting-agent-holds-its-own-credential.test.ts drive their real doors, and for the same
 * reason a test that set a header by hand would be proving its own assignment. The office's
 * recorded rows, not the waiter's stdout, say whether the credential really travelled.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { settingNamed } from '../src/config/settings.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

/** Set in beforeAll, by a dynamic import, so nothing here reaches the database module at runtime. */
let stampArrival: (
  raw: import('node:http').IncomingMessage,
  arrival: import('../src/server/lib/http.ts').Arrival,
  socketCarries: import('../src/server/lib/http.ts').WhoTheSocketIs,
) => void

let t: TestDb
let app: FastifyInstance
/** The two doors, as base URLs, as the credential test files name them. */
let thisMachine: string
let loquat: string
const extraDoors: Server[] = []
/** The children this file started, each killed by the pid recorded at start. */
const started: ChildProcess[] = []

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
/** An office on another machine that is not there, on the product's default port as src/config/settings.mjs declares it. */
const AN_OFFICE_ON_ANOTHER_MACHINE = `http://example.invalid:${String(settingNamed('MOLE_OFFICE_PORT').fallback)}`

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ;({ stampArrival } = await import('../src/server/lib/http.ts'))

  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
}, 60_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is where a waiter the test finished with ends up anyway.
    }
  }
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** Ask loquat's door for one credential, and confirm it here, taking the token out of the 201 once. */
async function aTrustedOne(handle: string): Promise<{ token: string; id: string }> {
  const asked = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `The visitor behind ${handle}`,
    role: 'worker',
    conversationPath: `/transcripts/${handle}`,
    startDirectory: `/work/${handle}`,
    runtime: 'claude-code',
    sessionRecord: `session-of-${handle}`,
  })
  expect(asked.status, JSON.stringify(asked.body)).toBe(201)
  const token = asked.body.token as string
  const credential = asked.body.credential as { id: string }
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${credential.id}/confirm`, undefined, PERSON)
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
  return { token, id: credential.id }
}

/** Every request the office wrote down under one credential, read from the database. */
function requestRowsFor(credentialId: string): { route: string; refused_because: string | null; mismatch: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT route, refused_because, mismatch FROM visitor_requests WHERE credential_id = ? ORDER BY at')
    .all(credentialId) as { route: string; refused_because: string | null; mismatch: string | null }[]
}

/** Start a waiter child the way a session on another machine would: in a folder holding nothing. */
function startTheWaiter(args: string[], secrets: Record<string, string> = {}): {
  child: ChildProcess
  said: () => string
  ended: Promise<number>
  /** The empty folder the child runs in; remove it once the child is gone. */
  where: string
} {
  // A FOLDER WITH NOTHING IN IT, so the checkout's key file and its .env are what the child cannot
  // reach, exactly as on another machine. The database setting is an empty folder for the same
  // reason: keysPathFrom would otherwise follow this test database.
  const alone = mkdtempSync(join(tmpdir(), 'mole-office-waiter-machine-'))
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)), ...args],
    {
      cwd: alone,
      env: {
        PATH: process.env.PATH ?? '',
        MOLE_OFFICE_DB: `${alone}${'/missing-office.db'}`,
        MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1',
        ...secrets,
      },
    },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { child, said: () => printed, ended, where: alone }
}

describe('the waiter a remote agent runs carries its credential', () => {
  it('sends the credential and the agent key the environment holds, and asks for its own handle', async () => {
    const handle = 'waiter-away'
    const { token, id } = await aTrustedOne(handle)
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The session behind the waiter',
      data: { state: 'running', runtime: 'claude-code', doing: 'answering as waiter-away' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id

    const waiter = startTheWaiter(
      ['--api', loquat, '--agent', handle, '--session', session, '--workspace', 'default'],
      // THE TOKEN IS THE AGENT KEY TOO, as tests/a-confirm-binds-a-visiting-agents-key.test.ts
      // proves: the confirm binds an agent-kind key whose hash is the token's own digest. Both
      // environment names hold it and neither value crosses into a reply of this test.
      { MOLE_OFFICE_CREDENTIAL: token, MOLE_AGENT_KEY: token },
    )
    const said = await untilIncludes(waiter, 'Holding the handle')

    // THE HOLD WAS ANSWERED THROUGH THE GATE, so the credential the waiter carries was accepted,
    // and it asked for its own handle and no other.
    expect(said).toContain(`Holding the handle "${handle}"`)
    const rows = requestRowsFor(id)
    expect(rows.length, 'the office recorded no request under this credential').toBeGreaterThan(0)
    const holds = rows.filter((row) => row.route.includes('/hold'))
    expect(holds.length, 'the hold itself was not written under the credential').toBeGreaterThan(0)
    for (const row of holds) {
      expect(row.refused_because, 'the hold under this credential was refused').toBeNull()
    }

    // THE TIDY END: this waiter still holds, so the pid is killed, the
    // folder it ran in is removed by its own path, and nothing else is.
    waiter.child.kill('SIGKILL')
    await waiter.ended
    rmSync(waiter.where, { recursive: true, force: true })
  }, 60_000)

  it('refuses with one sentence when it holds neither secret and --api names another machine', async () => {
    // NOT A REAL OFFICE. The refusal happens before any request is made, which is what makes
    // "stops, rather than quietly calling as nobody" provable by nothing arriving anywhere.
    const waiter = startTheWaiter(['--api', AN_OFFICE_ON_ANOTHER_MACHINE, '--agent', 'waiter-away', '--session', 'session-of-waiter-away', '--workspace', 'default'])
    const code = await waiter.ended
    // The child has ended, so the folder it ran in goes now, before anything below can fail. Until
    // 29 September 2026 this case never removed it (problem ToxCUBqVhdPI).
    rmSync(waiter.where, { recursive: true, force: true })
    expect(code).toBe(2)

    // THE NAMES OF THE TWO FILE VARIABLES, which are what an agent must set, and not one
    // character of any secret: nothing here ever held one to write about.
    expect(waiter.said()).toContain('MOLE_OFFICE_CREDENTIAL_FILE')
    expect(waiter.said()).toContain('MOLE_AGENT_KEY_FILE')
  }, 30_000)

  it('reads both secrets from the token file the two file variables name, and is answered under the credential', async () => {
    const handle = 'waiter-from-a-file'
    const { token, id } = await aTrustedOne(handle)
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The session behind the waiter that reads a file',
      data: { state: 'running', runtime: 'claude-code', doing: 'answering as waiter-from-a-file' },
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
    }).id
    // ONE FILE HOLDS THE TOKEN, which is the agent key too, and both variables name it: what the
    // skill's command says. The environment holds the file's path and never the token.
    const file = aTokenFile(token)
    const waiter = startTheWaiter(
      ['--api', loquat, '--agent', handle, '--session', session, '--workspace', 'default'],
      { MOLE_OFFICE_CREDENTIAL_FILE: file, MOLE_AGENT_KEY_FILE: file },
    )
    const said = await untilIncludes(waiter, 'Holding the handle')
    waiter.child.kill('SIGKILL')
    await waiter.ended
    rmSync(waiter.where, { recursive: true, force: true })

    expect(said).toContain(`Holding the handle "${handle}"`)
    expect(said).not.toContain(token)
    const holds = requestRowsFor(id).filter((row) => row.route.includes('/hold'))
    expect(holds.length, 'the hold was not written under the credential read from the file').toBeGreaterThan(0)
    for (const row of holds) expect(row.refused_because, 'the hold under this credential was refused').toBeNull()
  }, 60_000)

  it('stops before asking anything when a token file others may read is named, or when a token is given twice', async () => {
    // A MADE-UP TOKEN, of a token's shape, which no office ever made.
    const token = randomBytes(32).toString('base64url')
    const open = aTokenFile(token, 0o644)
    const safe = aTokenFile(token)
    for (const [secrets, names] of [
      [{ MOLE_OFFICE_CREDENTIAL_FILE: open }, open],
      [{ MOLE_OFFICE_CREDENTIAL_FILE: safe, MOLE_OFFICE_CREDENTIAL: token }, 'MOLE_OFFICE_CREDENTIAL_FILE'],
    ] as const) {
      const waiter = startTheWaiter(['--api', AN_OFFICE_ON_ANOTHER_MACHINE, '--agent', 'waiter-away', '--session', 'session-of-waiter-away', '--workspace', 'default'], secrets)
      // A WAITER THAT TOOK THE FILE WOULD GO ON TRYING TO REACH THE OFFICE, so it is given a while and then stopped.
      const code = await Promise.race([waiter.ended, new Promise<number>((go) => setTimeout(() => go(-1), 15_000))])
      waiter.child.kill('SIGKILL')
      await waiter.ended
      rmSync(waiter.where, { recursive: true, force: true })
      expect(code, waiter.said()).toBe(2)
      expect(waiter.said()).toContain(names)
      expect(waiter.said()).not.toContain('Holding the handle')
      expect(waiter.said()).not.toContain(token)
    }
  }, 60_000)

  it('takes neither secret from a command-line flag, however real the flags look', async () => {
    // THE SAME SHAPES THE FLAG-READING TOLERATES, CARRIED AS FLAGS AND NOWHERE ELSE. A run that
    // disobeys the "environment only" rule would go on instead of refusing here, so this is the
    // mutation-sensitive half of `none from a flag`.
    const flags = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
        '--api',
        AN_OFFICE_ON_ANOTHER_MACHINE,
        '--agent',
        'waiter-away',
        '--session',
        'session-of-waiter-away',
        '--workspace',
        'default',
        '--credential',
        'the-value-on-the-arm-which-is-null',
        '--key',
        'the-value-on-the-arm-which-is-null',
      ],
      {
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '' },
      },
    )
    expect(flags.status).toBe(2)
    expect(flags.stderr).toContain('MOLE_OFFICE_CREDENTIAL')
  }, 30_000)

  it('serves a bundle built from a script that carries the two file names and their reader, and it still parses', async () => {
    const served = await app.inject({ method: 'GET', url: '/api/handles/waiter', headers: PERSON })
    expect(served.statusCode, served.body).toBe(200)
    const text = String((served.json() as { text?: string }).text)
    // BUILT FROM THE SCRIPT AS IT SITS ON DISK NOW, so the envelope names what a remote agent sets,
    // and carries the reader of the two files with it.
    expect(text).toContain('MOLE_OFFICE_CREDENTIAL_FILE')
    expect(text).toContain('MOLE_AGENT_KEY_FILE')

    // IT STILL RUNS ALONE, in a folder holding nothing but Node, as the bundle's own test says.
    const alone = mkdtempSync(join(tmpdir(), 'mole-office-waiter-alone-'))
    writeFileSync(join(alone, 'hold-the-handle.mjs'), text)
    try {
      const ran = spawnSync(process.execPath, ['hold-the-handle.mjs', '--help'], {
        cwd: alone,
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '' },
      })
      expect(ran.status, ran.stderr).toBe(0)
      expect(ran.stdout).toContain('--agent')
      expect(ran.stdout).toContain('--session')
      expect(ran.stdout).toContain('--api')
    } finally {
      rmSync(alone, { recursive: true, force: true })
    }
  }, 30_000)
})

/** The token files this file made, in one folder that goes at the end. */
const tokenFolder = mkdtempSync(join(tmpdir(), 'mole-office-waiter-token-'))
afterAll(() => rmSync(tokenFolder, { recursive: true, force: true }))

/** A file holding one token and a line end, with the given mode, as an agent keeps it. */
function aTokenFile(token: string, mode = 0o600): string {
  const path = join(tokenFolder, `${String(mode.toString(8))}-${randomBytes(4).toString('hex')}.token`)
  writeFileSync(path, `${token}\n`)
  chmodSync(path, mode)
  return path
}

/** Wait until one waiter child has printed a sentence, and hand back what it has said so far. */
function untilIncludes(waiter: ReturnType<typeof startTheWaiter>, sentence: string, budgetMs = 20_000): Promise<string> {
  const startedAt = Date.now()
  return new Promise((resolve) => {
    const look = () => {
      if (waiter.said().includes(sentence) || Date.now() - startedAt > budgetMs) return resolve(waiter.said())
      setTimeout(look, 200)
    }
    look()
  })
}
