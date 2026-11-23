// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/office/upgrades?sendId= ANSWERS WITHIN 100 MS ON A LARGE MADE-UP TABLE, IN THE TIMING GROUP. Wave 13t,
 * package SV, point SV-2: the upgrades read by send id answers in under 100 ms on a database the size of the person's.
 *
 * The door asks `lookupDataFolderMoveNotice` first. That read named no index, and SQLite's plan for it was `SEARCH
 * revisions USING INDEX revisions_kind_workspace_seq_idx (kind=?)`: only the kind could be used, so it read every
 * revision of every message, at any place in its record, and parsed each one's data. It now names migration 0301's index
 * of first upgrade notices and that index's WHERE, so it reads only the first revisions of upgrade notices.
 *
 * THE TABLE IS MADE UP, NOT MEASURED. The person's database was not read. The person's office counted 84,109 messages on
 * 4 November 2026. tests/the-office-at-the-live-scale.ts grows that count to 13 November by the growth of the records,
 * which is a guess, and this file reads that guess. Nobody counted the revisions of messages. So this table holds 150,000
 * made-up messages, more than that guess, each with two revisions, so 300,000 revisions of messages: the read before the
 * change read every one of them. One message in eight is a Mole Office line of another kind. Their data is about the
 * 1,333 bytes a message held on average on 9 October. Beside them are 1,000 made-up first revisions of upgrade notices
 * with other send ids, the rows the index holds. That count is a guess too, and well above the notices of any one release.
 *
 * It asks for a send id nobody used, because then no read stops early: each reads all it can reach. The case holds the
 * median of five asks, after one ask that is not counted. An ask over 100 ms stops the asking, so a red run does not wait
 * for four more. It prints, for information only, how long the read before the change takes on the same table.
 *
 * WHAT IT COSTS TO RUN. Nobody has timed the planting. The data alone is 301,000 rows of about 1,333 bytes, so about
 * 400 MB by arithmetic, in the test's own database folder, which is removed when the test process ends.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 *
 * NO RUN OF IT IS CITED AS PROOF. The timing group runs this file.
 *
 * WHAT THIS FILE DOES NOT CATCH. A read that is slow only when its pages are not in memory can stay under 100 ms here.
 * tests/the-upgrades-read-by-send-id-goes-through-the-notice-index.test.ts holds each read to the index, at any size.
 */
import { randomBytes } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { STABLE_UPGRADE_NOTICE_EVENT } from '../src/shared/stable-upgrade-notices.ts'
import { localStamp } from '../src/shared/typed-time.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_LIVE_OFFICE_ON_13_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** SV-2: the read answers within 100 ms. */
const ANSWERS_WITHIN_MS = 100
/** The made-up messages, each planted with two revisions. */
const MESSAGES = 150_000
/** The made-up first revisions of upgrade notices with other send ids: a guess. */
const NOTICES = 1_000
/** The bytes a message's data held on average in the person's office on 9 October 2026. */
const MESSAGE_DATA_BYTES = 1_333
const PROJECT = 'default'
const NOBODY_USED = 'made-up-send-id-nobody-used'

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let t: TestDb
let app: FastifyInstance
let headers: Record<string, string> = {}
const asks: number[] = []
/** The first ask over the limit, which stopped the asking, or null when none was. */
let overTheLimit: { ask: number; ms: number } | null = null
let reply: { status: number; body: string } | null = null
let messageRevisions = 0
let noticeRevisions = 0
let averageDataBytes = 0
/** How long the read before the change took on this table, for information only. */
let theReadBefore: number | null = null

/** One ask of the door, as the made-up agent in its run. */
async function oneAsk(): Promise<{ ms: number; status: number; body: string }> {
  const started = performance.now()
  const answer = await app.inject({ method: 'GET', url: `/api/office/upgrades?sendId=${NOBODY_USED}&limit=1`, headers })
  return { ms: performance.now() - started, status: answer.statusCode, body: answer.body }
}

beforeAll(async () => {
  t = await freshDb()
  const db = t.client.sqlite
  const personKey = randomBytes(32).toString('hex')
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  const webDir = join(dirname(t.file), 'made-up-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit: settings.theServingInstall().commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  const ownerHeaders = { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': personKey }
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: ownerHeaders, payload: { handle: 'made-up-notice-reader', name: 'Made-up notice reader', role: 'worker' } })
  expect(made.statusCode, made.body).toBe(201)
  const agent = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  const run = t.api.createRecord({ workspaceId: PROJECT, kind: 'session', title: 'Made-up notice reader run', data: { state: 'running', servingAgent: agent.agent.id }, actor: t.api.HUMAN }).id
  headers = { 'x-mole-office-workspace': PROJECT, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent.agent.id, 'x-mole-office-key': agent.whatToGiveIt.key, 'x-mole-office-session': run }

  // ---------------------------------------------------------------- the made-up table, straight into the revisions
  const otherLines = Object.keys(SYSTEM_LINES).filter(kind => kind !== STABLE_UPGRADE_NOTICE_EVENT).slice(0, 8)
  const insert = db.prepare('INSERT INTO revisions (id, record_id, workspace_id, seq, content_hash, kind, title, data, op, actor_type, actor_id, at) ' +
    "VALUES (?, ?, ?, ?, ?, 'message', ?, ?, ?, 'agent', ?, ?)")
  const words = 'Made-up words planted by this test. '.repeat(Math.ceil(MESSAGE_DATA_BYTES / 36))
  /** Data of about the average size: the made-up body is cut to fill what the other fields leave. */
  const filled = (data: Record<string, unknown>) => {
    const without = JSON.stringify({ ...data, body: '' }).length
    return JSON.stringify({ ...data, body: words.slice(0, Math.max(0, MESSAGE_DATA_BYTES - without)) })
  }
  const from = new Date(2026, 5, 1).getTime()
  db.transaction(() => {
    for (let i = 0; i < MESSAGES; i++) {
      const line = i % 8 === 0
      const data = line
        ? { sentBy: moleOffice(), to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], notice: otherLines[i % otherLines.length] }
        : { sentBy: { kind: 'agent', id: agent.agent.id }, to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }] }
      const by = line ? moleOffice().id : agent.agent.id
      const at = from + i * 60_000
      insert.run(`made-up-revision-${i}-1`, `made-up-message-${i}`, PROJECT, 1, `made-up-${i}-1`, `A made-up message ${i}`, filled(data), 'create', by, localStamp(new Date(at)))
      insert.run(`made-up-revision-${i}-2`, `made-up-message-${i}`, PROJECT, 2, `made-up-${i}-2`, `A made-up message ${i}`, filled({ ...data, edited: true }), 'update', by, localStamp(new Date(at + 30_000)))
    }
    for (let i = 0; i < NOTICES; i++) {
      const event = { version: 1, project: PROJECT, request: { stage: 'before', sendId: `made-up-other-send-id-${i}` } }
      const data = { sentBy: moleOffice(), to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], notice: STABLE_UPGRADE_NOTICE_EVENT, extra: { [STABLE_UPGRADE_NOTICE_EVENT]: event } }
      insert.run(`made-up-notice-revision-${i}`, `made-up-notice-${i}`, PROJECT, 1, `made-up-notice-${i}`, `A made-up upgrade notice ${i}`, filled(data), 'create', moleOffice().id, localStamp(new Date(from + i * 600_000 + 15_000)))
    }
  })()
  const counted = db.prepare("SELECT count(*) AS n, avg(length(data)) AS bytes FROM revisions WHERE kind = 'message' AND record_id LIKE 'made-up-message-%'").get() as { n: number; bytes: number }
  messageRevisions = counted.n
  averageDataBytes = counted.bytes
  noticeRevisions = (db.prepare("SELECT count(*) AS n FROM revisions WHERE seq = 1 AND op = 'create' AND kind = 'message' AND json_extract(data, '$.notice') = ?").get(STABLE_UPGRADE_NOTICE_EVENT) as { n: number }).n

  // ---------------------------------------------------------------- the asks
  const warm = await oneAsk()
  expect(warm.status, warm.body.slice(0, 400)).toBe(200)
  for (let i = 0; i < 5; i++) {
    const one = await oneAsk()
    reply = { status: one.status, body: one.body }
    expect(one.status, one.body.slice(0, 400)).toBe(200)
    asks.push(one.ms)
    if (one.ms >= ANSWERS_WITHIN_MS) {
      overTheLimit = { ask: i + 1, ms: one.ms }
      break
    }
  }

  // The read before the change, in its own words, for information only.
  const before = db.prepare("SELECT record_id FROM revisions WHERE seq=1 AND kind='message' AND json_extract(data,'$.extra.stableUpgradeNotice.version')=3 AND json_extract(data,'$.extra.stableUpgradeNotice.project')=? AND json_extract(data,'$.extra.stableUpgradeNotice.request.sendId')=? LIMIT 2")
  const started = performance.now()
  before.all(PROJECT, NOBODY_USED)
  theReadBefore = performance.now() - started
}, 900_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

function said(what: string): void {
  console.log(what)
  if (OUT !== '') appendFileSync(`${OUT}.upgrades-by-send-id.log`, `${what}\n`)
}

describe('GET /api/office/upgrades?sendId= on a large made-up table', () => {
  it('reads a table of the size this file says, and finds no notice for a send id nobody used', () => {
    said(`[upgrades by send id timing] ${String(messageRevisions)} revisions of made-up messages, data ${averageDataBytes.toFixed(0)} bytes on average; ${String(noticeRevisions)} first revisions of upgrade notices`)
    expect(MESSAGES, 'more messages than tests/the-office-at-the-live-scale.ts makes up for 13 November').toBeGreaterThan(THE_LIVE_OFFICE_ON_13_NOVEMBER.records['message']!)
    expect(messageRevisions, 'the revisions of the made-up messages').toBe(2 * MESSAGES)
    expect(noticeRevisions, 'the first revisions of upgrade notices').toBe(NOTICES)
    expect(reply?.status, reply?.body.slice(0, 400)).toBe(200)
    expect(JSON.parse(reply?.body ?? 'null'), 'the answer for a send id nobody used').toEqual({ notice: null, narrowedByPermission: null })
  })

  it(`answers in less than ${String(ANSWERS_WITHIN_MS)} ms`, () => {
    said(`[upgrades by send id timing] answered: ${asks.map(ms => ms.toFixed(1)).join(', ')} ms; the read before the change took ${String(theReadBefore?.toFixed(1))} ms on the same table, for information only`)
    expect(overTheLimit, `ask ${String(overTheLimit?.ask)} took ${String(overTheLimit?.ms.toFixed(1))} ms, and the asking stopped there`).toBeNull()
    const median = [...asks].sort((a, b) => a - b)[Math.floor(asks.length / 2)]!
    expect(median, 'the median time one ask took to answer').toBeLessThan(ANSWERS_WITHIN_MS)
  })
})
