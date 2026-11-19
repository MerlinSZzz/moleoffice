// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS, F10 AND F13, BUILT AND TESTED TOGETHER.
 *
 * The design: F13, the IDLE flow — after n idle hours the office sends a message about the role, the reminder
 * carrying the role registered at the office, the duties, and the note to read the rules again if
 * they are forgotten, especially after a compaction; sent once, and the heartbeat
 * continues with no further flow message until new work arrives. F10 — a mild reminder needing no
 * reply when a working run reaches its step's expected time, and at the SECOND expected time the
 * escalation that makes the agent communicate with its supervisor, saying why it is stuck, so the
 * supervisor can decide whether the module is wrongly cut.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS A READING AND NOT STATED ARITHMETIC
 * ---------------------------------------------------------------------------------------
 *
 * THE SECOND CHECKPOINT IS TWICE THE TYPED EXPECTED DURATION. The design escalates when the agent is
 * still not finished within the second expected time: the second occurrence of the expected time,
 * so the first period runs 0→T, the second runs T→2T, and the escalation falls at 2T. That is a
 * reading of the design, not arithmetic it states. The alternatives considered and rejected: a
 * second period measured from the first reminder (nothing in the design moves the clock there), and
 * one measured from when the lateness was first noticed (same reason). It borrows nothing from F13's
 * idle hour, which measures an agent with no work at all, against how long a piece of work was
 * expected to take — borrowing it would escalate a ten-minute step at one hour ten and an eight-hour
 * step at nine.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DELIBERATELY NOT CARRIED, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * THE TOKEN TRIGGER IS NOT CARRIED HERE. It is the step reminder's, in src/server/lib/step-reminders.ts: since
 * wave 14d the worker reads a running run's tokens while it runs, and a run is reminded of its step at each
 * change of step and again at whichever of the token or minute settings comes first. Four test files hold it:
 * a-step-reminder-comes-by-tokens-or-by-time, a-step-reminder-comes-once-at-each-change-of-step,
 * a-runs-tokens-are-read-while-it-runs and a-run-that-reaches-the-token-setting-is-reminded. This file holds
 * the expected-time reminder alone, built against an expected time typed by whoever starts the task, so it
 * reads only that reminder's two kinds of line about a run. Where nobody typed an expected time, no
 * expected-time reminder comes, and the case below says so.
 *
 * NOTHING SWEEPS. An agent with no recorded activity is never reminded, and an agent whose newest
 * activity is older than the moment the watcher started is never reminded: measured on the live
 * office, 61 agents read offline and not retired and three of them were working perfectly well, so
 * the reminders judge activity and never the presence reading.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 9 cases, all green. Then, in src/server/lib/reminders.ts, the "sent once"
 * read-back was broken by making `officeLinesSaidAboutARun` always answer false, so the office
 * re-sends the expected-time reminder on every tick past T — the repetition the owner's step 3 forbids ("the
 * system sends no further flow message").
 *
 * THE CASES THAT WENT RED:
 *
 *   × is sent once, not on every tick after it (the second tick adds nothing)
 *   × escalates at twice the expected time, once (the escalation was sent before its stage-1 line,
 *     and again on the second tick)
 *
 * The change was put back and the control run again: 9 cases, all green.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')

let t: TestDb
let reminders: RemindersLib

const HUMAN = { type: 'human', id: THE_PERSON } as const

/** Real now, once, at the top; every stamp in this file is measured from it. */
const R0 = new Date()

/** An hour, an hour and a bit, and so on, from R0 — the tick clock the tests move to. */
const at = (msFromR0: number): Date => new Date(R0.getTime() + msFromR0)

beforeAll(async () => {
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  // THE CARDS, READ THE WAY buildApp READS THEM, so the reminder's duties sentence is the card's own.
  const roles = await import('../src/server/lib/roles.ts')
  const records = await import('../src/server/lib/records.ts')
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}, 60_000)

afterAll(() => {
  t.close()
})

/** The registry rows this case made, retired at its end so the whole-office idle sweep cannot see them again. */
const madeAgents: string[] = []

afterEach(() => {
  // THE IDLE REMINDER READS EVERY AGENT IN THE OFFICE, not only the ones this case filed, and it
  // never reminds a retired agent. Retiring them returns the office to what each case found.
  const retire = t.client.sqlite.prepare('UPDATE agents SET retired = 1 WHERE id = ?')
  for (const id of madeAgents.splice(0)) retire.run(id)
})

