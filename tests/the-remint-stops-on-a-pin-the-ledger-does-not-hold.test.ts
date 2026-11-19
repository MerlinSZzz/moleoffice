// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT STOPS ON A PIN THAT NAMES A REVISION THE LEDGER DOES NOT HOLD, AND REPAIRS NONE. Wave 13s round 182, case
 * 8 of section 10.1 of the re-mint plan, its pins part, under the plan's phase 1: the baseline pins are checked and kept
 * as they are, and one that does not hold before the re-mint stops it.
 *
 * A pin names one revision by its seq and its content hash. It holds when the ledger has that seq for the record it
 * names, with that hash. The office stores such a pin in these places, and each is one case here:
 *   - a short form's madeFrom, and the madeFrom of a report's parts, both naming the record that holds them;
 *   - the revision of a stored context: a comment's context, a message's target, lead and each quote, a thread
 *     message's context and each quote it carries, and a review's entry;
 *   - a flow run's flowRevision, naming its flow;
 *   - an emergency push's message, read as the re-mint reads it and not as the judging step does;
 *   - a stable upgrade notice's original, as one of the stable notice pins;
 *   - a main-suite fix's receipt.
 * Pins of module planning (seqs only), of a context bundle export (hashes only) and of a sealed manifest (a hash of a
 * whole row) are not checked here, and neither are the copies of a pin in revisions and changes rows.
 *
 * A throwaway office holds made-up agents, one legacy agent with its handle as its id and one minted agent, and a
 * made-up note for each pin to name, made and then changed, so each pin names a first revision that is not the newest.
 * The pins are written through the product's own writers where a test can reach them: a short form, a comment, two
 * messages, two thread messages, a review. The rest are made-up rows with the shape their writers give them, put in
 * before the migration so the ledger pass gives each its baseline: a report's parts, a quote carried by a thread
 * message, a flow run, an emergency push, a stable upgrade notice and a problem with a main-suite fix. A pin is broken
 * by deleting the first revision of the note it names, or by giving that revision other words and their own hash, so
 * the ledger has no gap and no wrong hash either way. Cases:
 *   1. the fixture contract: every pin holds, each is stored where the cases look for it, the store has no gap and no
 *      wrong hash, and the same is true after each way of breaking a pin, except that pin;
 *   2. thePinsTheLedgerDoesNotHold finds no pin on a clean copy;
 *   3. one case for each place: the first revision of that pin's note is deleted, and the reader finds that one pin;
 *   4. the first revision of the comment's note is given other words, and the reader finds the comment's pin, with the
 *      hash the ledger holds now;
 *   5. --stage-remint on a copy with the push's pin broken exits 1, says the re-mint stops on such a pin, names the
 *      push and its note, writes no file and leaves every row as it was;
 *   6. the same, on a copy with the comment's note given other words;
 *   7. a map staged on a clean copy, applied to the copy with the push's pin broken, exits 1, names the push, and leaves
 *      every row as it was, with the legacy agent's id;
 *   8. the same map, applied to the copy with the comment's note given other words, the same;
 *   9. the same map applied to a clean copy exits 0 and gives the legacy agent a new id, so cases 7 and 8 were stopped by
 *      the pin and nothing else; given the map again after a pin is broken, it exits 0 and files no second generation;
 *  10. a plain db:migrate on a copy with both pins broken exits 0 and repairs neither.
 *
 * Three-run proof, using this whole file each time:
 *   node tools/run-named-tests.mjs tests/the-remint-stops-on-a-pin-the-ledger-does-not-hold.test.ts
 * After a green control, copy src/server/db/remint-migration.ts, then make one of these changes:
 *   1. in stageTheRemint, delete the line that throws when the list of pins is not empty: the map is staged, and cases 5
 *      and 6 go red;
 *   2. in applyTheStagedRemint, delete the line that throws when the list of pins is not empty: the map is applied, and
 *      cases 7 and 8 go red;
 *   3. in applyTheStagedRemint, move the line that throws on pins to just above the check for a map already applied:
 *      the second run of case 9 is refused, and case 9 goes red;
 *   4. in thePinsTheLedgerDoesNotHold, count a pin as held when the ledger has its seq, whatever the hash: cases 4, 6 and
 *      8 go red, and case 7 is still stopped, by the deleted revision;
 *   5. in thePinsARecordHolds, delete the line that reads the short form's madeFrom: the label's case goes red;
 *   6. the same, for the line that reads the parts' madeFrom: the parts' case goes red;
 *   7. the same, for the line that reads a comment's context: the comment's cases go red, and so do cases 4, 6 and 8;
 *   8. the same, for the line that reads a message's target: the target's case goes red;
 *   9. the same, for the line that reads a message's lead: the lead's case goes red;
 *  10. the same, for the line that reads a message's quotes: the quote's case goes red;
 *  11. the same, for the line that reads a flow run's flowRevision: the flow run's case goes red;
 *  12. the same, for the line that looks for pins by a record's id anywhere in the data: the push's, the stable notice's
 *      and the receipt's cases go red, and so do cases 5 and 7;
 *  13. in theRecordPinsIn, take out the pin spelled with recordId: the receipt's case goes red;
 *  14. in thePinsTheLedgerDoesNotHold, delete the line that reads a thread message's context: its case goes red;
 *  15. the same, for the line that reads the quotes a thread message carries: the carried quote's case goes red;
 *  16. the same, for the line that reads a review's entry: the review's case goes red.
 * Restore the file with cp after each change, check it with cmp, and run the command again for green.
 * Every id, name and word here is made up, in a throwaway office. Each command is given only PATH, LANG, a made-up home
 * in the test's own folder and MOLE_OFFICE_DB, so it reads no settings file of anybody's.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MAIN_SUITE_FIX_EXAMPLE } from '../src/shared/main-suite-fix.ts'
