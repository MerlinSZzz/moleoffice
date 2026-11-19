// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STANDARD CHANGE, AS THE CHECK TOOL ASKS FOR IT (the owner's approved design for how lines merge; wave 13r round F).
 *
 * A git seal may declare a standard kind (`standard` on the seal). tools/the-inspector.mjs then asks here, after it has
 * cut its worktree at the sealed tip and before any model runs:
 *
 *   1. whether the office has the kind's switch on, from GET /api/office/gates;
 *   2. what the change is: every changed path, the paths that are protected, generated or the merge queue's own code,
 *      the test cases each changed test file lost, and whether each changed word file changed only words;
 *   3. whether the rule in src/shared/standard-change.ts matches the declaration;
 *   4. when the switch is on and the rule matches, the kind's own checks, run on the sealed tree: its test check is the
 *      changed runnable test files only, never the related list, and no test check runs when there are none;
 *   5. the release door, POST /api/checks/:run/standard, with all of it.
 *
 * The door decides; the tool asks it every time a kind is declared, so the office counts every ask. When the switch is
 * off or the rule does not match, no check is run and the door says why. A door that releases ends the check with no
 * model. Any other answer sends the check the ordinary way, and its reason goes into what the inspector's verdict says
 * it read.
 *
 * Nothing here reaches git, a process or the office by itself: `git`, `runACheck` and `office` are handed in, so the
 * test (tests/the-check-tool-asks-for-a-standard-release.test.ts) can run it on a repository of its own.
 */

import * as ts from 'typescript/unstable/ast'
import { generatorOf, PROTECTED_AREAS_FILE, protectingPattern, readProtectedAreas } from './checks/protected-areas.mjs'
import { isTheQueuesOwnCode } from './merge-tool/the-queues-own-code.mjs'
import { aPluginOnlyChange, PLUGINS_FOLDER } from '../src/shared/plugin-change.ts'
import { aTestLikeFile, aWordFile, theChangedTestFiles, THE_CHECKS_OF_A_STANDARD_KIND, THE_GATE_OF_A_STANDARD_KIND, whatAStandardDeclarationFinds } from '../src/shared/standard-change.ts'

/** How long the changed test files of a standard kind may run. Ten minutes to start with; the tool is bounded, not the queue. */
export const A_CHANGED_TESTS_LIMIT_MS = 10 * 60_000

/** The most of that ten minutes the build that writes dist/web may take before the changed tests get the rest. */
export const A_CHANGED_TESTS_PREPARE_LIMIT_MS = 5 * 60_000

/** How long one of a kind's own checks may run. The other own checks keep their own bounds, changed-tests has its ten-minute budget, and the merge queue has the related run. */
export const A_CHECKS_LIMIT_MS = { 'check-a-plugin': 20 * 60_000, 'secret-scan': 5 * 60_000, tsc: 10 * 60_000, 'changed-tests': A_CHANGED_TESTS_LIMIT_MS }

/** The tokens of a TypeScript or JavaScript text, with where each ends. A regular expression is read as one token. */
function tokensOf(source) {
  const scanner = ts.createScanner(true, ts.LanguageVariant.Standard, source)
  const valueEnds = new Set([
    ts.SyntaxKind.Identifier, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.BigIntLiteral, ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateTail, ts.SyntaxKind.RegularExpressionLiteral,
    ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken,
    ts.SyntaxKind.ThisKeyword, ts.SyntaxKind.SuperKeyword, ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword,
  ])
  const tokens = []
  const templates = []
  let braces = 0
  let previousEnd = -1
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFile; kind = scanner.scan()) {
    if ((kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) && !valueEnds.has(tokens.at(-1)?.kind)) kind = scanner.reScanSlashToken()
    if (kind === ts.SyntaxKind.TemplateHead) templates.push(braces)
    else if (kind === ts.SyntaxKind.OpenBraceToken) braces += 1
    else if (kind === ts.SyntaxKind.CloseBraceToken) {
      if (templates.at(-1) === braces) {
        kind = scanner.reScanTemplateToken(false)
        if (kind === ts.SyntaxKind.TemplateTail) templates.pop()
      } else braces -= 1
    }
    if (scanner.getTokenEnd() === previousEnd) throw new Error(`The scanner stopped advancing at ${String(previousEnd)}.`)
    previousEnd = scanner.getTokenEnd()
    const text = scanner.getTokenText()
    const value = [ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(kind) ? scanner.getTokenValue() : text
    tokens.push({ kind, text, value, end: previousEnd })
  }
  return tokens
}

