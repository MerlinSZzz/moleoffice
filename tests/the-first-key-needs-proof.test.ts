// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST KEY NEEDS PROOF, AND A NEW-KEY ASK SAYS WHERE IT CAME FROM. Finding 83 (problem
 * zAI2kxjbCrTd; message cqy3Pq89KX4Z), mends a2, b1 and b2.
 *
 * One scratch office on a real loopback listener, so every ask is stamped by the listener as it is in
 * the office. Before the close the file checks that an old agent row that never held a key keeps
 * today's answer. Then the person's key closes the key window, and:
 *
 *   a-race  a keyless registration waits, and its first ask is answered a one-time secret. After the
 *           person admits it, a second keyless caller naming the handle without the secret gets no key
 *           and changes nothing; the holder of the secret collects the key once and writes with it.
 *           (A measurement found the second caller answered the key, 200, and writing with it, 201.)
 *   a-old   an old row that never held a key is answered no key, and told the way is the new-key ask;
 *           that ask then works.
 *   b-race  a keyless new-key ask in a worker's name: the message to its starter is sent by the office,
 *           says the ask proved nobody, and names the address and that it named no session; the ask's
 *           page data carries the same. (A measurement found the message stored as sent by the worker.) The
 *           same ask naming a session is refused and writes nothing: a request with no key may not name
 *           a run at a door to a key (problem TwH5ICyRxLVd, the first condition), so the message
 *           can no longer name one.
 *   b2      the ask's page and its line on the waiting list say when the agent's key was last used:
 *           "not used since it was made" before a keyed call, and the time after one.
 *
 * MUTATIONS (after a green control; each red, then restored):
 *   a-race  skip the secret check in `collectAFirstKey` (src/server/lib/newkey.ts).
 *   a-old   in `collectAFirstKey`, do not return 'ask-for-a-new-key' when the window is closed.
 *   b-race  the message's `sentBy` back to the worker (with `senderIsMoleOffice` off, as it was).
 *   b2      `whenTheKeysOfTheAgentWithThisIdWereUsed` ignores `last_used_at`.
 *
 * THE PICTURES. When FIRST_KEY_SHOTS names a folder, the last case starts its own stack, pairs the
 * browser with the product's own press, and photographs a new-key ask's page and the waiting list at
 * 1440, 990, 660 and 390, light and dark. An ordinary run takes none.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, liveApp, theOfficesOwnId, waitForThePage, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AN_ASK_THAT_PROVED_NOTHING } from '../src/shared/what-an-ask-proved.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a secret>')

