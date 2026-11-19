// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCREEN: WHAT MAY NOT LEAVE THE BUILDING, READ BEFORE A PIECE OF WORK IS HANDED OUTSIDE. Criterion F16 point 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A task package leaves Mole Office as text a person copies and pastes into an outside chat window,
 * or hands to another person. Nothing today looks at that text before it goes. This file is the
 * look: `screenWhatWouldLeave` reads the text and answers what it found — a key, a path under the
 * home directory, an email address, the office's one registered person's name — naming the check,
 * where the finding sits, and a sentence, never the value of a key.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER STRIPS, NEVER REDACTS, NEVER REWRITES A CHARACTER
 * ---------------------------------------------------------------------------------------
 *
 * This file changes nothing about the text it is given. It reports. Whoever calls it decides what
 * to do with the answer — for a `refused` finding, the decision most callers will make is not to
 * let the text out — but that decision belongs to the caller, not to this file. A screen that edited
 * the text on its own would be quietly deciding what somebody else may say, which is a bigger claim
 * than "here is what I found".
 *
 * ---------------------------------------------------------------------------------------
 * WHY A KEY IS NEVER CARRIED IN THE ANSWER, EVEN THOUGH A PATH OR A NAME IS
 * ---------------------------------------------------------------------------------------
 *
 * A finding about a path or a name names the actual text that was found, because a person deciding
 * whether to paste something needs to see what triggered the finding, and knowing your own home
 * directory or your own name is not a way of losing either of them. A KEY IS DIFFERENT: the whole
 * point of a key is that it must never be repeated anywhere, including here. So both of the ways
 * `key_in_text` below can fire — an exact setting value, or the shape of an issued key — never put
 * the matched text into a finding, a thrown error, or any string this file builds. If this rule and
 * the rule above ever conflict for some check added later, this rule wins.
 *
 * ---------------------------------------------------------------------------------------
 * TWO SEVERITIES AND NO THIRD
 * ---------------------------------------------------------------------------------------
 *
 * `refused` stops the text leaving. `look_before_you_paste` stops nothing and is addressed to the
 * person holding the clipboard — it is what a caller shows without blocking anything. There is no
 * third severity: an uncertain finding is still one of these two (see `check_incomplete` below),
 * because a caller has to know whether to block or merely to show, and a third answer would leave
 * that caller guessing.
 *
 * ---------------------------------------------------------------------------------------
 * S1: THE CLOSED SET
 * ---------------------------------------------------------------------------------------
 *
 * `SCREEN_CHECK_NAMES` and `SCREEN_SEVERITIES` are declared once, in src/shared/screen-closed-set.ts,
 * and `SCREEN_CHECKS` is a total map from every check to its severity and a sentence describing it — in the manner of
 * `PASSED_OVER_BUCKETS` and `REASON_GROUP_LABELS` in src/shared/attention.ts. `Record<ScreenCheckName, …>`
 * makes it exhaustive: a check added to the union without an entry here fails the build, not a test
 * run later.
 *
 * ---------------------------------------------------------------------------------------
 * NO ROUTE HERE
 * ---------------------------------------------------------------------------------------
 *
 * This file exports one function and the types and registry it is built from. Nothing here is
 * wired to an HTTP door — the door that calls this is a later piece of work.
 */

// A candidate path and whether it is under the home, as the system this runs on writes them, are worked out in
// src/config/the-paths-of-a-system.mjs, beside the rest of how a path is written there.
import { THIS_PLATFORM, isAtOrUnder, theAbsolutePathsInAText } from '../../config/the-paths-of-a-system.mjs'
import { settingNames, settingValue } from '../../config/settings.mjs'
import { THE_PERSON } from '@shared/person.ts'
// THE HOME DIRECTORY THROUGH THE ONE FILE ALLOWED TO ASK FOR IT. `node:os` is not imported here:
// lib/adapters/index.ts is where the permit lives and why: homedir() says where a person's own
// files are rather than what the machine is doing, so it is read there once and handed out from
// there, and this file just asks.
import { theHomeDirectory } from './adapters/index.ts'

// ============================================================================ S1. the closed set

