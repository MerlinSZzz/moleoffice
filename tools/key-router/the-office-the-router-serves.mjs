// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE OFFICE THE ROUTER SERVES: read from the stable unit and checked with that office. tools/key-router/install.mjs and
 * the router's `unit` command (tools/provider-router.mjs) both ask this module which office the router's unit names.
 *
 * WHY. A systemd unit gives its process no environment. The router's unit named no office, so the router that systemd
 * started found no office address. The key file it then looked at, beside the default database, held no office key. It
 * exited with status 2, and systemd started it again, eight times. The router reads the office's address from
 * MOLE_OFFICE_API and its office key from the key file beside MOLE_OFFICE_DB, so the unit now names both. They are read
 * from the serving office's own settings and never typed by hand.
 *
 * THE READ. One call, `systemctl --user show mole-office-stable.service -p ExecStart`, and from the words after `env -i`
 * in it, the ones that begin MOLE_OFFICE_PORT= and MOLE_OFFICE_DB=, each exactly once. The port must be a whole number
 * from 1 to 65535 and the database a path a unit line may hold as it is, and anything else, or a unit that is not
 * there, is refused. The unit's state is not read, because every upgrade starts the office outside its unit, and
 * systemd gives a loaded unit's ExecStart whether or not it is active.
 *
 * THE CHECK. The office on that port is asked GET /api/runtime, with the office key from the key file beside that
 * database and 5 s to answer. The answer must name the same database file and the same port, and this checkout as the
 * folder it runs from, compared as real paths; which process supervises the office is not checked.
 *
 * WHAT A REFUSAL SAYS. One sentence naming the check that failed, and the port when one was read. It never names the
 * database, the key or any other value.
 */
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename } from 'node:path'
import { KEY_HEADER } from '../../src/config/key-header.mjs'
import { theOfficeKey } from '../../src/config/office-key.mjs'
import { aPathAUnitLineMayHold } from '../../src/config/provider-router.mjs'
import { REPO_ROOT } from '../../src/config/settings.mjs'
import { theOfficeRunsFrom } from '../merge-tool/the-stable-office.mjs'

/** The unit the host's office runs under. */
export const THE_STABLE_UNIT = 'mole-office-stable.service'

/** How long the office has to answer GET /api/runtime. */
const THE_ANSWER_LIMIT_MS = 5_000

/**
 * @typedef {{ office: { api: string, database: string }, says: null } | { office: null, says: string }} TheOfficeTheRouterServes
 */

/** @param {string} says @returns {TheOfficeTheRouterServes} */
const refused = (says) => ({ office: null, says })

/** `systemctl show`'s Name=value lines, by name. @param {string} text */
function theProperties(text) {
  /** @type {Map<string, string>} */
  const found = new Map()
  for (const line of text.split('\n')) {
    const at = line.indexOf('=')
    if (at > 0) found.set(line.slice(0, at), line.slice(at + 1))
  }
  return found
}

/**
 * The words after `env -i` in the one argv[] list of an ExecStart value, or none when it has no such list or the list
 * does not start with `env -i`.
 * @param {string} execStart
 */
function theWordsAfterEnvI(execStart) {
  const lists = execStart.split('argv[]=')
  const list = lists[1]
  if (lists.length !== 2 || list === undefined) return []
  const words = (list.split(' ; ')[0] ?? '').trim().split(/ +/)
  const command = words[0]
  if (words.length < 2 || command === undefined || basename(command) !== 'env' || words[1] !== '-i') return []
  return words.slice(2)
}

/** The values of the words that set `name`. @param {string[]} words @param {string} name */
function theValuesOf(words, name) {
  return words.filter((word) => word.startsWith(`${name}=`)).map((word) => word.slice(name.length + 1))
}

/** The real path of `path`, or null when it is no path or nothing is there. @param {unknown} path */
function theRealPathOf(path) {
  if (typeof path !== 'string') return null
  try {
    return realpathSync(path)
  } catch (err) {
    const code = /** @type {any} */ (err)?.code
    if (code === 'ENOENT' || code === 'ENOTDIR') return null
    throw err
  }
}

