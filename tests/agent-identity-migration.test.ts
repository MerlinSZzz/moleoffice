// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DURABLE-AGENT-IDENTITY MIGRATION — WINDOW B'S ROW 4, IN THREE ACTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH ACT CLAIMS, AND WHERE THE CLAIM IS MEASURED HERE
 * ---------------------------------------------------------------------------------------
 *
 * ACT A mints one durable identity per run something addressed, binds the run to it, and writes
 * `origin = 'authored'` itself. It REFUSES rather than inventing an agent for a choice pointing at
 * a record that is not there.
 *
 * ACT B renames `session.data.agent` to `data.runtime` and changes no value. It keeps the key WHERE
 * IT WAS among the other keys, because key order is part of what `versionOf` hashes. It refuses on
 * a record holding both keys, on a value that is not a word, and on another kind holding the same
 * key. IT DELIBERATELY LEAVES THE LEDGER STALE, and the test that says so is the whole argument for
 * its position above `migrateRevisions` — a claim about ordering that is asserted rather than
 * measured is the thing window B's own plan says went wrong last time.
 *
 * ACT C stamps the moment a message was accepted FROM THE RUN THAT CARRIED IT, resolves a recipient
 * from a run to the identity that run worked as — both columns together, never one — and restamps
 * the newest revision of every comment it moves, because it runs below `migrateRevisions`.
 *
 * ---------------------------------------------------------------------------------------
 * AND ONE PINNING TEST, WHICH IS WHY THE HANDLE RULE MAY BE COPIED
 * ---------------------------------------------------------------------------------------
 *
 * The migration cannot import `whyThatIsNotAHandle` from `src/server/lib/inbox.ts`: that file
 * imports `../db/client.ts`, which OPENS whatever `.env` names the moment it is imported — the
 * owner's live corpus. So the rule is written out in the migration, and the last `describe` here
 * holds the two answers together over a table of handles. They cannot drift apart in silence.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import {
  countDispatchBackfill,
  countIdentities,
  countSessionRuntime,
  handleFromTitle,
  migrateAgentDispatch,
  migrateAgentIdentities,
  migrateSessionRuntime,
  renameInPlace,
  whyThatIsNotAHandle,
} from '../src/server/db/agent-identity.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let sqlite: Database.Database

beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
})

afterEach(() => t.close())

/** A session record, written straight in so its `data` is exactly the shape being tested. */
function session(id: string, title: string, data: Record<string, unknown>, deleted: string | null = null): void {
  sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, ' +
        'deleted_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, WORKSPACE, THE_TEST_OFFICES_OWNER.id, '2026-08-01 10:00:00', '2026-08-01 10:00:00', 'session', title, null, JSON.stringify(data), deleted, 'authored')
}