/** One durable agent, by handle, with the role the office registered it under. */
function anAgent(handle: string, role: string): { recordId: string; registryId: string } {
  const recordId = t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, runtime: 'claude-code', state: 'active', role },
    actor: HUMAN,
  }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  madeAgents.push(row.id)
  return { recordId, registryId: row.id }
}

/** One message from the person to the agent — real work arriving, which restarts an idle spell. */
function aMessageTo(agentRegistryId: string, atRealTime: 'now' = 'now'): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'some work',
    data: { body: 'Please read the loquat logs.', to: [{ kind: 'agent', id: agentRegistryId }] },
    actor: HUMAN,
  }).id
}

/** One running run the office started for an agent, with an expected time only when one is given. */
function aRunningRun(agentRegistryId: string, expectedMinutes: number | null): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'answering a message',
    data: {
      state: 'running',
      runtime: 'fake',
      servingAgent: agentRegistryId,
      startedAt: localStamp(R0),
      startedTime: clockStamp(() => R0),
      deliveringMessage: 'none-here',
      ...(expectedMinutes === null ? {} : { expectedMinutes }),
    },
    actor: HUMAN,
  }).id
}

/** The expected-time reminder's two kinds of office line, as the office stores each line's kind. */
const EXPECTED_TIME_LINES = [SYSTEM_LINES.theExpectedTimeHasArrived('').notice, SYSTEM_LINES.twiceTheExpectedTime('').notice]

/**
 * The expected-time reminder's lines already written about one run, whole. The step reminder writes office lines about
 * a running run too, and this file does not count them.
 */
function officeLinesAboutARun(run: string): { body: string; saidInFull: string | null }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') IN (?, ?)",
      )
      .all(run, ...EXPECTED_TIME_LINES) as { data: string }[]
  ).map((one) => {
    const said = JSON.parse(one.data) as { body: string; saidInFull?: string }
    return { body: said.body, saidInFull: said.saidInFull ?? null }
  })
}

/** The office idle reminders already written to one agent, whole. */
function idleLinesTo(agentRegistryId: string): { body: string; saidInFull: string | null }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT r.data FROM records r JOIN message_delivery d ON d.message_id = r.id " +
          "WHERE r.kind = 'message' AND r.deleted_at IS NULL AND d.recipient_kind = 'agent' " +
          'AND d.recipient_id = ? AND json_extract(r.data, \'$.body\') = ?',
      )
      .all(agentRegistryId, 'Idle — your role and duties') as { data: string }[]
  ).map((one) => {
    const said = JSON.parse(one.data) as { body: string; saidInFull?: string }
    return { body: said.body, saidInFull: said.saidInFull ?? null }
  })
}

