// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TAKING A FILE SOMEBODY WANTS A REPORT TO CARRY, AND PUTTING IT WHERE THIS PRODUCT CAN SERVE IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion R3 of design/flows/ACCEPTANCE.md. Measured on 8 September
 * 2026: an agent archived five code files by cutting them into text blocks of 4,000 characters,
 * because that is the prose cap. The cap is right for prose and wrong for a file. So a report
 * carries a `file` block instead: the bytes on disk, and the file's own name, size and hash in the
 * block.
 *
 * This file is where those bytes are STORED and where the two facts that cannot be taken from a
 * caller's word — the size and the hash — are worked out. The record that points at the file is
 * written by a later piece through the ordinary record door, exactly as a message points at a
 * picture. Storing a file and writing a record that names it are two acts, for the reason criterion
 * M65 gives: "that is 30 MB" and "those bytes are not what you said" are facts about a file, and a
 * writer meets them before anybody has typed a sentence about it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE ON DISK AND NOT BYTES IN THE DATABASE
 * ---------------------------------------------------------------------------------------
 *
 * Because that is what a picture already is in this product. `ImageBlock` says it in one line:
 * *Mole Office points at it; it is never copied into the database.* A second way of holding bytes
 * would be a second set of rules about serving them, and `GET /api/file` — the careful one, with the
 * reference set and the roots — would not be the door for half of them. The directory is
 * `report-files/`, a sibling of the picture door's `message-pictures/` and the outside door's
 * `returned-files/`, so the ways in stand side by side under the installation directory.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE FILE GOES, AND WHY THE UPLOAD IS REFUSED WHEN THAT IS THE WRONG PLACE
 * ---------------------------------------------------------------------------------------
 *
 * It goes BESIDE THE DATABASE, for the reason `messagePictureDirectory` gives: bytes belong to the
 * database that points at them, and a scratch stack running on a temporary copy must not write into
 * the owner's own directory.
 *
 * `GET /api/file` will only read a file inside a preview root. So a report file stored where no
 * preview root reaches would be a file accepted, stored, pointed at by a record, and impossible to
 * draw — accepted work that silently cannot be done, which is the first invariant. THE UPLOAD IS
 * THEREFORE REFUSED BEFORE ANY BYTES ARE WRITTEN, with a sentence naming the directory, the roots
 * and the variable that sets them. The check asks `previewRoots` and `inside` — the same two things
 * the reading door asks — rather than a second copy of the rule.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIZE IS THE PREVIEW DOOR'S OWN LIMIT, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * A file this product cannot serve is a file this product must not store. `MAX_PREVIEW_BYTES` in
 * src/shared/preview-limit.ts is the number the reading door refuses above; this door refuses at the
 * same number, read from that one declaration rather than declared again. A second limit would be
 * two numbers that can drift, and the drift would look like a file stored successfully and refused
 * later.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CHECKED AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * ANY BYTES ARE ACCEPTED, unlike the picture door (which sniffs for png, jpeg or webp) and the
 * outside door (which checks for a zip). A report's file may be source, a log, a PDF, a spreadsheet
 * or an archive, and this door has no business deciding which of those a report is allowed to
 * carry. What it does decide is the name and the base64 shape, because both are things this door
 * stores and both have to be a real file rather than a string that decodes into something shorter.
 *
 * ONE EXCEPTION: A FILE NAMED AS SOUND OR FILM. A file whose name ends in
 * .wav, .mp3, .m4a, .mp4 or .webm can be played by a report's `audio` or `video` block, and the
 * record door, which may not read the disk, knows its format only by that ending. So here, where the
 * bytes are in hand, their first bytes are checked against the format the name claims, and a file
 * whose bytes are not that format is refused before anything is written. The list and the checks
 * are src/shared/reportmedia.ts.
 *
 * THE HASH AND THE SIZE ARE NEVER READ OFF THE CALLER'S BODY. `hashOfBytes` in ./version.ts — the
 * one place this product hashes anything — is handed the exact buffer that is written, and the size
 * is that buffer's length. A caller sends bytes and a name and nothing else.
 *
 * NOTHING HERE WRITES A RECORD EITHER, and that is the same deliberate split the picture door
 * makes. Until a live record in this project points at the file, `GET /api/file` serves it through
 * no door at all.
 */

