// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A PROGRAM IS JUDGED AGAINST THE FILES IT IMPORTS, NOT AGAINST THE FOLDERS THEY SIT IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `TMy3C0ydoYYR`, found by the fourth GROUND verifier on 4 September 2026.
 *
 * The API server's freshness was measured against three folders — `src/server`, `src/shared`,
 * `src/config`. `src/shared` holds sixty files and the server imports most of them, but seven are
 * outside what the server loads — six only the browser app imports, and one no file under `src/`
 * imports at all. Saving one of those seven made the API report itself older than the
 * checkout: `GET /api/health` answered ok false with "Restart it", and the red banner blocked the
 * browser app. It never cleared, because `tsx watch` restarts the server only on files the server
 * loaded, and the server had never loaded any of the seven. Ninety seconds after a `touch` of
 * `src/shared/colourroles.ts` the verifier read staleFor=89 and the same process id.
 *
 * That is criterion G4 broken in the direction answer F2 forbids: normally nothing shows, and the
 * red banner appears only when something is wrong. Editing a page-only file is normal use.
 *
 * It is the third time this fault has been measured, each time one level finer: `2hadqssN_rc4` for
 * the page against all of `src/`, `aI9V57-ZTyv0` for the server against all of `src/`, and this one
 * for the server against three folders. The fix stops the sequence, because the set of files a
 * program imports IS the list `tsx watch` restarts it on — the two agree by construction rather
 * than by two people keeping them in step.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. The walk itself, on a small tree written for it: relative imports, the `@shared` alias,
 *    `export … from`, a dynamic `import()` in the entry and another one away from it, a file
 *    nothing imports, a commented-out import, and everything under `node_modules`.
 * 2. The three sets this checkout really has, read from the source: which of the seven files each
 *    program holds, and that nothing in any set failed to resolve.
 * 3. On a real API server: saving any of the seven leaves it as new as the checkout and healthy,
 *    while the browser app's half of the reading moves to that file when the browser app imports it.
 * 4. On the same server: a file BOTH programs import moves both readings, and a file only the
 *    server imports moves only the server's.
 * 5. Under `tsx watch`, which is what `npm run dev` runs: one of the seven does not restart the
 *    server, and a file the server is built from does. That is the claim the whole fix rests on.
 *
 * ---------------------------------------------------------------------------------------
 * IT DOES NOT TOUCH THIS CHECKOUT, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------------------
 *
 * The same reasoning as `tests/the-server-is-judged-on-the-code-it-is-built-from.test.ts`, which
 * this borrows its setup from. A file left newer than the tree for the length of a test would make
 * every other server in the same suite run report itself stale, and twelve test files run at once.
 * So the parts of the checkout a server needs are copied into a temporary directory and the servers
 * are started there. `REPO_ROOT` in src/config/settings.mjs is found from the code's own location,
 * so a server started from the copy reads the copy. No bytes are written even inside it: `utimes`
 * moves a modification time, which is the whole of what the reading looks at.
 */

import { apiServerArguments, commandThatStopsWithItsOwner } from './helpers.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { extname, join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import {
  THE_PAGES_ENTRY,
  THE_SERVER_ENTRY,
  THE_WORKER_ENTRY,
  THE_PAGES_FOLDERS,
  THE_SERVER_FOLDERS,
  THE_WORKER_FOLDERS,
} from '../src/config/newest-source.mjs'
import {
  dynamicImportsIn,
  forgetTheWalks,
  importsIn,
  theFilesBuiltFrom,
  whereItPoints,
  withoutComments,
} from '../src/config/import-graph.mjs'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Two seconds, so a stale server crosses the grace inside this test rather than in fifteen. */
const GRACE = 2

/**
 * THE SEVEN FILES THE VERIFIER MEASURED, EACH TOUCHED IN TURN WITH THE PROCESS ID READ EITHER SIDE.
 *
 * They live under `src/shared` and only `src/web` reaches them, so the API server can never load
 * one and can never pick a change to one up.
 */
