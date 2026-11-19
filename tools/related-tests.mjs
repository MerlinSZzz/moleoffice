// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE TEST FILES A CHANGE CAN BREAK: every test file that imports a changed file, directly or through other modules.
 *
 *     node tools/run-named-tests.mjs --list related
 *     node tools/related-tests.mjs [--root <checkout>] [--base <commit>] [--why]   prints the set; --why, each file's way to the change
 *
 * WHY. A wave may not run the whole suite, and on 9 October 2026 three merge entries bounced on
 * files the wave had not run (9KLZUJz1hlO3, apbm3x3xXUU-, oG1Mm507p4rc). This module finds the files a wave should run
 * before it seals. tools/run-named-tests.mjs runs them, with the whole-tree list, in parts.
 *
 * THE CHANGE is every path `git diff --name-status <base> HEAD` names, where the base is
 * `git merge-base HEAD origin/main`. A renamed file counts under both its names.
 *
 * WHY NOT ONE EDGE PER FILE. Nearly every test imports tests/helpers.ts, and helpers.ts loads the whole server with
 * `import()` inside apiApp. Counted file by file, a change to src/server/lib/records.ts related 2,166 of 2,345 test
 * files on 10 October 2026, because the file-level graph cannot tell a test that calls apiApp from one that only
 * calls freshDb. So the graph is built from the top-level declarations of each module instead. Its nodes are:
 *   - `path`, LOADING the file: its top-level statements, the initialisers of its top-level variables that are not
 *     functions, and every module it imports statically (`import type` is erased, so it is no edge). A function body
 *     is not run by loading, so loading does not depend on what a function declared at the top names;
 *   - `path#name`, one top-level DECLARATION: it depends on what its own body names, which is another declaration of
 *     the same file, a name it imported (that name's declaration in the other module, followed through
 *     `export … from`), a module it loads with `import()` or `require()` (all of it, `path#*`), and a file it writes
 *     as a path (below);
 *   - `path#<load>`, the top-level statements that have no name;
 *   - `path@text`, the file read as text rather than run.
 * A TEST FILE depends on everything its loading reaches.
 *
 * WHAT CHANGED is worked out per declaration as well. A changed or added code file is read at the base and at HEAD,
 * and only the declarations whose text differs are changed nodes, with `path@text` always. A TABLE (a top-level
 * object literal, with its `...{}` spreads and `as` and `satisfies` taken off) is compared key by key, and each changed
 * key is owed (next paragraph). Any other change, a file that is not code, a test file, a deleted file and every file
 * in THE_FILES_EVERY_TEST_RUNS_ON, changes the whole file.
 *
 * A NAME STILL OWED. Reaching the whole of a module (`X#*`, as `import()` or `t.api` hands it over) from one of its
 * declarations `X#name` owes that name: whoever holds the whole module runs `name` only by naming it. The debt is paid
 * at the first declaration outside X whose words hold the name (identifiers and dotted words, with the keys of object
 * literals left out, so that an English table holding the key `x` does not pay for a Chinese one). A test still owing
 * the name is not related. A changed key of a table is owed the same way. While that key has come only through values
 * worked out at load, as a table spread into SHAPE_SPECS does, a declaration under tests/ that uses such a value whole
 * pays it too: a name it neither calls nor reads one named key of, as `Object.values(SHAPE_SPECS)` and
 * `SHAPE_SPECS[name]` do, may reach every key (tests/gate-rule.test.ts, problem ZS2I7oSUWpu5). Once a function or a
 * whole module holds the key, it is owed by name again, because a function hands on only what its code reads. A
 * top-level value outside a test file that is worked out at load time counts only for the declarations that name it:
 * if working it out threw, every file that loads its module would show that, and those are related through loading
 * already.
 *
 * A PATH WRITTEN AS TEXT is an edge too, because tests start tools and read files by path: `join(REPO, 'tools',
 * 'the-merger.mjs')`, `readFileSync('tests/moved/13p.txt')`. Inside one declaration, each string
 * and each run of up to four strings that follow one another, joined by "/", is read as a path from the file's own
 * folder and from the checkout. When it names a file of the checkout, the edge goes to the file read as text and to
 * its loading (only to the text, for a test file). When it names a folder below the top level, every file in the
 * folder is an edge. A folder at the top is not. The tests that walk tests/ from the top are named in
 * THE_TESTS_THAT_WALK_TESTS instead, and every change under tests/ reaches each of them. A bare file name such as
 * 'the-merger.mjs' is an edge when exactly one file of the checkout has that name. A path in an HTML file's
 * `<script src>` is an edge as well, which is how a browser test reaches the page: liveApp builds src/web/index.html,
 * whose script is src/web/main.tsx. The string given to `import()` or `require()` is the module it loads, not a path
 * read.
 *
 * EVERY TEST RUNS ON THE RUNNER'S OWN CONFIGURATION, so each test depends on the files in THE_FILES_EVERY_TEST_RUNS_ON,
 * and through vitest.config.ts on its setup files. A change to one of them relates every test file, and the list is
 * then refused, which is right: such a change can break any test.
 *
 * THE DOORS (THE_DOORS_OF_THE_WHOLE_APP, below). A test that reaches a change only by starting the whole server or
 * building the whole page is not run, and is named apart when the list is not refused.
 *
 * WHAT IT CANNOT SEE, said here because the whole-tree list and the merge queue are what cover it:
 *   - a file read through a folder walk from the top of the checkout (src/, tools/), or a name built at run time.
 *     The whole-tree list (tests/the-test-lists.ts), which --list related always adds, holds only the walks its own
 *     rules find: a walk none of them finds is on neither list, and only the merge queue runs it. The tests that walk
 *     tests/ from the top are seen only because THE_TESTS_THAT_WALK_TESTS names them, and a new one is seen only once
 *     its line is added there;
 *   - a module chosen by a computed string, such as `import(name)`;
 *   - a key read without its name by code outside tests/. Only code under tests/ pays every key, so a test that reads
 *     the kind table only through a function in src/ that goes over every key, such as a test that reads
 *     `describeKinds()` and nothing else, is not related to a change to one key of a table spread into SHAPE_SPECS.
 *     Nor is a test that names the table through an `export *` barrel, because its use is of the barrel's name;
 *   - which key a change touched, once the related list is refused for naming every test file. The whole-tree list
 *     does not know the change, but it names every test file that is not a browser file and whose own source reads
 *     every key of SHAPE_SPECS or KIND_SPECS (tests/the-test-lists.ts, EVERY_KEY_FORMS), so tests/gate-rule.test.ts
 *     still runs then. It reads only those two names: a test that goes over every key of a table spread into
 *     SHAPE_SPECS, by that table's own name, is related but not on the whole-tree list. It cannot see a read made
 *     inside a helper the test imports, or a table reached through another name. On 18 October 2026 the related list
 *     named both files that bounced entry osR02Onl_CVV and was refused, because the change touched a file that
 *     vitest.config.ts loads for every test;
 *   - a value worked out at load time whose working out does something besides making the value;
 *   - a test that reaches the change only through a door. On 9 October 2026 a-system-line-shows-without-counting broke
 *     on a change to the page's Shell and reached it only through src/web/main.tsx (entry apbm3x3xXUU-). The merge
 *     queue runs those.
 * The changed file and a test file it depends on are both read from the working tree at HEAD, not from the base.
 *
 * IT FAILS RATHER THAN GUESSING: if git cannot say the change, or a source file cannot be parsed, it throws with the
 * reason. Nothing here falls back to a smaller set.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { posix } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The parser. TypeScript 7 in this checkout has no JavaScript interface, so the graph reads each module with rolldown's
 * parseAst (oxc), which vite 8 installs and which reads TypeScript and JSX into ESTree.
 */
