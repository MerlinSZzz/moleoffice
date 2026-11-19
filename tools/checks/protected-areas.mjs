// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S PROTECTED AREAS AND GENERATED FILES, READ FROM THE ONE FILE THAT DECLARES THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT LIVES AND WHAT IT HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * A project declares them in `.mole-office/protected.json` at its root. Mole Office declares its
 * own there too; nothing about Mole Office is written into the checkers. The file holds:
 *
 *   {
 *     "why": "optional: one sentence for a person reading the file",
 *     "protected": ["design/", "CLAUDE.md", "data/*.db*"],
 *     "generated": [
 *       { "paths": ["design/ground/TEST-AUDIT-2026-09-03.md"],
 *         "command": ["node", "tools/test-audit-table.mjs"],
 *         "why": "optional" }
 *     ]
 *   }
 *
 * `protected` is required and may be empty. A pattern ending in `/` covers everything under that
 * directory. Otherwise the pattern must match the whole path, where `*` matches any run of
 * characters except `/` and `**` matches any run including `/`. Nothing else in a pattern is
 * special. Paths are relative to the project root and use `/`.
 *
 * `generated` is optional. Each entry names files, by exact path, that one command writes, and the
 * command as an argument list (no shell). The git checker runs the command in a scratch copy of the
 * tree under check and compares the named files byte for byte. A path is listed under one command
 * at most. A file is listed here only when the command writes ALL of it: a file only partly
 * generated (like CLAUDE.md, whose chapter block is generated and whose invariants are not) is not
 * a generated file, because regenerating it would pass an authored change as generated output.
 *
 * An entry may also carry `regenerateWhen`: patterns (the same grammar as `protected`) over the
 * paths a change touches. The MERGER (tools/the-merger.mjs, in tools/merge-tool/integrate.mjs), not
 * the checker, reads it: when a change touches a matching path, the merger runs the command on the
 * rebased result and commits the regenerated files on top as its own commit, which is chapter 5
 * rule 4 of the regulations for the audit table (a worker may not write under design/, so the one
 * who merges regenerates). The checker ignores the key: it regenerates only when the change touches a generated file itself.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH COPY OF THE FILE COUNTS
 * ---------------------------------------------------------------------------------------
 *
 * The rules that govern a change are the ones in force before it. So the git checker reads this
 * file from the base commit, not from the change, and the files checker reads it from the main
 * world as it stands. A change that edits this file is judged by the old copy; listing
 * `.mole-office/` under `protected` puts such an edit in front of the inspector.
 *
 * ---------------------------------------------------------------------------------------
 * STRICT, ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * A key this reader does not know, a pattern that is not a relative path, or a path claimed by two
 * commands stops the checker with a sentence naming it (exit 2). A misspelt "protectd" read as
 * "nothing is protected" would be a gate that silently opened.
 */

/** Where a project declares its protected areas, relative to its root. */
export const PROTECTED_AREAS_FILE = '.mole-office/protected.json'

/** Whether a string is a plain relative path: no leading `/`, no `..`, no `.` segment, no backslash. */
export function isRelativePath(text) {
  if (typeof text !== 'string' || text === '' || text.startsWith('/') || text.includes('\\')) return false
  const segments = text.replace(/\/$/u, '').split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** Refuse unknown keys on one object of the file, naming them. */
function onlyKeys(object, allowed, where) {
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unknown.length > 0) {
    throw new Error(`${where} has ${unknown.map((key) => `"${key}"`).join(', ')}, which this reader does not know. It knows ${allowed.join(', ')}.`)
  }
}

/**
 * THE FILE'S TEXT, READ STRICTLY. Throws an Error whose message is the sentence to print.
 *
 * @param {string} text
 * @param {string} where  how to name the file in a sentence, e.g. "main:.mole-office/protected.json"
 * @returns {{ protected: string[], generated: { paths: string[], command: string[], regenerateWhen: string[] }[] }}
 */
export function readProtectedAreas(text, where) {
  let held
  try {
    held = JSON.parse(text)
  } catch (err) {
    throw new Error(`${where} is not JSON: ${err.message}`)
  }
  if (typeof held !== 'object' || held === null || Array.isArray(held)) throw new Error(`${where} is not a JSON object.`)
  onlyKeys(held, ['why', 'protected', 'generated'], where)
  if (held.why !== undefined && typeof held.why !== 'string') throw new Error(`${where}: "why" is not a string.`)
  if (!Array.isArray(held.protected)) throw new Error(`${where} has no "protected" list. Write [] when nothing is protected.`)
  for (const pattern of held.protected) {
    if (!isRelativePath(pattern)) throw new Error(`${where}: the protected pattern ${JSON.stringify(pattern)} is not a relative path.`)
  }
  const generated = held.generated ?? []
  if (!Array.isArray(generated)) throw new Error(`${where}: "generated" is not a list.`)
  const claimedBy = new Map()
  for (const [index, entry] of generated.entries()) {
    const at = `${where}, generated entry ${String(index + 1)}`
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new Error(`${at} is not an object.`)
    onlyKeys(entry, ['why', 'paths', 'command', 'regenerateWhen'], at)
    if (!Array.isArray(entry.paths) || entry.paths.length === 0) throw new Error(`${at} names no paths.`)
    for (const path of entry.paths) {
      if (!isRelativePath(path) || path.endsWith('/') || path.includes('*')) {
        throw new Error(`${at}: ${JSON.stringify(path)} is not the exact relative path of one file.`)
      }
      if (claimedBy.has(path)) throw new Error(`${at}: ${path} is already written by generated entry ${String(claimedBy.get(path))}.`)
      claimedBy.set(path, index + 1)
    }
    if (!Array.isArray(entry.command) || entry.command.length === 0 || !entry.command.every((word) => typeof word === 'string' && word !== '')) {
      throw new Error(`${at}: "command" is not a non-empty list of words.`)
    }
    if (entry.why !== undefined && typeof entry.why !== 'string') throw new Error(`${at}: "why" is not a string.`)
    if (entry.regenerateWhen !== undefined) {
      if (!Array.isArray(entry.regenerateWhen)) throw new Error(`${at}: "regenerateWhen" is not a list of patterns.`)
      for (const pattern of entry.regenerateWhen) {
        if (!isRelativePath(pattern)) throw new Error(`${at}: the regenerateWhen pattern ${JSON.stringify(pattern)} is not a relative path.`)
      }
    }
  }
  return {
    protected: [...held.protected],
    generated: generated.map((entry) => ({ paths: [...entry.paths], command: [...entry.command], regenerateWhen: [...(entry.regenerateWhen ?? [])] })),
  }
}

/** One pattern as a regular expression over a whole relative path. */
function patternToRegExp(pattern) {
  if (pattern.endsWith('/')) {
    return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\*]/gu, '\\$&')}`, 'u')
  }
  const body = pattern
    .split('**')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '[^/]*'))
    .join('.*')
  return new RegExp(`^${body}$`, 'u')
}

/** Whether one pattern, in the grammar above, covers `path`. The one matcher, used by both lists. */
export function pathMatches(pattern, path) {
  return patternToRegExp(pattern).test(path)
}

/** The first protected pattern that covers `path`, or null when none does. */
export function protectingPattern(areas, path) {
  return areas.protected.find((pattern) => pathMatches(pattern, path)) ?? null
}

/** The generated entry that writes `path`, or null when no command writes it. */
export function generatorOf(areas, path) {
  return areas.generated.find((entry) => entry.paths.includes(path)) ?? null
}
