// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES AN EXPORT CARRIES BESIDE ITS TEXT, AND THE ZIP THAT HOLDS BOTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A RELATED FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * The export already resolves the records its text carries. For each of those records this file
 * reads every path the record stores, through `storedPathsIn` in `src/server/lib/where-a-file-may-be-read.ts`: a
 * report's file, audio and video blocks, a message's pictures, and any later shape that declares a
 * `path`. A path is related only when it is absolute, has no `..`, names an ordinary file, and
 * lies inside `report-files/` or `message-pictures/` beside the database, after the same reading
 * the file door uses so a path written before the data folder moved still finds its file.
 *
 * A path outside those two folders is not carried. The office does not own that file and cannot
 * vouch for it. A symbolic link is never followed.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS, AND NONE OF THEM IS SILENCE
 * ---------------------------------------------------------------------------------------
 *
 * Every named file ends in one of three lists:
 *
 *   included  the bytes went into the zip, with their size and full sha256;
 *   missing   the path names nothing on this machine as an ordinary readable file, with the reason:
 *             there is no file, it is a directory, it is a link, or it could not be read;
 *   leftOut   the file was there and was not carried, with its size and the reason: the export's
 *             size line was reached, it would pass the most files, its bytes hold a key hash this
 *             office issued, or its name cannot be an entry in a zip.
 *
 * THE SIZE LINE IS 256 MiB OF FILE BYTES BEFORE COMPRESSION, AND 10,000 FILES. Whole files go in
 * while the next one fits. When one does not fit, it and every later file are left out, and the
 * manifest says so for each. No file is cut in half.
 *
 * A FILE HOLDING A KEY HASH NEVER LEAVES. Before a file is read into the zip the server asks the
 * same question a copy of the database asks, through `hashesFoundInTheBytesOf` and the one list
 * `keyHashesACopyIsSearchedFor` in `src/config/what-a-copy-must-not-carry.mjs`.
 */

import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, relative } from 'node:path'
import type { PanelRecord } from '@shared/types.ts'
import { nowStamp } from '@shared/time.ts'
import {
  manifestJson,
  ZIP_EXPORT_FILE_BYTES_LINE,
  ZIP_EXPORT_FILES_FOLDER,
  ZIP_EXPORT_FILES_LINE,
  ZIP_EXPORT_FORMAT,
  ZIP_EXPORT_MANIFEST_ENTRY,
  ZIP_EXPORT_TEXT_ENTRY,
  type ZipExportFilesRecord,
  type ZipExportIncludedEntry,
  type ZipExportLeftOutEntry,
  type ZipExportManifest,
  type ZipExportMissingEntry,
  type ZipExportRecord,
} from '@shared/zip-export/manifest.ts'
import { hashesFoundInTheseBytes, keyHashesACopyIsSearchedFor } from '../../../config/what-a-copy-must-not-carry.mjs'
import { sqlite } from '../../db/client.ts'
import { storedPathsIn, whereAStoreIs, whereStoredFilesAreNow, type StoreBesideTheDatabase } from '../where-a-file-may-be-read.ts'
import { inside } from '@shared/path-inside.ts'
import { whyAZipEntryNameIsUnfit, writeZip, type ZipEntry } from './zip.ts'

/** The two stores whose files an export may carry. `returned-files/` is outside this design on purpose. */
const RELATED_STORES = ['report-files', 'message-pictures'] as const satisfies readonly StoreBesideTheDatabase[]

