// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { SLEEP_TIME_LONGEST_MINUTES, SLEEP_TIME_SHORTEST_MINUTES } from '../src/shared/residents.ts'
import { t as say } from '../src/shared/i18n.ts'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'

const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

let t: TestDb
let app: FastifyInstance
let proposals: typeof import('../src/web/components/ResidentProposals.tsx')
let sleepWindows: typeof import('../src/server/lib/sleep-windows.ts')
let residents: typeof import('../src/server/lib/residents.ts')
let time: typeof import('../src/shared/time.ts')

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

async function inject(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
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
const idOf = (handle: string): string => agents.get(handle)!.id

function count(sql: string, ...args: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...args) as { n: number }).n
}

const proposalsFiled = (): number => count("SELECT count(*) AS n FROM records WHERE kind = 'proposal'")
const theSpaceOf = (agentId: string): string => join(dirname(t.file), 'personal-spaces', agentId)

async function propose(handle: string, sleepTime: unknown): Promise<Reply> {
  return inject('POST', '/api/residents/proposals', as('sec-made-up'), {
    agentId: idOf(handle),
    because: 'It has done steady work here for weeks.',
    ...(sleepTime === undefined ? {} : { sleepTime }),
  })
}

async function confirm(proposalId: string): Promise<Reply> {
  return inject('POST', `/api/residents/proposals/${String(proposalId)}/confirm`, AS_THE_PERSON)
}

async function makeAResident(handle: string): Promise<Reply> {
  const proposed = await propose(handle, A_SLEEP_TIME)
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await confirm(proposed.json['proposal'].id)
  expect(confirmed.status, confirmed.text).toBe(200)
  return confirmed
}

async function setTheTime(handle: string, headers: Record<string, string>, startsAt: string, minutes: number): Promise<Reply> {
  return inject('PUT', `/api/residents/${idOf(handle)}/sleep-time`, headers, { startsAt, minutes })
}

