// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE PROJECT'S MERGE-TOOL CONFIGURATION, READ STRICTLY.
 *
 * A project that lets the merge queue work on it writes one JSON file: where its repository is, which branch
 * lands, which commands build and test it, where the tests run, how a landing moves the checkout, which gates
 * refuse a landing, and the name and address its commits carry. This module reads that file and refuses anything
 * it does not fully understand, with a sentence naming the file and the key or the value. Nothing is guessed and
 * no half-read configuration is returned.
 *
 * Mole Office's own values are written once, in theOfficeConfiguration below. It is the office's one object. The
 * sandbox runIn belongs to the office alone: the office's tests run in a sandbox and a project's never do.
 *
 * THE OBJECT DRIVES MORE OF THE TOOL NOW. arguments.mjs builds it, and reads the migrations folder and the commit
 * identity from it. The landing reads the backup command and the migration command from it, and adds the office's own
 * age floor to the backup. Some parts still hold their own copies: the health wait in office-keeper.mjs, the backups
 * prune, the push, the line-file list, the journal path and the mutation markers.
 */

import './a-library-is-not-a-program.mjs'
import { readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { PROTECTED_AREAS_FILE } from '../checks/protected-areas.mjs'

/** The words a refusal uses when a key is not one this reader knows. */
export const UNKNOWN_KEY = 'a key this reader does not know'
/** The words a refusal uses when a project asks for a container to run its tests in. */
export const CONTAINER_NOT_BUILT = 'a container is not built yet'
/** The words a refusal uses when a project asks for a sandbox, which is the office's own place to test. */
export const SANDBOX_IS_THE_OFFICES = 'only the office runs its tests in a sandbox'
/** The words a refusal uses when a project asks to land by pushing to a remote. */
export const NOT_FAST_FORWARD = 'a push to a remote is not built'
/** The words a refusal uses when a report is not one this tool can read. */
export const UNKNOWN_REPORT = 'not a report this tool can read'
/** The reports a configuration may ask the tool to read. */
/** @type {readonly ['vitest-json', 'exit-code-only']} */
export const THE_REPORTS_THE_TOOL_READS = Object.freeze(['vitest-json', 'exit-code-only'])
/** The only way this tool lands. */
export const THE_ONLY_LANDING = 'fast-forward-the-checkout'

/** @type {readonly string[]} */
const TOP_LEVEL_KEYS = Object.freeze(['repository', 'trunk', 'test', 'land', 'gates', 'commitAs'])
/** @type {readonly string[]} */
const TEST_KEYS = Object.freeze(['build', 'suite', 'report', 'runIn'])
/** @type {readonly string[]} */
const LAND_KEYS = Object.freeze(['how', 'before', 'after', 'healthy'])
/** @type {readonly string[]} */
const AFTER_KEYS = Object.freeze(['whenAPathIsUnder', 'run'])
/** @type {readonly string[]} */
const GATES_KEYS = Object.freeze(['areas', 'markers', 'tests'])
/** @type {readonly string[]} */
const COMMIT_AS_KEYS = Object.freeze(['name', 'email'])
/** @type {readonly string[]} */
const RUN_IN_KEYS = Object.freeze(['sandbox', 'container'])
/** @type {readonly string[]} */
const HEALTHY_KEYS = Object.freeze(['doors'])

/**
 * @typedef {object} TheSandboxRunIn
 * @property {string} sandbox
 */

/**
 * @typedef {object} TheAfterEntry
 * @property {string} whenAPathIsUnder
 * @property {string[]} run
 */

/**
 * @typedef {object} TheLanding
 * @property {string} how
 * @property {string[][]} before
 * @property {TheAfterEntry[]} after
 * @property {{ doors: string[] } | null} healthy
 */

/**
 * @typedef {object} TheGates
 * @property {string} areas
 * @property {string[] | null} markers
 * @property {boolean} tests
 */

/**
 * @typedef {object} TheCommitAs
 * @property {string} name
 * @property {string} email
 */

/**
 * @typedef {object} TheConfiguration
 * @property {string} repository
 * @property {string} trunk
 * @property {{ build: string[], suite: string[], report: string, runIn: 'host' | TheSandboxRunIn }} test
 * @property {TheLanding} land
 * @property {TheGates} gates
 * @property {TheCommitAs} commitAs
 */

/**
 * Freeze one value and everything under it, so a reader cannot change a configuration it was handed.
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  const record = /** @type {Record<string, unknown>} */ (value)
  for (const child of Object.values(record)) deepFreeze(child)
  return Object.freeze(value)
}

