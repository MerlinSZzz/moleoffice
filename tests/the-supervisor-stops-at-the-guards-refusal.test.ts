// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SUPERVISOR STOPS AT THE GUARD'S REFUSAL, COUNTS A LONG EXIT-1 AS A FAILURE, AND SAYS THE
 * OFFICE WAS DOWN.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM THIS HOLDS SHUT, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `7-lQDWANdVAn`, 12 September 2026. From 12:15 to 12:29 the start guard refused to serve
 * the database — a migration step had written silently — and the API exited 1 after about fourteen
 * seconds. tools/serve-dev.mjs started it again every fifteen seconds for fourteen minutes. Its
 * own log read:
 *
 *   `[dev] the server stopped on its own (exit code 1) after 14.9s — 1 in a row. Starting it again
 *    in 0.5s.`
 *
 * The count read "1 in a row" every time, so the back-off that doubles to half a minute never came.
 * Two things were wrong. First, the count was cleared by a ten-second clock while the child was
 * still alive, and a refusal that arrives at fourteen seconds crosses that clock every time.
 * Second, the supervisor had no way to recognise the guard's refusal and no reason to stop: it
 * treated a refusal about the database as an ordinary crash and restarted into it. Nothing outside
 * the log said the office was down, so the secretary learned it from a failed script.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * The real supervisor is driven over a scratch checkout, the way
 * tests/the-built-office-is-supervised.test.ts drives it: `serveDev` is called with a checkout of
 * its own and a port and database of its own, and the children it starts are small files written
 * into that copy. Nothing in this checkout is touched.
 *
 * 1. **A refused start is started once, and not again until a watched file changes.** The child
 *    writes the guard's own words to stderr and exits 1. The supervisor must log the refusal once,
 *    write `.logs/last-refusal.txt`, and leave the start count at one; touching a file the server
 *    is built from must then start it a second time.
 * 2. **A start that ends in exit 1 is a failure whatever its duration.** The child lives one
 *    second, past the test’s quarter-second health clock, and then exits 1. The
 *    count must say 2 in a row and then 3. Restoring the old reset based only on elapsed time makes
 *    every attempt read "1 in a row", and this goes red.
 * 3. **After a refusal, the next start that answers files one note naming the refusal and the down
 *    time.** The real server is pointed at a database that is not Mole Office's, so the guard
 *    refuses it with `REFUSING TO USE`. The database is then removed and a server file is touched,
 *    so the next start creates a fresh database and answers. The supervisor must file exactly one
 *    note naming the refusal's first line and how long the office was down, and take the refusal
 *    file back.
 * 4. **After a `REFUSING TO SERVE`, the supervisor starts itself again when the migration lands.**
 *    Problem `nxDRPQ0IZcOU`, 13 September 2026: the guard refused a database behind the code, the
 *    supervisor stopped, the migration then ran, and no source file changed, so the API stayed down
 *    until a person touched a file. The scratch database is behind the scratch checkout's own
 *    journal; after two short look intervals the start count must still be one; then the missing row is written
 *    as drizzle writes it, and no file is touched; the child must be started a second time and the
 *    supervisor's log must name the landing and the time.
 * 5. **After a `REFUSING TO USE`, the same wait and the same row leave the start count at one.** A
 *    damaged or foreign database is not fixed by a migration landing, so that refusal is not retried
 *    and the log says nothing about a landing.
 * F. **The look and the guard disagree.** Inspector refusal `fB2IAu88rCm0`, invariant 1: the
 *    scratch database has every schema migration, but the child refuses on every start as the guard
 *    does when its check did not finish. The look starts it once, then the disagreement stops it.
 *    Each watched change permits a fresh start and one look start, with each refusal written.
 * G. **The lock look and acquisition disagree.** With no lock file, the real lock function still
 *    refuses when the child cannot read its own start time. The look must not repeat that start.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS FILE IS PROVED BY
 * ---------------------------------------------------------------------------------------
 *
 * Each is planted alone and the whole file is run:
 *
 *   · the supervisor's recognition of the guard's refusal removed — test 1 goes red, because the
 *     child is started again and again and the start count is more than one before any file moves;
 *   · the ten-second counter reset put back — test 2 goes red, because every attempt ends after
 *     the clock and reads "1 in a row" instead of growing;
 *   · the look for a landed migration removed — the serve-kind test goes red, because the second
 *     start never comes;
 *   · the kind check removed so every refusal is looked at — the use-kind test goes red, because the
 *     foreign database is started into when the row lands.
 *   · F. start the migration look on every `REFUSING TO SERVE`, as pass 2 did — F goes red because
 *     the start count grows past two during a wait of two look intervals plus a margin;
 *   · G. start the lock look on every exit 75 — G goes red because acquisition cannot read the
 *     child's own start time, even though the absent lock keeps being read as free.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { cpSync, existsSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { serveDev } from '../tools/serve-dev.mjs'
