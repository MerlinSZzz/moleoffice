// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN WRITTEN WORDS ON A CHECKLIST ITEM (wave 14a round 1).
 *
 * A message names both cases an item of the special style stands for: evidence, or a passage written by
 * the owner. Then 6lZcXRq1gfPk (forwarded whole by the supervisor in 84WQhGoFug6s)
 * settles it: on the owner's own item the picker takes their words, saved as an optional response string on the
 * item through the existing item PATCH, as the checklist owner's own write, with ifVersion, and with the owner's
 * done press. The office's existing notice to the item's agent carries the words whole.
 *
 * WHAT IS PROVED, each by chapter 5's three runs:
 *   1. The words ride the press that marks the item done and need the version the checklist read: a press carrying
 *      them without ifVersion is refused checklistOwnWordsNeedTheVersion and writes nothing.
 *   2. Only the checklist's own owner writes them: another agent, an agent marking the item done on the person's
 *      words, and a secretary under the person's raise are each refused checklistOwnWordsNotTheOwner, writing nothing.
 *   3. The words are kept EXACTLY as written — leading and trailing whitespace, line breaks and quotes — and read
 *      back whole; a blank one is refused.
 *   4. The words are not evidence: an agent owner's "done" carrying them with no evidence is still refused.
 *   5. The same notice carries them whole and no other line is written.
 *
 * WHAT IS REAL: a scratch office with a real listener, the key window closed with the person's key, as the live
 * office's is, so the person is proved by a key and an agent is not the person. Every agent, checklist, message and
 * key here is made up. Chapter 8 rule 3: the person is acted as only inside this throwaway office.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { validateShape } from '../src/shared/kinds.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const AS_THE_PERSON = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }
const SECRETARY = `${THE_TEST_OFFICES_SECRETARY.handle}-vale`

let t: TestDb
let app: FastifyInstance
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : JSON.stringify(read) }
}

function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

const agent = (handle: string): { kind: string; id: string } => ({ kind: 'agent', id: ids.get(handle) ?? '' })

async function versionOf(list: string): Promise<string> {
  const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
  expect(read.status, read.error).toBe(200)
  return read.body['checklist'].version as string
}

async function anItem(list: string, by: Record<string, string>, body: Record<string, unknown>): Promise<string> {
  const added = await ask('POST', `/api/checklists/${list}/items`, by, body)
  expect(added.status, added.error).toBe(201)
  return added.body['item'].id as string
}

async function itemOf(list: string, item: string): Promise<Record<string, any>> {
  const read = await ask('GET', `/api/checklists/${list}`, AS_THE_PERSON)
  expect(read.status, read.error).toBe(200)
  const found = (read.body['checklist'].items as Record<string, any>[]).find((one) => one.id === item)
  if (found === undefined) throw new Error(`the checklist has no item ${item}`)
  return found
}

/** The lines Mole Office wrote, newest last, as stored. */
function officeLines(): { id: string; to: { kind: string; id: string }[]; notice?: string; saidInFull?: string; body: string; aboutMessage?: string }[] {
  return (
    t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) ORDER BY rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, ...(JSON.parse(row.data) as Record<string, any>) })) as never
}

/** A message the person sends to one agent, through the ordinary door, with the person's key. */
async function thePersonSays(handle: string, body: string): Promise<string> {
  const sent = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'message', title: body, data: { body, to: [agent(handle)] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.status, sent.error).toBe(409)
  return sent.body['record'].id as string
}

