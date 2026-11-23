// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT'S GRAMMAR, READ: one file into its data regions, one region at a time, and every page under an export's
 * root. A file can be read a piece at a time, so a reader holds one region and never the whole file. It opens no
 * database, so a reader that must not open one can read an export with it. src/server/db/export-verification.ts is one.
 * src/server/lib/export.ts writes the grammar and exports these as before, so its readers are unchanged.
 * design/durability/FORMAT.md §4 is the specification.
 */
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Compare two strings by code unit, never by locale.
 *
 * `localeCompare` answers differently depending on the machine's locale, so a mirror sorted with
 * it would reorder itself when it moved machines and every reordering would be a commit saying
 * something changed. It is the only comparison used in this file and in export.ts.
 */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// ============================================================================ reading the grammar

/**
 * One data region, as it was found in a file.
 *
 * THIS HALF IS THE GRAMMAR AND NOTHING MORE. It parses; it does not reconcile, does not decide
 * what an id means, does not compare against a database and writes nothing. That line is where
 * this file stops and the importer (G3) starts, and it is drawn here so the two are not built
 * twice — FORMAT.md §4 is the specification both sides are implementing.
 */
export interface ExportRegion {
  /** The region name: a SQL table, or `<table>.<column>` for a JSON block, or `manifest`/`migrations`. */
  name: string
  kind: 'fields' | 'json'
  /** 1-based line of the region's opening delimiter, so a message can point at it. */
  line: number
  /** For `fields`: every `key: value` in the block, in the order they appeared. */
  fields: Record<string, unknown>
  /** For `json`: the parsed document. */
  json: unknown
}

export interface ParsedExportFile {
  /** Whatever the caller called this file. Used only in messages. */
  path: string
  regions: ExportRegion[]
}

/** A file that does not obey the grammar. Always names the file and the line. */
export class ExportFormatError extends Error {
  override readonly name = 'ExportFormatError'
  constructor(
    message: string,
    readonly path: string,
    readonly line: number,
  ) {
    super(`${path}:${line} — ${message}`)
  }
}

/**
 * A data block's opening fence.
 *
 * `panelx` is accepted beside `mole-office` because every archive written before 28 August 2026
 * uses it, and the grammar is otherwise identical. See FORMAT_VERSION_BEFORE_THE_RENAME.
 */
