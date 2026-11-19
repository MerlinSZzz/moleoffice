// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S KEY IS STORED WITH ITS SESSION RECORD, OR NEITHER IS. Wave 13m round 4, piece c4.
 *
 * POST /api/records mints a key for a running session that the office files with its own key, or
 * that the served agent's registered starter files with its key. The key's `held_keys` row id is
 * written onto the record as `data.extra.runKeyId`, by a second write after the create. Before this
 * piece, when that second write failed, the key was revoked but the session record, its change row
 * and its revision stayed: a run record that says nothing about the key it was minted.
 *
 * Now the create, the mint and the write of runKeyId are one sqlite transaction (`mintARunKey` in
 * src/server/api/records.ts). This file proves it on both mint paths:
 *
 *   1. the ordinary path still answers `runKey`, and the record carries the id of a live key row;
 *   2. when the runKeyId write fails, no session record, no `held_keys` row, no change row and no
 *      revision are left, and no key is answered.
 *
 * HOW THE WRITE IS MADE TO FAIL. A temporary trigger on this test's own database connection refuses
 * any UPDATE of `records` whose new data carries `extra.runKeyId`. The route, the create, the mint
 * and `patchRecord` all run as they do in the product; only the database refuses the last write.
 * The trigger is dropped after each case.
 *
 * MUTATION PROOF (after a green control): in src/server/api/records.ts, move the
 * `mintARunKey(created.record, actor)` call out of the `sqlite.transaction` and after it. Case 2 goes
 * red on both paths: the session record and its change row are left behind.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AN_OFFICE_KEY = randomBytes(32).toString('hex')
const A_PERSON_KEY = randomBytes(32).toString('hex')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': AN_OFFICE_KEY,
}