// THE TWO SEVERITIES AND THE CHECK NAMES are declared in src/shared/screen-closed-set.ts, because the word
// tables in src/shared/words.ts are keyed by them and a shared file may not import this one. They are
// exported again here under the same names.
import { SCREEN_CHECK_NAMES, SCREEN_SEVERITIES, type ScreenCheckName, type ScreenSeverity } from '@shared/screen-closed-set.ts'
export { SCREEN_CHECK_NAMES, SCREEN_SEVERITIES, type ScreenCheckName, type ScreenSeverity }

/**
 * THE TOTAL MAP: every check, its severity, and a sentence saying what it is.
 *
 * The sentence here is the check's own standing description — what a reader is told when nothing
 * was found and Mole Office says which checks ran. A FINDING's own `says` (below) is written fresh
 * for that finding, because a finding is about one hit and this sentence is about the check itself.
 */
export const SCREEN_CHECKS: Readonly<Record<ScreenCheckName, { severity: ScreenSeverity; sentence: string }>> = {
  key_in_text: {
    severity: 'refused',
    sentence:
      'A value that is the current value of one of this office’s own settings whose name says key, secret, ' +
      'token or password, or a value with the exact shape of a key this office issues. The value itself is ' +
      'never part of this answer.',
  },
  home_directory_path: {
    severity: 'refused',
    sentence:
      'An absolute path — one starting with "/" — that sits at or under the home directory this machine ' +
      'reports for the person Mole Office runs for. A path with nothing before it, such as ' +
      '"src/server/lib/bundle.ts", is relative rather than absolute and is not this check’s concern.',
  },
  email_address: {
    severity: 'look_before_you_paste',
    sentence: 'An email address, anybody’s, written as one in the text.',
  },
  registered_person_name: {
    severity: 'look_before_you_paste',
    sentence: 'The name Mole Office has on file for the one person it is registered to.',
  },
  other_peoples_names: {
    severity: 'look_before_you_paste',
    sentence:
      'Whether anybody else’s name is in the text. This office holds one person and no roll of anybody ' +
      'else, so this check always answers that it did not look, rather than pretending it did.',
  },
  check_incomplete: {
    severity: 'look_before_you_paste',
    sentence: 'One of the other checks above could not finish, named here rather than read as clean.',
  },
} as const

// ============================================================================ the answer's shape

/** Where one finding sits in the text. Absent for a finding that is not about one place in it. */
export interface ScreeningLocation {
  /** 1-based: the first line of the text is line 1. */
  line: number
  /** 1-based column of the finding's first character, within `line`. */
  startColumn: number
  /** 1-based column of the finding's last character, within `line`, inclusive. */
  endColumn: number
}

/** One thing this screen found, or one thing it could not finish checking. */
export interface ScreeningFinding {
  check: ScreenCheckName
  severity: ScreenSeverity
  where: ScreeningLocation | null
  /**
   * What Mole Office found, in words. NEVER the value a `key_in_text` finding matched — see the
   * file header. Every other check's sentence may and does name the exact text it found, because a
   * person deciding whether to paste needs to see what triggered the finding.
   */
  says: string
}

/** What `screenWhatWouldLeave` answers. */
export interface ScreeningAnswer {
  findings: readonly ScreeningFinding[]
  /**
   * The substantive checks that ran to completion, in the order they ran. `check_incomplete`
   * findings name any that did not; a check that did not complete is left out of this list rather
   * than counted as having run.
   */
  ranChecks: readonly ScreenCheckName[]
  /**
   * One paragraph naming what was found and which checks ran, so a caller that reads only this
   * still knows the shape of the answer rather than reading a clean run as more than it is.
   */
  summary: string
}

// ============================================================================ the dependencies

/** One of this office's own settings whose name says it holds a secret, and its current value. */
export interface SecretSettingValue {
  readonly name: string
  readonly value: string
}

/**
 * What `screenWhatWouldLeave` reads from the rest of the product, so a test can hand it a small,
 * made-up machine instead of this one's real settings and real home directory. THE PROVIDER IS
 * INJECTABLE SO NO TEST DEPENDS ON WHAT HAPPENS TO BE CONFIGURED ON WHOEVER'S MACHINE RUNS IT — the
 * same reason `send` is injectable in src/server/lib/office-keys.ts and `git` is injectable in
 * src/server/lib/gitmirror.ts.
 */