const THE_SEVEN = [
  'src/shared/colourroles.ts',
  'src/shared/detail-readers.generated.ts',
  'src/shared/inline.ts',
  'src/shared/mode.ts',
  'src/shared/pictures.ts',
  'src/shared/planwrite.ts',
  'src/shared/reviewmarks.ts',
]

/**
 * THE TWO OF THE SEVEN THAT NEITHER PROGRAM IMPORTS.
 *
 * `src/shared/colourroles.ts` is the colour role register. No file under `src/` imports it —
 * measured by the walk below rather than read — and what does are tests, such
 * as `tests/planning-surfaces.test.ts`, which holds rules over it. A test is not one of the three programs this checkout runs, so the register belongs to
 * no program's set, and saving it moves no reading. That is the right answer: no running process
 * has loaded it, so no running process can be behind it. `src/shared/reviewmarks.ts` is imported
 * only by the register, which no program imports, so it too belongs to no program. The other five
 * are the browser app's, and saving one of them moves the browser app's half.
 */
const IMPORTED_BY_NEITHER_PROGRAM = ['src/shared/colourroles.ts', 'src/shared/reviewmarks.ts']
const THE_PAGES_FIVE = THE_SEVEN.filter((file) => !IMPORTED_BY_NEITHER_PROGRAM.includes(file))

/** A file both programs import, and a file only the server imports. */
const BOTH = 'src/shared/product.ts'
const THE_SERVERS_OWN = 'src/server/lib/health.ts'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface Health {
  ok: boolean
  wrong?: string[]
  code: { verdict: string; staleFor: number | null; grace: number }
}

/** One reading of everything this test asks about, or null while the server is not answering. */
interface Reading {
  runtime: RuntimeRecord
  health: Health
  freshnessHeader: string
}

let dir = ''
let plain: ChildProcess | null = null
let watching: ChildProcess | null = null
let plainApi = ''
let watchingApi = ''

/** What each step of the run saw. Filled in `beforeAll`; the tests below only read it. */
const seen: {
  atTheStart: Reading | null
  afterEachOfTheSeven: Record<string, Reading | null>
  afterAllSevenAndPastTheGrace: Reading | null
  afterTheSharedFile: Reading | null
  afterTheServersOwnFile: Reading | null
  underWatch: { atTheStart: Reading | null; afterOneOfTheSeven: Reading | null; afterTheServersOwnFile: Reading | null }
} = {
  atTheStart: null,
  afterEachOfTheSeven: {},
  afterAllSevenAndPastTheGrace: null,
  afterTheSharedFile: null,
  afterTheServersOwnFile: null,
  underWatch: { atTheStart: null, afterOneOfTheSeven: null, afterTheServersOwnFile: null },
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        probe.close(() => { reject(new Error('the probe socket reported no port')) })
        return
      }
      const { port } = address
      probe.close(() => { resolve(port) })
    })
  })
}

/** Start one server from the copy, as its own process group so one signal stops all of it. */
function start(port: number, name: string, watch: boolean): ChildProcess {
  const watched = commandThatStopsWithItsOwner(join(REPO, 'node_modules/.bin/tsx'), watch ? apiServerArguments(['watch']) : apiServerArguments())
  return spawn(watched.command, watched.args, {
    cwd: dir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, `${name}.db`),
      MOLE_OFFICE_STALE_CODE_GRACE: String(GRACE),
      LOG_LEVEL: 'warn',
      // Not under a test runner as far as the child is concerned: it is a real server, and these
      // would make src/server/db/client.ts refuse a database nobody named.
      VITEST: undefined,
      VITEST_WORKER_ID: undefined,
    } as NodeJS.ProcessEnv,
  })
}

function stop(child: ChildProcess | null): void {
  if (child?.pid === undefined || child.pid === null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    // Already gone, which is the outcome that was wanted.
  }
}

