#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN-WORLD GUARD: THE HOOK EVERY RUNTIME CALLS BEFORE A TOOL RUNS.
 *
 * IT IS A RAILING, NOT A WALL. It stops the accidents this owner has had and the ones a decision
 * names — deleting outside one's work area, `rm -rf` on an empty variable or on the
 * home, swapping HOME before a delete, touching the keys or the backups — by reading the command
 * the way the shell would expand it, without running any of it. A program that deletes files by
 * itself is invisible to it, and anyone who means to get round it can. The policy is `policy.mjs` beside this file;
 * this file reads the call, asks the office what only the office knows (the agent's card and work area), and answers.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROTOCOL
 * ---------------------------------------------------------------------------------------
 *
 * A Claude Code PreToolUse payload on standard input: `{tool_name, tool_input, cwd, …}`. Claude
 * Code, Codex and the dsh bridge all send that shape, and the OpenCode plugin builds it.
 *   exit 0, nothing printed      let the call through
 *   exit 2, the reason on stderr stop it; every runtime shows the reason to the model
 *
 *   node tools/guard/main-world-guard.mjs --agent <handle>     the hook (the agent may also come from MOLE_OFFICE_AGENT)
 *       --database <file> --keys <file> --backups <folder>     and the office's own paths, as the office writes them
 *   node tools/guard/main-world-guard.mjs --mounted dsh        exit 0 when the dsh hooks mount the guard
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THE GUARD ITSELF FAILS
 * ---------------------------------------------------------------------------------------
 *
 * It fails CLOSED for a call that looks like a delete, and OPEN for everything else, and it says
 * which on stderr. A broken guard that stopped every call would stop every agent in the main world
 * at once; a broken guard that let a delete through would be the accident it exists for. "Looks
 * like a delete" is the plain text test in `looksDeleteShaped` below, which imports nothing, so it
 * still works when the policy or the settings cannot even be loaded. The same holds when the office
 * does not answer: a delete outside the temporary directory is stopped, because the guard cannot
 * read the work area; everything else goes on.
 *
 * A runtime that cannot start this hook at all (no node, a timeout) lets the call through: Claude
 * Code, Codex and the dsh bridge all treat a hook that crashed as no answer. That is the one way
 * round the fail-closed rule that this file cannot close, and it is why the office's own requests
 * here give up long before the runtime's thirty seconds.
 */

import { readFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

/** How long one request to the office may take before the guard gives up on it. */
const OFFICE_TIMEOUT_MS = 4000

/**
 * THE CRASH TEST: whether a call's text looks like it deletes, moves or overwrites, or swaps HOME.
 * Deliberately coarse and with no imports, because it only runs when the real policy could not.
 * A plain `>` redirection is not counted: nearly every command has one, and stopping all of them
 * would be the guard stopping the world.
 * @param {string} text @returns {boolean}
 */
export function looksDeleteShaped(text) {
  return (
    /(^|[\s;&|(`$'"])(rm|rmdir|unlink|shred|mv|truncate)(\s|$)/.test(text) ||
    /(^|[\s;&|(])find\s[^;&|]*-(delete|exec(dir)?\s+(\S*\/)?(rm|rmdir|unlink|shred)\b)/.test(text) ||
    /\bgit\s+([^;&|\n]*\s)?(clean|rm)\b/.test(text) ||
    /\bgit\s+([^;&|\n]*\s)?reset\s[^;&|\n]*--hard/.test(text) ||
    /\brsync\s[^;&|\n]*--delete/.test(text) ||
    /\bdd\s[^;&|\n]*\bof=/.test(text) ||
    /(^|[\s;&|(])(export\s+)?HOME=|\bunset\s+HOME\b|\benv\s+[^;&|\n]*-u\s*HOME\b/.test(text) ||
    /\*\*\* (Delete File|Move to):/.test(text)
  )
}

/**
 * The text of a payload that the crash test reads: the command or patch when the payload parses,
 * the whole of it when it does not.
 * @param {string} raw @returns {string}
 */
function textToTest(raw) {
  try {
    const payload = JSON.parse(raw)
    const input = payload?.tool_input ?? {}
    const found = ['command', 'cmd', 'patchText', 'patch', 'input'].map((k) => input[k]).find((v) => typeof v === 'string' || Array.isArray(v))
    return found === undefined ? '' : Array.isArray(found) ? found.join(' ') : found
  } catch {
    return raw
  }
}

/**
 * Stop the call: exit 2 with the reasons on stderr, which every runtime shows to the model.
 * @param {string[]} reasons @param {string} [signature]
 */
function stop(reasons, signature = '') {
  process.stderr.write(`Mole Office's guard stopped this call.\n${reasons.map((r) => `- ${r}`).join('\n')}\n${signature === '' ? '' : `${signature}\n`}`)
  process.exit(2)
}

/**
 * The guard failed. Stop the call if it looks like a delete; otherwise let it through and say so.
 * @param {string} raw @param {unknown} error
 */
function failed(raw, error) {
  const why = error instanceof Error ? error.message : String(error)
  if (looksDeleteShaped(textToTest(raw))) {
    stop([
      `The guard itself failed (${why}), and this call looks like it deletes, moves or overwrites files or changes HOME, so it is stopped. ` +
        'Everything that does not look like a delete is let through while the guard is broken. Tell a secretary the guard is failing.',
    ])
  }
  process.stderr.write(`Mole Office's guard failed (${why}) and let this call through, because it does not look like a delete.\n`)
  process.exit(0)
}

/**
 * The arguments this hook was started with.
 * @param {string[]} argv
 * @returns {{ agent: string | null, workspace: string | null, mounted: string | null, database: string | null, keys: string | null, backups: string | null }}
 */
function argumentsOf(argv) {
  /** @param {string} flag */
  const value = (flag) => {
    const at = argv.indexOf(flag)
    return at === -1 ? null : argv[at + 1] ?? null
  }
  return {
    agent: value('--agent'), workspace: value('--workspace'), mounted: value('--mounted'),
    database: value('--database'), keys: value('--keys'), backups: value('--backups'),
  }
}

/**
 * GET one door of the office. Answers the parsed body, or throws a sentence saying what went wrong.
 * @param {string} url @param {Record<string, string>} headers @returns {Promise<Record<string, unknown>>}
 */
async function officeGet(url, headers) {
  let res
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(OFFICE_TIMEOUT_MS) })
  } catch (error) {
    throw new Error(`the office did not answer at ${url} (${error instanceof Error ? error.message : String(error)}).`)
  }
  /** @type {unknown} */
  let body = null
  try { body = await res.json() } catch { body = null }
  if (!res.ok || typeof body !== 'object' || body === null) {
    const said = typeof body === 'object' && body !== null && 'error' in body ? String(/** @type {{error: unknown}} */ (body).error) : `status ${res.status}`
    throw new Error(`the office answered ${url} with ${said}.`)
  }
  return /** @type {Record<string, unknown>} */ (body)
}

/**
 * WHO IS ASKING, as the office has it: the card the agent holds and the work area it registered.
 * @param {{ agent: string | null, workspace: string | null }} args @param {string} cwd
 * @returns {Promise<import('./policy.mjs').Asker>}
 */
async function whoIsAsking(args, cwd) {
  const agent = args.agent ?? process.env['MOLE_OFFICE_AGENT'] ?? null
  if (agent === null || agent === '') {
    return { cannot: 'this run did not say which agent it is (no --agent, and MOLE_OFFICE_AGENT is not set).' }
  }
  const [{ whereIsTheApi }, { anAgentsToolHeaders }, { aRoleNeedsARegisteredWorkArea }, { toplevelOf }] = await Promise.all([
    import('../where-is-the-api.mjs'),
    import('../sandbox-common.mjs'),
    import('../../src/shared/roles.ts'),
    import('./policy.mjs'),
  ])
  const api = whereIsTheApi()
  const workspace = args.workspace ?? process.env['MOLE_OFFICE_WORKSPACE'] ?? null
  /** @type {Record<string, string>} */
  const headers = {
    // The agent's own name, and its own key when MOLE_AGENT_KEY holds one. The guard only reads.
    ...anAgentsToolHeaders({ self: agent, withoutAKey: agent }),
    ...(workspace === null ? {} : { 'x-mole-office-workspace': workspace }),
  }
  let participant
  let cards
  try {
    const [who, roles] = await Promise.all([
      officeGet(`${api}/api/participants/agent/${encodeURIComponent(agent)}`, headers),
      officeGet(`${api}/api/roles`, headers),
    ])
    participant = /** @type {Record<string, unknown>} */ (who['participant'] ?? {})
    cards = roles['cards']
  } catch (error) {
    return { cannot: error instanceof Error ? error.message : String(error) }
  }
  if (!Array.isArray(cards)) return { cannot: `the office's ${api}/api/roles carried no cards.` }
  const role = typeof participant['role'] === 'string' ? participant['role'] : null
  // THE CARD SAYS WHO IS LIMITED BY A WORK AREA: a card whose grain is `nothing` (the secretary's)
  // names nothing and is limited by none. Read through the office's own rule, never a role name here.
  if (!aRoleNeedsARegisteredWorkArea(/** @type {any} */ ({ cards }), role)) return { exempt: true, role: role ?? '' }
  const area = Array.isArray(participant['workArea']) ? participant['workArea'].map(String) : null
  return { exempt: false, role, area, root: toplevelOf(cwd) ?? cwd }
}

/**
 * THE OFFICE'S DATABASE, KEYS FILE AND BACKUPS: from the command line, where the office wrote them
 * when it started the run (`guardArgv` in src/config/main-world-guard.mjs). The run's environment
 * carries no MOLE_OFFICE_ setting, so in a paired office this checkout's own settings would name
 * the stable checkout's default database. They are worked out here only for a command line that
 * names none of the three, such as the dsh bridge's hooks file.
 * @param {{ database: string | null, keys: string | null, backups: string | null }} args
 * @returns {Promise<{ database: string, keys: string, backups: string }>}
 */
async function theOfficesPathsFrom(args) {
  const { database, keys, backups } = args
  if (database !== null && keys !== null && backups !== null) return { database, keys, backups }
  if (database !== null || keys !== null || backups !== null) {
    throw new Error('the command line names some of --database, --keys and --backups, and the guard needs all three or none.')
  }
  const { theOfficesPaths } = await import('../../src/config/main-world-guard.mjs')
  return theOfficesPaths()
}

/**
 * The machine as the policy sees it.
 * @param {{ database: string | null, keys: string | null, backups: string | null }} args
 * @returns {Promise<import('./policy.mjs').World>}
 */
async function theWorld(args) {
  const [office, { theProtectedPaths }, { theSandboxIn }] = await Promise.all([
    theOfficesPathsFrom(args),
    import('./policy.mjs'),
    import('../../src/config/run-permissions.mjs'),
  ])
  const home = userInfo().homedir
  // THE TEMPORARY DIRECTORY is /tmp, and $TMPDIR as well unless it is the home or above it — a
  // TMPDIR pointed at the home must not make the home "temporary".
  const tmp = resolve(tmpdir())
  const tempRoots = ['/tmp']
  if (tmp !== '/tmp' && tmp !== sep && !(home === tmp || home.startsWith(tmp + sep))) tempRoots.push(tmp)
  return {
    home,
    env: process.env,
    tempRoots,
    protectedPaths: theProtectedPaths({ home, ...office }),
    // IN AN OFFICE SANDBOX, AND NOT MERELY IN A CONTAINER. `SANDBOX_DIR` is the one fact
    // src/config/run-permissions.mjs declares for "a process the sandbox launcher started", and
    // inside a sandbox the container is the wall, so this policy stands down. Reading
    // `/.dockerenv` here would be a second answer to the same question, and it would stand the
    // guard down on any container the office happened to run in, including a test's own checkout.
    inContainer: theSandboxIn(process.env) !== null,
  }
}

/**
 * Judge one payload. Exits.
 * @param {string} raw @param {ReturnType<typeof argumentsOf>} args
 */
async function judge(raw, args) {
  const payload = JSON.parse(raw)
  const tool = typeof payload?.tool_name === 'string' ? payload.tool_name : ''
  const input = typeof payload?.tool_input === 'object' && payload.tool_input !== null ? payload.tool_input : {}
  const cwd = typeof payload?.cwd === 'string' && payload.cwd !== '' ? payload.cwd : process.cwd()
  const { lookAt, areaReasons, RAILING } = await import('./policy.mjs')
  const world = await theWorld(args)
  const call = { tool, input, cwd }
  const look = lookAt(call, world)
  if (look.reasons.length > 0) stop(look.reasons, RAILING)
  if (look.needsTheArea.length === 0) process.exit(0)
  const workdir = typeof input.workdir === 'string' && input.workdir !== '' ? resolve(cwd, input.workdir) : cwd
  const asker = await whoIsAsking(args, workdir)
  const reasons = areaReasons(look.needsTheArea, asker)
  if (reasons.length > 0) stop(reasons, RAILING)
  process.exit(0)
}

/** @param {string} runtime */
async function mounted(runtime) {
  const { theGuardOn } = await import('../../src/config/main-world-guard.mjs')
  if (runtime !== 'dsh') {
    process.stderr.write('Only `--mounted dsh` is answered here: the other runtimes are mounted on each command line, and theGuardOn in src/config/main-world-guard.mjs reads that line.\n')
    process.exit(1)
  }
  const answer = theGuardOn('dsh', { args: [] })
  process.stdout.write(`${answer.because}\n`)
  process.exit(answer.mounted ? 0 : 1)
}

async function main() {
  const args = argumentsOf(process.argv.slice(2))
  if (args.mounted !== null) return mounted(args.mounted)
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch (error) {
    failed('', error)
  }
  try {
    await judge(raw, args)
  } catch (error) {
    failed(raw, error)
  }
}

// RUN ONLY WHEN STARTED AS A PROGRAM, so the OpenCode plugin can import `looksDeleteShaped`.
const startedAsAProgram = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (startedAsAProgram) void main()
