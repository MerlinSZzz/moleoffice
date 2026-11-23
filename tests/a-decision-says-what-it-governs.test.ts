// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION SAYS WHAT IT GOVERNS, AND THE OFFICE ANSWERS WHICH DECISIONS GOVERN A PLACE.
 *
 * What is proved, against a test office started once for the file, with a project of its own for each case:
 *   1. `governs` holds records and paths. An entry with both or neither, a path that can never match, and a record
 *      that is not a page of the same project are each refused with nothing written, on create
 *      and on a patch.
 *   2. GET /api/decisions/governing answers for a path and for a record, newest first, marks a replaced decision with
 *      what replaced it, and refuses a question with both or neither of `path` and `record`.
 *   3. The check lists decisions with nothing in governs, two live decisions governing one thing where the newer does
 *      not replace the older, and a replaced decision that later work still cites.
 *   4. With nobody named for the project, or nothing found, the nightly line says no reminder was sent and why; the
 *      check is due once, at its hour, on a day.
 *   5. The secretary named for the project in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES is sent one message a night: the
 *      three counts, the first three of each list by title and id, and how to ask the lookup. Its kind's row in NOTICES
 *      (src/server/lib/notices.ts) says it wakes its reader. A
 *      name that answers to no agent sends nothing and the line says so.
 *   6. The secretary chosen for the project on the Settings page is sent the message, and the .env line counts only
 *      for a project with nothing chosen there: the rule of `theModuleReminderSecretaries` in
 *      src/server/lib/module-reminder-secretaries.ts, which the Settings page shows. A .env line that cannot be read
 *      does not stop the check for a project with a choice there. A choice there whose agent cannot be reminded now
 *      sends nothing, the line says why, and the .env line is not used in its place.
 *   7. The check and the lookup each have SQLite read the replacements once, however many decisions they ask about,
 *      and give the same answers: which decision stands in place of each, and which replaced one is still cited. The
 *      read is told from every other by its text, and is counted where SQLite runs it, so a read inside
 *      src/server/lib/replaced-decisions.ts is counted too.
 *
 * Three-run proof, this whole file each time:
 *   node tools/run-named-tests.mjs tests/a-decision-says-what-it-governs.test.ts
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/shared/kinds.ts, `theGovernedPlacesAsWritten` returns [] at once: case 1 goes red.
 *   B. src/server/lib/governs.ts, the `row.kind` test in `assertTheGovernedPlacesAreReal` removed: case 1 goes red.
 *   C. src/server/lib/governs.ts, `out.sort(...)` in `decisionsGoverning` removed: case 2 goes red.
 *   D. src/server/lib/governs.ts, `const placed = live.map(` to `const placed = decisions.map(`: case 3 goes red.
 *   E. src/server/lib/governs.ts, `row.createdAt <= later.createdAt ||` removed from `theWorkCiting`: case 3 goes red.
 *   F. src/server/lib/governs.ts, the code `governsNamesRecordsItCannotGovern` taken off its refusal: case 1 goes red.
 *   G. src/server/api/governs.ts, the code `governingAskExactlyOne` taken off its refusal: case 2 goes red.
 *   H. src/server/lib/governs.ts, `if (sentTonight(workspaceId, day))` to `if (false)`: case 5 goes red.
 *   I. src/server/lib/notices.ts, the row `theGovernsCheckFoundWork: WAKES(` to `QUIET(`: case 5 goes red.
 *   J. src/server/lib/governs.ts, `THE_FIRST_FEW = 3` to `THE_FIRST_FEW = 4`: case 5 goes red.
 *   K. src/server/lib/governs.ts, `sendTheGovernsCheck` reads the .env line before the choice on the Settings page:
 *      case 6 goes red.
 *   L. src/server/lib/governs.ts, a choice on the Settings page that cannot be reminded falls back to the .env line:
 *      case 6 goes red.
 *   M. src/server/lib/governs.ts, the replacements no longer passed to `theLineOfReplacements` and `whatSupersedes`, so
 *      each reads them for itself: case 7 goes red (five reads for the check and five for the lookup).
 * Not held here: the tick in src/server/lib/reminders.ts that calls `sendTheGovernsCheck` at 03:00 reads the real clock.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiApp, expectPanelError, freshDb, type TestDb } from './helpers.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
