// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every spool, line, world, sandbox name and day here is made up in a test folder; nothing reads the machine's own spool. */
import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { GATES } from '../src/config/gates.mjs'
import { GATE_COUNT_SPOOL, aGateCountLine } from '../src/config/gate-count-spool.mjs'

// THE GATE-COUNT SPOOL BELONGS TO ONE WORLD (wave 13r round Q, item 10b (3) of briefs/REQUIREMENTS.md; the rule
// 49JsvahAYksf). A machine can run two canonical offices, and both would read the one spool. So the first office that
// reads it writes its world into .world at 0600, once; an office of another world counts nothing and says so once,
// naming both worlds; two offices of one world take a day file's new bytes in one immediate transaction, so a line is
// counted once; and a .world the reader cannot trust is refused by name, never claimed afresh.
type Reader = typeof import('../src/server/lib/gate-count-spool.ts')
type World = typeof import('../src/server/lib/world.ts')
let t: TestDb, reader: Reader, world: World, sqlite: TestDb['client']['sqlite'], spool: string
beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite
  reader = await import('../src/server/lib/gate-count-spool.ts')
  world = await import('../src/server/lib/world.ts')
  spool = join(aTestDatabaseFolder('spool'), GATE_COUNT_SPOOL.folder)
  mkdirSync(spool, {mode: 0o700})
  chmodSync(spool, 0o700)
})
afterEach(() => { vi.useRealTimers(); if (sqlite.open) sqlite.close(); t.close() })

// The row is read from the list, so no gate's id or position is written here a second time.
const SPOOL_ROW = GATES.find(row => row.countedBy === 'the-sandbox-spool')!
const ITS_POSITION = SPOOL_ROW.positions.kind === 'block-remind-off' ? SPOOL_ROW.positions.allowed[0]! : ''
const DAY = '2026-10-20'
const A_LINE = {gate: SPOOL_ROW.id, position: ITS_POSITION, at: `${DAY} 09:15:00`, sandbox: 'made-up-sandbox'}
const ANOTHER_WORLD = 'a-made-up-world'
const A_MINUTE = 60_000

function append(text: string, day = DAY) { appendFileSync(join(spool, `${day}.jsonl`), text, {mode: GATE_COUNT_SPOOL.fileMode}) }
function theWorldFile() { return join(spool, GATE_COUNT_SPOOL.world) }
/** This office's world, which the test database has: a null here would leave nothing to claim with. */
function thisWorld(): string {
  const here = world.theWorldThisDatabaseIs()
  expect(here, 'the test database has no identity').not.toBeNull()
  return here!
}
/** Every line counted from the spool, on every day, read past every door. */
function linesCounted(): number {
  return (sqlite.prepare('SELECT COALESCE(SUM(would_stop), 0) AS n FROM gate_counts').get() as {n: number}).n
}
function theRejectsFile() { return join(spool, GATE_COUNT_SPOOL.rejects) }

// Mutation: write .world at a wider mode, write another world into it, write it again on every read, or claim the spool
// without saying so.
it('writes its world into .world at 0600 on the first read, and leaves it as it was on the next', () => {
  const here = thisWorld()
  append(aGateCountLine(A_LINE))
  const first = reader.readTheGateCountSpool(spool)
  expect(first).toMatchObject({counted: 1, rejected: 0, refused: null})
  expect(first.says).toContainEqual(expect.stringContaining(here))
  expect(readFileSync(theWorldFile(), 'utf8')).toBe(`${here}\n`)
  expect(statSync(theWorldFile()).mode & 0o777).toBe(GATE_COUNT_SPOOL.fileMode)
  // Set back to a made-up moment long past, so a read that wrote the file again would move it.
  utimesSync(theWorldFile(), new Date(2020, 0, 1), new Date(2020, 0, 1))
  const before = statSync(theWorldFile())
  append(aGateCountLine({...A_LINE, at: `${DAY} 09:16:00`}))
  const second = reader.readTheGateCountSpool(spool)
  expect(second).toMatchObject({counted: 1, rejected: 0, refused: null})
  expect(second.says.filter(line => line.includes(here))).toEqual([])
  const after = statSync(theWorldFile())
  expect({ino: after.ino, mode: after.mode, mtimeMs: after.mtimeMs}).toEqual({ino: before.ino, mode: before.mode, mtimeMs: before.mtimeMs})
  expect(readFileSync(theWorldFile(), 'utf8')).toBe(`${here}\n`)
  expect(linesCounted()).toBe(2)
})

