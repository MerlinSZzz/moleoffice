// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE SCRIPT IN tools/kit/ SENDS SEVERAL QUOTES IN THE ORDER GIVEN, AND ITS KEY ONLY ON ITS HEADER.
 *
 * This is case 6 of tests/a-message-carries-several-quotes.test.ts, proved again on
 * `tools/kit/send-message.py`, the copy with no personal default. That file
 * goes on testing design/agents/kit/send-message.py, which live agents still run by its path. The
 * door's own cases (1 to 5 there) are about the office, not the script, and are not repeated here.
 *
 * WHAT IS PROVED
 *   1. `--quote` is sent in the order given, in a shape the real message door accepts from an agent
 *      .
 *   2. The agent's key is read from MOLE_AGENT_KEY and sent on x-mole-office-key, and the script
 *      prints it nowhere.
 *   3. A quoted record id that begins with "-" or "--" is taken as the record id, not read as an
 *      option, with its words and without, beside a --lead; an option after a quote is not its words.
 *   4. The id joined to the option, --quote=<id>, is read as --quote <id> is; an abbreviated --quo
 *      <id>, which argparse would read and the script put aside, is refused, and nothing is sent.
 *
 * HOW. The script is pointed at a server this file starts on a port the system chooses on
 * 127.0.0.1, which only keeps what it was sent and answers 201. The body it kept is then given to the
 * real door, in a throwaway database `freshDb` makes. Nothing here opens ./data/panelx.db or reaches
 * an office.
 *
 * EVERY PROCESS THIS FILE STARTS IS IN A PROCESS GROUP OF ITS OWN (office regulations, chapter 2):
 * python3 is started with `detached: true`, which makes it the leader of a new group, and waited for.
 * If it has not ended within twenty seconds its group is stopped by that id and the case fails. The
 * server is closed after each case.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN (see the commit message): in tools/kit/send-message.py, put
 * each quote at the front of the list instead of the end. Case 1 goes red: the quotes arrive in the
 * reverse order.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { quotesOf } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const SEND_MESSAGE = fileURLToPath(new URL('../tools/kit/send-message.py', import.meta.url))
const WS = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WS,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** How long the script may run before its group is stopped and the case fails. */
const THE_SCRIPT_MAY_RUN_MS = 20_000

let t: TestDb
let app: FastifyInstance
let server: Server | null = null
let folder: string | null = null

/** What the stand-in server was sent: one entry per request. */
interface Kept {
  body: string
  headers: IncomingHttpHeaders
}

/** Start the stand-in server on a free port of 127.0.0.1 and answer where it is and what it keeps. */
async function aServerThatKeepsWhatItIsSent(): Promise<{ api: string; kept: Kept[] }> {
  const kept: Kept[] = []
  server = createServer((req, res) => {
    let said = ''
    req.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
    req.on('end', () => {
      kept.push({ body: said, headers: req.headers })
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ record: { id: 'kept' } }))
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', () => done()))
  return { api: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, kept }
}

/**
 * Run the script in a process group of its own, with only the environment given, and wait for it.
 * Started without blocking, because the stand-in server answers from this same process.
 */
async function sendMessage(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; printed: string }> {
  const child = spawn('python3', [SEND_MESSAGE, ...args], { detached: true, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let printed = ''
  child.stdout.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  child.stderr.on('data', (chunk: Buffer) => (printed += chunk.toString('utf8')))
  let stoppedByTheTimer = false
  const timer = setTimeout(() => {
    stoppedByTheTimer = true
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // The group ended between the timer and the signal.
      }
    }
  }, THE_SCRIPT_MAY_RUN_MS)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  if (stoppedByTheTimer) throw new Error(`send-message.py was still running after ${String(THE_SCRIPT_MAY_RUN_MS)} ms, so its group was stopped`)
  return { code, printed }
}

/** The environment the script is given: PATH and the variables named, and nothing of the caller's. */
function only(variables: Record<string, string>): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...variables }
}

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-tools-kit-quote-'))
})

afterEach(async () => {
  if (server !== null) await new Promise<void>((done) => server?.close(() => done()))
  server = null
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
  await app.close()
  t.close()
})

