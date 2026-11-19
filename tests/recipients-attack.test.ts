// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE RANKING DOES WHEN IT CANNOT TELL TWO RUNS APART, AND WHAT IT SAYS ABOUT A RUN THAT IS
 * NOT AN AGENT.
 *
 * tests/recipients.test.ts proves the ladder, the refusals and the pick-up answer. This file is
 * what was found by attacking those on 18 August 2026, and every test here stands for one thing
 * that was wrong or unproved:
 *
 *   A TIE WAS SETTLED BY COMPARING TWO IDS AND NOTHING SAID SO. Two runs on the same rung, with
 *   the same evidence behind it, last seen in the same second came back in id order, and a screen
 *   showing the first as the suggested recipient would have been showing a coin toss. Worse, the
 *   list of unranked runs was cut at eight, so one of two identical runs could be on the reply and
 *   the other only in a count.
 *
 *   A FIXTURE ROW RESOLVED AS "ONE AGENT" AND THE SENTENCE NEVER SAID IT WAS NOT A REAL RUN. So
 *   did a deleted one. Both carried the fact in a field and left it to a screen to draw.
 *
 *   `pickUp` ANSWERED `yes` FOR A DIRECTORY, because something existing at the path was read as a
 *   transcript being there.
 *
 *   FIVE THOUSAND CHARACTERS OF WORDS PRODUCED A 45,690-CHARACTER SENTENCE.
 *
 * The rest pin behaviour the file promises in prose and no test held: the three clocks, the two
 * places a phrase is matched that no test reached, unicode word splitting, deleted runs staying on
 * the list, and runs in another project being named.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, one, type TestDb } from './helpers.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Recipients = typeof import('../src/server/lib/recipients.ts')
type Sessions = typeof import('../src/shared/discovery-stamp.ts')
type Workspaces = typeof import('../src/server/lib/workspaces.ts')

let t: TestDb
let lib: Recipients
let sessionsLib: Sessions
let workspacesLib: Workspaces
let scratch: string[] = []

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

beforeEach(async () => {
  t = await freshDb()
  lib = await import('../src/server/lib/recipients.ts')
  sessionsLib = await import('../src/shared/discovery-stamp.ts')
  workspacesLib = await import('../src/server/lib/workspaces.ts')
})

afterEach(() => {
  t.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch = []
})

// -------------------------------------------------------------------------------- small helpers

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-recipients-attack-'))
  scratch.push(dir)
  return dir
}

/** A session record with no discovery stamp: one somebody filed by hand. */
function handFiled(
  title: string,
  extra: Record<string, unknown> = {},
  opts: { workspaceId?: string; origin?: 'fixture' | 'authored'; summary?: string } = {},
): PanelRecord {
  return t.api.createRecord({
    kind: 'session',
    title,
    summary: opts.summary ?? `why ${title} was started`,
    data: { state: 'idle', runtime: 'claude-code', ...extra },
    workspaceId: opts.workspaceId ?? 'default',
    actor: HUMAN,
    ...(opts.origin === undefined ? {} : { origin: opts.origin }),
  })
}

/** A session record carrying a discovery stamp that points wherever the caller says. */
function stampedAt(title: string, logPath: string): PanelRecord {
  return t.api.createRecord({
    kind: 'session',
    title,
    summary: `why ${title} was started`,
    data: {
      state: 'idle',
      runtime: 'claude-code',
      extra: {
        [sessionsLib.DISCOVERY_KEY]: {
          tool: 'claude-code',
          externalId: `ext-${title.replace(/\W/g, '')}`,
          logPath,
          resumeCommand: `claude --resume ext-${title.replace(/\W/g, '')}`,
          startedAt: '2026-08-14 09:00:00',
          entryPoint: 'cli',
          observedState: 'idle',
          stateReason: 'made by a test',
          filesTouched: [],
          filesComplete: false,
          at: '2026-08-15 10:00:00',
        },
      },
    },
    workspaceId: 'default',
    actor: HUMAN,
  })
}

const asRun = (sessionRecordId: string) =>
  ({ type: 'agent', id: 'claude-code', sessionId: sessionRecordId }) as const

