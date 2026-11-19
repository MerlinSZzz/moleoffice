// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RE-MINT REWRITES AN OLD ID IN THE PLAIN COLUMNS WHERE ONE AGENT ANSWERS TO IT BY THAT ID, AND KEEPS EVERY OTHER VALUE
 * AS IT WAS TYPED. Wave 13s round 257, re-mint piece 3a. writeTheRemint (remint-write.ts) calls it inside its transaction,
 * after the keys and the held keys, and before the aliases.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH SITES
 * ---------------------------------------------------------------------------------------
 *
 * Every site comes from the register in identity-positions.ts, and no list of columns is kept here:
 *   - each plain column that holds a registry id, but those a foreign key ties to agents.id, which the write step
 *     rewrites with agents.id;
 *   - the column that holds an agent record's id or a registry id;
 *   - each plain column that holds the id as sent or a mixed id, and the change ledger's stamp, changes.actor_id;
 *   - api_calls.target_id, on a route of AN_AGENTS_ROUTE_TARGET alone.
 * It also reads each stored column that STORED_COLUMNS (open-shapes.ts) marks for the re-mint, by its type.
 * It reads no table a seal pins, and no column that holds a handle (held_keys.whose_id, which the write step moves). A site
 * with a pair is read only on a row whose column beside it says agent. A row where that column holds nothing is not read.
 *
 * A rewrite can change the name the census gives a row: a restart grant is named by its agent, a notice turn by its
 * recipient and a reading place by its reader. The stamp check and verifier match that row by its rewritten name.
 *
 * ---------------------------------------------------------------------------------------
 * HOW A VALUE IS READ
 * ---------------------------------------------------------------------------------------
 *
 * A registry id is read by the map alone: an old id of a legacy agent becomes its new id. An agent record's id is kept
 * first, and any other value there is read as a registry id. An id as sent, a mixed id, the stamp and the call log's
 * target are read by the rule: the value becomes the new id only where whomAStoredNameNames (remint-map.ts) says one
 * agent answers to it, that agent is a legacy one, and the value is that agent's id. So a handle that is not its agent's
 * id, a value no agent or more than one agent answers to, and the office's own writers stay as they were typed. Each value
 * is decided once, before anything is written, while every agent still has the id the map was made from.
 *
 * Only a legacy agent's old id can take a new id by the rule, so theRemintRule decides each of them before the write, and
 * every other value is kept. The plain rewrite, the check after it and the re-mint's pass over the history
 * (src/server/db/remint-history.ts) all read a value by that one rule.
 *
 * ---------------------------------------------------------------------------------------
 * EACH FORM, READ AND WRITTEN BACK AS THE PRODUCT DOES
 * ---------------------------------------------------------------------------------------
 *
 *   - 'type:id' is read by aTypeAndId (historical-reader.ts). Only an agent's part is read, and it is written back as the
 *     type, a colon and the new id, as its writers join them; no function of the product makes it;
 *   - 'kind:id' and 'contact' are read by participantFromKey and written back by participantKey (shared/messages.ts). Only
 *     an agent's part is read. A contact of a writer no registry held is kept;
 *   - 'pair' is read by pairFrom and written back by pairKey (message-pairs.ts), which sorts the two sides. A group's id is
 *     kept;
 *   - 'side-of-pair' is kept where it is read as neither side, or where it is neither side of the pair beside it. With a
 *     group beside it, the member's id is read as it is.
 * A value that is not a string, or not in its form, is kept.
 * A stored column is JSON, read by readStoredColumn (historical-reader.ts). Each registry id it finds is read by the map
 * and written at the place it names, and the rest is kept; the text is written back as JSON.stringify writes it, as its
 * writer does. Text that is not JSON is kept, and the census blocks it. A place the walk does not find, or an id that is
 * not a whole registry id, throws.
 *
 * ---------------------------------------------------------------------------------------
 * THE CHECK AFTER THE WRITE
 * ---------------------------------------------------------------------------------------
 *
 * Every site is read again after the write, with the decisions made before it. A row that still holds a value the rule
 * gives a new id is thrown, by its site and its rowid, and that rolls the transaction back.
 */