import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { asc, gt, sql } from 'drizzle-orm'
import { storedFileChanged } from './storage/store.ts'
import { anOfficeId } from './ids.ts'
import { mediaFormatOf } from '../../shared/reportmedia.ts'
import { textValuesIn } from '../../shared/search.ts'
import { clockStamp } from '../../shared/time.ts'
import { db } from '../db/client.ts'
import { records, revisions } from '../db/schema.ts'
import { MAX_PREVIEW_BYTES } from '../../shared/preview-limit.ts'
import { MAX_REPORT_FILE_NAME } from '../../shared/report-file-name-limit.ts'
import {
  PREVIEW_ROOTS_VAR, previewRoots, rootsSentence, storedPathsIn, whereAStoreIs, whereStoredFilesAreNow,
  type StoreBesideTheDatabase,
} from './where-a-file-may-be-read.ts'
import { inside } from '@shared/path-inside.ts'
import { PanelError } from './panel-error.ts'
import { hashOfBytes } from './version.ts'
import { storedNameFor } from './stored-name-for.ts'

/** The directory a report's file is written into: `report-files/`, beside the database. */
export const REPORT_FILE_DIRECTORY = 'report-files' satisfies StoreBesideTheDatabase

/** Where those files go on this machine, as an absolute path. */
export function reportFileDirectory(): string {
  return whereAStoreIs(REPORT_FILE_DIRECTORY)
}

export interface UnnamedReportFile {
  /** The random name on disk, not the original name the uploader supplied. */
  name: string
  size: number
  /** The upload path keeps no separate record of when it stored a file. */
  storedAt: null
  /** The file's last modification time, with the server's local offset. */
  modifiedAt: string
}

export interface UnnamedReportFiles {
  directory: string
  directoryState: 'present' | 'missing'
  scope: string
  filesExamined: number
  unnamedCount: number
  /** Entries that are not regular files. Links are not followed and folders are not entered. */
  skippedEntries: string[]
  files: UnnamedReportFile[]
  timeSource: 'filesystem mtime'
  note: string
}

/**
 * HOW MANY RECORD OR REVISION ROWS ONE PAGE OF THE UNNAMED-FILE SCAN HOLDS.
 *
 * THE SCAN IS BOUNDED BY THIS NUMBER OF ROWS, NOT BY THIS NUMBER OF BYTES. A page is read, its
 * rows and their paths are used and released, and the next page starts after the last rowid. The
 * largest single row can still be large, so this is not a promise about heap bytes: it is a
 * promise that the corpus is never held at once.
 *
 * A page of one hundred keeps each read bounded in rows and is large enough that the scan does not
 * prepare a statement per row. It does not bound a page's bytes: one row, and the text in it, can
 * still be large. No OFFSET is used, so a page costs the same after ten pages as after one.
 */
export const UNNAMED_REPORT_FILE_PAGE_SIZE = 100

/** One regular file in the report-files folder, kept while pages are read and removed when named. */
interface UnnamedCandidate {
  name: string
  /** The name folded once, for the case-insensitive prose comparison. */
  foldedName: string
  size: number
  modifiedAt: string
}

/**
 * List regular files no stored path names. This reader makes no filesystem or database writes.
 * The folder belongs to the database, so references in every project count, including deleted
 * records and every revision. The preview's path walker also finds nested blocks, summary blocks,
 * message pictures and paths kept as attachments in a record's data.
 *
 * THE SCAN IS A KEYSET WALK, NOT A WHOLE-TABLE READ. Every record and every revision is still
 * read, but one page at a time in rowid order, and only the report folder's candidates are kept.
 * A candidate is dropped when a stored path names it, exactly as before, through `storedPathsIn`
 * and `whereStoredFilesAreNow`.
 *
 * PROSE IS ALSO TREATED AS A POSSIBLE CITATION, CONSERVATIVELY. The title, the summary and every
 * text value in a record's or revision's data are folded to one case. A candidate whose stored
 * name appears in any of those values is kept, including inside a relative path. A value that
 * names the report-files folder without naming a candidate is taken to refer to the folder as a
 * whole, so every remaining candidate is kept.
 *
 * THIS MATCHING IS NOT THE NAMED-INSIDE CHECK AND IS NOT A SEARCH. It compares strings inside the
 * rows this function already reads; it calls neither door. It can keep files that no record points
 * at, and a name it does not find is not proof that a file is unused. Before anything is removed,
 * run the named-inside check and a records search through their own doors, and ask whoever
 * uploaded the file to confirm.
 */
