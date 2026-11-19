// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A COMMITTED MUTATION MARKER SITS IN THE TREE, FOUND BY READING THE SOURCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * A proof by mutation works by breaking the product on purpose, watching a test go red, and
 * putting the break back. The regulations say the three runs of a proof are control, mutation,
 * restore, and chapter 5 of CODE.md says a test that would pass with its feature deleted is not a
 * test. The danger is the third run being forgotten: the mutation stays in the source, the test
 * that catches it is committed red, and the tool that was mutated goes on reporting success.
 *
 * That is not hypothetical. Commit e1acb647 of 11 September 2026 deleted `writeFileSync(document,
 * out)` from `tools/test-audit-table.mjs`, left the comment
 *
 *     // MUTATION 3 FOR DEFECT 1: writeFileSync(document, out) removed — the default path must write.
 *
 * beside the deletion, and committed all of it. For thirty hours the tool printed "Wrote 16
 * regions" and wrote nothing (problem `Pp4cqm7LcnAH`). Nothing in the tree refused the commit.
 *
 * This module was first the reader behind the test that the tree carries no applied mutation,
 * deleted on 12 November 2026. It walks
 * `src/` and `tools/` — the tree the product and its tools are built from, not `tests/`, not
 * `design/`, not `node_modules` — and reports every line that is a mutation marker. It is shared
 * rather than written inside a test so a commit check or a merge check can read the same tree
 * the same way.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A MARKER IS, EXACTLY
 * ---------------------------------------------------------------------------------------
 *
 * A marker is a comment whose text is any of these:
 *
 *   1. its first word is `MUTATION` or `MUTATED` in capitals (so `// MUTATION: ...` is one, and
 *      `// MutationObserver` is not);
 *   2. it matches `/\bMUTATION\s+\d+\b/` — an uppercase MUTATION, whitespace, a number;
 *   3. it matches `/\bMUTATION\s+FOR\b/i`;
 *   4. it says `mutation applied` or `applied mutation`, in any case.
 *
 * The definition is deliberately narrow. The word "mutation" appears about 121 times under `src/`
 * and `tools/` today, and almost all of it is innocent: `MutationObserver` is a browser API,
 * `permutation` is a claim about order, and "proved by mutation", "the plan's named mutation" and
 * "THE MUTATION THIS SHAPE EXISTS TO SURVIVE" are comments describing a proof. None of those has
 * `MUTATION` or `MUTATED` as its first word, a number after an uppercase `MUTATION`, or the words
 * "mutation applied". A worker leaves a marker by starting a comment with the word, by numbering
 * the mutation as `MUTATION 3`, or by naming the act. It does not leave one by describing proofs
 * in ordinary prose, and this reader must not cry wolf at ordinary prose: a guard that fires on a
 * legitimate line is a guard people learn to ignore.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS READER CANNOT SEE, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * 1. A mutation marker written with no `//`, `#`, `/*` or `*`, or one reworded so that none of the
 *    four forms matches. It reads a marker someone wrote down; it does not look at the change.
 * 2. A mutation that was restored silently but whose comment was left behind is caught — that is
 *    the point — but a deletion with no comment at all is invisible. The flow's own fallback for
 *    that is a merger reading the diff by hand.
 * 3. It reads text, not a syntax tree, for the reason `tests/sentences.ts` gives: the TypeScript
 *    package here ships a compiler binary and no JavaScript parser API. A `//` inside a
 *    multi-line template literal, or a `#` inside a string, is treated as the start of a comment,
 *    so a marker-shaped phrase in a template literal could be reported. The marker patterns are
 *    specific enough that this has not happened; a false positive names the file and line and is
 *    read before it is believed.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT BY HAND
 * ---------------------------------------------------------------------------------------
 *
 *     npx tsx tests/applied-mutations.ts
 *
 * It prints every marker it finds and exits 1 when there is one, so a merger can run the same
 * reader the test runs without starting the suite.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One line that is a mutation marker, named the way a person finds it again. */
export interface MutationMarker {
  /** The file, relative to the root that was walked, with forward slashes. */
  file: string
  /** The line number, counting from 1. */
  line: number
  /** The whole line as it is written, without the newline. */
  text: string
}

/** The folders the product and its tools are built from, and the only ones this reader walks. */
export const THE_SCANNED_FOLDERS = ['src', 'tools', 'for-agents'] as const

/**
 * A comment opener this reader understands. `*` is not here: a line that starts with `*` is inside
 * a block comment this reader is already tracking, and `/*` set that state off.
 */
