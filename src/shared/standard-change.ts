// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STANDARD CHANGE, worked out here and nowhere else (the owner's approved design for how lines merge; wave 13r
 * round F).
 *
 * A standard change is approved in advance. It runs only its own checks and the changed runnable test files, needs no
 * inspector, and goes through the merge queue as any other entry does. There are four kinds: a change only inside one
 * plugin, only to words or translations, only to tests, or only to documents. Everything else is an ordinary change, read
 * by the inspector. The merge queue's related run stays the proof for everything the standard step does not run.
 *
 * The line declares a kind at the seal (`standard` on a git seal). The check tool reads the change and asks the release
 * door; the door decides with `whatAStandardDeclarationFinds` below, which the tool asks first too. A declaration that
 * does not match goes the ordinary way.
 *
 * The office runs no git, so the parts that need a file's content are read by the check tool and handed to the door:
 * which changed paths are protected, generated or the queue's own code; which test cases each changed test file lost;
 * and whether each changed word file changed only words. The door checks each part covers every path it must.
 *
 * Each kind has a switch in the gate list (src/config/gates.mjs), on by default, which the person or a secretary may
 * turn off. At off every declaration of that kind goes the ordinary way.
 */

import { HOUSE_RULES_PATH } from './merge-class.ts'
import { A_DOCUMENT, whyItLandsAfterAPress } from './merge-queue.ts'
import { aPluginOnlyChange, PLUGINS_FOLDER } from './plugin-change.ts'
import { LANGUAGES } from './languages.ts'

/** The four kinds of standard change, in the order the regulations list them. */
export const STANDARD_KINDS = ['one-plugin', 'words', 'tests', 'documents'] as const
export type StandardKind = (typeof STANDARD_KINDS)[number]

/** The gate that switches each kind on or off, by its id in src/config/gates.mjs. */
export const THE_GATE_OF_A_STANDARD_KIND: { readonly [K in StandardKind]: string } = {
  'one-plugin': 'standard-one-plugin',
  words: 'standard-words',
  tests: 'standard-tests',
  documents: 'standard-documents',
}

/** Each kind in the words of a sentence: "declared as <this>". */
export const A_STANDARD_KIND_SAYS: { readonly [K in StandardKind]: string } = {
  'one-plugin': 'a change only inside one plugin',
  words: 'a change only to words or translations',
  tests: 'a change only to tests',
  documents: 'a change only to documents',
}

/**
 * THE CHECKS EACH KIND MUST HAVE RUN AND PASSED on the sealed tree, by the names the check tool gives them. Every kind's
 * test check is `changed-tests`: the changed test files the project's runner can run, under tests/ and ending .test.ts,
 * and nothing from the related list, whose run belongs to the merge queue. A plugin runs its own steps and the secret
 * scan, as the plugin fast lane does; words run the type check, since a word file is code that every page imports. A
 * change with no changed runnable test file runs no test check, says so, and records an empty selection; the release door
 * releases it on the kind's other checks, and the merge queue's related run is the test proof.
 */
export const THE_CHECKS_OF_A_STANDARD_KIND: { readonly [K in StandardKind]: readonly string[] } = {
  'one-plugin': ['check-a-plugin', 'secret-scan', 'changed-tests'],
  words: ['tsc', 'changed-tests'],
  tests: ['changed-tests'],
  documents: ['changed-tests'],
}

export function isAStandardKind(value: unknown): value is StandardKind {
  return typeof value === 'string' && (STANDARD_KINDS as readonly string[]).includes(value)
}

/**
 * The word files: the word lists of every page language in src/shared/languages.ts, their made-from records and wave
 * parts among them, and the word sources of the settings. The pattern is built from the list of page languages, so a
 * language added there is matched with no edit to this rule.
 */
