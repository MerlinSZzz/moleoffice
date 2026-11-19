// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE MESSAGE PER PRESS OF SEND. That is point 1 of a decision, in wave 13u round 14.
 *
 * A send whose answer is lost is sent again by whoever cannot tell whether it arrived: the chat after its timer, an
 * agent's tool after a dropped connection. Each wrote a second message with the same words. Now a send carries the
 * writer's own `sendId`, and a second send from the same writer with the same `sendId` writes nothing. It answers 200
 * with the first message and `alreadySent`, which says why. The check is in `createRecordWithReport`, inside its
 * transaction and before the insert, so two sends that race are still one message.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. The person sends twice with one id: the first answers 409, the second 200 with the first message's id and
 *      words, and `alreadySent` names it. One message carries the id.
 *   2. An agent sends twice with one id, through its own key, while the reader is held: the same.
 *   3. The id is the writer's own: two writers that send the same id each write a message.
 *   4. Different ids, or no id, write a message each, as before.
 *   5. for-agents/send-message.py (tools/kit/send-message.py is a link to it) makes a send id of its own on every
 *      run, prints it on its second line, and the office keeps that id.
 *   6. A run again with --send-id and the same id posts nothing new, prints one line, `200 <first id> <the office's
 *      sentence>`, and exits 0.
 *   7. A run with a different id, or with none, posts a new message.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit that added the check has the runs)
 * ---------------------------------------------------------------------------------------
 *
 *   - the check taken out: cases 1, 2 and 6 go red;
 *   - the check asked without the writer: case 3 goes red;
 *   - the door answering a repeat as 201: cases 1, 2 and 6 go red;
 *   - the script sending no id: cases 5, 6 and 7 go red (round 16);
 *   - the script not printing the send id it made: cases 5, 6 and 7 go red, and case 2 of
 *     the-tools-kit-sends-several-quotes (round 16);
 *   - the script printing the office's sentence on a second line: case 6 goes red (round 16);
 *   - the script sending one fixed id on every run: cases 6 and 7 go red (round 16).
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Two made-up agents, registered by the person. */
const AGENTS = ['kiln-reader', 'tray-counter'] as const
const keys = new Map<string, string>()

const asAnAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

let t: TestDb
let app: FastifyInstance
let door = ''
let folder = ''

const SEND_MESSAGE = fileURLToPath(new URL('../for-agents/send-message.py', import.meta.url))
/** How long the script may run before its group is stopped and the case fails. */
const THE_SCRIPT_MAY_RUN_MS = 20_000

/** Run the script as an agent, in a process group of its own, with only the environment given, and wait for it. */
async function theScript(handle: string, words: string, more: string[] = []): Promise<{ code: number | null; printed: string }> {
  const body = join(folder, `${String(Date.now())}-${String(Math.random()).slice(2)}.txt`)
  writeFileSync(body, words)
  const env = { PATH: process.env['PATH'] ?? '', HOME: folder, MOLE_AGENT_KEY: keys.get(handle) ?? '' }
  const child = spawn('python3', [SEND_MESSAGE, 'default', `person:${THE_PERSON}`, words.slice(0, 40), body, '--as', handle, '--api', door, ...more], {
    detached: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
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

interface Sent {
  status: number
  id: string
  body: string
  alreadySent: { id: string; because: string } | undefined
  text: string
}

async function send(headers: Record<string, string>, words: string, sendId?: string): Promise<Sent> {
  // The person cases keep the reader unheld. For an agent send, hold the reader only while the send is made.
  let holder = ''
  if (headers['x-mole-office-actor-type'] === 'agent') {
    holder = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic holder', actor: t.api.HUMAN,
      data: { state: 'running', runtime: 'claude-code' } }).id
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
    const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(AGENTS[0])}/hold`, headers: AS_THE_PERSON,
      payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
    expect(held.statusCode, held.body).toBe(201)
  }
  let filed
  try {
    filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: {
        kind: 'message',
        title: words.slice(0, 40),
        data: { body: words, to: [{ kind: 'person', id: THE_PERSON }, { kind: 'agent', id: 'kiln-reader' }], ...(sendId === undefined ? {} : { sendId }) },
      },
    })
  } finally {
    if (holder) {
      const released = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(AGENTS[0])}/release`, headers: AS_THE_PERSON,
        payload: { session: holder, because: 'The synthetic send is complete.' } })
      expect(released.statusCode, released.body).toBe(200)
    }
  }
  const read = filed.json() as { record?: { id: string; data: { body: string } }; alreadySent?: { id: string; because: string } }
  return { status: filed.statusCode, id: read.record?.id ?? '', body: read.record?.data.body ?? '', alreadySent: read.alreadySent, text: filed.body }
}