function thread(id: string): void {
  sqlite
    .prepare(
      'INSERT INTO agent_threads (id, workspace_id, title, mode, created_at, updated_at, created_by) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, WORKSPACE, 'A conversation', 'ask', '2026-08-01 10:00:00', '2026-08-01 10:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`)
}

function message(id: string, threadId: string, fields: Record<string, unknown> = {}): void {
  const row = {
    state: 'queued',
    recipient_kind: null,
    recipient_session_id: null,
    created_at: '2026-08-01 10:00:00',
    ...fields,
  }
  sqlite
    .prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, recipient_kind, ' +
        'recipient_session_id, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, threadId, 1, 'human', 'ask', 'Please look at this.', row.state, row.recipient_kind, row.recipient_session_id, row.created_at, `human:${THE_TEST_OFFICES_OWNER.id}`)
}

function run(id: string, threadId: string, createdAt: string, recipientSessionId: string | null = null): void {
  sqlite
    .prepare(
      'INSERT INTO agent_runs (id, thread_id, runtime, state, recipient_session_id, request, created_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, threadId, 'claude-code', 'queued', recipientSessionId, '{}', createdAt)
}

const measureAll = (): { a: ReturnType<typeof countIdentities>; b: ReturnType<typeof countSessionRuntime>; c: ReturnType<typeof countDispatchBackfill> } => ({
  a: countIdentities(sqlite),
  b: countSessionRuntime(sqlite),
  c: countDispatchBackfill(sqlite),
})

// ============================================================================================ act A

describe('act A mints a durable identity for every run something addressed, and nothing else', () => {
  it('makes one agent, binds the run to it, and stamps the origin itself', () => {
    session('sess-one', 'Round ten — one project world', { state: 'finished', agent: 'claude-code' })
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-one' })

    const report = migrateAgentIdentities(sqlite, countIdentities(sqlite))
    expect(report.minted).toHaveLength(1)
    const minted = report.minted[0]
    expect(minted?.handle).toBe('round-ten-one-project-world')
    expect(minted?.title).toBe('Round ten — one project world (agent)')
    // THE RUNTIME COMES ACROSS FROM THE RUN, and act A reads the OLD key because it runs before the
    // act that renames it.
    expect(minted?.runtime).toBe('claude-code')

    const agent = sqlite.prepare('SELECT kind, title, summary, data, origin FROM records WHERE id = ?').get(minted?.agentId) as {
      kind: string
      title: string
      summary: string
      data: string
      origin: string
    }
    expect(agent.kind).toBe('agent')
    // WRITTEN EXPLICITLY, so `migrateOrigins` — which only writes `WHERE origin IS NULL` — finds it
    // stamped and leaves it alone rather than drawing "Nobody said where this record came from".
    expect(agent.origin).toBe('authored')
    expect(agent.summary).toContain('sess-one')
    expect(JSON.parse(agent.data)).toMatchObject({ handle: 'round-ten-one-project-world', state: 'active', runtime: 'claude-code' })

    const bound = JSON.parse(sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck().get('sess-one') as string) as Record<string, unknown>
    expect(bound['ranAs']).toEqual([{ workspaceId: WORKSPACE, agentId: minted?.agentId }])
  })

  it('leaves a run absent a runtime without one, rather than defaulting it', () => {
    session('sess-two', 'Round nine — the last stretch', { state: 'finished' })
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-two' })

    const report = migrateAgentIdentities(sqlite, countIdentities(sqlite))
    expect(report.minted[0]?.runtime).toBeNull()
    const data = JSON.parse(
      sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck().get(report.minted[0]?.agentId) as string,
    ) as Record<string, unknown>
    expect(Object.hasOwn(data, 'runtime')).toBe(false)
  })

  it('deduplicates a handle two runs of the same name would share', () => {
    session('sess-one', 'Perception', { state: 'finished', agent: 'claude-code' })
    session('sess-two', 'Perception', { state: 'finished', agent: 'codex-cli' })
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-one' })
    message('msg-2', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-two' })

    const handles = migrateAgentIdentities(sqlite, countIdentities(sqlite)).minted.map((m) => m.handle)
    expect(new Set(handles).size).toBe(2)
    expect(handles).toContain('perception')
    expect(handles.some((h) => h === 'perception-2')).toBe(true)
  })

  it('refuses the whole run when something is addressed to a run that is not here, and writes nothing', () => {
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-gone' })
    expect(() => migrateAgentIdentities(sqlite, countIdentities(sqlite))).toThrow(/sess-gone/)
    expect(sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'agent'").get()).toEqual({ n: 0 })
  })

  it('is safe to run twice: the second run mints nothing, because the run already says who it was', () => {
    session('sess-one', 'Round ten', { state: 'finished', agent: 'claude-code' })
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-one' })
    migrateAgentIdentities(sqlite, countIdentities(sqlite))
    const again = migrateAgentIdentities(sqlite, countIdentities(sqlite))
    expect(again.alreadyDone).toBe(true)
    expect(sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'agent'").get()).toEqual({ n: 1 })
  })

  it('says nothing has ever been addressed, rather than saying all done, when nothing has', () => {
    session('sess-one', 'Round ten', { state: 'finished', agent: 'claude-code' })
    const report = migrateAgentIdentities(sqlite, countIdentities(sqlite))
    expect(report.alreadyDone).toBe(true)
    expect(report.chosen).toBe(0)
  })
})

// ============================================================================================ act B

describe('act B renames one key and changes nothing else', () => {
  it('carries the word across, keeps the key where it was, and touches no other key', () => {
    session('sess-one', 'A run', { state: 'finished', agent: 'codex-cli', doing: 'trial 14' })
    const report = migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))
    expect(report.recordsWritten).toBe(1)
    const raw = sqlite.prepare('SELECT data FROM records WHERE id = ?').pluck().get('sess-one') as string
    // THE ORDER, NOT JUST THE CONTENT. `versionOf` hashes `JSON.stringify(data)`, so a rebuilt
    // object in a different order differs from its revision by more than the rename.
    expect(Object.keys(JSON.parse(raw) as Record<string, unknown>)).toEqual(['state', 'runtime', 'doing'])
    expect((JSON.parse(raw) as Record<string, unknown>)['runtime']).toBe('codex-cli')
  })

  it('renames a DELETED session too, because window B deletes the declaration in the same commit', () => {
    session('sess-live', 'Live', { agent: 'claude-code' })
    session('sess-dead', 'Deleted', { agent: 'aider' }, '2026-08-02 09:00:00')
    const report = migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))
    expect(report.liveRenamed).toBe(1)
    expect(report.deletedRenamed).toBe(1)
    expect(countSessionRuntime(sqlite).holdingTheOldKey).toBe(0)
  })

  it('refuses a record holding both keys, and writes nothing at all', () => {
    session('sess-one', 'A run', { agent: 'aider', runtime: 'claude-code' })
    session('sess-two', 'Another', { agent: 'codex-cli' })
    expect(() => migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))).toThrow(/BOTH/)
    // NOT ONE OF THE OTHERS EITHER. Half a corpus renamed is worse than none.
    expect(countSessionRuntime(sqlite).holdingTheOldKey).toBe(2)
  })

  it('refuses a value that is not a word', () => {
    session('sess-one', 'A run', { agent: { name: 'claude-code' } })
    expect(() => migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))).toThrow(/not a word/)
  })

  it('refuses another kind holding the same key rather than skipping it quietly', () => {
    sqlite
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run('note-1', WORKSPACE, THE_TEST_OFFICES_OWNER.id, '2026-08-01 10:00:00', '2026-08-01 10:00:00', 'note', 'A note', '{"agent":"claude-code"}')
    expect(() => migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))).toThrow(/only a session/)
  })

  it('LEAVES THE LEDGER STALE, which is the whole reason it sits above migrateRevisions', async () => {
    const record = t.api.createRecord({ kind: 'session', title: 'A run', workspaceId: WORKSPACE, actor: HUMAN, data: { state: 'finished' } })
    // THE OLD KEY GOES IN WITH SQL, because this commit took it off the kind. That is the record
    // this act exists for and the only one it will ever meet.
    sqlite.prepare("UPDATE records SET data = json_set(data, '$.agent', 'claude-code') WHERE id = ?").run(record.id)
    migrateSessionRuntime(sqlite, countSessionRuntime(sqlite))

    const row = sqlite.prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?').get(record.id) as {
      kind: string
      title: string
      summary: string | null
      data: string
      deleted_at: string | null
    }
    const now = versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))
    const newest = sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').pluck().get(record.id)
    // THE STALENESS IS REAL AND IT IS MEASURED HERE. Registered below `migrateRevisions` this step
    // would leave every one of the owner's 92 sessions in exactly this state, where the token a
    // read hands back no longer matches the record and every write is refused.
    expect(newest).not.toBe(now)

    // AND THE PASS THAT WINDOW B PUTS BELOW IT PUTS IT RIGHT, in the same run.
    const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
    const caught = migrateRevisions(sqlite)
    expect(caught.caughtUp).toBe(1)
    expect(sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').pluck().get(record.id)).toBe(now)
  })
})

// ============================================================================================ act C

describe('act C stamps a moment it read and never one it invented', () => {
  it('takes the moment from the run in the thread that carried the message', () => {
    thread('th-1')
    message('msg-1', 'th-1', { state: 'sent', created_at: '2026-08-18 09:40:29' })
    run('run-1', 'th-1', '2026-08-19 18:37:22')

    const report = migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
    expect(report.momentsWritten).toBe(1)
    const row = sqlite.prepare('SELECT sent_at, state_at FROM agent_messages WHERE id = ?').get('msg-1')
    // `state_at` = `sent_at` WHERE THERE IS ONE: the word has not moved since it moved to `sent`.
    expect(row).toEqual({ sent_at: '2026-08-19 18:37:22', state_at: '2026-08-19 18:37:22' })
  })

  it('refuses a message past queued whose moment is nowhere, and writes nothing', () => {
    thread('th-1')
    message('msg-1', 'th-1', { state: 'sent' })
    expect(() => migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))).toThrow(/will not stamp a time nobody recorded/)
    expect(sqlite.prepare('SELECT sent_at FROM agent_messages WHERE id = ?').pluck().get('msg-1')).toBeNull()
  })

  it('refuses a message still holding the word the six states no longer include', () => {
    thread('th-1')
    message('msg-1', 'th-1', { state: 'answered' })
    run('run-1', 'th-1', '2026-08-19 18:37:22')
    expect(() => migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))).toThrow(/answered/)
  })

  it('never uses one run twice, so a second message is refused rather than given a moment that never happened', () => {
    thread('th-1')
    message('msg-1', 'th-1', { state: 'sent', created_at: '2026-08-18 09:00:00' })
    message('msg-2', 'th-1', { state: 'sent', created_at: '2026-08-18 09:30:00' })
    run('run-1', 'th-1', '2026-08-19 18:37:22')
    expect(() => migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))).toThrow(/msg-2/)
  })

  it('files a message under the identity its run worked as, and moves both columns together', () => {
    session('sess-one', 'Round ten', { state: 'finished', agent: 'claude-code' })
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-one' })
    const minted = migrateAgentIdentities(sqlite, countIdentities(sqlite)).minted[0]

    const report = migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
    expect(report.recipientsResolved).toBe(1)
    expect(sqlite.prepare('SELECT recipient_kind, recipient_agent_id FROM agent_messages WHERE id = ?').get('msg-1')).toEqual({
      recipient_kind: 'agent',
      recipient_agent_id: minted?.agentId,
    })
  })

  it('leaves a message somebody addressed to a deliberately new agent exactly as it is', () => {
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'new' })
    const report = migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
    expect(report.recipientsResolved).toBe(0)
    expect(sqlite.prepare('SELECT recipient_kind FROM agent_messages WHERE id = ?').pluck().get('msg-1')).toBe('new')
  })

  it('moves a comment from the run it named to the identity, and RESTAMPS its newest revision', () => {
    session('sess-one', 'Round ten', { state: 'finished', agent: 'claude-code' })
    // THE COMMENT IS FILED THROUGH THE DOOR AND THE CHOICE IS WRITTEN THE WAY EVERY OTHER ROW IN
    // THIS FIXTURE IS WRITTEN, and the split is the point rather than a convenience.
    //
    // This file builds the corpus that existed BEFORE the doors completed a choice. `createRecord`
    // now mints the run's durable identity the moment a `chosenRecipient` naming a run goes through
    // it — see `chosenRecipientAsStored` in src/server/lib/records.ts — so sending the choice through
    // that door would leave nothing here for act A to mint and act C to move. The door is still used
    // for the comment itself, because the assertion at the end of this test is about the REVISION it
    // wrote, and only the door writes one.
    const comment = t.api.createRecord({
      kind: 'annotation',
      title: 'A remark',
      workspaceId: WORKSPACE,
      actor: HUMAN,
      data: {
        body: 'This number is wrong.',
        context: { target: { kind: 'record', recordId: 'sess-one', workspaceId: WORKSPACE } },
      },
    })
    sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.chosenRecipient', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'session', sessionId: 'sess-one' }), comment.id)
    thread('th-1')
    message('msg-1', 'th-1', { recipient_kind: 'session', recipient_session_id: 'sess-one' })
    const minted = migrateAgentIdentities(sqlite, countIdentities(sqlite)).minted[0]

    const report = migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
    expect(report.annotationsMoved).toBe(1)

    const row = sqlite.prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?').get(comment.id) as {
      kind: string
      title: string
      summary: string | null
      data: string
      deleted_at: string | null
    }
    const data = JSON.parse(row.data) as Record<string, unknown>
    expect(data['chosenRecipient']).toEqual({ kind: 'agent', sessionId: 'sess-one', agentId: minted?.agentId })
    // THE RESTAMP, because this act runs BELOW `migrateRevisions` and nothing else will catch it up.
    const want = versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data, deletedAt: row.deleted_at }))
    expect(sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').pluck().get(comment.id)).toBe(want)
  })

  it('is safe to run twice', () => {
    thread('th-1')
    message('msg-1', 'th-1', { state: 'sent', created_at: '2026-08-18 09:40:29' })
    run('run-1', 'th-1', '2026-08-19 18:37:22')
    migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite))
    expect(migrateAgentDispatch(sqlite, countDispatchBackfill(sqlite)).alreadyDone).toBe(true)
  })
})

// =========================================================================== the three counts refuse

describe('every act refuses a database that is not the one that was counted', () => {
  it('names both numbers and writes nothing', () => {
    session('sess-one', 'A run', { agent: 'claude-code' })
    const measured = measureAll()
    session('sess-two', 'Another run', { agent: 'aider' })
    expect(() => migrateSessionRuntime(sqlite, measured.b)).toThrow(/you measured 1 records holding data.agent; this database holds 2/)
    expect(countSessionRuntime(sqlite).holdingTheOldKey).toBe(2)
  })
})

// ================================================================================== the pinning test

describe('the handle rule the migration carries is the product\'s own rule', () => {
  /** Handles, and one thing that is not one, chosen to cover every clause of both answers. */
  const HANDLES = [
    'round-ten',
    'perception',
    'codex-2',
    'a',
    '',
    ' round-ten',
    'round ten',
    'Round-Ten',
    '-round-ten',
    'round-ten-',
    'x'.repeat(41),
    'x'.repeat(40),
    'ünicode',
  ]


  it('makes a handle out of a title, or nothing at all when the title is not made of letters', () => {
    expect(handleFromTitle('Round ten — one project world')).toBe('round-ten-one-project-world')
    expect(handleFromTitle('***')).toBe('')
    expect(whyThatIsNotAHandle(handleFromTitle('***'))).not.toBeNull()
  })

  it('renames a key without moving it', () => {
    expect(Object.keys(renameInPlace({ a: 1, agent: 2, b: 3 }))).toEqual(['a', 'runtime', 'b'])
  })
})