const idsOf = (candidates: readonly { sessionId: string }[]) => candidates.map((c) => c.sessionId)

/** Two runs that each changed one record once, in the same second. Nothing tells them apart. */
function twoLevelRuns(): { first: PanelRecord; second: PanelRecord; report: PanelRecord } {
  const a = handFiled('one run')
  const b = handFiled('another run')
  const report = t.api.createRecord({
    kind: 'report',
    title: 'A report they both touched',
    data: {},
    workspaceId: 'default',
    actor: HUMAN,
  })
  // ONE SECOND BY CONSTRUCTION, NOT BY BEING QUICK. Two runs are level when they last touched the
  // record in the same second — Mole Office's clock holds nothing finer — and this fixture used to
  // get that by making both writes fast enough. On a busy machine they straddle a second boundary,
  // the two stop being level, and the order below is then the newer one first: measured on 31
  // August 2026, one full suite run in five, in a file that passed every time it was run alone.
  // Freezing the clock over the two writes makes them tied because they are tied.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date())
  try {
    t.api.patchRecord(report.id, { summary: 'touched by one' }, asRun(a.id))
    t.api.patchRecord(report.id, { summary: 'touched by the other' }, asRun(b.id))
  } finally {
    vi.useRealTimers()
  }
  const [first, second] = a.id.localeCompare(b.id) < 0 ? [a, b] : [b, a]
  return { first: first!, second: second!, report }
}

// ============================================================ a tie is an answer, and it is said

