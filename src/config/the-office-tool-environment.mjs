// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE ENVIRONMENT FOR EVERY OFFICE TOOL (wave 13q, the main round).
 *
 * The stable office serves from the stable checkout and reads the development checkout's settings, because its
 * processes carry MOLE_OFFICE_DEVELOPMENT_CHECKOUT (src/config/settings.mjs reads it once, when it loads). A tool of the
 * office that starts without that variable reads the stable checkout's own defaults: another database, another key
 * file and another port. So every program that starts an office tool asks this file for the checkout and the
 * environment, and nothing else works the pairing out.
 *
 * THE PAIR IS THIS PROCESS'S OWN, never the environment a caller passes in:
 *   - a paired stable process serves from its own checkout, for the development checkout it is paired with;
 *   - an unpaired development checkout whose .env names a stable checkout is served from that stable checkout. The
 *     development checkout is the one whose .env this process reads, which for a worktree is its main checkout;
 *   - any other process has no pair, and the helper changes nothing.
 *
 * The tests are tests/every-office-tool-reads-the-paired-office.test.ts.
 */

import { spawnSync } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { ENV_FILE, REPO_ROOT, THE_DEVELOPMENT_CHECKOUT, theEnvFileSuppliedThis, theStableCheckoutNamedIn } from './settings.mjs'
import { theDatedStableTagOf } from './stable-tag.mjs'

/** The variable that carries the pairing. */
const THE_PAIRING = 'MOLE_OFFICE_DEVELOPMENT_CHECKOUT'

/** Real paths identify existing folders; a missing one keeps its resolved path. @param {string} path */
function realOrResolved(path) {
  try { return realpathSync(path) } catch { return resolve(path) }
}

/** This checkout, as a real path without a trailing slash. */
const THIS_CHECKOUT = realOrResolved(REPO_ROOT)

/**
 * The checkout the office serves from and the checkout whose settings it reads, or null when this process has no pair.
 * A relative MOLE_OFFICE_STABLE_CHECKOUT throws STABLE_CHECKOUT_INVALID, as everywhere else.
 * @returns {{ serving: string, development: string } | null}
 */
export function thePairOfThisProcess() {
  if (THE_DEVELOPMENT_CHECKOUT !== null) return { serving: THIS_CHECKOUT, development: THE_DEVELOPMENT_CHECKOUT }
  const stable = theStableCheckoutNamedIn(ENV_FILE)
  if (stable === null || stable === THIS_CHECKOUT) return null
  return { serving: stable, development: realOrResolved(dirname(ENV_FILE)) }
}

/**
 * Whether code in `where` reads the development checkout's settings without the pairing. That is the development
 * checkout, and, in an unpaired process, this checkout as well: a worktree reads its main checkout's .env, so its own
 * code reads what this process reads.
 * @param {string} where a real path
 * @param {{ serving: string, development: string }} pair
 */
function readsTheDevelopmentSettings(where, pair) {
  return where === pair.development || (THE_DEVELOPMENT_CHECKOUT === null && where === THIS_CHECKOUT)
}

/**
 * Why an office tool may not run in `checkout`, or null when it may. Only a paired office refuses, and only a checkout
 * that is neither of its two.
 * @param {string} checkout
 * @param {string} [setting] the setting that named the checkout, when one did
 * @returns {string | null}
 */
export function whyAnOfficeToolMayNotRunIn(checkout, setting) {
  const pair = thePairOfThisProcess()
  if (pair === null) return null
  const where = realOrResolved(checkout)
  if (where === pair.serving || readsTheDevelopmentSettings(where, pair)) return null
  return `${setting === undefined ? 'An office tool was to start in' : `${setting} names`} ${where}, which is neither the stable checkout ${pair.serving} nor the development checkout ${pair.development}. ` +
    'An office tool runs only in one of those two, so that it reads the office\'s settings. Nothing was started.'
}

