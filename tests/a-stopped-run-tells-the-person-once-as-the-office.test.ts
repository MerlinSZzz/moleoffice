// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * M94 — A RUN THAT STOPS FOR A REASON THEY MUST ACT ON TELLS THEM ONCE, AS THE OFFICE.
 *
 * Criterion M94 of design/messages/ACCEPTANCE.md: a message when a run stops, such as when its quota runs out,
 * saves the person looking in the terminal for why it stopped. The office has no source for a stop cause today,
 * so a Claude Code session's end writes its stop cause on the run record, and the office folds the causes into one
 * notice per cause per hour, sent as the office (M105) to the person.
 *
 * WHAT A LIMIT LEAVES IN A TRANSCRIPT, MEASURED 12 SEPTEMBER 2026. The session that hit its limit on
 * 11 September at 12:55 local left one `assistant` line whose `message.model` is `<synthetic>`, whose
 * text is `You've hit your session limit · resets 7:10pm (Europe/London)`, carrying
 * `"error":"rate_limit"`, `"isApiErrorMessage":true`, `"apiErrorStatus":429`. A monthly quota leaves
 * the same shape with different words and no reset time. SessionEnd does NOT fire on a limit: a 429
 * pauses the session, it does not end it (`design/round-eleven/design/provider-capabilities.md`
 * measured the SessionEnd payload as `{"…","hook_event_name":"SessionEnd","reason":"other"}`, and the
 * session that hit this limit went on after the reset). A run killed while limited never reaches
 * SessionEnd at all, which is why the office reads the transcript itself.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE PROOFS, EACH AFTER A CONTROL RUN, EACH WITH ITS MUTATION
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE HOOK'S READING. A limit in the transcript becomes `closedBecause` with the cause's own
 *    words and the state `crashed`. Mutation: make `theStopCauseInTheTranscript` answer null — the
 *    transcript read dropped — and "carries the limit's own words" goes red.
 * 2. THE ONE NOTICE PER CAUSE. Two runs stopped for the same cause make ONE message, sent as the
 *    office to the person, naming both. Mutation: remove the per-cause fold so the office sends one
 *    notice per run — two messages — and "one message names both runs" goes red.
 * 3. THE CAUSE THAT IS NOT THE PERSON'S. A clean end produces no cause and no notice. This case is a control
 *    for the fold: if it ever sent for a clean finish, "no notice for a clean end" would go red.
 *
 * A fourth case proves item 2 of the build: the office's own sweep reads a run that went quiet still
 * saying `running` and writes the cause the hook never got to write. Its mutation is the same
 * dropped transcript read.
 *
 * A fifth case proves the time both readers store: the instant `clockStamp` writes, local
 * wall-clock with its offset, in winter and in both moments of the hour the clocks go back, and
 * null for words that name no moment. The first case checks the same for the measured line. Its
 * mutation is to store the line's own words again.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import { theStopCauseAtTheEndOfTheTranscript, theStopCauseInTheTranscript, thePatchThatClosesARun } from '../src/config/stopped-run-cause.mjs'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let reminders: RemindersLib

/** Every scratch transcript directory this file made, removed after each case. */
const scratchDirs: string[] = []
/** The runs a case filed, so the next case's office-wide notice reading does not see them. */
const runsThisCase: string[] = []

