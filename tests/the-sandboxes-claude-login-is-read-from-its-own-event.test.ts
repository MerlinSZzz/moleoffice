// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' CLAUDE LOGIN IS READ FROM ITS OWN RATE-LIMIT EVENT. Wave 13p round E, steps 2, 4 and 5, for problem
 * LeL0ssxi2jje.
 *
 * Each reading round in a sandbox runs `claude -p ... --output-format stream-json --verbose`, and Claude Code writes a
 * line of type `rate_limit_event` into the round's `out`. That line says whether the login's requests were allowed,
 * and how much of its five-hour and seven-day windows was used and when each resets. The office used to sum Claude
 * Code's price figure over a Friday week against a measured mark. It now shows what the login itself said, and when.
 *
 * WHAT THIS FILE PROVES, on src/server/lib/logins-week.ts and src/server/lib/casting-roll.ts:
 *   1. the reading is the newest event among the reading rounds of every sandbox, and a round that is not a reading
 *      round is passed over without its `out` being opened; a round of the login reading job, whose command starts
 *      with `timeout`, is a reading round;
 *   2. a reading stays current for exactly 2 hours, and after that it is stale, says so first, and keeps its figures;
 *   3. no round, or reading rounds with no event, give a reading of nobody, with no figure;
 *   4. an event in a shape the office does not know is unreadable: the round is named, the refused value is not, and no
 *      older event is used in its place; a use of exactly 2 and a reset exactly 8 days on are readable;
 *  4a. a use of 1.03 is shown as 103%, and nothing else from the event or the round is kept;
 *   5. a window the event does not give in its own place is taken from the top level only when the top level names it,
 *      and is otherwise said to be not given;
 *   6. a seven-day reset that has passed since the reading is said as passed;
 *   7. a newer reading round with no event is named;
 *   8. the router limits Claude only on a current reading, refused until its reset or at 100% of its seven days, and
 *      says why with the reading's time and round; a stale, missing or unreadable reading never limits;
 *   9. the one secretary who takes usage notices is told at 50% and at 80% of the seven days, once each per seven-day
 *      count for the whole office, so a secretary chosen in the middle of a count is not told a share another was
 *      told. With nobody chosen it is the first secretary appointed: the first registered, then the first by id. A
 *      chosen agent that is no longer a secretary leaves the notice with the first appointed, and the notice and the
 *      setting's reading say why in the same sentence. At 80% the notice says what the usage decision set in the
 *      office says to do, with its id, or, with none set, asks the secretary to ask the owner;
 *  10. the two settings' doors. The person, or a secretary with its own key and a reason, chooses the receiver, and
 *      only a secretary can be chosen. The usage decision's words are set by the person, or by a secretary carrying
 *      the person's words for that exact change; a secretary's key alone is refused. A refused request writes nothing.
 *      A secretary's door still takes the decision by its id, and the reading names the decision by its title as well
 *      as its id; its sentence names the title, not the id (wave 13y round 140, item 79d).
 *
 * Every figure in a fixture is made up. No uuid, session id or answer text here is a real one. The decision record, its
 * words and the person's words in a warrant are made up too.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names the logs. For 9 and 10
 * (wave 13y round 136): order the first appointed by id alone, and case 9's first case goes red; keep the notices
 * apart for each secretary, and its second case goes red; send nothing when the chosen agent is no longer a
 * secretary, and its last notice case goes red; let a secretary's key alone set the words, and case 10's second case
 * goes red. The two notices at 80% are read from the line that builds them (src/shared/groups.ts), never copied (wave
 * 13y round 137): build the notice with no usage decision while one is set, and the case that sets one goes red;
 * build it with a made-up decision while none is set, and the case that asks the owner goes red. Round 140: name the
 * decision by its id in the reading's sentence, and case 10's second case goes red.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apiApp, freshDb, type TestDb, governsTheWholeProject } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { stampInZone, theClockZone } from '../src/shared/time.ts'
import type { LoginsWeek, OwnEventReading } from '../src/shared/logins-week.ts'

const opened = vi.hoisted(() => ({ under: '', paths: [] as string[] }))

vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  const note = (path: unknown): void => {
    if (opened.under !== '' && typeof path === 'string' && path.startsWith(opened.under)) opened.paths.push(path)
  }
  const readFileSync = ((...args: Parameters<typeof real.readFileSync>) => {
    note(args[0])
    return real.readFileSync(...args)
  }) as typeof real.readFileSync
  const openSync = ((...args: Parameters<typeof real.openSync>) => {
    note(args[0])
    return real.openSync(...args)
  }) as typeof real.openSync
  return { ...real, default: { ...real, readFileSync, openSync }, readFileSync, openSync }
})

type WeekLib = typeof import('../src/server/lib/logins-week.ts')
type RouterLib = typeof import('../src/server/lib/casting-roll.ts')

let t: TestDb
let app: FastifyInstance
let week: WeekLib
let router: RouterLib
let base: string

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** A made-up moment, in whole seconds so a file's stamp holds it exactly. */
const T0 = Date.parse('2026-10-14T09:00:00Z')

/** The command a reading round runs, as tools/sandbox-start.mjs writes it into start.json. */
const READING = ['claude', '-p', 'Reply with OK.', '--model', 'claude-haiku-4-5-20251001', '--output-format', 'stream-json', '--verbose']
/** A Claude round that is not a reading round: it writes one result line and no event. */
const NOT_A_READING = ['claude', '-p', 'Reply with OK.', '--output-format', 'json']