export function unnamedReportFiles(): UnnamedReportFiles {
  const directory = reportFileDirectory()
  const scope = 'The report-files folder beside this database; records in every project, including deleted records and all revisions. A file is also kept when its stored name appears in any title, summary or text, or when such text names the folder itself; that prose matching is conservative and can keep files nothing points at.'
  let names: string[]
  try {
    names = readdirSync(directory).sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return {
      directory, directoryState: 'missing', scope, filesExamined: 0, unnamedCount: 0,
      skippedEntries: [], files: [], timeSource: 'filesystem mtime',
      note: 'The report-files folder is not there. No files were examined. The upload time is not recorded.',
    }
  }

  // START FROM THE FILES, as the brief for this reader requires. Only regular files are candidates;
  // links and folders are reported as skipped and never followed or entered. If there is no
  // candidate, no record or revision is read at all.
  const candidates = new Map<string, UnnamedCandidate>()
  const skippedEntries: string[] = []
  let filesExamined = 0
  for (const name of names) {
    const path = join(directory, name)
    const stat = lstatSync(path)
    if (!stat.isFile()) {
      skippedEntries.push(name)
      continue
    }
    filesExamined += 1
    candidates.set(path, {
      name, foldedName: name.toLowerCase(), size: stat.size,
      modifiedAt: clockStamp(() => stat.mtime).instant,
    })
  }

  if (candidates.size > 0) {
    // A path a record stored before the data folder moved names the file where its store is now.
    const isNow = whereStoredFilesAreNow()
    const folderName = basename(directory).toLowerCase()
    const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
    // A CONCRETE PATH INSIDE THE FOLDER NAMES ONE THING, NOT THE WHOLE FOLDER. Strip every such
    // mention, whether or not its file is a candidate. A segment that starts with a dot, a star or
    // a question mark is left in place on purpose: it is a wildcard, an ellipsis or a hidden name,
    // and keeping it makes the folder test below cover it conservatively.
    const concreteDescendant = new RegExp(`${escapeForRegExp(folderName)}/[A-Za-z0-9_~%+-][A-Za-z0-9._~%+-]*`, 'gu')

    /** Whether the folded value names the folder itself, rather than a path, an endpoint or a longer word. */
    const namesOnlyTheFolder = (value: string): boolean => {
      const rest = value.replace(concreteDescendant, '')
      let at = rest.indexOf(folderName)
      while (at !== -1) {
        const before = at === 0 ? '' : rest[at - 1]!
        const after = rest.slice(at + folderName.length)
        // WHOLE TOKEN: not inside `unnamed-report-files` and not before `.test.ts`.
        const wholeWord = (before === '' || !/[A-Za-z0-9_.-]/u.test(before)) &&
          (after === '' || !/[A-Za-z0-9_.-]/u.test(after[0]!))
        // AN ENDPOINT IS NOT THE STORE: `/api/report-files` names the door, not the folder.
        const anEndpoint = /(?:^|\/)api\/$/u.test(rest.slice(0, at))
        if (wholeWord && !anEndpoint) return true
        at = rest.indexOf(folderName, at + folderName.length)
      }
      return false
    }

    /** Drop every candidate this one row names, and every candidate a folder-wide reference covers. */
    const protectWhatTheRowNames = (row: { id: string; title: string; summary: string | null; data: Record<string, unknown>; deletedAt: string | null }): void => {
      for (const reference of storedPathsIn(row)) {
        if (reference.normalised !== null) candidates.delete(isNow(reference.normalised))
      }
      if (candidates.size === 0) return
      const values = [row.title, row.summary ?? '', ...textValuesIn(row.data).map((one) => one.text)]
        .map((one) => one.toLowerCase())
      if (values.some(namesOnlyTheFolder)) {
        candidates.clear()
        return
      }
      for (const [path, candidate] of [...candidates]) {
        if (values.some((value) => value.includes(candidate.foldedName))) candidates.delete(path)
      }
    }

    // One page at a time, ordered by rowid and starting strictly after the last row read. The page
    // is consumed and dropped before the next one is asked for. When no candidate is left, there is
    // nothing more to protect and the walk stops.
    let after = 0
    let keepGoing = true
    while (keepGoing) {
      const page = db.select({
        rowid: sql<number>`rowid`,
        id: records.id,
        title: records.title,
        summary: records.summary,
        data: records.data,
        deletedAt: records.deletedAt,
      }).from(records).where(gt(sql`rowid`, after)).orderBy(asc(sql`rowid`)).limit(UNNAMED_REPORT_FILE_PAGE_SIZE).all()
      if (page.length === 0) break
      for (const row of page) {
        protectWhatTheRowNames(row)
        after = row.rowid
        if (candidates.size === 0) {
          keepGoing = false
          break
        }
      }
      if (page.length < UNNAMED_REPORT_FILE_PAGE_SIZE) break
    }
    if (keepGoing) {
      after = 0
      while (true) {
        const page = db.select({
          rowid: sql<number>`rowid`,
          id: revisions.recordId,
          title: revisions.title,
          summary: revisions.summary,
          data: revisions.data,
          deletedAt: revisions.deletedAt,
        }).from(revisions).where(gt(sql`rowid`, after)).orderBy(asc(sql`rowid`)).limit(UNNAMED_REPORT_FILE_PAGE_SIZE).all()
        if (page.length === 0) break
        for (const row of page) {
          protectWhatTheRowNames(row)
          after = row.rowid
          if (candidates.size === 0) break
        }
        if (candidates.size === 0 || page.length < UNNAMED_REPORT_FILE_PAGE_SIZE) break
      }
    }
  }

  const files: UnnamedReportFile[] = [...candidates.values()].map((candidate) => ({
    name: candidate.name, size: candidate.size, storedAt: null, modifiedAt: candidate.modifiedAt,
  }))
  return {
    directory, directoryState: 'present', scope, filesExamined, unnamedCount: files.length,
    skippedEntries, files, timeSource: 'filesystem mtime',
    note: `Examined ${filesExamined} regular files; ${files.length} are named by no record or revision and mentioned in no title, summary or text. ` +
      `Skipped ${skippedEntries.length} entries that are not regular files. ` +
      'The upload time is not recorded. modifiedAt is the last modification time on disk, which can change after an upload. ' +
      'The name matching in prose is conservative and can keep files nothing points at; it is not the named-inside check or a search. ' +
      'This is a list for review, not permission to remove a file: before any removal, check the folder through the named-inside check, search the records, and ask the uploader to confirm.',
  }
}