import { STABLE_UPGRADE_NOTICE_EVENT, STABLE_UPGRADE_PUBLIC_REASONS } from '../src/shared/stable-upgrade-notices.ts'
import { validateData } from '../src/shared/kinds.ts'
import { contentOf, versionOf } from '../src/server/lib/version.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { MIGRATIONS } from './an-office-one-migration-behind.ts'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const WHEN = '2026-11-01 06:10:00'
const PROJECT = 'default'

// A made-up legacy agent, with its handle as its id, and a minted one.
const STILT = 'legacy-stilt'
const MINTED = { id: 'MintedPin_01', handle: 'minted-pin' }
const HUMAN = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id }

/** A write by `id`, under a key that proved it. */
const by = (id: string) => ({ type: 'agent' as const, id, provedHolder: { id, how: 'an-agent-key' as const, claimed: 'a-made-up-name' } })

function theAgents(s: Database.Database): void {
  s.prepare("INSERT INTO assets (id, kind, origin, mime, created_at) VALUES ('made-up-asset', 'avatar', 'default', 'image/svg+xml', ?)").run(WHEN)
  const anAgent = (id: string, handle: string) =>
    s.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, created_at) VALUES (?, ?, ?, 'made-up-asset', ?)").run(id, `Made-up ${handle}`, handle, WHEN)
  anAgent(STILT, STILT)
  anAgent(MINTED.id, MINTED.handle)
}

/** Every place a pin is stored that this test plants one in. */
const PLACES = [
  'label',
  'parts',
  'comment',
  'message target',
  'message lead',
  'message quote',
  'thread message',
  'carried quote',
  'review',
  'flow run',
  'emergency push',
  'stable notice',
  'main-suite receipt',
] as const
type Place = (typeof PLACES)[number]

/** One planted pin: the row that stores it, where in that row as the reader names it, and the note it names. */
interface APin {
  table: 'records' | 'agent_messages' | 'reviews'
  rowId: string
  path: string
  note: string
}

const one = (s: Database.Database, sql: string, ...args: unknown[]): unknown => s.prepare(sql).pluck().get(...args)

