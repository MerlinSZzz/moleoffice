// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILING STORED UNDER ITS FILER'S OLD ID IS STILL THAT FILER'S OWN (item 30c, part 3, the guard piece).
 *
 * A legacy agent's id was its handle. One renamed before the re-mint keeps that old id on what it filed, and the re-mint
 * gives it a new id and files an alias from the old one. The guards that ask who filed a request, who brought a package
 * and which agent a package names compared the stored id with the caller's id as strings. So the renamed secretary could
 * press its own request under the person's grant, and could not withdraw it. Each guard now compares canonical ids,
 * through the alias table.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. Every agent, alias, request,
 * package and booking here is made up. The office makes each agent with a new id. The test then files an alias from an
 * old id to it, and writes that old id into the stored filing, which is what a filing made before the re-mint holds.
 *
 *   1. its own request for one press is refused under the grant, and still waits;
 *   2. its own signing package is refused under the grant, and still waits;
 *   3. its own request to go first is refused under the grant, and still waits;
 *   4. it withdraws its own request for one press, by its own key;
 *   5. it withdraws its own signing package, by its own key;
 *   6. the agent a package names, stored under its old id, gives back its hold.
 *
 * MUTATIONS, after a control run: compare the stored filer in `mayPressForThePerson` without its alias, and 1 to 3 go
 * red. Compare without the alias in `withdrawARequest`, in `withdrawAPackage` or in `requireTheNamedAgent`, and 4, 5 or
 * 6 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { AnAnswerAboutADoor } from '../src/shared/what-the-grant-carries.ts'
