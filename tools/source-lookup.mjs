#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE IS X: ASK THE SOURCE INDEX FIRST, AND SEARCH THE REPOSITORY ONLY WHEN IT HAS NO CURRENT ANSWER.
 *
 *     node tools/source-lookup.mjs <name>... [--checkout <dir>] [--limit <n>] [-- <path>...]
 *
 * Each <name> is a file name with or without its extension, a path end such as "api/source.ts", an
 * exported name, or a module's title or id; one step may name several. The tool asks GET
 * /api/source/where once for each name, as the run (the office variables the runner sets, through
 * tools/office-request.mjs), and checks every path it is given in the checkout: the git checkout of the
 * current folder unless --checkout names another.
 *
 * A path the checkout has is answered with the first line that names X, and X is not searched. A path
 * the index lists that the checkout does not have, or an exported name its file no longer mentions, is
 * printed as stale and is never answered as current. The names with no current answer left are said in
 * one line for the whole step, and only then each is searched with `git grep -c -I -F`: only the paths
 * given after "--", taken from the checkout's top folder, or the whole checkout, said, when none is
 * given. It prints each file with how many of its lines name X, never the lines, at most 40 files for
 * each name, and counts the rest. A path that names no file git tracks in the checkout stops the
 * search, and is said. An office that cannot answer (an older one without the door, or none at all), or
 * an answer longer than the tool reads, is said in the same line, is asked nothing more, and every name
 * not answered is searched.
 *
 * Exit codes: 0 answered, by the index or by the search; 1 a name the index had no current answer for
 * was found nowhere by the search either; 2 the command was not usable; 3 the search could not run.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { askTheOffice, THE_LONGEST_REPLY } from './office-request.mjs'

/** How many files of the search are printed; the rest are counted. */
export const THE_MOST_FILES_SHOWN = 40

const USAGE = 'Usage: node tools/source-lookup.mjs <name>... [--checkout <dir>] [--limit <1 to 100>] [-- <path>...]'

/**
 * The default search: `git grep -c -I -F -e <name> -- <paths>` in the checkout, the first 40 files with how many
 * of their lines name the name, and a count of the rest. Every path must name a file git tracks in the checkout,
 * since git grep would search a mistyped one and find nothing without a word. Throws when git cannot run the
 * search, or a path names nothing, with git's own words.
 * @param {string} name @param {string} checkout @param {string[]} paths
 * @returns {{ files: { path: string, count: number }[], left: number }}
 */
export function gitGrepSearch(name, checkout, paths) {
  const options = { cwd: checkout, encoding: /** @type {const} */ ('utf8'), maxBuffer: 256 * 1024 * 1024 }
  if (paths.length > 0) {
    const known = spawnSync('git', ['ls-files', '--error-unmatch', '--', ...paths], options)
    if (known.error !== undefined) throw known.error
    if (known.status !== 0) throw new Error(`git ls-files exited ${String(known.status)}: ${known.stderr.trim()}`)
  }
  const ran = spawnSync('git', ['grep', '--no-color', '-c', '-z', '-I', '-F', '-e', name, '--', ...paths], options)
  if (ran.error !== undefined) throw ran.error
  // git grep exits 1 when nothing matched, and above 1 when it could not search.
  if (ran.status === 1 && ran.stdout === '') return { files: [], left: 0 }
  if (ran.status !== 0) throw new Error(`git grep exited ${String(ran.status)}: ${ran.stderr.trim()}`)
  // With -z each line is the path, a NUL and the count, so a path with a colon in it is read whole.
  const all = ran.stdout.split('\n').filter((line) => line !== '').map((line) => {
    const at = line.lastIndexOf('\u0000')
    return { path: line.slice(0, at), count: Number(line.slice(at + 1)) }
  })
  return { files: all.slice(0, THE_MOST_FILES_SHOWN), left: Math.max(0, all.length - THE_MOST_FILES_SHOWN) }
}

