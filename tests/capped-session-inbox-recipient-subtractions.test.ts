// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { checkSubtraction } from '../src/shared/disclosure.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type Recipients = typeof import('../src/server/lib/recipients.ts')
type Sessions = typeof import('../src/server/lib/sessions.ts')
type Inbox = typeof import('../src/server/lib/inbox.ts')
type Schema = typeof import('../src/server/db/schema.ts')

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const WORKSPACE = 'default'

let t: TestDb
let recipients: Recipients
let sessions: Sessions
let inbox: Inbox
let schema: Schema

/** The rows this case files, taken away at its end so a whole-workspace reading sees only the case. */
const madeRecordIds: string[] = []
const madeAgentIds: string[] = []
const madeThreadIds: string[] = []

beforeAll(async () => {
  t = await freshDb()
  recipients = await import('../src/server/lib/recipients.ts')
  sessions = await import('../src/server/lib/sessions.ts')
  inbox = await import('../src/server/lib/inbox.ts')
  schema = await import('../src/server/db/schema.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

afterEach(() => {
  const marks = (count: number): string => Array.from({ length: count }, () => '?').join(', ')
  if (madeThreadIds.length > 0) {
    const which = `(${marks(madeThreadIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM agent_messages WHERE thread_id IN ${which}`).run(...madeThreadIds)
    t.client.sqlite.prepare(`DELETE FROM agent_threads WHERE id IN ${which}`).run(...madeThreadIds)
  }
  // THE FIVE THOUSAND COPIES THIS FILE MAKES ARE NAMED APART, and the other change rows are the case's own records'.
  t.client.sqlite.prepare("DELETE FROM changes WHERE id LIKE 'test-copy-%'").run()
  if (madeRecordIds.length > 0) {
    const which = `(${marks(madeRecordIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM changes WHERE record_id IN ${which}`).run(...madeRecordIds)
    t.client.sqlite.prepare(`DELETE FROM revisions WHERE record_id IN ${which}`).run(...madeRecordIds)
  }
  if (madeAgentIds.length > 0) {
    const which = `(${marks(madeAgentIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM agent_records WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM handle_holds WHERE agent_id IN ${which}`).run(...madeAgentIds)
    t.client.sqlite.prepare(`DELETE FROM agents WHERE id IN ${which}`).run(...madeAgentIds)
  }
  if (madeRecordIds.length > 0) {
    const which = `(${marks(madeRecordIds.length)})`
    t.client.sqlite.prepare(`DELETE FROM links WHERE from_id IN ${which} OR to_id IN ${which}`).run(...madeRecordIds, ...madeRecordIds)
    t.client.sqlite.prepare(`DELETE FROM records WHERE id IN ${which}`).run(...madeRecordIds)
  }
  madeRecordIds.length = 0
  madeAgentIds.length = 0
  madeThreadIds.length = 0
})

function handFiledSession(title: string) {
  const made = t.api.createRecord({
    kind: 'session',
    title,
    summary: `why ${title} was started`,
    data: { state: 'idle', runtime: 'claude-code' },
    workspaceId: WORKSPACE,
    actor: HUMAN,
  })
  madeRecordIds.push(made.id)
  return made
}

/** One report filed in the case, taken away at its end. */
function aReport(title: string, actor: { type: 'agent'; id: string; sessionId: string }): string {
  const made = t.api.createRecord({ kind: 'report', title, data: {}, workspaceId: WORKSPACE, actor })
  madeRecordIds.push(made.id)
  return made.id
}