// Mutation: read a spool another world owns, count its lines or send them to its rejects file, take it over by writing
// .world again, name only one of the two worlds, log the refusal as well as answering it, or start the minute timer.
it('counts nothing from a spool another world owns, and says so once at start, naming both worlds', () => {
  const here = thisWorld()
  writeFileSync(theWorldFile(), `${ANOTHER_WORLD}\n`, {mode: GATE_COUNT_SPOOL.fileMode})
  append(aGateCountLine(A_LINE) + 'not a line\n')
  const read = reader.readTheGateCountSpool(spool)
  expect(read).toMatchObject({counted: 0, rejected: 0, anotherWorld: ANOTHER_WORLD})
  for (const name of [spool, ANOTHER_WORLD, here]) expect(read.refused).toContain(name)
  expect(read.says).toEqual([read.refused])
  vi.useFakeTimers()
  const lines: string[] = []
  const started = reader.startReadingTheGateCountSpool('canonical', line => lines.push(line), spool, A_MINUTE)
  expect(started.watch).toBeNull()
  expect(started.line).toBe(read.refused)
  vi.advanceTimersByTime(A_MINUTE * 3)
  expect(lines).toEqual([])
  expect(linesCounted()).toBe(0)
  expect(existsSync(theRejectsFile())).toBe(false)
  expect(readFileSync(theWorldFile(), 'utf8')).toBe(`${ANOTHER_WORLD}\n`)
})

// Mutation: go on reading once a minute after another world took the spool, say the refusal at every read, or say it
// without naming both worlds.
it('stops reading for good once another world owns the spool, and says so once', () => {
  const here = thisWorld()
  vi.useFakeTimers()
  const lines: string[] = []
  const started = reader.startReadingTheGateCountSpool('canonical', line => lines.push(line), spool, A_MINUTE)
  try {
    expect(started.watch).not.toBeNull()
    expect(readFileSync(theWorldFile(), 'utf8')).toBe(`${here}\n`)
    // A person hands the spool to another world by hand, and that world's office claims it.
    rmSync(theWorldFile())
    writeFileSync(theWorldFile(), `${ANOTHER_WORLD}\n`, {mode: GATE_COUNT_SPOOL.fileMode})
    append(aGateCountLine(A_LINE))
    const before = lines.length
    vi.advanceTimersByTime(A_MINUTE)
    expect(lines).toHaveLength(before + 1)
    for (const name of [spool, ANOTHER_WORLD, here]) expect(lines.at(-1)).toContain(name)
    // With .world gone, an office still reading would claim the spool again and count the line. This one reads no more.
    rmSync(theWorldFile())
    vi.advanceTimersByTime(A_MINUTE * 3)
    expect(lines).toHaveLength(before + 1)
    expect(existsSync(theWorldFile())).toBe(false)
    expect(linesCounted()).toBe(0)
  } finally {
    if (started.watch !== null) clearInterval(started.watch)
  }
})

// TWO OFFICES OF ONE WORLD, AS TWO PROCESSES ON ONE DATABASE, each reading in a loop while lines are appended. Each
// child prints `ready` once its world is read, then waits for the go file, reads until it sees the stop file, and reads
// once more, so every line written before the stop file is read by one of them.
const A_READER = `
const {existsSync} = await import('node:fs')
const {theWorldThisDatabaseIs} = await import('./src/server/lib/world.ts')
const {readTheGateCountSpool} = await import('./src/server/lib/gate-count-spool.ts')
const {sqlite} = await import('./src/server/db/client.ts')
const [spool, go, stop] = JSON.parse(process.env.THE_MADE_UP_SPOOL_RACE)
const result = {world: theWorldThisDatabaseIs(), counted: 0, reads: 0, refused: [], failed: [], first: 0, last: 0}
console.log('ready')
while (!existsSync(go)) {}
result.first = Date.now()
for (;;) {
  const stopping = existsSync(stop)
  try {
    const read = readTheGateCountSpool(spool)
    result.counted += read.counted
    if (read.refused !== null) result.refused.push(read.refused)
  } catch (error) {
    result.failed.push(String(error))
  }
  result.reads += 1
  if (stopping) break
}
result.last = Date.now()
sqlite.close()
console.log(JSON.stringify(result))
`
type AReadersResult = {world: string | null; counted: number; reads: number; refused: string[]; failed: string[]; first: number; last: number}

function startAReader(go: string, stop: string): {child: ChildProcess; ready: Promise<void>; done: Promise<AReadersResult>} {
  const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', A_READER], {
    cwd: process.cwd(),
    env: {...process.env, TSX_TSCONFIG_PATH: join(process.cwd(), 'tsconfig.json'), MOLE_OFFICE_DB: t.file, THE_MADE_UP_SPOOL_RACE: JSON.stringify([spool, go, stop])},
  })
  let out = '', err = ''
  child.stderr!.on('data', chunk => { err += chunk })
  const ready = new Promise<void>((resolve, reject) => {
    child.stdout!.on('data', chunk => { out += chunk; if (out.split('\n').includes('ready')) resolve() })
    child.on('exit', code => reject(new Error(`a reader ended before it was ready, with ${code}: ${err}`)))
  })
  const done = new Promise<AReadersResult>((resolve, reject) => {
    child.on('exit', code => {
      if (code !== 0) return reject(new Error(`a reader ended with ${code}: ${err}`))
      resolve(JSON.parse(out.trim().split('\n').at(-1)!))
    })
  })
  // Handled here so a reader killed after a failed expectation is not also an unhandled rejection; awaiting still throws.
  ready.catch(() => {})
  done.catch(() => {})
  return {child, ready, done}
}

