// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORD A COMMENT STORED ABOUT WHETHER ITS WORDS HAD GONE OUT, TAKEN OFF THE RECORD — AND THE
 * MARKER FOR THE COMMENTS WHOSE FACT NOTHING ELSE HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * design/round-ten/migrations/annotation-state.ts, in two acts. Act one takes `state` off every
 * comment's `data` and restamps each one's newest revision. Act two writes one
 * `annotation_words_fixed` row for a comment whose own word said its words had gone out and which
 * no message and no earlier marker can account for.
 *
 * On the owner's corpus, measured 26 August 2026 by the migration's own runner with no `--apply`:
 * 7 comments, 7 carrying a word, all `queued`, 0 saying their words went out, 0 markers, 0 messages
 * naming a comment. So act one writes 7 records and 7 revisions there, and act two writes nothing —
 * which is act two's answer and not act two failing. Every case below therefore builds the corpus
 * the owner does not have, because that is the corpus the step has to be right about.
 *
 * ---------------------------------------------------------------------------------------
 * THE CASE THAT MATTERS MOST
 * ---------------------------------------------------------------------------------------
 *
 * A marker fixes a comment's words for ever: `hasGoneOut` answers true from then on, so the owner
 * can no longer edit or delete that comment, and NO ROUTE CAN TAKE THE ROW AWAY. One marker too
 * many silently freezes one of the owner’s comments and every count in every report still looks right. Two
 * cases below are about that alone — the one that says no marker is written for a comment whose
 * word said waiting, and act two's check 2, which compares the whole table against what was planned.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE ONE THAT HOLDS THE PREDICATE TO THE PRODUCT'S
 * ---------------------------------------------------------------------------------------
 *
 * The migration cannot import `hasGoneOut`: `src/server/lib/dispatch.ts` reaches
 * `src/server/db/client.ts`, which opens whatever database `.env` names AT IMPORT — the owner's
 * real corpus. So `goneOutIn` asks the same two questions of the handle the migration was given, and
 * the first case below is what stops the two from drifting apart: every one of the six message
 * words, plus a marker, plus both, plus neither, asked of both functions and compared.
 *
 * A test may import `dispatch.ts` safely because `freshDb()` points `MOLE_OFFICE_DB` at a throwaway file
 * before the import runs.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT REGISTERED AND THIS FILE ASSERTS THAT
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. The
 * last case reads `drizzle/meta/_journal.json` and `src/server/db/migrate.ts` and fails if either
 * has learned about this file. That is the whole of the "not registered" promise, made checkable.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import {
  countAnnotationState,
  countDispatch,
  describeActOne,
  describeActTwo,
  goneOutIn,
  migrateAnnotationStateActOne,
  migrateAnnotationStateActTwo,
  planActOne,
  planActTwo,
  readTheStoredWords,
  THE_GONE_WORDS,
  THE_ONE_SENTENCE,
  whenItWasStamped,
} from '../src/server/db/annotation-state.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let sqlite: Database.Database
let dispatch: typeof import('../src/server/lib/dispatch.ts')
/** Something for the comments to be about. A comment's stored context has to name a real record. */
let subject: string

beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
  dispatch = await import('../src/server/lib/dispatch.ts')
  subject = t.api.createRecord({ kind: 'module', title: 'A module', workspaceId: WORKSPACE, actor: HUMAN }).id
})

afterEach(() => t.close())

/**
 * A comment somebody left on something, with or without the old word on it.
 *
 * Written through the product's own door, and then THE WORD IS PUT IN WITH SQL, because window B's
 * commit deleted `annotation.state` from the kind beside this migration and the door refuses it now.
 * That is exactly the record this migration exists for: one written before the field went, still in
 * the table, still holding a key no kind declares. A fixture that could go through the door would be
 * a fixture this migration would never meet.
 */