const A_UUID = 'made-up-uuid-0000-1111'
const A_SESSION = 'made-up-session-2222-3333'
const AN_ANSWER = 'A made-up answer, 4444.'
const ASSISTANT = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: AN_ANSWER }] }, session_id: A_SESSION })
const RESULT = JSON.stringify({ type: 'result', subtype: 'success', result: AN_ANSWER, session_id: A_SESSION, total_cost_usd: 0.0123 })

/** Unix seconds, as the event writes a reset. */
const seconds = (ms: number): number => ms / 1000

/** A stamp in the office's zone, as the reading writes one. */
const stamp = (ms: number): string => stampInZone(ms, theClockZone())

/** A stamp without its seconds, as a sentence writes it. */
const minute = (ms: number): string => stamp(ms).slice(0, 16)

/** One rate-limit event line carrying `info`. */
function anEvent(info: Record<string, unknown>): string {
  return JSON.stringify({ type: 'rate_limit_event', rate_limit_info: info, uuid: A_UUID, session_id: A_SESSION })
}

/** An event that reads, for a round whose output was last written at `atMs`: five hours 12%, seven days 63%. */
function readable(atMs: number, changes: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'allowed',
    resetsAt: seconds(atMs + 3 * HOUR),
    rateLimitType: 'five_hour',
    utilization: 0.12,
    unifiedWindows: { five_hour: { utilization: 0.12, resetsAt: seconds(atMs + 3 * HOUR) }, seven_day: { utilization: 0.63, resetsAt: seconds(atMs + 4 * DAY) } },
    ...changes,
  }
}

/** A fresh root for one case's sandboxes. */
function aRoot(): string {
  return mkdtempSync(join(base, 'root-'))
}

/** One round folder: its start.json, and an `out` with an assistant line, the event if any, and a result line. */
function aRound(root: string, sandbox: string, folder: string, atMs: number, event: string | null, command: string[] = READING): void {
  const dir = join(root, sandbox, 'logs', folder)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'start.json'), JSON.stringify({ command }))
  writeFileSync(join(dir, 'out'), `${[ASSISTANT, ...(event === null ? [] : [event]), RESULT].join('\n')}\n`)
  utimesSync(join(dir, 'out'), atMs / 1000, atMs / 1000)
}

/** The reading of the sandboxes' login at `nowMs`, from `root`. */
function readingOf(root: string, nowMs: number): OwnEventReading {
  return week.theOwnEventReading(nowMs, week.theRoundsInTheSandboxes(root))
}

/** Every login's reading at `nowMs`, with the sandboxes read from `root` and no runs. */
function everyLoginAt(root: string, nowMs: number): LoginsWeek {
  return week.theLoginsWeek(nowMs, { rounds: () => week.theRoundsInTheSandboxes(root), runsSince: () => [], runsOfSessionsBefore: () => [] })
}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_OFFICE = { type: 'system' as const, id: 'mole-office' }
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  const made = reply.json() as { agent: { id: string }; whatToGiveIt?: { key?: string } }
  idOf[handle] = made.agent.id
  keyOf[handle] = String(made.whatToGiveIt?.key ?? '')
}

/** An agent asking with the key the office gave it. */
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keyOf[handle] ?? '',
})

/** One request to the office in process, its status, its body and its error, if any. */
async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any>; error: string; raw: string }> {
  const sent = method === 'GET' ? Object.fromEntries(Object.entries(headers).filter(([name]) => name !== 'content-type')) : headers
  const reply = await app.inject({ method, url, headers: sent, ...(payload === undefined ? {} : { payload: payload as object }) })
  let body: Record<string, any> = {}
  try {
    body = reply.json() as Record<string, any>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, error: typeof body['error'] === 'string' ? body['error'] : '', raw: reply.body }
}

/** The newest row of the change log, so a case can say what it wrote after it. */
const theLastChangeRow = (): number => (t.client.sqlite.prepare('SELECT COALESCE(MAX(rowid), 0) AS n FROM changes').get() as { n: number }).n
function changesSince(mark: number): { record_id: string; actor_type: string; actor_id: string; warrant: string | null }[] {
  return t.client.sqlite.prepare('SELECT record_id, actor_type, actor_id, warrant FROM changes WHERE rowid > ? ORDER BY rowid').all(mark) as ReturnType<typeof changesSince>
}

/** The office's week-use notices to one agent, oldest first. */
function noticesTo(handle: string): { body: string; extra: { loginsWeek: { login: string; resets: string; shares: number[] } } }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) " +
          "AND json_extract(data, '$.to[0].id') = ? AND json_extract(data, '$.extra.loginsWeek') IS NOT NULL ORDER BY rowid",
      )
      .all(idOf[handle]) as { data: string }[]
  ).map((one) => JSON.parse(one.data) as ReturnType<typeof noticesTo>[number])
}

beforeAll(async () => {
  t = await freshDb()
  week = await import('../src/server/lib/logins-week.ts')
  router = await import('../src/server/lib/casting-roll.ts')
  base = mkdtempSync(join(tmpdir(), 'own-event-'))
  const built = await apiApp()
  app = built.app
  await app.ready()
  await register('sec-one', 'secretary')
  await register('sec-two', 'secretary')
  await register('w-one', 'worker')
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(base, { recursive: true, force: true })
})