import { THE_GUARD_REFUSALS_BEGIN } from '../src/config/guard-refusal.mjs'
import { theRefusalFileIn } from '../src/config/supervisor-trouble.mjs'
import { THE_MIGRATION_JOURNAL_TABLE } from '../src/config/migration-look.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const THE_TEST_CLOCKS = { goodRun: 250, migrationLook: 200, serviceLockLook: 200, firstBackoff: 100, longestBackoff: 400, healthRequest: 100, healthRetry: 50 }
const A_LONG_FAILED_RUN = 1000
const A_QUIET_MIGRATION_LOOK = 2 * THE_TEST_CLOCKS.migrationLook + 500
const A_QUIET_LOCK_LOOK = 2 * THE_TEST_CLOCKS.serviceLockLook + 500

/** A port the operating system picks and nothing else is holding. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.on('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => fail(new Error('the probe socket reported no port')))
        return
      }
      const { port } = address
      probe.close(() => done(port))
    })
  })
}

/** Wait until `test` is happy, or say what the last reading was. */
async function until(test: () => boolean | Promise<boolean>, what: string, within = 30_000): Promise<void> {
  const stop = Date.now() + within
  while (Date.now() < stop) {
    if (await test()) return
    await sleep(100)
  }
  throw new Error(`${what} did not happen within ${String(within / 1000)}s`)
}

/** A scratch checkout the supervisor can watch and the real server can be started from. */
function aScratchCheckout(): string {
  const dir = aTestDatabaseFolder('supervisor-refusal')
  for (const part of [
    'src',
    'tools',
    'for-agents',
    'drizzle',
    'public',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
  ]) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))
  return dir
}

/** How many lines a file has, and zero when it is not there. */
function howManyLines(file: string): number {
  if (!existsSync(file)) return 0
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '').length
}

/** The supervisor's own lines captured by a test, so one scenario's words never reach another's. */
function aRecorder(): { lines: string[]; say: (line: string) => void; said: (what: string) => number } {
  const lines: string[] = []
  return {
    lines,
    say: (line) => lines.push(line),
    said: (what) => lines.filter((line) => line.includes(what)).length,
  }
}

/**
 * THE CHILD THAT REFUSES IN THE GUARD'S OWN WORDS.
 *
 * It imports a file the server is built from, so touching that file is a change the supervisor has
 * to restart for, and it leaves a line per run so the test can count the starts.
 */
const A_CHILD_THAT_REFUSES = `
import { appendFileSync } from 'node:fs'
import './watched.ts'
const marker = process.env.MOLE_OFFICE_TEST_STARTS
if (typeof marker === 'string') appendFileSync(marker, 'started\\n')
process.stderr.write('Error: ' + String(process.env.MOLE_OFFICE_TEST_REFUSAL) + '\\n')
process.exit(1)
`

/** An ordinary exit 1 after living past the short health clock, as the old 11 s child crossed 10 s. */
const A_CHILD_THAT_CRASHES_SLOWLY = `
import { appendFileSync } from 'node:fs'
const marker = process.env.MOLE_OFFICE_TEST_STARTS
if (typeof marker === 'string') appendFileSync(marker, 'started\\n')
process.stderr.write('Error: an ordinary crash, not the guard\\n')
setTimeout(() => process.exit(1), ${A_LONG_FAILED_RUN})
`

/**
 * A SMALL JOURNAL FOR A SCRATCH CHECKOUT, so the newest migration the code has is a number this test
 * chooses rather than the repository's own. The supervisor reads the newest `when` out of it when it
 * looks for a migration that has landed.
 */
