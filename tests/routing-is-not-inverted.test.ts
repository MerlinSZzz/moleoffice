// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENTS CONNECTED TO YOUR WORK ARE THE AGENTS YOU CAN REACH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED BEFORE THIS FILE WAS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * Every agent under "Agents connected to what you pointed at" answered "cannot be picked up", and
 * every agent that could be picked up sat under "Nothing connects these to what you pointed at".
 * Measured on a copy of the owner's corpus on 19 August 2026, across seven records of six kinds:
 * 11 of 11 connected candidates unreachable on every record, 41 of 41 reachable candidates
 * unconnected on every record. 0 of 197 records had a connected agent a message could reach.
 *
 * THE TWO SETS WERE DISJOINT BY CONSTRUCTION, so no change to the ranking could have crossed them.
 * A discovery sweep matched a transcript to a session record by the discovery stamp, which is the
 * field the sweep exists to write. A record that had never been swept carried no stamp, could
 * never be matched, and got a SECOND record filed beside it: one row with the run's whole history
 * and no way back in, one row with a way back in and no history.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THESE TESTS PIN
 * ---------------------------------------------------------------------------------------
 *
 * The first two are the finding and its fix, in the same shape a person meets them: a run that
 * wrote a record is offered as a recipient for that record, and after a sweep it can be picked up.
 * The third is the honest limit — a transcript Mole Office holds no pair for is still filed as a new
 * record, and that record is connected to nothing, which is the half of the defect this pass did
 * not close. It is a measurement, not an approval; `syncSessions` says what closing it would cost.
 *
 * THE MACHINE IS DESCRIBED, NEVER SAMPLED. Every test builds its own home directory holding real
 * transcripts and its own directory of the pairs Mole Office's session hook writes, so nothing here
 * depends on what happens to be on the computer it runs on.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aRealFolderNamed, freshDb, one, theProjectHoldsThisFolder, type TestDb } from './helpers.ts'
import { recipientDisclosureForFixture } from './recipient-answer-disclosure.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import type { PickUp, RecipientCandidate } from '../src/server/lib/recipients.ts'

type Sessions = typeof import('../src/server/lib/sessions.ts')
type Recipients = typeof import('../src/server/lib/recipients.ts')
type Picker = typeof import('../src/web/components/agent/Recipients.tsx')

let t: TestDb
let sessions: Sessions
let recipients: Recipients
let picker: Picker
let scratch: string[] = []
/** The session records this case started with, so the ones it made can be removed afterwards. */
let sessionsAtStart: Set<string>

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const SWEEPER = { type: 'agent', id: 'claude-code' } as const

/** Every "how long ago" here is measured against this moment. */
const NOW = new Date('2026-08-19T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, so the smallest stand-in goes in
  // before the browser component is imported. Nothing here is under test. The same shim is in
  // tests/the-composer-is-short.test.ts, which says the same thing at more length.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  picker = await import('../src/web/components/agent/Recipients.tsx')
  t = await freshDb()
  await theProjectHoldsThisFolder('default', REAL_CWD)
  sessions = await import('../src/server/lib/sessions.ts')
  recipients = await import('../src/server/lib/recipients.ts')
}, 60_000)

/**
 * THE FOLDER THE CONVERSATIONS IN THIS FILE RAN IN: a real one, which the test project holds. Discovery files a
 * conversation into the project that holds its working directory (problem kDKj9iXd4Vft), and a project holds only a
 * folder that exists, so it is registered as a repository root of `default` after each fresh database. Its last name
 * is still test_claude.
 */
const REAL_CWD = aRealFolderNamed('test_claude')
afterAll(() => {
  t.close()
  rmSync(dirname(REAL_CWD), { recursive: true, force: true })
})

beforeEach(() => {
  const rows = t.client.sqlite
    .prepare("SELECT id FROM records WHERE workspace_id = 'default' AND kind = 'session'")
    .all() as { id: string }[]
  sessionsAtStart = new Set(rows.map((row) => row.id))
})

afterEach(() => {
  // A sweep files a session record and two cases count the sessions in the office. Removing the
  // records this case made, deleted ones included, gives the next case the office this one found.
  const rows = t.client.sqlite
    .prepare("SELECT id FROM records WHERE workspace_id = 'default' AND kind = 'session'")
    .all() as { id: string }[]
  for (const row of rows) {
    if (sessionsAtStart.has(row.id)) continue
    t.client.sqlite.prepare('DELETE FROM links WHERE from_id = ? OR to_id = ?').run(row.id, row.id)
    t.client.sqlite.prepare('DELETE FROM revisions WHERE record_id = ?').run(row.id)
    t.client.sqlite.prepare('DELETE FROM records WHERE id = ?').run(row.id)
  }
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
  scratch = []
})

