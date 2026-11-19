// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FILE A REPORT WILL CARRY, OVER HTTP.
 *
 *   GET  /api/report-files    what may be sent: the largest size, and where the bytes are stored
 *   POST /api/report-files    put a file where a report's `file` block can point at it
 *   GET  /api/report-files/unnamed    list stored files no record or revision names
 *   GET  /api/report-files/named-inside    live records naming files inside an absolute folder
 *
 * Criterion R3 of design/flows/ACCEPTANCE.md. What the door is for,
 * where the file goes, why an upload is refused when its directory is outside every preview root,
 * and why the size and hash are never taken from the caller all live in src/server/lib/reportfiles.ts
 * beside the rules they explain.
 *
 * These routes write no record. `POST` stores the bytes and hands back `{path, name, size, hash}`;
 * the report that points at the file is written later through POST /api/records, with a `file` block
 * carrying those four facts. The split is the same one the message-picture and outside-return doors
 * make, and for the same reason: a file too large, or a body that is not a file, is refused before
 * anything about a report is decided.
 */

import type { FastifyInstance } from 'fastify'
import { isAbsolute, resolve } from 'node:path'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { actorFrom } from '../lib/http.ts'
import { parse } from '../lib/parse.ts'
import { ACROSS_WORKSPACES, actorMayActAsSecretaryOrThePerson, listRecordNamesWithDataAs, listRecords } from '../lib/records.ts'
import { PanelError } from '../lib/panel-error.ts'
import { theMessageReader, theMessagesHiddenFrom } from '../lib/messages.ts'
import { records } from '../db/schema.ts'
import { theRecordsThatMayHoldOneOf } from '../lib/record-text-index.ts'
import {
  STORES_BESIDE_THE_DATABASE,
  inside,
  storedPathsIn,
  theDataFolderHasMoved,
  theLongestRunIn,
  whereAStoreIs,
  whereStoredFilesAreNow,
  type StoreBesideTheDatabase,
} from './files.ts'
import { theRunHasEnded } from '@shared/run-has-ended.ts'
import { theBranchesThatKeepASealedCommit } from '../lib/sealed-tip.ts'
import { route } from '../lib/route.ts'
import { readClosedUnchecked, readConfirmation, theInspectorAsked, theSupersededOn } from '@shared/releasing.ts'
import type { GitSubmission } from '@shared/sealed-tip.ts'
import type { PanelRecord } from '@shared/types.ts'
import { MEDIA_FORMATS } from '@shared/reportmedia.ts'
import { clockStamp } from '@shared/time.ts'
import { NAMED_INSIDE_CLASSES, WHAT_A_RECORD_NAMES_INSIDE, type WhatARecordNamesInside } from '@shared/what-a-record-names-inside.ts'
import { theFirstClassOf, theWorktreeAsGitHoldsIt, whatAStoredPathNames, whatProseNames } from '../lib/what-a-record-names-inside.ts'
import { workspaceOf } from '../lib/workspaces.ts'
import {
  MAX_REPORT_FILE_NAME,
  UNNAMED_REPORT_FILE_PAGE_SIZE,
  decodeReportFileBase64,
  maxReportFileBytes,
  storeAReportFile,
  unnamedReportFiles,
} from '../lib/reportfiles.ts'

// ============================================================================ the sentences

const REPORT_FILE_LIMITS_NOTE =
  'WHAT MAY BE SENT AS A FILE A REPORT CARRIES: the largest size in bytes. Read it before you send ' +
  'one, so a person choosing a file is told the limit rather than refused after choosing. The number ' +
  'is the same one the preview door refuses above, so a file this door stores is a file the report can ' +
  'show. Criterion R3.'

const REPORT_FILE_STORE_NOTE =
  'PUT A FILE WHERE A REPORT CAN CARRY IT AS A FILE. Body {"bytes": "<the file, base64>", "name": ' +
  '"<what the file is called>"}. It writes NO record: it stores the bytes and hands back ' +
  '{"path", "name", "size", "hash"}, and the report that points at them is written later through POST ' +
  '/api/records with a block of type "file" carrying those four facts. The bytes are stored in ' +
  'report-files/ beside the database, and the name, size and hash are worked out HERE from the bytes ' +
  'and never taken from the body: the hash is the short sha256 from src/server/lib/version.ts. The ' +
  'upload is refused before anything is written when the database sits where no preview root can ' +
  'serve the file back. A file whose name ends in ' + MEDIA_FORMATS.map((format) => format.extension).join(', ') +
  ' is one an "audio" or ' +
  '"video" block can play, so its first bytes must be that format, or it is refused with 415 before ' +
  'anything is written. Criterion R3.'

