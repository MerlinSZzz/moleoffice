// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT STARTS IN AN INSTALLED OFFICE: IT REGISTERS, HOLDS ITS HANDLE, GETS A MESSAGE AND ANSWERS IT.
 *
 * Wave 13t, round 16 (report 3VoXeLuUUyeI, question 5; decision AusK_Wfu4cf5). Each step
 * uses only what the installation carries: the tools named by GET /api/onboarding (`forAgents`), run with
 * the Node it names, and nothing from a checkout.
 *
 *   1. GET /api/onboarding names the agents' folder and its Node, and the folder holds the tools.
 *   2. The agent runs register-myself.mjs from that folder. A fresh office's window is closed, so the ask
 *      waits; this script then presses Grant AS THE OFFICE'S PERSON, with the person's key from the
 *      office's own keys.json, as the window does. That is why it runs only against a test office: it
 *      refuses a live office's port, and it reads the key only from the --keys file it is given.
 *   3. The agent runs register-myself.mjs again with the same key file and is answered its key once.
 *   4. The agent holds its handle with hold-the-handle.mjs from that folder.
 *   5. The person sends the agent a message, and the waiter hands it over and names it.
 *   6. The agent answers the person with its own key, and the answer is read back.
 *
 * Run with the installation's Node, on Linux the app's own program told to run as Node:
 *   ELECTRON_RUN_AS_NODE=1 <app>/mole-office an-agent-starts.mjs --api http://127.0.0.1:<port> --keys <data folder>/data/keys.json
 * It prints one line per step and exits 0 when every step held, 1 at the first that did not, naming it.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { aPlainEnvironment } from './ask-until.mjs'

const HANDLE = 'tester-agent'
const STEP_MS = 60_000

const argv = process.argv.slice(2)
const flag = (name) => {
  const at = argv.indexOf(name)
  return at === -1 ? undefined : argv[at + 1]
}
const API = flag('--api')
const KEYS = flag('--keys')

const say = (line) => process.stdout.write(`${line}\n`)
function fail(line) {
  process.stdout.write(`FAILED: ${line}\n`)
  process.exit(1)
}

if (API === undefined || KEYS === undefined) fail('give --api <the test office> and --keys <its keys.json>. Nothing was done.')
// THE PORTS IT REFUSES are the live offices' ports, read by tools/live-office-ports.mjs when this script sits in a
// checkout: the ports a test runner handed down, or with none handed down, the port this checkout's office reads and
// the port of the office its sandbox writes to. Copied alone into a container, as run-in-a-container.sh copies it, it
// has no checkout to read and refuses no port: that container has no network.
const THE_PORTS_FILE = new URL('../../tools/live-office-ports.mjs', import.meta.url)
const refused = existsSync(THE_PORTS_FILE) ? (await import(THE_PORTS_FILE.href)).thePortsATestKeepsOff() : null
if (refused === null) say(`No checkout is beside this script: it reads no live office's port and refuses none.`)
else if (refused.includes(Number(new URL(API).port))) fail(`${API} is on the port of a live office (${refused.join(' and ')}, as tools/live-office-ports.mjs reads them). This script presses as the person, so it runs only against a test office. Nothing was done.`)
if (!existsSync(KEYS)) fail(`there is no keys file at ${KEYS}. Nothing was done.`)
const PERSON_KEY = String(JSON.parse(readFileSync(KEYS, 'utf8')).person ?? '')
if (PERSON_KEY === '') fail(`${KEYS} holds no "person" key. Nothing was done.`)

/** Hide every 64-character key in a text before it is printed. */
const hidden = (text) => String(text).replace(/[0-9a-f]{64}/g, '<a key>')

async function ask(method, path, { headers = {}, body } = {}) {
  const got = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await got.text()
  let json = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  return { status: got.status, json, text }
}

// THE TOOLS RUN WITH NONE OF THIS SHELL'S MOLE OFFICE SETTINGS, so nothing reaches another office
// (ask-until.mjs says why: problem JQ3yaANBi1JC).
const cleanEnv = aPlainEnvironment(process.env)

const scratch = mkdtempSync(join(tmpdir(), 'an-agent-starts-'))
const keyFile = join(scratch, 'key')
/** @type {import('node:child_process').ChildProcess | null} */
let waiter = null
process.on('exit', () => {
  if (waiter !== null && waiter.exitCode === null && waiter.pid !== undefined) {
    try {
      process.kill(-waiter.pid, 'SIGTERM')
    } catch {
      // It ended between the look and the signal.
    }
  }
  rmSync(scratch, { recursive: true, force: true })
})

