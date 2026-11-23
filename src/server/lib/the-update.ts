// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INSTALLED OFFICE UPDATES ITS OWN DATABASE, ON ONE PRESS OF ITS OWNER (wave 13n, round 58).
 *
 * THE CASE. The start check (`prepareToServe` in src/server/db/migrate.ts) finds a database that holds work
 * and is not up to date, so bringing it up to date would write to it. A server start must never do that by
 * itself, so a checkout refuses to serve and names the command to run, and keeps doing so word for word. An
 * installed office has no command to hand anybody: on 10 October 2026 that refusal stopped the owner's Mac
 * (reports I2OiCzuQJlBQ and 77P1X9sBOagQ). So an installed office does not stop. Its service waits here, in a
 * reduced mode, and its page says what the check found and offers the owner one press: "Back up and update".
 *
 * WHAT THE REDUCED MODE SERVES, on the office's own port, and nothing else:
 *   - the world header on every reply, so the window's self-check knows which office answers;
 *   - GET /api/health: not ok, with `updateWaiting` (THE_UPDATE_WAITS), so the window opens this page;
 *   - GET /api/office/the-update: what the check found, where the press is, and whether this caller may press;
 *   - POST /api/office/the-update: the press, the owner's only;
 *   - 503 in words for every other /api path, and the offer's page at every other path.
 * No worker runs, and no route of the office is built, so nothing writes to the database meanwhile.
 *
 * THE PRESS, in order. Each step runs only when the one before it succeeded:
 *   1. a verified backup, by `takeTheBackup` in src/server/lib/backup.ts: the code of `npm run db:backup`;
 *   2. a whole copy of the file beside it, keys and all, for a restore: restoring from the backup would take
 *      the keys away, since it holds no key;
 *   3. the migrations, by `migrateInPlace`, in one transaction: a refusal or a fault rolls back, and the file
 *      is left as it was;
 *   4. the re-mint (wave 13s, round 257), only when the file holds an agent whose id is still a handle and has
 *      filed no re-mint generation. Every office installed before 12 November 2026 holds one: its own row. The
 *      map is staged by `stageTheRemint` and applied by `migrateInPlace` given that map, so every check of the
 *      re-mint runs as `npm run db:migrate -- --remint` runs it. The map is kept in a folder beside the backup,
 *      named from the backup's own name, so no reader of the backups folder takes it for a backup. The folder is
 *      made by a mkdir that is not recursive: a name already taken is a failure, and the copy is put back;
 *   5. the checks: SQLite's integrity check, and the counts in a chain with nothing skipped: what the migrations
 *      read before they wrote must be what the backup holds, what the re-mint read before it wrote must be what
 *      the migrations counted when they finished, and what the last of them counted must be what the file holds;
 *   6. the start check again, which must find nothing left to do.
 * Then the reduced listener closes and the start goes on to serve as usual. A failure after step 3 restores
 * the copy from step 2. The backup is never removed, and the page says where it is.
 *
 * A REFUSAL OF THE RE-MINT IS NOT A FAILURE OF THE UPDATE. Any refusal of the stage, or
 * of the run given the map, rolls the re-mint's own transaction back, whatever it says. The checks then run on
 * the file the migrations left, the office opens, and the page says that every agent kept its id, and the
 * re-mint's own sentence. No generation is filed, so the next update tries the re-mint again. The map the run
 * refused is kept; a stage that refused wrote none, and its empty folder is removed.
 *
 * WHY HERE, IN THE SERVICE, AND NOT IN THE WINDOW'S OWN PROCESS:
 *   - the backup and the migrations are the server's code, and this runs exactly that code;
 *   - the window is a client of the service and never its parent (criterion W8);
 *   - an office run headless (W2a) has no window, and its owner opens the same page in a browser.
 *
 * IT RUNS ON THE SERVICE'S OWN NODE (`theInstallsNode` in src/config/settings.mjs): on Linux the app's own program,
 * told to run as Node, and on Windows and the Mac the Node the installation carries.
 *
 * WHO MAY PRESS. A request carrying the owner's key, in the header or as the two halves a paired browser holds
 * (`howThisRequestProvedItself` in lib/keys.ts), or a keyless one from this computer's own program, which is
 * how the installed window asks (`mayPressTheUpdate` below). Anybody else reads the offer and is refused the
 * press in words. Nothing is ever updated without the press.
 *
 * WHAT IS REFUSED BEFORE THAT. The app's first two request hooks are the server's own first two: a request whose
 * Host this office does not answer to is refused 421, and then a request that changes something without the office's
 * mark, a header of its own or a JSON body, is refused 403. A website can make a browser send a keyless press, but not
 * one with the mark, so the press is never read for such a request. Each refusal is answered as this app's own
 * refusals are: its status, and its English sentence with its code.
 */
