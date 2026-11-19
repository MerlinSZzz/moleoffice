// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPE OF A ZIP EXPORT'S MANIFEST, AND THE NAME THE ZIP IS GIVEN.
 *
 * A zip export holds the export's text, the related files the records name, and this manifest. The
 * manifest is the zip's own answer to "what is in here": the text's size and hash, one entry for
 * each file that went with the hash of its bytes and every record that named it, one entry for each
 * named file that was not on disk, and one entry for each file left out by the size line or by the
 * key-hash check.
 *
 * IT NEVER CARRIES AN ABSOLUTE PATH ON THE OFFICE'S DISK. The path inside the zip and the file's own
 * name are enough for a reader, and the office's folder names are not the reader's business.
 *
 * THE KEY ORDER IS FIXED BY THE BUILDER in `src/server/lib/zip-export/related-files.ts`, so the same
 * manifest reads the same way every time. `manifestJson` adds two spaces of indentation and one
 * newline, and nothing else: a manifest a person opens should be readable, and it should not vary
 * with the machine that wrote it.
 */

/** The words that name this manifest's shape and its version. A reader that does not know them stops. */
export const ZIP_EXPORT_FORMAT = 'mole-office-zip-export/1'

/**
 * THE LINE FOR FILE BYTES ONE EXPORT CARRIES, BEFORE COMPRESSION: 256 MiB.
 *
 * The design's own number, and an engineering choice rather than a number the owner gave. A backup's
 * line is 10 GiB because a backup is written to disk and must be complete; an export is downloaded
 * through a browser and handed to an outside reader, so its line is smaller. Above it the manifest
 * names every file left out and why, and nothing is dropped in silence.
 */
export const ZIP_EXPORT_FILE_BYTES_LINE = 268_435_456

/** THE MOST FILES ONE EXPORT CARRIES. The line above bounds the bytes; this bounds the count. */
export const ZIP_EXPORT_FILES_LINE = 10_000

/** The one entry at the top of every zip export that holds the text. */
export const ZIP_EXPORT_TEXT_ENTRY = 'text.txt'

/** The one entry at the top of every zip export that holds this manifest. */
export const ZIP_EXPORT_MANIFEST_ENTRY = 'manifest.json'

/** The folder inside the zip where every related file goes. Each file keeps the store it came from under it. */
export const ZIP_EXPORT_FILES_FOLDER = 'files/'

/**
 * One record, as the manifest names it. The names are `recordId` and `recordTitle` rather than `id`
 * and `title`, because one record may name many files and the same record then appears in several
 * entries. A shape's `id` is an identity a record must not repeat; this is a reference that may.
 */
export interface ZipExportRecord {
  recordId: string
  recordTitle: string
}

/** One file that went into the zip. `path` is its name inside the zip and is never a path on disk. */
export interface ZipExportIncludedEntry {
  path: string
  name: string
  bytes: number
  sha256: string
  records: ZipExportRecord[]
}

/** One named file that was not on disk as an ordinary readable file, with the reason it was not. */
export interface ZipExportMissingEntry {
  name: string
  records: ZipExportRecord[]
  because: string
}

/** One file that was on disk and was left out, with its size and the reason. */
export interface ZipExportLeftOutEntry {
  name: string
  bytes: number
  records: ZipExportRecord[]
  because: string
}

/** What one export's manifest says. Built once, here, so the zip and the export entry cannot disagree. */
export interface ZipExportManifest {
  format: string
  export: {
    title: string
    n: number
    at: string
    line: { bytes: number; files: number }
  }
  text: { bytes: number; sha256: string }
  included: ZipExportIncludedEntry[]
  missing: ZipExportMissingEntry[]
  leftOut: ZipExportLeftOutEntry[]
}

/**
 * WHAT THE EXPORT'S OWN RECORD KEEPS OF THE FILES, written inside the bundle's export entry.
 *
 * The manifest also says which path inside the zip each file took. The entry does not: a reader of
 * the record wants to know which bytes left, by name and hash, and where they sat inside the zip is
 * a fact about the zip rather than about what left the building.
 */
export interface ZipExportFilesRecord {
  included: { name: string; bytes: number; sha256: string; records: ZipExportRecord[] }[]
  missing: ZipExportMissingEntry[]
  leftOut: ZipExportLeftOutEntry[]
  zipBytes: number
  zipHash: string
}

/**
 * WHAT THE BROWSER IS HANDED WHEN A PERSON ASKS FOR THE FILES: the zip's bytes, the export number,
 * the title it was named from, and the three counts the export entry records.
 *
 * THE COUNTS ARE THE ENTRY'S OWN, not a second count of the zip: a page that said a different
 * number from the record would be the same fact worked out twice. `title` is the record's title read
 * when the export was recorded, so `exportFileName(title, n)` names the download exactly as the
 * server named it.
 */
export interface ZipExportAnswer {
  kind: 'zip'
  bytes: ArrayBuffer
  n: number
  title: string
  included: number
  missing: number
  leftOut: number
}

/**
 * THE NAME THE DOWNLOADED ZIP IS GIVEN: the bundle's or task's title made safe, then the export
 * number.
 *
 * IT IS NEVER A PATH OF THE OFFICE'S DISK. Everything outside letters, digits, dot, underscore and
 * hyphen becomes one hyphen; a run of those collapses; a title with nothing usable left is called
 * `export`. The number is the one the export entry records, so two downloads of one bundle are two
 * files with two names. A Chinese title keeps its number and loses its words here; the title in the
 * manifest is whole.
 */
export function exportFileName(title: string, n: number): string {
  const safe = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 80)
    .replace(/[-.]+$/, '')
  return `${safe === '' ? 'export' : safe}-${String(n)}.zip`
}

/** The manifest as the bytes that go into the zip. Two spaces of indentation, one trailing newline. */
export function manifestJson(manifest: ZipExportManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
