// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BOOKING LINE TO A PERSON NAMES THEIR PRESS AND WHERE IT IS, NEVER A COMMAND.
 *
 * Chapter 10 rule 4: never ask the owner to run a command, paste an id or edit a file; their acts are
 * presses. The office's check WpRLdgavRidV refused wave 13s's entry r-6iPbnAUucz because the line asking
 * the owner to grant a request to go first told them to answer with POST /api/bookings/<id>/go-first/answer. The
 * owner approves by a press, on the Resources page.
 *
 * This file drives the real doors on a fresh office with a fake process table, and reaches every booking
 * line the office sends to the owner:
 *
 *   1. ASKED: an agent asks to go ahead of the owner's booking, which only they can grant;
 *   2. OVER THE CARD: an agent books beside the owner's booking, and the GiB booked go over the card;
 *   3. GO FIRST NOW: the owner cuts in "now" while a booking of their own runs, and they are told to stop within the grace.
 *
 * Round 38 changed rules 2 and 3. Nothing is moved for memory any more, so no booking of theirs
 * is moved later and a granted request to go first stops nobody: the MOVED line is gone, and the over-the-card
 * reminder is new. "Go first now" reaches a running booking only through their own "cutIn", so rule 3 drives that.
 * The round's control, mutations and restore are in block r38 of report F8Js-ygh8Rix.
 *
 * Each line to the owner holds no "/api/", no "POST" and no "curl", in its few words or its whole sentence,
 * and carries a lead to the Resources page. Rule 4 holds the other side: the line to an agent still
 * names its door, and carries no lead.
 *
 * THE BUTTONS ARE NAMED IN ONE PLACE. The line names the page's two buttons by the words the page draws
 * them with, `resources.grant` and `resources.refuse` (src/web/pages/ResourcesPage.tsx). Rule 1 reads
 * those words; rule 5 renames them in this process and asks the line again, so a line that copies
 * today's words goes red as soon as the page's words change. The check DNvN3uDNglE_ refused round 30d's
 * line, which said "Grant or Refuse" while the buttons said otherwise.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then the mutation, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * The mutation puts the old line back: in src/shared/groups.ts `aGoFirstIsAsked` always says the agents'
 * sentence with POST /api/bookings/<id>/go-first/answer (`toAPerson ?` → `false ?`). Rule 1 goes red; rules 2
 * to 4 stay green. The run is in the round 30d report, block r30d of AAWGpskNgd49.
 *
 * Round 30e's mutation writes a button's name into the line as a literal: in `aGoFirstIsAsked`
 * `${sayInEnglish('resources.grant')}` → `Let it go first`. Rule 5 goes red; rules 1 to 4 stay green,
 * because the literal is today's word. The run is in block r30e of AAWGpskNgd49.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { WORD_LISTS, sayInEnglish } from '../src/shared/i18n.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** What a line to a person may never hold. */
const A_COMMAND = ['/api/', 'POST', 'curl'] as const
/** The page's two buttons, read from the words the page draws them with. */
const theButtons = (): string[] => [sayInEnglish('resources.grant'), sayInEnglish('resources.refuse')]
/** Where the lead takes the owner. The store adds the place on the page, `{at: 'surface'}`, itself. */
const THE_RESOURCES_PAGE = { kind: 'page', route: '/resources' }

let t: TestDb
let app: FastifyInstance
let res: ResourcesLib
const live = new Map<number, OsProcess>()

function fakeProbe(): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('a booking never signals anything')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  }
}

async function ask(path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: body === undefined && !path.includes('/cancel') ? 'GET' : 'POST', url: path, headers, payload: body as Record<string, unknown> | undefined })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function register(handle: string, role: string, workArea: string[], by: Record<string, string>): Promise<void> {
  const answer = await ask('/api/agents/started', by, { handle, name: handle, runtime: 'claude-code', role, workArea })
  expect(answer.status, `${handle}: ${JSON.stringify(answer.said)}`).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

async function booked(by: Record<string, string>, gib: number, minutes: number): Promise<string> {
  const answer = await ask('/api/bookings', by, { resource: 'gpu', gib, minutes, purpose: 'a test run', start: 'now' })
  expect(answer.status, JSON.stringify(answer.said)).toBe(201)
  return (answer.said['booking'] as { id: string }).id
}

interface Line {
  body: string
  saidInFull?: string
  notice?: string
  lead?: unknown
}

/** The office's lines of one notice kind written to one participant, newest last. */
function linesOf(notice: string, to: { kind: string; id: string }): Line[] {
  const rows = t.client.sqlite
    .prepare("SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL ORDER BY created_at, rowid")
    .all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as Line & { to?: { kind: string; id: string }[] })
    .filter((m) => m.notice === notice && (m.to ?? []).some((one) => one.kind === to.kind && one.id === to.id))
}

const THE_OWNER = { kind: 'person', id: THE_PERSON }

/** The one rule this file is for: a line to a person names no command, and leads to the Resources page. */
function expectAPressNotACommand(line: Line | undefined, what: string): void {
  expect(line, `no ${what} line reached the owner`).toBeDefined()
  const words = `${line!.body}\n${line!.saidInFull ?? ''}`
  for (const command of A_COMMAND) expect(words, `the ${what} line to the owner names "${command}"`).not.toContain(command)
  expect(words, `the ${what} line to the owner does not say where to look`).toContain('Resources page')
  expect((line!.lead as { target?: unknown } | undefined)?.target, `the ${what} line to the owner carries no lead to the Resources page`).toEqual(THE_RESOURCES_PAGE)
}

