// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START SAYS WHAT EACH PART OF ITS MIGRATIONS CHECK TOOK.
 *
 * On the live office the migrations check is almost the whole start: 76 s of an 83 s start on 17 November, and 278 s
 * of a 288 s start on 18 November, with nothing saying which part grew. The first start line names the check as one
 * step, and a start that refuses never prints that line at all. So the check gets its own second line, from the same
 * `performance.now()` clock, printed when it serves, refuses or throws.
 *
 * WHAT THIS FILE HOLDS:
 *
 *   1. the normal path: every part and every data step, by the names the code declares, in the order they ran, each
 *      with `N ms`, and the decision the same as a call with no timing at all;
 *   2. a step in `THE_PREVIEW_SEAM` throws: the refusal is byte for byte today's, and the line still names the parts
 *      that ended and the part that did not;
 *   3. the refused path, where a step would write: the decision is today's and the line is still made;
 *   4. a clock and a recorder that throw: the decision is unchanged and the short line says the split could not be said;
 *   5. the line holds no path: the test database's own name, its folder and the copy's folder prefix never appear.
 *
 * No case reads a duration or has a time limit. They read names, order and the `N ms` form, so the same answer is
 * expected on a fast machine and a busy one. The names of data steps are read from `THE_STEPS` and never copied here.
 */
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  migrateInPlace,
  prepareToServe,
  startTheIntegrityCheckBeside,
  THE_INTEGRITY_WORKER_SEAM,
  THE_MIGRATIONS_CHECK_PARTS,
  THE_PREVIEW_SEAM,
  THE_STEPS,
} from '../src/server/db/migrate.ts'
import {
  theMigrationsCheckLine,
  theMigrationsCheckTiming,
  THE_MIGRATIONS_CHECK_LINE,
  THE_MIGRATIONS_CHECK_NOT_SAID,
  type MigrationsCheckTiming,
} from '../src/server/lib/start-steps.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS = join(REPO, 'drizzle')
const AS_SHIPPED = { ...THE_PREVIEW_SEAM }
const INTEGRITY_AS_SHIPPED = { ...THE_INTEGRITY_WORKER_SEAM }
const escaped = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

interface Scratch {
  dir: string
  file: string
  db: Database.Database
}

const open: Scratch[] = []

afterEach(() => {
  vi.restoreAllMocks()
  Object.assign(THE_INTEGRITY_WORKER_SEAM, INTEGRITY_AS_SHIPPED)
  Object.assign(THE_PREVIEW_SEAM, AS_SHIPPED)
  for (const s of open.splice(0)) {
    if (s.db.open) s.db.close()
    rmSync(s.dir, { recursive: true, force: true })
  }
})

/**
 * A fully migrated database holding one authored record, with nothing left to migrate.
 *
 * It takes the branch `prepareToServe` takes for a real corpus: the record is not a fixture, so the check is measured
 * against a copy rather than migrated in place.
 */
function aSettledDatabase(name: string, fileName = 'office.db'): Scratch {
  const dir = aTestDatabaseFolder(`migrations-check-timing-${name}`)
  const file = join(dir, fileName)
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  open.push({ dir, file, db })
  migrateInPlace(db, MIGRATIONS)
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      `VALUES ('note-1', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ` +
      "'note', 'An invented note', NULL, '{}', 'authored')",
  ).run()
  // MIGRATED AGAIN, so the record has its baseline revision and the database genuinely has nothing to do.
  migrateInPlace(db, MIGRATIONS)
  return { dir, file, db }
}

/** A record with no revision, so the preview finds one BASELINE revision it would write and the start refuses. */
function addARecordWithNoRevision(db: Database.Database): void {
  db.prepare(
    'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
      `VALUES ('note-2', 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-07-01 09:00:00', '2026-07-01 09:00:00', ` +
      "'note', 'A second invented note', NULL, '{}', 'authored')",
  ).run()
}

/** Where `part` is said in the line, or -1. */
function whereSaid(line: string, part: string): number {
  return line.indexOf(`${part} `)
}

