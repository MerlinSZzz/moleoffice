// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Stamp columns in the database, filled by their real write paths, read back raw, checked local.
 *
 * ---------------------------------------------------------------------------------------
 * THE HOLE THIS CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office stores timestamps as LOCAL wall-clock strings, deliberately, so that a day means the
 * operator's day. `src/shared/time.ts` is the one place that rule is written down, and
 * `tests/time.test.ts` checks it in six timezones.
 *
 * But `time.ts` can only bind a caller that calls it. Five stamp columns — `records.created_at`,
 * `records.updated_at`, `links.created_at`, `links.updated_at` and `changes.at` — carry a SQL
 * default of `datetime('now')`, which is UTC. An INSERT that forgets to pass a stamp therefore
 * does not fail: it succeeds, and silently stores a UTC string in a column that means local time.
 *
 * That was measured, not imagined. The audit of 2026-08-10 deleted two lines from `createRecord`
 * so the default applied, and got `nowStamp() local : 2026-08-10 14:44:29` against
 * `stored created_at: 2026-08-10 13:44:29` — one hour wrong — with **2,065 tests passing and
 * `tsc --noEmit` clean**. `tests/time.test.ts` cannot see it, because it pins the RULE and this is
 * a CALLER THAT SKIPS THE RULE.
 *
 * So this file tests the callers. It drives the write paths that fill a stamp column, reads the
 * column back with raw SQL — not through a reader that might parse it charitably — and asserts the
 * stored string is the local wall clock.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT SETS ITS OWN TIMEZONE, AND WHY THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------
 *
 * At UTC there is no such thing as a wrong answer here: a local stamp and a UTC stamp are the same
 * string, so a test that merely wrote and read would agree with itself and prove nothing. That is
 * exactly how the two-month `parseStamp` bug survived 1,129 tests.
 *
 * Every test below therefore sets `process.env.TZ` itself, to two zones chosen for two different
 * failure shapes, and never trusts the runner's zone:
 *
 *   Asia/Kolkata        +05:30 — NOT a whole number of hours, so anything that "fixes" timezones
 *                       by rounding to the hour is caught.
 *   Pacific/Kiritimati  +14:00 — the largest offset in use. A stamp written here and read as UTC
 *                       lands on the previous DAY, which is the failure that matters most: `?since=`
 *                       is a filter on `changes.at`, so a day's work files itself under yesterday.
 *
 * Vitest runs with `pool: 'forks'`, so this file has its own process and cannot disturb another
 * file's zone. Node applies a change to `process.env.TZ` to the Date operations that follow it.
 *
 * NOTHING HERE MAY EVER PASS BECAUSE IT COULD NOT TELL. The first test in each zone asks SQLite
 * itself for `datetime('now')` and requires `stampWrittenIn` to call it `utc`. If the zone did not
 * take effect — a container with no tzdata, say — that assertion fails, and every other assertion
 * in the file is known to have been made somewhere the difference is visible.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES THIS DIFFERENT FROM A TEST THAT WOULD PASS WITH THE FEATURE DELETED
 * ---------------------------------------------------------------------------------------
 *
 * Remove `createdAt: now()` from `createRecord` and "a record stores local time" fails.
 * Remove `at: now()` from `logChange` and the change-log test fails. Remove `built_at` from
 * `rebuildIndex` and the source-index test fails with a NOT NULL error. Each write path is
 * separately pinned, and the inventory below makes it a failure to add a stamp column without
 * pinning it too.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { clockStamp, localStamp, stampWrittenIn } from '../src/shared/time.ts'
import { STRUCTURE_SCOPE } from '../src/shared/presentation.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { A_SLEEP_TIME, apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'

// ============================================================================ the inventory

/** The names that say a column holds a moment, the same rule the database sweep below uses. */
function holdsAMoment(name: string): boolean {
  return name === 'at' || name === 'since' || name === 'until' || name.endsWith('_at') || name.endsWith('_since') || name.endsWith('_until')
}

/**
 * The stamp columns that carry a SQL default of `datetime('now')`, which is UTC.
 *
 * These five are older than the rule. `reader_anchors`, `presentation_intent`, `panel_layouts`,
 * `session_resources`, `source_files`, `source_index` and `source_file_hashes` all have NO default
 * on their stamps, deliberately and with the reason written on the column, so an INSERT that
 * forgets fails loudly instead of storing the wrong kind of string.
 *
 * THE ASSERTION BELOW IS A SUBSET CHECK, NOT AN EQUALITY. Removing one of these five is the fix
 * this file is asking for and must not break the file that asks for it. Adding a sixth must.
 */
const DEFAULTED_TO_UTC: readonly string[] = [
  'records.created_at',
  'records.updated_at',
  'links.created_at',
  'links.updated_at',
  'changes.at',
]

/**
 * Two zones, neither of them Greenwich. The reasons are in the header; the short version is that a
 * half-hour offset catches anything that rounds to hours and +14:00 moves the date rather than the
 * hour.
 */
const ZONES = ['Asia/Kolkata', 'Pacific/Kiritimati'] as const

// ============================================================================ the harness

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type SourceIndexLib = typeof import('../src/server/lib/sourceindex.ts')
type PresentationLib = typeof import('../src/server/lib/presentation.ts')

interface Harness {
  t: TestDb
  res: ResourcesLib
  idx: SourceIndexLib
  pres: PresentationLib
}

/**
 * A throwaway database with every write path loaded against it.
 *
 * All imports are dynamic and happen AFTER `freshDb`, for the reason helpers.ts gives: a top-level
 * import would have opened the wrong database before any test code ran. It matters here that every
 * module gets the SAME freshly-loaded db client, so a row written through one is visible to the raw
 * SQL read of another.
 */
async function build(): Promise<Harness> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const idx = await import('../src/server/lib/sourceindex.ts')
  const pres = await import('../src/server/lib/presentation.ts')
  return { t, res, idx, pres }
}

let h: Harness
const madeDirs: string[] = []

// THE FILE'S FIRST SERVER IS BUILT IN A HOOK. The settings-door case below is the first case here that builds a server.
// Without the hook, that case in Asia/Kolkata took from 1.9 s to more than its 5 s from one run to the next, and it
// timed out in five of seven runs on 16 and 17 November 2026. With the hook it took 1.5 to 2.7 s in 15 runs. The
// hook's office is made under the runner's own zone and closed before any case sets a zone, and no case reads it.
buildTheFirstOfficeInAHook()

const originalTZ = process.env.TZ
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

