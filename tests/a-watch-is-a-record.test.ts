// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WATCH IS A RECORD: one watch or timer an agent keeps running, and whose it is. Wave 13s round 142, the first part of
 * item 38 of the line's requirements. The kind is declared in
 * src/shared/kinds.ts and its lists in src/shared/watches.ts; src/server/lib/participant-fields.ts is the check that a
 * field holding a participant names one the registries hold.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Two agents are made-up
 * agents with made-up handles, each holding the key the office answered. Every watch here is a made-up watch, and its
 * state file is a path nothing reads.
 *
 * THE CASES, in order, on one world:
 *   1. the kind declares the nine things a watch says: what it does, whose it is, how it runs, when it ends, whom it
 *      wakes and when, its state file, how it restarts each day, when it was last seen alive, and whether it is
 *      running, stopped or ended;
 *   2. an agent files a watch through POST /api/records with its own registry id as holder, and the data is stored as
 *      it was sent, with nothing missing;
 *   3. a holder named by a handle, or by an id no registry row answers to, is refused with 400 in a sentence naming
 *      the id sent and where the registry ids are listed, and nothing is written;
 *   4. a change of the holder to an id nobody answers to is refused and leaves the record as it was; a change to
 *      another real agent, and a change of the state and the time last seen alive, are written;
 *   5. a change that leaves the holder as it is, on a watch whose stored holder no registry row answers to by that id,
 *      is written: only a value the write changes is asked about;
 *   6. a change of another record into a watch, which brings back from `extra` a holder naming nobody, is refused, and
 *      the record keeps its kind;
 *   7. the holder is a field the record page draws as a name, from the one table that lists such fields.
 *
 * MUTATIONS, each run alone after a green control and restored after (29 October 2026):
 *   - the create path no longer asks about the participants named: case 3 is red;
 *   - the patch path no longer asks: cases 4 and 6 are red;
 *   - every participant field is asked about, changed or not: case 5 is red;
 *   - `watch` is taken out of PARTICIPANT_FIELDS: cases 3, 4, 6 and 7 are red;
 *   - `process_group` is taken out of the ways a watch runs: case 1 is red.
 */

import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { KIND_SPECS } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { namesAParticipant } from '../src/shared/sections.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const KEEPER = 'watch-keeper-worker'
const OTHER = 'watch-other-worker'

let t: TestDb
let app: FastifyInstance
const PERSON: Record<string, string> = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const keys = new Map<string, string>()
const ids = new Map<string, string>()

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

const idOf = (handle: string): string => {
  const id = ids.get(handle)
  if (id === undefined || id === '') throw new Error(`the test registered no agent ${handle}`)
  return id
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body?.error === 'string' ? body.error : '', raw: reply.body }
}

/** How many watches the table holds, deleted or not. */
function watchesStored(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'watch'").get() as { n: number }).n
}

/** One record as the table holds it. */
function stored(id: string): { kind: string; data: Record<string, unknown> } {
  const row = t.client.sqlite.prepare('SELECT kind, data FROM records WHERE id = ?').get(id) as { kind: string; data: string } | undefined
  if (row === undefined) throw new Error(`no record ${id}`)
  return { kind: row.kind, data: JSON.parse(row.data) as Record<string, unknown> }
}

/** A made-up watch held by the agent named. */
function aWatchHeldBy(holderId: string): Record<string, unknown> {
  return {
    does: 'Made-up: reads the made-up queue every ten minutes and says when it grows.',
    holder: { kind: 'agent', id: holderId },
    runsAs: 'background_task',
    endsWhen: { condition: 'the made-up queue is empty' },
    wakes: 'Made-up: wakes its holder when the made-up queue holds more than five entries.',
    stateFile: '/made-up/watch/state.json',
    dailyRestart: 'Made-up: a system timer starts it again at 06:00 each day.',
    lastSeenAlive: '2026-10-29 08:40',
    state: 'running',
  }
}