/** One reading of a server, or null while it is not answering. */
async function read(api: string): Promise<Reading | null> {
  try {
    const answered = await fetch(`${api}/api/health`, { headers: { 'x-mole-office-workspace': 'default' } })
    const freshnessHeader = answered.headers.get('x-mole-office-freshness') ?? ''
    const health = (await answered.json()) as Health
    const record = await fetch(`${api}/api/runtime`, { headers: { 'x-mole-office-workspace': 'default' } })
    if (!record.ok) return null
    return { runtime: (await record.json()) as RuntimeRecord, health, freshnessHeader }
  } catch {
    return null
  }
}

/** Wait until a server answers at all, or say how long it was given. */
async function untilItAnswers(api: string, what: string, within = 90_000): Promise<Reading> {
  const stopAt = Date.now() + within
  while (Date.now() < stopAt) {
    const now = await read(api)
    if (now !== null) return now
    await sleep(250)
  }
  throw new Error(`${what} never answered ${api} within ${String(within / 1000)}s.`)
}

/** Wait until a reading satisfies `test`, and say what the last one was when it does not. */
async function until(api: string, test: (r: Reading) => boolean, what: string, within = 60_000): Promise<Reading> {
  const stopAt = Date.now() + within
  let last: Reading | null = null
  while (Date.now() < stopAt) {
    last = await read(api)
    if (last !== null && test(last)) return last
    await sleep(250)
  }
  throw new Error(
    `${what} did not happen within ${String(within / 1000)}s. The last reading was ` +
      `${last === null ? 'nothing at all' : `${last.runtime.freshness.verdict}, ok ${String(last.health.ok)}, ${last.freshnessHeader}`}.`,
  )
}

/** Move one file's modification time to now, in the copy. */
function touch(file: string): void {
  const at = new Date()
  utimesSync(join(dir, file), at, at)
}

beforeAll(async () => {
  dir = aTestDatabaseFolder('built-from')
  // src/config holds roles.json (copied with src), which the server reads before it serves and refuses to start
  // without (P3, P4): a copy of the program without it is not a program that starts.
  for (const part of ['src', 'drizzle', 'package.json', 'tsconfig.json', 'tools/check-worktrees.mjs', 'tools/live-processes.mjs']) {
    cpSync(join(REPO, part), join(dir, part), { recursive: true })
  }
  symlinkSync(join(REPO, 'node_modules'), join(dir, 'node_modules'))

  // ------------------------------------------------------------------ a server that never reloads
  const port = await freePort()
  plainApi = `http://127.0.0.1:${String(port)}`
  plain = start(port, 'plain', false)
  await untilItAnswers(plainApi, 'the server')
  seen.atTheStart = await until(
    plainApi,
    (r) => r.runtime.freshness.verdict === 'as new as the checkout',
    'the server settled as new as the checkout before anything was changed',
  )

  /**
   * STEP ONE: THE SEVEN, ONE AT A TIME. The verdict is read straight away, because it is worked out
   * at the moment of the request and nothing about it waits.
   */
  let lastEditAt = Date.now()
  for (const file of THE_SEVEN) {
    touch(file)
    lastEditAt = Date.now()
    seen.afterEachOfTheSeven[file] = await until(
      plainApi,
      (r) => IMPORTED_BY_NEITHER_PROGRAM.includes(file) || r.runtime.freshness.newestFileForThePage === file,
      `the reading after ${file} was touched`,
    )
  }

  /** STEP TWO: AND STILL HEALTHY PAST THE GRACE, which is the reading that raises the banner. */
  seen.afterAllSevenAndPastTheGrace = await until(
    plainApi,
    () => Date.now() - lastEditAt > (GRACE + 1) * 1000,
    'a reading after all seven edits and past the grace, including its whole-second rounding',
  )

  /** STEP THREE: A FILE BOTH PROGRAMS IMPORT. Both readings have to move. */
  touch(BOTH)
  seen.afterTheSharedFile = await until(
    plainApi,
    (r) => r.runtime.freshness.newestOnDiskFile === BOTH && !r.health.ok,
    'the server reported itself older than the checkout after a change to a file both programs import',
  )

  /** STEP FOUR: A FILE ONLY THE SERVER IMPORTS. The page's half must not move with it. */
  touch(THE_SERVERS_OWN)
  seen.afterTheServersOwnFile = await until(
    plainApi,
    (r) => r.runtime.freshness.newestOnDiskFile === THE_SERVERS_OWN,
    'the server named its own file as the newest of the files it is built from',
  )

  stop(plain)
  plain = null
  await sleep(500)

  // ------------------------------------------------ and the same tree under `tsx watch`, which is
  // what `npm run dev` runs, so that "it restarts on this and not on that" is measured and not read.
  const watchPort = await freePort()
  watchingApi = `http://127.0.0.1:${String(watchPort)}`
  watching = start(watchPort, 'watching', true)
  await untilItAnswers(watchingApi, 'the watching server', 120_000)
  seen.underWatch.atTheStart = await until(
    watchingApi,
    (r) => r.runtime.freshness.verdict === 'as new as the checkout',
    'the watching server settled as new as the checkout',
  )

  const before = seen.underWatch.atTheStart.runtime.process.pid
  touch('src/shared/pictures.ts')
  seen.underWatch.afterOneOfTheSeven = await until(
    watchingApi,
    (r) => r.runtime.freshness.newestFileForThePage === 'src/shared/pictures.ts',
    'the watching server read the touched page file',
  )

  touch(THE_SERVERS_OWN)
  seen.underWatch.afterTheServersOwnFile = await until(
    watchingApi,
    (r) => r.runtime.process.pid !== before && r.runtime.freshness.verdict === 'as new as the checkout',
    'the watching server restarted on a change to a file it is built from and came back fresh',
    120_000,
  )
}, 420_000)