describe('F13, the idle reminder', () => {
  it('is reminded once, with its role, its duties and the note to read the rules again', () => {
    const agent = anAgent('idle-worker-one', 'worker')
    aMessageTo(agent.registryId)
    // TWO HOURS OF NOTHING. n is one hour to start, so this is past it.
    const first = reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000), new Date(R0.getTime() - 60_000))
    expect(first.idleReminded).toEqual(['idle-worker-one'])

    const said = idleLinesTo(agent.registryId)
    expect(said).toHaveLength(1)
    const whole = said[0]?.saidInFull ?? ''
    // THE ROLE, REGISTERED AT THE OFFICE.
    expect(whole).toContain('You are the worker here')
    // THE DUTIES, THE CARD'S OWN SENTENCE.
    expect(whole).toContain('Your duties:')
    // THE NOTE TO READ THE RULES AGAIN, ESPECIALLY AFTER A COMPACTION, and where they are whole: this office's
    // regulations at GET /api/office-regulations. Until wave 13w it named src/config/rules/CODE.md, the export of
    // the office this repository is developed in, which no installed office carries.
    expect(whole).toContain('GET /api/office-regulations')
    expect(whole).not.toContain('CODE.md')
    expect(whole.toLowerCase()).toContain('compaction')
  })

  it('is sent once, not on every tick after it', () => {
    const agent = anAgent('idle-worker-two', 'worker')
    aMessageTo(agent.registryId)
    reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000), new Date(R0.getTime() - 60_000))
    // THE OWNER'S STEP 3: the office sends no further flow message while the heartbeat continues. A second
    // tick an hour later, same spell, says nothing.
    const second = reminders.sendTheRemindersThatAreDue('default', at(3 * 3_600_000), new Date(R0.getTime() - 60_000))
    expect(second.idleReminded).toEqual([])
    expect(idleLinesTo(agent.registryId)).toHaveLength(1)
  })

  it('starts a new spell when work arrives, and reminds once in that spell too', async () => {
    const agent = anAgent('idle-worker-three', 'worker')
    aMessageTo(agent.registryId)
    reminders.sendTheRemindersThatAreDue('default', at(2 * 3_600_000), new Date(R0.getTime() - 60_000))
    // NEW WORK ARRIVES — the message below is written NOW, which is after the reminder above. A
    // stamp is truncated to the second, so this waits out the second the reminder was written in;
    // otherwise the new activity and the old line would share a stamp and could not be told apart.
    await new Promise((go) => setTimeout(go, 1_100))
    aMessageTo(agent.registryId)
    const third = reminders.sendTheRemindersThatAreDue('default', at(4 * 3_600_000), new Date(R0.getTime() - 60_000))
    expect(third.idleReminded).toEqual(['idle-worker-three'])
    expect(idleLinesTo(agent.registryId)).toHaveLength(2)
  })

  it('is not sent to an agent with nothing recorded, and not to one that went idle before the watcher started', () => {
    // NOBODY HAS RECORDED ANYTHING. Absence is a real answer, and sweeping 61 quiet agents because
    // they read offline is exactly what this rule does not do.
    anAgent('never-active-one', 'worker')
    // AND THIS ONE WAS ALREADY QUIET WHEN THE WATCHER STARTED: its newest activity is one minute
    // BEFORE watchingSince, so its going idle was never observed.
    const quietBefore = anAgent('quiet-before-one', 'worker')
    aMessageTo(quietBefore.registryId)
    const none = reminders.sendTheRemindersThatAreDue('default', at(5 * 3_600_000), new Date(R0.getTime() + 60_000))
    expect(none.idleReminded).toEqual([])
  })
})

describe('F10, the expected-time reminder', () => {
  it('no expected-time reminder comes for a run with no typed expected time, at any hour', () => {
    const agent = anAgent('run-worker-one', 'worker')
    const run = aRunningRun(agent.registryId, null)
    const none = reminders.sendTheRemindersThatAreDue('default', at(10 * 3_600_000), new Date(R0.getTime() - 60_000))
    expect(none.expectedTimeReached).toEqual([])
    expect(none.twiceExpectedTime).toEqual([])
    expect(officeLinesAboutARun(run)).toEqual([])
  })

  it('the mild reminder is sent at the expected time, once, needing no reply', () => {
    const agent = anAgent('run-worker-two', 'worker')
    const run = aRunningRun(agent.registryId, 60)
    // ONE MINUTE BEFORE T: nothing yet.
    const early = reminders.sendTheRemindersThatAreDue('default', at(59 * 60_000), new Date(R0.getTime() - 60_000))
    expect(early.expectedTimeReached).toEqual([])
    // PAST T: the mild reminder, once.
    const first = reminders.sendTheRemindersThatAreDue('default', at(61 * 60_000), new Date(R0.getTime() - 60_000))
    expect(first.expectedTimeReached).toEqual([run])
    expect(officeLinesAboutARun(run)).toHaveLength(1)
    const said = officeLinesAboutARun(run)[0]
    expect(said?.body).toBe('The expected time has arrived')
    expect(said?.saidInFull ?? '').toContain('no reply is needed')
    // AND NOT AGAIN on the next tick: the owner's step 3, no further flow messages on the repeat.
    const again = reminders.sendTheRemindersThatAreDue('default', at(90 * 60_000), new Date(R0.getTime() - 60_000))
    expect(again.expectedTimeReached).toEqual([])
    expect(officeLinesAboutARun(run)).toHaveLength(1)
  })

  it('escalates at twice the expected time, once, telling the agent to tell its supervisor why it is stuck', () => {
    const agent = anAgent('run-worker-three', 'worker')
    const run = aRunningRun(agent.registryId, 60)
    // AT T AND A BIT, the first stage only.
    reminders.sendTheRemindersThatAreDue('default', at(61 * 60_000), new Date(R0.getTime() - 60_000))
    // AT 2T AND A BIT: the escalation. The first period ran 0→T and the second T→2T; the reading of
    // the second expected time that puts the escalation at 2T is written at the top of src/server/lib/reminders.ts.
    const escalated = reminders.sendTheRemindersThatAreDue('default', at(121 * 60_000), new Date(R0.getTime() - 60_000))
    expect(escalated.twiceExpectedTime).toEqual([run])
    const lines = officeLinesAboutARun(run)
    expect(lines).toHaveLength(2)
    const second = lines.find((one) => one.body === 'Twice the expected time has passed')
    expect(second).toBeDefined()
    // THE DESIGN: the agent tells its supervisor why it
    // is stuck, and the supervisor decides whether the module was cut the wrong way.
    const whole = second?.saidInFull ?? ''
    expect(whole).toContain('tell your supervisor why you are stuck')
    expect(whole).toContain('whether the module')
    // AND ONCE ONLY: another tick past 2T says nothing more.
    const again = reminders.sendTheRemindersThatAreDue('default', at(180 * 60_000), new Date(R0.getTime() - 60_000))
    expect(again.twiceExpectedTime).toEqual([])
    expect(officeLinesAboutARun(run)).toHaveLength(2)
  })

  it('a run no longer going is judged by nothing', () => {
    const agent = anAgent('run-worker-four', 'worker')
    // CREATED RUNNING AND THEN SAID TO HAVE STOPPED. `finished` is sealed at the door (a finished
    // run must submit its work), which is machinery this criterion does not touch; `crashed` is the
    // other word a stopped run carries, and the property is the same: the record no longer says
    // running, so neither stage fires on it at any hour.
    const done = aRunningRun(agent.registryId, 60)
    t.api.patchRecord(done, { dataPatch: { state: 'crashed' } }, HUMAN)
    const none = reminders.sendTheRemindersThatAreDue('default', at(3 * 3_600_000), new Date(R0.getTime() - 60_000))
    expect(none.expectedTimeReached).toEqual([])
    expect(none.twiceExpectedTime).toEqual([])
    expect(officeLinesAboutARun(done)).toEqual([])
  })
})