/**
 * The largest file this door stores, which is the largest one the preview door will serve back.
 *
 * READ FROM THE PREVIEW DOOR'S OWN DECLARATION and not declared again. See the header: a file above
 * this could never be drawn, so accepting one would be the first invariant broken.
 */
export function maxReportFileBytes(): number {
  return MAX_PREVIEW_BYTES
}

/**
 * How long a file's name may be, in characters. The number is in src/shared/report-file-name-limit.ts.
 * This file exports it again, so the files that import it from here keep their import.
 */
export { MAX_REPORT_FILE_NAME }

/**
 * WHERE THIS FILE WOULD GO, OR THE REASON IT MAY NOT BE STORED AT ALL.
 *
 * The directory has to sit inside a preview root, because that is the only way the record pointing
 * at it will ever be served. Asked before the bytes are looked at, so a person whose installation
 * cannot hold the file is told that rather than told their file is too big. The project is passed
 * in because the roots are derived per project, and the caller has the workspace on the request.
 */
export function whereReportFilesGo(workspaceId: string): string {
  const directory = reportFileDirectory()
  const roots = previewRoots(workspaceId)
  if (!roots.some((root) => inside(directory, root.configured))) {
    throw new PanelError(
      `A report's file would be stored in ${directory}, and Mole Office may not read anything ` +
        `there, so it could never be shown on the report. Nothing was written. ${rootsSentence(roots)} Either put the ` +
        `database inside one of those directories, or name ${directory} in ${PREVIEW_ROOTS_VAR}.`,
      500,
    )
  }
  return directory
}

export { storedNameFor } from './stored-name-for.ts'

/**
 * Check a name, or refuse it before anything is written.
 *
 * A NAME IS REQUIRED because the block must be able to say what the file is called. It is not
 * trimmed into something else: a name with spaces in it is a real name, and the schema stores it as
 * written. What is refused is a name that is empty, or so long that no filesystem would hold it.
 * A NUL is refused for the reason `requestedPath` gives about a path: it is how a name is cut short
 * into a different one.
 */
export function checkReportFileName(name: string): string {
  if (typeof name !== 'string' || name.trim() === '') {
    throw new PanelError('A report file needs a name, and the one sent is empty. Nothing was written.', 400)
  }
  if (name.includes('\0')) {
    throw new PanelError('That file name contains a NUL byte, which no file name can hold. Nothing was written.', 400)
  }
  if (name.length > MAX_REPORT_FILE_NAME) {
    throw new PanelError(
      `That file name is ${String(name.length)} characters and the limit is ${String(MAX_REPORT_FILE_NAME)}. ` +
        'Nothing was written.',
      400,
    )
  }
  return name
}

