// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S CONTENT THE GATES REFUSE, READ FROM ONE FILE OUTSIDE THE REPOSITORY. This module is its one reader.
 *
 * The privacy gates refuse the owner's names, the owner's real name, the agent handles of the office this product is
 * built in, the owner's research words, the owner's account, the owner's machine name and the port of the owner's own
 * office. None of those values is written in the repository. The setting MOLE_OFFICE_OWNER_CONTENT_LIST names the file
 * that holds them, by its absolute path, and nothing in the repository names a path for it.
 *
 * - THE SETTING NOT SET, or set empty, is an answer and not a failure: no file was read, so THE_OWNERS_CONTENT holds
 *   `content: null` and `notRead` says why. Each gate still runs the checks that need no names (home folders,
 *   addresses, keys, record ids) and says which named patterns it did not check. A gate never builds a pattern from a
 *   list that was not read, because a pattern of no words matches every line.
 * - THE SETTING SET, and the file missing, unreadable, empty or not in the format below, throws when this module is
 *   imported. The message names the setting and the line, and never the file's path.
 *
 * THE FORMAT. Plain UTF-8, one entry per line. A line `# kind: <kind>` starts the entries of one kind; any other line
 * that starts with `#` is a comment, and a blank line is nothing. An entry may carry flags after ` -- `, separated by
 * `; `. The flag `own sense:` is the last, and its prose runs to the end of the line. Every kind must be there, each
 * with at least one entry, and each kind is named once.
 *
 *   # kind: name              a name of the owner. Flag: `merge gate only`, a name only the merge queue's gate refuses.
 *   # kind: real name         a part of the owner's real name. Flag: `inside longer words`, found inside a longer word too.
 *   # kind: handle            an agent handle. Flag: `merge gate only`.
 *   # kind: research word     a piece of a regular expression that git grep -E also reads. Flags: `inside longer
 *                             words`, and `own sense: <prose>`, the sense in which this product also says the word.
 *   # kind: account name      the name of the owner's account. Exactly one.
 *   # kind: account email     the email address of the owner's account. Exactly one.
 *   # kind: machine           a machine name of the owner.
 *   # kind: port              the port of the owner's own office. Exactly one.
 *
 * A name, a real name, a handle, an account name and a machine are one word of letters, digits, `-` and `_`.
 */
import { readFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { readSetting, readSettingHere } from '../src/config/settings.mjs'

/** The setting that names the file. */
export const THE_OWNERS_CONTENT_SETTING = 'MOLE_OFFICE_OWNER_CONTENT_LIST'

/** A name or a handle, and whether only the merge queue's gate refuses it. */
export type AWord = { readonly word: string; readonly mergeGateOnly: boolean }

/** A part of the real name, and whether it is found inside a longer word too. */
export type APart = { readonly word: string; readonly insideLongerWords: boolean }

/**
 * A research word: a piece of a regular expression. `theProductsOwnSense` is the sense in which this product also says
 * the word, and `insideLongerWords` says the word is found inside a longer word too.
 */
export type AResearchWord = { readonly piece: string; readonly theProductsOwnSense?: string; readonly insideLongerWords?: true }

export type TheOwnersContent = {
  readonly names: readonly AWord[]
  readonly realNameParts: readonly APart[]
  readonly handles: readonly AWord[]
  readonly researchWords: readonly AResearchWord[]
  readonly account: { readonly name: string; readonly email: string }
  readonly machines: readonly string[]
  readonly port: number
}

/** What was read: the content, or why no file was read. */
export type TheReading = { readonly notRead: string; readonly content: null } | { readonly notRead: null; readonly content: TheOwnersContent }

const KINDS = ['name', 'real name', 'handle', 'research word', 'account name', 'account email', 'machine', 'port'] as const
type AKind = (typeof KINDS)[number]

/** The flags each kind may carry. `own sense` takes prose after it. */
const FLAGS: Readonly<Record<AKind, readonly string[]>> = {
  name: ['merge gate only'],
  'real name': ['inside longer words'],
  handle: ['merge gate only'],
  'research word': ['inside longer words', 'own sense'],
  'account name': [],
  'account email': [],
  machine: [],
  port: [],
}

/** The kinds that hold exactly one entry. */
const ONE_ENTRY: readonly AKind[] = ['account name', 'account email', 'port']

const A_WORD = /^[\p{L}\p{N}_-]+$/u

/** A refusal. It names the setting and never the file's path. */
function refused(why: string): Error {
  return new Error(
    `${THE_OWNERS_CONTENT_SETTING} ${why} No gate that refuses the owner's content can run until it is fixed. The file's path is not repeated here.`,
  )
}

/** One entry's value and flags, from the text of its line. */
function theEntry(kind: AKind, text: string, at: number): { value: string; flags: Set<string>; ownSense: string | null } {
  const split = /(?:^|\s)--(?:\s|$)/.exec(text)
  const value = (split === null ? text : text.slice(0, split.index)).trim()
  if (value === '') throw refused(`names a file whose line ${String(at)} has no value before its flags.`)
  const flags = new Set<string>()
  let ownSense: string | null = null
  let rest = split === null ? '' : text.slice(split.index + split[0].length).trim()
  if (split !== null && rest === '') throw refused(`names a file whose line ${String(at)} has \` -- \` and no flag after it.`)
  while (rest !== '') {
    if (rest.startsWith('own sense:')) {
      ownSense = rest.slice('own sense:'.length).trim()
      if (ownSense === '') throw refused(`names a file whose line ${String(at)} has the flag \`own sense:\` with no prose after it.`)
      flags.add('own sense')
      break
    }
    const end = rest.indexOf(';')
    const flag = (end === -1 ? rest : rest.slice(0, end)).trim()
    rest = end === -1 ? '' : rest.slice(end + 1).trim()
    if (!FLAGS[kind].includes(flag) || flag === 'own sense') {
      throw refused(`names a file whose line ${String(at)} has the flag "${flag}", which the kind "${kind}" does not take.`)
    }
    flags.add(flag)
  }
  if (flags.has('own sense') && !FLAGS[kind].includes('own sense')) {
    throw refused(`names a file whose line ${String(at)} has the flag \`own sense:\`, which the kind "${kind}" does not take.`)
  }
  return { value, flags, ownSense }
}