afterAll(async () => {
  stop(plain)
  stop(watching)
  await sleep(500)
  rmSync(dir, { recursive: true, force: true })
})

// ======================================================================== the walk, on a small tree

/**
 * A TREE WRITTEN FOR THE WALK, holding one of everything the walk has to get right.
 *
 * It is not this checkout. The checkout proves what the walk finds in real code, further down; this
 * proves what the walk does with each shape, where the right answer can be written out in full.
 */
describe('the walk follows imports and nothing else', () => {
  let fixture = ''

  beforeAll(() => {
    fixture = aTestDatabaseFolder('import-fixture')
    const write = (path: string, text: string): void => {
      const full = join(fixture, path)
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, text)
    }
    write(
      'src/entry.ts',
      [
        "import { a } from './lib/a.ts'",
        "import shared from '@shared/b.ts'",
        "export { d } from './lib/d.ts'",
        "import 'react'",
        "import { readFileSync } from 'node:fs'",
        "import type { OnlyAType } from './lib/atype.ts'",
        "import { type AlsoOnlyAType } from './lib/anothertype.ts'",
        "// import { commented } from './lib/commented.ts'",
        "/* import { blocked } from './lib/blocked.ts' */",
        "const where = 'http://example.test//not-a-comment'",
        'const pattern = /[/]not-a-comment/',
        'export async function later() {',
        "  const c = await import('./lib/c.ts')",
        '  return { a, shared, c, where, pattern, readFileSync }',
        '}',
      ].join('\n'),
    )
    write(
      'src/lib/a.ts',
      [
        "import { e } from '../shared/e.ts'",
        'export const a = e',
        // A dynamic import somewhere that is NOT the entry: a file this program may load later and
        // has not loaded yet.
        "export async function whenSomebodyAsks() { return import('./only-when-asked.ts') }",
      ].join('\n'),
    )
    write('src/lib/only-when-asked.ts', 'export const asked = 1')
    write('src/lib/c.ts', 'export const c = 1')
    write('src/lib/d.ts', 'export const d = 1')
    write('src/lib/atype.ts', 'export interface OnlyAType { x: number }')
    write('src/lib/anothertype.ts', 'export interface AlsoOnlyAType { x: number }')
    write('src/lib/commented.ts', 'export const commented = 1')
    write('src/lib/blocked.ts', 'export const blocked = 1')
    write('src/lib/nobody-imports-this.ts', 'export const lonely = 1')
    write('src/shared/b.ts', "export default 'b'")
    write('src/shared/e.ts', 'export const e = 1')
    // A page that draws parts of two SVG files, one under src/ and one it serves from public/, and links
    // to a place on itself.
    write(
      'src/page.html',
      [
        '<svg><use href="./lib/icon.svg#star" /><use href="./sprites/parts.svg#back" /></svg>',
        '<a href="#top">top</a>',
      ].join('\n'),
    )
    write('src/lib/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"><g id="star" /></svg>')
    write('public/sprites/parts.svg', '<svg xmlns="http://www.w3.org/2000/svg"><g id="back" /></svg>')
    // A package, which the walk must never open even though the entry names it.
    write('node_modules/react/index.js', "export const React = 1\nimport './deep.js'")
    write('node_modules/react/deep.js', 'export const deep = 1')
    forgetTheWalks()
  })

  afterAll(() => {
    rmSync(fixture, { recursive: true, force: true })
    forgetTheWalks()
  })

  it('finds exactly the files the entry can reach, and nothing else', () => {
    const walked = theFilesBuiltFrom('src/entry.ts', fixture)
    expect(walked.files.sort()).toEqual(
      [
        'src/entry.ts',
        'src/lib/a.ts',
        'src/lib/c.ts',
        'src/lib/d.ts',
        'src/shared/b.ts',
        'src/shared/e.ts',
      ].sort(),
    )
    expect(walked.unresolved).toEqual([])
    expect(walked.couldNotRead).toEqual([])
  })

  /**
   * A DYNAMIC IMPORT AWAY FROM THE ENTRY IS A FILE THE PROGRAM MAY LOAD, NOT ONE IT HAS.
   *
   * Measured against `tsx watch`'s own watch list on 4 September 2026: four files were in the walk
   * and not in that list, and every one of them was reached only by an `await import()` inside a
   * route handler nobody had called. Counting them would report the server stale about code it has
   * not got, with nothing able to clear it.
   */
  it('follows a dynamic import in the entry and not one anywhere else', () => {
    const walked = theFilesBuiltFrom('src/entry.ts', fixture)
    expect(walked.files, "the entry's own dynamic import").toContain('src/lib/c.ts')
    expect(walked.files, 'a dynamic import inside another file').not.toContain('src/lib/only-when-asked.ts')
    // And the two are told apart at the source, which is what the walk reads.
    expect(dynamicImportsIn("const c = await import('./c.ts')", '.ts')).toEqual(['./c.ts'])
    expect(dynamicImportsIn("type Db = typeof import('./client.ts')['db']", '.ts')).toEqual([])
    expect(importsIn("const c = await import('./c.ts')", '.ts')).toEqual([])
  })

  it('does not mistake a slash inside a string or a pattern for a comment', () => {
    const text = readFileSync(join(fixture, 'src/entry.ts'), 'utf8')
    const cleaned = withoutComments(text)
    expect(cleaned, 'the two slashes inside a quoted address were read as a comment').toContain(
      'http://example.test//not-a-comment',
    )
    expect(cleaned, 'a commented-out import survived').not.toContain('lib/commented.ts')
    expect(cleaned, 'a block-commented import survived').not.toContain('lib/blocked.ts')
  })

  it('reads a name beside a type as a value, so the file is followed', () => {
    expect(importsIn("import { value, type Shape } from './both.ts'", '.ts')).toEqual(['./both.ts'])
    expect(importsIn("import { type Shape } from './only.ts'", '.ts')).toEqual([])
    expect(importsIn("import type { Shape } from './only.ts'", '.ts')).toEqual([])
    expect(importsIn("export type { Shape } from './only.ts'", '.ts')).toEqual([])
  })

  it('reads an HTML page and a stylesheet, which is how the browser app is reached', () => {
    expect(importsIn('<link rel="stylesheet" href="./styles.css" />', '.html')).toEqual(['./styles.css'])
    expect(importsIn('<script type="module" src="./main.tsx"></script>', '.html')).toEqual(['./main.tsx'])
    expect(importsIn('<!-- <script src="./gone.tsx"></script> -->', '.html')).toEqual([])
    expect(importsIn("@import './tokens.css';", '.css')).toEqual(['./tokens.css'])
  })

  /**
   * A #FRAGMENT NAMES A PLACE INSIDE A FILE, SO THE WALK FOLLOWS THE FILE.
   *
   * The loading mole's page draws the parts of one SVG with `<use href="./mole-loading/mole.svg#back" />`.
   * On 13 November 2026 the walk dropped a `?query` but not a `#fragment`. It looked for a file named
   * `mole.svg#back`, reported the nine part references as holes in the page's set, and a prepared start
   * was refused. A reference with a fragment is read as the same reference without it, so a fragment on
   * a file that is not there is still a hole.
   */
  it('reads a #fragment as a place inside a file, and follows the file', () => {
    const page = join(fixture, 'src/page.html')
    const pairs = [
      ['./lib/icon.svg#star', './lib/icon.svg', { resolved: join(fixture, 'src/lib/icon.svg') }, 'a file under src/'],
      ['./sprites/parts.svg#back', './sprites/parts.svg', null, 'a file the page serves from public/'],
      ['./lib/gone.svg#back', './lib/gone.svg', { unresolved: true }, 'a file that is not there'],
    ] as const
    for (const [withPart, file, answer, what] of pairs) {
      expect(whereItPoints(file, page, fixture), `${what}, with no fragment`).toEqual(answer)
      expect(whereItPoints(withPart, page, fixture), `${what}, with a fragment`).toEqual(answer)
    }
    expect(whereItPoints('#top', page, fixture), 'a place on the page itself').toBeNull()
    const walked = theFilesBuiltFrom('src/page.html', fixture)
    expect(walked.unresolved, 'a part of a file was taken for a file of its own').toEqual([])
    expect(walked.files).toEqual(['src/lib/icon.svg', 'src/page.html'])
  })
})

