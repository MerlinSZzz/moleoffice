// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVICE LOCK: ONE SERVER PER DATABASE, TOLD APART FROM A STALE LOCK BY ITS PROCESS'S START TIME.
 *
 * Criteria W1, W2(c) and W9 of design/window/ACCEPTANCE.md. src/config/the-service-lock.mjs takes the
 * lock a server holds while it serves a database. Each case below drives it with a process reading
 * the test made, so every answer the reading can give is tried: free, held by the same process, a
 * process that has ended, a number given to another process, a start time that cannot be read. The
 * last case starts real processes at once, to show that two starters cannot both take the lock.
 *
 * Every file is in a folder this test made and deletes.
 *
 * MUTATION: make `whoHoldsTheLock` answer `{ state: 'gone' }` whatever the reading says, so every lock
 * looks stale. The held and cannot-tell cases go red, and so does the race of real processes.
 *
 * ON WINDOWS (wave 13t, round W8, item 22) the process table names no group, so the server hands in the group the
 * system layer's starter put it in. A known group is the one the lock records. A group that cannot be told is refused
 * in words, before the process table is read, and no lock is written. Without one, the group read with the process is
 * recorded, as before. Mutations for these cases, in the commit message of round W8 that let a server take the lock
 * on Windows.
 *
 * A LOCK THAT IS NOT JSON IS SAID TO BE NOT JSON, AND NOTHING MORE (wave 13t, round W22). The parser's own message
 * quotes the start of the file, and a torn lock may start with its service token. An installed office's tools print
 * the why on stderr, so the why names only the kind of fault. MUTATION, run on 3 November 2026 after a control run
 * that passed, and restored: the why quotes the parser's message again: red, the case of a lock that is not JSON.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  readTheServiceLock,
  releaseTheServiceLock,
  takeTheServiceLock,
  type ProcessReading,
  type ServiceLock,
} from '../src/config/the-service-lock.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { TEST_DATABASE_PREFIX } from './helpers.ts'

const LOCK_MODULE = fileURLToPath(new URL('../src/config/the-service-lock.mjs', import.meta.url))

let dir: string
let database: string
let lockPath: string

beforeEach(() => {
  dir = mkdtempSync(`${TEST_DATABASE_PREFIX}service-lock-`)
  database = join(dir, 'office.db')
  lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: database })
})

afterEach(() => {
  // Only the folder this test made.
  rmSync(dir, { recursive: true, force: true })
})

/** A process table the test writes: each pid is there with a start time, or is not. */
function aTable(rows: Record<number, ProcessReading>): (pid: number) => ProcessReading {
  return (pid) => rows[pid] ?? { here: false }
}

const BEGAN = '2026-10-01T10:00:00.000Z'
const LATER = '2026-10-01T11:00:00.000Z'

function take(pid: number, readProcess: (pid: number) => ProcessReading | Promise<ProcessReading>, port = 4000) {
  return takeTheServiceLock({ lockPath, databasePath: database, port, checkout: '/a/checkout', pid, readProcess })
}

function theLockOnDisk(): ServiceLock {
  const read = readTheServiceLock(lockPath)
  if (read.state !== 'read') throw new Error(`the lock did not read: ${JSON.stringify(read)}`)
  return read.lock
}

