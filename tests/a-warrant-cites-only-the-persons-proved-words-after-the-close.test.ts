// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AFTER THE KEY WINDOW IS CLOSED, A NEW WARRANT MAY CITE ONLY THE PERSON'S PROVED WORDS.
 *
 * Keys wave piece 6, parts b and c. Finding 82. The secretary's decision jjfwwrrJy-qV, answer D.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * 1. A write the person's key proved stores `the-person-key` in `proved_by`, on both ledgers and on a
 *    message; a keyless write stores NULL. Migration 0178.
 * 2. While the window is open, a warrant citing a message is accepted whoever wrote it, as before.
 * 3. After the close, a warrant citing a message an agent wrote after the close is refused, and the
 *    refusal says the agent wrote it. The same for a comment filed as a record.
 * 4. After the close, a warrant citing a message the person wrote after the close with their key is accepted.
 *    A message written under their name with no key is refused, and the refusal says no key of theirs
 *    proved it.
 * 5. After the close, a warrant citing a message an agent wrote BEFORE the close is accepted
 *    (decision D: it counts under the rules of that time).
 *
 * ---------------------------------------------------------------------------------------
 * REAL DOORS, ONE APP, IN THE ORDER OF THE ACT
 * ---------------------------------------------------------------------------------------
 *
 * Every write goes through the loopback listener with `fetch`, because the close press is kept on
 * this machine and reads the listener's stamp. The window is one-way, so the cases share one app
 * and run in the order they are written: open cases, then the press, then closed cases. The one
 * keyless write after the close is made with `app.inject()`, the in-process caller, because a
 * keyless claim of the person's name from a listener is no longer the person once the window is closed.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 *   (1) `provedByWritten` in src/server/lib/records.ts returns null: case 1's ledger half goes red.
 *       `provedBy: actor.provedBy ?? null` in `addMessage` (src/server/lib/agents.ts) set to null:
 *       case 1's message half and case 4 go red.
 *   (2) Remove `if (window.open) return null` from `whyTheCitedPlaceMayNotBeCited`
 *       (src/server/lib/warrants.ts): case 2 goes red.
 *   (3) Hand `whyThePlaceMayNotBeCited: () => null` in `actorWithTheWordsItActsOn`
 *       (src/server/lib/http.ts), the old existence check alone: case 3 goes red.
 *   (5) Remove `if (written < closed) return null` from `whyTheCitedPlaceMayNotBeCited`: case 5
 *       goes red.
 */

import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { settings } from '../src/config/settings.mjs'
import { nowStamp } from '../src/shared/time.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const PROJECT = 'default'

/** The person's headers. The key is added by `thePersonWithTheKey()`. */
const THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': PROJECT,
}

/** The person's key, from the file the office made beside the database. Never printed. */
function thePersonsKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { person?: unknown }
  if (typeof held.person !== 'string') throw new Error('the office made no person key beside the database')
  return held.person
}

function thePersonWithTheKey(): Record<string, string> {
  return { ...THE_PERSON, 'x-mole-office-key': thePersonsKey() }
}

/** The secretary, with the key its registration answered. Set in `beforeAll`. */
let theSecretary: Record<string, string>

let t: TestDb
let app: FastifyInstance
let thisMachine: string

