// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE TERMINAL HOLDER: A SMALL PROCESS THAT OWNS THE OFFICE'S TERMINALS. Wave 13u, round 1.
 *
 *   node src/holder/index.mjs --database <the office's database path>
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A PROCESS OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * A terminal (a pty) dies with the process that holds it. If the server held the terminals, every
 * merge, restart and tray Restart would end every one of them. So the service command starts this
 * holder beside the server, without --stop-with-pid, and it keeps running when the server stops. The
 * server talks to it over a local socket and records it in the office's process ledger. It is
 * stopped through the ledger's door, which sends SIGTERM to its process group. On Windows, where a
 * group is a Job Object and takes no SIGTERM, it listens for a stop request on its group's pipe, as
 * the server and the message worker do, and the ledger's door does not send that request yet.
 * Whichever way the ask comes, the stop is begun once (stopWhenAsked).
 *
 * IT IS KEPT SMALL, because replacing it ends its terminals. It knows nothing of the office: not who
 * may type, not which records exist. Any program that reaches its socket, which only this user's
 * programs can on Linux and the Mac, is answered. On Windows it listens on a named pipe with the
 * access list Windows gives a new pipe, and what that list lets reach it has not been read there.
 * The server gives each terminal its command, its folder and its environment, and decides who may
 * do what. The holder only holds.
 *
 * IT RUNS ON PLAIN NODE, the Node the installers carry, and never inside the Electron window. The pty
 * library is a native module. Loaded here, outside the window, it never has to be rebuilt for
 * Electron.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT KEEPS, AND WHERE
 * ---------------------------------------------------------------------------------------
 *
 * Every terminal, in memory only. Each one has a headless screen (@xterm/headless) that reads the
 * terminal's output as a viewer would, with THE_SCROLLBACK_LINES lines of the past above it. A new
 * viewer is given that screen, written out by @xterm/addon-serialize, and then the output as it
 * comes. Nothing a terminal shows and nothing typed into it is written to disk, to the log or to a
 * backup: keys can land in a terminal (problem __4iR4FkFAGS). The log holds only when the holder and
 * each terminal started and ended.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS ON THE SOCKET
 * ---------------------------------------------------------------------------------------
 *
 * One JSON object per line, both ways. A request is `{ id, op, ... }`. Its answer is `{ id, ok: true,
 * ... }` or `{ id, ok: false, error }`, where `error` is a sentence, with `code` (no-such-terminal, ended or
 * half-typed) when it is one of the refusals the server tells apart. A connection that watches a
 * terminal is also sent `{ event: 'output', terminal, data }`, `{ event: 'resized', terminal, cols, rows }` and
 * `{ event: 'ended', terminal, exit }`.
 *
 *   hello                   who this holder is: { protocol, pid, startedAt, database, understands }, where
 *                                       understands names the requests newer than the protocol (UNDERSTANDS)
 *   list                    every terminal it holds: { terminals }
 *   open                    start one: { who, agent, project, command, args, folder, env, cols, rows, keeping, prepared? }
 *                                       -> { terminal }, where prepared is { line, by }: one line a secretary prepared,
 *                                       typed in once the shell is quiet and never entered (prepareALine)
 *   watch   { terminal }    the screen now, then its output on this connection: { terminal, screen }
 *   write   { terminal, data }          -> { linesToTake }: how many ended lines wait to be taken
 *   quickInput { terminal, input }      type one line the office was asked for, then Enter, and never read it as
 *                                       the person's typing -> { entered: true } | { entered: false, why }
 *   typeALine { terminal, text }        type one line for somebody other than the person, then Enter, and never
 *                                       read it as the person's typing -> { entered: true, linesToTake }
 *                                       | { entered: false, why, linesToTake }
 *   resize  { terminal, cols, rows }
 *   close   { terminal }    end it if it runs, and forget it
 *   lastLine { terminal }   the last line the person typed, if the screen showed it: { line: { text, at } | null, why }
 *   keeping { terminal, on }            turn keeping what the person types on or off -> { terminal }
 *   takeLines { terminal }              the ended lines the screen has been asked about, given once and then let go:
 *                                       { lines: [{ text, at } | { left: 'not-shown' | 'edited' | 'typed-by-another', at }], waiting }
 *   nameATerminal { terminal, name, group, tags }   the name, the group and the tags the person gives it, kept with it
 *                                       in memory until it is closed or the holder ends -> { terminal }
 *
 * A watcher that cannot keep up is let go rather than buffered without end: when more than
 * THE_MOST_A_WATCHER_MAY_FALL_BEHIND bytes wait for it, its connection is closed. A viewer that comes
 * back is given the screen again, so nothing it needs is lost.
 */

