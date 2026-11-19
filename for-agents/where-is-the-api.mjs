// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE API IS, ANSWERED ONCE FOR EVERY TOOL THAT HAS TO ASK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Nothing hands a tool an environment. The session hook is spawned by Claude Code from
 * the owner's user-level `~/.claude/settings.json` (read on 28 September 2026), whose command sets none; `node tools/agent-worker.mjs` inherits whatever shell
 * a person typed it in. So `MOLE_OFFICE_API` is usually empty even when `.env` says exactly where
 * the API is, and each tool fell back to a built-in address of its own.
 *
 * THOSE BUILT-INS WERE SILENTLY WRONG THE MOMENT THE PORT MOVED. A built-in address stays where it
 * was when MOLE_OFFICE_PORT changes: the hook went on resolving to the old port, and something was
 * answering there — a scratch copy of the corpus, not the live office's. Sessions would have
 * been filed into the wrong database and nothing would have said so. Once that scratch server
 * stopped, nothing answered there at all and `scripts/remove-the-throwaway-records.mjs` died with
 * ECONNREFUSED, which is the loud version of the same fault and the only reason anybody looked.
 *
 * This project has already lost a day to a session nobody filed, on 13 August, when a cold agent
 * reconstructed the work from the wrong night.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOW A THIN READER OVER `src/config/settings.mjs`, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * This file used to hold its own `.env` parser, its own precedence order and its own built-in
 * address — a second answer to a question `src/server/lib/env.ts` was already answering, kept
 * separate because a `.mjs` run directly by node could not import TypeScript. Node 22 strips types
 * on import, so it can, and there is one declaration for both kinds of caller.
 *
 * ---------------------------------------------------------------------------------------
 * THE ORDER, AND IT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * 1. A flag a person typed. `--api` beats everything, for one run.
 * 2. The real environment. `MOLE_OFFICE_API=... node tools/whatever.mjs`.
 * 3. `MOLE_OFFICE_API` in `.env`.
 * 4. `MOLE_OFFICE_PORT` in `.env` or the environment, on loopback. This is the common case and the
 *    one that used to be missing: somebody who moves the port has said where the API is, even
 *    though they did not write that line.
 * 5. The declared default port, on loopback.
 *
 * IN AN INSTALLED OFFICE, WHEN NEITHER 2, 3 NOR 4 NAMES ONE, the office meant is the one the install runs, at the port
 * its service lock records (theInstallsOwnOffice, round W22). Only a lock that is absent or unreadable leaves step 5.
 *
 * A missing or unreadable `.env` is not an error — a fresh clone reaches step 5 and that is a real
 * answer.
 */

import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import {
  ENV_FILE,
  REPO_ROOT,
  THE_INSTALL,
  apiAddressFrom,
  theEnvironmentsAddressIsForAnotherCopy,
  bootstrapEnvironment,
  databasePathFrom,
  portFrom,
  readSetting,
  readingWasSet,
  serviceLockPathFrom,
  webAddressFrom,
  workspaceFrom,
} from '../src/config/settings.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'

/**
 * One value out of `.env`, or `undefined`.
 *
 * Kept because three tools import it by name. It reads the same `.env` the declaration reads, and
 * it no longer has a parser of its own. `envPath` names another file to read instead, as a test
 * that wrote its own file reads it back (problem Y2LVU0dqBt1S); with no type named, a caller could
 * not pass one without failing the type check.
 *
 * @param {string} key
 * @param {string} [envPath]
 * @returns {string | undefined}
 */
export function fromEnvFile(key, envPath = undefined) {
  const values = envPath === undefined ? bootstrapEnvironment({}) : bootstrapEnvironment({}, envPath)
  return values[key]
}

/**
 * Where the API is, with no trailing slash.
 *
 * `override` is for a tool with its own `--api` flag: a flag a person typed beats everything, in the
 * same way the real environment does, and passing `undefined` means they did not type one.
 *
 * IN A SANDBOX SHELL THE ENVIRONMENT'S ADDRESS IS ONLY FOR THE SANDBOX'S OWN CHECKOUTS
 * (theEnvironmentsAddressIsForAnotherCopy in src/config/settings.mjs; problem JQ3yaANBi1JC). A copy of these tools
 * anywhere else is refused with a sentence that names the folder and the --api to pass; --api always wins.
 * @param {string} [override]
 */
export function whereIsTheApi(override = undefined) {
  if (override !== undefined) return String(override).replace(/\/+$/, '')
  const refused = theEnvironmentsAddressIsForAnotherCopy(process.env, REPO_ROOT)
  if (refused !== null) throw new Error(refused)
  // AN INSTALLED OFFICE'S OWN OFFICE FIRST, so every tool asks the office the session hook filed its session in. It is
  // null in a checkout and wherever a setting is set, and then the address is the declaration's, as before.
  const env = bootstrapEnvironment()
  return theInstallsOwnOffice(env)?.address ?? apiAddressFrom(env)
}

