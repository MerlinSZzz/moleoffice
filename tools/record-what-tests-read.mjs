// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT A TEST RUN READS, RECORDED AS IT HAPPENS. A documentation change that no test reads
 * lands by itself, and which files tests read is found by a tool, not a hand-kept list.
 * The merge tool loads this into
 * every node process of a suite run, through NODE_OPTIONS=--import=<this file>, with two variables:
 *
 *   TEST_READ_ROOT     the checkout whose files are recorded; a path outside it is not
 *   TEST_READ_RECORD   the folder each process writes its record into, one file per process
 *
 * What is recorded, as paths relative to the root:
 *   R <path>   a file read, opened, statted, tested for or imported
 *   L <path>   a folder listed: everything under it counts as read
 *   C <path>   a path given to a program a test started that is not node (messages GIxHaLdp_dyo,
 *              SFFuaKWSlVPe and VtCw66ZmGn74), alone or in a shell line. A folder given reads everything under it.
 *              Every program counts except the few known to read nothing (sleep, echo, kill and the like). One whose
 *              arguments are not literal records its working folder, and so does a walker given no path (grep -r,
 *              find, du…); any other program given literal words and no path reads nothing, and is named on an N line.
 *   T <path>   a tree of names listed: a git diff limited to added, deleted or renamed paths names every path under
 *              it whose name comes or goes, and never reads a content
 *   N <program>   a program counted as reading nothing because it named no path, once per process, so the record
 *              says which programs were let through that way and a new one is seen at the next measurement
 *   X <folder> :: <command>   the command behind those C and T lines and the folder it ran in, for whoever reads
 *              the record; it counts as no read by itself.
 *
 * It never throws into the program it watches and never changes a result: a failure to record is a missing line, and
 * the merge tool treats a run whose record is missing as having read everything. Children that are node, and scripts
 * that run under node (npm, tsc, vite), load it again through the NODE_OPTIONS they inherit; a child whose environment
 * a test replaced is given this recorder's three variables back, and that is the only change it makes to a child.
 */
import fs from 'node:fs'
import childProcess from 'node:child_process'
import * as nodeModule from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @typedef {{ cwd?: string | URL, env?: NodeJS.ProcessEnv, shell?: boolean | string }} ChildOptions */

const rootSetting = process.env['TEST_READ_ROOT']
const recordSetting = process.env['TEST_READ_RECORD']
const ROOT = rootSetting ? resolve(rootSetting) : null
const RECORD = recordSetting ? resolve(recordSetting) : null

/**
 * THE PROGRAMS KNOWN TO READ NOTHING (message SFFuaKWSlVPe). The list is of these and not of the programs that
 * read contents, because that list could never be complete, and a program it missed would let a document land
 * untested. Every program not here counts as reading what it is given, or its working folder.
 */
const READS_NOTHING = new Set(['sleep', 'echo', 'printf', 'kill', 'wait', 'true', 'false', 'test', '[', 'exit'])
/**
 * Shell words that are not programs. The first kind comes before the command it runs (`while kill -0 1`, `do sleep 1`);
 * a piece that starts with the second kind runs no program (`for name in *.md`, `case "$1" in`).
 */
const SHELL_WORDS_BEFORE = new Set(['while', 'until', 'do', 'done', 'if', 'then', 'else', 'elif', 'fi', 'esac', '!', 'time'])
const SHELL_HEADERS = new Set(['for', 'case', 'select', 'function'])
/** The shells whose -c line is read command by command. */
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh'])
/**
 * THE WALKERS: programs that read their working folder when they are given no path (message VtCw66ZmGn74).
 * grep walks only with -r or -R, and ls only with -R.
 */
const WALKERS = new Set(['rgrep', 'rg', 'fd', 'find', 'ag', 'ack', 'tree', 'du'])
/** @param {string} program
 * @param {string[]} rest */