/**
 * The one sentence for a key this reader does not know, naming every unknown key and the keys it knows.
 * @param {Record<string, unknown>} object
 * @param {readonly string[]} allowed
 * @param {string} at
 */
function onlyKeys(object, allowed, at) {
  const unknown = Object.keys(object).filter((key) => !allowed.includes(key))
  if (unknown.length === 0) return
  const named = unknown.map((key) => `"${key}"`).join(', ')
  throw new Error(`${at} has ${named}, which ${unknown.length === 1 ? 'is' : 'are'} ${UNKNOWN_KEY}. It knows ${allowed.join(', ')}.`)
}

/**
 * A key the file must hold, refused by name when it is absent.
 * @param {Record<string, unknown>} object
 * @param {string} key
 * @param {string} at
 * @returns {unknown}
 */
function required(object, key, at) {
  if (!Object.hasOwn(object, key)) throw new Error(`${at} has no "${key}". The file must hold one; a missing value is never guessed.`)
  return object[key]
}

/**
 * A JSON object, refused with the place that was read when it is anything else.
 * @param {unknown} value
 * @param {string} at
 * @returns {Record<string, unknown>}
 */
function anObject(value, at) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${at} must be a JSON object.`)
  return /** @type {Record<string, unknown>} */ (value)
}

/**
 * A non-empty string, refused by name when it is empty or not a string.
 * @param {unknown} value
 * @param {string} at
 * @returns {string}
 */
function aNonEmptyString(value, at) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${at} must be a non-empty string.`)
  return value
}

/**
 * A non-empty list of non-empty words, as one command is written.
 * @param {unknown} value
 * @param {string} at
 * @returns {string[]}
 */
function someWords(value, at) {
  if (!Array.isArray(value) || value.length === 0 || !value.every((word) => typeof word === 'string' && word !== '')) {
    throw new Error(`${at} must be a non-empty list of non-empty words.`)
  }
  return /** @type {string[]} */ (value)
}

/**
 * Whether a string is a plain relative path: no leading "/", no empty, "." or ".." segment, and no backslash.
 * @param {string} text
 * @returns {boolean}
 */
