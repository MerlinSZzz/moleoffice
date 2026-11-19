// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TOOLSET CATALOGUE: ITS WORDS, ITS MANUAL PAGE AND ITS USE LINE, DECLARED ONCE.
 *
 * The catalogue is two kinds of record, `tool_category` and `tool` (src/shared/kinds.ts), and three
 * doors (src/server/api/toolset.ts). This file holds what both the kinds and the doors read, so the
 * words a record may hold and the words a door filters by are one list each (USER.md, invariant 9).
 *
 * Where it comes from: the toolset draft, report i69HYz8BQhSx, revision 2, and its agreement;
 * piece P1 of plan KP0udNekYcAo; that the catalogue's records live in the office; and, at point d of
 * decision Vt0GdSlApWce, that a use of a tool writes one line against the calling run and never a record of its
 * own. Since wave 13s round 33
 * that line is a row in the `tool_uses` table, keyed by the run, and not part of the run's record.
 *
 * NOTHING HERE REACHES A DATABASE OR THE FILE SYSTEM. The browser loads src/shared too.
 */

/** Who a tool is for. 'users' use the office without developing it; 'developers' develop it. */
export const TOOL_AUDIENCES = ['users', 'developers', 'both'] as const
export type ToolAudience = (typeof TOOL_AUDIENCES)[number]

/** The two words `GET /api/toolset?who=` takes. Each keeps its own tools and the tools for both. */
export const TOOLSET_READERS = ['users', 'developers'] as const
export type ToolsetReader = (typeof TOOLSET_READERS)[number]

/** Whether a tool for `forWhom` is listed for a reader who asked `who`. No `who` lists every tool. */
export function isForThisReader(forWhom: unknown, who: ToolsetReader | null): boolean {
  if (who === null) return true
  return forWhom === who || forWhom === 'both'
}

/**
 * What an entry is. A 'service' is something outside that the office calls with its own key. A
 * 'part of the office' entry is a how-to page for one foundation part, and it names no category.
 */
export const TOOL_ENTRIES = ['tool', 'service', 'part of the office'] as const
export type ToolEntry = (typeof TOOL_ENTRIES)[number]

/** The entry word for a how-to page about a foundation part. */
export const PART_OF_THE_OFFICE: ToolEntry = 'part of the office'

/** Where an entry's code is kept. */
export const TOOL_KEPT = ['in this repository', 'elsewhere'] as const
export type ToolKept = (typeof TOOL_KEPT)[number]

/** The word for an entry kept in this repository, whose `location` is a path in the checkout. */
export const KEPT_HERE: ToolKept = 'in this repository'

/** Whether an entry does what it says yet. The catalogue never makes a planned tool look finished. */
export const TOOL_STATES = ['built', 'not built yet'] as const
export type ToolState = (typeof TOOL_STATES)[number]

/** The word for an entry that does what it says. */
export const BUILT: ToolState = 'built'

/** What a slug may hold: lowercase letters, digits and hyphens, and no hyphen at either end. */
export const TOOL_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

/** The most characters one use line may hold. */
export const TOOL_USE_MOST_CHARACTERS = 300

/**
 * The key on a run's record that held its use lines until migration 0231 moved them into `tool_uses`. No record
 * holds it now, and every write that names it is refused. It is kept as a name because old revisions and change
 * rows still carry it.
 */
export const TOOL_USES_FIELD = 'toolUses'

/**
 * THE FIELD OF THE CHANGE ROW ONE USE WRITES (problem mR8vNPOVNQ_p). The row's old value is empty and
 * its new value is the one line the use added, so a run with n uses writes n lines into the change log
 * and not about n squared. `[+]` says the row is an append: the list after it is the list before it
 * with the new value added at the end. A row whose field is `data.toolUses` holds the whole list on
 * each side, as every use wrote it until round 32 of wave 13s; those rows are kept as they are. Since
 * round 33 a use writes no change row at all, so no new row carries either field.
 */
export const TOOL_USE_APPENDED_FIELD = `data.${TOOL_USES_FIELD}[+]`

/** The one door that writes a run's use lines, as a caller writes it. */
export const THE_USE_DOOR = 'POST /api/toolset/uses'

/** The door that reads a run's uses, newest first, a page at a time. */
export const THE_USES_READ = 'GET /api/toolset/runs/<run id>/uses'

/** The refusal of a write that puts use lines on a run's record. */
export const ONLY_THE_USE_DOOR_WRITES_TOOL_USES =
  `A run's uses are not kept in its record, so data.${TOOL_USES_FIELD} may not be written. Each use is one row, ` +
  `written by ${THE_USE_DOOR} and read by ${THE_USES_READ}. Nothing was written.`

/** How many uses one page of GET /api/toolset/runs/:run/uses holds when the caller does not say, and at most. */
export const TOOL_USES_PAGE = 50
export const TOOL_USES_PAGE_MOST = 500

/**
 * A NAMED RUN'S RESULT FOR EACH TEST FILE (wave 13n, message Vue3ni42wa94: a table, not a column, migration
 * 0279). A use of `named-tests` may carry `files` and `tree` beside its line, and the use door stores one row per file
 * in `test_file_runs`. tools/run-named-tests.mjs makes the values and the door checks them, both from these constants.
 */