describe('capped reads carry their checked subtractions', () => {
  it('recipientsFor names each recent run it cuts and declares no omissions when it carries all', () => {
    const older = handFiledSession('older run')
    const newer = handFiledSession('newer run')
    t.client.sqlite.prepare('update records set updated_at = ? where id = ?').run('2026-01-01 00:00:00', older.id)
    t.client.sqlite.prepare('update records set updated_at = ? where id = ?').run('2026-01-02 00:00:00', newer.id)

    const cut = recipients.recipientsFor(null, WORKSPACE, 1)
    checkSubtraction('test recipientsFor', cut.subtraction, cut.leftOutGroups)
    expect(cut.subtraction).toEqual({ candidates: 2, carried: 1, leftOut: 1, shortened: 0 })
    expect(cut.leftOutGroups).toEqual([{
      cause: 'budget',
      bucket: 'recent_limit',
      count: 1,
      ids: [older.id],
    }])
    expect(cut.recentLeftOut).toBe(1)

    const complete = recipients.recipientsFor(null, WORKSPACE, 2)
    checkSubtraction('test recipientsFor empty', complete.subtraction, complete.leftOutGroups)
    expect(complete.subtraction).toEqual({ candidates: 2, carried: 2, leftOut: 0, shortened: 0 })
    expect(complete.leftOutGroups).toEqual([{
      cause: 'budget',
      bucket: 'recent_limit',
      count: 0,
      ids: [],
    }])
    expect(complete.recentLeftOut).toBe(0)
  })

  it('sessionWork names every change row beyond its requested limit and declares no omissions when it carries all', () => {
    const session = handFiledSession('the session being read')
    const asRun = { type: 'agent', id: 'claude-code', sessionId: session.id } as const
    aReport('first report', asRun)
    aReport('second report', asRun)

    const cut = sessions.sessionWork(session.id, WORKSPACE, 1)
    const everyChangeId = t.api.listChanges({ workspaceId: WORKSPACE, session: [session.id], limit: 5000 }).map((row) => row.id)
    const actuallyOmitted = everyChangeId.filter((id) => !cut.changes.some((change) => change.id === id))
    checkSubtraction('test sessionWork', cut.subtraction, cut.leftOutGroups)
    expect(cut.subtraction).toEqual({ candidates: 2, carried: 1, leftOut: 1, shortened: 0, atLeast: false })
    expect(cut.leftOutGroups).toHaveLength(1)
    expect(cut.leftOutGroups[0]).toMatchObject({ cause: 'budget', bucket: 'change_limit', count: 1 })
    expect(cut.leftOutGroups[0]?.ids).toEqual(actuallyOmitted)

    const complete = sessions.sessionWork(session.id, WORKSPACE, 10)
    checkSubtraction('test sessionWork empty', complete.subtraction, complete.leftOutGroups)
    expect(complete.subtraction).toEqual({ candidates: 2, carried: 2, leftOut: 0, shortened: 0, atLeast: false })
    expect(complete.leftOutGroups).toEqual([{
      cause: 'budget',
      bucket: 'change_limit',
      count: 0,
      ids: [],
    }])
  })

  // AT THE SCAN LIMIT THE COUNTS ARE A LOWER BOUND, and the counts say so themselves, not only the note (check
  // FwwgzHBjpErx): sessionWork reads at most 5,000 change rows, so a session with more cannot say how many it has.
  it('sessionWork says its counts are a lower bound when it stops at its scan limit', () => {
    const session = handFiledSession('the session with more rows than one read looks at')
    const asRun = { type: 'agent', id: 'claude-code', sessionId: session.id } as const
    aReport('the one report', asRun)
    const one = t.api.listChanges({ workspaceId: WORKSPACE, session: [session.id], limit: 1 })[0]
    expect(one, 'the session wrote no change row').toBeDefined()
    // COPY THAT ROW 5,001 TIMES UNDER NEW IDS, through the table's own column list, so the session has more rows than the
    // scan reads.
    const columns = (t.client.sqlite.prepare('PRAGMA table_info(changes)').all() as { name: string }[]).map((c) => c.name)
    // `append_order` IS UNIQUE (the change log's append order), so each copy takes the next number after the largest.
    const others = columns.filter((c) => c !== 'id' && c !== 'append_order')
    const ordered = columns.includes('append_order')
    const top = ordered ? Number((t.client.sqlite.prepare('SELECT max(append_order) AS n FROM changes').get() as { n: number }).n) : 0
    const copy = t.client.sqlite.prepare(
      `INSERT INTO changes (id, ${ordered ? 'append_order, ' : ''}${others.join(', ')}) SELECT ?, ${ordered ? '?, ' : ''}${others.join(', ')} FROM changes WHERE id = ?`,
    )
    t.client.sqlite.transaction(() => {
      for (let n = 0; n < 5001; n += 1) {
        if (ordered) copy.run(`test-copy-${String(n)}`, top + n + 1, one!.id)
        else copy.run(`test-copy-${String(n)}`, one!.id)
      }
    })()

    const read = sessions.sessionWork(session.id, WORKSPACE, 10)
    checkSubtraction('test sessionWork at its scan limit', read.subtraction, read.leftOutGroups)
    expect(read.subtraction.candidates, 'the read looked at no more than its limit').toBe(5000)
    expect(read.subtraction.atLeast, 'counts cut off by the scan limit say they are a lower bound').toBe(true)
  })

  it('inboxOf names every message beyond its limit and declares no omissions when it carries all', () => {
    const agent = t.api.createRecord({
      kind: 'agent',
      title: 'the inbox recipient',
      data: { handle: 'inbox-reader', state: 'active' },
      workspaceId: WORKSPACE,
      actor: HUMAN,
    })
    madeRecordIds.push(agent.id)
    const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('inbox-reader') as { id: string }
    madeAgentIds.push(row.id)
    const threadId = 'thread-for-capped-inbox'
    madeThreadIds.push(threadId)
    t.client.db.insert(schema.agentThreads).values({
      id: threadId,
      workspaceId: WORKSPACE,
      title: 'three messages',
      mode: 'direct',
      state: 'open',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    }).run()
    for (let n = 0; n < 3; n += 1) {
      const id = `message-${String(n)}`
      const time = `2026-01-01 00:00:0${String(n)}`
      t.client.db.insert(schema.agentMessages).values({
        id,
        threadId,
        position: n + 1,
        role: 'human',
        intent: 'ask',
        body: `message ${String(n)}`,
        state: 'sent',
        recipientKind: 'session',
        recipientAgentId: agent.id,
        sentAt: time,
        createdAt: time,
        createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      }).run()
    }
    const identity = { id: agent.id, handle: 'inbox-reader', resolvedThrough: null } as never

    const cut = inbox.inboxOf(identity, WORKSPACE, { states: ['sent'], limit: 2 })
    checkSubtraction('test inboxOf', cut.subtraction, cut.leftOutGroups)
    expect(cut.subtraction).toEqual({ candidates: 3, carried: 2, leftOut: 1, shortened: 0 })
    expect(cut.leftOutGroups).toEqual([{
      cause: 'budget',
      bucket: 'message_limit',
      count: 1,
      ids: ['message-2'],
    }])
    expect(cut.leftOut).toBe(1)

    const complete = inbox.inboxOf(identity, WORKSPACE, { states: ['sent'], limit: 3 })
    checkSubtraction('test inboxOf empty', complete.subtraction, complete.leftOutGroups)
    expect(complete.subtraction).toEqual({ candidates: 3, carried: 3, leftOut: 0, shortened: 0 })
    expect(complete.leftOutGroups).toEqual([{
      cause: 'budget',
      bucket: 'message_limit',
      count: 0,
      ids: [],
    }])
  })
})