function isPlainRelativePath(text) {
  if (text === '' || text.startsWith('/') || text.includes('\\')) return false
  const segments = text.replace(/\/$/u, '').split('/')
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/**
 * A non-empty plain relative path that ends with "/", as a folder is written. A path without the
 * trailing "/" is refused because a file's path would match a longer folder's path under a prefix
 * comparison, and the caller would run a folder's steps for a folder it did not name.
 * @param {unknown} value
 * @param {string} at
 * @returns {string}
 */
function aFolderPath(value, at) {
  if (
    typeof value !== 'string' ||
    value === '' ||
    !value.endsWith('/') ||
    !isPlainRelativePath(value)
  ) {
    throw new Error(`${at} is ${JSON.stringify(value)}, which is not a folder path: a folder path ends with "/" and is a plain relative path.`)
  }
  return value
}

/**
 * Where a configuration says its tests run. "host" is every project's place. A sandbox is the office's alone,
 * and a container is refused because this machine has no runtime to prove one on.
 * @param {unknown} value
 * @param {string} at
 * @param {boolean} forTheOffice
 * @returns {'host' | TheSandboxRunIn}
 */
function readTheRunIn(value, at, forTheOffice) {
  if (value === 'host') return 'host'
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${at} must be "host", or an object naming "sandbox" or "container", not ${JSON.stringify(value)}.`)
  }
  const runIn = /** @type {Record<string, unknown>} */ (value)
  onlyKeys(runIn, RUN_IN_KEYS, at)
  const places = Object.keys(runIn)
  if (places.length === 0) throw new Error(`${at} names neither "sandbox" nor "container", so it does not say where the tests run.`)
  if (places.length > 1) throw new Error(`${at} names ${places.join(' and ')}, but it must name exactly one place.`)
  if (places[0] === 'container') {
    throw new Error(`${at} names a container, but ${CONTAINER_NOT_BUILT}. This machine has no runtime to prove one on; it is built when a project asks for it.`)
  }
  const sandbox = aNonEmptyString(runIn.sandbox, `${at}.sandbox`)
  if (!forTheOffice) throw new Error(`${at}.sandbox is refused because ${SANDBOX_IS_THE_OFFICES}. A project's configuration must run its tests on the host.`)
  return Object.freeze({ sandbox })
}

/**
 * Parse and validate one project's configuration text. `where` names the file in every refusal, and a relative
 * repository is resolved against that file's folder. Throws an Error whose message is the sentence to print.
 * @param {string} text
 * @param {string} where
 * @param {{ forTheOffice?: boolean }} [options]
 * @returns {TheConfiguration}
 */
export function readTheConfiguration(text, where, { forTheOffice = false } = {}) {
  /** @type {unknown} */
  let held
  try {
    held = JSON.parse(text)
  } catch (error) {
    throw new Error(`${where} is not JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (typeof held !== 'object' || held === null || Array.isArray(held)) throw new Error(`${where} must hold one JSON object.`)
  const root = /** @type {Record<string, unknown>} */ (held)

  onlyKeys(root, TOP_LEVEL_KEYS, where)
  const repository = aNonEmptyString(required(root, 'repository', where), `${where}: "repository"`)
  const trunk = aNonEmptyString(required(root, 'trunk', where), `${where}: "trunk"`)

  const test = anObject(required(root, 'test', where), `${where}: "test"`)
  const testAt = `${where}, in "test"`
  onlyKeys(test, TEST_KEYS, testAt)
  const build = someWords(required(test, 'build', testAt), `${testAt}: "build"`)
  const suite = someWords(required(test, 'suite', testAt), `${testAt}: "suite"`)
  const report = aNonEmptyString(required(test, 'report', testAt), `${testAt}: "report"`)
  if (!THE_REPORTS_THE_TOOL_READS.some((word) => word === report)) {
    throw new Error(`${testAt}: "report" is ${UNKNOWN_REPORT}: ${JSON.stringify(report)}. It must be ${THE_REPORTS_THE_TOOL_READS.map((word) => JSON.stringify(word)).join(' or ')}.`)
  }
  required(test, 'runIn', testAt)
  const runIn = readTheRunIn(test.runIn, `${testAt}: "runIn"`, forTheOffice)

  const land = anObject(required(root, 'land', where), `${where}: "land"`)
  const landAt = `${where}, in "land"`
  onlyKeys(land, LAND_KEYS, landAt)
  const how = aNonEmptyString(required(land, 'how', landAt), `${landAt}: "how"`)
  if (how !== THE_ONLY_LANDING) {
    throw new Error(`${landAt}: "how" is ${JSON.stringify(how)}, and ${NOT_FAST_FORWARD}; the only way this tool lands is ${JSON.stringify(THE_ONLY_LANDING)} (Q6).`)
  }
  const beforeValue = required(land, 'before', landAt)
  if (!Array.isArray(beforeValue) || beforeValue.length === 0) {
    throw new Error(`${landAt}: "before" must be a non-empty list of commands, each a non-empty list of words.`)
  }
  const before = beforeValue.map((command, index) => someWords(command, `${landAt}: "before" command ${String(index + 1)}`))
  const afterValue = required(land, 'after', landAt)
  if (!Array.isArray(afterValue)) throw new Error(`${landAt}: "after" must be a list of steps.`)
  const after = afterValue.map((entry, index) => {
    const at = `${landAt}, step ${String(index + 1)}`
    const step = anObject(entry, at)
    onlyKeys(step, AFTER_KEYS, at)
    const whenAPathIsUnder = aFolderPath(required(step, 'whenAPathIsUnder', at), `${at}: "whenAPathIsUnder"`)
    const run = someWords(required(step, 'run', at), `${at}: "run"`)
    return { whenAPathIsUnder, run }
  })
  const healthyValue = required(land, 'healthy', landAt)
  /** @type {{ doors: string[] } | null} */
  let healthy = null
  if (healthyValue !== null) {
    const healthyAt = `${landAt}: "healthy"`
    const healthyObject = anObject(healthyValue, healthyAt)
    onlyKeys(healthyObject, HEALTHY_KEYS, healthyAt)
    const doorsValue = required(healthyObject, 'doors', healthyAt)
    if (!Array.isArray(doorsValue)) throw new Error(`${healthyAt}.doors must be a list of door paths beginning "/".`)
    const doors = doorsValue.map((door, index) => {
      const at = `${healthyAt}.doors entry ${String(index + 1)}`
      if (typeof door !== 'string' || !door.startsWith('/')) throw new Error(`${at} is ${JSON.stringify(door)}, which is not a path beginning "/".`)
      return door
    })
    healthy = { doors }
  }

  const gates = anObject(required(root, 'gates', where), `${where}: "gates"`)
  const gatesAt = `${where}, in "gates"`
  onlyKeys(gates, GATES_KEYS, gatesAt)
  const areas = aNonEmptyString(required(gates, 'areas', gatesAt), `${gatesAt}: "areas"`)
  if (!isPlainRelativePath(areas)) {
    throw new Error(`${gatesAt}: "areas" is ${JSON.stringify(areas)}, which is not a plain relative path. It must have no leading "/", no ".." segment and no backslash.`)
  }
  if (areas.endsWith('/')) {
    throw new Error(`${gatesAt}: "areas" is ${JSON.stringify(areas)}, which is not a file path: a trailing "/" makes it a folder path, and this key names a file.`)
  }
  const markersValue = required(gates, 'markers', gatesAt)
  /** @type {string[] | null} */
  let markers = null
  if (markersValue !== null) {
    if (!Array.isArray(markersValue)) throw new Error(`${gatesAt}: "markers" must be null or a list of folder paths ending "/".`)
    markers = markersValue.map((marker, index) => {
      const at = `${gatesAt}: "markers" entry ${String(index + 1)}`
      return aFolderPath(marker, at)
    })
  }
  const tests = required(gates, 'tests', gatesAt)
  if (typeof tests !== 'boolean') throw new Error(`${gatesAt}: "tests" must be true or false, not ${JSON.stringify(tests)}.`)

  const commitAs = anObject(required(root, 'commitAs', where), `${where}: "commitAs"`)
  const commitAt = `${where}, in "commitAs"`
  onlyKeys(commitAs, COMMIT_AS_KEYS, commitAt)
  const name = aNonEmptyString(required(commitAs, 'name', commitAt), `${commitAt}: "name"`)
  const email = aNonEmptyString(required(commitAs, 'email', commitAt), `${commitAt}: "email"`)

  return deepFreeze({
    repository: isAbsolute(repository) ? repository : resolve(dirname(where), repository),
    trunk,
    test: { build, suite, report, runIn },
    land: { how, before, after, healthy },
    gates: { areas, markers, tests },
    commitAs: { name, email },
  })
}

/**
 * Read one configuration file and validate it with the file's own path naming every refusal.
 * @param {string} file
 * @param {{ forTheOffice?: boolean }} [options]
 * @returns {TheConfiguration}
 */
export function readTheConfigurationFile(file, options = {}) {
  /** @type {string} */
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    throw new Error(`${file} could not be read: ${error instanceof Error ? error.message : String(error)}`)
  }
  return readTheConfiguration(text, file, options)
}

/**
 * Mole Office's own configuration, the strictest one. Its values are written here and nowhere else.
 * The repository and the commit address are the two values that are not the same for every checkout.
 * @param {{ repository: string, commitEmail: string }} chosen
 * @returns {TheConfiguration}
 */
export function theOfficeConfiguration({ repository, commitEmail }) {
  return deepFreeze({
    repository,
    trunk: 'main',
    test: {
      build: ['npm', 'run', 'build'],
      suite: ['npm', 'test', '--'],
      report: THE_REPORTS_THE_TOOL_READS[0],
      runIn: { sandbox: 'tools/sandbox.mjs' },
    },
    land: {
      how: THE_ONLY_LANDING,
      before: [['npm', 'run', 'db:backup', '--', '--json']],
      after: [{ whenAPathIsUnder: 'drizzle/', run: ['npm', 'run', 'db:migrate'] }],
      healthy: { doors: ['/api/health', '/api/runtime'] },
    },
    gates: {
      areas: PROTECTED_AREAS_FILE,
      markers: ['src/', 'tools/'],
      tests: true,
    },
    commitAs: { name: 'Mole Office merge queue', email: commitEmail },
  })
}

/**
 * The four git identity values a configuration's commitAs gives, in one place so the tool and the test agree.
 * @param {TheConfiguration} configuration
 * @returns {{ GIT_AUTHOR_NAME: string, GIT_AUTHOR_EMAIL: string, GIT_COMMITTER_NAME: string, GIT_COMMITTER_EMAIL: string }}
 */
export function theGitIdentityOf(configuration) {
  return {
    GIT_AUTHOR_NAME: configuration.commitAs.name,
    GIT_AUTHOR_EMAIL: configuration.commitAs.email,
    GIT_COMMITTER_NAME: configuration.commitAs.name,
    GIT_COMMITTER_EMAIL: configuration.commitAs.email,
  }
}
