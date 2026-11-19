// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN STORED UNDER AN AGENT'S OLD REGISTRY ID COUNTS FOR THAT AGENT'S DOT, in the readers of the presence, the office
 * scene and the message worker that ask the store or the rows by the agent's id (item 30c, part 2b-3). An old id is an
 * alias filed for the agent's canonical id. A run's record written before the alias was filed keeps the old id.
 *
 * Every agent, run and letter here is made up, in a throwaway office. Each run names its agent by the old id alone: no
 * handle and no `ranAs`, so nothing else in it could lead a reader to the agent. The old id is put in the run's row by a
 * direct write, because the record door now stores the canonical id for an id filed as an alias.
 *
 * Each reader is asked about the canonical id:
 * - the runs that may answer as the agent, read for it alone;
 * - a run that waits for the next message, which turns the dot green, read alone;
 * - the words beside a grey dot for a run in one of the office's terminals: the dot alone, the presence door, the
 *   contacts' online order and the office scene, read whole and for that agent alone;
 * - the words beside a grey dot for a live process of a run that has ended.
 *
 * An id that is not filed as an alias is not followed. With no alias filed, the two changed statements ask `= ?` and the
 * same conditions as before; with one filed, each is planned as with none. The readers of runs read the filed aliases at
 * most once for each request, in one statement, however many agents the request reads.
 *
 * MUTATIONS, after a control run: give a reader the asked id alone in place of `everyIdOf`, or the stored id in place of
 * `canonicalOf`, and its case goes red. Read the aliases afresh for each agent in place of the one reading handed down,
 * and the count case goes red. Write `IN (?)` for one id, and the statement case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

let t: TestDb
let app: FastifyInstance
let serial = 0
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agent = (id: string) => ({ ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const THE_MESSAGE_WORKER = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' }
interface Agent { id: string; handle: string }

buildTheFirstOfficeInAHook()
beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterEach(async () => {
  t.client.sqlite.prepare('UPDATE session_resources SET released_at = ? WHERE released_at IS NULL').run('2000-01-01 00:00:00')
  await app?.close()
  t?.close()
})

async function registered(): Promise<Agent> {
  const handle = `made-up-alias-dots-${++serial}`
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: handle, role: 'worker', runtime: 'codex' } })
  expect(reply.statusCode, reply.body).toBeLessThan(300)
  return reply.json().agent
}
/**
 * The old id of an agent: an alias filed for its canonical id, which is no registry id. It does not hold the agent's
 * handle, because a reader that looks for the handle inside a stored field would find the run by the handle.
 */
async function anOldIdFor(who: Agent): Promise<string> {
  const old = `an-old-registry-id-${who.handle.split('-').at(-1)}`
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{ namespace: 'agent-registry', aliasId: old, canonicalId: who.id }])
  return old
}
/**
 * A run that names its agent by `stored` alone, as a run written before the alias was filed holds it. The record door
 * stores the canonical id for an id filed as an alias, so `stored` is written into the row after the door made it.
 */
function aRunUnder(stored: string, more: Record<string, unknown> = {}): string {
  const session = t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: 'Made-up run', actor: t.api.HUMAN, origin: 'authored',
    data: { state: 'running', runtime: 'codex', servingAgentId: stored, ...more },
  }).id
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.servingAgentId', ?) WHERE id = ?").run(stored, session)
  return session
}
const IN_A_TERMINAL = { extra: { inATerminal: { terminal: 'made-up-terminal' } }, workingDirectory: '/made/up/folder' }
async function ownProcess(session: string) {
  const { registerResource } = await import('../src/server/lib/resources.ts')
  return registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(process.pid), startedByTheProduct: true, actor: t.api.HUMAN })
}
async function aloneDot(who: Agent) {
  const { participantPresence } = await import('../src/server/lib/presence.ts')
  return participantPresence({ kind: 'agent', id: who.id }, 'default')
}
async function presenceDoor(who: Agent) {
  const reply = await app.inject({ method: 'GET', url: `/api/presence?of=agent:${who.id}`, headers: person })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json().presence[0]
}
async function theOffice(who: Agent, asked?: string[]) {
  const { readTheOffice } = await import('../src/server/lib/pixel-office.ts')
  const office = readTheOffice('default', { type: 'human', id: THE_PERSON } as never, 'office', asked)
  const drawn = office.agents().find((one) => one.id === who.id)!
  return { word: office.presenceOf(drawn).presence.word, online: office.onlineOf(drawn) }
}
async function onlineAmongContacts(who: Agent): Promise<boolean> {
  const { whichContactsAreOnline } = await import('../src/server/lib/presence.ts')
  const { everyAgentById } = await import('../src/server/lib/messages.ts')
  return whichContactsAreOnline([{ kind: 'agent', id: who.id }], 'default', { kind: 'person', id: THE_PERSON }, everyAgentById()).has(`agent:${who.id}`)
}

