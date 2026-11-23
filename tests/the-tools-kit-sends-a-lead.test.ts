// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE SCRIPT IN tools/kit/ SENDS A LEAD, SO A SECRETARY'S REPORT LINE CARRIES ITS BUTTON.
 *
 * A secretary's 07:00 and 18:00 report goes in the chat as one line with a button that opens the
 * report. The office's reminders count a report for a slot as the
 * secretary's message carrying the slot's mark and a lead to a report record (`theReportForTheSlot`
 * in src/server/lib/broadcast.ts). The script could send the mark (`--slot`) but not the button, so
 * `--lead <record id> [<project>]` now sets data.lead: {target: {kind: 'record', recordId,
 * workspaceId}, place: {at: 'surface'}}. It was agreed (message kcimgn7BV7lv); the agent who keeps the kit was told
 * before the commit (message ZUZho_hkfM3Q).
 *
 * WHAT IS PROVED
 *   1. `--lead` with `--slot` is sent in the shape above, the real message door stores it from an
 *      agent, and the reminders then read that line as the report for the slot.
 *   2. A project given after the record id names the project the record is in.
 *   3. Without `--lead` the message carries no lead.
 *   4. A record id that begins with "-" is taken as the record id, not read as an option.
 *   5. The id joined to the option, --lead=<id>, is read as --lead <id> is; an abbreviated --le <id>,
 *      which argparse would read and the script put aside, is refused, as is a second --lead, and
 *      nothing is sent.
 *
 * HOW. As tests/the-tools-kit-sends-several-quotes.test.ts does: the script is pointed at a server
 * this file starts on a port the system chooses on 127.0.0.1, which keeps what it was sent and
 * answers 201. The body it kept is then given to the real door, in a throwaway database. Nothing here
 * opens ./data/panelx.db or reaches an office. Every python3 the file starts is the leader of a
 * process group of its own, and is stopped by that group's id if it runs past twenty seconds.
 *
 * MUTATION, PROVED AFTER A CONTROL RUN (see the commit message): in tools/kit/send-message.py, do not
 * put the lead on the message. Cases 1, 2 and 4 go red. And let argparse read --lead again: case 4 goes red.
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

/** Start the stand-in server on a free port of 127.0.0.1 and answer where it is and the bodies it keeps. */
async function aServerThatKeepsWhatItIsSent(): Promise<{ api: string; kept: string[] }> {
  const kept: string[] = []
  server = createServer((req, res) => {
    let said = ''
    req.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')))
    req.on('end', () => {
      kept.push(said)
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ record: { id: 'kept' } }))
    })
  })
  await new Promise<void>((done) => server?.listen(0, '127.0.0.1', () => done()))
  return { api: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, kept }
}

/** Run the script in a process group of its own, with only the environment given, and wait for it. */
async function sendMessage(args: string[]): Promise<{ code: number | null; printed: string }> {
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MOLE_AGENT_KEY: 'made-up-key-for-the-stand-in' }
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

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'mole-office-tools-kit-lead-'))
})

afterEach(async () => {
  if (server !== null) await new Promise<void>((done) => server?.close(() => done()))
  server = null
  if (folder !== null) rmSync(folder, { recursive: true, force: true })
  folder = null
})