describe('1. the reading is the newest event among the reading rounds', () => {
  it('takes the newest event across two sandboxes, and does not open a newer round that is not a reading round', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-a1', T0, anEvent(readable(T0)))
    aRound(root, 'sandbox-b', 'round-b1', T0 + 10 * MINUTE, anEvent(readable(T0 + 10 * MINUTE, { status: 'allowed_warning' })))
    // A NEWER CLAUDE ROUND THAT IS NOT A READING ROUND, holding an event line all the same: opened, it would win.
    aRound(root, 'sandbox-a', 'round-a2', T0 + 20 * MINUTE, anEvent(readable(T0 + 20 * MINUTE, { status: 'rejected' })), NOT_A_READING)
    opened.under = root
    opened.paths = []
    let asked = 0
    const every = week.theLoginsWeek(T0 + 30 * MINUTE, {
      rounds: () => {
        asked += 1
        return week.theRoundsInTheSandboxes(root)
      },
      runsSince: () => [],
      runsOfSessionsBefore: () => [],
    })
    const touched = [...opened.paths]
    opened.under = ''
    expect(asked, 'the rounds are read once for every login').toBe(1)
    const reading = every.logins[0] as OwnEventReading
    expect(reading).toMatchObject({ readFrom: 'own-event', login: 'sandboxes-claude', state: 'current', status: 'allowed_warning', readAt: stamp(T0 + 10 * MINUTE), round: { sandbox: 'sandbox-b', folder: 'round-b1' } })
    expect(touched).toContain(join(root, 'sandbox-a', 'logs', 'round-a2', 'start.json'))
    expect(touched, 'the out of a round that is not a reading round was opened').not.toContain(join(root, 'sandbox-a', 'logs', 'round-a2', 'out'))
    expect(touched).toContain(join(root, 'sandbox-b', 'logs', 'round-b1', 'out'))
    expect(week.theRoundsInTheSandboxes(root).map((one) => `${one.sandbox}/${one.folder}`).sort()).toEqual(['sandbox-a/round-a1', 'sandbox-b/round-b1'])
  })

  it('says the round, its time and both windows of a current reading', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', T0, anEvent(readable(T0)))
    const reading = readingOf(root, T0 + HOUR)
    expect(reading).toMatchObject({
      state: 'current',
      zone: theClockZone(),
      status: 'allowed',
      windowType: 'five_hour',
      resetsAt: stamp(T0 + 3 * HOUR),
      sevenDays: { used: 0.63, resetsAt: stamp(T0 + 4 * DAY), from: 'unifiedWindows' },
      fiveHours: { used: 0.12, resetsAt: stamp(T0 + 3 * HOUR), from: 'unifiedWindows' },
      newerRoundWithNoEvent: null,
    })
    expect(reading.says).toContain('sandbox-a/round-1')
    expect(reading.says).toContain(minute(T0))
    expect(reading.says).toContain(`Seven days: 63% used, resets at ${minute(T0 + 4 * DAY)}.`)
    expect(reading.says).toContain(`Five hours: 12% used, resets at ${minute(T0 + 3 * HOUR)}.`)
    expect(reading.says).toContain("the sandboxes' login")
    expect(reading.says).not.toMatch(/\b(token|account|letter)\b/i)
  })

  it('reads a round whose command is the login reading job’s own, `timeout` first', async () => {
    // THE JOB'S COMMAND, as tools/run-the-login-reading.mjs hands it to the sandbox and start.json keeps it: a reader
    // that wanted `claude` as the program would pass over every round the job takes.
    const { LOGIN_READING_COMMAND } = await import('../src/config/login-reading-job.mjs')
    expect(LOGIN_READING_COMMAND[0]).toBe('timeout')
    const root = aRoot()
    aRound(root, 'login-reading', 'round-1', T0, anEvent(readable(T0)), [...LOGIN_READING_COMMAND])
    expect(readingOf(root, T0 + HOUR)).toMatchObject({ state: 'current', round: { sandbox: 'login-reading', folder: 'round-1' } })
  })
})

describe('2. a reading stays current for 2 hours', () => {
  it('is current at exactly 2 hours, and stale at 2 hours and a minute, keeping its figures and their time', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', T0, anEvent(readable(T0)))
    const atTheEdge = readingOf(root, T0 + 2 * HOUR)
    expect(atTheEdge.state).toBe('current')
    expect(atTheEdge.says.startsWith('Not read since')).toBe(false)
    const after = readingOf(root, T0 + 2 * HOUR + MINUTE)
    expect(after.state).toBe('stale')
    expect(after.says.startsWith(`Not read since ${minute(T0)}`)).toBe(true)
    expect(after).toMatchObject({ readAt: stamp(T0), status: 'allowed', sevenDays: { used: 0.63, resetsAt: stamp(T0 + 4 * DAY) }, fiveHours: { used: 0.12 } })
    expect(after.says).toContain('63%')
    expect(after.says).toContain('sandbox-a/round-1')
  })
})

describe('3. nobody has read the login', () => {
  it('gives a reading of nobody, with no figure, when there is no round or no round gave an event', () => {
    const empty = aRoot()
    const noEvent = aRoot()
    aRound(noEvent, 'sandbox-a', 'round-1', T0, null)
    aRound(noEvent, 'sandbox-a', 'round-2', T0 + MINUTE, anEvent(readable(T0)), NOT_A_READING)
    for (const reading of [readingOf(empty, T0), readingOf(join(base, 'not-there'), T0), readingOf(noEvent, T0 + HOUR)]) {
      expect(reading).toMatchObject({ readFrom: 'own-event', state: 'none', readAt: null, round: null, status: null, sevenDays: null, fiveHours: null, newerRoundWithNoEvent: null })
      expect(reading.says).toBe("Nobody has read this login's use.")
      expect(reading.says).not.toContain('%')
    }
  })
})