export interface ScreeningDependencies {
  /** Where the operating system says this person's own files live. Defaults to `theHomeDirectory()`. */
  homeDirectory: () => string
  /**
   * Which system writes the paths looked for: a value of `process.platform`, this server's unless a test names another.
   * Windows writes a path under the home folder with a drive letter and backslashes, and Linux and the Mac write it
   * with forward slashes.
   */
  platform: string
  /** The current value of every setting whose name says key, secret, token or password. */
  secretSettingValues: () => readonly SecretSettingValue[]
  /** The name Mole Office has on file for the one person it is registered to. Defaults to `THE_PERSON`. */
  registeredPersonName: () => string
}

/**
 * THE WORDS A SETTING'S OWN NAME HAS TO SAY BEFORE ITS VALUE IS TREATED AS A SECRET.
 *
 * Matched as whole, underscore-delimited segments of the name — never as a bare substring — because
 * a substring match reads `MOLE_OFFICE_WORLD_SECRETARIES` and `MOLE_OFFICE_LARGE_LAST_TURN_TOKENS`
 * as secrets: `SECRETARIES` is a list of agent handles and `TOKENS` there counts language-model
 * tokens, and neither is a thing this office would ever need to keep out of an export. Measured
 * against every setting `src/config/settings.mjs` declares on 14 September 2026: a bare substring
 * match names four settings as secret-shaped; splitting on the underscores narrows that to the two
 * that actually are, `KIMI_API_KEY` and `MOONSHOT_API_KEY`, each ending in a whole `KEY` segment.
 */
const SECRET_NAME_WORDS = ['key', 'secret', 'token', 'password']

/** Does this setting's own name say it holds a secret? Exported so the rule above is its own test. */
export function settingNameSaysSecret(name: string): boolean {
  return name
    .split(/[^A-Za-z0-9]+/)
    .some((segment) => SECRET_NAME_WORDS.includes(segment.toLowerCase()))
}

/**
 * The current value of every declared setting whose name says it is a secret, read from the
 * product's own settings declaration and nowhere else — never from a list written by hand here, so
 * a setting named `..._TOKEN` next year is covered the day it is declared.
 *
 * A setting nobody has set answers `null` from `settingValue` and is left out: there is no value to
 * compare the text against, and an absent value cannot be "found" in anything.
 */
function defaultSecretSettingValues(): readonly SecretSettingValue[] {
  const out: SecretSettingValue[] = []
  for (const name of settingNames()) {
    if (!settingNameSaysSecret(name)) continue
    const value = settingValue(name)
    if (value !== null && value !== '') out.push({ name, value })
  }
  return out
}

const DEFAULT_DEPENDENCIES: ScreeningDependencies = {
  homeDirectory: theHomeDirectory,
  platform: THIS_PLATFORM,
  secretSettingValues: defaultSecretSettingValues,
  registeredPersonName: () => THE_PERSON,
}

// ============================================================================ finding a place in the text

/** Where in `text` the character at `index`, running `length` characters, sits. */
function locationOf(text: string, index: number, length: number): ScreeningLocation {
  const before = text.slice(0, index)
  const lastNewline = before.lastIndexOf('\n')
  const line = before.split('\n').length
  const startColumn = index - lastNewline
  const endColumn = startColumn + Math.max(0, length - 1)
  return { line, startColumn, endColumn }
}

/** `at line 4, characters 10 to 25` — or `character 10` alone when the finding is one character. */
function whereItSits(where: ScreeningLocation): string {
  const chars = where.startColumn === where.endColumn ? `character ${String(where.startColumn)}` : `characters ${String(where.startColumn)} to ${String(where.endColumn)}`
  return `at line ${String(where.line)}, ${chars}`
}

/** A literal string, safe to drop into a `RegExp` — there is no such helper in this repository yet. */
function asRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ============================================================================ S2. a key

/**
 * THE SHAPE OF EVERY KEY THIS OFFICE ISSUES, WORKED OUT FROM THE CODE THAT MAKES ONE, NEVER FROM A
 * REAL ONE.
 *
 * `src/server/lib/keys.ts` makes the person's key, the office's own key, an agent's key
 * (`makeAnAgentKey`) and a run's key (`makeARunKey`) the same way: `randomBytes(32).toString('hex')`
 * — 32 random bytes, printed as 64 lowercase hexadecimal characters and nothing else.
 * `src/server/lib/selfregistration.ts`, the door an agent registers through, asks `keys.ts` for the
 * value and adds no shape of its own. A person's-device token is not this shape and is not checked
 * for: the office never generates one, it only ever holds that token's SHA-256, so there is no
 * shape here for it to recognise.
 *
 * Bounded on both sides so a 65-character run of hex digits is not read as holding a 64-character
 * key inside it.
 */
