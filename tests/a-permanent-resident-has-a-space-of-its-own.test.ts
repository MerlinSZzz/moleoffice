// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT: THE SECRETARY PROPOSES, THE OWNER CONFIRMS, AND THE AGENT HAS A SPACE OF ITS OWN.
 *
 * A decision, items 2 and 5 of a second, and the eight answers of the proposal
 * GsGFiDygATd5 agreed in a third. The doors are
 * in src/server/api/residents.ts and the rules in src/server/lib/residents.ts.
 *
 * WHAT IS PROVED HERE (every name, path and value is made up):
 *   propose   1. a secretary with its own key proposes, and the proposal carries the measured facts;
 *             2. a worker, and a secretary named without its key, are refused, and nothing is filed;
 *             3. a retired agent, the mail tool and a second open proposal are refused, each naming why.
 *   confirm   4. the person confirms: a decision settles the proposal, the row carries the residency, the space is made;
 *             5. a secretary under the owner's raise may not confirm, and nothing is recorded;
 *             6. when the folder cannot be made, nothing is recorded and the answer says why;
 *             7. "Not now" settles a proposal with a declining decision, also from a secretary under the owner's raise,
 *                and the agent may be proposed again.
 *   space     8. the resident writes and reads, the person reads, another agent is told the space is private;
 *             9. the path rules and the reserved file and folder are refused; a file written again is replaced, and its
 *                earlier version is kept, listed, readable by the readers, named by the write row and written by nobody;
 *            10. a write past the limit is refused naming the size used and the limit, and nothing is written.
 *   leave    11. the resident gives leave, the reader reads, the person ends it, and an expired grant reads nothing.
 *   void     12. a file is marked void with its reason, once, and the session-origin file never.
 *   successor 13. named once the resident is retired, by the person or a secretary under the person's raise; it reads, and an
 *                agent that took the handle does not.
 *   address  14. a secretary may not set a resident's address; the resident and the person may.
 *   versions 15. a void mark follows the bytes to the earlier version, and a replacement past the limit says the
 *                earlier version is kept and counted.
 *
 * MUTATIONS (each after a green control run, then restored), named in the commit that added this file.
 */

import type { FastifyInstance } from 'fastify'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { A_SLEEP_TIME, apiApp, freshDb, thePersonsKeyHeader, FOR_THE_PERSON, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const LIMIT = 6000
let previousLimit: string | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

interface Reply {
  status: number
  json: Record<string, any>
  text: string
}

async function inject(method: 'GET' | 'PUT' | 'POST' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()

async function started(handle: string, role: string): Promise<{ id: string; key: string }> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  const id = (reply.json['agent'] as { id: string }).id
  const key = String((reply.json['whatToGiveIt'] as { key?: string } | undefined)?.key)
  agents.set(handle, { id, key })
  return { id, key }
}
const as = (handle: string): Record<string, string> => asAgent(handle, agents.get(handle)!.key)

/** A session record serving an agent, filed at a moment of the test's choosing. */
function aSession(agentId: string, createdAt: string, data: Record<string, unknown>): string {
  const id = `ses-${Math.random().toString(36).slice(2, 12)}`
  t.client.sqlite
    .prepare(
      "INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) VALUES (?, 'default', ?, ?, ?, 'session', ?, NULL, ?)",
    )
    .run(id, THE_PERSON, createdAt, createdAt, `a made-up run ${id}`, JSON.stringify({ servingAgentId: agentId, ...data }))
  return id
}

function count(sql: string, ...args: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...args) as { n: number }).n
}

function spaceOf(agentId: string): string {
  return join(dirname(t.file), 'personal-spaces', agentId)
}

async function propose(secretary: string, agent: string, because = 'It has done steady work here for weeks.'): Promise<Reply> {
  return inject('POST', '/api/residents/proposals', as(secretary), { agentId: agent, because, sleepTime: A_SLEEP_TIME })
}

/** Propose and confirm, and answer the resident's id. */
async function makeAResident(handle: string): Promise<string> {
  const proposed = await propose('sec-made-up', handle)
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await inject('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, AS_THE_PERSON)
  expect(confirmed.status, confirmed.text).toBe(200)
  return agents.get(handle)!.id
}

beforeAll(async () => {
  previousLimit = process.env['MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES']
  process.env['MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES'] = String(LIMIT)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-made-up', 'secretary')
  for (const handle of ['res-one', 'res-two', 'res-three', 'res-four', 'res-five', 'reader-one', 'outsider-one', 'heir-one', 'old-one']) {
    await started(handle, 'worker')
  }
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousLimit === undefined) delete process.env['MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES']
  else process.env['MOLE_OFFICE_PERSONAL_SPACE_MAX_BYTES'] = previousLimit
})

