// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WEEK-USE NOTICE READS ONLY THE LOGIN IT TELLS OF.
 *
 * Every minute the office asks whether the secretary who takes usage notices is owed a notice that the sandboxes' Claude
 * login has used 50% or 80% of its seven days (`tellTheSecretaryHowMuchOfTheWeekIsUsed` in
 * src/server/lib/logins-week.ts). A notice is only ever about that one login, read from its own rate-limit event. The
 * notice's own reading read every login all the same, and the three logins that read the runs' receipts read every run
 * filed in the last seven days, and the earlier runs of each conversation they named. On a made-up office with the
 * live office's runs that reading took 243 ms of a 382 ms run of the timer.
 *
 * WHAT IS PROVED
 *
 *   2. The notices are the same. At each of six readings, below 50%, at 50%, again within the share, at 80%, stale, and
 *      in a new seven-day count, the notice with its own reading sends what it sends when it is handed every login's
 *      reading of the same moment: the same lines, to the same secretary, with the same words and mark. Each is also
 *      the line written out here, so neither side can be empty for both.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the notice's own reading reads another login than the sandboxes' Claude  → case 2
 *   the notice's own reading reads the sandboxes at another moment           → case 2
 *
 * WHAT THIS DOES NOT PROVE. The time a run takes: a fresh test office holds a few runs and messages, and the times are
 * measured on a made-up office of the live size outside the suite. What the router and the secretary's reading show is
 * proved in tests/the-sandboxes-claude-login-is-read-from-its-own-event.test.ts, and nothing here changes them.
 *
 * Every round, run, figure and agent here is made up. `freshDb` in tests/helpers.ts makes a throwaway database, and the
 * sandboxes' folder is a throwaway folder.
 */
import type { FastifyInstance } from 'fastify'
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { localStamp } from '../src/shared/time.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** THE SANDBOXES' FOLDER, made when the folder's module is first asked for, so the notice's own reading reads it. */
const place = vi.hoisted(() => ({ root: '' }))
vi.mock('../src/config/sandbox-folder.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/sandbox-folder.mjs')>()
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const path = await import('node:path')
  place.root = mkdtempSync(path.join(tmpdir(), 'week-use-notice-'))
  return { ...real, SANDBOXES_FOLDER: place.root }
})

let t: TestDb
let app: FastifyInstance
let week: typeof import('../src/server/lib/logins-week.ts')

const WORKSPACE = 'default'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** The moment the readings start from, in whole seconds so a file's stamp holds it exactly. */
const BASE = Math.floor(Date.now() / 1000) * 1000
const FIRST_RESET = BASE + 3 * DAY
const SECOND_RESET = BASE + 10 * DAY
const THE_FIRST_SECRETARY = 'made-up-sec-one'
const THE_SECOND_SECRETARY = 'made-up-sec-two'
const idOf: Record<string, string> = {}

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER,
    payload: { handle, name: `Made-up ${handle}`, role, ...(role === 'secretary' ? {} : { workArea: ['work'] }) } })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = String((reply.json() as { agent: { id: string } }).agent.id)
}

/** A made-up run, written past the door with the fields a login's receipts are read from, filed at `filedAt`. */
function aRun(data: Record<string, unknown>, filedAt: number): void {
  const record = t.api.createRecord({ kind: 'note', title: 'Made-up run', workspaceId: WORKSPACE, actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, origin: 'fixture' })
  t.client.sqlite.prepare('UPDATE records SET kind = ?, data = ?, created_at = ? WHERE id = ?')
    .run('session', JSON.stringify({ state: 'finished', runtime: 'made-up', ...data }), localStamp(new Date(filedAt)), record.id)
}


let rounds = 0
/** A reading round of one sandbox, last written at `readAtMs`, whose event gives `used` of the seven days to `resetMs`. */
function aReading(used: number, resetMs: number, readAtMs: number): void {
  rounds += 1
  const dir = join(place.root, 'made-up-sandbox', 'logs', `made-up-round-${String(rounds)}`)
  mkdirSync(dir, { recursive: true })
  const command = ['claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose']
  writeFileSync(join(dir, 'start.json'), JSON.stringify({ command }))
  const seconds = (ms: number): number => ms / 1000
  const info = { status: 'allowed', resetsAt: seconds(readAtMs + 3 * HOUR), rateLimitType: 'five_hour', utilization: 0.12,
    unifiedWindows: { five_hour: { utilization: 0.12, resetsAt: seconds(readAtMs + 3 * HOUR) }, seven_day: { utilization: used, resetsAt: seconds(resetMs) } } }
  writeFileSync(join(dir, 'out'), `${JSON.stringify({ type: 'rate_limit_event', rate_limit_info: info, uuid: 'made-up-uuid', session_id: 'made-up-session' })}\n`)
  utimesSync(join(dir, 'out'), seconds(readAtMs), seconds(readAtMs))
}

const THE_OFFICE = (): { type: 'system'; id: string } => ({ type: 'system', id: moleOffice().id })

