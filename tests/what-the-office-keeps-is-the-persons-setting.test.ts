// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE OFFICE KEEPS IS THE PERSON'S OWN SETTING. Criterion U6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 * Three numbers on the installation singleton row: how many backups to keep, how many days an
 * untraced request row survives, and how many days a traced one does. The defaults
 * are three backups, seven days and 180 days.
 *
 *   1. NOBODY HAS CHOSEN BEFORE ANYBODY CHOOSES, and the reader is told that rather than handed the
 *      default as though it were the person's choice. `null` is a third answer.
 *   2. A NUMBER THE OWNER SETS IS WHAT THE PRUNE READS, proved by driving `pruneUsage` with a set value
 *      that differs from the default: a row between the two windows survives only if the setting is
 *      the one that was read.
 *   3. THE BACKUPS FOLDER IS READ AT THE MOMENT SOMEBODY ASKS, proved by reading it, adding a file,
 *      and reading it again through the door. Nothing is cached.
 *   4. A VALUE THAT IS PRESENT AND CANNOT BE READ IS A REFUSAL that names the setting, never a
 *      quiet default — at the door, and at the prune.
 *   5. ONLY THE PERSON MAY SET THEM. An agent is refused and nothing is written.
 *   6. A BACKUPS FOLDER THAT IS NOT THERE YET HOLDS NONE, because the first backup makes it. It is
 *      not a folder that could not be read.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH CASE GO RED
 * ---------------------------------------------------------------------------------------
 *
 *   answer the default as the person's choice for a NULL column   → case 1
 *   keep reading the constants when a value is set                → case 2
 *   cache the folder reading                                      → case 3
 *   count a left-out list as one of the backup's files            → case 3
 *   replace the refusal with the default                          → case 4
 *   let an agent through the write door                           → case 5
 *   read a folder that is not there yet as unreadable             → case 6
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { settings } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  WHAT_IS_KEPT_DEFAULTS,
  backupsFolderHolds,
  leftOutListOf,
  theBackupsFolderIsNotThereYet,
  type WhatTheOfficeKeeps,
} from '../src/shared/what-is-kept.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-what-is-kept',
}

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

/** The whole reading, through the door. */
async function theReading(headers = AS_THE_OWNER): Promise<WhatTheOfficeKeeps> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/what-is-kept', headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheOfficeKeeps
}

/** One write through the door. */
async function setTheNumbers(
  change: Record<string, number | null>,
  headers = AS_THE_OWNER,
): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/office/what-is-kept',
    headers,
    payload: change,
  })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The reading for one key, or a named failure rather than an undefined. */
function numberIn(said: WhatTheOfficeKeeps, key: string) {
  const found = said.numbers.find((one) => one.key === key)
  if (found === undefined) throw new Error(`the reading does not hold "${key}"`)
  return found
}

/** One call row, written straight into the table the prune reads. */
function writeCall(atMs: number, traceId: string | null): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, ' +
        'workspace_id, workspace_stated, actor_type, actor_id, session_id, identity_source, trace_id, ' +
        'purpose, client_addr, client_origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      `c${String(atMs)}${traceId ?? 'x'}${String(Math.random()).slice(2, 8)}`,
      atMs,
      'record.read',
      'read',
      '/api/records/:id',
      'GET',
      0,
      200,
      4,
      'default',
      1,
      'agent',
      'claude-code',
      'sess-1',
      'header',
      traceId,
      null,
      '127.0.0.1',
      'local',
    )
}

const prune = async () => (await import('../src/server/lib/usage-reads.ts')).pruneUsage

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

/**
 * THE THREE NUMBERS AND THE BACKUPS FOLDER ARE THE OFFICE'S, WHICH EVERY CASE NOW SHARES. Each case
 * starts with nobody having chosen, and with no backup files, which is the state each of these cases
 * was written against.
 */
beforeEach(() => {
  t.client.sqlite
    .prepare(
      'UPDATE installation SET keep_backups = NULL, untraced_request_days = NULL, traced_request_days = NULL ' +
        'WHERE only_row = 1',
    )
    .run()
  rmSync(settings().backupsDirectory, { recursive: true, force: true })
})

