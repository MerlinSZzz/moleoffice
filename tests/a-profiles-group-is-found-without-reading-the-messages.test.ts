// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUP ON A PROFILE IS FOUND WITHOUT READING THE MESSAGES. Wave 13j, item 0.
 *
 * MEASURED FIRST, 18 October 2026, on a made-up office of the live shape (about 12,500 messages): one
 * `GET /api/participants/agent/:id/profile` spent 175 to 199 ms of its 655 working out which of the reader's contact
 * groups the participant sits in. `theGroupTheyAreIn` asked `contactsFor` for the reader's whole contacts list, and
 * `contactsFor` read every message in every project to put the last line and the unread count on each row. The group
 * reads none of that. It reads which participant the row is for, and the reader's own groups and placements.
 *
 * WHAT THIS HOLDS:
 *   2. the group a profile names is the group the reader's contacts list draws that participant in, for every
 *      participant of the office, read by the person and by an agent: one moved into a group the person made, one
 *      left where its kind puts it, a retired one, one the reader has written with, the reader's own page, and the
 *      person's page read by an agent.
 *
 * CONTROL: case 2 is a guard and passes before and after. It goes red if the profile's group stops being the
 * contacts list's.
 *
 * The participants and messages here are made up for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const PERSON = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** Messages between the two chatting agents, at each of the two sizes. More than 50, so a reader's check of them is narrowed first. */
const MESSAGES = 60

type Ref = { kind: 'person' | 'agent'; id: string }
type Group = { key: string; name: string; made: boolean } | null

let t: TestDb
let app: FastifyInstance
const ids = new Map<string, string>()
let madeGroup = ''

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id?: unknown } | undefined
  expect(typeof row?.id, `no registry row has the handle ${handle}`).toBe('string')
  return String(row!.id)
}

/** One message from an agent. `expected` is the status the write answers. */
async function aMessage(from: string, to: Ref, words: string, expected = 201): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: asAgent(from), payload: { kind: 'message', title: words, data: { body: words, to: [to] } } })
  expect(reply.statusCode, reply.body).toBe(expected)
}

async function moreMessagesBetweenTheTwoWhoChat(): Promise<void> {
  for (let i = 0; i < MESSAGES; i++) {
    const [from, to] = i % 2 === 0 ? ['made-up-chat-one', 'made-up-chat-two'] : ['made-up-chat-two', 'made-up-chat-one']
    // NOTHING HOLDS EITHER OF THE TWO IN THE TEST OFFICE, so the office stores each message, routes it and answers 409.
    // The message is stored all the same.
    await aMessage(ids.get(from)!, { kind: 'agent', id: ids.get(to)! }, `A made-up line ${String(i)} between the two who chat.`, 409)
  }
}

async function theProfile(who: Ref, headers: Record<string, string>): Promise<{ group: Group }> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/${who.kind}/${encodeURIComponent(who.id)}/profile`, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { group: Group }
}


/** The group the reader's contacts list draws this participant in, or null because it draws no row for them. */
async function theGroupOnTheContactsList(who: Ref, headers: Record<string, string>): Promise<Group> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  const body = reply.json() as { contacts: { who: Ref | null; group: string }[]; contactGroups: { key: string; name: string; made: boolean }[] }
  const row = body.contacts.find((one) => one.who !== null && one.who.kind === who.kind && one.who.id === who.id)
  if (row === undefined) return null
  const group = body.contactGroups.find((one) => one.key === row.group)
  expect(group, `the contacts list names a group ${row.group} it does not list`).toBeDefined()
  return { key: group!.key, name: group!.name, made: group!.made }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['made-up-reader', 'made-up-placed', 'made-up-left', 'made-up-retired', 'made-up-chat-one', 'made-up-chat-two']) {
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, role: 'worker' } })
    expect(started.statusCode, started.body).toBe(201)
    ids.set(handle, idOf(handle))
  }
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'made up for this test' WHERE id = ?").run(ids.get('made-up-retired'))
  // A GROUP THE PERSON MADE, and one agent moved into it through the door the panel uses.
  const made = await app.inject({ method: 'POST', url: '/api/messages/contact-groups', headers: PERSON, payload: { name: 'Made-up agents I watch', side: 'agent' } })
  expect(made.statusCode, made.body).toBe(201)
  madeGroup = (made.json() as { group: { key: string } }).group.key
  const contacts = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: PERSON })
  expect(contacts.statusCode, contacts.body).toBe(200)
  const key = (contacts.json() as { contacts: { key: string; who: Ref | null }[] }).contacts.find((one) => one.who?.id === ids.get('made-up-placed'))?.key
  expect(key, 'made-up-placed is one of the person’s contacts').toBeDefined()
  const moved = await app.inject({ method: 'POST', url: '/api/messages/contact-placements', headers: PERSON, payload: { contact: key, group: madeGroup } })
  expect(moved.statusCode, moved.body).toBe(200)
  // THE READERS HAVE WRITTEN WITH SOMEBODY, so a row with a last line is among the rows compared.
  // NOTHING HOLDS THE AGENT THE READER WRITES TO IN THE TEST OFFICE, so the office stores the message, routes it and
  // answers 409. The message is stored all the same. The line to the person keeps its 201.
  await aMessage(ids.get('made-up-reader')!, { kind: 'agent', id: ids.get('made-up-chat-one')! }, 'A made-up line from the reading agent.', 409)
  await aMessage(ids.get('made-up-placed')!, { kind: 'person', id: THE_PERSON }, 'A made-up line to the person.')
  await moreMessagesBetweenTheTwoWhoChat()
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the group on a profile', () => {

  it('2. is the group the reader’s contacts list draws them in, for every participant, read by the person and by an agent', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/participants', headers: PERSON })
    expect(list.statusCode, list.body).toBe(200)
    const everyone: Ref[] = [
      ...(list.json() as { people: { id: string }[] }).people.map((one) => ({ kind: 'person' as const, id: one.id })),
      ...(list.json() as { agents: { id: string }[] }).agents.map((one) => ({ kind: 'agent' as const, id: one.id })),
    ]
    const readers = [
      { name: 'the person', me: { kind: 'person' as const, id: THE_PERSON }, headers: PERSON },
      { name: 'made-up-reader', me: { kind: 'agent' as const, id: ids.get('made-up-reader')! }, headers: asAgent(ids.get('made-up-reader')!) },
    ]
    const seen = new Set<string>()
    for (const reader of readers) {
      for (const who of everyone) {
        const profile = await theProfile(who, reader.headers)
        const own = who.kind === reader.me.kind && who.id === reader.me.id
        const listed = own ? null : await theGroupOnTheContactsList(who, reader.headers)
        expect(profile.group, `${reader.name} reads ${who.kind} ${who.id}`).toEqual(listed)
        seen.add(profile.group === null ? (own ? 'own page' : 'none') : profile.group.key)
      }
    }
    // THE CASES WERE THERE, or the comparison above would prove nothing about them.
    expect([...seen], 'the group the person made, the retired group, the person’s side, and the reader’s own page').toEqual(
      expect.arrayContaining([madeGroup, 'retired', 'people', 'own page']),
    )
  })
})