beforeAll(async () => {
  // THE GPU WATCHER, a made-up handle: the agent MOLE_OFFICE_GPU_WATCHER names may hand in a reading of the card.
  process.env.MOLE_OFFICE_GPU_WATCHER = 'card-watcher'
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.ready()
  res.useOsProbe(fakeProbe())
  await register('sec-a', 'supervisor', ['src/sec-a'], AS_THE_PERSON)
  expect((await ask('/api/roles/card/sec-a', AS_THE_PERSON, { role: 'secretary' })).status).toBe(201)
  await register('wa1', 'worker', ['src/a1'], asAgent('sec-a'))
  await register('wa2', 'worker', ['src/a2'], asAgent('sec-a'))
  await register('card-watcher', 'worker', ['src/card-watcher'], AS_THE_PERSON)
  const read = await ask('/api/resources/gpu/reading', asAgent('card-watcher'), { readAt: '2026-10-08 18:00:00', totalMiB: 16303, usedMiB: 900, processes: [] })
  expect(read.status, JSON.stringify(read.said)).toBe(200)
}, 300_000)

afterEach(async () => {
  const left = t.client.sqlite
    .prepare("SELECT id FROM records WHERE kind = 'booking' AND json_extract(data, '$.state') IN ('waiting', 'running')")
    .all() as { id: string }[]
  for (const one of left) expect((await ask(`/api/bookings/${one.id}/cancel`, AS_THE_PERSON)).status).toBe(200)
  live.clear()
})

afterAll(async () => {
  delete process.env.MOLE_OFFICE_GPU_WATCHER
  res.useOsProbe(res.LINUX_PROBE)
  await app.close()
  t.close()
})

describe('a booking line to the owner', () => {
  it('1. asks the person to press one of the Resources page\'s two buttons, by their words, with a lead, and names no command', async () => {
    const their = await booked(AS_THE_PERSON, 10, 60)
    const mine = await booked(asAgent('wa1'), 10, 30)
    const asked = await ask(`/api/bookings/${mine}/go-first`, asAgent('wa1'), { ahead: their })
    expect(asked.status, JSON.stringify(asked.said)).toBe(200)
    const line = linesOf('aGoFirstIsAsked', THE_OWNER).at(-1)
    expectAPressNotACommand(line, 'asked')
    for (const button of theButtons()) expect(line!.saidInFull, 'the line does not name the page\'s button').toContain(`"${button}"`)
    expect(line!.saidInFull, 'the owner holds the booking asked to wait, so it is theirs').toContain('ahead of your booking')
  })

  it('2. reminds the person that the GiB booked go over the card, with a lead, and names no command and no booking id', async () => {
    const their = await booked(AS_THE_PERSON, 10, 60)
    const mine = await booked(asAgent('wa1'), 10, 30)
    const line = linesOf('aBookingsGoOverTheCard', THE_OWNER).at(-1)
    expectAPressNotACommand(line, 'over the card')
    expect(line!.saidInFull).toContain("wa1's booking declares 10 GiB; your booking declares 10 GiB. Together that is 20 GiB, and the card has 15 GiB")
    for (const id of [their, mine]) expect(line!.saidInFull, 'the line to the owner names a booking id').not.toContain(id)
  })

  it('3. tells the person to stop their running booking within the grace, with a lead, and names no command', async () => {
    const their = await booked(AS_THE_PERSON, 10, 60)
    live.set(4300, { pid: 4300, pgid: 4300, ppid: 1, command: 'test-run-4300', startedAt: '2026-10-08 10:00:00' })
    const named = await ask(`/api/bookings/${their}/program`, AS_THE_PERSON, { pid: 4300 })
    expect(named.status, JSON.stringify(named.said)).toBe(200)
    const cut = await ask('/api/bookings', AS_THE_PERSON, { resource: 'gpu', gib: 10, minutes: 30, purpose: 'a test run', start: 'now', cutIn: 'now' })
    expect(cut.status, JSON.stringify(cut.said)).toBe(201)
    const line = linesOf('aBookingGoesFirstNow', THE_OWNER).at(-1)
    expectAPressNotACommand(line, 'go first now')
    expect(line!.saidInFull, 'naming a program takes a door, so the owner is not asked to').not.toContain('name its program')
  })
})

describe('a booking line to an agent', () => {
  it('4. still names the door it answers through, and carries no lead', async () => {
    const holders = await booked(asAgent('wa1'), 10, 60)
    const mine = await booked(asAgent('wa2'), 10, 30)
    expect((await ask(`/api/bookings/${mine}/go-first`, asAgent('wa2'), { ahead: holders })).status).toBe(200)
    const line = linesOf('aGoFirstIsAsked', { kind: 'agent', id: idOf('sec-a') }).at(-1)
    expect(line, 'no asked line reached the secretary').toBeDefined()
    expect(line!.saidInFull).toContain(`POST /api/bookings/${mine}/go-first/answer`)
    expect(line!.lead).toBeUndefined()
  })
})

describe('the buttons a line to a person names', () => {
  it('5. are the page\'s own words, so renaming a button there renames it in the line', () => {
    const words = WORD_LISTS.en as Record<string, unknown>
    const before = { grant: words['resources.grant'], refuse: words['resources.refuse'] }
    try {
      words['resources.grant'] = 'Renamed grant button'
      words['resources.refuse'] = 'Renamed refuse button'
      expect(theButtons(), 'the word list in this process could not be renamed').toEqual(['Renamed grant button', 'Renamed refuse button'])
      const said = SYSTEM_LINES.aGoFirstIsAsked('wa1', 'b1', 'b2', null, true).said ?? ''
      expect(said).toContain('"Renamed grant button"')
      expect(said).toContain('"Renamed refuse button"')
    } finally {
      words['resources.grant'] = before.grant
      words['resources.refuse'] = before.refuse
    }
  })
})
