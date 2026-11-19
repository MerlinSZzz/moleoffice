// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READER KEEPS ONE READ POINT IN EACH CONVERSATION, IN EACH PROJECT: THE NEWEST READ.
 *
 * Wave 13s round 64. `conversation_reads` used to keep one row for every time a
 * reader opened a conversation they were not part of, and it grew by about 130,000 rows a day. Every reader of the
 * table asks for the newest of a reader's reads of one conversation and nothing older, so `recordThatSomebodyRead` in
 * src/server/lib/messages.ts now keeps one row per reader and conversation and replaces it with each newer read.
 * Migration 0278 folds the older rows away and adds the unique index that holds the rule; its own test file is
 * tests/migration-0278-a-reader-keeps-only-the-newest-read.test.ts.
 *
 * THE KEY IS THE PROJECT, THE READER'S KIND, THE READER'S ID AND THE CONVERSATION. The project is part of it because
 * a page narrowed to one project asks for the newest read in that project (`whenTheyLastRead` with
 * `justThisProject`). Without the project in the key, a read in a second project would replace the first project's
 * row, and the page narrowed to the first project would say the conversation had never been read there. The
 * decision records keeping it per project as an engineering choice.
 *
 * CRITERION M12 IS STILL MET (design/messages/ACCEPTANCE.md: "Reading writes nothing and is recorded as a read, not
 * as participation"). The newest read is recorded, with who, which side and when, and it is the row every reader
 * reads.
 *
 * THE NEWEST IS THE ONE THE READERS ALREADY PICKED: the latest `at`, and among reads in one second the one written
 * last. A replaced row is deleted and the new read is inserted with an id of its own, so it is written exactly as an
 * insert always wrote it and its rowid is later than every other read's. Both happen in one transaction, so a read
 * that cannot be written leaves the read point it would have replaced.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { ParticipantRef } from '../src/shared/participants.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let pool: typeof import('../src/server/lib/messages.ts')

const PROJECT = 'panelx'
const SECOND_PROJECT = 'a-second-project'
const READER: ParticipantRef = { kind: 'person', id: 'a-reader' }
const SECOND_READER: ParticipantRef = { kind: 'person', id: 'a-second-reader' }
const PAIR = 'agent-a~agent-b'
const SECOND_PAIR = 'agent-a~agent-c'

/** One stored read, with the rowid that says which was written last. */
interface StoredRead {
  rowid: number
  id: string
  workspace_id: string
  reader_kind: string
  reader_id: string
  pair: string
  as_side: string
  at: string
}

/** Every row of `conversation_reads`, in the order they were written. */
function storedReads(): StoredRead[] {
  return t.client.sqlite
    .prepare('SELECT rowid, id, workspace_id, reader_kind, reader_id, pair, as_side, at FROM conversation_reads ORDER BY rowid')
    .all() as StoredRead[]
}

/** The rows as a reader would name them: project, reader, conversation, side and moment. */
function said(rows: StoredRead[]): string[] {
  return rows.map((row) => `${row.workspace_id} ${row.reader_kind}:${row.reader_id} ${row.pair} as ${row.as_side} at ${row.at}`)
}

beforeAll(async () => {
  t = await freshDb()
  pool = await import('../src/server/lib/messages.ts')
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: PROJECT, title: 'Mole Office' })
  createWorkspace({ id: SECOND_PROJECT, title: 'A second project' })
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  // Every case reads the whole table and starts from none, and one case leaves a temporary trigger.
  t.client.sqlite.prepare('DELETE FROM conversation_reads').run()
  t.client.sqlite.prepare('DROP TRIGGER IF EXISTS the_test_refuses_one_side').run()
})

