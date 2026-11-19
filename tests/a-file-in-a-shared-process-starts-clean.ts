// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST FILE IN A PROCESS THAT AN EARLIER FILE USED STARTS AS IT WOULD IN A NEW PROCESS.
 *
 * vitest.config.ts names this first among the setup files when MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS
 * is on (`isolate: false`). vitest then runs every setup file again before each test file, but keeps
 * the process, the modules it has loaded and anything the last file left behind.
 *
 * Before a process's first file, it waits until enough memory is free:
 * tests/a-test-process-starts-only-while-memory-is-free.ts.
 *
 * Before each later file, it takes back what a new process would not have, before any other setup
 * file runs:
 *   1. a faked clock;
 *   2. the servers and folders the last file left, as the end of its process would have done;
 *   3. the shared Chromium, which took its time zone and the rest of its environment from the file
 *      that launched it;
 *   4. every module the last file evaluated, every module it mocked, and every mock it made;
 *   5. the environment, the working folder and the globals, as they were before the first file, except
 *      a global that holds something running for the whole process;
 *   6. better-sqlite3's statement methods, as they were before the first file;
 *   7. the memory the last file used, which it collects.
 * What it keeps on purpose: the process, the migrated schema, the built page and what Node itself has
 * loaded. Those are what sharing the process saves.
 *
 * IT READS TWO OF vitest's OWN OBJECTS, `__vitest_worker__` and `__vitest_mocker__`, because vitest
 * gives no other way to do what it does itself between files when each has its own process. If
 * either is not the shape this file expects, it fails, rather than letting a file start dirty. For
 * the same reason it takes vitest's list of mocks while `vi.clearAllMocks()` walks it, and fails if
 * that walk does not show the list.
 */
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { vi } from 'vitest'

/** The real `node:fs`: the home guard mocks it, and an import here would reach the last file's mock. */
const realFs = createRequire(import.meta.url)('node:fs') as typeof import('node:fs')

interface BeforeTheFirstFile {
  env: Record<string, string | undefined>
  cwd: string
  globals: Map<string | symbol, PropertyDescriptor>
  title: string
  statements: { prototype: object; properties: Map<string | symbol, PropertyDescriptor> }
}

interface TheProcessRecords {
  __moleOfficeBeforeTheFirstFile?: BeforeTheFirstFile
  __moleOfficeStartedByThisProcess?: {
    groups: Set<number>
    transcripts: string | null
    browser: { close(): Promise<void> } | null
    browserComing: unknown
    migratedSchema: string | null
  }
  __moleOfficeTestFolders?: Set<string>
}

interface ModuleNode {
  evaluated: boolean
  promise: unknown
  exports: unknown
  importers: Set<string>
}

const records = process as unknown as TheProcessRecords