describe('two runs the evidence cannot tell apart are named as a tie', () => {
  it('names the other run on each of them, rather than letting the id decide quietly', () => {
    const { first, second, report } = twoLevelRuns()

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    // Both come back — that was already true — and now each says which one it is level with.
    expect(idsOf(answer.connected)).toEqual([first.id, second.id])
    expect(answer.connected[0]?.tiedWith).toEqual([second.id])
    expect(answer.connected[1]?.tiedWith).toEqual([first.id])
  })

  it('says the order between the top two means nothing, on the rows and not in a paragraph', () => {
    const { first, second, report } = twoLevelRuns()
    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    // IT USED TO BE A SENTENCE ON THE REPLY ending "Mole Office is not choosing between them" — a phrase
    // the owner banned by name — worked out beside the field that already held the same fact. The
    // fact is on the rows: each of the two names the other, so a screen can draw the tie where the
    // tie is, and there is no second reading of it to come adrift.
    expect(answer.connected[0]?.tiedWith).toEqual([second.id])
    expect(answer.connected[1]?.tiedWith).toEqual([first.id])
  })

  it('leaves tiedWith empty when one run really does beat the other', () => {
    const filer = handFiled('the run that filed it')
    const editor = handFiled('the run that edited it')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by one of them',
      data: {},
      workspaceId: 'default',
      actor: asRun(filer.id),
    })
    t.api.patchRecord(report.id, { summary: 'edited' }, asRun(editor.id))

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.connected.map((c) => c.tiedWith)).toEqual([[], []])
  })

  it('orders level runs by id, so two reads of the same evidence never disagree', () => {
    // SIX RUNS, NOT TWO, AND THAT IS THE POINT OF THE TEST. Ids are generated, so with two runs the
    // order they were created in matches the order of their ids half the time and this test would
    // then pass with the rule taken out. With six, that happens once in 720 tries.
    // ALL SIX SHARE ONE MOMENT ON ALL THREE CLOCKS, AND THE TEST CHECKS THAT BEFORE IT CHECKS
    // ANYTHING ELSE.
    //
    // This test used to file six runs and rely on them landing in one wall-clock second, so that the
    // id would be the only thing left to order by. Under a loaded suite they straddled a boundary,
    // `lastSeenAt` decided first, and the file went red — the product being right and the test
    // asserting a tie it had not made. The first repair set `lastOutputAt` and was not enough, which
    // is the more useful half of the story: `lastSeen` takes the LATEST of three clocks — the run
    // record's `updatedAt`, the stated output time, and when that session last wrote — so pinning
    // one of three leaves two free to straddle. It went red again, once, in a full run.
    //
    // So all three are written, and then the tie is ASSERTED rather than assumed. If a fourth clock
    // is ever added, this fails saying the tie was not made, which is a different sentence from the
    // order being wrong and points at the right thing.
    const sameMoment = '2026-08-19 09:00:00'
    const runs = Array.from({ length: 6 }, (_, n) => handFiled(`run ${n}`, { lastOutputAt: sameMoment }))
    const report = t.api.createRecord({
      kind: 'report',
      title: 'A report they all touched',
      data: {},
      workspaceId: 'default',
      actor: HUMAN,
    })
    for (const run of runs) t.api.patchRecord(report.id, { summary: `touched by ${run.title}` }, asRun(run.id))

    // THE OTHER TWO CLOCKS, flattened after the writes that moved them.
    const ids = runs.map((r) => r.id)
    const marks = ids.map(() => '?').join(',')
    t.client.sqlite.prepare(`UPDATE records SET updated_at = ? WHERE id IN (${marks})`).run(sameMoment, ...ids)
    t.client.sqlite.prepare(`UPDATE changes SET at = ? WHERE session_id IN (${marks})`).run(sameMoment, ...ids)

    const once = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    const twice = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')

    // THE TIE ITSELF, checked first. Everything below is about what happens WHEN two runs cannot be
    // told apart, and none of it means anything if they can be.
    expect(new Set(once.connected.map((c) => c.lastSeenAt)), 'the six were not seen at one moment, so no tie was made').toEqual(
      new Set([sameMoment]),
    )
    expect(new Set(once.connected.map((c) => c.support)), 'the six do not have equal support, so no tie was made').toHaveLength(1)

    expect(idsOf(once.connected)).toEqual(ids.slice().sort((a, b) => a.localeCompare(b)))
    expect(idsOf(twice.connected)).toEqual(idsOf(once.connected))
    expect(once.connected[0]?.tiedWith).toHaveLength(5)
  })

  it('lengthens the list of unranked runs rather than cutting it through the middle of a tie', () => {
    // FOUR RUNS, NOTHING CONNECTING ANY OF THEM TO ANYTHING, ALL SEEN AT ONE MOMENT — AND THE
    // MOMENT IS WRITTEN RATHER THAN HOPED FOR.
    //
    // This test used to file the four runs and rely on them landing inside one wall-clock second.
    // Under a loaded suite they straddled a boundary, `lastSeenAt` told them apart, the list was
    // cut at the two that were asked for, and the file went red — the product being right and the
    // test asserting a tie it had not made. That is problem `Lt7LrzUc0_c3`.
    //
    // So all three clocks are written, the same way the six-run test above writes them, and the tie
    // is then ASSERTED before anything else. `lastSeen` takes the LATEST of three — the run
    // record's `updatedAt`, the stated output time, and when that session last wrote — so pinning
    // one of the three would leave two free to straddle. If a fourth clock is ever added this
    // fails saying the tie was not made, which is a different sentence from the list being cut and
    // points at the right thing.
    const sameMoment = '2026-08-19 09:00:00'
    const runs = [
      handFiled('run a', { lastOutputAt: sameMoment }),
      handFiled('run b', { lastOutputAt: sameMoment }),
      handFiled('run c', { lastOutputAt: sameMoment }),
      handFiled('run d', { lastOutputAt: sameMoment }),
    ]
    const task = t.api.createRecord({ kind: 'task', title: 'Untouched', workspaceId: 'default', actor: HUMAN })

    const ids = runs.map((r) => r.id)
    const marks = ids.map(() => '?').join(',')
    t.client.sqlite.prepare(`UPDATE records SET updated_at = ? WHERE id IN (${marks})`).run(sameMoment, ...ids)
    t.client.sqlite.prepare(`UPDATE changes SET at = ? WHERE session_id IN (${marks})`).run(sameMoment, ...ids)

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default', 2)

    // THE TIE ITSELF, CHECKED FIRST. The rule below is about what happens when four runs cannot be
    // told apart, and it means nothing if they can be.
    expect(
      new Set(answer.recent.map((r) => r.lastSeenAt)),
      'the four were not seen at one moment, so no tie was made',
    ).toEqual(new Set([sameMoment]))

    // Asked for two. All four are level, so all four come back and none is left in a count.
    expect(answer.recent).toHaveLength(4)
    expect(answer.recentLeftOut).toBe(0)
    expect(new Set(idsOf(answer.recent))).toEqual(new Set(ids))
  })

  it('still stops at the number asked for when the runs are not level', () => {
    // Dated ahead of today on purpose. `lastSeenAt` is the NEWEST of the three clocks, and the
    // record's own `updatedAt` is this second, so a date in the past would not be the one read and
    // all three runs would be level — which is the other test, not this one.
    handFiled('older run', { lastOutputAt: '2099-01-01 09:00:00' })
    handFiled('newer run', { lastOutputAt: '2099-01-02 09:00:00' })
    handFiled('newest run', { lastOutputAt: '2099-01-03 09:00:00' })
    const task = t.api.createRecord({ kind: 'task', title: 'Untouched', workspaceId: 'default', actor: HUMAN })

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default', 1)
    expect(answer.recent).toHaveLength(1)
    expect(answer.recentLeftOut).toBe(2)
    expect(answer.recent[0]?.tiedWith).toEqual([])
  })
})

