// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN IS REMINDED OF ITS ROLE, ITS DUTIES AND ITS CURRENT STEP AFTER N TOKENS OR M MINUTES IN THE STEP, WHICHEVER
 * COMES FIRST (wave 14d, package RM, clause RM-1, and the server half of RM-3).
 *
 * N and M are the gates step-reminder-tokens and step-reminder-minutes (src/config/gates.mjs), 150,000 tokens and 45
 * minutes unless they are changed in Settings. The minute pass of src/server/lib/reminders.ts sends the reminder in its
 * step "the step reminder" (src/server/lib/step-reminders.ts).
 *
 * WHAT THIS HOLDS.
 *   (a) Both settings are rows of the gates reading the Settings page reads, GET /api/office/gates, with the defaults
 *       150,000 and 45, and those are the numbers the reminder reads when nothing changed them.
 *   (b) By time: nothing at 44 minutes into a step, one reminder at 45, none at 46, and the second at 90.
 *   (c) By tokens: nothing at 149,999 tokens, one when the count reaches 150,000 at minute 10, and the next only when
 *       another 150,000 have been spent since that reminder.
 *   (d) Both reached in one pass give one reminder, not two.
 *   (e) A setting changed through the settings door changes when the reminder comes.
 *   (f) The reminder goes to the agent the run serves, about the run, and names its role, its duties and its step. An
 *       agent that is retired is not reminded.
 *   (j) A run whose record carries no count of its tokens is reminded by time, and its reminder says its tokens are not
 *       known.
 *   (k) A sandboxed Claude Code run's tokens are read by the office from its conversation file, each answer since the
 *       run began once. A record that leads outside its own sandbox home has nothing read, and the run is reminded by
 *       time with the reason.
 * And the time the step takes on this test office is printed.
 *
 * MADE UP. Every agent, run and count here is made up for this test, in a fresh test database. No live office is read.
 * The pass is given a clock of its own: R0 is the real time a case's run was filed, and each pass is minutes after it.
 * A run's count of tokens is written on its record by hand here, as the worker that started it would write it. The
 * sandboxes folder of this file is a temporary folder of its own, and the conversation file of (k) is made up there.
 *
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN:
 *   1. The step does not take the later of the step's start and the last reminder, only the step's start. (b) goes red:
 *      the pass at 46 reminds again.
 *   2. Tokens are compared with the minutes setting. (c) goes red.
 *   3. A run reminded by both triggers is sent two lines. (d) goes red.
 *   4. The retired agent's run is reminded. (f) goes red.
 *   5. A count not known at the last reminder is taken as 0. The second case of (j) goes red.
 *   6. A sandboxed run's conversation file is not read. The first case of (k) goes red at minute 10.
 *   7. A conversation file that grew is not read again. The first case of (k) goes red at minute 10.
 *   8. The answers before the run began are counted. The first case of (k) goes red at minute 5.
 *   9. A record that leads outside its sandbox home stops the pass. The second case of (k) goes red.
 *  10. The reason for no count keeps its own full stop. The second case of (k) goes red at the words.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { OFFICE_STEP_DOES } from '../src/shared/flow-run.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import { THE_TOKENS_COUNTED } from '../src/config/tokens-so-far.mjs'
import type { StepReminderMark } from '../src/server/lib/step-reminders.ts'
import { theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { SANDBOXES_FOLDER } from '../src/config/sandbox-folder.mjs'

// THE SANDBOXES FOLDER IS A TEMPORARY FOLDER OF THIS FILE, so the made-up sandbox of (k) is the only one there.
vi.mock('../src/config/sandbox-folder.mjs', async (importOriginal) => {
  const { mkdtempSync: aFolder } = await import('node:fs')
  const { tmpdir: theTemporaryFolder } = await import('node:os')
  const { join: joined } = await import('node:path')
  return { ...(await importOriginal<typeof import('../src/config/sandbox-folder.mjs')>()), SANDBOXES_FOLDER: aFolder(joined(theTemporaryFolder(), 'step-reminder-sandboxes-')) }
})

const WORKSPACE = 'default'
const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const AS_THE_OWNERS_AUTHORITY = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const THE_LINE = SYSTEM_LINES.aStepReminder('').line
/** Before every record of this file, so every step here is recorded while the office watches. */
const WATCHING_SINCE = new Date(Date.now() - 60_000)

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let stepReminders: typeof import('../src/server/lib/step-reminders.ts')
let reminders: typeof import('../src/server/lib/reminders.ts')
let env: typeof import('../src/server/db/env.ts')
let cards: typeof import('../src/server/lib/cardmessage.ts')
let noWorlds: string

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
  reminders = await import('../src/server/lib/reminders.ts')
  env = await import('../src/server/db/env.ts')
  cards = await import('../src/server/lib/cardmessage.ts')
  noWorlds = mkdtempSync(join(tmpdir(), 'no-isolated-worlds-'))
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(noWorlds, { recursive: true, force: true })
  rmSync(SANDBOXES_FOLDER, { recursive: true, force: true })
})

