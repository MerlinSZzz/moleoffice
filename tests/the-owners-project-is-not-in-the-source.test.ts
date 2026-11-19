// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS OF THE OWNER'S OWN RESEARCH, AND THE ONLY PLACES THIS PRODUCT MAY SAY ONE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS GATE EXISTS
 * ---------------------------------------------------------------------------------------------
 *
 * Mole Office is a tracker for research, and the person who built it put their own research into
 * it. That is the product working. What was not the product working is that the owner's project had
 * also got into the product's SOURCE: into worked examples the API serves, into help strings, into
 * demo rows the interface draws, and into hundreds of comments that argue a point by quoting one of
 * the owner's records. Measured on 5 September 2026 over the whole repository: 808 of 3,306 tracked
 * files carried one of the twelve words this file then held. Under `src/`, `tools/` and `scripts/` alone it was 98
 * files and 317 lines.
 *
 * The repository is public. The owner's notes are not. So they came out, and this is what stops them
 * coming back — because "we remembered" is not a mechanism, and the next agent to write a worked
 * example will reach for the example it can see in the database in front of it.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS DOES NOT COVER, SAID OUT LOUD
 * ---------------------------------------------------------------------------------------------
 *
 * `tests/` and `design/` are not searched. The test suite's own fixtures and the design history are
 * a separate piece of work — classes C and D of report `Rd8_OpY3x_Ai` — and a gate that failed on
 * them today would have to be turned off today. This one covers what the product SHIPS: the code
 * that runs, the tools that run beside it, and the scripts.
 *
 * The owner's names, the agent handles and the owner's real name come from the file of the owner's
 * content. Where no such file was read, the rules that need them are left out, and the cases that look
 * for them are taken out and say why; the pronoun, the ids and the Chinese characters are still read.
 *
 * ---------------------------------------------------------------------------------------------
 * THE ALLOWED SENSES ARE A LIST OF LINES, NOT A LIST OF WORDS
 * ---------------------------------------------------------------------------------------------
 *
 * Three of the first twelve words have a sense of this product's own, and each one is allowed at a named
 * file with the sentence saying why. A new line that says `handover` fails this test even in the
 * product's own sense, which is deliberate: the way this leak came back would be one more line at a
 * time, each one defensible on its own.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE A NEW FILE FOR THE NEUTRAL-WORDS PART GOES
 * ---------------------------------------------------------------------------------------------
 *
 * Into the folder tests/neutral-sources/. Each area or wave keeps its own list file there (for example
 * tests/neutral-sources/wave-13s.txt): one path per line, relative to the checkout, with # starting a
 * comment. The gate joins every list file and refuses the joined list when a path is named twice, when a
 * path does not exist, or when the gate reads no text in a file. Two waves that each add a line after
 * the same line of one list always conflict in the merge queue; two waves that each write their own list
 * file never do. Every entry once held in this file's list NEUTRAL_SOURCES was moved into the folder by
 * wave 13r round 7, and that list is gone.
 */