/**
 * THE HOLDING ROWS OF ISOLATED WORLDS THAT ARE NOT RUNNING ARE CLOSED BY THE SWEEP.
 *
 * Problem `2G9jNsuJwJf4`: the withdrawn lease design left rows titled `Holding isolated world …`
 * reading `running` for worlds stopped hours or days earlier — 17 of them on the owner's office on
 * 12 September 2026. The tool's own list is the authority on which worlds are up: one directory per
 * world under `.logs/isolated`, and `where.json` in it names the world's API process. This points
 * one tick at a list of its own, so the check is proved without touching the checkout's own worlds.
 */
describe('a holding row whose isolated world is not running', () => {
  let folder = ''

  afterEach(() => {
    if (folder !== '') rmSync(folder, { recursive: true, force: true })
    folder = ''
  })

  /** One holding row, in the shape the world tool wrote before the lease design was withdrawn. */
  function aHoldingRow(name: string): string {
    return t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: `Holding isolated world ${name}`,
      data: { state: 'running', runtime: 'isolated-world' },
      actor: HUMAN,
    }).id
  }

  it('is closed with its cause, while the row for a world on the list is left alone', () => {
    folder = mkdtempSync(join(tmpdir(), 'mole-office-worlds-'))
    const gone = aHoldingRow('b-gone')
    const here = aHoldingRow('b-here')
    // THE TOOL'S OWN FILE FOR A WORLD IT SAYS IS UP. `apiPgid` is this process, which is alive.
    mkdirSync(join(folder, 'b-here'), { recursive: true })
    writeFileSync(
      join(folder, 'b-here', 'where.json'),
      JSON.stringify({ name: 'b-here', apiPgid: process.pid, apiPort: 1, webPort: 2 }),
    )

    const pass = reminders.sendTheRemindersThatAreDue(
      'default',
      at(2 * 3_600_000),
      new Date(R0.getTime() - 60_000),
      folder,
    )
    expect(pass.worldHoldsClosed).toContain(gone)
    expect(pass.worldHoldsClosed).not.toContain(here)

    const closed = t.api.getRecord(gone)
    expect(closed?.data['state'], 'the row for the gone world still says it is running').toBe('finished')
    expect(closed?.data['closedBecause']).toBe('the world is not running')
    expect(closed?.data['closedHow']).toBe('went-stale')

    const left = t.api.getRecord(here)
    expect(left?.data['state'], 'the row for a world the tool shows as running was closed').toBe('running')
    expect(left?.data['closedBecause'] ?? null).toBeNull()
  })
})