describe('4. an event in a shape the office does not know is unreadable', () => {
  const at = T0
  const nine = seconds(at + 9 * DAY)
  /** Each shape, with the words it must not put in the reading's sentence. */
  const SHAPES: { name: string; info: Record<string, unknown>; never: string[] }[] = [
    { name: 'an unknown status', info: readable(at, { status: 'throttled' }), never: ['throttled'] },
    { name: 'no status', info: (({ status: _, ...rest }) => rest)(readable(at)), never: [] },
    { name: 'a string utilization', info: readable(at, { unifiedWindows: { seven_day: { utilization: '0.5', resetsAt: seconds(at + DAY) } } }), never: ['0.5', '50%'] },
    { name: 'a seven_day without resetsAt', info: readable(at, { unifiedWindows: { seven_day: { utilization: 0.4 } } }), never: ['40%'] },
    { name: 'an unknown rateLimitType', info: readable(at, { rateLimitType: 'ten_day' }), never: ['ten_day', 'ten day'] },
    { name: 'a utilization of 2.5', info: readable(at, { unifiedWindows: { seven_day: { utilization: 2.5, resetsAt: seconds(at + DAY) } } }), never: ['2.5', '250%'] },
    { name: 'a utilization of -0.1', info: readable(at, { unifiedWindows: { seven_day: { utilization: -0.1, resetsAt: seconds(at + DAY) } } }), never: ['-0.1', '-10%'] },
    { name: 'a reset 9 days after the reading', info: readable(at, { unifiedWindows: { seven_day: { utilization: 0.4, resetsAt: nine } } }), never: [minute(nine * 1000), String(nine)] },
    // ITS VALUE IS THE ROUND'S OWN TIME, which the sentence names, so there is no other word to look for.
    { name: 'a reset at the reading itself', info: readable(at, { resetsAt: seconds(at) }), never: [] },
    { name: 'unifiedWindows that is not an object', info: readable(at, { unifiedWindows: 'seven_day' }), never: [] },
    { name: 'a top-level resetsAt that is a string', info: readable(at, { resetsAt: 'tomorrow' }), never: ['tomorrow'] },
  ]

  for (const shape of SHAPES) {
    it(`refuses ${shape.name}, names the round, and does not quote the value`, () => {
      const root = aRoot()
      aRound(root, 'sandbox-a', 'round-1', at, anEvent(shape.info))
      const reading = readingOf(root, at + HOUR)
      expect(reading).toMatchObject({ state: 'unreadable', readAt: stamp(at), round: { sandbox: 'sandbox-a', folder: 'round-1' }, status: null, sevenDays: null, fiveHours: null })
      expect(reading.says).toContain('sandbox-a/round-1')
      expect(reading.says).toContain(minute(at))
      expect(reading.says).toContain('a shape the office does not know')
      for (const word of shape.never) expect(reading.says, `${shape.name}: the sentence quotes ${word}`).not.toContain(word)
      expect(reading.says).not.toMatch(/\d%/)
    })
  }

  it('lets a newer unreadable event beat an older readable one, and never falls back to it', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-old', at, anEvent(readable(at)))
    aRound(root, 'sandbox-b', 'round-new', at + MINUTE, anEvent(readable(at + MINUTE, { status: 'throttled' })))
    const reading = readingOf(root, at + HOUR)
    expect(reading).toMatchObject({ state: 'unreadable', round: { sandbox: 'sandbox-b', folder: 'round-new' }, sevenDays: null })
    expect(reading.says).not.toContain('round-old')
    expect(reading.says).not.toContain('63%')
  })

  it('reads a use of exactly 2 and a reset exactly 8 days after the reading', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', at, anEvent(readable(at, { unifiedWindows: { seven_day: { utilization: 2, resetsAt: seconds(at + 8 * DAY) } } })))
    const reading = readingOf(root, at + HOUR)
    expect(reading.state).toBe('current')
    expect(reading.sevenDays).toEqual({ used: 2, resetsAt: stamp(at + 8 * DAY), from: 'unifiedWindows' })
    expect(reading.says).toContain('200%')
  })
})

describe('4a. what is kept from the event', () => {
  it('shows a use of 1.03 as 103%, and keeps no uuid, session id or answer text', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', T0, anEvent(readable(T0, { unifiedWindows: { seven_day: { utilization: 1.03, resetsAt: seconds(T0 + DAY) } } })))
    const reading = readingOf(root, T0 + HOUR)
    expect(reading.sevenDays?.used).toBe(1.03)
    expect(reading.says).toContain('Seven days: 103% used')
    expect(reading.says).not.toContain('100%')
    const kept = JSON.stringify(reading)
    for (const word of [A_UUID, A_SESSION, AN_ANSWER, '0.0123']) expect(kept, `the reading keeps ${word}`).not.toContain(word)
  })
})

describe('5. a window from the top level, only when the top level names it', () => {
  const at = T0
  const topLevel = (rateLimitType: string): Record<string, unknown> => ({ status: 'allowed', rateLimitType, utilization: 0.4, resetsAt: seconds(at + 2 * DAY) })

  it('takes seven days from the top level when it names seven_day, and says five hours were not given', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', at, anEvent(topLevel('seven_day')))
    const reading = readingOf(root, at + HOUR)
    expect(reading.state).toBe('current')
    expect(reading.sevenDays).toEqual({ used: 0.4, resetsAt: stamp(at + 2 * DAY), from: 'top level' })
    expect(reading.fiveHours).toBeNull()
    expect(reading.says).toContain('Five hours: not given in this reading.')
    expect(reading.says).not.toContain('Seven days: not given')
  })

  it('takes five hours from the top level when it names five_hour, and says seven days were not given', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', at, anEvent({ ...topLevel('five_hour'), resetsAt: seconds(at + 3 * HOUR) }))
    const reading = readingOf(root, at + HOUR)
    expect(reading.fiveHours).toEqual({ used: 0.4, resetsAt: stamp(at + 3 * HOUR), from: 'top level' })
    expect(reading.sevenDays).toBeNull()
    expect(reading.says).toContain('Seven days: not given in this reading.')
  })

  it('gives neither window from a top level that names seven_day_opus', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', at, anEvent(topLevel('seven_day_opus')))
    const reading = readingOf(root, at + HOUR)
    expect(reading).toMatchObject({ state: 'current', windowType: 'seven_day_opus', sevenDays: null, fiveHours: null })
    expect(reading.says).toContain('Seven days: not given in this reading.')
    expect(reading.says).toContain('Five hours: not given in this reading.')
  })
})