const { parseAst } = await import(createRequire(import.meta.url).resolve('rolldown/parseAst'))

/** Node types that are only types, and the keys under which a node holds only a type: both are erased, so not edges. */
const TYPE_ONLY = new Set(['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSDeclareFunction', 'TSModuleDeclaration', 'TSTypeAnnotation', 'TSTypeParameterDeclaration', 'TSTypeParameterInstantiation', 'TSImportEqualsDeclaration'])
const SKIPPED_KEYS = new Set(['type', 'start', 'end', 'range', 'loc', 'typeAnnotation', 'returnType', 'typeParameters', 'typeArguments', 'superTypeArguments'])

/** The files every test file runs on, whatever it imports: the runner's configuration and the installed packages. */
export const THE_FILES_EVERY_TEST_RUNS_ON = ['vitest.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json']

/**
 * THE TESTS THAT WALK tests/ FROM THE TOP, each with what it reads. A folder at the top of the checkout is no edge
 * (filesNamedBy), so these are named: each depends on THE_TESTS_FOLDER, which every change under tests/ touches, and
 * tests/the-test-lists.ts puts each on the whole-tree list. The tests were found on 18 October 2026 by searching
 * tests/ for 'tests' and 'tests/' written as strings, for readdirSync, `git ls-files` and `git grep`, and for walks of
 * the test's own folder, and then reading each file found. A new test that walks tests/ is listed only once its line
 * is added here. Problem ZS2I7oSUWpu5: the first of these bounced entry osR02Onl_CVV on 18 October 2026.
 * The entry for tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts, a gate written on another branch at the
 * same time, was added when the two branches were joined.
 * @type {{ file: string, reads: string }[]}
 */
export const THE_TESTS_THAT_WALK_TESTS = [
  { file: 'tests/a-test-that-starts-something-gets-the-time-to-do-it.test.ts', reads: 'every file directly in its own folder' },
  { file: 'tests/avatars.test.ts', reads: 'the comments of every code file git carries under tests/, and under src/, tools/ and scripts/' },
  { file: 'tests/a-fresh-clone-names-nobody.test.ts', reads: 'every file git carries, and every file it would carry' },
  { file: 'tests/the-page-says-when-it-has-drawn.test.ts', reads: 'every code file directly in tests/, tools/ and for-agents/' },
  { file: 'tests/no-test-file-name-carries-a-pronoun-or-a-name.test.ts', reads: 'the name of every file under tests/' },
  { file: 'tests/no-test-opens-the-live-corpus.test.ts', reads: 'every test file directly in its own folder' },
  { file: 'tests/no-test-writes-into-the-owners-home.test.ts', reads: 'every test file directly in tests/' },
  { file: 'tests/no-test-leaves-a-rules-file-in-the-worktree.test.ts', reads: 'every code file under tests/, for a worker given this worktree as its checkout' },
  { file: 'tests/the-owners-project-is-not-in-the-source.test.ts', reads: 'every file git carries outside design/, with git grep' },
]
/** The node a test that walks tests/ depends on, and that every change under tests/ touches. */
const THE_TESTS_FOLDER = 'tests/'

/** The module paths the checkout aliases, as tsconfig.json and vitest.config.ts declare them. */
/** @type {[string, string][]} */
const ALIASES = [['@shared/', 'src/shared/']]

/** The folders that are not followed, because nothing in them is source of this checkout's tests. */
const LEFT_OUT = ['node_modules/', 'design/', 'dist/', '.logs/', '.scratch/']

const CODE = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/
const ENDINGS = ['', '.ts', '.tsx', '.mjs', '.js', '.cjs', '.json', '/index.ts', '/index.tsx', '/index.mjs', '/index.js']
const A_TEST_FILE = /^tests\/.*\.test\.ts$/
/**
 * The folders whose files walk the folders they name: a folder written in one of them is an edge to every file under
 * it. Elsewhere a folder written as text is a setting (an alias, a place to serve from), not a read of its files.
 */
const FOLDERS_THAT_WALK = ['tests/', 'tools/', 'scripts/']
/**
 * Whose paths are edges: a file in one of the folders above, or a configuration file at the top of the checkout.
 * A path written in src/ is almost always data (a description, a list a page shows, a place to serve from), and
 * following those made every test depend on files it never reads, so src/ is not read for paths.
 * @param {string} file
 */
const readsByPath = (file) => FOLDERS_THAT_WALK.some((folder) => file.startsWith(folder)) || !file.includes('/')
/** The longest run of strings that follow one another that is read as one path. */
const MOST_PIECES = 4