import { randomBytes } from 'node:crypto'
import { createPrivateLogin } from './private-sandbox-login.mjs'
import { theInstalledLogin } from './private-sandbox-login-installed.mjs'
import { PrivateLoginError } from '../config/private-sandbox-login.mjs'
import { chmodSync, mkdirSync, statSync, unlinkSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { dirname, isAbsolute, resolve } from 'node:path'
import pty from 'node-pty'
import headless from '@xterm/headless'
import serialize from '@xterm/addon-serialize'
import { aWatchOnTheStarter, startTimeOf } from '../config/session-process.mjs'
import { thisSystem } from '../config/systems/the-system.mjs'
import { isTheProgramRun, THE_HOLDER_ENTRY } from '../config/settings.mjs'
import { localStampOf } from '../config/stopped-run-cause.mjs'
import { THE_TEST_RUN_FLAG, THE_TEST_RUN_WATCH_PERIOD_MS, theTestRunToEndWith } from '../config/the-test-mark.mjs'
import { A_CONTROL_CHARACTER } from '../config/a-control-character.mjs'
import {
  THE_HOLDER_PROTOCOL,
  THE_HOLDER_REQUESTS as UNDERSTANDS,
  THE_LARGEST_SIDE,
  THE_LONGEST_REQUEST_CHARACTERS,
  THE_LONGEST_TERMINAL_GROUP,
  THE_LONGEST_TERMINAL_NAME,
  THE_LONGEST_TERMINAL_TAG,
  THE_LONGEST_WAIT_TO_TYPE_A_PREPARED_LINE_MS,
  THE_MOST_TAGS_ON_A_TERMINAL,
  THE_SCROLLBACK_LINES,
  theCopyThisIs,
  theLongestSocketPathBytes,
  theTerminalHolderSocket,
} from '../config/the-terminal-holder.mjs'

const { Terminal } = headless
const { SerializeAddon } = serialize

/** How many bytes may wait for one watcher before its connection is closed. */
export const THE_MOST_A_WATCHER_MAY_FALL_BEHIND = 8 * 1024 * 1024

/** What a request's handler gives back when it has sent its answer itself (watch does). */
const ALREADY_ANSWERED = Symbol('already answered')

/** How long the holder waits for its terminals to end after it has asked them to, when it stops. */
const STOP_WAIT_MS = 3_000

/**
 * HOW OFTEN THE HOLDER LOOKS FOR ITS SOCKET FILE (wave 13u, round 11). A file removed from under a running holder (a
 * cleaner of the temporary folder, a person tidying the folder) leaves it holding every terminal and reachable by
 * nobody. When the file is gone it listens again at the same path, and says so in its log.
 */
const SOCKET_CHECK_MS = 2_000

/**
 * @typedef {{ code: number, signal: number | null }} Exit
 * @typedef {{
 *   id: string, who: unknown, agent: unknown, project: string, command: string, args: string[], folder: string,
 *   envNames: string[], cols: number, rows: number, openedAt: string,
 *   endedAt: string | null, exit: Exit | null, closed: boolean, keeping: boolean, typing: Typing,
 *   prepared: Prepared | null, name: string | null, group: string | null, tags: string[],
 *   pty: import('node-pty').IPty, screen: import('@xterm/headless').Terminal,
 *   serializer: import('@xterm/addon-serialize').SerializeAddon, watchers: Set<import('node:net').Socket>,
 * }} Held
 */

/**
 * THE LAST LINE THE PERSON TYPED INTO A TERMINAL, kept in memory only, as the screen is, for the press that keeps it as
 * the person's own words; wave 13u added it in round 3. `buffer` is the line being typed now.
 * `clean` is false once something came that is not plain typing (an arrow key, a control key), because the line on the
 * screen can then differ from the characters sent, and such a line is never offered. `last` is the last line ended with
 * Enter, and `shown` says whether the screen showed it: a password typed at a prompt that does not echo is never shown,
 * so it is never offered.
 *
 * KEEPING EVERY LINE. Wave 13u, round 4 built it, by decision YLv8grhgilBV under a decision of the
 * owner's. While a terminal's
 * `keeping` is on, each line ended with Enter also waits in `ended` until the server takes it, a moment after Enter.
 * A line the screen did not show, and a line edited with an arrow or another control key, waits without its text, so
 * the server is told only that it was left out and why. The server takes the lines after each Enter it passes on, so
 * a line waits here for well under a second; turning keeping off lets every waiting line go.
 *
 * A LINE TYPED FOR SOMEBODY ELSE (typeALine, wave 13s, round 83) is marked by `byAnother` on `Typing` before it is
 * written (round 86), and the mark stays until the line ends. A line that ends with the mark on waits in `ended` as
 * `byAnother`, without its text, and is never the person's last line, also when the person typed into it or pressed
 * Enter on it in the holder's pause: part of it was not the person's, and a count of lines changed with an arrow key
 * would say something false about it. A quick input carries the same mark until its line ends (round 87). When the
 * holder's own Enter ends it, it waits nowhere, as before: it was never the person's typing. When the person typed onto
 * either in the pause, `clean` is false until the line ends, so no later line is typed onto it (round 98).
 *
 * A PREPARED LINE (prepareALine) is on the screen before the person has typed anything: a secretary prepared it and the
 * holder typed it, with no Enter. So a terminal opened with one starts with the mark on and `clean` false. No line is
 * typed onto it, and when the person ends it with their Enter it waits as typed by another and is never their last line.
 *
 * @typedef {{ line: string, by: { kind: 'agent', id: string } }} Prepared
 * @typedef {{ text: string | null, at: string, shown: boolean | null, byAnother?: true }} Ended
 * @typedef {{
 *   buffer: string, clean: boolean, byAnother: boolean, last: { text: string, at: string, shown: boolean } | null,
 *   ended: Ended[],
 * }} Typing
 */

/** Bracketed paste wraps pasted text in these two markers; the text between them is typing like any other. */
const PASTE_MARKERS = /\x1b\[20[01]~/g

/**
 * WHAT A TERMINAL VIEW SENDS ON ITS OWN, WHICH NO KEY SENDS (wave 13s, round 209). The page's terminal (@xterm/xterm
 * 6.0.0) reports focus and answers a program's questions through the same input as the person's keys. None of it is
 * typing, so it leaves the person's line as it was: focus in and out (ESC [ I, ESC [ O), the device attributes
 * (ESC [ ? … c, ESC [ > … c), the status report (ESC [ 0 n), the cursor position on a row below the first or in its
 * private form (ESC [ row ; column R, ESC [ ? row ; column R), a mode's state (… $ y), the text area's and a cell's size
 * (ESC [ 4, 6 or 8 ; … t), a setting's value (ESC P 0 or 1 $ r … ESC \) and a colour's value (ESC ] … ; rgb:… ESC \).
 * Two still mark the line, as any other control character does: the cursor position on the first row, which reads the
 * same as F3 with Ctrl, Shift or Alt, and the person's own mouse, whose click is the program's to read. A report is
 * taken out only when it is whole in one piece of input. Alt+[ and then a capital I or O, joined into one piece by the
 * page's typist, read the same as focus in or out and are taken out too.
 */
const TERMINAL_REPORTS =
  /\x1b\[[IO]|\x1b\[[?>][\d;]*c|\x1b\[0n|\x1b\[(?:[2-9]|\d{2,});\d+R|\x1b\[\?\d+;\d+R|\x1b\[\??\d+;\d+\$y|\x1b\[[468];\d+;\d+t|\x1bP[01]\$r[^\x1b]*\x1b\\|\x1b\][\d;]+;rgb:[\da-fA-F/]+\x1b\\/g

/** How long after Enter the screen is asked whether it showed the line. */
const SHOWN_AFTER_MS = 300

/**
 * HOW LONG A QUICK INPUT WAITS BEFORE ITS ENTER (wave 13u, round 21). Sent in the same write as the text, an Enter can
 * be read as part of a paste and put on the line instead of sending it. The pause lets it arrive as a key of its own.
 * It was not measured against Claude Code or Codex.
 */
const QUICK_INPUT_PAUSE_MS = 100

/**
 * WHEN A PREPARED LINE IS TYPED: once the shell has written something, such as its prompt, and has then been quiet for
 * PREPARED_QUIET_MS, or after THE_LONGEST_WAIT_TO_TYPE_A_PREPARED_LINE_MS when it never is. A line typed before the
 * shell reads its input can be shown twice, once by the terminal and once by the shell. Neither number was measured
 * against a slow shell; a shell that starts later than the longest wait reads the line from what waits for it.
 */
const PREPARED_QUIET_MS = 150

/**
 * THE PREPARED LINE OF AN OPEN, checked here although the server checked it first: the holder types it into a terminal
 * the person runs, so a key in it would run it before their Enter. It is one line of text with no key in it
 * (A_CONTROL_CHARACTER), prepared by a named agent. None is null.
 *
 * @param {unknown} prepared
 * @returns {Prepared | null}
 */
function thePreparedLine(prepared) {
  if (prepared === undefined || prepared === null) return null
  const refused = () =>
    new Error('open refuses the prepared line: it must be one line of text with no key such as Enter in it, and name the agent that prepared it. Nothing was opened.')
  if (typeof prepared !== 'object' || Array.isArray(prepared)) throw refused()
  const { line, by } = /** @type {Record<string, unknown>} */ (prepared)
  if (typeof line !== 'string' || line === '' || A_CONTROL_CHARACTER.test(line)) throw refused()
  if (by === null || typeof by !== 'object' || Array.isArray(by)) throw refused()
  const { kind, id } = /** @type {Record<string, unknown>} */ (by)
  if (kind !== 'agent' || typeof id !== 'string' || id === '') throw refused()
  return { line, by: { kind, id } }
}

/**
 * WHETHER THE HOLDER KEEPS A NAME, A GROUP OR A TAG AS IT CAME. The server trims what the person wrote and checks it
 * first; the holder keeps only a value already in that form: some text with no space at either end, no key in it and
 * at most `longest` characters.
 *
 * @param {unknown} value
 * @param {number} longest
 * @returns {value is string}
 */
function aKeptLabel(value, longest) {
  return typeof value === 'string' && value !== '' && value === value.trim() && Array.from(value).length <= longest && !A_CONTROL_CHARACTER.test(value)
}

/**
 * ONE NAME OR GROUP THE PERSON GIVES A TERMINAL, or null for none.
 *
 * @param {unknown} value
 * @param {string} what
 * @param {number} longest
 * @returns {string | null}
 */
function aTerminalLabel(value, what, longest) {
  if (value === null) return null
  if (!aKeptLabel(value, longest)) {
    throw new Error(
      `nameATerminal needs ${what} as null or as 1 to ${String(longest)} characters, with no space at either end and no key such as Enter. Nothing was changed.`,
    )
  }
  return value
}

/**
 * THE TAGS THE PERSON GIVES A TERMINAL: at most THE_MOST_TAGS_ON_A_TERMINAL, each kept as a name is (aKeptLabel), and
 * none twice.
 *
 * @param {unknown} tags
 * @returns {string[]}
 */
function theTerminalTags(tags) {
  const refused = () =>
    new Error(
      `nameATerminal needs tags as a list of at most ${String(THE_MOST_TAGS_ON_A_TERMINAL)} different tags, each of 1 to ${String(THE_LONGEST_TERMINAL_TAG)} characters with no space at either end and no key such as Enter. Nothing was changed.`,
    )
  if (!Array.isArray(tags) || tags.length > THE_MOST_TAGS_ON_A_TERMINAL) throw refused()
  /** @type {string[]} */
  const kept = []
  for (const tag of tags) {
    if (!aKeptLabel(tag, THE_LONGEST_TERMINAL_TAG) || kept.includes(tag)) throw refused()
    kept.push(tag)
  }
  return kept
}

/** @param {string} line */
function log(line) {
  process.stdout.write(`${localStampOf(new Date())} ${line}\n`)
}

/** @param {string[]} argv */
function theDatabaseNamed(argv) {
  const at = argv.indexOf('--database')
  const path = at < 0 ? undefined : argv[at + 1]
  if (path === undefined || path === '') {
    throw new Error('The terminal holder needs --database <path>: the database of the office it holds terminals for.')
  }
  return resolve(path)
}

/** A short id for a terminal, never reused while the holder runs. */
function aNewId() {
  return randomBytes(9).toString('base64url')
}

/**
 * @param {unknown} value
 * @param {string} name
 */
function aSide(value, name) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 1 || /** @type {number} */ (value) > THE_LARGEST_SIDE) {
    throw new Error(`${name} must be a whole number from 1 to ${String(THE_LARGEST_SIDE)}.`)
  }
  return /** @type {number} */ (value)
}

/**
 * THE HOLDER ITSELF, as an object a test can start in its own process and stop.
 *
 * `system` says how it listens and how it ends a terminal; it is the system this process runs on, and a test may name
 * another. Its address is always this system's, because only this system's can be listened on here.
 *
 * @param {{ database: string, env?: Record<string, string | undefined>, privateLogin?: import('./private-sandbox-login.mjs').PrivateLoginService, system?: import('../config/systems/the-system.mjs').ASystem }} options
 */
export function aHolder(options) {
  const privateLogin = options.privateLogin ?? createPrivateLogin()
  const env = options.env ?? process.env
  const system = options.system ?? thisSystem()
  const socketPath = theTerminalHolderSocket(options.database, env)
  // WHEN THIS PROCESS BEGAN, as the process table says, in the stamp the ledger compares. Null when the
  // table cannot say, rather than a guess.
  const started = startTimeOf(process.pid)
  const startedAt = started === null ? null : localStampOf(started)
  /** @type {Map<string, Held>} */
  const terminals = new Map()

  /** @param {Held} t */
  const describe = (t) => ({
    id: t.id,
    who: t.who,
    agent: t.agent,
    project: t.project,
    command: t.command,
    args: t.args,
    folder: t.folder,
    envNames: t.envNames,
    state: t.exit === null ? 'running' : 'ended',
    // THE PID IS READ FROM THE PTY EACH TIME. On Windows node-pty learns it only once the pseudo console connects, and
    // reads 0 until then.
    pid: t.pty.pid,
    cols: t.cols,
    rows: t.rows,
    openedAt: t.openedAt,
    endedAt: t.endedAt,
    exit: t.exit,
    keeping: t.keeping,
    prepared: t.prepared,
    name: t.name,
    group: t.group,
    tags: t.tags,
  })

  /** @param {string} id */
  const theTerminal = (id) => {
    const t = typeof id === 'string' ? terminals.get(id) : undefined
    if (t === undefined) throw Object.assign(new Error(`This holder holds no terminal ${JSON.stringify(id)}.`), { code: 'no-such-terminal' })
    return t
  }

  /**
   * @param {import('node:net').Socket} socket
   * @param {object} message
   */
  const send = (socket, message) => {
    if (socket.destroyed) return
    socket.write(`${JSON.stringify(message)}\n`)
  }

  /**
   * SEND ONE EVENT TO EVERY WATCHER OF A TERMINAL, letting go of any that has fallen too far behind.
   *
   * @param {Held} t
   * @param {object} message
   */
  const tellTheWatchers = (t, message) => {
    for (const socket of t.watchers) {
      if (socket.writableLength > THE_MOST_A_WATCHER_MAY_FALL_BEHIND) {
        t.watchers.delete(socket)
        socket.destroy()
        continue
      }
      send(socket, message)
    }
  }

  /**
   * TYPE A PREPARED LINE INTO A TERMINAL THAT HAS JUST OPENED, with no Enter, once the shell is quiet (PREPARED_QUIET_MS
   * above). Nothing is typed into a terminal that ended or was closed first.
   *
   * @param {Held} t
   * @param {string} line
   * @returns {Promise<void>}
   */
  const typeThePreparedLine = (t, line) =>
    new Promise((done) => {
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let quiet
      let typed = false
      const type = () => {
        if (typed) return
        typed = true
        clearTimeout(quiet)
        clearTimeout(longest)
        heard.dispose()
        if (!t.closed && t.exit === null) t.pty.write(line)
        done()
      }
      const longest = setTimeout(type, THE_LONGEST_WAIT_TO_TYPE_A_PREPARED_LINE_MS)
      const heard = t.pty.onData(() => {
        clearTimeout(quiet)
        quiet = setTimeout(type, PREPARED_QUIET_MS)
      })
    })

  /** @param {Record<string, unknown>} request */
  const open = (request) => {
    // THE PREPARED LINE FIRST, before anything else is read, so a line with a key in it is refused in its own words
    // whatever else the request holds.
    const prepared = thePreparedLine(request['prepared'])
    const command = request['command']
    const args = request['args'] ?? []
    const folder = request['folder']
    const project = request['project']
    const childEnv = request['env']
    if (typeof command !== 'string' || command === '') throw new Error('open needs a command.')
    if (!Array.isArray(args) || !args.every((a) => typeof a === 'string')) throw new Error('args must be a list of strings.')
    if (typeof folder !== 'string' || !isAbsolute(folder)) throw new Error('open needs an absolute folder.')
    if (typeof project !== 'string' || project === '') throw new Error('open needs the project the terminal belongs to.')
    if (childEnv === null || typeof childEnv !== 'object' || Array.isArray(childEnv)) throw new Error('open needs an environment.')
    for (const value of Object.values(childEnv)) {
      if (typeof value !== 'string') throw new Error('Every value of the environment must be a string.')
    }
    const cols = aSide(request['cols'], 'cols')
    const rows = aSide(request['rows'], 'rows')
    const keeping = request['keeping']
    if (typeof keeping !== 'boolean') throw new Error('open needs keeping, true or false: whether what the person types is kept.')

    // WHAT node-pty IS HANDED, as the system layer finds the command: on Windows in the terminal's PATH, with a .cmd run
    // through cmd.exe. It refuses in words when there is nothing to start. The terminal is listed as it was asked for.
    const start = system.whatATerminalStarts(command, /** @type {string[]} */ (args), folder, /** @type {Record<string, string>} */ (childEnv))
    // THE TERMINAL GETS EXACTLY THE ENVIRONMENT THE SERVER GAVE, and nothing of the holder's own.
    const child = pty.spawn(start.command, start.args, {
      name: /** @type {Record<string, string>} */ (childEnv)['TERM'] ?? 'xterm-256color',
      cols,
      rows,
      cwd: folder,
      env: /** @type {Record<string, string>} */ (childEnv),
    })
    const screen = new Terminal({ cols, rows, scrollback: THE_SCROLLBACK_LINES, allowProposedApi: true })
    const serializer = new SerializeAddon()
    screen.loadAddon(serializer)
    /** @type {Held} */
    const t = {
      id: aNewId(),
      who: request['who'] ?? null,
      agent: request['agent'] ?? null,
      project,
      command,
      args: /** @type {string[]} */ (args),
      folder,
      envNames: Object.keys(childEnv).sort(),
      cols,
      rows,
      openedAt: localStampOf(new Date()),
      endedAt: null,
      exit: null,
      closed: false,
      keeping,
      // A PREPARED LINE IS NOT THE PERSON'S TYPING, so it starts marked as typed by another (`Typing` above).
      typing: { buffer: '', clean: prepared === null, byAnother: prepared !== null, last: null, ended: [] },
      prepared,
      name: null,
      group: null,
      tags: [],
      pty: child,
      screen,
      serializer,
      watchers: new Set(),
    }
    terminals.set(t.id, t)
    // OUTPUT GOES TO THE WATCHERS ONLY ONCE THE SCREEN HAS READ IT. So a viewer that starts watching
    // between two pieces of output gets a screen with exactly the pieces sent before, and every piece
    // after: no piece is missing and none comes twice.
    // A CLOSED TERMINAL'S SCREEN IS GONE. Output and the end can still arrive after a close, while its
    // process ends; they are dropped, and the screen is let go once the process has ended.
    child.onData((data) => {
      if (t.closed) return
      screen.write(data, () => tellTheWatchers(t, { event: 'output', terminal: t.id, data }))
    })
    child.onExit(({ exitCode, signal }) => {
      const ended = () => {
        t.exit = { code: exitCode, signal: signal ?? null }
        t.endedAt = localStampOf(new Date())
        log(`terminal ${t.id} ended: exit code ${String(exitCode)}${signal ? `, signal ${String(signal)}` : ''}`)
      }
      if (t.closed) {
        ended()
        screen.dispose()
        return
      }
      // The screen may still be reading the last output. The end is told after it, in the same order.
      screen.write('', () => {
        ended()
        tellTheWatchers(t, { event: 'ended', terminal: t.id, exit: t.exit })
      })
    })
    log(`terminal ${t.id} opened: process ${child.pid > 0 ? String(child.pid) : 'not known yet'}, command ${command}, in ${folder}`)
    if (prepared === null) return { terminal: describe(t) }
    // THE ANSWER COMES ONCE THE LINE IS TYPED, so an open that answers with a prepared line has typed it. The line is
    // not written to the log: keys can land in a terminal.
    return typeThePreparedLine(t, prepared.line).then(() => ({ terminal: describe(t) }))
  }

  /**
   * WHETHER THE SCREEN SHOWS A LINE OF TEXT, in its last screenful and the fifty lines above it. A line the terminal
   * wrapped is read as one line.
   *
   * @param {Held} t
   * @param {string} text
   */
  const theScreenShows = (t, text) => {
    if (t.closed) return false
    const lines = t.screen.buffer.active
    const from = Math.max(0, lines.length - t.rows - 50)
    let seen = ''
    for (let at = from; at < lines.length; at += 1) {
      const line = lines.getLine(at)
      if (line === undefined) continue
      seen += (line.isWrapped ? '' : '\n') + line.translateToString(true)
    }
    return seen.includes(text)
  }

  /**
   * READ WHAT THE PERSON TYPES, for the last line they ended with Enter (`Typing` above says what is kept and why). The
   * screen is asked a moment after Enter whether it showed the line, once the echo has been read.
   *
   * @param {Held} t
   * @param {string} data
   */
  const readTheTyping = (t, data) => {
    const typing = t.typing
    for (const ch of data.replace(PASTE_MARKERS, '').replace(TERMINAL_REPORTS, '')) {
      if (ch === '\r' || ch === '\n') {
        const text = typing.buffer.trim()
        if (typing.byAnother) {
          // A LINE SOMEBODY ELSE BEGAN AND THE PERSON ENDED is not the person's words, even when the person typed in it.
          if (t.keeping) typing.ended.push({ text: null, at: localStampOf(new Date()), shown: null, byAnother: true })
        } else if (typing.clean && text !== '') {
          const last = { text, at: localStampOf(new Date()), shown: false }
          typing.last = last
          /** @type {Ended | null} */
          const ended = t.keeping ? { text, at: last.at, shown: null } : null
          if (ended !== null) typing.ended.push(ended)
          setTimeout(() => {
            last.shown = theScreenShows(t, text)
            if (ended === null) return
            ended.shown = last.shown
            // A LINE THE SCREEN DID NOT SHOW IS LET GO HERE, so its text is never handed on.
            if (!ended.shown) ended.text = null
          }, SHOWN_AFTER_MS)
        } else if (!typing.clean && text !== '' && t.keeping) {
          typing.ended.push({ text: null, at: localStampOf(new Date()), shown: null })
        }
        typing.buffer = ''
        typing.clean = true
        typing.byAnother = false
      } else if (ch === '\x7f' || ch === '\b') {
        // AN ERASE ON AN EMPTY BUFFER TAKES THE LAST CHARACTER OF A LINE SOMEBODY ELSE TYPED, because that text is on
        // the screen and not in the person's buffer. The line is no longer plain, so the pause sends no Enter on what is
        // left, and no later line is typed onto it. An erase on the person's own empty line changes nothing (round 99).
        if (typing.buffer === '' && typing.byAnother) typing.clean = false
        typing.buffer = Array.from(typing.buffer).slice(0, -1).join('')
      } else if (ch === '\x03' || ch === '\x15') {
        // CTRL+C AND CTRL+U drop the line being typed.
        typing.buffer = ''
        typing.clean = true
        typing.byAnother = false
      } else if (ch < ' ') {
        typing.clean = false
      } else {
        typing.buffer += ch
      }
    }
  }

  /**
   * THE ENTER AFTER A LINE THE PERSON DID NOT TYPE (quickInput and typeALine), sent after QUICK_INPUT_PAUSE_MS. It is
   * sent here and not by a second request, so the holder alone decides whether it goes: if the terminal ended in the
   * pause, or the person began typing in it, the Enter would send their words too.
   *
   * A LINE MARKED AS TYPED BY ANOTHER (typeALine, and quickInput since round 87) whose mark is gone when the pause ends
   * was ended by the person in the pause: Enter sent it, or Ctrl+C or Ctrl+U cleared it. Its Enter is not sent, because
   * it would be a second Enter (wave 13s, round 86).
   *
   * @param {Held} t
   * @param {boolean} marked whether the line was marked as typed by another before it was written
   * @returns {Promise<{ entered: true } | { entered: false, why: 'ended' | 'the-person-typed' | 'the-person-ended-the-line' }>}
   */
  const enterAfterThePause = (t, marked) =>
    new Promise((done) => {
      setTimeout(() => {
        if (t.closed || t.exit !== null) {
          done({ entered: false, why: 'ended' })
          return
        }
        if (marked && !t.typing.byAnother) {
          done({ entered: false, why: 'the-person-ended-the-line' })
          return
        }
        if (t.typing.buffer !== '' || !t.typing.clean) {
          done({ entered: false, why: 'the-person-typed' })
          return
        }
        t.pty.write('\r')
        done({ entered: true })
      }, QUICK_INPUT_PAUSE_MS)
    })

  /**
   * END A TERMINAL THAT RUNS. On Linux and the Mac the signal goes to the terminal's process group: the pty library
   * starts the command as the leader of a session and a group of its own, so the group reaches what it started too. On
   * Windows the command runs in a pseudo console, which has no process group, so the pty library is told to end it; it
   * takes no signal there. Being told is not proof that it ended: its end comes through onExit, as on Linux.
   *
   * @param {Held} t
   * @param {NodeJS.Signals} signal
   */
  const endTheTerminal = (t, signal) => {
    if (t.exit !== null) return
    if (system.aTerminalIsEndedBy === 'its-pty') {
      t.pty.kill()
      return
    }
    try {
      system.groups.signal(t.pty.pid, signal)
    } catch (err) {
      // ESRCH: the group has already gone, and its end is on its way through onExit.
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ESRCH') throw err
    }
  }

  /**
   * @param {import('node:net').Socket} socket
   * @param {Record<string, unknown>} request
   */
  const answer = (socket, request) => {
    const op = request['op']
    if (op === 'hello') {
      // THE COPY IT RUNS FROM, so a start of another copy of Mole Office does not take it as its own.
      return { protocol: THE_HOLDER_PROTOCOL, pid: process.pid, startedAt, database: options.database, understands: UNDERSTANDS, copy: theCopyThisIs() }
    }
    // A private job is dispatched before every ordinary terminal operation and never enters the terminal map.
    if (typeof op === 'string' && op.startsWith('privateLogin')) return privateLogin.handle(request)
    if (op === 'list') return { terminals: [...terminals.values()].map(describe) }
    if (op === 'open') return open(request)
    if (op === 'watch') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      // THE SCREEN IS WRITTEN OUT ONCE IT HAS READ EVERYTHING ALREADY GIVEN TO IT, and the watcher is
      // added in the same step, so the output that follows is exactly what the screen has not shown.
      // THE ANSWER IS SENT IN THAT STEP TOO, before the watcher is added. The screen calls the next
      // piece's callback in the same turn, which sends that piece to the watchers; an answer sent later
      // would arrive after it, and the reader would take the piece for the answer.
      return new Promise((done) => {
        t.screen.write('', () => {
          send(socket, {
            id: request['id'] ?? null,
            ok: true,
            terminal: describe(t),
            screen: t.serializer.serialize({ scrollback: THE_SCROLLBACK_LINES }),
          })
          t.watchers.add(socket)
          socket.once('close', () => t.watchers.delete(socket))
          done(ALREADY_ANSWERED)
        })
      })
    }
    if (op === 'write') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const data = request['data']
      if (typeof data !== 'string') throw new Error('write needs data, as a string.')
      if (t.exit !== null) throw Object.assign(new Error(`Terminal ${t.id} has ended, so nothing can be typed into it.`), { code: 'ended' })
      t.pty.write(data)
      readTheTyping(t, data)
      return { linesToTake: t.typing.ended.length }
    }
    if (op === 'quickInput') {
      // A QUICK INPUT IS THE OFFICE'S TYPING, NOT THE PERSON'S (wave 13u, round 21). It is never read as typing, so it
      // is never kept as the person's line and never becomes their last line. The server has already decided that it
      // may be typed; the holder only checks what it alone can see. It is marked as typed by another before it is
      // written (wave 13s, round 87), as typeALine's line is, so an Enter the person presses in the pause ends it as
      // typed by another, and the holder presses no second Enter. Its own Enter takes the mark off, and keeps nothing.
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const input = request['input']
      if (typeof input !== 'string' || input === '' || A_CONTROL_CHARACTER.test(input)) {
        throw new Error('quickInput needs input, as one line of text without keys such as Enter.')
      }
      if (t.exit !== null) throw Object.assign(new Error(`Terminal ${t.id} has ended, so nothing can be typed into it.`), { code: 'ended' })
      // A LINE THE PERSON HAS HALF TYPED IS LEFT ALONE: the input would be joined to it, and Enter would send both.
      if (t.typing.buffer !== '' || !t.typing.clean) {
        throw Object.assign(
          new Error(`The person has a line half typed in terminal ${t.id}, so nothing was typed into it. The agent may ask again once that line is sent or cleared.`),
          { code: 'half-typed' },
        )
      }
      t.typing.byAnother = true
      t.pty.write(input)
      return enterAfterThePause(t, true).then((entered) => {
        if (entered.entered) t.typing.byAnother = false
        // THE LINE NOW HOLDS THE INPUT AND WHAT THE PERSON TYPED IN THE PAUSE, as typeALine's does (wave 13s, round 98).
        // It is no longer plain typing, so no other line is typed onto it before it ends, also once the person has taken
        // their own part off again and the input alone is left on it.
        else if (entered.why === 'the-person-typed') t.typing.clean = false
        return entered
      })
    }
    if (op === 'typeALine') {
      // A LINE TYPED FOR SOMEBODY OTHER THAN THE PERSON (wave 13s, round 83). It is never read as typing, so it never
      // joins the line the person is typing and never becomes their last line. With keeping on, it waits to be taken
      // as left out, typed by another, and its text is never handed on. The server decides who may ask for it. It is
      // marked before it is written (round 86), so an Enter the person presses in the pause ends it as typed by another.
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const text = request['text']
      if (typeof text !== 'string' || text === '' || A_CONTROL_CHARACTER.test(text)) {
        throw new Error('typeALine needs text, as one line without keys such as Enter.')
      }
      if (t.exit !== null) throw Object.assign(new Error(`Terminal ${t.id} has ended, so nothing can be typed into it.`), { code: 'ended' })
      // A LINE THE PERSON HAS HALF TYPED IS LEFT ALONE: the text would be joined to it, and Enter would send both.
      if (t.typing.buffer !== '' || !t.typing.clean) {
        throw Object.assign(
          new Error(`The person has a line half typed in terminal ${t.id}, so nothing was typed into it. Ask again once that line is sent or cleared.`),
          { code: 'half-typed' },
        )
      }
      t.typing.byAnother = true
      t.pty.write(text)
      return enterAfterThePause(t, true).then((entered) => {
        if (entered.entered) {
          if (t.keeping) t.typing.ended.push({ text: null, at: localStampOf(new Date()), shown: null, byAnother: true })
          t.typing.byAnother = false
        } else if (entered.why === 'the-person-typed') {
          // THE LINE NOW HOLDS THE TEXT AND WHAT THE PERSON TYPED IN THE PAUSE. Its mark stays, so it is never kept as
          // the person's words nor offered as their last line, and no other line is typed onto it before it ends.
          t.typing.clean = false
        }
        return { ...entered, linesToTake: t.typing.ended.length }
      })
    }
    if (op === 'keeping') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const on = request['on']
      if (typeof on !== 'boolean') throw new Error('keeping needs on, true or false.')
      const changed = t.keeping !== on || (!on && t.typing.ended.length > 0)
      t.keeping = on
      if (!on) t.typing.ended = []
      return { terminal: describe(t), changed }
    }
    if (op === 'takeLines') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      // IN THE ORDER THEY WERE TYPED: the lines up to the first one the screen has not yet been asked about.
      const waitingFrom = t.typing.ended.findIndex((one) => one.shown === null && one.text !== null)
      const asked = waitingFrom === -1 ? t.typing.ended : t.typing.ended.slice(0, waitingFrom)
      t.typing.ended = waitingFrom === -1 ? [] : t.typing.ended.slice(waitingFrom)
      const lines = asked.map((one) =>
        one.byAnother === true
          ? { left: 'typed-by-another', at: one.at }
          : one.text !== null
            ? { text: one.text, at: one.at }
            : { left: one.shown === false ? 'not-shown' : 'edited', at: one.at },
      )
      return { lines, waiting: t.typing.ended.length }
    }
    if (op === 'lastLine') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const last = t.typing.last
      if (last === null) return { line: null, why: 'none' }
      if (!last.shown) return { line: null, why: 'not-shown' }
      return { line: { text: last.text, at: last.at }, why: null }
    }
    if (op === 'nameATerminal') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const name = aTerminalLabel(request['name'], 'name', THE_LONGEST_TERMINAL_NAME)
      const group = aTerminalLabel(request['group'], 'group', THE_LONGEST_TERMINAL_GROUP)
      const tags = theTerminalTags(request['tags'])
      t.name = name
      t.group = group
      t.tags = tags
      return { terminal: describe(t) }
    }
    if (op === 'resize') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const cols = aSide(request['cols'], 'cols')
      const rows = aSide(request['rows'], 'rows')
      if (t.exit !== null) throw Object.assign(new Error(`Terminal ${t.id} has ended, so it cannot be resized.`), { code: 'ended' })
      t.pty.resize(cols, rows)
      t.screen.resize(cols, rows)
      t.cols = cols
      t.rows = rows
      // EVERY WATCHER IS TOLD, because a terminal has one size, shared by everybody reading it.
      tellTheWatchers(t, { event: 'resized', terminal: t.id, cols, rows })
      return { terminal: describe(t) }
    }
    if (op === 'close') {
      const t = theTerminal(/** @type {string} */ (request['terminal']))
      const wasRunning = t.exit === null
      endTheTerminal(t, 'SIGHUP')
      t.closed = true
      terminals.delete(t.id)
      for (const socket of t.watchers) send(socket, { event: 'closed', terminal: t.id })
      t.watchers.clear()
      // A terminal still running lets its screen go when its process ends (onExit above).
      if (!wasRunning) t.screen.dispose()
      log(`terminal ${t.id} closed${wasRunning ? `, and ${system.aTerminalIsEndedBy === 'its-pty' ? 'its pseudo console was told to end' : 'its process group was sent SIGHUP'}` : ''}`)
      return { closed: t.id, wasRunning }
    }
    throw new Error(`The holder does not know the request ${JSON.stringify(op)}.`)
  }

  /** Every connection open now, so a stop can end them: the server's close waits for them otherwise. */
  /** @type {Set<import('node:net').Socket>} */
  const connections = new Set()

  /** @param {import('node:net').Socket} socket */
  const onConnection = (socket) => {
    connections.add(socket)
    socket.once('close', () => connections.delete(socket))
    socket.setEncoding('utf8')
    let pending = ''
    socket.on('data', (chunk) => {
      pending += chunk
      if (pending.length > THE_LONGEST_REQUEST_CHARACTERS && !pending.includes('\n')) {
        send(socket, { id: null, ok: false, error: `A request may be at most ${String(THE_LONGEST_REQUEST_CHARACTERS)} characters long.` })
        socket.destroy()
        return
      }
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const line = pending.slice(0, newline)
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        if (line.trim() === '') continue
        /** @type {Record<string, unknown>} */
        let request
        try {
          request = JSON.parse(line)
        } catch {
          send(socket, { id: null, ok: false, error: 'A request must be one JSON object on one line.' })
          continue
        }
        // JSON.parse also reads null, a number or a list. Reading a field of one of those would throw here,
        // outside every catch, and end the holder with every terminal in it.
        if (request === null || typeof request !== 'object' || Array.isArray(request)) {
          send(socket, { id: null, ok: false, error: 'A request must be one JSON object on one line.' })
          continue
        }
        const id = request['id'] ?? null
        Promise.resolve()
          .then(() => answer(socket, request))
          .then(
            (result) => {
              if (result !== ALREADY_ANSWERED) send(socket, { id, ok: true, ...result })
            },
            (err) => {
              // A REFUSAL THE SERVER TELLS APART carries a code: no-such-terminal, ended or half-typed. Others carry their sentence.
              const code = typeof err?.code === 'string' ? { code: err.code } : {}
              if (typeof request['op'] === 'string' && request['op'].startsWith('privateLogin')) {
                send(socket, { id, ok: false, reason: err instanceof PrivateLoginError ? err.reason : 'Unsupported' })
                return
              }
              send(socket, { id, ok: false, error: err instanceof Error ? err.message : String(err), ...code })
            },
          )
      }
    })
    socket.on('error', () => socket.destroy())
  }

  /**
   * EVERY SERVER THIS HOLDER LISTENS WITH: the first, and one more each time its socket file was found gone. AN OLDER
   * ONE IS NEVER CLOSED BEFORE THE STOP, because closing a pipe server removes the file at its path, which by then is
   * the newer server's (measured with Node 22).
   */
  const first = createServer(onConnection)
  const servers = [first]
  /** @type {ReturnType<typeof setInterval> | null} */
  let checking = null
  let relistening = false
  /** The last thing the check said that was not a gone file, so it is said once and not every few seconds. */
  let lastSaid = ''

  /** @param {import('node:net').Server} server */
  const listenWith = (server) =>
    new Promise((done, fail) => {
      server.once('error', fail)
      server.listen(socketPath, () => {
        server.off('error', fail)
        done(undefined)
      })
    })

  /**
   * THE SOCKET'S FOLDER MUST BE THIS USER'S (round 12, from round 11's check 7k95JrwVDyHN). A folder another user owns
   * would let that user replace the socket and answer as the holder, so neither listen goes on in one: the words say
   * whose it is. Windows has no user id to compare here; 13t's Windows list (Okkp87mYKeBA) holds that case.
   *
   * @param {string} folder
   * @returns {string | null} the refusal in words, or null when the folder is this user's
   */
  const whyTheFolderIsNotMine = (folder) => {
    if (typeof process.getuid !== 'function') return null
    const mine = process.getuid()
    const owner = statSync(folder).uid
    if (owner === mine) return null
    return `The folder ${folder}, where the holder's socket goes, belongs to user ${String(owner)}, not to this user (${String(mine)}), so the holder does not listen there.`
  }

  /** LOOK FOR THE SOCKET FILE, and listen again at its path when it is gone. */
  const checkTheSocket = () => {
    if (relistening) return
    try {
      statSync(socketPath)
      lastSaid = ''
      return
    } catch (/** @type {any} */ err) {
      if (err?.code !== 'ENOENT') {
        const said = `the socket file ${socketPath} could not be looked at: ${String(err?.message ?? err)}`
        if (said !== lastSaid) log(said)
        lastSaid = said
        return
      }
    }
    relistening = true
    const next = createServer(onConnection)
    Promise.resolve()
      .then(() => {
        mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 })
        const notMine = whyTheFolderIsNotMine(dirname(socketPath))
        if (notMine !== null) throw new Error(notMine)
        chmodSync(dirname(socketPath), 0o700)
        return listenWith(next)
      })
      .then(
        () => {
          chmodSync(socketPath, 0o600)
          servers.push(next)
          lastSaid = ''
          log(`the socket file ${socketPath} was gone, so the holder listens there again; it still holds its ${String(terminals.size)} terminals`)
        },
        (/** @type {any} */ err) => {
          const said = `the socket file ${socketPath} was gone, and listening there again failed: ${String(err?.message ?? err)}; it is tried again in ${String(SOCKET_CHECK_MS / 1000)} seconds`
          if (said !== lastSaid) log(said)
          lastSaid = said
        },
      )
      .finally(() => {
        relistening = false
      })
  }

  /**
   * START LISTENING, unless another holder already answers on this socket.
   *
   * @returns {Promise<'listening' | 'another holder answers'>}
   */
  const listen = async () => {
    const length = Buffer.byteLength(socketPath)
    const longest = theLongestSocketPathBytes()
    if (length > longest) {
      throw new Error(
        `The holder's socket path ${socketPath} is ${String(length)} bytes long, and a Unix socket's path may be at most ` +
          `${String(longest)}. Nothing was started. Point XDG_CONFIG_HOME (or HOME) at a shorter folder.`,
      )
    }
    // A NAMED PIPE (Windows) HAS NO FOLDER TO MAKE AND NO MODE TO SET: its address only looks like a path.
    if (system.holderAddressIsAFile) {
      const folder = dirname(socketPath)
      mkdirSync(folder, { recursive: true, mode: 0o700 })
      const notMine = whyTheFolderIsNotMine(folder)
      if (notMine !== null) throw new Error(`${notMine} Nothing was started. Point XDG_CONFIG_HOME (or HOME) at a folder of this user's own.`)
      // THE FOLDER IS THIS USER'S ONLY, whatever made it first.
      chmodSync(folder, 0o700)
    }
    const there = await new Promise((done) => {
      const probe = createConnection(socketPath)
      probe.once('connect', () => {
        probe.destroy()
        done('answers')
      })
      probe.once('error', (/** @type {NodeJS.ErrnoException} */ err) => done(err.code ?? 'error'))
    })
    if (there === 'answers') return 'another holder answers'
    // A SOCKET FILE NOBODY ANSWERS ON was left by a holder that was killed outright. It is removed.
    if (there === 'ECONNREFUSED') unlinkSync(socketPath)
    else if (there !== 'ENOENT') throw new Error(`The socket ${socketPath} could not be checked: ${String(there)}.`)
    await listenWith(first)
    // A PIPE IS NOT A FILE THAT CAN BE REMOVED FROM UNDER THE HOLDER, so it is not looked for.
    if (system.holderAddressIsAFile) {
      chmodSync(socketPath, 0o600)
      checking = setInterval(checkTheSocket, SOCKET_CHECK_MS)
      checking.unref()
    }
    return 'listening'
  }

  /**
   * STOP: tell every running terminal to end, wait a little for them, and stop listening.
   */
  const stop = async () => {
    privateLogin.close()
    for (const t of terminals.values()) endTheTerminal(t, 'SIGHUP')
    const deadline = Date.now() + STOP_WAIT_MS
    while ([...terminals.values()].some((t) => t.exit === null) && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 50))
    }
    // A PTY THAT NEVER LEARNED ITS PROCESS reads 0 (on Windows, a pseudo console that never connected), and is named
    // by no pid.
    const stillRunning = [...terminals.values()].filter((t) => t.exit === null).map((t) => (t.pty.pid > 0 ? t.pty.pid : null))
    if (checking !== null) clearInterval(checking)
    const closed = Promise.all(servers.map((server) => new Promise((done) => server.close(() => done(undefined)))))
    for (const socket of connections) socket.destroy()
    // THE CLOSE REMOVES THE SOCKET FILE ITSELF (Node's pipe server unlinks it). Removing it again here
    // could remove the socket of a holder started in the meantime.
    await closed
    return { stillRunning }
  }

  return { socketPath, listen, stop, terminals }
}