/**
 * THE CHECKOUT AND THE ENVIRONMENT FOR ONE OFFICE TOOL.
 *
 * The serving checkout's code gets the pairing. The development checkout's code gets none, because its settings refuse
 * to load when they are named as their own pairing; nor does an unpaired process's own checkout, which reads the same
 * .env (readsTheDevelopmentSettings). Any other checkout, while this process has a pair, is refused with
 * OFFICE_TOOL_CHECKOUT_INVALID. NODE_ENV, MOLE_OFFICE_DB and every key are left as the caller has them.
 *
 * @param {Record<string, string | undefined>} env what the caller would start the tool with
 * @param {string} [checkout] where the tool's code is; the serving checkout when not given
 * @param {string} [setting] the setting that named the checkout, for the refusal
 * @returns {{ checkout: string, env: Record<string, string | undefined> }}
 */
export function theOfficeToolEnvironment(env, checkout, setting) {
  const pair = thePairOfThisProcess()
  if (pair === null) return { checkout: checkout ?? THIS_CHECKOUT, env: { ...env } }
  const where = realOrResolved(checkout ?? pair.serving)
  if (where === pair.serving) return { checkout: where, env: { ...env, [THE_PAIRING]: pair.development } }
  if (readsTheDevelopmentSettings(where, pair)) {
    const { [THE_PAIRING]: _left, ...rest } = env
    return { checkout: where, env: rest }
  }
  throw Object.assign(new Error(String(whyAnOfficeToolMayNotRunIn(where, setting))), { code: 'OFFICE_TOOL_CHECKOUT_INVALID' })
}

/**
 * THE START CHECK, for each tool of the first list (wave 13q). A stable checkout at a dated stable tag that was started
 * without the pairing would read its own defaults, so the tool says so and exits 2 before it starts anything. It reads
 * the pairing that settings.mjs read when it loaded, never process.env: the merge tool deletes the variable from its
 * environment once its settings have read it (tools/merge-tool/arguments.mjs).
 *
 * The check is not in settings.mjs, because the upgrade and the bootstrap run the stable code unpaired on purpose.
 */
export function stopAnUnpairedStableStart() {
  if (THE_DEVELOPMENT_CHECKOUT !== null) return
  const at = theDatedStableTagOf(REPO_ROOT)
  if ('refused' in at) return
  process.stderr.write(
    `This is the stable checkout ${THIS_CHECKOUT}, at ${at.tag}, and it was started without ${THE_PAIRING}, so it would read its own defaults and not the office's settings. ` +
      'Start it through theOfficeToolEnvironment (src/config/the-office-tool-environment.mjs), or run it from the development checkout with node tools/through-the-stable-checkout.mjs. Nothing was started.\n',
  )
  process.exit(2)
}

/**
 * THE WAY TO DO EACH DATABASE JOB AND SERVER START THAT A DEVELOPMENT CHECKOUT REFUSES, by the entry file the job
 * runs. `{stable}` and `{development}` are filled in from this process's pair.
 */
export const THE_WAYS_FOR_THE_JOBS = Object.freeze({
  'src/server/db/migrate.ts': 'The stable office migrates its database when it starts, so db:migrate is not run on it from here.',
  'scripts/seed.ts': 'db:seed is never run on the office\'s database.',
  'scripts/reset.ts': 'db:reset is never run on the office\'s database.',
  'scripts/rewrite-a-backup.ts': `To rewrite a backup of the office, run db:rewrite-a-backup from the stable checkout {stable}, with ${THE_PAIRING} set to {development}.`,
  'src/server/index.ts': 'Start the office with npm run mole-office start, which starts it from the stable checkout {stable}.',
  'tools/serve-dev.mjs': 'Start the office with npm run mole-office start, which starts it from the stable checkout {stable}.',
})

/**
 * `refusal` with the way for the job this process runs after it, when the job has one and this process has a pair.
 * @param {string} refusal
 * @returns {string}
 */
