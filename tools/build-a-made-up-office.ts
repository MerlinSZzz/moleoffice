// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MADE-UP OFFICE OF THE LIVE OFFICE'S SIZE AND SHAPE, BUILT INTO A NEW FILE, FOR MEASURING. No real record goes in.
 *
 *   node --import tsx tools/build-a-made-up-office.ts <a new database file outside this checkout>
 *   node --import tsx tools/build-a-made-up-office.ts --one-in 20 <a new database file outside this checkout>
 *   node --import tsx tools/build-a-made-up-office.ts --scale 22-october --one-in 20 <a new database file outside this checkout>
 *   node --import tsx tools/build-a-made-up-office.ts --scale 4-november <a new database file outside this checkout>
 *   node --import tsx tools/build-a-made-up-office.ts --scale 13-november <a new database file outside this checkout>
 *
 * The second builds every count divided by 20, which a test can do in seconds (tests/a-made-up-office-has-its-counts.test.ts).
 * Without --scale it still builds the copy of 5 October. --scale 22-october builds the counts and uneven shape
 * supplied for 22 October, with guesses named beside that scale. --scale 4-november builds the counts of 4 November,
 * with their retired agents, the agents each starter started, the first project's share, the change log and the links.
 * --scale 13-november builds the newest counted size, the 4 November office grown to 13 November's records and links.
 * --one-in works with any scale.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SCRIPT IS IN THE REPOSITORY
 * ---------------------------------------------------------------------------------------
 *
 * Round 40 of wave 13y. Until then a slow read was measured on a copy of the live office's database. The copies kept
 * machine and client addresses, which stay private, so they were moved out of the sandboxes, and no agent makes or asks
 * for another. A measurement now runs on a database this script builds. Anybody who wants to check a number measured on
 * it runs the same command and gets the same rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT BUILDS, AND WHERE EACH NUMBER COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 * The office of tests/the-office-at-the-live-scale.ts at `THE_COPY_OF_5_OCTOBER`: the rows per table of the copy round 39
 * measured the queue on, which round 39's notes kept with no content. Its records of each kind, call log, deliveries,
 * agents, groups, reads and runs are all made up, with names and handles such as `made-up-agent-12`, the owner `owner`,
 * and every client address loopback. That file says which numbers are the copy's counts and which are guessed from the
 * live office's counts of 9 October 2026, which were also sent with no content. No record of the live office is read.
 * A few of its agents hold the secretary card, as many as the live office's did on 20 October 2026; that file says
 * which agents and why, and this script prints how many the file holds.
 *
 * Two steps are this script's own:
 *
 *   1. THE RECORDS ARE PUT IN THE ORDER THEY WERE WRITTEN. The builders write one kind after another, so all the runs sit
 *      together, then all the messages. A live office writes them over weeks, a message between two runs, so a read of one
 *      kind touches pages that hold the others. A rowid is the order a row was written in, so each record's rowid is set
 *      to its place by `created_at`.
 *   2. THE FILE IS VACUUMED, so the tables' pages are laid out as a file that grew is after the step above.
 *
 * The 22 October scale also makes a small guessed sample of delete rows in `changes`. Not made: the rest of `changes`,
 * `revisions`, `file_observations` and `visitor_requests`, as the builder says. A measurement that
 * reads one of them is not measured at the live size on this file, and has to say so.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT REFUSES
 * ---------------------------------------------------------------------------------------
 *
 * A file that already exists, so it can never write into an office somebody uses, and a file inside this checkout, where
 * a database never goes. It names the new file itself, before the database module is loaded, so nothing a `.env` says
 * is opened. The owner is set to `owner` the same way, so the made-up office is nobody's.
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHECKOUT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const USAGE = 'node --import tsx tools/build-a-made-up-office.ts [--scale 22-october | --scale 4-november | --scale 13-november] [--one-in <a whole number>] <a new file outside this checkout>'
const asked = process.argv.slice(2)
let divisor = 1
let namedScale: '22-october' | '4-november' | '13-november' | undefined
while (asked[0] === '--one-in' || asked[0] === '--scale') {
  if (asked[0] === '--one-in') {
    divisor = Number(asked[1])
    if (!Number.isInteger(divisor) || divisor < 1) throw new Error(`--one-in takes a whole number of 1 or more, not ${String(asked[1])}. ${USAGE}`)
  } else {
    if (asked[1] !== '22-october' && asked[1] !== '4-november' && asked[1] !== '13-november') throw new Error(`--scale takes 22-october, 4-november or 13-november. ${USAGE}`)
    namedScale = asked[1]
  }
  asked.splice(0, 2)
}
if (asked.length !== 1 || asked[0]!.startsWith('-')) throw new Error(`Name one new database file. ${USAGE}`)
const file = resolve(asked[0]!)
const inside = relative(CHECKOUT, file)
// OUTSIDE MEANS `..` OR `..` AND A SEPARATOR, so a folder in the checkout named "..data" is still inside.
if (inside === '' || (inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside))) {
  throw new Error(`${file} is inside this checkout (${CHECKOUT}). A database never goes in a checkout; name a file in a temporary folder.`)
}
if (existsSync(file)) throw new Error(`${file} already exists. This script builds only into a new file, so it can never write into an office somebody uses.`)
if (!existsSync(dirname(file))) throw new Error(`The folder ${dirname(file)} does not exist. Make it first.`)

