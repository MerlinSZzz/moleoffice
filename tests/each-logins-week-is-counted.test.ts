// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH MODEL LOGIN'S WEEK, COUNTED. Wave 13p round 29, piece 0b; the sandboxes' Claude login is read from its own
 * rate-limit event since wave 13p round E (tests/the-sandboxes-claude-login-is-read-from-its-own-event.test.ts, which
 * also holds the notice to the secretaries).
 *
 * WHAT THIS FILE PROVES, on src/server/lib/logins-week.ts and the one place its facts live, src/shared/logins-week.ts:
 *   - the receipts count each session once, as its newest figure minus its figure before the seven days (round 30);
 *   - the thin reader finds the reading rounds in a sandbox's log folder, with what each one's event gave;
 *   - a secretary's inbox carries the week reading and another agent's does not.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names the logs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { momentOfStampInZone } from '../src/shared/time.ts'
import { THE_LOGINS, type LoginsWeek, type LoginWeekReading, type ReceiptsReading } from '../src/shared/logins-week.ts'

type WeekLib = typeof import('../src/server/lib/logins-week.ts')

let t: TestDb
let app: FastifyInstance
let week: WeekLib

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const LONDON = 'Europe/London'
const idOf: Record<string, string> = {}

/** A moment named on London's wall clock. */
function london(stamp: string): number {
  const ms = momentOfStampInZone(stamp, LONDON)
  if (ms === null) throw new Error(`${stamp} is not a stamp`)
  return ms
}

/** A reading of a login that reads receipts, or a failure saying which it was. */
function receiptsOf(reading: LoginWeekReading): ReceiptsReading {
  if (reading.readFrom !== 'receipts') throw new Error(`${reading.login} is read from ${reading.readFrom}, not from receipts.`)
  return reading
}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  idOf[handle] = (reply.json() as { agent: { id: string } }).agent.id
}

beforeAll(async () => {
  t = await freshDb()
  week = await import('../src/server/lib/logins-week.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('sec-one', 'secretary')
  await register('w-one', 'worker')
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the receipts and the log folders', () => {
  it('counts each session’s receipts once, as its newest figure minus its figure before the seven days (wave 13p round 30)', () => {
    const now = london('2026-10-08 12:00:00')
    const codex = THE_LOGINS.find((one) => one.login === 'codex')!
    const run = (id: string, providerSession: string | null, costUsd: number | null) => ({
      id,
      data: { adaptedTool: 'codex', ...(providerSession === null ? {} : { providerSession }), ...(costUsd === null ? {} : { usageReceipt: { costUsd } }) },
    })
    // T: a resumed conversation. 10.00 before the seven days, then 12.00 and 15.00 inside: it used 5.00, not 27.00.
    // U: begun inside, 1.00 then 3.00: 3.00. V: a run naming no conversation, 2.00, its own session. W: no receipt.
    const inside = [run('t2', 'T', 12), run('t3', 'T', 15), run('u1', 'U', 1), run('u2', 'U', 3), run('v1', null, 2), run('w1', 'W', null)]
    const asked: string[][] = []
    const reading = receiptsOf(week.theWeekOfALogin(codex, now, {
      rounds: () => [],
      runsSince: () => inside,
      runsOfSessionsBefore: (sessions) => {
        asked.push([...sessions].sort())
        return [run('t1', 'T', 10), run('x1', 'X', 40)].filter((one) => sessions.includes(String(one.data.providerSession)))
      },
    }))
    expect(asked).toEqual([['T', 'U']])
    expect(reading.usd).toBeCloseTo(10, 9)
    expect(reading.receipts).toMatchObject({ runs: 6, runsWithNoReceipt: 1, costGivenBy: 5, sessions: 3, runsWithNoSession: 1, sessionsWhoseFigureFell: 0 })
    expect(reading.says).toContain('Each session is counted once, as its newest figure minus its figure before the seven days: 10.00 US dollars over 3 sessions.')
    expect(reading.says).toContain('1 run named no conversation, so each was counted as a session of its own.')
  })

  it('reads the reading rounds from a sandbox’s log folder, with what each one’s event gave', () => {
    const root = mkdtempSync(join(tmpdir(), 'logins-week-'))
    try {
      const run = (name: string, command: string[], out: string, at: number): void => {
        const folder = join(root, 'one-sandbox', 'logs', name)
        mkdirSync(folder, { recursive: true })
        writeFileSync(join(folder, 'start.json'), JSON.stringify({ command }))
        writeFileSync(join(folder, 'out'), out)
        utimesSync(join(folder, 'out'), at / 1000, at / 1000)
      }
      const reading = ['claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose']
      // MADE-UP FIGURES: seven days 40% until three days on, five hours given by neither place.
      const event = JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', unifiedWindows: { seven_day: { utilization: 0.4, resetsAt: 1_700_259_200 } } } })
      run('r1', reading, `some words\n${event}\n`, 1_700_000_000_000)
      run('r2', ['sh', '-c', 'exec claude -p x --output-format stream-json --verbose'], 'no event here\n', 1_700_000_100_000)
      run('r3', ['bash', 'build.sh'], `${event}\n`, 1_700_000_200_000)
      run('r4', ['claude', '-p', 'x', '--output-format', 'json'], `${event}\n`, 1_700_000_300_000)
      const rounds = week.theRoundsInTheSandboxes(root).sort((a, b) => a.atMs - b.atMs)
      expect(rounds).toEqual([
        {
          sandbox: 'one-sandbox', folder: 'r1', atMs: 1_700_000_000_000,
          gave: { event: 'read', status: 'allowed', windowType: null, resetsAtMs: null, sevenDays: { used: 0.4, resetsAtMs: 1_700_259_200_000, from: 'unifiedWindows' }, fiveHours: null },
        },
        { sandbox: 'one-sandbox', folder: 'r2', atMs: 1_700_000_100_000, gave: { event: 'none' } },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('the secretary’s inbox carries the week', () => {
  it('answers a secretary’s inbox with every login’s reading, and another agent’s without it', async () => {
    const ask = async (handle: string): Promise<Record<string, unknown>> => {
      const reply = await app.inject({ method: 'GET', url: `/api/agent/inbox?handle=${handle}`, headers: AS_THE_PERSON })
      expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
      return reply.json() as Record<string, unknown>
    }
    const secretary = (await ask('sec-one'))['loginsWeek'] as LoginsWeek | undefined
    expect(secretary?.logins.map((one) => [one.login, one.readFrom])).toEqual([['sandboxes-claude', 'own-event'], ['host-claude', 'receipts'], ['codex', 'receipts'], ['deepseek', 'receipts']])
    for (const one of secretary!.logins.slice(1)) {
      expect(Object.keys(one).sort()).toEqual(['from', 'login', 'name', 'readFrom', 'receipts', 'says', 'to', 'usd', 'zone'])
      expect(one.says).toContain('over the last seven days')
    }
    expect((await ask('w-one'))['loginsWeek']).toBeUndefined()
  })
})
