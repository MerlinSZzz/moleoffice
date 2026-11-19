// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S FOLDER GOES WHEN ITS PROCESS ENDS, HOWEVER IT ENDS, AND THE START OF A RUN SWEEPS WHAT A KILLED ONE LEFT.
 *
 * Problem `lZ7OSjBOhUIO`. tests/a-test-folder.ts makes the folder a test copies its database into, and
 * the 64 test files that named theirs their own way now use it. This file proves what it promises.
 *
 * - A folder goes when its process returns, throws, exits with a code, or is sent SIGTERM or SIGINT,
 *   and the process still ends the way it would have. Each child here is a real Node process.
 * - SIGKILL leaves the folder. That is the one ending no code can answer, and why the sweep exists.
 * - A folder made in the temporary directory is written down in a list there, with the process that
 *   made it, and a folder made anywhere else is not. The sweep reads that list and nothing else: not
 *   the temporary directory, and no process but the one a line names. It removes a folder the list
 *   names that is more than a day old and whose maker has ended. It keeps one whose maker still runs,
 *   a young one, and every folder no line names.
 * - A process that ends any way but by SIGKILL takes off the list the lines of the folders it made that
 *   are gone, and puts every other line back as it was. When no line is left, no list is left.
 * - Makers that write at the same time lose no line, and a line written while the sweep works is kept.
 * - A folder whose maker has ended is removed even while another live process holds it.
 * - A line the sweep cannot read, or that names a folder it may not touch, is put back as it was, and
 *   the sweep says so. When it cannot take its list at all, it removes nothing and says why.
 * - vitest runs the sweep before any test file starts.
 * - A folder made while a test fakes the clock is named by the time it was really made, so a sweep
 *   that another run starts meanwhile keeps it.
 *
 * Every folder here is inside this file's own test folder, so nothing outside it is touched. Each maker
 * is a child process whose temporary directory is a folder of this file's.
 */
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'

import config from '../vitest.config.ts'
import { aTestDatabaseFolder, madeAtForAName, removeThisTestFolder, sweepTheTestFoldersLeftBehind, whatTheSweepSays, whenThisTestFolderWasMade } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const THE_HELPER = pathToFileURL(join(REPO, 'tests', 'a-test-folder.ts')).href
const THE_SWEEP_AT_THE_START = './tests/the-test-folders-left-behind-are-swept.ts'
const ours = aTestDatabaseFolder('folder-proof')

/** The process groups this file started. Each child leads its own group, and is stopped only by it. */
const GROUPS = new Set<number>()

afterAll(() => {
  for (const group of GROUPS) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err
    }
  }
  removeThisTestFolder(ours)
})

/** The environment of a child whose temporary directory is `under`. */
function withItsTemporaryDirectory(under: string): NodeJS.ProcessEnv {
  return { ...process.env, TMPDIR: under }
}

/**
 * A test process in miniature: it makes a folder with the helper in its temporary directory, writes a
 * stand-in for a database copy into it, prints the folder, and waits. A line on its input ends it the
 * way its first argument says.
 */
const A_TEST_PROCESS = join(ours, 'a-test-process.mjs')
writeFileSync(A_TEST_PROCESS, `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aTestDatabaseFolder } from ${JSON.stringify(THE_HELPER)}
const [ending] = process.argv.slice(2)
const folder = aTestDatabaseFolder('an-ending')
writeFileSync(join(folder, 'copy.db'), 'a stand-in for a copy of the database\\n')
process.stdout.write(folder + '\\n')
const alive = setInterval(() => {}, 60_000)
process.stdin.once('data', () => {
  clearInterval(alive)
  process.stdin.destroy()
  if (ending === 'throws') throw new Error('a case that throws')
  if (ending === 'exits-with-a-code') process.exit(3)
})
`)

/**
 * A maker that SIGKILL ends as soon as it has made its folders, so nothing of its own removes them. It
 * prints each folder on a line. `madeAgo` moves its clock back before it loads the helper, so the
 * folders' names are that old; `fakedBack` moves it back after, the way a test fakes the clock. With
 * `waitForGo` it first prints `ready`, and makes its folders when a line comes on its input, so several
 * can be started and then let go at once.
 */
