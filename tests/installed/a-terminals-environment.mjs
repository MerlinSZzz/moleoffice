// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE ENVIRONMENT AN AGENT'S TERMINAL STARTS WITH, IN AN INSTALLED OFFICE, READ FROM INSIDE THE TERMINAL'S OWN PROGRAM.
 *
 * On Linux the installed office runs on the app's own program, told to run as Node by ELECTRON_RUN_AS_NODE, and the
 * service is started with MOLE_OFFICE_ variables of its own. Neither may reach a terminal the office opens for an
 * agent: a program started there that is itself an Electron app would run as Node, and a MOLE_OFFICE_ variable would
 * tell it about an office it was not meant to know of. The office means to give an agent's terminal four:
 * THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE below, which tests/the-debs-stop-a-running-office.test.ts compares with
 * theAgentsEnvironment in src/server/lib/terminal-agents.ts.
 *
 * upgrades-in-a-container.sh beside this starts the office's service as an ordinary user, with a stand-in for
 * Claude Code first on its PATH: a script named `claude` that writes the environment it started with, read from
 * /proc/<its own process>/environ, to the file named by --environ. Then it runs this, as that user, on the
 * installation's own Node:
 *
 *   ELECTRON_RUN_AS_NODE=1 /opt/mole-office/mole-office a-terminals-environment.mjs --api http://127.0.0.1:<port> --keys <data folder>/data/keys.json --environ <file>
 *
 * It registers an agent as the person, with Claude Code as its runtime, and asks the office to open it in a terminal,
 * as the person's press on the agent's page does, with the person's key from the office's own keys.json. That is why
 * it runs only against a test office. It waits for the stand-in to write the file, and prints a PASS or FAIL line
 * for each finding with what was seen: the names, never a value. It exits 0 only when every finding passed.
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/** The MOLE_OFFICE_ variables the office gives an agent's terminal, and no others. */
export const THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE = Object.freeze(['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION'])

/**
 * WHAT AN AGENT'S TERMINAL'S ENVIRONMENT GETS WRONG, from the names in it, as one finding each: ELECTRON_RUN_AS_NODE
 * is not there, every MOLE_OFFICE_ name is one the terminal is meant to have, and each of those is there.
 *
 * @param {string[]} names the names of the variables the terminal's program started with
 * @returns {{ finding: string, passed: boolean, saw: string }[]}
 */