// 1. WHERE THE TOOLS ARE.
const onboarding = await ask('GET', '/api/onboarding')
if (onboarding.status !== 200) fail(`GET /api/onboarding answered ${onboarding.status}: ${hidden(onboarding.text).slice(0, 300)}`)
const forAgents = onboarding.json.forAgents
if (forAgents === undefined) fail('GET /api/onboarding names no forAgents folder.')
const PERSON = onboarding.json.owner?.id
if (typeof PERSON !== 'string') fail('GET /api/onboarding names no owner id.')
for (const tool of ['register-myself.mjs', 'hold-the-handle.mjs', 'waiter.sh']) {
  if (!existsSync(join(forAgents.folder, tool))) fail(`${join(forAgents.folder, tool)} is not there.`)
}
say(`1. The office names its agents' folder ${forAgents.folder} and its Node ${forAgents.node}; the tools are there.`)
// A WINDOWS OR MAC BUNDLE THAT WAS NOT PACKED CARRIES NO NODE OF ITS OWN (scripts/the-shipped-node.mjs adds it). Only then may
// --node name another, and the line says which Node ran.
const OTHER_NODE = flag('--node')
let NODE = forAgents.node === 'node' ? process.execPath : forAgents.node
if (!existsSync(NODE)) {
  if (OTHER_NODE === undefined) fail(`the Node the office names, ${NODE}, is not there. Give --node <a Node 22> only for a bundle that was not packed.`)
  NODE = OTHER_NODE
  say(`   That Node is not there, because this bundle was not packed; the tools run with --node ${NODE} instead.`)
}
// WHAT THAT NODE NEEDS SET, which on Linux tells the app's own program to run as Node. Only the tools are given it.
/** @type {Record<string, string>} */
const NODE_ENVIRONMENT = forAgents.environment ?? {}

function register() {
  const ran = spawnSync(
    NODE,
    [join(forAgents.folder, 'register-myself.mjs'), '--handle', HANDLE, '--name', 'Tester agent', '--dir', scratch, '--key-file', keyFile, '--api', API, '--json'],
    { cwd: scratch, env: { ...cleanEnv, ...NODE_ENVIRONMENT }, encoding: 'utf8', timeout: STEP_MS },
  )
  if (ran.error !== undefined) fail(`register-myself.mjs did not run: ${ran.error.message}`)
  let said = {}
  try {
    said = JSON.parse(ran.stdout)
  } catch {
    fail(`register-myself.mjs did not answer JSON (exit ${String(ran.status)}): ${hidden(ran.stdout + ran.stderr).slice(0, 600)}`)
  }
  return { code: ran.status, said }
}