async function register(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

async function aRecord(title: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: { kind: 'problem', title, data: {} } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

function recordIdsOf(quotes: readonly unknown[]): string[] {
  return quotes.map((one) => (one as { target: { recordId: string } }).target.recordId)
}

describe('the message script in tools/kit', () => {
  it('case 1: sends --quote in the order given, in a shape the door accepts from an agent', async () => {
    const sender = await register('qt-kit')
    const [a, b] = [await aRecord('the kiln ran hot'), await aRecord('the glaze crazed')]
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const bodyFile = join(folder ?? '', 'body.txt')
    writeFileSync(bodyFile, 'Two places.\n')

    const sent = await sendMessage(
      [WS, `person:${THE_PERSON}`, 'Two places', bodyFile, '--as', sender, '--api', api, '--quote', b, 'the glaze crazed', '--quote', a],
      only({}),
    )
    expect(sent.code, sent.printed).toBe(0)
    expect(kept).toHaveLength(1)
    const body = JSON.parse(kept[0]?.body ?? '{}') as { kind: string; title: string; data: Record<string, unknown> }
    expect(body.data['quotes']).toEqual([
      { target: { kind: 'record', recordId: b, workspaceId: WS }, place: { at: 'quote', words: 'the glaze crazed' } },
      { target: { kind: 'record', recordId: a, workspaceId: WS } },
    ])

    const reply = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(sender), payload: body })
    expect(reply.statusCode, reply.body).toBe(201)
    expect(recordIdsOf(quotesOf(reply.json().record as { kind: string; data: Record<string, unknown> }))).toEqual([b, a])
  })

  it('case 3: a quoted record id that begins with "-" or "--" is taken as the record id, not as an option', async () => {
    // RECORD IDS MAY BEGIN WITH "-" (this office's ids use - and _), and argparse read such an id after --quote as an
    // option (4 October 2026, with --quote -DLTM7OOi83G). The script takes the word after --quote as the record id
    // whatever it begins with, as it does after --lead.
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const bodyFile = join(folder ?? '', 'body.txt')
    writeFileSync(bodyFile, 'Ids with dashes.\n')
    const sent = await sendMessage(
      [WS, 'another-agent', 'Ids with dashes', bodyFile, '--as', 'the-sender', '--api', api,
        '--quote', '--Xy3fGh_jklm', '--quote', '-AbCd3fGh_jk', 'the words in it', '--lead', '-LeAd3fGh_jk'],
      only({}),
    )
    expect(sent.code, sent.printed).toBe(0)
    const body = JSON.parse(kept[0]?.body ?? '{}') as { data: Record<string, unknown> }
    // The first quote has no words: the --quote after it is another option, not its words.
    expect(body.data['quotes']).toEqual([
      { target: { kind: 'record', recordId: '--Xy3fGh_jklm', workspaceId: WS } },
      { target: { kind: 'record', recordId: '-AbCd3fGh_jk', workspaceId: WS }, place: { at: 'quote', words: 'the words in it' } },
    ])
    expect(body.data['lead']).toEqual({ target: { kind: 'record', recordId: '-LeAd3fGh_jk', workspaceId: WS }, place: { at: 'surface' } })
  })

  it('case 4: --quote=<id> is read as --quote <id> is, and an abbreviated --quo is refused with nothing sent', async () => {
    // THE INSPECTOR'S REFUSAL OF RUN dwAXfOob3ikz (check nW8w2f-BbXxL): argparse also takes --quote=<id> and an abbreviation
    // such as --quo <id>, and the script then put what argparse read aside, sending the message without its quote and
    // printing 201.
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const bodyFile = join(folder ?? '', 'body.txt')
    writeFileSync(bodyFile, 'Joined and abbreviated.\n')
    const joined = await sendMessage(
      [WS, 'another-agent', 'Joined ids', bodyFile, '--as', 'the-sender', '--api', api,
        '--quote=-AbCd3fGh_jk', 'the words in it', '--quote=--Xy3fGh_jklm'],
      only({}),
    )
    expect(joined.code, joined.printed).toBe(0)
    const body = JSON.parse(kept[0]?.body ?? '{}') as { data: Record<string, unknown> }
    expect(body.data['quotes']).toEqual([
      { target: { kind: 'record', recordId: '-AbCd3fGh_jk', workspaceId: WS }, place: { at: 'quote', words: 'the words in it' } },
      { target: { kind: 'record', recordId: '--Xy3fGh_jklm', workspaceId: WS } },
    ])
    for (const abbreviated of ['--quo', '--quot']) {
      const refused = await sendMessage(
        [WS, 'another-agent', 'Abbreviated', bodyFile, '--as', 'the-sender', '--api', api, abbreviated, 'AbCd3fGh_jk'],
        only({}),
      )
      expect(refused.code, refused.printed).toBe(2)
      expect(refused.printed).toContain('write --quote and --lead in full: an abbreviation of them is not read. Nothing was sent.')
    }
    expect(kept).toHaveLength(1)
  })

  it('case 2: reads the address, the handle and the key from the environment, sends the key only on its header, and prints it nowhere', async () => {
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const bodyFile = join(folder ?? '', 'body.txt')
    writeFileSync(bodyFile, 'From the environment.\n')
    // A MADE-UP VALUE, NOT A KEY: the stand-in server checks nothing.
    const madeUp = 'a-made-up-value-for-the-stand-in'

    const sent = await sendMessage(
      [WS, 'another-agent', 'From the environment', bodyFile],
      only({ MOLE_OFFICE_API: api, MOLE_OFFICE_AGENT: 'the-sender', MOLE_OFFICE_SESSION: 'the-session', MOLE_AGENT_KEY: madeUp }),
    )
    expect(sent.code, sent.printed).toBe(0)
    // ROUND 16: the second line is the send id the script made, so a caller can send the same message again with it.
    expect(sent.printed.trim().split('\n')).toEqual([
      '201 kept',
      expect.stringMatching(/^send id [0-9a-f]{24}: to send this again, run the same command with --send-id [0-9a-f]{24}\b/u),
    ])
    expect(kept).toHaveLength(1)
    const headers = kept[0]?.headers ?? {}
    expect(headers['x-mole-office-key']).toBe(madeUp)
    expect(headers['x-mole-office-actor-id']).toBe('the-sender')
    expect(headers['x-mole-office-session']).toBe('the-session')
    expect(kept[0]?.body.includes(madeUp), 'the key was put in the body').toBe(false)
    expect(sent.printed.includes(madeUp), 'the script printed the key').toBe(false)
  })
})