const REQUEST_ACCOUNTING_NOTE = 'The reader writes no rows of its own; the server\'s usual request and key-use accounting still applies.'

// WHAT ONE CALL COSTS COMES RIGHT AFTER WHAT THE DOOR IS FOR. On 28 October 2026, before the reader
// read in pages, one call on the live office held every row at once, ran out of memory and stopped the
// office. The pages stop the rows being held at once. They do not shorten the call: the reader is
// synchronous from the first page to the last, on the thread that answers every request.
const UNNAMED_REPORT_FILES_NOTE =
  'List regular files in report-files beside the database that no record or revision names. ' +
  `A call can read every record and then every revision in every project, ${UNNAMED_REPORT_FILE_PAGE_SIZE} rows at a time. ` +
  'It stops early only when every file in the folder is named. While one file stays unnamed, it reads every row. ' +
  'No other request is answered until the call ends, and the call takes longer as the office grows. ' +
  'When the folder holds no regular file, no record is read. ' +
  'Only the person and the secretary may read this list: the folder serves every project, and an ' +
  'unnamed upload has no record assigning it to the caller\'s project. A sandbox may ask through this door. ' +
  'References in all projects count, including deleted records, nested blocks, summary blocks and attachments. ' +
  'The reply gives the folder state, filesExamined, unnamedCount, skippedEntries and files with name, size in bytes, ' +
  'storedAt (null: no upload time is recorded) and modifiedAt (filesystem mtime, with a local offset). ' +
  'Links are not followed and folders are not entered. The reader writes nothing and removes nothing. ' +
  'Removing any file remains the person\'s decision. ' + REQUEST_ACCOUNTING_NOTE

const NAMED_INSIDE_SCOPE =
  'Readable live records in this project name their stored paths. ' +
  'hiddenCount counts the other live records in every project that name this folder or a path inside it, including private messages and prose; no hidden record details are returned. ' +
  'Prose names the folder by its absolute path, or by a relative path of its last segments, such as out/run-one/log.txt or ./out/run-one for a folder ending in out/run-one; its last segment alone names it only when more path follows. ' +
  'leftOut lists each readable record that names the folder only in places a rule sets aside, with those places and the rule. ' +
  'The rules are about a run whose session gives this folder as its working directory, once that run has ended. ' +
  'They set aside its session\'s working directory; its session\'s theCheck.checkout.directory, only when no check was asked of the run (theCheck has no askedOf) or its check is settled: confirmed, closed unchecked or superseded; ' +
  'its seal\'s sealed directory, while a branch of the repository the seal is read in contains the sealed commit; ' +
  'and the start lines about it, starting.cutSays and launcher.says of a worker entry and launcher.says of a next round. ' +
  'Deleted records and older revisions are excluded. ' +
  'When the folder is the top of a git worktree, the door compares each record it lists or counts with the worktree\'s HEAD commit, which comparedWith gives. ' +
  'A folder inside is held by the commit when the commit holds it and nothing untracked or ignored is inside it. ' +
  'In prose, a path that holds a wildcard, ".." or "…", or that could be read as the name of another file in the same folder, is not compared. ' +
  `Each record is put in the first of these classes that fits it: ${NAMED_INSIDE_CLASSES.map((key) => `${key}, it names ${WHAT_A_RECORD_NAMES_INSIDE[key]}`).join('; ')}. ` +
  'names gives the class of each listed record, and hiddenCiters counts in each class the records hiddenCount counts. ' +
  'When the door does not compare, comparedWith and hiddenCiters are null, names is left out, and notComparedBecause says why.'