async function register(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

async function aReport(title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'report', title, data: { blocks: [{ id: 'b-1', type: 'text', text: 'Synthetic report words.' }] } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

function aBodyFile(words: string): string {
  const file = join(folder ?? '', 'body.txt')
  writeFileSync(file, `${words}\n`)
  return file
}

describe('the message script in tools/kit sends a lead', () => {
  it('case 1: --lead with --slot is a report line the reminders count for the slot', async () => {
    const sender = await register('lead-kit')
    const report = await aReport('The 07:00 report')
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const slot = '2026-10-02 07:00'

    const sent = await sendMessage([
      WS, `person:${THE_PERSON}`, 'The 07:00 report is here', aBodyFile('The 07:00 report is here. Press the button to open it.'),
      '--as', sender, '--api', api, '--slot', slot, '--lead', report,
    ])
    expect(sent.code, sent.printed).toBe(0)
    expect(kept).toHaveLength(1)
    const body = JSON.parse(kept[0] ?? '{}') as { kind: string; title: string; data: Record<string, unknown> }
    expect(body.data['lead']).toEqual({ target: { kind: 'record', recordId: report, workspaceId: WS }, place: { at: 'surface' } })
    expect(body.data['extra']).toEqual({ broadcastSlot: slot })

    // THE REAL DOOR STORES IT FROM AN AGENT, and the reminders read that line as the slot's report.
    const reply = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(sender), payload: body })
    expect(reply.statusCode, reply.body).toBe(201)
    const stored = (reply.json() as { record: { id: string } }).record.id
    const { theReportForTheSlot } = await import('../src/server/lib/broadcast.ts')
    expect(theReportForTheSlot(sender, slot)).toBe(stored)
  })

  it('case 2: a project given after the record id names the project the record is in', async () => {
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const sent = await sendMessage([
      WS, 'another-agent', 'Over there', aBodyFile('It is in the other project.'),
      '--as', 'the-sender', '--api', api, '--lead', 'a-record-id', 'robotics',
    ])
    expect(sent.code, sent.printed).toBe(0)
    const body = JSON.parse(kept[0] ?? '{}') as { data: Record<string, unknown> }
    expect(body.data['lead']).toEqual({ target: { kind: 'record', recordId: 'a-record-id', workspaceId: 'robotics' }, place: { at: 'surface' } })
  })

  it('case 4: a record id that begins with "-" is taken as the record id, not as an option', async () => {
    // RECORD IDS MAY BEGIN WITH "-" (this office's ids use - and _), and argparse read such an id as an
    // option: case 1 failed once in the sweep when its report's id did. The script takes the word after
    // --lead as the record id whatever it begins with.
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const sent = await sendMessage([
      WS, 'another-agent', 'An id with a dash', aBodyFile('Its id begins with a dash.'),
      '--as', 'the-sender', '--api', api, '--lead', '-AbCd3fGh_jk', 'robotics',
    ])
    expect(sent.code, sent.printed).toBe(0)
    const body = JSON.parse(kept[0] ?? '{}') as { data: Record<string, unknown> }
    expect(body.data['lead']).toEqual({ target: { kind: 'record', recordId: '-AbCd3fGh_jk', workspaceId: 'robotics' }, place: { at: 'surface' } })
  })

  it('case 5: --lead=<id> is read as --lead <id> is; an abbreviated --le and a second --lead are refused with nothing sent', async () => {
    // THE INSPECTOR'S REFUSAL OF RUN dwAXfOob3ikz (check nW8w2f-BbXxL) found --lead=<id> put aside the same way as
    // --quote=<id>: the message went without its lead, and the script printed 201.
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const joined = await sendMessage([
      WS, 'another-agent', 'A joined id', aBodyFile('Its id is joined to the option.'),
      '--as', 'the-sender', '--api', api, '--lead=-AbCd3fGh_jk', 'robotics',
    ])
    expect(joined.code, joined.printed).toBe(0)
    const body = JSON.parse(kept[0] ?? '{}') as { data: Record<string, unknown> }
    expect(body.data['lead']).toEqual({ target: { kind: 'record', recordId: '-AbCd3fGh_jk', workspaceId: 'robotics' }, place: { at: 'surface' } })
    const abbreviated = await sendMessage([WS, 'another-agent', 'Abbreviated', aBodyFile('Abbreviated.'), '--as', 'the-sender', '--api', api, '--le', 'AbCd3fGh_jk'])
    expect(abbreviated.code, abbreviated.printed).toBe(2)
    expect(abbreviated.printed).toContain('write --quote and --lead in full: an abbreviation of them is not read. Nothing was sent.')
    const twice = await sendMessage([WS, 'another-agent', 'Twice', aBodyFile('Two leads.'), '--as', 'the-sender', '--api', api, '--lead', 'AbCd3fGh_jk', '--lead', 'EfGh3fGh_jk'])
    expect(twice.code, twice.printed).toBe(2)
    expect(twice.printed).toContain('--lead is a record id, and optionally its project, once')
    expect(kept).toHaveLength(1)
  })

  it('case 3: without --lead the message carries no lead', async () => {
    const { api, kept } = await aServerThatKeepsWhatItIsSent()
    const sent = await sendMessage([WS, 'another-agent', 'No button', aBodyFile('Nothing to open.'), '--as', 'the-sender', '--api', api])
    expect(sent.code, sent.printed).toBe(0)
    const body = JSON.parse(kept[0] ?? '{}') as { data: Record<string, unknown> }
    expect(body.data).not.toHaveProperty('lead')
  })
})
