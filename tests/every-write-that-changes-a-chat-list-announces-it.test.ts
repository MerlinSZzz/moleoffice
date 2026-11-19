// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY WRITE THAT CHANGES WHAT THE CHAT'S LISTS SHOW ANNOUNCES IT, OR SAYS WHY IT CANNOT.
 *
 * Invariant 2 of report VQw5RwL8gbCb: no list a page holds may depend on an input nobody announced.
 * Since 26 September 2026 a page applies events instead of reading its lists again.
 * A write that changes a list and announces nothing leaves every open page wrong
 * until it is reloaded, and nothing says so.
 *
 * TWO HALVES.
 *
 *   1. THE LIST OF WRITERS. Every place in src/server that writes one of the tables the chat's lists
 *      are read from is found by reading the source, and each must be named below with the event it
 *      announces or the reason it cannot. A new writer, or a writer moved to another file, turns this
 *      red until somebody says which it is.
 *   2. THE ANNOUNCEMENTS THEMSELVES. Each write below that says it announces is made through its door,
 *      and the event is looked for on a page's connection.
 *
 * THE `records` TABLE IS NOT SCANNED: hundreds of places write records, and the ones the chat draws are
 * messages and agents, which pass through the create, patch, delete and restore doors of
 * src/server/lib/records.ts. Those four doors are measured in half 2.
 */

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ChannelEvent, EventOnTheWire } from '../src/shared/events.ts'

function filesUnder(folder: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(folder)) {
    const path = join(folder, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path))
    else if (path.endsWith('.ts')) out.push(path)
  }
  return out
}

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

let t: TestDb
let app: FastifyInstance
let heard: EventOnTheWire[] = []

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, body?: unknown, expected?: number): Promise<Record<string, unknown>> {
  const res = await app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  if (expected === undefined) expect(res.statusCode, `${method} ${url}: ${res.body}`).toBeLessThan(300)
  else expect(res.statusCode, `${method} ${url}: ${res.body}`).toBe(expected)
  return res.json() as Record<string, unknown>
}

