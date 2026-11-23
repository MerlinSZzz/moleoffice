// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DECISIONS ON ONE FILE MAY BOTH STAND, AND THE NIGHTLY GOVERNS CHECK THEN STOPS LISTING THEM. Wave 13j round
 * loop-4, item 1 of the line "supervisors run their own work" (message 9MaTE630Pl-b): of 69 pairs of decisions
 * naming one file in the ai-news project, 64 were different rules of one brief. The only way to quiet a pair was
 * `replaces`, and that retires the whole older decision.
 *
 * The answer is a link, `coexists_with`, between two decisions. It changes neither decision, so it retires nothing.
 * Any agent may draw it, as any agent may draw every other link on a decision.
 *
 * What is proved, against a test office of its own:
 *   1. An agent joins two decisions on one path with `coexists_with`. The pair is no longer listed and is counted in
 *      `bothStand`. Neither decision changed, both are still live, and a third decision on the path is listed with each.
 *   2. The link drawn the other way round quiets the pair too, and deleting it lists the pair again.
 *   3. A `coexists_with` link with anything but a decision at either end is refused, and nothing is written.
 *   4. The nightly message and the logged line say the count, and a project whose only pairs both stand gets no message.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/governs.ts, `standing.has(pairKey(newer.row.id, older.row.id))` reads `false`: cases 1, 2 and 4 go red.
 *   B. src/server/lib/governs.ts, `pairKey` keeps the order it was given: case 2 goes red.
 *   C. src/server/lib/records.ts, the `coexists_with` branch of `checkLinkKinds` returns at once: case 3 goes red.
 *   D. src/server/lib/governs.ts, the `bothStand` sentence in `theNightlyMessage` gives '' instead: case 4 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
// Read after the test office is open: the module opens the database it is first loaded against.
let governs: typeof import('../src/server/lib/governs.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
// Each case files into a project of its own, so the check and the message see only that case's decisions.
let ws: string
const reminderSetting = process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
let caseNumber = 0

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'rule-keeper',
}

beforeAll(async () => {
  t = await freshDb()
  governs = await import('../src/server/lib/governs.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'rule-keeper', name: 'Rule keeper', role: 'worker' },
  })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  // The first one loads the whole server, which on a busy machine takes longer than the default ten seconds.
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  ws = `coexists-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: ws, title: `Test project ${ws}` })
})

function aModule(title: string): string {
  return t.api.createRecord({ kind: 'module', title, data: { context: 'made up' }, workspaceId: ws, actor: t.api.HUMAN }).id
}

function aDecision(title: string, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'decision',
    title,
    data: { option_taken: title, because: 'A made-up reason.', ...extra },
    workspaceId: ws,
    actor: t.api.HUMAN,
  }).id
}

/** Records made in one test land in one second; each is given its own minute, in the order named. */
function inThisOrder(...ids: string[]): void {
  ids.forEach((id, i) => {
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2026-10-01 10:${String(10 + i)}:00`, id)
  })
}

/** Draw a `coexists_with` link through the door, as an agent. */
async function link(fromId: string, toId: string): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: { ...AS_AN_AGENT, 'x-mole-office-workspace': ws },
    payload: { fromId, toId, type: 'coexists_with' },
  })
  return { status: reply.statusCode, body: reply.body }
}

/** Each pair the check lists, as [newer, older]. */
function listed(): string[][] {
  return governs.theGovernsCheck(ws).overlapping.map((pair) => [pair.newer.id, pair.older.id])
}

/** What is stored for these records, so a test can say nothing about them changed. */
function stored(...ids: string[]): unknown[] {
  return ids.map((id) => t.client.sqlite.prepare('SELECT title, data, updated_at, deleted_at FROM records WHERE id = ?').get(id))
}

function theCoexistsLinks(): number {
  return (t.client.sqlite.prepare("SELECT count(*) AS n FROM links WHERE type = 'coexists_with'").get() as { n: number }).n
}

/** The office's nightly governs messages in this test office, oldest first, as they were said in full. */
function nightlyMessages(): string[] {
  return (
    t.client.sqlite
      .prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.governsCheck.day') IS NOT NULL ORDER BY rowid")
      .all() as { data: string }[]
  ).map((row) => (JSON.parse(row.data) as { saidInFull: string }).saidInFull)
}