// These tests cite a decision.
describe('a reader keeps one read point per conversation in each project', () => {
  it('leaves one row after two reads of one conversation, and it is the newer read', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-b' }, PROJECT, '2026-10-19 10:05:00')

    expect(said(storedReads())).toEqual([`${PROJECT} person:a-reader ${PAIR} as agent-b at 2026-10-19 10:05:00`])
    expect(pool.whenTheyLastRead(READER, PAIR, pool.justThisProject(PROJECT))).toEqual({
      reader: READER,
      pair: PAIR,
      asSide: 'agent-b',
      at: '2026-10-19 10:05:00',
    })
  })

  it('leaves two rows after reads of two conversations, one for each', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    pool.recordThatSomebodyRead(READER, SECOND_PAIR, { kind: 'agent', id: 'agent-c' }, PROJECT, '2026-10-19 10:05:00')

    expect(said(storedReads())).toEqual([
      `${PROJECT} person:a-reader ${PAIR} as agent-a at 2026-10-19 10:00:00`,
      `${PROJECT} person:a-reader ${SECOND_PAIR} as agent-c at 2026-10-19 10:05:00`,
    ])
  })

  it("leaves another reader's read of the same conversation where it was", () => {
    pool.recordThatSomebodyRead(SECOND_READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 09:00:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-b' }, PROJECT, '2026-10-19 10:05:00')

    expect(said(storedReads())).toEqual([
      `${PROJECT} person:a-second-reader ${PAIR} as agent-a at 2026-10-19 09:00:00`,
      `${PROJECT} person:a-reader ${PAIR} as agent-b at 2026-10-19 10:05:00`,
    ])
  })

  it('keeps one row in each project for one conversation, and a page narrowed to a project reads its own', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-b' }, SECOND_PROJECT, '2026-10-19 10:05:00')

    expect(said(storedReads())).toEqual([
      `${PROJECT} person:a-reader ${PAIR} as agent-a at 2026-10-19 10:00:00`,
      `${SECOND_PROJECT} person:a-reader ${PAIR} as agent-b at 2026-10-19 10:05:00`,
    ])
    expect(pool.whenTheyLastRead(READER, PAIR, pool.justThisProject(PROJECT))?.at).toBe('2026-10-19 10:00:00')
    expect(pool.whenTheyLastRead(READER, PAIR, pool.justThisProject(SECOND_PROJECT))?.at).toBe('2026-10-19 10:05:00')
    expect(pool.whenTheyLastRead(READER, PAIR, pool.EVERY_PROJECT)?.at).toBe('2026-10-19 10:05:00')
  })

  it('keeps the newer read when an older one arrives after it', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-b' }, PROJECT, '2026-10-19 10:05:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')

    expect(said(storedReads())).toEqual([`${PROJECT} person:a-reader ${PAIR} as agent-b at 2026-10-19 10:05:00`])
  })

  it('writes nothing for a second read from the same side in the same second', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    const first = storedReads()
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')

    // The same row, with the same id and rowid: nothing was deleted and nothing was written again.
    expect(storedReads()).toEqual(first)
  })

  it('keeps the read written last when two reads from different sides share one second', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-b' }, PROJECT, '2026-10-19 10:00:00')

    expect(said(storedReads())).toEqual([`${PROJECT} person:a-reader ${PAIR} as agent-b at 2026-10-19 10:00:00`])
    expect(pool.whenTheyLastRead(READER, PAIR, pool.justThisProject(PROJECT))?.asSide).toBe('agent-b')
  })

  it('leaves the read point it would have replaced when the new read cannot be written', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    const before = storedReads()
    // A refusal the database makes for this one side only, so the replacing insert fails after the delete before it.
    t.client.sqlite.exec(
      "CREATE TEMP TRIGGER the_test_refuses_one_side BEFORE INSERT ON conversation_reads WHEN NEW.as_side = 'a-refused-side' " +
        "BEGIN SELECT RAISE(ABORT, 'the test refuses this read'); END",
    )

    expect(() => pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'a-refused-side' }, PROJECT, '2026-10-19 10:05:00')).toThrow(
      'the test refuses this read',
    )
    expect(storedReads()).toEqual(before)
  })

  it('is held by the database: a second row for one project, reader and conversation is refused', () => {
    pool.recordThatSomebodyRead(READER, PAIR, { kind: 'agent', id: 'agent-a' }, PROJECT, '2026-10-19 10:00:00')
    const insert = t.client.sqlite.prepare(
      'INSERT INTO conversation_reads (id, workspace_id, reader_kind, reader_id, pair, as_side, at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )

    expect(() => insert.run('a-second-row', PROJECT, 'person', 'a-reader', PAIR, 'agent-b', '2026-10-19 10:05:00')).toThrow(
      /UNIQUE constraint failed: conversation_reads\.workspace_id, conversation_reads\.reader_kind, conversation_reads\.reader_id, conversation_reads\.pair/,
    )
    // The same reader and conversation in another project is a key of its own.
    insert.run('a-row-in-another-project', SECOND_PROJECT, 'person', 'a-reader', PAIR, 'agent-b', '2026-10-19 10:05:00')
    expect(storedReads()).toHaveLength(2)
  })
})