describe('proposing a resident', () => {
  it('1: a secretary with its own key proposes, and the proposal carries the measured facts', async () => {
    const agent = agents.get('res-one')!
    aSession(agent.id, '2026-09-01 10:00:00', { runtime: 'claude-code' })
    aSession(agent.id, '2026-09-03 11:00:00', { runtime: 'claude-code' })
    const reply = await propose('sec-made-up', 'res-one')
    expect(reply.status, reply.text).toBe(201)
    const proposal = reply.json['proposal']
    expect(proposal.agentId).toBe(agent.id)
    expect(proposal.facts.runs).toBe(2)
    expect(proposal.facts.daysWithARun).toBe(2)
    expect(typeof proposal.facts.recordsWritten).toBe('number')
    expect(proposal.facts.retired).toBe(false)
    expect(proposal.facts.homeWorld).not.toBeNull()
    expect(proposal.settled).toBeNull()
    const record = t.api.getRecord(proposal.id)!
    expect(record.kind).toBe('proposal')
    expect(record.data['who_settles_it']).toBe('the owner')
    expect(record.data['options']).toHaveLength(1)
    expect((record.data['evidence'] as string[]).join(' ')).toContain('2 runs on record, on 2 different days')
    const listed = await inject('GET', '/api/residents', AS_THE_PERSON)
    expect(listed.json['openProposals'].map((one: { id: string }) => one.id)).toContain(proposal.id)
  })

  it('2: a worker, and a secretary named without its key, are refused, and nothing is filed', async () => {
    const before = count("SELECT count(*) AS n FROM records WHERE kind = 'proposal'")
    const byAWorker = await inject('POST', '/api/residents/proposals', as('reader-one'), { agentId: 'res-two', because: 'x', sleepTime: A_SLEEP_TIME })
    expect(byAWorker.status, byAWorker.text).toBe(403)
    expect(String(byAWorker.json['error'])).toContain('secretary card')
    const noKey = await inject('POST', '/api/residents/proposals', asAgent('sec-made-up'), { agentId: 'res-two', because: 'x', sleepTime: A_SLEEP_TIME })
    expect(noKey.status, noKey.text).toBe(403)
    expect(count("SELECT count(*) AS n FROM records WHERE kind = 'proposal'")).toBe(before)
  })

  it('3: a retired agent, the mail tool and a second open proposal are refused, each naming why', async () => {
    const retired = await inject('POST', '/api/participants/agent/old-one/retire', AS_THE_PERSON, { because: 'A made-up retirement.' })
    expect(retired.status, retired.text).toBe(200)
    const ofTheRetired = await propose('sec-made-up', agents.get('old-one')!.id)
    expect(ofTheRetired.status, ofTheRetired.text).toBe(409)
    expect(String(ofTheRetired.json['error'])).toContain('is retired')
    await started('mail-tool', 'worker')
    const ofTheMailTool = await propose('sec-made-up', 'mail-tool')
    expect(ofTheMailTool.status, ofTheMailTool.text).toBe(409)
    expect(String(ofTheMailTool.json['error'])).toContain('mail tool')
    const again = await propose('sec-made-up', 'res-one')
    expect(again.status, again.text).toBe(409)
    expect(String(again.json['error'])).toContain('already has an open proposal')
  })
})

