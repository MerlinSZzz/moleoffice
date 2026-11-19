// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE THAT SEEMS TO HOLD A KEY IS STORED, AND ITS WRITER IS REMINDED, on
 * problem __4iR4FkFAGS.
 *
 * From wave 13w round 2 to round 9 the records door refused such a message with one code per shape. Now the
 * office does not manage what its users write: the message is stored as it was written, and the answer carries
 * `keyReminder`, which names the shape, where the piece is, its first four characters and its length, and never the
 * piece (src/server/lib/message-keys.ts). The shapes are the ones the terminal's keeping reads
 * (src/config/secret-shapes.mjs). A message that only looks a little like one is stored with no reminder.
 *
 * Each agent send holds its reader with this test process while the message is sent. The person send leaves the reader unheld.
 * EVERY KEY HERE IS MADE UP, and each is put together when the test runs, so this file holds nothing of a key's shape.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   · an agent's message holding each shape, with English words around it and with Chinese words around it, is stored
 *     whole, and its 201 answer carries the reminder for that shape, which does not repeat the piece.
 *     MUTATION: in createRecordWithReport (src/server/lib/records.ts), do not put `keyReminder` on the result.
 *   · a message whose own title, not cut from its body, holds a key is reminded with the title named.
 *     MUTATION: in theWordsOfAMessage (src/shared/message-keys.ts), drop the title's line.
 *   · an edit that puts a key into a message's body is stored, and its answer carries the reminder.
 *     MUTATION: in patchRecord, do not put `keyReminder` on the answer.
 *   · a message the office writes itself, holding a file's full hash, has no reminder; the same words filed by the
 *     message worker as an agent's reply have one, and so do they from a registered agent through createRecordWithReport.
 *     MUTATION: in theKeyReminderFor (src/server/lib/message-keys.ts), drop the line that lets the office's writing
 *     through. The office's message is reminded, and this goes red.
 *   · a full git commit id, record ids, a path that ends in one and a hyphenated temporary folder are stored with no
 *     reminder; a 24-character random part between hyphens is reminded.
 *   · an agent's run names, a compact time and a name after it, are stored with no reminder, written split here as the
 *     brief asks; a generated word after the same time is still reminded.
 *     MUTATION: in aGeneratedLookingPiece (src/config/secret-shapes.mjs), judge the piece without taking the time out.
 *     Two of an agent's names are reminded, and this goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { AKeyReminder } from '../src/shared/message-keys.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let agentId = ''
let readerHandle = ''
let holder = ''

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'writer' }

/** One made-up piece for each shape, and the shape its reminder names. */
const A_PIECE_OF_EACH_SHAPE: ReadonlyArray<readonly [AKeyReminder['shape'], string]> = [
  ['privateKey', '-----BEGIN ' + 'OPENSSH PRIVATE KEY-----'],
  ['awsKey', 'AKIA' + 'EXAMPLE' + '0'.repeat(9)],
  ['apiKey', 'sk-' + 'proj' + 'a1'.repeat(10)],
  ['githubToken', 'ghp_' + 'Ab1'.repeat(8)],
  ['slackToken', 'xoxb-' + '1234-abcd-' + 'x'.repeat(4)],
  ['googleKey', 'AIza' + 'Sy' + 'A1b'.repeat(10)],
  ['bearerToken', 'Bearer ' + 'abcdefgh.ijklmnop.qr'],
  ['givenAValue', 'DB_PASSWORD=' + 'hunter2'],
  ['passwordOption', 'mysql --password ' + 'hunter22'],
  ['passwordAfterP', 'mysql -u root -p' + 'S3cret'],
  ['passwordInUrl', 'https://jory:' + 'hunter2' + '@example.com/repo.git'],
  ['longRun', '0123456789abcdef'.repeat(4)],
  ['generatedWord', 'Zx81Ka92' + 'Lm03Pq74' + 'Rs65Tu56'],
]

/** A full git commit id, which is not a key. */
const A_COMMIT_ID = '5e70e031d85db292b53623b992f6014bdab158c5'

interface Sent {
  status: number
  reply: { record?: { id: string; data: { body: string } }; keyReminder?: AKeyReminder } & Record<string, unknown>
}