import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { backupNameFor } from './complete-backups.ts'
import { takeTheBackup, tableCounts } from './backup.ts'
import { whereEachAgentsIdCameFrom } from './registry-aliases/remint-map.ts'
import { THE_UPDATE_WAITS } from '../../config/world-address.mjs'
import { DEVICE_HALF_HEADER, DEVICE_HALF_KEY } from '../../config/key-header.mjs'
import { THE_MIGRATION_JOURNAL_TABLE, theMigrationsInTheFolder, theMigrationsNotYetApplied } from '../../config/migration-look.mjs'
import { theSystemFor, thisSystem } from '../../config/systems/the-system.mjs'
import { COUNTED_TABLES, describeHoldings, migrateInPlace, prepareToServe, type ServeDecision } from '../db/migrate.ts'
import { THE_GENERATIONS, stageTheRemint } from '../db/remint-migration.ts'
import { THEIR_OWN_PROGRAM, readWhoSentItFromThisComputer } from './from-a-sandbox.ts'
import { howThisRequestProvedItself } from './keys.ts'
import { refuseAHostThatIsNotThisOffice } from './a-host-that-is-not-this-office.ts'
import { refuseAWriteWithoutTheOfficesMark } from './a-write-a-website-could-send.ts'
import { stampArrival } from './http.ts'
import { PanelError } from './panel-error.ts'
import { ACTOR_HEADERS } from '@shared/request-headers.ts'
import { enWave13n } from '@shared/words/en-wave-13n.ts'
import type { TheUpdateOffer, TheUpdateReading, TheUpdateState } from '@shared/the-update.ts'
import type { AHolderStarted } from './the-holders-restart.ts'

type Words = typeof enWave13n
type WordKey = keyof Words & `theUpdate.${string}`

/** One of this feature's sentences, with its {values} filled in. */
export function say(key: WordKey, values: Record<string, string | number> = {}): string {
  const text = String(enWave13n[key])
  return text.replace(/\{(\w+)\}/gu, (whole, name: string) => (name in values ? String(values[name]) : whole))
}

/** What the press did. */
export type ThePressEnded = Extract<TheUpdateState, { state: 'done' } | { state: 'failed' }>

/**
 * THE SEAM FOR TESTS, and production never changes it: a test puts a migration of its own in place of
 * `migrateInPlace` to make one fail, or a check after it fail, and puts the original back afterwards.
 */
export const THE_UPDATE_SEAM: { migrate: typeof migrateInPlace; afterTheMigrations: (sqlite: Database.Database) => void } = {
  migrate: migrateInPlace,
  afterTheMigrations: () => {},
}

/** Whether a start may offer the update rather than refuse: an installed office, and the "would write" refusal. */
export function theUpdateIsOffered(decision: ServeDecision, from: 'bundle' | 'checkout'): decision is Extract<ServeDecision, { serve: false }> & { update: { holds: string; wouldWrite: string[] } } {
  return from === 'bundle' && !decision.serve && decision.update !== undefined
}

/** The name of the re-mint's map in its folder. */
export const THE_MAPS_FILE = 'the-remint-map.json'

/** The folder the press keeps its re-mint map in: beside its backup, named from the backup's own name. */
export function theMapsFolderFor(backup: string): string {
  return join(dirname(backup), `${basename(backup, '.db')}.remint`)
}

/** Whether the re-mint is due: the file has filed no re-mint generation, and holds an agent whose id is still a handle. */
function theRemintIsDue(sqlite: Database.Database): boolean {
  const filed = (sqlite.prepare(`SELECT count(*) AS n FROM ${THE_GENERATIONS}`).get() as { n: number }).n
  return filed === 0 && whereEachAgentsIdCameFrom(sqlite).some((agent) => agent.from === 'legacy')
}

/** The tags of the migrations the file has not taken, read from its journal by the migrator's own rule. */
function theMigrationsNotTaken(sqlite: Database.Database, migrationsFolder: string): string[] {
  const rows = sqlite.prepare(`SELECT hash, created_at FROM "${THE_MIGRATION_JOURNAL_TABLE}"`).all() as { hash: string; created_at: number }[]
  return theMigrationsNotYetApplied(rows, theMigrationsInTheFolder(migrationsFolder)).map((migration) => migration.tag)
}

