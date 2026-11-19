// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The close keeps counting an agent registered with no key of its own, and names retirement as its lasting way out.
 * A real listener in a throwaway office exercises the reading and the press. The run-key case records the existing
 * count rule: an office-minted live run key proves the agent, and revoking it makes the agent count again.
 *
 * The cases cover no marks, all marks, mixed lists, and marks beyond the twenty names. Each mutation is run alone
 * after a green control: skipping marked agents, restoring their refused key paths, mislabelling unmarked agents,
 * addressing the old advice to a whole mixed list, and answering every mark as false.
 * CLOSE_MARKED_SHOTS optionally photographs the actual Settings refusal in another throwaway office.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheLiveAgentsWithNoProvedKey } from '../src/shared/keywindow.ts'

let t: TestDb
let app: FastifyInstance
let here = ''
let starterKey = ''
const created: string[] = []
const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const headers = (kind: string, id: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': kind,
  'x-mole-office-actor-id': id,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const PERSON = headers('human', THE_PERSON, PERSON_KEY)
const NAME_ONLY = headers('human', THE_PERSON)
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a key>')

async function call(method: string, path: string, as = PERSON, body?: unknown) {
  const reply = await fetch(`${here}${path}`, { method, headers: as, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  return { status: reply.status, text: hidden(text), json: JSON.parse(text) as Record<string, unknown> }
}

const KEY_PATH = "a key through a proved path: the person's press on its new-key ask, or a re-key by the agent " +
  'that started it, sending its own proved key. Or retire it.'
const markedWords = (handle: string): string =>
  `"${handle}" was registered with no key of its own, so only retiring it clears it for good.`
const name = (handle: string, marked: boolean): string =>
  `"${handle}" (${marked ? 'never held a key' : 'its keys were given to a request that carried no key'})`

async function make(handle: string, marked: boolean): Promise<void> {
  const reply = await call('POST', '/api/agents/started', marked ? headers('agent', 'close-starter', starterKey) : NAME_ONLY,
    { handle, name: handle, ...(marked ? { noKey: true } : {}) })
  expect(reply.status, reply.text).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }
  created.push(row.id)
}

async function refusal(): Promise<TheLiveAgentsWithNoProvedKey> {
  const read = await call('GET', '/api/office/key-window')
  expect(read.status, read.text).toBe(200)
  expect(read.json['open']).toBe(true)
  const why = read.json['closeIsRefusedBecause'] as TheLiveAgentsWithNoProvedKey
  expect(why).not.toBeNull()
  const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get()
  const press = await call('POST', '/api/office/key-window/close', PERSON, {})
  expect(press.status, press.text).toBe(409)
  expect(press.json['error']).toBe(`${why.says} Nothing was changed.`)
  expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get()).toEqual(before)
  return why
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const starter = await call('POST', '/api/agents/started', PERSON, { handle: 'close-starter', name: 'Close starter' })
  expect(starter.status, starter.text).toBe(201)
  starterKey = String((starter.json['whatToGiveIt'] as { key: string }).key)
}, 60_000)

