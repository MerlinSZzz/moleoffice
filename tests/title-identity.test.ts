// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TITLE IS PRESENTATION. AN ID IS IDENTITY. TITLES MAY REPEAT.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE PINS CHANGED ON 17 AUGUST 2026, AND THE OWNER CHANGED IT
 * ---------------------------------------------------------------------------------------
 *
 * This file used to pin the opposite rule. Its old header said "the database still refuses a
 * repeated title — `records_title_idx` is UNIQUE(workspace_id, title) and IT STAYS", and one of its
 * tests asserted that filing a second record with a title another record already held came back a
 * 400. That test has been REWRITTEN rather than deleted, and this paragraph is why.
 *
 * The owner met the old rule by deleting a line of a plan, writing the line again, and being
 * refused because work with that title already existed. The work holding the name was work the owner
 * had just deleted, because the unique index covered deleted rows and Mole Office never really
 * deletes anything. The rule that followed:
 *
 *     An id is identity and a title is presentation. Titles may repeat. A record with the same
 *     title may be worth showing as an existing object to link to, but equal titles must not make
 *     Mole Office assume identity or forbid a genuinely distinct record.
 *
 * `design/ROUND-SEVEN-OWNER-MESSAGE.md` section 4 holds it, and `design/ROUND-SEVEN.md` section A4
 * holds the order the change had to be made in.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER, WHICH IS THE WHOLE DANGER
 * ---------------------------------------------------------------------------------------
 *
 * FIRST every place that turns a title into a record was made to refuse ambiguity by name; THEN the
 * unique index was dropped, in `drizzle/0030_titles_may_repeat.sql`. Reversed, the same day's work
 * turns about ten visible refusals into silently wrong links, because every one of those lookups
 * used to end in SQLite's first row with no signal that there had been a choice.
 *
 * So this file is in two halves. The first half is about a title that names MORE THAN ONE record:
 * every resolver refuses and names every candidate. The second half is about the refusals that went
 * away: filing, moving and restoring no longer care that a name is taken, and say what else holds
 * it instead.
 *
 * ---------------------------------------------------------------------------------------
 * THE AMBIGUITY IS MADE THROUGH THE PRODUCT NOW
 * ---------------------------------------------------------------------------------------
 *
 * It used to be built by dropping the index inside the throwaway database and writing the second
 * row with raw SQL, because the product refused to make one. It no longer refuses, so the state
 * under test is reached the way a person reaches it: two creates. Raw SQL is used for one thing
 * only — setting `created_at`, so a test that lists candidates oldest first does not pass or fail
 * on how fast it ran.
 *
 * Nothing here touches the real database. The file gets one office of its own from `freshDb`, and each
 * test files its records into a project of its own, so a title it holds is only its own.
 */

