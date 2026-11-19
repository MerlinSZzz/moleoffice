// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN AN AGENT STARTS OR STOPS ANSWERING, THE OPEN PAGES ARE TOLD, wave 13w round 26.
 *
 * `answering.changed` (src/shared/events.ts) is announced by src/server/lib/answering-told.ts when how an agent is
 * answered, the session that answers, or whether the office could not tell, changed in a project a person's page
 * watches. The chat reads the open conversation on it, where it read every thirty seconds before. This file opens a
 * person's page on the server's channel and proves each case:
 *
 *   1. A hold taken through the hold door is announced, and the event says what the conversation door says.
 *   2. The hold let go through the release door is announced.
 *   3. A run's session record filed with a wait is announced, and its wait moved into the past through the records
 *      door is announced.
 *   4. A change no write announced (the wait moved by a write that bypasses the doors, as time alone would end it) is
 *      announced by the once-a-minute look.
 *   5. A look that finds nothing changed announces nothing, and a write to a run's record that changes no part of the
 *      answering (its doing line) announces nothing.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL green; a MUTATION of one line red;
 * RESTORE green, checked with cmp against a saved copy.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AnsweringChanged, EventOnTheWire } from '../src/shared/events.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb } from './helpers.ts'

const HERE = 'default'
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
let told: typeof import('../src/server/lib/answering-told.ts')
let heard: EventOnTheWire[] = []
let agent = ''
const transcripts = mkdtempSync(join(tmpdir(), 'mole-office-told-'))

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method, url, headers: OWNER, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  if (method === 'POST' && url === '/api/records' && theAnswerToAWriteInATestOffice(OWNER, body) === 409) expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBe(409)
  else expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as Record<string, unknown>
}

/** The `answering.changed` events a person's page was sent while `write` ran. */
async function toldWhile(write: () => Promise<unknown> | unknown): Promise<AnsweringChanged[]> {
  heard = []
  await write()
  return heard.map((one) => one.event).filter((one): one is AnsweringChanged => one.name === 'answering.changed')
}

/** What the conversation door says of the agent now: the two parts the event carries. */
async function whatTheDoorSays(): Promise<{ how: string; couldNotTell: boolean }> {
  const reply = await call('GET', `/api/messages/conversation?kind=agent&id=${agent}`)
  return { how: (reply['answering'] as { how: string }).how, couldNotTell: reply['couldNotTell'] as boolean }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  told = await import('../src/server/lib/answering-told.ts')
  await call('POST', '/api/records', { kind: 'agent', title: 'Told Of Answering', data: { handle: 'told-of-answering', state: 'active', runtime: 'claude-code' } })
  const listed = (await call('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  agent = (listed.agents ?? []).find((one) => one.handle === 'told-of-answering')?.id ?? ''
  expect(agent).not.toBe('')
  // A PERSON'S PAGE, and the first look the stream door takes when it opens one.
  const events = await import('../src/server/lib/events.ts')
  events.pageOpened({ workspaceId: HERE, who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })
  told.forgetWhatPagesWereToldOfAnswering()
  expect(told.answeringLookNow([])).toEqual([])
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(transcripts, { recursive: true, force: true })
})

describe('answering.changed', () => {
  let session = ''

  it('is announced when a hold is taken, and says what the conversation door says', async () => {
    // A SESSION THAT IS ANSWERING: a transcript just written, and a live process (this test's own), as
    // tests/a-live-session-holds-its-handle.test.ts makes one. Without them the door says nobody answers.
    const logPath = join(transcripts, 'made-up.jsonl')
    writeFileSync(logPath, `${JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'made-up' }] } })}\n`)
    const discovered = { tool: 'claude-code', externalId: 'told-session-1', logPath, resumeCommand: null, startedAt: null, entryPoint: null }
    const filed = await call('POST', '/api/records', { kind: 'session', title: 'A made-up terminal session', data: { state: 'running', runtime: 'claude-code', doing: 'made-up', extra: { discovered } } })
    session = (filed['record'] as { id: string }).id
    const resources = await import('../src/server/lib/resources.ts')
    resources.registerResource({ workspaceId: HERE, sessionRecordId: session, type: 'process', key: String(process.pid), actor: { type: 'human', id: THE_PERSON } })
    const sent = await toldWhile(() => call('POST', '/api/handles/told-of-answering/hold', { session, machine: 'a-machine', runtime: 'claude-code' }))
    expect(sent.map((one) => [one.who.id, one.workspaceId])).toEqual([[agent, HERE]])
    const door = await whatTheDoorSays()
    expect({ how: sent[0]?.how, couldNotTell: sent[0]?.couldNotTell }).toEqual(door)
    expect(door.how === 'nobody' && !door.couldNotTell, 'the hold changed nothing the door draws').toBe(false)
  })

  it('is announced when the hold is let go', async () => {
    const sent = await toldWhile(() => call('POST', '/api/handles/told-of-answering/release', { session, because: 'The made-up session ended.' }))
    expect(sent.map((one) => [one.who.id, one.how, one.couldNotTell])).toEqual([[agent, 'nobody', false]])
  })

  let run = ''

  it('is announced when a run is filed waiting, and when its wait is moved into the past', async () => {
    const message = await call('POST', '/api/records', { kind: 'message', title: 'A made-up line', data: { body: 'A made-up line.', to: [{ kind: 'agent', id: agent }] } })
    const filedWaiting = await toldWhile(async () => {
      const filed = await call('POST', '/api/records', {
        kind: 'session',
        title: 'A made-up run that answered',
        data: {
          state: 'running',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: agent,
          deliveringMessage: (message['record'] as { id: string }).id,
          providerSession: '6f1c1d2e-0000-4000-8000-000000000002',
          waitsUntil: localStamp(new Date(Date.now() + 10 * 60_000)),
        },
      })
      run = (filed['record'] as { id: string }).id
    })
    expect(filedWaiting.map((one) => [one.who.id, one.how])).toEqual([[agent, 'a waiting run']])
    const ended = await toldWhile(() => call('PATCH', `/api/records/${run}`, { dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) } }))
    expect(ended.map((one) => [one.who.id, one.how])).toEqual([[agent, (await whatTheDoorSays()).how]])
    expect(ended[0]?.how).not.toBe('a waiting run')
  })

  it('is announced by the look when no write said so', async () => {
    // THE WAIT GIVEN BACK BY A WRITE THAT BYPASSES THE DOORS, so no write announces it, as time alone announces nothing.
    const data = JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }).data) as Record<string, unknown>
    data['waitsUntil'] = localStamp(new Date(Date.now() + 10 * 60_000))
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), run)
    expect(await toldWhile(() => undefined)).toEqual([])
    const sent = await toldWhile(() => told.answeringLookNow('every agent'))
    expect(sent.map((one) => [one.who.id, one.how])).toEqual([[agent, 'a waiting run']])
  })

  it('is not announced when nothing it carries changed', async () => {
    expect(await toldWhile(() => told.answeringLookNow('every agent'))).toEqual([])
    expect(await toldWhile(() => call('PATCH', `/api/records/${run}`, { dataPatch: { doing: 'A made-up doing line.' } }))).toEqual([])
  })
})