describe('a running run stored under the old id', () => {
  it('is among the runs that may answer as the agent, read for it alone', async () => {
    const who = await registered()
    const session = aRunUnder(await anOldIdFor(who))
    const { theRunRowsOfOneReach } = await import('../src/server/lib/worker.ts')
    expect(theRunRowsOfOneReach(who.id, 'default').map((row) => row.id)).toEqual([session])
  })

  it('in one of the office\'s terminals gives the words "In a terminal" in every reader of the dot', async () => {
    const who = await registered()
    aRunUnder(await anOldIdFor(who), IN_A_TERMINAL)
    expect(await aloneDot(who)).toMatchObject({ colour: 'grey', word: 'In a terminal' })
    expect((await aloneDot(who)).says).toContain('/made/up/folder')
    expect(await presenceDoor(who)).toMatchObject({ colour: 'grey', word: 'In a terminal' })
    expect(await onlineAmongContacts(who)).toBe(true)
    expect(await theOffice(who)).toEqual({ word: 'In a terminal', online: true })
    expect(await theOffice(who, [who.id])).toEqual({ word: 'In a terminal', online: true })
  })
})

describe('a run stored under the old id that waits for the next message', () => {
  it('turns the agent\'s dot green, read alone, and is the conversation a message picks up', async () => {
    const who = await registered()
    const session = aRunUnder(await anOldIdFor(who), {
      state: 'finished', deliveringMessage: 'made-up-answered-letter', providerSession: 'made-up-conversation',
      waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)),
    })
    expect(await aloneDot(who)).toMatchObject({ colour: 'green' })
    const { theAnsweringReading } = await import('../src/server/lib/worker.ts')
    expect(theAnsweringReading(who.id, 'default').answering).toMatchObject({ how: 'a waiting run', session })
  })
})

describe('a run stored under the old id that has ended', () => {
  it('with a process of it still alive is named in the words beside the grey dot', async () => {
    const who = await registered()
    const session = aRunUnder(await anOldIdFor(who), { state: 'finished' })
    await ownProcess(session)
    for (const dot of [await aloneDot(who), await presenceDoor(who)]) {
      expect(dot.colour).toBe('grey')
      expect(dot.says).toContain(session)
    }
  })
})

describe('an id nobody filed as an alias', () => {
  it('is not followed to any agent', async () => {
    const who = await registered()
    const session = aRunUnder('an-id-nobody-filed', IN_A_TERMINAL)
    await ownProcess(session)
    const { theRunRowsOfOneReach } = await import('../src/server/lib/worker.ts')
    expect(theRunRowsOfOneReach(who.id, 'default')).toEqual([])
    expect(await aloneDot(who)).toMatchObject({ colour: 'grey', word: 'Inactive' })
    expect(await presenceDoor(who)).toMatchObject({ colour: 'grey', word: 'Inactive' })
    expect(await onlineAmongContacts(who)).toBe(false)
    expect(await theOffice(who)).toEqual({ word: 'Inactive', online: false })
    expect(await theOffice(who, [who.id])).toEqual({ word: 'Inactive', online: false })
  })
})