// Read after the test office is open: the module opens the database it is first loaded against.
let governs: typeof import('../src/server/lib/governs.ts')
let notices: typeof import('../src/server/lib/notices.ts')
let workspaces: typeof import('../src/server/lib/workspaces.ts')
// Each case files into a project of its own, so a count over one project sees only that case's decisions.
let ws: string
let caseNumber = 0
const reminderSetting = process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES

beforeAll(async () => {
  t = await freshDb()
  governs = await import('../src/server/lib/governs.ts')
  notices = await import('../src/server/lib/notices.ts')
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
  // The first one loads the whole server, which on a busy machine takes longer than the default ten seconds.
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  ws = `governs-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: ws, title: `Test project ${ws}` })
})

afterEach(() => {
  // Put back the setting a case changes, so the next case starts where this one found the office.
  if (reminderSetting === undefined) delete process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
  else process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = reminderSetting
})

function aRecord(kind: 'module' | 'task' | 'flow', title: string): string {
  const data = kind === 'module' ? { context: 'made up' } : kind === 'task' ? {} : {}
  return t.api.createRecord({ kind, title, data, workspaceId: ws, actor: t.api.HUMAN }).id
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

interface NightlyMessage {
  to: unknown
  body: string
  notice: unknown
  saidInFull: string
  extra: unknown
}

/** The office's nightly governs messages in this test office, oldest first. */
function nightlyMessages(): { id: string; data: NightlyMessage }[] {
  return (
    t.client.sqlite
      .prepare("SELECT id, data FROM records WHERE kind = 'message' AND json_extract(data, '$.extra.governsCheck.day') IS NOT NULL ORDER BY rowid")
      .all() as { id: string; data: string }[]
  ).map((row) => ({ id: row.id, data: JSON.parse(row.data) as NightlyMessage }))
}

/**
 * THE REPLACEMENTS READ as SQLite is given it (`readTheReplacements` in src/server/lib/replaced-decisions.ts): every
 * live decision that supersedes another, with its title, filed first first. `replacedDecisionIds` reads the same links
 * without a title or an order, so it is not counted.
 */
const THE_REPLACEMENTS_READ =
  /^select "links"\."to_id", "records"\."id", "records"\."title", "records"\."created_at" from "links" inner join "records" .* order by "records"\."created_at", "records"\."id"$/

/**
 * How many times SQLite ran the replacements read while `work` ran, and the text of every read it ran, for a failure's
 * message. Counted on SQLite's statements themselves, so a statement an earlier case prepared and kept is counted too.
 */
function theReplacementsReadsDuring(work: () => unknown): { reads: number; ran: string[] } {
  const statement = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (...values: unknown[]) => unknown }
  const all = statement.all
  const ran: string[] = []
  const spy = vi.spyOn(statement, 'all').mockImplementation(function (this: { source: string }, ...values: unknown[]) {
    ran.push(this.source)
    return all.apply(this, values)
  })
  try {
    work()
  } finally {
    spy.mockRestore()
  }
  return { reads: ran.filter((source) => THE_REPLACEMENTS_READ.test(source)).length, ran }
}

async function ask(query: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/decisions/governing${query}`,
    headers: { 'x-mole-office-workspace': ws },
  })
  return { status: reply.statusCode, body: reply.json() }
}