/** One made-up agent of the worker card with one made-up running run that names no expected time, and more on the run. */
function aRun(handle: string, more: Record<string, unknown> = {}): { agent: string; run: string; flowRun: string; at: (minutes: number) => Date } {
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER })
  const { id: agent } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const filed = new Date()
  const run = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a made-up run',
    data: { state: 'running', runtime: 'fake', servingAgent: agent, startedAt: localStamp(filed), startedTime: clockStamp(() => filed), deliveringMessage: 'none-here', ...more },
    actor: OWNER,
  }).id
  const { id: flowRun } = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }
  const r0 = new Date()
  return { agent, run, flowRun, at: (minutes) => new Date(r0.getTime() + minutes * 60_000) }
}

/** The worker's write of a run's count, made by hand here. */
function theCountIs(run: string, tokens: number): void {
  t.api.patchRecord(run, { dataPatch: { tokensSoFar: tokens, whenTheTokensWereRead: localStamp(new Date()), howTheTokensWereReadAndCounted: `Read from a made-up output. Counted: ${THE_TOKENS_COUNTED}.` } }, OWNER)
}

/** One pass of the step, as the minute pass runs it, and which of these runs it reminded. */
function aPass(run: string, now: Date): string[] {
  return stepReminders.sendTheStepRemindersThatAreDue(WORKSPACE, now, WATCHING_SINCE).filter((one) => one === run)
}

/** Every step reminder about a run, oldest first. */
function theRemindersAbout(run: string): { said: string; to: unknown; mark: StepReminderMark }[] {
  return (t.client.sqlite
    .prepare("SELECT json_extract(data, '$.saidInFull') AS said, json_extract(data, '$.to') AS to_, json_extract(data, '$.extra.stepReminder') AS mark FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ? ORDER BY created_at, rowid")
    .all(run, THE_LINE) as { said: string; to_: string; mark: string }[]).map((row) => ({ said: row.said, to: JSON.parse(row.to_), mark: JSON.parse(row.mark) as StepReminderMark }))
}

async function save(changes: { name: string; value: string | null }[]): Promise<void> {
  const reply = await app.app.inject({ method: 'POST', url: '/api/office/settings', headers: { 'content-type': 'application/json', ...AS_THE_OWNERS_AUTHORITY }, payload: { changes, because: 'A made-up change of the step reminder for a test.' } })
  expect(reply.statusCode, reply.body).toBe(200)
}

describe('(a) the two settings', () => {
  it('are rows of the gates reading the Settings page reads, with the defaults 150,000 tokens and 45 minutes, which the reminder reads', async () => {
    const reply = await app.app.inject({ method: 'GET', url: '/api/office/gates', headers: AS_THE_OWNERS_AUTHORITY })
    expect(reply.statusCode, reply.body).toBe(200)
    const reading = reply.json() as { classes: { groups: { rows: { id: string; setting: string; defaults: unknown; defaultHere: string; value: string | null }[] }[] }[] }
    const rows = reading.classes.flatMap((one) => one.groups.flatMap((group) => group.rows))
    const tokens = rows.find((row) => row.id === 'step-reminder-tokens')
    const minutes = rows.find((row) => row.id === 'step-reminder-minutes')
    expect(tokens).toMatchObject({ setting: 'MOLE_OFFICE_STEP_REMINDER_TOKENS', defaults: { buildsMoleOffice: '150000', ordinary: '150000' }, defaultHere: '150000', value: '150000' })
    expect(minutes).toMatchObject({ setting: 'MOLE_OFFICE_STEP_REMINDER_MINUTES', defaults: { buildsMoleOffice: '45', ordinary: '45' }, defaultHere: '45', value: '45' })
    expect(env.stepReminderTokens()).toBe(150_000)
    expect(env.stepReminderMinutes()).toBe(45)
  })
})

describe('(b) by time', () => {
  it('nothing at 44 minutes, one at 45, none at 46, and the second at 90', () => {
    const { run, at } = aRun('reminded-by-time')
    expect(aPass(run, at(44))).toEqual([])
    expect(aPass(run, at(45))).toEqual([run])
    expect(aPass(run, at(46))).toEqual([])
    expect(aPass(run, at(89))).toEqual([])
    expect(aPass(run, at(90))).toEqual([run])
    expect(theRemindersAbout(run).map((one) => one.mark.why)).toEqual(['minutes', 'minutes'])
  })
})