/** The line of a place in a text, counting from 1. */
const lineAt = (source, at) => source.slice(0, at).split('\n').length

const A_TITLE = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead])
/** The member words that make a case or a block run less: skipped, run only on a condition, run alone, or not run yet. */
const RUNS_LESS = ['skip', 'skipIf', 'runIf', 'only', 'todo', 'fails']

/**
 * The cases of a test file: each `it(` or `test(` call by its title as written, `it.skip(` and the like among them, and
 * how often a case is made to run less.
 */
function theCasesOf(source) {
  const tokens = tokensOf(source)
  const titles = []
  const runsLess = new Map(RUNS_LESS.map((word) => [word, 0]))
  for (const [index, token] of tokens.entries()) {
    const before = tokens[index - 1]?.kind
    const member = before === ts.SyntaxKind.DotToken || before === ts.SyntaxKind.QuestionDotToken
    if (token.kind !== ts.SyntaxKind.Identifier) continue
    if (member && runsLess.has(token.text)) runsLess.set(token.text, runsLess.get(token.text) + 1)
    if (member || (token.text !== 'it' && token.text !== 'test')) continue
    let call = index + 1
    while (tokens[call]?.kind === ts.SyntaxKind.DotToken && tokens[call + 1]?.kind === ts.SyntaxKind.Identifier) call += 2
    if (tokens[call]?.kind !== ts.SyntaxKind.OpenParenToken) continue
    const title = tokens[call + 1]
    titles.push(title !== undefined && A_TITLE.has(title.kind) ? JSON.stringify(title.kind === ts.SyntaxKind.TemplateHead ? `${title.value}…` : title.value) : 'a case whose title is not written out')
  }
  return { titles, runsLess }
}

/**
 * THE TEST CASES A CHANGE TO ONE TEST FILE REMOVES, by title: every case of `before` that `after` no longer has as often,
 * and every `.skip`, `.skipIf`, `.runIf`, `.only`, `.todo` or `.fails` more than before. A case whose title changed
 * reads as removed, because nothing tells it from a case removed and another added. `before` is null for a new file.
 */
export function theCasesRemoved(before, after) {
  if (before === null) return []
  const was = theCasesOf(before)
  const now = theCasesOf(after)
  const left = new Map()
  for (const title of now.titles) left.set(title, (left.get(title) ?? 0) + 1)
  const removed = []
  for (const title of was.titles) {
    const n = left.get(title) ?? 0
    if (n > 0) left.set(title, n - 1)
    else removed.push(title)
  }
  for (const word of RUNS_LESS) {
    const more = now.runsLess.get(word) - was.runsLess.get(word)
    if (more > 0) removed.push(`${String(more)} more .${word}`)
  }
  return removed
}

const A_KEY = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.Identifier, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.NumericLiteral])
const A_WORD = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral])