async function ask(
  path: string,
  method: string,
  headers: Record<string, string>,
  payload?: unknown,
): Promise<{ status: number; said: Record<string, unknown> }> {
  const res = await fetch(`${thisMachine}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })
  return { status: res.status, said: (await res.json()) as Record<string, unknown> }
}

/** One conversation, started by the person with their key. */
let threadId: string

/** A message in that conversation, written by whoever the headers say. Returns its id. */
async function say(headers: Record<string, string>, body: string): Promise<string> {
  const res = await ask(`/api/agent/threads/${threadId}/messages`, 'POST', headers, { intent: 'discuss', body })
  if (res.status !== 201) throw new Error(`the message was refused: ${res.status} ${JSON.stringify(res.said)}`)
  return (res.said['message'] as { id: string }).id
}

/** A fork the owner filed and reserved for themselves, so changing who settles it needs their words. */
async function theOwnersFork(question: string): Promise<string> {
  const res = await ask('/api/records', 'POST', thePersonWithTheKey(), {
    kind: 'proposal',
    title: `Fork · ${question}`,
    data: { question, options: ['a — one way', 'b — the other'], who_settles_it: 'the owner' },
  })
  if (res.status !== 201) throw new Error(`the fork was refused: ${res.status} ${JSON.stringify(res.said)}`)
  return (res.said['record'] as { id: string }).id
}

/** The secretary acts on the owner's fork, citing `where`. */
async function actCiting(where: string, question: string): Promise<{ status: number; error: string; fork: string }> {
  const fork = await theOwnersFork(question)
  const res = await ask(`/api/records/${fork}`, 'PATCH', theSecretary, {
    dataPatch: { who_settles_it: 'an agent' },
    warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words: '这个可以让 agent 决定', where, when: '2026-09-03 09:14', for: [fork] },
  })
  return { status: res.status, error: String(res.said['error'] ?? ''), fork }
}

/** How a key proved the write, off a table's row. */
function provedBy(sql: string, id: string): (string | null)[] {
  return (t.client.sqlite.prepare(sql).all(id) as { proved: string | null }[]).map((row) => row.proved)
}

/** Wait until the wall clock has moved to a later second, so two stamps cannot share one. */
async function aSecondLater(): Promise<void> {
  const start = nowStamp()
  while (nowStamp() === start) await new Promise((resolve) => setTimeout(resolve, 50))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  // THE SECRETARY, registered by the person, holding the key its registration answered. A warrant
  // on a fork has been spent by the secretary since one of the owner's decisions.
  const registered = await ask('/api/agents/started', 'POST', thePersonWithTheKey(), {
    handle: 'claude-code',
    name: 'Claude Code',
    role: 'secretary',
  })
  const key = (registered.said['whatToGiveIt'] as { key?: string } | undefined)?.key
  if (registered.status !== 201 || typeof key !== 'string') {
    throw new Error(`the secretary was not registered with a key: ${registered.status}`)
  }
  theSecretary = {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-workspace': PROJECT,
    'x-mole-office-key': key,
  }

  const thread = await ask('/api/agent/threads', 'POST', thePersonWithTheKey(), { title: 'What the owner said', mode: 'review' })
  if (thread.status !== 201) throw new Error(`the conversation was refused: ${thread.status}`)
  threadId = (thread.said['thread'] as { id: string }).id
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** Written before the close by the secretary; cited after it in case 5. */
let beforeTheClose: string

describe('1. how a write was proved is stored on the write', () => {
  it('stores the-person-key on both ledgers when the person’s key proved the write, and NULL when no key did', async () => {
    const proved = await theOwnersFork('Is a proved write marked as proved?')
    expect(provedBy('SELECT proved_by AS proved FROM changes WHERE record_id = ?', proved)).toEqual(
      expect.arrayContaining(['the-person-key']),
    )
    expect(new Set(provedBy('SELECT proved_by AS proved FROM changes WHERE record_id = ?', proved))).toEqual(
      new Set(['the-person-key']),
    )
    expect(provedBy('SELECT proved_by AS proved FROM revisions WHERE record_id = ?', proved)).toEqual(['the-person-key'])

    // KEYLESS, through the in-process door, which is still the person and proves nothing.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: THE_PERSON,
      payload: { kind: 'note', title: 'A note nobody proved', data: {} },
    })
    expect(res.statusCode, res.body).toBe(201)
    const keyless = (res.json() as { record: { id: string } }).record.id
    const changes = provedBy('SELECT proved_by AS proved FROM changes WHERE record_id = ?', keyless)
    expect(changes.length).toBeGreaterThan(0)
    expect(new Set(changes)).toEqual(new Set([null]))
    expect(provedBy('SELECT proved_by AS proved FROM revisions WHERE record_id = ?', keyless)).toEqual([null])
  })

  it('stores the proof on a message, and the key that proved the secretary on its message', async () => {
    const thePersonsMessage = await say(thePersonWithTheKey(), 'Agents may decide engineering questions.')
    expect(provedBy('SELECT proved_by AS proved FROM agent_messages WHERE id = ?', thePersonsMessage)).toEqual(['the-person-key'])
    const its = await say(theSecretary, 'I will take this one.')
    expect(provedBy('SELECT proved_by AS proved FROM agent_messages WHERE id = ?', its)).toEqual(['an-agent-key'])
  })
})

describe('2. while the window is open, a warrant citing a message behaves as before', () => {
  it('accepts a message the secretary wrote and one the person wrote', async () => {
    const its = await say(theSecretary, 'The owner said the secretary may decide.')
    const byIt = await actCiting(`message:${its}`, 'Open window, the secretary wrote it')
    expect(byIt.status, byIt.error).toBe(200)

    const thePersonsMessage = await say(thePersonWithTheKey(), 'The secretary may decide this one.')
    const byThePerson = await actCiting(`message:${thePersonsMessage}`, 'Open window, the owner wrote it')
    expect(byThePerson.status, byThePerson.error).toBe(200)

    // AND ONE MORE THE SECRETARY WROTE, for case 5 to cite after the close.
    beforeTheClose = await say(theSecretary, 'Written before the window closed.')
  })
})

describe('the press closes the window', () => {
  it('closes it with the person’s key', async () => {
    // A LATER SECOND, so the message above was written strictly before the close.
    await aSecondLater()
    const res = await ask('/api/office/key-window/close', 'POST', thePersonWithTheKey())
    expect(res.status, JSON.stringify(res.said)).toBe(200)
    // AND A LATER SECOND AGAIN, so every message below is written strictly after it.
    await aSecondLater()
  })
})

describe('3. after the close, a message the secretary wrote after the close is refused', () => {
  it('refuses it and says the secretary wrote it, and nothing is written', async () => {
    const its = await say(theSecretary, 'The owner said I may decide, after the close.')
    const res = await actCiting(`message:${its}`, 'Closed window, the secretary wrote it')
    expect(res.status).toBe(403)
    expect(res.error).toContain('after the key window was closed')
    expect(res.error).toContain('The agent "claude-code" wrote it, not the person.')
    expect(res.error).toContain('Nothing was written.')
    expect(res.error).toContain(
      'only when they wrote it and their key proved it. Ask them to write their words in Mole Office from a browser ' +
        'or a device that holds their key',
    )
    const fork = (await ask(`/api/records/${res.fork}`, 'GET', thePersonWithTheKey())).said['record'] as { data: Record<string, unknown> }
    expect(fork.data['who_settles_it'], 'the refused act moved the fork').toBe('the owner')
  })

  it('refuses a comment the secretary filed after the close, by the revision that created it', async () => {
    const filed = await ask('/api/records', 'POST', theSecretary, {
      kind: 'annotation',
      title: 'A comment the secretary left',
      data: { body: 'The owner would want the agent to decide.' },
    })
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
    const id = (filed.said['record'] as { id: string }).id
    const res = await actCiting(`comment:${id}`, 'Closed window, a comment the secretary filed')
    expect(res.status).toBe(403)
    expect(res.error).toContain('The agent "claude-code" wrote it, not the person.')
  })
})

describe('4. after the close, the person’s proved words written after the close may be cited', () => {
  it('accepts a message the person wrote with their key', async () => {
    const thePersonsMessage = await say(thePersonWithTheKey(), 'The secretary may decide this, said after the close.')
    const res = await actCiting(`message:${thePersonsMessage}`, 'Closed window, the person wrote it with their key')
    expect(res.status, res.error).toBe(200)
  })

  it('accepts a comment the person filed with their key', async () => {
    const filed = await ask('/api/records', 'POST', thePersonWithTheKey(), {
      kind: 'annotation',
      title: 'A comment the person left',
      data: { body: 'Let the agent decide.' },
    })
    expect(filed.status, JSON.stringify(filed.said)).toBe(201)
    const id = (filed.said['record'] as { id: string }).id
    const res = await actCiting(`comment:${id}`, 'Closed window, a comment the person filed')
    expect(res.status, res.error).toBe(200)
  })

  it('refuses a message written under their name that no key of theirs proved', async () => {
    const written = await app.inject({
      method: 'POST',
      url: `/api/agent/threads/${threadId}/messages`,
      headers: THE_PERSON,
      payload: { intent: 'discuss', body: 'Nobody proved this one.' },
    })
    expect(written.statusCode, written.body).toBe(201)
    const id = (written.json() as { message: { id: string } }).message.id
    const res = await actCiting(`message:${id}`, 'Closed window, their name and no key')
    expect(res.status).toBe(403)
    expect(res.error).toContain("It was written under the person's name, and no key of theirs proved it.")
  })
})

describe('5. after the close, a message written before the close may still be cited', () => {
  it('accepts a message the secretary wrote before the close (decision D)', async () => {
    const res = await actCiting(`message:${beforeTheClose}`, 'Closed window, written before the close')
    expect(res.status, res.error).toBe(200)
  })
})