/** The one tool whose use may carry test file results. */
export const THE_TEST_FILES_TOOL = 'named-tests'
/** A file's result: vitest's own status for it, or `no result` when its report did not give one. */
export const TEST_FILE_RESULTS = ['passed', 'failed', 'no result'] as const
export type TestFileResult = (typeof TEST_FILE_RESULTS)[number]
/** The most files one use may carry. */
export const TEST_FILES_IN_A_USE_MOST = 5000
/** The most calendar days one window of GET /api/toolset/named-tests/files may span. */
export const TEST_FILES_WINDOW_MOST_DAYS = 31
/** The most characters a file's path may hold. */
export const TEST_FILE_PATH_MOST_CHARACTERS = 300
/** How many lowercase hex characters of a SHA-256 a test file's hash and a tree's change hash keep. */
export const TEST_HASH_CHARACTERS = 16
/** A tree's change when the checkout differs from its HEAD in nothing and holds no untracked file git does not ignore. */
export const NO_UNCOMMITTED_CHANGE = 'none'

/** One use of a tool: when, which tool, and what it did. */
export interface ToolUse {
  /** When the use was written, the office's local wall-clock stamp. */
  at: string
  /** The slug of the tool used. */
  tool: string
  /** What the use did, in one line of at most TOOL_USE_MOST_CHARACTERS characters. */
  said: string
}

/** One use as the `tool_uses` table holds it and GET /api/toolset/runs/:run/uses answers it. */
export interface StoredToolUse extends ToolUse {
  /** Its place on its run, from 1, in the order the uses were written. */
  seq: number
  /** Who wrote it, or null on a use migration 0231 moved out of the run's record, whose list never said. */
  by: { type: string; id: string } | null
  /** When migration 0231 moved it out of the run's record, or null on a use the door wrote as a row. */
  movedAt: string | null
  /**
   * What the use door found when it checked the line's proof that tools/use-line.mjs sent it (src/config/use-line-proof.mjs):
   * `matches`, `none` when no proof came, `does not match`, or null on a line written before the door checked.
   */
  proof: 'matches' | 'none' | 'does not match' | null
  /** One sentence when the line is not shown to have come through tools/use-line.mjs, and null when its proof matches. */
  mark: string | null
}

/** One page of a run's uses, newest first. */
export interface ToolUsesPage {
  run: string
  /** Every use the run has, not only this page's. */
  total: number
  uses: StoredToolUse[]
  /** The `before` that reads the next older page, or null when this page reaches the run's first use. */
  older: number | null
}

/**
 * THE TEN ITEMS OF A MANUAL PAGE, IN ORDER: block b-4 of the draft (report i69HYz8BQhSx).
 *
 * `keys` are the record's own keys; `title` is the record's title and every other key is in `data`.
 * The manual door reads this list and nothing else, and the tests count the items from it, so the
 * page and the kind cannot disagree about what a manual page holds.
 */
export const MANUAL_ITEMS = [
  { n: 1, name: 'Its name, and what it does', keys: ['title', 'does'] },
  { n: 2, name: 'Who it is for', keys: ['forWhom'] },
  { n: 3, name: 'Its category', keys: ['category'] },
  { n: 4, name: 'When to use it, and when not to', keys: ['whenToUse', 'whenNotToUse'] },
  { n: 5, name: 'Who may use it', keys: ['whoMayUse'] },
  { n: 6, name: 'How to call it, with an example', keys: ['howToCall', 'example'] },
  { n: 7, name: 'What it costs', keys: ['costs'] },
  { n: 8, name: 'What it protects', keys: ['protects'] },
  { n: 9, name: 'What each use records', keys: ['eachUseRecords'] },
  { n: 10, name: 'Who keeps it, which version, and what it is a copy of', keys: ['keptBy', 'version', 'copyOf'] },
] as const satisfies readonly { n: number; name: string; keys: readonly string[] }[]

/**
 * THE ONE SENTENCE EVERY AGENT'S INTRODUCTION CARRIES ABOUT THE TOOLSET. Piece P2 of plan KP0udNekYcAo.
 *
 * Every agent's introduction says the toolset exists, and an agent that
 * needs a tool looks it up, reads its manual, then uses it. The card message
 * (theCardMessageSaidFor in src/server/lib/cardmessage.ts) and the brief's opening (briefHead in
 * src/server/api/brief.ts) read
 * this constant; neither types it again.
 *
 * It says nothing about keys. When it was written no service tool was built, so a sentence saying a key
 * never enters an agent's context would have been false. A decision makes that true as service
 * tools come. The first, tools/openrouter.mjs, came in wave 13s round 41, and this sentence was
 * left as it was.
 */
export const THE_TOOLSET_SENTENCE =
  'The office keeps a toolset: a list of the tools and services an agent may use. Before you do a job by ' +
  'hand, look it up with GET /api/toolset, read its manual with GET /api/toolset/<slug>, and check its state ' +
  'before you rely on it.'