/** HOW THE HOLDER'S LOG NAMES THE STOP LISTENER'S ASK: the request that arrives on its group's stop pipe. */
export const A_REQUEST_ON_ITS_STOP_PIPE = "a request on its group's stop pipe"

/**
 * WHAT THE HOLDER'S LOG SAYS FIRST WHEN IT STOPS: which way the stop was asked.
 *
 * @param {string} way the signal or the request that asked for the stop
 * @returns {string}
 */
export function theAskedToStopLine(way) {
  return `asked to stop by ${way}`
}

/**
 * WHAT THE HOLDER'S LOG SAYS WHEN IT HAS STOPPED: that every terminal had ended, or which had not, and after what.
 *
 * @param {(number | null)[]} stillRunning the pids of the terminals that had not ended, null for one not known yet
 * @param {import('../config/systems/the-system.mjs').ASystem} [system]
 * @returns {string}
 */
export function theStopsLastLine(stillRunning, system = thisSystem()) {
  if (stillRunning.length === 0) return 'stopped; every terminal had ended'
  const after = system.aTerminalIsEndedBy === 'its-pty' ? 'their pseudo consoles were told to end' : 'SIGHUP'
  const named = stillRunning.map((pid) => (pid === null ? 'not known yet' : String(pid)))
  return `stopped; these terminal processes had not ended ${String(STOP_WAIT_MS / 1000)} seconds after ${after}: ${named.join(', ')}`
}

