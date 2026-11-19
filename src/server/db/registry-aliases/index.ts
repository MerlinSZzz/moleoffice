// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Permanent registry identity history. This module opens no database. */
import type Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { THE_MIGRATIONS_FOLDER } from '../../../config/settings.mjs'

export const AGENT_REGISTRY_NAMESPACE = 'agent-registry' as const
export const REGISTRY_ALIAS_ARCHIVE_VERSION = 1
export const REGISTRY_ALIAS_MIGRATION_SLUG = 'registry_aliases_keep_their_identity'
export interface RegistryAlias {
  namespace: typeof AGENT_REGISTRY_NAMESPACE
  aliasId: string
  canonicalId: string
}
export interface RegistryIdentity { namespace: string; id: string }
export class RegistryAliasError extends Error {
  override readonly name = 'RegistryAliasError'
}
function refuse(reason: string): never { throw new RegistryAliasError(`Registry aliases are invalid: ${reason}.`) }
function identityNamespace(identity: RegistryIdentity): void {
  if (identity?.namespace !== AGENT_REGISTRY_NAMESPACE) refuse('an explicit agent-registry namespace is required')
  if (typeof identity.id !== 'string' || identity.id.length === 0) refuse('the registry identity is empty')
}
function aliasRow(value: unknown): RegistryAlias {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) refuse('an alias must be a typed row')
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join(',') !== 'aliasId,canonicalId,namespace') refuse('an alias has unknown or missing fields')
  if (row['namespace'] !== AGENT_REGISTRY_NAMESPACE) refuse('an alias has an unknown identity namespace')
  for (const name of ['aliasId', 'canonicalId']) {
    const id = row[name]
    if (typeof id !== 'string' || id === '' || id.trim() !== id || id.includes('\0')) refuse(`an alias has an unsupported ${name}`)
  }
  return row as unknown as RegistryAlias
}
/** Validate the complete resulting relation, including sources no longer present in any current record. */
export function validateRegistryAliasRows(values: readonly unknown[], registryIds: ReadonlySet<string>): RegistryAlias[] {
  const rows = values.map(aliasRow)
  const sources = new Set<string>()
  for (const row of rows) {
    if (sources.has(row.aliasId)) refuse(`duplicate source ${JSON.stringify(row.aliasId)}`)
    sources.add(row.aliasId)
  }
  for (const row of rows) {
    if (row.aliasId === row.canonicalId || sources.has(row.canonicalId)) refuse(`noncanonical target or alias chain at ${JSON.stringify(row.aliasId)}`)
    if (registryIds.has(row.aliasId)) refuse(`source ${JSON.stringify(row.aliasId)} is another registry id`)
    if (!registryIds.has(row.canonicalId)) refuse(`orphan target ${JSON.stringify(row.canonicalId)}`)
  }
  return rows
}
let aliasMigrationWhen: number | undefined
export function registryAliasMigrationWhen(): number {
  if (aliasMigrationWhen !== undefined) return aliasMigrationWhen
  const journal = JSON.parse(readFileSync(join(THE_MIGRATIONS_FOLDER, 'meta', '_journal.json'), 'utf8')) as { entries: { tag: string; when: number }[] }
  const entry = journal.entries.find(one => one.tag.endsWith('_'+REGISTRY_ALIAS_MIGRATION_SLUG))
  if (entry === undefined) refuse('the allocated schema migration is not declared')
  return (aliasMigrationWhen = entry.when)
}
/** The applied migration level, never table presence, decides whether missing metadata is a loss. */
export function registryAliasesAreRequired(db: Database.Database): boolean {
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='__drizzle_migrations'").get()) return false
  const row = db.prepare('SELECT max(created_at) AS at FROM __drizzle_migrations').get() as { at: number | null }
  return row.at !== null && row.at >= registryAliasMigrationWhen()
}
/**
 * THE HANDLES WHOSE ALIAS TABLE WAS FOUND, with its columns and keys, kept for the handle's life. Migration 0305 makes the
 * table before a database serves, so it is asked once. Asking the schema version on every call was one statement more
 * in every lookup. A table dropped after it was found makes every statement that names it fail with SQLite's own error.
 */