export function withTheWayForThisJob(refusal) {
  const entry = process.argv[1] === undefined ? null : relative(THIS_CHECKOUT, realOrResolved(process.argv[1])).split('\\').join('/')
  const way = entry === null ? undefined : /** @type {Record<string, string>} */ (THE_WAYS_FOR_THE_JOBS)[entry]
  if (way === undefined) return refusal
  let pair
  try { pair = thePairOfThisProcess() } catch { pair = null }
  if (pair === null) return refusal
  return `${refusal} ${way.replace('{stable}', pair.serving).replace('{development}', pair.development)}`
}

/** A request this file refuses before anything is run. Exit 2 says it was refused, not that a step failed. */
export class NothingWasRun extends Error {}

/**
 * RUN ONE TOOL OF THE STABLE CHECKOUT FOR THE DEVELOPMENT CHECKOUT, with the same arguments, paired, and give back its
 * exit code. Used by tools/through-the-stable-checkout.mjs, and by db:backup and db:prune-backups when they are run in
 * the development checkout. It refuses with NothingWasRun when there is no stable checkout to run it in.
 *
 * @param {string} tool the tool's file, relative to the checkout
 * @param {string[]} args
 * @param {string} name the program that says what it runs, at the start of each of its lines
 * @returns {number}
 */
export function runInTheStableCheckout(tool, args, name) {
  if (THE_DEVELOPMENT_CHECKOUT !== null) {
    throw new NothingWasRun(
      `This process is already a paired stable checkout, because ${THE_PAIRING} is set to ${THE_DEVELOPMENT_CHECKOUT}. ${tool} reads the office's settings itself. Nothing was run.`,
    )
  }
  const stable = theStableCheckoutNamedIn(ENV_FILE)
  if (stable === null) {
    throw new NothingWasRun(`ENV_FILE, ${ENV_FILE}, names no MOLE_OFFICE_STABLE_CHECKOUT, so ${tool} opens the database itself. Nothing was run.`)
  }
  if (stable === THIS_CHECKOUT) {
    throw new NothingWasRun(`The stable checkout ${stable} is this checkout, ${THIS_CHECKOUT}, so ${tool} opens the database itself. Nothing was run.`)
  }
  // WHAT THIS PROCESS'S OWN .env LOAD PUT INTO ITS ENVIRONMENT IS NOT HANDED ON: the stable checkout reads that file
  // itself, through the pairing, and resolves its paths against the development checkout.
  /** @type {Record<string, string | undefined>} */
  const given = {}
  for (const [key, value] of Object.entries(process.env)) if (!theEnvFileSuppliedThis(key, ENV_FILE)) given[key] = value
  if (given['MOLE_OFFICE_DB'] !== undefined) {
    throw new NothingWasRun(
      `MOLE_OFFICE_DB is set in this environment. The stable checkout would read that file, and this runs the stable checkout only for the database that ${ENV_FILE} names. Unset it, or run ${tool} for another database. Nothing was run.`,
    )
  }
  const file = join(stable, tool)
  let isAFile = false
  try { isAFile = statSync(file).isFile() } catch { isAFile = false }
  if (!isAFile) throw new NothingWasRun(`The stable checkout ${stable} has no ${tool} at ${file}, so there is nothing to run. Nothing was run.`)

  const { env } = theOfficeToolEnvironment(given, stable)
  console.error(
    `${name}: running ${tool} from the stable checkout ${stable}, paired with the development checkout ${env[THE_PAIRING]}. It reads the database that ${ENV_FILE} names, as the stable office does.`,
  )
  const child = spawnSync(process.execPath, [...(tool.endsWith('.ts') ? ['--import', 'tsx'] : []), file, ...args], { cwd: stable, stdio: 'inherit', env, windowsHide: true })
  if (child.error !== undefined) {
    console.error(`${name}: FAILED: the stable checkout's ${tool} could not be started: ${child.error.message}.`)
    return 1
  }
  if (child.status === null) {
    console.error(`${name}: FAILED: the stable checkout's ${tool} ended by signal ${String(child.signal)}, so whether it finished is not known.`)
    return 1
  }
  return child.status
}