const NAMED_INSIDE_NOTE =
  'Name records whose blocks or stored file facts name a file on this machine inside ?folder=<absolute path>. ' +
  'A path stored in report-files, message-pictures or returned-files of the default data folder also counts where that ' +
  'store is now, when the database is elsewhere. ' +
  'The folder must have no ".." segment and no NUL byte. The answer gives folder, records with id, kind, title, ' +
  'paths with where and path, and names when the door compared, hiddenCount, hiddenCiters, comparedWith, notComparedBecause, leftOut with id, kind, title and setAside with where and rule, scope and says. ' +
  'answeredAt says when the office answered, as a full time ' +
  'with its offset. ' + NAMED_INSIDE_SCOPE + ' Reads only; writes no record, event or use line.'

/**
 * Where a stored path is inside the folder, as the record names it or where its store is now: the part after the
 * folder, "" for the folder itself, or null when it is not inside. A path a record stored before the data folder
 * moved names a file that is now in the store beside the database in use, and a folder asked about there must not
 * read as one no record names. Made once for each request, so the folders are read once and not for each path.
 */
function aPlaceInsideReader(folder: string): (path: string) => string | null {
  const isNow = whereStoredFilesAreNow()
  const after = (path: string): string | null => (!inside(path, folder) ? null : path === folder ? '' : path.slice(folder.endsWith('/') ? folder.length : folder.length + 1))
  return (path) => after(path) ?? after(isNow(path))
}

/** Whether a stored path is a file inside the folder, by `aPlaceInsideReader`. */
function aFileInsideReader(folder: string): (path: string) => boolean {
  const place = aPlaceInsideReader(folder)
  return (path) => place(path) !== null
}

/**
 * WHICH RECORDS THE DOOR READS FOR A FOLDER: the ones the index of the records' text keeps, by id, or else the ones
 * `theRecordsThatCouldNameIt` keeps.
 *
 * The index holds the text of every string in `data` with its escapes read, as `aFolderNamer` reads it, and it works
 * in any script. A record that names the folder holds its last segment as written, or the name of a store at or inside
 * the folder when the data folder has moved, for the reasons below. The index cannot be asked about a text of fewer
 * than three letters, and it gives no ids when it keeps more records than are read by id
 * (src/server/lib/record-text-index.ts).
 */
export function whichRecordsCouldNameIt(folder: string): { ids: readonly string[] } | { alsoWhere: SQL | undefined } {
  const segments = folder.split('/').filter((one) => one !== '')
  const last = segments[segments.length - 1]
  const ids = last === undefined ? undefined : theRecordsThatMayHoldOneOf([last, ...theStoresAtOrInside(folder)])
  return ids === undefined ? { alsoWhere: theRecordsThatCouldNameIt(folder) } : { ids }
}

/**
 * THE STORES WHOSE NAME A RECORD MAY HOLD IN PLACE OF THE FOLDER'S LAST SEGMENT: each store at or inside the folder,
 * when the data folder has moved, and none when it has not.
 *
 * A stored path under an old store is read at its new place, inside the store beside the database. That place is inside
 * the folder in two ways. Either the store is at or inside the folder, and then the old path may hold no segment of
 * the folder, so it is found by the store's name. Or the folder is inside the store, and then the old path holds the
 * folder's last segment as written, after the store's name, so nothing more is needed. A folder anywhere else, a run's
 * scratch folder among them, holds no stored path read at a new place. Asked about every store's name for every folder,
 * the index kept more records than it reads by id on a made-up office at a live office's share, and the door read every
 * record by its condition, twice.
 */
function theStoresAtOrInside(folder: string): StoreBesideTheDatabase[] {
  if (!theDataFolderHasMoved()) return []
  return STORES_BESIDE_THE_DATABASE.filter((store) => inside(whereAStoreIs(store), folder))
}

/**
 * THE RECORDS THAT COULD NAME THE FOLDER, as a condition on their stored text, or undefined to read every record.
 *
 * `aFolderNamer` finds a match only where the folder's last segment is in the text as written. A stored path inside the
 * folder holds every segment as written: normalising takes out "//", "/./" and a trailing "/", and never makes a
 * segment. A run's working directory that resolves to the folder holds the last segment as written. When the data
 * folder has moved, a stored path under an old store is read at its new place, and such a path always holds the
 * store's name, so the name of each store at or inside the folder is kept as well (`theStoresAtOrInside`). Every
 * record the answer counts, lists or leaves out names the folder in one of those ways, so the answer is the same as
 * reading every record.
 *
 * The condition looks for the longest run of Latin letters, digits, ".", "_" and "-" in the last segment. Title and
 * summary are plain text, and `data` is JSON text, where a letter may be written as a backslash-u escape, so a record
 * holding that escape is kept too.
 */
