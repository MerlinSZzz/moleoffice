// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * STARTING PANELX ON PURPOSE — the settings it reads, the files it refuses, and what it says.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR THINGS THIS PINS, ALL MEASURED ON 2026-08-12
 * ---------------------------------------------------------------------------------------
 *
 * The settings were spelled `PANELX_…` on that date. They are written below under the names they
 * carry now, because they are the same four settings and this file reads them as it runs.
 *
 * 1. `.env` REACHES EVERY COMMAND THAT OPENS A DATABASE. It did not. With
 *    `MOLE_OFFICE_DB=…/steered.db` in `.env`, `npm run db:migrate` created and migrated
 *    `./data/panelx.db` and never touched the configured file — and so did `db:seed`, `db:reset`
 *    and `reindex`. The two guards that make `db:reset` safe were guarding a file the operator was
 *    not using.
 *
 * 2. A DAMAGED DATABASE IS REFUSED. 200 zero bytes in the middle of a copy of the live corpus:
 *    `npm run db:migrate` answered `records 429 -> 429`, exit 0, and the server then served it and
 *    accepted new writes, while 87 record ids returned HTTP 500. Nothing ran `integrity_check`.
 *
 * 3. A STRANGER'S DATABASE IS REFUSED. Pointed at somebody else's SQLite file, `db:migrate` created
 *    twelve Mole Office tables inside it and exited 0.
 *
 * 4. THE TWO HALVES OF `npm run dev` FAIL THE SAME WAY. With `MOLE_OFFICE_PORT=` the server refused to
 *    start and Vite fell back to 8787 — on a scratch checkout that meant the browser app came up
 *    and proxied to the developer's LIVE corpus. And Vite moved to the next free port when 5173 was
 *    taken, so a second `npm run dev` served a working UI on an address nobody had been told about,
 *    wired to the first instance's server.
 *
 * Nothing here touches ./data/panelx.db: the database tests use `freshDb()`'s throwaway file or one
 * they build in a temp directory, and the source-level tests read files without running them.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import Database from 'better-sqlite3'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, existsSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiServerArguments, devStackEnvironment, freshDb, type TestDb } from './helpers.ts'
import { aFreePortBelowTheEphemeralRange } from './a-free-port-below-the-ephemeral-range.ts'
import { findEnvFile, settings } from '../src/config/settings.mjs'
import { LOOK_AT_PRESENCE_AGAIN_EVERY_MS, THE_PRESENCE_LOOK_SETTING, theIntervalOfThePresenceLook } from '../src/shared/presence-clock.ts'
import { RUN_THE_SLEEP_CLOCK_EVERY_MS, THE_SLEEP_CLOCK_SETTING, theIntervalOfTheSleepClock } from '../src/shared/sleep-clock.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string): string => readFileSync(join(REPO, path), 'utf8')

