#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS A STORE HAS ON RECORD, FOR THE RE-MINT'S WRITER REGISTER. Wave 13s round 164, item 30c part 3.
 *
 *   node tools/the-writers-on-record.mjs <absolute path of the database file>
 *
 * Before the window the re-mint needs a register of every writer to hold or stop, and the host's census fills it. This
 * prints the part of it the store records, as src/server/db/remint-writers.ts reads it: every run that has not ended,
 * with its agent and every row the process ledger still holds for it, then every row the ledger still holds for a run
 * that has ended or is not there. The file is opened read-only and immutable by tools/open-immutable.mjs, so nothing
 * beside it is created, locked or changed, and a file with a rollback journal beside it, or a write-ahead log with
 * anything in it, is not opened.
 *
 * It prints the census as JSON on standard output, and one line of counts on standard error. It exits 0 when it read
 * everything, 1 when the census it printed names something it could not read, so the census is incomplete, and 2 when
 * it printed no census.
 */

import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openImmutable } from './open-immutable.mjs'

const USAGE = 'node tools/the-writers-on-record.mjs <absolute path of the database file>'

const said = (error) => (error instanceof Error ? error.message : String(error))

function stop(why) {
  process.stderr.write(`the-writers-on-record: no census. ${why}\nUsage: ${USAGE}\n`)
  process.exit(2)
}

const asked = process.argv.slice(2)
if (asked.length !== 1) stop('It takes the path of the database file, and nothing else.')
const path = asked[0]
if (!isAbsolute(path) || resolve(path) !== path) stop(`The database file is named by an absolute path, and ${JSON.stringify(path)} is not one.`)

// THE CENSUS is TypeScript in this checkout, so it is loaded through tsx with its configuration. It opens nothing.
let census
try {
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) })
  census = await import('../src/server/db/remint-writers.ts')
} catch (error) { stop(`The census could not be loaded: ${said(error)}.`) }
const { default: Database } = await import('better-sqlite3')

const file = openImmutable(Database, 'database file', path)
if (file.why !== undefined) stop(`It was not read: ${file.why}.`)
let read
try {
  read = census.theWritersOnRecord(file.db)
} catch (error) {
  file.db.close()
  stop(`The store could not be read: ${said(error)}.`)
}
file.db.close()

const held = read.runs.reduce((sum, run) => sum + run.held.length, 0)
process.stdout.write(JSON.stringify({ database: path, notOnRecord: census.THE_WRITERS_NOT_ON_RECORD, ...read }, null, 2) + '\n')
process.stderr.write(
  `the-writers-on-record: ${read.runs.length} runs not ended, holding ${held} ledger rows; ` +
    `${read.apart.length} ledger rows held for a run that has ended or is not there; ${read.unread.length} rows not read` +
    `${read.unread.length ? ', so this census is incomplete' : ''}. ${census.THE_WRITERS_NOT_ON_RECORD}\n`,
)
process.exit(read.unread.length ? 1 : 0)