const OPENERS = ['//', '/*'] as const

/**
 * Is this comment text a mutation marker? The four forms are documented at the top of this file.
 *
 * Leading whitespace and leading `*` are removed first, so a JSDoc continuation line and a
 * one-line block comment that starts with a further `*` are read the same way as a `//` comment.
 */
export function isMutationMarker(comment: string): boolean {
  const text = comment.replace(/^[\s*]+/, '').trim()
  if (text === '') return false
  const firstWord = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text)?.[0] ?? ''
  if (firstWord === 'MUTATION' || firstWord === 'MUTATED') return true
  if (/\bMUTATION\s+\d+\b/.test(text)) return true
  if (/\bMUTATION\s+FOR\b/i.test(text)) return true
  if (/\bmutation applied\b/i.test(text)) return true
  if (/\bapplied mutation\b/i.test(text)) return true
  return false
}

/**
 * Where the comment on this line starts, skipping anything inside a quoted run. Returns the index
 * of the opener and the opener itself, or null when the line carries no comment.
 *
 * A `#` counts as a comment opener only at the start of the line or after whitespace, so the
 * private-name syntax `#field` in TypeScript is not mistaken for a comment. Python and shell
 * tools under `tools/` use `#` properly and are read.
 */
function commentStart(line: string): { index: number; opener: string } | null {
  let quote: string | null = null
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '/' && line[i + 1] === '*') return { index: i, opener: '/*' }
    if (ch === '/' && line[i + 1] === '/') return { index: i, opener: '//' }
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1] ?? ''))) return { index: i, opener: '#' }
  }
  return null
}

/**
 * Every line number in this text that is a mutation marker. It tracks block comments across
 * lines, so a marker on the third line of a `/* ... *​/` block is found, and a marker after code on
 * a `//` line is found.
 */
export function markerLinesInText(text: string): number[] {
  const lines = text.split(/\r?\n/)
  const found: number[] = []
  let inBlock = false
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (inBlock) {
      const end = line.indexOf('*/')
      const body = end === -1 ? line : line.slice(0, end)
      if (isMutationMarker(body)) found.push(i + 1)
      if (end !== -1) inBlock = false
      continue
    }
    const start = commentStart(line)
    if (start === null) continue
    const after = line.slice(start.index + start.opener.length)
    if (start.opener === '/*') {
      const end = after.indexOf('*/')
      const body = end === -1 ? after : after.slice(0, end)
      if (isMutationMarker(body)) found.push(i + 1)
      if (end === -1) inBlock = true
    } else if (isMutationMarker(after)) {
      found.push(i + 1)
    }
  }
  return found
}

/**
 * Every file under the named folders, as paths relative to `root`, sorted. A folder that does not
 * exist is skipped rather than treated as an error: the caller named what to walk, and there is
 * nothing under a folder that is not there.
 */
export function treeFiles(root: string, folders: readonly string[] = THE_SCANNED_FOLDERS): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (statSync(full).isFile()) out.push(relative(root, full).split('\\').join('/'))
    }
  }
  for (const folder of folders) {
    const full = resolve(root, folder)
    try {
      if (statSync(full).isDirectory()) walk(full)
    } catch {
      // The folder is not there. Nothing to walk is not an error for a named folder.
    }
  }
  return out.sort()
}

/**
 * Every mutation marker under the named folders of `root`. The test calls this on the real
 * checkout; its second case calls it on a scratch tree it built itself.
 */
export function readMutationMarkers(
  root: string,
  folders: readonly string[] = THE_SCANNED_FOLDERS,
): MutationMarker[] {
  const found: MutationMarker[] = []
  for (const file of treeFiles(root, folders)) {
    const text = readFileSync(join(root, file), 'utf8')
    for (const line of markerLinesInText(text)) {
      found.push({ file, line, text: (text.split(/\r?\n/)[line - 1] ?? '').trimEnd() })
    }
  }
  return found
}

/** Run by hand: print every marker and exit 1 when there is one. */
function main(): void {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const markers = readMutationMarkers(root)
  if (markers.length === 0) {
    console.log(`No mutation marker under ${THE_SCANNED_FOLDERS.join('/ and ')}/.`)
    return
  }
  console.error(`${markers.length} mutation marker${markers.length === 1 ? '' : 's'} found:`)
  for (const marker of markers) console.error(`  ${marker.file}:${marker.line} — ${marker.text}`)
  process.exitCode = 1
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