/**
 * THE HOLDER STOPS WHEN IT IS ASKED, whichever way the ask comes: SIGTERM, SIGINT, or a stop request on its group's
 * pipe. On Windows a group is a Job Object and takes no SIGTERM, so a stop is asked there by the request
 * (src/config/systems/windows-groups.mjs). On Linux and the Mac the system layer listens for nothing, and the signals
 * are the ask. The log says which way asked.
 *
 * The stop is begun once. An ask by another way after it begins nothing more. A second SIGTERM, or a second SIGINT,
 * finds no listener, so Node ends the holder at once.
 *
 * `system`, `signals`, `say` and `exit` are this process's own unless a test hands in its own. It answers the stop it
 * begins, so the watch on a test run asks the same way, once, as a signal does.
 *
 * @param {{ stop: () => Promise<{ stillRunning: (number | null)[] }> }} holder
 * @param {{ system?: import('../config/systems/the-system.mjs').ASystem, signals?: Pick<NodeJS.EventEmitter, 'once'>, say?: (line: string) => void, exit?: (code: number) => void }} [options]
 * @returns {(way: string) => void}
 */
export function stopWhenAsked(holder, { system = thisSystem(), signals = process, say = log, exit = (code) => process.exit(code) } = {}) {
  let asked = false
  const stopBecause = (/** @type {string} */ way) => {
    if (asked) return
    asked = true
    say(theAskedToStopLine(way))
    holder.stop().then(({ stillRunning }) => {
      say(theStopsLastLine(stillRunning, system))
      exit(0)
    })
  }
  signals.once('SIGTERM', () => stopBecause('SIGTERM'))
  signals.once('SIGINT', () => stopBecause('SIGINT'))
  system.groups.listenForAStopRequest(() => stopBecause(A_REQUEST_ON_ITS_STOP_PIPE), say)
  return stopBecause
}