/** The key hashes this office has issued, read through the one function a copy of the database also uses. */
export function keyHashesThisOfficeHolds(): Set<string> {
  return keyHashesACopyIsSearchedFor(sqlite)
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * THE NAME THE RECORD GIVES A FILE, by the path it stores.
 *
 * `storedPathsIn` is the authority on WHICH paths a record names. The name beside the path is not
 * part of its answer, so this walk reads the same objects once for that one fact: a report's file
 * block carries the file's own name, and a picture carries none, so a picture is called by the name
 * on disk. The first name for a path wins; one path named twice is one file.
 */
function namesByPath(data: unknown): Map<string, string> {
  const found = new Map<string, string>()
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value === null || typeof value !== 'object') return
    const object = value as Record<string, unknown>
    const path = object['path']
    if (typeof path === 'string' && path !== '' && !found.has(path)) {
      const given = object['name']
      found.set(path, typeof given === 'string' && given.trim() !== '' ? given.trim() : basename(path))
    }
    for (const child of Object.values(object)) visit(child)
  }
  visit(data)
  return found
}

interface Candidate {
  /** The path as the record stores it, normalised the way the file door normalises a request. */
  path: string
  /** Where the bytes are now, after the data-folder move is accounted for. */
  actual: string
  /** The record's own name for the file, for the manifest. */
  name: string
  store: StoreBesideTheDatabase
  /** Why a link on the way means this file is left out, or null when it is not. */
  leftOutBecause: string | null
}

/** One of the two stores, where it is on this machine now, and where that is after the links. */
interface AStoreOnThisMachine {
  store: StoreBesideTheDatabase
  directory: string
  /** The directory with every link resolved, or null when it is not there. */
  canonical: string | null
}

/** The two stores, with where each is on this machine now. */
function theStores(): AStoreOnThisMachine[] {
  return RELATED_STORES.map((store) => {
    const directory = whereAStoreIs(store)
    let canonical: string | null = null
    try {
      canonical = realpathSync(directory)
    } catch {
      // A store that is not there has no canonical path. Nothing inside it can be a candidate.
    }
    return { store, directory, canonical }
  })
}

/**
 * WHY A NAMED FILE IS NOT CARRIED BECAUSE OF A LINK, or null when its path reaches the file without
 * one.
 *
 * CONTAINMENT IS JUDGED AFTER THE LINKS ARE FOLLOWED, as the file door judges it: `link/secret.txt`
 * being inside the store by its name says nothing about where the bytes are. A real path outside the
 * store is left out, with a reason and never in silence.
 *
 * AND A LINK INSIDE THE STORE IS NOT FOLLOWED EVEN WHEN IT POINTS BACK IN. Comparing the path from
 * the store with the path from the store's real directory catches that: the two differ only when a
 * link on the way was followed. A link above the store, such as a data folder reached through one,
 * moves both beginnings and is not a link the record's own path made.
 *
 * IT NAMES NO ABSOLUTE PATH. The reason is written into the manifest and the export entry, and the
 * office's disk is not the reader's business.
 */
function whyALinkIsNotFollowed(actual: string, store: AStoreOnThisMachine): string | null {
  if (store.canonical === null) return null
  let canonical: string
  try {
    canonical = realpathSync(actual)
  } catch {
    // A dangling link, a link that points at itself, or a path the server cannot resolve. The
    // missing answer says which of those it is, so this leaves it to that.
    return null
  }
  if (!inside(canonical, store.canonical)) {
    return (
      'its real path is outside the store it was named in, through a link, and the export does not ' +
      'follow a link out of a store'
    )
  }
  if (relative(store.directory, actual) !== relative(store.canonical, canonical)) {
    return 'the path goes through a symbolic link, and the export does not follow links'
  }
  return null
}

/**
 * EVERY RELATED FILE, once, in the order the records name them.
 *
 * A path named by two records is one candidate, and the second record is added to it later when
 * the manifest entry is built. The order is the records' order and, inside one record, the order
 * the walk finds the paths.
 */