const THE_OLDEST_WHEN = 1_700_000_000_000
const THE_JOURNALS_NEWEST_WHEN = 1_700_000_001_000
const THE_SCRATCH_JOURNAL = {
  version: '7',
  dialect: 'sqlite',
  entries: [
    { idx: 0, version: '6', when: THE_OLDEST_WHEN, tag: '0000_one', breakpoints: true },
    { idx: 1, version: '6', when: THE_JOURNALS_NEWEST_WHEN, tag: '0001_two', breakpoints: true },
  ],
}

/**
 * A SCRATCH DATABASE WITH THE JOURNAL TABLE, as drizzle makes it, holding one row for a migration
 * older than the journal's newest. This is the state a `REFUSING TO SERVE` describes: the database is
 * behind the code.
 */
/**
 * The scratch journal and a file for each of its migrations: the look refuses a journal that names a file the folder
 * does not hold (round 17d), so a journal alone would make it unreadable rather than behind.
 */
function theScratchJournalIn(dir: string): void {
  writeFileSync(join(dir, 'drizzle', 'meta', '_journal.json'), `${JSON.stringify(THE_SCRATCH_JOURNAL)}\n`)
  for (const entry of THE_SCRATCH_JOURNAL.entries) writeFileSync(join(dir, 'drizzle', `${entry.tag}.sql`), `-- ${entry.tag}, a scratch migration\n`)
}

function aDatabaseBehind(database: string, appliedWhen: number): void {
  const sqlite = new Database(database)
  sqlite.exec(
    `CREATE TABLE ${THE_MIGRATION_JOURNAL_TABLE} (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)`,
  )
  sqlite
    .prepare(`INSERT INTO ${THE_MIGRATION_JOURNAL_TABLE} (hash, created_at) VALUES (?, ?)`)
    .run('the row drizzle would have written', appliedWhen)
  sqlite.close()
}

/** THE ROW DRIZZLE WRITES WHEN A MIGRATION LANDS: `created_at` is the migration's own `when`. */
function aMigrationLands(database: string, when: number): void {
  const sqlite = new Database(database)
  sqlite
    .prepare(`INSERT INTO ${THE_MIGRATION_JOURNAL_TABLE} (hash, created_at) VALUES (?, ?)`)
    .run('the row drizzle writes when the migration lands', when)
  sqlite.close()
}

/**
 * ONE SCENE FOR THE LOOK: a child that refuses in the guard's words, a scratch database behind the
 * scratch checkout's journal, then the missing row written as drizzle would write it and no file
 * touched. Returns what the supervisor's own log and the child's start count did.
 */
async function aRefusalThatWaitsForAMigration(kind: 'SERVE' | 'USE'): Promise<{
  startsBeforeTheRow: number
  startsAfterTheRow: number
  theRefusalLine: string
  theLandingLine: string
}> {
  const dir = aScratchCheckout()
  dirs.push(dir)
  theScratchJournalIn(dir)
  const database = join(dir, 'office.db')
  aDatabaseBehind(database, THE_OLDEST_WHEN)
  writeFileSync(join(dir, 'src/server/index.ts'), A_CHILD_THAT_REFUSES)
  writeFileSync(join(dir, 'src/server/watched.ts'), 'export const watched = 1\n')
  const starts = join(dir, 'starts.log')
  const port = await freePort()
  process.env['MOLE_OFFICE_PORT'] = String(port)
  process.env['MOLE_OFFICE_DB'] = database
  process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
  process.env['MOLE_OFFICE_TEST_STARTS'] = starts
  process.env['MOLE_OFFICE_TEST_REFUSAL'] =
    `${THE_GUARD_REFUSALS_BEGIN}${kind} ${database}. It holds 4 records, links and changes, it is NOT up to ` +
    'date, and bringing it up to date would write to it.'
  const said = aRecorder()
  const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
  try {
    await until(() => existsSync(theRefusalFileIn(dir)), 'the refusal file to be written', 30_000)
    // More than two short look intervals; the database is still behind throughout this quiet window.
    await sleep(A_QUIET_MIGRATION_LOOK)
    const startsBeforeTheRow = howManyLines(starts)
    aMigrationLands(database, THE_JOURNALS_NEWEST_WHEN)
    let startsAfterTheRow = startsBeforeTheRow
    if (kind === 'SERVE') {
      await until(() => howManyLines(starts) >= 2, 'the start once the migration landed', 30_000)
    } else {
      // A USE refusal must stay stopped even after the same row lands.
      await sleep(A_QUIET_MIGRATION_LOOK)
    }
    startsAfterTheRow = howManyLines(starts)
    return {
      startsBeforeTheRow,
      startsAfterTheRow,
      theRefusalLine: said.lines.find((line) => line.includes('refused to start')) ?? '',
      theLandingLine: said.lines.find((line) => line.includes('the migration landed')) ?? '',
    }
  } finally {
    await supervisor.stop()
  }
}

