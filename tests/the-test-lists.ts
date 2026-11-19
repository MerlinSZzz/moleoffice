// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST LISTS: THE TWO THE MERGE QUEUE READS, AND THE WINDOW LIST.
 *
 * The merge queue needs two sets of test files that a worker's neighbour rule does not reach.
 *
 *   - The browser test files. The queue runs them in a pass of their own, because they start an API
 *     server, a Vite and a Chromium and are much more expensive than the rest. A browser test is a
 *     file whose own source calls `liveApp(`, the only helper that starts the whole stack.
 *
 *   - The whole-tree test files. These read the checkout itself — they walk `src/` or `tools/`, or
 *     they import one of the three shared scanners, or their name begins with `every-`, `no-`,
 *     `one-` or `each-`, or they walk `tests/` from the top (THE_TESTS_THAT_WALK_TESTS in
 *     tools/related-tests.mjs names each of them), or they read every key of the kind table (the
 *     fifth rule below). A change anywhere in the files they read can turn one red even though the
 *     worker never touched the code the test imports. Acceptance finding 46: one such test bounced a
 *     landing on 23 September 2026 because the neighbour rule had no edge to it.
 *
 * A TEST THAT READS EVERY KEY OF THE KIND TABLE IS ON THE WHOLE-TREE LIST. src/shared/kinds.ts holds
 * SHAPE_SPECS and KIND_SPECS, and a test that goes over every key of either table can break when any
 * one key changes. Once the related list is refused for naming every test file, it cannot name that
 * key, so this list must name the test instead. The fifth rule reads the test's own source as text:
 * the file is on the list when its source holds `Object.values`, `Object.keys` or `Object.entries` of
 * SHAPE_SPECS or KIND_SPECS (with the table as the whole argument), `for (… in SHAPE_SPECS)` or
 * `for (… in KIND_SPECS)`, `SHAPE_SPECS[…]` or `KIND_SPECS[…]` with a key that is not a string
 * literal, `...SHAPE_SPECS` or `...KIND_SPECS`, or a call to `describeKinds()`. A test that reads one
 * key by its name, such as `SHAPE_SPECS.ClockStamp` or `KIND_SPECS['decision']`, is not on the list
 * by this rule. EVERY_KEY_FORMS below holds the forms, and the tests read the same table, so a form
 * cannot be on one list and not the other.
 *
 * What this rule cannot see. A read made inside a helper the test imports is not seen, because the
 * rule reads only the test's own text. A table reached through another name is not seen either:
 * `const table = SHAPE_SPECS` followed by `Object.values(table)` names neither table in the form.
 * The text is read as it stands, so a form written in a comment or in a string counts too; that can
 * only keep a file on the list, and the merge queue runs every file, so the cost is one file's run.
 *
 * A BROWSER FILE IS NOT PUT ON THE WHOLE-TREE LIST BY THIS RULE. The merge queue's browser pass runs
 * every browser file already, so a browser file that reads every key of the kind table is run there.
 * This is the same choice rule 2 makes. A browser file is still on the list by rules 1, 3 and 4, and
 * by rule 2 when its own source also reads the tree.
 *
 * A BROWSER FILE IS ON THE WHOLE-TREE LIST ONLY WHEN ITS OWN SOURCE READS THE TREE. The owner's
 * decision of 25 September 2026 took wave 13i's advice: 14 browser files were on the list by their name alone,
 * and they cost about 30% of its CPU time. A browser file whose name begins with
 * `every-`, `no-`, `one-` or `each-` is on the list for that name only when its own source reads the
 * tree. A browser file that imports one of the three shared scanners, or is one of the named source
 * walkers below, stays on the list as before, because both of those are reads of the tree.
 *
 * "Its own source reads the tree" means this: the source imports `node:fs` or `node:child_process`,
 * and it also writes a path under `src/`, `tools/`, `scripts/`, `drizzle/` or `design/` in a string
 * that is not an import. That is a file that reads a source file, walks a source folder, or runs a
 * tool of the checkout. Importing a module under src/ is not a read of the tree: the neighbour rule
 * already follows imports.
 *
 * What this rule cannot see. A read done inside a helper the file imports, for example a helper
 * under tests/ that walks src/, is not seen. A path built from pieces that never spell out a folder
 * name is not seen either. And `liveApp` itself builds the page from src/web for every browser file;
 * that is not counted as reading the tree, because it is true of all of them. The rule errs the
 * other way where it can: a folder name in a comment or a test title, in a file that reads files
 * somewhere else, keeps the file on the list. A file that is not a browser file keeps all three of
 * the older rules, the name rule too. The merge queue runs every file, so a file this rule leaves off
 * is still run before a landing.
 *
 * A FILE TAKEN OUT WHOLE IS ON NEITHER LIST. tests/taken-out.json lists the tests the runner skips,
 * and vitest.config.ts reads and checks it with `theTakenOutList`, which is read here too, so the
 * list is read in one place. An entry with no `case` takes out a whole file. vitest leaves such a
 * file out of the run, and a file named alone on the command line then makes vitest say "No test
 * files found" and exit 1, which says nothing about why. So such a file is left off both lists. A
 * list that is missing or not whole stops both lists with the reader's own sentence. When the list
 * is not empty, loading vitest.config.ts prints one line on standard error that names each file and
 * case taken out, so a person who runs either list as a script sees what is left off.
 *
 * Both lists are found here rather than typed into a brief, so a new test file joins the list on the
 * commit that adds it. Both are sorted and relative to the checkout, as `tests/<name>.test.ts`.
 *
 * Run any list as a script:
 *
 *     node --import tsx tests/the-test-lists.ts browser
 *     node --import tsx tests/the-test-lists.ts whole-tree
 *     node --import tsx tests/the-test-lists.ts window
 *
 * THE WINDOW LIST. A window test is a file whose own source calls `_electron.launch(`, Playwright's
 * way of starting Electron. It opens a real window, so it needs a display. `node
 * tools/run-named-tests.mjs --list window` runs these files under `dbus-run-session -- xvfb-run -a`,
 * a virtual display and a session bus of their own, and tells them so. Run any other way, a window
 * test skips and says why, so it never opens a window on a person's real screen. A window test is on
 * neither of the other two lists, for the reason the container tests are not: the queue's plain run
 * starts no virtual display.
 *
 * WHY NO CONTAINER TEST IS ON EITHER LIST. `tests/sandbox-real-container.test.ts` and
 * `tests/the-inspector-in-a-real-sandbox.test.ts` need a container runtime that the merge machine
 * does not promise: the first builds and starts a real container, the second runs the inspector in
 * one. The queue would wait on a machine that cannot run them and read the wait as a red test, so
 * they are named here and kept off both lists. They are run by hand, where a container is present.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIMING_TESTS } from './the-timing-tests.ts'