describe('the service lock of a database', () => {
  it('is beside the database and named after it, so two databases in one folder have two locks', () => {
    expect(lockPath).toBe(join(dir, 'office.db.service.json'))
    expect(serviceLockPathFrom({ MOLE_OFFICE_DB: join(dir, 'other.db') })).toBe(join(dir, 'other.db.service.json'))
  })

  it('is taken when nobody holds it, and records who took it', async () => {
    const taken = await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))
    expect(taken.taken).toBe(true)
    if (!taken.taken) return
    expect(taken.tookOver).toBeNull()
    const lock = theLockOnDisk()
    expect(lock).toMatchObject({ pid: 100, pgid: 100, port: 4000, processStartedAt: BEGAN, database, checkout: '/a/checkout' })
    expect(lock.token).toBe(taken.lock.token)
    // The database does not exist yet, so its identity is unknown, with the reason.
    expect(lock.databaseIdentity.id).toBe('unknown')
    expect(Number.isNaN(Date.parse(lock.takenAt))).toBe(false)
    // Nothing half-written is left beside it.
    expect(readdirSync(dir)).toEqual(['office.db.service.json'])
  })

  it('refuses a second server while the process that took it is running, naming that process, its port and the file', async () => {
    const table = aTable({
      100: { here: true, startedAt: BEGAN, pgid: 100 },
      200: { here: true, startedAt: LATER, pgid: 200 },
    })
    expect((await take(100, table, 4000)).taken).toBe(true)
    const before = readFileSync(lockPath, 'utf8')
    const second = await take(200, table, 5000)
    expect(second.taken).toBe(false)
    if (second.taken) return
    expect(second.why).toBe('held')
    expect(second.said).toContain('process 100')
    expect(second.said).toContain('port 4000')
    expect(second.said).toContain(lockPath)
    expect(readFileSync(lockPath, 'utf8')).toBe(before)
    expect(readdirSync(dir)).toEqual(['office.db.service.json'])
  })

  it('takes over a lock whose process has ended, and says so', async () => {
    expect((await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    const after = await take(200, aTable({ 200: { here: true, startedAt: LATER, pgid: 200 } }))
    expect(after.taken).toBe(true)
    if (!after.taken) return
    expect(after.tookOver).toContain('process 100, which has ended, so the lock was stale')
    expect(theLockOnDisk().pid).toBe(200)
    expect(readdirSync(dir)).toEqual(['office.db.service.json'])
  })

  it('takes over a lock whose number now belongs to a process that began at another time', async () => {
    expect((await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    const after = await take(
      200,
      aTable({ 100: { here: true, startedAt: LATER, pgid: 100 }, 200: { here: true, startedAt: LATER, pgid: 200 } }),
    )
    expect(after.taken).toBe(true)
    if (!after.taken) return
    expect(after.tookOver).toContain('so it is a different process and the lock was stale')
    expect(theLockOnDisk().pid).toBe(200)
  })

  it('refuses, and says it could not tell, when the running process start time cannot be read', async () => {
    expect((await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    const second = await take(
      200,
      aTable({ 100: { here: true, startedAt: null, pgid: null }, 200: { here: true, startedAt: LATER, pgid: 200 } }),
    )
    expect(second.taken).toBe(false)
    if (second.taken) return
    expect(second.why).toBe('cannot-tell')
    expect(second.said).toContain('its start time could not be read')
    expect(theLockOnDisk().pid).toBe(100)
  })

  it('refuses a lock file it cannot read, rather than calling it no lock', async () => {
    writeFileSync(lockPath, 'not json')
    const taken = await take(200, aTable({ 200: { here: true, startedAt: LATER, pgid: 200 } }))
    expect(taken.taken).toBe(false)
    if (taken.taken) return
    expect(taken.why).toBe('unreadable')
    expect(readFileSync(lockPath, 'utf8')).toBe('not json')
  })

  it('says a lock that is not JSON is not JSON, and quotes none of it', () => {
    writeFileSync(lockPath, 'xx"SECRETabcdef0123456789')
    const read = readTheServiceLock(lockPath)
    expect(read.state).toBe('unreadable')
    if (read.state !== 'unreadable') return
    expect(read.why).not.toContain('SECRET')
    expect(read.why).toBe('it is not JSON')
  })

  it('refuses to take a lock when it cannot read its own start time', async () => {
    const taken = await take(200, aTable({ 200: { here: true, startedAt: null, pgid: 200 } }))
    expect(taken.taken).toBe(false)
    if (taken.taken) return
    expect(taken.why).toBe('self-unknown')
    expect(existsSync(lockPath)).toBe(false)
  })

  it('puts back a lock another server took while this one was taking over the stale one', async () => {
    expect((await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    let theOtherServersLock = ''
    // Reading pid 100 is the moment between judging the lock stale and moving it aside. Another
    // server, 300, takes the stale lock over in that moment.
    const table = async (pid: number): Promise<ProcessReading> => {
      if (pid === 100) {
        if (theOtherServersLock === '') {
          const other = await takeTheServiceLock({
            lockPath,
            databasePath: database,
            port: 6000,
            checkout: '/a/checkout',
            pid: 300,
            readProcess: aTable({ 300: { here: true, startedAt: BEGAN, pgid: 300 } }),
          })
          if (!other.taken) throw new Error(`the other server did not take the lock: ${other.said}`)
          theOtherServersLock = readFileSync(lockPath, 'utf8')
        }
        return { here: false }
      }
      if (pid === 300) return { here: true, startedAt: BEGAN, pgid: 300 }
      if (pid === 200) return { here: true, startedAt: LATER, pgid: 200 }
      return { here: false }
    }
    const mine = await take(200, table)
    expect(mine.taken).toBe(false)
    if (mine.taken) return
    expect(mine.why).toBe('held')
    expect(mine.said).toContain('process 300')
    expect(readFileSync(lockPath, 'utf8')).toBe(theOtherServersLock)
    expect(readdirSync(dir)).toEqual(['office.db.service.json'])
  })

  it('is let go only by the server whose token it carries', async () => {
    const first = await take(100, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))
    if (!first.taken) throw new Error(first.said)
    expect(releaseTheServiceLock(lockPath, 'somebody else').released).toBe(false)
    expect(existsSync(lockPath)).toBe(true)
    expect(releaseTheServiceLock(lockPath, first.lock.token).released).toBe(true)
    expect(existsSync(lockPath)).toBe(false)
    expect(releaseTheServiceLock(lockPath, first.lock.token)).toEqual({
      released: false,
      said: `The service lock ${lockPath} was already gone.`,
    })
  })
})

describe('a server on Windows, where the process table names no group', () => {
  const WINDOWS_READING = aTable({ 100: { here: true, startedAt: BEGAN, pgid: null } })
  const takeIn = (group: { group: number } | { unknown: string } | null, readProcess = WINDOWS_READING) =>
    takeTheServiceLock({ lockPath, databasePath: database, port: 4000, checkout: '/a/checkout', pid: 100, readProcess, group })

  it("records the group the starter put it in, which the process table cannot name", async () => {
    const taken = await takeIn({ group: 9000 })
    expect(taken.taken).toBe(true)
    expect(theLockOnDisk()).toMatchObject({ pid: 100, pgid: 9000, processStartedAt: BEGAN })
  })

  it('records that group, and not the one read with the process, when it is handed one', async () => {
    expect((await takeIn({ group: 9000 }, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    expect(theLockOnDisk().pgid).toBe(9000)
  })

  it('refuses in words when its group cannot be told, before it reads the process table, and writes no lock', async () => {
    let read = 0
    const taken = await takeIn({ unknown: 'The starter did not say.' }, (pid) => {
      read += 1
      return WINDOWS_READING(pid)
    })
    expect(taken).toEqual({
      taken: false,
      why: 'self-unknown',
      said:
        'This server did not start. It could not tell which group it was started in: The starter did not say. The ' +
        'service lock records that group, so that a stop asks only the group this server runs in.',
    })
    expect(read).toBe(0)
    expect(existsSync(lockPath)).toBe(false)
  })

  it('without a group handed in, refuses where the process table names none, as on Linux it records the one it names', async () => {
    const taken = await takeIn(null)
    expect(taken.taken).toBe(false)
    if (taken.taken) return
    expect(taken.why).toBe('self-unknown')
    expect(existsSync(lockPath)).toBe(false)
    expect((await takeIn(null, aTable({ 100: { here: true, startedAt: BEGAN, pgid: 100 } }))).taken).toBe(true)
    expect(theLockOnDisk().pgid).toBe(100)
  })
})

describe('two starters at the same moment', () => {
  it('lets exactly one of eight real processes take the lock, and refuses the other seven by name', async () => {
    // Each process takes the lock with the real process reading, holds it for five seconds so that every
    // other one meets a running holder, and prints what happened. They are released together.
    const script = `
      import { takeTheServiceLock, theProcessReading } from ${JSON.stringify(LOCK_MODULE)}
      const [lockPath, databasePath] = process.argv.slice(1)
      await new Promise((done) => setTimeout(done, 300))
      const r = await takeTheServiceLock({ lockPath, databasePath, port: 4000, checkout: '/a/checkout', pid: process.pid, readProcess: theProcessReading })
      console.log(JSON.stringify({ pid: process.pid, taken: r.taken, why: r.taken ? null : r.why, said: r.said }))
      await new Promise((done) => setTimeout(done, 5000))
    `
    const runs = Array.from({ length: 8 }, () => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script, lockPath, database], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (chunk) => (out += String(chunk)))
      child.stderr.on('data', (chunk) => (err += String(chunk)))
      return new Promise<{ pid: number; taken: boolean; why: string | null; said: string }>((done, fail) => {
        child.on('exit', (code) => {
          if (code !== 0) fail(new Error(`a starter exited ${String(code)}: ${err}`))
          else done(JSON.parse(out.trim()) as { pid: number; taken: boolean; why: string | null; said: string })
        })
      })
    })
    const said = await Promise.all(runs)
    const winners = said.filter((one) => one.taken)
    expect(winners).toHaveLength(1)
    const winner = winners[0]!
    for (const loser of said.filter((one) => !one.taken)) {
      expect(loser.why).toBe('held')
      expect(loser.said).toContain(`process ${String(winner.pid)}`)
    }
    expect(theLockOnDisk().pid).toBe(winner.pid)
    expect(readdirSync(dir)).toEqual(['office.db.service.json'])
  }, 30_000)
})