/** What the three scenes saw. Filled in `beforeAll`; the tests below only read it. */
const seen = {
  refused: {
    startsBeforeTheChange: 0,
    startsAfterTheChange: 0,
    refusalsSaidOnce: 0,
    theFileSaid: '',
    theLineInTheLog: '',
  },
  crash: {
    grew: false,
    oneInARow: 0,
    theLastStopLine: '',
  },
  note: {
    refusalLineRead: '',
    noteTitle: '',
    noteBody: '',
    refusalFileWasTakenBack: false,
  },
}

let dirs: string[] = []

beforeAll(async () => {
  // ---------------------------------------------------- ACT 1: A REFUSAL IS NOT RETRIED
  {
    const dir = aScratchCheckout()
    dirs.push(dir)
    writeFileSync(join(dir, 'src/server/index.ts'), A_CHILD_THAT_REFUSES)
    writeFileSync(join(dir, 'src/server/watched.ts'), 'export const watched = 1\n')
    const starts = join(dir, 'starts.log')
    const port = await freePort()
    process.env['MOLE_OFFICE_PORT'] = String(port)
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    process.env['MOLE_OFFICE_TEST_REFUSAL'] =
      `${THE_GUARD_REFUSALS_BEGIN}SERVE ${join(dir, 'office.db')}. It holds 12 records, links and changes, it ` +
      'is NOT up to date, and bringing it up to date would write to it.'
    const said = aRecorder()
    const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => existsSync(theRefusalFileIn(dir)), 'the refusal file to be written')
      // Long enough for the old supervisor's half-second back-off to have started it twice more.
      await sleep(3_000)
      seen.refused.startsBeforeTheChange = howManyLines(starts)
      seen.refused.refusalsSaidOnce = said.said('refused to start')
      seen.refused.theLineInTheLog = said.lines.find((line) => line.includes('refused to start')) ?? ''
      seen.refused.theFileSaid = existsSync(theRefusalFileIn(dir))
        ? readFileSync(theRefusalFileIn(dir), 'utf8').trim()
        : ''
      // A change to a file this server is built from is the one way out without a person.
      const watched = join(dir, 'src/server/watched.ts')
      utimesSync(watched, new Date(), new Date())
      await until(() => howManyLines(starts) >= 2, 'the restart after a watched file changed')
      seen.refused.startsAfterTheChange = howManyLines(starts)
    } finally {
      await supervisor.stop()
    }
  }

  // ------------------------------------------- ACT 2: A LONG EXIT-1 STILL COUNTS AS A FAILURE
  {
    const dir = aScratchCheckout()
    dirs.push(dir)
    writeFileSync(join(dir, 'src/server/index.ts'), A_CHILD_THAT_CRASHES_SLOWLY)
    const starts = join(dir, 'starts.log')
    const port = await freePort()
    process.env['MOLE_OFFICE_PORT'] = String(port)
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    const said = aRecorder()
    const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => said.lines.some((line) => line.includes('3 in a row')), 'three failed starts in a row', 90_000)
      seen.crash.grew = true
      seen.crash.oneInARow = said.said('1 in a row')
      seen.crash.theLastStopLine =
        said.lines.filter((line) => line.includes('the server stopped on its own')).slice(-1)[0] ?? ''
    } finally {
      await supervisor.stop()
    }
  }

  // --------------------------- ACT 3: THE NEXT START THAT ANSWERS FILES ONE NOTE ABOUT THE REFUSAL
  {
    const dir = aScratchCheckout()
    dirs.push(dir)
    const database = join(dir, 'office.db')
    {
      // A SQLite database with somebody else's table in it: the guard refuses to USE it.
      const Database = (await import('better-sqlite3')).default
      const stranger = new Database(database)
      stranger.exec('CREATE TABLE my_recipes (name TEXT)')
      stranger.prepare('INSERT INTO my_recipes (name) VALUES (?)').run('one')
      stranger.close()
    }
    const port = await freePort()
    process.env['MOLE_OFFICE_PORT'] = String(port)
    process.env['MOLE_OFFICE_DB'] = database
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    const said = aRecorder()
    const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => existsSync(theRefusalFileIn(dir)), 'the guard to refuse the stranger database', 90_000)
      seen.note.refusalLineRead = readFileSync(theRefusalFileIn(dir), 'utf8').trim()
      // The way out the refusal asks for: the database becomes one the guard will serve.
      for (const file of [database, `${database}-wal`, `${database}-shm`]) rmSync(file, { force: true })
      const builtFrom = join(dir, 'src/server/lib/health.ts')
      utimesSync(builtFrom, new Date(), new Date())
      await until(
        async () => {
          try {
            const answered = await fetch(`http://127.0.0.1:${String(port)}/api/records?kind=note&shape=full`, {
              headers: { 'x-mole-office-workspace': 'default' },
              signal: AbortSignal.timeout(4000),
            })
            if (!answered.ok) return false
            const listed = (await answered.json()) as { records?: { title: string; data?: { body?: string } }[] }
            const note = listed.records?.find((one) => one.title.startsWith('The server refused to start'))
            if (note === undefined) return false
            seen.note.noteTitle = note.title
            seen.note.noteBody = note.data?.body ?? ''
            return true
          } catch {
            return false
          }
        },
        'the note about the refusal to be filed',
        120_000,
      )
      seen.note.refusalFileWasTakenBack = !existsSync(theRefusalFileIn(dir))
    } finally {
      await supervisor.stop()
    }
  }
}, 240_000)

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  dirs = []
  for (const name of [
    'MOLE_OFFICE_PORT',
    'MOLE_OFFICE_DB',
    'MOLE_OFFICE_WORKSPACE',
    'MOLE_OFFICE_TEST_STARTS',
    'MOLE_OFFICE_TEST_REFUSAL',
  ]) {
    delete process.env[name]
  }
})