/** The events a page of the person was sent while `write` ran. */
async function whatAPageIsSent(write: () => Promise<unknown>): Promise<ChannelEvent[]> {
  heard = []
  await write()
  return heard.map((one) => one.event)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  for (const handle of ['told-a', 'told-b']) {
    await call('POST', '/api/records', OWNER, { kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  const events = await import('../src/server/lib/events.ts')
  events.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_PERSON }, send: (one) => heard.push(one) })
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the announcements', () => {
  // Mutation: remove tellThePages from signing-packages.ts; each of the four doors must go red.
  it('bringing, signing, refusing and withdrawing a package tell Needs you', async () => {
    const started = await call('POST', '/api/agents/started', OWNER, { handle: 'told-secretary', name: 'Told secretary', workArea: ['src'] })
    const key = (started['whatToGiveIt'] as { key: string }).key
    await call('POST', '/api/roles/card/told-secretary', OWNER, { role: 'secretary' })
    const secretary = { ...asAgent('told-secretary'), 'x-mole-office-key': key }
    const body = { forAgent: 'told-a', task: 'Keep the agreed copies', items: [{ act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: 21 }, why: 'Keep enough copies.' }] }
    const bring = async () => (await call('POST', '/api/signing-packages', secretary, body))['package'] as { id: string }
    const told = (events: ChannelEvent[]) => events.some(one => one.name === 'list.changed' && one.lists.includes('needsYou'))
    let id = ''
    expect(told(await whatAPageIsSent(async () => { id = (await bring()).id }))).toBe(true)
    expect(told(await whatAPageIsSent(() => call('POST', `/api/signing-packages/${id}/sign`, OWNER, { struck: [] })))).toBe(true)
    id = (await bring()).id
    expect(told(await whatAPageIsSent(() => call('POST', `/api/signing-packages/${id}/refuse`, OWNER)))).toBe(true)
    id = (await bring()).id
    expect(told(await whatAPageIsSent(() => call('POST', `/api/signing-packages/${id}/withdraw`, secretary)))).toBe(true)
  })

  it('a message is announced with what the lists need, and a mark with its row', async () => {
    let id = ''
    const sent = await whatAPageIsSent(async () => {
      const made = await call('POST', '/api/records', asAgent('told-a'), { kind: 'message', title: 'x', data: { body: 'x', to: [{ kind: 'person', id: THE_PERSON }] } })
      id = (made['record'] as { id: string }).id
    })
    const said = sent.find((one) => one.name === 'message.new')
    expect(said?.name === 'message.new' && said.lists?.entry.id).toBe(id)
    const marked = await whatAPageIsSent(() => call('POST', `/api/messages/${id}/mark`, OWNER, { mark: 'seen' }))
    const mark = marked.find((one) => one.name === 'delivery.changed')
    expect(mark?.name === 'delivery.changed' && mark.rows?.[0]?.row.mark).toBe('seen')
  })

  it('a registration through an agent record is announced with the participant', async () => {
    const sent = await whatAPageIsSent(() =>
      call('POST', '/api/records', OWNER, { kind: 'agent', title: 'told-c', data: { handle: 'told-c', runtime: 'claude-code', state: 'active' } }),
    )
    const said = sent.find((one) => one.name === 'list.changed')
    expect(said?.name === 'list.changed' && said.lists).toEqual(['participants', 'contacts'])
    expect(said?.name === 'list.changed' && said.participant?.kind).toBe('agent')
  })

  // Mutation: remove the announcement after the name is written in answerARename (agent-renames.ts); this case goes red.
  it('a new name approved is announced with the agent it names', async () => {
    const registry = (await call('GET', '/api/participants', OWNER)) as { agents: { id: string; handle: string }[] }
    const agent = registry.agents.find((one) => one.handle === 'told-b')?.id ?? ''
    const proposed = await call('POST', `/api/participants/agent/${agent}/renames`, OWNER, { name: 'Told again', because: 'A made-up reason.' })
    const renameId = (proposed['rename'] as { id: string }).id
    const sent = await whatAPageIsSent(() => call('POST', `/api/renames/${renameId}/approve`, OWNER, { because: 'A made-up answer.' }))
    const said = sent.find((one) => one.name === 'list.changed')
    expect(said?.name === 'list.changed' && said.lists).toEqual(['participants', 'contacts'])
    expect(said?.name === 'list.changed' && said.participant).toEqual({ kind: 'agent', id: agent })
  })

  // Mutation: remove the announcement after the row is written in changeWhoAnswersFor (agent-starter.ts); this case goes red.
  // The press also writes the agent's records, and each record write announces the registry too, so the case finds the
  // press's own event by its sentence. That one is the only event for an agent whose records are all gone.
  it("the person's change of who answers for an agent is announced with the agent", async () => {
    const registry = (await call('GET', '/api/participants', OWNER)) as { agents: { id: string; handle: string }[] }
    const agent = registry.agents.find((one) => one.handle === 'told-a')?.id ?? ''
    const sent = await whatAPageIsSent(() => call('POST', `/api/agents/${agent}/starter`, OWNER, { to: THE_PERSON, because: 'A made-up reason.' }))
    const said = sent.find((one) => one.name === 'list.changed' && one.because.includes('answers for the agent'))
    expect(said?.name === 'list.changed' && said.lists).toEqual(['participants', 'contacts'])
    expect(said?.name === 'list.changed' && said.participant).toEqual({ kind: 'agent', id: agent })
  })

  it('a group opened and a member added are announced', async () => {
    let groupId = ''
    const opened = await whatAPageIsSent(async () => {
      const made = await call('POST', '/api/groups', OWNER, {
        name: 'Told group',
        because: 'to be announced',
        members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'in it' }],
      })
      groupId = (made['group'] as { id: string }).id
    })
    expect(opened.some((one) => one.name === 'list.changed' && one.lists.includes('groups') && one.groupId === groupId)).toBe(true)
    const added = await whatAPageIsSent(() =>
      call('POST', `/api/groups/${groupId}/members`, OWNER, { who: { kind: 'agent', id: 'told-a' }, because: 'joins' }),
    )
    expect(added.some((one) => one.name === 'list.changed' && one.lists.includes('groups') && one.groupId === groupId)).toBe(true)
  })

  it('the person arranging their contacts is announced to their own pages', async () => {
    const sent = await whatAPageIsSent(() => call('POST', '/api/messages/contact-groups', OWNER, { name: 'Told', side: 'agent' }))
    const said = sent.find((one) => one.name === 'list.changed')
    expect(said?.name === 'list.changed' && said.lists).toEqual(['contacts'])
    expect(said?.name === 'list.changed' && said.about).toEqual({ kind: 'person', id: THE_PERSON })
  })

  it('reading a conversation between two agents is announced to the reader’s pages', async () => {
    const registry = (await call('GET', '/api/participants', OWNER)) as { agents: { id: string; handle: string }[] }
    const a = registry.agents.find((one) => one.handle === 'told-a')?.id ?? ''
    const b = registry.agents.find((one) => one.handle === 'told-b')?.id ?? ''
    // Nothing holds told-b in the test office, so the office stores this message, routes it and answers 409. The message
    // is stored all the same, so the two agents have a conversation to read.
    await call('POST', '/api/records', asAgent('told-a'), { kind: 'message', title: 'y', data: { body: 'y', to: [{ kind: 'agent', id: b }] } }, 409)
    const pair = [a, b].sort().join('~')
    const sent = await whatAPageIsSent(() => call('GET', `/api/messages/between/${encodeURIComponent(pair)}`, OWNER))
    const said = sent.find((one) => one.name === 'list.changed')
    expect(said?.name === 'list.changed' && said.lists).toEqual(['betweenAgents'])
  })

  it('a message deleted is announced to every page', async () => {
    const made = await call('POST', '/api/records', asAgent('told-a'), { kind: 'message', title: 'z', data: { body: 'z', to: [{ kind: 'person', id: THE_PERSON }] } })
    const id = (made['record'] as { id: string }).id
    // ITS WRITER DELETES IT, because only the writer may.
    const sent = await whatAPageIsSent(() => call('DELETE', `/api/records/${id}`, asAgent('told-a')))
    expect(sent.some((one) => one.name === 'list.changed' && one.lists.includes('contacts') && one.about === null)).toBe(true)
  })
})
