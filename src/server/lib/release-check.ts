// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A candidate's diagnostic-only start, before the ordinary client, routes or startup writers load.
 * It never checkpoints or migrates, and every request but GET is refused.
 *
 * TWO MODES. `release-check` is the upgrade's own start on the closed, checkpointed real file: the
 * controller prepares DELETE journal mode while writers are stopped, because a readonly connection
 * to a WAL-mode file can still create WAL/SHM files, and checks a private copy first.
 *
 * `release-check-live` is the release tool's trial of a version that changes no migration: it reads
 * the live database in place while another version of the office serves it. It accepts WAL mode
 * with its -wal and -shm companion files and a file whose size and time change. It still refuses the
 * stable office's database, a missing or non-absolute path, a file inside a git worktree, a file
 * that is not SQLite, another inode at the path after validation, a changed checkout, pending
 * migrations and an incomplete schema. SQLite's read-only open refuses every write through this
 * connection, so a read is all this start can do in either mode.
 */
import Database from 'better-sqlite3'
import Fastify from 'fastify'
import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { is } from 'drizzle-orm'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import {
  apiAddressFrom,
  readSettingHere,
  settings,
  whyThisCheckoutMayNotOpenTheDatabase,
  THE_MIGRATIONS_FOLDER,
  theServingInstall,
} from '../../config/settings.mjs'
import {
  THE_MIGRATION_JOURNAL_TABLE,
  theMigrationsInTheFolder,
  theMigrationsNotYetApplied,
} from '../../config/migration-look.mjs'
import * as schema from '../db/schema.ts'
import { theWorktreeHolding } from './git-checkout.ts'
import { requireCheckpointed } from './checkpointed-database.ts'

const onlyDiagnostics = 'This server is in release-check mode. Only GET /api/health and GET /api/runtime are available; ordinary requests and writes are refused.'
const quote = (name: string): string => `"${name.replace(/"/g, '""')}"`

/**
 * THE LIVE MODE'S HEADER RULE: a whole SQLite file, in WAL or rollback-journal mode.
 * It replaces only the closed database's checkpoint rule. The file is still opened read-only below.
 */
function requireSqliteFile(file: string): void {
  const header = Buffer.alloc(100)
  const descriptor = openSync(file, 'r')
  let bytes: number
  try { bytes = readSync(descriptor, header, 0, header.length, 0) } finally { closeSync(descriptor) }
  const wal = header[18] === 2 && header[19] === 2
  const rollback = header[18] === 1 && header[19] === 1
  if (bytes !== 100 || header.subarray(0, 16).toString('binary') !== 'SQLite format 3\0' || (!wal && !rollback)) {
    throw new Error(`Release-check-live requires an SQLite database in WAL or rollback-journal mode: ${file}. SQLite was not opened and nothing was written.`)
  }
}

/** Read the existing journal and actual schema; do not import prepareToServe's writable client/data steps. */
function validate(sqlite: Database.Database): void {
  const check = sqlite.pragma('integrity_check') as { integrity_check: string }[]
  if (check.length !== 1 || check[0]?.integrity_check !== 'ok') {
    throw new Error('Release-check refused a database that failed the SQLite integrity check. Nothing was written.')
  }
  const rows = sqlite.prepare(`SELECT hash, created_at FROM ${quote(THE_MIGRATION_JOURNAL_TABLE)}`).all() as { hash: string; created_at: number }[]
  const pending = theMigrationsNotYetApplied(rows, theMigrationsInTheFolder(THE_MIGRATIONS_FOLDER))
  if (pending.length > 0) {
    throw new Error(`Release-check refused a database with pending schema migrations: ${pending.map(m => m.tag).join(', ')}. No migration ran.`)
  }
  for (const value of Object.values(schema)) {
    if (!is(value, SQLiteTable)) continue
    const table = getTableConfig(value)
    const columns = sqlite.prepare(`PRAGMA table_info(${quote(table.name)})`).all() as { name: string }[]
    const missing = table.columns.filter(column => !columns.some(found => found.name === column.name))
    if (columns.length === 0 || missing.length > 0) {
      throw new Error(`Release-check refused an incomplete schema: ${table.name}${missing.length > 0 ? ` lacks ${missing.map(c => c.name).join(', ')}` : ' is missing'}. Nothing was written.`)
    }
  }
}