function candidatesIn(records: readonly PanelRecord[]): { candidates: Candidate[]; recordsByPath: Map<string, ZipExportRecord[]> } {
  const stores = theStores()
  const now = whereStoredFilesAreNow()
  const candidates: Candidate[] = []
  const recordsByPath = new Map<string, ZipExportRecord[]>()
  for (const record of records) {
    const names = namesByPath(record.data)
    for (const reference of storedPathsIn(record)) {
      // A path the file door cannot read is not a related file: relative, a NUL, or climbing out.
      if (reference.normalised === null) continue
      // A file on another machine is not this machine's file of the same name.
      if (reference.machine !== null) continue
      const actual = now(reference.normalised)
      const store = stores.find((one) => inside(actual, one.directory))
      if (store === undefined) continue
      const key = actual
      const recordFact = { recordId: record.id, recordTitle: record.title }
      const already = recordsByPath.get(key)
      if (already !== undefined) {
        if (!already.some((one) => one.recordId === recordFact.recordId)) already.push(recordFact)
        continue
      }
      recordsByPath.set(key, [recordFact])
      candidates.push({
        path: reference.normalised,
        actual,
        name: names.get(reference.path) ?? basename(reference.path),
        store: store.store,
        leftOutBecause: whyALinkIsNotFollowed(actual, store),
      })
    }
  }
  return { candidates, recordsByPath }
}