async function plantThePins(test: TestDb): Promise<Record<Place, APin>> {
  const { writeShortForms } = await import('../src/server/lib/zoom.ts')
  const agents = await import('../src/server/lib/agents.ts')
  const reviews = await import('../src/server/lib/reviews.ts')
  const s = test.client.sqlite
  const api = test.api
  /** A made-up note, made and then changed, so its first revision is not its newest. */
  const aNote = (place: Place) => {
    const id = api.createRecord({ workspaceId: PROJECT, kind: 'note', title: `A made-up note the ${place} names`, data: { body: 'Made-up words, first.' }, actor: by(STILT) }).id
    api.patchRecord(id, { data: { body: 'Made-up words, second.' } }, by(STILT))
    return id
  }
  const notes = Object.fromEntries(PLACES.map((place) => [place, aNote(place)])) as Record<Place, string>
  const first = (note: string) => ({ seq: 1, contentHash: one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 1', note) as string })
  const aContext = (note: string) => ({ target: { kind: 'record' as const, recordId: note, workspaceId: PROJECT }, revision: first(note) })
  /** A made-up row of `kind`, with no revision: the ledger pass gives it its baseline. */
  const aRow = (id: string, kind: string, data: Record<string, unknown>) => {
    s.prepare(`INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'fixture')`).run(id, PROJECT, HUMAN.id, WHEN, WHEN, kind, `A made-up ${kind}`, JSON.stringify(data))
    return id
  }

  writeShortForms(notes.label, PROJECT, { madeFrom: first(notes.label), forms: { label: 'Made-up pinned label' } }, by(STILT))
  const withParts = {
    ...(JSON.parse(one(s, 'SELECT data FROM records WHERE id = ?', notes.parts) as string) as Record<string, unknown>),
    shortForms: { parts: { madeFrom: first(notes.parts), writtenBy: 'agent', parts: [{ id: 'p-1', heading: 'Made-up part', text30: 'Made-up words.', text120: 'Made-up words, a little longer.', covers: ['b-1'] }] } },
  }
  s.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(withParts), notes.parts)
  const comment = api.createRecord({ workspaceId: PROJECT, kind: 'annotation', title: 'A made-up remark', data: { body: 'Made-up remark.', context: aContext(notes.comment) }, actor: by(STILT) }).id
  const message = api.createRecord({
    workspaceId: PROJECT,
    kind: 'message',
    title: 'A made-up message',
    data: { body: 'Made-up words, about a note.', target: aContext(notes['message target']), lead: aContext(notes['message lead']) },
    actor: by(STILT),
  }).id
  const quoting = api.createRecord({ workspaceId: PROJECT, kind: 'message', title: 'A made-up quoting message', data: { body: 'Made-up words, quoting.', quotes: [aContext(notes['message quote'])], to: [{ kind: 'person', id: HUMAN.id }] }, actor: by(STILT) }).id

  const thread = agents.createThread({ workspaceId: PROJECT, title: 'A made-up thread', mode: 'review' }, HUMAN)
  const said = agents.addMessage(thread.id, PROJECT, { intent: 'review', body: 'Made-up words, on a note.', context: aContext(notes['thread message']) }, HUMAN).id
  const carrying = agents.addMessage(thread.id, PROJECT, { intent: 'review', body: 'Made-up words, carrying two quotes.' }, HUMAN).id
  const asStored = JSON.parse(one(s, 'SELECT context FROM agent_messages WHERE id = ?', said) as string) as Record<string, unknown>
  const carried = [
    { commentId: comment, quote: { ...asStored, target: aContext(notes['carried quote']).target, revision: first(notes['carried quote']) } },
    { commentId: 'MadeUpCmnt02', quote: { ...asStored, target: aContext(notes['carried quote']).target, revision: undefined } },
  ]
  s.prepare('UPDATE agent_messages SET carries = ? WHERE id = ?').run(JSON.stringify(carried), carrying)
  const review = reviews.startReview({ workspaceId: PROJECT, entry: aContext(notes.review) }, HUMAN).review.id

  const flowRun = aRow('MadeUpFlowRn', 'flow_run', { run: 'MadeUpRun001', stepsTaken: [], flow: notes['flow run'], flowRevision: first(notes['flow run']) })
  const push = aRow('MadeUpPush01', 'emergency_push', {
    state: 'pushing',
    root: '/srv/made-up',
    repository: '/srv/made-up/development',
    commit: 'a'.repeat(40),
    mainBefore: 'b'.repeat(40),
    message: { id: notes['emergency push'], ...first(notes['emergency push']) },
    switch: {},
    by: { kind: 'agent', id: STILT },
    startedAt: WHEN,
  })
  const notice = aRow('MadeUpNotice', 'message', {
    body: 'Made-up words, after an upgrade.',
    extra: {
      [STABLE_UPGRADE_NOTICE_EVENT]: {
        version: 1,
        project: PROJECT,
        date: WHEN,
        request: { stage: 'after', sendId: 'made-up-send', before: { id: notes['stable notice'], ...first(notes['stable notice']) }, outcome: { state: 'refused', reason: STABLE_UPGRADE_PUBLIC_REASONS[0] } },
      },
    },
  })
  const problem = aRow('MadeUpProbl1', 'problem', { mainSuiteFix: { ...MAIN_SUITE_FIX_EXAMPLE, receipt: { recordId: notes['main-suite receipt'], ...first(notes['main-suite receipt']) } } })

  const inRecords = (rowId: string, path: string, place: Place): APin => ({ table: 'records', rowId, path, note: notes[place] })
  return {
    label: inRecords(notes.label, 'data.shortForms.label.madeFrom', 'label'),
    parts: inRecords(notes.parts, 'data.shortForms.parts.madeFrom', 'parts'),
    comment: inRecords(comment, 'data.context.revision', 'comment'),
    'message target': inRecords(message, 'data.target.revision', 'message target'),
    'message lead': inRecords(message, 'data.lead.revision', 'message lead'),
    'message quote': inRecords(quoting, 'data.quotes[0].revision', 'message quote'),
    'thread message': { table: 'agent_messages', rowId: said, path: 'context.revision', note: notes['thread message'] },
    'carried quote': { table: 'agent_messages', rowId: carrying, path: 'carries[0].quote.revision', note: notes['carried quote'] },
    review: { table: 'reviews', rowId: review, path: 'entry.revision', note: notes.review },
    'flow run': inRecords(flowRun, 'data.flowRevision', 'flow run'),
    'emergency push': inRecords(push, 'data.message', 'emergency push'),
    'stable notice': inRecords(notice, `data.extra.${STABLE_UPGRADE_NOTICE_EVENT}.request.before`, 'stable notice'),
    'main-suite receipt': inRecords(problem, 'data.mainSuiteFix.receipt', 'main-suite receipt'),
  }
}

function ran(args: string[], database: string): { status: number | null; stderr: string } {
  const home = join(folder(), 'home')
  mkdirSync(home, { recursive: true })
  const it = spawnSync(process.execPath, ['--import', 'tsx', 'src/server/db/migrate.ts', ...args], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: home, LANG: 'C', MOLE_OFFICE_DB: database },
    encoding: 'utf8',
  })
  if (it.error !== undefined) throw it.error
  return { status: it.status, stderr: it.stderr }
}