/** Where a plain value starting at `at` ends: a string, a name like SETTING_WORDS.X, or an object of plain entries. -1 when it is not one. */
function aPlainValueEnds(tokens, at) {
  const first = tokens[at]
  if (first === undefined) return -1
  if (A_WORD.has(first.kind)) return at + 1
  if (first.kind === ts.SyntaxKind.Identifier) {
    let end = at + 1
    while (tokens[end]?.kind === ts.SyntaxKind.DotToken && tokens[end + 1]?.kind === ts.SyntaxKind.Identifier) end += 2
    return end
  }
  if (first.kind !== ts.SyntaxKind.OpenBraceToken) return -1
  let next = at + 1
  for (;;) {
    if (tokens[next]?.kind === ts.SyntaxKind.CloseBraceToken) return next + 1
    if (!A_KEY.has(tokens[next]?.kind) || tokens[next + 1]?.kind !== ts.SyntaxKind.ColonToken) return -1
    const end = aPlainValueEnds(tokens, next + 2)
    if (end < 0) return -1
    if (tokens[end]?.kind === ts.SyntaxKind.CommaToken) next = end + 1
    else if (tokens[end]?.kind === ts.SyntaxKind.CloseBraceToken) return end + 1
    else return -1
  }
}

/** A word file without its words: every plain entry of an object taken out, and the text of every template part blanked. */
function theCodeOf(source) {
  const tokens = tokensOf(source)
  const code = []
  for (let at = 0; at < tokens.length; at += 1) {
    const before = tokens[at - 1]?.kind
    if ((before === ts.SyntaxKind.OpenBraceToken || before === ts.SyntaxKind.CommaToken) && A_KEY.has(tokens[at].kind) && tokens[at + 1]?.kind === ts.SyntaxKind.ColonToken) {
      const end = aPlainValueEnds(tokens, at + 2)
      if (end > 0 && (tokens[end]?.kind === ts.SyntaxKind.CommaToken || tokens[end]?.kind === ts.SyntaxKind.CloseBraceToken)) {
        at = tokens[end].kind === ts.SyntaxKind.CommaToken ? end : end - 1
        continue
      }
    }
    const token = tokens[at]
    const template = [ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail].includes(token.kind)
    code.push({ said: `${String(token.kind)} ${template ? '' : token.text}`, end: token.end })
  }
  return code
}

/**
 * WHETHER ONLY WORDS CHANGED BETWEEN TWO TEXTS OF A WORD FILE. Every entry whose value is a string, a name such as
 * SETTING_WORDS.X, or an object of such entries is a word, and may be changed, added or taken out. Every other token,
 * an import or a function among them, must be as it was; the words inside a template may change, and what it puts in
 * them may not. When something else changed, `why` names the line of `after` where it starts.
 */
export function whetherOnlyWordsChanged(before, after) {
  const was = theCodeOf(before ?? '')
  const now = theCodeOf(after ?? '')
  for (let at = 0; at < Math.max(was.length, now.length); at += 1) {
    if (was[at]?.said === now[at]?.said) continue
    if (after === null) return { plain: false, why: 'the file is deleted' }
    const where = now[at] === undefined ? `the end of the file, where code was taken out` : `line ${String(lineAt(after, now[at].end))}`
    return { plain: false, why: `${where} changes code, not a word` }
  }
  return { plain: true, why: 'Only words changed.' }
}

/**
 * WHAT THE TOOL READS OF THE CHANGE FROM `base` TO `tip`, which the office cannot read for itself. `git(args)` runs git
 * in the checkout and returns what it printed; it throws when git fails, and so does this, since a part read wrongly
 * is worse than a check that stops. The protected list is read as it stands at `base`, as every checker reads it.
 */