/**
 * BACK UP, UPDATE, CHECK. The press itself, run on the connection the start opened. It never throws for an
 * ordinary failure: it says what happened, where the backup is, and what the file holds.
 */
export async function backUpAndUpdate(sqlite: Database.Database, offer: TheUpdateOffer, migrationsFolder: string): Promise<ThePressEnded> {
  const file = sqlite.name
  // 1. THE BACKUP, with the code of `npm run db:backup`, verified as it verifies it.
  const target = join(offer.backups, backupNameFor('the-update'))
  // A FAULT IN THE BACKUP IS A BACKUP NOT MADE, said as one: a throw from here would leave the press "updating" for good.
  let took: Awaited<ReturnType<typeof takeTheBackup>>
  try {
    took = await takeTheBackup(file, target, false)
  } catch (err) {
    took = { taken: false, said: err instanceof Error ? err.message : String(err) }
  }
  if (!took.taken) {
    console.error(`The update did not start, because its backup was not made:\n${took.said}`)
    return { state: 'failed', said: [say('theUpdate.failed.noBackup'), took.said.replace(/^backup: /u, '')], backup: null, file: 'unchanged' }
  }
  const backup = took.found.file
  console.log(`The update's backup is ${backup}.`)

  // 2. A WHOLE COPY FOR A RESTORE, beside the database, removed once the update is checked.
  let safety: string
  const safetyFolder = mkdtempSync(join(dirname(file), `.${basename(file)}.before-the-update-`))
  try {
    safety = join(safetyFolder, basename(file))
    await sqlite.backup(safety)
  } catch (err) {
    rmSync(safetyFolder, { recursive: true, force: true })
    const why = err instanceof Error ? err.message : String(err)
    console.error(`The update did not start, because the copy kept for a restore could not be made: ${why}`)
    return { state: 'failed', said: [say('theUpdate.failed.noSafetyCopy', { why })], backup, file: 'unchanged' }
  }

  // 3. THE MIGRATIONS, in one transaction. A refusal or a fault rolls back, and the file is as it was.
  let outcome: ReturnType<typeof migrateInPlace>
  try {
    outcome = THE_UPDATE_SEAM.migrate(sqlite, migrationsFolder)
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    console.error(`The update's migrations stopped, and wrote nothing:\n${why}`)
    // THE ROLLBACK IS CHECKED, NOT TRUSTED: the file must hold what the backup holds.
    const differs = whatDiffersFrom(took.found.counts, tableCounts(sqlite))
    if (differs.length === 0 && integrityOf(sqlite) === null) {
      rmSync(safetyFolder, { recursive: true, force: true })
      return { state: 'failed', said: [say('theUpdate.failed.migrations'), why], backup, file: 'unchanged' }
    }
    return await restore(sqlite, safety, safetyFolder, backup, [say('theUpdate.failed.migrations'), why])
  }

  // 4. THE RE-MINT, when it is due. Its refusal keeps the migrations; any other failure here restores the copy.
  let remint: ReturnType<typeof migrateInPlace> | null = null
  let remintRefused: string | null = null
  try {
    if (theRemintIsDue(sqlite)) {
      const folder = theMapsFolderFor(backup)
      mkdirSync(folder)
      const map = join(folder, THE_MAPS_FILE)
      const pending = theMigrationsNotTaken(sqlite, migrationsFolder)
      try {
        remint = THE_UPDATE_SEAM.migrate(sqlite, migrationsFolder, stageTheRemint(sqlite, map, pending))
      } catch (err) {
        remintRefused = err instanceof Error ? err.message : String(err)
        console.error(`The re-mint refused, so every agent kept its id, and the update goes on:\n${remintRefused}`)
      }
      if (!existsSync(map)) rmdirSync(folder)
    }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    console.error(`The update stopped at its re-mint:\n${why}`)
    return await restore(sqlite, safety, safetyFolder, backup, [say('theUpdate.failed.remint'), why])
  }

  // 5 and 6. THE CHECKS, after the migrations committed. Any of them failing restores the copy.
  const wrong: string[] = []
  try {
    THE_UPDATE_SEAM.afterTheMigrations(sqlite)
    const damaged = integrityOf(sqlite)
    if (damaged !== null) wrong.push(say('theUpdate.check.integrity', { said: damaged }))
    const readBefore = whatDiffersFrom(took.found.counts, outcome.before)
    if (readBefore.length > 0) wrong.push(say('theUpdate.check.before', { tables: readBefore.join('; ') }))
    if (remint !== null) {
      const between = whatDiffersFrom(outcome.after, remint.before)
      if (between.length > 0) wrong.push(say('theUpdate.check.remint', { tables: between.join('; ') }))
    }
    const now = whatDiffersFrom((remint ?? outcome).after, tableCounts(sqlite))
    if (now.length > 0) wrong.push(say('theUpdate.check.after', { tables: now.join('; ') }))
    if (wrong.length === 0) {
      const again = prepareToServe(sqlite, migrationsFolder)
      if (!again.serve) wrong.push(say('theUpdate.check.again'))
    }
  } catch (err) {
    wrong.push(say('theUpdate.check.fault', { why: err instanceof Error ? err.message : String(err) }))
  }
  if (wrong.length > 0) {
    console.error(`The update's checks failed after its migrations:\n${wrong.join('\n')}`)
    return await restore(sqlite, safety, safetyFolder, backup, [say('theUpdate.failed.checks'), ...wrong])
  }
  rmSync(safetyFolder, { recursive: true, force: true })
  console.log(`The database ${file} was backed up to ${backup}, brought up to date and checked.`)
  return { state: 'done', backup, holdsNow: describeHoldings(sqlite), ...(remintRefused === null ? {} : { remintRefused }) }
}

