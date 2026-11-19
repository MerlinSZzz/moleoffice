// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW MESSAGE ASKS WHETHER ANOTHER MESSAGE WAS WRITTEN IN ITS SECOND THROUGH THE INDEX OF WHEN A RECORD LAST CHANGED.
 * Wave 13y round 36.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with 25,696 messages. Every message written asks this, for
 * the event that tells an open page about it (`anotherInTheSameSecond` in src/server/lib/messages.ts). SQLite walked
 * every message through `records_kind_idx` to answer: 16 ms and 55 MB read from the file for each message written. Asked
 * among the records changed since the message's second, through `records_updated_idx`, it took 0.002 ms and gave the same
 * answer. A record is written with both stamps the same and is only changed later, so another message made in that
 * second has changed in it or since. For a message a month old the same read walked 82 MB, so an older message the patch
 * door announces is still asked the old way. The times on the three copies are in the round's report.
 *
 * WHAT THIS HOLDS.
 * - The same answer. A message is said to share its second when another live message was written in it, and only then:
 *   four in one second; one alone in its second beside a note; one whose partner in its second was deleted; and one
 *   whose partner was changed later. The answer is compared with the rows themselves, as the create door gives it when
 *   the message is written, and as both forms of the read give it afterwards.
 * - The create door asks among the records changed since the message's second. Its plan is read from SQLite itself,
 *   with the values bound.
 *
 * WHAT IT DOES NOT HOLD. How long the read takes. The plan of the read for an older message the patch door announces. A
 * record whose change stamp is older than its creation stamp: the office does not write one, and none of the three
 * copies measured had one.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const

/** A plan step that walks every record or every record of one kind. */
const A_WHOLE_READ = /SCAN records\b|records_kind_idx/

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
})

afterEach(() => {
  vi.useRealTimers()
  t?.close()
  vi.unstubAllEnvs()
})

/**
 * Every read `work` made of the records written in one second, with whether it found one and SQLite's plan for it,
 * asked with the values bound.
 */
function theSameSecondReadsDuring(work: () => unknown): { values: unknown[]; found: boolean; plan: string[] }[] {
  const ran: { sql: string; values: unknown[]; found: boolean }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!/^\s*select\b/i.test(source) || !/"records"\."created_at" = \?/.test(source)) return statement
    for (const method of ['all', 'get'] as const) {
      const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
        const rows = real(...values)
        ran.push({ sql: source, values, found: Array.isArray(rows) ? rows.length > 0 : rows !== undefined })
        return rows
      }
    }
    return statement
  }) as never)
  try {
    work()
  } finally {
    spy.mockRestore()
  }
  return ran.map((one) => ({
    values: one.values,
    found: one.found,
    plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
}

/** Whether another live message has the stamp this one has, read from the rows themselves. */
function anotherLiveMessageHasItsStamp(id: string): boolean {
  return t.client.sqlite
    .prepare("SELECT 1 FROM records AS one JOIN records AS other ON other.created_at = one.created_at WHERE one.id = ? AND other.id <> one.id AND other.kind = 'message' AND other.deleted_at IS NULL")
    .get(id) !== undefined
}

it('a new message asks for another in its second among the records changed since, and gets the same answer', async () => {
  const { whatANewMessageChanges } = await import('../src/server/lib/messages.ts')
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'reader', data: { handle: 'reader', runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER })
  const { id: reader } = t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'reader'").get() as { id: string }

  // ONLY THE CLOCK THE STAMPS ARE READ FROM IS SET, so several writes fall in one second.
  vi.useFakeTimers({ toFake: ['Date'] })
  const at = (seconds: number): void => {
    vi.setSystemTime(new Date(2026, 9, 1, 10, 0, seconds))
  }
  const toldAtTheDoor = new Map<string, boolean>()
  const write = (seconds: number, body: string): string => {
    at(seconds)
    let id = ''
    const reads = theSameSecondReadsDuring(() => {
      id = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: reader }] }, actor: OWNER }).id
    })
    const ofThis = reads.filter((one) => one.values.includes(id))
    expect(ofThis.length, `the create door's reads of the second of ${body}`).toBe(1)
    const [read] = ofThis as [(typeof ofThis)[number]]
    const said = `${read.plan.join('\n')}\nfor: ${body}`
    expect(read.plan[0], said).toBe('SEARCH records USING INDEX records_updated_idx (updated_at>?)')
    for (const step of read.plan) expect(step, said).not.toMatch(A_WHOLE_READ)
    expect(read.found, `what the create door found for ${body}`).toBe(anotherLiveMessageHasItsStamp(id))
    toldAtTheDoor.set(body, read.found)
    return id
  }

  // FOUR MESSAGES IN ONE SECOND.
  const four = [1, 2, 3, 4].map((n) => write(0, `four-${String(n)}`))
  // ONE ALONE IN ITS SECOND, beside a record that is not a message.
  at(5)
  t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'a note in the same second', data: { body: 'Not a message.' }, actor: OWNER })
  const alone = write(5, 'alone')
  // ONE WHOSE PARTNER IN ITS SECOND IS DELETED AFTERWARDS.
  const deleted = write(10, 'deleted-later')
  const left = write(10, 'left')
  at(12)
  t.api.deleteRecord(deleted, OWNER)
  // ONE WHOSE PARTNER IN ITS SECOND IS CHANGED AFTERWARDS.
  const changed = write(20, 'changed-later')
  const kept = write(20, 'kept')
  at(30)
  t.api.updateRecord(changed, { title: 'changed thirty seconds later' }, OWNER)

  expect(Object.fromEntries(toldAtTheDoor), 'what the create door found when each message was written').toEqual({
    'four-1': false, 'four-2': true, 'four-3': true, 'four-4': true, alone: false, 'deleted-later': false, left: true, 'changed-later': false, kept: true,
  })
  const asked = { four1: four[0], four2: four[1], four3: four[2], four4: four[3], alone, left, changed, kept } as Record<string, string>
  const now = Object.fromEntries(Object.entries(asked).map(([name, id]) => [name, anotherLiveMessageHasItsStamp(id)]))
  expect(now, 'another live message in its second, from the rows').toEqual({ four1: true, four2: true, four3: true, four4: true, alone: false, left: false, changed: true, kept: true })
  for (const fresh of [true, false]) {
    const answered = Object.fromEntries(Object.entries(asked).map(([name, id]) => [name, whatANewMessageChanges(id, fresh)?.anotherInTheSameSecond]))
    expect(answered, `the answer, asked with fresh ${String(fresh)}`).toEqual(now)
  }
})