const ALIAS_TABLE_FOUND = new WeakSet<Database.Database>()
function hasAliasTable(db: Database.Database): boolean {
  if (ALIAS_TABLE_FOUND.has(db)) return true
  const present = Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='registry_aliases'").get())
  if (!present && registryAliasesAreRequired(db)) refuse('the applied alias migration requires the missing registry_aliases table')
  if(present) {
    const columns=db.pragma('table_info(registry_aliases)') as {name:string;type:string;notnull:number;pk:number}[]
    if(columns.map(row=>row.name).sort().join(',')!=='alias_id,canonical_id,namespace') refuse('registry_aliases has unknown or missing columns')
    if(columns.some(row=>row.type.toLowerCase()!=='text'||row.notnull!==1||row.pk!==({namespace:1,alias_id:2,canonical_id:0} as Record<string,number>)[row.name])) refuse('registry_aliases has an unsupported column or primary key shape')
    ALIAS_TABLE_FOUND.add(db)
  }
  return present
}
/** One statement: each row, and whether each of its two ids is a registry id, which is all the validation asks of the registry. */
export function readRegistryAliases(db: Database.Database): RegistryAlias[] {
  if (!hasAliasTable(db)) return []
  const rows = db.prepare(
    'SELECT a.namespace, a.alias_id AS aliasId, a.canonical_id AS canonicalId, ' +
      'EXISTS (SELECT 1 FROM agents WHERE agents.id = a.alias_id) AS aliasIsARegistryId, ' +
      'EXISTS (SELECT 1 FROM agents WHERE agents.id = a.canonical_id) AS canonicalIsARegistryId ' +
      'FROM registry_aliases a ORDER BY a.alias_id',
  ).all() as { namespace: unknown; aliasId: string; canonicalId: string; aliasIsARegistryId: number; canonicalIsARegistryId: number }[]
  if (rows.length === 0) return []
  const registryIds = new Set(rows.flatMap(row => [...(row.aliasIsARegistryId === 1 ? [row.aliasId] : []), ...(row.canonicalIsARegistryId === 1 ? [row.canonicalId] : [])]))
  return validateRegistryAliasRows(rows.map(({ namespace, aliasId, canonicalId }) => ({ namespace, aliasId, canonicalId })), registryIds)
}
/**
 * ONE STATEMENT FOR A STORED ID: how many typed aliases own it, what the lookup refuses, and the agents row it names, by
 * itself or through its alias. `columns` are the agents columns the caller reads.
 */
function theNamingStatement(columns: string): string {
  return (
    'SELECT o.owners AS aliasOwners, o.namespace AS aliasNamespace, o.canonicalId AS aliasTarget, ' +
    'CASE WHEN o.owners > 0 THEN EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id = o.canonicalId) END AS aliasTargetIsAnAlias, ' +
    'CASE WHEN o.owners > 0 THEN EXISTS (SELECT 1 FROM agents WHERE id = @id) END AS aliasSourceIsARegistryId, ' +
    `agents.id IS NOT NULL AS aliasFoundARow, ${columns} ` +
    'FROM (SELECT count(*) AS owners, min(namespace) AS namespace, min(canonical_id) AS canonicalId FROM registry_aliases WHERE alias_id = @id) AS o ' +
    'LEFT JOIN agents ON agents.id = coalesce(o.canonicalId, @id)'
  )
}
const NAMING_FIELDS = ['aliasOwners', 'aliasNamespace', 'aliasTarget', 'aliasTargetIsAnAlias', 'aliasSourceIsARegistryId', 'aliasFoundARow']
/** The naming statements, kept per handle and per column list: the identity readers ask one for each row of a list. */
const NAMING = new WeakMap<Database.Database, Map<string, Database.Statement>>()
/** The naming statement for `columns`, or null because this database is from before migration 0305. */
function theNamingStatementOf(db: Database.Database, columns: string): Database.Statement | null {
  const kept = NAMING.get(db)?.get(columns)
  if (kept !== undefined) return kept
  let made: Database.Statement
  try {
    made = db.prepare(theNamingStatement(columns))
  } catch (error) {
    // ONLY A MISSING ALIAS TABLE IS ANSWERED HERE, and as hasAliasTable answers it: refused when the migration says it
    // was made, and absent before that migration. Anything else is thrown as it came.
    if (!(error instanceof Error && /^no such table: (main\.)?registry_aliases$/.test(error.message)) || hasAliasTable(db)) throw error
    return null
  }
  NAMING.set(db, (NAMING.get(db) ?? new Map<string, Database.Statement>()).set(columns, made))
  return made
}
/** What one stored id names: the canonical id its alias names, or null for none, and the agents row, if there is one. */
function theStoredIdNamed(db: Database.Database, id: string, columns: string): { canonicalId: string | null; row: Record<string, unknown> | undefined } | null {
  const statement = theNamingStatementOf(db, columns)
  if (statement === null) return null
  const answer = statement.get({ id }) as Record<string, unknown>
  return theNamedAnswer(id, answer)
}
/** The same validation applies whether one requested name or a set of names was read. */
function theNamedAnswer(id: string, answer: Record<string, unknown>): { canonicalId: string | null; row: Record<string, unknown> | undefined } {
  let canonicalId: string | null = null
  if (answer['aliasOwners'] !== 0) {
    if (answer['aliasOwners'] !== 1) refuse('more than one typed alias owns this source')
    canonicalId = aliasRow({ namespace: answer['aliasNamespace'], aliasId: id, canonicalId: answer['aliasTarget'] }).canonicalId
    if (answer['aliasTargetIsAnAlias'] === 1) refuse('a target is an alias rather than a canonical id')
    if (answer['aliasSourceIsARegistryId'] === 1) refuse('an alias source is also a registry id')
    if (answer['aliasFoundARow'] !== 1) refuse('an alias target is orphaned')
  }
  if (answer['aliasFoundARow'] !== 1) return { canonicalId, row: undefined }
  const row = { ...answer }
  for (const field of NAMING_FIELDS) delete row[field]
  return { canonicalId, row }
}
/** Exact typed lookup. A handle is never asked here. Unknown canonical ids remain the caller's question. */
export function registryAliasTarget(db: Database.Database, identity: RegistryIdentity): string | null {
  identityNamespace(identity)
  return theStoredIdNamed(db, identity.id, 'agents.id AS registryId')?.canonicalId ?? null
}
/**
 * THE AGENTS ROW A STORED REGISTRY ID NAMES, by itself or through the permanent typed alias that owns it, read in one
 * statement, or undefined because it names none. `columns` are the agents columns the caller reads. It refuses what
 * `registryAliasTarget` refuses. A handle is never asked here.
 */
