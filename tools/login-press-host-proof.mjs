#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE LOGIN PRESS'S PROOF ON THE HOST, up to the sign-in. Run by the person who keeps the pool, on the machine the
 * pool is on:
 *
 *     node tools/login-press-host-proof.mjs
 *
 * It signs nobody in, and it writes nothing in the home folder. It does three things and prints what it saw:
 *   1. It reads the installation record as the holder does, and says whether the press would be installed, or why not.
 *      This lowers this program's own core limit, as it lowers the holder's.
 *   2. It runs the record's `claude setup-token` through the native adapter, the way the press does, in a scratch home
 *      under the system's temporary folder. It waits for the sign-in URL and prints its origin, its path and where it
 *      sends the code, never the whole URL. It waits for the code prompt, and then cancels.
 *   3. After the cancel it checks that the program's process group has gone, that the scratch folder has gone, and
 *      that nothing was made or removed in the places in the home folder where the program keeps its files. Other
 *      programs of this user's change files in some of those places too, so such a change is printed for a person to
 *      look at, beside the list of what the program made in its scratch home.
 * It ends with 0 when every check held, and 1 when one did not.
 *
 * The pool tool is not run here.
 */
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createPrivateLogin } from '../src/holder/private-sandbox-login.mjs'
import { INSTALLATION_RECORD, theInstalledLogin } from '../src/holder/private-sandbox-login-installed.mjs'
import { SCRATCH_PREFIX, SIGN_IN_ORIGINS, theSetupTokenAdapter } from '../src/holder/private-sandbox-login-setup-token.mjs'

const WAIT_MS = 30_000
const home = homedir()
let failed = false
/** @param {boolean} held @param {string} line */
const check = (held, line) => {
  if (!held) failed = true
  console.log(`${held ? 'yes' : 'NO '}  ${line}`)
}
const sleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms))

// WHERE THE PROGRAM KEEPS ITS FILES IN A HOME, each read by name, size and time only, never by content.
const WATCHED = ['.claude.json', '.claude', '.config/claude', '.cache/claude', '.local/share/claude', '.local/state/claude']
const theWatchedPlaces = () => {
  /** @type {Map<string, string>} */
  const seen = new Map()
  const look = (/** @type {string} */ path, /** @type {number} */ depth) => {
    let info
    try { info = lstatSync(path) } catch { return }
    seen.set(path, `${info.isDirectory() ? 'folder' : 'file'} ${String(info.size)} ${String(info.mtimeMs)}`)
    if (!info.isDirectory() || depth === 0) return
    let names = []
    try { names = readdirSync(path) } catch { return }
    for (const name of names) look(join(path, name), depth - 1)
  }
  for (const place of WATCHED) look(join(home, place), 1)
  return seen
}
const scratches = () => readdirSync(tmpdir()).filter((name) => name.startsWith(SCRATCH_PREFIX))

console.log('1. THE INSTALLATION RECORD')
const installed = theInstalledLogin()
check(installed.why === null, installed.why === null ? 'the press would be installed: both adapters are built' : `the press would be unavailable, because ${installed.why}`)
/** @type {Record<string, unknown>} */
let record = {}
try { record = JSON.parse(readFileSync(join(home, INSTALLATION_RECORD), 'utf8')) } catch {}
if (typeof record.claude !== 'string') {
  check(false, 'the record names no claude program, so the program is not run')
  process.exit(1)
}

console.log(`2. ${record.claude} setup-token, THROUGH THE NATIVE ADAPTER`)
const before = theWatchedPlaces()
const scratchesBefore = new Set(scratches())
const base = theSetupTokenAdapter({ claude: record.claude })
/** @type {{ pgid: number | null }} */
const child = { pgid: null }
const adapter = {
  ...base,
  /** @type {typeof base.start} */
  start(input) {
    // The native adapter starts the program at once and gives the recorded process itself, not a promise.
    const started = /** @type {import('../src/holder/private-sandbox-login.mjs').RecordedPrivateProcess} */ (base.start(input))
    child.pgid = started.pgid
    return started
  },
}
// A pool that is never asked: the attempt is cancelled before any token could be printed.
const neverAsked = { available: () => true, add: async () => { throw new Error('this proof saves nothing') } }
const service = createPrivateLogin({ adapter, pool: neverAsked })
const ref = { version: 1, binding: randomBytes(32).toString('hex'), generation: randomBytes(16).toString('hex'), nonce: randomBytes(16).toString('hex'), attempt: '' }
let state = await service.start(ref)
ref.attempt = state.attempt
const until = Date.now() + WAIT_MS
while (Date.now() < until && state.state === 'waiting' && !(state.canOpen && state.code)) {
  await sleep(200)
  state = service.status(ref)
}
const madeNow = scratches().filter((name) => !scratchesBefore.has(name))
check(madeNow.length === 1, `one scratch home was made under ${tmpdir()}: ${madeNow.join(', ') || 'none'}`)
check(state.state === 'waiting', `the attempt is still waiting after the program's first words: ${state.state}${state.reason ? ` (${state.reason})` : ''}`)
if (state.canOpen) {
  const url = new URL(service.signIn(ref).url)
  check(SIGN_IN_ORIGINS.includes(url.origin), `the sign-in URL's origin is ${url.origin}`)
  console.log(`     its path is ${url.pathname}, and it sends the code to ${url.searchParams.get('redirect_uri') ?? 'nowhere it names'}`)
} else check(false, `no sign-in URL was read in ${String(WAIT_MS / 1000)} seconds`)
check(state.code, 'the code prompt was read')
if (madeNow.length === 1) {
  const files = readdirSync(join(tmpdir(), madeNow[0] ?? ''), { recursive: true }).map(String)
  console.log(`     the program had made these in its scratch home: ${files.join(', ') || 'nothing'}`)
}
state = service.cancel(ref)
check(state.state === 'cancelled', `the attempt was cancelled: ${state.state}`)

console.log('3. AFTER THE CANCEL')
const gone = () => {
  if (child.pgid === null) return true
  try { process.kill(-child.pgid, 0); return false } catch (err) { return /** @type {NodeJS.ErrnoException} */ (err).code === 'ESRCH' }
}
const by = Date.now() + 5000
while (Date.now() < by && (!gone() || scratches().some((name) => !scratchesBefore.has(name)))) await sleep(100)
check(child.pgid !== null && gone(), `the program's process group ${String(child.pgid)} has gone`)
const left = scratches().filter((name) => !scratchesBefore.has(name))
check(left.length === 0, `the scratch home has gone${left.length ? `; left: ${left.join(', ')}` : ''}`)
const after = theWatchedPlaces()
const made = [...after.keys()].filter((path) => !before.has(path))
const removed = [...before.keys()].filter((path) => !after.has(path))
check(made.length === 0 && removed.length === 0, made.length + removed.length === 0
  ? `nothing was made or removed in ${WATCHED.map((place) => '~/' + place).join(', ')}`
  : `while the program ran, these were made: ${made.join(', ') || 'none'}; and these removed: ${removed.join(', ') || 'none'}`)
const changed = [...before.keys()].filter((path) => after.has(path) && before.get(path) !== after.get(path))
if (changed.length > 0) console.log(`     these were already there and changed while it ran, which other programs of this user's also do: ${changed.join(', ')}`)
service.close()
console.log(failed ? 'NOT EVERY CHECK HELD' : 'EVERY CHECK HELD')
process.exit(failed ? 1 : 0)
