// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STEP REMINDER NEVER SAYS THAT A NEGATIVE NUMBER OF TOKENS HAVE PASSED.
 *
 * WHAT WENT WRONG. A step reminder says how many tokens have passed since the last reminder of its step. That number is
 * the run's count now, less the count the last reminder carried. A count can go down between two reminders. One way:
 * the office reads a sandboxed Claude Code run's tokens from the newest conversation file in its folder when the run's
 * record names no conversation, and a new conversation in that folder has a smaller count. The reminder by time then
 * said, for example, "45 minutes and -149000 tokens have passed".
 *
 * WHAT THIS FILE HOLDS. A run is reminded by tokens at 150,000. Its count then goes down to 1,000. The reminder by time
 * 45 minutes later says no negative number. It says that the count went down, that the tokens this step has spent are
 * not known, and that the tokens after it are counted from 1,000. The next reminder by tokens then comes 150,000 tokens
 * after the 1,000.
 *
 * It fails on main's code, where the reminder by time says "45 minutes and -149000 tokens have passed".
 *
 * MADE UP. Every agent, run and count here is made up for this test, in a fresh test database. No live office is read.
 * The pass is given a clock of its own: R0 is the real time the run was filed, and each pass is minutes after it. The
 * run's count is written on its record by hand here, as the worker that started it would write it.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import { THE_TOKENS_COUNTED } from '../src/config/tokens-so-far.mjs'
import type { StepReminderMark } from '../src/server/lib/step-reminders.ts'

const WORKSPACE = 'default'
const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const THE_LINE = SYSTEM_LINES.aStepReminder('').line
/** The pass looks at runs filed after this moment, so the run filed here is one it looks at. */
const WATCHING_SINCE = new Date(Date.now() - 60_000)

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let stepReminders: typeof import('../src/server/lib/step-reminders.ts')

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: a reminder names a card's duties.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  stepReminders = await import('../src/server/lib/step-reminders.ts')
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
  vi.unstubAllEnvs()
})

/** One made-up agent of the worker card with one made-up running run that names no expected time. */
function aRun(handle: string): { run: string; at: (minutes: number) => Date } {
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER })
  const { id: agent } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const filed = new Date()
  const run = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a made-up run',
    data: { state: 'running', runtime: 'fake', servingAgent: agent, startedAt: localStamp(filed), startedTime: clockStamp(() => filed), deliveringMessage: 'none-here' },
    actor: OWNER,
  }).id
  const r0 = new Date()
  return { run, at: (minutes) => new Date(r0.getTime() + minutes * 60_000) }
}

/** The worker's write of a run's count, made by hand here. */
function theCountIs(run: string, tokens: number): void {
  t.api.patchRecord(run, { dataPatch: { tokensSoFar: tokens, whenTheTokensWereRead: localStamp(new Date()), howTheTokensWereReadAndCounted: `Read from a made-up output. Counted: ${THE_TOKENS_COUNTED}.` } }, OWNER)
}

/** One pass of the step, as the minute pass runs it, and whether it reminded this run. */
function aPass(run: string, now: Date): string[] {
  return stepReminders.sendTheStepRemindersThatAreDue(WORKSPACE, now, WATCHING_SINCE).filter((one) => one === run)
}

/** Every step reminder about a run, oldest first. */
function theRemindersAbout(run: string): { said: string; mark: StepReminderMark }[] {
  return (t.client.sqlite
    .prepare("SELECT json_extract(data, '$.saidInFull') AS said, json_extract(data, '$.extra.stepReminder') AS mark FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ? ORDER BY created_at, rowid")
    .all(run, THE_LINE) as { said: string; mark: string }[]).map((row) => ({ said: row.said, mark: JSON.parse(row.mark) as StepReminderMark }))
}

it('after a count that went down, says no negative number of tokens, and counts the tokens after it from the lower count', () => {
  const { run, at } = aRun('a-count-that-went-down')
  theCountIs(run, 150_000)
  expect(aPass(run, at(10))).toEqual([run])
  theCountIs(run, 1_000)
  expect(aPass(run, at(11))).toEqual([])
  expect(aPass(run, at(54))).toEqual([])
  expect(aPass(run, at(55))).toEqual([run])
  theCountIs(run, 150_999)
  expect(aPass(run, at(56))).toEqual([])
  theCountIs(run, 151_000)
  expect(aPass(run, at(57))).toEqual([run])

  const sent = theRemindersAbout(run)
  expect(sent.map((one) => [one.mark.why, one.mark.tokens])).toEqual([['tokens', 150_000], ['minutes', 1_000], ['tokens', 151_000]])
  const afterTheFall = sent[1]!.said
  expect(afterTheFall, 'the reminder after the count went down says a negative number of tokens').not.toMatch(/-\d+ tokens/)
  expect(afterTheFall).toContain('45 minutes have passed since the last reminder of its step.')
  expect(afterTheFall).toContain('Its tokens so far are 1000, fewer than the 150000 counted at the last reminder of its step.')
  expect(afterTheFall).toContain('the tokens this step has spent are not known.')
  expect(afterTheFall).toContain('The tokens after this reminder are counted from 1000.')
  expect(afterTheFall).toContain(THE_TOKENS_COUNTED)
  expect(sent[2]!.said).toContain('2 minutes and 150000 tokens have passed since the last reminder of its step.')
})