/**
 * The office the router's unit is to name, as its address and its database, or the sentence that says which check
 * failed.
 * @returns {Promise<TheOfficeTheRouterServes>}
 */
export async function theOfficeTheRouterServes() {
  const shown = spawnSync('systemctl', ['--user', 'show', THE_STABLE_UNIT, '-p', 'ExecStart'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'],
  })
  if (shown.error !== undefined || shown.status !== 0) return refused(`systemctl --user show ${THE_STABLE_UNIT} did not answer`)
  const properties = theProperties(shown.stdout)
  const words = theWordsAfterEnvI(properties.get('ExecStart') ?? '')
  const ports = theValuesOf(words, 'MOLE_OFFICE_PORT')
  const portWord = ports[0]
  if (ports.length !== 1 || portWord === undefined) return refused(`The ExecStart of ${THE_STABLE_UNIT} does not name MOLE_OFFICE_PORT exactly once after env -i`)
  if (!/^[1-9][0-9]{0,4}$/.test(portWord) || Number(portWord) > 65535) {
    return refused(`The MOLE_OFFICE_PORT that ${THE_STABLE_UNIT} names is not a whole number from 1 to 65535`)
  }
  const port = Number(portWord)
  const databases = theValuesOf(words, 'MOLE_OFFICE_DB')
  const database = databases[0]
  if (databases.length !== 1 || database === undefined) return refused(`The ExecStart of ${THE_STABLE_UNIT}, for port ${String(port)}, does not name MOLE_OFFICE_DB exactly once after env -i`)
  if (!aPathAUnitLineMayHold(database)) {
    return refused(`The MOLE_OFFICE_DB that ${THE_STABLE_UNIT} names, for port ${String(port)}, is not an absolute path of letters, digits, dots, dashes, underscores and slashes, so it cannot go into a unit line as it is`)
  }
  // The key file is the one the router reads: keysPathFrom under MOLE_OFFICE_DB, beside the database.
  const { key } = theOfficeKey({ MOLE_OFFICE_DB: database })
  if (key === null) return refused(`The key file beside the database that ${THE_STABLE_UNIT} names, for port ${String(port)}, holds no office key`)
  const api = `http://127.0.0.1:${String(port)}`
  const office = `The office at port ${String(port)}, which ${THE_STABLE_UNIT} names,`
  let text = ''
  try {
    const reply = await fetch(`${api}/api/runtime`, { headers: { [KEY_HEADER]: key }, signal: AbortSignal.timeout(THE_ANSWER_LIMIT_MS) })
    if (reply.status !== 200) return refused(`${office} answered GET /api/runtime with status ${String(reply.status)}, not 200`)
    text = await reply.text()
  } catch (err) {
    // A refused connection, a dropped one, or the 5 s limit: each is no answer.
    if (!(err instanceof Error)) throw err
    return refused(`${office} did not answer GET /api/runtime within 5 s`)
  }
  /** @type {any} */
  let runtime
  try {
    runtime = JSON.parse(text)
  } catch {
    return refused(`${office} answered GET /api/runtime with a body that is not JSON`)
  }
  if (typeof runtime?.port !== 'number' || typeof runtime?.database?.path !== 'string' || typeof runtime?.repository?.path !== 'string') {
    return refused(`${office} gave a GET /api/runtime answer that does not name its port, its database and its folder`)
  }
  const realDatabase = theRealPathOf(database)
  if (realDatabase === null) return refused(`The database that ${THE_STABLE_UNIT} names, for port ${String(port)}, is not there`)
  if (theRealPathOf(runtime.database.path) !== realDatabase) return refused(`${office} has another database open than the one ${THE_STABLE_UNIT} names`)
  if (runtime.port !== port) return refused(`${office} says it serves another port`)
  if (!theOfficeRunsFrom(runtime, REPO_ROOT)) return refused(`${office} runs from another folder than this checkout`)
  return { office: { api, database }, says: null }
}
