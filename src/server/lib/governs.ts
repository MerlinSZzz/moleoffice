// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH DECISION GOVERNS, AND WHICH DECISIONS GOVERN A PLACE.
 *
 * A decision's `governs` lists the modules, flows, pipelines and files it applies to (the `GovernedPlace` shape in
 * src/shared/kinds/decision.ts, read by `theGovernedPlaces` in src/shared/governs.ts). This file works out:
 *   - `assertTheGovernedPlacesAreReal` refuses a write whose named record is missing, deleted, in another project or
 *     of another kind;
 *   - `decisionsGoverning` answers "which decisions govern this file or this record", newest first, with the
 *     replaced ones marked;
 *   - `theGovernsCheck` lists, for one project, the decisions with nothing in governs, the pairs of live decisions
 *     naming one file where the newer does not say it replaces the older, and the replaced decisions that new work
 *     still cites. Pairs that share only a module, flow or pipeline are counted and not listed, and so are pairs on
 *     one file that a `coexists_with` link says both stand. It reminds and never blocks: nothing here refuses a write.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { pathCovers } from '@shared/paths.ts'
import { theGovernedPlaces, tidyGovernedPath as tidy, type GovernedPlace } from '@shared/governs.ts'
import { kindWord } from '@shared/words.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { links, records } from '../db/schema.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { REPLACES_FIELD, readTheReplacements, replacedDecisionIds, theLineOfReplacements, whatSupersedes, type AReplacement, type TheReplacements } from './replaced-decisions.ts'
import { moduleFor } from './sourceindex.ts'
import { theModuleReminderSecretaries } from './module-reminder-secretaries.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theOneAgent } from './stale-records.ts'
import { type BasisEntry } from './flow-reasons.ts'
import { theBasisOf } from '../db/the-basis-of.ts'
import { named } from './assert-the-governed-places-are-real.ts'

export { GOVERNED_KINDS } from './assert-the-governed-places-are-real.ts'

/**
 * THE KINDS OF RECORD THAT COUNT AS NEW WORK when the check asks whether a replaced decision is still cited. Decision
 * of the coordinator in message 8o9vQtaTZhnn: work records count; a message or a note only discusses a decision, so it
 * does not. The office has no kind called a plan, so none is counted for it.
 */
export const WORK_KINDS = ['decision', 'task', 'report', 'problem', 'session'] as const

export { assertTheGovernedPlacesAreReal } from './assert-the-governed-places-are-real.ts'

/** A decision as the two readings below need it. */
export interface DecisionRow {
  id: string
  title: string
  createdAt: string
  data: Record<string, unknown>
}

function theLiveDecisions(workspaceId: string): DecisionRow[] {
  return db
    .select({ id: records.id, title: records.title, createdAt: records.createdAt, data: records.data })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'decision'), isNull(records.deletedAt)))
    .all()
    .map((row) => ({ ...row, data: row.data ?? {} }))
}

/**
 * FOR EACH REPLACED DECISION IN THE PROJECT, its line of replacements (`theLineOfReplacements` in
 * lib/replaced-decisions.ts, which `whatSupersedes` reads too): the first is the decision whose filing replaced it, and
 * the last is the one that stands in its place.
 */
function theLinesOfReplacement(workspaceId: string, decisions: readonly DecisionRow[], replacements: TheReplacements): Map<string, AReplacement[]> {
  const replaced = replacedDecisionIds(workspaceId)
  const out = new Map<string, AReplacement[]>()
  for (const one of decisions) {
    if (!replaced.has(one.id)) continue
    const line = theLineOfReplacements(one.id, replacements)
    if (line.length > 0) out.set(one.id, line)
  }
  return out
}