/** vitest's own modules, which it never resets between files either. */
const VITESTS_OWN = [/\/vitest\/dist\//, /vitest-virtual-\w+\/dist/, /@vitest\/dist/]

/** Globals that are vitest's or vite's own, set up once for the worker. */
function isTheRunners(key: string | symbol): boolean {
  return typeof key === 'string' && /^__vi(test|te)_|^__VITEST/.test(key)
}

/**
 * Globals a dependency adds once it is loaded and that cannot be removed. The dependency itself stays
 * loaded in the process, so a later file would find them there anyway. Any other global that cannot be
 * removed stops the clean start.
 */
const ADDED_BY_A_LOADED_DEPENDENCY = new Set<string | symbol>([
  // undici, inside Node's own fetch and as a package: the dispatcher, under its old and new names.
  Symbol.for('undici.globalDispatcher.1'),
  Symbol.for('undici.globalDispatcher.2'),
  // undici: the origin fetch resolves a relative address against.
  Symbol.for('undici.globalOrigin.1'),
  // graceful-fs, as a package and inside Playwright: its queue of files waiting to be opened.
  Symbol.for('graceful-fs.queue'),
  // signal-exit, inside Playwright: the one emitter every copy of it shares.
  Symbol.for('signal-exit emitter'),
])

/**
 * Globals one of this checkout's own modules keeps for the whole process, because what they hold
 * outlives the module. The module is loaded again for the next file. Removing the global would not stop
 * what it holds, and the module would start a second one beside it (problem 20MmS7mSGmXu).
 */
const KEPT_FOR_THE_WHOLE_PROCESS = new Set<string | symbol>([
  // src/server/lib/named-timers.ts: the newest garbage collections, and the one observer that keeps them.
  Symbol.for('mole-office.named-timers.collections'),
])

/** Every own property of `of`, as it is now. */
function theOwnPropertiesOf(of: object): Map<string | symbol, PropertyDescriptor> {
  return new Map(Reflect.ownKeys(of).map((key) => [key, Object.getOwnPropertyDescriptor(of, key) as PropertyDescriptor]))
}

/** Whether a property is still the one that was recorded. */
function isAsRecorded(now: PropertyDescriptor | undefined, was: PropertyDescriptor): boolean {
  return now !== undefined && Object.is(now.value, was.value) && now.get === was.get && now.set === was.set
}

/**
 * The prototype every better-sqlite3 statement shares. Its native part is loaded once per process, so a
 * file that wraps the statement methods leaves them wrapped for the next file.
 * src/server/lib/slow-requests.ts does that to count a request's statements, and marks the prototype so
 * that it wraps it once. The wrapper writes to a store kept in a global, which the global step below
 * removes. The next file would make a new store, find the mark and wrap nothing, and count nothing.
 *
 * This is the process's first database, and better-sqlite3 reads SQLITE_USE_URI once, as it opens the
 * first one. tools/open-immutable.mjs sets that variable to 1 when it is loaded, so that a file that reads
 * a store immutably can open its `file:` address. In a process of its own, such a file loads the tool
 * before any database is opened. Here it would load it after, and every immutable opening would be
 * refused with "unable to open database file". So the variable is 1 while this opens its database, and
 * as it was afterwards. Only a database name that begins with `file:` is read differently.
 */
function theStatementPrototype(): object {
  const Database = createRequire(import.meta.url)('better-sqlite3') as new (path: string) => { prepare(sql: string): object; close(): void }
  const useUri = process.env.SQLITE_USE_URI
  process.env.SQLITE_USE_URI = '1'
  try {
    const handle = new Database(':memory:')
    try {
      return Object.getPrototypeOf(handle.prepare('SELECT 1')) as object
    } finally {
      handle.close()
    }
  } finally {
    if (useUri === undefined) delete process.env.SQLITE_USE_URI
    else process.env.SQLITE_USE_URI = useUri
  }
}

/**
 * vitest keeps every mock made in the process in a list of its own, and each mock keeps the object a
 * spy was put on and the function it was made from, with everything that function can reach. After
 * one file that put a spy on its database, the list kept that database for the rest of the process.
 * vitest puts back the last file's spies itself after each file, and leaves the list as it was.
 * The list belongs to vitest's spy module, which is loaded once for the process, and
 * `vi.clearAllMocks()` is the one thing that walks it, with `Set.prototype.forEach`. A mock made here
 * shows which set walked is the list.
 */
function emptyTheListOfMocks(): void {
  const marker = vi.fn()
  const forEach = Set.prototype.forEach
  const walked: Set<unknown>[] = []
  Set.prototype.forEach = function (this: Set<unknown>, callback: (value: unknown, key: unknown, set: Set<unknown>) => void, thisArg?: unknown) {
    walked.push(this)
    forEach.call(this, callback, thisArg)
  }
  try {
    vi.clearAllMocks()
  } finally {
    Set.prototype.forEach = forEach
  }
  const list = walked.find((set) => set.has(marker))
  if (list === undefined) {
    throw new Error('A test file in a shared process cannot be given a clean start: vi.clearAllMocks() no longer walks the list of mocks this file empties, so the last file\'s mocks would keep what they were made from.')
  }
  list.clear()
}

const before = records.__moleOfficeBeforeTheFirstFile
if (before === undefined) {
  // Imported here and not at the top: before a later file, the last file's mocks are still in place
  // until `startClean` takes them back, and this module reads node:fs.
  const { waitUntilMemoryIsFree } = await import('./a-test-process-starts-only-while-memory-is-free.ts')
  await waitUntilMemoryIsFree()
  // Before the globals are recorded, so a global that loading better-sqlite3 adds is among them.
  const statements = theStatementPrototype()
  records.__moleOfficeBeforeTheFirstFile = {
    env: { ...process.env },
    cwd: process.cwd(),
    globals: theOwnPropertiesOf(globalThis),
    title: process.title,
    statements: { prototype: statements, properties: theOwnPropertiesOf(statements) },
  }
} else {
  await startClean(before)
  // What the last file left is garbage now. A new process would start without it.
  const gc = (globalThis as Record<string, unknown>).gc
  if (typeof gc !== 'function') throw new Error('A test file in a shared process cannot be given a clean start: the process was started without --expose-gc, so the last file\'s memory cannot be collected.')
  ;(gc as () => void)()
}

async function startClean(was: BeforeTheFirstFile): Promise<void> {
  // The faked clock goes first. vitest's fake timers put back only a global that is still their own fake:
  // one the global step below had already put back is taken for theirs to remove, and `Date` is deleted.
  vi.useRealTimers()
  const started = records.__moleOfficeStartedByThisProcess
  if (started !== undefined) {
    for (const group of started.groups) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
      }
    }
    started.groups.clear()
    started.transcripts = null
    // Chromium takes its time zone from the environment it is launched in, and a new process would launch one
    // under this file's own. After a file that launched it on Europe/London, the agent page's file set Asia/Shanghai
    // and its page said "This computer's clock is Europe/London" (wave 13n round M).
    if (started.browser !== null) await started.browser.close()
    started.browser = null
    started.browserComing = null
  }
  const keep = started?.migratedSchema == null ? null : dirname(started.migratedSchema)
  for (const folder of records.__moleOfficeTestFolders ?? []) {
    if (folder === keep) continue
    realFs.rmSync(folder, { recursive: true, force: true })
    records.__moleOfficeTestFolders?.delete(folder)
  }

  const worker = (globalThis as Record<string, unknown>).__vitest_worker__ as { evaluatedModules?: { idToModuleMap?: unknown } } | undefined
  const map = worker?.evaluatedModules?.idToModuleMap
  const mocker = (globalThis as Record<string, unknown>).__vitest_mocker__ as { reset?: unknown } | undefined
  if (!(map instanceof Map) || typeof mocker?.reset !== 'function') {
    throw new Error('A test file in a shared process cannot be given a clean start: vitest no longer has the module map or the mocker this file resets.')
  }
  for (const [id, node] of map as Map<string, ModuleNode>) {
    if (VITESTS_OWN.some((re) => re.test(id))) continue
    // Still being evaluated: this file itself. Everything else finished with the last file.
    if (node.promise !== undefined && !node.evaluated) continue
    node.promise = undefined
    node.exports = undefined
    node.evaluated = false
    node.importers.clear()
  }
  ;(mocker.reset as () => void).call(mocker)
  emptyTheListOfMocks()

  for (const name of Object.keys(process.env)) {
    if (!(name in was.env)) delete process.env[name]
  }
  for (const [name, value] of Object.entries(was.env)) {
    if (process.env[name] !== value) process.env[name] = value
  }
  if (process.cwd() !== was.cwd) process.chdir(was.cwd)
  if (process.title !== was.title) process.title = was.title

  // A global the last file added goes; one it replaced or removed is put back as it was.
  for (const key of Reflect.ownKeys(globalThis)) {
    if (was.globals.has(key) || isTheRunners(key)) continue
    if (ADDED_BY_A_LOADED_DEPENDENCY.has(key) || KEPT_FOR_THE_WHOLE_PROCESS.has(key)) {
      // From here on, the value it had when it was first seen is the one each file starts with.
      was.globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key) as PropertyDescriptor)
      continue
    }
    if (Object.getOwnPropertyDescriptor(globalThis, key)?.configurable !== true) {
      throw new Error(`A test file in a shared process cannot be given a clean start: the last file left a global that cannot be removed, ${String(key)}.`)
    }
    delete (globalThis as Record<string | symbol, unknown>)[key]
  }
  for (const [key, descriptor] of was.globals) {
    if (isTheRunners(key)) continue
    if (isAsRecorded(Object.getOwnPropertyDescriptor(globalThis, key), descriptor)) continue
    Object.defineProperty(globalThis, key, descriptor)
  }

  // A method of better-sqlite3's statements the last file wrapped is put back, and a mark it added goes.
  const { prototype, properties } = was.statements
  for (const key of Reflect.ownKeys(prototype)) {
    if (!properties.has(key)) delete (prototype as Record<string | symbol, unknown>)[key]
  }
  for (const [key, descriptor] of properties) {
    if (isAsRecorded(Object.getOwnPropertyDescriptor(prototype, key), descriptor)) continue
    Object.defineProperty(prototype, key, descriptor)
  }
}