/** Put the copy taken before the migrations back over the file, and say whether that worked. */
async function restore(sqlite: Database.Database, safety: string, safetyFolder: string, backup: string, said: string[]): Promise<ThePressEnded> {
  try {
    const copy = new (sqlite.constructor as typeof Database)(safety, { readonly: true, fileMustExist: true })
    let before: Map<string, number>
    try {
      before = tableCounts(copy)
      await copy.backup(sqlite.name)
    } finally {
      copy.close()
    }
    const differs = whatDiffersFrom(before, tableCounts(sqlite))
    const damaged = integrityOf(sqlite)
    if (differs.length > 0 || damaged !== null) throw new Error([...differs, ...(damaged === null ? [] : [damaged])].join('; '))
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    console.error(`The copy taken before the update could NOT be put back over ${sqlite.name}: ${why}. It is kept at ${safety}.`)
    return { state: 'failed', said: [...said, say('theUpdate.failed.notRestored', { why, safety })], backup, file: 'not-restored' }
  }
  rmSync(safetyFolder, { recursive: true, force: true })
  console.error(`The copy taken before the update was put back over ${sqlite.name}.`)
  return { state: 'failed', said, backup, file: 'restored' }
}

/** SQLite's integrity check, or null when it says ok. */
function integrityOf(sqlite: Database.Database): string | null {
  const rows = sqlite.pragma('integrity_check') as { integrity_check: string }[]
  const said = rows.map((row) => row.integrity_check)
  return said.length === 1 && said[0] === 'ok' ? null : said.slice(0, 5).join('; ')
}

/** The counted tables whose counts differ between two readings, in words. */
function whatDiffersFrom(was: ReadonlyMap<string, number> | Record<string, number | null>, is: ReadonlyMap<string, number> | Record<string, number | null>): string[] {
  const read = (from: typeof was, table: string): number | null =>
    from instanceof Map ? (from.get(table) ?? null) : ((from as Record<string, number | null>)[table] ?? null)
  const differs: string[] = []
  for (const table of COUNTED_TABLES) {
    const a = read(was, table)
    const b = read(is, table)
    if (a !== b) differs.push(`${table} ${a === null ? 'none' : String(a)} → ${b === null ? 'none' : String(b)}`)
  }
  return differs
}

/**
 * WHETHER THIS REQUEST MAY PRESS: it carries the owner's key, or it carries no key, names nobody, and came from one
 * of this computer's own programs. The second is the one request the pairing press (POST /api/office/pairing)
 * already hands the owner's key to, asked through the same `readWhoSentItFromThisComputer`, so taking it here gives no
 * program anything it could not have by pairing first. It is read by the way that waits, so inside the installed
 * Windows app the PowerShell it runs does not hold the server's thread. Without it a window that was never paired
 * would be shown an offer it cannot press, and the reduced mode serves no pairing door. A request from a sandbox, from
 * another user, from another machine or from a program Mole Office cannot find is not the owner's; nor is one that
 * names an agent or carries a key that proves anybody else.
 *
 * IT IS ASKED ONLY OF A PRESS THE TWO REQUEST HOOKS OF `theReducedMode` LET THROUGH: one that names this office's Host
 * and carries the office's mark. A keyless press with no mark, which a page on any website could make a browser send,
 * is refused 403 before this is read, so it never counts as this computer's own program.
 */