export function aWordListPattern(codes: readonly string[]): RegExp {
  return new RegExp(`^src\\/shared\\/words\\/(?:${codes.join('|')})(?:-[a-z0-9-]+)?\\.ts$`, 'u')
}
const A_WORD_LIST = aWordListPattern(Object.keys(LANGUAGES))
const THE_WORD_SOURCES = 'src/config/word-sources.mjs'

/** Whether a path is a file of words: a word list or the word sources. The files that join or wait on them are code. */
export function aWordFile(path: string): boolean {
  return A_WORD_LIST.test(path) || path === THE_WORD_SOURCES
}

/** Whether a path is a test file or part of one: anything under a tests/ folder, or a file named *.test.* or *.spec.*. */
export function aTestLikeFile(path: string): boolean {
  return path.startsWith('tests/') || path.includes('/tests/') || /\.(?:test|spec)\.[^/]*$/u.test(path)
}

/**
 * THE CHANGED TEST FILES A RUNNER CAN RUN: under tests/, ending .test.ts, and not deleted, which is exactly what
 * tools/run-named-tests.mjs accepts as a name. The check tool names these to the runner as changed-tests; the release
 * door derives the same set from the seal's changed list, so an empty selection is the same fact on both sides.
 */
export function theChangedTestFiles(changed: readonly AStandardChangesFile[]): string[] {
  return changed.filter((one) => !one.deleted && one.path.startsWith('tests/') && one.path.endsWith('.test.ts')).map((one) => one.path)
}

/**
 * THE PATHS NO STANDARD CHANGE MAY TOUCH, that the office can name without reading a file: the paths that land only
 * after a press (a migration, the merge tool, the sandbox tools, the protected list, the office rules), the house rules'
 * inventory, the role cards, the generated agent rules and an agent's own settings. The check tool adds the paths the
 * project protects, the files it regenerates and the merge queue's own code, which only it can read.
 */
export function whyNeverStandard(path: string): string | null {
  const pressed = whyItLandsAfterAPress(path)
  if (pressed !== null) return `it is ${pressed.why}, which lands only after a press`
  if (path === HOUSE_RULES_PATH) return 'it is the inventory of house rules, which decides how every later red test is read'
  if (path === 'src/config/roles.json') return 'it is the role cards and the power tree'
  if (path === 'AGENTS.md') return 'it is the rules other agents read, generated from CLAUDE.md'
  if (path.startsWith('.claude/')) return "it is an agent's own settings and hooks"
  return null
}

/** One changed path of a git seal: deleted when the seal names no blob for it. */
export interface AStandardChangesFile {
  path: string
  deleted: boolean
}

/** What the check tool read of the change, and the door cannot. Null for a part it could not read. */
export interface WhatTheToolReadOfAStandardChange {
  /** Every changed path that is protected, generated or the queue's own code, with why. */
  neverStandard: { path: string; why: string }[] | null
  /** Every changed test-like file that is not deleted, with the cases it lost: titles, or a case newly skipped. */
  cases: { path: string; removed: string[] }[] | null
  /** Every changed word file, and whether only words changed in it; when not, where the first other change is. */
  words: { path: string; plain: boolean; why: string }[] | null
}

/** What a declaration finds: the kind declared, or null for none or one that is not a kind; whether it matches; why. */
export interface WhatAStandardDeclarationFinds {
  declared: StandardKind | null
  matches: boolean
  why: string
}

const files = (n: number): string => `${String(n)} changed ${n === 1 ? 'file' : 'files'}`
const some = (paths: readonly string[]): string => `${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ` and ${String(paths.length - 5)} more` : ''}`

/**
 * WHETHER A DECLARED STANDARD CHANGE IS ONE, from the files the seal changed and what the check tool read of them. A
 * mismatch says why in one sentence, and the change goes the ordinary way. The switch of the kind is not read here: the
 * door reads it first, because a switch is a setting and this is a rule.
 */
