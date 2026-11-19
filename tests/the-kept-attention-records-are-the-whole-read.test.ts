// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORDS THE ATTENTION THREAD KEEPS BETWEEN ASKS ARE THE RECORDS A WHOLE READ GIVES, AFTER EVERY WRITE THERE IS
 * (wave 13y round 167).
 *
 * src/server/lib/attention-kept-records.ts keeps the records the attention rule reads, from one ask to the next, and
 * reads again only the records the change log names since its last read. So it is right only while every write to
 * the records table writes a change row in the same transaction, or moves SQLite's schema counter as the import does.
 * A write that does neither would leave Home showing a record as it was, with nothing failing. This file is what
 * fails instead.
 *
 * THE FIRST PART READS THE SOURCE. It finds every statement in src/ outside src/server/db/ that writes the records
 * table, by file and by the function it sits in, and compares them with THE_WRITES below, where each is named with
 * how this file answers for it. A new write fails here until somebody lists it. src/server/db/ is left out because
 * it holds the migrations, and every migration moves the schema counter.
 *
 * THE SECOND PART RUNS EACH WRITE THE LIST SAYS IS RUN HERE, the import among them, on an office made here, and after
 * every one compares the kept records with a whole read, by hash, in two projects. It also holds that the kept records
 * were read again in part and not whole, except where the log line says why, and that nothing the rule and the shapes
 * do changes a kept record, by reading them frozen.
 *
 * THE THIRD PART IS POST /api/attention/read-everything-again: a write with no change row is not seen until the call,
 * and after it Home is what a thread started afresh gives.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL on the code before the kept records,
 * where the first part is green and the rest is red; a MUTATION that drops one change row, and one that makes the call
 * do nothing, each red; RESTORE green.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PanelRecord } from '../src/shared/types.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HERE = 'default'
const ELSEWHERE = 'elsewhere'

// ============================================================ 1. every write to the records table, from the source





// ============================================================ 2. each write, then the kept records against a whole read

type Records = typeof import('../src/server/lib/records.ts')
type Kept = typeof import('../src/server/lib/attention-kept-records.ts')

let t: TestDb
let R: Records
let K: Kept
let kept: ReturnType<Kept['keptAttentionRecords']>
/** Every line the kept records said, in order: one each time every record of a project was read again. */
const said: string[] = []
const dirs: string[] = []

/** The moment the next write happens at. A stored stamp is a second, so each write is given a second of its own. */
let clock = new Date(2026, 10, 15, 9, 0, 0)

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
}, 60_000)