describe('(c) by tokens', () => {
  it('nothing at 149,999, one on reaching 150,000 at minute 10, and the next after 150,000 more', () => {
    const { run, at } = aRun('reminded-by-tokens')
    theCountIs(run, 149_999)
    expect(aPass(run, at(5))).toEqual([])
    theCountIs(run, 150_000)
    expect(aPass(run, at(10))).toEqual([run])
    expect(aPass(run, at(11))).toEqual([])
    theCountIs(run, 299_999)
    expect(aPass(run, at(12))).toEqual([])
    theCountIs(run, 300_000)
    expect(aPass(run, at(13))).toEqual([run])
    const sent = theRemindersAbout(run)
    expect(sent.map((one) => [one.mark.why, one.mark.tokens])).toEqual([['tokens', 150_000], ['tokens', 300_000]])
    expect(sent[1]!.said).toContain('3 minutes and 150000 tokens have passed since the last reminder of its step.')
    expect(sent[1]!.said).toContain(THE_TOKENS_COUNTED)
  })
})

describe('(d) both at once', () => {
  it('gives one reminder, not two', () => {
    const { run, at } = aRun('reminded-by-both')
    theCountIs(run, 150_000)
    expect(aPass(run, at(45))).toEqual([run])
    expect(theRemindersAbout(run).map((one) => one.mark.why)).toEqual(['tokens and minutes'])
  })
})

describe('(e) a changed setting', () => {
  it('changes when the reminder comes', async () => {
    await save([{ name: 'MOLE_OFFICE_STEP_REMINDER_MINUTES', value: '10' }, { name: 'MOLE_OFFICE_STEP_REMINDER_TOKENS', value: '20000' }])
    try {
      const { run, at } = aRun('reminded-by-changed-settings')
      // A count before the first reminder, so that reminder carries it and the tokens after it can be counted.
      theCountIs(run, 5_000)
      expect(aPass(run, at(9))).toEqual([])
      expect(aPass(run, at(10))).toEqual([run])
      theCountIs(run, 24_999)
      expect(aPass(run, at(11))).toEqual([])
      theCountIs(run, 25_000)
      expect(aPass(run, at(12))).toEqual([run])
      const sent = theRemindersAbout(run)
      expect(sent.map((one) => [one.mark.why, one.mark.tokens])).toEqual([['minutes', 5_000], ['tokens', 25_000]])
      expect(sent[0]!.said).toContain('again every 20000 tokens or 10 minutes, whichever comes first.')
    } finally {
      await save([{ name: 'MOLE_OFFICE_STEP_REMINDER_MINUTES', value: null }, { name: 'MOLE_OFFICE_STEP_REMINDER_TOKENS', value: null }])
    }
    expect(env.stepReminderMinutes()).toBe(45)
  })
})

describe('(f) what the reminder says, and to whom', () => {
  it('goes to the agent the run serves, about the run, and names its role, its duties and its step', () => {
    const { agent, run, flowRun, at } = aRun('told-its-role-and-step')
    expect(aPass(run, at(45))).toEqual([run])
    const [sent] = theRemindersAbout(run)
    expect(sent!.to).toEqual([{ kind: 'agent', id: agent }])
    const roleAndDuties = cards.theRoleAndDutiesOf('worker')
    expect(roleAndDuties).not.toContain('No role card could be read for it')
    expect(sent!.said).toContain(roleAndDuties)
    expect(sent!.said).toContain(`Run ${run} is still on its current step, step 1 of its own flow run ${flowRun}, "${OFFICE_STEP_DOES.started}".`)
    expect(sent!.mark).toMatchObject({ flowRun, step: 1, why: 'minutes' })
  })

  it('is not sent for a run whose agent is retired', () => {
    const { agent, run, at } = aRun('retired-before-its-reminder')
    // Retired in the database by hand, as the retire door leaves the agent's row.
    t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?').run(agent)
    expect(aPass(run, at(45))).toEqual([])
    expect(theRemindersAbout(run)).toEqual([])
  })
})