// ============================================================ a run that is not a run

describe('a resolved recipient that nobody can answer for says so in the sentence', () => {
  it('says a fixture run is fixture content, and not only in a field', () => {
    handFiled('controller calibration sweep', {}, { origin: 'fixture' })
    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.origin).toBe('fixture')
    expect(answer.note).toContain('fixture content')
    expect(answer.note).toContain('no agent behind it to answer')
  })

  it('says the one run it named has been deleted', () => {
    const run = handFiled('controller calibration sweep')
    t.api.deleteRecord(run.id, HUMAN)
    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.deleted).toBe(true)
    expect(answer.note).toContain('That run has been deleted')
  })

  it('says the one run it named cannot be picked up, and offers the two honest choices', () => {
    handFiled('controller calibration sweep', {}, { origin: 'authored' })
    const answer = lib.resolveRecipient('the agent working on controller calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.note).toContain('It cannot be picked up where it left off')
    expect(answer.note).toContain('start a new agent and hand it this context, or stop')
  })

  it('counts the fixture rows on the ranked reply instead of leaving it to a screen', () => {
    const fixture = handFiled('seeded run', {}, { origin: 'fixture' })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by the fixture',
      data: {},
      workspaceId: 'default',
      actor: asRun(fixture.id),
    })
    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.read.origins.fixture).toBe(1)
  })

  it('says when a candidate carries no mark saying how it entered the corpus', () => {
    const bare = handFiled('a run nobody stamped')
    // THE MARK IS CLEARED THROUGH THE DATABASE BECAUSE THE PRODUCT CANNOT MAKE THIS STATE ANY MORE.
    // `createRecord` stamps `authored` when nothing says otherwise, so an unmarked row is one that
    // predates the column. That is the state this branch exists for, so that is the state to make.
    t.client.sqlite.prepare('update records set origin = null where id = ?').run(bare.id)
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed by it',
      data: {},
      workspaceId: 'default',
      actor: asRun(bare.id),
    })
    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.connected[0]?.origin).toBeNull()
    // COUNTED SEPARATELY FROM `fixture`, which is the whole point of the branch: "nobody said" and
    // "somebody said it is made up" are different answers and neither may be read as the other.
    expect(answer.read.origins.unmarked).toBe(1)
    expect(answer.read.origins.fixture).toBe(0)
  })

  it('keeps a deleted run on the list, because the change log still names it', () => {
    const run = handFiled('the run that filed it')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Filed before the run was deleted',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    t.api.deleteRecord(run.id, HUMAN)

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    const only = one(answer.connected, 'connected candidate')
    expect(only.sessionId).toBe(run.id)
    expect(only.deleted).toBe(true)
    expect(answer.read.origins.deleted).toBe(1)
  })

  it('names the same neighbouring record every time, whatever order the change log is in', () => {
    const run = handFiled('the neighbour run')
    const task = t.api.createRecord({ kind: 'task', title: 'Recalibrate', workspaceId: 'default', actor: HUMAN })
    const first = t.api.createRecord({
      kind: 'problem',
      title: 'Alpha slips above 15N',
      data: { symptom: 'it slips' },
      workspaceId: 'default',
      actor: HUMAN,
    })
    const second = t.api.createRecord({
      kind: 'problem',
      title: 'Zebra slips above 15N',
      data: { symptom: 'it slips' },
      workspaceId: 'default',
      actor: HUMAN,
    })
    t.api.createLink({ fromId: task.id, toId: first.id, type: 'relates_to', actor: HUMAN })
    t.api.createLink({ fromId: task.id, toId: second.id, type: 'relates_to', actor: HUMAN })
    // Alpha first and Zebra last, so the newest row in the change log is Zebra. Naming whichever
    // came out of the log first would name Zebra; the sentence names them in title order.
    t.api.patchRecord(first.id, { summary: 'looked at Alpha' }, asRun(run.id))
    t.api.patchRecord(second.id, { summary: 'looked at Zebra' }, asRun(run.id))

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default')
    const only = one(answer.connected, 'connected candidate')
    expect(only.why).toContain('“Alpha slips above 15N”')
    expect(only.why).toContain('and on 1 more record linked to it')
  })

  it('names the runs that wrote to this record and are filed in another project', () => {
    workspacesLib.createWorkspace({ id: 'robotics', title: 'Robotics' })
    const outsider = handFiled('a run filed elsewhere', {}, { workspaceId: 'robotics' })
    const report = t.api.createRecord({
      kind: 'report',
      title: 'Written to from another project',
      data: {},
      workspaceId: 'default',
      actor: HUMAN,
    })
    t.api.patchRecord(report.id, { summary: 'touched from elsewhere' }, asRun(outsider.id))

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    expect(answer.connected).toEqual([])
    // A COUNT AND THE PROJECTS, not a sentence holding both. Why they cannot be reached from here
    // is the same on every reply and is the screen's `title`.
    expect(answer.context.elsewhere).toEqual({ runs: 1, projects: ['robotics'] })
  })
})

