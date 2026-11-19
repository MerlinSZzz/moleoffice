// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE VARIABLES THIS PROCESS HOLDS, MASKED, AND WHERE EACH CAME FROM. To see them, run this; never print them
 * yourself. An agent once printed an office tool's settings through a mask of its own, the mask failed, and the run's
 * key went into the run's transcript.
 *
 *   node tools/office-variables.mjs
 *
 * WHICH NAMES. Each MOLE_OFFICE_* and SANDBOX_* name, and MOLE_AGENT_KEY, the run's key, which the office's launcher
 * sets beside them. In a sandbox's command (SANDBOX_FACTS names its template), also each secret the template declares,
 * as this checkout's copy of the template declares them. No other name is printed. The names come from this process's
 * environment and from the settings file, which every office command reads at its start. The environment wins over the
 * settings file, as it does when an office command reads it.
 *
 * WHAT IS PRINTED FOR A VALUE, in this order:
 *   - an empty value: "set, empty", whatever the name, so a key set to nothing does not read as a key that is set;
 *   - a value whose name holds KEY, TOKEN, SECRET or PASSWORD, in any case, or that looks like a key to
 *     src/config/secret-shapes.mjs: "set, sha256 " and the first 12 hex digits of the value's sha256;
 *   - a number, a word, a path, a URL or a login: the value, masked as every printed line is (maskedAsAPrintedLine), so
 *     an address, a login and a home folder are not shown;
 *   - anything else: "set, not shown".
 * A short password under an innocent name has the shape of a word, and is printed. No shape can tell the two apart.
 *
 * WHERE EACH CAME FROM: the environment; the sandbox's secret lines, for a name the template declares; or the settings
 * file. Inside a sandbox the secret lines and the rest of the environment arrive the same way, so a declared name is
 * traced to the secret lines because the launcher passes declared names from there.
 *
 * It never reads the file MOLE_OFFICE_TOOL_CONFIGURATION names. It exits 0, 1 when a source could not be read (the
 * settings file, or the sandbox's template), and 2 for an argument.
 */
import { createHash } from 'node:crypto'
import { accessSync, constants, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { maskedAsAPrintedLine } from '../src/config/inspection-ending.mjs'
import { whatLooksLikeASecret } from '../src/config/secret-shapes.mjs'
import { ENV_FILE, REPO_ROOT, bootstrapEnvironment } from '../src/config/settings.mjs'
import { THE_FACTS_VARIABLE, theSecretsATemplateDeclares } from './sandbox-common.mjs'

if (process.argv.length > 2) {
  process.stderr.write('office-variables: this takes no argument. Run it as: node tools/office-variables.mjs. Nothing was printed.\n')
  process.exit(2)
}

const AN_OFFICE_VARIABLE = /^(?:MOLE_OFFICE_|SANDBOX_)|^MOLE_AGENT_KEY$/
const A_SECRETS_NAME = /KEY|TOKEN|SECRET|PASSWORD/i

/** The kinds of value printed, after the mask: a number, a word, a path, a URL and a login. */
const THE_KINDS_PRINTED = [
  /^-?\d+(?:\.\d+)?$/,
  /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  /^\/[^\s]*$/,
  /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
  /^[^\s@]+@[^\s@]+$/,
]

/** @param {string} name @param {string} value */
function shown(name, value) {
  if (value === '') return 'set, empty'
  if (A_SECRETS_NAME.test(name) || whatLooksLikeASecret(value) !== null) return `set, sha256 ${createHash('sha256').update(value).digest('hex').slice(0, 12)}`
  if (THE_KINDS_PRINTED.some((kind) => kind.test(value))) return maskedAsAPrintedLine(value)
  return 'set, not shown'
}

let incomplete = false
/** @type {string[]} */
const said = []

// THE SETTINGS FILE, read as an office command reads it before its database is open (bootstrapEnvironment, given no
// environment, answers the file alone). It answers nothing for a file it cannot read, so that is said here.
/** @type {Record<string, string>} */
let inTheFile = {}
if (!existsSync(ENV_FILE)) said.push(`The settings file ${maskedAsAPrintedLine(ENV_FILE)} is not there, so no name came from it.`)
else {
  try {
    accessSync(ENV_FILE, constants.R_OK)
    inTheFile = /** @type {Record<string, string>} */ (bootstrapEnvironment({}, ENV_FILE))
    said.push(`The settings file is ${maskedAsAPrintedLine(ENV_FILE)}.`)
  } catch {
    incomplete = true
    said.push(`The settings file ${maskedAsAPrintedLine(ENV_FILE)} is there and cannot be read, so no name is traced to it.`)
  }
}

// THE SANDBOX'S SECRET LINES: the names its template declares, in a sandbox's command.
/** @type {Set<string>} */
let declared = new Set()
const facts = process.env[THE_FACTS_VARIABLE]
if (facts === undefined) said.push("This command was not started in a sandbox, so no name came from the sandbox's secret lines.")
else {
  let template = null
  try { template = JSON.parse(facts)?.template ?? null } catch { template = null }
  const file = typeof template === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(template) ? join(REPO_ROOT, 'sandboxes', template, 'sandbox.json') : null
  try {
    if (file === null) throw new Error('no template')
    declared = new Set(theSecretsATemplateDeclares(JSON.parse(readFileSync(file, 'utf8'))).map((one) => one.name))
    said.push(`This command was started in a sandbox made from the template ${maskedAsAPrintedLine(template)}. The secrets this checkout's copy of it declares came from the sandbox's secret lines.`)
  } catch {
    incomplete = true
    said.push(file === null
      ? `${THE_FACTS_VARIABLE} names no template this tool can read, so no name is traced to the sandbox's secret lines.`
      : `The sandbox's template ${maskedAsAPrintedLine(template)} cannot be read at ${maskedAsAPrintedLine(file)}, so no name is traced to the sandbox's secret lines.`)
  }
}

const names = [...new Set([
  ...Object.keys(process.env).filter((name) => AN_OFFICE_VARIABLE.test(name) || declared.has(name)),
  ...Object.keys(inTheFile).filter((name) => AN_OFFICE_VARIABLE.test(name)),
])].sort()

const lines = names.map((name) => {
  const held = process.env[name]
  if (held === undefined) return `${name}: ${shown(name, inTheFile[name] ?? '')} (from the settings file)`
  const from = declared.has(name) ? "the sandbox's secret lines" : 'the environment'
  const alsoInTheFile = Object.hasOwn(inTheFile, name) ? '; the settings file names it too, and is not read for it' : ''
  return `${name}: ${shown(name, held)} (from ${from}${alsoInTheFile})`
})

process.stdout.write([
  'office-variables: the office variables this process holds, and where each came from. A value whose name holds KEY, ' +
    'TOKEN, SECRET or PASSWORD, or that looks like a key, is shown only by the first 12 hex digits of its sha256. A value ' +
    'of no kind this tool knows is not shown.',
  ...said,
  ...lines,
  `office-variables: ${names.length} ${names.length === 1 ? 'name' : 'names'}.`,
].join('\n') + '\n')
process.exit(incomplete ? 1 : 0)