export function theFindingsAbout(names) {
  const theirs = names.filter((name) => name.startsWith('MOLE_OFFICE_'))
  const notMeant = theirs.filter((name) => !THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE.includes(name))
  const missing = THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE.filter((name) => !names.includes(name))
  return [
    {
      finding: "the terminal's program starts without ELECTRON_RUN_AS_NODE",
      passed: !names.includes('ELECTRON_RUN_AS_NODE'),
      saw: names.includes('ELECTRON_RUN_AS_NODE') ? 'ELECTRON_RUN_AS_NODE is in its environment' : 'ELECTRON_RUN_AS_NODE is not in its environment',
    },
    {
      finding: "the terminal's program has no MOLE_OFFICE_ variable it was not meant to have",
      passed: notMeant.length === 0,
      saw: notMeant.length === 0 ? `its MOLE_OFFICE_ variables are ${theirs.join(', ') || 'none'}` : `it also has ${notMeant.join(', ')}`,
    },
    {
      finding: "the terminal's program has each MOLE_OFFICE_ variable it is meant to have",
      passed: missing.length === 0,
      saw: missing.length === 0 ? `${THE_NAMES_THE_TERMINAL_IS_MEANT_TO_HAVE.join(', ')} are there` : `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not there`,
    },
  ]
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await theCheck()

async function theCheck() {
  const argv = process.argv.slice(2)
  /** @param {string} name */
  const flag = (name) => {
    const at = argv.indexOf(name)
    return at === -1 ? undefined : argv[at + 1]
  }
  const API = flag('--api')
  const KEYS = flag('--keys')
  const ENVIRON = flag('--environ')
  /** @param {string} line */
  const say = (line) => process.stdout.write(`${line}\n`)
  /** @param {string} line @returns {never} */
  const fail = (line) => {
    say(`FAIL a terminal's environment: ${line}`)
    process.exit(1)
  }
  if (API === undefined || KEYS === undefined || ENVIRON === undefined) fail('give --api <the test office>, --keys <its keys.json> and --environ <the file the stand-in writes>. Nothing was done.')
  const api = /** @type {string} */ (API)
  const environ = /** @type {string} */ (ENVIRON)
  if (!existsSync(/** @type {string} */ (KEYS))) fail(`there is no keys file at ${String(KEYS)}. Nothing was done.`)
  const PERSON_KEY = String(JSON.parse(readFileSync(/** @type {string} */ (KEYS), 'utf8')).person ?? '')
  if (PERSON_KEY === '') fail(`${String(KEYS)} holds no "person" key. Nothing was done.`)
  if (existsSync(environ)) fail(`${environ} is there already, so what it holds would not be known to come from this terminal. Nothing was done.`)

  /** Hide every 64-character key in a text before it is printed. @param {string} text */
  const hidden = (text) => text.replace(/[0-9a-f]{64}/g, '<a key>')
  /** @param {string} method @param {string} path @param {{ headers?: Record<string, string>, body?: unknown }} [options] */
  const ask = async (method, path, { headers = {}, body } = {}) => {
    const got = await fetch(`${api}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15_000),
    })
    const text = await got.text()
    /** @type {Record<string, any>} */
    let json = {}
    try {
      json = JSON.parse(text)
    } catch {
      json = {}
    }
    return { status: got.status, json, text }
  }

  const onboarding = await ask('GET', '/api/onboarding')
  const PERSON = onboarding.json['owner']?.id
  if (typeof PERSON !== 'string') fail(`GET /api/onboarding answered ${String(onboarding.status)} and names no owner id: ${hidden(onboarding.text).slice(0, 300)}`)
  const asPerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': String(PERSON), 'x-mole-office-key': PERSON_KEY }

  const handle = 'environment-check'
  const started = await ask('POST', '/api/agents/started', { headers: asPerson, body: { handle, name: 'Environment check', runtime: 'claude-code' } })
  if (started.status !== 201) fail(`registering the agent answered ${String(started.status)}: ${hidden(started.text).slice(0, 300)}`)
  say(`NOTE a terminal's environment: the agent ${handle} is registered as the person, with Claude Code as its runtime.`)
  const opened = await ask('POST', '/api/terminals/agents', { headers: asPerson, body: { agent: handle } })
  if (opened.status !== 201) fail(`opening the agent in a terminal answered ${String(opened.status)}: ${hidden(opened.text).slice(0, 300)}`)
  const terminal = opened.json['terminal'] ?? {}
  say(`NOTE a terminal's environment: the office opened terminal ${String(terminal.id)}, which runs ${String(terminal.command)} in ${String(opened.json['folder'])}; the stand-in for Claude Code writes ${environ}.`)

  const until = Date.now() + 30_000
  while (Date.now() < until && !(existsSync(environ) && readFileSync(environ).length > 0)) await new Promise((done) => setTimeout(done, 250))
  if (!existsSync(environ) || readFileSync(environ).length === 0) fail(`the stand-in did not write ${environ} within 30 seconds, so the terminal's program never started or could not write there.`)
  const names = readFileSync(environ, 'utf8')
    .split('\0')
    .filter((line) => line !== '')
    .map((line) => line.slice(0, line.indexOf('=') === -1 ? line.length : line.indexOf('=')))
  say(`NOTE a terminal's environment: the terminal's program started with ${String(names.length)} variables: ${[...names].sort().join(' ')}`)
  const findings = theFindingsAbout(names)
  for (const one of findings) say(`${one.passed ? 'PASS' : 'FAIL'} a terminal's environment: ${one.finding}: ${one.saw}`)
  process.exit(findings.every((one) => one.passed) ? 0 : 1)
}
