// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every spool, line, sandbox name and day here is made up in a test folder; nothing reads the machine's own spool. */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { GATES, gateValueIsAllowed } from '../src/config/gates.mjs'
import { GATE_COUNT_LINE_REFUSED, GATE_COUNT_SPOOL, aGateCountLine } from '../src/config/gate-count-spool.mjs'
import { readATypedTime } from '../src/shared/typed-time.mjs'

// The first office of this process is built in a hook, so the setup hooks below build a warm one.
buildTheFirstOfficeInAHook()

// THE GATE-COUNT SPOOL IS READ ONCE (wave 13r round O, item 10b of briefs/REQUIREMENTS.md; the design, the format
// settled in wO3jF4w33WDc). The sandbox tools append one line per encounter to a day file in a folder at 0700. The
// office counts each line once, on the day it happened, also across a restart. A line it cannot use goes to the
// rejects file with its reason and is not counted. A folder it cannot trust is refused by name, and nothing is read.
type Reader = typeof import('../src/server/lib/gate-count-spool.ts')
const readerPath = '../src/server/lib/gate-count-spool.ts'
let t: TestDb, reader: Reader, sqlite: TestDb['client']['sqlite'], spool: string
beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite
  reader = await import(readerPath)
  spool = join(aTestDatabaseFolder('spool'), GATE_COUNT_SPOOL.folder)
  mkdirSync(spool, {mode: 0o700})
  chmodSync(spool, 0o700)
})
afterEach(() => { vi.useRealTimers(); if (sqlite.open) sqlite.close(); t.close() })

// The rows are read from the list, so no gate's id or position is written here a second time.
const SPOOL_ROW = GATES.find(row => row.countedBy === 'the-sandbox-spool')!
const ITS_POSITION = SPOOL_ROW.positions.kind === 'block-remind-off' ? SPOOL_ROW.positions.allowed[0]! : ''
const NOT_ITS_POSITION = ['block', 'remind', 'off'].find(position => !gateValueIsAllowed(SPOOL_ROW, position))!
const A_SERVER_ROW = GATES.find(row => row.countedBy === 'the-server' && row.positions.kind === 'block-remind-off')!
const DAY = '2026-10-20'
const DAY_FILE = `${DAY}.jsonl`
const A_LINE = {gate: SPOOL_ROW.id, position: ITS_POSITION, at: `${DAY} 09:15:00`, sandbox: 'made-up-sandbox'}

function append(text: string, file = DAY_FILE) { appendFileSync(join(spool, file), text, {mode: GATE_COUNT_SPOOL.fileMode}) }
/** The spool row's count on the made-up day, read past every door. */
function counted(gate = SPOOL_ROW.id, day = DAY) {
  return sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ? AND day = ?').get(gate, day) as {would_stop: number; stopped: number; reminded: number} | undefined
}
function onePositionCounted(times: number) {
  return {would_stop: times, stopped: ITS_POSITION === 'block' ? times : 0, reminded: ITS_POSITION === 'remind' ? times : 0}
}
function everyCount() { return sqlite.prepare('SELECT * FROM gate_counts ORDER BY gate, day').all() }
function theRejects(): {file: string; byte: number; text: string; refused: string; why: string; readAt: string}[] {
  const file = join(spool, GATE_COUNT_SPOOL.rejects)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(line => line !== '').map(line => JSON.parse(line))
}
/** The office stops and starts again on the same database: a new connection, and the reader loaded afresh. */
async function restart() {
  sqlite.close()
  vi.resetModules()
  sqlite = (await import('../src/server/db/client.ts')).sqlite
  reader = await import(readerPath)
}

// Mutation: count a line every time the file is read, keep how far it was read only in memory, count a line before its
// newline is written, count it on the day it was read rather than the day it happened, or store the file's whole length
// when its last line has no newline yet.
it('counts a spool line once on its own day, also across a restart, and waits for a line until its newline is written', async () => {
  append(aGateCountLine(A_LINE))
  const first = reader.readTheGateCountSpool(spool)
  expect(first).toMatchObject({counted: 1, rejected: 0, refused: null})
  expect(counted()).toEqual(onePositionCounted(1))
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 0, rejected: 0, refused: null})
  expect(counted()).toEqual(onePositionCounted(1))
  await restart()
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 0, rejected: 0, refused: null})
  expect(counted()).toEqual(onePositionCounted(1))
  // A line still being written waits, and is counted once its newline is there.
  const second = aGateCountLine({...A_LINE, at: `${DAY} 09:16:00`})
  append(second.slice(0, -1))
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 0, rejected: 0})
  expect(counted()).toEqual(onePositionCounted(1))
  append('\n')
  await restart()
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 1, rejected: 0})
  expect(counted()).toEqual(onePositionCounted(2))
  expect(theRejects()).toEqual([])
  // Only the spool row's own day holds a count, so nothing was counted on the day it was read.
  expect(everyCount()).toEqual([{gate: SPOOL_ROW.id, day: DAY, ...onePositionCounted(2), ignored: 0, heeded: 0}])
})