/** One module's syntax tree. Throws with the parser's words: a file that cannot be read is no reason to guess. @param {string} file @param {string} text */
function parse(file, text) {
  const lang = file.endsWith('.tsx') ? 'tsx' : file.endsWith('.jsx') ? 'jsx' : /\.(ts|mts|cts)$/.test(file) ? 'ts' : 'js'
  try {
    return parseAst(text, { lang, sourceType: 'module' })
  } catch (error) {
    throw new Error(`The related-test graph could not read ${file}, so it cannot say which tests depend on it: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 1 << 28 })
}

/**
 * The change from the merge-base with origin/main (or `base`, when given) to HEAD: every path it adds, changes,
 * deletes or renames, both names of a rename. Throws with git's words when git cannot say.
 * @param {string} root @param {string | undefined} base
 * @returns {{ base: string, tip: string, paths: string[] }}
 */
export function theChange(root, base) {
  const tip = git(root, ['rev-parse', 'HEAD']).trim()
  const from = base ?? git(root, ['merge-base', 'HEAD', 'origin/main']).trim()
  const paths = new Set()
  for (const line of git(root, ['diff', '--name-status', '-M', from, tip]).split('\n')) {
    if (line.trim() === '') continue
    for (const path of line.split('\t').slice(1)) paths.add(path)
  }
  return { base: from, tip, paths: [...paths].sort() }
}

/**
 * The graph of one checkout's working tree at HEAD, as reverse edges between nodes. A node is `<path>` for loading a
 * file, or `<path>#<name>` for one top-level declaration in it.
 * @param {string} root
 */
export function theGraph(root) {
  const files = git(root, ['ls-files', '-z']).split('\0').filter((path) => path !== '' && !LEFT_OUT.some((folder) => path.startsWith(folder)))
  const known = new Set(files)
  /** Folder → the files under it. */
  const under = new Map()
  /** File name → its paths. */
  const byName = new Map()
  for (const file of files) {
    const parts = file.split('/')
    for (let i = 1; i < parts.length; i += 1) {
      const folder = parts.slice(0, i).join('/')
      if (!under.has(folder)) under.set(folder, [])
      under.get(folder).push(file)
    }
    const name = parts.at(-1) ?? file
    if (!byName.has(name)) byName.set(name, [])
    byName.get(name).push(file)
  }

  /** @type {Map<string, Set<string>>} */
  const forward = new Map()
  /** @param {string} from @param {string} to */
  const edge = (from, to) => {
    if (!forward.has(from)) forward.set(from, new Set())
    forward.get(from)?.add(to)
  }
  /** Names each file declares at the top, and the modules it re-exports with `export *`. */
  const declared = new Map()
  /** The words a file's text holds, and the words of each named declaration: who names a name of a whole module. */
  const words = new Map()
  /** Each declaration under tests/ → the nodes it uses whole, neither calling them nor reading one named key. @type {Map<string, Set<string>>} */
  const usedWhole = new Map()
  /** The declarations that are values worked out at load, not functions or classes, and the names that re-export one. */
  const values = new Set()
  const starFrom = new Map()

  /** @param {string} from @param {string} spec @returns {string | null} */
  function resolveModule(from, spec) {
    let path = null
    for (const [alias, folder] of ALIASES) if (spec.startsWith(alias)) path = folder + spec.slice(alias.length)
    if (path === null && spec.startsWith('.')) path = posix.normalize(posix.join(posix.dirname(from), spec))
    if (path === null) return null
    for (const ending of ENDINGS) if (known.has(path + ending)) return path + ending
    if (path.endsWith('.js') && known.has(`${path.slice(0, -3)}.ts`)) return `${path.slice(0, -3)}.ts`
    return null
  }

  /**
   * The files a string or a run of strings names as a path, read from the file's folder and from the checkout.
   * @param {string} from @param {string} text @returns {Set<string>}
   */
  function filesNamedBy(from, text) {
    const found = new Set()
    const clean = text.replace(/^\.\//, '')
    if (clean === '' || clean.length > 300) return found
    if (!readsByPath(from)) return found
    const walks = FOLDERS_THAT_WALK.some((folder) => from.startsWith(folder))
    for (const path of [posix.normalize(posix.join(posix.dirname(from), clean)), posix.normalize(clean)]) {
      if (path.startsWith('..')) continue
      if (known.has(path)) found.add(path)
      else if (walks && path.includes('/') && under.has(path)) for (const file of under.get(path)) found.add(file)
    }
    if (!clean.includes('/') && /\.[a-z]{2,5}$/.test(clean) && byName.get(clean)?.length === 1) found.add(byName.get(clean)[0])
    return found
  }

  for (const file of files) {
    if (file.endsWith('.html')) {
      const text = readFileSync(posix.join(root, file), 'utf8')
      for (const match of text.matchAll(/<script[^>]*\bsrc\s*=\s*["']([^"']+)["']/g)) {
        const src = match[1] ?? ''
        const spec = src.startsWith('/') ? `.${src}` : src
        const target = resolveModule(file, spec.startsWith('.') ? spec : `./${spec}`)
        if (target !== null) edge(file, target)
      }
      continue
    }
    // A declaration file holds only types, which are erased, so it is no edge.
    if (!CODE.test(file) || /\.d\.[cm]?ts$/.test(file)) continue
    readOneModule(file)
  }

  /** @param {string} file */
  function readOneModule(file) {
    const text = readFileSync(posix.join(root, file), 'utf8')
    const program = parse(file, text)
    words.set(file, wordsIn(text))
    /** Local name → `<module>#<name>`, or `<module>` for a namespace import. */
    const imported = new Map()
    const names = new Set()
    /** @type {{ name: string | null, node: any, atLoad: boolean, binds?: string[] }[]} */
    const units = []
    /** @type {[string, { local: string } | { node: string }][]} */
    const exportsAs = []

    /** One declaration at the top: a function, a class, a variable statement or an enum. @param {any} node @param {boolean} isDefault */
    const takeDeclaration = (node, isDefault) => {
      if (node.declare) return
      if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') {
        const name = node.id?.name ?? (isDefault ? 'default' : null)
        if (name !== null) names.add(name)
        if (isDefault && name !== 'default') exportsAs.push(['default', { local: name }])
        // A class's body runs when the file loads (its static parts and decorators); a function's does not.
        units.push({ name, node, atLoad: node.type === 'ClassDeclaration' || name === null })
        return true
      }
      if (node.type === 'VariableDeclaration') {
        for (const one of node.declarations) {
          /** @type {string[]} */
          const bound = []
          collectBindingNames(one.id, bound)
          const init = one.init
          const onlyDefines = init != null && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
          for (const name of bound) names.add(name)
          const [only] = bound
          if (bound.length === 1 && only !== undefined) units.push({ name: only, node: one, atLoad: !onlyDefines })
          else units.push({ name: null, node: one, atLoad: true, binds: bound })
        }
        return true
      }
      if (node.type === 'TSEnumDeclaration') {
        names.add(node.id.name)
        units.push({ name: node.id.name, node, atLoad: true })
        return true
      }
      return TYPE_ONLY.has(node.type)
    }

    for (const statement of program.body) {
      if (statement.type === 'ImportDeclaration') {
        if (statement.importKind === 'type') continue
        const target = resolveModule(file, statement.source.value)
        if (target === null) continue
        edge(file, target)
        for (const one of statement.specifiers) {
          if (one.type === 'ImportDefaultSpecifier') imported.set(one.local.name, `${target}#default`)
          else if (one.type === 'ImportNamespaceSpecifier') imported.set(one.local.name, `${target}#*`)
          else if (one.importKind !== 'type') imported.set(one.local.name, `${target}#${one.imported.name ?? one.imported.value}`)
        }
        continue
      }
      if (statement.type === 'ExportAllDeclaration') {
        if (statement.exportKind === 'type') continue
        const target = resolveModule(file, statement.source.value)
        if (target === null) continue
        edge(file, target)
        if (statement.exported) exportsAs.push([statement.exported.name ?? statement.exported.value, { node: `${target}#*` }])
        else {
          if (!starFrom.has(file)) starFrom.set(file, [])
          starFrom.get(file).push(target)
        }
        continue
      }
      if (statement.type === 'ExportNamedDeclaration') {
        if (statement.exportKind === 'type') continue
        if (statement.declaration) {
          takeDeclaration(statement.declaration, false)
          continue
        }
        const target = statement.source ? resolveModule(file, statement.source.value) : null
        if (statement.source && target === null) continue
        if (target !== null) edge(file, target)
        for (const one of statement.specifiers) {
          if (one.exportKind === 'type') continue
          const local = one.local.name ?? one.local.value
          exportsAs.push([one.exported.name ?? one.exported.value, target === null ? { local } : { node: `${target}#${local}` }])
        }
        continue
      }
      if (statement.type === 'ExportDefaultDeclaration') {
        const declaration = statement.declaration
        if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') takeDeclaration(declaration, true)
        else if (!TYPE_ONLY.has(declaration.type)) {
          names.add('default')
          units.push({ name: 'default', node: declaration, atLoad: true })
        }
        continue
      }
      if (takeDeclaration(statement, false)) continue
      // Anything else at the top (a call, a describe block, an if) runs when the file loads.
      units.push({ name: null, node: statement, atLoad: true })
    }
    declared.set(file, names)

    for (const unit of units) {
      const from = unit.name === null ? `${file}#<load>` : `${file}#${unit.name}`
      if (unit.name !== null) words.set(from, wordsIn(withoutTheKeys(unit.node, text)))
      if (unit.atLoad && unit.name !== null && !/^(Class|Function|ArrowFunction)/.test(unit.node.type)) values.add(from)
      if (unit.binds) for (const name of unit.binds) edge(`${file}#${name}`, from)
      if (unit.atLoad && unit.name !== null && !A_TEST_FILE.test(file)) {
        // A named value worked out at load is counted for the code that names it, not for every loader of the module.
        // If working it out throws, every loader fails, and the tests that name it are loaders, so they show it.
        // What this leaves out is a named value whose working-out does something else to every loader.
        readTheBody(unit.node, from, from)
      } else if (unit.atLoad && unit.name !== null) {
        // In a test file it runs whether or not anything names it. The paths it holds are read only by whoever names
        // it: a list of paths in a constant reads no file until code uses the constant.
        edge(file, `${from}@load`)
        readTheBody(unit.node, `${from}@load`, null)
        readTheBody(unit.node, from, from)
      } else {
        if (unit.atLoad) edge(file, from)
        readTheBody(unit.node, from, from)
      }
    }
    for (const [name, to] of exportsAs) {
      edge(`${file}#${name}`, 'node' in to ? to.node : `${file}#${to.local}`)
      values.add(`${file}#${name}`)
    }

    /**
     * What one declaration's body names: declarations of this file, imported names, loaded modules and paths.
     * @param {any} top @param {string} from @param {string | null} pathsFrom
     */
    function readTheBody(top, from, pathsFrom) {
      /** @type {string[]} */
      const strings = []
      const loadedBy = new Set()
      // A declaration names itself (its own binding), and that is no edge.
      const self = from.replace(/@load$/, '')
      // Under tests/, a name that is neither called nor read by one named key is used whole (A NAME STILL OWED).
      const paysEveryKey = file.startsWith(THE_TESTS_FOLDER)
      /** The names that are called, or read by one named key. */
      const notWhole = new Set()
      /** @param {any} node */
      const visit = (node) => {
        if (node === null || typeof node !== 'object') return
        if (Array.isArray(node)) {
          for (const one of node) visit(one)
          return
        }
        if (typeof node.type !== 'string' || TYPE_ONLY.has(node.type)) return
        // What loading runs leaves out the bodies of the functions it only makes: they run when called.
        if (pathsFrom === null && node !== top && /^(Arrow)?Function(Expression|Declaration)$/.test(node.type)) return
        if (node.type === 'CallExpression' || node.type === 'NewExpression') notWhole.add(node.callee)
        else if (node.type === 'TaggedTemplateExpression') notWhole.add(node.tag)
        else if (node.type === 'MemberExpression' && (!node.computed || node.property.type === 'Literal')) notWhole.add(node.object)
        if (node.type === 'Identifier' || node.type === 'JSXIdentifier') {
          const through = imported.get(node.name) ?? (names.has(node.name) && `${file}#${node.name}` !== self ? `${file}#${node.name}` : undefined)
          if (through !== undefined) {
            edge(from, through)
            if (paysEveryKey && !notWhole.has(node)) {
              if (!usedWhole.has(self)) usedWhole.set(self, new Set())
              usedWhole.get(self)?.add(through)
            }
          }
        }
        const loaded =
          node.type === 'ImportExpression' ? node.source
          : node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' ? node.arguments[0]
          : undefined
        if (loaded?.type === 'Literal' && typeof loaded.value === 'string') {
          const target = resolveModule(file, loaded.value)
          if (target !== null) {
            edge(from, `${target}#*`)
            // The module's name is that edge, not a path written as text.
            loadedBy.add(loaded)
          }
        }
        if (node.type === 'Literal' && typeof node.value === 'string' && !loadedBy.has(node)) strings.push(node.value)
        if (node.type === 'TemplateLiteral' && node.expressions.length === 0) strings.push(node.quasis[0].value.cooked ?? '')
        for (const key in node) {
          if (!SKIPPED_KEYS.has(key)) visit(node[key])
        }
      }
      visit(top)
      if (pathsFrom === null) return
      for (let i = 0; i < strings.length; i += 1) {
        for (let k = 1; k <= MOST_PIECES && i + k <= strings.length; k += 1) {
          // A string with a space in it is prose, not a piece of a path, and it ends the run.
          if (/\s/.test(strings[i + k - 1] ?? '')) break
          // A test file named as text is listed, skipped or read, never loaded, so only its text is the edge.
          // Its text is read, or it is started as a program and so loaded; a test file is never loaded by path.
          for (const target of filesNamedBy(file, strings.slice(i, i + k).join('/'))) {
            edge(pathsFrom, `${target}@text`)
            if (!A_TEST_FILE.test(target)) edge(pathsFrom, target)
          }
        }
      }
    }
  }

  // A name asked of a module that does not declare it is looked for in each module it re-exports with `export *`.
  // Loading a module whose name is asked for is implied: the importer loaded it.
  /** @type {Map<string, Set<string>>} */
  const reverse = new Map()
  /** @param {string} from @param {string} to */
  const add = (from, to) => {
    if (!reverse.has(to)) reverse.set(to, new Set())
    reverse.get(to)?.add(from)
  }
  for (const [from, tos] of forward) {
    for (const to of tos) {
      add(from, to)
      const hash = to.indexOf('#')
      if (hash === -1) continue
      const module = to.slice(0, hash)
      const name = to.slice(hash + 1)
      if (name === '*' || name === '<load>' || declared.get(module)?.has(name)) continue
      for (const star of starFrom.get(module) ?? []) add(from, `${star}#${name}`)
    }
  }
  // `<module>#*`, the whole of a module (a namespace import, `import()`, `require()`), is its loading and every
  // declaration in it. A path written as text reaches only the loading: a file read as text, or a program started.
  for (const [module, names] of declared) {
    add(`${module}#*`, module)
    for (const name of names) add(`${module}#*`, `${module}#${name}`)
  }

  const tests = files.filter((file) => A_TEST_FILE.test(file))
  for (const test of tests) for (const config of THE_FILES_EVERY_TEST_RUNS_ON) if (known.has(config)) add(test, config)
  for (const { file } of THE_TESTS_THAT_WALK_TESTS) if (known.has(file)) add(file, THE_TESTS_FOLDER)
  return { files, tests, reverse, words, usedWhole, values }
}

/** @param {string} text */
const wordsIn = (text) => new Set([...(text.match(/[A-Za-z_$][\w$]*/g) ?? []), ...(text.match(/[A-Za-z_$][\w$]*(?:[.:-][\w$]+)+/g) ?? [])])

/**
 * A declaration's text with the keys of the objects written in it blanked out. A key written into an object defines
 * it, as a table of words defines its words: an English table holding a key is not a reader of that key in Chinese.
 * @param {any} node @param {string} text
 */
function withoutTheKeys(node, text) {
  /** @type {[number, number][]} */
  const keys = []
  /** @param {any} one @returns {void} */
  const visit = (one) => {
    if (one === null || typeof one !== 'object') return
    if (Array.isArray(one)) return one.forEach(visit)
    if (one.type === 'Property' && !one.computed && one.key.end <= one.value.start) keys.push([one.key.start, one.key.end])
    for (const key in one) if (key !== 'type') visit(one[key])
  }
  visit(node)
  let out = ''
  let at = node.start
  for (const [start, end] of keys.sort((a, b) => a[0] - b[0])) {
    out += `${text.slice(at, start)} `
    at = end
  }
  return out + text.slice(at, node.end)
}

/** The names a binding pattern declares: `a`, `{ a, b: c }`, `[a, ...b]`. @param {any} node @param {string[]} into */
function collectBindingNames(node, into) {
  if (node == null) return
  if (node.type === 'Identifier') into.push(node.name)
  else if (node.type === 'ObjectPattern') for (const one of node.properties) collectBindingNames(one.type === 'RestElement' ? one.argument : one.value, into)
  else if (node.type === 'ArrayPattern') for (const one of node.elements) collectBindingNames(one, into)
  else if (node.type === 'RestElement') collectBindingNames(node.argument, into)
  else if (node.type === 'AssignmentPattern') collectBindingNames(node.left, into)
}

/**
 * What a module holds at the top, as text a change can be compared by: each declaration's source under its name, with
 * the import each name in it is bound to (so re-pointing an import changes the declarations that use it); each export
 * that renames under the exported name; every statement that has no name under `<load>`. Imports themselves are not
 * a unit: an import that changes alters the declarations that use its names, and loading a module that did not change
 * runs no changed code. Types are left out, because they are erased.
 * @param {string} file @param {string} text @returns {{ texts: Map<string, string>, tables: Map<string, Map<string, string>> }}
 */
function theTopLevelTexts(file, text) {
  const program = parse(file, text)
  /** Local name → what it is bound to, as written. */
  const imports = new Map()
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue
    for (const one of statement.specifiers) {
      const imported = one.type === 'ImportDefaultSpecifier' ? 'default' : one.type === 'ImportNamespaceSpecifier' ? '*' : (one.imported.name ?? one.imported.value)
      imports.set(one.local.name, `${statement.source.value}#${imported}`)
    }
  }
  /** @type {Map<string, string>} */
  const texts = new Map()
  /** A constant that is an object written out, such as a table of words: its own text under each key. @type {Map<string, Map<string, string>>} */
  const tables = new Map()
  /** @param {string} name @param {any} node */
  const put = (name, node) => {
    const bound = new Set()
    /** @param {any} n @returns {void} */
    const visit = (n) => {
      if (n === null || typeof n !== 'object') return
      if (Array.isArray(n)) return n.forEach(visit)
      if (typeof n.type !== 'string') return
      if ((n.type === 'Identifier' || n.type === 'JSXIdentifier') && imports.has(n.name)) bound.add(`${n.name}=${imports.get(n.name)}`)
      for (const key in n) if (key !== 'type') visit(n[key])
    }
    visit(node)
    texts.set(name, `${texts.get(name) ?? ''}${text.slice(node.start, node.end)}\n${[...bound].sort().join(' ')}\n`)
  }
  /** @param {any} node @param {boolean} isDefault */
  const declaration = (node, isDefault) => {
    if (node.declare || TYPE_ONLY.has(node.type)) return true
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration' || node.type === 'TSEnumDeclaration') {
      put(node.id?.name ?? (isDefault ? 'default' : '<load>'), node)
      if (isDefault && node.id) texts.set('default', `${texts.get('default') ?? ''}=${node.id.name}\n`)
      return true
    }
    if (node.type === 'VariableDeclaration') {
      for (const one of node.declarations) {
        /** @type {string[]} */
        const bound = []
        collectBindingNames(one.id, bound)
        const only = bound.length === 1 ? bound[0] : undefined
        put(only ?? '<load>', one)
        let value = one.init
        while (value && (value.type === 'TSAsExpression' || value.type === 'TSSatisfiesExpression')) value = value.expression
        const keys = only !== undefined && value?.type === 'ObjectExpression' ? theKeysOf(value, text) : null
        if (only !== undefined && keys !== null) tables.set(only, keys)
      }
      return true
    }
    return false
  }
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') continue
    if (statement.type === 'ExportAllDeclaration') {
      if (statement.exportKind !== 'type') put(statement.exported ? (statement.exported.name ?? statement.exported.value) : '<star>', statement)
      continue
    }
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.exportKind === 'type') continue
      if (statement.declaration) declaration(statement.declaration, false)
      else for (const one of statement.specifiers) if (one.exportKind !== 'type') put(one.exported.name ?? one.exported.value, statement.source ? { ...one, start: statement.start, end: statement.end } : one)
      continue
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      if (!declaration(statement.declaration, true)) put('default', statement.declaration)
      continue
    }
    if (!declaration(statement, false)) put('<load>', statement)
  }
  return { texts, tables }
}