/** Where the search looks, in words: the paths given, the first five named, or the whole checkout. @param {string[]} paths */
function theSearched(paths) {
  if (paths.length === 0) return 'the whole checkout, as no path was given,'
  if (paths.length <= 5) return paths.join(', ')
  return `${paths.slice(0, 5).join(', ')} and ${String(paths.length - 5)} more paths`
}

/** Names in quotes, joined as a sentence joins them: "a"; "a" and "b"; "a", "b" and "c". @param {string[]} names */
function quoteList(names) {
  const quoted = names.map((name) => `"${name}"`)
  return quoted.length <= 1 ? quoted.join('') : `${quoted.slice(0, -1).join(', ')} and ${String(quoted.at(-1))}`
}

/**
 * The door's answer, read as a lookup, or null when it is not one.
 * @param {string} body
 */
function readLookup(body) {
  let json
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  if (json === null || typeof json !== 'object') return null
  const isFile = (/** @type {any} */ f) =>
    f !== null && typeof f === 'object' && typeof f.path === 'string' && (f.repository === null || typeof f.repository?.name === 'string')
  const ok =
    typeof json.index?.builtAt === 'string' &&
    typeof json.answered === 'boolean' &&
    typeof json.left === 'number' &&
    (json.noAnswer === null || typeof json.noAnswer === 'string') &&
    Array.isArray(json.notRead) &&
    Array.isArray(json.files) &&
    json.files.every((/** @type {any} */ f) => isFile(f) && Array.isArray(f.matchedBy) && Array.isArray(f.modules)) &&
    Array.isArray(json.modules) &&
    json.modules.every(
      (/** @type {any} */ m) =>
        typeof m?.title === 'string' && Array.isArray(m.files) && m.files.every(isFile) && Array.isArray(m.staleClaims) && typeof m.filesLeft === 'number',
    )
  return ok ? json : null
}

/**
 * Ask the office once. Answers the lookup, or why there is none, in words.
 * @param {string} name @param {number} limit @param {NodeJS.ProcessEnv} env @param {typeof fetch} fetchImpl
 */