// Assignments, not reads: src/config/settings.mjs reads the environment first, so these beat whatever a `.env` says.
process.env.MOLE_OFFICE_DB = file
process.env.MOLE_OFFICE_OWNER_ID = 'owner'

const started = Date.now()
const { sqlite } = await import('../src/server/db/client.ts')
if (resolve(sqlite.name) !== file) throw new Error(`The database module opened ${sqlite.name}, not ${file}. Nothing was built.`)
const { migrateInPlace } = await import('../src/server/db/migrate.ts')
migrateInPlace(sqlite, join(CHECKOUT, 'drizzle'))
const { readTheOfficeOwner } = await import('../src/server/db/owner-setting.ts')
const owner = readTheOfficeOwner(sqlite)
if (owner?.id !== 'owner') throw new Error(`The made-up office's owner came out as ${String(owner?.id)}, not owner. Nothing was built.`)

const { buildTheOfficeAtAScale, oneIn, THE_COPY_OF_5_OCTOBER, THE_LIVE_OFFICE_ON_22_OCTOBER, THE_LIVE_OFFICE_ON_4_NOVEMBER, THE_LIVE_OFFICE_ON_13_NOVEMBER, theSecretaryCard } = await import('../tests/the-office-at-the-live-scale.ts')
const fullScale = namedScale === '22-october' ? THE_LIVE_OFFICE_ON_22_OCTOBER : namedScale === '4-november' ? THE_LIVE_OFFICE_ON_4_NOVEMBER : namedScale === '13-november' ? THE_LIVE_OFFICE_ON_13_NOVEMBER : THE_COPY_OF_5_OCTOBER
const scale = divisor === 1 ? fullScale : oneIn(fullScale, divisor)
const office = buildTheOfficeAtAScale(sqlite, owner.id, scale, new Date())

