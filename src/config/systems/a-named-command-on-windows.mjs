// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW A TERMINAL ON WINDOWS STARTS THE COMMAND IT WAS ASKED FOR.
 *
 * node-pty looks for a command that is not a full path in each folder of the holder's own Path, by the name exactly as
 * written. A Windows program is a file with an ending, so "ping" is never found there, and node-pty refuses with "File
 * not found: " and no name. A .cmd or .bat is a script that only cmd.exe runs, and npm installs claude and codex as
 * claude.cmd and codex.cmd.
 *
 * So the command is found here first, in the terminal's own environment, by `whereIsThisTool` in ../runtimes.mjs, with
 * each ending the terminal's PATHEXT names:
 *   - a bare name in each folder of the terminal's PATH, in order;
 *   - a path that is not a full one in the terminal's folder;
 *   - a full path that has no ending PATHEXT names, with each ending.
 * The environment's names are read in any case, as Windows reads them. The terminal's search path is read by the
 * Windows system's `theSearchPathIn` in ./the-system.mjs, the one reader of a search path in src/. So an environment
 * that holds it under two spellings with different values is refused there, and nothing is looked for.
 *
 * What is found is started by its ending. An .exe or .com is handed to node-pty by its full path, with its arguments
 * unchanged. A .cmd or .bat runs through the terminal's %ComSpec%, on the line `theWayToStart` in ../runtimes.mjs
 * makes, and node-pty is given that line as it is. A full path to an .exe or .com is handed on as it was, and nothing
 * is looked for: node-pty starts it, or says that it is not there, with its path.
 *
 * WHAT IS REFUSED, IN WORDS, with nothing started: a command nothing is found for, and a file found with an ending that
 * Windows opens with another program, which a pseudo console cannot start. Each refusal names the command and says to
 * give the program's .exe or its full path. So is a word in a .cmd's arguments that cmd.exe would change, as
 * `theWayToStart` says.
 *
 * None of this has run on a Windows machine yet.
 */

import { existsSync } from 'node:fs'
import { win32 } from 'node:path'

import { theWayToStart, whereIsThisTool } from '../runtimes.mjs'

/** The endings a pseudo console starts as programs. */
const STARTED_AS_THEY_ARE = ['.exe', '.com']

/** The endings of the scripts cmd.exe runs. */
const RUN_THROUGH_CMD = ['.cmd', '.bat']

/**
 * The value of a name in an environment, matched in any case, as Windows matches it.
 * @param {Readonly<Record<string, string>>} env
 * @param {string} name
 * @returns {string | undefined}
 */
function theValueOf(env, name) {
  const wanted = name.toLowerCase()
  const key = Object.keys(env).find((one) => one.toLowerCase() === wanted)
  return key === undefined ? undefined : env[key]
}

/**
 * What node-pty is handed on Windows for a command and its arguments, in a terminal that opens in `folder` with `env`.
 * It throws, saying why in words, when there is nothing it can start.
 * @param {string} command as the terminal was asked for it
 * @param {readonly string[]} args
 * @param {string} folder the terminal's folder
 * @param {Readonly<Record<string, string>>} env the terminal's environment
 * @param {(path: string) => boolean} [isThere] this machine's files unless a test names others
 * @returns {{ command: string, args: string[] | string }}
 */
export function howWindowsStartsACommand(command, args, folder, env, isThere = existsSync) {
  const full = win32.isAbsolute(command)
  if (full && STARTED_AS_THEY_ARE.includes(win32.extname(command).toLowerCase())) return { command, args: [...args] }
  const system = { platform: 'win32', pathext: theValueOf(env, 'PATHEXT'), comspec: theValueOf(env, 'ComSpec'), isThere }
  const bare = !/[\\/]/u.test(command)
  const found = whereIsThisTool(bare || full ? command : win32.join(folder, command), env, system)
  if (found === null) {
    const where = bare ? "in each folder of the terminal's PATH" : full ? 'at that path' : `in the terminal's folder, ${folder}`
    throw new Error(
      `"${command}" was not found, so no terminal was opened. Windows looked for it ${where}, with each ending PATHEXT names. ` +
        "Give the program's .exe, or its full path.",
    )
  }
  const ending = win32.extname(found).toLowerCase()
  if (STARTED_AS_THEY_ARE.includes(ending)) return { command: found, args: [...args] }
  if (RUN_THROUGH_CMD.includes(ending)) {
    const way = theWayToStart(found, args, system)
    return { command: way.command, args: way.args.join(' ') }
  }
  throw new Error(
    `"${command}" is ${found}, which Windows opens with another program, so no terminal was opened. ` +
      "A terminal starts only an .exe, .com, .cmd or .bat. Give the program's .exe, or its full path.",
  )
}