async function askTheIndex(name, limit, env, fetchImpl) {
  const path = `/api/source/where?name=${encodeURIComponent(name)}&limit=${String(limit)}`
  let answer
  try {
    answer = await askTheOffice({ method: 'GET', path }, { fetchImpl, env })
  } catch (error) {
    return { lookup: null, why: `The office could not be asked: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (answer.status !== 200) {
    let said = answer.body.slice(0, 400)
    try {
      const error = JSON.parse(answer.body)?.error
      if (typeof error === 'string') said = error
    } catch {
      // Not JSON: the start of the body is quoted as it came.
    }
    return { lookup: null, why: `The office answered ${String(answer.status)}: ${said}` }
  }
  // A cut answer is not read: the files it lists might stop at the cut.
  if (answer.cut) return { lookup: null, why: `The office's answer was longer than the ${String(THE_LONGEST_REPLY)} characters this tool reads, so it was not read.` }
  const lookup = readLookup(answer.body)
  if (lookup === null) return { lookup: null, why: 'The office answered 200, but its answer could not be read as a source lookup.' }
  return { lookup, why: null }
}

/**
 * The first line of a file that names the name, counted from 1; null when none does; undefined when the
 * file is not in the checkout.
 * @param {string} checkout @param {string} path @param {string} name
 */
function firstMention(checkout, path, name) {
  const where = join(checkout, path)
  try {
    if (!statSync(where).isFile()) return undefined
  } catch {
    return undefined
  }
  const at = readFileSync(where, 'utf8').split('\n').findIndex((line) => line.includes(name))
  return at === -1 ? null : at + 1
}

/** @param {{ name: string } | null} repository */
const inRepository = (repository) => (repository === null ? '' : ` in "${repository.name}"`)

/**
 * Look each name up in the source index, check what it gives in the checkout, and search only the names
 * with no current answer left, said first in one line for all of them.
 * @param {{
 *   names: string[],
 *   checkout: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 *   search?: (name: string, checkout: string, paths: string[]) => { files: { path: string, count: number }[], left: number },
 *   limit?: number,
 *   paths?: string[],
 * }} options
 */
export async function lookUpBeforeSearching({ names, checkout, env = process.env, fetchImpl = fetch, search = gitGrepSearch, limit = 20, paths = [] }) {
  /** @type {string[]} */
  const out = []
  /** @type {{ name: string, path: string, line: number | null, repository: { name: string } | null }[]} */
  const current = []
  /** @type {{ name: string, path: string, repository: { name: string } | null, why: string }[]} */
  const stale = []
  /** The names with no current answer, in the order given. @type {string[]} */
  const unanswered = []
  /** The scans the index answered those names from. @type {Set<string>} */
  const scans = new Set()
  /** Why the office could not answer, and for which name, once it could not. @type {{ name: string, why: string } | null} */
  let failed = null
  /** @type {string[]} */
  const notAsked = []

  for (const name of names) {
    if (failed !== null) {
      notAsked.push(name)
      unanswered.push(name)
      continue
    }
    const { lookup, why } = await askTheIndex(name, limit, env, fetchImpl)
    if (lookup === null) {
      failed = { name, why: String(why) }
      unanswered.push(name)
      continue
    }
    const builtAt = lookup.index.builtAt
    const seen = new Set()
    let answered = false
    /**
     * @param {{ path: string, repository: { name: string } | null }} file
     * @param {boolean} mustMention an exported name must still be in its file
     * @param {string} said what the line says after the path
     */
    const check = (file, mustMention, said) => {
      const key = `${file.repository?.name ?? ''}\u0000${file.path}`
      if (seen.has(key)) return
      seen.add(key)
      const line = firstMention(checkout, file.path, name)
      if (line === undefined) {
        const one = { name, path: file.path, repository: file.repository, why: `the index of ${builtAt} lists it${inRepository(file.repository)}, and it is not in this checkout` }
        stale.push(one)
        out.push(`  Stale: ${one.path} — ${one.why}.`)
      } else if (line === null && mustMention) {
        const one = { name, path: file.path, repository: file.repository, why: `the index of ${builtAt} lists it as exporting "${name}", and it no longer mentions "${name}"` }
        stale.push(one)
        out.push(`  Stale: ${one.path} — ${one.why}.`)
      } else {
        current.push({ name, path: file.path, line, repository: file.repository })
        answered = true
        out.push(`  ${line === null ? file.path : `${file.path}:${String(line)}`}${inRepository(file.repository)}  ${said}`)
      }
    }

    if (lookup.files.length > 0) out.push(`The source index (scan of ${builtAt}) gives for "${name}":`)
    for (const file of lookup.files) {
      const how = file.matchedBy.join(', ')
      const claimed = file.modules.length === 0
        ? 'claimed by no module'
        : `claimed by ${file.modules.map((/** @type {any} */ m) => `"${m.title}" (${m.pattern})`).join(', ')}`
      check(file, !file.matchedBy.includes('file name') && !file.matchedBy.includes('path end'), `${how}; ${claimed}`)
    }
    if (lookup.left > 0) out.push(`  … and ${String(lookup.left)} more files it matched, not shown or checked (raise --limit).`)
    for (const module of lookup.modules) {
      out.push(`The module "${module.title}" claims ${module.files.length === 0 ? 'no file in the scan' : 'these files'}:`)
      for (const file of module.files) check(file, false, `claimed by "${module.title}"`)
      if (module.filesLeft > 0) out.push(`  … and ${String(module.filesLeft)} more of its files, not shown or checked (raise --limit).`)
      for (const claim of module.staleClaims) {
        out.push(`  Stale claim: ${claim.pattern}${inRepository(claim.repository)} matches no file in the scan of ${builtAt}.`)
      }
      if (module.problem !== null && module.problem !== undefined) out.push(`  Its stated rows were not counted: ${module.problem}`)
    }
    for (const one of lookup.notRead) out.push(String(one.because))
    if (!answered) {
      unanswered.push(name)
      scans.add(builtAt)
    }
  }

  if (unanswered.length === 0) {
    out.push('Nothing was searched.')
    return { exitCode: 0, text: out.join('\n'), current, stale, searched: /** @type {string[]} */ ([]) }
  }

  const scan = scans.size === 0 ? '' : ` in its ${scans.size === 1 ? 'scan' : 'scans'} of ${[...scans].join(' and ')}`
  let said = `The source index has no current answer for ${quoteList(unanswered)}${scan}.`
  if (failed !== null) {
    said += unanswered.length === 1 ? ` ${failed.why}` : ` Asking about "${failed.name}": ${failed.why}`
    if (notAsked.length > 0) said += ` ${quoteList(notAsked)} ${notAsked.length === 1 ? 'was' : 'were'} not asked after that.`
  }
  out.push(said)
  const several = unanswered.length > 1
  out.push(`Searching ${theSearched(paths)} for ${several ? 'each of them' : `"${String(unanswered[0])}"`} (each file, with how many of its lines name it):`)
  /** @type {string[]} */
  const searched = []
  /** @type {string[]} */
  const nowhere = []
  for (const name of unanswered) {
    let found
    try {
      searched.push(name)
      found = search(name, checkout, paths)
    } catch (error) {
      out.push(`The search could not run${several ? ` for "${name}"` : ''}: ${error instanceof Error ? error.message : String(error)}`)
      return { exitCode: 3, text: out.join('\n'), current, stale, searched }
    }
    if (found.files.length === 0) {
      nowhere.push(name)
      continue
    }
    if (several) out.push(`"${name}":`)
    for (const file of found.files) out.push(`  ${file.path} (${String(file.count)} ${file.count === 1 ? 'line' : 'lines'})`)
    if (found.left > 0) out.push(`… and ${String(found.left)} more files not shown.`)
  }
  if (nowhere.length > 0) out.push(several ? `The search found nothing either for ${quoteList(nowhere)}.` : 'The search found nothing either.')
  return { exitCode: nowhere.length > 0 ? 1 : 0, text: out.join('\n'), current, stale, searched }
}

/**
 * The command's words read: one name or several, --checkout and --limit each at most once, and after "--" the paths
 * to search. Answers what it read, or why it refuses.
 * @param {string[]} args
 * @returns {{ names: string[], checkout: string | undefined, limit: number, paths: string[] } | { refused: string }}
 */
export function readTheCommand(args) {
  /** @type {string[]} */
  const names = []
  /** @type {string | undefined} */
  let checkout
  let limit = 20
  /** @type {string[]} */
  let paths = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = /** @type {string} */ (args[i])
    if (arg === '--') {
      paths = args.slice(i + 1)
      if (paths.length === 0) return { refused: 'Name at least one path to search after --, or leave -- out to search the whole checkout.' }
      break
    }
    if (arg === '--checkout' || arg === '--limit') {
      const value = args[i + 1]
      if (value === undefined) return { refused: `${arg} needs a value.` }
      i += 1
      if (arg === '--checkout') checkout = resolve(value)
      else {
        limit = Number(value)
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { refused: `--limit must be a whole number from 1 to 100, not "${value}".` }
      }
    } else if (arg.startsWith('--')) return { refused: `${arg} is not an option of this tool.` }
    else if (arg.trim() === '') return { refused: 'A name to look for is empty.' }
    else names.push(arg.trim())
  }
  if (names.length === 0) return { refused: 'Name what to look for.' }
  return { names, checkout, limit, paths }
}

/** The command. */
async function main() {
  const refuse = (/** @type {string} */ why) => {
    process.stderr.write(`${why}\n${USAGE}\n`)
    process.exit(2)
  }
  const read = readTheCommand(process.argv.slice(2))
  if ('refused' in read) return refuse(read.refused)
  const { names, limit, paths } = read
  let checkout = read.checkout
  if (checkout === undefined) {
    const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' })
    if (top.status !== 0) refuse('This folder is not inside a git checkout, so there is nothing to check the paths in. Name one with --checkout.')
    checkout = top.stdout.trim()
  }
  const result = await lookUpBeforeSearching({ names, checkout, limit, paths })
  process.stdout.write(`${result.text}\n`)
  process.exit(result.exitCode)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