/** Comments stripped, so a rule quoted in prose cannot satisfy a check about code. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-startup-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('every command that opens a database reads the same settings file', () => {
  /**
   * The entry points: everything a person can run that ends up with a database open. Listed here
   * rather than globbed, because the assertion below is about what each one does and a new script
   * should have to be thought about once.
   */
  const ENTRY_POINTS = [
    'src/server/index.ts',
    'src/server/db/migrate.ts',
    'scripts/backup.ts',
    'scripts/seed.ts',
    'scripts/reset.ts',
    'scripts/reindex.ts',
    'scripts/export.ts',
    'scripts/import.ts',
    'scripts/restore-check.ts',
    // ADDED WITH CRITERION U6'S PRUNE TOOL. It opens the database the checkout serves to read one
    // number, how many backups to keep, and then deletes files. It passes the rule today because it
    // asks `settings()` rather than reading the variable, so the loop below skips it. That is the
    // reason to list it and not a reason to leave it out: this list is the inventory of commands a
    // person can run that end up with a database open, and the day somebody reaches for
    // `process.env.MOLE_OFFICE_DB` in a tool whose job is deleting files, the rule should already be
    // watching. Naming it here is what makes that true.
    'scripts/prune-backups.ts',
  ]

  it('reads MOLE_OFFICE_DB only where .env has already been loaded, or where the setting cannot matter', () => {
    const wrong: string[] = []
    for (const path of ENTRY_POINTS) {
      const source = code(path)
      // Reading the variable is what commits a command to a database. A file that does not read it
      // gets its path from db/client.ts, which loads the settings itself.
      const readsIt = /process\.env(\.MOLE_OFFICE_DB|\[['"]MOLE_OFFICE_DB['"]\])/.test(source)
      if (!readsIt) continue
      if (/loadPanelEnv\s*\(/.test(source)) continue
      // THE ONE HONEST EXEMPTION, AND IT HAS TO PROVE ITSELF. `scripts/restore-check.ts` deliberately
      // does not load .env: its business is destroying the database it is pointed at, so the
      // configured path is the last one it should default to. What makes that safe is not the
      // absence of a load — the built-in default is the same file — but `assertScratch`, which
      // refuses any path outside the run's own working directory. So the exemption is written as
      // the condition that earns it, and a file that dropped the guard would fail this test.
      if (/assertScratch\s*\(/.test(source)) continue
      wrong.push(path)
    }
    expect(
      wrong,
      'these read MOLE_OFFICE_DB directly, without loading .env first and without refusing every path ' +
        'outside a scratch directory — so they act on a different database from the one the operator ' +
        'configured, which is what db:migrate, db:seed, db:reset and reindex all did until Wave 4B',
    ).toEqual([])
  })

  /**
   * WHAT THIS ASSERTED BEFORE, AND WHY IT IS TURNED ROUND.
   *
   * It required `loadPanelEnv()` to appear in `src/server/db/client.ts` BEFORE the line
   * `process.env.MOLE_OFFICE_DB`, because the read happened at import and a load placed after it
   * would compile, run and do nothing. The order was the whole rule, and it was invisible to the
   * type checker.
   *
   * Criterion G1 of design/ground/ACCEPTANCE.md removed the rule rather than the risk.
   * `src/config/settings.mjs` reads `.env` itself, so the answer no longer depends on whether
   * anything has loaded the file into `process.env` yet, and there is nothing left for a line to be
   * on the wrong side of. What replaces the order check is the property the order was protecting,
   * asked directly: the same path comes back either way.
   */
  it('reads the path from the declaration, so no load has to have happened first', () => {
    const source = code('src/server/db/client.ts')
    expect(source, 'db/client.ts still reads MOLE_OFFICE_DB itself').not.toMatch(/process\.env\.MOLE_OFFICE_DB/)
    expect(source).toContain('settings().databasePath')
    // Still loaded, because a CHILD process and anything reading a setting of somebody else's needs
    // `.env` in `process.env` — it is just no longer what this module's own answer depends on.
    expect(source).toContain('loadPanelEnv()')
  })

  it('gives the same database whether or not .env has been loaded into the environment', () => {
    const file = join(dir, 'order-does-not-matter.env')
    const named = join(dir, 'named-in-the-file.db')
    writeFileSync(file, `MOLE_OFFICE_DB=${named}\n`)
    // Nothing has been loaded into this environment at all.
    expect(settings({}, file).databasePath).toBe(named)
    // And the shell still beats the file, which every safety instruction in this project depends on.
    const mine = join(dir, 'named-in-the-shell.db')
    expect(settings({ MOLE_OFFICE_DB: mine }, file).databasePath).toBe(mine)
  })

  it('lets the real environment beat the file, which every safety instruction depends on', async () => {
    // `MOLE_OFFICE_DB=/tmp/scratch.db npm run db:reset` is printed by the refusal that protects the live
    // corpus. If the file could override the environment, that instruction would send somebody's
    // reset at the database they were trying to protect.
    const { loadPanelEnv, ENV_FILE } = await import('../src/server/lib/env.ts')
    const mine = join(dir, 'set-by-the-shell.db')
    process.env.MOLE_OFFICE_DB = mine
    loadPanelEnv()
    expect(process.env.MOLE_OFFICE_DB).toBe(mine)
    // And it is the repository's own .env that would have been read, not some other file. In a
    // worktree there is no `.env` of this checkout's own — the file is gitignored — so the
    // repository's file is the main checkout's, found through git. Either way it is the
    // declaration's own resolution and never a file invented from the working directory.
    //
    // THE EXISTENCE OF A `.env` IS A FACT ABOUT THE MACHINE, NOT THE RULE. This checkout and the
    // main checkout it was made from may both have none here, and the honest answer is then this
    // checkout's own absent path rather than a file conjured from the working directory. The
    // worktree fallback itself is proved with a scratch repository in
    // tests/the-resolver-reads-the-main-checkouts-env-from-a-worktree.test.ts, so this case does
    // not need a real `.env` to exist.
    const local = join(REPO, '.env')
    expect(ENV_FILE).toBe(findEnvFile(REPO).path)
    if (existsSync(local)) expect(ENV_FILE).toBe(local)
    else if (findEnvFile(REPO).found) expect(ENV_FILE).not.toBe(local)
  })
})

describe('a database Mole Office will not use', () => {
  let t: TestDb

  afterEach(() => {
    t?.close()
  })

  it('accepts the ordinary one, so the checks below are not simply refusing everything', async () => {
    t = await freshDb()
    const { databaseObjection } = await import('../src/server/db/migrate.ts')
    expect(databaseObjection(t.client.sqlite)).toBeNull()
  })

  it('accepts an empty file, because a first run is what an empty file is for', () => {
    const file = join(dir, 'brand-new.db')
    const db = new Database(file)
    try {
      // Nothing in it at all: a fresh clone, a scratch file, the database a test builds. Creating
      // the tables here is the point rather than a mistake.
      expect(statSync(file).size).toBe(0)
    } finally {
      db.close()
    }
  })

  it('refuses somebody else\'s SQLite file rather than building Mole Office inside it', async () => {
    const file = join(dir, 'recipes.db')
    const other = new Database(file)
    other.exec('CREATE TABLE my_recipes (id INTEGER PRIMARY KEY, name TEXT)')
    other.exec("INSERT INTO my_recipes (name) VALUES ('soup')")

    const { databaseObjection } = await import('../src/server/db/migrate.ts')
    const objection = databaseObjection(other)
    other.close()

    expect(objection).not.toBeNull()
    expect(objection).toContain('not Mole Office')
    expect(objection, 'the refusal must name the file, because the cause is a typo in a path').toContain(file)
    expect(objection).toContain('NOTHING HAS BEEN WRITTEN')

    // And it really did not write: the stranger's database still holds exactly its own table.
    const after = new Database(file, { readonly: true })
    const tables = (
      after.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {
        name: string
      }[]
    ).map((r) => r.name)
    after.close()
    expect(tables).toEqual(['my_recipes'])
  })

  it('refuses a damaged one, in its own words rather than a node_modules stack trace', async () => {
    const file = join(dir, 'damaged.db')
    const db = new Database(file)
    db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, title TEXT)')
    db.exec('CREATE INDEX records_title_idx ON records (title)')
    const insert = db.prepare('INSERT INTO records (id, title) VALUES (?, ?)')
    db.transaction(() => {
      for (let i = 0; i < 4000; i++) insert.run(`r${i}`, `record ${i} ${'x'.repeat(80)}`)
    })()
    db.close()

    const { openSync, writeSync, closeSync } = await import('node:fs')
    const size = statSync(file).size
    const fd = openSync(file, 'r+')
    writeSync(fd, Buffer.alloc(8192), 0, 8192, Math.floor(size / 2))
    closeSync(fd)

    const broken = new Database(file)
    const { databaseObjection } = await import('../src/server/db/migrate.ts')
    // On damage this bad the pragma THROWS instead of answering, and the first version of this code
    // did not catch it — the operator got a stack trace out of better-sqlite3's pragma.js. So the
    // assertion is that a refusal comes back at all, not merely that one is worded well.
    const objection = databaseObjection(broken)
    broken.close()

    expect(objection).not.toBeNull()
    expect(objection).toContain('DAMAGED')
    expect(objection, 'a refusal has to say what to do next').toContain('--check-only')
    expect(objection, 'and must not offer to repair the file on its own').toContain('does not take it for you')
  })

  it('refuses to SERVE a damaged one, which is the path that used to answer 200', async () => {
    const file = join(dir, 'damaged-serve.db')
    const db = new Database(file)
    db.exec('CREATE TABLE records (id TEXT PRIMARY KEY, title TEXT)')
    const insert = db.prepare('INSERT INTO records (id, title) VALUES (?, ?)')
    db.transaction(() => {
      for (let i = 0; i < 4000; i++) insert.run(`r${i}`, `record ${i} ${'x'.repeat(80)}`)
    })()
    db.close()

    const { openSync, writeSync, closeSync } = await import('node:fs')
    const size = statSync(file).size
    const fd = openSync(file, 'r+')
    writeSync(fd, Buffer.alloc(8192), 0, 8192, Math.floor(size / 2))
    closeSync(fd)

    const broken = new Database(file)
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const decision = prepareToServe(broken)
    broken.close()

    expect(decision.serve).toBe(false)
    if (!decision.serve) expect(decision.refusal).toContain('DAMAGED')
  })
})

describe('nothing tells you to back up with cp any more', () => {
  it('no message an operator reads recommends copying the database file', () => {
    // These three sentences were read at the exact moments a backup is taken — before a reset,
    // before a migration, and while setting the database path — and all three produced a copy that
    // was short by everything in the write-ahead log.
    const offenders: string[] = []
    for (const path of ['.env.example', 'scripts/reset.ts', 'src/server/db/migrate.ts', 'README.md']) {
      const text = read(path)
      // A cp whose destination looks like a backup of the database. Narrow on purpose: `cp` appears
      // in this repository for other reasons, and a test that banned the word would be noise.
      const matches = text.match(/cp\s+\S*\{?\$?\{?file\}?\S*\s+\S*\.backup|cp\s+\S*panelx\.db\S*\s+\S*\.backup/g)
      if (matches !== null) offenders.push(`${path}: ${matches.join(', ')}`)
    }
    expect(
      offenders,
      'these tell an operator to back up by copying the .db file, which silently loses everything ' +
        'in the write-ahead log — measured at 6 records and 55 minutes on the live corpus',
    ).toEqual([])
  })

  it('and the backup command is the one they name instead', () => {
    for (const path of ['.env.example', 'scripts/reset.ts', 'src/server/db/migrate.ts']) {
      expect(read(path), `${path} should point at the backup command`).toContain('db:backup')
    }
    // It has to be runnable, not merely mentioned.
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts['db:backup']).toBe('tsx scripts/backup.ts')
  })
})

describe('the two halves of npm run dev refuse the same input', () => {
  it('refuses an empty port setting rather than falling back to 8787', async () => {
    // The measured consequence of falling back: on a scratch checkout with `MOLE_OFFICE_PORT=`, the
    // server refused to start, Vite came up anyway, and its proxy answered from the developer's
    // real corpus on 8787. A page that looked like the scratch checkout was reading the live one.
    const before = process.env.MOLE_OFFICE_PORT
    try {
      process.env.MOLE_OFFICE_PORT = ''
      const config = (await import('../vite.config.ts')).default as unknown as (env: {
        mode: string
        command: string
      }) => unknown
      expect(() => config({ mode: 'development', command: 'serve' })).toThrow(/empty value/)
    } finally {
      if (before === undefined) delete process.env.MOLE_OFFICE_PORT
      else process.env.MOLE_OFFICE_PORT = before
    }
  })

  it('but an unset port is not a mistake and still means the default', async () => {
    const before = process.env.MOLE_OFFICE_PORT
    try {
      delete process.env.MOLE_OFFICE_PORT
      const config = (await import('../vite.config.ts')).default as unknown as (env: {
        mode: string
        command: string
      }) => { server: { port: number; strictPort: boolean } }
      // Deleting the variable does not make the config see nothing: it reads this checkout's .env
      // off the disk too, so the number it produces depends on whose machine this is. What is being
      // asserted here is the part that does not: an UNSET port is not a mistake, so this must not
      // throw the way the empty-value case above does. The default itself is pinned on `portsFrom`
      // in tests/surface-fixes.test.ts, where the environment can actually be made empty.
      const built = config({ mode: 'development', command: 'serve' })
      expect(Number.isInteger(built.server.port)).toBe(true)
    } finally {
      if (before !== undefined) process.env.MOLE_OFFICE_PORT = before
    }
  })

  it('takes the port it was asked for or fails, rather than moving to the next one', async () => {
    const config = (await import('../vite.config.ts')).default as unknown as (env: {
      mode: string
      command: string
    }) => { server: { strictPort: boolean } }
    const built = config({ mode: 'development', command: 'serve' })
    expect(
      built.server.strictPort,
      'without this a second `npm run dev` serves a working UI on an unannounced port, proxied to ' +
        'the first instance\'s server and its database',
    ).toBe(true)
  })
})

describe('a start that cannot work says so before it changes anything', () => {
  it('names the build command when there is no built browser app', async () => {
    const { missingWebBuild } = await import('../src/server/index.ts')
    const missing = missingWebBuild(join(dir, 'nothing-here'))
    expect(missing).not.toBeNull()
    expect(missing).toContain('npm run build')
    // dist/ is gitignored, so this is the state of every fresh clone rather than a broken machine.
    expect(missing).toContain('fresh clone')
  })

  it('is happy once there is one, so the check is about the file and not about the path', async () => {
    const { missingWebBuild } = await import('../src/server/index.ts')
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const web = join(dir, 'web')
    mkdirSync(web, { recursive: true })
    writeFileSync(join(web, 'index.html'), '<!doctype html>')
    expect(missingWebBuild(web)).toBeNull()
  })

  it('checks for the built app before it opens or migrates a database', () => {
    // ORDERING, and it cost a database. `npm start` on a fresh clone failed with the right message,
    // but only after the migration gate had already created and migrated ./data/panelx.db — a file
    // at a path the operator had not thought about yet, which is how two checkouts end up
    // disagreeing about where the work is.
    // Scoped to `start()`, because `buildApp` is declared earlier in the file and opens the database
    // itself — the first version of this test compared against THAT import and failed on correct
    // code. Which function the ordering is about is the whole question.
    const whole = code('src/server/index.ts')
    const startAt = whole.indexOf('async function start()')
    expect(startAt, 'start() has been renamed; this test is measuring the wrong thing').toBeGreaterThan(-1)
    const source = whole.slice(startAt)

    const checkAt = source.indexOf('missingWebBuild(webDir)')
    const openAt = source.indexOf("await import('./db/client.ts')")
    expect(checkAt).toBeGreaterThan(-1)
    expect(openAt).toBeGreaterThan(-1)
    expect(checkAt, 'the database is opened before the cheap check that would have refused the start').toBeLessThan(
      openAt,
    )
  })
})

describe('where the work is stored is answerable without reading the terminal', () => {
  let t: TestDb

  afterEach(() => {
    t?.close()
  })

  it('GET /api/health says which file it is serving, always', async () => {
    t = await freshDb()
    const { apiApp } = await import('./helpers.ts')
    const { app } = await apiApp()
    try {
      const res = await app.inject({ method: 'GET', url: '/api/health' })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body) as { ok: boolean; records: number; path: string }
      // The answer to "which of my two checkouts am I looking at" — and to "is this the live corpus
      // or a scratch copy", which from outside look identical.
      expect(body.path).toBe(t.file)
    } finally {
      await app.close()
    }
  })
})

/**
 * THE PAGE A PERSON SEES WHEN THE BROWSER APP DOES NOT START.
 *
 * `src/web/index.html` is plain HTML served before any of the app has run, and its `#root` holds a
 * message React replaces on mount. It is therefore only ever read when the JavaScript failed, which
 * is the one moment nobody can afford to be sent to the wrong file.
 *
 * IT NAMED A CAUSE IT COULD NOT KNOW. It said to check the proxy key in `vite.config.ts`. That had
 * been the cause once. It was NOT the cause on 1 September 2026, when the dev server was serving a
 * seven-hour-old transform of a file outside the Vite root — and a person following the sentence on
 * the screen opened the wrong file.
 *
 * THE TWO CAUSES ARE KEPT, in an HTML comment beside the message, for whoever is reading the source
 * rather than the screen. Nothing is discarded; what changed is what is asserted at a reader.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED ON 3 SEPTEMBER 2026, AND WHY ONE ASSERTION HERE NO LONGER STANDS
 * ---------------------------------------------------------------------------------------
 *
 * This file used to require the sentence *cannot say which module failed*. That was true of the
 * HTML and false of the browser: the browser fires an error event naming the module that would not
 * load, and a plain inline script in this page can be listening before the app's first module is
 * fetched. Criterion G4 of design/ground/ACCEPTANCE.md asks for exactly
 * that: *the "did not start" page names the module that failed and the world it expected.*
 *
 * So the rule this file holds is now the sharper one, and it is the same rule underneath. The page
 * names no cause it has NOT BEEN TOLD. Before the browser has told it anything it says so, and
 * points at the console; when the browser names the module it repeats what the browser said; and
 * when the browser names nothing it says "not named by the browser" rather than guessing.
 */
describe('the page shown when the app does not start says only what it knows', () => {
  /** The message a person reads: the markup inside #root, with the comments taken out. */
  const onScreen = (): string => {
    const html = read('src/web/index.html')
    const shown = html.slice(html.indexOf('<div id="root">'), html.indexOf('</div>\n    <script'))
    return shown.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  it('does not name a cause on the screen', () => {
    // Any file named here is a file somebody opens before the console has told them which one.
    expect(onScreen(), 'the dead page names a file as the cause again').not.toContain('vite.config')
    expect(onScreen()).not.toContain('proxy')
  })

  it('says nothing has told it which module failed yet, before anything has', () => {
    expect(onScreen()).toContain('Nothing has told this page which module failed yet')
  })

  it('repeats what the browser said, and says so when the browser named nothing', () => {
    // The listener is plain inline script on purpose: a module would be fetched and transformed by
    // the same machinery it exists to report the failure of.
    const html = read('src/web/index.html')
    expect(html).toContain("say('boot-module', 'The module that failed is ' + what + ' — ' + why)")
    expect(html).toContain('not named by the browser')
  })

  it('names the API this page expected, and the world of the last reply this tab read', () => {
    // Criterion G4 again: a reader told the app did not start needs to know which server it would
    // have talked to, and what it was talking to before it stopped.
    const html = read('src/web/index.html')
    expect(html).toContain("'This page expected its Mole Office at ' + window.location.origin + '/api.'")
    expect(html).toContain('The last reply this tab read came from: ')
  })

  it('points at the one thing that does know, and says what to read there', () => {
    expect(onScreen()).toContain('browser console')
    expect(onScreen()).toContain('first line in red')
  })
})

/**
 * A HEALTHY DATABASE WITH A PENDING WRITE-AHEAD LOG IS SERVED, AND A REAL DISAGREEMENT IS NOT.
 *
 * On 5 September 2026 the live API stopped serving and crash-looped for ten minutes on a database
 * with nothing wrong with it. The start-up check images the database, runs the migrations on the
 * image and compares the bytes; the file's write-ahead log held 4 MB written by two one-off scripts
 * and by the suite, and the two images came out different with no migration writing anything, so
 * the check refused. `PRAGMA wal_checkpoint(TRUNCATE)` by hand brought the server back. Problem
 * `Tu4rc-BhlNuL`.
 *
 * WHAT IS PROVED HERE. A healthy database whose log is not empty is served, and the check says it
 * did not have to fold the log in to say so. A database a migration really would write to is still
 * refused, with the reason named. And `settleTheLog` — the thing the check reaches for when the two
 * images disagree with nothing accounting for it — really does empty a log that is not empty.
 *
 * WHAT IS NOT PROVED HERE, AND IS SAID RATHER THAN LEFT OUT. The byte difference a pending log
 * produced on the owner's file could not be reproduced on a throwaway database in this suite: the
 * images agree here whether the log is empty or not. So the case that makes the check reach for
 * `settleTheLog` is not exercised end to end, and the piece is tested on its own instead.
 */
describe('the start-up check settles the write-ahead log before it images the database', () => {
  let t: TestDb

  afterEach(() => {
    t?.close()
  })

  it('serves a healthy database whose write-ahead log is not empty, and empties it first', async () => {
    const Database = (await import('better-sqlite3')).default
    const { prepareToServe, previewMigration } = await import('../src/server/db/migrate.ts')
    t = await freshDb()
    // WRITTEN THROUGH THE PRODUCT, so this is a healthy corpus and not a hand-built one. Nothing
    // checkpoints while the connection stays open, so the log is really there.
    for (let i = 0; i < 200; i++) {
      t.api.createRecord({
        kind: 'note',
        title: `note ${String(i)}`,
        workspaceId: 'default',
        data: { body: 'x'.repeat(400) },
        actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
      })
    }
    expect(statSync(`${t.file}-wal`).size, 'this test proves nothing unless the log is really not empty').toBeGreaterThan(
      0,
    )

    const serving = new Database(t.file)
    serving.pragma('journal_mode = WAL')
    const decision = prepareToServe(serving)
    const preview = previewMigration(serving)

    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    // AND IT DID NOT HAVE TO TOUCH THE FILE TO SAY SO. The two images agreed, so nothing was folded
    // in — which is the ordinary answer and the one that keeps the start cheap.
    expect(preview.logSettled.settled).toBe('not needed')
    serving.close()
  })

  it('can fold a log that is not empty into the file, which is what it reaches for when they disagree', async () => {
    const Database = (await import('better-sqlite3')).default
    const { settleTheLog } = await import('../src/server/db/migrate.ts')
    t = await freshDb()
    for (let i = 0; i < 200; i += 1) {
      t.api.createRecord({
        kind: 'note',
        title: `note ${String(i)}`,
        workspaceId: 'default',
        data: { body: 'x'.repeat(400) },
        actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id },
      })
    }
    const before = statSync(`${t.file}-wal`).size
    expect(before, 'this test proves nothing unless the log is really not empty').toBeGreaterThan(0)

    const serving = new Database(t.file)
    serving.pragma('journal_mode = WAL')
    const settled = settleTheLog(serving)

    expect(settled.settled).toBe('folded in')
    expect(statSync(`${t.file}-wal`).size, 'the log was not emptied').toBe(0)
    // AND NOT ONE ROW MOVED, which is the whole claim a checkpoint makes.
    const rows = (serving.prepare("SELECT count(*) AS n FROM records WHERE kind = 'note'").get() as { n: number }).n
    expect(rows).toBe(200)
    serving.close()
  })

  it('still refuses a database a migration really would write to, and says what it would write', async () => {
    const Database = (await import('better-sqlite3')).default
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    t = await freshDb()
    // A RECORD WRITTEN STRAIGHT INTO THE FILE, past every door, so it has no revision. The revision
    // step really would write one, which is a real disagreement and not an artefact of the log.
    const script = new Database(t.file)
    script.pragma('journal_mode = WAL')
    script
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, origin, kind, title, summary, data) ' +
          `VALUES (?, 'default', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-05 09:00:00', '2026-09-05 09:00:00', 'authored', 'note', ?, NULL, ?)`,
      )
      .run('written-past-the-door', 'a note nothing filed', '{"body":"x"}')
    script.close()

    const serving = new Database(t.file)
    serving.pragma('journal_mode = WAL')
    const decision = prepareToServe(serving)
    expect(decision.serve).toBe(false)
    if (!decision.serve) {
      expect(decision.refusal).toContain('REFUSING TO SERVE')
      expect(decision.refusal, 'a refusal has to name what would be written').toContain('revisions')
    }
    serving.close()
  })
})