const ISSUED_KEY_SHAPE = /(?<![0-9a-fA-F])[0-9a-fA-F]{64}(?![0-9a-fA-F])/g

/** Every index in `text` (case-sensitive, non-overlapping) where `needle` occurs. */
function allIndicesOf(text: string, needle: string): number[] {
  if (needle === '') return []
  const out: number[] = []
  let from = 0
  for (;;) {
    const at = text.indexOf(needle, from)
    if (at === -1) return out
    out.push(at)
    from = at + needle.length
  }
}

function keyFindings(text: string, secretValues: readonly SecretSettingValue[]): ScreeningFinding[] {
  const findings: ScreeningFinding[] = []
  for (const { name, value } of secretValues) {
    for (const index of allIndicesOf(text, value)) {
      const where = locationOf(text, index, value.length)
      findings.push({
        check: 'key_in_text',
        severity: 'refused',
        where,
        // NEVER `value` HERE. The setting's NAME is not a secret — it is the word "KIMI_API_KEY", not
        // the key — so naming it is how a person finds and removes the right line without being shown
        // what they are removing.
        says: `The current value of the ${name} setting, which this office keeps because its name says key, secret, token or password, ${whereItSits(where)}. Not printed here.`,
      })
    }
  }
  for (const match of text.matchAll(ISSUED_KEY_SHAPE)) {
    const index = match.index ?? 0
    const where = locationOf(text, index, match[0].length)
    findings.push({
      check: 'key_in_text',
      severity: 'refused',
      where,
      says: `A value shaped exactly like a key this office issues — 64 hexadecimal characters — ${whereItSits(where)}. Not printed here.`,
    })
  }
  return findings
}

// ============================================================================ S3. a home-directory path

/** Punctuation a sentence puts after a path, never part of the path itself. */
function withoutTrailingPunctuation(value: string): string {
  let out = value
  while (out.length > 1 && /[,.;:!?)\]}'"]$/.test(out)) out = out.slice(0, -1)
  return out
}

function homeDirectoryFindings(text: string, homeDir: string, platform: string): ScreeningFinding[] {
  const findings: ScreeningFinding[] = []
  for (const match of text.matchAll(theAbsolutePathsInAText(platform))) {
    const index = match.index ?? 0
    const candidate = withoutTrailingPunctuation(match[0])
    if (candidate.length <= 1) continue
    if (!isAtOrUnder(candidate, homeDir, platform)) continue
    const where = locationOf(text, index, candidate.length)
    findings.push({
      check: 'home_directory_path',
      severity: 'refused',
      where,
      says: `An absolute path under the home directory, "${candidate}", ${whereItSits(where)}.`,
    })
  }
  return findings
}

// ============================================================================ S4. names

/**
 * A practical email pattern — not a full RFC 5322 parser, which this product has no other use for
 * — good enough to find what a person would recognise as an email address in prose.
 */
const EMAIL_ADDRESS = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

function emailFindings(text: string): ScreeningFinding[] {
  const findings: ScreeningFinding[] = []
  for (const match of text.matchAll(EMAIL_ADDRESS)) {
    const index = match.index ?? 0
    const where = locationOf(text, index, match[0].length)
    findings.push({
      check: 'email_address',
      severity: 'look_before_you_paste',
      where,
      says: `An email address, "${match[0]}", ${whereItSits(where)}. Not refused: look at it before you paste.`,
    })
  }
  return findings
}

function registeredPersonFindings(text: string, personName: string): ScreeningFinding[] {
  const trimmedName = personName.trim()
  if (trimmedName === '') return []
  const pattern = new RegExp(`\\b${asRegExpLiteral(trimmedName)}\\b`, 'gi')
  const findings: ScreeningFinding[] = []
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    const where = locationOf(text, index, match[0].length)
    findings.push({
      check: 'registered_person_name',
      severity: 'look_before_you_paste',
      where,
      says: `The registered person's name, "${match[0]}", ${whereItSits(where)}. Not refused: look at it before you paste.`,
    })
  }
  return findings
}

/**
 * THE ONE FINDING THAT IS ALWAYS THERE, HIT OR NO HIT. The ruling of 14 September 2026 (F16):
 * F16 is the public repository's rule and protects OTHER PEOPLE, and this office holds one person
 * and no roll of anybody else — so there is nothing to check another person's name against, and a
 * screen that claimed to check it would be claiming a protection it cannot give. This says so
 * instead, every time, so a reader can tell "nobody else's name is in this text" apart from
 * "nobody looked for one".
 */