const FENCE = /^```(json )?(?:mole-office|panelx) ([A-Za-z_][A-Za-z0-9_.]*)\s*$/

/**
 * Read one export file into its data regions. Prose is ignored.
 *
 * This is `regionsOf` over the lines of the whole text, so the two can never read a file differently.
 */
export function parseExportFile(text: string, path: string): ParsedExportFile {
  return { path, regions: [...regionsOf(text.split('\n'), path)] }
}

/**
 * A JSON block given as its lines and not parsed, because the reader asked for blocks of its name that way: a block
 * too large to hold, read by a reader of its own. Read `body` before asking for the next region. Whatever of it is left
 * unread then is passed over to the block's closing fence.
 */
export interface UnparsedJsonBlock {
  name: string
  kind: 'unparsed json'
  /** 1-based line of the block's opening fence. */
  line: number
  /** The lines between the fences, each read when it is asked for. A block never closed is thrown at the file's end. */
  body: Iterable<string>
}

/** Where `regionsOf` starts, and which JSON blocks it gives unparsed. */
export interface FromWhere {
  /** The number of the first line given, 1 by default. Front matter is read only when it is 1. */
  line?: number
  /** The names of the JSON blocks to give as an `UnparsedJsonBlock`. */
  unparsed?: ReadonlySet<string>
}

/**
 * THE GRAMMAR: the data regions of one file, one at a time, in the file's order, read from its lines. Prose is ignored.
 *
 * Only the region being read is held, never the file, so a reader can keep what it needs of each region and let the
 * rest go. The first line that breaks the grammar is thrown when it is reached, after the regions before it have been
 * given. A reader that wants all or nothing of a file, as `parseExportFile` does, keeps the regions until the end.
 *
 * Given lines from the middle of a file, with the number of the first, it reads on from there as it would have read
 * on from that line of the whole file, when that line is not inside a block.
 *
 * A line inside a block can never be mistaken for a fence: every value is one JSON value on one
 * line and JSON escapes its newlines, so nothing a value can hold reaches column zero of a new
 * line. That is one of the reasons the grammar has no multi-line form.
 */
export function regionsOf(lines: Iterable<string>, path: string, from?: { line?: number; unparsed?: undefined }): Generator<ExportRegion>
export function regionsOf(lines: Iterable<string>, path: string, from: FromWhere): Generator<ExportRegion | UnparsedJsonBlock>
export function* regionsOf(lines: Iterable<string>, path: string, from: FromWhere = {}): Generator<ExportRegion | UnparsedJsonBlock> {
  const source = lines[Symbol.iterator]()
  const first = from.line ?? 1
  /** The number of the line read last. */
  let number = first - 1
  const next = (): string | undefined => {
    const step = source.next()
    if (step.done === true) return undefined
    number += 1
    return step.value
  }
  try {
    let line = next()

    if (first === 1 && line === '---') {
      const held: string[] = []
      for (line = next(); line !== undefined && line !== '---'; line = next()) held.push(line)
      if (line === undefined) throw new ExportFormatError('the front matter is opened with --- and never closed.', path, 1)
      const fields = readFields(held, path, 2)
      // `panelx` is the key every file written before 28 August 2026 uses, and it is read for the
      // same reason the old format version is accepted. Nothing writes it any more.
      const name = fields['region'] ?? fields['panelx']
      if (typeof name !== 'string') {
        throw new ExportFormatError(
          'front matter must name its region with a first line like `region: "records"`, so that nothing has to ' +
            'read the file path to know what it holds.',
          path,
          2,
        )
      }
      delete fields['region']
      delete fields['panelx']
      yield { name, kind: 'fields', line: 1, fields, json: undefined }
      line = next()
    }

    for (; line !== undefined; line = next()) {
      const fence = FENCE.exec(line)
      if (fence === null) continue
      const isJson = fence[1] !== undefined
      const name = fence[2] ?? ''
      const open = number
      let closed = false
      /** The next line of the block, or undefined at its closing fence. */
      const bodyLine = (): string | undefined => {
        if (closed) return undefined
        const read = next()
        if (read === undefined) throw new ExportFormatError(`the block \`mole-office ${name}\` is opened and never closed.`, path, open)
        if (read === '```') closed = true
        return closed ? undefined : read
      }
      if (isJson && from.unparsed?.has(name) === true) {
        const body = (function* (): Generator<string> {
          for (let read = bodyLine(); read !== undefined; read = bodyLine()) yield read
        })()
        yield { name, kind: 'unparsed json', line: open, body }
        while (bodyLine() !== undefined) continue
        continue
      }
      const body: string[] = []
      for (let read = bodyLine(); read !== undefined; read = bodyLine()) body.push(read)
      if (isJson) {
        let parsed: unknown
        try {
          parsed = JSON.parse(body.join('\n')) as unknown
        } catch (err) {
          throw new ExportFormatError(`the JSON block \`${name}\` does not parse: ${(err as Error).message}`, path, open)
        }
        yield { name, kind: 'json', line: open, fields: {}, json: parsed }
      } else {
        yield { name, kind: 'fields', line: open, fields: readFields(body, path, open + 1), json: undefined }
      }
    }
  } finally {
    source.return?.()
  }
}

/** A place in a file: where a line starts, in bytes from the start of the file, and the line's number, from 1. */
export interface APlaceInAFile {
  offset: number
  line: number
}

/** How many bytes of a file `linesOf` reads at once. */
const PIECE = 1 << 20