describe('the migrations check says what each part took', () => {
  it('names every part and every data step from the code, in order, and decides as it does without timing', () => {
    const s = aSettledDatabase('normal')
    const decide = (timing?: MigrationsCheckTiming) => prepareToServe(s.db, MIGRATIONS, timing)

    const timing = theMigrationsCheckTiming()
    const withTiming = decide(timing)
    const asToday = decide()

    expect(withTiming.serve, withTiming.serve ? '' : withTiming.refusal).toBe(true)
    expect(asToday.serve, asToday.serve ? '' : asToday.refusal).toBe(true)
    if (withTiming.serve && asToday.serve) expect(withTiming.report).toBe(asToday.report)

    const line = theMigrationsCheckLine(timing)
    expect(line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `), line).toBe(true)

    // THE PARTS, in the order a check on a database holding work begins them. The in-memory copy is the one this
    // fixture takes, so the file copy's own parts are not expected here.
    const parts = [
      THE_MIGRATIONS_CHECK_PARTS.theStrangerCheck,
      THE_MIGRATIONS_CHECK_PARTS.whatTheFileHolds,
      THE_MIGRATIONS_CHECK_PARTS.theIntegrityStarted,
      THE_MIGRATIONS_CHECK_PARTS.theCopyHeldInMemory,
      THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint,
      THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated,
      THE_MIGRATIONS_CHECK_PARTS.theJournalChecked,
      THE_MIGRATIONS_CHECK_PARTS.theWriteLockTaken,
      THE_MIGRATIONS_CHECK_PARTS.theStartRead,
      THE_MIGRATIONS_CHECK_PARTS.theSchemaMigrationsApplied,
      THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint,
      THE_MIGRATIONS_CHECK_PARTS.theOutcomeReports,
      THE_MIGRATIONS_CHECK_PARTS.theIntegrityWaited,
    ]
    let before = -1
    for (const part of parts) {
      const at = whereSaid(line, part)
      expect(at, `${part} is not named with a time in:\n${line}`).toBeGreaterThan(-1)
      expect(line, `${part} has no N ms after it in:\n${line}`).toMatch(
        new RegExp(`${escaped(part)} \\d+ ms`),
      )
      expect(at, `${part} is named out of order in:\n${line}`).toBeGreaterThan(before)
      before = at
    }

    // EVERY DATA STEP IS NAMED, by the table's own name for it, between the copy starting and its second
    // fingerprint. Their order is the order the code runs them, which is not the table's order; the names are the
    // table's, and none is named by words typed here.
    const schemaAt = whereSaid(line, THE_MIGRATIONS_CHECK_PARTS.theSchemaMigrationsApplied)
    const secondAt = whereSaid(line, THE_MIGRATIONS_CHECK_PARTS.theSecondFingerprint)
    for (const step of THE_STEPS) {
      const at = whereSaid(line, step.name)
      expect(at, `${step.name} is not named with a time in:\n${line}`).toBeGreaterThan(-1)
      expect(line, `${step.name} has no N ms after it in:\n${line}`).toMatch(
        new RegExp(`${escaped(step.name)} \\d+ ms`),
      )
      expect(at, `${step.name} is outside the copy's migration in:\n${line}`).toBeGreaterThan(schemaAt)
      expect(at, `${step.name} is outside the copy's migration in:\n${line}`).toBeLessThan(secondAt)
    }

    // 13r'S NORMAL-ANSWER CONDITION: the line has both of the integrity check's numbers.
    expect(line).toMatch(
      new RegExp(
        `${escaped('the integrity check ran on its own connection for')} \\d+ ms, and the start waited \\d+ ms for it`,
      ),
    )
  })

  it("keeps the integrity check's answer on its connection fallback, and says the two numbers it has", () => {
    const s = aSettledDatabase('integrity-on-this-connection')
    // A memory database has no second connection to open a worker on, so the check runs on this connection: the
    // fallback path 13r asked to see unchanged.
    const image = s.db.serialize()
    // The flags a serialized WAL database carries, cleared as `copyIntoMemory` clears them.
    if (image[18] === 2) image[18] = 1
    if (image[19] === 2) image[19] = 1
    const memory = new Database(image)
    try {
      const decideInTurn = (timings: (MigrationsCheckTiming | undefined)[]) =>
        timings.map((timing) => prepareToServe(memory, MIGRATIONS, timing))
      const timing = theMigrationsCheckTiming()
      const decisions = decideInTurn([undefined, timing])
      const asToday = decisions[0]!
      const withTiming = decisions[1]!

      expect(asToday.serve, asToday.serve ? '' : asToday.refusal).toBe(true)
      expect(withTiming.serve, withTiming.serve ? '' : withTiming.refusal).toBe(true)
      if (asToday.serve && withTiming.serve) expect(withTiming.report).toBe(asToday.report)

      const line = theMigrationsCheckLine(timing)
      expect(line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `), line).toBe(true)
      expect(line).toMatch(
        new RegExp(
          `${escaped('the integrity check ran on this connection for')} \\d+ ms, and the start waited the same \\d+ ms for it`,
        ),
      )
    } finally {
      memory.close()
    }
  })

  it('still makes a line when a step throws, and the refusal is byte for byte the one without timing', () => {
    const s = aSettledDatabase('failed')
    const aStepThatFallsOver = (): never => {
      throw new Error('a step that falls over')
    }
    THE_PREVIEW_SEAM.migrate = aStepThatFallsOver
    // THE TWO CALLS ARE MADE FROM ONE LINE, so the stack in the refusal names the same caller both times: the
    // refusal contains a trace, and a trace is part of its text.
    const decideInTurn = (timings: (MigrationsCheckTiming | undefined)[]) =>
      timings.map((timing) => prepareToServe(s.db, MIGRATIONS, timing))
    const timing = theMigrationsCheckTiming()
    const decisions = decideInTurn([undefined, timing])
    const asToday = decisions[0]!
    const withTiming = decisions[1]!

    expect(asToday.serve).toBe(false)
    expect(withTiming.serve).toBe(false)
    if (!asToday.serve && !withTiming.serve) expect(withTiming.refusal).toBe(asToday.refusal)

    const line = theMigrationsCheckLine(timing)
    expect(line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `), line).toBe(true)
    expect(line).toMatch(new RegExp(`${escaped(THE_MIGRATIONS_CHECK_PARTS.theCopyMigrated)} did not end`))
    // The parts that ended before the throw are still named with their time.
    expect(line).toMatch(new RegExp(`${escaped(THE_MIGRATIONS_CHECK_PARTS.theCopyHeldInMemory)} \\d+ ms`))
    expect(line).toMatch(new RegExp(`${escaped(THE_MIGRATIONS_CHECK_PARTS.theFirstFingerprint)} \\d+ ms`))
  })

  it('makes a line on the refused path, and the decision is the one without timing', () => {
    const s = aSettledDatabase('refused')
    addARecordWithNoRevision(s.db)
    const decideInTurn = (timings: (MigrationsCheckTiming | undefined)[]) =>
      timings.map((timing) => prepareToServe(s.db, MIGRATIONS, timing))
    const timing = theMigrationsCheckTiming()
    const decisions = decideInTurn([undefined, timing])
    const asToday = decisions[0]!
    const withTiming = decisions[1]!

    expect(asToday.serve).toBe(false)
    expect(withTiming.serve).toBe(false)
    if (!asToday.serve && !withTiming.serve) expect(withTiming.refusal).toBe(asToday.refusal)

    const line = theMigrationsCheckLine(timing)
    expect(line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `), line).toBe(true)
    // The revisions step is the one that wrote on the copy, so it ended and is named with its time.
    expect(line).toMatch(new RegExp(`${escaped('revisions')} \\d+ ms`))
  })

  it('leaves the decision alone when the clock or the recorder throws, and says the split could not be said', () => {
    const s = aSettledDatabase('throwing')
    const decide = (timing?: MigrationsCheckTiming) => prepareToServe(s.db, MIGRATIONS, timing)
    const asToday = decide()
    expect(asToday.serve, asToday.serve ? '' : asToday.refusal).toBe(true)

    const aClockThatThrows = theMigrationsCheckTiming(() => {
      throw new Error('/a/path/that/must/not/be/said')
    })
    const withTheClock = decide(aClockThatThrows)
    expect(withTheClock.serve, withTheClock.serve ? '' : withTheClock.refusal).toBe(true)
    if (asToday.serve && withTheClock.serve) expect(withTheClock.report).toBe(asToday.report)
    const clockLine = theMigrationsCheckLine(aClockThatThrows)
    expect(clockLine.startsWith(`${THE_MIGRATIONS_CHECK_NOT_SAID} (`), clockLine).toBe(true)
    expect(clockLine).not.toContain('/a/path/that/must/not/be/said')

    const aRecorderThatThrows: MigrationsCheckTiming = {
      began() {
        throw new Error('/a/path/that/must/not/be/said')
      },
      ended() {
        throw new Error('/a/path/that/must/not/be/said')
      },
      note() {
        throw new Error('/a/path/that/must/not/be/said')
      },
      line(): string {
        throw new Error('/a/path/that/must/not/be/said')
      },
    }
    const withTheRecorder = decide(aRecorderThatThrows)
    expect(withTheRecorder.serve, withTheRecorder.serve ? '' : withTheRecorder.refusal).toBe(true)
    if (asToday.serve && withTheRecorder.serve) expect(withTheRecorder.report).toBe(asToday.report)
    const recorderLine = theMigrationsCheckLine(aRecorderThatThrows)
    expect(recorderLine.startsWith(`${THE_MIGRATIONS_CHECK_NOT_SAID} (`), recorderLine).toBe(true)
    expect(recorderLine).not.toContain('/a/path/that/must/not/be/said')
  })

  it('holds no path, no file name and no copy folder name', () => {
    const s = aSettledDatabase('no-path', 'a-name-that-must-not-be-said.db')
    THE_PREVIEW_SEAM.inMemoryLimit = 0
    // A folder a crashed preview left behind, old enough to be removed. Its name is a path and must not appear.
    const leftover = join(s.dir, '.migration-preview-AbC123')
    mkdirSync(leftover)
    writeFileSync(join(leftover, 'copy.db'), 'invented bytes')
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    utimesSync(join(leftover, 'copy.db'), twoHoursAgo, twoHoursAgo)
    utimesSync(leftover, twoHoursAgo, twoHoursAgo)

    const timing = theMigrationsCheckTiming()
    const decision = prepareToServe(s.db, MIGRATIONS, timing)
    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)

    const line = theMigrationsCheckLine(timing)
    expect(line.startsWith(`${THE_MIGRATIONS_CHECK_LINE} `), line).toBe(true)
    // The file path's own parts ran, so this is the line that could have carried the copy's folder.
    expect(line).toMatch(new RegExp(`${escaped(THE_MIGRATIONS_CHECK_PARTS.theLeftoversRemoved)} \\d+ ms`))
    expect(line).toMatch(new RegExp(`${escaped(THE_MIGRATIONS_CHECK_PARTS.theFileCopied)} \\d+ ms`))
    expect(line).not.toContain(basename(s.file))
    expect(line).not.toContain(dirname(s.file))
    expect(line).not.toContain('a-name-that-must-not-be-said')
    expect(line).not.toContain('.migration-preview-')
    expect(line).not.toContain('AbC123')
    expect(line).not.toContain('copy.db')
  })

  it('reports the check edges on the worker clock, without including worker startup', () => {
    const s = aSettledDatabase('worker-edges')
    THE_INTEGRITY_WORKER_SEAM.start = (source, options) => new Worker(
      `let reading = 100; Object.defineProperty(performance, 'now', { value: () => { const at = reading; reading += 7; return at } });\n${source}`,
      options,
    )
    let mainReading = 10000
    vi.spyOn(performance, 'now').mockImplementation(() => { mainReading += 1000; return mainReading })
    const timing = theMigrationsCheckTiming()
    const check = startTheIntegrityCheckBeside(s.db, timing)
    expect(check.wait()).toBeNull()
    expect(theMigrationsCheckLine(timing)).toContain(
      'the integrity check ran on its own connection for 7 ms, and the start waited 1000 ms for it afterwards',
    )
    expect(theMigrationsCheckLine(timing)).not.toContain('ran beside the preview for')
  })

  it('keeps the worker answer and start decision when either thread clock throws', () => {
    const s = aSettledDatabase('worker-clock-fails')
    const decide = (timing?: MigrationsCheckTiming) => prepareToServe(s.db, MIGRATIONS, timing)
    const working = decide(theMigrationsCheckTiming())
    const checkWorking = startTheIntegrityCheckBeside(s.db, theMigrationsCheckTiming()).wait()
    THE_INTEGRITY_WORKER_SEAM.start = (source, options) => new Worker(
      `Object.defineProperty(performance, 'now', { value: () => { throw new Error('clock failed') } });\n${source}`,
      options,
    )
    vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock failed') })
    const checkBroken = startTheIntegrityCheckBeside(s.db, theMigrationsCheckTiming()).wait()
    const broken = decide(theMigrationsCheckTiming())
    expect(checkBroken).toBe(checkWorking)
    expect(broken).toEqual(working)
    const withoutTiming = decide()
    expect(withoutTiming).toEqual(working)
  })

  it('keeps this connection’s answer and start decision when the clock throws', () => {
    const s = aSettledDatabase('local-clock-fails')
    const image = s.db.serialize()
    if (image[18] === 2) image[18] = 1
    if (image[19] === 2) image[19] = 1
    const memory = new Database(image)
    try {
      const decide = (timing?: MigrationsCheckTiming) => prepareToServe(memory, MIGRATIONS, timing)
      const working = decide(theMigrationsCheckTiming())
      const checkWorking = startTheIntegrityCheckBeside(memory, theMigrationsCheckTiming()).wait()
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock failed') })
      expect(startTheIntegrityCheckBeside(memory, theMigrationsCheckTiming()).wait()).toBe(checkWorking)
      expect(decide(theMigrationsCheckTiming())).toEqual(working)
      clock.mockClear()
      expect(decide()).toEqual(working)
      expect(clock).not.toHaveBeenCalled()
    } finally {
      memory.close()
    }
  })

  it('preserves the integrity refusal when the check and the clock both throw', () => {
    const sqlite = {
      name: ':memory:', memory: true,
      pragma: () => { throw new Error('integrity check failed') },
    } as unknown as Database.Database
    const working = startTheIntegrityCheckBeside(sqlite, theMigrationsCheckTiming()).wait()
    expect(working).toContain('integrity check failed')
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock failed') })
    expect(startTheIntegrityCheckBeside(sqlite, theMigrationsCheckTiming()).wait()).toBe(working)
    clock.mockClear()
    expect(startTheIntegrityCheckBeside(sqlite).wait()).toBe(working)
    expect(clock).not.toHaveBeenCalled()
  })

  it('keeps the startup refusal when the local check throws and the clock fails', () => {
    const s = aSettledDatabase('local-check-fails')
    const image = s.db.serialize()
    if (image[18] === 2) image[18] = 1
    if (image[19] === 2) image[19] = 1
    const memory = new Database(image)
    try {
      const pragma = memory.pragma.bind(memory)
      vi.spyOn(memory, 'pragma').mockImplementation((source, options) => {
        if (source === 'integrity_check') throw new Error('integrity check failed')
        return pragma(source, options)
      })
      const decide = (timing?: MigrationsCheckTiming) => prepareToServe(memory, MIGRATIONS, timing)
      const working = decide(theMigrationsCheckTiming())
      expect(working.serve).toBe(false)
      if (!working.serve) expect(working.refusal).toContain('integrity check failed')
      vi.spyOn(performance, 'now').mockImplementation(() => { throw new Error('clock failed') })
      expect(decide(theMigrationsCheckTiming())).toEqual(working)
      expect(decide()).toEqual(working)
    } finally {
      memory.close()
    }
  })

})