describe('the owner’s answer', () => {
  it('4: the person confirms; a decision settles the proposal, the row carries the residency, the space is made', async () => {
    const agent = agents.get('res-one')!
    const open = (await inject('GET', '/api/residents', AS_THE_PERSON)).json['openProposals'].find((one: { agentId: string }) => one.agentId === agent.id)
    const confirmed = await inject('POST', `/api/residents/proposals/${String(open.id)}/confirm`, AS_THE_PERSON)
    expect(confirmed.status, confirmed.text).toBe(200)
    const decision = t.api.getRecord(confirmed.json['decision'].id)!
    expect(decision.kind).toBe('decision')
    expect(decision.data['decided_by']).toBe('the owner')
    expect(count("SELECT count(*) AS n FROM links WHERE from_id = ? AND to_id = ? AND type = 'derived_from'", decision.id, open.id)).toBe(1)
    const row = t.client.sqlite.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id) as Record<string, unknown>
    expect(row['resident_since']).not.toBeNull()
    expect(row['resident_proposal']).toBe(open.id)
    expect(row['resident_decision']).toBe(decision.id)
    expect(row['resident_confirmed_by_kind']).toBe('person')
    expect(row['resident_confirmed_by_id']).toBe(THE_PERSON)
    expect(existsSync(join(spaceOf(agent.id), 'session-origins.jsonl'))).toBe(true)
    const listed = await inject('GET', '/api/residents', asAgent('outsider-one'))
    expect(listed.json['residents'].map((one: { agentId: string }) => one.agentId)).toContain(agent.id)
    expect(listed.json['openProposals'].map((one: { id: string }) => one.id)).not.toContain(open.id)
  })

  it('5: a secretary under the owner’s raise may not confirm, and nothing is recorded', async () => {
    const proposed = await propose('sec-made-up', 'res-two')
    expect(proposed.status, proposed.text).toBe(201)
    const raised = await inject('POST', '/api/roles/elevation/sec-made-up', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A made-up night of work' })
    expect(raised.status, raised.text).toBe(201)
    try {
      const decisions = count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")
      const refused = await inject('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, as('sec-made-up'))
      expect(refused.status, refused.text).toBe(403)
      expect(count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")).toBe(decisions)
      expect(count('SELECT count(*) AS n FROM agents WHERE id = ? AND resident_since IS NOT NULL', agents.get('res-two')!.id)).toBe(0)
      expect(existsSync(spaceOf(agents.get('res-two')!.id))).toBe(false)
    } finally {
      await inject('DELETE', '/api/roles/elevation/sec-made-up', AS_THE_PERSON)
    }
  })

  it('6: when the folder cannot be made, nothing is recorded and the answer says why', async () => {
    const open = (await inject('GET', '/api/residents', AS_THE_PERSON)).json['openProposals'].find(
      (one: { agentId: string }) => one.agentId === agents.get('res-two')!.id,
    )
    // A FILE WHERE THE SPACES' FOLDER WOULD BE, so no folder can be made inside it.
    const res1 = agents.get('res-one')!.id
    const spaces = join(dirname(t.file), 'personal-spaces')
    const held = join(dirname(t.file), 'personal-spaces-held-aside')
    t.client.sqlite.prepare('SELECT 1').get()
    const { renameSync } = await import('node:fs')
    renameSync(spaces, held)
    writeFileSync(spaces, 'not a folder')
    try {
      const decisions = count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")
      const refused = await inject('POST', `/api/residents/proposals/${String(open.id)}/confirm`, AS_THE_PERSON)
      expect(refused.status, refused.text).toBe(500)
      expect(refused.json['code'], refused.text).toBe('residentFolderNotMade')
      expect(String(refused.json['error'])).toContain('could not be made')
      expect(count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")).toBe(decisions)
      expect(count('SELECT count(*) AS n FROM agents WHERE id = ? AND resident_since IS NOT NULL', agents.get('res-two')!.id)).toBe(0)
      const still = (await inject('GET', '/api/residents', AS_THE_PERSON)).json['openProposals'].map((one: { id: string }) => one.id)
      expect(still).toContain(open.id)
    } finally {
      rmSync(spaces, { force: true })
      renameSync(held, spaces)
    }
    expect(existsSync(join(spaces, res1))).toBe(true)
  })

  it('7: "Not now" settles the proposal with a declining decision, from the person or under a raise the person gave, and the agent may be proposed again', async () => {
    const open = (await inject('GET', '/api/residents', AS_THE_PERSON)).json['openProposals'].find(
      (one: { agentId: string }) => one.agentId === agents.get('res-two')!.id,
    )
    // UNRAISED, THE SECRETARY MAY NOT SAY "NOT NOW": it is the person's act.
    const unraised = await inject('POST', `/api/residents/proposals/${String(open.id)}/decline`, as('sec-made-up'), {})
    expect(unraised.status, unraised.text).toBe(403)
    const declined = await inject('POST', `/api/residents/proposals/${String(open.id)}/decline`, AS_THE_PERSON, { because: 'Not yet, a made-up reason.' })
    expect(declined.status, declined.text).toBe(200)
    const decision = t.api.getRecord(declined.json['decision'].id)!
    expect(decision.data['option_taken']).toBe('Not now')
    expect(decision.data['because']).toBe('Not yet, a made-up reason.')
    const twice = await inject('POST', `/api/residents/proposals/${String(open.id)}/confirm`, AS_THE_PERSON)
    expect(twice.status, twice.text).toBe(409)
    expect(twice.json['code']).toBe('residentProposalSettled')
    const again = await propose('sec-made-up', 'res-two')
    expect(again.status, again.text).toBe(201)
    // UNDER THE PERSON'S RAISE IT MAY, and the decision is written down as made under the grant.
    const raised = await inject('POST', '/api/roles/elevation/sec-made-up', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A made-up night of work' })
    expect(raised.status, raised.text).toBe(201)
    try {
      const byTheRaise = await inject('POST', `/api/residents/proposals/${String(again.json['proposal'].id)}/decline`, as('sec-made-up'), { ...FOR_THE_PERSON, because: 'Not yet, said for the person.' })
      expect(byTheRaise.status, byTheRaise.text).toBe(200)
      const grant = t.client.sqlite.prepare("SELECT elevation FROM changes WHERE record_id = ? AND op = 'create'").get(byTheRaise.json['decision'].id) as { elevation: string | null }
      expect(grant.elevation, 'the decline under the raise does not name the grant').not.toBeNull()
    } finally {
      await inject('DELETE', '/api/roles/elevation/sec-made-up', AS_THE_PERSON)
    }
    const third = await propose('sec-made-up', 'res-two')
    expect(third.status, third.text).toBe(201)
  })
})

describe('the space', () => {
  it('8: the resident writes and reads, the person reads, another agent is told the space is private', async () => {
    const wrote = await inject('PUT', '/api/residents/res-one/space/file?path=memory/notes.md', as('res-one'), { text: 'A made-up note.\n' })
    expect(wrote.status, wrote.text).toBe(201)
    expect(wrote.json['file'].written.by).toEqual({ kind: 'agent', id: agents.get('res-one')!.id })
    const mine = await inject('GET', '/api/residents/res-one/space', as('res-one'))
    expect(mine.status, mine.text).toBe(200)
    expect(mine.json['files'].map((one: { path: string }) => one.path)).toEqual(['memory/notes.md', 'session-origins.jsonl'])
    expect(mine.json['limit']).toBe(LIMIT)
    const read = await inject('GET', '/api/residents/res-one/space/file?path=memory/notes.md', AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    expect(read.text).toBe('A made-up note.\n')
    const byTheOutsider = await inject('GET', '/api/residents/res-one/space', as('outsider-one'))
    expect(byTheOutsider.status, byTheOutsider.text).toBe(403)
    expect(byTheOutsider.json['code']).toBe('residentSpaceIsPrivate')
    const fileByTheOutsider = await inject('GET', '/api/residents/res-one/space/file?path=memory/notes.md', as('outsider-one'))
    expect(fileByTheOutsider.status).toBe(403)
    const facts = await inject('GET', '/api/residents/res-one', as('outsider-one'))
    expect(facts.status, facts.text).toBe(200)
    expect(facts.json['space']).toEqual({ mayRead: false, private: expect.stringContaining('This space is private') })
    expect(facts.text).not.toContain('memory/notes.md')
    const byThePerson = await inject('PUT', '/api/residents/res-one/space/file?path=memory/the-person.md', AS_THE_PERSON, { text: 'x' })
    expect(byThePerson.status, byThePerson.text).toBe(403)
  })

  it('9: the path rules and the reserved file and folder are refused; a file written again keeps its earlier version', async () => {
    for (const bad of ['../outside.md', '/etc/made-up', 'a//b.md', 'a/./b.md', 'a\\b.md']) {
      const reply = await inject('PUT', `/api/residents/res-one/space/file?path=${encodeURIComponent(bad)}`, as('res-one'), { text: 'x' })
      expect(reply.status, `${bad}: ${reply.text}`).toBe(400)
    }
    const reserved = await inject('PUT', '/api/residents/res-one/space/file?path=session-origins.jsonl', as('res-one'), { text: '{}' })
    expect(reserved.status, reserved.text).toBe(403)
    const space = spaceOf(agents.get('res-one')!.id)
    // WRITTEN AGAIN: replaced, and the earlier version kept under .versions/.
    const replaced = await inject('PUT', '/api/residents/res-one/space/file?path=memory/notes.md', as('res-one'), { text: 'Changed.\n' })
    expect(replaced.status, replaced.text).toBe(201)
    expect(readFileSync(join(space, 'memory', 'notes.md'), 'utf8')).toBe('Changed.\n')
    expect(readFileSync(join(space, '.versions', 'memory', 'notes.md', '1'), 'utf8')).toBe('A made-up note.\n')
    const row = t.client.sqlite
      .prepare("SELECT replaced_version FROM resident_space_writes WHERE path = 'memory/notes.md' ORDER BY rowid DESC LIMIT 1")
      .get() as { replaced_version: string | null }
    expect(row.replaced_version).toBe('.versions/memory/notes.md/1')
    const listed = await inject('GET', '/api/residents/res-one/space', AS_THE_PERSON)
    const notes = listed.json['files'].find((one: { path: string }) => one.path === 'memory/notes.md')
    expect(notes.versions).toEqual([
      { number: 1, path: '.versions/memory/notes.md/1', bytes: 16, kept: { at: expect.any(String), by: { kind: 'agent', id: agents.get('res-one')!.id } }, void: null },
    ])
    expect(listed.json['files'].map((one: { path: string }) => one.path), 'an earlier version is listed as a file of its own').toEqual(['memory/notes.md', 'session-origins.jsonl'])
    const earlier = await inject('GET', '/api/residents/res-one/space/file?path=.versions/memory/notes.md/1', AS_THE_PERSON)
    expect(earlier.text).toBe('A made-up note.\n')
    expect((await inject('GET', '/api/residents/res-one/space/file?path=.versions/memory/notes.md/1', as('outsider-one'))).status).toBe(403)
    for (const kept of ['.versions/memory/notes.md/1', '.versions/memory/new.md']) {
      const overVersion = await inject('PUT', `/api/residents/res-one/space/file?path=${kept}`, as('res-one'), { text: 'x' })
      expect(overVersion.status, overVersion.text).toBe(403)
    }
    const voidVersion = await inject('POST', '/api/residents/res-one/space/void', AS_THE_PERSON, { path: '.versions/memory/notes.md/1', because: 'x' })
    expect(voidVersion.status, voidVersion.text).toBe(403)
  })

  it('10: a write past the limit is refused naming the size used and the limit, and nothing is written', async () => {
    const before = await inject('GET', '/api/residents/res-one/space', as('res-one'))
    const used = Number(before.json['used'])
    const tooBig = 'y'.repeat(LIMIT - used + 1)
    const refused = await inject('PUT', '/api/residents/res-one/space/file?path=big.txt', as('res-one'), { text: tooBig })
    expect(refused.status, refused.text).toBe(413)
    expect(String(refused.json['error'])).toContain(`holds ${String(used)} bytes and its limit is ${String(LIMIT)}`)
    expect(existsSync(join(spaceOf(agents.get('res-one')!.id), 'big.txt'))).toBe(false)
    const fits = await inject('PUT', '/api/residents/res-one/space/file?path=fits.txt', as('res-one'), { text: 'y'.repeat(LIMIT - used) })
    expect(fits.status, fits.text).toBe(201)
  })
})

describe('leave to read', () => {
  it('11: the resident gives leave, the reader reads, the person ends it, and an expired grant reads nothing', async () => {
    const byThePerson = await inject('POST', '/api/residents/res-one/grants', AS_THE_PERSON, { readerAgentId: 'reader-one', until: '2099-01-01 12:00' })
    expect(byThePerson.status, byThePerson.text).toBe(403)
    const given = await inject('POST', '/api/residents/res-one/grants', as('res-one'), { readerAgentId: 'reader-one', until: '2099-01-01 12:00' })
    expect(given.status, given.text).toBe(201)
    const grant = given.json['grant']
    expect(grant.holds).toBe(true)
    expect(grant.until).toBe('2099-01-01 12:00:00')
    expect((await inject('GET', '/api/residents/res-one/space', as('reader-one'))).status).toBe(200)
    const ended = await inject('POST', `/api/residents/res-one/grants/${String(grant.id)}/end`, AS_THE_PERSON)
    expect(ended.status, ended.text).toBe(200)
    expect(ended.json['grant'].ended.by).toEqual({ kind: 'person', id: THE_PERSON })
    expect((await inject('GET', '/api/residents/res-one/space', as('reader-one'))).status).toBe(403)
    const twice = await inject('POST', `/api/residents/res-one/grants/${String(grant.id)}/end`, as('res-one'))
    expect(twice.status, twice.text).toBe(409)
    // AN EXPIRED GRANT: given, then its end moved into the past, as time passing would.
    const again = await inject('POST', '/api/residents/res-one/grants', as('res-one'), { readerAgentId: 'reader-one', until: '2099-01-01 12:00' })
    expect(again.status, again.text).toBe(201)
    expect((await inject('GET', '/api/residents/res-one/space', as('reader-one'))).status).toBe(200)
    t.client.sqlite.prepare("UPDATE resident_read_grants SET until = '2001-01-01 00:00:00' WHERE id = ?").run(again.json['grant'].id)
    expect((await inject('GET', '/api/residents/res-one/space', as('reader-one'))).status).toBe(403)
    const past = await inject('POST', '/api/residents/res-one/grants', as('res-one'), { readerAgentId: 'reader-one', until: '2001-01-01 12:00' })
    expect(past.status, past.text).toBe(400)
  })
})

describe('void marks', () => {
  it('12: a file is marked void with its reason, once, and the session-origin file never', async () => {
    const byTheOutsider = await inject('POST', '/api/residents/res-one/space/void', as('outsider-one'), { path: 'memory/notes.md', because: 'x' })
    expect(byTheOutsider.status, byTheOutsider.text).toBe(403)
    const marked = await inject('POST', '/api/residents/res-one/space/void', as('res-one'), { path: 'memory/notes.md', because: 'A made-up mistake.' })
    expect(marked.status, marked.text).toBe(201)
    const twice = await inject('POST', '/api/residents/res-one/space/void', AS_THE_PERSON, { path: 'memory/notes.md', because: 'Again.' })
    expect(twice.status, twice.text).toBe(409)
    const origins = await inject('POST', '/api/residents/res-one/space/void', AS_THE_PERSON, { path: 'session-origins.jsonl', because: 'x' })
    expect(origins.status, origins.text).toBe(403)
    const byThePerson = await inject('POST', '/api/residents/res-one/space/void', AS_THE_PERSON, { path: 'fits.txt', because: 'A made-up reason.' })
    expect(byThePerson.status, byThePerson.text).toBe(201)
    const listed = await inject('GET', '/api/residents/res-one/space', as('res-one'))
    const notes = listed.json['files'].find((one: { path: string }) => one.path === 'memory/notes.md')
    expect(notes.void.because).toBe('A made-up mistake.')
    expect(existsSync(join(spaceOf(agents.get('res-one')!.id), 'memory', 'notes.md'))).toBe(true)
  })
})

describe('the successor', () => {
  it('13: named once the resident is retired, by a secretary under the person\'s raise; it reads, and an agent that took the handle does not', async () => {
    const id = await makeAResident('res-three')
    const early = await inject('POST', '/api/residents/res-three/successor', AS_THE_PERSON, { agentId: 'heir-one' })
    expect(early.status, early.text).toBe(409)
    expect(early.json['code']).toBe('residentNotRetired')
    const given = await inject('POST', '/api/residents/res-three/grants', as('res-three'), { readerAgentId: 'reader-one', until: '2099-01-01 12:00' })
    expect(given.status, given.text).toBe(201)
    const retired = await inject('POST', '/api/participants/agent/res-three/retire', AS_THE_PERSON, { because: 'A made-up end of its work.' })
    expect(retired.status, retired.text).toBe(200)
    // AN AGENT TAKES THE RETIRED HANDLE: a new agent with an id of its own.
    const taker = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'res-three', name: 'res-three', role: 'worker' })
    expect(taker.status, taker.text).toBe(201)
    const takerKey = String(taker.json['whatToGiveIt'].key)
    expect(taker.json['agent'].id).not.toBe(id)
    const bySecretary = await inject('POST', `/api/residents/${id}/successor`, as('sec-made-up'), { agentId: 'heir-one' })
    expect(bySecretary.status, bySecretary.text).toBe(403)
    // UNDER THE PERSON'S RAISE THE SECRETARY NAMES IT, and the act is written down as done under the grant.
    const raised = await inject('POST', '/api/roles/elevation/sec-made-up', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, { reason: 'A made-up night of work' })
    expect(raised.status, raised.text).toBe(201)
    let named: Reply
    try {
      named = await inject('POST', `/api/residents/${id}/successor`, as('sec-made-up'), { ...FOR_THE_PERSON, agentId: 'heir-one' })
    } finally {
      await inject('DELETE', '/api/roles/elevation/sec-made-up', AS_THE_PERSON)
    }
    expect(named.status, named.text).toBe(200)
    expect(named.json['resident'].successor.agentId).toBe(agents.get('heir-one')!.id)
    expect(named.json['resident'].successor.namedBy).toEqual({ kind: 'agent', id: agents.get('sec-made-up')!.id })
    const underTheGrant = t.client.sqlite
      .prepare("SELECT elevation FROM changes WHERE record_id = ? AND field = 'the successor'")
      .get(`setting:successor-of-${id}`) as { elevation: string | null } | undefined
    expect(underTheGrant?.elevation ?? null, 'naming the successor under the raise is not written down as done under it').not.toBeNull()
    expect((await inject('GET', `/api/residents/${id}/space`, as('heir-one'))).status).toBe(200)
    expect((await inject('GET', `/api/residents/${id}/space`, asAgent('res-three', takerKey))).status).toBe(403)
    expect((await inject('GET', `/api/residents/${id}/space`, as('reader-one'))).status, 'a grant does not outlive the retirement').toBe(403)
    const twice = await inject('POST', `/api/residents/${id}/successor`, AS_THE_PERSON, { agentId: 'reader-one' })
    expect(twice.status, twice.text).toBe(409)
  })
})

describe('the address of a resident', () => {
  it('14: a secretary may not set a resident’s address; the resident and the person may', async () => {
    const bySecretary = await inject('PUT', '/api/participants/agent/res-one/address-as', as('sec-made-up'), { name: 'Set by a secretary' })
    expect(bySecretary.status, bySecretary.text).toBe(403)
    expect(bySecretary.json['code']).toBe('addressResidentIsItsOwn')
    const byAnother = await inject('PUT', '/api/participants/agent/res-one/address-as', as('reader-one'), { name: 'Set by another' })
    expect(byAnother.status, byAnother.text).toBe(403)
    expect(byAnother.json['code']).toBe('addressResidentIsItsOwn')
    const byItself = await inject('PUT', '/api/participants/agent/res-one/address-as', as('res-one'), { thirdPerson: 'she' })
    expect(byItself.status, byItself.text).toBe(200)
    const byThePerson = await inject('PUT', '/api/participants/agent/res-one/address-as', AS_THE_PERSON, { title: 'a made-up title' })
    expect(byThePerson.status, byThePerson.text).toBe(200)
    const onAnOrdinaryAgent = await inject('PUT', '/api/participants/agent/reader-one/address-as', as('sec-made-up'), { name: 'Set by a secretary' })
    expect(onAnOrdinaryAgent.status, onAnOrdinaryAgent.text).toBe(200)
  })
})

describe('earlier versions', () => {
  it('15: a void mark follows the bytes to the earlier version, and a replacement past the limit says the earlier version is kept and counted', async () => {
    const id = await makeAResident('res-five')
    const write = (text: string) => inject('PUT', '/api/residents/res-five/space/file?path=memory/a.md', as('res-five'), { text })
    expect((await write('First.\n')).status).toBe(201)
    expect((await inject('POST', '/api/residents/res-five/space/void', as('res-five'), { path: 'memory/a.md', because: 'A made-up error.' })).status).toBe(201)
    expect((await write('Second.\n')).status).toBe(201)
    const listed = await inject('GET', '/api/residents/res-five/space', as('res-five'))
    const a = listed.json['files'].find((one: { path: string }) => one.path === 'memory/a.md')
    expect(a.void, 'the new bytes carry the mark the old ones were given').toBeNull()
    expect(a.versions[0].void.because).toBe('A made-up error.')
    const used = Number(listed.json['used'])
    const tooBig = await write('z'.repeat(LIMIT - used + 1))
    expect(tooBig.status, tooBig.text).toBe(413)
    expect(String(tooBig.json['error'])).toContain('keeps its earlier version (8 bytes) in .versions/, and it stays counted against the limit')
    expect(readFileSync(join(spaceOf(id), 'memory', 'a.md'), 'utf8')).toBe('Second.\n')
    expect(existsSync(join(spaceOf(id), '.versions', 'memory', 'a.md', '2'))).toBe(false)
  })
})
