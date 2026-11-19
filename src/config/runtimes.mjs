// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHICH AGENT TOOL IS INSTALLED ON THIS MACHINE, AND WHERE EACH ONE IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS IN src/config AND NOT BESIDE THE ADAPTERS
 * ---------------------------------------------------------------------------------------
 *
 * Two programs ask it. The message worker's `whatIsInstalled()` asks it to answer "what can this
 * installation run", and the API server's runtime page draws it so a person can see which tools are
 * on this machine and where. The server loads no runtime adapter: an adapter loads `os.ts`, and
 * through `common.ts` a file outside src/. Of src/worker/runtimes the server loads one file,
 * `what-a-runtime-passes-on.ts`, which imports nothing but types. src/config is a folder the server
 * does load, so the one answer lives here.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROGRAM EACH RUNTIME WORD RUNS
 * ---------------------------------------------------------------------------------------
 *
 * The four words here are the ones with an adapter behind them, which is
 * `THE_RUNTIMES_THE_OFFICE_DISPATCHES` in src/worker/runtimes/index.ts. Each adapter declares its own
 * `command`, and `tests/a-runtime-page-says-where-each-run-goes.test.ts` fails if this map and the
 * adapters stop agreeing, so this is not a second place the fact can drift unnoticed.
 *
 * `dsh` is deliberately absent: it is a runtime a worker may be started on by the office's own tools
 * outside the message worker, not one the office dispatches. `installedTools` below answers for it
 * from the reason its caller gives, so the word is neither left out nor called a missing tool.
 */

import { existsSync } from 'node:fs'
import { join, win32 } from 'node:path'

/**
 * The program each runtime word runs.
 *
 * A word that is not here has no adapter and cannot be dispatched. The adapters' own `command`
 * fields are the source for the command lines they build; this map is the one the server can read.
 */
export const THE_PROGRAM_FOR_RUNTIME = Object.freeze({
  'claude-code': 'claude',
  codex: 'codex',
  opencode: 'opencode',
  kimi: 'kimi',
})

/**
 * WHAT THE PROGRAM FINDER AND THE STARTER READ OF THE SYSTEM THEY RUN ON. A test stands Windows in by handing a
 * system whose `platform` is 'win32' and whose `isThere` answers from a table of made-up files; nothing here reads
 * `process.platform` once a system is handed in.
 *
 * @typedef {{ platform: string, pathext: string | undefined, comspec: string | undefined, isThere: (path: string) => boolean }} TheSystem
 */

/**
 * This machine, as the finder and the starter read it.
 * @returns {TheSystem}
 */
export function thisSystem() {
  return { platform: process.platform, pathext: process.env['PATHEXT'], comspec: process.env['ComSpec'], isThere: existsSync }
}

/**
 * THE ENDINGS WINDOWS TRIES ON A BARE PROGRAM NAME when PATHEXT is not set: cmd.exe's own default. Windows sets
 * PATHEXT in every session, so this is for a program started with an environment built from nothing.
 */
const WINDOWS_PATHEXT_WHEN_NOT_SET = '.COM;.EXE;.BAT;.CMD'

/**
 * The names Windows looks for when it is asked for `command`: the name as written when its ending is one PATHEXT
 * lists, and otherwise the name with each PATHEXT ending in turn. A bare "node" is "node.com", "node.exe" and so on;
 * a file called just "node" is never started there, so it is never found either.
 * @param {string} command
 * @param {string | undefined} pathext
 * @returns {string[]}
 */
function theNamesWindowsTries(command, pathext) {
  const endings = (pathext === undefined || pathext === '' ? WINDOWS_PATHEXT_WHEN_NOT_SET : pathext)
    .split(';')
    .map((one) => one.trim().toLowerCase())
    .filter((one) => one.startsWith('.'))
  const own = win32.extname(command).toLowerCase()
  if (own !== '' && endings.includes(own)) return [command]
  return endings.map((ending) => `${command}${ending}`)
}

/**
 * Where a program is on this machine, or null because it is not installed.
 *
 * A command with a slash is a path and is looked at directly. A bare word is looked for in each
 * directory of `PATH`, in order, which is how the shell that starts the worker would find it. The
 * worker and the runtime page both answer through here, so they cannot disagree about which program
 * is on the machine.
 *
 * ON WINDOWS `PATH` is split at ";", a backslash makes a path too, and a name is looked for with each ending
 * PATHEXT lists, so "node" finds node.exe and "claude" finds claude.cmd (report bknY4s0NBTAT, item 9). Linux
 * and the Mac look exactly as they did.
 *
 * @param {string} command
 * @param {string | undefined} path
 * @param {TheSystem} [system] this machine unless a test names another
 * @returns {string | null}
 */
export function whereIsThisTool(command, path, system = thisSystem()) {
  if (system.platform === 'win32') {
    const names = theNamesWindowsTries(command, system.pathext)
    if (/[\\/]/u.test(command)) return names.find((one) => system.isThere(one)) ?? null
    for (const dir of (path ?? '').split(';')) {
      if (dir === '') continue
      for (const name of names) {
        const full = win32.join(dir, name)
        if (system.isThere(full)) return full
      }
    }
    return null
  }
  if (command.includes('/')) return system.isThere(command) ? command : null
  for (const dir of (path ?? '').split(':')) {
    if (dir === '') continue
    const full = join(dir, command)
    if (system.isThere(full)) return full
  }
  return null
}