// Mutation: read how far a day file was read outside the write transaction, or open that transaction as a deferred one.
it('counts each line exactly once when two offices of one world read one spool at once', async () => {
  const here = thisWorld()
  // The spool is claimed first, so both readers find it their world's and the race is over the lines alone.
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 0, refused: null})
  const race = aTestDatabaseFolder('spool-race')
  const go = join(race, 'go'), stop = join(race, 'stop')
  const readers = [startAReader(go, stop), startAReader(go, stop)]
  try {
    await Promise.all(readers.map(one => one.ready))
    writeFileSync(go, '')
    const days = ['2026-10-20', '2026-10-21', '2026-10-22']
    let written = 0
    for (let batch = 0; batch < 60; batch += 1) {
      for (const day of days) {
        const lines = Array.from({length: 20}, (_, n) => aGateCountLine({...A_LINE, at: `${day} 10:${String(batch).padStart(2, '0')}:${String(n).padStart(2, '0')}`}))
        append(lines.join(''), day)
        written += lines.length
      }
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    writeFileSync(stop, '')
    const results = await Promise.all(readers.map(one => one.done))
    expect(results.map(one => one.world)).toEqual([here, here])
    expect(results.flatMap(one => one.failed)).toEqual([])
    expect(results.flatMap(one => one.refused)).toEqual([])
    expect(results[0]!.counted + results[1]!.counted).toBe(written)
    expect(linesCounted()).toBe(written)
    // They read at once: each began before the other ended.
    expect(results[0]!.first < results[1]!.last && results[1]!.first < results[0]!.last).toBe(true)
  } finally {
    for (const one of readers) one.child.kill()
  }
}, 120_000)

// Mutation: follow a .world that is a link, accept one at another mode or one that is a folder, claim the spool afresh
// over a .world it cannot read, or claim it for an office whose world has no identity.
it('refuses a .world that is a link, not at 0600, not a plain file or not one identity, by name, and counts nothing', () => {
  const here = thisWorld()
  append(aGateCountLine(A_LINE))
  const refusedFor = (...names: string[]) => {
    const read = reader.readTheGateCountSpool(spool)
    expect(read).toMatchObject({counted: 0, rejected: 0})
    for (const name of [spool, GATE_COUNT_SPOOL.world, ...names]) expect(read.refused).toContain(name)
    expect(read.says).toEqual([read.refused])
  }
  // A link to a file that holds this very world is still a link.
  const elsewhere = join(aTestDatabaseFolder('world-elsewhere'), 'world')
  writeFileSync(elsewhere, `${here}\n`, {mode: GATE_COUNT_SPOOL.fileMode})
  symlinkSync(elsewhere, theWorldFile())
  refusedFor('link')
  expect(readlinkSync(theWorldFile())).toBe(elsewhere)
  rmSync(theWorldFile())
  writeFileSync(theWorldFile(), `${here}\n`, {mode: GATE_COUNT_SPOOL.fileMode})
  chmodSync(theWorldFile(), 0o644)
  refusedFor('0644', '0600')
  rmSync(theWorldFile())
  mkdirSync(theWorldFile(), {mode: 0o700})
  refusedFor('not a plain file')
  rmSync(theWorldFile(), {recursive: true})
  // An empty .world, or one whose line has no end, is one the reader cannot read, and it is not claimed afresh.
  for (const text of ['', here]) {
    writeFileSync(theWorldFile(), text, {mode: GATE_COUNT_SPOOL.fileMode})
    chmodSync(theWorldFile(), GATE_COUNT_SPOOL.fileMode)
    refusedFor('identity')
    expect(readFileSync(theWorldFile(), 'utf8')).toBe(text)
    rmSync(theWorldFile())
  }
  // An office whose world has no identity never guesses one: it claims nothing and reads nothing.
  const nobody = reader.readTheGateCountSpool(spool, null)
  expect(nobody).toMatchObject({counted: 0, rejected: 0})
  expect(nobody.refused).toContain(spool)
  expect(nobody.refused).toContain('no identity')
  expect(existsSync(theWorldFile())).toBe(false)
  expect(linesCounted()).toBe(0)
  expect(existsSync(theRejectsFile())).toBe(false)
})