export function whatTheToolReadsOfAChange({ git, base, tip }) {
  const listed = git(['diff', '--name-status', '--no-renames', '-z', base, tip]).split('\0')
  const changed = []
  for (let at = 0; at + 1 < listed.length; at += 2) changed.push({ path: listed[at + 1], deleted: listed[at] === 'D' })
  const show = (commit, path) => git(['show', `${commit}:${path}`])

  const declared = git(['ls-tree', '--name-only', base, '--', PROTECTED_AREAS_FILE]).trim() !== ''
  const areas = declared ? readProtectedAreas(show(base, PROTECTED_AREAS_FILE), `${base}:${PROTECTED_AREAS_FILE}`) : { protected: [], generated: [] }
  const neverStandard = changed.flatMap(({ path }) => {
    const pattern = protectingPattern(areas, path)
    if (pattern !== null) return [{ path, why: `it is protected by ${pattern} in ${PROTECTED_AREAS_FILE}` }]
    const generator = generatorOf(areas, path)
    if (generator !== null) return [{ path, why: `it is written by ${generator.command.join(' ')}` }]
    if (isTheQueuesOwnCode(path)) return [{ path, why: "it is the merge queue's own code" }]
    return []
  })
  const before = (path) => (git(['ls-tree', '--name-only', base, '--', path]).trim() === '' ? null : show(base, path))
  const cases = changed.filter((one) => !one.deleted && aTestLikeFile(one.path)).map(({ path }) => ({ path, removed: theCasesRemoved(before(path), show(tip, path)) }))
  const words = changed.filter((one) => aWordFile(one.path)).map(({ path, deleted }) => ({ path, ...whetherOnlyWordsChanged(before(path), deleted ? null : show(tip, path)) }))
  return { changed, read: { neverStandard, cases, words } }
}

/**
 * THE COMMANDS OF A KIND'S OWN CHECKS, each by the name src/shared/standard-change.ts asks for, run from the root of the
 * sealed tree. A kind's test check is named changed-tests and runs only the changed test files, never the related list:
 * the merge queue runs that. A plugin runs its own check and the secret scan of its folder, as the plugin lane of the
 * merge queue does; words run the type check. A change with no changed runnable test file gets no changed-tests command,
 * rather than a runner named with nothing. The changed-tests check first runs the existing vite build, because some tests
 * read dist/web and a private sealed tree has not built it; the build is part of the same ten-minute check.
 * @param {import('../src/shared/standard-change.ts').StandardKind} kind
 * @param {readonly import('../src/shared/standard-change.ts').AStandardChangesFile[]} changed
 * @param {string} base
 * @returns {{ name: string, argv: string[], prepare?: { argv: string[], limitMs: number } }[]}
 */
export function theChecksOfAKind(kind, changed, base) {
  const tests = theChangedTestFiles(changed)
  const changedTests = tests.length === 0 ? [] : [{
    name: 'changed-tests',
    argv: ['node', 'tools/run-named-tests.mjs', ...tests],
    prepare: { argv: ['node_modules/.bin/vite', 'build'], limitMs: A_CHANGED_TESTS_PREPARE_LIMIT_MS },
  }]
  if (kind === 'one-plugin') {
    const plugin = aPluginOnlyChange(changed.map((one) => one.path))
    if (plugin === null) throw new Error('A change of the kind one-plugin was asked for its checks, and it is not inside one plugin.')
    return [
      { name: 'check-a-plugin', argv: ['node', 'tools/check-a-plugin.mjs', plugin.id, '--json'] },
      { name: 'secret-scan', argv: ['node', 'tools/secret-scan.mjs', `${PLUGINS_FOLDER}/${plugin.id}`, '--json'] },
      ...changedTests,
    ]
  }
  if (kind === 'words') return [{ name: 'tsc', argv: ['node_modules/.bin/tsc', '--noEmit'] }, ...changedTests]
  return changedTests
}

/** Up to five paths, then how many more, for a sentence that names what a change touched. */
const some = (paths) => `${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ` and ${String(paths.length - 5)} more` : ''}`

/** Why a matching kind has no test check to run: no changed file is one the named runner can take. */
function whyNoChangedTests(changed) {
  const notRunnable = changed.filter((one) => !one.deleted && one.path.startsWith('tests/')).map((one) => one.path)
  const deleted = changed.filter((one) => one.deleted && aTestLikeFile(one.path)).map((one) => one.path)
  const said = [
    ...(deleted.length === 0 ? [] : [`${some(deleted)} ${deleted.length === 1 ? 'is deleted' : 'are deleted'}`]),
    ...(notRunnable.length === 0 ? [] : [`${some(notRunnable)} ${notRunnable.length === 1 ? 'is a test helper or another file the named runner cannot run' : 'are test helpers or other files the named runner cannot run'}`]),
  ]
  const named = said.length === 0 ? 'the changed files are test helpers or other files the named runner cannot run' : said.join('; ')
  return `no changed file is a runnable test file (a path under tests/ ending .test.ts): ${named}`
}

