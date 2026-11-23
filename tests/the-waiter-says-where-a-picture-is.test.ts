// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HANDLE WAITER PRINTS WHERE A PICTURE IS, SO THE AGENT READING IT CAN OPEN THE FILE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * The agent's half of criterion M65: a screenshot
 * taken on another machine has to reach an agent here through the chat rather than through `scp`. The
 * criterion says the waiter prints the picture's path or address with the message so an agent can
 * read it.
 *
 * Three things:
 *
 *   1. THE PATH IS PRINTED WITH THE WORDS, and so is the address. The path is what an agent on this
 *      machine wants — it can open the file with the tool it already has. The address is the
 *      ordinary preview door, which serves the file because this message points at it.
 *   2. WHAT THE PICTURE SHOWS IS PRINTED TOO. A path with nothing saying what is at the end of it
 *      makes an agent open a file to find out whether it wanted to.
 *   3. A MESSAGE WITH NO PICTURES PRINTS NOTHING ABOUT PICTURES. Almost every message carries none,
 *      and a line about that on every one of them would say nothing.
 *
 * IT DRIVES THE REAL SCRIPT. `tools/hold-the-handle.mjs` is started as a process against a real API,
 * exactly as a session starts it, and what it printed is read off its own output. A test that read
 * the function instead would pass while the tool printed nothing.
 *
 * The harness — the fresh database, the listening API, the waiter as a child process — is the one
 * `tests/waking-a-session-in-each-runtime.test.ts` uses, for the same reason it does.
 */

import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

/** A one pixel png, so what the message points at is a real picture rather than bytes called one. */
const A_REAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const WHAT_IT_SHOWS = 'The wiring on the left arm, from loquat'

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let api: string
let keyEnv: NodeJS.ProcessEnv = {}
let agentId = ''
let session = ''
let ours = ''
let picture = ''
let previousRoots: string | undefined
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const started: ChildProcess[] = []

beforeAll(async () => {
  ours = mkdtempSync(join(tmpdir(), 'mole-office-waiter-picture-'))
  picture = join(ours, 'handoverv2test.png')
  writeFileSync(picture, A_REAL_PNG)

  t = await freshDb()
  // THE PICTURE'S FOLDER IS A PREVIEW ROOT, as a folder the person can open is. The office refuses at the send a file
  // the person could not open, so a picture outside every root is never handed to the waiter at all.
  previousRoots = process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = `${CHECKOUT}:${dirname(t.file)}:${ours}`
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  keyEnv = await aTestAgentsKeyEnvironment(app, 'woken', dirname(t.file))
  session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'A session somebody opened',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as woken' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const listed = (
    await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })
  ).json() as { agents: { id: string; handle: string }[] }
  agentId = listed.agents.find((one) => one.handle === 'woken')?.id ?? ''
  expect(agentId, 'the agent the waiter holds').not.toBe('')
}, 120_000)

afterAll(async () => {
  for (const child of started) {
    // BY THE PID THIS FILE RECORDED WHEN IT STARTED THE PROCESS, and by nothing else.
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is the outcome this wanted.
    }
  }
  await app.close()
  t.close()
  rmSync(ours, { recursive: true, force: true })
  if (previousRoots === undefined) delete process.env['MOLE_OFFICE_PREVIEW_ROOTS']
  else process.env['MOLE_OFFICE_PREVIEW_ROOTS'] = previousRoots
})

/** Start the waiter, collecting everything it prints. */
function startTheWaiter(): { child: ChildProcess; said: () => string; ended: Promise<number> } {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent',
      'woken',
      '--session',
      session,
      '--api',
      api,
      '--workspace',
      'default',
      '--runtime',
      'claude-code',
    ],
    { env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1', MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS: '30' } },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  const ended = new Promise<number>((go) => child.on('exit', (code) => go(code ?? -1)))
  return { child, said: () => printed, ended }
}

/** Wait for something to become true, or say it never did. */
async function until(what: () => boolean, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

async function sendTheAgent(body: string, pictures?: unknown[]): Promise<string> {
  const said = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: {
      kind: 'message',
      title: body.slice(0, 40),
      data: { body, to: [{ kind: 'agent', id: agentId }], ...(pictures === undefined ? {} : { pictures }) },
    },
  })
  expect(said.statusCode, said.body).toBe(201)
  return said.json<{ record: { id: string } }>().record.id
}

describe('the waiter says where a picture is', () => {
  it('prints the path, the address and what the picture shows, beside the words', async () => {
    const waiter = startTheWaiter()
    expect(await until(() => waiter.said().includes('Holding the handle'))).toBe(true)

    const messageId = await sendTheAgent('Look at the wiring on the left arm.', [
      { id: 'p-1', type: 'image', path: picture, alt: WHAT_IT_SHOWS },
    ])

    // CLAUDE CODE IS WOKEN BY THIS PROCESS EXITING, so the waiter prints and stops.
    const code = await Promise.race([
      waiter.ended,
      new Promise<number>((go) => setTimeout(() => go(-2), 25_000)),
    ])
    expect(code, `the waiter never exited: ${waiter.said()}`).toBe(0)

    const said = waiter.said()
    expect(said, 'the words').toContain('Look at the wiring on the left arm.')
    expect(said, 'the path on this machine').toContain(picture)
    expect(said, 'the address the file is served at').toContain(
      `${api}/api/file?path=${encodeURIComponent(picture)}&record=${messageId}`,
    )
    expect(said, 'what the picture shows').toContain(WHAT_IT_SHOWS)
  }, 120_000)

  it('says nothing about pictures for a message that carries none', async () => {
    const waiter = startTheWaiter()
    expect(await until(() => waiter.said().includes('Holding the handle'))).toBe(true)

    await sendTheAgent('And a plain line with no picture at all.')
    const code = await Promise.race([
      waiter.ended,
      new Promise<number>((go) => setTimeout(() => go(-2), 25_000)),
    ])
    expect(code, `the waiter never exited: ${waiter.said()}`).toBe(0)

    const said = waiter.said()
    expect(said).toContain('And a plain line with no picture at all.')
    expect(said, 'no word about a picture on a message that has none').not.toContain('A PICTURE')
    expect(said).not.toContain('/api/file?path=')
  }, 120_000)
})