afterEach(() => {
  rmSync(settings().backupsDirectory, { recursive: true, force: true })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('what the office keeps is the person’s own setting', () => {
  it('answers 3, 7 and 180 with nobody having chosen, and says so', async () => {
    // THE CONTROL: the row holds no choice, so a stored value cannot pass for free below.
    expect(WHAT_IS_KEPT_DEFAULTS).toEqual({ keepBackups: 3, untracedRequestDays: 7, tracedRequestDays: 180 })
    const said = await theReading()
    expect(said.numbers.map((one) => one.inForce)).toEqual([3, 7, 180])
    for (const one of said.numbers) {
      expect(one.nobodyChose, `${one.key} does not read as nobody having chosen`).toBe(true)
      expect(one.from, `${one.key} does not name the default`).toBe('the default')
      expect(one.says, `${one.key} does not tell the reader nobody chose`).toContain('Nobody has chosen')
    }
  })

  it('writes one number, reads it back, and leaves the other two alone', async () => {
    // THE CONTROL: none of the three is set before the write.
    expect((await theReading()).numbers.every((one) => one.from === 'the default')).toBe(true)
    const wrote = await setTheNumbers({ untracedRequestDays: 21 })
    expect(wrote.status, JSON.stringify(wrote.said)).toBe(200)
    const after = await theReading()
    expect(numberIn(after, 'untracedRequestDays').inForce).toBe(21)
    expect(numberIn(after, 'untracedRequestDays').from).toBe("the person's setting")
    expect(numberIn(after, 'keepBackups').from, 'a partial write rewrote another number').toBe('the default')
  })

  it('refuses a number the office cannot store, and writes nothing', async () => {
    // THE CONTROL: it is nobody-having-chosen, so a refusal that wrote anyway would show.
    expect((await theReading()).numbers.every((one) => one.from === 'the default')).toBe(true)
    const wrong = await setTheNumbers({ tracedRequestDays: 0 })
    expect(wrong.status, JSON.stringify(wrong.said)).toBe(400)
    expect(JSON.stringify(wrong.said)).toContain('tracedRequestDays')
    expect((await theReading()).numbers.every((one) => one.from === 'the default')).toBe(true)
  })

  it('refuses an agent, and writes nothing', async () => {
    const refused = await setTheNumbers({ keepBackups: 9 }, AS_AN_AGENT)
    expect(refused.status, JSON.stringify(refused.said)).toBe(403)
    expect(JSON.stringify(refused.said)).toContain('owner')
    expect(numberIn(await theReading(), 'keepBackups').from).toBe('the default')
  })
})

describe('the two windows come from the setting', () => {
  it('deletes a row between the default and the set window only when the default is in force', async () => {
    const pruneUsage = await prune()
    const { setWhatTheOfficeKeeps } = await import('../src/server/lib/what-is-kept.ts')
    // THE REQUESTS THIS TEST MAKES TO THE DOOR WRITE `api_calls` ROWS OF THEIR OWN, and `NOW` is
    // fixed so those rows would fall inside the window. Clear them so the arithmetic below counts
    // only the rows this case wrote.
    const clearCalls = (): void => {
      t.client.sqlite.prepare('DELETE FROM api_calls').run()
    }
    clearCalls()

    // THE CONTROL: with nobody having chosen, the default seven days deletes a row eight days old.
    writeCall(NOW - 8 * DAY, null)
    expect(pruneUsage(NOW).untracedDeleted, 'the seven-day default did not delete an eight-day row').toBe(1)

    // NOW THE OWNER CHOOSES THIRTY. The same age survives, which can only be because the setting was read:
    // the default would have deleted it.
    setWhatTheOfficeKeeps({ untracedRequestDays: 30 })
    writeCall(NOW - 8 * DAY, null)
    expect(pruneUsage(NOW).untracedDeleted, 'the prune still used the default').toBe(0)
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM api_calls').get()).toEqual({ n: 1 })

    // AND A ROW PAST THE SET WINDOW GOES, so the setting is a window and not a disable.
    writeCall(NOW - 31 * DAY, null)
    expect(pruneUsage(NOW).untracedDeleted).toBe(1)
  })

  it('reads the traced window from the setting too', async () => {
    const pruneUsage = await prune()
    const { setWhatTheOfficeKeeps } = await import('../src/server/lib/what-is-kept.ts')
    t.client.sqlite.prepare('DELETE FROM api_calls').run()
    setWhatTheOfficeKeeps({ tracedRequestDays: 30 })
    // A trace whose last row is sixty days old is inside the 180-day default and past the set 30.
    // The proof is that it is pruned: with the default it would have been kept.
    writeCall(NOW - 60 * DAY, 'long-finished')
    writeCall(NOW - 60 * DAY + 1000, 'long-finished')
    const result = pruneUsage(NOW)
    expect(result.tracesPruned, 'the prune used the 180-day default instead of the setting').toBe(1)
  })

  it('refuses to prune on a stored value it cannot read, naming the setting', async () => {
    t.client.sqlite.prepare('UPDATE installation SET untraced_request_days = -1 WHERE only_row = 1').run()
    t.client.sqlite.prepare('DELETE FROM api_calls').run()
    writeCall(NOW - 8 * DAY, null)
    const pruneUsage = await prune()
    expect(() => pruneUsage(NOW)).toThrow(/Days an untraced request is kept/)
    // AND NOTHING WAS DELETED.
    expect(t.client.sqlite.prepare('SELECT count(*) AS n FROM api_calls').get()).toEqual({ n: 1 })
  })
})

describe('the backups folder is read at request time', () => {
  it('reports the count, the total size and the newest moment, and again after a file is added', async () => {
    const directory = settings().backupsDirectory
    mkdirSync(directory, { recursive: true })
    // THE CONTROL: an empty folder that was really listed reads as none, not as an unreadable one.
    const empty = await theReading()
    expect(empty.backups.readable, empty.backups.says).toBe(true)
    expect(empty.backups.count).toBe(0)
    expect(empty.backups.newestAt).toBeNull()

    writeFileSync(join(directory, 'mole-office-test.db'), 'x'.repeat(1000))
    const one = await theReading()
    expect(one.backups.count, 'adding a file did not change the count').toBe(1)
    expect(one.backups.totalBytes).toBe(1000)
    expect(one.backups.newestAt, 'the newest moment is missing').not.toBeNull()

    writeFileSync(join(directory, 'mole-office-test-two.db'), 'y'.repeat(500))
    const two = await theReading()
    // THE SECOND READ, FROM THE SAME DOOR, saw the second file. A cached reading could not.
    expect(two.backups.count, 'the folder reading was cached').toBe(2)
    expect(two.backups.totalBytes).toBe(1500)
  })

  it('counts the bytes of a backup\'s files folder with its backup, and says there is a folder of copied files', async () => {
    const directory = settings().backupsDirectory
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'mole-office-20260925-010203.db'), 'x'.repeat(1000))
    // THE FOLDER scripts/backup.ts writes beside a copy, with a file two levels down, as it has.
    const files = join(directory, 'mole-office-20260925-010203.files')
    mkdirSync(join(files, 'report-files'), { recursive: true })
    mkdirSync(join(files, 'message-pictures'), { recursive: true })
    writeFileSync(join(files, 'report-files', 'a1.ts'), 'r'.repeat(300))
    writeFileSync(join(files, 'message-pictures', 'p1.png'), 'p'.repeat(200))
    // Any other folder is not a backup and is still left out.
    mkdirSync(join(directory, 'somebody-else'), { recursive: true })
    writeFileSync(join(directory, 'somebody-else', 'note.txt'), 'n'.repeat(4000))

    const said = await theReading()

    expect(said.backups.readable, said.backups.says).toBe(true)
    expect(said.backups.count, 'the files folder was counted as a file').toBe(1)
    expect(said.backups.filesFolders, 'the files folder was not counted').toBe(1)
    expect(said.backups.totalBytes, 'the files folder\'s bytes were left out of the total').toBe(1500)
    expect(said.backups.says).toContain('1 file and 1 folder of copied files')
  })

  it('counts a backup\'s list of what was left out as a list, not as one of the backup\'s files', async () => {
    const directory = settings().backupsDirectory
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'mole-office-20260925-010203.db'), 'x'.repeat(1000))
    mkdirSync(join(directory, 'mole-office-20260925-010203.files'), { recursive: true })
    writeFileSync(join(directory, 'mole-office-20260925-010203.files', 'a1.ts'), 'r'.repeat(300))
    // THE LIST scripts/backup.ts writes when the files are over the line, by the name it gives it.
    writeFileSync(join(directory, leftOutListOf('mole-office-20260925-010204.db')), 'l'.repeat(120))
    writeFileSync(join(directory, 'mole-office-20260925-010204.db'), 'y'.repeat(500))

    const said = await theReading()

    expect(said.backups.readable, said.backups.says).toBe(true)
    // THE CONTROL: the two copies are counted, so a count of 2 below is this read and not an empty one.
    expect(said.backups.count, 'the left-out list was counted as a backup file').toBe(2)
    expect(said.backups.leftOutLists, 'the left-out list was not counted as a list').toBe(1)
    expect(said.backups.filesFolders).toBe(1)
    // ITS BYTES ARE IN THE TOTAL, which is what the whole folder takes on disk.
    expect(said.backups.totalBytes).toBe(1000 + 300 + 120 + 500)
    expect(said.backups.says).toContain(
      '2 files, 1 folder of copied files and 1 list of what was left out in ',
    )
  })

  it('names a folder holding only a left-out list as what it holds, not as holding no backup', async () => {
    const directory = settings().backupsDirectory
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, leftOutListOf('mole-office-20260925-010203.db')), 'l'.repeat(120))
    const said = await theReading()
    expect(said.backups.count).toBe(0)
    expect(said.backups.leftOutLists).toBe(1)
    expect(said.backups.newestAt, 'a list is not a backup file, so it has no newest moment').toBeNull()
    expect(said.backups.says).toBe(`1 list of what was left out in ${directory}, 120 B in all.`)
  })

  it('says the folder could not be read rather than drawing an empty one', async () => {
    // A FILE WHERE THE FOLDER WOULD BE, so listing it fails rather than finding it empty. The two
    // are different answers and the section has to say which one it is.
    const directory = settings().backupsDirectory
    writeFileSync(directory, 'not a folder')
    const said = await theReading()
    expect(said.backups.readable, 'an unlistable folder was drawn as an empty one').toBe(false)
    expect(said.backups.whyUnreadable).not.toBeNull()
    expect(said.backups.says).toContain('could not be read')
  })

  it('reads a backups folder that no backup has made yet as holding none, as the backups door does', async () => {
    // NO FOLDER AT ALL, as on a new office before its first backup. The beforeEach removed it.
    const directory = settings().backupsDirectory
    // THE CONTROL: the folder is really not there, so the reading below is of a missing folder.
    expect(existsSync(directory), 'the backups folder was there before the reading').toBe(false)

    const said = await theReading()

    expect(said.backups.readable, 'a folder that is not there yet was read as one that could not be read').toBe(true)
    expect(said.backups.whyUnreadable, 'a folder that is not there yet was given a reason it could not be read').toBeNull()
    expect(said.backups.count, 'a folder that is not there yet was read as holding files').toBe(0)
    expect(said.backups.filesFolders, 'a folder that is not there yet was read as holding files folders').toBe(0)
    expect(said.backups.leftOutLists, 'a folder that is not there yet was read as holding left-out lists').toBe(0)
    expect(said.backups.totalBytes, 'a folder that is not there yet was read as taking bytes').toBe(0)
    expect(said.backups.newestAt, 'a folder that is not there yet was given a newest moment').toBeNull()
    expect(said.backups.says, 'the reading did not say the folder is not there yet').toBe(
      theBackupsFolderIsNotThereYet(directory),
    )

    // THE BACKUPS DOOR READS THE SAME FOLDER THE SAME WAY.
    const door = (await import('../src/server/lib/backup.ts')).theBackupsInTheFolder(directory)
    expect(door.folderExists, 'the backups door found a folder the reading did not').toBe(false)
    expect(door.backups, 'the backups door listed backups in a folder that is not there').toEqual([])

    // THE READING MADE NO FOLDER.
    expect(existsSync(directory), 'reading the backups folder made it').toBe(false)
  })

  it('is a refusal that names the setting when a stored number cannot be read', async () => {
    t.client.sqlite.prepare('UPDATE installation SET keep_backups = 0 WHERE only_row = 1').run()
    const said = await theReading()
    const backups = numberIn(said, 'keepBackups')
    expect(backups.from, 'an unreadable value was drawn as the default').toBe('unreadable')
    expect(backups.inForce).toBeNull()
    expect(backups.says).toContain('Backups to keep')
    expect(backups.says).toContain('cannot read')
    // AND THE OTHER TWO ARE STILL READABLE, so one bad value does not blank the section.
    expect(numberIn(said, 'untracedRequestDays').from).toBe('the default')
  })
})