// Mutation: count a line naming an unknown gate or a server gate, or a position its row does not allow, or a line off
// its file's day; drop a refused line without writing it to the rejects file; give it another reason or another byte;
// make the rejects file at a wider mode; or send the same line to the rejects file again on the next read.
it('sends a line it cannot use to the rejects file with its reason, counts none of them, and sends each once', () => {
  const lines = [
    ['not-json', '{"gate": "made-up'],
    ['fields', JSON.stringify({...A_LINE, extra: 'made up'})],
    ['form', JSON.stringify({...A_LINE, at: 'yesterday morning'})],
    ['unknown-gate', JSON.stringify({...A_LINE, gate: 'a-gate-nobody-declared'})],
    ['not-a-spool-gate', JSON.stringify({...A_LINE, gate: A_SERVER_ROW.id, position: 'block'})],
    ['position', JSON.stringify({...A_LINE, position: NOT_ITS_POSITION})],
    ['day', JSON.stringify({...A_LINE, at: '2026-10-21 09:15:00'})],
  ] as const
  const good = aGateCountLine(A_LINE)
  append(lines.map(([, text]) => `${text}\n`).join('') + good)
  const read = reader.readTheGateCountSpool(spool)
  expect(read).toMatchObject({counted: 1, rejected: lines.length, refused: null})
  expect(read.says.join('\n')).toContain(GATE_COUNT_SPOOL.rejects)
  expect(counted()).toEqual(onePositionCounted(1))
  expect(counted(A_SERVER_ROW.id)).toBeUndefined()
  const rejects = theRejects()
  let byte = 0
  expect(rejects.map(({readAt, ...one}) => one)).toEqual(lines.map(([refused, text]) => {
    const one = {file: DAY_FILE, byte, text, refused, why: GATE_COUNT_LINE_REFUSED[refused]}
    byte += Buffer.byteLength(text) + 1
    return one
  }))
  for (const {readAt} of rejects) expect(readATypedTime(readAt), readAt).toBe(readAt)
  expect(statSync(join(spool, GATE_COUNT_SPOOL.rejects)).mode & 0o777).toBe(GATE_COUNT_SPOOL.fileMode)
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 0, rejected: 0})
  expect(theRejects()).toHaveLength(lines.length)
  expect(counted()).toEqual(onePositionCounted(1))
})

// Mutation: read a spool at another mode, read through a link, read a file in its place, fail on an absent spool
// instead of saying it is absent, or say a refusal without naming the folder.
it('refuses a spool that is not a folder at 0700, by name, and counts nothing from it', () => {
  append(aGateCountLine(A_LINE))
  chmodSync(spool, 0o755)
  const wide = reader.readTheGateCountSpool(spool)
  expect(wide).toMatchObject({counted: 0, rejected: 0})
  expect(wide.refused).toContain(spool)
  expect(wide.refused).toContain('0755')
  expect(wide.says).toEqual([wide.refused])
  chmodSync(spool, 0o700)
  const link = join(aTestDatabaseFolder('spool-link'), GATE_COUNT_SPOOL.folder)
  symlinkSync(spool, link)
  const linked = reader.readTheGateCountSpool(link)
  expect(linked.refused).toContain(link)
  expect(linked.refused).toContain('is a link')
  const file = join(aTestDatabaseFolder('spool-file'), GATE_COUNT_SPOOL.folder)
  writeFileSync(file, 'made up', {mode: 0o600})
  const notAFolder = reader.readTheGateCountSpool(file)
  expect(notAFolder.refused).toContain(file)
  expect(notAFolder.refused).toContain('not a folder')
  const absent = join(aTestDatabaseFolder('spool-absent'), GATE_COUNT_SPOOL.folder)
  expect(reader.readTheGateCountSpool(absent)).toEqual({counted: 0, rejected: 0, refused: null, says: [expect.stringContaining(absent)]})
  expect(everyCount()).toEqual([])
  expect(theRejects()).toEqual([])
})