const walks = (program, rest) =>
  WALKERS.has(program) ||
  (program === 'grep' && rest.some((word) => /^-[^-]*[rR]/u.test(word) || word === '--recursive' || word === '--dereference-recursive')) ||
  (program === 'ls' && rest.some((word) => /^-[^-]*R/u.test(word) || word === '--recursive'))
/**
 * Git's subcommands that hand file contents to whoever runs them. Their paths come after the subcommand (after `--` when
 * there is one), or they read the whole working tree. Subcommands that only name or stat files (ls-files, status,
 * rev-parse) hand no contents over, so they record nothing.
 */
const GIT_READS_CONTENTS = new Set(['grep', 'diff', 'show', 'log', 'cat-file', 'archive', 'blame'])

if (ROOT !== null && RECORD !== null) {
  const seen = new Set()
  const name = `${String(process.pid)}-${Math.random().toString(36).slice(2, 10)}`
  const out = join(RECORD, `${name}.txt`)
  // THE RECORDER'S OWN CALLS GO TO THE ORIGINALS, taken before anything is wrapped, so they are never recorded.
  const writeTo = fs.writeSync.bind(fs)
  const mkdir = fs.mkdirSync.bind(fs)
  const exists = fs.existsSync.bind(fs)
  const statOf = fs.statSync.bind(fs)
  const openOf = fs.openSync.bind(fs)
  const readOf = fs.readSync.bind(fs)
  const closeOf = fs.closeSync.bind(fs)
  let ready = false
  /** The record's file, opened once when its first line is written. @type {number | null} */
  let fd = null

  /** One path, as the root sees it, or null when it lies outside the root. */
  /** @param {unknown} path
   * @param {string} [cwd] */
  const inRoot = (path, cwd = process.cwd()) => {
    try {
      const text = typeof path === 'string' ? path : path instanceof URL ? fileURLToPath(path) : Buffer.isBuffer(path) ? path.toString('utf8') : null
      if (text === null || text === '') return null
      const absolute = isAbsolute(text) ? text : resolve(cwd, text)
      const rel = relative(ROOT, absolute)
      return rel.startsWith('..') || isAbsolute(rel) ? null : rel === '' ? '.' : rel
    } catch {
      return null
    }
  }
  /**
   * EACH NEW LINE IS WRITTEN AT ONCE, not at exit: the test runner ends its workers by killing them, and a killed
   * process runs no exit handler. Only paths not seen before are written, so a process writes each line once. The file
   * stays open, so a line costs one write and not an open, a write and a close.
   */
  /** @param {string} line */
  const write = (line) => {
    if (seen.has(line)) return
    seen.add(line)
    try {
      if (!ready) {
        mkdir(RECORD, { recursive: true })
        ready = true
      }
      if (fd === null) fd = openOf(out, 'a')
      writeTo(fd, `${line}\n`)
    } catch {
      // A line that cannot be written is a missing line, and a missing record is read by the merge tool as "read everything".
    }
  }
  /** @param {string} kind
   * @param {unknown} path
   * @param {string} [cwd]
   * @param {string | null} [text] */
  const note = (kind, path, cwd, text = null) => {
    const rel = inRoot(path, cwd)
    if (rel === null) return
    write(text === null ? `${kind} ${rel}` : `${kind} ${rel} :: ${text}`)
  }

  /**
   * Wrap fs[name] so its first argument is noted with `kind`. THE WRAPPER KEEPS EVERY PROPERTY OF THE ORIGINAL
   * (realpathSync.native, promisify's custom form), since code reads them: vite does not start without
   * realpathSync.native.
   */
  /** @param {Record<string, unknown>} target
   * @param {string} name
   * @param {string} kind
   * @param {number} [argument] */
  const watch = (target, name, kind, argument = 0) => {
    const original = target[name]
    if (typeof original !== 'function') return
    /** @this {unknown}
     * @param {...unknown} args */
    const recorded = function recorded(...args) {
      note(kind, args[argument])
      return original.apply(this, args)
    }
    Object.defineProperties(recorded, Object.getOwnPropertyDescriptors(original))
    target[name] = recorded
  }
  for (const name of ['readFileSync', 'readFile', 'existsSync', 'statSync', 'stat', 'lstatSync', 'lstat', 'accessSync', 'access', 'openSync', 'open', 'createReadStream', 'realpathSync', 'realpath', 'copyFileSync', 'copyFile', 'cpSync', 'cp']) watch(fs, name, 'R')
  for (const name of ['readdirSync', 'readdir', 'opendirSync', 'opendir', 'watch']) watch(fs, name, 'L')
  for (const name of ['readFile', 'stat', 'lstat', 'access', 'open', 'realpath', 'copyFile', 'cp']) watch(fs.promises, name, 'R')
  for (const name of ['readdir', 'opendir']) watch(fs.promises, name, 'L')

  // IMPORTS, through a loader hook that notes each file loaded under the root. It runs in this thread, through
  // registerHooks, and writes into this process's record (round 48 of wave 13j): the loader thread that register()
  // starts cost every process about 35 ms, measured on 10 October 2026, and the 32 files of the round's sample recorded
  // the same lines either way. A Node without registerHooks (before 22.15) runs the same hook in the loader's thread,
  // tools/record-what-tests-read-hooks.mjs, into a record of its own.
  try {
    // A NAMESPACE IMPORT, since a named import of registerHooks would stop this file loading on a Node without it.
    if (typeof nodeModule.registerHooks === 'function') {
      nodeModule.registerHooks({
        load(url, context, nextLoad) {
          if (url.startsWith('file:')) note('R', new URL(url))
          return nextLoad(url, context)
        },
      })
    } else {
      mkdir(RECORD, { recursive: true })
      nodeModule.register(new URL('./record-what-tests-read-hooks.mjs', import.meta.url), { data: { root: ROOT, file: join(RECORD, `${name}-imports.txt`) }, parentURL: import.meta.url })
    }
  } catch {
    // Without the hook, fs reads and children are still recorded.
  }

  /**
   * WHETHER A PROGRAM RUNS UNDER NODE: node itself, or a script whose first line calls node (npm, npx, tsc, vite, a tool
   * of this repository). Such a child records for itself, through the NODE_OPTIONS it inherits or is given back (below),
   * so what it reads is in the record already. It is found by the program's first line, not by a list of names.
   */
  const NODE = process.execPath.split('/').pop() ?? 'node'
  /** @type {Map<string, string | null>} */
  const firstLines = new Map()
  /** @param {string} program
   * @param {string} cwd
   * @param {NodeJS.ProcessEnv} env */
  const runsUnderNode = (program, cwd, env) => {
    const name = program.split('/').pop() ?? ''
    if (name === 'node' || name === NODE) return true
    const places = program.includes('/')
      ? [resolve(cwd, program)]
      : String(env['PATH'] ?? '')
          .split(':')
          .filter((one) => one !== '')
          .map((dir) => join(resolve(cwd, dir), program))
    for (const at of places) {
      if (!firstLines.has(at)) {
        let line = null
        try {
          if (statOf(at).isFile()) {
            const head = Buffer.alloc(160)
            const fd = openOf(at, 'r')
            try {
              line = head.subarray(0, readOf(fd, head, 0, head.length, 0)).toString('utf8').split('\n')[0] ?? ''
            } finally {
              closeOf(fd)
            }
          }
        } catch {
          line = null
        }
        firstLines.set(at, line)
      }
      const line = firstLines.get(at)
      if (line !== null && line !== undefined) return /^#!.*\bnode\b/u.test(line)
    }
    return false
  }

  /**
   * ONE COMMAND, as words: what it reads, noted with C (messages GIxHaLdp_dyo, pZyM8RwgmfdN, SFFuaKWSlVPe and
   * VtCw66ZmGn74). A program known to read nothing records nothing, and a program under node records for itself. Every
   * other program reads its literal path arguments. It reads everything under its working folder when a word of a shell
   * line is one the shell would expand ($VAR, $(…), a backtick, a glob), or when it is a walker given no path; given
   * literal words and no path, it reads nothing and is named on an N line. Git's own options come first, -C names where
   * it works, and only its content subcommands count. The X line says why, for whoever reads the record.
   */
  const NOT_LITERAL = /[$`*?[]/u
  const PREFIXES = new Set(['exec', 'command', 'nice', 'nohup', 'env', 'timeout', 'time', 'stdbuf', 'setsid', 'ionice'])
  /** A prefix's options that take the next word as their value: env -u NAME, timeout -s KILL, nice -n 10. */
  const TAKES_A_VALUE = new Set(['-u', '--unset', '-s', '--signal', '-k', '--kill-after', '-n', '--adjustment'])
  /** @param {string[]} given
   * @param {string} cwd
   * @param {NodeJS.ProcessEnv} env
   * @param {boolean} [lost]
   * @param {boolean} [fromAShell] */
  const noteACommand = (given, cwd, env, lost = false, fromAShell = false) => {
    // A WORD IS ONLY NOT LITERAL WHERE A SHELL WOULD EXPAND IT (measurement 4 of 24 September, word VSmfXm6Bf1D8):
    // an argument given in an array, with no shell, reaches the program exactly as written, so a `?` or a `$` in a
    // prompt is a character and not a pattern. Only the words of a shell line can be not literal.
    /** @param {string} word */
    const notLiteral = (word) => fromAShell && NOT_LITERAL.test(word)
    let words = given.filter((one) => one !== '')
    // PREFIXES THAT RUN THE COMMAND AFTER THEM (nice -n 10, timeout 30s, env -i), and assignments before it
    // (NAME=value, which alone run nothing), are not the program; nor is a bare number, which no program is named.
    /** @type {string[]} */
    const before = []
    while (words.length > 0) {
      const word = /** @type {string} */ (words[0])
      const assignment = /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word)
      if (!assignment && !(words.length > 1 && (PREFIXES.has(word) || word.startsWith('-') || /^[0-9][0-9.]*[smhd]?$/u.test(word)))) break
      before.push(/** @type {string} */ (words.shift()))
      if (TAKES_A_VALUE.has(word) && words.length > 1) before.push(/** @type {string} */ (words.shift()))
    }
    const raw = (words[0] ?? '').replace(/^["']|["']$/gu, '')
    const program = raw.split('/').pop() ?? ''
    if (program === '' || READS_NOTHING.has(program)) return
    // A NODE CHILD WHOSE ENVIRONMENT IS CLEARED ON THE LINE (env -i, env -u NODE_OPTIONS, NODE_OPTIONS=…), or in a shell
    // line that started this one, loses this recorder, so it is read as any other program, its working folder included.
    const cleared = lost || before.some((word, at) => word === '-i' || word === '--ignore-environment' || /^NODE_OPTIONS=/u.test(word) || (TAKES_A_VALUE.has(word) && before[at + 1] === 'NODE_OPTIONS') || word === '--unset=NODE_OPTIONS')
    // A SHELL GIVEN A LINE TO RUN (sh -c '…') is read as a shell line in its turn, whether a test started it or a line
    // reached it through "$@" or a prefix; the words after the line are its $0 and the rest.
    if (SHELLS.has(program)) {
      let flags = 1
      while (flags < words.length && /^-[A-Za-z]+$/u.test(/** @type {string} */ (words[flags]))) flags += 1
      if (words.slice(1, flags).some((one) => /^-[A-Za-z]*c[A-Za-z]*$/u.test(one))) {
        noteAShellLine(String(words[flags] ?? ''), words.slice(flags + 1), cwd, env, cleared)
        return
      }
    }
    // A PROGRAM WHOSE NAME IS NOT LITERAL ($RUN, $(…)) could be anything, so it reads its working folder.
    if (notLiteral(raw)) {
      note('C', cwd)
      if (inRoot(cwd) !== null) note('X', cwd, undefined, words.join(' ').slice(0, 300))
      return
    }
    const underNode = runsUnderNode(raw, cwd, env)
    if (underNode && !cleared) return
    let where = cwd
    let rest = words.slice(1).map((word) => word.replace(/^["']|["']$/gu, ''))
    if (program === 'git') {
      // GIT'S OWN OPTIONS COME FIRST: -C names where it works, not what it reads.
      while (rest.length > 0 && /** @type {string} */ (rest[0]).startsWith('-')) {
        const option = rest.shift()
        if (option === '-C' && rest.length > 0) where = resolve(where, /** @type {string} */ (rest.shift()))
        else if ((option === '-c' || option === '--git-dir' || option === '--work-tree') && rest.length > 0) rest.shift()
      }
      const subcommand = rest.shift() ?? ''
      if (!GIT_READS_CONTENTS.has(subcommand)) return
      // A DIFF LIMITED TO ADDED, DELETED OR RENAMED PATHS NAMES PATHS AND READS NO CONTENT (message
      // VtCw66ZmGn74): it lists the tree of names under its pathspec, or under where it works. Any other diff, a
      // name-only one included, names the files whose contents differ, so it reads every path in its range.
      const filter = rest.find((word) => word.startsWith('--diff-filter='))
      if (subcommand === 'diff' && filter !== undefined && /^[ADR]+$/u.test(filter.slice('--diff-filter='.length))) {
        // Its pathspec after `--`, when every word of it is literal and names a path that is here; else where it works,
        // since a pathspec naming a deleted path, or one that cannot be seen, could name anything under it.
        const dashes = rest.indexOf('--')
        const spec = dashes === -1 ? [] : rest.slice(dashes + 1)
        const named = spec.length > 0 && spec.every((word) => !notLiteral(word) && exists(resolve(where, word))) ? spec : []
        for (const path of named.length > 0 ? named : ['.']) note('T', resolve(where, path))
        if (inRoot(where) !== null) note('X', where, undefined, words.join(' ').slice(0, 300))
        return
      }
      // A LOG READS COMMITS, NOT FILES, unless it is asked for their changes.
      if (subcommand === 'log' && !rest.some((word) => /^(?:-p|--patch|-u|--stat|--numstat|--shortstat|-S|-G|--follow)/u.test(word))) return
      const after = rest.indexOf('--')
      if (after !== -1) rest = rest.slice(after + 1)
    }
    const said = () => {
      if (inRoot(where) !== null) note('X', where, undefined, words.join(' ').slice(0, 300))
    }
    if (rest.some((word) => notLiteral(word))) {
      note('C', where)
      said()
      return
    }
    // A PATH GIVEN IS A PATH READ, inside the root or not; only one inside it is noted.
    let named = 0
    for (const word of rest) {
      if (word.startsWith('-')) continue
      const at = resolve(where, word)
      if (!exists(at)) continue
      named += 1
      note('C', at)
    }
    // A PROGRAM GIVEN LITERAL WORDS AND NO PATH READS NOTHING (message VtCw66ZmGn74), unless it is a walker, which
    // reads its working folder when given no path, or a node child that lost this recorder. It is named on the record,
    // so a program let through this way is seen.
    if (underNode || (named === 0 && (program === 'git' || walks(program, rest)))) note('C', where)
    else if (named === 0) {
      if (inRoot(where) !== null) write(`N ${program}`)
      return
    }
    said()
  }

  /**
   * SHELL WORDS THAT RUN NO PROGRAM AND READ NO FILE: they set variables, move through a loop or change the shell's
   * own state. `cd` is followed, since the paths after it are read from where it went.
   */
  const SHELL_OWN = new Set(['export', 'local', 'readonly', 'declare', 'typeset', 'unset', 'set', 'shift', 'trap', 'return', 'break', 'continue', 'umask', 'ulimit', 'read', ':', 'cd'])

  /**
   * A SHELL LINE, read command by command: split at ; & | ( ) { } and new lines, after the redirections that hold an &
   * (2>&1, &>) are taken out. "$0" and "$@" stand for the command that follows the script in the call, as the shell
   * reads them, so `sleep 300 & echo $!` reads nothing and a watchdog wrapper that ends in `exec "$0" "$@"` reads what
   * the command it runs reads. A file given to `<` is read whatever the command; one given to `>` is written.
   */
  /** @param {string} script
   * @param {string[]} positional
   * @param {string} start
   * @param {NodeJS.ProcessEnv} env
   * @param {boolean} [lost] */
  const noteAShellLine = (script, positional, start, env, lost = false) => {
    let cwd = start
    const text = script.replace(/[0-9]*[<>]&[0-9-]+/gu, ' ').replace(/&>>?/gu, ' >').replace(/\|&/gu, '|')
    for (const piece of text.split(/[;&|(){}\n]+/u)) {
      const kept = []
      const words = piece.trim().split(/\s+/u).filter((one) => one !== '')
      for (let at = 0; at < words.length; at += 1) {
        const redirection = /** @type {string} */ (words[at]).match(/^[0-9]*(<<<|<<-?|<>|<|>>|>\||>)(.*)$/u)
        if (redirection === null) {
          kept.push(/** @type {string} */ (words[at]))
          continue
        }
        const target = (redirection[2] !== '' ? /** @type {string} */ (redirection[2]) : (words[(at += 1)] ?? '')).replace(/^["']|["']$/gu, '')
        if (redirection[1] !== '<' && redirection[1] !== '<>') continue
        if (NOT_LITERAL.test(target)) note('C', cwd)
        else if (target !== '' && exists(resolve(cwd, target))) note('C', resolve(cwd, target))
        note('X', cwd, undefined, piece.trim().slice(0, 300))
      }
      let command = kept
      if (command.length > 0 && SHELL_HEADERS.has(/** @type {string} */ (command[0]))) continue
      while (command.length > 0 && (SHELL_WORDS_BEFORE.has(/** @type {string} */ (command[0])) || /** @type {string} */ (command[0]) === 'exec' || /** @type {string} */ (command[0]) === 'command')) command.shift()
      if (command.length > 0 && /^"?\$0"?$/u.test(/** @type {string} */ (command[0]))) command = [positional[0] ?? '', ...command.slice(1)]
      command = command.flatMap((word) => (/^"?\$@"?$/u.test(word) ? positional.slice(1) : [word]))
      // ASSIGNMENTS BEFORE A COMMAND (IFS= read -r word) set its environment: the command is the first word after them.
      const at = command.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(word))
      if (at === -1) continue
      if (SHELL_OWN.has(/** @type {string} */ (command[at]))) {
        // A `cd` whose folder cannot be seen leaves every later path unplaced: they are read from the root, whole.
        if (/** @type {string} */ (command[at]) === 'cd') cwd = command.length > at + 1 && !NOT_LITERAL.test(/** @type {string} */ (command[at + 1])) ? resolve(cwd, /** @type {string} */ (command[at + 1]).replace(/^["']|["']$/gu, '')) : ROOT
        continue
      }
      noteACommand(command, cwd, env, lost, true)
    }
  }

  /** A PROGRAM A TEST STARTS (node children record for themselves): one command, or a shell line, which noteACommand
   * also recognises in `sh -c '…'`. */
  /** @param {unknown} command
   * @param {unknown} args
   * @param {ChildOptions | null | undefined} options
   * @param {boolean} [viaShell] */
  const noteAChild = (command, args, options, viaShell = false) => {
    try {
      const cwd = options && typeof options.cwd === 'string' ? options.cwd : options && options.cwd instanceof URL ? fileURLToPath(options.cwd) : process.cwd()
      const env = options && options.env && typeof options.env === 'object' ? options.env : process.env
      const list = Array.isArray(args) ? args.map(String) : []
      if (viaShell || (options && options.shell)) {
        noteAShellLine([String(command), ...list].join(' '), [], cwd, env)
        return
      }
      noteACommand([String(command), ...list], cwd, env)
    } catch {
      // Recording a child never stops it from starting.
    }
  }

  /**
   * A CHILD GIVEN AN ENVIRONMENT OF ITS OWN IS GIVEN THIS RECORDER BACK: the import in NODE_OPTIONS and the two
   * variables, added to what the test wrote and only where missing, so a node process a test starts with PATH alone
   * still records. It is the only change the recorder makes to a child.
   */
  const IMPORT = `--import=${fileURLToPath(import.meta.url)}`
  /** @param {ChildOptions | null | undefined} options */
  const carried = (options) => {
    if (!options || typeof options !== 'object' || !options.env || typeof options.env !== 'object') return options
    const env = { ...options.env }
    const imports = typeof env['NODE_OPTIONS'] === 'string' ? env['NODE_OPTIONS'] : ''
    let changed = false
    if (!imports.includes('record-what-tests-read')) {
      env['NODE_OPTIONS'] = imports === '' ? IMPORT : `${imports} ${IMPORT}`
      changed = true
    }
    for (const [name, value] of /** @type {[string, string][]} */ ([['TEST_READ_ROOT', ROOT], ['TEST_READ_RECORD', RECORD]])) {
      if (!env[name]) {
        env[name] = value
        changed = true
      }
    }
    return changed ? { ...options, env } : options
  }
  /** @param {unknown[]} passed
   * @param {number} at */
  const withTheRecorder = (passed, at) => {
    if (at < 0 || at >= passed.length) return passed
    try {
      passed[at] = carried(/** @type {ChildOptions | null | undefined} */ (passed[at]))
    } catch {
      // The child starts as the test asked.
    }
    return passed
  }
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']) {
    const original = /** @type {Record<string, (...args: unknown[]) => unknown>} */ (/** @type {unknown} */ (childProcess))[name]
    if (typeof original !== 'function') continue
    /** @this {unknown}
     * @param {unknown} command
     * @param {unknown} args
     * @param {ChildOptions | undefined} options */
    const recorded = function recorded(command, args, options) {
      const at = Array.isArray(args) ? 2 : args !== null && typeof args === 'object' ? 1 : -1
      // A forked child is node, and records for itself.
      if (name !== 'fork') noteAChild(command, Array.isArray(args) ? args : [], Array.isArray(args) ? options : /** @type {ChildOptions | null | undefined} */ (args))
      return original.apply(this, withTheRecorder(Array.from(arguments), at))
    }
    Object.defineProperties(recorded, Object.getOwnPropertyDescriptors(original))
    ;/** @type {Record<string, unknown>} */ (childProcess)[name] = recorded
  }
  for (const name of ['exec', 'execSync']) {
    const original = /** @type {(...args: unknown[]) => unknown} */ (/** @type {Record<string, unknown>} */ (childProcess)[name])
    /** @this {unknown}
     * @param {unknown} command
     * @param {ChildOptions | undefined} options */
    const recorded = function recorded(command, options) {
      noteAChild(String(command), undefined, typeof options === 'object' ? options : undefined, true)
      return original.apply(this, withTheRecorder(Array.from(arguments), 1))
    }
    Object.defineProperties(recorded, Object.getOwnPropertyDescriptors(original))
    ;/** @type {Record<string, unknown>} */ (childProcess)[name] = recorded
  }
  // AND THE NAMED IMPORTS SEE THE WRAPPED FUNCTIONS: `import { readFileSync } from 'node:fs'` binds to what the
  // module exported when it loaded, until this carries the change over.
  nodeModule.syncBuiltinESMExports()
}