// STEP 1: each record's rowid becomes its place by `created_at`, the old rowid breaking a tie. The order is read into
// this process, not into a table: no table is made outside drizzle/ (tests/schema-inventory.test.ts). Negative first,
// so no new rowid meets an old one on the way. A sealed tip refuses any update, its rowid's too, so the trigger that
// refuses it is dropped for these updates and made again from its own stored text in the same transaction.
const theGuard = sqlite.prepare(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'sealed_tip_no_update'`).get() as { sql: string } | undefined
if (theGuard === undefined) throw new Error('The trigger sealed_tip_no_update is not in the migrated schema, and this step was written for it. Nothing was reordered.')
sqlite.transaction(() => {
  const theOrder = sqlite.prepare(`SELECT rowid AS old FROM records ORDER BY created_at, rowid`).all() as { old: number }[]
  sqlite.prepare(`DROP TRIGGER sealed_tip_no_update`).run()
  sqlite.prepare(`UPDATE records SET rowid = -rowid`).run()
  const move = sqlite.prepare(`UPDATE records SET rowid = ? WHERE rowid = ?`)
  theOrder.forEach((one, place) => move.run(place + 1, -one.old))
  sqlite.prepare(theGuard.sql).run()
})()

// STEP 2.
sqlite.pragma('wal_checkpoint(TRUNCATE)')
sqlite.prepare('VACUUM').run()

const count = (table: string): number => (sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n
const said = {
  file,
  ...(namedScale === undefined ? {} : { scale: namedScale }),
  oneIn: divisor,
  bytes: statSync(file).size,
  builtInSeconds: Math.round((Date.now() - started) / 1000),
  theMeasuredAgent: office.theAgent,
  records: Object.fromEntries((sqlite.prepare(`SELECT kind, count(*) AS n FROM records GROUP BY kind ORDER BY n DESC`).all() as { kind: string; n: number }[]).map((one) => [one.kind, one.n])),
  secretaries: (sqlite.prepare(`SELECT count(*) AS n FROM agents WHERE role = ? AND retired = 0`).get(theSecretaryCard()) as { n: number }).n,
  rows: Object.fromEntries(['agents', 'agent_records', 'message_delivery', 'api_calls', 'groups', 'group_members', 'conversation_reads', 'session_resources', 'links', 'hourly_calls', 'header_only_calls'].map((table) => [table, count(table)])),
  messageData: sqlite.prepare(`SELECT round(avg(length(data))) AS averageBytes, max(length(data)) AS largestBytes FROM records WHERE kind = 'message'`).get(),
  queuedToAgents: (sqlite.prepare(`SELECT count(*) AS n FROM message_delivery WHERE mark = 'queued' AND recipient_kind = 'agent'`).get() as { n: number }).n,
  ...(namedScale === undefined ? {} : {
    projects: count(`workspaces WHERE id <> 'message-centre'`),
    senders: count(`(SELECT DISTINCT json_extract(data, '$.sentBy.kind'), json_extract(data, '$.sentBy.id') FROM records WHERE kind = 'message')`),
    officeMessages: count(`records WHERE kind = 'message' AND json_extract(data, '$.sentBy.id') IN (SELECT id FROM agents WHERE handle = 'mole-office')`),
    secretaryDeliveries: count(`message_delivery WHERE recipient_kind = 'agent' AND recipient_id = (SELECT id FROM agents WHERE role = '${theSecretaryCard()}' ORDER BY id LIMIT 1)`),
    withdrawnMessages: count(`records WHERE kind = 'message' AND deleted_at IS NOT NULL`),
  }),
  ...(namedScale !== '4-november' && namedScale !== '13-november' ? {} : {
    retiredAgents: count(`agents WHERE retired = 1`),
    changes: count('changes'),
    startedByAnAgent: Object.fromEntries((sqlite.prepare(`SELECT started_by_id AS id, count(*) AS n FROM agents WHERE started_by_kind = 'agent' GROUP BY started_by_id ORDER BY n DESC LIMIT 3`).all() as { id: string; n: number }[]).map((one) => [one.id, one.n])),
    startersOfTeams: count(`(SELECT DISTINCT started_by_id FROM agents WHERE started_by_kind = 'agent')`),
    recordsOfTheFirstProject: Object.fromEntries((sqlite.prepare(`SELECT kind, count(*) AS n FROM records WHERE workspace_id = 'default' AND kind IN ('session', 'agent') GROUP BY kind`).all() as { kind: string; n: number }[]).map((one) => [one.kind, one.n])),
    otherRecordsOfTheFirstProject: count(`records WHERE workspace_id = 'default' AND kind NOT IN ('session', 'agent')`),
  }),
}
sqlite.close()
console.log(JSON.stringify(said, null, 2))