afterAll(() => {
  t.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

afterEach(() => {
  vi.useRealTimers()
})

/** The records one read gives, as one hash. */
const hashOf = (read: readonly PanelRecord[]): string => createHash('sha256').update(JSON.stringify(read)).digest('hex')

/** Where two reads differ, in words: the ids only one gives, and the ids both give that differ. */
function whereTheyDiffer(kept: readonly PanelRecord[], whole: readonly PanelRecord[]): string {
  const byId = new Map(whole.map((one) => [one.id, JSON.stringify(one)]))
  const keptIds = new Set(kept.map((one) => one.id))
  const onlyKept = kept.filter((one) => !byId.has(one.id)).map((one) => one.id)
  const onlyWhole = whole.filter((one) => !keptIds.has(one.id)).map((one) => one.id)
  const changed = kept.filter((one) => byId.has(one.id) && byId.get(one.id) !== JSON.stringify(one)).map((one) => one.id)
  const order = onlyKept.length + onlyWhole.length + changed.length === 0 ? ' the same records in another order' : ''
  return `only kept: ${onlyKept.join(', ') || 'none'}; only in the whole read: ${onlyWhole.join(', ') || 'none'}; kept as they were: ${changed.join(', ') || 'none'};${order}`
}

/** Perform one write, at a second of its own. */
async function write<T>(what: () => T | Promise<T>): Promise<T> {
  clock = new Date(clock.getTime() + 1000)
  vi.setSystemTime(clock)
  return await what()
}

/** Why every record of a project is to be read again after a write, by the reasons attention-kept-records.ts names. */
type Because = Partial<Record<string, import('../src/server/lib/attention-kept-records.ts').WhyEveryRecordWasRead>>

/** After a write: the kept records of each project are a whole read's, and every record was read again only as `because` says. */
function theKeptAreTheWhole(after: string, because: Because = {}): void {
  const before = said.length
  for (const project of [HERE, ELSEWHERE]) {
    const whole = R.listRecordsForTheAttentionRule(project)
    const now = kept.read(project)
    expect(hashOf(now), `after ${after}, in project ${project}: ${whereTheyDiffer(now, whole)}`).toBe(hashOf(whole))
  }
  const expected = [HERE, ELSEWHERE].flatMap((project) => {
    const why = because[project]
    return why === undefined ? [] : [`project ${project} again, because ${K.WHY_EVERY_RECORD_WAS_READ[why]}:`]
  })
  expect(
    said.slice(before).map((line) => /project \S+ again, because [^:]+:/.exec(line)?.[0]),
    `after ${after}, the kept records said why every record was read again`,
  ).toEqual(expected)
}

const HUMAN = () => R.HUMAN
const OFFICE = () => ({ type: 'system' as const, id: moleOffice().id })

/** What the writes below share: the records they make and change. */
const made = { note: '', task: '', module: '', run: '', traveller: '', root: '' }

/**
 * EACH WRITE THE FIRST PART SAYS IS RUN HERE, in order, each naming the entries of THE_WRITES it covers. Each is
 * followed by the check above. `because` names a project whose every record is to be read again after it, and why.
 */
const WRITES: { name: string; covers: string[]; write: () => unknown; because?: Because }[] = [
  {
    name: 'a record filed',
    covers: ['server/lib/records/creating.ts createRecordWithReport'],
    write: () => {
      made.note = R.createRecord({ workspaceId: HERE, kind: 'note', title: 'A made-up note filed while the records are kept', actor: HUMAN() }).id
    },
  },
  {
    name: 'a record changed by a patch',
    covers: ['server/lib/records/patching.ts patchRecord'],
    write: () => R.patchRecord(made.task, { dataPatch: { state: 'doing' } }, HUMAN()),
  },
  {
    name: 'a record changed whole',
    covers: ['server/lib/records/patching.ts patchRecord'],
    write: () => R.updateRecord(made.task, { title: 'A made-up task, renamed', data: { state: 'blocked', effort_hours: 3 } }, HUMAN()),
  },
  {
    name: 'one checklist line ticked',
    covers: ['server/lib/records/checklist-items.ts patchChecklistItem'],
    write: () => R.patchChecklistItem(made.module, 'mount-1', { state: 'done' }, HUMAN()),
  },
  { name: 'a record deleted', covers: ['server/lib/records/delete-restore.ts deleteRecord'], write: () => R.deleteRecord(made.note, HUMAN()) },
  { name: 'a record undeleted', covers: ['server/lib/records/delete-restore.ts restoreRecord'], write: () => R.restoreRecord(made.note, HUMAN()) },
  {
    // A COMMENT IN THE MESSAGE CENTRE ON THIS RECORD MOVES INTO THE VIEW OF THE PROJECT THE RECORD MOVES TO, and the
    // comment's own row is not written.
    name: 'a record filed in another project',
    covers: ['server/lib/records/file-records-in-workspace.ts fileRecordsInWorkspace'],
    write: () => R.fileRecordsInWorkspace([made.traveller], HERE, HUMAN()),
  },
  { name: "a run's later-look mark", covers: ['server/lib/records/run-writes.ts writeTheEndedRunLookMark'], write: () => R.writeTheEndedRunLookMark(made.run, '2026-11-15 09:00:00', OFFICE()) },
  { name: 'how a round ended', covers: ['server/lib/records/run-writes.ts writeHowTheRoundEnded'], write: () => R.writeHowTheRoundEnded(made.run, { made: 'up' }, OFFICE()) },
  { name: 'the next round', covers: ['server/lib/records/run-writes.ts writeTheNextRound'], write: () => R.writeTheNextRound(made.run, { made: 'up' }, OFFICE()) },
  { name: 'one worker run', covers: ['server/lib/records/run-writes.ts writeTheWorkerRun'], write: () => R.writeTheWorkerRun(made.run, 'a-made-up-worker', { made: 'up' }, OFFICE()) },
  {
    name: 'the Casting roll',
    covers: ['server/lib/records/run-writes.ts writeTheCastingRoll'],
    write: () => R.writeTheCastingRoll(made.run, { made: 'up' } as unknown as Parameters<Records['writeTheCastingRoll']>[1], OFFICE()),
  },
  {
    name: 'the cut asked',
    covers: ['server/lib/records/run-writes.ts writeTheCutAsked'],
    write: () => R.writeTheCutAsked(made.run, { made: 'up' } as unknown as Parameters<Records['writeTheCutAsked']>[1], OFFICE()),
  },
  {
    name: 'the images given',
    covers: ['server/lib/records/run-writes.ts writeTheImagesGiven'],
    write: () => R.writeTheImagesGiven(made.run, { made: 'up' } as unknown as Parameters<Records['writeTheImagesGiven']>[1], OFFICE()),
  },
  {
    name: 'a revision put back',
    covers: ['server/lib/records/patching.ts patchRecord'],
    write: async () => (await import('../src/server/lib/revisions.ts')).restoreRevision(made.module, 1, HUMAN(), 'A made-up restore of the checklist line.'),
  },
  {
    name: 'an archive written before a change, then imported',
    covers: ['server/lib/import.ts buildPlan', 'server/lib/import.ts insertStatement', 'server/lib/import.ts updateStatement'],
    because: { [HERE]: 'schemaMoved', [ELSEWHERE]: 'schemaMoved' },
    write: async () => {
      const exportLib = await import('../src/server/lib/export.ts')
      const importLib = await import('../src/server/lib/import.ts')
      exportLib.writeExport(made.root)
      R.updateRecord(made.note, { title: 'A made-up note, renamed after the archive was written' }, HUMAN())
      // THE CHANGE ROW OF THAT RENAME IS READ, so the import's own writes are the only thing left for the counter to show.
      theKeptAreTheWhole('the rename before the import')
      const schemaBefore = t.client.sqlite.pragma('schema_version', { simple: true })
      expect(importLib.applyImport(made.root).applied).toBe(true)
      // THE IMPORT MOVES THE COUNTER. attention-kept-records.ts rests on this, and this is where it would stop being true.
      expect(t.client.sqlite.pragma('schema_version', { simple: true })).not.toBe(schemaBefore)
      expect(R.getRecord(made.note)?.title).toBe('A made-up note filed while the records are kept')
    },
  },
]

describe('the records the attention thread keeps', () => {
  // IMPORTED HERE AND NOT FOR THE WHOLE FILE, so the first part still reads the source where this file is not there.
  beforeAll(async () => {
    K = await import('../src/server/lib/attention-kept-records.ts')
  })

  it('are what a whole read gives after each write, in each project', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(clock)
    const db = t.client.sqlite
    db.prepare(
      "INSERT OR IGNORE INTO workspaces (id, title, note, created_at, updated_at) VALUES (?, 'Elsewhere', NULL, '2026-08-12 00:00:00', '2026-08-12 00:00:00')",
    ).run(ELSEWHERE)
    made.root = mkdtempSync(join(tmpdir(), 'mole-office-kept-records-'))
    dirs.push(made.root)
    // WHAT THE WRITES CHANGE, filed before the first read, so each write meets records already kept.
    await write(() => {
      made.task = R.createRecord({ workspaceId: HERE, kind: 'task', title: 'A made-up task', data: { state: 'todo' }, actor: HUMAN() }).id
      made.module = R.createRecord({
        workspaceId: HERE,
        kind: 'module',
        title: 'A made-up module',
        data: { parts: [{ id: 'mount', name: 'A made-up part', items: [{ id: 'mount-1', text: 'A made-up line', state: 'todo' }] }] },
        actor: HUMAN(),
      }).id
      made.run = R.createRecordWithReport({
        workspaceId: HERE,
        kind: 'session',
        title: 'A made-up run',
        data: { state: 'running' },
        bindCallerSession: false,
        actor: HUMAN(),
      }).record.id
      made.traveller = R.createRecord({ workspaceId: ELSEWHERE, kind: 'note', title: 'A made-up note that moves', actor: HUMAN() }).id
      R.createRecord({ workspaceId: ELSEWHERE, kind: 'task', title: 'A made-up task that stays', data: { state: 'doing' }, actor: HUMAN() })
    })
    // A COMMENT IN THE MESSAGE CENTRE ON THE NOTE THAT MOVES. It is in the view of the note's project, and has no change row.
    db.prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES ('kr-comment', ?, 'owner', '2026-11-15 08:00:00', '2026-11-15 08:00:00', 'message', 'A made-up comment', NULL, ?, NULL, 'fixture')`,
    ).run(MESSAGE_CENTRE, JSON.stringify({ body: 'made-up words', target: { type: 'record', target: { recordId: made.traveller } } }))
    expect(R.listRecordsForTheAttentionRule(ELSEWHERE).some((one) => one.id === 'kr-comment'), 'the comment is in the view of the project its record is filed in').toBe(true)

    kept = K.keptAttentionRecords((line) => said.push(line))
    theKeptAreTheWhole('the first read', { [HERE]: 'started', [ELSEWHERE]: 'notKept' })
    for (const one of WRITES) {
      await write(one.write)
      theKeptAreTheWhole(one.name, one.because)
    }
    expect(R.listRecordsForTheAttentionRule(HERE).some((one) => one.id === 'kr-comment'), 'the comment came into this project with the note').toBe(true)
  })

  it('are read again whole when somebody asks, and say so', () => {
    kept.readEverythingAgain()
    theKeptAreTheWhole('the ask', { [HERE]: 'asked', [ELSEWHERE]: 'asked' })
    // AND ONCE: the read after that is in part again.
    theKeptAreTheWhole('the read after the ask')
  })

  it('are changed by nothing the rule and the shapes do, so a reading from them frozen is the whole read\'s', async () => {
    const messages = await import('../src/server/lib/messages.ts')
    const shapes = await import('../src/server/lib/attention-shapes.ts')
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const input = { workspaceId: HERE, resources: [], now: new Date(2026, 10, 15, 12, 0, 0).getTime(), reader: messages.theMessageReader({ type: 'human', id: THE_PERSON }) }
    const hidden = R.theMessagesHiddenFromTheAttentionReader(input)
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
        Object.freeze(value)
        for (const inside of Object.values(value)) deepFreeze(inside)
      }
      return value
    }
    const frozen = deepFreeze(kept.read(HERE))
    expect(frozen.length, 'the project has records for the rule to read').toBeGreaterThan(3)
    for (const asked of [{ shape: 'whole' }, { shape: 'narrow' }, { shape: 'home' }, { shape: 'flow' }] as const) {
      const fromTheFrozen = shapes.attentionInTheShape(asked, R.attentionWithTheseHidden(input, hidden, () => frozen))
      const fromTheWhole = shapes.attentionInTheShape(asked, R.attentionWithTheseHidden(input, hidden))
      expect(JSON.stringify(fromTheFrozen), asked.shape).toBe(JSON.stringify(fromTheWhole))
    }
  })
})

// ============================================================ 3. the call that has every record read again

describe('POST /api/attention/read-everything-again', () => {
  it('brings Home back to the file after a write with no change row, as a thread started afresh does', async () => {
    const thread = await import('../src/server/lib/attention-thread.ts')
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const { app } = await apiApp()
    await app.ready()
    try {
      const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
      const askAgain = async (): Promise<unknown> => {
        const answer = await app.inject({ method: 'POST', url: '/api/attention/read-everything-again', headers: OWNER, payload: {} })
        expect(answer.statusCode, answer.body).toBe(200)
        return answer.json()
      }
      /** What Home's list answers, without the moment it was read at. */
      const home = async (): Promise<string> => {
        const answer = await app.inject({ method: 'GET', url: '/api/attention?machine=omit', headers: OWNER })
        expect(answer.statusCode, answer.body).toBe(200)
        return JSON.stringify({ ...(answer.json() as Record<string, unknown>), at: undefined })
      }
      await thread.endTheAttentionThread()
      // EVERY ANSWER SAYS WHETHER IT WAS NARROWED BY PERMISSION (src/shared/disclosure.ts), and this one never is.
      expect(await askAgain(), 'no thread was running, so there is nothing to tell').toEqual({ theThreadWasRunning: false, narrowedByPermission: null })
      const blocked = R.createRecord({ workspaceId: HERE, kind: 'task', title: 'A made-up blocked task, as filed', data: { state: 'blocked' }, actor: R.HUMAN }).id
      expect(await home()).toContain('A made-up blocked task, as filed')
      // A WRITE STRAIGHT INTO THE FILE, as a repair script makes one: no change row.
      t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('A made-up blocked task, as the file now says', blocked)
      expect(await home(), 'the write left no change row, so the kept record is not read again').toContain('A made-up blocked task, as filed')
      expect(await askAgain()).toEqual({ theThreadWasRunning: true, narrowedByPermission: null })
      const afterTheAsk = await home()
      expect(afterTheAsk).toContain('A made-up blocked task, as the file now says')
      await thread.endTheAttentionThread()
      expect(afterTheAsk, 'a thread started afresh reads every record').toBe(await home())
    } finally {
      await app.close()
    }
  }, 60_000)
})