/**
 * The lines of a file from `place`, read a piece at a time: the strings `readFileSync(file, 'utf8').split('\n')` gives
 * from that line on, without the whole file in memory. `place` is moved on as each line is given, so it always says
 * where the next line starts. A reader that keeps a copy of it can read on from there later.
 *
 * A line is cut at the byte 0x0A and only then decoded as UTF-8. In UTF-8 the newline is the only character with a
 * 0x0A byte, and a broken character never takes the 0x0A after it, so each line decodes as it does inside the whole
 * file. The last line is given even when it is empty, as `split` gives it. The file is closed when its lines end, when
 * a read fails and when the reader stops early.
 */
export function* linesOf(file: string, place: APlaceInAFile = { offset: 0, line: 1 }): Generator<string> {
  const fd = openSync(file, 'r')
  try {
    /** Where in the file the next piece is read from. */
    let position = place.offset
    let held: Buffer[] = []
    for (;;) {
      const piece = Buffer.allocUnsafe(PIECE)
      const read = readSync(fd, piece, 0, PIECE, position)
      if (read === 0) break
      const bytes = piece.subarray(0, read)
      let from = 0
      for (let end = bytes.indexOf(0x0a, from); end !== -1; end = bytes.indexOf(0x0a, from)) {
        const line =
          held.length === 0 ? bytes.toString('utf8', from, end) : Buffer.concat([...held, bytes.subarray(from, end)]).toString('utf8')
        held = []
        from = end + 1
        place.offset = position + from
        place.line += 1
        yield line
      }
      if (from < read) held.push(bytes.subarray(from))
      position += read
    }
    const last = Buffer.concat(held).toString('utf8')
    place.offset = position
    place.line += 1
    yield last
  } finally {
    closeSync(fd)
  }
}

/**
 * The bytes of a file from `from` up to `to`, decoded as UTF-8: a piece read again after `linesOf` has read past it.
 * Cut at the ends of lines, or after a key's `: `, the bytes decode to what `linesOf` gave, for the reason it gives.
 */
export function theTextBetween(file: string, from: number, to: number): string {
  const bytes = Buffer.allocUnsafe(Math.max(0, to - from))
  let read = 0
  const fd = openSync(file, 'r')
  try {
    while (read < bytes.length) {
      const n = readSync(fd, bytes, read, bytes.length - read, from + read)
      if (n === 0) break
      read += n
    }
  } finally {
    closeSync(fd)
  }
  return bytes.toString('utf8', 0, read)
}

/** Read field lines. A duplicate key, a missing separator or a bad value is refused, never guessed. */
function readFields(body: readonly string[], path: string, firstLine: number): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  body.forEach((raw, offset) => {
    const line = firstLine + offset
    if (raw.trim() === '') {
      throw new ExportFormatError('a blank line inside a data block. Every line must be `key: <JSON value>`.', path, line)
    }
    const at = raw.indexOf(': ')
    if (at === -1) {
      throw new ExportFormatError(`\`${raw}\` is not a field line. Every line must be \`key: <JSON value>\`.`, path, line)
    }
    const key = raw.slice(0, at)
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
      throw new ExportFormatError(`\`${key}\` is not a usable key. Keys match [A-Za-z][A-Za-z0-9_]*.`, path, line)
    }
    if (key in fields) {
      throw new ExportFormatError(`the key \`${key}\` appears twice in one block, so one of them would be lost.`, path, line)
    }
    try {
      fields[key] = JSON.parse(raw.slice(at + 2)) as unknown
    } catch (err) {
      throw new ExportFormatError(`the value of \`${key}\` is not JSON: ${(err as Error).message}`, path, line)
    }
  })
  return fields
}

/**
 * Parse every `.md` file under an export root.
 *
 * `.git/` is skipped, because a mirror keeps its repository beside the files it commits and
 * nothing in there is ours to read.
 */
export function readExportTree(root: string): ParsedExportFile[] {
  const out: ParsedExportFile[] = []
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => byCodeUnit(a.name, b.name))) {
      if (entry.name === '.git') continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full)
        continue
      }
      if (!entry.name.endsWith('.md')) continue
      const rel = relative(root, full).split(sep).join('/')
      out.push(parseExportFile(readFileSync(full, 'utf8'), rel))
    }
  }
  try {
    statSync(root)
  } catch {
    return out
  }
  visit(root)
  return out
}