/** One key for two decisions, whichever is named first. */
function pairKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`
}

/**
 * THE PAIRS OF DECISIONS THAT A `coexists_with` LINK SAYS BOTH STAND, by `pairKey`. The link is symmetric, so it is
 * read from either end, and a pair is read once however many links join it.
 */
function theDecisionsThatBothStand(decisions: readonly DecisionRow[]): Set<string> {
  const ids = new Set(decisions.map((one) => one.id))
  const out = new Set<string>()
  if (ids.size === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): this names every live decision in the project, which grows with the
  // project. The answer is a set, so the order of the pieces does not matter.
  const rows = readInPieces(ids, (piece) =>
    db
      .select({ fromId: links.fromId, toId: links.toId })
      .from(links)
      .where(and(eq(links.type, 'coexists_with'), inArray(links.fromId, piece)))
      .all(),
  )
  for (const row of rows) if (ids.has(row.toId)) out.add(pairKey(row.fromId, row.toId))
  return out
}

/** How one entry of a decision's governs reaches the place asked about. */
export type HowItGoverns =
  | { place: GovernedPlace; reaches: 'names-it' }
  | { place: GovernedPlace; reaches: 'covers-it' }
  | { place: GovernedPlace; reaches: 'inside-it' }
  | { place: GovernedPlace; reaches: 'claims-it'; module: { id: string; title: string } }

export interface AGoverningDecision {
  id: string
  title: string
  createdAt: string
  decidedOn: string | null
  /** The decision that stands in its place (`whatSupersedes` in lib/replaced-decisions.ts), or null when none replaced it. */
  replacedBy: { id: string; title: string } | null
  how: HowItGoverns[]
  /** What the decision was based on, only when the reader asked for the second level. */
  basis?: BasisEntry[]
}

export interface WhichDecisionsGovern {
  asked: { path: string } | { record: string }
  /** Newest first, by when each was recorded. */
  decisions: AGoverningDecision[]
  /** How many live decisions of the project have nothing in governs, so no question of this kind finds them. */
  notPlaced: { count: number; of: number }
  /** What could not be read, in words, so a short list is not taken for a whole one. */
  couldNotRead: string[]
}

/**
 * WHICH DECISIONS GOVERN THIS PATH OR THIS RECORD. Asked by an agent before it builds in a place.
 *
 * For a path, an entry reaches it when it names the same path, names a folder or a pattern that covers it, lies inside
 * it (the path asked is a folder), or names a module whose claims hold the path. For a record, an entry reaches it
 * when it names that record. Replaced decisions are listed, marked with what replaced them.
 */
export function decisionsGoverning(
  workspaceId: string,
  asked: { path: string } | { record: string },
  withBasis = false,
): WhichDecisionsGovern {
  const decisions = theLiveDecisions(workspaceId)
  const couldNotRead: string[] = []

  const claimers = new Map<string, { id: string; title: string }>()
  if ('path' in asked) {
    try {
      for (const claim of moduleFor(asked.path, workspaceId)) claimers.set(claim.moduleId, { id: claim.moduleId, title: claim.moduleTitle })
    } catch (error) {
      couldNotRead.push(
        `Which modules claim this path could not be read, so decisions that name only a module are not found by the ` +
          `path: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const out: AGoverningDecision[] = []
  let notPlaced = 0
  // THE REPLACEMENTS ARE READ ONCE, when the first decision that reaches the place is found, and not once for each.
  let replacements: TheReplacements | undefined
  for (const decision of decisions) {
    const places = theGovernedPlaces(decision.data['governs'])
    if (places.length === 0) notPlaced += 1
    const how: HowItGoverns[] = []
    for (const place of places) {
      if ('record' in asked) {
        if ('record' in place && place.record === asked.record) how.push({ place, reaches: 'names-it' })
        continue
      }
      if ('record' in place) {
        const module = claimers.get(place.record)
        if (module !== undefined) how.push({ place, reaches: 'claims-it', module })
        continue
      }
      const wanted = tidy(asked.path)
      if (place.path === wanted) how.push({ place, reaches: 'names-it' })
      else if (pathCovers({ path: place.path, asWritten: place.path }, { path: wanted, asWritten: wanted }) === 'yes') {
        how.push({ place, reaches: 'covers-it' })
      } else if (pathCovers({ path: wanted, asWritten: wanted }, { path: place.path, asWritten: place.path }) === 'yes') {
        how.push({ place, reaches: 'inside-it' })
      }
    }
    if (how.length === 0) continue
    const decidedOn = decision.data['decided_on']
    out.push({
      id: decision.id,
      title: decision.title,
      createdAt: decision.createdAt,
      decidedOn: typeof decidedOn === 'string' ? decidedOn : null,
      replacedBy: whatSupersedes(decision.id, (replacements ??= readTheReplacements())),
      how,
      ...(withBasis ? { basis: theBasisOf(decision.data['basis'], workspaceId) } : {}),
    })
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id.localeCompare(b.id)))
  return { asked, decisions: out, notPlaced: { count: notPlaced, of: decisions.length }, couldNotRead }
}