export function theRegistryRowNamedBy(db: Database.Database, id: string, columns: string): Record<string, unknown> | undefined {
  identityNamespace({ namespace: AGENT_REGISTRY_NAMESPACE, id })
  const named = theStoredIdNamed(db, id, columns)
  if (named !== null) return named.row
  return db.prepare(`SELECT ${columns} FROM agents WHERE id = ?`).get(id) as Record<string, unknown> | undefined
}
/** The same lookup for requested ids together; unrelated alias rows are not validated. */
export function theRegistryRowsNamedBy(db: Database.Database, ids: readonly string[], columns: string): Map<string, Record<string, unknown> | undefined> {
  const unique = [...new Set(ids)]
  const out = new Map<string, Record<string, unknown> | undefined>()
  if (unique.length === 0) return out
  for (const id of unique) identityNamespace({ namespace: AGENT_REGISTRY_NAMESPACE, id })
  const hasAliases = theNamingStatementOf(db, columns) !== null
  if (!hasAliases) {
    const answers = db.prepare(`SELECT asked.value AS requestedAliasId, agents.id IS NOT NULL AS aliasFoundARow, ${columns} FROM json_each(?) asked LEFT JOIN agents ON agents.id = asked.value ORDER BY asked.key`).all(JSON.stringify(unique)) as Record<string, unknown>[]
    for (const answer of answers) {
      const id = answer['requestedAliasId'] as string
      delete answer['requestedAliasId']
      const found = answer['aliasFoundARow'] === 1
      delete answer['aliasFoundARow']
      out.set(id, found ? answer : undefined)
    }
    return out
  }
  const answers = db.prepare(
    `WITH owners AS MATERIALIZED (SELECT asked.value AS requestedAliasId, asked.key AS position, ` +
    `count(a.alias_id) AS owners, min(a.namespace) AS namespace, min(a.canonical_id) AS canonicalId ` +
    `FROM json_each(?) asked LEFT JOIN registry_aliases a ON a.alias_id = asked.value GROUP BY asked.key) ` +
    `SELECT o.requestedAliasId, o.owners AS aliasOwners, o.namespace AS aliasNamespace, o.canonicalId AS aliasTarget, ` +
    `CASE WHEN o.owners > 0 THEN EXISTS (SELECT 1 FROM registry_aliases WHERE alias_id = o.canonicalId) END AS aliasTargetIsAnAlias, ` +
    `CASE WHEN o.owners > 0 THEN EXISTS (SELECT 1 FROM agents WHERE id = o.requestedAliasId) END AS aliasSourceIsARegistryId, ` +
    `agents.id IS NOT NULL AS aliasFoundARow, ${columns} FROM owners o LEFT JOIN agents ON agents.id = coalesce(o.canonicalId, o.requestedAliasId) ORDER BY o.position`,
  ).all(JSON.stringify(unique)) as Record<string, unknown>[]
  for (const answer of answers) {
    const id = answer['requestedAliasId'] as string
    delete answer['requestedAliasId']
    out.set(id, theNamedAnswer(id, answer).row)
  }
  return out
}
/** Idempotence accepts an already filed identical row; retargeting and duplicate batch sources refuse. */
export function fileRegistryAliases(db: Database.Database, values: readonly unknown[]): void {
  db.transaction(() => {
    if (!Array.isArray(values)) refuse('aliases must be a list')
    const incoming = values.map(aliasRow)
    if (new Set(incoming.map(row => row.aliasId)).size !== incoming.length) refuse('duplicate sources in the filing')
    const held = readRegistryAliases(db)
    const combined = new Map(held.map(row => [row.aliasId, row]))
    for (const row of incoming) {
      const before = combined.get(row.aliasId)
      if (before !== undefined && before.canonicalId !== row.canonicalId) refuse('a filed alias is immutable')
      combined.set(row.aliasId, row)
    }
    validateRegistryAliasRows([...combined.values()], new Set((db.prepare('SELECT id FROM agents').all() as {id:string}[]).map(row => row.id)))
    const insert = db.prepare('INSERT INTO registry_aliases (namespace,alias_id,canonical_id) VALUES (?,?,?)')
    const existing = new Set(held.map(row => row.aliasId))
    for (const row of incoming) if (!existing.has(row.aliasId)) insert.run(row.namespace,row.aliasId,row.canonicalId)
  })()
}
export function equivalentRegistryIds(db: Database.Database, identity: RegistryIdentity): string[] {
  identityNamespace(identity)
  const canonical = registryAliasTarget(db, identity) ?? identity.id
  if (!db.prepare('SELECT 1 FROM agents WHERE id=?').get(canonical)) refuse(`unknown registry identity ${JSON.stringify(identity.id)}`)
  const aliases = hasAliasTable(db) ? db.prepare('SELECT alias_id AS id FROM registry_aliases WHERE namespace=? AND canonical_id=? ORDER BY alias_id').all(AGENT_REGISTRY_NAMESPACE,canonical) as {id:string}[] : []
  return [canonical, ...aliases.map(row => row.id)]
}
/** The alias spellings filed for one canonical id, without asking whether the id is in the registry. */
export function registryAliasesOf(db: Database.Database, canonicalId: string): string[] {
  if (!hasAliasTable(db)) return []
  return (db.prepare('SELECT alias_id AS id FROM registry_aliases WHERE namespace=? AND canonical_id=? ORDER BY alias_id').all(AGENT_REGISTRY_NAMESPACE, canonicalId) as {id:string}[]).map(row => row.id)
}
function identifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) refuse('an equality query has an unsupported SQL identifier')
  return '"' + value + '"'
}
/** One SELECT over finite exact spellings. OR matches cannot multiply a physical primary-key row. */
export function rowsForRegistryIdentity(db: Database.Database, query: {
  table: string; references: readonly {kindColumn:string; idColumn:string}[]; identity: RegistryIdentity
}): Record<string, unknown>[] {
  const ids = equivalentRegistryIds(db, query.identity)
  const table = identifier(query.table)
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as {name:string; pk:number}[]
  const primary = columns.filter(column => column.pk > 0).sort((a,b)=>a.pk-b.pk)
  if (primary.length === 0 || query.references.length === 0) refuse('an equality query needs a real primary key and typed reference columns')
  const known = new Set(columns.map(column => column.name))
  const where = query.references.map(ref => {
    if (!known.has(ref.kindColumn) || !known.has(ref.idColumn)) refuse('an equality query names an unknown column')
    return `(${identifier(ref.kindColumn)}='agent' AND ${identifier(ref.idColumn)} IN (SELECT value FROM json_each(?)))`
  }).join(' OR ')
  return db.prepare(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${primary.map(column => identifier(column.name)).join(',')}`).all(...query.references.map(()=>JSON.stringify(ids))) as Record<string,unknown>[]
}