function otherPeoplesNamesDisclosure(): ScreeningFinding {
  return {
    check: 'other_peoples_names',
    severity: 'look_before_you_paste',
    where: null,
    says:
      'Mole Office did not check this text for other people’s names: this office holds one person and no roll ' +
      'of other names. Look at it yourself before pasting it.',
  }
}

// ============================================================================ S5. saying what ran

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function readableCheckList(checks: readonly ScreenCheckName[]): string {
  return checks.map((check) => SCREEN_CHECKS[check].sentence.split('.')[0]).join('; ')
}

function summarize(findings: readonly ScreeningFinding[], ranChecks: readonly ScreenCheckName[]): string {
  const hits = findings.filter((f) => f.check !== 'other_peoples_names' && f.check !== 'check_incomplete')
  const incomplete = findings.filter((f) => f.check === 'check_incomplete')
  const ranNote = `Checks run: ${readableCheckList(ranChecks)}.`
  const incompleteNote = incomplete.length === 0 ? '' : ` ${String(incomplete.length)} check(s) could not finish; see their own findings.`
  if (hits.length === 0) {
    return `Mole Office found nothing to refuse or flag. ${ranNote}${incompleteNote}`
  }
  const refusedCount = hits.filter((f) => f.severity === 'refused').length
  const weakerCount = hits.length - refusedCount
  const parts = [
    refusedCount > 0 ? `${String(refusedCount)} that stop this text leaving` : null,
    weakerCount > 0 ? `${String(weakerCount)} to read before pasting, which stop nothing` : null,
  ].filter((p): p is string => p !== null)
  return `Mole Office found ${String(hits.length)} finding(s) in this text: ${parts.join(' and ')}. ${ranNote}${incompleteNote}`
}

// ============================================================================ the one export

/**
 * Read `text` — the words about to leave Mole Office, on their way to an outside chat window or a
 * person — and answer what was found in it. Changes nothing. Reports.
 */
export function screenWhatWouldLeave(text: string, overrides: Partial<ScreeningDependencies> = {}): ScreeningAnswer {
  const deps: ScreeningDependencies = { ...DEFAULT_DEPENDENCIES, ...overrides }
  const findings: ScreeningFinding[] = []
  const ranChecks: ScreenCheckName[] = []

  // ---- S2. a key. Reading the office's own settings can fail; when it does, this check still ran
  // its shape half, and says plainly that it could not verify against the settings half rather than
  // silently reporting as if it had. Invariant 5: unknown is a real answer.
  let secretValues: readonly SecretSettingValue[] = []
  try {
    secretValues = deps.secretSettingValues()
  } catch (err) {
    findings.push({
      check: 'check_incomplete',
      severity: 'look_before_you_paste',
      where: null,
      says: `The key check could not read this office’s own settings (${message(err)}), so it cannot say a key-named setting’s value is not in this text. Look at it yourself before pasting it.`,
    })
  }
  findings.push(...keyFindings(text, secretValues))
  ranChecks.push('key_in_text')

  // ---- S3. an absolute path under the home directory. Same shape of guard: working out where the
  // home directory is can fail (Node documents `homedir()` as able to throw), and when it does this
  // check says so rather than reporting a clean run it never made.
  let homeDir: string | null = null
  try {
    homeDir = deps.homeDirectory()
  } catch (err) {
    findings.push({
      check: 'check_incomplete',
      severity: 'look_before_you_paste',
      where: null,
      says: `The home-directory check could not work out where the home directory is (${message(err)}), so it cannot say no path under it is in this text. Look at it yourself before pasting it.`,
    })
  }
  if (homeDir !== null) findings.push(...homeDirectoryFindings(text, homeDir, deps.platform))
  ranChecks.push('home_directory_path')

  // ---- S4. names.
  findings.push(...emailFindings(text))
  ranChecks.push('email_address')
  findings.push(...registeredPersonFindings(text, deps.registeredPersonName()))
  ranChecks.push('registered_person_name')
  findings.push(otherPeoplesNamesDisclosure())
  ranChecks.push('other_peoples_names')

  return { findings, ranChecks, summary: summarize(findings, ranChecks) }
}