/**
 * THE OFFICE AN INSTALL RUNS, WHEN NOBODY NAMED ONE (round W22). In an office installed from a package, with neither
 * MOLE_OFFICE_API nor MOLE_OFFICE_PORT set in the environment or in the data folder's .env, the office meant is the
 * one this install runs. It answers at the port its service lock records while the lock can be read, which is where
 * the window asks it too, and otherwise at the declared port. Nothing is said on stderr when the lock is read or
 * absent, because that address is the install's own and not a guess.
 *
 * AN UNREADABLE LOCK IS SAID, IN ONE LINE ON STDERR, because the-service-lock.mjs never takes it for no lock. The line
 * names the lock's path, why it cannot be read and the address asked instead. The lock holds the service token, so
 * nothing of what is in it goes into the line; its why says only what kind of fault it found.
 *
 * Null in a checkout, and wherever either setting is set: there apiAddressFrom decides, and says on stderr when it
 * took the default. The database comes back with the port, so a caller can expect the world that office names.
 *
 * @param {Record<string, string | undefined>} [env] the environment under the declaration's .env
 * @returns {{ address: string, apiPort: number, databasePath: string } | null}
 */
export function theInstallsOwnOffice(env = bootstrapEnvironment()) {
  if (THE_INSTALL.from !== 'bundle') return null
  if (readingWasSet(readSetting('MOLE_OFFICE_API', env)) || readingWasSet(readSetting('MOLE_OFFICE_PORT', env))) return null
  const lockPath = serviceLockPathFrom(env)
  const lock = readTheServiceLock(lockPath)
  const apiPort = lock.state === 'read' ? lock.lock.port : portFrom(env, 'MOLE_OFFICE_PORT')
  const address = `http://127.0.0.1:${String(apiPort)}`
  if (lock.state === 'unreadable') {
    process.stderr.write(`The office's service lock at ${lockPath} cannot be read (${lock.why}), so this asks the declared address, ${address}.\n`)
  }
  return { address, apiPort, databasePath: databasePathFrom(env) }
}

/**
 * whereIsTheApi FOR A COMMAND: the address, or, when this copy may not take the environment's address (problem
 * JQ3yaANBi1JC), that sentence on stderr and exit 2, before anything is sent. A command that reads its --api into
 * `override` calls this once, at its start.
 * @param {string | null} [override]
 * @returns {string}
 */
export function whereIsTheApiForACommand(override = undefined) {
  try {
    return whereIsTheApi(override ?? undefined)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(2)
  }
}

/**
 * Where the browser app is, with no trailing slash, by the same order.
 *
 * THREE SETTINGS NAME THE SAME ADDRESS and this is the one place that reconciles them.
 * `MOLE_OFFICE_URL` is what the photographing tools have always read; `MOLE_OFFICE_WEB` is what
 * three others read; `MOLE_OFFICE_WEB_PORT` is the one `npm run dev` and the server read. They are
 * tried in that order. Two names for one thing is the defect this whole change is about, and
 * collapsing them is a change to what every photographing tool's command line means — so it is
 * proposed to the owner rather than done here.
 *
 * `ifUnset` is for a tool that photographs an app IT started on a port of its own. Passing it says
 * "when the operator has named no address, use this one" — which is a different statement from the
 * product's own default, and the tools that need it are the ones `tools/review.mjs` drives.
 */
export function whereIsTheWebApp(override = undefined, { ifUnset = undefined } = {}) {
  if (override !== undefined) return String(override).replace(/\/+$/, '')
  const env = bootstrapEnvironment()
  for (const name of ['MOLE_OFFICE_URL', 'MOLE_OFFICE_WEB']) {
    const set = readSetting(name, env)
    if (readingWasSet(set)) return String(set.value).replace(/\/+$/, '')
  }
  if (ifUnset !== undefined && !readingWasSet(readSetting('MOLE_OFFICE_WEB_PORT', env))) {
    return String(ifUnset).replace(/\/+$/, '')
  }
  return webAddressFrom(env)
}

/** Which project a tool reads and writes, by the same order. */
export function whichWorkspace(override = undefined) {
  return override ?? workspaceFrom(bootstrapEnvironment())
}

/**
 * WHICH DURABLE AGENT A SESSION STARTED IN THIS CHECKOUT ANSWERS AS, or null because nobody said.
 *
 * Criterion H1 of design/messages/ACCEPTANCE.md section 10. A terminal session has no way of its
 * own to know which agent it is: Claude Code, Codex and OpenCode all know their conversation id and
 * none of them knows a Mole Office handle. So the checkout says, in `.env`, and the session hook and
 * `for-agents/hold-the-handle.mjs` read the same line.
 *
 * NULL IS A REAL ANSWER and it is the ordinary one. A checkout that names no agent has sessions that
 * are nobody's durable agent, exactly as before this existed, and the hook offers them nothing.
 */
export function whichAgent(override = undefined) {
  if (override !== undefined && override !== '') return String(override)
  const said = readSetting('MOLE_OFFICE_AGENT', bootstrapEnvironment()).value
  return typeof said === 'string' && said !== '' ? said : null
}