/** A handle on a file, as the office opens one. */
function opened(file: string): Database.Database {
  const s = new Database(file)
  s.pragma('journal_mode = WAL')
  s.pragma('foreign_keys = ON')
  return s
}
function readOnly<T>(file: string, read: (s: Database.Database) => T): T {
  const s = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return read(s)
  } finally {
    s.close()
  }
}
function changedByHand(file: string, change: (s: Database.Database) => void): string {
  const s = opened(file)
  try {
    change(s)
  } finally {
    s.close()
  }
  return file
}

let t: TestDb
let pins: Record<Place, APin>
/** A map staged on a clean copy, and what the stage said. */
const clean = { map: '', staged: { status: null as number | null, stderr: '' } }
const folder = () => dirname(t.file)
/** A copy of the migrated office, in the test's own folder. */
function aCopy(name: string): string {
  const file = join(folder(), `${name}.db`)
  t.client.sqlite.prepare('VACUUM INTO ?').run(file)
  return file
}

interface Hashed {
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}
/** The hash of a row's content, as the revision writer works it out. */
const theHashOf = (row: Hashed) => versionOf(contentOf({ kind: row.kind, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown>, deletedAt: row.deleted_at }))
interface ARevision extends Hashed {
  seq: number
  content_hash: string
}
const theRevisionsOf = (s: Database.Database, record: string) => s.prepare('SELECT * FROM revisions WHERE record_id = ? ORDER BY seq').all(record) as ARevision[]