import { THE_TESTS_THAT_WALK_TESTS } from '../tools/related-tests.mjs'
import { theTakenOutList } from '../vitest.config.ts'

/** The two tests that need a real container, and are therefore on neither list. */
const CONTAINER_TESTS: readonly string[] = [
  'tests/sandbox-real-container.test.ts',
  'tests/the-inspector-in-a-real-sandbox.test.ts',
]

/** The three shared scanners whose importers are judged against the whole tree. */
const WHOLE_TREE_HELPERS = ['machine-words', 'sentences', 'applied-mutations'] as const

/** The name words that mean "this test judges the tree, not one thing in it". */
const WHOLE_TREE_NAME_PREFIXES = ['every-', 'no-', 'one-', 'each-'] as const

/** One form that reads every key of the kind table, as the header describes it. */
export interface EveryKeyForm {
  /** How the test cases name the form. */
  readonly form: string
  /** The pattern that finds this form reading SHAPE_SPECS or KIND_SPECS in a file's text. */
  readonly reads: RegExp
  /** One line of a test file that reads the table in this form, for the tests to copy. */
  readonly example: string
  /** Whether tools/related-tests.mjs lists a test that reads the table this way. */
  readonly related: boolean
}

/**
 * THE FORMS THAT READ EVERY KEY OF THE KIND TABLE. The header says what each form is, and what the
 * rule reads and misses. The test that read this table for both lists was deleted on 12 November 2026.
 * Every row whose `related` is true is a read that
 * tools/related-tests.mjs lists, and every row puts a test on the whole-tree list. Object.keys was
 * not among round 12's five cases, and describeKinds() goes over every key in src/, which the related
 * tool says in its header it cannot see, so that row is marked not related.
 */