export function theRecordsThatCouldNameIt(folder: string): SQL | undefined {
  const segments = folder.split('/').filter((one) => one !== '')
  const last = segments[segments.length - 1]
  if (last === undefined) return undefined
  const run = theLongestRunIn(last)
  if (run === undefined) return undefined
  const kept = [
    sql`instr(${records.title}, ${run}) > 0`,
    sql`instr(${records.summary}, ${run}) > 0`,
    sql`instr(${records.data}, ${run}) > 0`,
    sql`instr(${records.data}, ${'\\u'}) > 0`,
  ]
  for (const store of theStoresAtOrInside(folder)) kept.push(sql`instr(${records.data}, ${store}) > 0`)
  return sql`(${sql.join(kept, sql` OR `)})`
}

/**
 * WHETHER A VALUE NAMES THE FOLDER, walking every string in it, prose included.
 *
 * An absolute path names it. So does a relative one made of the folder's last segments: out/run-one/log.txt names every
 * folder that ends in out/run-one, because the door cannot tell where its writer stood, and counting it fails closed.
 * Before the path is the start, a space, a quote, a bracket, "=" or ":", or one of ./, ../ and ~/ led the same way; a
 * segment of another name before it is another folder. After it is the end, more path, or a mark that ends a word; a
 * sentence's full stop is one. A character outside ASCII leads a path and ends the folder's name as a space does,
 * because Chinese text puts no space around a path and may close it with punctuation. The door missed a path
 * written in Chinese text before this rule. So a name that goes on in Chinese characters is counted as the
 * folder, which fails closed. The last segment alone names the folder only when more path follows it, so a branch, a
 * handle or a round that shares the folder's name is not a path. "/" names everything.
 */
function aFolderNamer(folder: string): (value: unknown) => boolean {
  const places = theFolderPlaceFinder(folder)
  const names = (text: string): boolean => places(text).next().done !== true
  const walk = (value: unknown): boolean => {
    if (typeof value === 'string') return names(value)
    if (Array.isArray(value)) return value.some(walk)
    if (value !== null && typeof value === 'object') return Object.values(value).some(walk)
    return false
  }
  return walk
}

/**
 * What leads a path, besides the start of the text: a space, an ASCII quote, a backtick, an opening bracket, "=", ":" or
 * any character outside ASCII.
 */