describe('a start the guard refused is not started again until a watched file changes', () => {
  it('was started exactly once, and still once after three seconds of the old back-off', () => {
    expect(seen.refused.startsBeforeTheChange).toBe(1)
  })

  it('was started again once a file it is built from changed', () => {
    expect(seen.refused.startsAfterTheChange).toBe(2)
  })

  it('said so once, with the first line of the guard’s refusal', () => {
    expect(seen.refused.refusalsSaidOnce).toBe(1)
    expect(seen.refused.theLineInTheLog).toContain(`${THE_GUARD_REFUSALS_BEGIN}SERVE`)
    expect(seen.refused.theLineInTheLog).toContain('will not be started again')
  })

  it('wrote the refusal where a page with no server can still read it', () => {
    expect(seen.refused.theFileSaid).toContain(`${THE_GUARD_REFUSALS_BEGIN}SERVE`)
  })
})

describe('a start that ends in exit 1 is a failure whatever its duration', () => {
  it('counted the second and third attempts in a row rather than restarting at one', () => {
    expect(seen.crash.grew).toBe(true)
    expect(seen.crash.theLastStopLine).toContain('3 in a row')
  })

  it('did not read "1 in a row" every time, which was the defect', () => {
    // One first failure is honest; fifty are the incident. The count must reach three.
    expect(seen.crash.oneInARow).toBeLessThanOrEqual(1)
  })
})