/**
 * The nodes of the graph a change touches. A code file that changed in place touches only the declarations whose text
 * changed (theTopLevelTexts), compared between the base and the tip: a function that changed reaches the tests that
 * call it, not every test that loads its module. A changed `export *` touches loading the module and every name in it.
 * Any other change touches the whole file: a file added, deleted or renamed, a test file, a file that is not code.
 * @param {string} root @param {{ base: string, tip: string, paths: string[] }} change
 * @param {ReturnType<typeof theGraph>} graph
 * @returns {Map<string, string>} node → the changed path it stands for
 */
export function theChangedNodes(root, change, graph) {
  const status = new Map()
  for (const line of git(root, ['diff', '--name-status', '-M', change.base, change.tip]).split('\n')) {
    if (line.trim() === '') continue
    const [kind, ...paths] = line.split('\t')
    if ((kind === 'M' || kind === 'A') && paths.length === 1) status.set(paths[0], kind)
  }
  const nodes = new Map()
  // The tests that walk tests/ from the top read every change under it (THE_TESTS_THAT_WALK_TESTS).
  const underTests = change.paths.find((path) => path.startsWith(THE_TESTS_FOLDER))
  if (underTests !== undefined) nodes.set(THE_TESTS_FOLDER, underTests)
  /** @param {string} path */
  const wholeFile = (path) => {
    for (const node of [path, `${path}@text`, `${path}#*`, ...[...graph.reverse.keys()].filter((key) => key.startsWith(`${path}#`))]) nodes.set(node, path)
  }
  for (const path of change.paths) {
    // The runner reads the whole of its configuration, whichever declaration of it changed.
    if (status.get(path) === undefined || !CODE.test(path) || /\.d\.[cm]?ts$/.test(path) || A_TEST_FILE.test(path) || THE_FILES_EVERY_TEST_RUNS_ON.includes(path)) {
      wholeFile(path)
      continue
    }
    // Whoever reads the file as text reads the change, whatever it is.
    nodes.set(`${path}@text`, path)
    const before = status.get(path) === 'A' ? theTopLevelTexts(path, '') : theTopLevelTexts(path, git(root, ['show', `${change.base}:${path}`]))
    const after = theTopLevelTexts(path, git(root, ['show', `${change.tip}:${path}`]))
    for (const name of new Set([...before.texts.keys(), ...after.texts.keys()])) {
      if (before.texts.get(name) === after.texts.get(name)) continue
      if (name === '<star>') wholeFile(path)
      else if (name === '<load>') nodes.set(`${path}#<load>`, path)
      else {
        // A table whose keys changed is owed by key: only who names a changed key reads what changed.
        const keys = theChangedKeys(before.tables.get(name), after.tables.get(name))
        for (const owed of keys ?? ['']) {
          const debt = owed === '' ? '' : `\0${path}#${owed}`
          // A value worked out at load runs when the module loads, but it is counted for the code that names it: if
          // it throws, every test that loads the module fails, and the tests that name it load it. What this leaves
          // out is a value whose working-out does something else to every loader; such a statement is best nameless.
          nodes.set(`${path}#${name}${debt}`, path)
        }
      }
    }
  }
  return nodes
}