// ================================================================= the three sets in this checkout

describe('the three sets this checkout really has', () => {
  const server = theFilesBuiltFrom(THE_SERVER_ENTRY, REPO)
  const page = theFilesBuiltFrom(THE_PAGES_ENTRY, REPO)
  const worker = theFilesBuiltFrom(THE_WORKER_ENTRY, REPO)

  it('found a whole program at each entry, not one file', () => {
    // Without this, an entry that resolved to nothing would read exactly like a fresh checkout.
    expect(server.files.length).toBeGreaterThan(100)
    expect(page.files.length).toBeGreaterThan(100)
    expect(worker.files.length).toBeGreaterThan(5)
  })

  it('followed every specifier it found: nothing under src/ was left unresolved', () => {
    // A specifier the walk cannot follow is a hole in a set, and a hole nobody is told about is the
    // state this criterion exists to prevent.
    expect(server.unresolved, 'the API server').toEqual([])
    expect(page.unresolved, 'the browser app').toEqual([])
    expect(worker.unresolved, 'the message worker').toEqual([])
    expect([...server.couldNotRead, ...page.couldNotRead, ...worker.couldNotRead]).toEqual([])
  })

  /** THE WHOLE OF PROBLEM `TMy3C0ydoYYR`, read from the source rather than from a running server. */
  it('keeps the seven page-only files out of the API server, which is the defect', () => {
    for (const file of THE_SEVEN) {
      expect(server.files, `${file} is in the API server's set and the API server cannot load it`).not.toContain(file)
    }
  })

  it('gives five of the seven to the browser app, which does import them', () => {
    for (const file of THE_PAGES_FIVE) {
      expect(page.files, `${file} is in no set at all, so saving it would move nothing`).toContain(file)
    }
  })

  /**
   * AND THE OTHER TWO BELONG TO NO PROGRAM, which is a reading and not an oversight.
   *
   * No file under `src/` imports `src/shared/colourroles.ts`; one test file and one tool do. So no running
   * process has loaded it, no process can be behind it, and no reading moves when it is saved.
   * Under the folder rule it made the API server report itself broken for ever.
   * `src/shared/reviewmarks.ts` is imported only by `src/shared/colourroles.ts`, which no program
   * imports, so it too belongs to no program.
   */
  it('gives each of the two neither program imports to nobody', () => {
    for (const file of IMPORTED_BY_NEITHER_PROGRAM) {
      expect(server.files, `${file} is in the API server's set`).not.toContain(file)
      expect(page.files, `${file} is in the browser app's set`).not.toContain(file)
      expect(worker.files, `${file} is in the message worker's set`).not.toContain(file)
    }
  })

  it('holds the files each program obviously is built from', () => {
    expect(page.files).toContain(THE_PAGES_ENTRY)
    expect(page.files, 'the page entry does not reach main.tsx').toContain('src/web/main.tsx')
    expect(page.files, 'the stylesheet linked from the page').toContain('src/web/styles.css')
    expect(page.files, 'the stylesheet that one imports').toContain('src/web/tokens.css')
    expect(page.files).toContain('src/web/App.tsx')
    expect(server.files).toContain(THE_SERVER_ENTRY)
    expect(server.files).toContain(THE_SERVERS_OWN)
    expect(server.files, 'a file both programs import').toContain(BOTH)
    expect(page.files, 'a file both programs import').toContain(BOTH)
  })

  /**
   * AND THE SETS ARE NOT THE SAME SET, which is the point of having two of them. If they were, one
   * program's edit would move the other program's reading, which is the whole family of defects.
   */
  it('keeps the two programs apart', () => {
    const onlyTheServers = server.files.filter((file) => !page.files.includes(file))
    const onlyThePages = page.files.filter((file) => !server.files.includes(file))
    expect(onlyTheServers.length).toBeGreaterThan(50)
    expect(onlyThePages.length).toBeGreaterThan(50)
  })

  /** Every import crossing a declared folder boundary must still belong to the program. */
  it('follows imports outside its declared folders without a copied exception list', () => {
    for (const [program, entry, folders] of [
      [server, THE_SERVER_ENTRY, THE_SERVER_FOLDERS],
      [page, THE_PAGES_ENTRY, THE_PAGES_FOLDERS],
      [worker, THE_WORKER_ENTRY, THE_WORKER_FOLDERS],
    ] as const) {
      const outside = (file: string): boolean => !folders.some(folder => file.startsWith(`${folder}/`))
      const importedOutside = new Set<string>()
      for (const file of program.files) {
        const source = readFileSync(join(REPO, file), 'utf8')
        const specifiers = [
          ...importsIn(source, extname(file)),
          ...(entry === THE_PAGES_ENTRY || file === entry ? dynamicImportsIn(source, extname(file)) : []),
        ]
        for (const specifier of specifiers) {
          const target = whereItPoints(specifier, join(REPO, file), REPO)
          if (target === null || !('resolved' in target)) continue
          const imported = relative(REPO, target.resolved)
          if (outside(imported)) importedOutside.add(imported)
        }
      }
      expect(program.files.filter(outside).sort(), entry).toEqual([...importedOutside].sort())
    }
  })
})