describe('6. a reset that has passed since the reading', () => {
  it('says the seven days reset at that time, after the reading', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', T0, anEvent(readable(T0, { unifiedWindows: { seven_day: { utilization: 0.63, resetsAt: seconds(T0 + 30 * MINUTE) } } })))
    const reading = readingOf(root, T0 + HOUR)
    expect(reading.state).toBe('current')
    expect(reading.says).toContain(`reset at ${minute(T0 + 30 * MINUTE)}, after the reading`)
    expect(reading.says).not.toContain(`resets at ${minute(T0 + 30 * MINUTE)}`)
  })
})

describe('7. a newer reading round with no event', () => {
  it('is named, and an older one is not', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-older', T0 - 10 * MINUTE, null)
    aRound(root, 'sandbox-a', 'round-1', T0, anEvent(readable(T0)))
    aRound(root, 'sandbox-b', 'round-newer', T0 + 10 * MINUTE, null)
    const reading = readingOf(root, T0 + HOUR)
    expect(reading.newerRoundWithNoEvent).toEqual({ sandbox: 'sandbox-b', folder: 'round-newer', at: stamp(T0 + 10 * MINUTE) })
    expect(reading.says).toContain('sandbox-b/round-newer')
    expect(reading.says).toContain('gave no rate-limit event')
    expect(reading.says).not.toContain('round-older')
  })
})

describe('8. the router limits Claude only on a current reading', () => {
  const at = T0
  const now = at + HOUR
  const weekLimit = (reading: OwnEventReading | null, nowMs = now) => {
    const answer = router.theModelsLimitedAt(nowMs, { officeZone: 'UTC', week: reading })
    return { limit: answer.limited.find((one) => one.kind === 'week'), words: answer.week }
  }
  const from = (info: Record<string, unknown>, readAtMs = at, nowMs = now): OwnEventReading => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', readAtMs, anEvent(info))
    return readingOf(root, nowMs)
  }

  it('limits a current refused reading until its top-level reset, and says the time and round', () => {
    const { limit, words } = weekLimit(from(readable(at, { status: 'rejected', resetsAt: seconds(at + 3 * HOUR) })))
    expect(limit).toMatchObject({ runtime: 'claude-code', model: null, run: null, until: at + 3 * HOUR, at: stamp(at) })
    expect(limit!.says).toContain('sandbox-a/round-1')
    expect(limit!.says).toContain(minute(at))
    expect(limit!.says).toContain(minute(at + 3 * HOUR))
    expect(limit!.says).toContain('refused')
    expect(words).toBe(limit!.says)
  })

  it('limits a current reading at 103% of its seven days until the seven-day reset', () => {
    const { limit } = weekLimit(from(readable(at, { unifiedWindows: { seven_day: { utilization: 1.03, resetsAt: seconds(at + 2 * DAY) } } })))
    expect(limit).toMatchObject({ until: at + 2 * DAY })
    expect(limit!.says).toContain('103%')
    expect(limit!.says).toContain('sandbox-a/round-1')
  })

  it('counts the later reset when the reading is refused and over its seven days', () => {
    const { limit } = weekLimit(from(readable(at, { status: 'rejected', resetsAt: seconds(at + 3 * HOUR), unifiedWindows: { seven_day: { utilization: 1.03, resetsAt: seconds(at + 2 * DAY) } } })))
    expect(limit?.until).toBe(at + 2 * DAY)
  })

  it('does not limit at 99% and allowed', () => {
    const { limit, words } = weekLimit(from(readable(at, { unifiedWindows: { seven_day: { utilization: 0.99, resetsAt: seconds(at + 2 * DAY) } } })))
    expect(limit).toBeUndefined()
    expect(words).toContain('sandbox-a/round-1')
    expect(words).toContain('99%')
  })

  it('does not limit a refused reading that gives no reset, and says so', () => {
    const { limit, words } = weekLimit(from((({ resetsAt: _, ...rest }) => rest)(readable(at, { status: 'rejected' }))))
    expect(limit).toBeUndefined()
    expect(words).toContain('no reset time')
  })

  it('does not limit a stale refused reading, and says it was not read since', () => {
    const reading = from(readable(at, { status: 'rejected', resetsAt: seconds(at + 3 * HOUR) }), at, at + 2 * HOUR + MINUTE)
    expect(reading.state).toBe('stale')
    const { limit, words } = weekLimit(reading, at + 2 * HOUR + MINUTE)
    expect(limit).toBeUndefined()
    expect(words).toContain(`Not read since ${minute(at)}`)
    expect(words).toContain('sandbox-a/round-1')
  })

  it('does not limit on a reading of nobody, an unreadable one, or none at all', () => {
    const nobody = readingOf(aRoot(), now)
    expect(weekLimit(nobody).limit).toBeUndefined()
    expect(weekLimit(nobody).words).toContain('Nobody has read')
    const unreadable = from(readable(at, { status: 'rejected', resetsAt: seconds(at + 3 * HOUR), utilization: 'full' }))
    expect(unreadable.state).toBe('unreadable')
    expect(weekLimit(unreadable).limit).toBeUndefined()
    expect(weekLimit(unreadable).words).toContain('sandbox-a/round-1')
    expect(weekLimit(unreadable).words).toContain('a shape the office does not know')
    expect(weekLimit(null).limit).toBeUndefined()
    expect(weekLimit(null).words).toContain('not read')
  })

  it('hands the router the reading only once the sandboxes have been read', () => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', at, anEvent(readable(at)))
    expect(week.theSandboxesLoginForTheRouter(now, root)).toBeNull()
    const rounds = week.theRoundsInTheSandboxes(root)
    expect(week.theSandboxesLoginForTheRouter(now, root)).toEqual(week.theOwnEventReading(now, rounds))
  })
})