// ============================================================ can it be picked up

describe('a transcript that is not a file is not a transcript', () => {
  it('answers unknown, not yes, when something else is at the path', () => {
    const home = tempHome()
    const notAFile = join(home, 'projects', 'a-directory.jsonl')
    mkdirSync(notAFile, { recursive: true })
    const record = stampedAt('a run whose transcript is a directory', notAFile)

    const pick = lib.pickUpOf(record)
    expect(pick.answer).toBe('unknown')
    if (pick.answer !== 'unknown') throw new Error('unreachable')
    expect(pick.why).toBe('transcript-unreadable')
    expect(pick.because).toContain('it is not a file')
  })

  it('still answers yes for a real transcript file', () => {
    const home = tempHome()
    mkdirSync(join(home, 'projects'), { recursive: true })
    const logPath = join(home, 'projects', 'real.jsonl')
    writeFileSync(logPath, '{"type":"user"}\n')
    const record = stampedAt('a run with a transcript', logPath)

    expect(lib.pickUpOf(record).answer).toBe('yes')
  })
})

// ============================================================ what the words were matched against

describe('a phrase is matched against everything the file says it is matched against', () => {
  it('matches what a run says it is doing', () => {
    handFiled('run 41ba', { doing: 'measuring the gripper force curve' })
    handFiled('another run')
    const answer = lib.resolveRecipient('the agent working on the force curve', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.matched.some((m) => m.where === 'doing')).toBe(true)
  })

  it('matches the title of a record the run wrote to', () => {
    const run = handFiled('run 41ba')
    handFiled('another run')
    t.api.createRecord({
      kind: 'report',
      title: 'Hydraulics teardown',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    const answer = lib.resolveRecipient('the agent working on hydraulics', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.sessionId).toBe(run.id)
    expect(answer.matched.some((m) => m.where === 'wrote')).toBe(true)
  })

  it('splits words with a unicode pattern, so a title that is not in English can be matched', () => {
    expect(lib.wordsIn('夹具重印 and calibration')).toEqual(['夹具重印', 'and', 'calibration'])
    handFiled('夹具重印与复测')
    handFiled('something else entirely')
    const answer = lib.resolveRecipient('the agent working on 夹具重印', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.recipient.title).toBe('夹具重印与复测')
  })

  it('says when a word was found only inside a longer word', () => {
    handFiled('Reviewing the corpus across every module')
    const answer = lib.resolveRecipient('the agent working on ros', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.matched.every((m) => m.whole)).toBe(false)
    expect(answer.note).toContain('was found only inside a longer word')
  })

  it('says a word stands on its own when it does', () => {
    handFiled('controller calibration sweep')
    const answer = lib.resolveRecipient('the agent working on calibration', null, 'default')
    expect(answer.outcome).toBe('one')
    if (answer.outcome !== 'one') throw new Error('unreachable')
    expect(answer.matched.every((m) => m.whole)).toBe(true)
    expect(answer.note).toContain('“calibration” matched the run’s title')
    expect(answer.note).not.toContain('inside a longer word')
  })
})

// ============================================================ a sentence a person can read

describe('a sentence stays a sentence however much was typed', () => {
  it('names the first few words and counts the rest, rather than printing five thousand characters', () => {
    handFiled('a run about nothing in particular')
    const said = Array.from({ length: 400 }, (_, n) => `word${n}`).join(' ')
    expect(said.length).toBeGreaterThan(2500)

    const answer = lib.resolveRecipient(said, null, 'default')
    expect(answer.outcome).toBe('none')
    if (answer.outcome !== 'none') throw new Error('unreachable')
    expect(answer.why).toBe('nothing-matched')
    // Every word is still on the reply, under `read.words`. The sentence names a dozen.
    expect(answer.read.words).toHaveLength(400)
    expect(answer.note).toContain(`and ${400 - lib.NAMED_IN_A_SENTENCE} more`)
    expect(answer.note.length).toBeLessThan(1000)
  })

  it('keeps the refusal readable when the words reach many agents', () => {
    for (let n = 0; n < 30; n += 1) handFiled(`calibration sweep number ${n}`)
    const answer = lib.resolveRecipient('the agent working on calibration', null, 'default')
    expect(answer.outcome).toBe('many')
    if (answer.outcome !== 'many') throw new Error('unreachable')
    expect(answer.candidates).toHaveLength(30)
    expect(answer.note).toContain('and 18 more')
    expect(answer.note).toContain('Every one of them is on this reply')
    expect(answer.note.length).toBeLessThan(1200)
  })
})

// ============================================================ what the reading had to look at

describe('the counts saying what was read are the counts', () => {
  it('counts the change rows on the record you pointed at, and the runs it read', () => {
    const run = handFiled('a busy run')
    handFiled('a quiet run')
    const report = t.api.createRecord({
      kind: 'report',
      title: 'A report',
      data: {},
      workspaceId: 'default',
      actor: asRun(run.id),
    })
    t.api.patchRecord(report.id, { summary: 'once' }, asRun(run.id))
    t.api.patchRecord(report.id, { summary: 'twice' }, asRun(run.id))

    const answer = lib.recipientsFor({ kind: 'record', id: report.id }, 'default')
    // One row for the create and one for each of the two edits.
    expect(answer.read.changesOnThis).toBe(3)
    expect(answer.read.changesOnThisCapped).toBe(false)
    expect(answer.read.sessions).toBe(2)
    expect(answer.read.transcriptsChecked).toBe(2)
  })
})

// ============================================================ when Mole Office last saw a run

describe('the clock a run is ranked by is the newest of the three, not whichever is easiest', () => {
  it('prefers what somebody wrote down when it is newer than both', () => {
    handFiled('a run somebody dated', { lastOutputAt: '2099-01-01 09:00:00' })
    const task = t.api.createRecord({ kind: 'task', title: 'Untouched', workspaceId: 'default', actor: HUMAN })

    const answer = lib.recipientsFor({ kind: 'record', id: task.id }, 'default')
    const only = one(answer.recent, 'unranked run')
    expect(only.lastSeenFrom).toBe('stated')
    expect(only.lastSeenAt).toBe('2099-01-01 09:00:00')
  })
})