// ============================================================== and on a server that is really up

describe('saving one of the seven leaves the API as new as the checkout', () => {
  it('starts fresh and healthy, which is the control', () => {
    expect(seen.atTheStart?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(seen.atTheStart?.health.ok).toBe(true)
    // The count is reported, so `1 file` cannot pass for a whole program.
    expect(seen.atTheStart?.runtime.freshness.filesTheServerIsBuiltFrom ?? 0).toBeGreaterThan(100)
    expect(seen.atTheStart?.runtime.freshness.filesThePageIsBuiltFrom ?? 0).toBeGreaterThan(100)
  })

  for (const file of THE_SEVEN) {
    it(`is still as new as the checkout after ${file} changed`, () => {
      const after = seen.afterEachOfTheSeven[file]
      expect(after, `the server said nothing after ${file} changed`).toBeTruthy()
      /**
       * THE WHOLE OF THE FIX. Before it, this reading was "older than the checkout", ok false, and
       * a red sheet over the browser app — about a server running exactly the right code, with
       * nothing it could ever pick up, for ever.
       */
      expect(after?.runtime.freshness.verdict).toBe('as new as the checkout')
      expect(after?.freshnessHeader).toContain('verdict=fresh')
      // And the process did not restart, which is why the old reading could never clear.
      expect(after?.runtime.process.pid).toBe(seen.atTheStart?.runtime.process.pid)
    })
  }

  for (const file of THE_PAGES_FIVE) {
    it(`moves the browser app's half of the reading to ${file}`, () => {
      // Nothing is lost by the server ignoring it: the page IS told its code went old, by the
      // number that is about the page.
      expect(seen.afterEachOfTheSeven[file]?.runtime.freshness.newestFileForThePage).toBe(file)
    })
  }

  for (const file of IMPORTED_BY_NEITHER_PROGRAM) {
    it(`says nothing moved for ${file}, which neither program imports, because no process loaded it`, () => {
      const after = seen.afterEachOfTheSeven[file]
      expect(after?.runtime.freshness.newestFileForThePage).not.toBe(file)
      expect(after?.runtime.freshness.newestOnDiskFile).not.toBe(file)
    })
  }

  it('is still healthy past the grace, which is what raises the banner', () => {
    const after = seen.afterAllSevenAndPastTheGrace
    expect(after?.health.ok).toBe(true)
    expect(after?.health.wrong).toBeUndefined()
    expect(after?.health.code.verdict).toBe('fresh')
    expect(after?.freshnessHeader).toContain('verdict=fresh')
  })
})

describe('a file both programs import moves both readings, and a server file moves one', () => {
  it('moves both halves for a file both programs import', () => {
    const after = seen.afterTheSharedFile
    expect(after?.runtime.freshness.newestOnDiskFile).toBe(BOTH)
    expect(after?.runtime.freshness.newestFileForThePage).toBe(BOTH)
    // And the server really is behind now, because it really could have loaded that file.
    expect(after?.runtime.freshness.verdict).toBe('older than the checkout')
    expect(after?.health.ok).toBe(false)
    expect(after?.health.wrong?.join(' ')).toContain('older than the checkout')
  })

  it('moves only the server for a file only the server imports', () => {
    const after = seen.afterTheServersOwnFile
    expect(after?.runtime.freshness.newestOnDiskFile).toBe(THE_SERVERS_OWN)
    // The page's half stayed where it was: the page never loads this file.
    expect(after?.runtime.freshness.newestFileForThePage).toBe(BOTH)
    expect(after?.runtime.freshness.verdict).toBe('older than the checkout')
  })

  it('names the count in the sentence a person reads', () => {
    expect(seen.afterTheServersOwnFile?.runtime.freshness.says).toContain('files this server is built from')
  })
})

/**
 * AND THE SET IS THE LIST `tsx watch` RESTARTS ON, WHICH IS THE CLAIM THE FIX RESTS ON.
 *
 * Everything above measures what the server SAYS. This measures what the server DOES, under the
 * supervisor `npm run dev` really uses. If these two ever disagreed the product would be back where
 * it started: a server called stale about a change it will never pick up, or called fresh after
 * picking one up.
 */
describe('under tsx watch, the server restarts on its own files and not on the seven', () => {
  it('starts fresh, which is the control', () => {
    expect(seen.underWatch.atTheStart?.runtime.freshness.verdict).toBe('as new as the checkout')
  })

  it('does not restart for one of the seven, and stays as new as the checkout', () => {
    expect(seen.underWatch.afterOneOfTheSeven?.runtime.process.pid).toBe(
      seen.underWatch.atTheStart?.runtime.process.pid,
    )
    expect(seen.underWatch.afterOneOfTheSeven?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(seen.underWatch.afterOneOfTheSeven?.health.ok).toBe(true)
  })

  it('does restart for a file it is built from, and comes back fresh', () => {
    expect(seen.underWatch.afterTheServersOwnFile?.runtime.process.pid).not.toBe(
      seen.underWatch.atTheStart?.runtime.process.pid,
    )
    expect(seen.underWatch.afterTheServersOwnFile?.runtime.freshness.verdict).toBe('as new as the checkout')
    expect(seen.underWatch.afterTheServersOwnFile?.health.ok).toBe(true)
  })
})