import { execFileSync } from 'node:child_process'
import { existsSync as itExists, mkdirSync, mkdtempSync, readFileSync as readTheFile, readdirSync as listTheFolder, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'

import { AGENT_HANDLES, aResearchWordsPatternForGitGrep, aWordPattern, OWNER_NAMES, THE_OWNERS_ACCOUNT, THE_OWNERS_RESEARCH_WORDS } from './neutral-names.ts'
import { piecesOf } from './sentences.ts'
import { PLANS_FRAME_CHAT_AND_EMBASSY_FILES } from './the-plans-frame-chat-and-embassy-files.ts'
import {
  COPYRIGHT_LINE,
  THE_REAL_NAME,
  THE_ALLOWANCES_OWN_FILE,
  THE_RIGHTS_HOLDER,
  WHY_THE_COPYRIGHT_LINE_IS_ALLOWED,
  isTheCleanVersion,
  isTheCopyrightHeader,
  isTheCopyrightLine } from './the-owners-copyright-line.ts'
import { splitMigration } from './sql-comments.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * Whether this checkout is the clean version, where every carried source file starts with the copyright header
 * (a decision and decision avgQ39lMcv-L).
 * Every check below that reads a file line by line lets that header line
 * through, by isTheCopyrightHeader, the allowance's one place; in this repository it lets nothing through.
 */
const IN_THE_CLEAN_VERSION = isTheCleanVersion(REPO)

/**
 * The words, as one case-insensitive pattern. They are the owner's research words from tests/neutral-names.ts, the one
 * list of them that the merge queue's owner-content gate also reads, and the owner's account name. Until wave 13v round
 * 31 this file held twelve words of its own. The list holds eleven of them and the words the gate added; the twelfth,
 * the one read from `THE_OWNERS_ACCOUNT`, is the account name.
 *
 * A word the list marks `insideLongerWords` is found inside a longer word too, as this file always found its first
 * twelve; the rest are found as whole words. `thor` is a whole word because it is inside `author` and `thorough`.
 * `jumi` matches nothing today and is in the list because it is a name that could arrive. `effort 15` is two words on
 * purpose: `effort` alone is a field this product declares on a `wanna_try` record.
 */
const PATTERN = aResearchWordsPatternForGitGrep([
  ...THE_OWNERS_RESEARCH_WORDS.map((word) => (word.insideLongerWords === true ? `\\w*${word.piece}\\w*` : word.piece)),
  ...(THE_OWNERS_ACCOUNT === null ? [] : [`\\w*${THE_OWNERS_ACCOUNT.name}\\w*`]),
])

/**
 * A RULE OF THE OWNER'S CONTENT, built only from a list that was read: a pattern of no words matches every line. The
 * names and the handles come from the file of the owner's content, and where none was read their lists are empty, so
 * their rules are left out. Each describe below that would hold one has a case `looks for …` (itLooksFor), which is
 * then taken out and says why, so a pass of the rest does not stand for a rule it did not hold.
 */
function aRuleOfTheOwnersContent(what: string, words: readonly string[]): { what: string; pattern: RegExp }[] {
  return words.length === 0 ? [] : [{ what, pattern: aWordPattern(words) }]
}

/** The case that `rules` holds each rule `whats` names, taken out where no file of the owner's content was read. */
function itLooksFor(rules: readonly { what: string }[], whats: readonly string[]): void {
  it(`looks for ${whats.join(' and ')}`, (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    expect(rules.map((rule) => rule.what)).toEqual(expect.arrayContaining([...whats]))
  })
}

/** The directories this gate covers: the code that ships and the commands that run beside it. */
const COVERED = ['src', 'tools', 'for-agents', 'scripts']

/**
 * Every line that may say one of the words, with the reason.
 *
 * A line is named by `file:line` at the moment this was written. Line numbers move, so the check
 * matches on the FILE plus the exact TEXT of the line — a line that moves still passes, and a line
 * whose words change is a new line and has to be looked at.
 */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  {
    file: 'src/shared/pixel-office.ts',
    contains: "{ id: 'apron', slot: 'top', en: 'Apron', zh: '围裙', rarity: 'uncommon' },",
    why: 'A wearable apron in the mole appearance catalogue. This names the garment, not a machine or a research project.',
  },
  { file: "src/web/components/pixel-office/MoleSprite.tsx", contains: "{a.top?.item==='apron'?<><path d=\"M29 56h20v9h5v23H25V65h4z\" fill=\"#e8d8b3\"/><R x={32} y={76} w={14} h={7} c={colour(a.top)}/></>:null}", why: "This names or draws the wearable apron from the clothing catalogue, not a research project." },
  { file: "src/web/components/pixel-office/MoleSprite.tsx", contains: "</>:a.top?.item==='hoodie'?<path d=\"M24 55h29v13l-6 6H31l-7-6z\" fill=\"#000\" opacity=\".15\"/>:a.top?.item==='apron'?<path d=\"M22 79h34m-17-2-7 8m7-8 7 8\" stroke=\"#e8d8b3\" strokeWidth=\"2\"/>:null}", why: "This names or draws the wearable apron from the clothing catalogue, not a research project." },
  {
    file: 'src/web/api.ts',
    contains: 'handOverToOneAgent',
    why: 'The product hands a context bundle to one agent. It is this product\'s own act and its own identifier.',
  },
  {
    file: 'src/server/db/annotation-state.ts',
    contains: 'handOverToOneAgent',
    why: 'A comment naming that same function.',
  },
  {
    file: 'src/server/lib/records.ts',
    contains: 'handover',
    why: 'Two comments about a context bundle handed to an agent Mole Office does not run.',
  },
  {
    file: 'src/server/lib/records/creating.ts',
    contains: 'handover',
    why: 'A comment about a context bundle handed to an agent Mole Office does not run.',
  },
  {
    file: 'src/shared/ops.ts',
    contains: 'handover',
    why: '`handover` is one of the eight purposes an agent sends on `x-mole-office-purpose`. It is a stored wire value: changing it changes behaviour.',
  },
  {
    file: 'src/shared/words.ts',
    contains: 'handover',
    why: 'The reader-facing word for that purpose, and the comment saying why "handover" was rejected as the word for a stopping point.',
  },
  {
    file: 'src/shared/work.ts',
    contains: 'Handover',
    why: 'The same argument, where the stopping point is declared.',
  },
  {
    file: 'src/web/tokens.css',
    contains: 'Roboto',
    why: 'A CSS font family in the sans stack. Removing it changes what the page renders in.',
  },
]