function aComment(word: string | null, body = 'The explanation is not necessary'): string {
  const data: Record<string, unknown> = {
    body,
    // A PLACE, because the write path has stored one since wave 5 and window B's regions step
    // backfills every context that has none. Without it this fixture is a corpus that still has
    // window-B work to do, and the preview below would be reporting that rather than the ledger.
    context: { target: { kind: 'record', recordId: subject, workspaceId: WORKSPACE }, place: { at: 'surface' } },
  }
  const id = t.api.createRecord({ kind: 'annotation', title: body, workspaceId: WORKSPACE, data, actor: HUMAN }).id
  if (word !== null) {
    const sqlite = t.client.sqlite as unknown as Database.Database
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', ?) WHERE id = ?").run(word, id)
    // AND INTO THE REVISION, which is where a record written before the field went holds it too, and
    // where `whenItWasStamped` looks when no change row named the write.
    sqlite
      .prepare("UPDATE revisions SET data = json_set(data, '$.state', ?) WHERE record_id = ?")
      .run(word, id)
  }
  return id
}

/**
 * A conversation carrying this comment's words, at the word given.
 *
 * INSERTED RATHER THAN DISPATCHED, and deliberately: what is under test is a READ over the stored
 * row, so the fixture is the stored row. Driving six legal moves through `moveMessageTo` would be a
 * test of `moveMessageTo`. One case below does exactly that instead, so the predicate is also seen
 * flipping on a real product write.
 */