/** The nearest `.env` above a directory, or null because nothing is there. */
function nearestEnvFileAbove(directory) {
  let here = resolve(directory)
  for (;;) {
    const candidate = join(here, '.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(here)
    if (parent === here) return null
    here = parent
  }
}

/**
 * IS THIS DIRECTORY THIS CHECKOUT, OR INSIDE IT?
 *
 * The one reading the session-hook identity fix turns on. A session whose working directory is
 * inside the checkout the hook belongs to may read that checkout's `.env`; one whose directory
 * lies outside it may not. Plain path containment, so a worktree's own root counts as the checkout
 * the hook was started from.
 */
export function thisDirectoryIsInThisCheckout(directory) {
  const base = resolve(REPO_ROOT)
  const target = resolve(directory)
  return target === base || target.startsWith(base + sep)
}

/**
 * WHICH DURABLE AGENT THE SESSION WORKING IN `directory` ANSWERS AS: THE TWO READINGS BELOW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE ARE NOT `whichAgent`
 * ---------------------------------------------------------------------------------------
 *
 * `whichAgent` reads the `.env` of THIS checkout — the checkout the tool lives in. That is right
 * for a tool a person starts from the checkout, and it was measured wrong for the session hook:
 * `~/.claude/settings.json` runs one hook for every Claude Code session on this machine whatever
 * its directory, so a session in another repository was told it answered as this checkout's agent and was handed
 * a panelx run's record (problem `JsxXlrodyydX`).
 *
 * THE SESSION'S OWN FACTS COME FIRST. The environment it was started with, then the `.env` of the
 * project it is working in, found by walking up from the directory it started in. Only a session
 * INSIDE this checkout may fall back to this checkout's own `.env`; one outside it gets null, which
 * is the honest "nobody named an agent for this session" and what makes the hook claim no handle.
 *
 * NULL IS A REAL ANSWER and it is the ordinary one for a session that is not this checkout's.
 *
 * THE SESSION HOOK READS A THIRD THING BETWEEN THE TWO: the handle a waiter holds on the session's own
 * record (problem ihekMM954ojG). So the environment and the `.env` are two functions, and
 * tools/session-hook.mjs asks the sources in order where it sets AGENT at its top level: the
 * environment (`theAgentTheEnvironmentNames`), then a waiter's hold (`theHeldAgent`), then a `.env`
 * (`theAgentAnEnvFileNames`), then the registered start folder. The first and third are below, in
 * this file; `theHeldAgent` is in the hook.
 */

/**
 * THE AGENT THE SESSION'S OWN ENVIRONMENT NAMES, or null because MOLE_OFFICE_AGENT is not set.
 *
 * Read through the one declaration rather than out of `process.env` here:
 * tests/one-configuration-source.test.ts refuses a second reader. An empty value throws, as the
 * declaration does for every setting, because "set and empty" is not "not set".
 */
export function theAgentTheEnvironmentNames() {
  const fromEnvironment = readSetting('MOLE_OFFICE_AGENT', process.env).value
  return typeof fromEnvironment === 'string' && fromEnvironment !== '' ? fromEnvironment : null
}

/**
 * THE `.env` A SESSION WORKING IN `directory` READS, or null because there is none above it.
 *
 * The `.env` found upward from the directory when the session is outside this checkout; this
 * checkout's own `.env` when it is inside it, or when no directory was given. Both the agent and the
 * project a `.env` names for a session are read from this one file.
 * @param {string} [directory]
 * @returns {string | null}
 */
export function theEnvFileASessionReads(directory = undefined) {
  return directory !== undefined && !thisDirectoryIsInThisCheckout(directory) ? nearestEnvFileAbove(directory) : ENV_FILE
}

/** One setting `file` sets, or null because it does not set it. The environment is not read here. */
function theSettingAnEnvFileSets(name, file) {
  if (file === null) return null
  const said = readSetting(name, bootstrapEnvironment({}, file))
  return readingWasSet(said) && typeof said.value === 'string' && said.value !== '' ? said.value : null
}

/**
 * THE AGENT A `.env` NAMES FOR THE SESSION WORKING IN `directory`, or null because none does.
 * The `.env` is `theEnvFileASessionReads`. The environment is not read here;
 * `theAgentTheEnvironmentNames` reads it.
 */
export function theAgentAnEnvFileNames(directory = undefined) {
  return theSettingAnEnvFileSets('MOLE_OFFICE_AGENT', theEnvFileASessionReads(directory))
}

/**
 * THE PROJECTS A SESSION'S OWN ENVIRONMENT AND ITS OWN `.env` NAME (problem vya7xFG93ern, part A). The session
 * hook files a new session record in the first of: the project the session's environment names, the project its
 * `.env` names, and the project its start folder matched. These two answer the first two, or null because nothing
 * is set there. A declared default is not an answer: it is what applies when nobody named a project.
 */
export function theProjectTheEnvironmentNames() {
  const said = readSetting('MOLE_OFFICE_WORKSPACE', process.env)
  return said.source === 'the environment' && typeof said.value === 'string' && said.value !== '' ? said.value : null
}

/** @param {string} [directory] */
export function theProjectAnEnvFileNames(directory = undefined) {
  return theSettingAnEnvFileSets('MOLE_OFFICE_WORKSPACE', theEnvFileASessionReads(directory))
}