export async function mayPressTheUpdate(req: FastifyRequest): Promise<boolean> {
  const proof = howThisRequestProvedItself(req)
  if (proof !== undefined) return proof.how === 'the-person-key'
  const named = req.headers[ACTOR_HEADERS.type]
  if (named !== undefined && named !== 'human') return false
  return (await readWhoSentItFromThisComputer(req)) === THEIR_OWN_PROGRAM
}

/**
 * WAIT FOR THE PRESS: serve the reduced mode on the office's port until the update is done, and then close
 * it, so the start goes on and serves as usual on the same port. A stop asked for meanwhile (SIGTERM or
 * SIGINT, or, on Windows, a request on the group's stop pipe) ends the process without updating anything,
 * or after the press ends when the press is running.
 * After the press it starts the terminal holder, as a page's press starts one, and the server's start then records it.
 */
export async function waitForThePress(options: {
  sqlite: Database.Database
  offer: TheUpdateOffer
  migrationsFolder: string
  port: number
  host: string
  headers: () => Record<string, string>
  /** Told why a stop was asked, before the stop ends this process. The note beside the service lock says it. */
  whenAStopIsAsked: (why: string) => void
}): Promise<void> {
  const { app, done } = theReducedMode(options)
  await app.listen({ port: options.port, host: options.host })
  console.log(
    `Mole Office is waiting for its owner's press to back up and update ${options.offer.file}, on http://${options.host}:${String(options.port)}/. ` +
      'Nothing has been written to it.',
  )
  await done
  await app.close()
  // THE TERMINAL HOLDER STARTS AFTER THE PRESS. Nothing records a holder in the process ledger while this waits, so a
  // stop could not end one, and `mole-office start` ends the holder it started (src/config/the-service-command.mjs).
  // The server's start records the holder started here (recordTheHolderAtStart in lib/terminals.ts).
  const { startAHolderAsAPageDoes } = await import('./the-holders-restart.ts')
  console.log(theHolderAfterThePressInWords(await startAHolderAsAPageDoes()))
}

/** What starting the terminal holder after the press came to, in one line of the server's output. */
function theHolderAfterThePressInWords(started: AHolderStarted): string {
  switch (started.outcome) {
    case 'started':
      return `The terminal holder was started after the press: process ${String(started.pid)}.`
    case 'already':
      return `The terminal holder was already running after the press: process ${String(started.pid)}. It was left as it is.`
    case 'turned off':
      return 'No terminal holder was started after the press, because MOLE_OFFICE_TERMINAL_HOLDER is off.'
    case 'no way to start':
      return `No terminal holder was started after the press: ${started.why}`
    case 'could-not-spawn':
      return `The terminal holder could not be started after the press: ${started.why}.`
    case 'ended':
      return `The terminal holder did not start after the press: ${started.why}. Its log is ${started.logPath}.`
    case 'another':
      return "No terminal holder was started after the press: something answers on the terminal holder's socket, but not as the holder of this database."
    case 'another-copy':
      return `No terminal holder was started after the press. ${started.why} It was left running.`
    case 'silent':
      return `The terminal holder started after the press, process ${String(started.pid)}, did not answer in time. It was left running; its log is ${started.logPath}.`
    case 'unknown':
      return (
        `A terminal holder, process ${String(started.pid)}, answers after the press, and Windows could not say whether the Job Object of ` +
        `group ${String(started.group)}, which this start made, holds it: ${started.why} It was left running; its log is ${started.logPath}.`
      )
  }
}

/** The note a stop leaves: what was asked, and how far the update had gone. */
export function theStopsNote(why: string, state: TheUpdateState['state']): string {
  switch (state) {
    case 'offered':
      return `${why} while the update was offered`
    case 'updating':
      return `${why} while the update ran, so the office stops when the update has ended`
    case 'done':
      return `${why} after the update, before the office served`
    case 'failed':
      return `${why} after the update failed, before the office served`
  }
}