/** One decision as the check lists it. */
export interface ADecisionNamed {
  id: string
  title: string
  createdAt: string
}

export interface TheGovernsCheck {
  workspaceId: string
  /** Live decisions that are not replaced and have nothing in governs, newest first. */
  nothingInGoverns: ADecisionNamed[]
  /** Two live, unreplaced decisions naming one file, where the newer does not name the older in `replaces`. */
  overlapping: { newer: ADecisionNamed; older: ADecisionNamed; both: string }[]
  /** How many more such pairs share a module, flow or pipeline and name no file in common. They are not listed. */
  sharingNoFile: number
  /** How many more pairs name one file and are joined by a `coexists_with` link, which says both stand. They are not listed. */
  bothStand: number
  /** Replaced decisions that work recorded after their replacement still cites. */
  stillCited: { replaced: ADecisionNamed; replacedBy: ADecisionNamed; citedBy: { id: string; kind: string; title: string; how: 'link' | 'authority_reference' }[] }[]
  /** What this check does not compare, so an empty list is not read as "none". */
  notCompared: string[]
}

export { named } from './assert-the-governed-places-are-real.ts'

function newestFirst<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id.localeCompare(b.id)
}

/** One place in words, for the overlap list. */
function placeSaid(place: GovernedPlace): string {
  return 'record' in place ? `record ${place.record}` : `path ${place.path}`
}

/** Do two places name one thing? Yes for one record, or two paths where either covers the other. */
function theSameThing(a: GovernedPlace, b: GovernedPlace): boolean {
  if ('record' in a || 'record' in b) return 'record' in a && 'record' in b && a.record === b.record
  const left = { path: a.path, asWritten: a.path }
  const right = { path: b.path, asWritten: b.path }
  return pathCovers(left, right) === 'yes' || pathCovers(right, left) === 'yes'
}

/**
 * Do two places name one file? Two paths that are one thing do: equal, or a folder or pattern and a file it covers.
 * A record never does. The coordinator's answer of 9 October 2026 (g88FHyAlaxiE) kept the path comparison as it was.
 */
function theSameFile(a: GovernedPlace, b: GovernedPlace): boolean {
  return 'path' in a && 'path' in b && theSameThing(a, b)
}

/**
 * THE NIGHTLY CHECK, FOR ONE PROJECT. It reads and never writes. GET /api/decisions/governs-check answers it, and
 * `startTheReminders` in src/server/lib/reminders.ts works it out once a night through `sendTheGovernsCheck`.
 */