const A_MAKER_THAT_IS_KILLED = join(ours, 'a-maker-that-is-killed.mjs')
writeFileSync(A_MAKER_THAT_IS_KILLED, `
import { writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
const how = JSON.parse(process.argv[2])
const theRealClock = Date.now
if (how.madeAgo !== undefined) Date.now = () => theRealClock() - how.madeAgo
const { aTestDatabaseFolder } = await import(${JSON.stringify(THE_HELPER)})
Date.now = how.fakedBack === undefined ? theRealClock : () => theRealClock() - how.fakedBack
function makeThemAndBeKilled() {
  const made = []
  for (let n = 0; n < how.count; n += 1) {
    const folder = aTestDatabaseFolder(how.what)
    writeFileSync(join(folder, 'copy.db'), 'a stand-in for a copy of the database\\n')
    made.push(folder)
  }
  writeSync(1, made.map((folder) => folder + '\\n').join(''))
  process.kill(process.pid, 'SIGKILL')
}
if (how.waitForGo) {
  writeSync(1, 'ready\\n')
  process.stdin.once('data', makeThemAndBeKilled)
} else makeThemAndBeKilled()
`)

/** The folder a maker left in `under`, its temporary directory, before SIGKILL ended it. */
function aFolderLeftByAKilledMaker(under: string, how: { what: string; madeAgo?: number; fakedBack?: number }): string {
  const ran = spawnSync(process.execPath, [A_MAKER_THAT_IS_KILLED, JSON.stringify({ ...how, count: 1 })], {
    env: withItsTemporaryDirectory(under), encoding: 'utf8', timeout: 20_000,
  })
  expect(ran.signal, `the maker did not end by SIGKILL\n${ran.stderr}`).toBe('SIGKILL')
  const left = ran.stdout.split('\n').filter((line) => line !== '')
  expect(left).toHaveLength(1)
  return left[0] as string
}

type Ending = 'returns' | 'throws' | 'exits-with-a-code' | NodeJS.Signals
interface Ended { folder: string; hadItsCopy: boolean; code: number | null; signal: NodeJS.Signals | null; said: string }
interface Running { pid: number; folder: string; hadItsCopy: boolean; end: () => Promise<Ended> }