describe('9. the one secretary who takes usage notices is told at 50% and at 80% of the seven days', () => {
  // FIVE SEVEN-DAY COUNTS, a week apart, each reset within 8 days of every reading that names it.
  const RESET_ONE = T0 + 2 * DAY
  const RESET_TWO = T0 + 9 * DAY
  const RESET_THREE = T0 + 16 * DAY
  const RESET_FOUR = T0 + 23 * DAY
  const RESET_FIVE = T0 + 30 * DAY
  const WHAT_TO_DO = 'Made-up words of a usage decision, 5555: no slowing down.'
  /** Every login's reading at `nowMs`, from one round read at `readAtMs` with these seven days. */
  const withSevenDays = (used: number, resetMs: number, readAtMs: number, nowMs: number): LoginsWeek => {
    const root = aRoot()
    aRound(root, 'sandbox-a', 'round-1', readAtMs, anEvent(readable(readAtMs, { unifiedWindows: { seven_day: { utilization: used, resetsAt: seconds(resetMs) } } })))
    return everyLoginAt(root, nowMs)
  }
  /** The notice at 80% for `reading`, in the words of the line that builds it, with `atEighty` and no reason sentence. */
  const theWordsAtEighty = (reading: LoginsWeek, atEighty: { decision: string; whatToDo: string } | null): string | null => {
    const own = reading.logins[0] as OwnEventReading
    return SYSTEM_LINES.theLoginsWeekIsPartUsed(sayInEnglish(own.name), 80, own.sevenDays!.used, own.sevenDays!.resetsAt, reading.zone, atEighty, null).said
  }
  const tell = (reading: LoginsWeek, nowMs: number): string[] => week.tellTheSecretaryHowMuchOfTheWeekIsUsed('default', new Date(nowMs), THE_OFFICE, reading)
  // THE SECRETARY REGISTERED FIRST IS THE ONE WHOSE ID SORTS LAST, so the first appointed is not the first by id.
  let first = ''
  let second = ''
  const told = (): number[] => [first, second, 'w-one'].map((handle) => noticesTo(handle).length)
  const theReceiver = async (): Promise<Record<string, any>> => {
    const read = await ask('GET', '/api/office/usage-notice-secretary', AS_THE_PERSON)
    expect(read.status, read.raw).toBe(200)
    return read.body
  }
  let decision = ''

  beforeAll(async () => {
    const [low, high] = ['sec-one', 'sec-two'].sort((a, b) => (idOf[a]! < idOf[b]! ? -1 : 1))
    first = high!
    second = low!
    t.client.sqlite.prepare('UPDATE agents SET created_at = ? WHERE id = ?').run('2026-10-01 09:00:00', idOf[first])
    t.client.sqlite.prepare('UPDATE agents SET created_at = ? WHERE id = ?').run('2026-10-01 09:00:01', idOf[second])
    const decided = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: 'A made-up usage decision', data: { ...governsTheWholeProject(), replaces: [] } })
    expect(decided.status, decided.raw).toBe(201)
    decision = String(decided.body['record'].id)
  })

  it('tells the first secretary appointed once at 50% on a current reading of 52%, with nobody chosen, and nobody else', async () => {
    const reading = await theReceiver()
    expect(reading['inForce']).toEqual({ from: 'the first secretary appointed', agent: { id: idOf[first], handle: first, name: first }, chosen: null })
    expect(reading['says']).toBe(sayInEnglish('usageNotices.secretary.firstAppointed', { who: first }))
    expect(reading['mayBeChosen'].map((one: { id: string }) => one.id)).toEqual([idOf[first], idOf[second]])
    const now = T0 + 30 * MINUTE
    const week52 = withSevenDays(0.52, RESET_ONE, T0, now)
    tell(week52, now)
    expect(told()).toEqual([1, 0, 0])
    const resets = (week52.logins[0] as OwnEventReading).sevenDays!.resetsAt
    const notice = noticesTo(first)[0]!
    expect(notice.extra.loginsWeek).toEqual({ login: 'sandboxes-claude', resets, shares: [50] })
    expect(notice.body).toContain('50%')
    expect(notice.body).toContain(resets.slice(0, 16))
    expect(notice.body).not.toContain('usage decision')
    expect(notice.body).not.toContain('ask the owner')
    expect(notice.body).not.toContain('was chosen here')
  })

  it('tells a secretary chosen in the middle of the count nothing another was told', async () => {
    const chose = await ask('POST', '/api/office/usage-notice-secretary', AS_THE_PERSON, { agent: second })
    expect(chose.status, chose.raw).toBe(200)
    expect(chose.body['inForce']).toEqual({ from: 'set here', agent: { id: idOf[second], handle: second, name: second } })
    expect(chose.body['says']).toBe(sayInEnglish('usageNotices.secretary.setHere', { who: second }))
    const now = T0 + 90 * MINUTE
    tell(withSevenDays(0.6, RESET_ONE, T0 + HOUR, now), now)
    expect(told()).toEqual([1, 0, 0])
  })

  it('tells the chosen secretary once at 80%, asking it to ask the owner while no usage decision is set, and then never again in that count', () => {
    const now = T0 + 3 * HOUR
    const reading = withSevenDays(0.83, RESET_ONE, T0 + 2 * HOUR, now)
    tell(reading, now)
    expect(told()).toEqual([1, 1, 0])
    const notice = noticesTo(second)[0]!
    expect(notice.extra.loginsWeek.shares).toEqual([50, 80])
    expect(notice.body).toBe(theWordsAtEighty(reading, null))
    const later = T0 + 5 * HOUR
    tell(withSevenDays(0.95, RESET_ONE, T0 + 4 * HOUR, later), later)
    expect(told()).toEqual([1, 1, 0])
  })

  it('tells nobody on a stale reading of 90% with a new reset', () => {
    const readAt = RESET_ONE + HOUR
    const now = readAt + 3 * HOUR
    const reading = withSevenDays(0.9, RESET_TWO, readAt, now)
    expect((reading.logins[0] as OwnEventReading).state).toBe('stale')
    tell(reading, now)
    expect(told()).toEqual([1, 1, 0])
  })

  it('tells nobody on a current reading whose seven-day reset has passed', () => {
    // THE SECOND COUNT, of which nobody has been told anything: a notice that missed the passed reset would tell one.
    const now = RESET_TWO + 30 * MINUTE
    const reading = withSevenDays(0.97, RESET_TWO, RESET_TWO - 30 * MINUTE, now)
    expect((reading.logins[0] as OwnEventReading).state).toBe('current')
    tell(reading, now)
    expect(told()).toEqual([1, 1, 0])
  })

  it('starts a new count at a new seven-day reset, and tells the chosen secretary at 50% again', () => {
    const now = RESET_TWO + 90 * MINUTE
    const reading = withSevenDays(0.52, RESET_THREE, RESET_TWO + HOUR, now)
    tell(reading, now)
    expect(told()).toEqual([1, 2, 0])
    expect(noticesTo(second).at(-1)!.extra.loginsWeek).toEqual({ login: 'sandboxes-claude', resets: (reading.logins[0] as OwnEventReading).sevenDays!.resetsAt, shares: [50] })
  })

  it('says at 80% what the usage decision set in the office says to do, with its id, to the first appointed once the choice is emptied', async () => {
    const emptied = await ask('POST', '/api/office/usage-notice-secretary', AS_THE_PERSON, { agent: null })
    expect(emptied.status, emptied.raw).toBe(200)
    expect(emptied.body['inForce']['from']).toBe('the first secretary appointed')
    const set = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: WHAT_TO_DO, decision })
    expect(set.status, set.raw).toBe(200)
    const now = RESET_THREE + 90 * MINUTE
    const reading = withSevenDays(0.81, RESET_FOUR, RESET_THREE + HOUR, now)
    tell(reading, now)
    expect(told()).toEqual([2, 2, 0])
    const notice = noticesTo(first).at(-1)!
    expect(notice.extra.loginsWeek.shares).toEqual([50, 80])
    expect(notice.body).toBe(theWordsAtEighty(reading, { decision, whatToDo: WHAT_TO_DO }))
    expect(notice.body).not.toContain('ask the owner')
  })

  it('gives the notice to the first appointed when the chosen agent is no longer a secretary, and the notice and the reading say why in the same sentence', async () => {
    const chose = await ask('POST', '/api/office/usage-notice-secretary', AS_THE_PERSON, { agent: second })
    expect(chose.status, chose.raw).toBe(200)
    t.client.sqlite.prepare("UPDATE agents SET role = 'worker' WHERE id = ?").run(idOf[second])
    try {
      const reading = await theReceiver()
      expect(reading['inForce']).toEqual({
        from: 'the first secretary appointed',
        agent: { id: idOf[first], handle: first, name: first },
        chosen: { stored: idOf[second], storedName: second, cannotBecause: 'not a secretary' },
      })
      const why = sayInEnglish('usageNotices.secretary.chosenNotASecretary', { chosen: second, who: first })
      expect(reading['says']).toBe(why)
      const now = RESET_FOUR + 90 * MINUTE
      tell(withSevenDays(0.52, RESET_FIVE, RESET_FOUR + HOUR, now), now)
      expect(told()).toEqual([3, 2, 0])
      const notice = noticesTo(first).at(-1)!
      expect(notice.extra.loginsWeek.shares).toEqual([50])
      expect(notice.body.endsWith(` ${why}`), notice.body).toBe(true)
    } finally {
      t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(idOf[second])
    }
  })

  it('never tells anybody to slow, hold or stop in the office’s own words', () => {
    const bodies = [first, second].flatMap((handle) => noticesTo(handle).map((one) => one.body))
    expect(bodies).toHaveLength(5)
    for (const body of bodies) expect(body.replace(WHAT_TO_DO, '')).not.toMatch(/\b(slow|hold|stop)/i)
  })
})