// -------------------------------------------------------------------------------- the machine

function tempDir(what: string): string {
  const dir = mkdtempSync(join(tmpdir(), `mole-office-${what}-`))
  scratch.push(dir)
  return dir
}

/** Claude Code's own layout: one transcript per conversation, under the project it ran in. */
function writeTranscript(home: string, conversationId: string): void {
  const dir = join(home, '.claude', 'projects', `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-test-claude`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, `${conversationId}.jsonl`),
    [
      {
        parentUuid: null,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'carry on with the recipient ranking' },
        timestamp: hoursAgo(3),
        userType: 'external',
        entrypoint: 'cli',
        cwd: REAL_CWD,
        version: '2.1.223',
      },
      {
        type: 'assistant',
        isSidechain: false,
        message: { role: 'assistant', content: [{ type: 'text', text: 'measured it' }] },
        timestamp: hoursAgo(2),
        cwd: REAL_CWD,
      },
    ]
      .map((line) => JSON.stringify(line))
      .join('\n') + '\n',
  )
}

/** What Mole Office's own session hook writes when it files a record for the run it is starting. */
function writeHookNote(notes: string, conversationId: string, recordId: string): void {
  writeFileSync(join(notes, `session-${conversationId}.json`), JSON.stringify({ id: recordId, at: '2026-08-19 09:00' }))
}

function envFor(home: string): AdapterEnv {
  return {
    homeDir: home,
    now: NOW,
    scanProcesses: () => ({ ok: true, processes: [] }),
    runningWithinSeconds: 5 * 60,
    orphanAfterSeconds: 6 * 60 * 60,
  }
}

/** An actor whose writes are attributed to one session record, exactly as a real run's are. */
const asRun = (sessionRecordId: string) => ({ type: 'agent', id: 'claude-code', sessionId: sessionRecordId }) as const

/**
 * A session record filed the way the hook files one — no stamp — and a report it then wrote.
 *
 * The report is what makes the run CONNECTED: the change log says this run created it, which is the
 * strongest rung of the ranking. Without a written record a session is only ever recent.
 */
function aRunThatWroteSomething(title: string): { session: string; report: string } {
  const session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    summary: 'why this run was started',
    data: { state: 'running', runtime: 'claude-code' },
    actor: HUMAN,
  })
  const report = t.api.createRecord({
    workspaceId: 'default',
    kind: 'report',
    title: 'What the sweep did',
    data: {},
    actor: asRun(session.id),
  })
  return { session: session.id, report: report.id }
}

const sessionRecords = () => t.api.listRecords({ workspaceId: 'default', kind: 'session' })

// ================================================================ the finding, and the fix