/** The reduced app, and a promise that settles when the update is done. Exported for the tests. */
export function theReducedMode(options: {
  sqlite: Database.Database
  offer: TheUpdateOffer
  migrationsFolder: string
  headers: () => Record<string, string>
  whenAStopIsAsked?: (why: string) => void
  groups?: ReturnType<typeof theSystemFor>['groups']
  signals?: NodeJS.EventEmitter
  exit?: (code: number) => void
  say?: (sentence: string) => void
}): { app: FastifyInstance; done: Promise<void> } {
  const groups = options.groups ?? thisSystem().groups
  const signals = options.signals ?? process
  const exit = options.exit ?? ((code: number) => process.exit(code))
  const sayIt = options.say ?? ((sentence: string) => console.log(sentence))
  const app = Fastify({ logger: false })
  // EACH REQUEST THIS APP'S LISTENER CARRIES IS STAMPED AS FROM THIS MACHINE, AND FROM THE CALLER ITSELF, as the server
  // stamps its loopback listener. That is true here because the app listens only on the host `start()` gives it, which
  // is 127.0.0.1 (src/server/index.ts), so the process at the other end of each socket is a program on this machine
  // and the one that made the request, not a proxy. The two request hooks below read the stamp; a request no listener
  // carried, as `inject()` makes one, has none and passes both.
  app.server.prependListener('request', (raw) => stampArrival(raw, 'this machine', 'the caller'))
  // THE SERVER'S OWN FIRST TWO REQUEST HOOKS, IN THE SAME ORDER: a Host this office does not answer to is refused 421,
  // and then a request that changes something without the office's mark is refused 403. They are root hooks, so they
  // run before every route, the `/api/*` catch-all and the page alike: a POST with no mark to any other path is
  // refused too, where it used to be answered with the page.
  refuseAHostThatIsNotThisOffice(app)
  refuseAWriteWithoutTheOfficesMark(app)
  // A REFUSAL IS ANSWERED IN THE SHAPE OF THIS APP'S OWN REFUSALS: its status, and { error, code }, where the error is
  // the English sentence the page shows. Without this Fastify would put the sentence in `message` and the status's
  // name in `error`. Any other error is thrown on, and Fastify answers it as before.
  app.setErrorHandler(async (err, _req, reply) => {
    if (!(err instanceof PanelError)) throw err
    void reply.code(err.status)
    return { error: err.message, code: err.code }
  })
  let update: TheUpdateState = { state: 'offered' }
  let finished: () => void = () => {}
  const done = new Promise<void>((resolve) => (finished = resolve))
  let stopAsked = false
  const stop = (why: string): void => {
    stopAsked = true
    options.whenAStopIsAsked?.(theStopsNote(why, update.state))
    if (update.state !== 'updating') exit(0)
  }
  const stopBecauseOf = (signal: NodeJS.Signals): void => stop(`${signal} received`)
  const onSigterm = (): void => stopBecauseOf('SIGTERM')
  const onSigint = (): void => stopBecauseOf('SIGINT')
  signals.once('SIGTERM', onSigterm)
  signals.once('SIGINT', onSigint)
  const letTheSignalsGo = (): void => {
    signals.off('SIGTERM', onSigterm)
    signals.off('SIGINT', onSigint)
  }
  // ON WINDOWS A STOP COMES ON THE GROUP'S PIPE, AND THE SERVER'S OWN LATER LISTEN TAKES IT OVER. ON LINUX AND THE MAC
  // THIS LISTENS FOR NOTHING, AND SIGTERM IS THE REQUEST.
  groups.listenForAStopRequest(() => stop('a stop request received'), sayIt)

  app.addHook('onSend', async (_req, reply) => {
    for (const [name, value] of Object.entries(options.headers())) reply.header(name, value)
  })
  // Who may press is read first, so the reading shows the update as it is after the wait.
  const reading = async (req: FastifyRequest): Promise<TheUpdateReading> => {
    const mayPress = await mayPressTheUpdate(req)
    return { offer: options.offer, update, mayPress }
  }

  app.get('/api/health', async (_req, reply) => {
    void reply.code(503)
    return { ok: false, wrong: [say('theUpdate.health', { file: options.offer.file })], [THE_UPDATE_WAITS]: true }
  })
  app.get('/api/office/the-update', async (req) => reading(req))
  app.post('/api/office/the-update', async (req, reply) => {
    if (!(await mayPressTheUpdate(req))) {
      void reply.code(403)
      return { error: say('theUpdate.onlyTheOwner'), code: 'updateOnlyTheOwner' }
    }
    // A FAILURE THAT COULD NOT PUT THE FILE BACK IS NOT PRESSED AGAIN: the page says to keep the backup and the copy.
    if (update.state === 'updating' || update.state === 'done' || (update.state === 'failed' && update.file === 'not-restored')) {
      void reply.code(409)
      return { error: say('theUpdate.alreadyPressed'), code: 'updateAlreadyPressed' }
    }
    update = { state: 'updating' }
    const ended = await backUpAndUpdate(options.sqlite, options.offer, options.migrationsFolder)
    update = ended
    if (stopAsked) exit(ended.state === 'done' ? 0 : 1)
    if (ended.state === 'done') {
      letTheSignalsGo()
      // The reply goes out first; the listener closes after it, and the start goes on.
      setTimeout(finished, 200)
    }
    return reading(req)
  })
  app.all('/api/*', async (_req, reply) => {
    void reply.code(503)
    return { error: say('theUpdate.notServing'), code: 'updateWaiting' }
  })
  app.setNotFoundHandler(async (_req, reply) => {
    void reply.type('text/html; charset=utf-8')
    return thePage()
  })
  return { app, done }
}