const LEADS_A_PATH = /[\s"'`([{=:]|\P{ASCII}/u
/**
 * What ends the folder's own name, besides the end of the text and more path: a space, an ASCII quote, a backtick, a mark
 * that ends a word, or any character outside ASCII.
 */
const ENDS_THE_NAME = /[\s"'`,;:!?)}\]]|\P{ASCII}/u
/** What follows a full stop after the folder's name when the stop ends a sentence and is not part of a longer name. */
const AFTER_A_FULL_STOP = /^(?:$|[\s"')\]]|\P{ASCII})/u

/**
 * EACH PLACE IN A TEXT THAT NAMES THE FOLDER, by the rules `aFolderNamer` gives: the index just after the folder and
 * its "/" where more path follows, or -1 where the text names the folder itself. The named-inside door compares what
 * follows with the worktree's commit.
 */
function theFolderPlaceFinder(folder: string): (text: string) => Generator<number> {
  const segments = folder.split('/').filter((one) => one !== '')
  const led = (text: string, at: number): boolean => at === 0 || LEADS_A_PATH.test(text[at - 1]!)
  return function* places(text: string): Generator<number> {
    const last = segments[segments.length - 1]
    if (last === undefined) {
      for (let at = text.indexOf('/'); at >= 0; at = text.indexOf('/', at + 1)) if (led(text, at)) yield at + 1
      return
    }
    for (let at = text.indexOf(last); at >= 0; at = text.indexOf(last, at + 1)) {
      let start = at
      let matched = 1
      while (matched < segments.length) {
        const previous = segments[segments.length - 1 - matched]!
        if (text[start - 1] !== '/' || text.slice(start - 1 - previous.length, start - 1) !== previous) break
        start -= previous.length + 1
        matched += 1
      }
      const slash = start - 1
      const absolute = matched === segments.length && text[slash] === '/' && led(text, slash)
      const dots = text[slash] === '/' ? /(?:\.\.?|~)$/.exec(text.slice(0, slash)) : null
      if (!(absolute || led(text, start) || (dots !== null && led(text, slash - dots[0].length)))) continue
      const end = at + last.length
      const after = text[end] ?? ''
      if (after === '/') yield end + 1
      else if (matched === 1 && !absolute) continue
      else if (after === '' || ENDS_THE_NAME.test(after)) yield -1
      else if (after === '.' && AFTER_A_FULL_STOP.test(text.slice(end + 1))) yield -1
    }
  }
}

/**
 * WHAT EACH RECORD NAMES INSIDE THE FOLDER, compared with the HEAD of the worktree whose top it is, or why nothing was
 * compared. A stored path is compared as it is stored. Prose is compared at each place
 * `theFolderPlaceFinder` finds, in every string `aFolderNamer` reads, less the strings that are the stored paths
 * compared, so one path is not read twice.
 */
function whatEachRecordNamesInside(folder: string, compared: PanelRecord[]):
  { head: string; classOf: (record: PanelRecord) => WhatARecordNamesInside } | { because: string } {
  if (compared.length === 0) return { because: 'No record names the folder or a path inside it, so nothing was compared with git.' }
  const tree = theWorktreeAsGitHoldsIt(folder)
  if ('because' in tree) return tree
  const placeInside = aPlaceInsideReader(folder)
  const places = theFolderPlaceFinder(folder)
  return { head: tree.head, classOf: (record) => {
    const found: WhatARecordNamesInside[] = []
    const stored = new Set<string>()
    for (const ref of storedPathsIn(record)) {
      const place = ref.normalised !== null && ref.machine === null ? placeInside(ref.normalised) : null
      if (place === null) continue
      found.push(whatAStoredPathNames(tree, place))
      stored.add(ref.path)
    }
    const read = (value: unknown): void => {
      if (typeof value === 'string') {
        if (!stored.has(value)) for (const at of places(value)) found.push(whatProseNames(tree, value, at))
      } else if (Array.isArray(value)) value.forEach(read)
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(read)
    }
    read([record.title, record.summary, record.data])
    return theFirstClassOf(found)
  } }
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Each readable run whose session gives `folder` as its working directory and that has ended, with its state. */
function theEndedRunsThatWorkedIn(readable: PanelRecord[], folder: string): Map<string, string> {
  const ended = new Map<string, string>()
  for (const record of readable) {
    const directory = record.data['workingDirectory']
    if (record.kind !== 'session' || typeof directory !== 'string' || !isAbsolute(directory) || resolve(directory) !== folder) continue
    if (theRunHasEnded(record.data['state'])) ended.set(record.id, String(record.data['state']))
  }
  return ended
}

/**
 * THE PLACES IN ONE READABLE RECORD THAT THE RULES SET ASIDE, each a path into its data with the rule's words. Only the
 * fields named below are set aside, and only about a run in
 * `ended`:
 *   · the run's own session: its working directory; and its check's checkout directory, only when no check can read that
 *     folder again: no check was asked of the run, or its check is confirmed, closed unchecked or
 *     superseded. A check asked and not started, running, ended with no verdict, released and not confirmed, or refused
 *     keeps it, because a crashed check may be queued again and a released one reads the tip until it is confirmed;
 *   · a seal of the run naming the folder as its sealed directory: that directory, while a branch of the repository the
 *     seal is read in contains the sealed commit. No chosen repository, git not answering and no branch all keep it;
 *   · an entry about the run in workerRuns: starting.cutSays and launcher.says; a next round about it: launcher.says.
 */
function thePlacesSetAside(record: PanelRecord, ended: Map<string, string>, folder: string): { path: string[]; rule: string }[] {
  const places: { path: string[]; rule: string }[] = []
  const aboutAStart = (run: string): string => `a start line about run ${run}, which has ended (${ended.get(run)!}) and worked in this folder`
  if (record.kind === 'session' && ended.has(record.id)) {
    places.push({ path: ['workingDirectory'], rule: `run ${record.id} has ended (${ended.get(record.id)!}) and this folder is its working directory` })
    const settled = theCheckIsSettled(record.data)
    if (settled !== null) {
      places.push({ path: ['theCheck', 'checkout', 'directory'], rule: `run ${record.id} has ended (${ended.get(record.id)!}) and this folder is its working directory; ${settled}` })
    }
  }
  const seal = record.data['seal']
  if (record.kind === 'sealed_tip' && isObject(seal) && typeof seal['run'] === 'string' && ended.has(seal['run']) && isObject(seal['git'])) {
    const run = seal['run']
    const sealed = seal['git'] as unknown as GitSubmission
    if (typeof sealed.directory === 'string' && isAbsolute(sealed.directory) && resolve(sealed.directory) === folder && typeof sealed.commit === 'string') {
      const kept = theBranchesThatKeepASealedCommit(run, record.id, sealed)
      if (kept.kept) {
        places.push({ path: ['seal', 'git', 'directory'], rule: `the seal of run ${run}, which has ended (${ended.get(run)!}) and worked in this folder; ` +
          `${kept.branches.length === 1 ? 'branch' : 'branches'} ${kept.branches.join(', ')} of ${kept.repository} ${kept.branches.length === 1 ? 'contains' : 'contain'} its sealed commit ${sealed.commit}` })
      }
    }
  }
  const workers = record.data['workerRuns']
  for (const [key, entry] of isObject(workers) ? Object.entries(workers) : []) {
    const run = isObject(entry) && isObject(entry['started']) ? entry['started']['run'] : undefined
    if (typeof run !== 'string' || !ended.has(run)) continue
    places.push({ path: ['workerRuns', key, 'starting', 'cutSays'], rule: aboutAStart(run) }, { path: ['workerRuns', key, 'launcher', 'says'], rule: aboutAStart(run) })
  }
  const next = record.data['nextRound']
  const nextRun = isObject(next) && isObject(next['started']) ? next['started']['run'] : undefined
  if (typeof nextRun === 'string' && ended.has(nextRun)) places.push({ path: ['nextRound', 'launcher', 'says'], rule: aboutAStart(nextRun) })
  return places
}

/** Which settlement means no check can read the run's checkout again, or null because a check still may. */
function theCheckIsSettled(data: Record<string, unknown>): string | null {
  if (readClosedUnchecked(data['closedUnchecked']) !== null) return 'its check is settled: closed unchecked'
  if (theSupersededOn(data) !== null) return 'its check is settled: the run was superseded'
  if (readConfirmation(data['confirmed']) !== null) return 'its check is settled: confirmed'
  if (theInspectorAsked(data) === null) return 'no check was asked of it (its theCheck has no askedOf)'
  return null
}

/** The value at `path` inside `data`, or undefined. */
function at(data: unknown, path: string[]): unknown {
  return path.reduce<unknown>((value, key) => (isObject(value) ? value[key] : undefined), data)
}

/**
 * THE RECORD LEFT OUT, with each place set aside that named the folder, or null because it names the folder somewhere
 * else too, or names it nowhere a rule sets aside.
 */
function leftOutByARule(
  record: PanelRecord, ended: Map<string, string>, folder: string, names: (value: unknown) => boolean, namesAFile: (path: string) => boolean,
):
  { id: string; kind: string; title: string; setAside: { where: string; rule: string }[] } | null {
  const places = thePlacesSetAside(record, ended, folder).filter((place) => names(at(record.data, place.path)))
  if (places.length === 0) return null
  const rest = structuredClone(record.data)
  for (const place of places) delete (at(rest, place.path.slice(0, -1)) as Record<string, unknown>)[place.path[place.path.length - 1]!]
  const stillNamed = names([record.title, record.summary, rest]) ||
    storedPathsIn({ ...record, data: rest }).some((ref) => ref.normalised !== null && ref.machine === null && namesAFile(ref.normalised))
  if (stillNamed) return null
  return { id: record.id, kind: record.kind, title: record.title, setAside: places.map((place) => ({ where: `data.${place.path.join('.')}`, rule: place.rule })) }
}

// ============================================================================ what a caller sends

/**
 * The body, with both fields optional so that EVERY refusal is this door's own sentence and not
 * zod's. "There is no file here" and "the file has no name" are two different facts, and the door
 * says which one it is rather than "invalid input".
 */
const aReportFileSent = z.object({ bytes: z.string().optional(), name: z.string().optional() }).strict()

/**
 * The largest JSON body this route reads, from the same number the size check reads.
 *
 * Base64 is four bytes on the wire for every three of file, plus the JSON around it — so the room
 * is four times the limit, plus a third, plus an allowance for the rest of the body. A file up to
 * four times the limit therefore reaches `storeAReportFile`, which refuses it naming both numbers,
 * instead of meeting Fastify's own wordless refusal. The same arithmetic and the same reason as
 * `bodyLimitForAPicture` in api/messages.ts.
 */
const BODIES_THIS_ROUTE_WILL_READ = 4
const JSON_AROUND_A_FILE = 4096
function bodyLimitForAReportFile(limit: number): number {
  return Math.ceil((limit * BODIES_THIS_ROUTE_WILL_READ * 4) / 3) + JSON_AROUND_A_FILE
}

/** What a caller reads when the body is past even that, in place of *Request body is too large*. */
function pastEvenTheBodyLimit(limit: number, bodyLimit: number): string {
  return (
    'Nothing was read, because that request is bigger than this route reads at all. A file a report carries is at ' +
    `most ${String(limit)} bytes. This route stops reading at ${String(bodyLimit)} bytes of request, which is ` +
    `about ${String(limit * BODIES_THIS_ROUTE_WILL_READ)} bytes of file. How big this one is was never measured, ` +
    'so nothing here says. Nothing was written.'
  )
}

/** Fastify's own code for a body past the route's limit, which is the one refusal this route rewrites. */
const BODY_TOO_LARGE = 'FST_ERR_CTP_BODY_TOO_LARGE'

// ============================================================================ the routes

export async function reportFilesRoutes(app: FastifyInstance): Promise<void> {
  // READ ONCE, HERE, AND USED FOR BOTH THE LIMIT AND THE SENTENCE, for the reason api/messages.ts
  // reads its own once: two calls would be the same fact worked out twice.
  const limit = maxReportFileBytes()
  const bodyLimit = bodyLimitForAReportFile(limit)

  app.get('/report-files', route('report-file.limits', 'remote', REPORT_FILE_LIMITS_NOTE), async () => ({
    reportFile: {
      maxBytes: maxReportFileBytes(),
      maxName: MAX_REPORT_FILE_NAME,
    },
  }))

  app.get('/report-files/unnamed', route('report-file.unnamed', 'remote', UNNAMED_REPORT_FILES_NOTE), async (req) => {
    workspaceOf(req)
    if (!actorMayActAsSecretaryOrThePerson(actorFrom(req))) {
      throw new PanelError(
        'Only the person and the secretary may list unnamed report files. The folder serves every project, ' +
          'and no record assigns these uploads to your project.',
        403,
      )
    }
    const listed = unnamedReportFiles()
    return { ...listed, note: `${listed.note} ${REQUEST_ACCOUNTING_NOTE}` }
  })

  app.get('/report-files/named-inside', route('report-file.named-inside', 'remote', NAMED_INSIDE_NOTE), async (req, reply) => {
    const workspaceId = workspaceOf(req)
    const query = z.object({ folder: z.string() }).strict().safeParse(req.query)
    const raw = query.success ? query.data.folder : ''
    // Apply the preview door's path rules before resolve can hide a climbing segment.
    if (!isAbsolute(raw) || raw.includes('\0') || raw.split('/').includes('..')) {
      throw new PanelError(
        'folder must be an absolute path with no ".." segment and no NUL byte. Nothing was written.',
        400, undefined, undefined, undefined, { code: 'reportFilesFolderUnusable', values: {} },
      )
    }
    const folder = resolve(raw)
    const names = aFolderNamer(folder)
    const namesAFile = aFileInsideReader(folder)
    // EVERY PROJECT'S RECORDS THAT COULD NAME THE FOLDER ARE READ ONCE, and this project's are found among them by id,
    // reading no text again. A project's read under a narrowing is the read of every project under it, less what the
    // project's condition leaves out, in the same order. Before the narrowing the door read this project's records whole for
    // its list and every project's again for hiddenCount, and by its condition that was two passes over the stored text.
    const couldNameIt = whichRecordsCouldNameIt(folder)
    const everywhere = listRecords({ workspaceId: ACROSS_WORKSPACES, includeDeleted: false, ...couldNameIt })
    const ids = everywhere.map((record) => record.id)
    const inThisProject = new Set(listRecordNamesWithDataAs({ workspaceId, includeDeleted: false, ids }, sql<string>`'{}'`).map((record) => record.id))
    const current = everywhere.filter((record) => inThisProject.has(record.id))
    const reader = theMessageReader(actorFrom(req))
    const hidden = theMessagesHiddenFrom(reader, current.map((record) => record.id))
    const readable = current.filter((record) => !hidden.has(record.id))
    const ended = theEndedRunsThatWorkedIn(readable, folder)
    const leftOut = ended.size === 0 ? [] : readable.flatMap((record) => leftOutByARule(record, ended, folder, names, namesAFile) ?? [])
    const setAside = new Set(leftOut.map((record) => record.id))
    const listing = readable.filter((record) => !setAside.has(record.id)).flatMap((record) => {
      const paths = storedPathsIn(record)
        .filter((ref) => ref.normalised !== null && ref.machine === null && namesAFile(ref.normalised))
        .map(({ where, path }) => ({ where, path }))
      return paths.length === 0 ? [] : [{ record, paths }]
    })
    const listed = new Set(listing.map(({ record }) => record.id))
    const counted = everywhere
      .filter(record => !listed.has(record.id) && !setAside.has(record.id) && (names([record.title, record.summary, record.data]) ||
        storedPathsIn(record).some(ref => ref.normalised !== null && ref.machine === null && namesAFile(ref.normalised))))
    const hiddenCount = counted.length
    const comparison = whatEachRecordNamesInside(folder, [...listing.map(({ record }) => record), ...counted])
    const compared = 'because' in comparison ? null : comparison
    const records = listing.map(({ record, paths }) => ({ id: record.id, kind: record.kind, title: record.title, paths,
      ...(compared === null ? {} : { names: compared.classOf(record) }) }))
    let hiddenCiters: Record<WhatARecordNamesInside, number> | null = null
    if (compared !== null) {
      hiddenCiters = Object.fromEntries(NAMED_INSIDE_CLASSES.map((key) => [key, 0])) as Record<WhatARecordNamesInside, number>
      for (const record of counted) hiddenCiters[compared.classOf(record)] += 1
    }
    reply.header('cache-control', 'no-store')
    return {
      folder, records, hiddenCount, hiddenCiters, comparedWith: compared?.head ?? null,
      notComparedBecause: 'because' in comparison ? comparison.because : null,
      leftOut, scope: NAMED_INSIDE_SCOPE, answeredAt: clockStamp().instant,
      says: `${records.length} readable ${records.length === 1 ? 'record lists' : 'records list'} files inside ${folder}; ` +
        `${hiddenCount} other live ${hiddenCount === 1 ? 'record names' : 'records name'} the folder or a path inside it; ` +
        `leftOut lists ${leftOut.length} readable ${leftOut.length === 1 ? 'record that names' : 'records that name'} it only in places a rule sets aside.`,
    }
  })

  app.post(
    '/report-files',
    {
      bodyLimit,
      errorHandler: (error, request, reply) => {
        if ((error as { code?: unknown }).code === BODY_TOO_LARGE) {
          return reply.status(413).send({ error: pastEvenTheBodyLimit(limit, bodyLimit) })
        }
        return app.errorHandler(error, request, reply)
      },
      ...route('report-file.store', 'remote', REPORT_FILE_STORE_NOTE),
    },
    async (req, reply) => {
      const sent = parse(aReportFileSent, req.body ?? {}, 'The file a report carries')
      if (sent.bytes === undefined) {
        throw new PanelError('That file is empty: the body carried no bytes. Nothing was written.', 400)
      }
      if (sent.name === undefined) {
        throw new PanelError('That file needs a name: the body carried none. Nothing was written.', 400)
      }
      const workspaceId = workspaceOf(req)
      const bytes = decodeReportFileBase64(sent.bytes)
      const stored = storeAReportFile(bytes, sent.name, workspaceId)
      reply.code(201)
      return { file: stored }
    },
  )
}