function aMessageCarrying(annotationId: string | null, state: string, workspaceId = WORKSPACE): string {
  const threadId = `th-${Math.random().toString(36).slice(2, 10)}`
  const messageId = `ms-${Math.random().toString(36).slice(2, 10)}`
  sqlite
    .prepare(
      'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(threadId, workspaceId, 'Reading that comment', 'direct', 'open', '2026-08-20 10:00:00', '2026-08-20 10:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
  sqlite
    .prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by, ' +
        'from_annotation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(messageId, threadId, 1, 'human', 'ask', 'the words of that comment', state, '2026-08-20 10:00:01', `human:${THE_TEST_OFFICES_OWNER.id}`, annotationId)
  return messageId
}

/** A change-log row saying somebody stamped this comment's word. */
function stampedInTheChangeLog(recordId: string, word: string, at: string): void {
  sqlite
    .prepare(
      'INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) ' +
        `VALUES (?, ?, ?, 'update', 'human', '${THE_TEST_OFFICES_OWNER.id}', 'data.state', 'queued', ?, ?)`,
    )
    .run(`ch-${Math.random().toString(36).slice(2, 10)}`, recordId, WORKSPACE, word, at)
}

/** What the caller must hand each act, taken from the database it is about to be run against. */
function counted(): { words: ReturnType<typeof countAnnotationState>; dispatch: ReturnType<typeof countDispatch> } {
  return { words: countAnnotationState(sqlite), dispatch: countDispatch(sqlite) }
}

/** Every record and every revision, as one comparable string. */
function ledger(): string {
  const records = sqlite.prepare('SELECT id, title, summary, data, updated_at FROM records ORDER BY id').all()
  const revisions = sqlite.prepare('SELECT id, record_id, seq, content_hash, data, note FROM revisions ORDER BY id').all()
  return JSON.stringify({ records, revisions })
}

function dataOf(id: string): Record<string, unknown> {
  const row = sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck().get(id) as string
  return JSON.parse(row) as Record<string, unknown>
}

function markers(): { annotation_id: string; fixed_at: string; because: string }[] {
  return sqlite.prepare('SELECT annotation_id, fixed_at, because FROM annotation_words_fixed ORDER BY annotation_id').all() as {
    annotation_id: string
    fixed_at: string
    because: string
  }[]
}

// ============================================================ the predicate and the product's gate

describe('the migration reads "have this comment\'s words gone out" exactly as the product does', () => {
  it.each([...dispatchWords()])('agrees with hasGoneOut for a comment whose message reads %s', (word) => {
    const comment = aComment('queued')
    aMessageCarrying(comment, word)
    const mine = goneOutIn(sqlite, comment, WORKSPACE)
    expect(mine.byAMessage || mine.byAMarker, `goneOutIn said the wrong thing about a message reading ${word}`).toBe(
      dispatch.hasGoneOut(comment, WORKSPACE),
    )
  })

  it('agrees with hasGoneOut for a comment nothing carries and nothing marks', () => {
    const comment = aComment('queued')
    const mine = goneOutIn(sqlite, comment, WORKSPACE)
    expect(mine.byAMessage || mine.byAMarker).toBe(false)
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(false)
  })

  it('agrees with hasGoneOut for a comment that has only a marker', () => {
    const comment = aComment(null)
    sqlite
      .prepare('INSERT INTO annotation_words_fixed (annotation_id, fixed_at, because) VALUES (?, ?, ?)')
      .run(comment, '2026-08-20 10:00:00', THE_ONE_SENTENCE)
    const mine = goneOutIn(sqlite, comment, WORKSPACE)
    expect(mine.byAMarker).toBe(true)
    expect(mine.byAMessage || mine.byAMarker).toBe(dispatch.hasGoneOut(comment, WORKSPACE))
  })

  it('agrees with hasGoneOut when a real send moves the message through the one door', () => {
    const comment = aComment('queued')
    const messageId = aMessageCarrying(comment, 'queued')
    expect(goneOutIn(sqlite, comment, WORKSPACE).byAMessage).toBe(false)
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(false)

    dispatch.moveMessageTo(messageId, 'sent')

    expect(goneOutIn(sqlite, comment, WORKSPACE).byAMessage).toBe(true)
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(true)
  })

  it('agrees with hasGoneOut about a conversation in another project, which is not this comment\'s', () => {
    // The write door refuses this (`agents.ts` answers 409 naming both projects), so it is here to
    // hold the two readings together rather than because a corpus can reach it: `hasGoneOut` asks
    // the comment's project of the conversation, and a predicate that skipped that join would answer
    // true where the product answers false.
    const comment = aComment('queued')
    aMessageCarrying(comment, 'sent', 'robotics')
    expect(goneOutIn(sqlite, comment, WORKSPACE).byAMessage).toBe(dispatch.hasGoneOut(comment, WORKSPACE))
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(false)
  })
})

/** The six words a message may read, from the product's own list. */
function dispatchWords(): readonly string[] {
  return ['queued', 'sent', 'delivered', 'picked_up', 'handled', 'failed']
}

// ============================================================ act one

describe('act one takes the word off every comment', () => {
  it('removes only `state` and leaves every other key exactly where it was', () => {
    const comment = aComment('queued')
    const before = dataOf(comment)
    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.recordsWritten).toBe(1)
    expect(report.carriedAWord).toBe(1)
    expect(report.distribution).toEqual({ queued: 1 })
    const after = dataOf(comment)
    expect(after['state']).toBeUndefined()
    expect(after['body']).toEqual(before['body'])
    expect(after['context']).toEqual(before['context'])
    // KEY ORDER TOO, because it is part of the content hash.
    expect(Object.keys(after)).toEqual(Object.keys(before).filter((key) => key !== 'state'))
  })

  it('takes the word off a comment in the wastebasket as well, and says how many', () => {
    const live = aComment('queued')
    const binned = aComment('queued', 'this one was deleted')
    t.api.deleteRecord(binned, HUMAN)

    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.recordsWritten).toBe(2)
    expect(report.deletedOnesWritten).toBe(1)
    expect(dataOf(live)['state']).toBeUndefined()
    // A RESTORED COMMENT STILL CARRYING THE KEY COULD NOT BE PATCHED AT ALL once window B deletes
    // the declaration: the write door validates the merged record and answers 400 unknown key.
    expect(dataOf(binned)['state']).toBeUndefined()
  })

  it('leaves the ledger agreeing with the records, so the boot after it serves', async () => {
    aComment('queued')
    aComment('queued', 'a second comment')
    const migrate = await import('../src/server/db/migrate.ts')

    migrateAnnotationStateActOne(sqlite, counted().words)

    // `caughtUp` counts records whose newest revision no longer hashes to what the record holds.
    // Without the restamp this is 2, `previewMigration` pushes a line nobody can read, and the
    // `npm run dev` at the end of window B refuses to serve.
    const preview = migrate.previewMigration(sqlite)
    expect(preview.outcome.revisions.caughtUp, 'the restamp did not happen').toBe(0)
    expect(preview.wouldWrite).toEqual([])
    expect(migrate.prepareToServe(sqlite).serve).toBe(true)
  })

  it('refuses, and writes nothing, when a comment says its words went out and nothing else holds that fact', () => {
    const comment = aComment('sent')
    const before = ledger()

    expect(() => migrateAnnotationStateActOne(sqlite, counted().words)).toThrow(comment)
    expect(() => migrateAnnotationStateActOne(sqlite, counted().words)).toThrow(/act two/i)
    // NOTHING MOVED. Act one would have deleted the only evidence act two decides from.
    expect(ledger()).toBe(before)
    expect(dataOf(comment)['state']).toBe('sent')
  })

  it.each([...THE_GONE_WORDS])('does not refuse a comment reading %s when a message carries its words', (word) => {
    const comment = aComment(word)
    aMessageCarrying(comment, 'handled')

    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.recordsWritten).toBe(1)
    expect(report.goneAndAMessageSaysSo).toEqual([comment])
    expect(dataOf(comment)['state']).toBeUndefined()
    // AND THE FACT SURVIVED THE REMOVAL, which is the whole point of the refusal above.
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(true)
  })

  it('does not refuse a comment an earlier marker already accounts for', () => {
    const comment = aComment('sent')
    stampedInTheChangeLog(comment, 'sent', '2026-08-20 09:00:00')
    migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.goneAndAMarkerSaysSo).toEqual([comment])
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(true)
  })

  it('refuses a word that is none of the three, names it, and writes nothing', () => {
    // WRITTEN WITH SQL BECAUSE THE DOOR REFUSES IT TODAY — `data.state must be one of: queued, sent,
    // answered`. That union arrived after the field did, so a word outside it can only come from a
    // record written before it or from a hand edit, which is exactly the corpus a migration walks.
    const comment = aComment('queued')
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'wibble') WHERE id = ?").run(comment)
    const before = ledger()

    expect(() => migrateAnnotationStateActOne(sqlite, counted().words)).toThrow(comment)
    expect(() => migrateAnnotationStateActOne(sqlite, counted().words)).toThrow(/wibble/)
    expect(ledger()).toBe(before)
  })

  it('names the comment whose word said waiting while a message says the words went out, and removes the word', () => {
    const comment = aComment('queued')
    aMessageCarrying(comment, 'sent')

    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.theStoreOverrodeTheWord).toHaveLength(1)
    expect(report.theStoreOverrodeTheWord[0]?.recordId).toBe(comment)
    expect(report.theStoreOverrodeTheWord[0]?.word).toBe('queued')
    // IT IS IN THE REPORT A PERSON READS, not only in the object.
    expect(describeActOne(report)).toContain(comment)
    expect(describeActOne(report)).toContain('THE WORD WAS WRONG')
    // AND THE WORD IS STILL REMOVED. The store wins and nothing is lost: the message still says so.
    expect(dataOf(comment)['state']).toBeUndefined()
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(true)
  })

  it('leaves a comment whose data does not parse exactly as it is, and names it', () => {
    const comment = aComment('queued')
    const broken = aComment('queued', 'this one is not JSON')
    sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{not json', broken)

    const report = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(report.recordsWritten).toBe(1)
    expect(dataOf(comment)['state']).toBeUndefined()
    expect(sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck().get(broken)).toBe('{not json')
    expect(report.notes.map((one) => one.recordId)).toContain(broken)
  })

  it('plans nothing on a second run', () => {
    aComment('queued')
    migrateAnnotationStateActOne(sqlite, counted().words)
    const after = ledger()

    const again = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(again.alreadyDone).toBe(true)
    expect(again.recordsWritten).toBe(0)
    expect(again.ledgerRestamped).toBe(0)
    expect(describeActOne(again)).toContain('Nothing to do')
    expect(ledger()).toBe(after)
  })

  it('refuses a corpus it was not counted against, naming both numbers', () => {
    aComment('queued')
    const before = ledger()
    expect(() => migrateAnnotationStateActOne(sqlite, { annotations: 22, carryingAWord: 22, sayingGone: 0 })).toThrow(
      /you measured 22 comments; this database holds 1/,
    )
    expect(ledger()).toBe(before)
  })
})