/** The pin's note with its first revision deleted by hand, in `file`. */
const theFirstRevisionDeleted = (file: string, pin: APin) => changedByHand(file, (s) => s.prepare('DELETE FROM revisions WHERE record_id = ? AND seq = 1').run(pin.note))
/** Other words for the first revision of the pin's note, with their own hash, by hand in `file`. */
const OTHER_WORDS = { body: 'Made-up words, put in by hand.' }
function theFirstRevisionRewritten(file: string, pin: APin): string {
  return changedByHand(file, (s) => {
    const row = theRevisionsOf(s, pin.note)[0] as ARevision
    const data = JSON.stringify(OTHER_WORDS)
    s.prepare('UPDATE revisions SET data = ?, content_hash = ? WHERE record_id = ? AND seq = 1').run(data, theHashOf({ ...row, data }), pin.note)
  })
}
/** What the first revision of the pin's note hashes to now, in `file`. */
const theFirstHashNow = (file: string, pin: APin) => readOnly(file, (s) => one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 1', pin.note) as string)

/** The value at `path` in the pin's row: its first step is the column, and the rest is inside that column's JSON. */
function theStoredPin(s: Database.Database, pin: APin): Record<string, unknown> {
  const [column, ...rest] = pin.path.replace(/\[(\d+)\]/gu, '.$1').split('.')
  let value: unknown = JSON.parse(one(s, `SELECT "${column ?? ''}" FROM ${pin.table} WHERE id = ?`, pin.rowId) as string)
  for (const step of rest) value = (value as Record<string, unknown>)[step]
  return value as Record<string, unknown>
}
/** Whether the ledger in `s` has the pin's seq for its note, with its hash. */
const holds = (s: Database.Database, pin: APin) => {
  const stored = theStoredPin(s, pin)
  return one(s, 'SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?', pin.note, stored['seq']) === stored['contentHash']
}

/** Each record of `file` with no revision, or whose newest revision does not hold what it holds. */
function theGaps(file: string): string[] {
  return readOnly(file, (s) => {
    const records = s.prepare('SELECT id, kind, title, summary, data, deleted_at FROM records ORDER BY id').all() as (Hashed & { id: string })[]
    return records.filter((record) => theRevisionsOf(s, record.id).at(-1)?.content_hash !== theHashOf(record)).map((record) => record.id)
  })
}
/** The number of revisions in `file` whose stored hash is not the hash of their content. */
const theWrongHashes = (file: string) =>
  readOnly(file, (s) => (s.prepare('SELECT * FROM revisions').all() as ARevision[]).filter((row) => row.content_hash !== theHashOf(row)).length)

type Row = Record<string, unknown>
const sorted = (rows: Row[]): Row[] => rows.map((row) => [JSON.stringify(row), row] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, row]) => row)
/** Every row of every table of `file`, each table's rows in one order, so two readings can be compared. */
function everyRow(file: string): Record<string, Row[]> {
  return readOnly(file, (s) => {
    const tables = (s.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name").all() as { name: string }[]).map((table) => table.name)
    return Object.fromEntries(tables.map((table) => [table, sorted(s.prepare(`SELECT * FROM "${table}"`).all() as Row[])]))
  })
}
const theIdOfTheLegacyAgent = (file: string) => readOnly(file, (s) => s.prepare('SELECT id FROM agents WHERE handle = ?').pluck().get(STILT) as string)
const theGenerations = (file: string) => readOnly(file, (s) => s.prepare('SELECT count(*) FROM registry_remint_generations').pluck().get() as number)

/** What the re-mint's own reader finds in `file`. */
async function thePinsFound(file: string): Promise<unknown[]> {
  const { thePinsTheLedgerDoesNotHold } = await import('../src/server/db/remint-migration.ts')
  return readOnly(file, (s) => thePinsTheLedgerDoesNotHold(s))
}
/** The one pin the reader should find when `pin` is broken, and the hash its seq holds now, or null. */
const found = (pin: APin, now: string | null) => ({
  table: pin.table,
  rowId: pin.rowId,
  path: pin.path,
  recordId: pin.note,
  seq: 1,
  contentHash: theStoredPin(t.client.sqlite, pin)['contentHash'],
  holds: now,
})

beforeAll(async () => {
  t = await freshDb()
  theAgents(t.client.sqlite)
  pins = await plantThePins(t)
  ;(await import('../src/server/db/migrate.ts')).migrateInPlace(t.client.sqlite, MIGRATIONS)
  clean.map = join(folder(), 'staged-clean.json')
  clean.staged = ran(['--stage-remint', clean.map], aCopy('staged-from'))
}, 120_000)
afterAll(() => t?.close())

describe('the fixture', () => {
  it('holds every pin where the cases look, with no gap and no wrong hash, and breaks only the pin it breaks', () => {
    const cleanCopy = aCopy('contract-clean')
    readOnly(cleanCopy, (s) => {
      for (const place of PLACES) {
        const pin = pins[place]
        expect(theStoredPin(s, pin)['seq'], place).toBe(1)
        expect(holds(s, pin), place).toBe(true)
        expect(theRevisionsOf(s, pin.note).length, place).toBeGreaterThan(1)
      }
      for (const row of s.prepare("SELECT kind, data FROM records WHERE origin = 'fixture'").all() as { kind: string; data: string }[]) {
        expect(validateData(row.kind as never, JSON.parse(row.data)), row.kind).toMatchObject({ ok: true })
      }
    })
    expect(theGaps(cleanCopy)).toEqual([])
    expect(theWrongHashes(cleanCopy)).toBe(0)
    expect(theIdOfTheLegacyAgent(cleanCopy)).toBe(STILT)

    const deleted = theFirstRevisionDeleted(aCopy('contract-deleted'), pins['emergency push'])
    const rewritten = theFirstRevisionRewritten(aCopy('contract-rewritten'), pins.comment)
    for (const [file, broken] of [[deleted, 'emergency push'], [rewritten, 'comment']] as const) {
      expect(theGaps(file), broken).toEqual([])
      expect(theWrongHashes(file), broken).toBe(0)
      readOnly(file, (s) => {
        for (const place of PLACES) expect(holds(s, pins[place]), `${broken}: ${place}`).toBe(place !== broken)
      })
    }
  })
})

describe('thePinsTheLedgerDoesNotHold', () => {
  it('finds no pin on a clean copy', async () => {
    expect(await thePinsFound(aCopy('reader-clean'))).toEqual([])
  })

  for (const place of PLACES) {
    it(`finds the pin of the ${place} when the revision it names is gone`, async () => {
      const pin = pins[place]
      const expected = found(pin, null)
      expect(await thePinsFound(theFirstRevisionDeleted(aCopy(`reader-${place.replace(/ /gu, '-')}`), pin))).toEqual([expected])
    })
  }

  it("finds the comment's pin when the revision it names holds other words, with the hash it holds now", async () => {
    const pin = pins.comment
    const file = theFirstRevisionRewritten(aCopy('reader-rewritten'), pin)
    expect(await thePinsFound(file)).toEqual([found(pin, theFirstHashNow(file, pin))])
  })
})

describe('npm run db:migrate -- --stage-remint <file>', () => {
  async function refusedAtTheStage(name: string, database: string, pin: APin): Promise<void> {
    const { A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    const map = join(folder(), `${name}.json`)
    const before = everyRow(database)

    const staged = ran(['--stage-remint', map], database)
    expect(staged.status, staged.stderr).toBe(1)
    expect(staged.stderr).toContain(A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT)
    expect(staged.stderr).toContain(pin.rowId)
    expect(staged.stderr).toContain(pin.note)
    expect(existsSync(map)).toBe(false)
    expect(everyRow(database)).toEqual(before)
  }

  it("stops on the push's pin to a revision that is gone, names it, writes no file and leaves every row as it was", async () => {
    await refusedAtTheStage('stage-deleted', theFirstRevisionDeleted(aCopy('stage-deleted'), pins['emergency push']), pins['emergency push'])
  })

  it("stops on the comment's pin to a revision that holds other words, names it, writes no file and leaves every row as it was", async () => {
    await refusedAtTheStage('stage-rewritten', theFirstRevisionRewritten(aCopy('stage-rewritten'), pins.comment), pins.comment)
  })
})

describe('npm run db:migrate -- --remint <file>', () => {
  async function refusedAtTheApply(database: string, pin: APin): Promise<void> {
    const { A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT } = await import('../src/server/db/remint-migration.ts')
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const before = everyRow(database)

    const applied = ran(['--remint', clean.map], database)
    expect(applied.status, applied.stderr).toBe(1)
    expect(applied.stderr).toContain(A_PIN_THE_LEDGER_DOES_NOT_HOLD_STOPS_THE_REMINT)
    expect(applied.stderr).toContain(pin.rowId)
    expect(everyRow(database)).toEqual(before)
    expect(theIdOfTheLegacyAgent(database)).toBe(STILT)
  }

  it("stops on the push's pin, broken after the stage, names it, and writes nothing", async () => {
    await refusedAtTheApply(theFirstRevisionDeleted(aCopy('apply-deleted'), pins['emergency push']), pins['emergency push'])
  })

  it("stops on the comment's pin, broken after the stage, names it, and writes nothing", async () => {
    await refusedAtTheApply(theFirstRevisionRewritten(aCopy('apply-rewritten'), pins.comment), pins.comment)
  })

  it('applies the same map to a clean copy, and given it again after a pin is broken, re-mints nothing', () => {
    expect(clean.staged.status, clean.staged.stderr).toBe(0)
    const database = aCopy('apply-clean')

    const first = ran(['--remint', clean.map], database)
    expect(first.status, first.stderr).toBe(0)
    const minted = theIdOfTheLegacyAgent(database)
    expect(minted).not.toBe(STILT)
    expect(theGenerations(database)).toBe(1)

    theFirstRevisionDeleted(database, pins['emergency push'])
    const again = ran(['--remint', clean.map], database)
    expect(again.status, again.stderr).toBe(0)
    expect(theGenerations(database)).toBe(1)
    expect(theIdOfTheLegacyAgent(database)).toBe(minted)
  })
})

describe('npm run db:migrate', () => {
  it('runs without --remint on a copy with both pins broken, and repairs neither', () => {
    const database = theFirstRevisionRewritten(theFirstRevisionDeleted(aCopy('plain-both'), pins['emergency push']), pins.comment)

    const migrated = ran([], database)
    expect(migrated.status, migrated.stderr).toBe(0)
    readOnly(database, (s) => {
      expect(holds(s, pins['emergency push'])).toBe(false)
      expect(holds(s, pins.comment)).toBe(false)
      expect(theRevisionsOf(s, pins['emergency push'].note)[0]?.seq).toBe(2)
    })
    expect(theIdOfTheLegacyAgent(database)).toBe(STILT)
  })
})