export const EVERY_KEY_FORMS: readonly EveryKeyForm[] = [
  {
    form: 'Object.values',
    reads: /Object\s*\.\s*values\s*\(\s*(?:SHAPE_SPECS|KIND_SPECS)\s*,?\s*\)/,
    example: "for (const shape of Object.values(SHAPE_SPECS)) expect(shape.rules.join(' ')).not.toContain('gate')",
    related: true,
  },
  {
    form: 'Object.entries',
    reads: /Object\s*\.\s*entries\s*\(\s*(?:SHAPE_SPECS|KIND_SPECS)\s*,?\s*\)/,
    example: "for (const [, shape] of Object.entries(SHAPE_SPECS)) expect(shape.rules).not.toContain('gate')",
    related: true,
  },
  {
    form: 'Object.keys',
    reads: /Object\s*\.\s*keys\s*\(\s*(?:SHAPE_SPECS|KIND_SPECS)\s*,?\s*\)/,
    example: "for (const name of Object.keys(SHAPE_SPECS)) expect(name).not.toBe('gate')",
    related: true,
  },
  {
    form: 'for…in',
    reads: /\bfor\s*\([^)]*\bin\s+(?:SHAPE_SPECS|KIND_SPECS)\s*\)/,
    example: "for (const name in SHAPE_SPECS) expect(name).not.toBe('gate')",
    related: true,
  },
  {
    form: 'a key worked out at run time',
    reads: /\b(?:SHAPE_SPECS|KIND_SPECS)\s*\[\s*(?![\s'"])/,
    example: "for (const name of ['ClockStamp']) expect(SHAPE_SPECS[name as keyof typeof SHAPE_SPECS]).toBeDefined()",
    related: true,
  },
  {
    form: 'a spread',
    reads: /\.\.\.\s*(?:SHAPE_SPECS|KIND_SPECS)\b/,
    example: "expect({ ...SHAPE_SPECS }).not.toHaveProperty('gate')",
    related: true,
  },
  {
    form: 'describeKinds()',
    reads: /\bdescribeKinds\s*\(\s*\)/,
    example: 'expect(describeKinds().shapes.length).toBe(3)',
    related: false,
  },
]

interface TestFile {
  /** The path relative to the checkout, e.g. `tests/avatars.test.ts`. */
  readonly path: string
  /** The file's own text, read once. */
  readonly source: string
}

/** Every `*.test.ts` directly under `<root>/tests`, sorted. An absent tests/ folder is no files. */
function everyTestFile(root: string): TestFile[] {
  const folder = join(root, 'tests')
  let names: string[]
  try {
    names = readdirSync(folder)
  } catch {
    return []
  }
  return names
    .filter((name) => name.endsWith('.test.ts'))
    .sort()
    .map((name) => ({ path: `tests/${name}`, source: readFileSync(join(folder, name), 'utf8') }))
}

/**
 * Does this file's own source call `liveApp(`?
 *
 * `liveApp` is the helper in tests/helpers.ts that starts the API server, the Vite and the
 * Chromium. Importing helpers.ts says nothing — every test may do that — so the call is what puts a
 * file in the browser pass. A whole word followed by an open bracket is the call; a mention of the
 * name in a comment or a fixture string is not.
 */
function callsLiveApp(source: string): boolean {
  return /\bliveApp\s*\(/.test(source)
}

/**
 * Does this file's own source start Electron?
 *
 * `_electron.launch(` is how Playwright starts Electron, and nothing else in this checkout starts
 * it. As with `liveApp(`, the call is what counts: the word in a comment with no bracket after it
 * does not.
 */
function launchesElectron(source: string): boolean {
  return /\b_electron\s*\.\s*launch\s*\(/.test(source)
}

/** Does this file import one of the three shared scanners that read the whole tree? */
function importsAWholeTreeHelper(source: string): boolean {
  const names = WHOLE_TREE_HELPERS.join('|')
  return new RegExp(`from\\s*['"]\\./(?:${names})(?:\\.ts)?['"]`).test(source)
}

/** The folders of the checkout that hold its source, its tools and its design. */
const TREE_FOLDERS = ['src', 'tools', 'for-agents', 'scripts', 'drizzle', 'design'] as const

/**
 * Does this file's own source read the tree? The header says what that means and what it cannot see.
 *
 * The source must import the file system or the child-process module, and must also write a tree
 * path in a string. An import's own path does not count, because importing a module is what the
 * neighbour rule already follows. A string counts when a folder name starts it, or follows `../`, a
 * slash, or the end of a template's `${...}`, and a slash or the closing quote follows the name:
 * `'../src/web'`, `'tools/zoom-sweep.mjs'`, `join(root, 'src', 'web')`, `${repo}src/web/index.html`.
 * A path in backquotes inside a comment counts too, which can only keep a file on the list.
 */
function readsTheTreeItself(source: string): boolean {
  const touchesFiles = /['"](?:node:)?(?:fs|fs\/promises|child_process)['"]/.test(source)
  if (!touchesFiles) return false
  const withoutImports = source
    .replace(/\bfrom\s*['"][^'"]*['"]/g, '')
    .replace(/\bimport\s*\(\s*['"][^'"]*['"]\s*\)/g, '')
    .replace(/\bimport\s+['"][^'"]*['"]/g, '')
  const folders = TREE_FOLDERS.join('|')
  return new RegExp(`['"\`}/](?:${folders})(?:/|['"\`])`).test(withoutImports)
}

/**
 * Does this file's own source read every key of the kind table? EVERY_KEY_FORMS holds the forms, and
 * the header says what the rule reads and what it misses.
 */
function readsEveryKeyOfTheKindTable(source: string): boolean {
  return EVERY_KEY_FORMS.some((form) => form.reads.test(source))
}

/** Does this file's name begin with one of the whole-tree words? */
function hasAWholeTreeName(path: string): boolean {
  const name = path.slice('tests/'.length)
  return WHOLE_TREE_NAME_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/** One test whose subject is the checkout's own source or tools, and what it reads. */
interface NamedSourceWalker {
  /** The file name under tests/. */
  readonly file: string
  /** One line: what the test walks. */
  readonly walks: string
}

/**
 * THE NAMED SOURCE WALKERS.
 *
 * These tests read `src/` or `tools/` themselves — they walk a directory and read the files as
 * text, or they read or run a tool in the checkout — rather than importing one module and testing
 * it. None of them can be found from its name with certainty (the `a-` and `the-` names say nothing
 * about a walk), so each was found by reading the file and is named here with what it walks. The
 * list is short because most tree-reading tests are already named in the prefix rule above; this is
 * the remainder. When a new one is added, its author adds a line here.
 */
const NAMED_SOURCE_WALKERS: readonly NamedSourceWalker[] = [
  // -------- tests that walk all of src/, or all of src/ and tools/
  {
    file: 'avatars.test.ts',
    walks: 'walks src/, tools/, scripts/ and tests/ for test files named in comments',
  },
  { file: 'a-wake-is-wanted-and-nothing-starts.test.ts', walks: 'walks src/ for the wake and lifecycle routes' },
  { file: 'a-fresh-clone-names-nobody.test.ts', walks: 'uses git ls-files to copy every carried file into a fresh clone' },
  { file: 'guard-human-only.test.ts', walks: 'walks src/ and scripts/ for writes only a person may make' },
  { file: 'restore-check.test.ts', walks: 'walks src/ for writers of each restored table' },
  {
    file: 'revision-ledger-agrees-with-the-change-log.test.ts',
    walks: 'walks src/, scripts/ and tools/ for writes to the revision ledger',
  },
  { file: 'schema-inventory.test.ts', walks: 'walks src/, scripts/ and tools/ for table-creating statements' },
  { file: 'schema-tables.test.ts', walks: 'walks src/ for CREATE TABLE and CREATE INDEX' },
  { file: 'cut-mark-is-shared.test.ts', walks: 'walks src/ for the mark on a shortened quote' },
  {
    file: 'the-install-and-data-declaration.test.ts',
    walks: 'walks src/ and scripts/ for duplicate install and data declarations',
  },
  {
    file: 'the-traces-two-words-are-declared-once.test.ts',
    walks: 'walks src/ for the two trace words outside src/shared/releasing.ts',
  },
  {
    file: 'a-twelve-letter-word-is-not-a-record-id.test.ts',
    walks: 'walks src/ for other declarations that read a twelve-letter value as a record id',
  },
  {
    file: 'the-server-is-judged-on-the-code-it-is-built-from.test.ts',
    walks: 'walks the top level of src/ for source files',
  },
  { file: 'the-hook-parses.test.ts', walks: 'walks tools/ for the hook scripts' },

  // -------- tests that walk a directory under src/ that is the subject of a whole-tree rule
  { file: 'a-count-and-what-it-is-counted-over-join-by-the-spacing-rule.test.ts', walks: 'walks src/web for typed spaces before counted-over sentences' },
  { file: 'a-replaced-decision-leaves-normal-content.test.ts', walks: 'walks src/server for every place that creates a decision' },
  { file: 'a-card-says-more-as-it-grows.test.ts', walks: 'walks src/web/components/graph for the card code' },
  { file: 'a-delivery-mark-says-what-its-own-row-says.test.ts', walks: 'walks src/web for the delivery mark' },
  { file: 'a-diagram-is-drawn-with-no-network.test.ts', walks: 'walks src/web for network calls in diagrams' },
  { file: 'a-page-on-another-origin.test.ts', walks: 'walks src/web for the page headers and methods it reads' },
  { file: 'absence-weight.test.ts', walks: 'walks src/web for how absence is weighted' },
  { file: 'changes.test.ts', walks: 'walks src/web for change-row rendering' },
  { file: 'decision-form-quiet.test.ts', walks: 'walks src/web for the quiet decision form words' },
  { file: 'graph-model.test.ts', walks: 'walks src/web/components/graph for the structure model' },
  { file: 'guard-registry.test.ts', walks: 'walks src/server/lib for exported governance guards' },
  { file: 'how-much-each-thing-says.test.ts', walks: 'walks src/web for the detail-surface controls' },
  { file: 'implementation-map-boundary.test.ts', walks: 'walks src/server/lib/resolvers for ownership statements' },
  { file: 'organising-is-reachable.test.ts', walks: 'walks src/web for the browser files' },
  { file: 'provenance-ui.test.ts', walks: 'walks src/web for provenance words' },
  { file: 'server-wiring.test.ts', walks: 'walks src/server/api for route registration' },
  { file: 'sessions-ui.test.ts', walks: 'walks src/web for the sessions page' },
  { file: 'talk-on-real-work.test.ts', walks: 'walks src/web for the talk control' },
  { file: 'the-dev-server-watches-the-shared-folder.test.ts', walks: 'reads every file in src/shared and src/config for the Vite watcher' },
  {
    file: 'the-browser-and-the-server-mean-the-same-person.test.ts',
    walks: 'walks src/web and src/server for the person name',
  },
  {
    file: 'the-page-shouts-when-it-is-in-the-wrong-world.test.ts',
    walks: 'walks src/web for the wrong-world warning',
  },
  { file: 'the-sidebar-project-block.test.ts', walks: 'walks src/web for a second copy of the sidebar key list' },
  {
    file: 'the-published-refusal-is-the-one-enforced.test.ts',
    walks: 'walks src/server/lib for the published refusals',
  },
  {
    file: 'the-registry-makes-the-person-hold-the-key.test.ts',
    walks: 'walks src/server/lib for the governance guards',
  },
  { file: 'what-was-stored-is-drawn.test.ts', walks: 'walks src/ for a reason written instead of imported' },
  { file: 'workspace-switcher.test.ts', walks: 'walks src/web for the workspace switcher' },
  { file: 'z-index.test.ts', walks: 'walks src/web for the z-index scale' },

  // -------- tests that read every route the server registers, from every file under src/server/api. They read the
  // router through the built server rather than as text, so a route added in any file can turn one red. Round 45 of
  // wave 13n did: both bounced a landing on 8 October 2026.
  {
    file: 'by-id-boundary.test.ts',
    walks: 'reads every route of the router, so each route with an id is in exactly one table',
  },
  {
    file: 'api-families.test.ts',
    walks: 'reads every route of the router, so each family of doors has its line',
  },

  // -------- tests that walk every tool or test helper under tools/, tests/ and for-agents/
  {
    file: 'the-openrouter-tool-reviews-a-video-and-keeps-its-key.test.ts',
    walks: 'walks tools/ for imports of the provider key reader',
  },
  {
    file: 'the-page-says-when-it-has-drawn.test.ts',
    walks: 'walks tests/, tools/ and for-agents/ for waits on network idle',
  },

  // -------- tests whose subject is one script under tools/, read from or run in the checkout
  {
    file: 'a-files-changeset-lands-nothing-it-cannot-account-for.test.ts',
    walks: 'runs tools/checks/files-changeset.mjs',
  },
  {
    file: 'a-generated-file-is-checked-by-regenerating-it.test.ts',
    walks: 'runs tools/checks/git-changeset.mjs',
  },
  {
    file: 'a-scoped-check-judges-only-the-paths-it-names.test.ts',
    walks: 'runs tools/the-inspector.mjs',
  },
  { file: 'check-eligibility.test.ts', walks: 'reads the source of tools/the-inspector.mjs' },
  { file: 'review-covers-four-widths.test.ts', walks: 'reads tools/review.mjs for the widths it photographs' },
  { file: 'sandbox-launcher.test.ts', walks: 'runs tools/sandbox.mjs' },
  { file: 'the-launcher-passes-the-owners-effort.test.ts', walks: 'runs the launcher with synthetic programs and reads the model names' },
  { file: 'the-office-answers-the-runs-effort.test.ts', walks: 'reads the office model and effort choices through their doors' },
  { file: 'a-second-round-waits-for-the-first.test.ts', walks: 'runs tools/sandbox.mjs worker and round' },
  { file: 'a-sandbox-run-holds-its-own-key.test.ts', walks: 'runs tools/sandbox.mjs worker and exec, and tools/sandbox-start.mjs inside a sandbox' },
  { file: 'the-launcher-asks-again-while-the-office-restarts.test.ts', walks: 'runs tools/sandbox.mjs exec and tools/sandbox-start.mjs through an office that restarts' },
  { file: 'an-isolated-run-cannot-reach-the-office.test.ts', walks: 'runs tools/sandbox.mjs exec --isolated, which mounts tools/isolated-gate.mjs' },
  {
    file: 'the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts',
    walks: 'runs tools/the-inspector.mjs',
  },
  { file: 'the-merger.test.ts', walks: 'runs tools/the-merger.mjs' },
  { file: 'the-merger-bus.test.ts', walks: 'runs tools/the-merger.mjs' },
  { file: 'the-merger-suite.test.ts', walks: 'runs tools/the-merger.mjs' },

  // -------- tests that walk the SQL files under drizzle/
  { file: 'migration.test.ts', walks: 'walks drizzle/ for the migration files and journal entries' },
  { file: 'the-applied-migrations-keep-their-statements.test.ts', walks: 'walks drizzle/ to compare every applied migration statement' },
  { file: 'the-lifecycle-tables-wait-for-the-window.test.ts', walks: 'walks drizzle/ for lifecycle table declarations' },
]

const NAMED_SOURCE_WALKER_NAMES = new Set(NAMED_SOURCE_WALKERS.map((walker) => walker.file))

/**
 * The tests that walk tests/ from the top, which tools/related-tests.mjs names because a folder at
 * the top of the checkout is no edge of its graph. They are on this list whatever the change, for
 * three reasons: this list does not know the change; it is what runs when --list related is
 * refused; and nearly every change touches tests/. Problem ZS2I7oSUWpu5: the first of them bounced
 * entry osR02Onl_CVV on 18 October 2026 because neither list named it. A new test that walks tests/
 * is on this list only once its line is added there.
 */
const WALKS_TESTS = new Set(THE_TESTS_THAT_WALK_TESTS.map((walker) => walker.file))

/** The one line saying what a named walker walks, or null when it is not named. */
export function whatANamedWalkerWalks(file: string): string | null {
  const walker = NAMED_SOURCE_WALKERS.find((one) => one.file === file)
  return walker === undefined ? null : walker.walks
}

/** The test files `<root>/tests/taken-out.json` takes out whole, relative to `root`. */
function theFilesTakenOutWhole(root: string): string[] {
  return theTakenOutList(join(root, 'tests', 'taken-out.json'))
    .filter((entry) => entry.case === undefined)
    .map((entry) => entry.file)
}

/**
 * Is this file kept off the browser and whole-tree lists? It is when it needs a container, when it is
 * taken out whole, or when it opens a window, which needs the virtual display only the window list
 * starts.
 */
function isKeptOffBothLists(test: TestFile, takenOut: readonly string[]): boolean {
  return TIMING_TESTS.some((one) => one.file === test.path) || CONTAINER_TESTS.includes(test.path) || takenOut.includes(test.path) || launchesElectron(test.source)
}

/**
 * Every browser test file under `root/tests`, as paths relative to `root`.
 *
 * A browser test is one whose source calls `liveApp(`. The two container tests are kept off even if
 * a later edit makes one call it, and so are a window test and a file taken out whole; see the header
 * for why.
 */
export function theBrowserTestFiles(root: string): string[] {
  const takenOut = theFilesTakenOutWhole(root)
  return everyTestFile(root)
    .filter((test) => callsLiveApp(test.source))
    .filter((test) => !isKeptOffBothLists(test, takenOut))
    .map((test) => test.path)
    .sort()
}

/**
 * Is this test file on the whole-tree list?
 *
 * A file that is not a browser file is on it when any one of five rules holds:
 *   1. it imports tests/machine-words.ts, tests/sentences.ts or tests/applied-mutations.ts;
 *   2. its name begins with `every-`, `no-`, `one-` or `each-`;
 *   3. it is one of the named source walkers above;
 *   4. it walks tests/ from the top (`WALKS_TESTS`);
 *   5. its own source reads every key of the kind table (`readsEveryKeyOfTheKindTable`).
 *
 * A browser file is on it by rule 1, 3 or 4. Rule 2 puts it on only when its own source also
 * reads the tree (`readsTheTreeItself`), and rule 5 never puts one on. The header says why. The
 * browser limit only takes browser files off the list; it never puts on a file that none of the
 * five rules names.
 */
function isOnTheWholeTreeList(test: TestFile): boolean {
  const named = NAMED_SOURCE_WALKER_NAMES.has(test.path.slice('tests/'.length)) || WALKS_TESTS.has(test.path)
  if (importsAWholeTreeHelper(test.source) || named) return true
  const browser = callsLiveApp(test.source)
  if (hasAWholeTreeName(test.path) && (!browser || readsTheTreeItself(test.source))) return true
  return !browser && readsEveryKeyOfTheKindTable(test.source)
}

/**
 * Every test file that reads the whole tree, as paths relative to `root`.
 *
 * `isOnTheWholeTreeList` holds the rules. The two container tests are kept off, and so are a window
 * test and a file taken out whole; see the header for why.
 */
export function theWholeTreeTestFiles(root: string): string[] {
  const takenOut = theFilesTakenOutWhole(root)
  return everyTestFile(root)
    .filter(isOnTheWholeTreeList)
    .filter((test) => !isKeptOffBothLists(test, takenOut))
    .map((test) => test.path)
    .sort()
}

/**
 * Every window test file under `root/tests`, as paths relative to `root`: each file whose own source
 * calls `_electron.launch(`. A file taken out whole is left off, as on the other lists.
 */
export function theWindowTestFiles(root: string): string[] {
  const takenOut = theFilesTakenOutWhole(root)
  return everyTestFile(root)
    .filter((test) => launchesElectron(test.source))
    .map((test) => test.path)
    .filter((path) => !takenOut.includes(path))
    .sort()
}

// ============================================================ the script

/**
 * Print one list, one path per line, when this module is the file Node was told to run.
 *
 * The root is the checkout that holds this module, so the script needs no argument beyond the list
 * name. An unknown or missing name prints how to call it and exits non-zero, because a silent empty
 * list would read as "there are none".

 */
function whenRunAsAScript(): void {
  if (process.argv[1] === undefined) return
  if (resolve(process.argv[1]) !== fileURLToPath(import.meta.url)) return

  const root = fileURLToPath(new URL('..', import.meta.url))
  const which = process.argv[2]
  if (which === 'timing') {
    for (const one of TIMING_TESTS) {
      if (!existsSync(join(root, one.file))) throw new Error(`The timing group names a missing file: ${one.file}.`)
      console.log(one.file)
    }
    return
  }
  if (which === 'browser') {
    for (const file of theBrowserTestFiles(root)) console.log(file)
    return
  }
  if (which === 'whole-tree') {
    for (const file of theWholeTreeTestFiles(root)) console.log(file)
    return
  }
  if (which === 'window') {
    for (const file of theWindowTestFiles(root)) console.log(file)
    return
  }
  console.error('usage: node --import tsx tests/the-test-lists.ts <browser|whole-tree|window|timing>')
  process.exitCode = 1
}

whenRunAsAScript()