describe('the statements', () => {
  /** Each statement prepared while `act` runs that `which` matches, with the plan SQLite makes for it. */
  async function planned(act: () => Promise<unknown>, which: RegExp): Promise<{ text: string; plan: string[] }[]> {
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const seen: string[] = []
    ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
      if (which.test(text)) seen.push(text)
      return prepare(text)
    }
    try { await act() } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
    return [...new Set(seen)].map(text => ({
      text,
      plan: (prepare(`EXPLAIN QUERY PLAN ${text}`).all(...Array((text.match(/\?/g) ?? []).length).fill('made-up')) as { detail: string }[]).map(row => row.detail),
    }))
  }

  it('ask `= ?` and the same conditions with no alias filed, and are planned the same with one filed', async () => {
    const who = await registered()
    aRunUnder(who.id, { state: 'finished' })
    const { theRunRowsOfOneReach } = await import('../src/server/lib/worker.ts')
    const readers = async (): Promise<void> => {
      theRunRowsOfOneReach(who.id, 'default')
      await aloneDot(who)
    }
    const servingAgentId = /'\$\.servingAgentId'\) (=|in) /i
    const which = /'\$\.servingAgentId'\) (=|in) |instr\(coalesce\(json_extract\(/i
    const instr = (text: string) => (text.match(/instr\(/g) ?? []).length
    const before = await planned(readers, which)
    // The session rows the words beside the grey dot read, the runs of the agent's reach, and the runs its dot's answering
    // reading reads.
    expect(before, before.map(one => one.text).join('\n')).toHaveLength(3)
    expect(before.filter(one => servingAgentId.test(one.text)).map(one => one.text.match(servingAgentId)![0])).toEqual([`'$.servingAgentId') = `])
    await anOldIdFor(who)
    const after = await planned(readers, which)
    expect(after).toHaveLength(before.length)
    for (const [i, one] of after.entries()) {
      expect(one.plan, one.text).toEqual(before[i]!.plan)
      expect(one.plan.join('\n'), one.text).not.toMatch(/SCAN (records|r)\b/)
      // The old id is asked of `servingAgentId` alone in the session rows. In the runs it is a fourth name beside the id,
      // the handle and the agent's own record, asked of `servingAgentId` and `servingAgent` wherever the three are.
      if (servingAgentId.test(one.text)) expect(one.text, one.text).toMatch(/'\$\.servingAgentId'\) in \(\?, \?\)/i)
      else expect(instr(one.text), one.text).toBe((instr(before[i]!.text) / 3) * 4)
    }
  })

  it('read the filed aliases at most once for each request, however many agents it reads', async () => {
    const everyone = [await registered(), await registered(), await registered()]
    for (const who of everyone) {
      aRunUnder(await anOldIdFor(who), IN_A_TERMINAL)
      const letter = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'message', title: 'Made-up letter', data: { to: [{ kind: 'agent', id: who.id }], body: 'Made-up words.' } } })
      // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
      expect(letter.statusCode, letter.body).toBe(409)
    }
    const ids = everyone.map(who => who.id)
    const sqlite = t.client.sqlite
    const prepare = sqlite.prepare.bind(sqlite)
    const asks: [string, Record<string, string>][] = [
      ['/api/presence', person],
      [`/api/presence?of=${ids.map(id => `agent:${id}`).join(',')}`, person],
      [`/api/plugin-read/v1/people?agents=${ids.join(',')}`, person],
      ['/api/plugin-read/v1/online', person],
      ['/api/messages/contacts', person],
      ['/api/worker/queue', THE_MESSAGE_WORKER],
      [`/api/messages/conversation?kind=agent&id=${ids[0]}`, person],
      [`/api/messages/conversation?kind=agent&id=${ids[0]}&limit=50`, person],
      ['/api/after-a-compaction', agent(ids[0]!)],
    ]
    const readsOf = new Map<string, number>()
    for (const [url, headers] of asks) {
      let reads = 0
      ;(sqlite as unknown as { prepare: (text: string) => unknown }).prepare = (text: string) => {
        if (/FROM registry_aliases/.test(text) && /registry-aliases\/runs\.ts/.test(new Error().stack ?? '')) reads += 1
        return prepare(text)
      }
      try {
        const reply = await app.inject({ method: 'GET', url, headers })
        expect(reply.statusCode, `${url}: ${reply.body.slice(0, 300)}`).toBe(200)
      } finally { delete (sqlite as unknown as { prepare?: unknown }).prepare }
      readsOf.set(url, reads)
    }
    // Each request that reads the agents' runs follows their aliases, and no request reads them twice.
    expect([...readsOf.values()].filter(reads => reads > 0).length, JSON.stringify([...readsOf])).toBeGreaterThan(0)
    for (const [url, reads] of readsOf) expect(reads, url).toBeLessThanOrEqual(1)
  })
})