describe('two decisions on one file may both stand', () => {
  it('1: an agent joins two decisions on one path, the pair is counted and not listed, and neither decision changed', async () => {
    const older = aDecision('Test: the header, its colour', { governs: [{ path: 'src/web/header.ts' }] })
    const newer = aDecision('Test: the header, its height', { governs: [{ path: 'src/web/header.ts' }] })
    inThisOrder(older, newer)
    // The control: before the link, the pair is listed.
    expect(listed()).toEqual([[newer, older]])
    expect(governs.theGovernsCheck(ws).bothStand).toBe(0)
    const before = stored(older, newer)

    const drawn = await link(newer, older)
    expect(drawn.status, drawn.body.slice(0, 400)).toBe(201)

    const check = governs.theGovernsCheck(ws)
    expect(check.overlapping, 'a pair that both stand is listed').toEqual([])
    expect(check.bothStand).toBe(1)
    expect(stored(older, newer), 'the link changed a decision').toEqual(before)

    // Both are still live: neither is marked replaced, and a third decision on the path is listed with each.
    const third = aDecision('Test: the header, its font', { governs: [{ path: 'src/web/header.ts' }] })
    inThisOrder(older, newer, third)
    // The check sorts by the newer decision only, so two pairs with one newer decision come in no stated order.
    expect(listed().sort()).toEqual(
      [
        [third, newer],
        [third, older],
      ].sort(),
    )
    expect(governs.theGovernsCheck(ws).bothStand).toBe(1)
    const governing = governs.decisionsGoverning(ws, { path: 'src/web/header.ts' }).decisions
    expect(governing.map((one) => [one.id, one.replacedBy])).toEqual([
      [third, null],
      [newer, null],
      [older, null],
    ])
  })

  it('2: the link drawn the other way round quiets the pair too, and deleting it lists the pair again', async () => {
    const older = aDecision('Test: the footer, its links', { governs: [{ path: 'src/web/footer.ts' }] })
    const newer = aDecision('Test: the footer, its year', { governs: [{ path: 'src/web/footer.ts' }] })
    inThisOrder(older, newer)

    const drawn = await link(older, newer)
    expect(drawn.status, drawn.body.slice(0, 400)).toBe(201)
    expect(listed(), 'a link from the older to the newer did not quiet the pair').toEqual([])
    expect(governs.theGovernsCheck(ws).bothStand).toBe(1)

    const id = (t.client.sqlite.prepare("SELECT id FROM links WHERE type = 'coexists_with' AND workspace_id = ?").get(ws) as { id: string }).id
    const removed = await app.inject({ method: 'DELETE', url: `/api/links/${id}`, headers: { ...AS_AN_AGENT, 'x-mole-office-workspace': ws } })
    expect(removed.statusCode, removed.body.slice(0, 400)).toBe(200)
    expect(listed()).toEqual([[newer, older]])
    expect(governs.theGovernsCheck(ws).bothStand).toBe(0)
  })

  it('3: a coexists_with link with anything but a decision at either end is refused, and nothing is written', async () => {
    const decision = aDecision('Test: the menu, its order', { governs: [{ path: 'src/web/menu.ts' }] })
    const module = aModule('Test: the website module')
    const linksBefore = theCoexistsLinks()
    for (const [fromId, toId] of [
      [decision, module],
      [module, decision],
    ] as const) {
      const refused = await link(fromId, toId)
      expect(refused.status, refused.body.slice(0, 400)).toBe(400)
      expect(refused.body).toContain('A `coexists_with` link says two decisions both stand')
      expect(refused.body).toContain('Nothing was written.')
    }
    expect(theCoexistsLinks()).toBe(linksBefore)
  })

  it('4: the nightly message and the logged line say the count, and pairs that both stand alone send nothing', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { ...AS_THE_PERSON, 'x-mole-office-workspace': ws },
      payload: { handle: 'clerk', name: 'clerk', role: 'secretary' },
    })
    expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
    const older = aDecision('Test: the search box, its width', { governs: [{ path: 'src/web/search.ts' }] })
    const newer = aDecision('Test: the search box, its hint', { governs: [{ path: 'src/web/search.ts' }] })
    inThisOrder(older, newer)
    expect((await link(newer, older)).status).toBe(201)

    const messagesBefore = nightlyMessages()
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=clerk`
    try {
      const quiet = governs.sendTheGovernsCheck(ws, new Date(2026, 9, 5, 3, 5), t.api.HUMAN)
      expect(quiet).toContain(
        '0 pairs governing one thing without one replacing the other, 1 more pairs naming one file that are linked as both standing, ' +
          `0 replaced decisions still cited by later work. ${governs.NOTHING_FOR_THE_NIGHTLY_REMINDER}`,
      )
      expect(nightlyMessages(), 'a quiet project sent a nightly message').toEqual(messagesBefore)

      const third = aDecision('Test: the search box, its button', { governs: [{ path: 'src/web/search.ts' }] })
      inThisOrder(older, newer, third)
      const line = governs.sendTheGovernsCheck(ws, new Date(2026, 9, 6, 3, 5), t.api.HUMAN)
      expect(line).toContain('2 pairs governing one thing without one replacing the other, 1 more pairs naming one file that are linked as both standing, ')
      const sent = nightlyMessages().filter((one) => !messagesBefore.includes(one))
      expect(sent).toHaveLength(1)
      expect(sent[0]).toContain(
        '1 more pairs naming one file are linked as decisions that both stand: they are counted and not listed.',
      )
    } finally {
      if (reminderSetting === undefined) delete process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
      else process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = reminderSetting
    }
  })
})