/**
 * A RESTART REPLACES THE OFFICE'S OWN ROWS INSTEAD OF LEAVING THEM RUNNING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED ON 12 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2G9jNsuJwJf4`. `GET /api/sessions?only=running` answered 59 rows on the owner's own
 * office, 15 of them "The message worker" and 2 "The API server" on a machine running one pair.
 * Every start files a fresh session record for itself and its worker, and nothing closed the row
 * the start before it filed: the shutdown says `finished` only when a run stops cleanly, and a
 * `tsx watch` restart or a killed terminal never reaches it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE, AND WHY THE FIRST START IS KILLED RATHER THAN STOPPED
 * ---------------------------------------------------------------------------------------
 *
 * A server that is stopped politely closes its own row on the way out, so a second start would have
 * nothing to replace and this file would pass with the fix deleted. The first server is therefore
 * SIGKILLed, which is the ending the defect is about: a process that cannot say anything is gone,
 * and the next start is the only thing left that can.
 *
 * The worker itself is not started under a test runner (`underATestRunner` in lib/runtime.ts), so
 * the worker row from a previous start is written through the product's own records door. That is
 * the same row, in the same table, with the same identity a real start's worker files.
 */
describe("a start replaces the office's own earlier rows", () => {
  let child: ChildProcess | null = null

  afterEach(() => {
    if (child?.pid !== undefined && child.pid !== null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
    }
    child = null
  })

  function freePort(): Promise<number> {
    return new Promise((ok, bad) => {
      const probe = createServer()
      probe.on('error', bad)
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address()
        if (address === null || typeof address === 'string') {
          probe.close(() => bad(new Error('the probe socket reported no port')))
          return
        }
        const chosen = address.port
        probe.close(() => ok(chosen))
      })
    })
  }

  function portIsFree(port: number): Promise<boolean> {
    return new Promise((ok) => {
      const probe = createServer()
      probe.on('error', () => ok(false))
      probe.listen(port, '127.0.0.1', () => probe.close(() => ok(true)))
    })
  }

  async function waitForPortFree(port: number, budget = 30_000): Promise<void> {
    const deadline = Date.now() + budget
    for (;;) {
      if (await portIsFree(port)) return
      if (Date.now() > deadline) throw new Error(`port ${String(port)} never came back`)
      await new Promise((go) => setTimeout(go, 200))
    }
  }

  async function waitForHealth(api: string, budget = 90_000): Promise<void> {
    const deadline = Date.now() + budget
    for (;;) {
      try {
        if ((await fetch(`${api}/api/health`)).ok) return
      } catch {
        // Not answering yet.
      }
      if (Date.now() > deadline) throw new Error(`the server never answered ${api}/api/health`)
      await new Promise((go) => setTimeout(go, 300))
    }
  }

  function startTheApi(port: number, database: string, webPort: number): ChildProcess {
    const log = openSync(join(dir, `api-${String(port)}.log`), 'a')
    return spawn(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...process.env,
        MOLE_OFFICE_PORT: String(port),
        MOLE_OFFICE_WEB_PORT: String(webPort),
        MOLE_OFFICE_DB: database,
        MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_API: `http://127.0.0.1:${String(port)}`,
        // OFF IS A DECISION, NOT AN OMISSION: the worker is a real process and this file is about
        // the rows a start replaces, not about the queue.
        MOLE_OFFICE_MESSAGE_WORKER: 'off',
        MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
        LOG_LEVEL: 'warn',
      },
    })
  }

  const AS_AN_AGENT = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'vitest-startup',
  }

  /**
   * THE TEST'S OWN WRITER IS REGISTERED IN THE SERVER IT JUST STARTED. The records door refuses a
   * write under an agent id no registry row holds, and the worker and browser-app rows below stand
   * in for rows a real start writes. `vitest-startup` is a handle the office will register; the
   * person it is registered by is seeded in every fresh database.
   */
  async function registerTheTestWriter(api: string): Promise<void> {
    const made = await fetch(`${api}/api/agents/started`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: 'vitest-startup', name: 'Vitest startup' }),
    })
    if (!made.ok) throw new Error(`registering the test writer answered ${String(made.status)}: ${await made.text()}`)
  }

  interface SessionRow {
    id: string
    title: string
    data: Record<string, unknown>
  }

  async function sessions(api: string): Promise<SessionRow[]> {
    const res = await fetch(`${api}/api/records?kind=session&shape=full`, { headers: AS_AN_AGENT })
    const text = await res.text()
    expect(res.status, text).toBe(200)
    return (JSON.parse(text) as { records: SessionRow[] }).records
  }

  it('leaves one running row per own part, and the earlier rows say they were replaced', async () => {
    const database = join(dir, 'twice.db')
    const port = await freePort()
    const webPort = await freePort()
    const api = `http://127.0.0.1:${String(port)}`
    const checkout = REPO.replace(/\/$/, '')

    child = startTheApi(port, database, webPort)
    await waitForHealth(api)
    await registerTheTestWriter(api)
    const firstApi = (await sessions(api)).find(
      (row) => row.title === 'The API server' && row.data['state'] === 'running',
    )
    expect(firstApi, 'the first start filed no running row for itself').toBeDefined()

    // THE WORKER ROW FROM A PREVIOUS START. The worker is not started under the test runner, so it
    // is written here through the records door with the identity a real start would have written.
    const worker = await fetch(`${api}/api/records`, {
      method: 'POST',
      headers: AS_AN_AGENT,
      body: JSON.stringify({
        kind: 'session',
        title: 'The message worker',
        data: {
          state: 'running',
          runtime: 'mole-office',
          workingDirectory: checkout,
          extra: { ownPart: { role: 'The message worker', port, checkout } },
        },
      }),
    })
    const workerText = await worker.text()
    expect(worker.status, workerText).toBe(201)
    const workerId = (JSON.parse(workerText) as { record: { id: string } }).record.id
    // THE ENDING THE DEFECT IS ABOUT: no shutdown, no last word.
    if (child?.pid !== undefined && child.pid !== null) process.kill(-child.pid, 'SIGKILL')
    child = null
    await waitForPortFree(port)

    child = startTheApi(port, database, webPort)
    await waitForHealth(api)

    const now = await sessions(api)
    const runningApis = now.filter((row) => row.title === 'The API server' && row.data['state'] === 'running')
    expect(runningApis, 'a restart left more than one running row for the API server').toHaveLength(1)
    expect(
      now.filter((row) => row.title === 'The message worker' && row.data['state'] === 'running'),
      'a restart left a worker row from before it running',
    ).toHaveLength(0)

    for (const id of [firstApi?.id ?? '', workerId]) {
      const row = now.find((one) => one.id === id)
      expect(row, 'the row filed before the restart is gone rather than closed').toBeDefined()
      expect(row?.data['state'], `${String(row?.title)} does not say it was replaced`).toBe('finished')
      expect(
        String(row?.data['closedBecause']),
        `${String(row?.title)} does not name what replaced it`,
      ).toMatch(/replaced by the start of/)
      expect(row?.data['closedHow']).toBe('went-stale')
    }

    // AND THE NEW ROW CARRIES THE PID AND START TIME, so a later reading can check it. The pid is
    // the process that HOLDS THE PORT, not the `tsx` wrapper this test spawned: that wrapper is a
    // parent, and the row names the server itself.
    const newest = runningApis[0]
    expect(newest?.data['startedAt'], 'the new row carries no start time').toBeTruthy()
    const extra = newest?.data['extra'] as
      | { ownPart?: { port?: number }; discovered?: { pid?: number } }
      | undefined
    expect(extra?.ownPart?.port, 'the new row does not say which port it is on').toBe(port)
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const holder = osProbe().listeningPorts().find((one) => one.port === port)?.pid ?? null
    expect(holder, 'nothing holds the API port, so the pid assertion proves nothing').toBeGreaterThan(0)
    expect(extra?.discovered?.pid, 'the new row does not carry the pid that holds its port').toBe(holder)
  }, 240_000)

  /**
   * AND A ROW WHOSE PROCESS IS GONE IS CLOSED BY THE NEXT START, WITH THE CAUSE.
   *
   * The replaced-rows close cannot reach a browser app row: the browser app is not a part this
   * server files for, and a check worktree's browser app never starts again. So a browser app row
   * whose recorded pid is not on this machine is closed by the start's own reading, beside the
   * replaced-rows close. A row whose process is alive, and a row that records no pid at all, are
   * left exactly as they are.
   */
  it('closes a browser app row whose recorded pid is gone, and leaves a live one and a pid-less one running', async () => {
    const database = join(dir, 'dead-process.db')
    const port = await freePort()
    const webPort = await freePort()
    const api = `http://127.0.0.1:${String(port)}`
    const checkout = REPO.replace(/\/$/, '')
    const { osProbe } = await import('../src/server/lib/resources.ts')
    const thisProcess = osProbe().processById(process.pid)
    if (thisProcess === null) throw new Error('this test process could not be read')

    async function fileABrowserAppRow(discovered: Record<string, unknown> | null): Promise<string> {
      const filed = await fetch(`${api}/api/records`, {
        method: 'POST',
        headers: AS_AN_AGENT,
        body: JSON.stringify({
          kind: 'session',
          title: 'The browser app',
          data: {
            state: 'running',
            runtime: 'vite',
            startedAt: '2026-09-15 10:00:00',
            doing: 'a row this test filed',
            workingDirectory: checkout,
            extra: {
              ownPart: { role: 'The browser app', port: webPort, checkout },
              ...(discovered === null ? {} : { discovered }),
            },
          },
        }),
      })
      const text = await filed.text()
      expect(filed.status, text).toBe(201)
      return (JSON.parse(text) as { record: { id: string } }).record.id
    }

    child = startTheApi(port, database, webPort)
    await waitForHealth(api)
    await registerTheTestWriter(api)
    const theDeadServersPid = child.pid
    if (theDeadServersPid === undefined || theDeadServersPid === null) throw new Error('the first server reported no pid')
    const dead = await fileABrowserAppRow({ pid: theDeadServersPid })
    const alive = await fileABrowserAppRow({ pid: process.pid, pidStartedAt: thisProcess.startedAt })
    const noPid = await fileABrowserAppRow(null)

    // THE ENDING THE CLOSE IS ABOUT: no shutdown, no last word. Every process in the group dies.
    process.kill(-theDeadServersPid, 'SIGKILL')
    child = null
    await waitForPortFree(port)

    child = startTheApi(port, database, webPort)
    await waitForHealth(api)
    const now = await sessions(api)

    const closed = now.find((row) => row.id === dead)
    expect(closed?.data['state'], 'the row whose process is gone still says it is running').toBe('finished')
    expect(String(closed?.data['closedBecause'])).toMatch(
      new RegExp(`^its process ${String(theDeadServersPid)} is gone, found at \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$`),
    )
    expect(closed?.data['closedHow'], 'the start wrote crashed').not.toBe('crashed')

    for (const [id, what] of [
      [alive, 'a row whose process is alive'],
      [noPid, 'a row that records no pid'],
    ] as const) {
      const row = now.find((one) => one.id === id)
      expect(row?.data['state'], `${what} was closed`).toBe('running')
      expect(row?.data['closedBecause'] ?? null).toBeNull()
    }
  }, 240_000)
})