let kiln = ''
let own = ''

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [
    ['lark', 'Lark', 'worker'],
    ['quill', 'Quill', 'worker'],
    ['gauge', 'Gauge', 'worker'],
    [SECRETARY, `${THE_TEST_OFFICES_SECRETARY.name} Vale`, 'secretary'],
  ] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
  const closed = await ask('POST', '/api/office/key-window/close', AS_THE_PERSON)
  expect(closed.status, closed.error).toBe(200)
  const made = await ask('POST', '/api/checklists', AS_THE_PERSON, { title: 'Kiln checklist' })
  expect(made.status, made.error).toBe(201)
  kiln = made.body['checklist'].id as string
  // AN AGENT'S OWN CHECKLIST, so the owner check is asked of an agent owner too.
  const theirs = await ask('POST', '/api/checklists', as('lark'), { title: "Lark's bench" })
  expect(theirs.status, theirs.error).toBe(201)
  own = theirs.body['checklist'].id as string
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("the owner's own written words on a checklist item", () => {
  it('1. the words ride the done press and need the version the checklist read: without ifVersion, nothing is written', async () => {
    const item = await anItem(kiln, as('lark'), { words: 'Paint the kiln door' })
    const before = await versionOf(kiln)
    const noVersion = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, AS_THE_PERSON, { state: 'done', response: 'Painted on Tuesday.' })
    expect(noVersion.status, noVersion.error).toBe(400)
    expect(noVersion.body['code']).toBe('checklistOwnWordsNeedTheVersion')
    expect(await versionOf(kiln), 'a refused press writes nothing and moves no version').toBe(before)
    expect((await itemOf(kiln, item)).response, 'nothing was stored').toBeUndefined()
  })

  it("2. only the checklist's own owner writes them: another agent, the person's words, and a raise are all refused", async () => {
    const item = await anItem(kiln, as('lark'), { words: 'Paint the second door', tell: ['gauge'] })
    const before = await versionOf(kiln)
    const anAgent = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, as('quill'), { state: 'done', response: 'The second door is painted.', ifVersion: before })
    expect(anAgent.status, anAgent.error).toBe(403)
    expect(anAgent.body['code']).toBe('checklistOwnWordsNotTheOwner')

    // AN AGENT READING THE PERSON'S WORDS AS NAMING THE ITEM IS STILL NOT THE OWNER.
    const said = await thePersonSays('lark', 'The second door is painted, tick it off.')
    const onTheWords = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, as('lark'), { state: 'done', response: 'The second door is painted.', ifVersion: before, onThePersonsWords: said })
    expect(onTheWords.status, onTheWords.error).toBe(403)
    expect(onTheWords.body['code']).toBe('checklistOwnWordsNotTheOwner')

    // A SECRETARY UNDER THE PERSON'S RAISE MAY MARK AN ITEM DONE, BUT THE WORDS ARE THE OWNER'S OWN.
    const pressed = await ask('POST', `/api/roles/elevation/${SECRETARY}`, AS_THE_PERSON, { reason: 'Tick items for me' })
    expect(pressed.status, pressed.error).toBe(201)
    try {
      const raised = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, as(SECRETARY), { state: 'done', response: 'The second door is painted.', ifVersion: before })
      expect(raised.status, raised.error).toBe(403)
      expect(raised.body['code']).toBe('checklistOwnWordsNotTheOwner')
    } finally {
      await ask('DELETE', `/api/roles/elevation/${SECRETARY}`, AS_THE_PERSON)
    }
    expect(await versionOf(kiln), 'every refusal writes nothing').toBe(before)
    expect((await itemOf(kiln, item)).state).toBe('open')
  })

  it('3. the words are kept exactly as written, read back whole, and a blank one is refused', async () => {
    const item = await anItem(kiln, as('lark'), { words: 'Tile the hearth' })
    const passage = '  Hearth tiled on Tuesday.\nI left the spare tiles "by the door".  \n'
    const before = await versionOf(kiln)
    const done = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, AS_THE_PERSON, { state: 'done', response: passage, ifVersion: before })
    expect(done.status, done.error).toBe(200)
    expect(done.body['item'].response, 'the writing is kept byte for byte').toBe(passage)
    expect((await itemOf(kiln, item)).response).toBe(passage)

    const blank = await anItem(kiln, as('lark'), { words: 'Sweep the hearth' })
    const after = await versionOf(kiln)
    const refused = await ask('PATCH', `/api/checklists/${kiln}/items/${blank}`, AS_THE_PERSON, { state: 'done', response: '   ', ifVersion: after })
    expect(refused.status, refused.error).toBe(400)
    expect(refused.error).toContain('blank')
    expect(await versionOf(kiln), 'a blank response writes nothing').toBe(after)
  })

  it('4. the words are not evidence: an agent owner\'s "done" carrying them with no evidence is still refused', async () => {
    const item = await anItem(own, as('quill'), { words: 'Oil the bench' })
    const before = await versionOf(own)
    const noEvidence = await ask('PATCH', `/api/checklists/${own}/items/${item}`, as('lark'), { state: 'done', response: 'The oil is on the shelf.', ifVersion: before })
    expect(noEvidence.status, noEvidence.error).toBe(400)
    expect(noEvidence.error).toContain('is "done" with no evidence')
    expect(await versionOf(own), 'a refused done writes nothing').toBe(before)
    expect((await itemOf(own, item)).response).toBeUndefined()

    const done = await ask('PATCH', `/api/checklists/${own}/items/${item}`, as('lark'), { state: 'done', response: 'The oil is on the shelf.', ifVersion: before, addEvidence: [{ kind: 'commit', commit: '9c0612d44' }] })
    expect(done.status, done.error).toBe(200)
    expect(done.body['item'].response).toBe('The oil is on the shelf.')
    expect(done.body['item'].doneByThePerson).toBeUndefined()
    expect(done.body['item'].evidence).toEqual([{ kind: 'commit', commit: '9c0612d44' }])
  })

  it('6. the shape keeps the words only while the item is done', () => {
    const kept = validateShape('ChecklistRequest', { id: 'i-1', words: 'x', state: 'done', evidence: [{ kind: 'commit', commit: 'abcdef1' }], response: 'Kept while the item is done.' })
    expect(kept.ok, kept.ok ? '' : JSON.stringify(kept.errors)).toBe(true)
    const open = validateShape('ChecklistRequest', { id: 'i-1', words: 'x', state: 'open', response: 'Not kept while the item is open.' })
    expect(open.ok).toBe(false)
    expect(open.ok ? [] : open.errors.map((one) => one.path)).toContain('value.response')
  })

  it("5. the same notice carries the words whole, and no other line is written", async () => {
    const item = await anItem(kiln, as('gauge'), { words: 'Sweep the kiln shelf', tell: ['gauge', 'quill'] })
    const passage = 'Swept on Wednesday, and the dust bin is full.'
    const before = await versionOf(kiln)
    const linesBefore = officeLines().length
    const done = await ask('PATCH', `/api/checklists/${kiln}/items/${item}`, AS_THE_PERSON, { state: 'done', response: passage, ifVersion: before })
    expect(done.status, done.error).toBe(200)
    const written = officeLines().slice(linesBefore)
    const notices = written.filter((line) => line.notice === 'thePersonMarkedAnItemDone')
    expect(notices, 'one notice, to the agents the item names').toHaveLength(1)
    expect(notices[0]!.to).toEqual([agent('gauge'), agent('quill')])
    expect(notices[0]!.body).toBe('The owner marked an item done')
    expect(notices[0]!.saidInFull).toContain(passage)
    expect(written.filter((line) => line.notice !== 'thePersonMarkedAnItemDone'), 'no other line and no new notice').toEqual([])
    expect(written.some((line) => line.to.some((to) => to.kind === 'person' && to.id === THE_TEST_OFFICES_OWNER.id)), 'the person is not written to about their own press').toBe(false)
  })
})