describe('a sweep writes onto the run Mole Office already has, instead of filing a second one', () => {
  it('makes the connected agent the reachable one — which is the whole of the inverted phase', () => {
    const home = tempDir('home')
    const notes = tempDir('notes')
    const conversation = 'aaaaaaaa-1111-2222-3333-444444444444'
    writeTranscript(home, conversation)
    const { session, report } = aRunThatWroteSomething('the run that wrote the report')
    writeHookNote(notes, conversation, session)

    // BEFORE. The run is connected to the report it filed, and there is no way back into it.
    const before = recipients.recipientsFor({ kind: 'record', id: report }, 'default')
    expect(before.connected.map((c) => c.sessionId)).toEqual([session])
    expect(before.connected[0]?.pickUp.answer).toBe('no')
    expect(before.connected.filter((c) => c.pickUp.answer === 'yes')).toEqual([])

    const swept = sessions.syncSessions(SWEEPER, 'default', envFor(home), notes)

    // The record it already had was written onto. No second record was filed for one run.
    expect(swept.discovered).toBe(1)
    expect(swept.adopted).toBe(1)
    expect(swept.created).toBe(0)
    expect(sessionRecords().map((r) => r.id)).toEqual([session])

    // AFTER. The same agent, on the same rung, and now a message can reach it.
    const after = recipients.recipientsFor({ kind: 'record', id: report }, 'default')
    expect(after.connected.map((c) => c.sessionId)).toEqual([session])
    expect(after.connected[0]?.ground).toBe('filed-this-record')
    expect(after.connected[0]?.pickUp.answer).toBe('yes')
    expect(after.connected[0]?.pickUp).toMatchObject({ runtime: 'claude-code', conversationId: conversation })
  })

  it('leaves the title, the purpose and the history of the record it adopts alone', () => {
    const home = tempDir('home')
    const notes = tempDir('notes')
    const conversation = 'bbbbbbbb-1111-2222-3333-444444444444'
    writeTranscript(home, conversation)
    const { session, report } = aRunThatWroteSomething('a name a person chose')
    writeHookNote(notes, conversation, session)

    sessions.syncSessions(SWEEPER, 'default', envFor(home), notes)

    const after = one(sessionRecords(), 'session record')
    expect(after.title).toBe('a name a person chose')
    expect(after.summary).toBe('why this run was started')
    // The evidence that made it connected is untouched: the report is still filed under this run.
    expect(recipients.recipientsFor({ kind: 'record', id: report }, 'default').connected[0]?.sessionId).toBe(session)
  })

  it('will not let two conversations claim one record, and says it did not', () => {
    const home = tempDir('home')
    const notes = tempDir('notes')
    const first = 'cccccccc-1111-2222-3333-444444444444'
    const second = 'dddddddd-1111-2222-3333-444444444444'
    writeTranscript(home, first)
    writeTranscript(home, second)
    const { session } = aRunThatWroteSomething('one run, two notes pointing at it')
    writeHookNote(notes, first, session)
    writeHookNote(notes, second, session)

    const swept = sessions.syncSessions(SWEEPER, 'default', envFor(home), notes)

    // One record cannot be two conversations. The second is filed as its own run rather than
    // quietly repointing the first, which would tell a worker to resume the wrong transcript.
    expect(swept.adopted).toBe(1)
    expect(swept.created).toBe(1)
    expect(swept.notes.some((line) => line.includes('already names a conversation'))).toBe(true)
  })

  it('adopts nothing when the pair names a record that has been deleted, and says why', () => {
    const home = tempDir('home')
    const notes = tempDir('notes')
    const conversation = 'eeeeeeee-1111-2222-3333-444444444444'
    writeTranscript(home, conversation)
    const { session } = aRunThatWroteSomething('a run somebody deleted')
    writeHookNote(notes, conversation, session)
    t.api.deleteRecord(session, HUMAN)

    const swept = sessions.syncSessions(SWEEPER, 'default', envFor(home), notes)

    expect(swept.adopted).toBe(0)
    expect(swept.created).toBe(1)
    expect(swept.notes.some((line) => line.includes('has been deleted'))).toBe(true)
  })
})

// ================================================================ the half that is not closed

describe('a run Mole Office holds no pair for', () => {
  it('is still filed as a new record, and that record is connected to nothing', () => {
    // NOT AN APPROVAL. This is the measurement behind the decision written up at `syncSessions`:
    // filing a run into whichever project the person was looking at asserts a membership Mole Office
    // cannot evidence, and the row it files has written nothing, so it can never be ranked.
    const home = tempDir('home')
    const notes = tempDir('notes')
    writeTranscript(home, 'ffffffff-1111-2222-3333-444444444444')
    const { report } = aRunThatWroteSomething('the run that wrote the report')

    const swept = sessions.syncSessions(SWEEPER, 'default', envFor(home), notes)
    expect(swept.created).toBe(1)
    expect(swept.adopted).toBe(0)

    const after = recipients.recipientsFor({ kind: 'record', id: report }, 'default')
    const filed = one(
      after.recent.filter((c) => c.pickUp.answer === 'yes'),
      'newly filed run',
    )
    expect(filed.ground).toBeNull()
    expect(after.connected.some((c) => c.sessionId === filed.sessionId)).toBe(false)
  })
})

// ================================================================ a deleted run says so