afterEach(() => {
  h.t.close()
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- small helpers

/** One column of one row, as stored. Raw SQL, so no reader gets a chance to be charitable. */
function stored(query: string, ...params: unknown[]): string {
  const value = h.t.client.sqlite.prepare(query).pluck().get(...(params as never[]))
  if (typeof value !== 'string') {
    throw new Error(`expected a stored stamp from \`${query}\`, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * The assertion this whole file is made of: what is in the column is the local wall clock.
 *
 * `toleranceMs` is how far apart the write and this reading may be, and it defaults to five
 * seconds. It is never anywhere near a timezone offset — the smallest in use is fifteen minutes —
 * so no tolerance here can let a UTC stamp pass as a local one.
 */
function expectLocal(column: string, stamp: string, when: Date, toleranceMs?: number): void {
  const origin = stampWrittenIn(stamp, when, toleranceMs)
  expect(
    origin,
    `${column} holds "${stamp}"; the local clock at the time of the write was "${localStamp(when)}" ` +
      `in ${process.env.TZ ?? '(no TZ set)'}`,
  ).toBe('local')
}

/**
 * The stamp names the recorded moment AND states its own offset, in the form `clockStamp` writes.
 *
 * The expected format is asked of `clockStamp` rather than copied beside the writer, so a change to
 * the one writer of this form cannot leave a second copy of it in this test. `Date.parse` is the
 * reader: a stamp whose offset disagreed with its wall clock would name a different moment.
 */
function expectTheClocksInstantForm(column: string, stamp: string, when: Date): void {
  expect(stamp, `${column} must state a numeric offset`).toMatch(/[+-]\d{2}:\d{2}$/)
  expect(clockStamp(() => new Date(Date.parse(stamp))).instant, `${column} is not in the clock's instant form`).toBe(stamp)
  expect(Math.abs(Date.parse(stamp) - when.getTime()), `${column} does not name the moment it was written`).toBeLessThanOrEqual(5_000)
}

/** Every table in the database, and its columns as SQLite reports them. */
interface Column {
  name: string
  type: string
  notnull: number
  dflt_value: string | null
}

function tables(): string[] {
  return h.t.client.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .pluck()
    .all() as string[]
}

function columnsOf(table: string): Column[] {
  // The table name is interpolated because PRAGMA takes no parameters. Every value passed here
  // comes from sqlite_master in this same process, so there is nothing to inject.
  return h.t.client.sqlite.prepare(`PRAGMA table_info("${table}")`).all() as Column[]
}

/**
 * Every TEXT column that holds a moment, as `table.column`.
 *
 * FOUR SHAPES, NOT ONE. `at` and `_at` were the whole rule until 4 September 2026, when migrations
 * 0122 and 0124 added `citizen_since`, `since` and `until` — three columns holding a local
 * wall-clock stamp that this check could not see, so the rule they are held to would have been a
 * comment. A name-based rule is what this file has, and widening it is cheaper than the alternative,
 * which is a stamp column nobody notices for a month.
 */
function stampColumnsInTheDatabase(): { key: string; column: Column }[] {
  const found: { key: string; column: Column }[] = []
  for (const table of tables()) {
    for (const column of columnsOf(table)) {
      if (holdsAMoment(column.name) && column.type.toUpperCase() === 'TEXT') {
        found.push({ key: `${table}.${column.name}`, column })
      }
    }
  }
  return found
}

/** A throwaway directory tree for the source index to scan. */
function tree(files: Record<string, string>): string {
  // realpathSync because the index stores the root as text and compares claims against it. On a
  // machine where /tmp is a symlink the two spellings would never meet.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-stamp-')))
  madeDirs.push(dir)
  for (const [rel, content] of Object.entries(files)) writeFileSync(join(dir, rel), content)
  return dir
}

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

// ============================================================================ the tests

describe.each(ZONES)('in %s, where a UTC stamp is visibly not a local one', (zone) => {
  beforeEach(async () => {
    // Before the harness, so nothing this file builds is made under the runner's own zone.
    process.env.TZ = zone
    h = await build()
  })

  // -------------------------------------------------------------------------- the instrument

  it('the zone took effect, and SQLite really does write UTC', () => {
    // THE GUARD ON EVERY OTHER TEST IN THIS FILE. `datetime('now')` is asked of the same engine
    // that evaluates the column defaults, so this is the actual string a forgetful INSERT would
    // store — not a hand-rolled imitation of it. If it comes back indistinguishable from local,
    // the zone did not take effect and nothing below could have failed. That must be loud.
    const now = new Date()
    const fromSqlite = stored("SELECT datetime('now')")
    expect(stampWrittenIn(fromSqlite, now), `SQLite said "${fromSqlite}" in ${zone}`).toBe('utc')

    // And the same moment written our way is the other answer, so the check has two sides.
    expect(stampWrittenIn(localStamp(now), now)).toBe('local')
  })

  // -------------------------------------------------------------------------- the inventory

  it('has no stamp column carrying a UTC default beyond the five that predate the rule', () => {
    const defaulted = stampColumnsInTheDatabase()
      .filter((c) => c.column.dflt_value !== null)
      .map((c) => c.key)

    for (const key of defaulted) {
      expect(
        DEFAULTED_TO_UTC,
        `${key} carries a SQL default. A default on a stamp column is UTC, and a column that ` +
          `means local time must have none: an INSERT that forgets should fail loudly, the way ` +
          `reader_anchors.last_seen_at already does. Either drop the default or add ${key} to ` +
          `DEFAULTED_TO_UTC and pin its writer in this file.`,
      ).toContain(key)
    }

    // The other direction is deliberately NOT asserted. Dropping one of the five is the fix this
    // file exists to ask for, and a test that failed when it arrived would be arguing with itself.
  })

  it('the drizzle journal’s created_at is not a stamp, and is not text', () => {
    // The one column in the database named like a stamp that is not one: drizzle writes epoch
    // milliseconds as a number into its own journal. Asserted rather than filtered silently,
    // because the day it becomes text is the day it starts being caught by the sweep above and
    // somebody has to know why.
    const journal = columnsOf('__drizzle_migrations').find((c) => c.name === 'created_at')
    expect(journal, 'drizzle writes its own journal table; it has a created_at').toBeDefined()
    expect(journal?.type.toUpperCase()).not.toBe('TEXT')
  })

  // -------------------------------------------------------------------------- records

  it('createRecord stores local time in created_at, updated_at and the change row', () => {
    const before = new Date()
    const id = h.t.api.createRecord({ workspaceId: 'default',
      kind: 'module',
      title: '夹具标定',
      data: { context: 'The gripper calibration rig.' },
      actor: HUMAN,
    }).id

    expectLocal('records.created_at', stored('SELECT created_at FROM records WHERE id = ?', id), before)
    expectLocal('records.updated_at', stored('SELECT updated_at FROM records WHERE id = ?', id), before)
    expectLocal('changes.at', stored('SELECT at FROM changes WHERE record_id = ? AND op = ?', id, 'create'), before)
  })

  it('updateRecord and patchRecord move updated_at to local time', () => {
    const id = h.t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'LeafCam 2 overhead camera', actor: HUMAN }).id

    const atUpdate = new Date()
    h.t.api.updateRecord(id, { summary: 'Timing is the open problem.' }, HUMAN)
    expectLocal('records.updated_at', stored('SELECT updated_at FROM records WHERE id = ?', id), atUpdate)

    const atPatch = new Date()
    h.t.api.patchRecord(id, { dataPatch: { context: 'Chest-mast camera.' } }, HUMAN)
    expectLocal('records.updated_at', stored('SELECT updated_at FROM records WHERE id = ?', id), atPatch)
  })

  it('deleteRecord stores local time in deleted_at, and restoring stamps local time too', () => {
    const id = h.t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Re-run the reach check', actor: HUMAN }).id

    const atDelete = new Date()
    h.t.api.deleteRecord(id, HUMAN)
    expectLocal('records.deleted_at', stored('SELECT deleted_at FROM records WHERE id = ?', id), atDelete)
    expectLocal('records.updated_at', stored('SELECT updated_at FROM records WHERE id = ?', id), atDelete)

    const atRestore = new Date()
    h.t.api.restoreRecord(id, HUMAN)
    expectLocal('records.updated_at', stored('SELECT updated_at FROM records WHERE id = ?', id), atRestore)
    // A restored record has nothing in deleted_at, which is the one right answer for that column.
    expect(h.t.client.sqlite.prepare('SELECT deleted_at FROM records WHERE id = ?').pluck().get(id)).toBeNull()
  })

  // -------------------------------------------------------------------------- links

  it('createLink stores local time in both of its stamps', () => {
    const from = h.t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Tray clamp drops the part', actor: HUMAN }).id
    const to = h.t.api.createRecord({ workspaceId: 'default', kind: 'task', title: 'Re-tension the fingers', actor: HUMAN }).id

    const before = new Date()
    const { id } = h.t.api.createLink({ fromId: from, toId: to, type: 'blocks', actor: HUMAN })

    expectLocal('links.created_at', stored('SELECT created_at FROM links WHERE id = ?', id), before)
    expectLocal('links.updated_at', stored('SELECT updated_at FROM links WHERE id = ?', id), before)
    expectLocal('changes.at', stored('SELECT at FROM changes WHERE record_id = ? AND op = ?', from, 'link'), before)
  })

  // -------------------------------------------------------------------------- reader anchor

  it('moveAnchor stores local time, which is what makes “while I was away” mean anything', () => {
    h.t.api.createRecord({ workspaceId: 'default', kind: 'note', title: 'Bench notes', actor: HUMAN })

    const before = new Date()
    h.t.api.moveAnchor(h.t.api.readerOf(HUMAN), 'default')
    expectLocal(
      'reader_anchors.last_seen_at',
      stored('SELECT last_seen_at FROM reader_anchors WHERE reader = ?', h.t.api.readerOf(HUMAN)),
      before,
    )
  })

  // -------------------------------------------------------------------------- presentation intent

  it('writeNodeIntent stores local time', () => {
    const module = h.t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'Force control', actor: HUMAN }).id
    const scope = h.pres.parseScope(STRUCTURE_SCOPE, 'default')

    const before = new Date()
    h.pres.writeNodeIntent(scope, module, { lane: 'safety' }, HUMAN)
    expectLocal(
      'presentation_intent.updated_at',
      stored('SELECT updated_at FROM presentation_intent WHERE scope = ? AND target = ?', STRUCTURE_SCOPE, module),
      before,
    )
  })

  // -------------------------------------------------------------------------- panel layouts

  it('panel_layouts refuses a row with no stamp, which is what a retired table needs instead of a writer', () => {
    // THE TABLE HAS NO WRITER LEFT. PUT /api/layout/:id was deleted with the panel grid on
    // 2026-08-10, so there is no caller to drive and the "stores local time" test that used to
    // stand here could only have been driven by writing SQL this product no longer writes.
    //
    // What is still worth asserting is the property that makes a FUTURE writer safe: the column is
    // NOT NULL with no SQL default, so an INSERT that forgets the stamp fails loudly rather than
    // taking `datetime('now')`, which is UTC. That is the shape reader_anchors already has and the
    // one this whole file is asking the other five columns to move to.
    expect(() =>
      h.t.client.sqlite
        .prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_by) VALUES (?, ?, ?, ?)')
        .run('default', 'home', '{}', `human:${THE_TEST_OFFICES_OWNER.id}`),
    ).toThrow(/NOT NULL/i)

    // And the row really did not land, so the refusal is a refusal and not a warning.
    expect(h.t.client.sqlite.prepare('SELECT count(*) FROM panel_layouts').pluck().get()).toBe(0)

    // A row that DOES pass a stamp is stored as given, so the column is usable the moment a writer
    // exists again. Written here rather than by a product path because no product path remains.
    const before = new Date()
    h.t.client.sqlite
      .prepare('INSERT INTO panel_layouts (workspace_id, id, layout, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)')
      .run('default', 'home', '{}', localStamp(before), `human:${THE_TEST_OFFICES_OWNER.id}`)
    expectLocal(
      'panel_layouts.updated_at',
      stored('SELECT updated_at FROM panel_layouts WHERE id = ?', 'home'),
      before,
    )
  })

  // -------------------------------------------------------------------------- the resource ledger

  it('registering and releasing a resource store local time', async () => {
    // A fake operating system, so nothing real is started and — this is the one that matters —
    // nothing real can be signalled. The process's start time is the probe's to state; that it is
    // LOCAL when it comes from the real machine is the next test.
    //
    // THIS LITERAL HAS TO IMPLEMENT THE WHOLE INTERFACE, and when a method is added to `OsProbe`
    // it stops compiling. That is the right outcome rather than a nuisance: a new way of reading
    // the machine is a new way of producing a timestamp, and it should be considered here.
    // `fakeProbe` in tests/resources.test.ts has the same property for the same reason.
    const fake: Parameters<ResourcesLib['useOsProbe']>[0] = {
      platform: 'fake',
      processById: (pid: number) =>
        pid === 500 ? { pid: 500, pgid: 400, ppid: 1, command: 'node server.js', startedAt: '2026-08-08 09:00:00' } : null,
      processesInGroup: (pgid: number) =>
        pgid === 400 ? [{ pid: 500, pgid: 400, ppid: 1, command: 'node server.js', startedAt: '2026-08-08 09:00:00' }] : [],
      listeningPorts: () => [],
      gpu: () => ({ available: true, processes: [] }),
      containers: () => ({ available: true, containers: [] }),
      locks: () => ({ files: [], unreadable: [] }),
      ownProcessGroup: () => 999_999,
      killProcessGroup: () => {},
      stopContainer: () => {},
    }
    h.res.useOsProbe(fake)

    const session = h.t.api.createRecord({ workspaceId: 'default',
      kind: 'session',
      title: 'session under test',
      data: { state: 'running', runtime: 'claude-code' },
      actor: HUMAN,
    }).id

    const atRegister = new Date()
    const entry = h.res.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: '500', actor: HUMAN })
    expectLocal(
      'session_resources.registered_at',
      stored('SELECT registered_at FROM session_resources WHERE id = ?', entry.id),
      atRegister,
    )
    // The probe's own string, stored verbatim. Not re-read, not re-formatted, not shifted: the
    // ledger compares it character by character later to tell a recycled pid from the original.
    expect(stored('SELECT os_started_at FROM session_resources WHERE id = ?', entry.id)).toBe('2026-08-08 09:00:00')

    h.t.api.patchRecord(session, { dataPatch: { state: 'finished' } }, HUMAN)

    const atRelease = new Date()
    await h.res.releaseResource(entry.id, { actor: HUMAN }, 'default')
    expectLocal(
      'session_resources.released_at',
      stored('SELECT released_at FROM session_resources WHERE id = ?', entry.id),
      atRelease,
    )
  })

  it('the real machine probe reports a process start time in local time', () => {
    // The one stamp in the database that does not come from `now()`. It is built by LINUX_PROBE
    // out of /proc, and this asks it about THIS process.
    //
    // The stamp is compared with this process's own start, read from Node's uptime, and not with
    // now. When test files share a process, this file can run long after the process started, and
    // a comparison with now would fail on that age alone. /proc and Node each read the start their
    // own way, so the tolerance stays at ten minutes. Ten minutes is still twenty times smaller than
    // the smaller of the two offsets used here, so a UTC reading could not slip through it.
    const me = h.res.LINUX_PROBE.processById(process.pid)
    expect(
      me,
      `LINUX_PROBE could not read pid ${process.pid} out of /proc on ${process.platform}. This test ` +
        'reads the real machine, the way tests/resources.test.ts does.',
    ).not.toBeNull()
    const started = new Date(Date.now() - process.uptime() * 1000)
    expectLocal('OsProbe.processById().startedAt', me?.startedAt ?? '', started, 10 * 60_000)
  })

  // -------------------------------------------------------------------------- the source index

  it('rebuilding the source index stores local time in all three of its stamps', () => {
    const root = tree({ 'one.ts': 'export const a = 1\n', 'two.ts': 'import { a } from "./one.ts"\n' })

    const before = new Date()
    h.idx.rebuildIndex({ workspaceId: 'default', root, actor: HUMAN })

    expectLocal('source_index.built_at', stored('SELECT built_at FROM source_index'), before)
    expectLocal(
      'source_file_hashes.built_at',
      stored('SELECT built_at FROM source_file_hashes ORDER BY path LIMIT 1'),
      before,
    )
    // modified_at is the file's own mtime rather than the moment of the scan, and the files were
    // written moments ago, so the same reading holds — and it is the only stamp column whose value
    // comes off the filesystem.
    expectLocal(
      'source_files.modified_at',
      stored('SELECT modified_at FROM source_files ORDER BY path LIMIT 1'),
      before,
      60_000,
    )
  })

  // -------------------------------------------------------------------------- what was written about time

  it('changePixelSettings stores local updated_at on the first choice and a later change', async () => {
    const { changePixelSettings } = await import('../src/server/lib/pixel-office.ts')
    const beforeInsert = new Date()
    changePixelSettings({ motion: true }, HUMAN)
    expectLocal('office_scene_settings.updated_at', stored('SELECT updated_at FROM office_scene_settings WHERE only_row = 1'), beforeInsert)

    // Make a missing update visible even when both real writes occur in the same second.
    h.t.client.sqlite.prepare('UPDATE office_scene_settings SET updated_at = ? WHERE only_row = 1').run('2000-01-01 00:00:00')
    const beforeUpdate = new Date()
    changePixelSettings({ motion: false }, HUMAN)
    expectLocal('office_scene_settings.updated_at', stored('SELECT updated_at FROM office_scene_settings WHERE only_row = 1'), beforeUpdate)
  })

  it('setParticipantAddressAs stores local address_set_at on a person and on an agent', async () => {
    // Migration 0182 records when how somebody wishes to be addressed was last set. The person sets their
    // own, and the owner sets an agent's. Every value is made up.
    const { setParticipantAddressAs } = await import('../src/server/lib/participants.ts')
    const beforePerson = new Date()
    setParticipantAddressAs({ kind: 'person', id: HUMAN.id }, { name: 'A made-up name' }, HUMAN)
    expectLocal('people.address_set_at', stored('SELECT address_set_at FROM people WHERE id = ?', HUMAN.id), beforePerson)

    h.t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'a-stamped-agent',
      data: { handle: 'a-stamped-agent', state: 'active', runtime: 'claude-code' },
      actor: HUMAN,
    })
    const agent = h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('a-stamped-agent') as { id: string }
    const beforeAgent = new Date()
    setParticipantAddressAs({ kind: 'agent', id: agent.id }, { title: 'a made-up title' }, HUMAN)
    expectLocal('agents.address_set_at', stored('SELECT address_set_at FROM agents WHERE id = ?', agent.id), beforeAgent)
  })

  it('the residents\' writers store local time on the residency, the successor, leave, void marks and writes', async () => {
    // The residents' migration. None of these columns has a SQL default, so removing the stamp
    // from a writer makes its INSERT or UPDATE fail rather than store UTC. Every name and value is made up.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const residents = await import('../src/server/lib/residents.ts')
    const idOf = (handle: string, role: string): string => {
      h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', role }, actor: HUMAN })
      return (h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
    }
    const byKey = (handle: string, id: string) => ({ type: 'agent' as const, id: handle, provedBy: 'an-agent-key' as const, keyHolder: id })
    const secretary = idOf('stamp-secretary', 'secretary')
    const resident = idOf('stamp-resident', 'worker')
    const reader = idOf('stamp-reader', 'worker')
    const heir = idOf('stamp-heir', 'worker')
    const proposal = residents.proposeAResident({ agentId: resident, because: 'A made-up reason.', sleepTime: A_SLEEP_TIME }, byKey('stamp-secretary', secretary), 'default')
    const beforeConfirm = new Date()
    residents.confirmAResident(proposal.id, HUMAN)
    expectLocal('agents.resident_since', stored('SELECT resident_since FROM agents WHERE id = ?', resident), beforeConfirm)
    const residency = residents.residencyOf(resident)!
    const beforeWrite = new Date()
    residents.writeAFile(residency, 'memory/stamp.md', Buffer.from('x'), byKey('stamp-resident', resident))
    expectLocal('resident_space_writes.written_at', stored('SELECT written_at FROM resident_space_writes WHERE resident_id = ?', resident), beforeWrite)
    const beforeVoid = new Date()
    residents.voidAFile(residency, 'memory/stamp.md', 'A made-up reason.', HUMAN)
    expectLocal('resident_void_marks.marked_at', stored('SELECT marked_at FROM resident_void_marks WHERE resident_id = ?', resident), beforeVoid)
    const beforeLeave = new Date()
    const grant = residents.giveLeave(residency, { readerAgentId: reader, until: '2099-01-01 12:00' }, byKey('stamp-resident', resident))
    expectLocal('resident_read_grants.given_at', stored('SELECT given_at FROM resident_read_grants WHERE id = ?', grant.id), beforeLeave)
    const beforeEnd = new Date()
    residents.endLeave(residency, grant.id, HUMAN)
    expectLocal('resident_read_grants.ended_at', stored('SELECT ended_at FROM resident_read_grants WHERE id = ?', grant.id), beforeEnd)
    // 0233: the confirm asked for a picture and a name; a sleep began and ended; the picture and name were marked chosen.
    expectLocal('agents.resident_naming_asked_at', stored('SELECT resident_naming_asked_at FROM agents WHERE id = ?', resident), beforeConfirm)
    const beforeSleep = new Date()
    residents.sleepAResident(residents.residencyOf(resident)!, 'A made-up reason.', HUMAN)
    expectLocal('resident_sleeps.began_at', stored("SELECT began_at FROM resident_sleeps WHERE agent_id = ? AND what = 'slept'", resident), beforeSleep)
    const beforeWake = new Date()
    residents.wakeAResident(residents.residencyOf(resident)!, HUMAN)
    expectLocal('resident_sleeps.ended_at', stored("SELECT ended_at FROM resident_sleeps WHERE agent_id = ? AND what = 'slept'", resident), beforeWake)
    const beforeNamed = new Date()
    residents.markTheResidentNamed(residents.residencyOf(resident)!, HUMAN)
    expectLocal('agents.resident_named_at', stored('SELECT resident_named_at FROM agents WHERE id = ?', resident), beforeNamed)
    h.t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_at = '2000-01-01 00:00:00' WHERE id = ?").run(resident)
    const beforeSuccessor = new Date()
    residents.nameASuccessor(residents.residencyOf(resident)!, heir, HUMAN)
    expectLocal('agents.successor_named_at', stored('SELECT successor_named_at FROM agents WHERE id = ?', resident), beforeSuccessor)
  })

  it('the sleep time writers store local time when a sleep time is set, and when the sleep the office began at it ends', async () => {
    // Migration 0330. Neither column has a SQL default. `new Date().toISOString()` in place of
    // `nowStamp()` in `writeTheSleepTime`, or in place of `stampInZone` for the end in `aMinuteOfTheSleepClock`, turns this
    // case red in both zones. The time opens five minutes from now, so it was set before it opened, as the clock asks.
    // Every name and value is made up.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const residents = await import('../src/server/lib/residents.ts')
    const { aMinuteOfTheSleepClock } = await import('../src/server/lib/sleep-windows.ts')
    const idOf = (handle: string): string => {
      h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', role: 'secretary' }, actor: HUMAN })
      return (h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
    }
    const byKey = (handle: string, id: string) => ({ type: 'agent' as const, id: handle, provedBy: 'an-agent-key' as const, keyHolder: id })
    const proposer = idOf('stamp-sleep-proposer')
    const sleeper = idOf('stamp-sleeper')
    const proposal = residents.proposeAResident({ agentId: sleeper, because: 'A made-up reason.', sleepTime: A_SLEEP_TIME }, byKey('stamp-sleep-proposer', proposer), 'default')
    residents.confirmAResident(proposal.id, HUMAN)
    const opens = new Date(Math.floor(Date.now() / 60_000) * 60_000 + 5 * 60_000)
    const beforeSet = new Date()
    residents.setASleepTime(residents.residencyOf(sleeper)!, { startsAt: localStamp(opens).slice(11, 16), minutes: 15 }, byKey('stamp-sleeper', sleeper))
    expectLocal('agents.sleep_time_set_at', stored('SELECT sleep_time_set_at FROM agents WHERE id = ?', sleeper), beforeSet)
    expect(aMinuteOfTheSleepClock(opens.getTime() + 60_000).began).toEqual([sleeper])
    const wakes = new Date(opens.getTime() + 15 * 60_000)
    expectLocal('resident_sleeps.wakes_at', stored("SELECT wakes_at FROM resident_sleeps WHERE agent_id = ? AND what = 'slept'", sleeper), wakes)
  })

  it('the rename writers store local time when a new name is proposed, when it is answered, and when the person renames at once', async () => {
    // Migration 0319 (item 42 of wave 13s). Neither column has a SQL default, so removing the stamp from a writer makes its
    // INSERT or UPDATE fail rather than store UTC; `new Date().toISOString()` in place of `nowStamp()` in any of the three
    // writers turns this case red in both zones. Every name and value is made up.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const renames = await import('../src/server/lib/agent-renames.ts')
    const { writeThePersonsOwnRename } = await import('../src/server/lib/agent-names.ts')
    h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'stamp-renamed', data: { handle: 'stamp-renamed', state: 'active', runtime: 'claude-code', role: 'worker' }, actor: HUMAN })
    const agent = (h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('stamp-renamed') as { id: string }).id
    const beforePropose = new Date()
    const { rename } = renames.proposeARename(agent, { name: 'A made-up new name', because: 'A made-up reason.' }, HUMAN, 'default')
    expectLocal('agent_renames.proposed_at', stored('SELECT proposed_at FROM agent_renames WHERE id = ?', rename.id), beforePropose)
    const beforeAnswer = new Date()
    renames.approveARename(rename.id, 'A made-up reason.', HUMAN)
    expectLocal('agent_renames.answered_at', stored('SELECT answered_at FROM agent_renames WHERE id = ?', rename.id), beforeAnswer)
    const beforeAtOnce = new Date()
    writeThePersonsOwnRename(agent, 'Another made-up name', { kind: 'person', id: HUMAN.id }, null)
    const atOnce = "SELECT {column} FROM agent_renames WHERE agent_id = ? AND way = 'at once'"
    expectLocal('agent_renames.proposed_at', stored(atOnce.replace('{column}', 'proposed_at'), agent), beforeAtOnce)
    expectLocal('agent_renames.answered_at', stored(atOnce.replace('{column}', 'answered_at'), agent), beforeAtOnce)
  })

  it('the starter press stores local time when the person presses and when the change is applied', async () => {
    // Migration 0331 (wave 13u round 186). Neither column has a SQL default, so `new Date().toISOString()` in place of
    // `nowStamp()` in changeWhoAnswersFor turns this case red in both zones. Every name and value is made up.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const { changeWhoAnswersFor } = await import('../src/server/lib/agent-starter.ts')
    const { THE_PERSON } = await import('../src/shared/person.ts')
    h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'stamp-moved', data: { handle: 'stamp-moved', state: 'active', runtime: 'claude-code', role: 'worker' }, actor: HUMAN })
    const agent = (h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('stamp-moved') as { id: string }).id
    const before = new Date()
    const moved = changeWhoAnswersFor(agent, { to: THE_PERSON, because: 'A made-up reason.' }, HUMAN, 'default')
    const id = moved.change?.id ?? 'no change was written'
    expectLocal('agent_starter_changes.asked_at', stored('SELECT asked_at FROM agent_starter_changes WHERE id = ?', id), before)
    expectLocal('agent_starter_changes.applied_at', stored('SELECT applied_at FROM agent_starter_changes WHERE id = ?', id), before)
  })

  it('the owner hand-over writers store local time when an owner is handed over and when the office began to keep them', async () => {
    // Migration 0356. Neither column has a SQL default, so `new Date().toISOString()` in place of `nowStamp()` in
    // writeAnOwnerHandOver or keepTheDayTheHandOversBeganOnce turns this case red in both zones. Every name and value
    // is made up.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const { keepTheDayTheHandOversBeganOnce, writeAnOwnerHandOver } = await import('../src/server/lib/agent-owner-changes.ts')
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const idOf = (handle: string) => (h.t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
    for (const handle of ['stamp-handed-over', 'stamp-new-owner']) {
      h.t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', role: 'worker' }, actor: HUMAN })
    }
    const before = new Date()
    const id = writeAnOwnerHandOver({
      agent: idOf('stamp-handed-over'),
      to: { kind: 'agent', id: idOf('stamp-new-owner') },
      by: { kind: 'person', id: THE_PERSON },
      underTheGrant: null,
      because: 'A made-up reason.',
    })
    expectLocal('agent_owner_changes.made_at', stored('SELECT made_at FROM agent_owner_changes WHERE id = ?', id), before)
    const beforeTheDay = new Date()
    keepTheDayTheHandOversBeganOnce()
    expectLocal('installation.owner_changes_since', stored('SELECT owner_changes_since FROM installation WHERE only_row = 1'), beforeTheDay)
  })

  it('the settings door stores the local end time the person typed for a gate choice', async () => {
    const {app} = await apiApp()
    try {
      const reply = await app.inject({method: 'POST', url: '/api/office/settings',
        headers: {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id},
        payload: {changes: [{name: 'MOLE_OFFICE_CONFLICT_RESOLVING', value: '1', until: '2099-10-21 7:00'}], because: 'Made-up end time for this test office'},
      })
      expect(reply.statusCode, reply.body).toBe(200)
      const end = stored('SELECT until FROM runtime_settings WHERE name = ?', 'MOLE_OFFICE_CONFLICT_RESOLVING')
      expect(end).toBe('2099-10-21 07:00:00')
      expect(stampWrittenIn(end, new Date(2099, 9, 21, 7, 0, 0))).toBe('local')
    } finally { await app.close() }
  })

  it('setTheRunModels stores local updated_at when a model is set on the Settings page', async () => {
    // Criterion U2's store, added by migration 0176. It has no SQL default, so removing the stamp
    // from `setTheRunModels` makes the INSERT fail rather than store UTC.
    const { setTheRunModels } = await import('../src/server/lib/run-models.ts')
    const before = new Date()
    setTheRunModels({ places: { conversation: { runtime: 'claude-code', model: 'a-stamp-test-model' } } }, HUMAN)
    expectLocal('run_models.updated_at', stored('SELECT updated_at FROM run_models WHERE only_row = 1'), before)
  })

  it('the casting writers store local time on the casting and on its history rows', async () => {
    // Several castings for each role, migration 0190. Neither column has a SQL default, so
    // removing the stamp from a writer makes the INSERT or UPDATE fail or keep the old stamp rather than store UTC.
    // THE ROLE CARDS ARE READ ONCE, as buildApp reads them, because the Casting writer checks the role against them.
    const roleCards = await import('../src/server/lib/roles.ts')
    if (!roleCards.theRoleCardsAreRead()) {
      const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
      roleCards.readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
    }
    const { addACasting, changeACasting, markACasting, removeACasting } = await import('../src/server/lib/casting.ts')
    const beforeAdd = new Date()
    const first = addACasting('worker', { project: null, cells: { model: { value: 'a-stamp-test-model', decision: null } } }, HUMAN)
    expectLocal('casting_rows.changed_at', stored('SELECT changed_at FROM casting_rows WHERE id = ?', first.casting.id), beforeAdd)
    expectLocal('casting_row_changes.at', stored('SELECT at FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1', first.casting.id), beforeAdd)

    // Make a missing stamp visible even when the writes land in the same second.
    h.t.client.sqlite.prepare('UPDATE casting_rows SET changed_at = ? WHERE id = ?').run('2000-01-01 00:00:00', first.casting.id)
    const beforeChange = new Date()
    changeACasting(first.casting.id, { effort: { value: 'high', decision: null } }, HUMAN)
    expectLocal('casting_rows.changed_at', stored('SELECT changed_at FROM casting_rows WHERE id = ?', first.casting.id), beforeChange)

    const second = addACasting('worker', { project: null, cells: { model: { value: 'a-second-stamp-model', decision: null } } }, HUMAN)
    h.t.client.sqlite.prepare('UPDATE casting_rows SET changed_at = ? WHERE id = ?').run('2000-01-01 00:00:00', second.casting.id)
    const beforeMark = new Date()
    markACasting(second.casting.id, HUMAN)
    expectLocal('casting_rows.changed_at', stored('SELECT changed_at FROM casting_rows WHERE id = ?', second.casting.id), beforeMark)
    expectLocal('casting_row_changes.at', stored('SELECT at FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1', second.casting.id), beforeMark)

    const beforeRemove = new Date()
    removeACasting(first.casting.id, HUMAN)
    expectLocal('casting_row_changes.at', stored('SELECT at FROM casting_row_changes WHERE casting_id = ? ORDER BY id DESC LIMIT 1', first.casting.id), beforeRemove)
  })

  it('the provider writers store local time on the provider and on its change rows', async () => {
    // The provider table beside the Casting table, migration 0323. No column has a SQL default, so removing the stamp
    // from a writer makes the INSERT or UPDATE fail or keep the old stamp rather than store UTC.
    const { addAProvider, changeAProvider, removeAProvider } = await import('../src/server/lib/the-provider-table.ts')
    const lastChange = 'SELECT at FROM provider_changes WHERE provider_id = ? ORDER BY id DESC LIMIT 1'
    const beforeAdd = new Date()
    addAProvider({ id: 'a-stamp-test', name: 'A made-up provider', programs: ['opencode'], baseAddress: 'https://stamp-test.example/v1', keyName: 'a-stamp-test' }, HUMAN, 'default')
    expectLocal('providers.added_at', stored('SELECT added_at FROM providers WHERE id = ?', 'a-stamp-test'), beforeAdd)
    expectLocal('providers.changed_at', stored('SELECT changed_at FROM providers WHERE id = ?', 'a-stamp-test'), beforeAdd)
    expectLocal('provider_changes.at', stored(lastChange, 'a-stamp-test'), beforeAdd)

    // Make a missing stamp visible even when the writes land in the same second.
    h.t.client.sqlite.prepare('UPDATE providers SET changed_at = ? WHERE id = ?').run('2000-01-01 00:00:00', 'a-stamp-test')
    const beforeChange = new Date()
    changeAProvider('a-stamp-test', { name: 'Another made-up provider' }, HUMAN, 'default')
    expectLocal('providers.changed_at', stored('SELECT changed_at FROM providers WHERE id = ?', 'a-stamp-test'), beforeChange)
    expectLocal('provider_changes.at', stored(lastChange, 'a-stamp-test'), beforeChange)

    const beforeRemove = new Date()
    removeAProvider('a-stamp-test', HUMAN)
    expectLocal('provider_changes.at', stored(lastChange, 'a-stamp-test'), beforeRemove)
  })

  it('migration 0190 stamps its own history rows with local time', () => {
    // THE ONE STAMP A MIGRATION WRITES ITSELF: SQLite's strftime(..., 'now', 'localtime'). Run over one row of
    // migration 0189's table, in this file's own zone.
    const sqlite = h.t.client.sqlite
    sqlite.prepare('DELETE FROM casting_rows').run()
    sqlite.prepare('DELETE FROM casting_row_changes').run()
    sqlite
      .prepare(`INSERT INTO casting (role, project, model, model_from, changed_at, changed_by_kind, changed_by_id) VALUES ('worker', '', 'm', ?, '2026-09-29 10:00:00', 'human', '${THE_TEST_OFFICES_OWNER.id}')`)
      .run(JSON.stringify({ at: '2026-09-29 10:00:00', by: { kind: 'human', id: THE_TEST_OFFICES_OWNER.id }, decision: null, moved: false }))
    const migration = readFileSync(new URL('../drizzle/0190_several_castings_for_each_role.sql', import.meta.url), 'utf8')
    const before = new Date()
    for (const statement of migration.split('--> statement-breakpoint')) sqlite.exec(statement)
    expectLocal('casting_row_changes.at', stored("SELECT at FROM casting_row_changes WHERE what = 'migrate' ORDER BY id DESC LIMIT 1"), before)
  })

  it('the Casting table of migration 0189 refuses a row with no stamp, as a table nothing writes any more', () => {
    // NOTHING WRITES casting OR casting_changes SINCE MIGRATION 0190, so there is no writer to drive. What is worth
    // asserting is the panel_layouts property: the columns are NOT NULL with no SQL default, so a future INSERT that
    // forgets the stamp fails loudly rather than storing UTC.
    expect(() =>
      h.t.client.sqlite.prepare(`INSERT INTO casting (role, project, changed_by_kind, changed_by_id) VALUES ('secretary', 'no-stamp', 'human', '${THE_TEST_OFFICES_OWNER.id}')`).run(),
    ).toThrow(/NOT NULL/i)
    expect(() =>
      h.t.client.sqlite.prepare(`INSERT INTO casting_changes (role, project, by_kind, by_id, decisions, after) VALUES ('secretary', 'no-stamp', 'human', '${THE_TEST_OFFICES_OWNER.id}', '[]', '{}')`).run(),
    ).toThrow(/NOT NULL/i)
    const before = new Date()
    h.t.client.sqlite
      .prepare(`INSERT INTO casting (role, project, changed_at, changed_by_kind, changed_by_id) VALUES ('secretary', 'stamped', ?, 'human', '${THE_TEST_OFFICES_OWNER.id}')`)
      .run(localStamp(before))
    expectLocal('casting.changed_at', stored("SELECT changed_at FROM casting WHERE project = 'stamped'"), before)
    h.t.client.sqlite
      .prepare(`INSERT INTO casting_changes (role, project, at, by_kind, by_id, decisions, after) VALUES ('secretary', 'stamped', ?, 'human', '${THE_TEST_OFFICES_OWNER.id}', '[]', '{}')`)
      .run(localStamp(before))
    expectLocal('casting_changes.at', stored("SELECT at FROM casting_changes WHERE project = 'stamped'"), before)
  })

  it('addPreviewRoot stores local updated_at when a directory is added by hand', async () => {
    // Criterion U4's hand-added preview root, added by migration 0165. It has no SQL default, so
    // removing the stamp from `addPreviewRoot` makes the INSERT fail rather than store UTC.
    const { addPreviewRoot } = await import('../src/server/lib/preview-roots.ts')
    const directory = tree({ 'note.txt': 'a note\n' })
    const before = new Date()
    addPreviewRoot({ path: directory, why: 'the test adds it by hand' }, 'default', HUMAN)
    expectLocal(
      'preview_root_additions.updated_at',
      stored('SELECT updated_at FROM preview_root_additions WHERE only_row = 1'),
      before,
    )
  })

  it('setThePriceTable stores local updated_at when the table is set', async () => {
    // Criterion U3's price table, added by migration 0177. It has no SQL default, so removing the
    // stamp from `setThePriceTable` makes the INSERT fail rather than store UTC.
    const { setThePriceTable } = await import('../src/server/lib/price-table.ts')
    const before = new Date()
    setThePriceTable({ currency: 'GBP', prices: { 'stamp-model': { input: 1, output: 2, cachedInput: 0.1 } } }, HUMAN)
    expectLocal('price_table.updated_at', stored('SELECT updated_at FROM price_table WHERE only_row = 1'), before)
  })

  it('setTheQuickInputList and clearTheQuickInputList store local updated_at', async () => {
    // The owner's list of quick inputs, migration 0272. It has no SQL default, so removing the stamp from the one
    // writer both share makes the INSERT fail, or the UPDATE keep the old stamp, rather than store UTC.
    const { clearTheQuickInputList, setTheQuickInputList } = await import('../src/server/lib/quick-inputs.ts')
    // Make a missing stamp visible even when the writes land in the same second.
    h.t.client.sqlite.prepare("UPDATE quick_input_list SET updated_at = '2000-01-01 00:00:00' WHERE only_row = 1").run()
    const beforeSet = new Date()
    setTheQuickInputList(['/context'], HUMAN)
    expectLocal('quick_input_list.updated_at', stored('SELECT updated_at FROM quick_input_list WHERE only_row = 1'), beforeSet)
    h.t.client.sqlite.prepare("UPDATE quick_input_list SET updated_at = '2000-01-01 00:00:00' WHERE only_row = 1").run()
    const beforeClear = new Date()
    clearTheQuickInputList(HUMAN)
    expectLocal('quick_input_list.updated_at', stored('SELECT updated_at FROM quick_input_list WHERE only_row = 1'), beforeClear)
  })

  it('setThisOfficesAnswer stores local updated_at when the person changes a door', async () => {
    // What the person's grant carries in this office, migration 0287. It has no SQL default, so removing the stamp
    // from `setThisOfficesAnswer` makes the INSERT fail rather than store UTC.
    const { setThisOfficesAnswer } = await import('../src/server/lib/what-the-grant-carries.ts')
    h.t.client.sqlite.prepare('DELETE FROM what_the_grant_carries').run()
    const before = new Date()
    setThisOfficesAnswer('office.set-quick-inputs', 'may-press', HUMAN)
    expectLocal(
      'what_the_grant_carries.updated_at',
      stored("SELECT updated_at FROM what_the_grant_carries WHERE door = 'office.set-quick-inputs'"),
      before,
    )
  })

  it('the notice batch hold and accept write the local clock with its offset', async () => {
    // THE TWO STAMP COLUMNS MIGRATION 0302 ADDED. The hold is written by holdNoticeDeliveries when
    // the message door files the delivery; the acceptance by acceptNoticeBatch when a prepared work
    // turn is taken. Both are driven through those writers here, so a writer that fell back to UTC
    // or lost its offset fails, and adding the column to the inventory alone would not have caught it.
    const batches = await import('../src/holder/notice-batches.ts')
    const { asNoticeRulesDoor } = await import('../src/server/lib/notice-rules-door.ts')
    const { writeASystemLineToOne } = await import('../src/server/lib/groups.ts')
    const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
    const { MESSAGE_CENTRE } = await import('../src/shared/workspaces.ts')
    const { moleOffice } = await import('../src/shared/participants.ts')
    const recipient = { kind: 'person' as const, id: HUMAN.id }
    asNoticeRulesDoor(() =>
      h.t.api.createRecord({
        workspaceId: MESSAGE_CENTRE,
        kind: 'notice_rules',
        title: 'Notice choices for the stamp test',
        data: {
          recipient,
          mutedKinds: [],
          batchedKinds: ['theBroadcastIsDue'],
          because: 'Hold a made-up notice so its stamps can be checked.',
        },
        actor: HUMAN,
      }),
    )

    const beforeHold = new Date()
    const held = writeASystemLineToOne(
      recipient,
      MESSAGE_CENTRE,
      SYSTEM_LINES.theBroadcastIsDue('Made-up report time'),
      { type: 'system', id: moleOffice().id },
    )
    const heldAt = stored(
      'SELECT b.held_at FROM notice_batch_deliveries b JOIN message_delivery d ON d.id = b.delivery_id ' +
        'WHERE d.message_id = ? AND d.recipient_kind = ? AND d.recipient_id = ?',
      held.id,
      recipient.kind,
      recipient.id,
    )
    expectLocal('notice_batch_deliveries.held_at', heldAt, beforeHold)
    expectTheClocksInstantForm('notice_batch_deliveries.held_at', heldAt, beforeHold)

    const prepared = batches.prepareNoticeBatch(recipient, 'stamp-columns-turn')
    expect(batches.pendingNoticeBatches(recipient)).toEqual([expect.objectContaining({ count: 1 })])
    expect(
      h.t.client.sqlite
        .prepare('SELECT accepted_at FROM notice_batch_turns WHERE id = ? AND recipient_kind = ? AND recipient_id = ?')
        .pluck()
        .get(prepared.turn, recipient.kind, recipient.id),
      'a prepared turn has not accepted anything yet',
    ).toBeNull()

    const beforeAccept = new Date()
    batches.acceptNoticeBatch(recipient, prepared.turn)
    const acceptedAt = stored(
      'SELECT accepted_at FROM notice_batch_turns WHERE id = ? AND recipient_kind = ? AND recipient_id = ?',
      prepared.turn,
      recipient.kind,
      recipient.id,
    )
    expectLocal('notice_batch_turns.accepted_at', acceptedAt, beforeAccept)
    expectTheClocksInstantForm('notice_batch_turns.accepted_at', acceptedAt, beforeAccept)
  })

  it('migration 0272 stamps the list of quick inputs it starts with with local time', () => {
    // THE ONE STAMP A MIGRATION WRITES ITSELF: SQLite's strftime(..., 'now', 'localtime'), run in this file's own zone.
    // The row is removed first, because the migration's INSERT OR IGNORE leaves a row already there as it is.
    const sqlite = h.t.client.sqlite
    sqlite.prepare('DELETE FROM quick_input_list').run()
    const migration = readFileSync(new URL('../drizzle/0272_quick_inputs_the_owners_list_and_the_asks.sql', import.meta.url), 'utf8')
    const before = new Date()
    for (const statement of migration.split('--> statement-breakpoint')) sqlite.exec(statement)
    expect(stored('SELECT updated_by_kind || \'/\' || updated_by_id FROM quick_input_list WHERE only_row = 1')).toBe('migration/0272')
    expectLocal('quick_input_list.updated_at', stored('SELECT updated_at FROM quick_input_list WHERE only_row = 1'), before)
  })

  it('createIntent stores local time in created_at', async () => {
    // The one stamp on `planning_intents`, driven through the real write path. It matters more here
    // than the column count suggests: the words on this row are often about a day or a week, and a
    // row that says it was written on the wrong day is a row a person cannot place. Remove
    // `createdAt: nowStamp()` from `createIntent` and the column has no SQL default, so the INSERT
    // fails outright rather than storing UTC — which is the outcome this file is asking for
    // everywhere.
    const planning = await import('../src/server/lib/planning.ts')

    const before = new Date()
    const made = planning.createIntent({ said: 'sometime next week, if the rig is free' }, HUMAN)

    expectLocal(
      'planning_intents.created_at',
      stored('SELECT created_at FROM planning_intents WHERE id = ?', made.intent.id),
      before,
    )
    // The words are stored as typed, and nothing was read from them. Asserted here because a run
    // that quietly wrote a different row would still have found a local stamp somewhere.
    expect(stored('SELECT said FROM planning_intents WHERE id = ?', made.intent.id)).toBe(
      'sometime next week, if the rig is free',
    )
  })

  it('making a contact group and moving a contact store local time', async () => {
    // ALL THREE STAMPS ON THE THREE TABLES MIGRATIONS 0127 AND 0161 ADD, driven through the real
    // write paths. None has a SQL default, so removing `nowStamp()` from any writer fails the
    // INSERT outright rather than storing UTC — the outcome this file asks for everywhere.
    const contacts = await import('../src/server/lib/contacts.ts')
    const me = { kind: 'person' as const, id: HUMAN.id }

    const before = new Date()
    const group = contacts.makeAContactGroup(me, 'Builders', 'agent')
    expectLocal(
      'contact_groups.created_at',
      stored('SELECT created_at FROM contact_groups WHERE key = ?', group.key),
      before,
    )

    contacts.moveAContact(
      me,
      [{ key: 'agent:builder-x', kind: 'agent', id: 'builder-x', role: 'worker', retired: false }],
      'agent:builder-x',
      group.key,
    )
    expectLocal(
      'contact_placements.placed_at',
      stored('SELECT placed_at FROM contact_placements WHERE contact = ?', 'agent:builder-x'),
      before,
    )

    contacts.setAContactGroupCollapsed(me, 'retired', false)
    expectLocal(
      'contact_group_collapses.set_at',
      stored('SELECT set_at FROM contact_group_collapses WHERE group_key = ?', 'retired'),
      before,
    )
  })

  // -------------------------------------------------------------------------- the hole itself

  it('a stamp column left to its SQL default stores UTC, or has no default and refuses the row', () => {
    // THE REASON THIS FILE EXISTS, stated as a measurement rather than as a warning, and written
    // so that it keeps its meaning whichever way the schema goes.
    //
    // While the five defaults stand, this proves what a forgetful INSERT actually stores: a UTC
    // string, in a column that means local time, behind a successful write. Drop the defaults —
    // which is what this file is asking for — and the same INSERT throws NOT NULL instead, and
    // this test proves THAT, which is the outcome `reader_anchors.last_seen_at` already has.
    const a = h.t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'A record to link from', actor: HUMAN }).id
    const b = h.t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'A record to link to', actor: HUMAN }).id

    const forgetful: { key: string; insert: () => void; read: () => string }[] = [
      {
        key: 'records.created_at',
        insert: () =>
          h.t.client.sqlite.prepare('INSERT INTO records (id, kind, title) VALUES (?, ?, ?)').run('r1', 'note', 'r1'),
        read: () => stored('SELECT created_at FROM records WHERE id = ?', 'r1'),
      },
      {
        key: 'links.created_at',
        insert: () =>
          h.t.client.sqlite
            .prepare('INSERT INTO links (id, from_id, to_id, type) VALUES (?, ?, ?, ?)')
            .run('l1', a, b, 'relates_to'),
        read: () => stored('SELECT created_at FROM links WHERE id = ?', 'l1'),
      },
      {
        key: 'changes.at',
        insert: () =>
          h.t.client.sqlite
            .prepare('INSERT INTO changes (id, record_id, op, actor_type, actor_id) VALUES (?, ?, ?, ?, ?)')
            .run('c1', a, 'update', 'human', THE_TEST_OFFICES_OWNER.id),
        read: () => stored('SELECT at FROM changes WHERE id = ?', 'c1'),
      },
    ]

    for (const { key, insert, read } of forgetful) {
      const column = stampColumnsInTheDatabase().find((c) => c.key === key)
      expect(column, `${key} is not in the database any more`).toBeDefined()

      const when = new Date()
      if (column?.column.dflt_value === null) {
        expect(insert, `${key} has no default, so an INSERT that omits it must fail`).toThrow(/NOT NULL/i)
        continue
      }
      insert()
      expect(
        stampWrittenIn(read(), when),
        `${key} defaults to ${column?.column.dflt_value}. If this is no longer 'utc' the default has ` +
          'changed and the reason this file exists has changed with it.',
      ).toBe('utc')
    }
  })
})