// ============================================================ act two

describe('act two writes a marker only where nothing else holds the fact', () => {
  it('writes one marker for a comment whose words went out and which no message names', () => {
    const comment = aComment('sent')
    stampedInTheChangeLog(comment, 'sent', '2026-08-20 09:00:00')

    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(report.markersWritten).toBe(1)
    expect(markers()).toEqual([
      { annotation_id: comment, fixed_at: '2026-08-20 09:00:00', because: THE_ONE_SENTENCE },
    ])
    expect(report.markers[0]?.from).toBe('the change log')
    // AND THE PRODUCT'S GATE NOW ANSWERS WHAT THE OLD WORD SAID.
    expect(dispatch.hasGoneOut(comment, WORKSPACE)).toBe(true)
  })

  it('takes the moment from the revision ledger when the change log is silent', () => {
    const comment = aComment('answered')
    // The record's own baseline revision holds the word, which is the second witness the design
    // names. No `changes` row exists — the browser stamped this one at creation.
    expect(whenItWasStamped(sqlite, comment)?.from).toBe('the revision ledger')

    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(report.markersWritten).toBe(1)
    const at = sqlite.prepare('SELECT at FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').pluck().get(comment)
    expect(markers()[0]?.fixed_at).toBe(at)
  })

  it('refuses, and writes nothing, when nothing in this database records when the words went out', () => {
    const comment = aComment('sent')
    // Both witnesses removed: no change-log row, and the ledger no longer holds the word.
    sqlite.prepare("UPDATE revisions SET data = json_remove(data, '$.state') WHERE record_id = ?").run(comment)

    expect(() => migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)).toThrow(comment)
    expect(() => migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)).toThrow(
      /fixed_at/,
    )
    expect(markers()).toEqual([])
  })

  it('writes NO marker for a comment whose word said waiting, however the messages read', () => {
    // THE CASE THAT DECIDES WHICH OF THE OWNER'S COMMENTS CAN STILL BE EDITED. A marker cannot be removed by
    // any route, so one written here would fix the words of a comment nobody had sent.
    const waiting = aComment('queued')
    const alsoWaiting = aComment(null, 'and one with no word at all')
    const plain = aComment('queued', 'nothing carries this one and nothing ever did')
    aMessageCarrying(waiting, 'handled')

    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(markers()).toEqual([])
    expect(report.markersWritten).toBe(0)
    expect(report.theStoreOverrodeTheWord.map((one) => one.recordId)).toEqual([waiting])
    // ALL THREE STAY EDITABLE. `plain` is the one that matters most: its word said waiting, nothing
    // carries it, and a marker would fix its words for ever with no route able to take the row away.
    expect(dispatch.hasGoneOut(plain, WORKSPACE)).toBe(false)
    expect(dispatch.hasGoneOut(alsoWaiting, WORKSPACE)).toBe(false)
  })

  it('writes no marker for a comment a message already accounts for', () => {
    const comment = aComment('sent')
    aMessageCarrying(comment, 'sent')

    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(report.answeredByAMessage).toEqual([comment])
    expect(markers()).toEqual([])
    expect(describeActTwo(report)).toContain('Nothing to do')
  })

  it('writes one marker per comment and no more, and every one reads the same sentence', () => {
    const first = aComment('sent', 'the first')
    const second = aComment('answered', 'the second')
    stampedInTheChangeLog(first, 'sent', '2026-08-20 09:00:00')

    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(report.markersWritten).toBe(2)
    expect(markers().map((one) => one.annotation_id).sort()).toEqual([first, second].sort())
    for (const marker of markers()) expect(marker.because).toBe(THE_ONE_SENTENCE)
  })

  it('names the message that carries no comment rather than dropping it', () => {
    aMessageCarrying(null, 'sent')
    const report = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)
    // The build plan asked for one marker per such message. A marker is keyed on a comment, so there
    // is no row to write; the report says so instead of the plan's sentence being ignored.
    expect(report.notes.some((one) => one.kind === 'a_message_names_nothing')).toBe(true)
  })

  it('plans nothing on a second run', () => {
    const comment = aComment('sent')
    stampedInTheChangeLog(comment, 'sent', '2026-08-20 09:00:00')
    const words = readTheStoredWords(sqlite)
    migrateAnnotationStateActTwo(sqlite, words, counted().dispatch)
    const after = markers()

    const again = migrateAnnotationStateActTwo(sqlite, words, counted().dispatch)

    expect(again.alreadyDone).toBe(true)
    expect(again.markersWritten).toBe(0)
    expect(again.markersAlreadyThere).toBe(1)
    expect(markers()).toEqual(after)
  })

  it('refuses a corpus it was not counted against, naming both numbers', () => {
    const comment = aComment('sent')
    stampedInTheChangeLog(comment, 'sent', '2026-08-20 09:00:00')
    expect(() => migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), { markers: 3, messagesGoneOut: 0 })).toThrow(
      /you measured 3 markers already written; this database holds 0/,
    )
    expect(markers()).toEqual([])
  })
})