/**
 * THE HOLDER ENDS WITH THE TEST RUN THAT STARTED IT, when its start carried the test suite's mark and so gave it
 * --end-with-the-test-run (src/config/the-test-mark.mjs). It looks once a second, as the server's watch does, and stops
 * the normal way when the run is gone. Could not look is not gone: it says so once and stops looking.
 *
 * @param {number} pid
 * @param {ReturnType<typeof aWatchOnTheStarter>} look the watch, begun when the holder started
 * @param {(way: string) => void} stopBecause
 */
function endWithTheTestRun(pid, look, stopBecause) {
  const watch = setInterval(() => {
    const answer = look()
    if (answer.state === 'there') return
    clearInterval(watch)
    if (answer.state === 'unreadable') {
      log(`${THE_TEST_RUN_FLAG}=${String(pid)}: Mole Office cannot tell whether the test run that started this holder is still running (${answer.why}), so the holder will not end with it`)
      return
    }
    stopBecause(`the end of the test run that started it, process ${String(pid)}`)
  }, THE_TEST_RUN_WATCH_PERIOD_MS)
  watch.unref()
}

/** Run as a program: listen, and stop when asked, or when the test run it was told to end with is gone. */
async function main() {
  const database = theDatabaseNamed(process.argv.slice(2))
  const testRun = theTestRunToEndWith(process.argv.slice(2))
  // The run is read now, so a run that ends while the holder starts is found gone at the first look.
  const theRun = testRun === null ? null : aWatchOnTheStarter(testRun)
  // THE LOGIN PRESS IS BUILT ONCE, HERE, from the host's installation record. Without one both adapters are null and
  // the press answers Unavailable until the holder is started again.
  const installed = theInstalledLogin()
  const holder = aHolder({ database, privateLogin: createPrivateLogin({ adapter: installed.adapter, pool: installed.pool }) })
  const listening = await holder.listen()
  if (listening === 'another holder answers') {
    log(`another terminal holder already answers on ${holder.socketPath}, so this one stops`)
    return 0
  }
  log(`the terminal holder is process ${String(process.pid)}, listening on ${holder.socketPath}, for the database ${database}`)
  log(installed.why === null ? 'the login press is installed: both its adapters are built from the installation record' : `the login press is unavailable, because ${installed.why}`)
  const stopBecause = stopWhenAsked(holder)
  if (testRun !== null && theRun !== null) endWithTheTestRun(testRun, theRun, stopBecause)
  return null
}

if (isTheProgramRun(import.meta.url, THE_HOLDER_ENTRY)) {
  main().then(
    (code) => {
      if (code !== null) process.exit(code)
    },
    (err) => {
      log(`the terminal holder could not start: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    },
  )
}