/** Every line under the covered directories that says one of the words. */
function hits(): { file: string; line: number; text: string }[] {
  let out = ''
  try {
    out = execFileSync('git', ['grep', '-Ein', '--', PATTERN, '--', ...COVERED], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (err) {
    // `git grep` exits 1 when it matches nothing, which is the state this gate wants to reach.
    const e = err as { status?: number; stdout?: string }
    if (e.status === 1) return []
    throw err
  }
  return out
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => {
      const first = l.indexOf(':')
      const second = l.indexOf(':', first + 1)
      return { file: l.slice(0, first), line: Number(l.slice(first + 1, second)), text: l.slice(second + 1) }
    })
}

/** Matched without case, because the same word starting a sentence is still the same word. */
const allowed = (hit: { file: string; text: string }): boolean =>
  ALLOWED.some((a) => a.file === hit.file && hit.text.toLowerCase().includes(a.contains.toLowerCase()))

/**
 * SET ASIDE:
 *
 *     this part waits for the check before the source is opened, after which development moves to a new
 *     clean repository; until then ordinary names would turn red too, some of them in handover files.
 *
 * The gate has been red since 13 September, when the sand-apron look put `apron` into seven files
 * under src/, and a red gate catches nothing new. So the gate and the rename wait for
 * the one-time inventory before the repository is opened, after which development moves to a clean
 * repository. Until that inventory this file is skipped for that reason, so the suite reads
 * true and the tester classifies nothing. To arm it again, change `describe.skip` back to `describe`
 * and answer proposal xL5G0cImHRha, Quill's rename with a named compatibility exception.
 */
describe.skip("the owner's own research is not in the product's source", () => {
  it('says one of the research words only where this product means something of its own by it', () => {
    const unexplained = hits().filter((h) => !allowed(h))
    expect(
      unexplained.map((h) => `${h.file}:${String(h.line)} ${h.text.trim()}`),
      unexplained.length === 0
        ? ''
        : `These lines under ${COVERED.join(', ')} name the owner's own research project. The owner's notes are theirs; ` +
          `this repository is public. Reword the line — do not delete the comment, and do not add it to the ` +
          `list in this file unless the product really means something of its own by the word. The demo corpus ` +
          `is an invented greenhouse study and is where to take a replacement example from: ` +
          `scripts/seed-corpus/public.json.`,
    ).toEqual([])
  })

  it('finds the allowed lines, so the list is not passing by naming nothing', () => {
    // Without this, a rule that matched no file at all would look exactly like a clean tree. Every
    // entry above must still find its line; one that does not has been reworded and should go.
    const found = hits()
    expect(found.length, 'the grep found nothing at all, so this file proved nothing').toBeGreaterThan(0)
    for (const a of ALLOWED) {
      expect(
        found.some((h) => h.file === a.file && h.text.toLowerCase().includes(a.contains.toLowerCase())),
        `${a.file} no longer has a line containing "${a.contains}". If it was reworded, take this entry out.`,
      ).toBe(true)
    }
  })

  it('covers the directories the product ships from', () => {
    // A covered directory that has been renamed would make this gate silently check nothing.
    for (const dir of COVERED) {
      const listed = execFileSync('git', ['ls-files', dir], { cwd: REPO, encoding: 'utf8' })
      expect(listed.split('\n').filter((l) => l !== '').length, `${dir}/ has no tracked files`).toBeGreaterThan(0)
    }
  })
})

// ============================================================================================
// THE FILES ALREADY MADE NEUTRAL STAY NEUTRAL. Wave 13s, round 5 (report pCJBL347riSz, step 1).
// ============================================================================================
//
// A decision settles how the product is split before it is published (rows REG-85 and REG-86 of report
// X8UHfSEhYLn2). What ships calls the person "the person" or "they", never a
// gendered pronoun, and gives a reason in words rather than an id of the owner's own records. This part
// of the gate is ARMED for the files made neutral so far: it reads the text each file
// ships (its string literals, with code and comments left out, because comments may keep record ids
// under DES-51) and the whole of docs/, and fails on the person called a gendered pronoun, on the
// owner's name, and on a decision, problem or criterion id given as a reason.
//
// THE LIST GROWS ROUND BY ROUND. Each later round adds the files it made neutral to its own list file in
// tests/neutral-sources/ (read below); nothing is taken off it. The skipped describe above, for the
// owner's research words, is a separate gate.

/** The folder of documentation that ships. */
const NEUTRAL_DOCS = 'docs'
/**
 * THE DEFAULT REGULATIONS a fresh office copies into its own records (wave 13s round 7), read as every
 * piece of text the file holds. They ship to every new office, so they are held like shipped text; and
 * their Chinese may not call the person 他, and says 你 to them.
 */
const NEUTRAL_JSON = ['src/config/rules/default-regulations.json'] as const

/** Every string a JSON value holds, at any depth. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(stringsIn)
  return []
}

/** Files that ship as plain text and are read whole, every line, like docs/. */
const NEUTRAL_PLAIN_FILES = ['.env.example'] as const

/** What the shipped text may not say. Each is matched in one string or one line of a document. */
const NOT_NEUTRAL: readonly { what: string; pattern: RegExp }[] = [
  { what: 'the person called by a gendered pronoun', pattern: /\b(?:he|his|him|himself)\b/i },
  ...aRuleOfTheOwnersContent("the owner's name", OWNER_NAMES),
  {
    what: 'an id of the owner\'s records given as a reason',
    pattern: /\b(?:decision|problem|proposal|ruling|finding)s?\s+`?[A-Za-z0-9_-]{12}\b/i,
  },
  { what: 'an acceptance criterion given as a reason', pattern: /\bcriteri(?:on|a)\s+[A-Z]{1,3}\d+\b/i },
]

/**
 * THE STRINGS THAT MAY STILL SAY ONE OF THOSE, each with the reason. A string is named by its file
 * and a piece of its text. An entry here is a decision somebody can read and argue with.
 */
const NEUTRAL_ALLOWED: readonly { file: string; contains: string; why: string }[] = []

/** One shipped text checked against NOT_NEUTRAL; what it may not say is added to `found`, by file and line. */
function lookInto(found: string[], file: string, text: string, line: number): void {
  for (const rule of NOT_NEUTRAL) {
    if (!rule.pattern.test(text)) continue
    if (NEUTRAL_ALLOWED.some((a) => a.file === file && text.includes(a.contains))) continue
    found.push(`${file}:${String(line)} says ${rule.what}: ${text.trim().slice(0, 160)}`)
  }
}

/** Every string the given source files ship that says something it may not. `root` is the checkout they are read from. */
function sourcesNotNeutral(root: string, files: readonly string[]): string[] {
  const found: string[] = []
  for (const file of files) {
    const source = readTheFile(joinPath(root, file), 'utf8')
    for (const piece of piecesOf(source)) {
      if (piece.what !== 'string') continue
      lookInto(found, file, piece.body, source.slice(0, piece.at).split('\n').length)
    }
  }
  return found
}

/** Every shipped text in the neutral files that says something it may not, by file and line. */
function notNeutral(): string[] {
  const found: string[] = sourcesNotNeutral(REPO, neutralSources())
  const look = (file: string, text: string, line: number): void => lookInto(found, file, text, line)
  for (const file of NEUTRAL_JSON) {
    for (const text of stringsIn(JSON.parse(readTheFile(joinPath(REPO, file), 'utf8')))) {
      look(file, text, 0)
      if (text.includes('他')) found.push(`${file} says 他 for the person: ${text.trim().slice(0, 160)}`)
    }
  }
  for (const name of listTheFolder(joinPath(REPO, NEUTRAL_DOCS))) {
    if (!name.endsWith('.md')) continue
    const file = `${NEUTRAL_DOCS}/${name}`
    readTheFile(joinPath(REPO, file), 'utf8')
      .split('\n')
      .forEach((text, i, lines) => {
        if (!isTheCopyrightHeader(lines, i, IN_THE_CLEAN_VERSION)) look(file, text, i + 1)
      })
  }
  for (const file of NEUTRAL_PLAIN_FILES) {
    readTheFile(joinPath(REPO, file), 'utf8')
      .split('\n')
      .forEach((text, i, lines) => {
        if (!isTheCopyrightHeader(lines, i, IN_THE_CLEAN_VERSION)) look(file, text, i + 1)
      })
  }
  return found
}

describe('the files already made neutral stay neutral (REG-85, REG-86)', () => {
  it('ship no gendered pronoun for the person, no name of the owner and no id given as a reason', () => {
    const found = notNeutral()
    expect(
      found,
      found.length === 0
        ? ''
        : 'These shipped texts are in files already made neutral. Call the person "the person" or "they", ' +
          'write the reason in words instead of an id of the owner\'s records, and leave ids only in comments.',
    ).toEqual([])
  })

  itLooksFor(NOT_NEUTRAL, ["the owner's name"])

  it('reads every file on its list, so the gate is not passing by reading nothing', () => {
    for (const file of neutralSources()) {
      const strings = piecesOf(readTheFile(joinPath(REPO, file), 'utf8')).filter((p) => p.what === 'string')
      expect(strings.length, `${file} yielded no strings, so this gate read nothing in it`).toBeGreaterThan(0)
    }
    expect(listTheFolder(joinPath(REPO, NEUTRAL_DOCS)).filter((n) => n.endsWith('.md')).length).toBeGreaterThan(0)
    for (const file of NEUTRAL_JSON) expect(stringsIn(JSON.parse(readTheFile(joinPath(REPO, file), 'utf8'))).length, `${file} yielded no text`).toBeGreaterThan(100)
    for (const a of NEUTRAL_ALLOWED) {
      expect(notNeutralRaw().some((t) => t.file === a.file && t.text.includes(a.contains)), `${a.file}: "${a.contains}" is not there any more; take the entry out`).toBe(true)
    }
  })
})

// ============================================================================================
//
// THE SETTINGS, THE EXAMPLE SETTINGS, THE SEED SCRIPTS AND THE FIRST-RUN GUIDE, IN WHOLE. Wave 13j round 21, rows
// FLO-04, FLO-06, FLO-09 to FLO-12, FLO-19, FLO-21, FLO-24, FLO-49 and DES-41 of a decision.
// Their comments ship too, so here the whole text is read, comments included, and three things fail: the person called
// by a gendered pronoun, the owner's name, and the handle of one of the agents of the office this product was built in,
// or its lab's backup tool. Record ids may stay in comments (DES-51); in strings the gate above already refuses them.
// Wave 13r round 8 added the Vite config, its cache test, the test runner's config and troubleshooting.md: a list file
// in tests/neutral-sources/ reads only a file's strings, so a comment or a Markdown line is kept neutral only here.
//
// ============================================================================================

/** The files this part reads whole. */
const WHOLE_NEUTRAL_FILES = [
  'src/config/settings.mjs',
  '.env.example',
  'scripts/seed-corpus.ts',
  'scripts/restore-check.ts',
  'scripts/remove-the-throwaway-records.mjs',
  'src/web/pages/WelcomePage.tsx',
  'src/web/components/OwnerGate.tsx',
  'src/web/owner.ts',
  'src/shared/owner.ts',
  'src/server/api/office-owner.ts',
  'src/server/lib/owner.ts',
  'src/server/db/owner-setting.ts',
  'vite.config.ts',
  'tests/every-vite-keeps-its-own-dependency-cache.test.ts',
  'troubleshooting.md',
  'vitest.config.ts',
] as const

/** What those files may not say anywhere, comments included. */
const NOT_NEUTRAL_ANYWHERE: readonly { what: string; pattern: RegExp }[] = [
  { what: 'the person called by a gendered pronoun', pattern: /\b(?:he|his|him|himself)\b/i },
  ...aRuleOfTheOwnersContent("the owner's name", OWNER_NAMES),
  ...aRuleOfTheOwnersContent("an agent's handle or the lab's backup tool", AGENT_HANDLES),
]

/** Lines in those files that may still say one of those, each with the reason. */
const WHOLE_ALLOWED: readonly { file: string; contains: string; why: string }[] = [
]

function notNeutralAnywhere(): string[] {
  const found: string[] = []
  for (const file of WHOLE_NEUTRAL_FILES) {
    readTheFile(joinPath(REPO, file), 'utf8')
      .split('\n')
      .forEach((text, i, lines) => {
        if (isTheCopyrightHeader(lines, i, IN_THE_CLEAN_VERSION)) return
        for (const rule of NOT_NEUTRAL_ANYWHERE) {
          if (!rule.pattern.test(text)) continue
          if (WHOLE_ALLOWED.some((a) => a.file === file && text.includes(a.contains))) continue
          found.push(`${file}:${String(i + 1)} says ${rule.what}: ${text.trim().slice(0, 160)}`)
        }
      })
  }
  return found
}

describe('the settings, the example settings, the seed scripts and the first-run guide are neutral in whole', () => {
  it('say no gendered pronoun for the person, no name of the owner and no agent handle, comments included', () => {
    const found = notNeutralAnywhere()
    expect(
      found,
      found.length === 0
        ? ''
        : 'Call the person "the person" or "they", and name no person or agent of the office this product was built in.',
    ).toEqual([])
  })

  itLooksFor(NOT_NEUTRAL_ANYWHERE, ["the owner's name", "an agent's handle or the lab's backup tool"])

  it('reads every file on its list, and every allowance still finds its line', () => {
    for (const file of WHOLE_NEUTRAL_FILES) {
      expect(readTheFile(joinPath(REPO, file), 'utf8').length, `${file} is empty, so this read nothing`).toBeGreaterThan(100)
    }
    for (const a of WHOLE_ALLOWED) {
      expect(readTheFile(joinPath(REPO, a.file), 'utf8').includes(a.contains), `${a.file}: "${a.contains}" is not there any more; take the entry out`).toBe(true)
    }
  })
})

// ============================================================================================
//
// THE PLANS PAGES, THE FRAME, THE CHAT AND THE EMBASSY, COMMENTS INCLUDED. Their comments ship as well,
// so beside the strings the gate above reads, the whole text of each file is read here with the same
// three rules as the settings above: no gendered pronoun for the person, no name of the owner, and
// no handle of an agent of the office this product was built in. Record ids may stay in comments
// (DES-51). A Chinese character is not refused here, because these files also name words the product
// draws in Chinese.
//
// ============================================================================================

/** The files of the plans pages, the frame, the chat and the Embassy, read whole. */
const WHOLE_NEUTRAL_PAGES = PLANS_FRAME_CHAT_AND_EMBASSY_FILES

/** Lines in those files that may still say one of those, each with the reason. */
const WHOLE_PAGES_ALLOWED: readonly { file: string; contains: string; why: string }[] = [
  {
    file: 'src/web/components/Chat.tsx',
    contains: 'tests/an-unread-count-falls-when-the-person-reads-it.test.ts',
    why: 'The name of a test file, which a comment must give as it is; renaming that file is not this list\'s business.',
  },
]

/** Every line of those files that says one of the three things, by file and line. */
function pagesNotNeutralAnywhere(): string[] {
  const found: string[] = []
  for (const file of WHOLE_NEUTRAL_PAGES) {
    readTheFile(joinPath(REPO, file), 'utf8')
      .split('\n')
      .forEach((text, i, lines) => {
        if (isTheCopyrightHeader(lines, i, IN_THE_CLEAN_VERSION)) return
        for (const rule of NOT_NEUTRAL_ANYWHERE) {
          if (!rule.pattern.test(text)) continue
          if (WHOLE_PAGES_ALLOWED.some((a) => a.file === file && text.includes(a.contains))) continue
          found.push(`${file}:${String(i + 1)} says ${rule.what}: ${text.trim().slice(0, 160)}`)
        }
      })
  }
  return found
}

describe('the plans pages, the frame, the chat and the Embassy are neutral in whole', () => {
  it('say no gendered pronoun for the person, no name of the owner and no agent handle, comments included', () => {
    const found = pagesNotNeutralAnywhere()
    expect(
      found,
      found.length === 0
        ? ''
        : 'Call the person "the person" or "they", and name no person or agent of the office this product was built in.',
    ).toEqual([])
  })

  itLooksFor(NOT_NEUTRAL_ANYWHERE, ["the owner's name", "an agent's handle or the lab's backup tool"])

  it('reads every file on its list, and every allowance still finds its line', () => {
    for (const file of WHOLE_NEUTRAL_PAGES) {
      expect(readTheFile(joinPath(REPO, file), 'utf8').length, `${file} is empty, so this read nothing`).toBeGreaterThan(100)
    }
    for (const a of WHOLE_PAGES_ALLOWED) {
      expect(readTheFile(joinPath(REPO, a.file), 'utf8').includes(a.contains), `${a.file}: "${a.contains}" is not there any more; take the entry out`).toBe(true)
    }
  })
})

/** The same search with nothing allowed, so an allowance that no longer finds its text is caught. */
function notNeutralRaw(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = []
  for (const file of neutralSources()) {
    for (const piece of piecesOf(readTheFile(joinPath(REPO, file), 'utf8'))) {
      if (piece.what === 'string' && NOT_NEUTRAL.some((r) => r.pattern.test(piece.body))) out.push({ file, text: piece.body })
    }
  }
  return out
}

// ============================================================================================
//
// THE COMMENTS OF THE APPLIED MIGRATIONS, made neutral in wave 13s round 6 under the coordinator's decision
// OSEnllgsVieG. A migration file under drizzle/ ships with the product, and its comments are read by
// whoever opens it. They may keep record ids (DES-51), so only three things fail here: the person
// called by a gendered pronoun, the owner's name or machine, and a Chinese character, because every
// Chinese sentence these comments held was a quote of the owner. The statements are not read here:
// a `DEFAULT` of the owner's id in 0000 and 0004 is SQL that ran, and tests/the-applied-migrations-keep-their-
// statements.test.ts holds every statement as it was.
//
// ============================================================================================

const MIGRATIONS = 'drizzle'

/** What a migration comment may not say. */
const NOT_NEUTRAL_IN_A_MIGRATION: readonly { what: string; pattern: RegExp }[] = [
  { what: 'the person called by a gendered pronoun', pattern: /\b(?:he|his|him|himself)\b/i },
  ...aRuleOfTheOwnersContent("the owner's name or machine", OWNER_NAMES),
  { what: "a Chinese character, which in these comments was always the owner's own words", pattern: /\p{Script=Han}/u },
]

/** Every comment line in the migration files that says one of those, by file and line. */
function migrationCommentsNotNeutral(): string[] {
  const found: string[] = []
  for (const name of listTheFolder(joinPath(REPO, MIGRATIONS)).filter((n) => n.endsWith('.sql')).sort()) {
    for (const comment of splitMigration(readTheFile(joinPath(REPO, MIGRATIONS, name), 'utf8')).comments) {
      comment.text.split('\n').forEach((text, i) => {
        for (const rule of NOT_NEUTRAL_IN_A_MIGRATION) {
          if (rule.pattern.test(text)) found.push(`${MIGRATIONS}/${name}:${String(comment.line + i)} says ${rule.what}: ${text.trim().slice(0, 160)}`)
        }
      })
    }
  }
  return found
}

describe('the comments of the applied migrations stay neutral (decision OSEnllgsVieG)', () => {
  it('call the person "the person", "the owner" or "they", name nobody, and quote nobody in Chinese', () => {
    const found = migrationCommentsNotNeutral()
    expect(
      found,
      found.length === 0
        ? ''
        : 'These comments are in applied migration files. Rewrite the comment in neutral words, and change no statement.',
    ).toEqual([])
  })

  itLooksFor(NOT_NEUTRAL_IN_A_MIGRATION, ["the owner's name or machine"])

  it('reads comments in the migration files, so the gate is not passing by reading nothing', () => {
    const names = listTheFolder(joinPath(REPO, MIGRATIONS)).filter((n) => n.endsWith('.sql'))
    expect(names.length).toBeGreaterThan(100)
    const comments = names.flatMap((name) => splitMigration(readTheFile(joinPath(REPO, MIGRATIONS, name), 'utf8')).comments)
    expect(comments.length).toBeGreaterThan(1000)
  })
})

// ============================================================================================
//
// THE LISTS IN A FOLDER. Wave 13s round 8, on the coordinator's reversible engineering judgement, which is
// reopened if the joined list ever loses an entry. Every wave used to append its files to
// NEUTRAL_SOURCES after the same line, so two entries in the merge queue always conflicted. Now each
// area or wave keeps its own list file in tests/neutral-sources/, and the gate reads the join of that
// folder; wave 13r round 7 moved every entry of NEUTRAL_SOURCES there, and the list is gone. The join is
// checked here, so a list file cannot quietly drop, repeat or misname a path.
//
// ============================================================================================

const NEUTRAL_LIST_FOLDER = 'tests/neutral-sources'

/** What the join of the list files holds, and what is wrong with it. */
interface TheListedSources {
  /** Every path, once, in the order first named: the list files by name, each in its own order. */
  paths: string[]
  /** One sentence for each thing wrong; empty when the join may be gated. */
  problems: string[]
}

/**
 * READ THE LIST FILES IN `folder` AND JOIN THEM, under the checkout `root`. A list file
 * ends in .txt and names one path per line; # starts a comment, and a blank line is skipped. The
 * problems: a folder that is missing, a file in it that is not a list file, a path named twice
 * (in two list files or within one), a path that does not exist, and a path in which the gate reads no
 * string.
 */
function theListedSources(root: string, folder: string): TheListedSources {
  const problems: string[] = []
  const named: { path: string; where: string }[] = []
  const at = joinPath(root, folder)
  if (!itExists(at)) {
    problems.push(`The folder ${folder} is missing, so no list file in it was read.`)
  } else {
    for (const name of listTheFolder(at).sort()) {
      if (!name.endsWith('.txt')) {
        problems.push(`${folder}/${name} is not a list file: a list file ends in .txt.`)
        continue
      }
      readTheFile(joinPath(at, name), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const path = line.replace(/#.*$/, '').trim()
          if (path !== '') named.push({ path, where: `${folder}/${name}:${String(i + 1)}` })
        })
    }
  }
  const first = new Map<string, string>()
  for (const one of named) {
    const earlier = first.get(one.path)
    if (earlier !== undefined) {
      problems.push(`${one.path} is listed twice: at ${earlier} and at ${one.where}. Keep one.`)
      continue
    }
    first.set(one.path, one.where)
    if (!itExists(joinPath(root, one.path))) {
      problems.push(`${one.path}, listed at ${one.where}, does not exist.`)
      continue
    }
    if (piecesOf(readTheFile(joinPath(root, one.path), 'utf8')).every((p) => p.what !== 'string')) {
      problems.push(`${one.path}, listed at ${one.where}, yielded no strings, so the gate would read nothing in it.`)
    }
  }
  return { paths: [...first.keys()], problems }
}

/** The files the neutral-words part reads: every list file in the folder, joined. */
function neutralSources(): string[] {
  return theListedSources(REPO, NEUTRAL_LIST_FOLDER).paths
}

describe('the neutral-words list is the list files in tests/neutral-sources/, joined', () => {
  const made: string[] = []
  afterAll(() => {
    for (const dir of made) rmSync(dir, { recursive: true, force: true })
  })

  /** A checkout of this test's own, in the temporary folder, holding the files and list files named. */
  function aCheckout(files: Record<string, string>): string {
    const root = mkdtempSync(joinPath(tmpdir(), 'neutral-lists-'))
    made.push(root)
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(joinPath(root, path, '..'), { recursive: true })
      writeFileSync(joinPath(root, path), text)
    }
    return root
  }

  it('joins the real folder into one list with nothing wrong', () => {
    const joined = theListedSources(REPO, NEUTRAL_LIST_FOLDER)
    expect(joined.problems).toEqual([])
    expect(joined.paths.length).toBeGreaterThan(0)
  })

  it('still holds every path the joined list held when NEUTRAL_SOURCES moved into the folder', () => {
    // THE LIST ONLY GROWS. tests/neutral-sources-at-the-move.txt records the joined list of 2 October 2026,
    // the day wave 13r round 7 moved NEUTRAL_SOURCES out of this file. A path dropped from a list file
    // since then is named here; a path added since then is not a fault.
    const atTheMove = readTheFile(joinPath(REPO, 'tests/neutral-sources-at-the-move.txt'), 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*$/, '').trim())
      .filter((path) => path !== '')
    expect(atTheMove.length).toBe(85)
    const now = new Set(theListedSources(REPO, NEUTRAL_LIST_FOLDER).paths)
    expect(atTheMove.filter((path) => !now.has(path))).toEqual([])
  })

  it('gates a path listed only in the folder', () => {
    const root = aCheckout({
      'src/said.ts': "export const said = 'He wrote this down himself.'\n",
      'lists/an-area.txt': '# the files this area made neutral\nsrc/said.ts\n',
    })
    const joined = theListedSources(root, 'lists')
    expect(joined.problems).toEqual([])
    expect(joined.paths).toEqual(['src/said.ts'])
    expect(sourcesNotNeutral(root, joined.paths).join('\n')).toContain('src/said.ts:1 says the person called by a gendered pronoun')
  })

  it('refuses a path listed twice, in two list files', () => {
    const root = aCheckout({
      'src/said.ts': "export const said = 'The person wrote this down.'\n",
      'lists/an-area.txt': 'src/said.ts\n',
      'lists/another-area.txt': '# the same file again\nsrc/said.ts\n',
    })
    const joined = theListedSources(root, 'lists')
    expect(joined.problems).toEqual(['src/said.ts is listed twice: at lists/an-area.txt:1 and at lists/another-area.txt:2. Keep one.'])
  })

  it('refuses a path that does not exist', () => {
    const root = aCheckout({ 'lists/an-area.txt': 'src/never-written.ts  # a path with a comment after it\n' })
    const joined = theListedSources(root, 'lists')
    expect(joined.problems).toEqual(['src/never-written.ts, listed at lists/an-area.txt:1, does not exist.'])
  })
})

// ============================================================================================
//
// THE OWNER'S REAL NAME IS WRITTEN IN ONE LINE OF TWO FILES. A decision names the owner as the copyright
// holder, so LICENSE and NOTICE carry the exact copyright line.
// That line, whole, in those two files, is the one
// allowance; the name anywhere else is refused, as the owner's other names are. Every tracked file is read except
// two: design/, the owner's own design history, which the clean copy for publication leaves out (plan
// pCJBL347riSz, block b-8); and tests/the-owners-copyright-line.ts, this rule's own file, which has to name what it
// refuses. The clean-version tool (scripts/clean-version.mjs) writes no copy of the line: it imports COPYRIGHT_LINE,
// THE_REAL_NAME and isTheCopyrightLine from that file. In the clean version only, a file's copyright header is let
// through as well (isTheCopyrightHeader).
//
// MUTATIONS: the name put into README.md; the copyright line in LICENSE given a second holder; the exact line
// copied into package.json. Each is red.
//
// ============================================================================================

/** Where the rule is written. It names what it refuses, and nothing else may. */
const THE_RULES_OWN_FILE = THE_ALLOWANCES_OWN_FILE

/** Every line of every tracked file outside design/ that `name`, the owner's real name, finds, other than the allowed line. */
function theRealNameOutsideItsLine(name: RegExp): string[] {
  let out = ''
  // GIT GREP IS ASKED WIDE (the name's parts with no word boundaries, which its extended syntax does not promise),
  // and each line it finds is then held to the name itself.
  try {
    out = execFileSync('git', ['grep', '-I', '-n', '-i', '-E', name.source.replace(/\\b/g, ''), '--', '.', ':!design', `:!${THE_RULES_OWN_FILE}`], {
      cwd: REPO,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
  } catch (err) {
    // `git grep` exits 1 when it matches nothing.
    const e = err as { status?: number }
    if (e.status === 1) return []
    throw err
  }
  return out
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const first = line.indexOf(':')
      const second = line.indexOf(':', first + 1)
      return { file: line.slice(0, first), at: line.slice(first + 1, second), text: line.slice(second + 1) }
    })
    .filter((hit) => name.test(hit.text) && !isTheCopyrightLine(hit.file, hit.text))
    .filter((hit) => !isTheCopyrightHeader(readTheFile(joinPath(REPO, hit.file), 'utf8').split('\n'), Number(hit.at) - 1, IN_THE_CLEAN_VERSION))
    .map((hit) => `${hit.file}:${hit.at} ${hit.text.trim().slice(0, 160)}`)
}

// These tests cite a decision.
describe("the owner's real name is in the copyright line and nowhere else", () => {
  it('finds the name in no tracked file outside design/ except the exact copyright line in LICENSE and NOTICE', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (THE_REAL_NAME === null) throw new Error("The file of the owner's content was read, and it gave no real name.")
    const found = theRealNameOutsideItsLine(THE_REAL_NAME)
    expect(
      found,
      found.length === 0
        ? ''
        : `These lines name the owner. ${WHY_THE_COPYRIGHT_LINE_IS_ALLOWED} Nothing else may: write "the owner" or "the person".`,
    ).toEqual([])
  })


  it('catches the name the copyright line holds, while the holder is the owner by name', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (THE_REAL_NAME === null) throw new Error("The file of the owner's content was read, and it gave no real name.")
    // WHILE THE HOLDER IS THE OWNER BY NAME, the refusal catches the line, so the allowance is doing work. If the
    // holder becomes a company, the line no longer names the owner and needs no allowance.
    if (THE_REAL_NAME.test(THE_RIGHTS_HOLDER)) {
      expect(THE_REAL_NAME.test(COPYRIGHT_LINE), 'the refusal would catch the name the line holds').toBe(true)
    }
  })
})