/** A test process that has made its folder in `under` and waits to end the way `ending` says. */
async function aRunningTestProcess(ending: Ending, under: string): Promise<Running> {
  const child = spawn(process.execPath, [A_TEST_PROCESS, ending], { env: withItsTemporaryDirectory(under), detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const pid = child.pid
  if (pid === undefined) throw new Error('the test process did not start')
  GROUPS.add(pid)
  let said = ''
  child.stderr.on('data', (chunk: Buffer) => { said += chunk.toString() })
  const exited = once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>
  const [folder] = (await once(createInterface({ input: child.stdout }), 'line')) as [string]
  const hadItsCopy = existsSync(join(folder, 'copy.db'))
  return {
    pid, folder, hadItsCopy,
    async end() {
      if (ending.startsWith('SIG')) process.kill(-pid, ending)
      else child.stdin.write('end\n')
      const [code, signal] = await exited
      GROUPS.delete(pid)
      return { folder, hadItsCopy, code, signal, said }
    },
  }
}

async function aTestProcessThat(ending: Ending, under: string): Promise<Ended> {
  return (await aRunningTestProcess(ending, under)).end()
}

/** A maker started with `waitForGo`, once it has said it is ready. */
interface AWaitingMaker { go: () => void; ended: Promise<{ signal: NodeJS.Signals | null; folders: string[]; said: string }> }

async function aMakerWaitingToGo(under: string, what: string, count: number): Promise<AWaitingMaker> {
  const child = spawn(process.execPath, [A_MAKER_THAT_IS_KILLED, JSON.stringify({ what, count, waitForGo: true })], {
    env: withItsTemporaryDirectory(under), detached: true, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pid = child.pid
  if (pid === undefined) throw new Error('the maker did not start')
  GROUPS.add(pid)
  let said = ''
  child.stderr.on('data', (chunk: Buffer) => { said += chunk.toString() })
  const lines: string[] = []
  const reader = createInterface({ input: child.stdout })
  const ready = new Promise<void>((resolve) => {
    reader.on('line', (line) => {
      if (line === 'ready') resolve()
      else lines.push(line)
    })
  })
  // `close` comes after the child's output has all been read, which `exit` does not promise.
  const closed = once(child, 'close') as Promise<[number | null, NodeJS.Signals | null]>
  await Promise.race([ready, closed.then(() => { throw new Error(`the maker ended before it was ready\n${said}`) })])
  return {
    go: () => { child.stdin.write('go\n') },
    ended: closed.then(([, signal]) => {
      GROUPS.delete(pid)
      return { signal, folders: lines, said }
    }),
  }
}

/** A folder named the helper's way, made `ago` milliseconds back, with a file in it, that no list names. */
function anOldFolder(under: string, what: string, ago: number, letters: string): string {
  const folder = join(under, `mole-office-${what}-${madeAtForAName(new Date(Date.now() - ago))}-${letters}`)
  mkdirSync(folder)
  writeFileSync(join(folder, 'copy.db'), 'a stand-in for a copy of the database\n')
  return folder
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
}

/**
 * Where tests/a-test-folder.ts keeps the list for `under`. It is read from the module rather than
 * imported, so that this file type-checks at the commit before the list existed; there it is undefined.
 */
async function theListIn(under: string): Promise<string> {
  const name = Reflect.get(await import('./a-test-folder.ts'), 'theListOfTestFoldersIn') as ((under: string) => string) | undefined
  expect(name, 'tests/a-test-folder.ts names no list of the test folders').toBeDefined()
  return name!(under)
}

const HOUR = 60 * 60 * 1000
const MORE_THAN_A_DAY = 25 * HOUR
const aDayLater = (): Date => new Date(Date.now() + MORE_THAN_A_DAY)

describe('a test folder', () => {
  it.each([
    ['returns', 0, null],
    ['throws', 1, null],
    ['exits-with-a-code', 3, null],
    ['SIGTERM', null, 'SIGTERM'],
    ['SIGINT', null, 'SIGINT'],
  ] as const)('is removed when its process ends this way: %s, and the process ends as it would have', async (ending, code, signal) => {
    const ended = await aTestProcessThat(ending, ours)
    expect(ended.hadItsCopy, `${ended.folder} had no copy in it while the process lived`).toBe(true)
    expect(existsSync(ended.folder), `${ended.folder} is still there after the process ended (${ending})\n${ended.said}`).toBe(false)
    expect([ended.code, ended.signal]).toEqual([code, signal])
    expect(ended.said).not.toContain('could not remove the test folder')
    expect(existsSync(await theListIn(ours)), `a list is still there after the process ended (${ending})\n${ended.said}`).toBe(false)
  })

  it('takes its line off the list as its process ends, and puts back every other line as it was', async () => {
    const under = join(ours, 'lines-taken-off')
    mkdirSync(under)
    const list = await theListIn(under)
    const running = await aRunningTestProcess('returns', under)
    const stillThere = anOldFolder(under, 'still-there', HOUR, 'Aa1Bb2')
    const others = [
      // Its own line, for a folder that is still there.
      JSON.stringify({ folder: stillThere, by: running.pid }),
      // Another process's line, for a folder that is gone.
      JSON.stringify({ folder: join(under, `mole-office-gone-${madeAtForAName(new Date())}-Cc3Dd4`), by: process.pid }),
      'not a line of the list',
    ]
    appendFileSync(list, others.map((line) => `${line}\n`).join(''))
    const ended = await running.end()
    expect(existsSync(ended.folder)).toBe(false)
    expect(readFileSync(list, 'utf8').split('\n').filter((one) => one !== '').sort(), `the list after the process ended\n${ended.said}`).toEqual([...others].sort())
  })

  it('is written down only when it is made directly in the temporary directory', async () => {
    // This process's temporary directory is the run's, so a folder made here is made somewhere else.
    const elsewhere = join(ours, 'not-the-temporary-directory')
    mkdirSync(elsewhere)
    const made = aTestDatabaseFolder('made-elsewhere', elsewhere)
    expect(existsSync(await theListIn(elsewhere)), 'a folder made outside the temporary directory was written down beside it').toBe(false)
    removeThisTestFolder(made)
  })

  it('is left behind by SIGKILL, and a sweep more than a day later removes it', async () => {
    const ended = await aTestProcessThat('SIGKILL', ours)
    expect(ended.signal).toBe('SIGKILL')
    expect(existsSync(join(ended.folder, 'copy.db')), 'SIGKILL ran no code, so the folder should still be there').toBe(true)

    const theSameDay = sweepTheTestFoldersLeftBehind({ under: ours })
    expect(theSameDay.removed).toEqual([])
    expect(existsSync(ended.folder)).toBe(true)

    const later = sweepTheTestFoldersLeftBehind({ under: ours, now: aDayLater() })
    expect(later.removed).toEqual([ended.folder])
    expect(existsSync(ended.folder)).toBe(false)
  })
})

describe('the sweep', () => {
  it('loses no line when makers write at the same time: a day later it removes every folder they left, and nothing no line names', async () => {
    const under = join(ours, 'at-the-same-time')
    mkdirSync(under)
    // As though made before the list existed: named the helper's way and old, but on no line.
    const onNoLine = anOldFolder(under, 'on-no-line', MORE_THAN_A_DAY, 'kkkkkk')
    const makers = await Promise.all(Array.from({ length: 8 }, () => aMakerWaitingToGo(under, 'at-the-same-time', 50)))
    for (const maker of makers) maker.go()
    const ended = await Promise.all(makers.map((maker) => maker.ended))
    for (const one of ended) expect(one.signal, one.said).toBe('SIGKILL')
    const left = ended.flatMap((one) => one.folders)
    expect(left).toHaveLength(8 * 50)

    const did = sweepTheTestFoldersLeftBehind({ under, now: aDayLater() })
    expect(did.removed.length, 'the sweep did not remove exactly the folders the makers left').toBe(left.length)
    expect([...did.removed].sort()).toEqual([...left].sort())
    expect(left.filter((folder) => existsSync(folder))).toEqual([])
    expect(existsSync(onNoLine), 'the sweep removed a folder no line names').toBe(true)
  })

  it('keeps a line written while it works, because what it keeps is added back to the list, never written over it', () => {
    const under = join(ours, 'meanwhile')
    mkdirSync(under)
    const now = aDayLater()
    const before = aFolderLeftByAKilledMaker(under, { what: 'left-before-the-sweep' })
    const meanwhile: string[] = []
    // Not written as an object in the call, so that this file type-checks at the commit before the sweep took `meanwhile`.
    const whileItWorks = { under, now, meanwhile: () => { meanwhile.push(aFolderLeftByAKilledMaker(under, { what: 'left-while-the-sweep-works' })) } }
    const first = sweepTheTestFoldersLeftBehind(whileItWorks)
    expect(meanwhile, 'the sweep never called `meanwhile` between taking its list and putting back what it keeps').toHaveLength(1)
    expect(first.removed).toEqual([before])
    expect(existsSync(meanwhile[0]!)).toBe(true)

    const next = sweepTheTestFoldersLeftBehind({ under, now })
    expect(next.removed, 'the line written while the first sweep worked was lost').toEqual(meanwhile)
  })

  it('removes a folder whose maker has ended even while another live process holds it, and keeps one whose maker still runs', async () => {
    const under = join(ours, 'held')
    mkdirSync(under)
    const left = aFolderLeftByAKilledMaker(under, { what: 'its-maker-ended' })
    mkdirSync(join(left, 'inside'))
    // A live process that did not make it, with a file open in it and working in a folder inside it.
    const holder = spawn(process.execPath, ['-e', `
      require('node:fs').openSync(process.argv[1], 'r')
      process.stdout.write('holding\\n')
      setInterval(() => {}, 60_000)
    `, join(left, 'copy.db')], { cwd: join(left, 'inside'), detached: true, stdio: ['ignore', 'pipe', 'inherit'] })
    if (holder.pid === undefined) throw new Error('the holding process did not start')
    GROUPS.add(holder.pid)
    await once(createInterface({ input: holder.stdout }), 'line')
    const running = await aRunningTestProcess('returns', under)

    const did = sweepTheTestFoldersLeftBehind({ under, now: aDayLater() })
    expect(did.couldNotLook).toBeNull()
    expect(did.removed).toEqual([left])
    expect(existsSync(left)).toBe(false)
    expect(isAlive(holder.pid), 'the process that held the folder should still be running').toBe(true)
    expect(did.held).toEqual([{ folder: running.folder, by: [running.pid] }])
    expect(existsSync(running.folder)).toBe(true)
    const said = whatTheSweepSays(did)
    expect(said).toContain(basename(running.folder))
    expect(said).toContain(String(running.pid))

    const exited = once(holder, 'exit')
    process.kill(-holder.pid, 'SIGKILL')
    await exited
    GROUPS.delete(holder.pid)
    const ended = await running.end()
    expect(existsSync(ended.folder), 'the maker that still ran removed its own folder when it ended').toBe(false)
    // Neither folder is there now, so the next sweep drops both lines and has nothing to say.
    expect(whatTheSweepSays(sweepTheTestFoldersLeftBehind({ under, now: aDayLater() }))).toBeNull()
  })

  it('puts back as it was, and says, every line it cannot read or that names a folder it may not touch', async () => {
    const under = join(ours, 'lines-it-cannot-use')
    mkdirSync(under)
    const list = await theListIn(under)
    const real = aFolderLeftByAKilledMaker(under, { what: 'a-real-line' })
    const [line] = readFileSync(list, 'utf8').split('\n') as [string]
    const elsewhere = join(under, 'elsewhere', basename(real))
    mkdirSync(elsewhere, { recursive: true })
    const noTime = join(under, 'mole-office-no-time-eeeeee')
    mkdirSync(noTime)
    const cannotUse = [
      JSON.stringify({ ...JSON.parse(line), folder: elsewhere }),
      JSON.stringify({ ...JSON.parse(line), folder: noTime }),
      // The real folder, by a process number that would mean every process.
      JSON.stringify({ ...JSON.parse(line), by: -1 }),
      'not a line of the list',
    ]
    appendFileSync(list, cannotUse.map((one) => `${one}\n`).join(''))

    const did = sweepTheTestFoldersLeftBehind({ under, now: aDayLater() })
    expect(did.removed).toEqual([real])
    expect(did.unreadable).toBe(cannotUse.length)
    expect(existsSync(elsewhere)).toBe(true)
    expect(existsSync(noTime)).toBe(true)
    expect(whatTheSweepSays(did)).toContain(list)
    expect(readFileSync(list, 'utf8').split('\n').filter((one) => one !== '').sort()).toEqual([...cannotUse].sort())
  })

  it('removes nothing, and says why, when it cannot take its list', () => {
    const under = join(ours, 'a-list-it-cannot-take')
    mkdirSync(under)
    const left = aFolderLeftByAKilledMaker(under, { what: 'nobody-can-take-the-list' })
    chmodSync(under, 0o500)
    let did: ReturnType<typeof sweepTheTestFoldersLeftBehind>
    try {
      did = sweepTheTestFoldersLeftBehind({ under, now: aDayLater() })
    } finally {
      chmodSync(under, 0o700)
    }
    expect(did.removed).toEqual([])
    expect(did.couldNotLook, 'it removed nothing and did not say why').not.toBeNull()
    expect(did.couldNotLook).toContain(under)
    expect(existsSync(left)).toBe(true)
    expect(whatTheSweepSays(did)).toContain(did.couldNotLook!)
  })

  it('keeps a folder made while a test fakes the clock, because its name has the time it was really made', () => {
    // tests/deadline-route.test.ts sets the clock to 5 October before it makes its first database. Another run
    // that started while it worked swept the same temporary directory, read that folder as weeks old, and
    // removed it under the test.
    const under = join(ours, 'a-faked-clock')
    mkdirSync(under)
    vi.useFakeTimers({ toFake: ['Date'] })
    let made: string
    try {
      vi.setSystemTime(new Date(Date.now() - 16 * 24 * HOUR))
      made = aTestDatabaseFolder('made-while-the-clock-is-faked', under)
    } finally {
      vi.useRealTimers()
    }
    const madeAt = whenThisTestFolderWasMade(made)
    expect(madeAt, `${made} carries no time`).not.toBeNull()
    expect(Math.abs(Date.now() - madeAt!.getTime()), `${made} is named by the faked clock`).toBeLessThan(HOUR)

    // A maker that faked its clock the same way and was then killed: its folder is on the list, and kept.
    const left = aFolderLeftByAKilledMaker(under, { what: 'made-while-the-clock-is-faked', fakedBack: 16 * 24 * HOUR })
    const did = sweepTheTestFoldersLeftBehind({ under })
    expect(did.removed).toEqual([])
    expect(existsSync(made)).toBe(true)
    expect(existsSync(left)).toBe(true)
  })

  it('says nothing when there was nothing old enough to act on', () => {
    const under = join(ours, 'quiet')
    mkdirSync(under)
    expect(whatTheSweepSays(sweepTheTestFoldersLeftBehind({ under })), 'with no list at all').toBeNull()
    aFolderLeftByAKilledMaker(under, { what: 'young' })
    expect(whatTheSweepSays(sweepTheTestFoldersLeftBehind({ under })), 'with one young folder on it').toBeNull()
  })

  it('runs before any test file starts, on the temporary directory of the run', () => {
    expect(config.test?.globalSetup, `vitest.config.ts does not name ${THE_SWEEP_AT_THE_START} under globalSetup`).toContain(THE_SWEEP_AT_THE_START)

    // The global setup itself, in a process of its own whose temporary directory is a folder of this test.
    const under = join(ours, 'a-runs-temporary-directory')
    mkdirSync(under)
    const old = aFolderLeftByAKilledMaker(under, { what: 'a-killed-test-left-it', madeAgo: MORE_THAN_A_DAY })
    const ran = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import setup from ${JSON.stringify(pathToFileURL(join(REPO, THE_SWEEP_AT_THE_START)).href)}; setup()`,
    ], { env: withItsTemporaryDirectory(under), encoding: 'utf8', timeout: 20_000 })
    expect(ran.status, ran.stderr).toBe(0)
    const theLine = whatTheSweepSays({ under, removed: [old], held: [], failed: [], couldNotLook: null, unreadable: 0 })
    expect(ran.stdout).toBe(`${theLine}\n`)
    expect(existsSync(old)).toBe(false)
  })
})