import { apiApp, freshDb, FOR_THE_PERSON, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const RENAMED = 'renamed-secretary'
const OTHER = 'other-secretary'
const NAMED = 'renamed-worker'
const AHEAD = 'ahead-worker'
const RENAMED_OLD_ID = 'secretary-before-its-rename'
const NAMED_OLD_ID = 'worker-before-its-rename'

let t: TestDb
let app: FastifyInstance
let setThisOfficesAnswer: (door: string, answer: AnAnswerAboutADoor | 'default', who: never) => unknown
const PERSON: Record<string, string> = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const keys = new Map<string, string>()
const ids = new Map<string, string>()
const answered = new Set<string>()
let settingValue = 40

const as = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; error: string; raw: string }> {
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

function answer(door: string, said: AnAnswerAboutADoor): void {
  setThisOfficesAnswer(door, said, { type: 'human', id: THE_PERSON } as never)
  answered.add(door)
}

const readAll = (sql: string, ...values: unknown[]): string => JSON.stringify(t.client.sqlite.prepare(sql).all(...values))
const theRequest = (id: string): string => readAll('SELECT state, outcome FROM one_press_requests WHERE id = ?', id)
const thePackage = (id: string): string =>
  readAll('SELECT * FROM signing_packages WHERE id = ?', id) + readAll('SELECT * FROM signing_package_items WHERE package_id = ? ORDER BY position', id)

/** What a filing made before the re-mint holds: the old id, where the office wrote the new one. */
function storedUnderTheOldId(table: 'one_press_requests' | 'signing_packages', column: 'asked_by' | 'brought_by' | 'for_agent', id: string, oldId: string): void {
  const written = t.client.sqlite.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`).run(oldId, id)
  expect(written.changes).toBe(1)
}

async function aSettingRequest(by: string): Promise<string> {
  settingValue += 1
  const filed = await call('POST', '/api/one-press', as(by), { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: settingValue }, because: 'A made-up reason.' })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.body.request.id)
}

async function aPackage(by: string, carriedOut: 'at-the-signature' | 'by-the-named-agent'): Promise<string> {
  settingValue += 1
  const item = { act: 'change-a-setting', inputs: { panel: 'settings.whatiskept', setting: 'keepBackups', value: settingValue }, why: 'A made-up reason.', carriedOut }
  const brought = await call('POST', '/api/signing-packages', as(by), { forAgent: NAMED, task: 'A made-up task', items: [item] })
  expect(brought.status, brought.raw).toBe(201)
  return String(brought.body.package.id)
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  t = await freshDb()
  ;(await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority()
  setThisOfficesAnswer = (await import('../src/server/lib/what-the-grant-carries.ts')).setThisOfficesAnswer as never
  app = (await apiApp()).app
  await app.ready()
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  for (const [handle, role] of [[RENAMED, 'secretary'], [OTHER, 'secretary'], [NAMED, 'worker'], [AHEAD, 'worker']] as const) {
    const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role })
    expect(started.status, started.raw).toBe(201)
    keys.set(handle, String(started.body.whatToGiveIt?.key ?? ''))
    ids.set(handle, String(started.body.agent?.id ?? ''))
  }
  const raised = await call('POST', `/api/roles/elevation/${RENAMED}`, PERSON, { reason: 'A made-up raise for this test.' })
  expect(raised.status, raised.raw).toBe(201)
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [
    { namespace: 'agent-registry', aliasId: RENAMED_OLD_ID, canonicalId: ids.get(RENAMED)! },
    { namespace: 'agent-registry', aliasId: NAMED_OLD_ID, canonicalId: ids.get(NAMED)! },
  ])
}, 60_000)

afterEach(() => {
  for (const door of answered) setThisOfficesAnswer(door, 'default', { type: 'human', id: THE_PERSON } as never)
  answered.clear()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a secretary renamed before the re-mint, pressing for the person what it filed under its old id', () => {
  it('1: its own request for one press is refused, and still waits', async () => {
    const id = await aSettingRequest(RENAMED)
    storedUnderTheOldId('one_press_requests', 'asked_by', id, RENAMED_OLD_ID)
    answer('one-press.agree', 'may-press')
    const before = theRequest(id)
    const refused = await call('POST', `/api/one-press/${id}/agree`, as(RENAMED), FOR_THE_PERSON)
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press one-press.agree on something the same secretary filed')
    expect(theRequest(id)).toBe(before)
  })

  it('2: its own signing package is refused, and still waits', async () => {
    const id = await aPackage(RENAMED, 'at-the-signature')
    storedUnderTheOldId('signing_packages', 'brought_by', id, RENAMED_OLD_ID)
    answer('signing-packages.sign', 'may-press')
    const before = thePackage(id)
    const refused = await call('POST', `/api/signing-packages/${id}/sign`, as(RENAMED), { struck: [], ...FOR_THE_PERSON })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press signing-packages.sign on something the same secretary filed')
    expect(thePackage(id)).toBe(before)
  })

  it('3: its own request to go first is refused, and still waits', async () => {
    const aBooking = async (who: string, start: 'now' | { at: string }): Promise<string> => {
      const booked = await call('POST', '/api/bookings', as(who), { resource: 'gpu', gib: 1, minutes: 30, purpose: 'a made-up test run', start })
      expect(booked.status, booked.raw).toBe(201)
      return String(booked.body.booking?.id ?? '')
    }
    answer('booking.answer', 'may-press')
    const ahead = await aBooking(AHEAD, 'now')
    const mine = await aBooking(RENAMED, { at: localStamp(new Date(Date.now() + 60 * 60 * 1000)) })
    const asked = await call('POST', `/api/bookings/${mine}/go-first`, as(RENAMED), { ahead })
    expect(asked.status, asked.raw).toBe(200)
    const written = t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.holder.id', ?) WHERE id = ?").run(RENAMED_OLD_ID, mine)
    expect(written.changes).toBe(1)
    const theGoFirst = (): string => readAll("SELECT json_extract(data, '$.goFirst') AS goFirst FROM records WHERE id = ?", mine)
    const before = theGoFirst()
    const refused = await call('POST', `/api/bookings/${mine}/go-first/answer`, as(RENAMED), { ...FOR_THE_PERSON, grant: true })
    expect(refused.status, refused.raw).toBe(403)
    expect(refused.error).toContain('never lets the grant press booking.answer on something the same secretary filed')
    expect(theGoFirst()).toBe(before)
  })
})

describe('an agent renamed before the re-mint, answering for what holds its old id', () => {
  it('4: the secretary withdraws its own request for one press', async () => {
    const id = await aSettingRequest(RENAMED)
    storedUnderTheOldId('one_press_requests', 'asked_by', id, RENAMED_OLD_ID)
    const withdrawn = await call('POST', `/api/one-press/${id}/withdraw`, as(RENAMED))
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body.request.state).toBe('withdrawn')
  })

  it('5: the secretary withdraws its own signing package', async () => {
    const id = await aPackage(RENAMED, 'at-the-signature')
    storedUnderTheOldId('signing_packages', 'brought_by', id, RENAMED_OLD_ID)
    const withdrawn = await call('POST', `/api/signing-packages/${id}/withdraw`, as(RENAMED))
    expect(withdrawn.status, withdrawn.raw).toBe(200)
    expect(withdrawn.body.package.state).toBe('withdrawn')
  })

  it('6: the agent the package names gives back its hold', async () => {
    const id = await aPackage(OTHER, 'by-the-named-agent')
    const signed = await call('POST', `/api/signing-packages/${id}/sign`, PERSON, { struck: [] })
    expect(signed.status, signed.raw).toBe(200)
    storedUnderTheOldId('signing_packages', 'for_agent', id, NAMED_OLD_ID)
    const given = await call('POST', `/api/signing-packages/${id}/give-back`, as(NAMED))
    expect(given.status, given.raw).toBe(200)
    expect(given.body.package.hold).toMatchObject({ open: false, endedHow: 'given-back' })
  })
})