// Mutation: read a day file that was cut shorter than what was read, or skip it without saying so; read a name that is
// not a day file, or skip it without saying so.
it('names and skips a day file cut shorter than what was read, and a name that is not a day file', () => {
  append(aGateCountLine(A_LINE) + aGateCountLine({...A_LINE, at: `${DAY} 09:16:00`}))
  expect(reader.readTheGateCountSpool(spool)).toMatchObject({counted: 2})
  truncateSync(join(spool, DAY_FILE), 0)
  append(aGateCountLine(A_LINE))
  writeFileSync(join(spool, 'made-up-notes.txt'), aGateCountLine(A_LINE), {mode: 0o600})
  const read = reader.readTheGateCountSpool(spool)
  expect(read).toMatchObject({counted: 0, rejected: 0, refused: null})
  expect(read.says).toContainEqual(expect.stringContaining(`${DAY_FILE} in the gate-count spool is`))
  expect(read.says).toContainEqual(expect.stringContaining('made-up-notes.txt in the gate-count spool is not a day file'))
  expect(counted()).toEqual(onePositionCounted(2))
})

// Mutation: let a scratch office read the spool or claim it, read it only at start, or only once a minute, log the same
// sentences every minute, or leave a read that counted a line out of the log because it says what the last read said.
it('reads the spool at start and once a minute in a canonical office, and never in a scratch one', async () => {
  append(aGateCountLine(A_LINE))
  // A name that is not a day file is said by every read, so it shows which reads are logged.
  writeFileSync(join(spool, 'made-up-notes.txt'), 'made up', {mode: 0o600})
  const lines: string[] = []
  const scratch = reader.startReadingTheGateCountSpool('scratch', line => lines.push(line), spool)
  expect(scratch.watch).toBeNull()
  expect(scratch.line).toContain('scratch')
  expect(lines).toEqual([])
  expect(everyCount()).toEqual([])
  expect(theRejects()).toEqual([])
  expect(existsSync(join(spool, GATE_COUNT_SPOOL.world))).toBe(false)
  // The first read claims the spool for this office's world and says so, naming it (round Q).
  const claimed = expect.stringContaining((await import('../src/server/lib/world.ts')).theWorldThisDatabaseIs()!)
  vi.useFakeTimers()
  const every = 60_000
  const canonical = reader.startReadingTheGateCountSpool('canonical', line => lines.push(line), spool, every)
  try {
    const countedOne = expect.stringContaining(`1 line of ${DAY_FILE} in the gate-count spool counted`)
    const notADayFile = expect.stringContaining('made-up-notes.txt in the gate-count spool is not a day file')
    expect(counted()).toEqual(onePositionCounted(1))
    expect(lines).toEqual([claimed, countedOne, notADayFile])
    append(aGateCountLine({...A_LINE, at: `${DAY} 09:16:00`}))
    vi.advanceTimersByTime(every - 1)
    expect(counted()).toEqual(onePositionCounted(1))
    // This read says what the first one said, and is logged because it counted a line.
    vi.advanceTimersByTime(1)
    expect(counted()).toEqual(onePositionCounted(2))
    expect(lines).toEqual([claimed, countedOne, notADayFile, countedOne, notADayFile])
    // The next read counts nothing and says something new, so it is logged; the two after it say the same and are not.
    vi.advanceTimersByTime(every * 3)
    expect(lines).toEqual([claimed, countedOne, notADayFile, countedOne, notADayFile, notADayFile])
    expect(counted()).toEqual(onePositionCounted(2))
  } finally {
    clearInterval(canonical.watch!)
  }
})

/**
 * The arguments of every call of `name` in `source`, each as its text. A line that opens with a comment mark is not read,
 * and the declaration of `name` is not a call.
 */
function theArgumentsOfEachCall(source: string, name: string): string[][] {
  const calls: string[][] = []
  for (const found of source.matchAll(new RegExp(`\\b${name}\\(`, 'g'))) {
    const from = found.index ?? 0
    const before = source.slice(source.lastIndexOf('\n', from) + 1, from)
    if (/^\s*(\*|\/\/|\/\*)/.test(before) || /\bfunction\s+$/.test(before)) continue
    const args: string[] = []
    let depth = 0, quote = '', piece = ''
    for (let at = from + found[0].length; at < source.length; at++) {
      const c = source[at]!
      if (quote !== '') {
        piece += c
        if (c === '\\') piece += source[++at] ?? ''
        else if (c === quote) quote = ''
        continue
      }
      if (c === "'" || c === '"' || c === '`') quote = c
      else if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) { if (depth === 0) break; depth-- }
      else if (c === ',' && depth === 0) { args.push(piece.trim()); piece = ''; continue }
      piece += c
    }
    if (piece.trim() !== '') args.push(piece.trim())
    calls.push(args)
  }
  return calls
}