const HUMAN = { type: 'human', id: THE_PERSON } as const
/** Real now, once, at the top; every clock in this file is measured from it. */
const R0 = new Date()
const at = (msFromR0: number): Date => new Date(R0.getTime() + msFromR0)
/** The live office row's id, which is not its handle on a fresh office. */
const officeId = (): string =>
  (t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").get() as { id: string }).id
/** Long enough that a run is judged quiet, and short enough that the test is not slow. */
const TEN_MINUTES = 10 * 60_000

beforeAll(async () => {
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  // THE ROLE CARDS, READ THE WAY buildApp READS THEM, so a reminder's duties sentence is the card's.
  const roles = await import('../src/server/lib/roles.ts')
  const records = await import('../src/server/lib/records.ts')
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  // The notices are read over the whole office, so each case takes away the runs it filed and the
  // office's own notices it caused. A notice may not be deleted through the product's door.
  for (const id of runsThisCase) t.api.deleteRecord(id, HUMAN)
  runsThisCase.length = 0
  const notices = t.client.sqlite
    .prepare(
      "SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.sentBy.kind') = 'agent' " +
        "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0)",
    )
    .all() as { id: string }[]
  if (notices.length > 0) {
    const marks = notices.map(() => '?').join(', ')
    const ids = notices.map((one) => one.id)
    t.client.sqlite.prepare(`DELETE FROM message_delivery WHERE message_id IN (${marks})`).run(...ids)
    t.client.sqlite.prepare(`DELETE FROM changes WHERE record_id IN (${marks})`).run(...ids)
    t.client.sqlite.prepare(`DELETE FROM revisions WHERE record_id IN (${marks})`).run(...ids)
    t.client.sqlite.prepare(`DELETE FROM records WHERE id IN (${marks})`).run(...ids)
  }
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** One transcript file holding exactly these lines, as the provider writes them. */
function aTranscript(lines: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'm94-transcript-'))
  scratchDirs.push(dir)
  const path = join(dir, 'session.jsonl')
  writeFileSync(path, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`, 'utf8')
  return path
}

/** The measured shape of the line Claude Code writes when a limit stops a request. */
function theLimitLine(text: string, error: string, status: number): unknown {
  return {
    type: 'assistant',
    timestamp: '2026-09-11T16:55:08.628Z',
    message: { model: '<synthetic>', role: 'assistant', content: [{ type: 'text', text }] },
    error,
    isApiErrorMessage: true,
    apiErrorStatus: status,
  }
}

/** One session record, in whatever state the case needs. */
function aRun(title: string, data: Record<string, unknown>): string {
  const id = t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data, actor: HUMAN }).id
  runsThisCase.push(id)
  return id
}

/** A run already closed for a cause, the way the hook or the sweep leaves it. */
function aRunClosedFor(cause: string, said: string, resetsAt: string | null, closedAt: Date): { id: string; title: string } {
  const title = `stopped by ${cause} at ${String(closedAt.getTime())}`
  const id = aRun(title, {
    state: 'crashed',
    closedAt: localStamp(closedAt),
    closedBecause: said,
    closedHow: 'provider-event',
    stopCause: { kind: cause, said, at: null, resetsAt },
  })
  return { id, title }
}

/** Every office message addressed to the person, optionally narrowed to one M94 cause. */
function officeNotices(cause?: string): Record<string, unknown>[] {
  const rows = t.client.sqlite
    .prepare(
      "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
        "AND json_extract(data, '$.sentBy.kind') = 'agent' " +
        "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0)",
    )
    .all() as { data: string }[]
  return rows
    .map((row) => JSON.parse(row.data) as Record<string, unknown>)
    .filter((one) => {
      const m94 = (one['extra'] as Record<string, Record<string, unknown>> | undefined)?.['m94']
      if (m94 === undefined) return false
      return cause === undefined || m94['cause'] === cause
    })
}

describe('M94, the end of a session writes why it stopped', () => {
  it('a limit in the transcript becomes closedBecause with the cause words and the state crashed', () => {
    const theLine = theLimitLine("You've hit your session limit · resets 7:10pm (Europe/London)", 'rate_limit', 429)
    const transcript = aTranscript([theLine])
    const run = aRun('a long run', {
      state: 'running',
      lastOutputAt: localStamp(at(-TEN_MINUTES)),
      extra: { discovered: { tool: 'claude-code', externalId: 'run-one', logPath: transcript } },
    })

    // WHAT THE HOOK'S `end` BRANCH DOES: read the transcript, build the patch, write it.
    const cause = theStopCauseInTheTranscript(transcript)
    expect(cause).not.toBeNull()
    if (cause === null) throw new Error('the transcript reader found no cause')
    expect(cause.kind).toBe('session-limit')
    expect(cause.said).toContain("You've hit your session limit")
    expect(cause.resetsAt).toBe('7:10pm (Europe/London)')
    // THE TIME IS STORED AS LOCAL WALL-CLOCK WITH ITS OFFSET, the instant `clockStamp` writes, and not in the
    // transcript line's own UTC words. The reader that looks only at the last line stores the same time.
    const theLinesTime = (theLine as { timestamp: string }).timestamp
    expect(cause.at).toBe(clockStamp(() => theLinesTime).instant)
    expect(theStopCauseAtTheEndOfTheTranscript(transcript)?.at).toBe(cause.at)
    t.api.patchRecord(run, { dataPatch: thePatchThatClosesARun(cause, R0, 'other') }, HUMAN)

    const record = t.api.getRecord(run)!
    expect(record.data.state).toBe('crashed')
    expect(String(record.data.closedBecause)).toContain("You've hit your session limit")
    expect(String(record.data.closedBecause)).toContain('7:10pm (Europe/London)')
    expect(record.data.closedHow).toBe('provider-event')
    expect(String(record.data.closedAt)).not.toBe('')
    // Claude Code's own SessionEnd reason word is kept, because `closedHow` holds one of five words.
    expect(String(record.data.detail)).toContain('other')
    // The stop cause is the session's own field, and the old copy in `extra` is not written beside it.
    expect(record.data.stopCause).toMatchObject({ kind: 'session-limit', at: cause.at })
    expect((record.data.extra as Record<string, unknown>)['stopCause']).toBeUndefined()
  })

  it('a monthly quota leaves the same shape with the word quota', () => {
    const transcript = aTranscript([
      theLimitLine(
        "You've hit your monthly spend limit. Run /usage-credits to manage your limit and keep using Fable 5.1 or switch models to continue this chat.",
        'rate_limit',
        429,
      ),
    ])
    const cause = theStopCauseInTheTranscript(transcript)
    expect(cause?.kind).toBe('quota')
    expect(cause?.resetsAt).toBeNull()
  })

  it('the time is stored with the offset in force at its moment, and words that name no moment are null', () => {
    const said = "You've hit your session limit · resets 7:10pm (Europe/London)"
    /** The time each reader stores for one limit line carrying these words as its timestamp. */
    const theTimeStoredFor = (timestamp: unknown): unknown => {
      const transcript = aTranscript([{ ...(theLimitLine(said, 'rate_limit', 429) as Record<string, unknown>), timestamp }])
      const inTheTail = theStopCauseInTheTranscript(transcript)
      expect(inTheTail, String(timestamp)).not.toBeNull()
      // BOTH READERS STORE THE SAME TIME, worked out in one place.
      expect(theStopCauseAtTheEndOfTheTranscript(transcript)?.at, String(timestamp)).toBe(inTheTail?.at)
      return inTheTail?.at
    }
    // WINTER, BOTH MOMENTS OF THE HOUR THE CLOCKS GO BACK IN EUROPE/LONDON IN 2026, AND A TIME GIVEN WITH ITS OFFSET:
    // each is the instant `clockStamp` writes, and the two moments of the repeated hour stay two.
    for (const instant of ['2026-12-01T09:00:00.000Z', '2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z', '2026-09-11T17:55:08+01:00']) {
      expect(theTimeStoredFor(instant), instant).toBe(clockStamp(() => instant).instant)
    }
    expect(theTimeStoredFor('2026-10-25T00:30:00.000Z')).not.toBe(theTimeStoredFor('2026-10-25T01:30:00.000Z'))
    // WORDS THAT NAME NO MOMENT ARE NOT A TIME: a time with no zone, a day that does not exist, and a number.
    for (const words of ['2026-09-11 16:55:08', '2026-02-30T10:00:00.000Z', 1789145708628]) {
      expect(theTimeStoredFor(words), String(words)).toBeNull()
    }
  })
})

describe('M94, the office folds the causes and tells them once', () => {
  it('two runs stopped for one cause in an hour make one notice, as the office, naming both', () => {
    const first = aRunClosedFor(
      'session-limit',
      "You've hit your session limit · resets 7:10pm (Europe/London)",
      '7:10pm (Europe/London)',
      at(-20 * 60_000),
    )
    const second = aRunClosedFor(
      'session-limit',
      "You've hit your session limit · resets 7:10pm (Europe/London)",
      '7:10pm (Europe/London)',
      at(-10 * 60_000),
    )
    const pass = reminders.sendTheRemindersThatAreDue('default', at(0), new Date(R0.getTime() - 60_000))
    expect(pass.noticesSent).toEqual(['session-limit'])

    const notices = officeNotices('session-limit')
    expect(notices).toHaveLength(1)
    const notice = notices[0]
    expect(notice).toBeDefined()
    expect(notice!['sentBy']).toEqual({ kind: 'agent', id: officeId() })
    expect(notice!['to']).toEqual([{ kind: 'person', id: THE_PERSON }])
    const said = String(notice!['saidInFull'])
    expect(said).toContain(first.id)
    expect(said).toContain(first.title)
    expect(said).toContain(second.id)
    expect(said).toContain(second.title)
    expect(said).toContain('7:10pm (Europe/London)')

    // AND NOT AGAIN INSIDE THE HOUR: their words say once an hour per cause, never ten copies.
    const again = reminders.sendTheRemindersThatAreDue('default', at(20 * 60_000), new Date(R0.getTime() - 60_000))
    expect(again.noticesSent).toEqual([])
    expect(officeNotices('session-limit')).toHaveLength(1)
  })

  it('a clean end produces no cause and no notice', () => {
    const transcript = aTranscript([
      {
        type: 'assistant',
        timestamp: '2026-09-11T16:00:00.000Z',
        message: { model: 'claude-fable-5-1', role: 'assistant', content: [{ type: 'text', text: 'All done.' }] },
      },
    ])
    const run = aRun('a clean run', {
      state: 'running',
      lastOutputAt: localStamp(at(-TEN_MINUTES)),
      extra: { discovered: { tool: 'claude-code', externalId: 'clean', logPath: transcript } },
    })
    const cause = theStopCauseInTheTranscript(transcript)
    expect(cause).toBeNull()
    t.api.patchRecord(run, { dataPatch: thePatchThatClosesARun(cause, R0, 'other') }, HUMAN)
    const record = t.api.getRecord(run)!
    expect(record.data.state).toBe('finished')
    expect(record.data.stopCause).toBeUndefined()
    expect((record.data.extra as Record<string, unknown>)['stopCause']).toBeUndefined()

    const pass = reminders.sendTheRemindersThatAreDue('default', at(0), new Date(R0.getTime() - 60_000))
    expect(pass.noticesSent).toEqual([])
    expect(officeNotices()).toHaveLength(0)
  })

  it('the office reads the transcript of a run that went quiet still saying running', () => {
    const transcript = aTranscript([
      theLimitLine("You've hit your session limit · resets 7:10pm (Europe/London)", 'rate_limit', 429),
    ])
    const run = aRun('killed by a limit and never reached SessionEnd', {
      state: 'running',
      lastOutputAt: localStamp(at(-TEN_MINUTES)),
      extra: { discovered: { tool: 'claude-code', externalId: 'orphan', logPath: transcript } },
    })

    const pass = reminders.sendTheRemindersThatAreDue('default', at(0), new Date(R0.getTime() - 60_000))
    expect(pass.runsClosedWithACause).toEqual([run])
    expect(pass.noticesSent).toEqual(['session-limit'])

    const record = t.api.getRecord(run)!
    expect(record.data.state).toBe('crashed')
    expect(String(record.data.closedBecause)).toContain("You've hit your session limit")
    const notices = officeNotices('session-limit')
    expect(notices).toHaveLength(1)
    expect(String(notices[0]!['saidInFull'])).toContain(run)
  })
})