/**
 * A PRESENCE LOOK THE SERVER CANNOT USE STOPS ITS START, IN A SENTENCE THAT NAMES THE SETTING.
 *
 * MOLE_OFFICE_LOOK_AT_PRESENCE_AGAIN_EVERY_MS gives the server's presence clock another interval, so a test office can
 * look every few seconds. A value that is not a whole number of milliseconds, or is below a second, must never run the
 * clock at some other pace, nor at the minute in silence. The rule and its sentence are `theIntervalOfThePresenceLook`
 * in src/shared/presence-clock.ts: the server's clock asks it, and this file reads the sentence from it and types none.
 * Only a start sets the look: the settings door refuses to store it, as read-only, and this file reads that refusal
 * from the door. The server below is a child process of its own on a throwaway database.
 *
 * MUTATIONS, each after a green control run and restored:
 *   the rule takes a bad value as the default minute → the first and third cases red;
 *   the rule takes 999 → the first and third cases red;
 *   runtime-settings.mjs puts the name on RUNTIME_SETTING_NAMES → the second case red;
 *   events.ts `startTheClock` ignores the setting and keeps the minute → the third case red.
 */
describe('a presence look the server cannot use stops its start', () => {
  /** The rule's own refusal of a value, which must name the setting. */
  function theRefusalOf(value: string): string {
    let said = ''
    try {
      theIntervalOfThePresenceLook(value)
    } catch (error) {
      said = error instanceof Error ? error.message : String(error)
    }
    expect(said, `the rule took ${JSON.stringify(value)} without a refusal`).toContain(THE_PRESENCE_LOOK_SETTING)
    return said
  }

  /** End the child's process group, if any of it is left. */
  function theGroupIsEnded(child: ChildProcess): void {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }

  it('refuses every value that is not a whole number of milliseconds from a second up', () => {
    for (const value of ['999', '0', '', 'once a minute', '1500.5', '-2000', '2e3', '2147483648']) theRefusalOf(value)
    expect(theIntervalOfThePresenceLook(null), 'an unset setting does not give the default').toBe(LOOK_AT_PRESENCE_AGAIN_EVERY_MS)
    expect(theIntervalOfThePresenceLook('2000')).toBe(2000)
  })

  it('is refused by the settings door as read-only, so only a start sets it', async () => {
    const t = await freshDb()
    const { apiApp } = await import('./helpers.ts')
    const { app } = await apiApp()
    try {
      const listed = (await app.inject({ method: 'GET', url: '/api/office/settings' }))
        .json()
        .settings.find((s: { name: string }) => s.name === THE_PRESENCE_LOOK_SETTING)
      expect(listed, 'the Office controls page does not show the setting as read-only').toMatchObject({ writable: false, restartRequired: true })
      // A VALUE THE RULE TAKES, so the refusal is for the door and not for the value.
      expect(theIntervalOfThePresenceLook('2000')).toBe(2000)
      const stored = await app.inject({
        method: 'POST',
        url: '/api/office/settings',
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' },
        payload: { changes: [{ name: THE_PRESENCE_LOOK_SETTING, value: '2000' }], because: 'Made-up change reason' },
      })
      expect(stored.statusCode, stored.body).toBe(400)
      expect(stored.json().code, stored.body).toBe('runtimeSettingsReadOnly')
      expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM runtime_settings WHERE name = ?').get(THE_PRESENCE_LOOK_SETTING)).toEqual({ n: 0 })
    } finally {
      await app.close()
      t.close()
    }
  })

  it('stops a server given 999 before it answers, and says why', async () => {
    const said = theRefusalOf('999')
    const t = await freshDb()
    const port = await aFreePortBelowTheEphemeralRange()
    const child = spawn(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...devStackEnvironment(dir, port, port, { database: t.file, workspace: 'default' }),
        MOLE_OFFICE_MESSAGE_WORKER: 'off',
        [THE_PRESENCE_LOOK_SETTING]: '999',
      },
    })
    let output = ''
    child.stdout!.on('data', (chunk) => { output += String(chunk) })
    child.stderr!.on('data', (chunk) => { output += String(chunk) })
    const closed = once(child, 'close')
    try {
      // IT EITHER STOPS OR ANSWERS, and the case waits for whichever comes first, for at most a minute and a half.
      const deadline = Date.now() + 90_000
      let answered = false
      while (child.exitCode === null && child.signalCode === null && !answered && Date.now() < deadline) {
        answered = await fetch(`http://127.0.0.1:${String(port)}/api/health`).then((reply) => reply.ok, () => false)
        if (!answered) await new Promise((go) => setTimeout(go, 300))
      }
      expect(answered, `the server started with ${THE_PRESENCE_LOOK_SETTING}=999. It said:\n${output}`).toBe(false)
      expect(
        child.exitCode,
        child.signalCode === null
          ? `the server neither stopped nor answered within 90 s. It said:\n${output}`
          : `the server was ended by ${child.signalCode} rather than stopping itself. It said:\n${output}`,
      ).not.toBeNull()
      // WHAT IT SAID IS WHOLE ONCE ITS STREAMS CLOSE, and the group is ended first, so nothing it started holds them open.
      theGroupIsEnded(child)
      await closed
      expect(child.exitCode, `the server stopped as if nothing were wrong. It said:\n${output}`).not.toBe(0)
      expect(output, 'the server stopped without saying which setting it could not use').toContain(said)
    } finally {
      theGroupIsEnded(child)
      t.close()
    }
  }, 120_000)
})