describe('what the backups folder holds is said in one sentence that is true on every branch', () => {
  it('says each count that is there, and a file count when nothing else is', () => {
    // NO COPY YET: the file count is said, as zero, rather than an empty sentence.
    expect(backupsFolderHolds(0, 0, 0)).toBe('0 files')
    expect(backupsFolderHolds(1, 0, 0)).toBe('1 file')
    expect(backupsFolderHolds(3, 0, 0)).toBe('3 files')
    // ONLY FOLDERS, ONLY LISTS: no "0 files" in front of them.
    expect(backupsFolderHolds(0, 1, 0)).toBe('1 folder of copied files')
    expect(backupsFolderHolds(0, 2, 0)).toBe('2 folders of copied files')
    expect(backupsFolderHolds(0, 0, 1)).toBe('1 list of what was left out')
    expect(backupsFolderHolds(0, 0, 2)).toBe('2 lists of what was left out')
    // TWO KINDS ARE JOINED BY "and", THREE BY A COMMA AND "and".
    expect(backupsFolderHolds(1, 1, 0)).toBe('1 file and 1 folder of copied files')
    expect(backupsFolderHolds(1, 0, 1)).toBe('1 file and 1 list of what was left out')
    expect(backupsFolderHolds(0, 1, 1)).toBe('1 folder of copied files and 1 list of what was left out')
    expect(backupsFolderHolds(1, 1, 1)).toBe('1 file, 1 folder of copied files and 1 list of what was left out')
    expect(backupsFolderHolds(3, 2, 2)).toBe('3 files, 2 folders of copied files and 2 lists of what was left out')
  })
})