/** Why a named file is missing, or null when it is an ordinary file this export can read. */
function whyItIsMissing(actual: string): string | null {
  try {
    const stat = lstatSync(actual)
    if (stat.isSymbolicLink()) return 'the path is a symbolic link, and the export does not follow links'
    if (stat.isDirectory()) return 'the path is a directory, not an ordinary file'
    if (!stat.isFile()) return 'the path is not an ordinary file'
    return null
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 'there is no file at that path on this machine'
    return `the file could not be read: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** A name inside the zip that no earlier entry has taken. The stored name is already unique; this is the guard. */
function zipPathFor(candidate: Candidate, hash: string, used: Set<string>): string {
  const stored = basename(candidate.actual)
  const first = `${ZIP_EXPORT_FILES_FOLDER}${candidate.store}/${stored}`
  if (!used.has(first)) return first
  const extension = extname(stored)
  const stem = stored.slice(0, stored.length - extension.length)
  const second = `${ZIP_EXPORT_FILES_FOLDER}${candidate.store}/${stem}-${hash.slice(0, 8)}${extension}`
  if (!used.has(second)) return second
  return `${ZIP_EXPORT_FILES_FOLDER}${candidate.store}/${stem}-${hash}${extension}`
}

export interface TheZipExport {
  zip: Buffer
  manifest: ZipExportManifest
  /** What the bundle's export entry records about the files. */
  files: ZipExportFilesRecord
}

/**
 * BUILD ONE ZIP EXPORT: the text, every related file that fits and may leave, and the manifest.
 *
 * `lineBytes` and `maxFiles` are parameters so a test can cross the line with a few small files.
 * The two doors never pass them, and use the design's own line.
 */
export function theZipExportOf(input: {
  records: readonly PanelRecord[]
  text: string
  title: string
  n: number
  at?: string
  lineBytes?: number
  maxFiles?: number
  keyHashes?: Set<string>
}): TheZipExport {
  const lineBytes = input.lineBytes ?? ZIP_EXPORT_FILE_BYTES_LINE
  const maxFiles = input.maxFiles ?? ZIP_EXPORT_FILES_LINE
  const keyHashes = input.keyHashes ?? keyHashesThisOfficeHolds()
  const textBytes = Buffer.from(input.text, 'utf8')
  const entries: ZipEntry[] = [{ name: ZIP_EXPORT_TEXT_ENTRY, bytes: textBytes }]
  const usedNames = new Set(entries.map((entry) => entry.name))
  const { candidates, recordsByPath } = candidatesIn(input.records)

  const included: ZipExportIncludedEntry[] = []
  const missing: ZipExportMissingEntry[] = []
  const leftOut: ZipExportLeftOutEntry[] = []
  let carriedBytes = 0
  let stoppedByLine = false

  for (const candidate of candidates) {
    const records = recordsByPath.get(candidate.actual) ?? []
    const absent = whyItIsMissing(candidate.actual)
    if (absent !== null) {
      missing.push({ name: candidate.name, records, because: absent })
      continue
    }

    const size = lstatSync(candidate.actual).size
    // A LINK IS NEVER FOLLOWED, and the reason is the link's rather than the line's even when both
    // would leave the file out. A person reading the manifest is owed the first true reason.
    if (candidate.leftOutBecause !== null) {
      leftOut.push({ name: candidate.name, bytes: size, records, because: candidate.leftOutBecause })
      continue
    }

    if (stoppedByLine) {
      leftOut.push({
        name: candidate.name,
        bytes: size,
        records,
        because: `it came after a file the export's line of ${String(lineBytes)} bytes had room for`,
      })
      continue
    }
    if (included.length >= maxFiles) {
      leftOut.push({
        name: candidate.name,
        bytes: size,
        records,
        because: `the export already carries its most files, ${String(maxFiles)}`,
      })
      continue
    }
    if (carriedBytes + size > lineBytes) {
      stoppedByLine = true
      leftOut.push({
        name: candidate.name,
        bytes: size,
        records,
        because: `including it would take the export's file bytes past its line of ${String(lineBytes)}`,
      })
      continue
    }

    // READ THE BYTES ONCE, GUARDED. A file that exists but cannot be read is missing with its reason
    // rather than an exception out of the whole export: one unreadable file does not make the other
    // files unsendable, and the person is told which file it was.
    let bytes: Buffer
    try {
      bytes = readFileSync(candidate.actual)
    } catch (err) {
      missing.push({
        name: candidate.name,
        records,
        because: `the file could not be read: ${err instanceof Error ? err.message : String(err)}`,
      })
      continue
    }
    // THE BYTES ALREADY READ ARE THE BYTES SEARCHED. A count is all this side of the search learns;
    // what it found is the key hash itself and never goes into the manifest, the entry or a log.
    const found = new Set<string>()
    hashesFoundInTheseBytes(bytes, keyHashes, found)
    if (found.size > 0) {
      leftOut.push({
        name: candidate.name,
        bytes: size,
        records,
        because: 'its bytes hold a key hash this office issued, and no key material leaves',
      })
      continue
    }
    if (carriedBytes + bytes.length > lineBytes) {
      stoppedByLine = true
      leftOut.push({
        name: candidate.name,
        bytes: bytes.length,
        records,
        because: `including it would take the export's file bytes past its line of ${String(lineBytes)}`,
      })
      continue
    }

    const hash = sha256Of(bytes)
    const path = zipPathFor(candidate, hash, usedNames)
    const unfit = whyAZipEntryNameIsUnfit(path)
    if (unfit !== null) {
      leftOut.push({ name: candidate.name, bytes: bytes.length, records, because: `the zip cannot carry its name: ${unfit}` })
      continue
    }
    usedNames.add(path)
    carriedBytes += bytes.length
    entries.push({ name: path, bytes })
    included.push({ path, name: candidate.name, bytes: bytes.length, sha256: hash, records })
  }

  const manifest: ZipExportManifest = {
    format: ZIP_EXPORT_FORMAT,
    export: {
      title: input.title,
      n: input.n,
      at: input.at ?? nowStamp(),
      line: { bytes: lineBytes, files: maxFiles },
    },
    text: { bytes: textBytes.length, sha256: sha256Of(textBytes) },
    included,
    missing,
    leftOut,
  }
  const manifestBytes = Buffer.from(manifestJson(manifest), 'utf8')
  entries.push({ name: ZIP_EXPORT_MANIFEST_ENTRY, bytes: manifestBytes })
  const zip = writeZip(entries)

  return {
    zip,
    manifest,
    files: {
      included: included.map((one) => ({ name: one.name, bytes: one.bytes, sha256: one.sha256, records: one.records })),
      missing,
      leftOut,
      zipBytes: zip.length,
      zipHash: sha256Of(zip),
    },
  }
}
