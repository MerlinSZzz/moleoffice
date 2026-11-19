// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The tags a person makes and their assignments follow that person through the office. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
const OTHER = 'made-up-second-person'
const agentIds: string[] = []
const headers = (person: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': person })
const tag = (agents: string[]) => ({ name: 'Made-up review', colour: '#7860a8', agents })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const sql = db.client.sqlite
  sql.prepare("INSERT INTO people (id, name, handle, avatar_asset_id, created_at) SELECT ?, ?, ?, avatar_asset_id, created_at FROM people WHERE id = ?").run(OTHER, 'Made-up second person', OTHER, THE_PERSON)
  for (const handle of ['made-up-first-agent', 'made-up-second-agent']) {
    const record = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up agent', data: { handle, runtime: 'claude-code', state: 'active' }, actor: { type: 'human', id: THE_PERSON } })
    agentIds.push((sql.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as { id: string }).id)
  }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

async function ask(method: 'GET' | 'PUT', url: string, person: string, payload?: { tags: unknown[] }) {
  return app.inject({ method, url, headers: headers(person), ...(payload === undefined ? {} : { payload }) })
}
async function keep(person: string, tags: unknown[]) {
  return ask('PUT', '/api/agent-tags', person, { tags })
}
async function tagsOfAgent(person: string, id: string): Promise<unknown[][]> {
  const contacts = await ask('GET', '/api/messages/contacts', person)
  const profile = await ask('GET', `/api/participants/agent/${id}/profile`, person)
  const list = await ask('GET', '/api/office/embassy', person)
  for (const answer of [contacts, profile, list]) expect(answer.statusCode, answer.body).toBe(200)
  const contact = contacts.json().contacts.find((row: { who?: { id: string } }) => row.who?.id === id)
  const row = list.json().rows.find((one: { who: { id: string; kind: string } }) => one.who.kind === 'agent' && one.who.id === id)
  expect(contact).toBeDefined()
  expect(row).toBeDefined()
  return [contact.personalTags, profile.json().participant.personalTags, row.personalTags]
}

describe('personal agent tags', () => {
  it('keeps a tag, assigns it to two agents, removes it from one, and shows each person only their own', async () => {
    let answer = await keep(THE_PERSON, [tag([])])
    expect(answer.statusCode, answer.body).toBe(200)
    answer = await keep(THE_PERSON, [tag(agentIds)])
    expect(answer.statusCode, answer.body).toBe(200)
    const stored = await ask('GET', '/api/agent-tags', THE_PERSON)
    expect(stored.statusCode, stored.body).toBe(200)
    expect(stored.json().tags).toEqual([tag(agentIds)])
    for (const id of agentIds) {
      for (const shown of await tagsOfAgent(THE_PERSON, id)) expect(shown).toEqual([{ name: tag([]).name, colour: tag([]).colour }])
      for (const shown of await tagsOfAgent(OTHER, id)) expect(shown).toEqual([])
    }
    answer = await keep(THE_PERSON, [tag([agentIds[1]!])])
    expect(answer.statusCode, answer.body).toBe(200)
    for (const shown of await tagsOfAgent(THE_PERSON, agentIds[0]!)) expect(shown).toEqual([])
    for (const shown of await tagsOfAgent(THE_PERSON, agentIds[1]!)) expect(shown).toEqual([{ name: tag([]).name, colour: tag([]).colour }])
  })

  it('refuses colours too close to a light or dark background and says why', async () => {
    for (const colour of ['#ffffff', '#000000']) {
      const answer = await keep(THE_PERSON, [{ ...tag(agentIds), colour }])
      expect(answer.statusCode).toBe(400)
      expect(answer.json().error).toBeTruthy()
    }
    const stored = await ask('GET', '/api/agent-tags', THE_PERSON)
    expect(stored.json().tags).toEqual([tag([agentIds[1]!])])
  })
})