/** The rows of the gate list as GET /api/office/gates answers them. */
const theRowsOf = (gates) => (gates?.classes ?? []).flatMap((one) => one.groups ?? []).flatMap((group) => group.rows ?? [])

/** The first line of what an office answer says: its error, or the text as it came. */
function whatItSaid(said) {
  try {
    const parsed = JSON.parse(said)
    if (typeof parsed?.error === 'string') return parsed.error
    if (typeof parsed?.message === 'string') return parsed.message
  } catch {
    // An answer that is not JSON is said as it came.
  }
  return said.trim().split('\n')[0] ?? ''
}

/**
 * ASK FOR A STANDARD RELEASE, and say what came of it. `office(method, path, body)` answers `{ ok, status, said }`;
 * `runACheck({ name, argv, limitMs })` answers `{ code, seconds, said }`, where `code` is null when the command did not
 * run to an end. `read` is what the check read, as a verdict's `read` names it. Returns `{ released, why }`: released
 * true when the door released the run, and otherwise why the check goes the ordinary way.
 */
export async function askForAStandardRelease({ run, kind, base, tip, read, git, runACheck, office, say }) {
  const gate = THE_GATE_OF_A_STANDARD_KIND[kind]
  if (gate === undefined) return { released: false, why: `The seal declares ${JSON.stringify(kind)}, which is not a standard kind, so the check goes the ordinary way.` }
  const gates = await office('GET', '/api/office/gates')
  const row = gates.ok ? theRowsOf(JSON.parse(gates.said)).find((one) => one.id === gate) : undefined
  if (row === undefined) {
    const why = gates.ok ? `the office lists no switch ${gate}` : `the office did not say whether the switch ${gate} is on (HTTP ${String(gates.status)}: ${whatItSaid(gates.said)})`
    return { released: false, why: `The seal declares a standard change of the kind ${kind}, but ${why}, so the check goes the ordinary way.` }
  }
  const { changed, read: toolRead } = whatTheToolReadsOfAChange({ git, base, tip })
  const found = whatAStandardDeclarationFinds(kind, changed, toolRead)
  const checks = []
  if (row.value === '1' && found.matches) {
    const listed = theChecksOfAKind(kind, changed, base)
    if (!listed.some((one) => one.name === 'changed-tests')) {
      say(`Standard change, ${kind}: no test check was run, because ${whyNoChangedTests(changed)}; the merge queue's related run is the proof of the tests.`)
    }
    for (const check of listed) {
      say(`Standard change, ${kind}: running ${check.argv.join(' ')}`)
      const ran = await runACheck({ ...check, limitMs: A_CHECKS_LIMIT_MS[check.name] })
      say(`Standard change, ${kind}: ${check.name} ${ran.code === 0 ? 'passed' : ran.code === null ? 'did not run to an end' : `exited ${String(ran.code)}`} after ${ran.seconds.toFixed(1)} seconds.${ran.said === '' ? '' : ` ${ran.said}`}`)
      checks.push({ name: check.name, argv: check.argv, code: ran.code, seconds: Math.round(ran.seconds * 10) / 10 })
      if (ran.code !== 0) break
    }
  } else {
    say(`Standard change, ${kind}: no check was run, because ${row.value === '1' ? found.why : `the switch ${gate} is off`}`)
  }
  const asked = await office('POST', `/api/checks/${run}/standard`, { kind, read, toolRead, checks })
  if (asked.ok) return { released: true, why: whatItSaid(JSON.parse(asked.said).says ?? asked.said) }
  return { released: false, why: `The release door did not release it as a standard change (HTTP ${String(asked.status)}): ${whatItSaid(asked.said)} The check goes the ordinary way.` }
}

export { THE_CHECKS_OF_A_STANDARD_KIND }
