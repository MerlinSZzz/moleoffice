#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WRITERS THE STORE RECORDS, MATCHED WITH THE PROCESSES THE HOST LISTS. Wave 13s round 166, item 30c part 3.
 *
 *   node tools/match-the-writers.mjs <absolute path of the database file> <absolute path of the host's census>
 *
 * The re-mint's writer register needs each process the host lists to be one the store records, or said not to be. This
 * reads the store as tools/the-writers-on-record.mjs reads it, from the file opened read-only and immutable by
 * tools/open-immutable.mjs, reads the host's census, and matches the two as src/server/db/remint-writers-matched.ts
 * says: a held process row by its pid and start, every other process by the run it names. Nothing is dropped: a
 * process, a run or a row matched to nothing is listed with why.
 *
 * It prints the match as JSON on standard output, and one line of counts on standard error. It exits 0 when both
 * censuses were read whole, 1 when the match it printed names something it could not read, so the match is incomplete,
 * and 2 when it printed no match.
 */

import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openImmutable } from './open-immutable.mjs'

const USAGE = 'node tools/match-the-writers.mjs <absolute path of the database file> <absolute path of the host\'s census>'
const THE_LONGEST_CENSUS = 16 * 1024 * 1024

const said = (error) => (error instanceof Error ? error.message : String(error))

function stop(why) {
  process.stderr.write(`match-the-writers: no match. ${why}\nUsage: ${USAGE}\n`)
  process.exit(2)
}

const asked = process.argv.slice(2)
if (asked.length !== 2) stop('It takes the path of the database file and the path of the host\'s census, and nothing else.')
const [path, censusPath] = asked
for (const one of asked) if (!isAbsolute(one) || resolve(one) !== one) stop(`Each file is named by an absolute path, and ${JSON.stringify(one)} is not one.`)

let hostCensus
try {
  const found = lstatSync(censusPath)
  if (!found.isFile()) stop('The host\'s census is not an ordinary file.')
  if (found.size > THE_LONGEST_CENSUS) stop(`The host's census is longer than ${THE_LONGEST_CENSUS} bytes.`)
  hostCensus = readFileSync(censusPath, 'utf8')
} catch (error) { stop(`The host's census could not be read: ${said(error)}.`) }

// THE CENSUS AND THE MATCH are TypeScript in this checkout, so they are loaded through tsx with its configuration.
let census, match
try {
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) })
  census = await import('../src/server/db/remint-writers.ts')
  match = await import('../src/server/db/remint-writers-matched.ts')
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

const matched = match.matchTheWriters(read, hostCensus)
const unmatched = matched.processes.filter((one) => one.run === null).length
process.stdout.write(JSON.stringify({ database: path, hostCensus: censusPath, ...matched }, null, 2) + '\n')
process.stderr.write(
  `match-the-writers: ${matched.processes.length} host processes, ${unmatched} of them matched to no run; ` +
    `${matched.runsWithNoProcess.length} runs not ended and ${matched.rowsWithNoProcess.length} process rows with no host process; ` +
    `${matched.unread.length} things not read${matched.complete ? '' : ', so this match is incomplete'}.\n`,
)
process.exit(matched.complete ? 0 : 1)