/**
 * An object written out, key by key, with each key's own text; `...{ … }` inside it counts as its keys. Null when a
 * key is computed or something else is spread in, because then which key holds what is not written down.
 * @param {any} node @param {string} text @returns {Map<string, string> | null}
 */
function theKeysOf(node, text) {
  const keys = new Map()
  for (const one of node.properties) {
    let spread = one.type === 'SpreadElement' ? one.argument : null
    while (spread && (spread.type === 'TSAsExpression' || spread.type === 'TSSatisfiesExpression')) spread = spread.expression
    if (spread?.type === 'ObjectExpression') {
      const inner = theKeysOf(spread, text)
      if (inner === null) return null
      for (const [key, value] of inner) keys.set(key, value)
    } else if (one.type === 'Property' && !one.computed) keys.set(one.key.name ?? String(one.key.value), text.slice(one.start, one.end))
    else return null
  }
  return keys
}

/**
 * The keys whose text differs between two tables, or null when the change is not one of keys (no table on one side,
 * or the tables are the same and the change is elsewhere in the declaration, such as an import a value names).
 * @param {Map<string, string> | undefined} before @param {Map<string, string> | undefined} after
 */
function theChangedKeys(before, after) {
  if (before === undefined || after === undefined) return null
  const keys = [...new Set([...before.keys(), ...after.keys()])].filter((key) => before.get(key) !== after.get(key))
  return keys.length === 0 ? null : keys
}