describe('a deleted run is drawn as one', () => {
  const CAN_BE_PICKED_UP: PickUp = {
    answer: 'yes',
    runtime: 'claude-code',
    conversationId: 'c1',
    transcript: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/x/c1.jsonl`,
    resumeCommand: 'claude --resume c1',
    because: 'Its transcript is on this machine.',
  }

  /** The shape the server really sends for a soft-deleted run: deleted, and still resumable. */
  function deletedCandidate(over: Partial<RecipientCandidate> = {}): RecipientCandidate {
    return {
      sessionId: 's1',
      title: 'Doomed run',
      doing: null,
      purpose: null,
      workspaceId: 'default',
      deleted: true,
      why: 'Nothing Mole Office holds connects this run to what you pointed at.',
      ground: null,
      alsoWhy: [],
      support: 0,
      tiedWith: [],
      pickUp: CAN_BE_PICKED_UP,
      origin: 'authored',
      originNote: null,
      recordedState: null,
      lastSeenAt: '2026-08-19 09:00:00',
      lastSeenFrom: 'record-updated',
      ...over,
    }
  }

  it('says on the row that it is deleted', () => {
    const reading = picker.shortReading(deletedCandidate(), Date.parse('2026-08-19T10:00:00'))
    expect(reading.deleted).toBe('Deleted')

    const drawn = renderToStaticMarkup(
      h(picker.RecipientReading, { candidate: deletedCandidate(), withName: true }),
    )
    expect(drawn).toContain('Deleted')
  })

  it('says nothing about deletion for a run that is still there', () => {
    expect(picker.shortReading(deletedCandidate({ deleted: false })).deleted).toBeNull()
  })

  it('spends the row’s one urgent mark on the deletion rather than on the pick-up answer', () => {
    // The colour contract allows at most one urgent mark per row. A deleted run cannot be reached
    // at all, which is the larger of the two facts, so the pick-up line yields its ink to it.
    const stuck: PickUp = { answer: 'no', why: 'transcript-gone', because: 'The transcript is gone.' }
    const both = picker.shortReading(deletedCandidate({ pickUp: stuck }))
    expect(both.deleted).not.toBeNull()
    expect(both.pickUp?.bad).toBe(false)

    const onlyStuck = picker.shortReading(deletedCandidate({ deleted: false, pickUp: stuck }))
    expect(onlyStuck.pickUp?.bad).toBe(true)
  })

  it('is never the one the composer suggests, even though its conversation is still there', () => {
    const answer = {
      context: {
        asked: { kind: 'record', id: 'r1' } as const,
        record: { id: 'r1', kind: 'report' as const, title: 'x', workspaceId: 'default', deleted: false },
        nothingFiled: null,
        workspaceId: 'default',
        askedForProject: null,
        elsewhere: null,
      },
      connected: [deletedCandidate({ sessionId: 'gone', ground: 'filed-this-record' as const })],
      recent: [],
      recentLeftOut: 0,
      ...recipientDisclosureForFixture(1, 0, 0),
      read: {
        rule: 'r',
        pickUpRule: 'p',
        whenItCannotBePickedUp: 'There are two honest choices and Mole Office offers both.',
        conversationRule: 'A sweep of this machine writes down which conversation a run was.',
        pickUp: { total: 0, stuck: 0, allSameReason: null },
        origins: { fixture: 0, unmarked: 0, authored: 0, deleted: 0 },
        sessions: 1,
        projects: 0,
        links: 0,
        changesOnThis: 1,
        changesOnThisCapped: false,
        changesRead: 1,
        changesCapped: false,
        transcriptsChecked: 1,
        tookMs: 1,
      },
    }
    // It is still the only connected agent, so it is still what is offered — nothing is hidden —
    // and the row it is drawn on now says it is deleted.
    expect(picker.strongestCandidate(answer)?.sessionId).toBe('gone')

    // With a reachable connected agent beside it, that one is what the composer proposes.
    const reachable = deletedCandidate({ sessionId: 'alive', deleted: false, ground: 'wrote-to-this-record' })
    expect(picker.strongestCandidate({ ...answer, connected: [answer.connected[0]!, reachable] })?.sessionId).toBe(
      'alive',
    )

    // THE ORDINARY CASE, and the one measured on the owner's corpus: the strongest reason belongs
    // to a run nobody wrote a conversation down for, and a message to it cannot go anywhere. The
    // suggestion is the strongest connected agent the message could actually reach.
    const stuck: PickUp = {
      answer: 'no',
      why: 'never-observed',
      because: 'Nobody recorded a transcript for this run.',
    }
    const strongestButStuck = deletedCandidate({
      sessionId: 'stuck',
      deleted: false,
      pickUp: stuck,
      ground: 'filed-this-record',
    })
    expect(
      picker.strongestCandidate({ ...answer, connected: [strongestButStuck, reachable] })?.sessionId,
    ).toBe('alive')
    // And when none of them can be reached, the strongest is still offered rather than nothing.
    expect(picker.strongestCandidate({ ...answer, connected: [strongestButStuck] })?.sessionId).toBe('stuck')
  })

  it('says the same thing when the words name one agent and that agent has been deleted', () => {
    // The two routing surfaces used to disagree about one record: this route said the run had been
    // deleted and the ranked list said nothing at all. One sentence, and the row above carries it.
    const { session } = aRunThatWroteSomething('a run somebody deleted')
    t.api.deleteRecord(session, HUMAN)
    const said = recipients.resolveRecipient('deleted', null, 'default')
    expect(said.outcome).toBe('one')
    expect(said.note).toContain(recipients.WHEN_A_RUN_HAS_BEEN_DELETED)
  })
})