/** Build the actual diagnostic app. It owns only its read-only connection and closes it with the app. */
export function buildReleaseCheckApp(database: string, mode: 'release-check' | 'release-check-live' = 'release-check') {
  const refusal = whyThisCheckoutMayNotOpenTheDatabase(database)
  if (refusal !== null) throw Object.assign(new Error(refusal), { code: 'STABLE_OFFICE_DATABASE' })
  if (!isAbsolute(database) || database === ':memory:') throw new Error('Release-check needs an explicit existing database file with an absolute path.')
  const file = realpathSync(database)
  if (!statSync(file).isFile() || theWorktreeHolding(file) !== null) {
    throw new Error('Release-check needs an existing database outside a git worktree. Nothing was written.')
  }
  if (mode === 'release-check-live') requireSqliteFile(file)
  else requireCheckpointed(file)
  const install = theServingInstall()
  const sqlite = new Database(file, { readonly: true, fileMustExist: true })
  const app = Fastify({ logger: false, exposeHeadRoutes: false })
  try {
    sqlite.transaction(() => validate(sqlite))()
  } catch (error) {
    sqlite.close()
    throw error
  }
  const before = statSync(file)
  app.addHook('onClose', async () => { sqlite.close() })
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET') {
      return reply.code(405).header('Allow', 'GET').send({ code: 'RELEASE_CHECK_ONLY', error: onlyDiagnostics })
    }
  })
  const reading = () => {
    if (mode === 'release-check') requireCheckpointed(file)
    const now = statSync(file)
    const current = theServingInstall()
    const sameFile = mode === 'release-check-live'
      ? now.ino === before.ino
      : now.ino === before.ino && now.size === before.size && now.mtimeMs === before.mtimeMs
    if (!sameFile || current.commit !== install.commit || current.repository !== install.repository) {
      throw new Error('The release-check database or serving checkout changed after validation. Stop this check and start it again.')
    }
    const bound = app.server.address()
    if (bound === null || typeof bound === 'string') throw new Error('Release-check has no verified listening port.')
    return { ok: true, identity: { ...install, database: file, port: bound.port, mode } }
  }
  const diagnostics = async (_request: unknown, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) => {
    try { return reading() } catch (error) {
      return reply.code(503).send({ ok: false, code: 'RELEASE_CHECK_CHANGED', error: error instanceof Error ? error.message : String(error) })
    }
  }
  app.get('/api/health', diagnostics)
  app.get('/api/runtime', diagnostics)
  app.setNotFoundHandler(async (_request, reply) => reply.code(503).send({ code: 'RELEASE_CHECK_ONLY', error: onlyDiagnostics }))
  return { app, sqlite }
}

/** Start without a service lock, an ordinary app, a worker, a watcher or any startup bookkeeping. */
export async function startReleaseCheck(): Promise<void> {
  if (readSettingHere('MOLE_OFFICE_DB').source === 'the built-in default') {
    throw new Error('Release-check requires MOLE_OFFICE_DB to name the existing database explicitly. Nothing was started.')
  }
  const declared = settings()
  const mode = declared.startMode === 'release-check-live' ? 'release-check-live' : 'release-check'
  const { app } = buildReleaseCheckApp(declared.databasePath, mode)
  try {
    await app.listen({ port: declared.apiPort, host: new URL(apiAddressFrom({ MOLE_OFFICE_PORT: String(declared.apiPort) })).hostname })
  } catch (error) {
    await app.close()
    throw error
  }
  console.log(`Release-check listening on ${app.listeningOrigin}; database ${resolve(declared.databasePath)}.`)
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => { void app.close().then(() => process.exit(0), error => { console.error(error); process.exit(1) }) })
  }
}