describe('10. the doors of the two settings', () => {
  let MOST = 0
  let decision = ''
  let notADecision = ''
  /** The person's words for exactly one change, as a secretary carries them. */
  const words = (act: string): Record<string, unknown> => ({ saidBy: THE_PERSON, words: 'Made-up words of the person for this one change.', where: 'terminal', when: '2026-10-01 10:00', for: [act] })
  const theAct = (whatToDo: string | null, decided: string | null): string => `office.set-usage-decision:${JSON.stringify({ whatToDo, decision: decided })}`
  const WORDS = 'Made-up words of another usage decision, 6666.'
  const DECISION_TITLE = 'Another made-up usage decision'

  beforeAll(async () => {
    MOST = (await import('../src/server/lib/usage-notices.ts')).WHAT_TO_DO_MOST
    const decided = await ask('POST', '/api/records', AS_THE_PERSON, { kind: 'decision', title: DECISION_TITLE, data: { ...governsTheWholeProject(), replaces: [] } })
    expect(decided.status, decided.raw).toBe(201)
    decision = String(decided.body['record'].id)
    const other = t.client.sqlite.prepare("SELECT id FROM records WHERE kind <> 'decision' AND deleted_at IS NULL ORDER BY rowid LIMIT 1").get() as { id: string } | undefined
    expect(other).toBeDefined()
    notADecision = other!.id
  })

  it('reads both settings for any agent, and lets only the person or a secretary with a reason choose the receiver, and only a secretary', async () => {
    for (const url of ['/api/office/usage-notice-secretary', '/api/office/usage-decision']) {
      const read = await ask('GET', url, asAgent('w-one'))
      expect(read.status, `${url}: ${read.raw}`).toBe(200)
    }
    const mark = theLastChangeRow()
    const byAWorker = await ask('POST', '/api/office/usage-notice-secretary', asAgent('w-one'), { agent: 'sec-one', because: 'A made-up reason.' })
    expect(byAWorker.status, byAWorker.raw).toBe(403)
    expect(byAWorker.error).not.toBe('')
    const noReason = await ask('POST', '/api/office/usage-notice-secretary', asAgent('sec-one'), { agent: 'sec-two' })
    expect(noReason.status, noReason.raw).toBe(400)
    const aWorkerChosen = await ask('POST', '/api/office/usage-notice-secretary', asAgent('sec-one'), { agent: 'w-one', because: 'A made-up reason.' })
    expect(aWorkerChosen.status, aWorkerChosen.raw).toBe(400)
    const nobodyChosen = await ask('POST', '/api/office/usage-notice-secretary', asAgent('sec-one'), { agent: 'made-up-nobody-7777', because: 'A made-up reason.' })
    expect(nobodyChosen.status, nobodyChosen.raw).toBe(400)
    expect(changesSince(mark)).toEqual([])
    const bySecretary = await ask('POST', '/api/office/usage-notice-secretary', asAgent('sec-one'), { agent: 'sec-two', because: 'A made-up reason.' })
    expect(bySecretary.status, bySecretary.raw).toBe(200)
    expect(bySecretary.body['inForce']).toEqual({ from: 'set here', agent: { id: idOf['sec-two'], handle: 'sec-two', name: 'sec-two' } })
    expect(bySecretary.body['because']).toBe('A made-up reason.')
    expect(changesSince(mark).map((row) => [row.record_id, row.actor_type, row.actor_id])).toEqual([['setting:usage-notice-secretary', 'agent', idOf['sec-one']]])
  })

  it('sets the usage decision on the person’s own act or the person’s words for the exact change, and refuses a secretary’s key alone', async () => {
    const mark = theLastChangeRow()
    const keyAlone = await ask('POST', '/api/office/usage-decision', asAgent('sec-one'), { whatToDo: WORDS, decision })
    expect(keyAlone.status, keyAlone.raw).toBe(403)
    expect(keyAlone.error).not.toBe('')
    const aWorkerWithWords = await ask('POST', '/api/office/usage-decision', asAgent('w-one'), { whatToDo: WORDS, decision, warrant: words(theAct(WORDS, decision)) })
    expect(aWorkerWithWords.status, aWorkerWithWords.raw).toBe(403)
    const wordsForAnotherChange = await ask('POST', '/api/office/usage-decision', asAgent('sec-one'), { whatToDo: WORDS, decision, warrant: words(theAct(`${WORDS} More.`, decision)) })
    expect(wordsForAnotherChange.status, wordsForAnotherChange.raw).toBe(403)
    const noDecision = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: WORDS, decision: null })
    expect(noDecision.status, noDecision.raw).toBe(400)
    const notADecisionRecord = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: WORDS, decision: notADecision })
    expect(notADecisionRecord.status, notADecisionRecord.raw).toBe(400)
    const tooLong = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: 'w'.repeat(MOST + 1), decision })
    expect(tooLong.status, tooLong.raw).toBe(400)
    expect(changesSince(mark)).toEqual([])

    const carried = await ask('POST', '/api/office/usage-decision', asAgent('sec-one'), { whatToDo: WORDS, decision, warrant: words(theAct(WORDS, decision)) })
    expect(carried.status, carried.raw).toBe(200)
    expect(carried.body['inForce']).toEqual({ from: 'set here', whatToDo: WORDS, decision, title: DECISION_TITLE })
    expect(carried.body['says']).toBe(sayInEnglish('usageNotices.decision.setHere', { title: DECISION_TITLE, whatToDo: WORDS }))
    expect(carried.body['says']).not.toContain(decision)
    const rows = changesSince(mark)
    expect(rows.map((row) => [row.record_id, row.actor_type, row.actor_id])).toEqual([['setting:usage-decision', 'agent', idOf['sec-one']]])
    expect(String(rows[0]!.warrant)).toContain('Made-up words of the person for this one change.')

    const atTheMost = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: 'w'.repeat(MOST), decision })
    expect(atTheMost.status, atTheMost.raw).toBe(200)
    const unset = await ask('POST', '/api/office/usage-decision', AS_THE_PERSON, { whatToDo: null, decision: null })
    expect(unset.status, unset.raw).toBe(200)
    expect(unset.body['inForce']).toEqual({ from: 'not set' })
    expect(unset.body['says']).toBe(sayInEnglish('usageNotices.decision.notSet'))
  })
})