beforeEach(() => {
  for (const id of created.splice(0)) t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(id)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the close names only paths the office accepts', () => {
  it('counts a marked agent before its run, skips it with an office-minted live run key, and counts it after revocation', async () => {
    await make('run-worker', true)
    expect((await refusal()).agents.map(a => a.handle)).toEqual(['run-worker'])
    const run = await call('POST', '/api/records', headers('agent', 'mole-office', OFFICE_KEY), {
      kind: 'session', title: 'The marked worker has a live run',
      data: { state: 'running', runtime: 'claude-code', servingAgentId: created[0], servingAgent: 'run-worker', startedByMoleOffice: true },
    })
    expect(run.status, run.text).toBe(201)
    expect(typeof (run.json['runKey'] as { key: unknown } | undefined)?.key).toBe('string')
    const key = t.client.sqlite.prepare('SELECT mint_proved_by, revoked_at FROM held_keys WHERE whose_id = ?').get(created[0])
    expect(key).toEqual({ mint_proved_by: 'the-offices-key', revoked_at: null })
    const live = await call('GET', '/api/office/key-window')
    expect(live.json['closeIsRefusedBecause']).toBeNull()
    const id = String((run.json['record'] as { id: string }).id)
    const ended = await call('PATCH', `/api/records/${id}`, headers('agent', 'mole-office', OFFICE_KEY), { dataPatch: { state: 'crashed' } })
    expect(ended.status, ended.text).toBe(200)
    expect(t.client.sqlite.prepare('SELECT revoked_at FROM held_keys WHERE whose_id = ?').get(created[0])).toEqual({ revoked_at: expect.any(String) })
    const again = await refusal()
    expect(again.count).toBe(1)
    expect(again.agents[0]?.why).toBe('every-key-revoked')
    expect(again.says).toContain('"run-worker" (every key it held is revoked)')
  })

  it('keeps counting a marked agent without a run key and names only retirement', async () => {
    await make('marked-alone', true)
    const why = await refusal()
    expect(why.count).toBe(1)
    expect(why.says).toBe(`The window cannot be closed yet: 1 live agent holds no proved key. It is ${name('marked-alone', true)}. ${markedWords('marked-alone')}`)
    expect(why.says).not.toMatch(/new-key ask|re-key|proved path/)
    expect(why.agents).toEqual([{ id: created[0], handle: 'marked-alone', why: 'never-held-a-key', registeredWithNoKeyOfItsOwn: true }])
  })

  it('keeps the entire old sentence byte for byte for one unmarked agent', async () => {
    await make('unmarked-alone', false)
    const why = await refusal()
    expect(why.says).toBe(`The window cannot be closed yet: 1 live agent holds no proved key. It is ${name('unmarked-alone', false)}. Give it ${KEY_PATH}`)
    expect(why.agents).toEqual([{ id: created[0], handle: 'unmarked-alone', why: 'only-keys-given-without-a-key', registeredWithNoKeyOfItsOwn: false }])
  })

  it('keeps the old words byte for byte for two unmarked agents', async () => {
    await make('pair-a', false)
    await make('pair-b', false)
    const why = await refusal()
    expect(why.says).toBe(`The window cannot be closed yet: 2 live agents hold no proved key. They are ${name('pair-a', false)}, ${name('pair-b', false)}. Give each one ${KEY_PATH}`)
    expect(why.agents.map(a => a.registeredWithNoKeyOfItsOwn)).toEqual([false, false])
  })

  it('gives the other one the key advice in a mixed list and answers both marks', async () => {
    await make('a-marked', true)
    await make('b-unmarked', false)
    const why = await refusal()
    expect(why.count).toBe(2)
    expect(why.says).toBe(`The window cannot be closed yet: 2 live agents hold no proved key. They are ${name('a-marked', true)}, ${name('b-unmarked', false)}. ${markedWords('a-marked')} Give the other one ${KEY_PATH}`)
    expect(why.agents.map(a => a.registeredWithNoKeyOfItsOwn)).toEqual([true, false])
  })

  it('counts every unmarked agent in mixed advice, and every marked agent gets its own sentence', async () => {
    for (const [handle, marked] of [['many-a-marked', true], ['many-b-marked', true], ['many-c-unmarked', false], ['many-d-unmarked', false]] as const) await make(handle, marked)
    const why = await refusal()
    expect(why.count).toBe(4)
    expect(why.says.endsWith(`${markedWords('many-a-marked')} ${markedWords('many-b-marked')} Give each of the other 2 ${KEY_PATH}`)).toBe(true)
  })

  it('says no key path when every named agent is marked', async () => {
    await make('both-a-marked', true)
    await make('both-b-marked', true)
    const why = await refusal()
    expect(why.count).toBe(2)
    expect(why.says).toBe(`The window cannot be closed yet: 2 live agents hold no proved key. They are ${name('both-a-marked', true)}, ${name('both-b-marked', true)}. ${markedWords('both-a-marked')} ${markedWords('both-b-marked')}`)
    expect(why.says).not.toMatch(/new-key ask|re-key|Give/)
  })

  it('keeps the old plural words, including beyond twenty names, when nobody is marked', async () => {
    for (let i = 0; i < 21; i++) await make(`ordinary-${String(i).padStart(2, '0')}`, false)
    const why = await refusal()
    const names = Array.from({ length: 20 }, (_, i) => name(`ordinary-${String(i).padStart(2, '0')}`, false)).join(', ')
    expect(why.says).toBe(`The window cannot be closed yet: 21 live agents hold no proved key. The first 20 are ${names}, and 1 more. Give each one ${KEY_PATH}`)
    expect(why.agents).toHaveLength(21)
  })

  it('counts one unnamed marked agent with singular words and confines advice to the twenty others', async () => {
    for (let i = 0; i < 20; i++) await make(`a-${String(i).padStart(2, '0')}`, false)
    await make('z-marked', true)
    const why = await refusal()
    expect(why.count).toBe(21)
    expect(why.says).not.toContain('"z-marked"')
    expect(why.says.endsWith(`1 of the 1 not named was registered with no key of its own, so only retiring it clears it for good. Give each of the other 20 ${KEY_PATH}`)).toBe(true)
    expect(why.agents[20]).toMatchObject({ handle: 'z-marked', registeredWithNoKeyOfItsOwn: true })
  })

  it('counts unnamed marked agents separately from the whole unnamed group', async () => {
    for (let i = 0; i < 22; i++) await make(`marked-${String(i).padStart(2, '0')}`, true)
    await make('z-unmarked', false)
    const why = await refusal()
    expect(why.count).toBe(23)
    expect(why.says).toContain('and 3 more. ')
    expect(why.says.match(/was registered with no key of its own/g)).toHaveLength(20)
    expect(why.says.endsWith(`2 of the 3 not named were registered with no key of their own, so only retiring them clears them for good. Give the other one ${KEY_PATH}`)).toBe(true)
  })

  it('omits the key paths when all twenty-two counted agents are marked', async () => {
    for (let i = 0; i < 22; i++) await make(`all-marked-${String(i).padStart(2, '0')}`, true)
    const why = await refusal()
    expect(why.count).toBe(22)
    expect(why.says.endsWith('2 of the 2 not named were registered with no key of their own, so only retiring them clears them for good.')).toBe(true)
    expect(why.says).not.toMatch(/new-key ask|re-key|Give/)
  })
})

