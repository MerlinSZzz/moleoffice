// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NATIVE ADAPTER FOR THE LOGIN PRESS: `claude setup-token`, run under a pty, read by a private parser.
 *
 * The private service in ./private-sandbox-login.mjs asks for one of these. It is built only by
 * ./private-sandbox-login-installed.mjs, from the host's installation record, and never from a request or a setting.
 *
 * HOW ONE ATTEMPT RUNS
 *   - A fresh scratch folder, mode 700, under the system's temporary folder. HOME, every XDG_* folder and
 *     CLAUDE_CONFIG_DIR are inside it, so the program never reads or writes the owner's own configuration.
 *     disposeScratch removes it, and it is removed again when the program has ended.
 *   - The environment is the short list below and nothing else. It has no DISPLAY, WAYLAND_DISPLAY or BROWSER,
 *     so the program does not open a browser of its own: the person opens the sign-in page from the press.
 *   - The program runs through `prlimit --core=0:0`, so it cannot write a core dump. node-pty starts it as the
 *     leader of a new session and process group; the group and the process's start time are recorded before any
 *     output is read, and the group is signalled only while that start time still matches.
 *   - The terminal is 4000 columns wide, so the sign-in URL and the token are each on one line.
 *   - The code and Enter are two writes, CODE_THEN_ENTER_MS apart. One write of both is read by the program as a
 *     paste, and the Enter does not submit it.
 *   - The holder owns the pty. When the holder ends, however it ends, the pty closes and the system hangs up the
 *     session, which ends the program.
 *
 * WHAT THE PARSER READS, after it removes the terminal's control sequences (the CLI's own words, version 2.1.281):
 *   - the sign-in URL: a line that is one https URL whose path ends in /oauth/authorize. Its redirect_uri must be
 *     one of SIGN_IN_CALLBACKS, or the attempt ends. The service checks its origin against SIGN_IN_ORIGINS.
 *   - the code prompt: "Paste code here if prompted >".
 *   - the token: the first line with no space after "Your OAuth token (valid for …):".
 *   - an error: "OAuth error: …" or "Press Enter to retry.". The program then waits for Enter to try again,
 *     so the attempt ends here as declined.
 * Each is reported once. The parser keeps no more than one unfinished line.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pty from 'node-pty'
import { startTimeOf } from '../config/session-process.mjs'
import { thisSystem } from '../config/systems/the-system.mjs'
import { PRIVATE_LOGIN_VERSION } from '../config/private-sandbox-login.mjs'

/** The origin of the sign-in URL in a real run of `claude setup-token`. */
export const SIGN_IN_ORIGINS = Object.freeze(['https://claude.com'])
/** Where that URL sends the person after the sign-in: the page that shows the code to paste. */
export const SIGN_IN_CALLBACKS = Object.freeze(['https://platform.claude.com/oauth/code/callback'])
export const CODE_THEN_ENTER_MS = 500
/** How long a group signalled with SIGTERM has before it is sent SIGKILL. */
export const KILL_AFTER_MS = 2000
export const SCRATCH_PREFIX = 'mole-office-sign-in-'
export const PRLIMIT = '/usr/bin/prlimit'
const COLUMNS = 4000
const ROWS = 50
const MOST_LINE_CHARACTERS = 16384

/**
 * The environment of one attempt: these names and no others.
 * @param {string} scratch
 */
export function theSignInEnvironment(scratch) {
  return {
    PATH: '/usr/bin:/bin',
    HOME: scratch,
    TERM: 'xterm-256color',
    XDG_CONFIG_HOME: join(scratch, '.config'),
    XDG_DATA_HOME: join(scratch, '.local', 'share'),
    XDG_STATE_HOME: join(scratch, '.local', 'state'),
    XDG_CACHE_HOME: join(scratch, '.cache'),
    XDG_RUNTIME_DIR: join(scratch, 'run'),
    CLAUDE_CONFIG_DIR: join(scratch, '.claude'),
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  }
}

/**
 * The text a terminal would show, one line at a time: control sequences removed, a cursor move written as a space.
 * @param {string} raw
 */