async function send(body: string, headers: Record<string, string> = AS_AN_AGENT, title = body.slice(0, 40)): Promise<Sent> {
  const asAgent = headers['x-mole-office-actor-type'] === 'agent'
  if (asAgent) {
    const held = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(readerHandle)}/hold`, headers: AS_THE_OWNER,
      payload: { session: holder, machine: 'a-synthetic-machine', runtime: 'claude-code' } })
    expect(held.statusCode, held.body).toBe(201)
  }
  try {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers,
      payload: { kind: 'message', title, data: { body, to: [{ kind: 'agent', id: agentId }] } },
    })
    return { status: sent.statusCode, reply: sent.json() as Sent['reply'] }
  } finally {
    if (asAgent) {
      const released = await app.inject({ method: 'POST', url: `/api/handles/${encodeURIComponent(readerHandle)}/release`, headers: AS_THE_OWNER,
        payload: { session: holder, because: 'The synthetic send is complete.' } })
      expect(released.statusCode, released.body).toBe(200)
    }
  }
}

/** Stored whole, and with no reminder. */
async function storedWithNoReminder(body: string): Promise<void> {
  const { status, reply } = await send(body)
  expect(status, JSON.stringify(reply)).toBe(201)
  expect(reply.record?.data.body).toBe(body)
  expect(reply.keyReminder, body).toBeUndefined()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['reader', 'writer']) {
    await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OWNER, payload: { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } } })
  }
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as { agents?: { id: string; handle: string }[] }
  const reader = one((listed.agents ?? []).filter((a) => a.handle === 'reader'), 'the registry row for reader')
  agentId = reader.id
  readerHandle = reader.handle
  holder = t.api.createRecord({ kind: 'session', title: 'A synthetic holder', workspaceId: 'default', actor: t.api.HUMAN,
    data: { state: 'running', runtime: 'claude-code' } }).id
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: 'default', sessionRecordId: holder, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a message whose words seem to hold a key', () => {
  it("is stored whole for each shape, in English and in Chinese words, and the agent's answer carries the reminder", async () => {
    for (const [shape, piece] of A_PIECE_OF_EACH_SHAPE) {
      for (const body of [`Here is what you asked for: ${piece} and nothing else.`, `你要的在这里 ${piece} 别的没有了。`]) {
        const { status, reply } = await send(body)
        expect(status, body).toBe(201)
        expect(reply.record?.data.body, 'stored as it was written').toBe(body)
        const reminder = reply.keyReminder
        expect(reminder, body).toBeDefined()
        expect(reminder?.shape, body).toBe(shape)
        expect(reminder?.where, body).toBe('body')
        // WHERE THE PIECE BEGINS AND HOW LONG IT IS, and never the end of it, which is where a key's secret part is.
        expect(reminder?.begins.length, body).toBe(4)
        expect(body, body).toContain(reminder?.begins)
        expect(reminder?.n, body).toBeGreaterThan(4)
        expect(reminder?.says, body).toMatch(/^This message was stored, but its body seems to hold /)
        expect(JSON.stringify(reminder), body).not.toContain(piece.slice(-6))
      }
    }
  })

  it('is reminded about when its own title holds one, and the reminder names the title', async () => {
    const piece = '0123456789abcdef'.repeat(4)
    const { status, reply } = await send('An ordinary body.', AS_AN_AGENT, `Key ${piece}`)
    expect(status, JSON.stringify(reply)).toBe(201)
    expect(reply.keyReminder?.shape).toBe('longRun')
    expect(reply.keyReminder?.where).toBe('title')
    expect(reply.keyReminder?.says).toContain('its title')
  })

  it('is stored when an edit puts a key into its body, and the answer to the edit carries the reminder', async () => {
    const { status, reply } = await send('A message that will be edited.', AS_THE_OWNER)
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(status, JSON.stringify(reply)).toBe(409)
    expect(reply.keyReminder).toBeUndefined()
    const id = reply.record?.id ?? ''
    const body = `Now with ${'0123456789abcdef'.repeat(4)}.`
    const edited = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: AS_THE_OWNER, payload: { dataPatch: { body } } })
    expect(edited.statusCode, edited.body).toBe(200)
    expect((edited.json() as { keyReminder?: AKeyReminder }).keyReminder?.shape).toBe('longRun')
    const read = (await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_OWNER })).json() as { record: { data: { body: string } } }
    expect(read.record.data.body).toBe(body)
  })
})

describe('a message the office writes itself', () => {
  it('has no reminder with a full hash in it, and the same words filed by the message worker have one', async () => {
    const { createRecordWithReport, getRecord } = await import('../src/server/lib/records.ts')
    const { THE_OFFICE, writeAMessage } = await import('../src/server/lib/inspection.ts')
    const { THE_WORKER } = await import('../src/shared/the-worker-actor.ts')
    const { theKeyReminderFor } = await import('../src/server/lib/message-keys.ts')
    const { theWordsOfAMessage } = await import('../src/shared/message-keys.ts')
    // A real hash holds digits; a run of one letter is no longer a key (problem 0VsAlpkCl6LF).
    const body = `Bounced: work/a.txt is ${'e7'.repeat(32)}, not what was submitted.`
    const data = { body, to: [{ kind: 'agent', id: agentId }] }
    // AS A BOUNCE IS WRITTEN: through writeAMessage, about a run. It is stored whole, and the reading that would
    // remind its writer finds nothing to say to the office.
    const run = await app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_OWNER, payload: { kind: 'session', title: 'Test: a run a bounce is about', data: {} } })
    expect(run.statusCode, run.body).toBe(201)
    const aboutRun = String((run.json() as { record: { id: string } }).record.id)
    const written = writeAMessage({ workspaceId: 'default', to: [{ kind: 'agent', id: agentId }], title: 'Bounced', body, aboutRun, actor: THE_OFFICE, onlyThem: true, notice: 'anEntryBounced' })
    expect((getRecord(written)?.data as { body: string }).body).toBe(body)
    expect(theKeyReminderFor(theWordsOfAMessage({ title: 'Bounced', data }), THE_OFFICE), "the office's own writing is not reminded").toBeNull()
    // AN AGENT'S REPLY FILED BY THE MESSAGE WORKER, under its own name, is reminded. The worker is not registered in
    // a fresh office, so this reads the function the door reads.
    expect(theKeyReminderFor(theWordsOfAMessage({ title: 'Bounced', data }), THE_WORKER)?.shape, "an agent's reply filed by the message worker is reminded").toBe('longRun')
    // AND THE SAME WORDS FROM A REGISTERED AGENT, through the door's own function.
    const agents = createRecordWithReport({ workspaceId: 'default', kind: 'message', title: 'Bounced', data, actor: { type: 'agent', id: 'writer' } })
    expect(agents.keyReminder?.shape).toBe('longRun')
  })
})

describe('an ordinary message that only looks a little like one', () => {
  it('holding a full git commit id, in English and in Chinese, is stored with no reminder', async () => {
    for (const body of [`Main is at ${A_COMMIT_ID} now.`, `主分支在 ${A_COMMIT_ID}，记录是 XqaNTuTUOp6q。`]) await storedWithNoReminder(body)
  })

  it('holding a long record id, a path that ends in one or a list of them, is stored with no reminder', async () => {
    for (const body of [
      'Read record __4iR4FkFAGS before you start.',
      'It is at /api/records/XqaNTuTUOp6q/revisions.',
      'Runs XqaNTuTUOp6q,7rFbOI0bkbsv,CIEmX5lMaXFS are finished.',
      '看 /api/records/XqaNTuTUOp6q 就知道了。',
    ]) {
      await storedWithNoReminder(body)
    }
  })

  it('holding a hyphenated temporary folder has no reminder, and a long random part between hyphens has one', async () => {
    for (const body of ['Output: /tmp/mole-office-sandbox-launcher-AB12cd/logs/out.', '输出在 /tmp/mole-office-sandbox-launcher-AB12cd/logs/out。']) {
      await storedWithNoReminder(body)
    }
    const { status, reply } = await send(`Use deploy-${'Zx81Ka92' + 'Lm03Pq74' + 'Rs65Tu56'}-prod for it.`)
    expect(status, JSON.stringify(reply)).toBe(201)
    expect(reply.keyReminder?.shape).toBe('generatedWord')
  })

  it("holding an agent's run names has no reminder, and a generated word after the same time has one", async () => {
    // WRITTEN SPLIT, as the brief asks: a compact time and the name after it.
    for (const body of [
      `The run is in results/${'20261006T191226Z' + '_prl_v4'}/out.json now.`,
      `Run ${'20261006T190300Z' + '_finished'} is done.`,
      `Run ${'20261006T1810Z' + '_prl_v2'} is the older one.`,
      `运行 ${'20261006T191226Z' + '_prl_v4'} 已经结束。`,
    ]) {
      await storedWithNoReminder(body)
    }
    const { reply } = await send(`Run ${'20261006T191226Z' + '_' + 'Zx81Ka92' + 'Lm03Pq74' + 'Rs65Tu56'} is not a name.`)
    expect(reply.keyReminder?.shape).toBe('generatedWord')
  })
})