export function whatAStandardDeclarationFinds(
  declared: unknown,
  changed: readonly AStandardChangesFile[],
  read: WhatTheToolReadOfAStandardChange,
): WhatAStandardDeclarationFinds {
  if (declared === undefined || declared === null) {
    return { declared: null, matches: false, why: 'The seal declares no standard kind, so it goes the ordinary way.' }
  }
  if (!isAStandardKind(declared)) {
    return { declared: null, matches: false, why: `The seal declares ${JSON.stringify(declared)}, which is not one of the standard kinds ${STANDARD_KINDS.join(', ')}, so it goes the ordinary way.` }
  }
  const no = (why: string): WhatAStandardDeclarationFinds => ({ declared, matches: false, why: `It is declared ${A_STANDARD_KIND_SAYS[declared]}, but ${why}, so it goes the ordinary way.` })
  if (changed.length === 0) return no('the seal changes no file')
  const paths = changed.map((one) => one.path)

  const never = paths.flatMap((path) => {
    const why = whyNeverStandard(path)
    return why === null ? [] : [`${path} (${why})`]
  })
  if (never.length > 0) return no(`${never.join('; ')}`)
  if (read.neverStandard === null) return no('the check tool could not read which changed paths are protected, generated or the merge queue’s own code')
  const named = read.neverStandard.filter((one) => paths.includes(one.path))
  if (named.length > 0) return no(named.map((one) => `${one.path} (${one.why})`).join('; '))

  const outside = theFilesOutsideTheKind(declared, paths)
  if (outside !== null) return no(outside)

  const tests = changed.filter((one) => !one.deleted && aTestLikeFile(one.path)).map((one) => one.path)
  if (tests.length > 0) {
    if (read.cases === null) return no('the check tool could not read which test cases the changed test files lost')
    const unread = tests.filter((path) => !read.cases!.some((one) => one.path === path))
    if (unread.length > 0) return no(`the check tool did not say which cases ${some(unread)} lost`)
  }

  if (declared === 'words') {
    if (read.words === null) return no('the check tool could not read whether only words changed')
    const unread = paths.filter((path) => !read.words!.some((one) => one.path === path))
    if (unread.length > 0) return no(`the check tool did not say whether only words changed in ${some(unread)}`)
    const notPlain = read.words.filter((one) => paths.includes(one.path) && !one.plain)
    if (notPlain.length > 0) return no(notPlain.map((one) => `${one.path} changes more than words: ${one.why}`).join('; '))
  }

  const plugin = declared === 'one-plugin' ? aPluginOnlyChange(paths) : null
  const where =
    declared === 'one-plugin'
      ? `inside ${PLUGINS_FOLDER}/${plugin?.id ?? ''}/ and its manifest is unchanged`
      : declared === 'words'
        ? 'a word file in which only words changed'
        : declared === 'tests'
          ? 'under tests/'
          : 'a document'
  return { declared, matches: true, why: `${paths.length === 1 ? 'The one changed file is' : `Every one of the ${files(paths.length)} is`} ${where}.` }
}

/** The sentence naming the files outside the declared kind, or null when every file is inside it. */
function theFilesOutsideTheKind(kind: StandardKind, paths: readonly string[]): string | null {
  if (kind === 'one-plugin') {
    const plugin = aPluginOnlyChange(paths)
    if (plugin === null) return `not every changed file is inside the folder of one plugin under ${PLUGINS_FOLDER}/`
    if (plugin.manifest) return `it changes the manifest of ${plugin.id}, which the inspector reads`
    return null
  }
  const inside = kind === 'words' ? aWordFile : kind === 'tests' ? (path: string) => path.startsWith('tests/') : (path: string) => A_DOCUMENT.test(path)
  const outside = paths.filter((path) => !inside(path))
  if (outside.length === 0) return null
  const what = kind === 'words' ? 'a word file' : kind === 'tests' ? 'under tests/' : 'a document'
  return `${some(outside)} ${outside.length === 1 ? 'is' : 'are'} not ${what}`
}