/**
 * Decode the base64 a caller sent, or refuse it before anything is written.
 *
 * THE SHAPE IS CHECKED FIRST, and it has to be. `Buffer.from(said, 'base64')` silently drops every
 * character it does not recognise, so a body of letters and punctuation would decode to whatever
 * happened to survive and be stored under the caller's own name — a file nobody sent. A standard
 * base64 body is a whole number of four-character groups of the base64 alphabet, with at most two
 * `=` at the end. Whitespace is taken out first, because the `base64` command wraps its output at
 * 76 characters and that wrapping means one thing only: loose input, strict storage.
 */
export function decodeReportFileBase64(said: string): Buffer {
  if (typeof said !== 'string' || said.trim() === '') {
    throw new PanelError('That file is empty: the body carried no bytes. Nothing was written.', 400)
  }
  const packed = said.replace(/\s+/gu, '')
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(packed) || packed.length % 4 !== 0) {
    throw new PanelError(
      'That file did not arrive as readable base64: it holds a character or a length that base64 cannot have, so ' +
        'decoding it would drop bytes and store something the sender never sent. Nothing was written. Line breaks ' +
        'and spaces are not the problem: those come out before this is checked.',
      400,
    )
  }
  const bytes = Buffer.from(packed, 'base64')
  if (bytes.length === 0) {
    throw new PanelError('That file arrived as base64 that decodes to nothing. Nothing was written.', 400)
  }
  return bytes
}

/**
 * A FILE NAMED AS SOUND OR FILM MUST BE THAT FORMAT, or it is refused before anything is written.
 *
 * Only the five endings in src/shared/reportmedia.ts are checked; every other file is accepted as it
 * is, as the header says. The ending checked is the one the stored name keeps, so a file that passes
 * is stored under the ending whose format its bytes really are.
 */
export function checkTheFormatItIsNamedAs(name: string, bytes: Buffer): void {
  const format = mediaFormatOf(extname(name))
  if (format === null || format.beginsAsItShould(bytes)) return
  throw new PanelError(
    `That file is named "${name}", so a report would play it as ${format.name}, and its bytes are not ` +
      `${format.name}: every ${format.name} file ${format.firstBytes}, and this one does not. Nothing was written. ` +
      'Send it under a name that says what it is.',
    415,
  )
}

/**
 * A report's file stored, and everything the block that will point at it needs.
 *
 * `name`, `size` and `hash` are the three facts the `file` block carries, and all three come from
 * this call: the name as checked, and the size and hash from the bytes themselves.
 */
export interface StoredReportFile {
  /** Where the file is, absolutely, on this machine. What the block's `path` carries. */
  path: string
  /** What the file is called, as the caller named it. What the block's `name` carries. */
  name: string
  /** The bytes' own length in bytes. What the block's `size` carries. */
  size: number
  /** The short sha256 of the bytes. What the block's `hash` carries. */
  hash: string
}

/**
 * Store a file a report will carry, and hand back the facts the block points at it with.
 *
 * The order of the refusals is the order a person meets them: an installation that cannot hold the
 * file at all, then a file with no name, then a body that is not a file, then one too large. Every
 * one of them says "Nothing was written", and every one of them is true when it says it.
 */
export function storeAReportFile(bytes: Buffer, name: string, workspaceId: string): StoredReportFile {
  const directory = whereReportFilesGo(workspaceId)
  const checkedName = checkReportFileName(name)
  if (bytes.length === 0) throw new PanelError('That file is empty. Nothing was written.', 400)
  const limit = maxReportFileBytes()
  if (bytes.length > limit) {
    throw new PanelError(
      `That file is ${String(bytes.length)} bytes and the limit is ${String(limit)}. Nothing was written. The ` +
        'limit is the largest file the preview door serves back, MAX_PREVIEW_BYTES in src/server/api/files.ts.',
      413,
    )
  }
  checkTheFormatItIsNamedAs(checkedName, bytes)
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true })
  const path = join(directory, storedNameFor(checkedName))
  // THE BUFFER THAT IS HASHED IS THE BUFFER THAT IS WRITTEN. Two reads of the same object, in the
  // same function, with no path between them: the size and the hash cannot come to describe a file
  // other than the one on disk.
  writeFileSync(path, bytes, { flag: 'wx' })
  try { storedFileChanged(path) }
  catch (error) { rmSync(path); throw error }
  return { path, name: checkedName, size: bytes.length, hash: hashOfBytes(bytes) }
}
