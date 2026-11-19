// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READER OF AN AGENT'S KEY, AND OF ANY SECRET A PROCESS FINDS IN ITS ENVIRONMENT.
 *
 * It is in src/config/ because the server imports it, through src/config/run-permissions.mjs. The server is built
 * and checked from its folders under src/ alone, so a file it imports from outside src/ is missing there.
 */
import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs'
import { isAbsolute } from 'node:path'

/**
 * A VISITOR'S TOKEN: 32 random bytes in base64url, as src/server/lib/visitors.ts makes it. Once the person confirms
 * the visitor's credential, the same token is its agent key too.
 */
export const A_VISITORS_TOKEN = '[A-Za-z0-9_-]{43}'

/**
 * ONE SECRET, AND WHERE A PROCESS FINDS IT. `value` names the variable that holds the secret itself, `file` the
 * variable that holds the full path of a file holding it. `shape` is what the file must hold, and `says` names that
 * shape in the refusal.
 * @typedef {{ value: string, file: string, what: string, shape: RegExp, says: string }} ASecret
 */

/**
 * THE AGENT KEY: 64 hexadecimal characters when this office made it for an agent (src/server/lib/key-files.ts), or a
 * visitor's token when the agent was confirmed as a visitor.
 * @type {ASecret}
 */
export const THE_AGENT_KEY = {
  value: 'MOLE_AGENT_KEY',
  file: 'MOLE_AGENT_KEY_FILE',
  what: 'key',
  shape: new RegExp(`^(?:[0-9a-f]{64}|${A_VISITORS_TOKEN})\n?$`),
  says: "key of 64 hexadecimal characters, or of the 43 characters of a visitor's token",
}

/** The largest file read as a secret: the longest secret, 64 characters, and room for a line end. */
const A_SECRET_FILE_IS_AT_MOST = 66

/**
 * ONE SECRET, read from the file its `file` variable names, or from its `value` variable, or null because neither is
 * set. Anything wrong is a thrown sentence ending in `nothing`, and no sentence quotes the file's content.
 *
 * Both set is refused, because nothing here could say which of two secrets the caller meant.
 *
 * The file is opened once, without following a link and without waiting (so a named pipe cannot hold the caller), and
 * judged and read from that same descriptor, never by checking a path and then opening it again. These are the rules
 * of src/server/lib/a-small-file.ts, written again here because plain node on another computer
 * cannot import a .ts file. It must be this user's own file, and nobody else may read or change it.
 *
 * ON WINDOWS THE MODE IS NOT CHECKED. Windows keeps no mode for a file, and node shows every file there that may be
 * written as mode 666, so the check would refuse every key file. A file is private on Windows by its access list,
 * which Mole Office sets on the key files it writes (src/config/systems/windows-private-files.mjs). Reading that list
 * would run PowerShell at every read of a key, so it is not read. A key file read on Windows is taken, and the reader
 * says on stderr that its mode was not checked.
 *
 * @param {ASecret} secret
 * @param {NodeJS.ProcessEnv} env
 * @param {string} nothing the sentence that says what did not happen, ending every refusal
 * @param {number | null} uid this user's id; null where the system has none
 * @param {string} system the operating system, as process.platform names it; a relative path is refused with an example
 *   of a full path there
 * @returns {string | null}
 */
export function aSecretFromTheEnvironment(secret, env, nothing, uid = process.getuid?.() ?? null, system = process.platform) {
  const path = env[secret.file]
  const given = env[secret.value]
  const inTheValue = typeof given === 'string' && given !== ''
  if (path === undefined || path === '') return inTheValue ? given : null
  if (inTheValue) {
    throw new Error(`Both ${secret.value} and ${secret.file} are set, so there are two ${secret.what}s and nothing chooses one. Unset one of them. ${nothing}`)
  }
  if (!isAbsolute(path)) {
    const example = system === 'win32' ? `such as C:\\Users\\you\\${secret.what}` : `starting with /, such as ${system === 'darwin' ? '/Users' : '/home'}/you/${secret.what}`
    throw new Error(`${secret.file} must be a full path, ${example}, and it is ${JSON.stringify(path)}. ${nothing}`)
  }
  let fd = null
  try {
    try {
      fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW)
    } catch (why) {
      const code = /** @type {NodeJS.ErrnoException} */ (why).code
      const reason = code === 'ELOOP' || code === 'EMLINK' ? `it is a link, and a ${secret.what} file must be the file itself` : `it could not be opened (${code ?? 'no reason given'})`
      throw new Error(`The ${secret.what} file ${path} was not read: ${reason}. ${nothing}`)
    }
    const opened = fstatSync(fd)
    if (!opened.isFile()) throw new Error(`The ${secret.what} file ${path} is not a regular file. ${nothing}`)
    if (uid !== null && opened.uid !== uid) throw new Error(`The ${secret.what} file ${path} belongs to another user. ${nothing}`)
    if (system !== 'win32' && (opened.mode & 0o077) !== 0) {
      throw new Error(`Other users may read or change the ${secret.what} file ${path}: its mode is ${(opened.mode & 0o777).toString(8)}. Run chmod 600 on it. ${nothing}`)
    }
    const buffer = Buffer.alloc(A_SECRET_FILE_IS_AT_MOST + 1)
    const read = readSync(fd, buffer, 0, buffer.length, 0)
    const words = buffer.subarray(0, read).toString('utf8')
    if (opened.size > A_SECRET_FILE_IS_AT_MOST || read > A_SECRET_FILE_IS_AT_MOST || !secret.shape.test(words)) {
      throw new Error(`The ${secret.what} file ${path} does not hold exactly one ${secret.says}. ${nothing}`)
    }
    if (system === 'win32') {
      process.stderr.write(`The ${secret.what} file ${path} was read on Windows without checking who else may read it. Windows keeps no mode for a file, and this tool does not read the file's access list.\n`)
    }
    return words.replace(/\n$/, '')
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * THE KEY THIS AGENT HOLDS, or null because it holds none. It is read from the file MOLE_AGENT_KEY_FILE names, or
 * from MOLE_AGENT_KEY in the environment, and never from a command line. A started agent is given the file's path,
 * so the key itself is in no environment. This is the one place a tool reads either variable.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string | null}
 */
export function theAgentKey(env = process.env) {
  return aSecretFromTheEnvironment(THE_AGENT_KEY, env, 'Nothing was sent.')
}