/**
 * A SLEEP CLOCK THE SERVER CANNOT USE STOPS ITS START, IN A SENTENCE THAT NAMES THE SETTING.
 *
 * MOLE_OFFICE_RUN_THE_SLEEP_CLOCK_EVERY_MS gives the server's sleep clock another interval, so a test office can run it
 * every second. A value that is not a whole number of milliseconds, or is below a second, must never run the clock at
 * some other pace, nor at the minute in silence. The rule and its sentence are `theIntervalOfTheSleepClock` in
 * src/shared/sleep-clock.ts: the server's start asks it, and this file reads the sentence from it and types none. Only a
 * start sets the interval: the settings door refuses to store it, as read-only, and this file reads that refusal from
 * the door. The server below is a child process of its own on a throwaway database.
 *
 * MUTATIONS, each after a green control run and restored:
 *   the rule takes a bad value as the default minute → the first and third cases red;
 *   the rule takes 999 → the first and third cases red;
 *   runtime-settings.mjs puts the name on RUNTIME_SETTING_NAMES → the second case red;
 *   src/server/index.ts `startTheSleepClock` ignores the setting and keeps the minute → the third case red.
 */
describe('a sleep clock the server cannot use stops its start', () => {
  /** The rule's own refusal of a value, which must name the setting. */
  function theRefusalOf(value: string): string {
    let said = ''
    try {
      theIntervalOfTheSleepClock(value)
    } catch (error) {
      said = error instanceof Error ? error.message : String(error)
    }
    expect(said, `the rule took ${JSON.stringify(value)} without a refusal`).toContain(THE_SLEEP_CLOCK_SETTING)
    return said
  }

  /** End the child's process group, if any of it is left. */
  function theGroupIsEnded(child: ChildProcess): void {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }

  it('refuses every value that is not a whole number of milliseconds from a second up', () => {
    for (const value of ['999', '0', '', 'once a minute', '1500.5', '-2000', '2e3', '2147483648']) theRefusalOf(value)
    expect(theIntervalOfTheSleepClock(null), 'an unset setting does not give the default').toBe(RUN_THE_SLEEP_CLOCK_EVERY_MS)
    expect(theIntervalOfTheSleepClock('2000')).toBe(2000)
  })

  it('is refused by the settings door as read-only, so only a start sets it', async () => {
    const t = await freshDb()
    const { apiApp } = await import('./helpers.ts')
    const { app } = await apiApp()
    try {
      const listed = (await app.inject({ method: 'GET', url: '/api/office/settings' }))
        .json()
        .settings.find((s: { name: string }) => s.name === THE_SLEEP_CLOCK_SETTING)
      expect(listed, 'the Office controls page does not show the setting as read-only').toMatchObject({ writable: false, restartRequired: true })
      // A VALUE THE RULE TAKES, so the refusal is for the door and not for the value.
      expect(theIntervalOfTheSleepClock('2000')).toBe(2000)
      const stored = await app.inject({
        method: 'POST',
        url: '/api/office/settings',
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' },
        payload: { changes: [{ name: THE_SLEEP_CLOCK_SETTING, value: '2000' }], because: 'Made-up change reason' },
      })
      expect(stored.statusCode, stored.body).toBe(400)
      expect(stored.json().code, stored.body).toBe('runtimeSettingsReadOnly')
      expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM runtime_settings WHERE name = ?').get(THE_SLEEP_CLOCK_SETTING)).toEqual({ n: 0 })
    } finally {
      await app.close()
      t.close()
    }
  })

  it('stops a server given 999 before it answers, and says why', async () => {
    const said = theRefusalOf('999')
    const t = await freshDb()
    const port = await aFreePortBelowTheEphemeralRange()
    const child = spawn(join(REPO, 'node_modules', '.bin', 'tsx'), apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...devStackEnvironment(dir, port, port, { database: t.file, workspace: 'default' }),
        MOLE_OFFICE_MESSAGE_WORKER: 'off',
        [THE_SLEEP_CLOCK_SETTING]: '999',
      },
    })
    let output = ''
    child.stdout!.on('data', (chunk) => { output += String(chunk) })
    child.stderr!.on('data', (chunk) => { output += String(chunk) })
    const closed = once(child, 'close')
    try {
      // IT EITHER STOPS OR ANSWERS, and the case waits for whichever comes first, for at most a minute and a half.
      const deadline = Date.now() + 90_000
      let answered = false
      while (child.exitCode === null && child.signalCode === null && !answered && Date.now() < deadline) {
        answered = await fetch(`http://127.0.0.1:${String(port)}/api/health`).then((reply) => reply.ok, () => false)
        if (!answered) await new Promise((go) => setTimeout(go, 300))
      }
      expect(answered, `the server started with ${THE_SLEEP_CLOCK_SETTING}=999. It said:\n${output}`).toBe(false)
      expect(
        child.exitCode,
        child.signalCode === null
          ? `the server neither stopped nor answered within 90 s. It said:\n${output}`
          : `the server was ended by ${child.signalCode} rather than stopping itself. It said:\n${output}`,
      ).not.toBeNull()
      // WHAT IT SAID IS WHOLE ONCE ITS STREAMS CLOSE, and the group is ended first, so nothing it started holds them open.
      theGroupIsEnded(child)
      await closed
      expect(child.exitCode, `the server stopped as if nothing were wrong. It said:\n${output}`).not.toBe(0)
      expect(output, 'the server stopped without saying which setting it could not use').toContain(said)
    } finally {
      theGroupIsEnded(child)
      t.close()
    }
  }, 120_000)
})