function asAgent(handle: string, key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

/** Whether a value is a key, as a yes or no, so a failing assertion never prints a key. */
function isAKey(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

async function ask(url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function register(handle: string, by: Record<string, string>): Promise<string> {
  const made = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role: 'supervisor' })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const key = (made.body['whatToGiveIt'] as { key?: unknown } | undefined)?.key
  expect(isAKey(key), `the registration of ${handle} answered no key`).toBe(true)
  return String(key)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

function count(sql: string, ...params: unknown[]): number {
  return (t.client.sqlite.prepare(sql).get(...params) as { n: number }).n
}

/** Everything a failed mint might leave behind, counted. */
function whatIsStored(title: string): { records: number; heldKeys: number; changes: number; revisions: number } {
  return {
    records: count('SELECT count(*) AS n FROM records WHERE title = ?', title),
    heldKeys: count('SELECT count(*) AS n FROM held_keys'),
    changes: count('SELECT count(*) AS n FROM changes'),
    revisions: count('SELECT count(*) AS n FROM revisions'),
  }
}

/** File a running session serving `handle`. */
async function fileARun(handle: string, headers: Record<string, string>, title: string, extra: Record<string, unknown> = {}) {
  return ask('/api/records', headers, {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', servingAgentId: idOf(handle), servingAgent: handle, ...extra },
  })
}

/** Make the database refuse the write that puts runKeyId on a record. */
function refuseTheRunKeyIdWrite(): void {
  t.client.sqlite.exec(
    "CREATE TEMP TRIGGER refuse_the_run_key_id BEFORE UPDATE ON records " +
      "WHEN json_extract(NEW.data, '$.extra.runKeyId') IS NOT NULL " +
      "BEGIN SELECT RAISE(ABORT, 'this test refuses the runKeyId write'); END",
  )
}

let starterKey = ''

beforeAll(async () => {
  t = await freshDb()
  // THE OFFICE'S KEY FILE IS WRITTEN BEFORE THE SERVER IS BUILT, so the key this test sends as the
  // office is the one the server reads.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_PERSON_KEY, office: AN_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  starterKey = await register('the-launcher', AS_THE_PERSON)
  await register('office-served', AS_THE_PERSON)
  await register('starter-served', asAgent('the-launcher', starterKey))
}, 60_000)

afterEach(() => {
  t.client.sqlite.exec('DROP TRIGGER IF EXISTS temp.refuse_the_run_key_id')
})

afterAll(async () => {
  await app.close()
  t.close()
})

const PATHS = [
  { name: 'the office’s key', handle: 'office-served', headers: () => AS_THE_OFFICE_WORKER, extra: { startedByMoleOffice: true } },
  { name: 'the registered starter’s key', handle: 'starter-served', headers: () => asAgent('the-launcher', starterKey), extra: {} },
] as const

describe.each(PATHS)('a run key minted on $name', ({ handle, headers, extra }) => {
  it('is answered, and the record carries the id of its live key row', async () => {
    const title = `${handle} ordinary run`
    const filed = await fileARun(handle, headers(), title, extra)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(isAKey((filed.body['runKey'] as { key?: unknown } | undefined)?.key), 'no run key was answered').toBe(true)
    const id = String((filed.body['record'] as { id: string }).id)
    const row = t.client.sqlite.prepare("SELECT json_extract(data, '$.extra.runKeyId') AS k FROM records WHERE id = ?").get(id) as { k: string | null }
    expect(row.k).not.toBeNull()
    expect(count('SELECT count(*) AS n FROM held_keys WHERE id = ? AND revoked_at IS NULL', row.k)).toBe(1)
  })

  it('leaves no session record, no key row and no change row when runKeyId cannot be written', async () => {
    const title = `${handle} run whose runKeyId write fails`
    const before = whatIsStored(title)
    expect(before.records).toBe(0)
    refuseTheRunKeyIdWrite()
    const filed = await fileARun(handle, headers(), title, extra)
    expect(filed.status, JSON.stringify(filed.body)).not.toBe(201)
    // REFUSED BY THE TRIGGER, and not for some other reason the ordinary case above did not meet.
    expect(String(filed.body['error'])).toContain('this test refuses the runKeyId write')
    expect(filed.body['runKey'], 'a key was answered for a run that was not stored').toBeUndefined()
    expect(whatIsStored(title)).toEqual(before)
  })
})

it('keeps the original key binding immediately after create and refuses an intervening write with 409', async () => {
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const folder = mkdtempSync(join(process.cwd(), '.logs', 'first-run-mint-'))
  const evidence: Record<string, unknown> = { synthetic: true, method: 'actual session HTTP door and real writers; only the intervening office write is a controlled fault' }
  const save = () => writeFileSync(join(folder, 'binding-order-and-refusal.json'), JSON.stringify(evidence, null, 2))
  const revisions = (id: string) => t.client.sqlite.prepare('SELECT seq, op, data FROM revisions WHERE record_id = ? ORDER BY seq').all(id) as { seq: number; op: string; data: string }[]
  const publicReply = (reply: Awaited<ReturnType<typeof ask>>) => ({ status: reply.status,
    error: reply.body['error'] ?? null, answeredKey: isAKey((reply.body['runKey'] as { key?: unknown } | undefined)?.key) })
  const ordinary = await fileARun('office-served', AS_THE_OFFICE_WORKER, 'Synthetic first binding before ordinary updates', { startedByMoleOffice: true })
  evidence['ordinary'] = publicReply(ordinary); save()
  expect(ordinary.status).toBe(201)
  const id = String((ordinary.body['record'] as { id: string }).id), first = revisions(id)
  evidence['originalRevisions'] = first; save()
  expect(first.slice(0, 2).map(one => ({ seq: one.seq, op: one.op }))).toEqual([{ seq: 1, op: 'create' }, { seq: 2, op: 'update' }])
  const storedKeyId = (t.api.getRecord(id)!.data['extra'] as { runKeyId: string }).runKeyId
  expect(JSON.parse(first[0]!.data).extra?.runKeyId).toBeUndefined()
  expect(JSON.parse(first[1]!.data).extra.runKeyId).toBe(storedKeyId)
  const ownKey = String((ordinary.body['runKey'] as { key: string }).key)
  const later = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: {
    ...asAgent('office-served', ownKey), 'x-mole-office-session': id,
  }, payload: { dataPatch: { doing: 'Synthetic ordinary update after mint.' } } })
  evidence['laterUpdateStatus'] = later.statusCode; save()
  expect(later.statusCode).toBe(200)
  expect(JSON.parse(revisions(id)[1]!.data).extra.runKeyId).toBe(storedKeyId)

  const title = 'Synthetic office write before the first key binding', before = whatIsStored(title)
  let intervened = 0
  const create = t.api.createRecordWithReport
  const observed = vi.spyOn(t.api, 'createRecordWithReport').mockImplementation(input => {
    const made = create(input)
    if (input.kind === 'session' && input.title === title) {
      t.api.patchRecord(made.record.id, { dataPatch: { doing: 'Synthetic intervening office write.' } }, input.actor)
      intervened++
      evidence['interveningRevisions'] = revisions(made.record.id)
    }
    return made
  })
  const refused = await (async () => { try { return await fileARun('office-served', AS_THE_OFFICE_WORKER, title, { startedByMoleOffice: true }) } finally { observed.mockRestore() } })()
  const after = whatIsStored(title)
  evidence['intervened'] = intervened; evidence['refused'] = publicReply(refused); evidence['before'] = before; evidence['after'] = after; save()
  expect(intervened).toBe(1)
  const middle = evidence['interveningRevisions'] as { seq: number; op: string; data: string }[]
  expect(middle.map(one => ({ seq: one.seq, op: one.op }))).toEqual([{ seq: 1, op: 'create' }, { seq: 2, op: 'update' }])
  expect(JSON.parse(middle[1]!.data).extra?.runKeyId).toBeUndefined()
  expect(refused.status).toBe(409)
  expect(refused.body['error']).toBe("The original run-key mint needs its running session's first create and its own fresh key row. Its binding was not written.")
  expect(refused.body['runKey']).toBeUndefined()
  expect(after).toEqual(before)
})