import type Database from 'better-sqlite3'
import { stepsOfPath } from '@shared/fielddiff.ts'
import { NEITHER_SIDE, UNREGISTERED_PREFIX, participantFromKey, participantKey } from '@shared/messages.ts'
import { PAIR_SEPARATOR, pairFrom, pairKey } from '../message-pairs.ts'
import { aTypeAndId, readStoredColumn, type IdentityReading } from './historical-reader.ts'
import { AN_AGENTS_ROUTE_TARGET, LEDGER_STAMPS, PLAIN_ID_COLUMNS, type PlainIdColumn, type PlainIdHolds } from './identity-positions.ts'
import { STORED_COLUMNS } from './open-shapes.ts'
import { whomAStoredNameNames, type RemintMap } from './remint-map.ts'

/** The tables whose rows a seal pins by their hash. The plain rewrite writes no row of them; the pass over the history rewrites them. */
export const THE_TABLES_SEALS_PIN = ['revisions', 'links'] as const

/** The column beside a side-of-pair that holds the conversation, as the register names it. */
const THE_PAIR_BESIDE = 'pair'

/** How a site's value is read: by the map alone, by the map after an agent record's id is kept, or by the rule. */
type HowItIsRead = 'registry' | 'record-or-registry' | 'rule'

const READ_AS: Partial<Record<PlainIdHolds, HowItIsRead>> = { 'registry-id': 'registry', 'record-or-registry-id': 'record-or-registry', 'as-sent': 'rule', mixed: 'rule' }

/** A plain site the re-mint reads. */
export interface APlainSite {
  /** The table, a dot, and the column. */
  site: string
  read: HowItIsRead
  form?: PlainIdColumn['form']
  /** The column beside it, and its value on a row that names an agent. */
  pair?: { field: string; agent: string }
  /** The column that holds the route, and the routes on which the value is an agent's. */
  routes?: { field: string; routes: readonly string[] }
  /** A column of STORED_COLUMNS, read by its type. */
  stored?: true
}