describe('the next start that answers files one note naming the refusal and the down time', () => {
  it('named the refusal in the note it filed', () => {
    expect(seen.note.refusalLineRead).toContain(`${THE_GUARD_REFUSALS_BEGIN}USE`)
    expect(seen.note.noteTitle).toContain('refused to start')
    expect(seen.note.noteBody).toContain(`${THE_GUARD_REFUSALS_BEGIN}USE`)
  })

  it('named how long the office was down', () => {
    expect(seen.note.noteTitle).toMatch(/down for \d+(\.\d+)? second/)
    expect(seen.note.noteBody).toMatch(/office was down for \d+(\.\d+)? second/)
  })

  it('took the refusal file back once the office was answering', () => {
    expect(seen.note.refusalFileWasTakenBack).toBe(true)
  })
})

describe('after a REFUSING TO SERVE the supervisor starts itself again when the migration lands', () => {
  it('started once while behind, then again when the missing row was written, with no file changed, and said the landing with the time', async () => {
    const scene = await aRefusalThatWaitsForAMigration('SERVE')
    expect(scene.theRefusalLine).toContain(`${THE_GUARD_REFUSALS_BEGIN}SERVE`)
    expect(scene.theRefusalLine).toContain('will be started again on its own')
    expect(scene.startsBeforeTheRow).toBe(1)
    expect(scene.startsAfterTheRow).toBe(2)
    expect(scene.theLandingLine).toMatch(/the migration landed at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  }, 90_000)
})

describe('after a REFUSING TO USE the supervisor still does not retry, whatever the database does', () => {
  it('left the start count at one after the same missing row was written, and said nothing about a landing', async () => {
    const scene = await aRefusalThatWaitsForAMigration('USE')
    expect(scene.theRefusalLine).toContain(`${THE_GUARD_REFUSALS_BEGIN}USE`)
    expect(scene.startsBeforeTheRow).toBe(1)
    expect(scene.startsAfterTheRow).toBe(1)
    expect(scene.theLandingLine).toBe('')
  }, 90_000)
})

describe('the supervisor stops when a look and the refusal disagree, inspector fB2IAu88rCm0, invariant 1', () => {
  /** F. MUTATION: start the migration look again on every REFUSING TO SERVE, as pass 2 did. */
  it('F: says the guard disagreement once, stops at two starts, and permits two fresh starts after a watched change', async () => {
    const dir = aScratchCheckout()
    dirs.push(dir)
    theScratchJournalIn(dir)
    const database = join(dir, 'office.db')
    aDatabaseBehind(database, THE_OLDEST_WHEN)
    aMigrationLands(database, THE_JOURNALS_NEWEST_WHEN)
    const starts = join(dir, 'starts.log')
    const refusal = (run: number): string =>
      `${THE_GUARD_REFUSALS_BEGIN}SERVE ${database}. Working out whether it needs migrating did not finish. Start ${String(run)}.`
    // A stand-in for that guard refusal, with a distinct line on each start to prove which was kept.
    writeFileSync(join(dir, 'src/server/index.ts'), `
      import { appendFileSync, readFileSync } from 'node:fs'
      import './watched.ts'
      const marker = process.env.MOLE_OFFICE_TEST_STARTS!
      appendFileSync(marker, 'started\\n')
      const run = readFileSync(marker, 'utf8').trim().split('\\n').length
      process.stderr.write('Error: ' + process.env.MOLE_OFFICE_TEST_REFUSAL + ' Start ' + run + '.\\n')
      process.exit(1)
    `)
    const watched = join(dir, 'src/server/watched.ts')
    writeFileSync(watched, 'export const watched = 1\n')
    process.env['MOLE_OFFICE_PORT'] = String(await freePort())
    process.env['MOLE_OFFICE_DB'] = database
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    process.env['MOLE_OFFICE_TEST_REFUSAL'] = refusal(1).replace(' Start 1.', '')
    const said = aRecorder()
    const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
    const fileSays = (): string => existsSync(theRefusalFileIn(dir))
      ? readFileSync(theRefusalFileIn(dir), 'utf8').trim() : ''
    const disagreement = (run: number): string =>
      '[dev] the migration look found the database up to date, but the guard refused to serve it again. ' +
      'serve-dev will not start the server again until a file it is built from changes or a person ' +
      `runs the supervisor again. The guard said: ${refusal(run)}`
    try {
      await until(() => fileSays() === refusal(1), 'the first refusal to be written')
      expect(howManyLines(starts)).toBe(1)
      expect(said.said('will be started again on its own')).toBe(1)
      await until(() => fileSays() === refusal(2), 'the look start to refuse', 15_000)
      // Two full look intervals plus a margin catch pass 2's repeated starts without a file change.
      await sleep(A_QUIET_MIGRATION_LOOK)
      expect(howManyLines(starts)).toBe(2)
      expect(said.lines.filter((line) => line.includes('but the guard refused'))).toEqual([disagreement(2)])
      expect(fileSays()).toBe(refusal(2))
      expect(said.said('Starting it again in')).toBe(0)

      utimesSync(watched, new Date(), new Date())
      await until(() => fileSays() === refusal(3), 'the start after a watched change')
      expect(howManyLines(starts)).toBe(3)
      expect(said.said('will be started again on its own')).toBe(2)
      await until(() => fileSays() === refusal(4), 'the fresh look start to refuse', 15_000)
      await sleep(A_QUIET_MIGRATION_LOOK)
      expect(howManyLines(starts)).toBe(4)
      expect(said.lines.filter((line) => line.includes('but the guard refused')))
        .toEqual([disagreement(2), disagreement(4)])
      expect(fileSays()).toBe(refusal(4))
      expect(said.said('Starting it again in')).toBe(0)
    } finally {
      await supervisor.stop()
    }
  }, 90_000)

  /** G. MUTATION: start the service lock look again on every exit 75. */
  it('G: stops when an absent lock cannot settle the child’s refusal to take it', async () => {
    const dir = aScratchCheckout()
    dirs.push(dir)
    const database = join(dir, 'office.db')
    const starts = join(dir, 'starts.log')
    // The real lock function, given a fixture reading where the child's own start time is unknown.
    writeFileSync(join(dir, 'src/server/index.ts'), `
      import { appendFileSync } from 'node:fs'
      import './watched.ts'
      import { settings } from '../config/settings.mjs'
      import { takeTheServiceLock, THE_SERVICE_LOCK_REFUSAL_EXIT_CODE } from '../config/the-service-lock.mjs'
      appendFileSync(process.env.MOLE_OFFICE_TEST_STARTS!, 'started\\n')
      const resolved = settings()
      const lock = await takeTheServiceLock({
        lockPath: resolved.serviceLockPath, databasePath: resolved.databasePath,
        port: resolved.apiPort, checkout: process.cwd(), pid: process.pid,
        readProcess: () => ({ here: true, startedAt: null, pgid: process.pid }),
      })
      if (lock.taken) throw new Error('the fixture unexpectedly took the lock')
      process.stderr.write(lock.said + '\\n')
      process.exit(THE_SERVICE_LOCK_REFUSAL_EXIT_CODE)
    `)
    const watched = join(dir, 'src/server/watched.ts')
    writeFileSync(watched, 'export const watched = 1\n')
    process.env['MOLE_OFFICE_PORT'] = String(await freePort())
    process.env['MOLE_OFFICE_DB'] = database
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_TEST_STARTS'] = starts
    const said = aRecorder()
    const supervisor = await serveDev({ clocks: THE_TEST_CLOCKS, root: dir, say: said.say, writeItDown: false })
    try {
      await until(() => said.said('started no second server') === 1, 'the first lock refusal')
      expect(howManyLines(starts)).toBe(1)
      await until(() => howManyLines(starts) >= 2, 'the free-lock look start', 15_000)
      await sleep(A_QUIET_LOCK_LOOK)
      expect(howManyLines(starts)).toBe(2)
      const disagreements = said.lines.filter((line) => line.includes('but the server refused it again'))
      expect(disagreements).toHaveLength(1)
      expect(disagreements[0]).toContain('It could not read its own start time and process group')
      expect(disagreements[0]).toContain('until a file it is built from changes or a person runs the supervisor again')
      expect(readFileSync(theRefusalFileIn(dir), 'utf8').trim()).toBe(disagreements[0]!.slice('[dev] '.length))
      expect(said.said('Starting it again in')).toBe(0)
      utimesSync(watched, new Date(), new Date())
      await until(() => said.said('started no second server') === 2, 'the lock refusal after a watched change')
      expect(howManyLines(starts)).toBe(3)
    } finally {
      await supervisor.stop()
    }
  }, 90_000)
})