/**
 * The test files that depend on any changed node, each with the changed path it was reached from.
 * Each with the shortest way from the test down to the changed declaration (trail), for saying why it is in the set.
 * The part of a trail that owed a changed key is worked out only when the trail is read (the script's --why), by
 * walking that key again alone: tools/run-named-tests.mjs and the merge queue read only which tests are related.
 * @param {ReturnType<typeof theGraph>} graph @param {Map<string, string>} changed theChangedNodes
 * @returns {Map<string, { path: string, trail: string[] }>}
 */
export function theRelatedTests(graph, changed, doors = /** @type {string[]} */ ([])) {
  // A walk over (node, the name still owed). Reaching `X#*` (the whole of X, as `import()` hands it over) from one of
  // its declarations `X#name` owes that name: whoever holds the whole module runs `name` only by naming it. The debt
  // is paid at the first declaration outside X whose words hold the name, and a changed key still carried by value
  // also by a declaration under tests/ that uses the value whole (the header, A NAME STILL OWED). A test
  // still owing the name is not related. freshDb hands the whole of records.ts to every test as `t.api`; a test that
  // never writes `theOtherEndsOf` does not run it.
  //
  // THE CHANGED KEYS WALK TOGETHER. Each changed key of a table owes its own name. Walked as states of their own, the
  // 10,441 keys of the change that added a language's words (c456842) took about 20,000 steps each before a
  // declaration said them, and the walk held all of those states at once until it ran out of the 4 GB heap after 57
  // seconds. Walked one key at a time and forgotten after, 105 of them took 12 seconds, so all of them would have
  // taken about 20 minutes. The keys take the same steps until a declaration says one of them, so they walk together:
  // each node holds the keys that reached it as one bit each, still carried by value or owed by name. That change's
  // first walk now takes 7 seconds.
  /** @param {string} node */
  const fileOf = (node) => node.replace(/[#@].*$/, '')
  /** Whether the step from `node` to `from`, which reads it, goes into a door from outside it. @param {string} node @param {string} from */
  const intoADoor = (node, from) => doors.includes(fileOf(from)) && fileOf(node) !== fileOf(from)
  /** The words a declaration says. Only a declaration names: a file that merely loads the module (a plain path) says nothing. @param {string} from */
  const theWordsOf = (from) => (from.includes('#') ? (graph.words.get(from.replace(/@load$/, '')) ?? graph.words.get(fileOf(from))) : undefined)
  /** @param {string} debt `path#name` */
  const theDebt = (debt) => ({ owner: fileOf(debt), name: debt.slice(fileOf(debt).length + 1) })
  /**
   * Whether `from`, which reads `node`, pays a name owed to the file `owner`: it is a declaration outside that file
   * whose words hold the name, or, for a key still carried by value, a declaration under tests/ that uses the value
   * whole, because it may reach every key of it.
   * @param {string} from @param {string} node @param {{ owner: string, name: string }} debt @param {boolean} byValue
   */
  const pays = (from, node, { owner, name }, byValue) =>
    fileOf(from) !== owner && (theWordsOf(from)?.has(name) === true || (byValue && graph.usedWhole.get(from.replace(/@load$/, ''))?.has(node) === true))

  /** @typedef {{ key: number, state: string }} KeyStep a changed key's state, `node\0=` or `node\0`, where it was paid */
  /** @type {Map<string, { path: string, before: string | KeyStep | null }>} `node\0owed` → the changed path, and the step before */
  const reachedFrom = new Map()
  /** @type {[string, string][]} the states the last step reached, owing nothing or a declaration's name */
  let reached = []
  /** @param {string} node @param {string} owed @param {string} path @param {string | KeyStep | null} before */
  const visit = (node, owed, path, before) => {
    const key = `${node}\0${owed}`
    if (reachedFrom.has(key)) return
    reachedFrom.set(key, { path, before })
    reached.push([node, owed])
  }
  /** @type {{ at: string, debt: string, owner: string, name: string, path: string }[]} the changed keys, each one bit of the key walk */
  const keys = []
  for (const [node, path] of changed) {
    const [at = node, owed = ''] = node.split('\0')
    if (owed === '') visit(at, '', path, null)
    else keys.push({ at, debt: owed, ...theDebt(owed), path })
  }

  /**
   * A walk of the changed keys numbered in `which`, all at once. Each state, `node\0=` for keys still carried by value
   * and `node\0` for keys owed by name, holds one bit for each of them that reached it so. Each step() takes the walk
   * one step on, tells `paid` of every key paid on the way, and answers whether there is a next step.
   * @param {number[]} which @param {(key: number, from: string, state: string) => void} paid
   * @param {(state: string, before: string) => void} [arrived] told the first step into each state
   */
  const theKeyWalk = (which, paid, arrived) => {
    const width = Math.ceil(which.length / 32)
    /** @param {Uint32Array} bits @param {number} bit */
    const has = (bits, bit) => (/** @type {number} */ (bits[bit >> 5]) & (1 << (bit & 31))) !== 0
    /** @type {Map<string, Uint32Array>} */
    const seen = new Map()
    /** @type {Map<string, Uint32Array>} the bits that reached each state at the last step */
    let arriving = new Map()
    /** @param {string} state @param {Uint32Array} bits @param {string | null} before */
    const take = (state, bits, before) => {
      let old = seen.get(state)
      for (let word = 0; word < width; word += 1) {
        const added = /** @type {number} */ (bits[word]) & ~(old?.[word] ?? 0)
        if (added === 0) continue
        if (old === undefined) {
          old = new Uint32Array(width)
          seen.set(state, old)
          if (before !== null) arrived?.(state, before)
        }
        old[word] = /** @type {number} */ (old[word]) | added
        let next = arriving.get(state)
        if (next === undefined) arriving.set(state, (next = new Uint32Array(width)))
        next[word] = /** @type {number} */ (next[word]) | added
      }
    }
    for (const [bit, key] of which.entries()) {
      const bits = new Uint32Array(width)
      bits[bit >> 5] = 1 << (bit & 31)
      // A changed key starts carried by value: the table that holds it is a value.
      take(`${/** @type {{ at: string }} */ (keys[key]).at}\0=`, bits, null)
    }
    /** @type {Map<string, number[]>} a name → the bits of the keys with that name */
    const named = new Map()
    for (const [bit, key] of which.entries()) {
      const { name } = /** @type {{ name: string }} */ (keys[key])
      named.set(name, [...(named.get(name) ?? []), bit])
    }
    /** @type {Map<Set<string>, number[]>} the words of declarations → the bits whose names they hold */
    const said = new Map()
    /** Only a key whose name the declaration says can be paid there. @param {string} from */
    const theBitsSaidBy = (from) => {
      const words = theWordsOf(from)
      if (words === undefined) return []
      let bits = said.get(words)
      if (bits === undefined) {
        bits = []
        if (named.size <= words.size) for (const [name, ones] of named) { if (words.has(name)) bits.push(...ones) }
        else for (const word of words) bits.push(...(named.get(word) ?? []))
        said.set(words, bits)
      }
      return bits
    }
    const step = () => {
      const now = arriving
      arriving = new Map()
      for (const [state, bits] of now) {
        const [node = state, carried = ''] = state.split('\0')
        const byValue = carried === '='
        for (const from of graph.reverse.get(node) ?? []) {
          if (intoADoor(node, from)) continue
          // A declaration that uses a value whole may pay any key of it, not only those it names.
          const maybe = byValue && graph.usedWhole.has(from.replace(/@load$/, '')) ? which.map((_, bit) => bit) : theBitsSaidBy(from)
          let onward = bits
          for (const bit of maybe) {
            if (!has(bits, bit) || !pays(from, node, /** @type {{ owner: string, name: string }} */ (keys[/** @type {number} */ (which[bit])]), byValue)) continue
            if (onward === bits) onward = bits.slice()
            onward[bit >> 5] = /** @type {number} */ (onward[bit >> 5]) & ~(1 << (bit & 31))
            paid(/** @type {number} */ (which[bit]), from, state)
          }
          // A function or a whole module that holds the value hands on only what its code reads, so the key is owed by name.
          take(`${from}\0${byValue && graph.values.has(from.replace(/@load$/, '')) ? '=' : ''}`, onward, state)
        }
      }
      return arriving.size > 0
    }
    return { step }
  }

  const whole = /^(.*)#\*$/
  const theKeys = theKeyWalk(keys.map((_, key) => key), (key, from, state) => visit(from, '', /** @type {{ path: string }} */ (keys[key]).path, { key, state }))
  for (let keysGoOn = keys.length > 0; reached.length > 0 || keysGoOn; ) {
    // One step for every state reached at the last one, so that each test is reached by its shortest way.
    const states = reached
    reached = []
    for (const [node, owed] of states) {
      const here = `${node}\0${owed}`
      const path = /** @type {{ path: string }} */ (reachedFrom.get(here)).path
      for (const from of graph.reverse.get(node) ?? []) {
        if (intoADoor(node, from)) continue
        let next = owed
        const module = whole.exec(from)?.[1]
        // A debt already owed stays: whoever names this declaration still runs the changed part only by naming it.
        if (next === '' && module !== undefined && node.startsWith(`${module}#`) && !/[*@]|<load>/.test(node.slice(module.length + 1))) next = node
        if (next !== '' && pays(from, node, theDebt(next), false)) next = ''
        visit(from, next, path, here)
      }
    }
    if (keysGoOn) keysGoOn = theKeys.step()
  }

  /**
   * The way the changed key took from its table to `state`, from `state` back down, walked again for that key alone.
   * @param {number} key @param {string} state
   */
  const theWayOf = (key, state) => {
    const { at, debt } = /** @type {{ at: string, debt: string }} */ (keys[key])
    /** @type {Map<string, string | null>} */
    const before = new Map([[`${at}\0=`, null]])
    const again = theKeyWalk([key], () => {}, (to, from) => before.set(to, from))
    while (!before.has(state)) if (!again.step()) throw new Error(`The way ${debt} took to ${state.split('\0')[0]} could not be walked again.`)
    /** @type {string[]} */
    const way = []
    for (let one = /** @type {string | null | undefined} */ (state); one !== null && one !== undefined; one = before.get(one)) way.push(`${one.split('\0')[0]} (owing ${debt})`)
    return way
  }
  /** @type {Map<string, { path: string, trail: string[] }>} */
  const related = new Map()
  for (const test of graph.tests) {
    const first = reachedFrom.get(`${test}\0`)
    if (first === undefined) continue
    /** @type {string[]} */
    const trail = []
    let one = /** @type {string | KeyStep | null} */ (`${test}\0`)
    while (typeof one === 'string') {
      const [node = one, owed = ''] = one.split('\0')
      trail.push(owed === '' ? node : `${node} (owing ${owed})`)
      one = /** @type {{ before: string | KeyStep | null }} */ (reachedFrom.get(one)).before
    }
    const owing = one
    related.set(test, owing === null ? { path: first.path, trail } : { path: first.path, get trail() { return [...trail, ...theWayOf(owing.key, owing.state)] } })
  }
  // A trail read later walks its key again and needs none of the states. Kept, they would stay held as long as the
  // map is, because the trails above share this function's variables, and so through the second walk as well: after
  // the walk without the doors on the change above, the heap held 2,165 MB with them and 623 MB without.
  reachedFrom.clear()
  return related
}

/**
 * THE DOORS OF THE WHOLE APPLICATION: the server's entry, which apiApp loads and liveApp starts, and the page's entry,
 * which liveApp builds. Every declaration of the server is reachable from the first and every page from the second, so
 * a test that goes through one of them depends on nearly every change: on 10 October 2026 that was 1,275 to 1,384 of
 * the files each of three changes related, and the list could never have run. So a test that reaches a change only
 * through a door is not run, and is counted and named apart (throughTheDoors) when the list is not refused. A change
 * to a door's own file still reaches through it: changing how the server is put together can break every test that
 * starts it.
 */
export const THE_DOORS_OF_THE_WHOLE_APP = ['src/server/index.ts', 'src/web/main.tsx']

/**
 * The test files a change can break, for tools/run-named-tests.mjs --list related: those that reach a changed
 * declaration other than through a door, and apart from them those that reach one only through a door.
 *
 * `refuses`, when given, is asked after the first walk whether the list is refused. A refused list runs nothing, so
 * the second walk, which only counts the files that reach the change through a door, is not made, and throughTheDoors
 * is null. On a change of 170 commits the first walk ended at 1,688 MB of heap and the second died at the heap limit
 * (wave 13r round 10, question HPXHSI_b_Tqq).
 * @param {string} root @param {string | undefined} base
 * @param {(found: { change: ReturnType<typeof theChange>, every: string[], related: Map<string, { path: string, trail: string[] }> }) => boolean} [refuses]
 */
export function theTestsAChangeCanBreak(root, base, refuses = () => false) {
  const change = theChange(root, base)
  const graph = theGraph(root)
  const changed = theChangedNodes(root, change, graph)
  const related = theRelatedTests(graph, changed, THE_DOORS_OF_THE_WHOLE_APP)
  if (refuses({ change, every: graph.tests, related })) return { change, every: graph.tests, related, throughTheDoors: null }
  const throughTheDoors = [...theRelatedTests(graph, changed).keys()].filter((test) => !related.has(test)).sort()
  return { change, every: graph.tests, related, throughTheDoors }
}

// ============================================================================ as a script

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  /** @param {string} word */
  const at = (word) => (args.includes(word) ? args[args.indexOf(word) + 1] : undefined)
  const root = at('--root') ?? process.cwd()
  const { change, every, related, throughTheDoors: counted } = theTestsAChangeCanBreak(root, at('--base'))
  // The script asks no refusal, so the second walk always runs here and the count is always made.
  const throughTheDoors = /** @type {string[]} */ (counted)
  console.log(`The change ${change.base.slice(0, 12)}..${change.tip.slice(0, 12)} names ${change.paths.length} paths; ${related.size} of ${every.length} test files depend on one of them, and ${throughTheDoors.length} more only through ${THE_DOORS_OF_THE_WHOLE_APP.join(' or ')}.`)
  // With --why, each file's way to the change, from the test down to what changed. The trail is read only then: a
  // trail that owed a changed key walks that key again when it is read.
  for (const [test, found] of [...related].sort()) console.log(args.includes('--why') ? `${found.trail.join('\n  ← ')}\n` : `${test}\t${found.path}`)
}