/** The office's week-use notices written after row `after`, as a reader sees each: whom to, its title, words and mark. */
function theNoticesAfter(after: number): { to: unknown; title: string; body: unknown; mark: unknown }[] {
  const rows = t.client.sqlite
    .prepare("SELECT title, data FROM records WHERE rowid > ? AND kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.extra.loginsWeek') IS NOT NULL ORDER BY rowid")
    .all(after) as { title: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { to: unknown; body: unknown; extra: { loginsWeek: unknown } }
    return { to: data.to, title: row.title, body: data.body, mark: data.extra.loginsWeek }
  })
}
const theLastRow = (): number => (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM records').get() as { n: number }).n


beforeAll(async () => {
  t = await freshDb()
  week = await import('../src/server/lib/logins-week.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register(THE_FIRST_SECRETARY, 'secretary')
  await register(THE_SECOND_SECRETARY, 'secretary')
  // THE FIRST SECRETARY APPOINTED takes the notices while nobody is chosen; the first registered is the first appointed.
  t.client.sqlite.prepare('UPDATE agents SET created_at = ? WHERE id = ?').run('2026-10-01 09:00:00', idOf[THE_FIRST_SECRETARY])
  t.client.sqlite.prepare('UPDATE agents SET created_at = ? WHERE id = ?').run('2026-10-01 09:00:01', idOf[THE_SECOND_SECRETARY])
  // A RUN OF EACH LOGIN THAT READS RECEIPTS, in the seven days, and an earlier run of one conversation before them.
  aRun({ adaptedTool: 'claude-code', providerSession: 'made-up-conversation-a', usageReceipt: { costUsd: 2.5 } }, BASE - HOUR)
  aRun({ adaptedTool: 'claude-code', providerSession: 'made-up-conversation-a', usageReceipt: { costUsd: 1 } }, BASE - 10 * DAY)
  aRun({ adaptedTool: 'codex', providerSession: 'made-up-conversation-b', usageReceipt: { costUsd: 0.75 } }, BASE - 2 * HOUR)
  aRun({ adaptedTool: 'dsh', providerSession: 'made-up-conversation-c', usageReceipt: { costUsd: 0.5 } }, BASE - 3 * HOUR)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
  if (place.root !== '') rmSync(place.root, { recursive: true, force: true })
})

describe('the week-use notice', () => {

  it('2. sends what it sends when handed every login, at six readings', () => {
    const first = `sandboxes-claude 50% to ${idOf[THE_FIRST_SECRETARY]!}`
    // THE 50% NOTICE THE CUT CASE USED TO SEND, so the first reading still starts from a share already told.
    aReading(0.52, FIRST_RESET, BASE - 10 * MINUTE)
    week.tellTheSecretaryHowMuchOfTheWeekIsUsed(WORKSPACE, new Date(BASE), THE_OFFICE())
    const steps: { name: string; used: number; resetMs: number; readAtMs: number; nowMs: number; sends: string[] }[] = [
      { name: 'within the share already told', used: 0.6, resetMs: FIRST_RESET, readAtMs: BASE + HOUR, nowMs: BASE + HOUR + 5 * MINUTE, sends: [] },
      { name: 'at 80%', used: 0.85, resetMs: FIRST_RESET, readAtMs: BASE + 2 * HOUR, nowMs: BASE + 2 * HOUR + 5 * MINUTE, sends: [`sandboxes-claude 80% to ${idOf[THE_FIRST_SECRETARY]!}`] },
      { name: 'stale', used: 0.95, resetMs: SECOND_RESET, readAtMs: BASE + 3 * HOUR, nowMs: BASE + 6 * HOUR, sends: [] },
      { name: 'below 50% in a new count', used: 0.3, resetMs: SECOND_RESET, readAtMs: BASE + 4 * DAY, nowMs: BASE + 4 * DAY + 5 * MINUTE, sends: [] },
      { name: 'at 50% in the new count', used: 0.55, resetMs: SECOND_RESET, readAtMs: BASE + 4 * DAY + HOUR, nowMs: BASE + 4 * DAY + HOUR + 5 * MINUTE, sends: [first] },
      { name: 'again at 50% in the new count', used: 0.56, resetMs: SECOND_RESET, readAtMs: BASE + 4 * DAY + 2 * HOUR, nowMs: BASE + 4 * DAY + 2 * HOUR + 5 * MINUTE, sends: [] },
    ]
    for (const step of steps) {
      aReading(step.used, step.resetMs, step.readAtMs)
      const before = theLastRow()
      // HANDED EVERY LOGIN'S READING OF THE SAME MOMENT, in a savepoint that is rolled back, so both start from one office.
      t.client.sqlite.exec('SAVEPOINT handed_every_login')
      let handed: { sent: string[]; notices: ReturnType<typeof theNoticesAfter> }
      try {
        const sent = week.tellTheSecretaryHowMuchOfTheWeekIsUsed(WORKSPACE, new Date(step.nowMs), THE_OFFICE(), week.theLoginsWeek(step.nowMs))
        handed = { sent, notices: theNoticesAfter(before) }
      } finally {
        t.client.sqlite.exec('ROLLBACK TO handed_every_login')
        t.client.sqlite.exec('RELEASE handed_every_login')
      }
      expect(theNoticesAfter(before), `${step.name}: nothing kept from the handed reading`).toEqual([])
      const sent = week.tellTheSecretaryHowMuchOfTheWeekIsUsed(WORKSPACE, new Date(step.nowMs), THE_OFFICE())
      expect({ sent, notices: theNoticesAfter(before) }, step.name).toEqual(handed)
      expect(sent, `${step.name}: what it sends`).toEqual(step.sends)
    }
  })

})