async function fileAWatch(by: Record<string, string>, data: Record<string, unknown>, title = 'A made-up watch on the made-up queue') {
  return call('POST', '/api/records', by, { kind: 'watch', title, summary: 'A made-up watch kept by a made-up worker.', data })
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const handle of [KEEPER, OTHER]) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role: THE_WORKER })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  // The rest of this file tells a handle from a registry id, so the two have to differ here.
  expect(idOf(KEEPER)).not.toBe(KEEPER)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a watch', () => {
  it('1. declares the nine things a watch says', () => {
    const spec = KIND_SPECS.watch
    expect(spec, 'there is no kind called watch').toBeDefined()
    const field = (key: string) => {
      const found = spec.fields.find((one) => one.key === key)
      expect(found, `a watch declares no ${key}`).toBeDefined()
      return found!
    }
    expect(field('does').type).toBe('string')
    expect(field('holder').type).toBe('ParticipantRef')
    expect(field('runsAs').type).toBe("'background_task' | 'system_timer' | 'process_group'")
    expect(field('endsWhen').type).toBe('date | PauseUntil')
    expect(field('wakes').type).toBe('string')
    expect(field('stateFile').type).toBe('string')
    expect(field('dailyRestart').type).toBe('string')
    expect(field('lastSeenAlive').type).toBe('date')
    expect(field('state').type).toBe("'running' | 'stopped' | 'ended'")
    for (const key of ['does', 'holder', 'runsAs', 'state']) expect(field(key).required, `${key} is not required`).toBe(true)
    for (const key of ['endsWhen', 'wakes', 'stateFile', 'dailyRestart', 'lastSeenAlive']) expect(field(key).required, `${key} is required`).toBe(false)
  })

  it('2. is filed by an agent with its own registry id as holder, and stored as it was sent', async () => {
    const data = aWatchHeldBy(idOf(KEEPER))
    const filed = await fileAWatch(as(KEEPER), data)
    expect(filed.status, filed.raw).toBe(201)
    expect(filed.body.record.kind).toBe('watch')
    expect(filed.body.record.data).toEqual(data)
    expect(filed.body.incomplete).toEqual([])
    const read = await call('GET', `/api/records/${filed.body.record.id}`, as(KEEPER))
    expect(read.status, read.raw).toBe(200)
    expect(read.body.record.data).toEqual(data)
  })

  it('3. refuses a holder named by a handle, or by an id nobody answers to, and writes nothing', async () => {
    const before = watchesStored()
    for (const [by, holder] of [
      [as(KEEPER), { kind: 'agent', id: KEEPER }],
      [PERSON, { kind: 'agent', id: 'made-up-nobody' }],
      [as(KEEPER), { kind: 'person', id: 'made-up-nobody' }],
    ] as const) {
      const refused = await fileAWatch(by, { ...aWatchHeldBy(idOf(KEEPER)), holder })
      expect(refused.status, refused.raw).toBe(400)
      expect(refused.error).toContain(`data.holder names the ${holder.kind} "${holder.id}"`)
      expect(refused.error).toContain('registry id')
      expect(refused.error).toContain('GET /api/participants')
      expect(refused.error).toContain('Nothing was written.')
    }
    expect(watchesStored()).toBe(before)
  })

  it('4. refuses a change of the holder to nobody, and writes a change to a real agent or of its state', async () => {
    const filed = await fileAWatch(as(KEEPER), aWatchHeldBy(idOf(KEEPER)))
    expect(filed.status, filed.raw).toBe(201)
    const id = String(filed.body.record.id)
    const before = stored(id)

    const refused = await call('PATCH', `/api/records/${id}`, as(KEEPER), { dataPatch: { holder: { kind: 'agent', id: OTHER } } })
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.error).toContain(`data.holder names the agent "${OTHER}"`)
    expect(stored(id)).toEqual(before)

    const moved = await call('PATCH', `/api/records/${id}`, as(KEEPER), { dataPatch: { holder: { kind: 'agent', id: idOf(OTHER) } } })
    expect(moved.status, moved.raw).toBe(200)
    expect(stored(id).data['holder']).toEqual({ kind: 'agent', id: idOf(OTHER) })

    const stopped = await call('PATCH', `/api/records/${id}`, as(OTHER), { dataPatch: { state: 'stopped', lastSeenAlive: '2026-10-29 09:10' } })
    expect(stopped.status, stopped.raw).toBe(200)
    expect(stored(id).data['state']).toBe('stopped')
    expect(stored(id).data['lastSeenAlive']).toBe('2026-10-29 09:10')
  })

  it('5. writes a change that leaves the holder as it is, though no registry row answers to the stored id', async () => {
    const filed = await fileAWatch(as(KEEPER), aWatchHeldBy(idOf(KEEPER)))
    expect(filed.status, filed.raw).toBe(201)
    const id = String(filed.body.record.id)
    // AN ID STORED BEFORE NO ROW ANSWERED TO IT, as an agent's old id does once it has a new one. Written straight into
    // the table, because no write through the office may store one now.
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.holder.id', 'made-up-old-id') WHERE id = ?").run(id)
    const ended = await call('PATCH', `/api/records/${id}`, as(KEEPER), { dataPatch: { state: 'ended' } })
    expect(ended.status, ended.raw).toBe(200)
    expect(stored(id).data['state']).toBe('ended')
    expect(stored(id).data['holder']).toEqual({ kind: 'agent', id: 'made-up-old-id' })
  })

  it('6. refuses a change of another record into a watch that brings back a holder naming nobody', async () => {
    // A KIND CHANGE SENDS NO DATA, and brings back from `extra` each field the new kind declares, so this is how a holder
    // reaches a watch through a change of kind.
    const note = await call('POST', '/api/records', as(KEEPER), {
      kind: 'note',
      title: 'A made-up note',
      data: { body: 'Made-up words.', extra: { holder: { kind: 'agent', id: KEEPER } } },
    })
    expect(note.status, note.raw).toBe(201)
    const id = String(note.body.record.id)
    const refused = await call('PATCH', `/api/records/${id}`, as(KEEPER), { kind: 'watch' })
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.error).toContain(`data.holder names the agent "${KEEPER}"`)
    expect(stored(id).kind).toBe('note')
  })

  it('7. has its holder drawn as a name on the record page', () => {
    expect(namesAParticipant('watch', 'holder')).toBe(true)
  })
})