describe('(j) a run with no count', () => {
  it('is reminded by time, and its reminder says its tokens are not known', () => {
    const { run, at } = aRun('no-count-of-its-tokens')
    expect(aPass(run, at(45))).toEqual([run])
    const [sent] = theRemindersAbout(run)
    expect(sent!.mark).toMatchObject({ why: 'minutes', tokens: null })
    expect(sent!.said).toContain('Its tokens are not known, so it is reminded by time only: Its record carries no count of its tokens')
  })

  it('at its last reminder gives no start for the tokens after it, so it is reminded by time until a reminder carries a count', () => {
    const { run, at } = aRun('no-count-at-its-reminder')
    expect(aPass(run, at(45))).toEqual([run])
    theCountIs(run, 200_000)
    expect(aPass(run, at(46))).toEqual([])
    expect(aPass(run, at(89))).toEqual([])
    expect(aPass(run, at(90))).toEqual([run])
    theCountIs(run, 349_999)
    expect(aPass(run, at(91))).toEqual([])
    theCountIs(run, 350_000)
    expect(aPass(run, at(92))).toEqual([run])
    const sent = theRemindersAbout(run)
    expect(sent.map((one) => [one.mark.why, one.mark.tokens])).toEqual([['minutes', null], ['minutes', 200_000], ['tokens', 350_000]])
    expect(sent[1]!.said).toContain('Its tokens so far are 200000, but its count at the last reminder of its step is not known, so this step is reminded by time until a reminder carries a count.')
  })
})

describe('the step in the minute pass', () => {
  it('is a step of its own, and its time on this test office is printed', () => {
    const { run, at } = aRun('timed-in-the-minute-pass')
    const steps: import('../src/server/lib/reminders.ts').AStepOfThePass[] = []
    const did = reminders.sendTheRemindersThatAreDue(WORKSPACE, at(45), WATCHING_SINCE, noWorlds, steps)
    expect(did.stepReminded).toContain(run)
    const timed = steps.filter((one) => one.name === 'the step reminder')
    expect(timed).toHaveLength(1)
    const runs = (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.state') = 'running'").get() as { n: number }).n
    console.log(`[the step reminder took ${timed[0]!.ms.toFixed(1)} ms, ${timed[0]!.sqliteMs.toFixed(1)} ms of it in SQLite, ${timed[0]!.statements} statements, on a test office of ${runs} running runs]`)
  })
})

describe('(k) a sandboxed Claude Code run', () => {
  const conversation = 'made-up-conversation'
  const cwd = '/made-up/checkout'
  const inASandbox = (folder: string) => ({ runtime: 'claude-code', sandbox: { template: 'made-up', container: 'made-up', folder }, workingDirectory: cwd, providerSession: conversation })
  const anAnswer = (id: string, atMs: number, usage: Record<string, number>) =>
    `${JSON.stringify({ type: 'assistant', timestamp: new Date(atMs).toISOString(), message: { id, model: 'made-up-model', usage } })}\n`

  it('has its tokens read by the office from its conversation file, each answer since the run began once', () => {
    const sandbox = join(SANDBOXES_FOLDER, 'a-made-up-sandbox')
    const folder = theTranscriptFolder({ HOME: join(sandbox, 'home') }, cwd)!
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${conversation}.jsonl`)
    // An answer of the round before this run, in the same file, as a continued conversation has. It is left out.
    writeFileSync(file, anAnswer('msg_before', Date.now() - 3_600_000, { input_tokens: 900_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 900_000 }))
    const { run, at } = aRun('sandboxed-claude-code', inASandbox(sandbox))
    // Every answer has cache reads, which are left out of the count.
    appendFileSync(file, anAnswer('msg_1', Date.now(), { input_tokens: 10, cache_creation_input_tokens: 140_000, cache_read_input_tokens: 500_000, output_tokens: 9_989 }))
    expect(aPass(run, at(5))).toEqual([])
    appendFileSync(file, anAnswer('msg_2', Date.now(), { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 30_000, output_tokens: 1 }))
    expect(aPass(run, at(10))).toEqual([run])
    const [sent] = theRemindersAbout(run)
    expect(sent!.mark).toMatchObject({ why: 'tokens', tokens: 150_000 })
    expect(sent!.said).toContain(`10 minutes and 150000 tokens have passed since the step began. Read from the conversation file, each answer once. Counted: ${THE_TOKENS_COUNTED}.`)
  })

  it('whose record leads outside its own sandbox home has nothing read, and is reminded by time with the reason', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'not-a-sandbox-'))
    try {
      const { run, at } = aRun('sandboxed-elsewhere', inASandbox(elsewhere))
      expect(aPass(run, at(44))).toEqual([])
      expect(aPass(run, at(45))).toEqual([run])
      const [sent] = theRemindersAbout(run)
      expect(sent!.mark).toMatchObject({ why: 'minutes', tokens: null })
      expect(sent!.said).toContain(
        `Its tokens are not known, so it is reminded by time only: Its record names the folder ${elsewhere}, which is not a sandbox folder in ${SANDBOXES_FOLDER}. Its steps are read only from inside its own sandbox home. Nothing was read. The office reminds a run of its step`,
      )
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })
})