/** The words the page uses, sent with it, so the page holds no sentence of its own. */
function theWordsOfThePage(): Record<string, string> {
  return Object.fromEntries(Object.entries(enWave13n).filter(([key]) => key.startsWith('theUpdate.page.')).map(([key, value]) => [key, String(value)]))
}

/**
 * THE OFFER'S PAGE: one page, with no build step, because the office's own pages are not served in this
 * mode. It reads GET /api/office/the-update, says what it found, and presses POST /api/office/the-update.
 *
 * BOTH CARRY THE HEADER HALF of this browser's device key, when the page's storage keeps one, beside the
 * cookie half the browser sends by itself; with neither half the browser proves nothing. The header's
 * name and the storage key are sent with the page from src/config/key-header.mjs, so the page types
 * neither.
 *
 * THE PRESS ALWAYS CARRIES THE OFFICE'S MARK: Content-Type application/json, with the body {}. The
 * mark check of `theReducedMode` refuses a press without it, whether the browser has paired or not. The
 * read changes nothing, so it sends no mark.
 */
export function thePage(): string {
  const words = JSON.stringify(theWordsOfThePage()).replace(/</gu, '\\u003c')
  const half = JSON.stringify({ header: DEVICE_HALF_HEADER, key: DEVICE_HALF_KEY }).replace(/</gu, '\\u003c')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${enWave13n['theUpdate.page.title']}</title>
<style>
:root { color-scheme: light dark; --bg: #f7f7f5; --panel: #ffffff; --text: #1d1d1b; --text-2: #5c5c58; --line: #dcdcd6; --accent: #2f5fb3; --danger: #b3261e; --ok: #2e7d32; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --panel: #212120; --text: #ececea; --text-2: #a8a8a3; --line: #3a3a37; --accent: #8ab4f8; --danger: #f28b82; --ok: #81c995; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 32px 20px 48px; }
h1 { font-size: 22px; margin: 0 0 12px; }
h2 { font-size: 15px; margin: 20px 0 6px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 16px 18px; margin: 14px 0; }
.muted { color: var(--text-2); }
ul { margin: 6px 0 0; padding-left: 20px; }
li { margin: 4px 0; overflow-wrap: anywhere; }
code, .file { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; }
button { font: inherit; font-weight: 600; padding: 10px 18px; min-height: 44px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: var(--bg); cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.failed { border-color: var(--danger); }
.failed h2 { color: var(--danger); }
.done { border-color: var(--ok); }
</style>
</head>
<body>
<main id="the-update" aria-live="polite"><p class="muted" id="reading"></p></main>
<script>
const W = ${words};
const HALF = ${half};
// The header half, or no header when the storage keeps none or cannot be read: the office then reads a browser that proves nothing.
const withTheHalf = () => { let kept = null; try { kept = localStorage.getItem(HALF.key); } catch (err) { kept = null; } return kept ? { [HALF.header]: kept } : {}; };
const t = (key, values = {}) => W['theUpdate.page.' + key].replace(/\\{(\\w+)\\}/g, (all, name) => (name in values ? String(values[name]) : all));
const main = document.getElementById('the-update');
const el = (tag, attrs, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v); for (const kid of kids) n.append(kid); return n; };
const list = (lines) => el('ul', {}, ...lines.map((line) => el('li', {}, line)));
document.getElementById('reading').textContent = t('reading');
async function read() {
  try {
    const res = await fetch('/api/office/the-update', { credentials: 'same-origin', headers: withTheHalf() });
    if (!res.ok) throw new Error(String(res.status));
    draw(await res.json(), null);
  } catch (err) {
    // THE UPDATE IS DONE AND THE OFFICE IS STARTING: the office's own page answers soon.
    const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
    if (health && health.ok !== false) { location.reload(); return; }
    main.replaceChildren(el('h1', {}, t('title')), el('p', {}, t('couldNotRead')));
    setTimeout(read, 2000);
  }
}
async function press() {
  draw(last, null, true);
  let answer;
  try {
    // The office's mark, a JSON body, which a website cannot make a browser send without asking first: the press is refused without it.
    const res = await fetch('/api/office/the-update', { method: 'POST', credentials: 'same-origin', headers: { ...withTheHalf(), 'Content-Type': 'application/json' }, body: '{}' });
    answer = await res.json();
    if (!res.ok) { draw(last, answer.error || t('pressFailed')); return; }
  } catch (err) { draw(last, t('pressFailed')); return; }
  draw(answer, null);
  if (answer.update.state === 'done') setTimeout(waitForTheOffice, 1000);
}
async function waitForTheOffice() {
  const health = await fetch('/api/health').then((r) => r.json()).catch(() => null);
  if (health && health.ok !== false) { location.reload(); return; }
  setTimeout(waitForTheOffice, 1000);
}
// HOW THE START MEASURED, as the offer says it: on a copy, or on the database itself in a transaction it rolled back.
// A reading that says neither has no sentence here, so it is not drawn.
const MEASURED = { 'a copy': { found: 'found', nothing: 'nothingChanged' }, 'this file': { found: 'foundOnThisFile', nothing: 'nothingKept' } };
let last = null;
function draw(reading, refused, pressing = false) {
  last = reading;
  const { offer, update, mayPress } = reading;
  const measured = MEASURED[offer.measuredOn];
  if (measured === undefined) throw new Error('the reading does not say how the start measured');
  const kids = [el('h1', {}, t('title'))];
  // "Nothing has changed yet" is said only while the press is still to come; after a failure the file's own line says it.
  const before = update.state === 'offered' || update.state === 'updating' ? [el('h2', {}, t('nothingChangedHeading')), el('p', {}, t(measured.nothing))] : [];
  const found = el('div', { class: 'panel' },
    el('p', {}, t(measured.found)),
    el('h2', {}, t('holdsHeading')), el('p', {}, offer.holds),
    el('p', { class: 'file' }, offer.file),
    ...before,
    el('h2', {}, t('willDoHeading')), list(offer.wouldWrite));
  if (update.state === 'offered' || update.state === 'updating') {
    kids.push(found);
    const panel = el('div', { class: 'panel' }, el('p', {}, t('whatThePressDoes')), list([t('step1', { backups: offer.backups }), t('step2'), t('step3'), t('step4')]));
    if (mayPress) {
      const button = el('button', { type: 'button', id: 'back-up-and-update' }, pressing || update.state === 'updating' ? t('updating') : t('press'));
      if (pressing || update.state === 'updating') button.disabled = true;
      button.addEventListener('click', press);
      panel.append(el('p', {}, button));
    } else {
      panel.append(el('p', { class: 'muted' }, t('notTheOwner')), el('p', {}, t('whereToPress')));
    }
    if (refused) panel.append(el('p', { role: 'alert' }, refused));
    kids.push(panel);
  } else if (update.state === 'done') {
    // A refused re-mint is said in the done panel: every agent kept its id, and the re-mint's own sentence.
    const remint = update.remintRefused === undefined ? [] : [el('p', {}, t('remintRefused')), el('p', {}, update.remintRefused)];
    kids.push(el('div', { class: 'panel done' }, el('h2', {}, t('doneHeading')), el('p', {}, t('done')), ...remint, el('p', {}, t('holdsNow', { holds: update.holdsNow })), el('p', {}, t('backupAt')), el('p', { class: 'file' }, update.backup), el('p', { class: 'muted' }, t('opening'))));
  } else {
    const fileSaid = update.file === 'unchanged' ? t('fileUnchanged') : update.file === 'restored' ? t('fileRestored') : t('fileNotRestored');
    const panel = el('div', { class: 'panel failed' }, el('h2', {}, t('failedHeading')), ...update.said.map((line) => el('p', {}, line)), el('p', {}, fileSaid));
    panel.append(el('p', {}, update.backup === null ? t('noBackup') : t('backupKept')));
    if (update.backup !== null) panel.append(el('p', { class: 'file' }, update.backup));
    panel.append(el('p', { class: 'muted' }, t('afterAFailure')));
    kids.push(panel, found);
  }
  main.replaceChildren(...kids);
}
read();
</script>
</body>
</html>
`
}