async function theReading(handle: string): Promise<Record<string, any>> {
  const read = await inject('GET', `/api/residents/${idOf(handle)}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return read.json['resident'] as Record<string, any>
}

function theAgentRow(agentId: string): Record<string, unknown> {
  return t.client.sqlite
    .prepare('SELECT resident_since, sleep_time_starts, sleep_time_minutes, sleep_time_set_at, sleep_time_set_by FROM agents WHERE id = ?')
    .get(agentId) as Record<string, unknown>
}

function refusalOf(run: () => unknown): string {
  try {
    run()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('It was not refused.')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  proposals = await import('../src/web/components/ResidentProposals.tsx')
  sleepWindows = await import('../src/server/lib/sleep-windows.ts')
  residents = await import('../src/server/lib/residents.ts')
  time = await import('../src/shared/time.ts')
  await started('sec-made-up', 'secretary')
  for (const handle of ['res-a', 'res-b', 'res-c', 'res-d', 'res-e', 'res-f', 'res-g']) await started(handle, 'worker')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a residency proposal and the sleep time it carries', () => {
  it('1: a proposal that names no sleep time is refused in plain words, and writes nothing', async () => {
    const before = proposalsFiled()
    const refused = await propose('res-a', undefined)
    expect(refused.status, refused.text).toBe(400)
    expect(String(refused.json['error'])).toContain('Every permanent resident has a sleep time')
    expect(String(refused.json['error'])).toContain('Nothing was written.')
    expect(proposalsFiled()).toBe(before)
  })

  it('2: a time that is not a time of day, or a length outside the bounds, is refused with the reader’s own words', async () => {
    const before = proposalsFiled()
    for (const sent of [
      { startsAt: '25:00', minutes: 60 },
      { startsAt: '03:61', minutes: 60 },
      { startsAt: '03:00', minutes: SLEEP_TIME_SHORTEST_MINUTES - 1 },
      { startsAt: '03:00', minutes: SLEEP_TIME_LONGEST_MINUTES + 1 },
    ]) {
      const refused = await propose('res-a', sent)
      expect(refused.status, refused.text).toBe(400)
      expect(String(refused.json['error'])).toBe(refusalOf(() => residents.readTheSleepTime(sent)))
      expect(proposalsFiled()).toBe(before)
    }
  })

  it('3: a time sent as “3.00” is kept as 03:00 and answered in the reply, the list and the evidence', async () => {
    const proposed = await propose('res-a', { startsAt: '3.00', minutes: 90 })
    expect(proposed.status, proposed.text).toBe(201)
    expect(proposed.json['proposal'].sleepTime).toEqual({ startsAt: '03:00', minutes: 90 })
    const id = proposed.json['proposal'].id

    const listed = await inject('GET', '/api/residents', AS_THE_PERSON)
    expect(listed.status, listed.text).toBe(200)
    const open = (listed.json['openProposals'] as Record<string, any>[]).find((one) => one['id'] === id)
    expect(open?.sleepTime).toEqual({ startsAt: '03:00', minutes: 90 })

    const evidence = (t.api.getRecord(id)!.data['evidence'] as string[]).join(' ')
    expect(evidence).toContain('03:00')
    expect(evidence).toContain('90 minutes')
  })

  it('4: the confirm writes the time as an agent’s, and says when it begins and how long it lasts', async () => {
    const proposed = await propose('res-b', { startsAt: '03:00', minutes: 90 })
    expect(proposed.status, proposed.text).toBe(201)
    const confirmed = await confirm(proposed.json['proposal'].id)
    expect(confirmed.status, confirmed.text).toBe(200)
    expect(String(confirmed.json['said'])).toContain('03:00')
    expect(String(confirmed.json['said'])).toContain('90 minutes')

    const read = await theReading('res-b')
    expect(read.sleep.sleepTime).toMatchObject({ startsAt: '03:00', minutes: 90, setBy: { kind: 'agent', id: idOf('res-b') } })
    expect(read.sleep.sleepTime.nextBeginsAt).toEqual(expect.any(String))
    expect(theAgentRow(idOf('res-b'))).toMatchObject({ sleep_time_starts: '03:00', sleep_time_minutes: 90, sleep_time_set_by: 'agent' })
  })

  it('5: a confirm that fails at the folder writes no time and makes nobody a resident', async () => {
    const agentId = idOf('res-c')
    mkdirSync(theSpaceOf(agentId), { recursive: true })
    const proposed = await propose('res-c', { startsAt: '03:00', minutes: 90 })
    expect(proposed.status, proposed.text).toBe(201)
    const refused = await confirm(proposed.json['proposal'].id)
    expect(refused.status, refused.text).toBe(409)
    expect(refused.json['code']).toBe('residentFolderAlreadyThere')
    expect(theAgentRow(agentId)).toMatchObject({ resident_since: null, sleep_time_starts: null, sleep_time_minutes: null, sleep_time_set_by: null })
  })

  it('6: an old proposal without a time is refused before any folder is made, and can still be declined', async () => {
    const agentId = idOf('res-d')
    const proposed = await propose('res-d', A_SLEEP_TIME)
    expect(proposed.status, proposed.text).toBe(201)
    const id = proposed.json['proposal'].id
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.extra.residency.sleepTime') WHERE id = ?").run(id)
    const decisions = count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")

    const refused = await confirm(id)
    expect(refused.status, refused.text).toBe(409)
    expect(refused.json['code']).toBe('residentProposalHasNoSleepTime')
    expect(String(refused.json['error'])).toContain('filed before a proposal had to name a sleep time')
    expect(existsSync(theSpaceOf(agentId))).toBe(false)
    expect(count("SELECT count(*) AS n FROM records WHERE kind = 'decision'")).toBe(decisions)
    expect(theAgentRow(agentId)).toMatchObject({ resident_since: null, sleep_time_starts: null })
    const listed = await inject('GET', '/api/residents', AS_THE_PERSON)
    expect((listed.json['openProposals'] as { id: string }[]).map((one) => one.id)).toContain(id)

    const declined = await inject('POST', `/api/residents/proposals/${String(id)}/decline`, AS_THE_PERSON, { because: 'A made-up reason.' })
    expect(declined.status, declined.text).toBe(200)
    expect(((await inject('GET', '/api/residents', AS_THE_PERSON)).json['openProposals'] as { id: string }[]).map((one) => one.id)).not.toContain(id)
  })

  it('7: a resident without the secretary card sets and changes its sleep time, itself and with the person', async () => {
    await makeAResident('res-e')
    const before = await theReading('res-e')
    expect(before.holdsTheSecretaryCard).toBe(false)

    const byItself = await setTheTime('res-e', as('res-e'), '4:30', 45)
    expect(byItself.status, byItself.text).toBe(200)
    expect(byItself.json['sleep'].sleepTime).toMatchObject({ startsAt: '04:30', minutes: 45, setBy: { kind: 'agent', id: idOf('res-e') } })

    const byThePerson = await setTheTime('res-e', AS_THE_PERSON, '05:15', 30)
    expect(byThePerson.status, byThePerson.text).toBe(200)
    expect(byThePerson.json['sleep'].sleepTime).toMatchObject({ startsAt: '05:15', minutes: 30, setBy: { kind: 'person', id: THE_PERSON } })
    expect(theAgentRow(idOf('res-e'))).toMatchObject({ sleep_time_starts: '05:15', sleep_time_minutes: 30, sleep_time_set_by: 'person' })
  })

  it('8: the sleep clock begins the sleep of a resident without the card when its time opens', async () => {
    await makeAResident('res-f')
    expect((await theReading('res-f')).holdsTheSecretaryCard).toBe(false)
    const zone = time.theClockZone()
    const opens = Math.ceil((Date.now() + 2 * 60_000) / 60_000) * 60_000
    const set = await setTheTime('res-f', as('res-f'), time.stampInZone(opens, zone).slice(11, 16), 60)
    expect(set.status, set.text).toBe(200)

    const minute = sleepWindows.aMinuteOfTheSleepClock(opens + 60_000)
    expect(minute.began).toContain(idOf('res-f'))
    const read = await theReading('res-f')
    expect(read.sleep.asleep).not.toBeNull()
    expect(read.sleep.asleep.wakesAt).toBe(time.stampInZone(opens + 60 * 60_000, zone))
  })

  it('9: Home’s row draws the proposed time, and an old proposal says none was proposed', async () => {
    const proposed = await propose('res-g', { startsAt: '03:00', minutes: 90 })
    expect(proposed.status, proposed.text).toBe(201)
    const proposal = proposed.json['proposal']

    const drawn = renderToStaticMarkup(
      h(proposals.ResidentProposalRow, { proposal, limitBytes: 500 * 1024 * 1024, answer: null, thePerson: true, onPressed: () => {} }),
    )
    expect(drawn).toContain('data-proposed-sleep-time="set"')
    expect(drawn).toContain(say('resident.proposal.sleepTime', { startsAt: '03:00', minutes: 90 }))

    const old = renderToStaticMarkup(
      h(proposals.ResidentProposalRow, {
        proposal: { ...proposal, sleepTime: null },
        limitBytes: 500 * 1024 * 1024,
        answer: null,
        thePerson: true,
        onPressed: () => {},
      }),
    )
    expect(old).toContain('data-proposed-sleep-time="none"')
    expect(old).toContain(say('resident.proposal.sleepTimeNone'))
  })
})