const asAgent = (handle: string, key?: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent row for ${handle}`).toBeDefined()
  return row!.id
}

/** How many key rows, live or revoked, an agent has ever held. */
function keyRowsOf(handle: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys WHERE whose_id = ?').get(idOf(handle)) as { n: number }).n
}

/** Start an agent through the door and hand back its key. */
async function start(handle: string, headers: Record<string, string>): Promise<string> {
  const made = await call('POST', '/api/agents/started', headers, { handle, name: `The agent ${handle}` })
  expect(made.status, made.text).toBe(201)
  const key = String((made.json['whatToGiveIt'] as { key?: string }).key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return key
}

/** Make an agent an old row that never held a key: every key row it had is taken away. */
function neverHeldAKey(handle: string): void {
  t.client.sqlite.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(idOf(handle))
  expect(keyRowsOf(handle)).toBe(0)
}

const register = (handle: string, extra: Record<string, unknown> = {}, session?: string): Promise<Reply> =>
  call('POST', '/api/agents/register-myself', asAgent(handle, undefined, session), {
    handle,
    name: `The agent ${handle}`,
    workingDirectory: DIR,
    ...extra,
  })

const keyIn = (reply: Reply): string | null => {
  const headers = reply.json['headers'] as Record<string, string> | undefined
  const key = headers?.['x-mole-office-key']
  return key === undefined ? null : key
}

/** A note written with this key and nothing else, and the status it was answered. */
async function writeWith(key: string): Promise<number> {
  const note = await call('POST', '/api/records', { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }, {
    kind: 'note',
    title: `written with a key ${randomBytes(3).toString('hex')}`,
    data: { body: 'a keyed write' },
  })
  return note.status
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

/** The messages the office holds addressed to one agent, newest last. */
function messagesTo(agentId: string): Record<string, unknown>[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY created_at, id")
    .all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as Record<string, unknown>)
    .filter((data) => Array.isArray(data['to']) && (data['to'] as { id?: string }[]).some((one) => one.id === agentId))
}

async function theAskOnItsPage(requestId: string, headers: Record<string, string>): Promise<{ cameFrom: string; keyLastUsed: string } | undefined> {
  const page = await call('GET', `/api/records/${requestId}`, headers)
  expect(page.status, page.text).toBe(200)
  return page.json['theAsk'] as { cameFrom: string; keyLastUsed: string } | undefined
}

async function theAskOnTheWaitingList(requestId: string): Promise<{ cameFrom: string; keyLastUsed: string } | undefined> {
  const list = await call('GET', '/api/waiting', AS_THE_PERSON)
  expect(list.status, list.text).toBe(200)
  const item = (list.json['items'] as { id: string; theAsk?: { cameFrom: string; keyLastUsed: string } }[]).find((one) => one.id === requestId)
  expect(item, `${requestId} is not on the waiting list`).toBeDefined()
  return item!.theAsk
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('before the close', () => {
  it('an old row that never held a key is answered its key, as before (mend a1 is the owner’s, not this one)', async () => {
    await start('old-while-open', AS_THE_PERSON)
    neverHeldAKey('old-while-open')
    const asked = await register('old-while-open')
    expect(asked.status, asked.text).toBe(200)
    expect(keyIn(asked), 'the old row was answered no key while the window is open').toMatch(/^[0-9a-f]{64}$/)
    expect(String(asked.json['says'])).toContain('the key window is open')
  })
})

describe('after the close', () => {
  beforeAll(async () => {
    // THE AGENT THE CASE ABOVE KEYED BY NAME IS RETIRED FIRST. The close refuses while a live agent
    // holds no proved key, and retiring it is one of the two ways out the
    // refusal names. Nothing below reads it.
    const retired = await call('POST', '/api/participants/agent/old-while-open/retire', AS_THE_PERSON, {
      because: 'its only key was given by name, and the window is about to close',
    })
    if (retired.status !== 200) throw new Error(`retiring old-while-open answered ${String(retired.status)}: ${retired.text}`)
    const closed = await call('POST', '/api/office/key-window/close', AS_THE_PERSON)
    if (closed.status !== 200) throw new Error(`closing the window answered ${String(closed.status)}: ${closed.text}`)
  })

  it('a-race: only the holder of the first ask’s secret collects the admitted agent’s key', async () => {
    const first = await register('waiting-one')
    expect(first.status, first.text).toBe(202)
    expect(keyIn(first)).toBe(null)
    const request = String(first.json['request'])
    const secret = first.json['askSecret']

    // THE PERSON ADMITS IT.
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
    expect(granted.status, granted.text).toBe(201)

    // THE RACE: A SECOND KEYLESS CALLER NAMING THE HANDLE, WITHOUT THE SECRET. Today it was answered
    // the key (200) and wrote with it (201). Now it gets no key, and nothing is written.
    const stranger = await register('waiting-one')
    expect(keyIn(stranger), `a caller without the secret was answered the key: ${stranger.text}`).toBe(null)
    expect(stranger.status, stranger.text).toBe(403)
    expect(String(stranger.json['error'])).toContain('carries no secret')
    expect(keyRowsOf('waiting-one'), 'a refused ask wrote a key').toBe(0)
    const wrong = await register('waiting-one', { askSecret: randomBytes(32).toString('hex') })
    expect(wrong.status, wrong.text).toBe(403)
    expect(keyIn(wrong)).toBe(null)
    expect(String(wrong.json['error'])).toContain('is not the one its first ask was answered with')
    expect(keyRowsOf('waiting-one')).toBe(0)

    // THE PRESS'S NOTE SAYS HOW THE KEY IS COLLECTED.
    expect(String(granted.json['note'])).toContain('one-time secret')

    // THE FIRST ASK WAS ANSWERED THE SECRET, and its holder collects the key once and writes with it.
    expect(typeof secret === 'string' ? secret : '', 'the first ask was answered no one-time secret').toMatch(/^[0-9a-f]{64}$/)
    const holder = await register('waiting-one', { askSecret: secret })
    expect(holder.status, holder.text).toBe(200)
    const key = keyIn(holder)
    expect(key).toMatch(/^[0-9a-f]{64}$/)
    expect(await writeWith(key!)).toBe(201)
    expect(typeof ((dataOf(request)['extra'] as { firstKey?: { keyAnsweredAt?: unknown } }).firstKey?.keyAnsweredAt)).toBe('string')
    // AND ONCE: the same secret again is answered no second key.
    const again = await register('waiting-one', { askSecret: secret })
    expect(again.status, again.text).toBe(200)
    expect(keyIn(again)).toBe(null)
    expect(keyRowsOf('waiting-one')).toBe(1)
  })

  it('a-old: an old row that never held a key is answered no key, and the way is the new-key ask', async () => {
    await start('old-after-close', AS_THE_PERSON)
    neverHeldAKey('old-after-close')

    const asked = await register('old-after-close')
    expect(keyIn(asked), `an old row was answered its first key after the close: ${asked.text}`).toBe(null)
    expect(asked.status, asked.text).toBe(200)
    expect(String(asked.json['says'])).toContain('has never held a key, and the key window is closed')
    expect(String(asked.json['says'])).toContain('"newKey": true')
    expect(keyRowsOf('old-after-close')).toBe(0)

    // THE WAY IT NAMES WORKS: the new-key ask, the person's press, and the ask holding the secret.
    const newKeyAsk = await register('old-after-close', { newKey: true })
    expect(newKeyAsk.status, newKeyAsk.text).toBe(202)
    const secret = String(newKeyAsk.json['askSecret'])
    const request = String(newKeyAsk.json['request'])
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, AS_THE_PERSON, {})
    expect(granted.status, granted.text).toBe(200)
    const collected = await register('old-after-close', { newKey: true, askSecret: secret })
    expect(collected.status, collected.text).toBe(200)
    expect(await writeWith(keyIn(collected)!)).toBe(201)
  })

  let workerAsk = ''
  let starterKey = ''
  let workerKey = ''

  it('b-race: the office tells the starter a keyless ask proved nobody, and where it came from', async () => {
    starterKey = await start('a-starter', AS_THE_PERSON)
    workerKey = await start('its-worker', asAgent('a-starter', starterKey))

    // A KEYLESS ASK AT A DOOR TO A KEY MAY NOT NAME A RUN, and nothing is asked for.
    const naming = await register('its-worker', { newKey: true, doing: 'I lost my key, please grant quickly' }, 'a-session-it-named')
    expect(naming.status, naming.text).toBe(403)
    expect(naming.text).toContain('a-session-it-named')
    expect(messagesTo(idOf('a-starter')).filter((data) => String(data['body']).includes('I lost my key'))).toHaveLength(0)

    const asked = await register('its-worker', { newKey: true, doing: 'I lost my key, please grant quickly' })
    expect(asked.status, asked.text).toBe(202)
    workerAsk = String(asked.json['request'])

    const told = messagesTo(idOf('a-starter')).filter((data) => String(data['body']).includes(workerAsk))
    expect(told).toHaveLength(1)
    const message = told[0]!
    // SENT BY THE OFFICE, not by the worker the ask names. A measurement found sentBy = the worker.
    expect(message['sentBy'], 'the message about the ask is sent as the worker').toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    const body = String(message['body'])
    expect(body).toContain(AN_ASK_THAT_PROVED_NOTHING.carriedNoKey)
    expect(body).toContain('Its connection came from 127.0.0.1')
    expect(body).toContain('stamped it as this computer')
    expect(body).toContain('It named no session.')
    expect(body).toContain('in the caller\'s own words, which nobody checked: "I lost my key, please grant quickly"')

    // THE FACTS ARE ON THE ASK ITSELF, and its page carries them to the starter who answers it.
    const stored = (dataOf(workerAsk)['extra'] as { askedFrom?: Record<string, unknown> }).askedFrom
    expect(stored?.['address']).toBe('127.0.0.1')
    expect(stored?.['arrival']).toBe('this machine')
    expect(stored?.['session']).toBe(null)
    expect(stored?.['provedBy']).toBe(null)
    const shows = await theAskOnItsPage(workerAsk, asAgent('a-starter', starterKey))
    expect(shows?.cameFrom).toContain(AN_ASK_THAT_PROVED_NOTHING.carriedNoKey)
    expect(shows?.cameFrom).toContain('127.0.0.1')
    expect(shows?.cameFrom).toContain('It named no session.')
  })

  it('b2: the ask’s page says when the agent’s key was last used, and says so when it was not', async () => {
    // BEFORE ANY KEYED CALL: the worker's key was made while this server records key use.
    const before = await theAskOnItsPage(workerAsk, asAgent('a-starter', starterKey))
    expect(before?.keyLastUsed).toBe('No key "its-worker" holds now has been used since it was made.')

    // A KEYED CALL WITH THE WORKER'S OWN KEY. The use is written after the reply, so it is waited for.
    expect(await writeWith(workerKey)).toBe(201)
    let after = before
    for (let tries = 0; tries < 50 && !String(after?.keyLastUsed).includes('was last used at'); tries += 1) {
      await new Promise((done) => setTimeout(done, 20))
      after = await theAskOnItsPage(workerAsk, asAgent('a-starter', starterKey))
    }
    expect(after?.keyLastUsed).toMatch(/^A key "its-worker" holds now was last used at \d{4}-\d\d-\d\d \d\d:\d\d:\d\d\./)

    // AND ON THE PERSON'S WAITING LIST: a new-key ask the owner answers, and a registration still waiting.
    const personsOwn = await start('persons-own', AS_THE_PERSON)
    expect(await writeWith(personsOwn)).toBe(201)
    const itsAsk = await register('persons-own', { newKey: true })
    expect(itsAsk.status, itsAsk.text).toBe(202)
    let line = await theAskOnTheWaitingList(String(itsAsk.json['request']))
    for (let tries = 0; tries < 50 && !String(line?.keyLastUsed).includes('was last used at'); tries += 1) {
      await new Promise((done) => setTimeout(done, 20))
      line = await theAskOnTheWaitingList(String(itsAsk.json['request']))
    }
    expect(line?.cameFrom).toContain(AN_ASK_THAT_PROVED_NOTHING.carriedNoKey)
    expect(line?.keyLastUsed).toContain('A key "persons-own" holds now was last used at')

    const stillWaiting = await register('still-waiting')
    expect(stillWaiting.status, stillWaiting.text).toBe(202)
    const waitingLine = await theAskOnTheWaitingList(String(stillWaiting.json['request']))
    expect(waitingLine?.cameFrom).toContain('Its connection came from 127.0.0.1')
    expect(waitingLine?.keyLastUsed).toBe('No live agent is registered as "still-waiting", so no key of it has been used.')
  })
})

/**
 * THE PICTURES: a new-key ask's page and the waiting list, in a stack of its own, at the four widths
 * in both themes. The browser pairs itself with the product's own press, so it reads as the person.
 */
describe('the ask’s page and its line on the waiting list are drawn', () => {
  it.skipIf(!process.env['FIRST_KEY_SHOTS'])(
    'photographs both at 1440, 990, 660 and 390 in both themes',
    async () => {
      const shots = process.env['FIRST_KEY_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({ name: 'first-key-photos', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
      try {
        const personKey = (JSON.parse(readFileSync(join(live.dir, 'keys.json'), 'utf8')) as { person: string }).person
        const post = async (url: string, headers: Record<string, string>, body: unknown): Promise<Record<string, unknown>> => {
          const res = await fetch(`${live.api}${url}`, { method: 'POST', headers, body: JSON.stringify(body) })
          return (await res.json()) as Record<string, unknown>
        }
        const person = { ...AS_THE_PERSON, 'x-mole-office-key': personKey }
        const made = await post('/api/agents/started', person, { handle: 'kept-worker', name: 'The kept worker' })
        const key = String((made['whatToGiveIt'] as { key: string }).key)
        await post('/api/records', { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }, {
          kind: 'note',
          title: 'a keyed write',
          data: { body: 'so the key has a recorded use' },
        })
        const asked = await post('/api/agents/register-myself', asAgent('kept-worker'), {
          handle: 'kept-worker',
          name: 'The kept worker',
          workingDirectory: live.dir,
          newKey: true,
        })
        const request = String(asked['request'])
        await post('/api/agents/register-myself', asAgent('a-new-arrival'), {
          handle: 'a-new-arrival',
          name: 'A new arrival',
          workingDirectory: live.dir,
        })

        await live.page.goto(`${live.site}/#/pairing`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.getByRole('button', { name: 'Pair this browser' }).click()
        await live.page.waitForTimeout(1000)

        const pictures: [string, string][] = [
          [`${live.site}/#/r/${request}`, 'first-key-ask-page'],
          [`${live.site}/#/governance`, 'first-key-waiting-list'],
        ]
        for (const [address, name] of pictures) {
          await live.page.goto(address, { timeout: 60_000 })
          await waitForThePage(live.page, 60_000)
          await live.page.waitForSelector('.tc-asked', { timeout: 30_000 })
          const drawn = await live.page.locator('.tc-asked').first().innerText()
          expect(drawn).toContain(AN_ASK_THAT_PROVED_NOTHING.carriedNoKey)
          for (const width of [1440, 990, 660, 390]) {
            for (const theme of ['light', 'dark'] as const) {
              await live.page.setViewportSize({ width, height: 1000 })
              await live.page.emulateMedia({ colorScheme: theme })
              await live.page.waitForTimeout(150)
              await live.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
            }
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})
