// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TEST MAY OPEN THE OPERATOR'S REAL DATABASE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * `src/server/db/client.ts` opens its file the moment it is imported, and ES imports are evaluated
 * before any test body runs. So a test file that imports a plain CONSTANT from a module which
 * happens to reach the client opens whatever `.env` names — the operator's real work — with
 * permission to write to it, before `freshDb()` gets the chance to point it at a throwaway file.
 *
 * This is not a worry about what could happen. Four junk records — `small title`, `big title Do
 * this`, `small title 2`, `small title 33` — were written into the real corpus by a test during
 * round seven and had to be deleted by hand. On 18 August 2026, eight of the 241 files in this
 * directory still reached the client this way, and an import shaped like theirs was measured
 * opening the real database with 537 records visible and `readonly` false.
 *
 * `src/server/db/client.ts` now refuses to open an unnamed database under a test runner, which
 * turns that into a loud failure. **This test is the other half**, and it is the useful half: the
 * refusal tells you at the moment a suite runs, and this tells you which file to fix and by what
 * route it got there. A guard that only fires at the end of a chain leaves somebody reading a stack.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS THE IMPORTS AS TEXT
 * ---------------------------------------------------------------------------------------
 *
 * It cannot import the files to find out what they import — importing them is the very thing that
 * would open the database. So it reads the source and follows the graph itself. That is enough for
 * this codebase, which uses plain ES imports throughout and no computed specifiers.
 *
 * TYPE-ONLY IMPORTS ARE NOT FOLLOWED, and that is the whole subtlety. `import type { X } from '…'`
 * is erased before the file runs and opens nothing, so a test may name any module it likes for a
 * type. A VALUE import is the one that costs something. `import { type A, b }` counts as a value
 * import because of `b`; `import { type A }` does not.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TESTS = join(ROOT, 'tests')
/** The one module that opens a database. Everything here is about whether a test can reach it. */
const CLIENT = resolve(ROOT, 'src/server/db/client.ts')

const IMPORT_STATEMENT = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm
/** `import './thing.ts'` for its side effects, which is the most direct way to open something. */
const BARE_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/gm

interface Edge {
  specifier: string
  isValue: boolean
}

/**
 * WHAT ONE FILE IMPORTS, READ ONCE. Measured 8 September 2026: this whole sweep took 5.9 seconds
 * against vitest's default 5-second limit, and the sweep is 872 walks that each re-read the same few
 * hundred files from disk. Remembering what a file imports is the same reading, kept: nothing about
 * what is checked changes, and the sweep is a fraction of a second.
 */
const alreadyRead = new Map<string, Edge[]>()

function importsOf(file: string): Edge[] {
  const held = alreadyRead.get(file)
  if (held !== undefined) return held
  const found = readTheImportsOf(file)
  alreadyRead.set(file, found)
  return found
}

function readTheImportsOf(file: string): Edge[] {
  let source: string
  try {
    source = readFileSync(file, 'utf8')
  } catch {
    // A specifier that names no file on disk is not this test's business: the type checker and the
    // runner both report it, and reporting it twice in different words helps nobody.
    return []
  }
  const edges: Edge[] = []
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const statementIsTypeOnly = match[1] !== undefined
    const clause = match[2] ?? ''
    const specifier = match[3] ?? ''
    let isValue = !statementIsTypeOnly
    if (isValue && clause.trim().startsWith('{')) {
      const names = clause
        .replace(/[{}]/g, '')
        .split(',')
        .map((n) => n.trim())
        .filter((n) => n !== '')
      isValue = names.some((n) => !n.startsWith('type '))
    }
    edges.push({ specifier, isValue })
  }
  for (const match of source.matchAll(BARE_IMPORT)) {
    edges.push({ specifier: match[1] ?? '', isValue: true })
  }
  return edges
}

/** The three aliases `tsconfig.json` declares, plus ordinary relative paths. */
function fileFor(specifier: string, importedFrom: string): string | null {
  if (specifier.startsWith('@shared/')) return resolve(ROOT, 'src/shared', specifier.slice('@shared/'.length))
  if (specifier.startsWith('@server/')) return resolve(ROOT, 'src/server', specifier.slice('@server/'.length))
  if (specifier.startsWith('@web/')) return resolve(ROOT, 'src/web', specifier.slice('@web/'.length))
  if (specifier.startsWith('.')) return resolve(dirname(importedFrom), specifier)
  // A package. It cannot reach this repository's database client.
  return null
}

/**
 * The chain of files from a test to the database client, or null when there is none.
 *
 * It returns the ROUTE and not merely a yes, because the fix is different at each hop: sometimes
 * the constant should move to a module that opens nothing, and sometimes the test should load it
 * with `await import(…)` after `freshDb()`. Somebody who is only told "this file is wrong" has to
 * rediscover the route before they can choose.
 */
function routeToTheDatabase(start: string): string[] | null {
  const seen = new Set<string>()
  const queue: { file: string; route: string[] }[] = [{ file: start, route: [] }]
  while (queue.length > 0) {
    const step = queue.shift()
    if (step === undefined) break
    if (seen.has(step.file)) continue
    seen.add(step.file)
    const here = [...step.route, step.file.replace(`${ROOT}`, '')]
    for (const edge of importsOf(step.file)) {
      if (!edge.isValue) continue
      const target = fileFor(edge.specifier, step.file)
      if (target === null) continue
      if (target === CLIENT) return [...here, '/src/server/db/client.ts']
      queue.push({ file: target, route: here })
    }
  }
  return null
}

describe('no test file opens a database merely by being loaded', () => {
  const files = readdirSync(TESTS)
    .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))
    .sort()

  it('finds the test files at all, so an empty sweep can never read as a pass', () => {
    // A directory that moved would make every check below vacuously true. This is the control.
    expect(files.length).toBeGreaterThan(200)
  })

  it('reaches src/server/db/client.ts from no test file through a value import', () => {
    const offenders = files
      .map((f) => ({ file: f, route: routeToTheDatabase(join(TESTS, f)) }))
      .filter((r): r is { file: string; route: string[] } => r.route !== null)

    const said = offenders
      .map((o) => `\n  ${o.file}\n      ${o.route.join('\n   -> ')}`)
      .join('')

    expect(
      offenders.length,
      `${String(offenders.length)} test file(s) open a database just by being loaded, before any ` +
        `test body runs, so freshDb() cannot point them at a throwaway file first. With MOLE_OFFICE_DB ` +
        `unset that is the file .env names, which is the operator's real work.\n` +
        `Fix each by cutting the first hop of its route: either move the value into a module that ` +
        `opens no database — most of them are re-exported from src/shared — or load it inside the ` +
        `test with await import(...) after freshDb(), which is what tests/helpers.ts is built for.` +
        said,
    ).toBe(0)
  })

  it('would still notice: the walk really does follow a chain more than one hop long', () => {
    // THE MUTATION THIS TEST WOULD OTHERWISE NEED. A walk that only looked at a test's own imports
    // would pass this whole file while missing every real case, because all eight found on 18
    // August 2026 were two or three hops away. So the walker is pointed at a file known to be that
    // far from the client, and has to find it.
    const route = routeToTheDatabase(resolve(ROOT, 'src/server/api/work.ts'))
    expect(route, 'the import walk no longer follows chains, so its zero above means nothing').not.toBeNull()
    expect(route?.length ?? 0).toBeGreaterThan(2)
  })
})