import { afterAll, beforeAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTheFirstOfficeInAHook, apiApp, expectPanelError, freshDb, one, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import type { AMessageReader } from '../src/server/lib/messages.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

type SessionsLib = typeof import('../src/server/lib/sessions.ts')
type SourceIndexLib = typeof import('../src/server/lib/sourceindex.ts')

let t: TestDb
let app: FastifyInstance
/** Each case files its records in a project of its own, so a title it holds is only its own. */
let here = 'default'
let caseNumber = 0
const madeDirs: string[] = []

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  here = `title-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: here, title: `Title case ${String(caseNumber)}` } })
  expect(made.statusCode, made.body).toBe(201)
})

afterEach(() => {
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** A throwaway directory with one source file in it, so the index has something to scan. */
function oneFileTree(): string {
  // `realpathSync` because a claim is matched against the scanned root as text, and on a machine
  // where /tmp is a symlink the two spellings would never meet.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-title-')))
  madeDirs.push(dir)
  writeFileSync(join(dir, 'grip.ts'), 'export const grip = 1\n')
  return dir
}

/**
 * Two records, one title, both filed through the product.
 *
 * The stamps are passed in because every refusal lists its candidates oldest first, and a test that
 * let the clock decide the order would be a test of how fast the machine is.
 */
function twoRecordsWithOneTitle(
  first: { kind: 'note' | 'task' | 'module' | 'session'; title: string; at: string },
  second: { kind: 'note' | 'task' | 'module' | 'session'; at: string },
): { first: string; second: string } {
  const stamp = (id: string, at: string): void => {
    t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(at, id)
  }
  const one_ = t.api.createRecord({ workspaceId: here, kind: first.kind, title: first.title, actor: t.api.HUMAN })
  stamp(one_.id, first.at)
  const two = t.api.createRecord({ workspaceId: here, kind: second.kind, title: first.title, actor: t.api.HUMAN })
  stamp(two.id, second.at)
  return { first: one_.id, second: two.id }
}

// ============================================================ the primitive

describe('the one lookup a title goes through', () => {
  it('hands back every record with that title, oldest first', () => {
    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'task', at: '2026-08-02 09:00:00' },
    )
    const found = t.api.recordsByTitle('Tray clamp', here)
    expect(found.map((record) => record.id)).toEqual([made.first, made.second])
  })

  it('hands back nothing for a title nobody holds, and one for a title one record holds', () => {
    t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    expect(t.api.recordsByTitle('Tray clamp', here)).toHaveLength(1)
    expect(t.api.recordsByTitle('Grippr', here)).toEqual([])
    // A title resolves inside ONE project. This one is not searched for in another.
    expect(t.api.recordsByTitle('Tray clamp', 'panelx')).toEqual([])
  })

  it('refuses to choose one, and the refusal names every candidate id', () => {
    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'task', at: '2026-08-02 09:00:00' },
    )
    const err = expectPanelError(t, () => t.api.getRecordByTitle('Tray clamp', here), 409)
    expect(err.message).toContain(made.first)
    expect(err.message).toContain(made.second)
    // What tells the two apart, since the titles cannot: the kind, and when each was filed.
    expect(err.message).toContain('a module')
    expect(err.message).toContain('a task')
    expect(err.message).toContain('2026-08-01 09:00:00')
    expect(err.message).toContain('by its id')
  })

  it('still hands back the one record when a title names one record', () => {
    const made = t.api.createRecord({
      workspaceId: here,
      kind: 'module',
      title: 'Tray clamp',
      actor: t.api.HUMAN,
    })
    expect(t.api.getRecordByTitle('Tray clamp', here)?.id).toBe(made.id)
    expect(t.api.getRecordByTitle('Grippr', here)).toBeNull()
  })

  it('says which of the matches a typed name can mean: the live ones', () => {
    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'task', at: '2026-08-02 09:00:00' },
    )
    t.api.deleteRecord(made.second, t.api.HUMAN)
    const all = t.api.recordsByTitle('Tray clamp', here)
    expect(all).toHaveLength(2)
    expect(t.api.liveMatches(all).map((record) => record.id)).toEqual([made.first])
  })
})

// ============================================================ linking by typing a name

describe('a link by name', () => {
  it('refuses when the name means more than one LIVE record, and spells out both requests', () => {
    const from = t.api.createRecord({
      workspaceId: here,
      kind: 'task',
      title: 'Print the mount',
      actor: t.api.HUMAN,
    })
    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'module', at: '2026-08-02 09:00:00' },
    )

    const err = expectPanelError(
      t,
      () => t.api.linkByTitle(from.id, 'Tray clamp', 'relates_to', t.api.HUMAN, here),
      409,
    )
    expect(err.message).toContain(made.first)
    expect(err.message).toContain(made.second)
    // The way out is the caller's own request with an id in it, once per candidate.
    expect(err.message).toContain(`"toId":"${made.first}"`)
    expect(err.message).toContain(`"toId":"${made.second}"`)
    // And nothing was written.
    expect(t.api.resolveLinks(from.id)).toEqual([])
  })

  it('links to the one LIVE record when the others of that name are deleted', () => {
    // THE OWNER'S OWN SEQUENCE, moved to linking. Delete something, write it again under the same
    // name, then point at the name. Judging ambiguity over every row — which is what this did while
    // titles were unique and one row was all a title could match — would refuse this for ever.
    const from = t.api.createRecord({
      workspaceId: here,
      kind: 'task',
      title: 'Print the mount',
      actor: t.api.HUMAN,
    })
    const gone = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    t.api.deleteRecord(gone.id, t.api.HUMAN)
    const now = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })

    const link = t.api.linkByTitle(from.id, 'Tray clamp', 'relates_to', t.api.HUMAN, here)

    // The record the name really meant comes back with the link, so nothing has to resolve it twice.
    expect(link.to.id).toBe(now.id)
    expect(one(t.api.resolveLinks(from.id), 'the link just made').other.id).toBe(now.id)
  })

  it('still says nothing goes by an unknown name, and still names every deleted record', () => {
    const from = t.api.createRecord({
      workspaceId: here,
      kind: 'task',
      title: 'Print the mount',
      actor: t.api.HUMAN,
    })
    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'module', at: '2026-08-02 09:00:00' },
    )

    const unknown = expectPanelError(
      t,
      () => t.api.linkByTitle(from.id, 'Grippr', 'relates_to', t.api.HUMAN, here),
      404,
    )
    expect(unknown.message).toContain('Grippr')

    t.api.deleteRecord(made.first, t.api.HUMAN)
    t.api.deleteRecord(made.second, t.api.HUMAN)
    const deleted = expectPanelError(
      t,
      () => t.api.linkByTitle(from.id, 'Tray clamp', 'relates_to', t.api.HUMAN, here),
      409,
    )
    expect(deleted.message).toContain('was deleted on')
    // BOTH of them, because a name may now be held by several deleted records and telling the
    // reader to restore one of them is telling them to restore a record they may not mean.
    expect(deleted.message).toContain(made.first)
    expect(deleted.message).toContain(made.second)
  })
})

// ============================================================ which session wrote this

describe('a session reference that names more than one session', () => {
  function twoSessionsCalled(title: string): { first: string; second: string } {
    return twoRecordsWithOneTitle(
      { kind: 'session', title, at: '2026-08-01 09:00:00' },
      { kind: 'session', at: '2026-08-02 09:00:00' },
    )
  }

  it('resolves to neither of them, and says which they are', () => {
    const made = twoSessionsCalled('baseline')
    const ref = t.api.resolveSessionRef('baseline', here)
    // Not 'unresolved': something does answer to this, and too much of it. The two are fixed
    // differently, so they are two words.
    expect(ref.matchedBy).toBe('ambiguous')
    expect(ref.recordId).toBeNull()
    expect(ref.why).toContain(made.first)
    expect(ref.why).toContain(made.second)
    expect(ref.why).toContain('x-mole-office-session')
  })

  it('stops resolving the moment a second LIVE session takes the title', () => {
    // The answer used to be remembered for the life of the process. A remembered answer is one
    // that was true when it was worked out, and this is the one that can stop being true.
    const first = t.api.createRecord({
      workspaceId: here,
      kind: 'session',
      title: 'baseline',
      data: { state: 'running' },
      actor: t.api.HUMAN,
    })
    expect(t.api.resolveSessionRef('baseline', here).recordId).toBe(first.id)

    t.api.createRecord({
      workspaceId: here,
      kind: 'session',
      title: 'baseline',
      data: { state: 'running' },
      actor: t.api.HUMAN,
    })

    const ref = t.api.resolveSessionRef('baseline', here)
    expect(ref.matchedBy).toBe('ambiguous')
    expect(ref.recordId).toBeNull()
  })

  it('goes on resolving when the other session of that name has been deleted', () => {
    // Deleting a session record and filing a new run under the same name is ordinary. Judging the
    // ambiguity over deleted rows too would stop attributing the LIVE run's work because of a
    // record nobody is using.
    const gone = twoSessionsCalled('baseline')
    t.api.deleteRecord(gone.second, t.api.HUMAN)

    const ref = t.api.resolveSessionRef('baseline', here)
    expect(ref.matchedBy).toBe('title')
    expect(ref.recordId).toBe(gone.first)
  })

  it('does not remember the refusal either', () => {
    const made = twoSessionsCalled('baseline')
    expect(t.api.resolveSessionRef('baseline', here).matchedBy).toBe('ambiguous')
    // One of them is renamed, so the name means one session again. A refusal that had been
    // remembered would go on refusing.
    t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('baseline two', made.second)
    const ref = t.api.resolveSessionRef('baseline', here)
    expect(ref.matchedBy).toBe('title')
    expect(ref.recordId).toBe(made.first)
  })

  it('files nothing under a guess: a write made under the ambiguous name keeps the name', () => {
    twoSessionsCalled('baseline')
    const made = t.api.createRecord({
      workspaceId: here,
      kind: 'note',
      title: 'a finding',
      data: { body: 'x' },
      actor: { type: 'agent', id: 'claude-code', sessionId: 'baseline' },
    })
    const stored = t.client.sqlite
      .prepare('SELECT session_id FROM changes WHERE record_id = ?')
      .all(made.id) as { session_id: string | null }[]
    expect(stored.map((row) => row.session_id)).toEqual(['baseline'])
  })
})

// ============================================================ the same thing over HTTP

describe('POST /api/links with a name instead of an id', () => {
  it('names the record the name really meant, and refuses when the name means two', async () => {
    const from = t.api.createRecord({ workspaceId: here, kind: 'task', title: 'Print the mount', actor: t.api.HUMAN })
    const gone = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    t.api.deleteRecord(gone.id, t.api.HUMAN)
    const now = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })

    const made = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'x-mole-office-workspace': here, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { fromId: from.id, toTitle: 'Tray clamp' },
    })
    expect(made.statusCode, made.body).toBe(201)
    // BY ID, not by title. The titles are identical, so a reply that echoed the name back would
    // confirm nothing — this is the only place the belief that the name meant this record is
    // checked, and the id is the whole of the check.
    expect(JSON.parse(made.body).to.id).toBe(now.id)

    // A second LIVE record of that name, and the same request is refused with both ids in it.
    const second = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const refused = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: { 'x-mole-office-workspace': here, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
      payload: { fromId: from.id, toTitle: 'Tray clamp' },
    })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(JSON.parse(refused.body).error).toContain(now.id)
    expect(JSON.parse(refused.body).error).toContain(second.id)
    // And nothing was written by the refusal: the one link from before is all there is.
    expect(t.api.resolveLinks(from.id)).toHaveLength(1)
  })
})

describe('POST /api/links with a name two live records share', () => {
  // THE REFUSAL ENDS WITH THE READY REQUEST, ONE PER RECORD. Round 7 of wave 13j looked the far end up
  // a second time in the door, with an empty sentence-builder, to refuse a message the caller may not
  // read; for a shared name that lookup threw first, and the refusal ended "Name the one you mean by
  // its id —  Or " with nothing after it. The far end is looked up once now, in `linkByTitle`.
  //
  // MUTATION: put the door's own lookup back, `liveRecordByTitle(body.toTitle, () => '', workspaceId)`,
  // before `linkByTitle` in src/server/api/links.ts. The refusal loses both requests, and this is red.
  for (const who of [
    { name: 'the owner', headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id } },
    { name: 'an agent', headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'lathe-hand' } },
  ]) {
    it(`gives ${who.name} the request that names each by its id`, async () => {
      const from = t.api.createRecord({ workspaceId: here, kind: 'task', title: 'Face the stock', actor: t.api.HUMAN })
      const first = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Chuck key', actor: t.api.HUMAN })
      const second = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Chuck key', actor: t.api.HUMAN })
      const refused = await app.inject({
        method: 'POST',
        url: '/api/links',
        headers: { ...who.headers, 'x-mole-office-workspace': here },
        payload: { fromId: from.id, toTitle: 'Chuck key', type: 'relates_to' },
      })
      expect(refused.statusCode, refused.body).toBe(409)
      const said = JSON.parse(refused.body).error as string
      const ask = (id: string): string => `POST /api/links {"fromId":"${from.id}","toId":"${id}","type":"relates_to"}.`
      // BOTH REQUESTS, in whichever order the two records come back, and the sentence ends with one.
      const either = [`— ${ask(first.id)} Or ${ask(second.id)}`, `— ${ask(second.id)} Or ${ask(first.id)}`]
      expect(either.some((tail) => said.endsWith(`Name the one you mean by its id ${tail}`)), said).toBe(true)
      expect(t.api.resolveLinks(from.id)).toHaveLength(0)
    })
  }
})

// ============================================================ which module claims these files

describe('a module asked for by name', () => {
  it('refuses when the name means more than one live module, and names both', async () => {
    // `filesFor` takes an id OR a title, so it is a title-to-record resolution like the others and
    // it refuses the same way. It used to ask `getRecordByTitle`, which also hands back DELETED
    // rows — so a module nobody could see answered with the files it once claimed.
    const idx: SourceIndexLib = await import('../src/server/lib/sourceindex.ts')
    idx.rebuildIndex({ workspaceId: here, root: oneFileTree() })

    const made = twoRecordsWithOneTitle(
      { kind: 'module', title: 'Tray clamp', at: '2026-08-01 09:00:00' },
      { kind: 'module', at: '2026-08-02 09:00:00' },
    )

    const err = expectPanelError(t, () => idx.filesFor('Tray clamp', here), 409)
    expect(err.message).toContain(made.first)
    expect(err.message).toContain(made.second)
    expect(err.message).toContain('module=')

    // Delete one and the name means one module again, so it answers instead of refusing.
    t.api.deleteRecord(made.second, t.api.HUMAN)
    expect(idx.filesFor('Tray clamp', here)).toEqual([])
  })
})

// ============================================================ naming a run that was swept up

describe('the title a discovery sweep gives a session', () => {
  it('moves to a longer name rather than refusing when the plain one is taken twice', async () => {
    // It used to ask `getRecordByTitle`, which REFUSES a title that names more than one record.
    // That is the right answer to "which record is this" and the wrong one to "is anything called
    // this", which is all a sweep is asking — so a project holding two records of one name would
    // have thrown a 409 out of a function whose whole job is to pick a different name.
    const sessions: SessionsLib = await import('../src/server/lib/sessions.ts')
    twoRecordsWithOneTitle(
      { kind: 'note', title: 'baseline', at: '2026-08-01 09:00:00' },
      { kind: 'note', at: '2026-08-02 09:00:00' },
    )

    const title = sessions.uniqueTitle('baseline', { tool: 'claude-code', externalId: 'abcdef1234567890' }, here)
    expect(title).toBe('baseline · claude-code abcdef12')
  })

  it('keeps the plain name when nothing else is called that', async () => {
    const sessions: SessionsLib = await import('../src/server/lib/sessions.ts')
    expect(sessions.uniqueTitle('baseline', { tool: 'claude-code', externalId: 'abcdef1234567890' }, here)).toBe(
      'baseline',
    )
  })
})

// ============================================================ what a `blocked_by` string names

describe('a `blocked_by` string that names more than one record', () => {
  // The owner reads every record, so the read rule leaves nothing out of these reports.
  const OWNER: AMessageReader = { readsEveryMessage: true, because: 'the owner', who: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } }

  it('reports the candidates instead of throwing, so the record can still be read', () => {
    // IT USED TO RESOLVE THE NAME WITH `getRecordByTitle`, which refuses ambiguity. That is right
    // for a caller choosing a record and wrong here: this runs on every record read, so one
    // ambiguous string would have turned GET /api/records/:id into a 409 for a readable record.
    const made = twoRecordsWithOneTitle(
      { kind: 'task', title: 'Fit the mount', at: '2026-08-01 09:00:00' },
      { kind: 'task', at: '2026-08-02 09:00:00' },
    )
    const waiting = t.api.createRecord({
      workspaceId: here,
      kind: 'obligation',
      title: 'Run the sweep',
      data: { blocked_by: 'Fit the mount' },
      actor: t.api.HUMAN,
    })

    const report = t.api.blockedByReport(waiting, OWNER)
    expect(report).not.toBeNull()
    expect(report?.blocker).toBeNull()
    expect(report?.candidates?.map((c) => c.id)).toEqual([made.first, made.second])
    expect(report?.note).toContain('will not pick one of them for you')
  })

  it('still names the one blocker when the string means one live record', () => {
    const blocker = t.api.createRecord({
      workspaceId: here,
      kind: 'task',
      title: 'Fit the mount',
      data: { state: 'todo' },
      actor: t.api.HUMAN,
    })
    const waiting = t.api.createRecord({
      workspaceId: here,
      kind: 'obligation',
      title: 'Run the sweep',
      data: { blocked_by: 'Fit the mount' },
      actor: t.api.HUMAN,
    })
    expect(t.api.blockedByReport(waiting, OWNER)?.blocker?.id).toBe(blocker.id)
  })
})

// ============================================================ the refusals that went away

describe('filing a record with a title another record already has', () => {
  it('files it, and says what else is called that', () => {
    // THE OWNER'S DEFECT, in one test. This used to be a 400 reading "A record called X already
    // exists. Titles are unique because typing a title is how you link to something."
    const first = t.api.createRecord({
      workspaceId: here,
      kind: 'module',
      title: 'Close-up camera',
      actor: t.api.HUMAN,
    })
    const second = t.api.createRecordWithReport({
      workspaceId: here,
      kind: 'task',
      title: 'Close-up camera',
      data: { state: 'todo' },
      actor: t.api.HUMAN,
    })

    expect(second.record.id).not.toBe(first.id)
    expect(second.sameTitle?.map((r) => r.id)).toEqual([first.id])
    // What tells them apart is what the report carries: the id, and the kind.
    expect(second.sameTitle?.[0]?.kind).toBe('module')
    // Both are stored. Neither was merged into the other.
    expect(t.api.listRecords({ workspaceId: here }).filter((r) => r.title === 'Close-up camera')).toHaveLength(2)
  })

  it('says nothing when the title is the caller’s own and nobody else holds it', () => {
    const made = t.api.createRecordWithReport({
      workspaceId: here,
      kind: 'module',
      title: 'Close-up camera',
      actor: t.api.HUMAN,
    })
    // Absent rather than empty: a report that says nothing on every ordinary write is how a caller
    // learns to skip the reports that do say something.
    expect(made.sameTitle).toBeUndefined()
  })

  it('offers only LIVE records, because a deleted one is not something to link to', () => {
    // The exact sequence the owner performed: file, delete, file again.
    const gone = t.api.createRecord({
      workspaceId: here,
      kind: 'module',
      title: 'Close-up camera',
      actor: t.api.HUMAN,
    })
    t.api.deleteRecord(gone.id, t.api.HUMAN)
    const again = t.api.createRecordWithReport({
      workspaceId: here,
      kind: 'module',
      title: 'Close-up camera',
      actor: t.api.HUMAN,
    })
    expect(again.sameTitle).toBeUndefined()
  })

  it('compares the title the way it STORES the title, with the spaces taken off', () => {
    // The old clash query read the untrimmed title while the insert stored `title.trim()`, so
    // "Tray clamp " and "Tray clamp" were one record's name and two different answers from the check.
    const first = t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const second = t.api.createRecordWithReport({
      workspaceId: here,
      kind: 'task',
      title: '  Tray clamp  ',
      data: { state: 'todo' },
      actor: t.api.HUMAN,
    })
    expect(second.record.title).toBe('Tray clamp')
    expect(second.sameTitle?.map((r) => r.id)).toEqual([first.id])
  })

  it('lets the same title exist in a different workspace, as it always did', () => {
    t.api.createRecord({ workspaceId: here, kind: 'module', title: 'Tray clamp', actor: t.api.HUMAN })
    const other = t.api.createRecord({
      kind: 'module',
      title: 'Tray clamp',
      workspaceId: 'personal',
      actor: t.api.HUMAN,
    })
    expect(other.workspaceId).toBe('personal')
  })
})

// ============================================================ the one refusal that is left

describe('two live blocks of one pipeline may still not answer to one name', () => {
  function pipeline(title: string): { id: string } {
    return t.api.createRecord({ workspaceId: here, kind: 'pipeline', title, actor: t.api.HUMAN })
  }

  it('refuses a second block of the same name, because a pipeline is read as a list of names', () => {
    const p = pipeline('Transplant v2')
    t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)

    const err = expectPanelError(
      t,
      () => t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN),
      400,
    )
    expect(err.message).toContain(t.api.WHY_A_BLOCK_NAME_MAY_NOT_REPEAT)
    expect(err.message).toContain('"Close and hold"')
  })

  it('lets a block take a name a DELETED record still holds, which it used not to', () => {
    // This is the owner's defect in the one place a repeated title is still refused: the refusal
    // counted deleted rows, so deleting a block and adding it again was refused for ever.
    const p = pipeline('Transplant v2')
    const gone = t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)
    t.blocks.removeBlock(p.id, gone.block.id, t.api.HUMAN)

    const again = t.blocks.addBlock(p.id, { name: 'Close and hold', state: 'todo' }, t.api.HUMAN)
    expect(again.block.title).toBe('Close and hold')
    expect(again.block.id).not.toBe(gone.block.id)
  })

  it('lets two PIPELINES share a name, because a pipeline title is one somebody typed', () => {
    const a = pipeline('Transplant v2')
    pipeline('Handover v3')
    // No block of "Transplant v2" would land on a title anything holds, so there is nothing to refuse.
    t.api.patchRecord(a.id, { title: 'Handover v3' }, t.api.HUMAN)
    expect(t.api.getRecord(a.id)?.title).toBe('Handover v3')
    expect(t.api.recordsByTitle('Handover v3', here)).toHaveLength(2)
  })
})