export function theGovernsCheck(workspaceId: string): TheGovernsCheck {
  const decisions = theLiveDecisions(workspaceId)
  // THE REPLACEMENTS ARE READ ONCE FOR THE WHOLE CHECK, so the lines and the decision that stands for each come from
  // one reading, and not one reading for each replaced decision.
  const replacements = readTheReplacements()
  const lines = theLinesOfReplacement(workspaceId, decisions, replacements)
  const live = decisions.filter((one) => !lines.has(one.id))

  const nothingInGoverns = live.filter((one) => theGovernedPlaces(one.data['governs']).length === 0).map(named).sort(newestFirst)

  // ONLY LIVE DECISIONS ARE PAIRED. A decision that names an older one in `replaces` is linked as replacing it when it is
  // written, so the older is no longer live, and a newer one that says it replaces the older is never listed.
  // ONLY A PAIR NAMING ONE FILE IS LISTED (the coordinator, message g88FHyAlaxiE). Decisions on one module mostly
  // add to each other, and `replaces` would retire the whole older one, so a pair that shares only a module, flow or
  // pipeline is counted instead.
  // A PAIR ON ONE FILE THAT BOTH STAND IS COUNTED AND NOT LISTED (wave 13j round loop-4). Two decisions on one file
  // are often two rules of one brief, and the only link that quieted such a pair, `supersedes`, retired the older. A
  // `coexists_with` link between the two says neither replaces the other, and it retires neither.
  const overlapping: TheGovernsCheck['overlapping'] = []
  const standing = theDecisionsThatBothStand(live)
  let sharingNoFile = 0
  let bothStand = 0
  const placed = live.map((one) => ({ row: one, places: theGovernedPlaces(one.data['governs']) })).filter((one) => one.places.length > 0)
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const [x, y] = [placed[i]!, placed[j]!]
      const [newer, older] = newestFirst(x.row, y.row) < 0 ? [x, y] : [y, x]
      const shared = newer.places.flatMap((a) => older.places.filter((b) => theSameFile(a, b)).map((b) => `${placeSaid(a)} and ${placeSaid(b)}`))
      if (shared.length > 0) {
        if (standing.has(pairKey(newer.row.id, older.row.id))) bothStand += 1
        else overlapping.push({ newer: named(newer.row), older: named(older.row), both: shared[0]! })
      } else if (newer.places.some((a) => older.places.some((b) => theSameThing(a, b)))) sharingNoFile += 1
    }
  }
  overlapping.sort((a, b) => newestFirst(a.newer, b.newer))

  const stillCited: TheGovernsCheck['stillCited'] = []
  const citing = theWorkCiting(workspaceId, lines)
  for (const replacedId of lines.keys()) {
    const replaced = decisions.find((one) => one.id === replacedId)
    const citedBy = citing.get(replacedId) ?? []
    if (replaced === undefined || citedBy.length === 0) continue
    // THE DECISION THAT STANDS IN ITS PLACE, as every other reader answers it: live, so it is one of this project's.
    const stands = whatSupersedes(replacedId, replacements)
    stillCited.push({ replaced: named(replaced), replacedBy: named(decisions.find((one) => one.id === stands?.id)!), citedBy })
  }
  stillCited.sort((a, b) => newestFirst(a.replaced, b.replaced))

  return {
    workspaceId,
    nothingInGoverns,
    overlapping,
    sharingNoFile,
    bothStand,
    stillCited,
    notCompared: [
      'Two patterns are not compared with each other: whether they share a file is not worked out.',
      'A decision naming a module and one naming a file that module claims are not counted as governing one thing.',
    ],
  }
}

type Citation = TheGovernsCheck['stillCited'][number]['citedBy'][number]

/**
 * THE WORK THAT STILL CITES EACH REPLACED DECISION, by the replaced decision's id: a record of a work kind, recorded
 * after the decision whose filing replaced it (the first of its line), that links to it by any link but `supersedes` or
 * whose `authority_reference` names it. A decision of its line, or one that names it in `replaces`, is left out. Two
 * reads in all, however many decisions were replaced.
 */
function theWorkCiting(workspaceId: string, lines: ReadonlyMap<string, readonly AReplacement[]>): Map<string, Citation[]> {
  const out = new Map<string, Map<string, Citation>>()
  const replacedIds = [...lines.keys()]
  if (replacedIds.length === 0) return new Map()
  const work = [...WORK_KINDS] as string[]
  const counts = (row: { id: string; createdAt: string; data: Record<string, unknown> | null }, replacedId: string): boolean => {
    const line = lines.get(replacedId)
    const first = line?.[0]
    if (line === undefined || first === undefined || row.createdAt <= first.createdAt || line.some((one) => one.id === row.id)) return false
    return !theDecisionReplaces(row.data ?? {}, replacedId)
  }
  const add = (replacedId: string, citation: Citation): void => {
    const here = out.get(replacedId) ?? new Map<string, Citation>()
    if (!here.has(citation.id)) here.set(citation.id, citation)
    out.set(replacedId, here)
  }
  // IN PIECES (src/server/db/in-pieces.ts): every replaced decision in the project is named, which grows with the
  // project. All the rows citing one decision are in one piece; with no ORDER BY, each decision's list was in SQLite's
  // order before and is in SQLite's order within its piece now, and the links are all read before the references.
  const linked = readInPieces(replacedIds, (piece) =>
    db
      .select({ id: records.id, kind: records.kind, title: records.title, createdAt: records.createdAt, data: records.data, to: links.toId, type: links.type })
      .from(links)
      .innerJoin(records, eq(links.fromId, records.id))
      .where(and(inArray(links.toId, piece), eq(records.workspaceId, workspaceId), inArray(records.kind, work), isNull(records.deletedAt)))
      .all(),
  )
  for (const row of linked) {
    if (row.type !== 'supersedes' && counts(row, row.to)) add(row.to, { id: row.id, kind: row.kind, title: row.title, how: 'link' })
  }
  const reference = sql<string | null>`json_extract(${records.data}, '$.authority_reference')`
  // IN PIECES (src/server/db/in-pieces.ts): the same list of replaced decisions. A record holds one reference, so it
  // matches one piece only and comes back once; each decision's rows are in one piece, in SQLite's order.
  const referring = readInPieces(replacedIds, (piece) =>
    db
      .select({ id: records.id, kind: records.kind, title: records.title, createdAt: records.createdAt, data: records.data, to: reference })
      .from(records)
      .where(and(eq(records.workspaceId, workspaceId), inArray(records.kind, work), isNull(records.deletedAt), inArray(reference, piece)))
      .all(),
  )
  for (const row of referring) {
    if (row.to !== null && counts(row, row.to)) add(row.to, { id: row.id, kind: row.kind, title: row.title, how: 'authority_reference' })
  }
  return new Map([...out].map(([id, here]) => [id, [...here.values()]]))
}