const tableOf = (site: string) => site.slice(0, site.indexOf('.'))
const columnOf = (site: string) => site.slice(site.indexOf('.') + 1)
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`

/** Every site the re-mint reads by this file, but those in `keyed`, which the write step rewrites with agents.id. */
export function thePlainSites(keyed: ReadonlySet<string>): APlainSite[] {
  const sealed = new Set<string>(THE_TABLES_SEALS_PIN)
  const sites: APlainSite[] = [
    ...PLAIN_ID_COLUMNS.flatMap((one) => {
      const read = READ_AS[one.holds]
      return read === undefined ? [] : [{ site: one.site, read, form: one.form, pair: one.pair }]
    }),
    ...LEDGER_STAMPS.map((one) => ({ site: one.site, read: 'rule' as const, pair: one.pair })),
    { site: AN_AGENTS_ROUTE_TARGET.site, read: 'rule', routes: AN_AGENTS_ROUTE_TARGET },
    ...Object.entries(STORED_COLUMNS).flatMap(([site, column]) => ('remint' in column ? [{ site, read: 'registry' as const, stored: true as const }] : [])),
  ]
  return sites.filter((one) => !keyed.has(one.site) && !sealed.has(tableOf(one.site)))
}

/** True when a stored route is one of `routes` or goes on below it. */
const onARoute = (route: unknown, routes: readonly string[]) => typeof route === 'string' && routes.some((one) => route === one || route.startsWith(`${one}/`))

/** How each kind of value is read: each gives the new id, or null where the value is kept. */
interface TheReading {
  registry: (id: string) => string | null
  isAnAgentRecord: (id: string) => boolean
  rule: (stored: string) => string | null
  /** What a stored column's reader finds in its value. */
  stored: (site: string, value: unknown) => IdentityReading
}

/** The new id the rule gives a stored value, or null where it is kept. */
function theIdTheRuleGives(db: Database.Database, map: RemintMap, stored: string): string | null {
  const name = whomAStoredNameNames(db, map, stored)
  if (name.names !== 'one agent') return null
  const entry = map.entries.find((one) => one.oldId === name.agent)
  if (entry?.from !== 'legacy') return null
  return stored === name.agent ? name.becomes : null
}

/** The new id of each old one, and the rule for a value that holds what was sent. */
export interface TheRemintRule {
  /** Each legacy agent's old id, to the new id the re-mint gives it. */
  newIds: ReadonlyMap<string, string>
  /** The id a value that holds what was sent takes, or null to keep it as it was typed. */
  underTheRule: (stored: string) => string | null
}

/**
 * THE RULE, DECIDED BEFORE ANY WRITE, while every agent still has the id `map` was made from. Only a legacy agent's old id
 * can take a new id by it, so each of them is decided here, and any other value keeps what it holds.
 */
export function theRemintRule(db: Database.Database, map: RemintMap): TheRemintRule {
  const legacy = map.entries.filter((entry) => entry.from === 'legacy')
  const decided = new Map(legacy.map((entry) => [entry.oldId, theIdTheRuleGives(db, map, entry.oldId)]))
  return { newIds: new Map(legacy.map((entry) => [entry.oldId, entry.newId])), underTheRule: (stored) => decided.get(stored) ?? null }
}

type ARow = Record<string, unknown>

/** The value a site's row is given, or null where it is kept. */
function theValueGiven(site: APlainSite, row: ARow, reading: TheReading): string | null {
  const value = row['value']
  if (site.pair !== undefined && row['beside'] !== site.pair.agent) return null
  if (site.routes !== undefined && !onARoute(row['route'], site.routes.routes)) return null
  if (typeof value !== 'string') return null
  if (site.stored === true) return theStoredValueGiven(site.site, value, reading)
  const theNewId = (id: string): string | null => {
    if (site.read === 'rule') return reading.rule(id)
    if (site.read === 'record-or-registry' && reading.isAnAgentRecord(id)) return null
    return reading.registry(id)
  }
  switch (site.form) {
    case undefined:
      return theNewId(value)
    case 'type:id': {
      const writer = aTypeAndId(value)
      if (writer === null) return null
      if (writer.type !== 'agent') return null
      const to = theNewId(writer.id)
      return to === null ? null : `${writer.type}:${to}`
    }
    case 'kind:id':
    case 'contact': {
      if (site.form === 'contact' && value.startsWith(UNREGISTERED_PREFIX)) return null
      const who = participantFromKey(value)
      if (who === null || who.kind !== 'agent') return null
      const to = theNewId(who.id)
      return to === null ? null : participantKey({ kind: who.kind, id: to })
    }
    case 'pair': {
      const pair = pairFrom(value)
      if (pair === null) return null
      const [a, b] = pair.map((side) => ({ side, to: theNewId(side.id) }))
      if (a!.to === null && b!.to === null) return null
      return pairKey({ ...a!.side, id: a!.to ?? a!.side.id }, { ...b!.side, id: b!.to ?? b!.side.id })
    }
    case 'side-of-pair': {
      if (value === NEITHER_SIDE) return null
      const pair = row['pair']
      if (typeof pair !== 'string') return null
      if (pair.includes(PAIR_SEPARATOR) && !(pairFrom(pair) ?? []).some((side) => side.id === value)) return null
      return theNewId(value)
    }
  }
}

const isAHolder = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** The text a stored column's row is given, or null where it is kept. */
function theStoredValueGiven(site: string, text: string, reading: TheReading): string | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  let given = false
  for (const one of reading.stored(site, value).found) {
    if (one.parse !== 'registry-id' || one.as !== 'value') throw new Error(`The re-mint reads ${site} for whole registry ids alone, and its reader found ${one.parse} as ${one.as} at ${one.path}.`)
    const to = reading.registry(one.stored)
    if (to === null) continue
    // The first step is the column's name, and the last is the id's place in what holds it.
    const steps = stepsOfPath(one.path).slice(1)
    const last = steps.pop()
    const holder = steps.reduce<unknown>((at, step) => (isAHolder(at) ? at[step] : undefined), value)
    if (last === undefined || !isAHolder(holder) || holder[last] !== one.stored) throw new Error(`The re-mint did not find ${JSON.stringify(one.stored)} at ${one.path} of ${site}, where its reader found it.`)
    holder[last] = to
    given = true
  }
  return given ? JSON.stringify(value) : null
}

/** Every row of a site, with its rowid, its value, and the columns beside it that its reading asks for. */
function theRowsOf(db: Database.Database, site: APlainSite): ARow[] {
  const columns = ['rowid AS "rowid"', `${quoted(columnOf(site.site))} AS "value"`]
  if (site.pair !== undefined) columns.push(`${quoted(site.pair.field)} AS "beside"`)
  if (site.routes !== undefined) columns.push(`${quoted(site.routes.field)} AS "route"`)
  if (site.form === 'side-of-pair') columns.push(`${quoted(THE_PAIR_BESIDE)} AS "pair"`)
  return db.prepare(`SELECT ${columns.join(', ')} FROM ${quoted(tableOf(site.site))} ORDER BY rowid`).all() as ARow[]
}

/** One value the re-mint rewrites: its site, its row, what it holds and what it is given. */
export interface APlainRewrite {
  site: string
  rowid: number
  from: string
  to: string
}

/** The rewrites of every site, in the sites' order and each site's rowid order. */
function theRewrites(db: Database.Database, sites: readonly APlainSite[], reading: TheReading): APlainRewrite[] {
  return sites.flatMap((site) =>
    theRowsOf(db, site).flatMap((row) => {
      const to = theValueGiven(site, row, reading)
      return to === null || to === row['value'] ? [] : [{ site: site.site, rowid: row['rowid'] as number, from: row['value'] as string, to }]
    }),
  )
}

/** The plain rewrites, planned before the write, and the reading they were planned by. */
export interface ThePlainPlan {
  sites: APlainSite[]
  rewrites: APlainRewrite[]
  /** The reading of each value, by the rule decided before the write. */
  reading: TheReading
}

/** PLAN THE REWRITE OF EVERY PLAIN SITE by `rule`, read while every agent still has the id the map was made from. */
export function planThePlainRewrites(db: Database.Database, rule: TheRemintRule, keyed: ReadonlySet<string>): ThePlainPlan {
  const anAgentRecord = db.prepare("SELECT 1 FROM records WHERE id = ? AND kind = 'agent' LIMIT 1")
  const reading: TheReading = {
    registry: (id) => rule.newIds.get(id) ?? null,
    isAnAgentRecord: (id) => anAgentRecord.get(id) !== undefined,
    rule: rule.underTheRule,
    stored: (site, value) => readStoredColumn(db, site, value),
  }
  const sites = thePlainSites(keyed)
  return { sites, rewrites: theRewrites(db, sites, reading), reading }
}

/** WRITE EACH PLANNED REWRITE, by its row's rowid, and give the rows written at each site, every site counted. */
export function writeThePlainRewrites(db: Database.Database, plan: ThePlainPlan): Record<string, number> {
  const written: Record<string, number> = Object.fromEntries(plan.sites.map((one) => [one.site, 0]))
  const statements = new Map(plan.sites.map((one) => [one.site, db.prepare(`UPDATE ${quoted(tableOf(one.site))} SET ${quoted(columnOf(one.site))} = ? WHERE rowid = ?`)]))
  for (const rewrite of plan.rewrites) written[rewrite.site]! += statements.get(rewrite.site)!.run(rewrite.to, rewrite.rowid).changes
  return written
}

/** How the refusal of a re-mint that left an old id in a plain column begins. */
export const AN_OLD_ID_LEFT_STOPS_THE_REMINT = 'The re-mint left an old id in a plain column, so nothing of it was kept.'

/** READ EVERY SITE AGAIN AFTER THE WRITE, by the rule decided before it, and throw each row that still holds an old id. */
export function refuseAnOldIdLeftInAPlainColumn(db: Database.Database, plan: ThePlainPlan): void {
  const left = theRewrites(db, plan.sites, plan.reading)
  const said = left.map((one) => `${one.site} still holds ${JSON.stringify(one.from)} in the row of ${tableOf(one.site)} with rowid ${String(one.rowid)}, which the rule gives ${JSON.stringify(one.to)}.`)
  if (left.length > 0) throw new Error(`${AN_OLD_ID_LEFT_STOPS_THE_REMINT} ${said.join(' ')}`)
}