/** How many live messages carry this send id. */
function messagesWith(sendId: string): number {
  const row = t.client.sqlite
    .prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sendId') = ?")
    .get(sendId) as { n: number }
  return row.n
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  folder = mkdtempSync(join(tmpdir(), 'mole-office-send-id-'))
  for (const handle of AGENTS) {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { runtime: 'claude-code', handle, name: `A made-up ${handle}`, role: 'worker' },
    })
    expect(registered.statusCode, registered.body).toBe(201)
    keys.set(handle, String((registered.json() as { whatToGiveIt: { key: string } }).whatToGiveIt.key))
  }
}, 90_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (folder !== '') rmSync(folder, { recursive: true, force: true })
})

describe('one message per send id', () => {
  it('1: the person sends twice with one id, and the second answer is the first message', async () => {
    const first = await send(AS_THE_PERSON, 'The tray holds 24 pots.', 'a-made-up-press-0001')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(first.status, first.text.slice(0, 300)).toBe(409)
    expect(first.alreadySent).toBeUndefined()
    const again = await send(AS_THE_PERSON, 'The tray holds 24 pots, sent again.', 'a-made-up-press-0001')
    expect(again.status, again.text.slice(0, 300)).toBe(200)
    expect(again.id).toBe(first.id)
    expect(again.body, 'the answer is the first message as it was stored').toBe('The tray holds 24 pots.')
    expect(again.alreadySent?.id).toBe(first.id)
    expect(again.alreadySent?.because).toContain('a-made-up-press-0001')
    expect(messagesWith('a-made-up-press-0001')).toBe(1)
  })

  it('2: an agent sends twice with one id, and the second answer is the first message', async () => {
    const first = await send(asAnAgent('tray-counter'), 'Counted 24 pots.', 'a-made-up-press-0002')
    expect(first.status, first.text.slice(0, 300)).toBe(201)
    const again = await send(asAnAgent('tray-counter'), 'Counted 24 pots.', 'a-made-up-press-0002')
    expect(again.status, again.text.slice(0, 300)).toBe(200)
    expect(again.id).toBe(first.id)
    expect(again.alreadySent?.id).toBe(first.id)
    expect(messagesWith('a-made-up-press-0002')).toBe(1)
  })

  it('3: two writers that send the same id each write a message', async () => {
    const one = await send(asAnAgent('tray-counter'), 'Counted 12 pots.', 'a-made-up-press-0003')
    const other = await send(asAnAgent('kiln-reader'), 'The kiln reads 40 degrees.', 'a-made-up-press-0003')
    expect([one.status, other.status]).toEqual([201, 201])
    expect(other.id).not.toBe(one.id)
    expect(messagesWith('a-made-up-press-0003')).toBe(2)
  })

  it('4: different ids, or no id, write a message each', async () => {
    const a = await send(AS_THE_PERSON, 'Water the tray.', 'a-made-up-press-0004')
    const b = await send(AS_THE_PERSON, 'Water the tray.', 'a-made-up-press-0005')
    const c = await send(AS_THE_PERSON, 'Water the tray.')
    const d = await send(AS_THE_PERSON, 'Water the tray.')
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect([a.status, b.status, c.status, d.status]).toEqual([409, 409, 409, 409])
    expect(new Set([a.id, b.id, c.id, d.id]).size).toBe(4)
  })

  // THE SCRIPT'S PRINTED ANSWER (round 16): a new message prints `201 <id>` and then the send id it made, on a line a
  // caller can read it back from; a send the office already holds prints one line, `200 <first id> <the office's
  // sentence>`, and exits 0.
  const SEND_ID_LINE = /^send id ([0-9a-f]{24}): to send this again, run the same command with --send-id \1\b/u

  it('5: one send by the agents\' script prints the send id it made, and that is the id the office keeps', async () => {
    const one = await theScript('tray-counter', 'The script counted 30 pots.')
    expect(one.code, one.printed).toBe(0)
    const lines = one.printed.trim().split('\n')
    const [status, id] = lines[0]!.split(' ')
    expect(status, one.printed).toBe('201')
    const printedId = SEND_ID_LINE.exec(lines[1] ?? '')?.[1]
    expect(printedId, `the send id is printed on the second line:\n${one.printed}`).toBeDefined()
    const stored = t.client.sqlite.prepare("SELECT json_extract(data, '$.sendId') AS id FROM records WHERE id = ?").get(id) as { id: string | null }
    expect(stored.id, 'the printed id is the one the office keeps').toBe(printedId)
    expect(messagesWith(printedId!)).toBe(1)
  }, 60_000)

  it('6: a run again with the same send id posts nothing new and says so in one line, with the first message\'s id', async () => {
    const one = await theScript('tray-counter', 'The script counted 31 pots.')
    expect(one.code, one.printed).toBe(0)
    const firstId = one.printed.trim().split('\n')[0]!.split(' ')[1]!
    const sendId = SEND_ID_LINE.exec(one.printed.trim().split('\n')[1] ?? '')?.[1]
    expect(sendId, one.printed).toBeDefined()
    const again = await theScript('tray-counter', 'The script counted 31 pots.', ['--send-id', sendId!])
    expect(again.code, again.printed).toBe(0)
    const lines = again.printed.trim().split('\n')
    expect(lines, again.printed).toHaveLength(1)
    expect(lines[0]!.startsWith(`200 ${firstId} `), again.printed).toBe(true)
    expect(lines[0]).toContain(`already sent the message ${firstId}`)
    expect(messagesWith(sendId!)).toBe(1)
  }, 60_000)

  it('7: a run with a different send id, or with none, posts a new message', async () => {
    const one = await theScript('tray-counter', 'The script counted 32 pots.')
    const sendId = SEND_ID_LINE.exec(one.printed.trim().split('\n')[1] ?? '')?.[1]
    expect(sendId, one.printed).toBeDefined()
    const other = await theScript('tray-counter', 'The script counted 32 pots.', ['--send-id', 'a-made-up-press-0007'])
    const none = await theScript('tray-counter', 'The script counted 32 pots.')
    expect([one.code, other.code, none.code], `${one.printed}\n${other.printed}\n${none.printed}`).toEqual([0, 0, 0])
    const ids = [one, other, none].map((run) => run.printed.trim().split('\n')[0]!.split(' '))
    expect(ids.map(([status]) => status)).toEqual(['201', '201', '201'])
    expect(new Set(ids.map(([, id]) => id)).size).toBe(3)
    expect(other.printed).toContain('send id a-made-up-press-0007: to send this again, run the same command with --send-id a-made-up-press-0007')
    expect(SEND_ID_LINE.exec(none.printed.trim().split('\n')[1] ?? '')?.[1]).not.toBe(sendId)
    expect([messagesWith(sendId!), messagesWith('a-made-up-press-0007')]).toEqual([1, 1])
  }, 60_000)
})