function theDecisionReplaces(data: Record<string, unknown>, id: string): boolean {
  const replaces = data[REPLACES_FIELD]
  return Array.isArray(replaces) && replaces.includes(id)
}

/** The hour of the night, on the server's clock, at which the check is worked out. */
export const THE_GOVERNS_CHECK_HOUR = 3

/** The server's own day, as YYYY-MM-DD, so the check runs once in it. */
export function theServersDay(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Is the nightly check due: the check's hour, and not yet worked out on this day. */
export function theGovernsCheckIsDue(now: Date, lastDay: string | null): boolean {
  return now.getHours() === THE_GOVERNS_CHECK_HOUR && theServersDay(now) !== lastDay
}

/** How many of each list the nightly message names by title and id. The rest are counted, and the lookup answers them all. */
export const THE_FIRST_FEW = 3

/**
 * THE ONE LINE THE NIGHTLY CHECK LOGS FOR A PROJECT: its three counts, then what was done about them, so a log with
 * counts and no message is never read as a message that went.
 */
export function theGovernsCheckLine(check: TheGovernsCheck, whatWasDone: string): string {
  return (
    `The governs check for ${check.workspaceId}: ${String(check.nothingInGoverns.length)} decisions with nothing in governs, ` +
    `${String(check.overlapping.length)} pairs governing one thing without one replacing the other, ` +
    (check.bothStand > 0 ? `${String(check.bothStand)} more pairs naming one file that are linked as both standing, ` : '') +
    (check.sharingNoFile > 0 ? `${String(check.sharingNoFile)} more pairs sharing only a module, flow or pipeline, ` : '') +
    `${String(check.stillCited.length)} replaced decisions still cited by later work. ${whatWasDone}`
  )
}

/** The nightly messages already sent for this project on this day, found from the office's own lines. */
function sentTonight(workspaceId: string, day: string): boolean {
  return (
    db
      .select({ id: records.id })
      .from(records)
      .where(
        and(
          eq(records.kind, 'message'),
          isNull(records.deletedAt),
          sql`json_extract(${records.data}, '$.extra.governsCheck.day') = ${day}`,
          sql`json_extract(${records.data}, '$.extra.governsCheck.project') = ${workspaceId}`,
          sql`json_extract(${records.data}, '$.sentBy.kind') = 'agent' AND json_extract(${records.data}, '$.sentBy.id') = ${moleOffice().id}`,
        ),
      )
      .get() !== undefined
  )
}

/** The first few of one list, each by title and id, and how many more there are. */
function theFirstFew<T>(list: readonly T[], said: (one: T) => string): string {
  const shown = list.slice(0, THE_FIRST_FEW).map(said).join('; ')
  const more = list.length - THE_FIRST_FEW
  return more > 0 ? `${shown}; and ${String(more)} more` : shown
}

function quoted(one: { id: string; title: string }): string {
  return `"${one.title}" (${one.id})`
}

/** The message to the secretary: the three counts, the first few of each list, and how to ask the lookup. */
function theNightlyMessage(check: TheGovernsCheck): string {
  const parts = [
    `The nightly governs check found work in ${check.workspaceId}. You are the secretary named for this project.`,
    `${String(check.nothingInGoverns.length)} decisions with nothing in governs` +
      (check.nothingInGoverns.length > 0 ? `: ${theFirstFew(check.nothingInGoverns, quoted)}.` : '.'),
    `${String(check.overlapping.length)} pairs of live decisions naming one file, where the newer does not say it replaces the older` +
      (check.overlapping.length > 0
        ? `: ${theFirstFew(check.overlapping, (pair) => `${quoted(pair.newer)} and ${quoted(pair.older)}, on ${pair.both}`)}.`
        : '.') +
      (check.bothStand > 0
        ? ` ${String(check.bothStand)} more pairs naming one file are linked as decisions that both stand: they are counted and not listed.`
        : '') +
      (check.sharingNoFile > 0
        ? ` ${String(check.sharingNoFile)} more pairs share only a module, flow or pipeline: they are counted and not listed.`
        : ''),
    `${String(check.stillCited.length)} replaced decisions that later work still cites` +
      (check.stillCited.length > 0
        ? `: ${theFirstFew(check.stillCited, (one) => `${quoted(one.replaced)}, replaced by ${quoted(one.replacedBy)}, cited by ${theFirstFew(one.citedBy, quoted)}`)}.`
        : '.'),
    `GET /api/decisions/governs-check in ${check.workspaceId} answers every one of them. ` +
      'GET /api/decisions/governing with path=<a file or folder> or record=<a module, flow or pipeline id> answers which decisions govern one place.',
    'Mole Office says this at most once a night, and it blocks nothing.',
  ]
  return parts.join(' ')
}

/**
 * THE NIGHTLY CHECK FOR ONE PROJECT, AND ITS ONE MESSAGE. When a list is not empty, the one secretary reminded about
 * the project's modules is sent one message that night. Who that is comes from the one reading,
 * `theModuleReminderSecretaries`: the choice on the Settings page first, and MOLE_OFFICE_MODULE_REMINDER_SECRETARIES
 * only for a project with nothing chosen there. A project with nobody named, a choice there that cannot be reminded
 * now, or a name that answers to no one agent, gets no message, and the line says why. A .env line that cannot be read
 * throws for a project that needs it, and the tick logs that. Returns the line the tick logs.
 */
export function sendTheGovernsCheck(workspaceId: string, now: Date, by: Actor): string {
  const check = theGovernsCheck(workspaceId)
  const line = (whatWasDone: string): string => theGovernsCheckLine(check, whatWasDone)
  if (check.nothingInGoverns.length + check.overlapping.length + check.stillCited.length === 0) {
    return line('No reminder sent: all three lists are empty.')
  }
  // THE ONE READING OF WHO IS REMINDED, the same one the Settings page shows and the 14-day reminder reads (invariant 9).
  const secretaries = theModuleReminderSecretaries()
  const inForce = secretaries.projects.find((one) => one.project === workspaceId)?.inForce
  if (inForce === undefined) throw new Error(`The project ${workspaceId} is not in the reading of who is reminded about modules. Nothing was guessed.`)
  if (inForce.from === '.env line unreadable') throw new Error(secretaries.envLine.readable ? `The reading says the .env line cannot be read for ${workspaceId}, and also that it was read. Nothing was guessed.` : secretaries.envLine.why)
  if (inForce.from === 'nobody named') {
    return line(`No reminder sent: nobody is named for ${workspaceId} on the Settings page or in MOLE_OFFICE_MODULE_REMINDER_SECRETARIES.`)
  }
  if (inForce.from === 'set here, cannot remind') {
    return line(
      `No reminder sent: the secretary set for ${workspaceId} on the Settings page, ${inForce.storedName}, is ${inForce.cannotBecause}. ` +
        'The .env line is not used in its place.',
    )
  }
  // SET THERE NAMES AN AGENT BY ITS REGISTRY ID, ALREADY CHECKED. The .env line names a handle, resolved here as before.
  const agent = inForce.from === 'set here' ? inForce.agent : theOneAgent(inForce.handle)
  if (typeof agent === 'string') return line(`No reminder sent: ${agent}.`)
  const day = theServersDay(now)
  if (sentTonight(workspaceId, day)) return line(`No reminder sent: ${agent.handle} was already sent one on ${day}.`)
  const sent = writeASystemLineToOne(
    { kind: 'agent', id: agent.id },
    workspaceId,
    SYSTEM_LINES.theGovernsCheckFoundWork(theNightlyMessage(check)),
    by,
    undefined,
    { governsCheck: { day, project: workspaceId } },
  )
  return line(`Reminder sent to ${agent.handle}, message ${sent.id}.`)
}