function theWords(raw) {
  return raw
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*([@-~])/g, (_, final) => ('CG'.includes(final) ? ' ' : ''))
    .replace(/\x1b[ -/]*[0-~]/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

/**
 * The sign-in URL on this line, or null when the line is not one. A sign-in URL that would send the code anywhere but
 * SIGN_IN_CALLBACKS ends the attempt.
 * @param {string} line
 */
function aSignInUrl(line) {
  if (!/^https:\/\/\S+$/.test(line)) return null
  let url
  try { url = new URL(line) } catch { return null }
  if (!url.pathname.endsWith('/oauth/authorize')) return null
  if (!SIGN_IN_CALLBACKS.includes(url.searchParams.get('redirect_uri') ?? '')) throw new Error('unsupported')
  return url.href
}

/** @returns {import('./private-sandbox-login.mjs').PrivateParser} */
export function theSetupTokenParser() {
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let pending = ''
  let url = false
  let code = false
  let token = false
  let afterTokenHeading = false
  let ended = false
  /** @param {string} line @param {unknown[]} events */
  const read = (line, events) => {
    const text = line.replace(/ +/g, ' ').trim()
    if (text === '' || ended) return
    if (afterTokenHeading && !token) {
      if (!/^[\x21-\x7e]+$/.test(text)) throw new Error('unsupported')
      token = true
      events.push({ type: 'token', value: text })
      return
    }
    if (/^Your OAuth token \(valid for [^)]*\):$/.test(text)) { afterTokenHeading = true; return }
    if (text.startsWith('OAuth error:') || text === 'Press Enter to retry.') { ended = true; events.push({ type: 'declined' }); return }
    if (!code && text.startsWith('Paste code here if prompted >')) { code = true; events.push({ type: 'code' }); return }
    const found = url ? null : aSignInUrl(text)
    if (found) { url = true; events.push({ type: 'sign-in', url: found }) }
  }
  return {
    feed(_channel, bytes) {
      /** @type {unknown[]} */
      const events = []
      // A control sequence may be cut between two reads, so the words are taken from whole lines only.
      pending += decoder.decode(bytes, { stream: true })
      const lines = pending.split(/[\r\n]/)
      pending = lines.pop() ?? ''
      if (pending.length > MOST_LINE_CHARACTERS) throw new Error('unsupported')
      for (const line of lines) read(theWords(line), events)
      // The prompt is the one line the program leaves open while it waits.
      if (!code && theWords(pending).replace(/ +/g, ' ').trim().startsWith('Paste code here if prompted >')) read(theWords(pending), events)
      return events
    },
    clear() { pending = ''; url = code = token = afterTokenHeading = ended = true },
  }
}

/**
 * @param {number} pgid
 * @returns {string | null}
 */
function theIdentityOf(pgid) {
  const started = startTimeOf(pgid)
  return started === null ? null : started.toISOString()
}

/**
 * The adapter, for the `claude` program the installation record names.
 *
 * Each verified property and the case that proves it, in tests/private-sandbox-login-setup-token.test.ts:
 *   - protocol: the CLI's own words, read from a stand-in that prints them as the CLI does, up to the token; and the
 *     host's own program up to the sign-in, by tools/login-press-host-proof.mjs.
 *   - callback: a sign-in URL that would send the code anywhere but the code page is not offered.
 *   - code: the code and Enter reach the program as two reads.
 *   - storageIsolation: every folder the program is given is inside the scratch, the owner's home is unchanged, and
 *     the scratch is gone after the attempt.
 *   - dumpPrevention: the program's core limit is 0, soft and hard. The holder's own soft limit is checked at its
 *     start, by the installation reader.
 *   - ownerWatch: the group is gone after a cancel, after the ten minutes, and after the holder is killed.
 *
 * @param {{ claude: string, scratchIn?: string }} options
 * @returns {import('./private-sandbox-login.mjs').VerifiedNativeAdapter}
 */
export function theSetupTokenAdapter({ claude, scratchIn = tmpdir() }) {
  return {
    version: PRIVATE_LOGIN_VERSION,
    executable: PRLIMIT,
    args: ['--core=0:0', '--', claude, 'setup-token'],
    allowedSignInOrigins: [...SIGN_IN_ORIGINS],
    verified: { protocol: true, callback: true, code: true, storageIsolation: true, dumpPrevention: true, ownerWatch: true },
    createParser: theSetupTokenParser,
    start({ executable, args, output, exit, error }) {
      const scratch = mkdtempSync(join(scratchIn, SCRATCH_PREFIX))
      let disposed = false
      const remove = () => { try { rmSync(scratch, { recursive: true, force: true }) } catch {} }
      /** @type {import('node-pty').IPty} */
      let child
      try {
        const env = theSignInEnvironment(scratch)
        mkdirSync(env.XDG_RUNTIME_DIR, { mode: 0o700 })
        child = pty.spawn(executable, args, { name: env.TERM, cols: COLUMNS, rows: ROWS, cwd: scratch, env, encoding: null })
      } catch (err) {
        remove()
        throw err
      }
      const pgid = child.pid
      const identity = theIdentityOf(pgid)
      const matchesIdentity = (/** @type {number} */ group, /** @type {string} */ recorded) => group === pgid && recorded === identity && theIdentityOf(group) === recorded
      child.onData((/** @type {string | Buffer} */ data) => {
        const bytes = typeof data === 'string' ? Buffer.from(data) : data
        try { output('stdout', bytes) } finally { bytes.fill(0) }
      })
      child.onExit(({ exitCode, signal }) => {
        if (disposed) remove()
        exit(signal ? 128 + signal : exitCode)
      })
      // NO START TIME, NO GROUP SIGNAL: the program is ended through the pty, and the attempt ends.
      if (identity === null) {
        try { child.kill('SIGKILL') } catch {}
        remove()
        error()
      }
      return {
        pgid,
        identity: identity ?? '',
        matchesIdentity,
        signalGroup(group, signal) {
          if (group !== pgid) return
          thisSystem().groups.signal(group, signal)
          const later = setTimeout(() => { try { if (matchesIdentity(group, identity ?? '')) thisSystem().groups.signal(group, 'SIGKILL') } catch {} }, KILL_AFTER_MS)
          later.unref()
        },
        disposeScratch() { disposed = true; remove() },
        clear() {},
        async writeCode(code) {
          child.write(code)
          await new Promise(resolve => setTimeout(resolve, CODE_THEN_ENTER_MS))
          child.write('\r')
        },
      }
    },
  }
}
