// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GOVERNS FIELD IS NAMED IN ONE PLACE.
 *
 * A decision names the records it governs in one field. src/shared/governs.ts exports the field's name as
 * `GOVERNS_FIELD = 'governs'`, and the code that reads the field spells the same name out for itself. If one spelling
 * changed and the others did not, the server's governs check and the shared readers would read different fields, and
 * nothing would fail.
 *
 * WHAT IT READS. Every .ts, .tsx, .mjs and .js file under src, as text, and the decision kind's declared fields through
 * `KIND_SPECS`. The field's name is read from the code and never copied: the test imports `GOVERNS_FIELD`.
 *
 * HOW IT TELLS A STRING FROM A COMMENT. Each file is split into its pieces by `piecesOf` in tests/sentences.ts. A piece
 * says whether it is a 'comment' or a 'string', and only a string piece whose body is exactly the name counts. So a
 * comment that names the field is not found.
 *
 * WHAT IT DOES NOT SEE. An object key written without quotes, such as `governs:` in an object literal, and a property
 * read such as `.governs`.
 *
 * A string that holds `data.` and the name as a path is found too, so an error path names the field through
 * `GOVERNS_FIELD`, as `` `data.${GOVERNS_FIELD}[${at}]` `` does.
 *
 * WHEN IT WAS WRITTEN, at 5f1c16ef5, it found nine places, each of which now reads the name from `GOVERNS_FIELD`:
 *   src/server/lib/assert-the-governed-places-are-real.ts:26
 *   src/server/lib/governs.ts:265
 *   src/server/lib/governs.ts:400
 *   src/server/lib/governs.ts:472
 *   src/server/lib/governs.ts:491
 *   src/server/lib/records/patching.ts:3711
 *   src/server/lib/what-a-record-names.ts:41
 *   src/shared/kinds/cross-checks.ts:324
 *   src/shared/kinds/decision.ts:274
 *
 * When it was widened, at 7d492179d, the tree case found seven more places, each listed as `src/<path>:<line>`:
 *   src/server/lib/assert-the-governed-places-are-real.ts:49
 *   src/shared/kinds/cross-checks.ts:121
 *   src/shared/kinds/cross-checks.ts:123
 *   src/shared/kinds/cross-checks.ts:130
 *   src/shared/kinds/cross-checks.ts:131
 *   src/shared/kinds/cross-checks.ts:136
 *   src/shared/kinds/cross-checks.ts:139
 *
 * The short sources in the first cases are made up. The test starts nothing and writes nothing.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { GOVERNS_FIELD } from '../src/shared/governs.ts'
import { KIND_SPECS } from '../src/shared/kinds.ts'

import { lineAt, piecesOf } from './sentences.ts'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** The one file that declares the name. Every other file reads it from there. */
const THE_DECLARATION = join('shared', 'governs.ts')

/** Every source file under src, as a path under src. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(ts|tsx|mjs|js)$/.test(entry)) out.push(relative(SRC, full))
  }
  return out.sort()
}

/** `data.` and the name, as a path written by hand: not followed by a letter, a digit or an underscore. */
const A_PATH_TO_THE_FIELD = new RegExp(`\\bdata\\.${GOVERNS_FIELD}(?!\\w)`)

/** The lines of `source`, counted from 1, where a string piece is exactly the field's name, or holds a path to it. */
function fieldLines(source: string): number[] {
  return piecesOf(source)
    .filter((piece) => piece.what === 'string' && (piece.body === GOVERNS_FIELD || A_PATH_TO_THE_FIELD.test(piece.body)))
    .map((piece) => lineAt(source, piece.at))
}

describe('the search tells a string from a comment', () => {
  it('finds the name written with either quote, as a bare template literal, and inside a path written by hand', () => {
    // Made up.
    const source = [
      `const a = '${GOVERNS_FIELD}'`,
      `const b = "${GOVERNS_FIELD}"`,
      `const c = \`${GOVERNS_FIELD}\``,
      'const path = `data.' + GOVERNS_FIELD + '[${at}]`',
      'const said = "data.' + GOVERNS_FIELD + ' names nothing"',
    ].join('\n')
    expect(fieldLines(source)).toEqual([1, 2, 3, 4, 5])
  })

  it('does not find a comment, a longer name, or a path that reads the name from GOVERNS_FIELD', () => {
    // Made up.
    const source = [
      `// the '${GOVERNS_FIELD}' field`,
      `/* "${GOVERNS_FIELD}" */`,
      'const at = 0',
      'const path = `data.${GOVERNS_FIELD}[${at}]`',
      'const files = `data.' + GOVERNS_FIELD + 'Files`',
      `const files = '${GOVERNS_FIELD}Files'`,
    ].join('\n')
    expect(fieldLines(source)).toEqual([])
  })
})

describe('the source tree', () => {
  it('is read file by file, and holds the declaration', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(0)
    expect(files).toContain(THE_DECLARATION)
  })

  it('spells the field out nowhere except where it is declared', () => {
    const found = sourceFiles()
      .filter((file) => file !== THE_DECLARATION)
      .flatMap((file) => fieldLines(readFileSync(join(SRC, file), 'utf8')).map((line) => `src/${file}:${String(line)}`))
    expect(
      found,
      `Read the governs field through GOVERNS_FIELD from src/shared/governs.ts, so one spelling serves every reader. Places that spell it out: ${found.join(', ')}`,
    ).toEqual([])
  })
})

describe('the decision kind', () => {
  it('declares the field under the name the readers use', () => {
    const declared = KIND_SPECS.decision.fields.filter((field) => field.key === GOVERNS_FIELD)
    expect(declared.map((field) => field.key)).toEqual([GOVERNS_FIELD])
  })
})