// 2 AND 3. REGISTER, THE PERSON'S PRESS, AND THE KEY.
let first = register()
// A WAITING REGISTRATION'S SESSION IS FILED BY THE PERSON'S PRESS, and the press answers its id.
let grantedSession
const workspace = first.said.headers?.['x-mole-office-workspace'] ?? 'default'
const asPerson = { 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': PERSON, 'x-mole-office-key': PERSON_KEY }
if (!existsSync(keyFile)) {
  const request = first.said.request
  if (typeof request !== 'string') fail(`register-myself.mjs wrote no key and named no ask: ${hidden(JSON.stringify(first.said)).slice(0, 600)}`)
  say(`2. register-myself.mjs filed the ask ${request}, which waits for the person's press.`)
  const granted = await ask('POST', `/api/roles/requests/${request}/grant`, { headers: asPerson, body: {} })
  if (granted.status >= 300) fail(`the person's Grant on ${request} answered ${granted.status}: ${hidden(granted.text).slice(0, 400)}`)
  say(`   The person pressed Grant on ${request} (${granted.status}).`)
  grantedSession = granted.json.session
  first = register()
  if (!existsSync(keyFile)) fail(`register-myself.mjs, run again after the grant, wrote no key: ${hidden(JSON.stringify(first.said)).slice(0, 600)}`)
} else {
  say('2. register-myself.mjs was admitted at once.')
}
const KEY = readFileSync(keyFile, 'utf8').trim()
const SESSION = first.said.session ?? first.said.headers?.['x-mole-office-session'] ?? grantedSession
if (typeof SESSION !== 'string') fail(`register-myself.mjs named no session: ${hidden(JSON.stringify(first.said)).slice(0, 600)}`)
say(`3. ${HANDLE} holds its key, written to its key file, and its session is ${SESSION}.`)

// 4. THE WAITER HOLDS THE HANDLE. It ends at each message it hands over, and its last line says to start
// it again; the office's own welcome may come first, so the agent starts it again until the person's arrives.
let out = ''
/** Everything every start of the waiter said, the office's welcome among it. */
let everything = ''
let ended = Promise.resolve()
function hold() {
  everything += out
  out = ''
  waiter = spawn(NODE, [join(forAgents.folder, 'hold-the-handle.mjs'), '--agent', HANDLE, '--session', SESSION, '--api', API], {
    cwd: scratch,
    env: { ...cleanEnv, ...NODE_ENVIRONMENT, MOLE_AGENT_KEY: KEY, MOLE_OFFICE_AGENT: HANDLE },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  waiter.stdout.on('data', (chunk) => (out += String(chunk)))
  waiter.stderr.on('data', (chunk) => (out += String(chunk)))
  ended = new Promise((done) => waiter.on('close', done))
}
async function until(test, what) {
  const deadline = Date.now() + STEP_MS
  while (!test()) {
    if (Date.now() > deadline || (waiter.exitCode !== null && !test())) fail(`${what}. The waiter said:\n${hidden(out)}`)
    await new Promise((done) => setTimeout(done, 200))
  }
}
hold()
await until(() => out.includes(`Holding the handle "${HANDLE}"`), 'the waiter did not say it holds the handle')
say(`4. hold-the-handle.mjs holds "${HANDLE}" (process group ${String(waiter.pid)}).`)

// 5. A MESSAGE REACHES IT.
const sent = await ask('POST', '/api/records', {
  headers: asPerson,
  body: { kind: 'message', title: 'A test message to an agent in an installed office', data: { to: [{ kind: 'agent', id: HANDLE }], body: 'Synthetic test message: please answer it.' } },
})
if (sent.status !== 201) fail(`the person's message answered ${sent.status}: ${hidden(sent.text).slice(0, 400)}`)
const messageId = sent.json.record.id
const before = []
for (;;) {
  await until(() => /^exiting: delivered /m.test(out), `the waiter handed nothing over`)
  await ended
  const delivered = /^exiting: delivered (.+)$/m.exec(out)?.[1]?.split(/[ ,]+/) ?? []
  if (delivered.includes(messageId)) break
  // EACH START HANDS OVER WHAT IS WAITING, so the person's message comes within a few.
  before.push(...delivered)
  if (before.length > 5) fail(`the waiter handed over ${before.join(', ')} and never ${messageId}`)
  say(`   The waiter handed over ${delivered.join(', ')} first, which is not the person's message; the agent starts it again.`)
  hold()
}
// WHAT IT PRINTED IS TRUE OF AN INSTALLATION: the line to start it again names the installation's own Node
// and this file's path, and nothing it said, the office's welcome included, speaks of a checkout. The
// words matched are the waiter's and the office's. A word holding a slash is a path or a command line the
// machine wrote, such as this test's temporary folder or a parent process the waiter lists in its
// "No claude process" line, so every word holding a slash is left out. A folder's name is not the
// waiter's words, and a sentence of the waiter's or the office's that speaks of a checkout still fails.
everything += out
const again = [
  ...Object.entries(NODE_ENVIRONMENT).map(([name, value]) => `${name}=${value}`),
  `"${forAgents.node}" "${join(forAgents.folder, 'hold-the-handle.mjs')}"`,
].join(' ')
if (!out.includes(again)) fail(`the waiter's line to start it again does not name ${again}. It said:\n${hidden(out)}`)
const spoken = everything.split(/\s+/).filter((word) => !word.includes('/')).join(' ')
if (/checkout/i.test(spoken)) fail(`the waiter spoke of a checkout in an installed office. It said:\n${hidden(everything)}`)
say(`5. The person's message ${messageId} reached the waiter, which handed it over and ended: "delivered ${messageId}".`)
say(`   Its line to start it again is ${again}, and it said nothing of a checkout.`)

// 6. THE AGENT ANSWERS WITH ITS OWN KEY.
const asAgent = { 'x-mole-office-workspace': workspace, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': HANDLE, 'x-mole-office-key': KEY }
const answer = await ask('POST', '/api/records', {
  headers: asAgent,
  body: { kind: 'message', title: 'Re: a test message to an agent in an installed office', data: { to: [{ kind: 'person', id: PERSON }], body: `Synthetic test answer to ${messageId}: it reached me.` } },
})
if (answer.status !== 201) fail(`the agent's answer answered ${answer.status}: ${hidden(answer.text).slice(0, 400)}`)
const answerId = answer.json.record.id
const read = await ask('GET', `/api/records/${answerId}`, { headers: asPerson })
const sentBy = read.json.record?.data?.sentBy
if (read.status !== 200 || sentBy?.kind !== 'agent') fail(`the answer ${answerId} does not read back as the agent's: ${hidden(read.text).slice(0, 400)}`)
say(`6. ${HANDLE} answered the person with message ${answerId}, sent by agent ${String(sentBy.id)}.`)
say('Every step held.')