// THE SERVER HANDS THE READER THE STANDING OF ITS OWN WORLD. The server's start runs the ledger write after it listens,
// and the write starts the reader. The write can be given a standing, so that a test can run it at canonical standing,
// but the start gives it none. So the write is run as the start runs it, with no standing: first by the hook, right after
// the server listens, in this test's own world, which is scratch; then by the case, with the world this process is in
// made to say it is canonical. Each time, the reader must be handed that world's standing. Only the world's answer is
// changed. The reader is the real one, wrapped so the test sees what it was handed, and given this test's made-up spool,
// so nothing reads the machine's spool. The hook runs the first write because that one imports what the write starts.
// WHY THE LAST PART READS THE SOURCE. The start itself runs only when the server's file is the program, and it takes the
// configured port, so no test runs it. So the source is read for one thing: the server comes first in every call of the
// write, and the standing is left out or written as `undefined`, so no call gives the write a standing of its own. A
// third argument is allowed, because the start also passes the sleep clock's interval.
// Mutation: take the start out of the write, hand it a fixed 'canonical' or a fixed 'scratch', or have the server's
// start give the write a standing.
describe('with a server listening', () => {
  const worldPath = '../src/server/lib/world.ts', visitsPath = '../src/server/lib/visits.ts'
  let app: FastifyInstance | undefined, saysCanonical = false
  const handed: string[] = [], watches: NodeJS.Timeout[] = [], retries: (() => void)[] = []
  const residentsPath = '../src/server/lib/residents.ts', origins: NodeJS.Timeout[] = []
  beforeEach(async () => {
    saysCanonical = false
    handed.length = 0
    watches.length = 0
    retries.length = 0
    origins.length = 0
    vi.doMock(worldPath, async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/server/lib/world.ts')>()
      return {
        ...real,
        theWorldThisProcessIsIn: () => {
          const world = real.theWorldThisProcessIsIn()
          return saysCanonical ? {...world, standing: {kind: 'canonical', because: []}} : world
        },
      }
    })
    vi.doMock(readerPath, async (importOriginal) => {
      const real = await importOriginal<Reader>()
      return {
        ...real,
        startReadingTheGateCountSpool: (standing: 'canonical' | 'scratch', log: (line: string) => void) => {
          handed.push(standing)
          const started = real.startReadingTheGateCountSpool(standing, log, spool)
          if (started.watch !== null) watches.push(started.watch)
          return started
        },
      }
    })
    // Each write also starts the held-visit retry, which the server never stops, because it ends with its process. It
    // is the real one, wrapped so the case can stop it as the end of a process of its own would: in a process that
    // later files share, it would go on firing on this file's closed database, in a later file.
    vi.doMock(visitsPath, async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/server/lib/visits.ts')>()
      return {
        ...real,
        keepTryingHeldVisits: (...args: Parameters<typeof real.keepTryingHeldVisits>) => {
          const stop = real.keepTryingHeldVisits(...args)
          retries.push(stop)
          return stop
        },
      }
    })
    // The origin watcher it starts is kept and stopped for the same reason. Its minute tick throws on a closed
    // database, and in a later file the test process's own handler of that throw stops every server and removes every
    // test folder, the running case's among them; vitest does not report the throw.
    vi.doMock(residentsPath, async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/server/lib/residents.ts')>()
      return {
        ...real,
        startTheOriginWatcher: (...args: Parameters<typeof real.startTheOriginWatcher>) => {
          const watch = real.startTheOriginWatcher(...args)
          origins.push(watch)
          return watch
        },
      }
    })
    app = (await apiApp()).app
    await app.listen({port: 0, host: '127.0.0.1'})
    await (await import('../src/server/index.ts')).writeThisServerIntoTheLedger(app)
  })
  afterEach(async () => {
    for (const watch of watches) clearInterval(watch)
    for (const stop of retries) stop()
    for (const origin of origins) clearInterval(origin)
    vi.doUnmock(residentsPath)
    vi.doUnmock(visitsPath)
    vi.doUnmock(readerPath)
    vi.doUnmock(worldPath)
    await app?.close()
    app = undefined
  })

  it('starts the reader from the server with the standing of the world the server is in', async () => {
    const {writeThisServerIntoTheLedger} = await import('../src/server/index.ts')
    const {theWorldThisProcessIsIn} = await import('../src/server/lib/world.ts')
    const itsOwn = theWorldThisProcessIsIn().standing.kind
    expect(itsOwn).not.toBe('canonical')
    expect(handed).toEqual([itsOwn])
    saysCanonical = true
    expect(theWorldThisProcessIsIn().standing.kind).toBe('canonical')
    await writeThisServerIntoTheLedger(app!)
    expect(handed).toEqual([itsOwn, 'canonical'])
    const calls = theArgumentsOfEachCall(readFileSync(new URL('../src/server/index.ts', import.meta.url), 'utf8'), writeThisServerIntoTheLedger.name)
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.filter(args => args.length === 0 || (args[1] !== undefined && args[1] !== 'undefined'))).toEqual([])
  })
})