/**
 * HOW TO START A PROGRAM THE FINDER FOUND: the command, its arguments, and whether Node must pass them as written.
 *
 * Everywhere but Windows, and on Windows for an .exe, that is the program and its arguments unchanged.
 *
 * A .cmd OR .bat ON WINDOWS IS A SCRIPT FOR cmd.exe, and Node refuses to start one without a shell. claude.cmd and
 * codex.cmd are what npm installs there, and node_modules\.bin\tsx.cmd is how a checkout starts the worker. So it is
 * started as `cmd.exe /d /s /v:off /c ""<program>" "<argument>" …"`, with each word in double quotes, and Node is told
 * to pass that line as it is (`windowsVerbatimArguments`). Inside double quotes cmd.exe reads & | < > ( ) ^ and a
 * space as themselves, and /v:off keeps "!" as itself.
 *
 * WHAT IS REFUSED, IN WORDS, RATHER THAN PASSED WRONG: a word holding a double quote, a "%" or a line break. cmd.exe
 * reads a quote as the end of the quoting and expands "%NAME%" even inside quotes, and no quoting stops either, so
 * the program would be handed other words than these. A word ending in backslashes has them doubled, so the
 * closing quote is not read as part of the word. None of this has run on a Windows machine yet.
 *
 * @param {string} program where it is, as `whereIsThisTool` answered
 * @param {readonly string[]} args
 * @param {TheSystem} [system] this machine unless a test names another
 * @returns {{ command: string, args: string[], windowsVerbatimArguments: boolean }}
 */
export function theWayToStart(program, args, system = thisSystem()) {
  const ending = win32.extname(program).toLowerCase()
  if (system.platform !== 'win32' || (ending !== '.cmd' && ending !== '.bat')) {
    return { command: program, args: [...args], windowsVerbatimArguments: false }
  }
  for (const word of [program, ...args]) {
    if (/["%\r\n]/u.test(word)) {
      throw new Error(
        `${program} is a script Windows starts through cmd.exe, and the word "${word.slice(0, 80)}" holds a double quote, ` +
          'a "%" or a line break, which cmd.exe would change before the program saw it. Nothing was started.',
      )
    }
  }
  const line = [program, ...args].map((word) => `"${word.replace(/(\\+)$/u, '$1$1')}"`).join(' ')
  return { command: system.comspec ?? 'cmd.exe', args: ['/d', '/s', '/v:off', '/c', `"${line}"`], windowsVerbatimArguments: true }
}

/**
 * Where the program behind one runtime word is, or null because it is not installed or the word has
 * no adapter.
 *
 * @param {string} runtime
 * @param {string | undefined} path
 * @returns {string | null}
 */
export function whereItIsInstalled(runtime, path) {
  const program = /** @type {Record<string, string | undefined>} */ (THE_PROGRAM_FOR_RUNTIME)[runtime]
  return program === undefined ? null : whereIsThisTool(program, path)
}

/**
 * One answer per runtime word the registry allows: where it is, and what to say when there is
 * nothing to look for.
 *
 * @param {string | undefined} path
 * @param {readonly string[]} words every runtime word an agent's row may declare
 * @param {(word: string) => string | null} whyNotDispatched the reason this word is not started from here, or null
 * @returns {{ runtime: string; where: string | null; says: string | null }[]}
 */
export function installedTools(path, words, whyNotDispatched) {
  return words.map((word) => {
    const said = whyNotDispatched(word)
    if (said !== null) return { runtime: word, where: null, says: said }
    return { runtime: word, where: whereItIsInstalled(word, path), says: null }
  })
}

/**
 * HOW LONG `<program> --version` IS GIVEN before it is called unreadable. The worker's reading
 * (src/worker/runtimes/os.ts) and the server's (`theVersionOfAProgram` on OsProbe in
 * src/server/lib/resources.ts) both use it.
 */
export const VERSION_MUST_ANSWER_WITHIN_MS = 10_000

/**
 * WHAT A RUN OF `<path> --version` SAID, as a version or as the sentence saying why none could be read.
 *
 * Two programs run the command, each in the one file of its own that may start a process: the worker,
 * for the program that ran a run, and the API server, for the harness list on Terminal management.
 * Neither may load the other's file, so the reading of what came back is here, and both call it. The
 * running is theirs; the meaning of the answer is worked out once.
 *
 * `ran` is what the run gave back: an error if it could not start, the signal that stopped it, its exit
 * status, and both streams. Some tools print their version on stderr, so both are read and the first
 * line that is not empty is taken. A program that is not there, could not start, was stopped, exited
 * with a failure or printed nothing gets `versionWasRead: false` and the sentence saying which. Nothing
 * falls back to a version read earlier.
 *
 * @param {string | null} path where the program is, or null when nothing of that name is on the PATH
 * @param {{ error?: Error | null; signal?: string | null; status?: number | null; stdout?: string | null; stderr?: string | null } | null} ran
 * @returns {{ path: string | null; version: string; versionWasRead: boolean }}
 */
export function theVersionItPrinted(path, ran) {
  /** @param {string} why */
  const couldNot = (why) => ({ path, version: why, versionWasRead: false })
  if (path === null || ran === null) return couldNot('nothing of that name is on this PATH, so no version could be read')
  if (ran.error !== undefined && ran.error !== null) return couldNot(`${path} --version could not be started: ${ran.error.message}`)
  if (ran.signal !== undefined && ran.signal !== null) return couldNot(`${path} --version was stopped by ${ran.signal} before it answered`)
  if (ran.status !== 0) return couldNot(`${path} --version exited ${String(ran.status)}`)
  const printed = `${ran.stdout ?? ''}\n${ran.stderr ?? ''}`
  const line = printed.split('\n').map((one) => one.trim()).filter((one) => one !== '')[0] ?? null
  if (line === null) return couldNot(`${path} --version printed nothing`)
  return { path, version: line, versionWasRead: true }
}