describe('a decision says what it governs', () => {
  it('1: governs takes records and paths, and refuses an entry it cannot defend', async () => {
    const module = aRecord('module', 'Test: the kiln module')
    const task = aRecord('task', 'Test: a task')
    const placed = aDecision('Test: the kiln is fired at night', { governs: [{ record: module }, { path: 'src/shared/paths.ts' }] })
    expect(t.api.getRecord(placed)?.data?.['governs']).toEqual([{ record: module }, { path: 'src/shared/paths.ts' }])

    for (const [governs, says] of [
      [[{ record: module, path: 'src' }], 'exactly one'],
      [[{}], 'exactly one'],
      [[{ path: '../outside' }], '..'],
      [[{ record: task }], 'is a task'],
      [[{ record: 'NoSuchRecord' }], 'is not a record'],
    ] as const) {
      const error = expectPanelError(t, () => aDecision('Test: refused', { governs }), 400)
      expect(error.message, JSON.stringify(governs)).toContain(says)
    }

    workspaces.createWorkspace({ id: 'other', title: 'Other' })
    const elsewhere = t.api.createRecord({ kind: 'module', title: 'Test: elsewhere', data: { context: 'made up' }, workspaceId: 'other', actor: t.api.HUMAN }).id
    expect(expectPanelError(t, () => aDecision('Test: refused', { governs: [{ record: elsewhere }] }), 400).message).toContain('"other"')

    const patch = expectPanelError(t, () => t.api.patchRecord(placed, { dataPatch: { governs: [{ record: task }] } }, t.api.HUMAN), 400)
    expect(patch.message).toContain('is a task')
    expect((patch as { code?: string }).code, 'a page could not draw the refusal in its own language').toBe('governsNamesRecordsItCannotGovern')
    expect(t.api.getRecord(placed)?.data?.['governs'], 'the refused patch wrote').toEqual([{ record: module }, { path: 'src/shared/paths.ts' }])
  })

  it('2: the lookup answers for a path and a record, newest first, and marks a replaced decision', async () => {
    const module = aRecord('module', 'Test: the kiln module')
    const older = aDecision('Test: older, over the folder', { governs: [{ path: 'src/shared' }] })
    const newer = aDecision('Test: newer, the file itself', { governs: [{ path: 'src/shared/paths.ts' }, { record: module }] })
    const later = aDecision('Test: replaces the older', { governs: [{ path: 'tests' }], replaces: [older] })
    const elsewhere = aDecision('Test: another place', { governs: [{ path: 'src/web' }] })
    aDecision('Test: placed nowhere')
    inThisOrder(older, newer, later, elsewhere)
    t.api.createLink({ fromId: later, toId: older, type: 'supersedes', actor: t.api.HUMAN })

    const byPath = await ask('?path=src/shared/paths.ts')
    expect(byPath.status).toBe(200)
    const listed = byPath.body['decisions'] as { id: string; replacedBy: { id: string } | null; how: { reaches: string }[] }[]
    expect(listed.map((one) => one.id), 'not the two that reach the file, newest first').toEqual([newer, older])
    expect(listed.map((one) => one.how.map((how) => how.reaches))).toEqual([['names-it'], ['covers-it']])
    expect(listed.map((one) => one.replacedBy?.id ?? null)).toEqual([null, later])
    expect(byPath.body['notPlaced']).toEqual({ count: 1, of: 5 })

    const byRecord = await ask(`?record=${module}`)
    expect((byRecord.body['decisions'] as { id: string }[]).map((one) => one.id)).toEqual([newer])

    for (const query of ['', `?path=src&record=${module}`, '?folder=src']) {
      expect((await ask(query)).status, query).toBe(400)
    }
    for (const query of ['?', `?path=src&record=${module}`]) {
      expect((await ask(query)).body['code'], `${query}: a page could not draw the refusal in its own language`).toBe('governingAskExactlyOne')
    }
  })

  it('3: the check lists the unplaced, the overlapping and the replaced still cited', async () => {
    const older = aDecision('Test: older over src/shared', { governs: [{ path: 'src/shared' }] })
    const overlap = aDecision('Test: newer over one file, not replacing', { governs: [{ path: 'src/shared/paths.ts' }] })
    const kept = aDecision('Test: kept, over tests', { governs: [{ path: 'tests' }] })
    const replacing = aDecision('Test: replaces the kept one', { governs: [{ path: 'tests/helpers.ts' }], replaces: [kept] })
    const unplaced = aDecision('Test: placed nowhere')
    // A newer decision that names the older in `replaces`: the office links it as replacing the older when it is written,
    // so the pair is not an overlap.
    const web = aDecision('Test: over src/web', { governs: [{ path: 'src/web' }] })
    const webAgain = aDecision('Test: over src/web/pages, replacing the one over src/web', { governs: [{ path: 'src/web/pages' }], replaces: [web] })
    const before = aRecord('task', 'Test: work before the replacement')
    const after = aRecord('task', 'Test: work after the replacement')
    inThisOrder(older, overlap, kept, before, replacing, unplaced, web, webAgain, after)
    t.api.createLink({ fromId: replacing, toId: kept, type: 'supersedes', actor: t.api.HUMAN })
    t.api.createLink({ fromId: before, toId: kept, type: 'relates_to', actor: t.api.HUMAN })
    t.api.createLink({ fromId: after, toId: kept, type: 'relates_to', actor: t.api.HUMAN })

    const check = governs.theGovernsCheck(ws)
    expect(check.nothingInGoverns.map((one) => one.id)).toEqual([unplaced])
    expect(check.overlapping.map((one) => [one.newer.id, one.older.id]), 'a pair where the newer replaces the older is not an overlap').toEqual([[overlap, older]])
    expect(check.stillCited.map((one) => [one.replaced.id, one.replacedBy.id, one.citedBy.map((by) => by.id)])).toEqual([[kept, replacing, [after]]])

    const door = await app.inject({
      method: 'GET',
      url: '/api/decisions/governs-check',
      headers: { 'x-mole-office-workspace': ws },
    })
    expect(door.statusCode).toBe(200)
    expect((door.json() as { stillCited: unknown[] }).stillCited).toHaveLength(1)
  })

  it('4: with nobody named, the nightly line says no reminder was sent, and the check is due once at its hour', () => {
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
    const messagesBefore = nightlyMessages()
    const night = new Date(2026, 9, 5, 3, 5)
    expect(governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)).toBe(
      `The governs check for ${ws}: 0 decisions with nothing in governs, 0 pairs governing one thing without one ` +
        `replacing the other, 0 replaced decisions still cited by later work. ${governs.NOTHING_FOR_THE_NIGHTLY_REMINDER}`,
    )
    aDecision('Test: placed nowhere')
    expect(governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)).toBe(
      `The governs check for ${ws}: 1 decisions with nothing in governs, 0 pairs governing one thing without one ` +
        'replacing the other, 0 replaced decisions still cited by later work. No reminder sent: nobody is named for ' +
        `${ws} on the Settings page or in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES.`,
    )
    expect(nightlyMessages(), 'this case wrote a nightly message when nobody was named').toEqual(messagesBefore)
    expect(governs.theGovernsCheckIsDue(new Date(2026, 9, 5, 3, 5), null)).toBe(true)
    expect(governs.theGovernsCheckIsDue(new Date(2026, 9, 5, 3, 15), '2026-10-05')).toBe(false)
    expect(governs.theGovernsCheckIsDue(new Date(2026, 9, 5, 14, 0), null)).toBe(false)
    expect(governs.theGovernsCheckIsDue(new Date(2026, 9, 6, 3, 0), '2026-10-05')).toBe(true)
  })

  it('5: the secretary named for the project is sent one message a night, with the counts, the first few and the lookup', async () => {
    const started = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: { 'content-type': 'application/json', 'x-mole-office-workspace': ws, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
      payload: { handle: 'clerk', name: 'clerk', role: 'secretary' },
    })
    expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
    const clerk = (started.json() as { agent: { id: string } }).agent.id
    const messagesBefore = nightlyMessages()
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=nobody-here`
    const unplaced = ['one', 'two', 'three', 'four'].map((n) => aDecision(`Test: placed nowhere, ${n}`))
    inThisOrder(...unplaced)
    const night = new Date(2026, 9, 5, 3, 5)
    expect(governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)).toContain('No reminder sent: no registered agent answers to "nobody-here".')

    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=clerk`
    const line = governs.sendTheGovernsCheck(ws, night, t.api.HUMAN)
    const sent = nightlyMessages().filter((one) => !messagesBefore.some((before) => before.id === one.id))
    expect(sent).toHaveLength(1)
    expect(line).toBe(
      `The governs check for ${ws}: 4 decisions with nothing in governs, 0 pairs governing one thing without one ` +
        `replacing the other, 0 replaced decisions still cited by later work. Reminder sent to clerk, message ${sent[0]!.id}.`,
    )
    const message = sent[0]!.data
    expect(message.to).toEqual([{ kind: 'agent', id: clerk }])
    expect(message.body).toBe('The governs check found work')
    expect(message.extra).toEqual({ governsCheck: { day: '2026-10-05', project: ws } })
    // Newest first, the first three by title and id, and the fourth counted.
    expect(message.saidInFull).toContain(
      `4 decisions with nothing in governs: "Test: placed nowhere, four" (${unplaced[3]!}); "Test: placed nowhere, three" (${unplaced[2]!}); ` +
        `"Test: placed nowhere, two" (${unplaced[1]!}); and 1 more.`,
    )
    expect(message.saidInFull).not.toContain(unplaced[0]!)
    expect(message.saidInFull).toContain(`GET /api/decisions/governs-check in ${ws} answers every one of them.`)
    expect(message.saidInFull).toContain('GET /api/decisions/governing with path=')
    // It asks the secretary to act, so it wakes a waiter.
    expect(message.notice).toBe('theGovernsCheckFoundWork')
    expect(notices.whyThisWakesNoWaiter(moleOffice(), message.notice)).toBeNull()

    // Once a night: a second pass that night sends nothing more and says so; the next night sends again.
    expect(governs.sendTheGovernsCheck(ws, new Date(2026, 9, 5, 3, 40), t.api.HUMAN)).toContain('No reminder sent: clerk was already sent one on 2026-10-05.')
    expect(nightlyMessages().filter((one) => !messagesBefore.some((before) => before.id === one.id))).toHaveLength(1)
    expect(governs.sendTheGovernsCheck(ws, new Date(2026, 9, 6, 3, 5), t.api.HUMAN)).toContain('Reminder sent to clerk')
    expect(nightlyMessages().filter((one) => !messagesBefore.some((before) => before.id === one.id))).toHaveLength(2)
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = ''
  })

  it('6: the secretary chosen on the Settings page comes first, and the .env line counts only with nothing chosen there', async () => {
    const asThePerson = { 'content-type': 'application/json', 'x-mole-office-workspace': ws, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
    const idOf: Record<string, string> = {}
    for (const handle of ['keeper', 'warden']) {
      const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle, name: handle, role: 'secretary' } })
      expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
      idOf[handle] = (started.json() as { agent: { id: string } }).agent.id
    }
    const choose = async (secretary: string | null): Promise<void> => {
      const chosen = await app.inject({ method: 'POST', url: `/api/office/module-reminder-secretaries/${ws}`, headers: asThePerson, payload: { secretary } })
      expect(chosen.statusCode, chosen.body.slice(0, 300)).toBe(200)
    }
    const messagesBefore = nightlyMessages()
    const sentSince = () => nightlyMessages().filter((one) => !messagesBefore.some((before) => before.id === one.id))
    aDecision('Test: placed nowhere')

    // Chosen on the Settings page, and the .env line names another secretary: the one chosen there is sent it.
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=warden`
    await choose(idOf.keeper!)
    const first = governs.sendTheGovernsCheck(ws, new Date(2026, 9, 5, 3, 5), t.api.HUMAN)
    expect(sentSince()).toHaveLength(1)
    expect(first).toContain(`Reminder sent to keeper, message ${sentSince()[0]!.id}.`)
    expect(sentSince()[0]!.data.to).toEqual([{ kind: 'agent', id: idOf.keeper }])

    // A .env line that cannot be read is not needed by a project with a choice there, so the check still sends.
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}:warden`
    expect(governs.sendTheGovernsCheck(ws, new Date(2026, 9, 6, 3, 5), t.api.HUMAN)).toContain('Reminder sent to keeper')
    expect(sentSince()).toHaveLength(2)

    // The one chosen there cannot be reminded now: nothing is sent, the line says why, and the .env line is not used.
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}=warden`
    const retired = await app.inject({ method: 'POST', url: '/api/participants/agent/keeper/retire', headers: asThePerson, payload: { because: 'Test: its work here is done.' } })
    expect(retired.statusCode, retired.body.slice(0, 300)).toBe(200)
    expect(governs.sendTheGovernsCheck(ws, new Date(2026, 9, 7, 3, 5), t.api.HUMAN)).toContain(
      `No reminder sent: the secretary set for ${ws} on the Settings page, keeper, is retired. The .env line is not used in its place.`,
    )
    expect(sentSince()).toHaveLength(2)

    // Nothing chosen there: the .env line counts, and a line that cannot be read stops the check, loudly.
    await choose(null)
    expect(governs.sendTheGovernsCheck(ws, new Date(2026, 9, 8, 3, 5), t.api.HUMAN)).toContain('Reminder sent to warden')
    expect(sentSince().map((one) => one.data.to)).toEqual([...Array(2).fill([{ kind: 'agent', id: idOf.keeper }]), [{ kind: 'agent', id: idOf.warden }]])
    process.env.MOLE_OFFICE_MODULE_REMINDER_SECRETARIES = `${ws}:warden`
    expect(() => governs.sendTheGovernsCheck(ws, new Date(2026, 9, 9, 3, 5), t.api.HUMAN)).toThrow(`MOLE_OFFICE_MODULE_REMINDER_SECRETARIES contains "${ws}:warden"`)
    expect(sentSince()).toHaveLength(3)
  })

  it('7: the check and the lookup each read the replacements once, however many decisions they ask about, and answer the same', () => {
    // TWO LINES OF REPLACEMENTS: the first replaced by the second and the second by the third, on one file; the fourth
    // replaced by the fifth, on another. Work filed after both lines cites the first and the fourth.
    const first = aDecision('Test: the first rule on the governs file', { governs: [{ path: 'src/server/lib/governs.ts' }] })
    const second = aDecision('Test: the second rule on it, replacing the first', { governs: [{ path: 'src/server/lib/governs.ts' }], replaces: [first] })
    const third = aDecision('Test: the third rule on it, replacing the second', { governs: [{ path: 'src/server/lib/governs.ts' }], replaces: [second] })
    const fourth = aDecision('Test: the fourth rule, on the replacements file', { governs: [{ path: 'src/server/lib/replaced-decisions.ts' }] })
    const fifth = aDecision('Test: the fifth rule on it, replacing the fourth', { governs: [{ path: 'src/server/lib/replaced-decisions.ts' }], replaces: [fourth] })
    const cites = aRecord('task', 'Test: work that cites the first and the fourth')
    inThisOrder(first, second, third, fourth, fifth, cites)
    t.api.createLink({ fromId: cites, toId: first, type: 'relates_to', actor: t.api.HUMAN })
    t.api.createLink({ fromId: cites, toId: fourth, type: 'relates_to', actor: t.api.HUMAN })

    let check: ReturnType<typeof governs.theGovernsCheck> | undefined
    const checked = theReplacementsReadsDuring(() => (check = governs.theGovernsCheck(ws)))
    expect(checked.reads, `the check's reads:\n${checked.ran.join('\n')}`).toBe(1)
    expect(check?.nothingInGoverns).toEqual([])
    expect(check?.overlapping).toEqual([])
    expect(check?.stillCited.map((one) => [one.replaced.id, one.replacedBy.id, one.citedBy.map((by) => by.id)])).toEqual([
      [fourth, fifth, [cites]],
      [first, third, [cites]],
    ])

    let lookup: ReturnType<typeof governs.decisionsGoverning> | undefined
    const looked = theReplacementsReadsDuring(() => (lookup = governs.decisionsGoverning(ws, { path: 'src/server/lib' })))
    expect(looked.reads, `the lookup's reads:\n${looked.ran.join('\n')}`).toBe(1)
    expect(lookup?.decisions.map((one) => [one.id, one.replacedBy?.id ?? null])).toEqual([
      [fifth, null],
      [fourth, fifth],
      [third, null],
      [second, third],
      [first, third],
    ])
  })
})
