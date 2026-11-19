// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EXPORT'S GRAMMAR, READ: one file into its data regions, and every page under an export's root. It opens no
 * database, so a reader that must not open one can read an export with it. src/server/db/export-verification.ts is one.
 * src/server/lib/export.ts writes the grammar and exports these as before, so its readers are unchanged.
 * design/durability/FORMAT.md §4 is the specification.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
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
 * A line inside a block can never be mistaken for a fence: every value is one JSON value on one
 * line and JSON escapes its newlines, so nothing a value can hold reaches column zero of a new
 * line. That is one of the reasons the grammar has no multi-line form.
 */
export function parseExportFile(text: string, path: string): ParsedExportFile {
  const lines = text.split('\n')
  const regions: ExportRegion[] = []
  let i = 0

  if (lines[0] === '---') {
    const close = lines.indexOf('---', 1)
    if (close === -1) throw new ExportFormatError('the front matter is opened with --- and never closed.', path, 1)
    const fields = readFields(lines.slice(1, close), path, 2)
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
    regions.push({ name, kind: 'fields', line: 1, fields, json: undefined })
    i = close + 1
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence === null) {
      i += 1
      continue
    }
    const isJson = fence[1] !== undefined
    const name = fence[2] ?? ''
    const open = i
    let close = -1
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[j] === '```') {
        close = j
        break
      }
    }
    if (close === -1) {
      throw new ExportFormatError(`the block \`mole-office ${name}\` is opened and never closed.`, path, open + 1)
    }
    const body = lines.slice(open + 1, close)
    if (isJson) {
      let parsed: unknown
      try {
        parsed = JSON.parse(body.join('\n')) as unknown
      } catch (err) {
        throw new ExportFormatError(
          `the JSON block \`${name}\` does not parse: ${(err as Error).message}`,
          path,
          open + 1,
        )
      }
      regions.push({ name, kind: 'json', line: open + 1, fields: {}, json: parsed })
    } else {
      regions.push({
        name,
        kind: 'fields',
        line: open + 1,
        fields: readFields(body, path, open + 2),
        json: undefined,
      })
    }
    i = close + 1
  }

  return { path, regions }
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