/** Why one entry's value is not of its kind, or null when it is. */
function whatIsWrongWith(kind: AKind, value: string): string | null {
  if (kind === 'research word') {
    let whole: RegExp
    try {
      new RegExp(value)
      whole = new RegExp(`^(?:${value})$`)
    } catch {
      return 'is not a regular expression'
    }
    return whole.test('') ? 'matches no text at all, and so would match every line' : null
  }
  if (kind === 'account email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'is not an email address'
  if (kind === 'port') {
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535 ? null : 'is not a port number'
  }
  return A_WORD.test(value) ? null : 'is not one word of letters, digits, - and _'
}

/**
 * THE CONTENT IN ONE FILE'S TEXT, in the format the header gives. Anything that is not that format throws, naming the
 * setting and the line.
 */
export function theOwnersContentIn(text: string): TheOwnersContent {
  if (text.trim() === '') throw refused('names an empty file.')
  const entries = new Map<AKind, { value: string; flags: Set<string>; ownSense: string | null }[]>()
  const namedAt = new Map<AKind, number>()
  let kind: AKind | null = null
  text.split(/\r?\n/).forEach((line, index) => {
    const at = index + 1
    const trimmed = line.trim()
    if (trimmed === '') return
    const header = /^#\s*kind:\s*(.*)$/.exec(trimmed)
    if (header !== null) {
      const named = (header[1] ?? '').trim()
      if (!(KINDS as readonly string[]).includes(named)) {
        throw refused(`names a file whose line ${String(at)} names the kind "${named}", which is not one of: ${KINDS.join(', ')}.`)
      }
      kind = named as AKind
      const before = namedAt.get(kind)
      if (before !== undefined) throw refused(`names a file that names the kind "${kind}" twice, at lines ${String(before)} and ${String(at)}.`)
      namedAt.set(kind, at)
      entries.set(kind, [])
      return
    }
    if (trimmed.startsWith('#')) return
    if (kind === null) throw refused(`names a file whose line ${String(at)} is an entry before any line \`# kind: <kind>\`.`)
    const entry = theEntry(kind, trimmed, at)
    const wrong = whatIsWrongWith(kind, entry.value)
    if (wrong !== null) throw refused(`names a file whose line ${String(at)}, of the kind "${kind}", ${wrong}.`)
    entries.get(kind)?.push(entry)
  })
  for (const one of KINDS) {
    const these = entries.get(one)
    if (these === undefined) throw refused(`names a file with no line \`# kind: ${one}\`, so its ${one} entries are missing.`)
    if (these.length === 0) throw refused(`names a file whose kind "${one}" has no entry.`)
    if (ONE_ENTRY.includes(one) && these.length !== 1) {
      throw refused(`names a file whose kind "${one}" has ${String(these.length)} entries, and it takes exactly one.`)
    }
  }
  const of = (one: AKind) => entries.get(one) ?? []
  const first = (one: AKind) => of(one)[0]?.value ?? ''
  return Object.freeze({
    names: Object.freeze(of('name').map((one) => Object.freeze({ word: one.value, mergeGateOnly: one.flags.has('merge gate only') }))),
    realNameParts: Object.freeze(of('real name').map((one) => Object.freeze({ word: one.value, insideLongerWords: one.flags.has('inside longer words') }))),
    handles: Object.freeze(of('handle').map((one) => Object.freeze({ word: one.value, mergeGateOnly: one.flags.has('merge gate only') }))),
    researchWords: Object.freeze(
      of('research word').map((one) =>
        Object.freeze({
          piece: one.value,
          ...(one.ownSense === null ? {} : { theProductsOwnSense: one.ownSense }),
          ...(one.flags.has('inside longer words') ? { insideLongerWords: true as const } : {}),
        }),
      ),
    ),
    account: Object.freeze({ name: first('account name'), email: first('account email') }),
    machines: Object.freeze(of('machine').map((one) => one.value)),
    port: Number(first('port')),
  })
}

/**
 * READ THE FILE THE SETTING NAMES. With no `env`, the setting is read as every other is here: the environment, then the
 * checkout's .env. With an `env`, only that environment is read.
 */
export function readTheOwnersContent(env?: Record<string, string | undefined>): TheReading {
  const reading = env === undefined ? readSettingHere(THE_OWNERS_CONTENT_SETTING) : readSetting(THE_OWNERS_CONTENT_SETTING, env)
  const path = reading.value
  if (path === null) return { notRead: `${THE_OWNERS_CONTENT_SETTING} is not set, so no file of the owner's content was read.`, content: null }
  if (path.trim() === '') {
    return { notRead: `${THE_OWNERS_CONTENT_SETTING} is set empty, which is the same as not set, so no file of the owner's content was read.`, content: null }
  }
  if (!isAbsolute(path)) throw refused('is not an absolute path, so no file was read. Give the file\'s absolute path.')
  let bytes: Buffer
  try {
    bytes = readFileSync(path)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'an error with no code'
    throw refused(`names a file that could not be read (${code}).`)
  }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw refused('names a file that is not UTF-8 text.')
  }
  return { notRead: null, content: theOwnersContentIn(text) }
}

/** The owner's content, read once when this module is imported. */
export const THE_OWNERS_CONTENT: TheReading = readTheOwnersContent()

/**
 * A CASE THAT NEEDS THE OWNER'S REAL CONTENT IS TAKEN OUT WHERE NONE WAS READ, AND SAYS WHY, in the form
 * tests/skip-what-is-taken-out.ts uses. Ask it first, as `if (takenOutWithoutTheOwnersContent(context)) return`; the
 * `return` is never reached, because the runner's skip throws, but it keeps the case from going on if it did not.
 */
export function takenOutWithoutTheOwnersContent(context: { skip: (note: string) => void; task: { meta: { takenOut?: string; takenOutWithoutTheOwnersContent?: boolean } } }): boolean {
  if (THE_OWNERS_CONTENT.notRead === null) return false
  const reason = `${THE_OWNERS_CONTENT.notRead} This case needs the owner's real content.`
  context.task.meta.takenOut = reason
  context.task.meta.takenOutWithoutTheOwnersContent = true
  context.skip(`taken out: ${reason}`)
  return true
}