// ============================================================ the two acts, in window B's order

describe('the two acts together leave every comment answering what its word said', () => {
  it('runs act two, then act one, and no comment changes what it means', () => {
    const wentOut = aComment('sent', 'this one went out and nothing recorded where')
    const carried = aComment('sent', 'this one went out in a conversation')
    const waiting = aComment('queued', 'this one is still waiting')
    stampedInTheChangeLog(wentOut, 'sent', '2026-08-20 09:00:00')
    aMessageCarrying(carried, 'handled')

    // WHAT THE OLD FIELD SAID, READ BEFORE ANYTHING IS WRITTEN.
    const words = readTheStoredWords(sqlite)
    const saidGone = new Set(words.filter((one) => one.saysGone).map((one) => one.id))

    const two = migrateAnnotationStateActTwo(sqlite, words, counted().dispatch)
    const one = migrateAnnotationStateActOne(sqlite, counted().words)

    expect(two.markersWritten).toBe(1)
    expect(one.recordsWritten).toBe(3)
    expect(countAnnotationState(sqlite).carryingAWord).toBe(0)

    // THE CLOSING ASSERTION FROM THE DESIGN: every comment whose word said its words went out is
    // still answered by the gate that replaces the word, and no other comment has become one.
    for (const one of words) {
      expect(dispatch.hasGoneOut(one.id, one.workspaceId), `${one.id} changed meaning`).toBe(saidGone.has(one.id))
    }
    expect(dispatch.hasGoneOut(waiting, WORKSPACE)).toBe(false)
  })

  it('runs act one, then act two, when the words are carried across as window B must carry them', () => {
    // In window B the two acts are four steps apart and act one deletes act two's input, so whatever
    // runs them reads the words ONCE, before act one, and hands the same list to act two. Act one
    // returns that list as `theWords` for a caller that forgot.
    const carried = aComment('sent')
    aMessageCarrying(carried, 'sent')
    const waiting = aComment('queued')

    const one = migrateAnnotationStateActOne(sqlite, counted().words)
    const two = migrateAnnotationStateActTwo(sqlite, one.theWords, counted().dispatch)

    expect(one.theWords.map((word) => word.id).sort()).toEqual([carried, waiting].sort())
    expect(two.markersWritten).toBe(0)
    expect(two.answeredByAMessage).toEqual([carried])
    expect(dispatch.hasGoneOut(carried, WORKSPACE)).toBe(true)
    expect(dispatch.hasGoneOut(waiting, WORKSPACE)).toBe(false)
  })

  it('act two after act one finds nothing when the words were not carried, which act one\'s refusal makes harmless', () => {
    // The words are not carried across here on purpose. Act one only reaches this state for comments
    // whose fact something else already holds — it refuses for any other — so act two finding nothing
    // is correct rather than a silent loss. The case exists to say that out loud.
    const carried = aComment('sent')
    aMessageCarrying(carried, 'sent')

    migrateAnnotationStateActOne(sqlite, counted().words)
    const two = migrateAnnotationStateActTwo(sqlite, readTheStoredWords(sqlite), counted().dispatch)

    expect(readTheStoredWords(sqlite)).toEqual([])
    expect(two.markersWritten).toBe(0)
    expect(dispatch.hasGoneOut(carried, WORKSPACE)).toBe(true)
  })

  it('the plan a person reads before anything is written says the same as what happens', () => {
    const wentOut = aComment('sent')
    stampedInTheChangeLog(wentOut, 'sent', '2026-08-20 09:00:00')
    const waiting = aComment('queued')

    const words = readTheStoredWords(sqlite)
    const plannedTwo = planActTwo(sqlite, words)
    expect(plannedTwo.markers.map((one) => one.annotationId)).toEqual([wentOut])
    expect(markers(), 'planning wrote something').toEqual([])

    migrateAnnotationStateActTwo(sqlite, words, counted().dispatch)
    const plannedOne = planActOne(sqlite)
    expect(plannedOne.removals.map((one) => one.recordId).sort()).toEqual([wentOut, waiting].sort())
    expect(countAnnotationState(sqlite).carryingAWord, 'planning wrote something').toBe(2)
  })
})

// ============================================================ where it is registered, and where not

