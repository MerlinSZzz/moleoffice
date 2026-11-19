// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PATH RULE, IN THE LAYER BOTH THE BROWSER AND THE SERVER REACH.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN HERE
 * ---------------------------------------------------------------------------------------
 *
 * Three pure string functions and nothing else:
 *
 *   claimProblem(pattern)          why a pattern can never match, before any file list is consulted
 *   globToRegExp(pattern)          a pattern as a regular expression over repository-relative paths
 *   filesMatching(pattern, paths)  the files one pattern matches
 *
 * They came out of `src/server/lib/sourceindex.ts`, where they were module-private and where the
 * only reader was the module-claims resolver. Their bodies are unchanged, character for character,
 * and `tests/one-path-rule.test.ts` pins that by running the cases the old tests ran.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY MOVED BEFORE THERE WERE TWO CALLERS, WHICH IS THE OPPOSITE OF THE USUAL ADVICE
 * ---------------------------------------------------------------------------------------
 *
 * The usual advice is to leave a thing where it is until a second caller asks for it. That advice
 * is about ABSTRACTIONS — a shape invented for one caller and bent for the second. This is not
 * one: it is an existing rule, already written down, about to be asked the same question by the
 * implementation map (which resolves a stated pattern to the files it covers now) and by the work
 * domain (which resolves a declared scope into paths). The failure this avoids is the one this
 * repository keeps producing and names in CLAUDE.md: one fact worked out in two places. Two
 * matchers that agree today and disagree in six months about whether `src/web` covers
 * `src/webhooks.ts` would hand a file an owner who has never heard of it, and nothing on any page
 * would look wrong.
 *
 * So the second caller is written against this file rather than against a copy of it, and the
 * moment there is a disagreement it is a failing test rather than two screens.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `src/shared` AND NOT `src/server/lib`
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared` is the layer with no imports from either side — no `node:` modules, no DOM. All
 * three functions are string in, string or list out, so they cost nothing to put here, and a
 * browser that wants to say "this pattern covers 4 of the files you are looking at" can ask the
 * same question the server asks rather than a similar one.
 */

/**
 * THE FOUR REASONS A CLAIMED PATH CAN NEVER MATCH, as codes the source index sends and the page
 * reads as the words `server.<code>` in its language. They are reasons inside a reply, not
 * refusals, so they are not in REFUSAL_CODES (src/shared/refusal-codes.ts), whose every code a
 * door sends as a refusal.
 */
export const CLAIM_PROBLEM_CODES = ['sourceClaimBlank', 'sourceClaimAbsolute', 'sourceClaimBackslash', 'sourceClaimClimbsOut'] as const
export type ClaimProblemCode = (typeof CLAIM_PROBLEM_CODES)[number]

/** A literal string, safe to drop into a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Which of the fixed reasons a claim can never match, or null when the pattern is fine.
 *
 * `claimProblem(pattern)` keeps the reason for callers that need it, and `claimProblemCode` gives
 * the source index a stable code to send with that reason. The page draws the reason in the
 * reader's language from the words server.<code>. The four conditions still live here so the server does not
 * build a second list of them.
 */
export function claimProblemCode(pattern: string): ClaimProblemCode | null {
  if (pattern.trim() === '') return 'sourceClaimBlank'
  if (pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern)) return 'sourceClaimAbsolute'
  if (pattern.includes('\\')) return 'sourceClaimBackslash'
  if (pattern.split('/').includes('..')) return 'sourceClaimClimbsOut'
  return null
}

const CLAIM_PROBLEM_TEXT: Readonly<Record<ClaimProblemCode, string>> = {
  sourceClaimBlank: 'is blank, so it names nothing',
  sourceClaimAbsolute:
    'is an absolute path. Claims are written relative to the repository root — "src/web/components" rather than ' +
    'the full path. An absolute path belongs in `paths`, which points at material outside this repository.',
  sourceClaimBackslash: 'uses a backslash; paths in the index always use "/"',
  sourceClaimClimbsOut: 'climbs out of the repository with "..", which the index does not cover',
}

/**
 * Why a claim can never match, before the index is even consulted, in one English sentence.
 *
 * Worth separating from "matched nothing", because it is a different problem with a different
 * fix: a stale claim means the code moved, an absolute path means the claim was written as if it
 * were a PathRef and no rebuild will ever make it resolve.
 */
export function claimProblem(pattern: string): string | null {
  const code = claimProblemCode(pattern)
  return code === null ? null : CLAIM_PROBLEM_TEXT[code]
}

/**
 * A claim as a regular expression over repository-relative paths.
 *
 * One star stays inside a segment; two stars cross them. `**` written as a whole segment matches
 * any number of directories INCLUDING NONE, so a pattern of src, slash, two stars, slash,
 * star-dot-tsx finds both src/App.tsx and src/web/pages/HomePage.tsx — the zero-directory case is
 * the one people are surprised to lose.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = ''
  let i = 0
  while (i < pattern.length) {
    const char = pattern[i]
    if (char === undefined) break
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?'
          i += 3
          continue
        }
        out += '.*'
        i += 2
        continue
      }
      out += '[^/]*'
      i += 1
      continue
    }
    if (char === '?') {
      out += '[^/]'
      i += 1
      continue
    }
    out += escapeRegExp(char)
    i += 1
  }
  return new RegExp(`^${out}$`)
}

/**
 * The files one claim matches.
 *
 * A claim with no wildcard is a path: it matches that file, and — when it names a directory —
 * every file under it. Whole segments only, so "src/web" claims "src/web/App.tsx" and does NOT
 * claim "src/webhooks.ts"; that near miss would hand a file an owner who has never heard of it,
 * and nothing on any page would look wrong.
 */
export function filesMatching(pattern: string, paths: readonly string[]): string[] {
  const cleaned = pattern.trim().replace(/^\.\//, '').replace(/\/+$/, '')
  if (cleaned === '') return []
  if (!/[*?]/.test(cleaned)) {
    const prefix = `${cleaned}/`
    return paths.filter((path) => path === cleaned || path.startsWith(prefix))
  }
  const re = globToRegExp(cleaned)
  return paths.filter((path) => re.test(path))
}

/**
 * DOES ONE WRITTEN ENTRY COVER ANOTHER? `yes`, `no`, or `unknown` — and never `no` for `unknown`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS COMPARES TWO WRITTEN ENTRIES AND NOT TWO FILE LISTS
 * ---------------------------------------------------------------------------------------
 *
 * A work domain that writes `src/web` covers about two hundred files. Intersecting expanded lists
 * would be expensive, and it would stop working the moment there is no index — which is the state
 * of the owner's other project today. So an overlap is computed between ENTRIES.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH PATTERNS IS ALWAYS `unknown`, AND THAT IS A DECISION WITH A COST
 * ---------------------------------------------------------------------------------------
 *
 * Two patterns are not compared by cleverness and they are not compared by expansion either. An
 * earlier draft of the design said *yes when the index is present and their matched sets intersect*
 * — but reaching a matched set means handing this function the current index, which costs two things
 * at once: it stops being pure and stops belonging in this file, and a comparison that depends on
 * the index AT READ TIME defeats the freeze that makes two agents see the same overlap whenever
 * either of them looks. `unknown` is the cautious answer and it is not `no`, so nothing is quietly
 * reported as safe.
 *
 * A DIFFERENT OR UNKNOWN REPOSITORY IS ALSO `unknown`, never `no`. A pair reported as *no overlap*
 * when the truth is *nobody could look* is the failure the whole read exists to prevent.
 */
export function pathCovers(
  a: { repository?: string | undefined; path?: string | undefined; asWritten: string },
  b: { repository?: string | undefined; path?: string | undefined; asWritten: string },
): 'yes' | 'no' | 'unknown' {
  const left = (a.path ?? '').trim()
  const right = (b.path ?? '').trim()
  // Neither resolved to a path, so there is nothing to compare but two strings somebody typed.
  if (left === '' || right === '') return 'unknown'
  // An opaque key, compared for equality and never resolved. Both absent is one repository.
  if ((a.repository ?? null) !== (b.repository ?? null)) return 'unknown'

  const leftIsPattern = /[*?]/.test(left)
  const rightIsPattern = /[*?]/.test(right)
  if (leftIsPattern && rightIsPattern) return 'unknown'

  const tidy = (p: string): string => p.trim().replace(/^\.\//, '').replace(/\/+$/, '')
  const x = tidy(left)
  const y = tidy(right)
  if (x === y) return 'yes'
  if (leftIsPattern) return filesMatching(x, [y]).length > 0 ? 'yes' : 'no'
  if (rightIsPattern) return filesMatching(y, [x]).length > 0 ? 'yes' : 'no'
  // A plain path naming a directory covers what is under it, WHOLE SEGMENTS ONLY: `src/web` covers
  // `src/web/App.tsx` and does not cover `src/webhooks.ts`. That near miss is the one this whole
  // file exists to get right in one place.
  return y.startsWith(`${x}/`) ? 'yes' : 'no'
}
