// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The inspector runs a dsh check in its private sandbox through its own ACP client.
 * Whole runs cover each rule, including both key-masking cases and a key in a turn's reason.
 * Other envelope, transcript-layout, retained-state and unfinished-turn variants call the real
 * readers directly. The API and launchers are real; container and model executables are stand-ins.
 */

import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { dirname, join, relative } from 'node:path'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { CONTAINER_TMP_LOADER, FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { FROM_THE_CONTAINER_TO_THE_HOST } from './container-path-on-the-host.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { DSH_CHECK_ENV, maskedOfWhatTheViewIsHanded, runInside, theDshProviderVariables, theRepositoryOf, theSecretNamesOf } from '../tools/inspector-sandbox.mjs'
import { theFileThatWasChecked } from '../tools/inspector-checked-file.mjs'
import { projectKey, theTextOfTheTranscript, theTranscriptOfTheSession } from '../tools/dsh-hooks/served.mjs'
import { theDshSelection } from '../tools/sandbox-common.mjs'
import { inspectionUsageIn, inspectionUsageReceipt } from '../src/config/usage.mjs'
import { withoutTheTimes } from '../tools/inspector-log-times.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY } from '../src/config/model-efforts.mjs'
import { settings } from '../src/config/settings.mjs'
import { THE_PROVIDER_KEY_USES } from '../src/shared/the-provider-table.ts'
import { THE_FEATURES_OFF_BESIDE_THE_CLIENT } from '../tools/inspector-dsh-acp.mjs'
import { DSH_FEATURES_OFF } from '../tools/harness-features-off.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const CLIENT = join(REPO, 'tools', 'inspector-dsh-acp.mjs')
const STAND_IN = join(REPO, 'tests', 'a-dsh-acp-stand-in.mjs')
const WORKSPACE = 'default'
const THE_INSPECTOR = 'inspector-one'
const INSTANCE = `inspector-${THE_INSPECTOR}`
const CONTAINER = `mole-office-sandbox-${INSTANCE}`
/** A made-up DeepSeek key. It is not a real one, and it may never be printed. */
const KEY = 'synthetic-deepseek-key-not-a-real-one'
/** The session B1's stand-in answers session/new with, and one it never makes. */
const SESSION = '9b2c4e1a-7d3f-4a5b-8c6d-0e1f2a3b4c5d'
const OTHER_SESSION = '0f1e2d3c-4b5a-4968-8776-655443322110'
/** The route theDshSelection maps deepseek-v4.1-flash to. */
const ROUTE = { provider: 'deepseek-official', model: 'deepseek-flash' }
/** What the stand-in dsh writes on each answer in its transcript. The served model is made up. */
const USAGE = { inputTokens: 100, outputTokens: 7, cacheReadTokens: 20, cacheWriteTokens: 3, reasoningTokens: 5 }
const SOURCE = { provider: 'deepseek-official', model: 'deepseek-synthetic-served' }
/** One answer as the usage line carries it: its usage and source, and nothing else of the transcript. */
const ONE_ANSWER_CARRIED = JSON.stringify({ type: 'assistant/message', data: { usage: USAGE, message: { source: SOURCE } } })
const THE_TRANSCRIPT_SEEN = `/check/home/.dsh/sessions/--work--/${SESSION}/session.v3.jsonl`
/** THE_MOST_OF_A_TRANSCRIPTS_TEXT in tools/dsh-hooks/served.mjs, the most a .zstd transcript is decoded to. Its value is
 * pinned by tests/a-dsh-transcript-is-read-within-its-bounds.test.ts. */
const THE_MOST_OF_A_TRANSCRIPTS_TEXT = 64 * 1024 * 1024
/** A decoy client, put in both checkouts. Run, it exits 3; the inspector must never copy it. */
const DECOY = '// A DECOY CLIENT, written by a test. The inspector copies its own client, never one from a checkout.\nprocess.exit(3)\n'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let api = ''
let scratch = ''
let home = '' // the HOME the tool runs with: its secrets file is this test's
let fakes = ''
let from = '' // the checkout the inspector's sandbox is made from
let sandboxes = ''
let worker = '' // the worker's checkout: the work under check
let records = '' // where the stand-ins write down how they were started
let behaviour = '' // one file per check, saying how the stand-ins behave in it
const groups = new Set<number>()

/** What the office's model door answers for the inspector. Each case sets it; no Casting row is written. */
let theDoor: Record<string, unknown> = {}
/** The one case that writes the inspector's Casting row reads the office's own model door, with the row's selection. */
let theRealModelDoor = false
function theDoorSays({ model = 'deepseek-v4.1-flash', effort = 'high' as string | null } = {}): void {
  theDoor = { runtime: 'dsh', model, effort, effortFrom: effort === null ? 'none' : 'Casting',
    says: 'A synthetic answer of this test\'s model door. No Casting row names dsh.' }
}

// ---------------------------------------------------------------------------- the stand-ins

const FAKE_DEVCONTAINER = String.raw`#!/usr/bin/env node
// A STAND-IN FOR THE devcontainer CLI, written by a test. It starts no container.
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const stateFile = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
// WHOLE OR NOT AT ALL: the office reads this file while a stand-in writes it, so a write is renamed into place.
const put = (value) => { fs.writeFileSync(stateFile + '.' + process.pid, JSON.stringify(value)); fs.renameSync(stateFile + '.' + process.pid, stateFile) }
const argv = process.argv.slice(2)
const at = (flag) => argv[argv.indexOf(flag) + 1]
const fill = (s) => String(s).replace(/\$\{localEnv:([A-Z_]+)\}/g, (_, n) => process.env[n] ?? '')
const config = JSON.parse(fs.readFileSync(at('--config'), 'utf8'))
const name = (config.runArgs.find((a) => a.startsWith('--name=')) || '').slice('--name='.length)
state.calls.push({ tool: 'devcontainer', argv, name })
const mounts = [config.workspaceMount, ...config.mounts].map((text) => {
  const m = {}
  for (const part of fill(text).split(',')) { const [k, ...v] = part.split('='); m[k] = v.length ? v.join('=') : true }
  return { Type: m.type, Source: m.source ?? '', Destination: m.target, RW: !(m.readonly === true || m.readonly === 'true') }
})
const labels = { [at('--id-label').split('=')[0]]: at('--id-label').split('=')[1] }
for (const a of config.runArgs) if (a.startsWith('--label=')) { const [k, v] = a.slice(8).split('='); labels[k] = v }
const id = crypto.randomBytes(32).toString('hex')
const containerEnv = Object.entries(config.containerEnv ?? {}).map(([k, v]) => k + '=' + fill(v))
for (const a of config.runArgs) if (a.startsWith('--env=')) containerEnv.push(a.slice(6))
// AS DOCKER DOES, the container carries the host name its --hostname= run argument asks for, else the first twelve of its id.
const hostName = (config.runArgs.find(a => a.startsWith('--hostname=')) ?? '--hostname=' + id.slice(0, 12)).slice('--hostname='.length)
state.containers[name] = { Id: id, Name: '/' + name, State: { Running: true, Status: 'running', Pid: 999999 }, Config: { Hostname: hostName, Labels: labels, Env: containerEnv, Image: 'synthetic-image', User: '1000:1000' }, HostConfig: { NetworkMode: 'none', Memory: 1 }, Mounts: mounts }
put(state)
process.stdout.write(JSON.stringify({ outcome: 'success', containerId: id, remoteUser: '1000:1000' }) + '\n')
`

const FAKE_DOCKER = String.raw`#!/usr/bin/env node
// A STAND-IN FOR docker, written by a test. A container is a row in a state file; exec and run run here.
const fs = require('fs'), path = require('path'), { spawn } = require('child_process')
const stateFile = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
const put = (value) => { fs.writeFileSync(stateFile + '.' + process.pid, JSON.stringify(value)); fs.renameSync(stateFile + '.' + process.pid, stateFile) }
const save = () => put(state)
const argv = process.argv.slice(2)
const find = (key) => Object.values(state.containers).find((c) => c.Name === '/' + key || c.Id === key)
const verb = argv[0]
if (verb === 'inspect') {
  const c = find(argv[argv.length - 1])
  if (!c) { process.stderr.write('Error: No such container: ' + argv[argv.length - 1] + '\n'); process.exit(1) }
  process.stdout.write(JSON.stringify([c]))
  process.exit(0)
}
if (verb === 'rm') {
  const c = find(argv[1])
  state.calls.push({ tool: 'docker', argv })
  if (!c || c.State.Running) { save(); process.exit(1) }
  delete state.containers[c.Name.slice(1)]
  save(); process.exit(0)
}
if (verb === 'top') {
  process.stdout.write('PID PGID COMMAND\n999999 999999 /sbin/docker-init -- /bin/sh -c echo Container started\n')
  process.exit(0)
}
if (verb === 'run') {
  let i = 1, env = {}, mounts = [], name, cwd
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (['--rm', '--init', '-i'].includes(a) || /^--[a-z-]+=/.test(a)) continue
    if (['--name', '--network', '--user', '--cap-drop', '--security-opt', '--label', '--entrypoint', '--mount', '--env-file', '-w'].includes(a)) {
      const value = argv[++i]
      if (a === '--name') name = value
      if (a === '-w') cwd = value
      if (a === '--mount') {
        const m = Object.fromEntries(value.split(',').map(p => { const k = p.indexOf('='); return k < 0 ? [p, true] : [p.slice(0,k), p.slice(k+1)] }))
        mounts.push({ Type: 'bind', Source: m.source, Destination: m.target, RW: !m.readonly })
      }
      if (a === '--env-file') for (const line of fs.readFileSync(value, 'utf8').split('\n')) {
        const at = line.indexOf('='); if (at > 0) env[line.slice(0,at)] = line.slice(at+1)
      }
      continue
    }
    break
  }
  const toTheHost = ${FROM_THE_CONTAINER_TO_THE_HOST}
  const map = text => toTheHost(text, mounts.map(m => [m.Destination, m.Source]))
  const inline = argv[i + 2], cfg = JSON.parse(argv[i + 3])
  for (const key of Object.keys(env)) env[key] = map(env[key])
  env.PATH = process.env.PATH
  env.INSPECTOR_TEST_MOUNTS = JSON.stringify(mounts)
  const script = map(fs.readFileSync(map(argv[i + 5]), 'utf8'))
  env.INSPECTOR_TEST_CHECK_FOLDER = path.basename(path.dirname(path.dirname(map(argv[i + 5]))))
  cfg.envNames.push('INSPECTOR_TEST_MOUNTS', 'INSPECTOR_TEST_CHECK_FOLDER')
  cfg.seeds = cfg.seeds.map(seed => ({ ...seed, container: map(seed.container) }))
  state.calls.push({ tool: 'docker', argv, mounts })
  state.containers[name] = { Id: name, Name: '/' + name, State: { Running: true, Status: 'running', Pid: process.pid }, Config: { Labels: {}, Env: [] }, Mounts: mounts }
  save()
  const child = spawn(process.execPath, ['-e', inline, JSON.stringify(cfg), 'sh', '-c', script], { cwd: map(cwd), env, stdio: ['inherit', 'inherit', 'pipe'] })
  let pending = ''
  child.stderr.on('data', bytes => {
    process.stderr.write(bytes)
    pending += bytes.toString()
    const match = new RegExp(cfg.ready + '(\\d+)').exec(pending)
    if (match) {
      const now = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      now.containers[name].nativeGroup = Number(match[1])
      put(now)
    }
  })
  child.on('exit', (code, signal) => process.exit(code ?? 128))
} else if (verb === 'exec') {
  const env = { PATH: process.env.PATH }
  let i = 1, cwd = '/'
  for (; i < argv.length; i++) {
    if (argv[i] === '--env-file') { for (const line of fs.readFileSync(argv[++i], 'utf8').split('\n')) { const k = line.indexOf('='); if (k > 0) env[line.slice(0, k)] = line.slice(k + 1) } }
    else if (argv[i] === '-e') { const kv = argv[++i]; const k = kv.indexOf('='); env[kv.slice(0, k)] = kv.slice(k + 1) }
    else if (argv[i] === '-w') cwd = argv[++i]
    else break
  }
  const c = find(argv[i])
  for (const kv of (c && c.Config.Env) || []) { const k = kv.indexOf('='); if (!(kv.slice(0, k) in env)) env[kv.slice(0, k)] = kv.slice(k + 1) }
  env.INSPECTOR_TEST_MOUNTS = JSON.stringify(c?.Mounts ?? [])
  state.calls.push({ tool: 'docker', argv: argv.slice(0, i + 2) }); save()
  if (!c || !c.State.Running) { process.stderr.write('Error: container is not running\n'); process.exit(1) }
  const containerTmp = path.join(process.env.FAKE_DOCKER_DIR, 'tmp'); fs.mkdirSync(containerTmp, { recursive: true })
  if (!env.TMPDIR) env.TMPDIR = containerTmp
  const loader = path.join(process.env.FAKE_DOCKER_DIR, 'container-tmp.mjs'); fs.writeFileSync(loader, ${JSON.stringify(CONTAINER_TMP_LOADER)})
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + require('node:url').pathToFileURL(loader).href].filter(Boolean).join(' ')
  const child = spawn(argv[i + 1], argv.slice(i + 2), { cwd, env, stdio: 'inherit' })
  child.on('exit', (code) => process.exit(code ?? 128))
} else {
  process.stderr.write('the stand-in docker does not know ' + verb + '\n'); process.exit(2)
}
`

const FAKE_NPM = '#!/usr/bin/env node\n// A STAND-IN FOR npm, written by a test. It builds nothing.\n'

/** The key names a stand-in looks for, by name only; it never writes a value down. */
const SECRET_NAMES = ['DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'OPENCODE_API_KEY', 'OPENROUTER_API_KEY']

/**
 * The stand-in `dsh`. Its parent is the ACP client, so the client's own arguments are read from /proc. The transcript is
 * laid out where dsh keeps one, <DSH_HOME>/sessions/<projectKey('/work')>/<session>/, in the layout the case names.
 */
function fakeDsh(): string {
  return String.raw`#!/usr/bin/env node
// A STAND-IN FOR dsh, written by a test. It starts no model. It writes down how it was started, lays out the transcript
// its case asks for, and then runs tests/a-dsh-acp-stand-in.mjs, which speaks dsh's ACP protocol. It reads no key, but in
// the one case that tells it to put the made-up key it was handed in its answer and its transcript, as a model might.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib'), { pathToFileURL } = require('url')
const here = process.env.INSPECTOR_TEST_CHECK_FOLDER
const told = JSON.parse(fs.readFileSync(path.join(${JSON.stringify(behaviour)}, here + '.json'), 'utf8'))
const recordFile = path.join(${JSON.stringify(records)}, 'dsh-' + here + '.json')
const earlier = fs.existsSync(recordFile) ? JSON.parse(fs.readFileSync(recordFile, 'utf8')) : []
const n = earlier.length
const client = fs.readFileSync('/proc/' + process.ppid + '/cmdline', 'utf8').split('\0').filter(Boolean)
const clientFile = client[1]
const resumed = client.includes('--resume') ? client[client.indexOf('--resume') + 1] : null
const session = resumed ?? ${JSON.stringify(SESSION)}
const log = path.join(${JSON.stringify(records)}, 'dsh-acp-' + here + '-' + n + '.log')
earlier.push({ argv: process.argv.slice(2), client, cwd: process.cwd(),
  clientSha256: crypto.createHash('sha256').update(fs.readFileSync(clientFile)).digest('hex'),
  clientMode: (fs.statSync(clientFile).mode & 0o777).toString(8),
  patches: process.argv.slice(2).flatMap((word, i, all) => all[i - 1] === '--patch' ? [{ file: word,
    sha256: fs.existsSync(word) ? crypto.createHash('sha256').update(fs.readFileSync(word)).digest('hex') : null,
    mode: fs.existsSync(word) ? (fs.statSync(word).mode & 0o777).toString(8) : null }] : []),
  wrapper: fs.readFileSync(path.join(path.dirname(clientFile), 'dsh.sh'), 'utf8'),
  dshHome: process.env.DSH_HOME, permissionMode: process.env.DSH_PERMISSION_MODE,
  secrets: ${JSON.stringify(SECRET_NAMES)}.filter((name) => process.env[name]),
  office: Object.keys(process.env).filter((name) => name.startsWith('MOLE_OFFICE') || name === 'MOLE_AGENT_KEY').sort(), log })
fs.writeFileSync(recordFile, JSON.stringify(earlier))

const handed = (text) => told.writesTheKey ? text.replaceAll('THE KEY HANDED', process.env.DEEPSEEK_API_KEY) : text
const answer = handed(told.answers[Math.min(n, told.answers.length - 1)])
const source = told.writesTheKey ? { ...${JSON.stringify(SOURCE)}, model: handed('THE KEY HANDED') } : ${JSON.stringify(SOURCE)}
const line = (event) => JSON.stringify(event) + '\n'
// MADE-UP TRANSCRIPT EVENTS, appended on every start. No event here was read from a real dsh session.
const user = { type: 'user/message', data: { text: 'A synthetic prompt marker; the usage line must not carry it.' } }
const assistant = { type: 'assistant/message', data: { usage: ${JSON.stringify(USAGE)}, message: { source,
  content: 'Synthetic answer text; the usage line must not carry it.' }, stream: [{ usage: ${JSON.stringify(USAGE)} }] } }
const start = { type: 'turn/start' }, end = { type: 'turn/end', data: { reason: { kind: 'completed' } } }
const tools = [{ type: 'tool/call', data: { name: 'made-up-tool' } }, { type: 'tool/result', data: { text: 'Made-up result.' } }]
const step = [{ type: 'step/start' }, assistant, { type: 'step/end' }]
const toolStep = [{ type: 'step/start' }, ...tools, { type: 'step/end' }]
const shapes = {
  completed: [user, start, ...step, end],
  // THE TOOL MAINTAINER'S STOPPED SHAPE, MADE UP HERE: the setup events, then a turn and step blocks, with no turn/end.
  stopped: ['session', 'permission/preset', 'sandbox/mode', 'approval/policy', 'agent/inbox/spliced'].map(type => ({ type }))
    .concat([start, { type: 'step/start' }, assistant, ...tools, { type: 'step/end' }, ...toolStep]),
  'other-reason': [start, ...step, end, { type: 'turn/end', data: { reason: { kind: 'made-up-other-kind' } } }],
  'no-reason': [start, ...step, { type: 'turn/end', data: {} }],
  'answer-after-end': [start, ...step, end, assistant],
  'no-start': [user, assistant],
  'tools-interrupted': [start, ...toolStep],
  'key-reason': [start, ...step, { type: 'turn/end', data: { reason: { kind: handed('THE KEY HANDED') } } }],
  'bad-line': [start, ...step, end],
}
const shape = told.turns?.[Math.min(n, told.turns.length - 1)] ?? 'completed'
if (!Object.hasOwn(shapes, shape)) throw new Error('Unknown made-up turn shape: ' + shape)
const events = shapes[shape].map(line).join('') + (shape === 'bad-line' ? 'A made-up line that is not JSON.\n' : '')
const sessions = path.join(process.env.DSH_HOME, 'sessions')
const layout = told.transcript ?? 'read'
if (layout === 'sessions-link') {
  const real = path.join(process.env.DSH_HOME, 'elsewhere', 'sessions')
  fs.mkdirSync(path.join(real, '--work--', session), { recursive: true })
  fs.appendFileSync(path.join(real, '--work--', session, 'session.v3.jsonl'), events)
  if (!fs.existsSync(sessions)) fs.symlinkSync(real, sessions)
} else if (layout !== 'none') {
  const folder = path.join(sessions, '--work--', session)
  fs.mkdirSync(folder, { recursive: true })
  if (layout === 'transcript-link') {
    fs.appendFileSync(path.join(process.env.DSH_HOME, 'elsewhere.jsonl'), events)
    if (!fs.existsSync(path.join(folder, 'session.v3.jsonl'))) fs.symlinkSync(path.join(process.env.DSH_HOME, 'elsewhere.jsonl'), path.join(folder, 'session.v3.jsonl'))
  } else if (layout === 'zstd' || layout === 'zstd-past-the-most') {
    // dsh 0.1.5-rc.2 writes session.v3.jsonl.zstd and appends one zstd frame each time it writes. Each event is a write
    // here, so the file holds several frames. A copy is kept in the records, so the case can show it is more than one frame.
    const file = path.join(folder, 'session.v3.jsonl.zstd')
    for (const one of events.split('\n').filter(Boolean)) fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.from(one + '\n')))
    // ANOTHER FRAME OF SPACES, a few KB that decode to one byte past the most a transcript is decoded to.
    if (layout === 'zstd-past-the-most') fs.appendFileSync(file, zlib.zstdCompressSync(Buffer.alloc(${String(THE_MOST_OF_A_TRANSCRIPTS_TEXT)} + 1, 0x20)))
    fs.copyFileSync(file, path.join(${JSON.stringify(records)}, 'transcript-' + here + '-' + n + '.zstd'))
  } else {
    fs.appendFileSync(path.join(folder, 'session.v3.jsonl'), events)
    if (layout === 'two-files') fs.appendFileSync(path.join(folder, 'session.v2.jsonl'), events)
  }
}

const scenario = path.join(${JSON.stringify(records)}, 'dsh-acp-' + here + '-' + n + '.json')
// THE ROUTE THIS CASE ASKS FOR, unless the case names another: the stand-in reports the route the client must see.
const route = told.route ?? ${JSON.stringify(ROUTE)}
fs.writeFileSync(scenario, JSON.stringify({ log, sessionId: ${JSON.stringify(SESSION)},
  routeOnNew: [route.provider, route.model], routeOnResume: [route.provider, route.model],
  prompt: { updates: [{ sessionUpdate: 'agent_message_chunk', messageId: 'm-' + n, content: { type: 'text', text: answer } }], stopReason: 'end_turn' } }))
process.env.DSH_ACP_STAND_IN_SCENARIO = scenario
import(pathToFileURL(${JSON.stringify(STAND_IN)}).href)
`
}

/** The stand-in client of the envelope cases. It prints the output its case gives for this invocation, and nothing else. */
function fakeClient(): string {
  return String.raw`// A STAND-IN FOR THE DSH ACP CLIENT, written by a test, for the envelope cases only. It starts nothing. It writes
// down its arguments and prints the output its case gives for this invocation, where the client prints its envelope.
const fs = require('fs'), path = require('path')
const here = process.env.INSPECTOR_TEST_CHECK_FOLDER
const file = path.join(${JSON.stringify(records)}, 'client-' + here + '.json')
const earlier = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []
earlier.push({ argv: process.argv.slice(2) })
fs.writeFileSync(file, JSON.stringify(earlier))
const { outputs } = JSON.parse(fs.readFileSync(path.join(${JSON.stringify(behaviour)}, here + '.envelopes.json'), 'utf8'))
const one = outputs[Math.min(earlier.length - 1, outputs.length - 1)]
// A MADE-UP COMPLETED TURN for the envelope stand-in too. The session-mismatch case must reach its resumed answer.
let envelope
try { envelope = JSON.parse(one.text) } catch { /* This case deliberately writes something other than one envelope. */ }
if (typeof envelope?.sessionId === 'string') {
  const folder = path.join(process.env.DSH_HOME, 'sessions', '--work--', envelope.sessionId)
  fs.mkdirSync(folder, { recursive: true })
  fs.appendFileSync(path.join(folder, 'session.v3.jsonl'), [
    { type: 'turn/start' }, { type: 'step/start' }, { type: 'assistant/message', data: { message: { content: envelope.result } } },
    { type: 'step/end' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ].map(event => JSON.stringify(event) + '\n').join(''))
}
process.stdout.write(one.text, () => process.exit(one.code ?? 0))
`
}

/** The stand-in `node` of the envelope cases: the copied client is not run, and every other program is. */
function fakeNode(): string {
  const q = (word: string) => `'${word.replaceAll("'", "'\\''")}'`
  return `#!/bin/sh
# A STAND-IN FOR node, written by a test, for the envelope cases only. A copied DSH ACP client is not run: a stand-in
# client answers in its place. Every other program is run by the real node.
case "$1" in
  */inspector-dsh-acp.mjs) exec ${q(process.execPath)} ${q(join(fakes, 'client-stand-in.cjs'))} "$@" ;;
esac
exec ${q(process.execPath)} "$@"
`
}

// ---------------------------------------------------------------------------- the machine the office sees

function putState(now: unknown): void {
  writeFileSync(join(fakes, `state.json.${process.pid}`), JSON.stringify(now))
  renameSync(join(fakes, `state.json.${process.pid}`), join(fakes, 'state.json'))
}

function state(): { containers: Record<string, { Id: string; State: { Running: boolean } }>; calls: { tool: string; argv: string[] }[]; bugs: Record<string, boolean> } {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

function startsOf(dir: string): { hostPgid: number }[] {
  const logs = join(dir, 'logs')
  if (!existsSync(logs)) return []
  return readdirSync(logs).map((l) => join(logs, l, 'start.json')).filter((f) => existsSync(f)).map((f) => JSON.parse(readFileSync(f, 'utf8')))
}

/**
 * The probe the office reads the machine with: the real one, but the containers are the stand-in's, and it reads no
 * load and no free space.
 */
function theFakeMachine(real: ResourcesLib['LINUX_PROBE']): ResourcesLib['LINUX_PROBE'] {
  const probe = Object.create(real) as ResourcesLib['LINUX_PROBE']
  Object.assign(probe, {
    // A CHECK'S MODEL WAITS FOR A TEST-BATCHES SEAT, and the office holds a new seat back while the machine is busy.
    // A figure nobody could read holds nothing back, so a busy machine running this test keeps no check waiting.
    machineNow: () => ({ loadOneMinute: null, freeBytes: null }),
    rootFreeBytes: () => null,
    listeningPorts: () => [],
    containers: () => ({
      available: true,
      containers: Object.entries(state().containers).filter(([, c]) => c.State.Running)
        .map(([name, c]) => ({ id: c.Id, name, image: 'vsc-stand-in', status: 'Up 1 second' })),
    }),
    containerFirstProcess: () => ({ ok: true, pid: process.pid }),
    pidNamespaceOf: (pid: number) => ({ namespace: 'pid:[4026539999]', nspid: [pid] }),
    stopContainer: (name: string) => {
      const now = state()
      const c = now.containers[name]
      if (c === undefined) throw new Error(`no stand-in container ${name}`)
      c.State = { ...c.State, Running: false }
      putState(now)
      if ((c as any).nativeGroup) { try { process.kill(-(c as any).nativeGroup, 'SIGTERM') } catch {} }
      if (name.startsWith('mole-office-checkview-')) { delete now.containers[name]; putState(now); return }
      for (const start of startsOf(join(sandboxes, name.replace('mole-office-sandbox-', '')))) {
        try { process.kill(-start.hostPgid, 'SIGKILL') } catch { /* already gone */ }
      }
    },
  })
  return probe
}

// ---------------------------------------------------------------------------- helpers

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim()

async function ask(method: string, path: string, actor: { type: string; id: string }, body?: unknown, more: Record<string, string> = {}): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...more,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const AS_THE_PERSON = { type: 'human', id: THE_PERSON }
const AS_ARGUS = { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }
const AS_THE_INSPECTOR = { type: 'agent', id: THE_INSPECTOR }

let workers = 0
let inspectorId = ''
/** A worker of its own and a finished run of the work under check. */
async function aFinishedRun(title: string): Promise<string> {
  workers += 1
  const handle = `a-worker-${String(workers)}`
  const made = await ask('POST', '/api/agents/started', AS_ARGUS, { handle, name: handle, role: 'worker', workArea: ['work'] })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const run = await ask('POST', '/api/records', { type: 'agent', id: handle }, {
    kind: 'session', title,
    data: { state: 'finished', servingAgent: handle, workingDirectory: worker, doing: 'the work under check', cutFrom: 'main' },
  })
  expect(run.status, JSON.stringify(run.body)).toBe(201)
  return run.body.record.id as string
}

/** The check's own session, filed by hand, so the tool stores the usage receipt itself. */
async function aCheckSession(): Promise<string> {
  const made = await ask('POST', '/api/records', AS_THE_INSPECTOR, { kind: 'session', title: 'A check', data: { state: 'running', doing: 'checking a run' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

interface Ran { code: number | null; out: string; err: string }

/** The tool, as the office starts it, with no --model unless a case gives one: the door's model is used. */
function inspect(run: string, check: string, flags: string[] = [], { nodeStandIn = false } = {}): { done: Promise<Ran>; child: ChildProcess } {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    HOME: home,
    PATH: `${nodeStandIn ? `${join(fakes, 'node-bin')}:` : ''}${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`,
    FAKE_DOCKER_DIR: fakes,
  }
  for (const name of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'DSH_ACP_STAND_IN_SCENARIO', ...SECRET_NAMES]) delete env[name]
  // A TEST RUN INSIDE A SANDBOX carries the sandbox's own ledger row in SANDBOX_PROCESS_ROW, and a batch with no row
  // beside SANDBOX_DIR is refused before it starts. This test's office holds no row for a sandbox process, so the test
  // clears both names and the check asks for its seat by its own process group, as it does on a host.
  delete env['SANDBOX_PROCESS_ROW']
  delete env['SANDBOX_DIR']
  const child = spawn(process.execPath,
    [INSPECTOR, '--run', run, '--check', check, '--as', THE_INSPECTOR, '--api', api, '--workspace', WORKSPACE, '--checkout', worker,
      '--sandboxes', sandboxes, '--sandbox-from', from, ...flags],
    { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  if (child.pid !== undefined) groups.add(child.pid)
  const done = new Promise<Ran>((resolve) => {
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out += String(d)))
    child.stderr?.on('data', (d) => (err += String(d)))
    child.on('close', (code) => resolve({ code, out, err }))
  })
  return { done, child }
}

const folderOf = (run: string, check: string): string => `a-check-of-${run}-${check}`
const checkDirOf = (run: string, check: string): string => join(sandboxes, INSTANCE, 'checks', folderOf(run, check))

/** The real launcher's up, so the container is up before a case and the tool does not start and stop it each time. */
async function theSandboxIsUp(): Promise<void> {
  if (state().containers[CONTAINER]?.State.Running) return
  const root = theRepositoryOf(worker)
  if (root === null) throw new Error('The synthetic repository is missing.')
  const child = spawn(process.execPath, [join(REPO, 'tools', 'sandbox.mjs'), 'up', 'mole-office-dev', '--name', INSTANCE, '--json', '--from', from, '--ro', root,
    '--sandboxes', sandboxes, '--as', THE_INSPECTOR, '--session', await aCheckSession(), '--api', api, '--workspace', WORKSPACE], {
    cwd: REPO,
    env: { ...withoutInheritedEffort(), HOME: home, PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let said = ''
  child.stdout.on('data', (d) => { said += String(d) })
  child.stderr.on('data', (d) => { said += String(d) })
  const code = await new Promise<number | null>((done) => child.on('close', done))
  expect(code, said).toBe(0)
}

/**
 * How the stand-in dsh behaves in one check: its answers in order, and the transcript layout. `writesTheKey` puts the
 * made-up key it was handed where an answer says THE KEY HANDED, and in its transcript as the served model.
 */
function dshIsTold(run: string, check: string, told: { answers: string[]; turns?: string[]; transcript?: string; writesTheKey?: boolean; route?: { provider: string; model: string } }): void {
  writeFileSync(join(behaviour, `${folderOf(run, check)}.json`), JSON.stringify(told))
}

/** What the stand-in client prints in one check, invocation by invocation. */
function theClientIsTold(run: string, check: string, outputs: { text: string; code?: number }[]): void {
  writeFileSync(join(behaviour, `${folderOf(run, check)}.envelopes.json`), JSON.stringify({ outputs }))
}

/** Every start of the stand-in dsh in one check, in order. */
function dshStarts(run: string, check: string): any[] {
  const file = join(records, `dsh-${folderOf(run, check)}.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
}

/** Every frame the client sent B1's stand-in, in one start of it. */
function framesOf(start: { log: string }): any[] {
  return readFileSync(start.log, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
    .filter((entry) => entry.at === 'frame').map((entry) => entry.frame)
}

async function released(run: string): Promise<any> {
  return (await ask('GET', `/api/checks/${run}`, AS_ARGUS)).body.stands.released
}

/** The last usage line the tool printed, which must be a dsh check's. */
function theDshLineIn(out: string) {
  const native = inspectionUsageIn(out)
  if (native === null || native.runtime !== 'dsh') throw new Error(`The tool printed no dsh usage line:\n${out}`)
  return native
}

function neverPrintsTheKey(ran: Ran): void {
  expect(`${ran.out}${ran.err}`).not.toContain(KEY)
}

/** The tables of the test office with a row holding `text`, read whole from the database. */
function tablesHolding(text: string): string[] {
  const tables = t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
  return tables.map(({ name }) => name).filter((name) =>
    (t.client.sqlite.prepare(`SELECT * FROM "${name}"`).all() as unknown[]).some((row) => JSON.stringify(row).includes(text)))
}

/** Every file under `dir` whose bytes hold `text`, read whole. A link is not followed; a file that cannot be read fails the case. */
function filesHolding(dir: string, text: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  const walk = (at: string): void => {
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      const kind = lstatSync(path)
      if (kind.isDirectory()) walk(path)
      else if (kind.isFile() && readFileSync(path).includes(text)) found.push(path)
    }
  }
  walk(dir)
  return found
}

/** The office's own key file, beside this test's database, with one provider entry set or taken out. Its time is moved
 * on, so the office and the tool read it again. */
function theKeyFileEntry(entry: string, value: string | null): void {
  const file = settings().keysPath
  const held = JSON.parse(readFileSync(file, 'utf8')) as { providers: Record<string, string> }
  if (value === null) delete held.providers[entry]
  else held.providers[entry] = value
  writeFileSync(file, `${JSON.stringify(held, null, 2)}\n`, { mode: 0o600 })
  const later = new Date(Date.now() + 2_000 + Math.floor(Math.random() * 1_000))
  utimesSync(file, later, later)
}

/** What B1's stand-in says dsh was handed to reach its provider, in one start of it. */
function handedTo(start: { log: string }): { baseAddress: string | null; keySha256: string | null; keyLikeNames: string[] } {
  const [first] = readFileSync(start.log, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
    .filter((entry) => entry.at === 'start')
  if (first === undefined) throw new Error(`B1's stand-in logged no start in ${start.log}`)
  return first.handed
}

/** What the mask puts where the key the view was handed was (problem DNSRdZtWGTjS). */
const THE_KEY_MASKED = '<DEEPSEEK_API_KEY, masked>'

const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex')

const verdict = () => ({ verdict: 'released', traced: syntheticTrace(t, ['work/the-work.txt']), check: 'Synthetic dsh check. No model ran.', chaptersRead: [] })
const RELEASED = () => JSON.stringify(verdict())
const NO_VERDICT = 'Synthetic: no verdict reached.'

/** An envelope as the client writes it, for the stand-in client: the one line, with the fields a case changes. */
function anEnvelope(fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'dsh-acp-result', sessionId: SESSION, resumed: false, route: ROUTE, effortSet: 'high', effortReported: 'high',
    stopReason: 'end_turn', isError: false, error: null, result: RELEASED(), ...fields }) + '\n'
}

// ---------------------------------------------------------------------------- the world

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  // THE MODEL DOOR NAMES DSH HERE, from this hook and not from a Casting row (1S-Comh3Shf- point 5). The one
  // case that writes the inspector's row lets the office's own door answer.
  app.addHook('onRequest', async (req, reply) => {
    if (theRealModelDoor) return
    if (req.method === 'GET' && req.url.startsWith('/api/office/run-models/for/')) return reply.send(theDoor)
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE))

  scratch = mkdtempSync(join(tmpdir(), 'mole-office-inspector-dsh-'))
  home = join(scratch, 'home')
  sandboxes = join(scratch, 'sandboxes')
  records = join(scratch, 'records')
  behaviour = join(scratch, 'behaviour')
  fakes = join(scratch, 'fakes')
  for (const dir of [home, sandboxes, records, behaviour, join(fakes, 'bin'), join(fakes, 'node-bin')]) mkdirSync(dir, { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), FAKE_NPM, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'dsh'), fakeDsh(), { mode: 0o755 })
  writeFileSync(join(fakes, 'client-stand-in.cjs'), fakeClient(), { mode: 0o644 })
  writeFileSync(join(fakes, 'node-bin', 'node'), fakeNode(), { mode: 0o755 })
  putState({ containers: {}, calls: [], bugs: {} })

  // THE SECRETS FILE THE TEMPLATE NAMES, mode 600: one made-up key for dsh, and made-up keys of the other runtimes.
  mkdirSync(join(home, '.config', 'mole-office'), { recursive: true })
  writeFileSync(join(home, '.config', 'mole-office', 'sandbox-secrets.env'),
    `DEEPSEEK_API_KEY=${KEY}\nOPENAI_API_KEY=synthetic-other\nANTHROPIC_API_KEY=synthetic-other\nCLAUDE_CODE_OAUTH_TOKEN=synthetic-other\nOPENCODE_API_KEY=synthetic-other\n`, { mode: 0o600 })

  // THE CHECKOUT THE SANDBOX IS MADE FROM, holding this checkout's tools/ and part of src/, with a decoy client in place of B1's.
  from = join(scratch, 'from')
  mkdirSync(from)
  git(from, 'init', '-q', '-b', 'main')
  cpSync(join(REPO, 'tools'), join(from, 'tools'), { recursive: true, verbatimSymlinks: true })
  cpSync(join(REPO, 'for-agents'), join(from, 'for-agents'), { recursive: true, verbatimSymlinks: true })
  // ONLY src/config/ AND src/shared/ OF src/, which hold every file of src/ the helper imports. How the list was
  // found, on 17 November 2026, at the commit before this list: a run of this file and of
  // tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts recorded every file read under their scratch
  // folders (tools/record-what-tests-read.mjs). This file read no file of src/ there at all, and the other file read
  // the other folders of src/ only by walks of the whole tree, which compare each file with its commit. A grep of
  // tools/the-inspector.mjs, tools/inspector-*.mjs and tools/sandbox*.mjs found no read of a path under src/ that
  // goes on quietly when the file is not there. So a tool that comes to need another folder of src/ makes a case
  // fail, not pass.
  for (const folder of ['config', 'shared']) cpSync(join(REPO, 'src', folder), join(from, 'src', folder), { recursive: true, verbatimSymlinks: true })
  writeFileSync(join(from, 'tools', 'inspector-dsh-acp.mjs'), DECOY)
  writeFileSync(join(from, 'README.md'), 'the checkout the inspector dsh test makes its sandbox from\n')
  git(from, 'add', '-A')
  git(from, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(from, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(from, 'node_modules', 'fixture-dependency'))
  writeFileSync(join(from, 'node_modules', 'fixture-dependency', 'index.js'), 'module.exports = 42\n')
  mkdirSync(join(from, 'node_modules', '.bin'))
  symlinkSync('../fixture-dependency/index.js', join(from, 'node_modules', '.bin', 'fixture-dependency'))
  mkdirSync(join(from, 'data'))
  writeFileSync(join(from, 'data', 'keys.json'), '{}\n', { mode: 0o600 })

  // THE WORKER'S CHECKOUT: a branch with one change. Its base holds a decoy client, which is not in the change.
  worker = join(scratch, 'worker')
  mkdirSync(join(worker, 'work'), { recursive: true })
  mkdirSync(join(worker, 'tools'), { recursive: true })
  git(worker, 'init', '-q', '-b', 'main')
  writeFileSync(join(worker, 'work', 'the-work.txt'), 'Before.\n')
  writeFileSync(join(worker, 'tools', 'inspector-dsh-acp.mjs'), DECOY)
  writeFileSync(join(worker, 'package.json'), JSON.stringify({ name: 'the-work', private: true, scripts: { build: 'true' } }))
  writeFileSync(join(worker, '.gitignore'), 'node_modules\n')
  git(worker, 'add', '-A')
  git(worker, 'commit', '-q', '-m', 'Before the work')
  git(worker, 'checkout', '-q', '-b', 'the-work')
  writeFileSync(join(worker, 'work', 'the-work.txt'), 'Before.\nAnd what the worker built.\n')
  git(worker, 'commit', '-qam', 'The work under check')
  symlinkSync(join(from, 'node_modules'), join(worker, 'node_modules'))

  for (const [handle, role] of [[THE_TEST_OFFICES_SECRETARY.handle, 'secretary'], [THE_INSPECTOR, 'inspector']] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    if (handle === THE_INSPECTOR) inspectorId = made.body.agent.id
  }
}, 120_000)

afterAll(async () => {
  // ONLY THE GROUPS THIS FILE STARTED: the group of each tool a case started, and each group a start.json in the
  // instance's logs names. No list of every process on this machine is read for more (the owner, 26 October 2026).
  for (const start of startsOf(join(sandboxes, INSTANCE))) groups.add(start.hostPgid)
  for (const group of groups) {
    try {
      if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
      process.stderr.write(`stopping test group ${group}\n`)
      process.kill(-group, 'SIGKILL')
    } catch {
      // gone
    }
  }
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- the cases

const REFUSED_ENVELOPES = [
  ['another route', () => [{ text: anEnvelope({ route: { provider: 'deepseek-official', model: 'deepseek-pro' } }) }],
    'The dsh ACP client reports the route deepseek-official/deepseek-pro, but this check asked for deepseek-official/deepseek-flash.'],
  ['no route', () => [{ text: anEnvelope({ route: null }) }],
    'The dsh ACP client reports no route, but this check asked for deepseek-official/deepseek-flash.'],
  ['another effort', () => [{ text: anEnvelope({ effortSet: 'low' }) }],
    'The dsh ACP client reports the effort set as low, but this check asked for high.'],
  ['a resumed session on the first run', () => [{ text: anEnvelope({ resumed: true }) }],
    'The dsh ACP client reports a resumed session, but this check asked for a new one.'],
  ['two envelope lines', () => [{ text: anEnvelope() + anEnvelope() }],
    'The dsh ACP client wrote 2 lines on its output; it writes exactly one, its result envelope.'],
  ['a line that is not an envelope', () => [{ text: 'Synthetic: a line that is not an envelope.\n' }],
    "The dsh ACP client's output is not its result envelope."],
  ['no output', () => [{ text: '' }],
    'The dsh ACP client wrote nothing on its output, where it writes its result envelope.'],
  ['an error the client reported', () => [{ text: anEnvelope({ isError: true, error: 'Synthetic: the client reported this error.', result: '' }), code: 1 }],
    'dsh exited 1. Synthetic: the client reported this error.'],
] as [string, () => { text: string; code?: number }[], string][]

const UNREAD_TRANSCRIPTS = [
  ['sessions-link', '/check/home/.dsh/sessions is a link, and no link is followed'],
  ['transcript-link', `the transcript ${THE_TRANSCRIPT_SEEN} is a link, and no link is followed`],
  ['two-files', `the session folder /check/home/.dsh/sessions/--work--/${SESSION} holds 2 transcript files, so which is this session's cannot be said`],
  ['none', `no transcript of dsh session ${SESSION} was found, because /check/home/.dsh/sessions does not exist`],
  ['zstd-past-the-most', `the transcript ${THE_TRANSCRIPT_SEEN}.zstd could not be read as text: its text is longer than ${String(THE_MOST_OF_A_TRANSCRIPTS_TEXT)} bytes, the most a transcript is decoded to`],
]

const UNFINISHED_TURNS = [
  ['12a', 'stopped', 'turn/start with no turn/end: the turn was interrupted.'],
  ['12b', 'other-reason', 'The last turn/end has reason kind "made-up-other-kind".'],
  ['12c', 'no-reason', 'The last turn/end has no reason kind.'],
  ['12d', 'answer-after-end', 'An assistant/message comes after the last turn/end.'],
  ['12e', 'no-start', 'The transcript has no turn/start.'],
  ['12g', 'key-reason', `The last turn/end has reason kind "${THE_KEY_MASKED}".`],
  ['12h', 'bad-line', 'Line 6 of the transcript is not one JSON event.'],
]

describe('a dsh check in the inspector sandbox', () => {
  it('1 and 7. runs the inspector\'s own client at effort high, releases, and carries the transcript on its usage line', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check at effort high')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()] })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    neverPrintsTheKey(ran)
    expect((await released(run))?.by?.id).toBe(inspectorId)

    const folder = join(sandboxes, INSTANCE)
    const commands = join(checkDirOf(run, check), 'commands')
    const [start, ...more] = dshStarts(run, check)
    expect(more).toEqual([])
    // THE CLIENT IS RUN WITH THE ROUTE AND THE EFFORT, from the commands folder, in the check's own view.
    expect(start.client).toEqual(['node', join(commands, 'inspector-dsh-acp.mjs'), '--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', 'high'])
    expect(start.wrapper).toContain(`exec 'env' 'DSH_PERMISSION_MODE=danger-full-access' 'DSH_HOME=/check/home/.dsh' 'node' '/inputs/commands/inspector-dsh-acp.mjs' '--provider' 'deepseek-official' '--model' 'deepseek-flash' '--effort' 'high' < '/inputs/commands/prompt.txt'`)
    expect(DSH_CHECK_ENV).toEqual({ DSH_PERMISSION_MODE: 'danger-full-access', DSH_HOME: '/check/home/.dsh' })
    expect(start.dshHome).toBe(join(folder, 'check-views', check, 'home', '.dsh'))
    expect(start.permissionMode).toBe('danger-full-access')
    expect(start.cwd).toBe(join(folder, 'check-views', check, 'work'))
    expect(start.argv).toEqual(['--profile', 'acp', '--patch', expect.stringMatching(/acp-route\.json$/), '--patch', join(commands, THE_FEATURES_OFF_BESIDE_THE_CLIENT)])
    // THE PATCH LIST THAT TURNS DSH'S OWN SUBAGENTS AND WORKFLOWS OFF, beside the client, byte for byte, read-only.
    expect(start.patches[1]).toEqual({ file: join(commands, THE_FEATURES_OFF_BESIDE_THE_CLIENT), sha256: sha256(DSH_FEATURES_OFF[1]!), mode: '444' })
    // ONLY ITS OWN KEY, and no office variable.
    expect(start.secrets).toEqual(['DEEPSEEK_API_KEY'])
    expect(start.office).toEqual([])
    // THE INSPECTOR'S OWN CLIENT, byte for byte, read-only; neither checkout's decoy.
    expect(start.clientSha256).toBe(sha256(CLIENT))
    expect(start.clientSha256).not.toBe(createHash('sha256').update(DECOY).digest('hex'))
    expect(start.clientMode).toBe('444')
    expect(ran.out).toContain('The check is set to deepseek-v4.1-flash at effort high')

    // 7. THE USAGE LINE CARRIES THE TRANSCRIPT'S ANSWERS AND THE PATH THE CHECK SAW, AND THE RECEIPT COUNTS THEM.
    const native = theDshLineIn(ran.out)
    expect(native.transcript).toEqual({ text: ONE_ANSWER_CARRIED, from: THE_TRANSCRIPT_SEEN })
    const envelopes = native.output.split('\n').filter((line: string) => line !== '').map((line: string) => JSON.parse(line))
    expect(envelopes).toHaveLength(1)
    expect(envelopes[0]).toMatchObject({ type: 'dsh-acp-result', sessionId: SESSION, resumed: false, route: ROUTE, effortSet: 'high', isError: false })
    const receipt = inspectionUsageReceipt(native)
    expect(receipt).toMatchObject({ runtime: 'dsh', inputTokens: 100, cachedInputTokens: 20, cacheCreationInputTokens: 3, outputTokens: 7, reasoningTokens: 5 })
    expect(receipt.source).toContain(THE_TRANSCRIPT_SEEN)
    const stored = (await ask('GET', `/api/records/${check}`, AS_ARGUS)).body.record.data.usageReceipt
    expect(stored).toMatchObject({ runtime: 'dsh', inputTokens: 100, cachedInputTokens: 20, cacheCreationInputTokens: 3, outputTokens: 7, reasoningTokens: 5 })
    // THE MODEL ASKED FOR AND THE MODEL THE TRANSCRIPT NAMES ARE KEPT APART, each as it was, on the line and as stored.
    expect(native.modelRequested).toBe(ROUTE.model)
    expect(receipt).toMatchObject({ model: SOURCE.model, modelRequested: ROUTE.model })
    expect(stored).toMatchObject({ model: SOURCE.model, modelRequested: ROUTE.model })
  }, 120_000)

  // MUTATION: the tool leaves the selection unread and computes DSH with theDshSelection and the Office model; its client
  // is then started on the list's deepseek-official/deepseek-flash, and this case goes red.
  it('starts its own ACP client on a Casting row\'s native route and effort, not the compatibility list\'s DSH model', async () => {
    await theSandboxIsUp()
    const key = randomUUID()
    // The Office model is one the list names, and its native model is made up for this run: the check must follow the
    // row's native route, not the list's mapping of that Office model.
    const made = { model: 'deepseek-v4.1-flash', nativeModel: `dsh-native-${key}`, effort: 'high' }
    // THE INSPECTOR'S ROW IN FORCE, with native data, written through the real office; the door is read for place check.
    // The native provider must be one the check maps a key for; deepseek-official is also the only name in the
    // compatibility list's dshProviderNamespaces. That list names providers, not models, and nothing is added to it.
    const written = await ask('POST', '/api/casting/inspector', AS_THE_PERSON, { project: WORKSPACE,
      program: { value: 'dsh' }, model: { value: made.model }, effort: { value: made.effort },
      native: { model: made.nativeModel, provider: 'deepseek-official', variant: null } })
    expect(written.status, JSON.stringify(written.body)).toBe(201)
    const row = written.body.casting as { id: number; native?: Record<string, unknown> }
    expect(row.native, JSON.stringify(written.body)).toMatchObject({ model: made.nativeModel, provider: 'deepseek-official', variant: null })
    theRealModelDoor = true
    try {
      const answered = await ask('GET', '/api/office/run-models/for/inspector-one?place=check', AS_THE_INSPECTOR)
      expect(answered.status, JSON.stringify(answered.body)).toBe(200)
      expect(answered.body.selection, JSON.stringify(answered.body)).toMatchObject({ runtime: 'dsh', model: made.model,
        native: { model: made.nativeModel, provider: 'deepseek-official', variant: null, effort: made.effort }, casting: { id: row.id } })
      const run = await aFinishedRun('A synthetic dsh check on a selected native route')
      const check = await aCheckSession()
      dshIsTold(run, check, { answers: [RELEASED()], route: { provider: 'deepseek-official', model: made.nativeModel } })
      const ran = await inspect(run, check).done
      expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
      const [start, ...more] = dshStarts(run, check)
      expect(more).toEqual([])
      // THE INSPECTOR'S OWN CLIENT, started with the selection's native route and effort.
      expect(start.client).toEqual(['node', join(checkDirOf(run, check), 'commands', 'inspector-dsh-acp.mjs'),
        '--provider', 'deepseek-official', '--model', made.nativeModel, '--effort', made.effort])
      expect(start.client).not.toContain(LAUNCHER_MODEL_COMPATIBILITY.dsh.model)
      expect((await released(run))?.by?.id).toBe(inspectorId)
    } finally {
      theRealModelDoor = false
      const removed = await ask('DELETE', `/api/casting/rows/${String(row.id)}`, AS_THE_PERSON)
      expect(removed.status).toBe(200)
    }
  }, 120_000)

  it('7. carries the same answers from a transcript dsh wrote as several zstd frames, and names the .zstd path the check saw', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose transcript is zstd frames')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()], transcript: 'zstd' })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    expect((await released(run))?.by?.id).toBe(inspectorId)
    // THE FILE IS MORE THAN ONE FRAME: one call to zstd on the whole file gives the first frame, the prompt, and no answer.
    const first = zstdDecompressSync(readFileSync(join(records, `transcript-${folderOf(run, check)}-0.zstd`))).toString('utf8')
    expect(first).toContain('user/message')
    expect(first).not.toContain('assistant/message')

    const native = theDshLineIn(ran.out)
    expect(native.transcript).toEqual({ text: ONE_ANSWER_CARRIED, from: `${THE_TRANSCRIPT_SEEN}.zstd` })
    const receipt = inspectionUsageReceipt(native)
    expect(receipt).toMatchObject({ runtime: 'dsh', inputTokens: 100, cachedInputTokens: 20, cacheCreationInputTokens: 3, outputTokens: 7, reasoningTokens: 5 })
    expect(receipt.source).toContain(`${THE_TRANSCRIPT_SEEN}.zstd`)
    const stored = (await ask('GET', `/api/records/${check}`, AS_ARGUS)).body.record.data.usageReceipt
    expect(stored).toMatchObject({ runtime: 'dsh', inputTokens: 100, cachedInputTokens: 20, cacheCreationInputTokens: 3, outputTokens: 7, reasoningTokens: 5 })
  }, 120_000)

  it('2. passes no effort when the office names none, and says none is set', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: null })
    const run = await aFinishedRun('A synthetic dsh check with no effort')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()] })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    const [start] = dshStarts(run, check)
    expect(start.client.slice(2)).toEqual(['--provider', 'deepseek-official', '--model', 'deepseek-flash'])
    expect(ran.out).toContain('No effort is named, so none is set, and dsh uses its own setting.')
    expect(JSON.parse(theDshLineIn(ran.out).output)).toMatchObject({ effortSet: null, isError: false })
    expect((await released(run))?.by?.id).toBe(inspectorId)
  }, 120_000)

  it('3b. takes an effort the old list did not hold, and hands it to the client as typed', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'medium' })
    const run = await aFinishedRun('A synthetic dsh check with an effort the old list did not hold')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()] })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    const [start] = dshStarts(run, check)
    expect(start.client.slice(2)).toEqual(['--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', 'medium'])
    expect(JSON.parse(theDshLineIn(ran.out).output)).toMatchObject({ effortSet: 'medium' })
    expect((await released(run))?.by?.id).toBe(inspectorId)
  }, 120_000)

  it.each([
    ['a model with no mapping', { model: 'deepseek-v4-pro', effort: 'high' }, 'DSH has no explicit native mapping for the selected Office model; nothing was started.'],
  ])('3. ends with theDshSelection\'s words on %s, before any view, command or verdict', async (_name, door, words) => {
    await theSandboxIsUp()
    theDoorSays(door)
    const run = await aFinishedRun('A synthetic dsh check theDshSelection refuses')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()] })
    const calls = state().calls.length
    const ran = await inspect(run, check).done
    expect(ran.code).toBe(1)
    expect(withoutTheTimes(ran.err).trim()).toBe(words)
    expect(state().calls.slice(calls)).toEqual([])
    expect(existsSync(join(sandboxes, INSTANCE, 'check-views', check))).toBe(false)
    expect(existsSync(checkDirOf(run, check))).toBe(false)
    expect(dshStarts(run, check)).toEqual([])
    expect(await released(run)).toBeNull()
  }, 120_000)

  it('4. refuses --on-the-host for dsh, and starts nothing', async () => {
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check asked on the host')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()] })
    const calls = state().calls.length
    const ran = await inspect(run, check, ['--on-the-host']).done
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('DSH inspection requires the private per-check container view, so --on-the-host is refused.')
    expect(state().calls.slice(calls)).toEqual([])
    expect(dshStarts(run, check)).toEqual([])
    expect(await released(run)).toBeNull()
  }, 120_000)

  it.each(REFUSED_ENVELOPES.slice(0, 1))('5. refuses an envelope with %s: a failed run, its sentence, and no verdict', async (_name, outputs, sentence) => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check with a wrong envelope')
    const check = await aCheckSession()
    theClientIsTold(run, check, outputs())
    const ran = await inspect(run, check, [], { nodeStandIn: true }).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(1)
    expect(ran.err).toContain('The check did not finish, so no verdict was written:')
    expect(ran.err).toContain(sentence)
    expect(JSON.parse(readFileSync(join(records, `client-${folderOf(run, check)}.json`), 'utf8'))).toHaveLength(1)
    expect(await released(run)).toBeNull()
  }, 120_000)

  it('5. refuses a resumed answer that names another session, and the saved output keeps both answers', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose session changes')
    const check = await aCheckSession()
    theClientIsTold(run, check, [{ text: anEnvelope({ result: NO_VERDICT }) }, { text: anEnvelope({ sessionId: OTHER_SESSION, resumed: true }) }])
    const ran = await inspect(run, check, [], { nodeStandIn: true }).done
    expect(ran.code, `${ran.err}\n${ran.out}`).not.toBe(0)
    expect(`${ran.err}${ran.out}`).toContain('The dsh answer names another session, so it cannot continue this check. No verdict was written.')
    const calls = JSON.parse(readFileSync(join(records, `client-${folderOf(run, check)}.json`), 'utf8'))
    expect(calls).toHaveLength(2)
    expect(calls[1].argv.slice(-2)).toEqual(['--resume', SESSION])
    const saved = JSON.parse(readFileSync(join(checkDirOf(run, check), 'model-session.json'), 'utf8'))
    expect(saved.session).toBe(SESSION)
    expect(saved.output.split('\n').filter((line: string) => line !== '').map((line: string) => JSON.parse(line).sessionId)).toEqual([SESSION, OTHER_SESSION])
    expect(await released(run)).toBeNull()
  }, 120_000)

  it('6. resumes the session for the form correction, and the envelope says resumed', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose trace needs a correction')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [JSON.stringify({ ...verdict(), traced: 'Synthetic wrong trace shape' }), JSON.stringify({ traced: verdict().traced })] })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    expect(ran.out).toContain('Asking the model once to correct `traced`.')
    const starts = dshStarts(run, check)
    expect(starts).toHaveLength(2)
    expect(starts[0].client).not.toContain('--resume')
    expect(starts[1].client.slice(2)).toEqual(['--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', 'high', '--resume', SESSION])
    const methods = framesOf(starts[1]).map((frame) => frame.method)
    expect(methods).toContain('session/resume')
    expect(methods).not.toContain('session/new')
    expect(framesOf(starts[1]).find((frame) => frame.method === 'session/resume').params.sessionId).toBe(SESSION)
    const envelopes = theDshLineIn(ran.out).output.split('\n').filter((line: string) => line !== '').map((line: string) => JSON.parse(line))
    expect(envelopes.map((one: { resumed: boolean }) => one.resumed)).toEqual([false, true])
    expect((await released(run))?.by?.id).toBe(inspectorId)
  }, 120_000)

  it.each(UNREAD_TRANSCRIPTS.slice(0, 1))('8. gives no verdict or release when the transcript laid out as %s is not read, and the usage line keeps why', async (layout, why) => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose transcript is not read')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()], transcript: layout })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(1)
    expect(ran.err).toContain('No verdict was written.')
    expect(await released(run)).toBeNull()
    const native = theDshLineIn(ran.out)
    expect(native.transcript).toEqual({ text: null, why })
    const receipt = inspectionUsageReceipt(native)
    expect(receipt.says).toContain(why)
    expect(receipt).not.toHaveProperty('inputTokens')
    expect(receipt).not.toHaveProperty('model')
    expect(receipt.modelRequested).toBe(ROUTE.model)
    expect((await ask('GET', `/api/records/${check}`, AS_ARGUS)).body.record.data.usageReceipt).toEqual(receipt)
  }, 120_000)

  it.each(['nothing'])('9. on a second start, refuses a retained state whose %s was changed to name another session', async (changed) => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check asked twice')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [NO_VERDICT, NO_VERDICT, RELEASED()] })
    const first = await inspect(run, check).done
    expect(first.code, `${first.err}\n${first.out}`).toBe(42)
    expect(dshStarts(run, check)).toHaveLength(2)
    const stateFile = join(checkDirOf(run, check), 'model-session.json')
    const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
    expect(saved.session).toBe(SESSION)
    if (changed === 'session') saved.session = OTHER_SESSION
    if (changed === 'output') saved.output = saved.output.replaceAll(SESSION, OTHER_SESSION)
    writeFileSync(stateFile, JSON.stringify(saved))
    const second = await inspect(run, check).done
    if (changed === 'nothing') {
      // THE CONTROL: an untouched state resumes the one session and releases.
      expect(second.code, `${second.err}\n${second.out}`).toBe(0)
      const starts = dshStarts(run, check)
      expect(starts).toHaveLength(3)
      expect(starts[2].client.slice(-2)).toEqual(['--resume', SESSION])
      expect((await released(run))?.by?.id).toBe(inspectorId)
      return
    }
    expect(second.code).toBe(1)
    expect(second.err).toContain("The retained dsh output does not name this check's one consistent native session. No model was started and no verdict was written.")
    expect(dshStarts(run, check)).toHaveLength(2)
    expect(await released(run)).toBeNull()
  }, 120_000)

  it('11. masks the key dsh was handed, where its model wrote it in the verdict and the transcript, before any of it is printed or filed', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose model writes its key')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [JSON.stringify({ ...verdict(), check: 'Synthetic dsh check. The model wrote THE KEY HANDED.' })], writesTheKey: true })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
    expect(dshStarts(run, check)[0].secrets).toEqual(['DEEPSEEK_API_KEY'])
    neverPrintsTheKey(ran)
    expect(ran.out).toContain(`The model wrote ${THE_KEY_MASKED}.`)
    const carried = theDshLineIn(ran.out).transcript
    if (carried.text === null) throw new Error(`The line carries no transcript: ${carried.why}`)
    expect(JSON.parse(carried.text).data.message.source.model).toBe(THE_KEY_MASKED)
    expect((await released(run))?.by?.id).toBe(inspectorId)
    expect(tablesHolding(KEY)).toEqual([])
    expect(tablesHolding(`The model wrote ${THE_KEY_MASKED}.`)).not.toEqual([])
  }, 120_000)

  it('11. keeps no key in the model state of a check that gave no verdict', async () => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun('A synthetic dsh check whose model writes its key and no verdict')
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: ['Synthetic: no verdict. The model wrote THE KEY HANDED.'], writesTheKey: true })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(42)
    neverPrintsTheKey(ran)
    expect(ran.err).toContain(`The model wrote ${THE_KEY_MASKED}.`)
    const kept = readFileSync(join(checkDirOf(run, check), 'model-session.json'), 'utf8')
    expect(kept).not.toContain(KEY)
    expect(kept).toContain(THE_KEY_MASKED)
    expect(tablesHolding(KEY)).toEqual([])
  }, 120_000)

  it.each(UNFINISHED_TURNS.filter(([, turn]) => turn === 'stopped' || turn === 'key-reason'))('%s. gives no verdict for the made-up %s turn despite ACP end_turn and a released verdict', async (_id, turn, saw) => {
    await theSandboxIsUp()
    theDoorSays({ effort: 'high' })
    const run = await aFinishedRun(`A synthetic dsh check with a made-up ${turn} turn`)
    const check = await aCheckSession()
    dshIsTold(run, check, { answers: [RELEASED()], turns: [turn], writesTheKey: turn === 'key-reason' })
    const ran = await inspect(run, check).done
    expect(ran.code, `${ran.err}\n${ran.out}`).toBe(1)
    expect(await released(run)).toBeNull()
    expect(ran.err).toContain(saw)
    expect(ran.err).toContain('No verdict was written.')
    const native = theDshLineIn(ran.out)
    const envelope = JSON.parse(native.output)
    expect(envelope).toMatchObject({ stopReason: 'end_turn', isError: false })
    expect(JSON.parse(envelope.result).verdict).toBe('released')
    const receipt = inspectionUsageReceipt(native)
    const stored = (await ask('GET', `/api/records/${check}`, AS_ARGUS)).body.record.data.usageReceipt
    expect(stored).toEqual(receipt)
    expect(receipt).toMatchObject({ runtime: 'dsh', inputTokens: turn === 'answer-after-end' ? 200 : 100 })
    expect(ran.out).toContain(`The usage receipt is stored on this check's session ${check}.`)
    neverPrintsTheKey(ran)
    expect(tablesHolding(KEY)).toEqual([])
    if (turn === 'key-reason') {
      expect(stored.model).toBe(THE_KEY_MASKED)
      expect(tablesHolding(THE_KEY_MASKED)).not.toEqual([])
      expect(ran.out.split(`The dsh transcript ${THE_TRANSCRIPT_SEEN} held`).length - 1).toBe(1)
    }
  }, 120_000)

  // A CASTING ROW THAT NAMES A PROVIDER ROW. The provider, its address and its key are made up here: the address is only
  // handed to the stand-in dsh, which calls nothing, and the key is a random value in this office's own key file.
  // MUTATIONS: runInside handed no providerKey, so the stand-in gets the template's key; the use not recorded; the
  // template's secrets kept beside the provider key. Each turns this case red.
  it('12. takes its one key from the provider its Casting row names: refused while the entry is unset, then handed alone, recorded and never shown', async () => {
    await theSandboxIsUp()
    const PROVIDER = `test-deepseek-${randomBytes(3).toString('hex')}`
    const ENTRY = `${PROVIDER}-entry`
    const ADDRESS = 'https://test-provider.example/v1'
    const VALUE = `made-up-provider-value-${randomBytes(24).toString('hex')}`
    const names = theDshProviderVariables(ROUTE.provider)
    const withTheKey = thePersonsKeyHeader()
    const added = await ask('POST', '/api/casting/providers', AS_THE_PERSON,
      { id: PROVIDER, name: `The test's own ${PROVIDER}`, programs: ['dsh'], baseAddress: ADDRESS, keyName: ENTRY }, withTheKey)
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    const written = await ask('POST', '/api/casting/inspector', AS_THE_PERSON, { project: WORKSPACE,
      program: { value: 'dsh' }, model: { value: 'deepseek-v4.1-flash' }, effort: { value: 'high' },
      native: { model: ROUTE.model, provider: ROUTE.provider, variant: null, providerRow: PROVIDER } })
    expect(written.status, JSON.stringify(written.body)).toBe(201)
    const row = written.body.casting as { id: number }
    theRealModelDoor = true
    try {
      // 1. THE ENTRY IS NOT SET: the office refuses the check, the tool prints the office's own refusal, and nothing starts.
      const door = await ask('GET', '/api/office/run-models/for/inspector-one?place=check', AS_THE_INSPECTOR)
      expect(door.status, JSON.stringify(door.body)).toBe(409)
      expect(door.body).toMatchObject({ code: 'dshProviderKeyNotSet', values: { row: String(row.id), provider: PROVIDER, entry: ENTRY } })
      const unset = { run: await aFinishedRun('A synthetic dsh check whose provider key is not set'), check: await aCheckSession() }
      dshIsTold(unset.run, unset.check, { answers: [RELEASED()] })
      let calls = state().calls.length
      const refused = await inspect(unset.run, unset.check).done
      expect(refused.code, `${refused.err}\n${refused.out}`).toBe(1)
      expect(refused.err).toContain(door.body.error)
      expect(state().calls.slice(calls)).toEqual([])
      expect(existsSync(join(sandboxes, INSTANCE, 'check-views', unset.check))).toBe(false)
      expect(dshStarts(unset.run, unset.check)).toEqual([])
      expect(await released(unset.run)).toBeNull()
      expect((await ask('GET', `/api/records/${unset.check}`, AS_ARGUS)).body.record.data.extra?.[THE_PROVIDER_KEY_USES]).toBeUndefined()

      // 2. THE ENTRY IS SET: the check runs, and dsh is handed that key and the provider's address alone.
      theKeyFileEntry(ENTRY, VALUE)
      const run = await aFinishedRun('A synthetic dsh check on a provider row')
      const check = await aCheckSession()
      dshIsTold(run, check, { answers: [RELEASED()] })
      const ran = await inspect(run, check).done
      expect(ran.code, `${ran.err}\n${ran.out}`).toBe(0)
      expect((await released(run))?.by?.id).toBe(inspectorId)
      const [start, ...more] = dshStarts(run, check)
      expect(more).toEqual([])
      expect(start.secrets).toEqual([names.key])
      expect(start.office).toEqual([])
      const handed = handedTo(start)
      expect(handed.keySha256).toBe(createHash('sha256').update(VALUE).digest('hex'))
      expect(handed.baseAddress).toBe(ADDRESS)
      expect(handed.keyLikeNames).toEqual([names.key])
      // THE START'S WORDS NAME THE ADDRESS IT HANDED, so a wrong one shows in the check's output, and never the key.
      expect(ran.out).toContain(`${names.baseAddress}=${ADDRESS}`)
      // CONDITION C: the value is in no output, no table, and no file under the sandboxes, the stand-ins' records or the
      // stand-in docker's own state, which keeps every argument docker was given. The key file it was handed in is gone.
      expect(`${ran.out}${ran.err}`).not.toContain(VALUE)
      expect(tablesHolding(VALUE)).toEqual([])
      for (const dir of [sandboxes, records, fakes]) expect(filesHolding(dir, VALUE)).toEqual([])
      // CONDITION D: the use is recorded on the check's own session, without the value.
      const uses = (await ask('GET', `/api/records/${check}`, AS_ARGUS)).body.record.data.extra?.[THE_PROVIDER_KEY_USES]
      expect(uses).toEqual([{ check, castingRow: row.id, provider: PROVIDER, keyName: ENTRY, at: expect.any(String) }])
      expect(JSON.stringify(uses)).not.toContain(VALUE)

      // 3. THE MASK LEARNS THE PROVIDER'S KEY: a model that writes it in its verdict and its transcript is masked.
      const told = { run: await aFinishedRun('A synthetic dsh check on a provider row whose model writes its key'), check: await aCheckSession() }
      dshIsTold(told.run, told.check, { answers: [JSON.stringify({ ...verdict(), check: 'Synthetic dsh check. The model wrote THE KEY HANDED.' })], writesTheKey: true })
      const wrote = await inspect(told.run, told.check).done
      expect(wrote.code, `${wrote.err}\n${wrote.out}`).toBe(0)
      expect(`${wrote.out}${wrote.err}`).not.toContain(VALUE)
      expect(wrote.out).toContain(`The model wrote ${THE_KEY_MASKED}.`)
      const carried = theDshLineIn(wrote.out).transcript
      if (carried.text === null) throw new Error(`The line carries no transcript: ${carried.why}`)
      expect(JSON.parse(carried.text).data.message.source.model).toBe(THE_KEY_MASKED)
      expect(tablesHolding(VALUE)).toEqual([])

      // 4 AND 5. ANOTHER --model, AND --on-the-host, ARE REFUSED with nothing started: neither takes the row's key.
      for (const flags of [['--model', 'deepseek-v4-pro'], ['--on-the-host']]) {
        const other = { run: await aFinishedRun(`A synthetic dsh check on a provider row with ${flags.join(' ')}`), check: await aCheckSession() }
        dshIsTold(other.run, other.check, { answers: [RELEASED()] })
        calls = state().calls.length
        const no = await inspect(other.run, other.check, flags).done
        expect(no.code, `${no.err}\n${no.out}`).toBe(1)
        expect(no.err).toContain(flags.join(' '))
        expect(state().calls.slice(calls)).toEqual([])
        expect(dshStarts(other.run, other.check)).toEqual([])
        expect(await released(other.run)).toBeNull()
        expect((await ask('GET', `/api/records/${other.check}`, AS_ARGUS)).body.record.data.extra?.[THE_PROVIDER_KEY_USES]).toBeUndefined()
      }
    } finally {
      theRealModelDoor = false
      const removed = await ask('DELETE', `/api/casting/rows/${String(row.id)}`, AS_THE_PERSON)
      expect(removed.status).toBe(200)
      theKeyFileEntry(ENTRY, null)
    }
  }, 300_000)
})

// ---------------------------------------------------------------------------- 10. a DSH check takes an effort as typed

/** The route the inspector sends for a DSH check, with one effort word, as part A's test writes it. */
function nativeDshArgv(effort: string): string[] {
  return ['env', 'DSH_PERMISSION_MODE=danger-full-access', 'DSH_HOME=/check/home/.dsh',
    'node', '/inputs/commands/inspector-dsh-acp.mjs', '--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', effort]
}

/** Whether the real client gets past its effort check: B1's stand-in logs `start` only once the client starts dsh. */
async function theClientStartsDsh(effort: string): Promise<boolean> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-effort-lists-')))
  try {
    for (const folder of ['bin', 'work', 'tmp', 'home/.dsh']) mkdirSync(join(root, folder), { recursive: true })
    writeFileSync(join(root, 'bin', 'dsh'), `#!/bin/sh\nexec '${process.execPath}' '${STAND_IN}' "$@"\n`, { mode: 0o755 })
    const log = join(root, 'stand-in.log')
    writeFileSync(join(root, 'scenario.json'), JSON.stringify({ log, routeOnNew: [ROUTE.provider, ROUTE.model],
      prompt: { updates: [{ sessionUpdate: 'agent_message_chunk', messageId: 'm-1', content: { type: 'text', text: 'Synthetic.' } }], stopReason: 'end_turn' } }))
    const child = spawn(process.execPath, [CLIENT, '--provider', ROUTE.provider, '--model', ROUTE.model, '--effort', effort], {
      cwd: join(root, 'work'), detached: true, stdio: ['pipe', 'ignore', 'ignore'],
      env: { PATH: `${join(root, 'bin')}:${process.env['PATH'] ?? ''}`, HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'),
        DSH_HOME: join(root, 'home', '.dsh'), DSH_PERMISSION_MODE: 'danger-full-access', DSH_ACP_STAND_IN_SCENARIO: join(root, 'scenario.json') },
    })
    const group = child.pid
    child.stdin.on('error', () => {})
    child.stdin.end('A synthetic prompt.')
    const timer = setTimeout(() => { if (group !== undefined) try { process.kill(-group, 'SIGKILL') } catch { /* gone */ } }, 20_000)
    await new Promise((done) => child.on('close', done))
    clearTimeout(timer)
    const starts = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)).filter((entry) => entry.at === 'start') : []
    // THE STAND-IN'S OWN GROUP, as it recorded it, is stopped if the client left it running in this world.
    for (const start of starts) {
      try {
        if (typeof start.group === 'number' && start.group > 1 && readlinkSync(`/proc/${String(start.group)}/cwd`).startsWith(root)) process.kill(-start.group, 'SIGKILL')
      } catch { /* gone */ }
    }
    return starts.length > 0
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

/** Whether the check of the route the inspector sends for one effort word lets it through. */
async function theRouteTakesDsh(effort: string): Promise<boolean> {
  const view = inspectorViewStandIn()
  try {
    const ran = await runInside(view.sandbox, { label: 'dsh', runtime: 'dsh', cwd: view.work, argv: nativeDshArgv(effort), limitMs: 1000, launcher: view.launcher })
    return ran.code === 0
  } finally {
    view.close()
  }
}

describe('10. a DSH check takes an effort as typed, as the launcher does', () => {
  it.each(['off', 'low', 'medium', 'high', 'max', 'xhigh', 'a-made-up-effort'])('%j is taken by the selection, the route and the client', async (effort) => {
    expect(theDshSelection('deepseek-v4.1-flash', effort)).toMatchObject({ reasoningEffort: effort })
    expect(await theRouteTakesDsh(effort), 'the route').toBe(true)
    expect(await theClientStartsDsh(effort), 'the client').toBe(true)
  }, 60_000)

  it.each(['', '-x'])('%j is no word, and the selection, the route and the client all refuse it', async (effort) => {
    expect(() => theDshSelection('deepseek-v4.1-flash', effort)).toThrow()
    expect(await theRouteTakesDsh(effort), 'the route').toBe(false)
    expect(await theClientStartsDsh(effort), 'the client').toBe(false)
  }, 60_000)
})

/** Read the real declaration without executing the inspector's top-level command. */
function inspectorReader(name: string, globals: Record<string, unknown>): any {
  const source = readFileSync(INSPECTOR, 'utf8')
  const declaration = new RegExp(`(?:async )?function ${name}\\(`).exec(source)
  if (declaration === null) throw new Error(`The inspector reader ${name} was not found`)
  const end = source.indexOf('\n}\n', declaration.index)
  if (end < 0) throw new Error(`The inspector reader ${name} has no closing declaration`)
  return runInNewContext(`(${source.slice(declaration.index, end + 2)})`, globals, { filename: INSPECTOR })
}

const unexpectedReaderCall = () => { throw new Error('This reader must not start a model or print anything') }
const dshEnvelopeReader = () => inspectorReader('aDshEnvelope', {})
const dshAnswerReader = () => inspectorReader('theDshAnswer', {
  DSH: { ...ROUTE, reasoningEffort: 'high' }, aDshEnvelope: dshEnvelopeReader(),
})

/** Synthetic transcript events, with the same incomplete turn shapes the sandbox stand-in writes. */
function turnText(shape: string): string {
  const start = { type: 'turn/start' }, assistant = { type: 'assistant/message' }
  const step = [{ type: 'step/start' }, assistant, { type: 'step/end' }]
  const end = { type: 'turn/end', data: { reason: { kind: 'completed' } } }
  const shapes: Record<string, unknown[]> = {
    completed: [start, ...step, end],
    'other-reason': [start, ...step, end, { type: 'turn/end', data: { reason: { kind: 'made-up-other-kind' } } }],
    'no-reason': [start, ...step, { type: 'turn/end', data: {} }],
    'answer-after-end': [start, ...step, end, assistant],
    'no-start': [{ type: 'user/message' }, assistant],
    'bad-line': [start, ...step, end],
    'tools-interrupted': [start, { type: 'step/start' }, { type: 'tool/call' }, { type: 'tool/result' }, { type: 'step/end' }],
  }
  return shapes[shape]!.map(event => JSON.stringify(event)).join('\n') + '\n' + (shape === 'bad-line' ? 'Synthetic non-JSON line.\n' : '')
}

describe('the dsh output readers', () => {
  it.each(REFUSED_ENVELOPES.slice(1))('refuses %s directly with the reason from the envelope reader', (_name, outputs, sentence) => {
    const text = outputs()[0]!.text
    const answer = dshAnswerReader()(text, false)
    expect(answer.nativeOutput).toBe(text)
    expect(answer.envelope.is_error).toBe(true)
    expect(answer.envelope.error).toContain(sentence.replace(/^dsh exited 1\. /, ''))
  })

  it.each(UNREAD_TRANSCRIPTS.slice(1))('refuses the %s transcript layout directly and keeps its reason', (layout, why) => {
    const view = inspectorViewStandIn({ secrets: { DEEPSEEK_API_KEY: KEY } })
    try {
      const dshHome = join(view.sandbox.home, '.dsh')
      const sessions = join(dshHome, 'sessions')
      const folder = join(sessions, projectKey('/work'), SESSION)
      mkdirSync(dshHome, { recursive: true })
      if (layout !== 'none') {
        mkdirSync(folder, { recursive: true })
        const file = join(folder, 'session.v3.jsonl')
        if (layout === 'transcript-link') {
          const elsewhere = join(view.root, 'elsewhere.jsonl')
          writeFileSync(elsewhere, turnText('completed'))
          symlinkSync(elsewhere, file)
        } else if (layout === 'two-files') {
          writeFileSync(file, turnText('completed'))
          writeFileSync(join(folder, 'session.v2.jsonl'), turnText('completed'))
        } else if (layout === 'zstd-past-the-most') {
          writeFileSync(file + '.zstd', zstdCompressSync(Buffer.alloc(THE_MOST_OF_A_TRANSCRIPTS_TEXT + 1, 0x20)))
        } else throw new Error(`Unknown synthetic transcript layout ${layout}`)
      }
      const read = inspectorReader('theDshChecksTranscript', {
        SANDBOX: view.sandbox, THE_MODEL_SESSION: SESSION, DSH: { provider: ROUTE.provider },
        join, dirname, relative, lstatSync, realpathSync, readdirSync, projectKey, theTranscriptOfTheSession,
        theFileThatWasChecked, theTextOfTheTranscript, maskedOfWhatTheViewIsHanded, theSecretNamesOf,
        theMaskSays: unexpectedReaderCall,
      })
      const transcript = read()
      expect(transcript).toEqual({ text: null, why })
      const receipt = inspectionUsageReceipt({ runtime: 'dsh', output: anEnvelope(), transcript, modelRequested: ROUTE.model })
      expect(receipt.says).toContain(why)
      expect(receipt).not.toHaveProperty('inputTokens')
      expect(receipt).not.toHaveProperty('model')
      expect(receipt.modelRequested).toBe(ROUTE.model)
    } finally {
      view.close()
    }
  })

  it.each(['session', 'output'])('refuses retained %s from another session directly', changed => {
    const saved = { runtime: 'dsh', model: 'deepseek-v4.1-flash', run: 'synthetic-run', check: 'synthetic-check',
      seal: null, sealHash: null, privateWork: '/synthetic/work', home: '/synthetic/home', session: SESSION, output: anEnvelope() }
    if (changed === 'session') saved.session = OTHER_SESSION
    if (changed === 'output') saved.output = saved.output.replaceAll(SESSION, OTHER_SESSION)
    const oneSession = inspectorReader('theDshOutputIsOneSession', { aDshEnvelope: dshEnvelopeReader() })
    const read = inspectorReader('theRetainedModelState', {
      readFileSync: () => JSON.stringify(saved), theModelStateFile: () => '/synthetic/state',
      RUNTIME: 'dsh', MODEL: saved.model, chosen: { run: saved.run }, CHECK_ID: saved.check, reads: {},
      SANDBOX: { home: saved.home }, whereTheCheckIsCut: () => saved.privateWork,
      theModelsAnswer: unexpectedReaderCall, theDshOutputIsOneSession: oneSession,
    })
    expect(read).toThrow("The retained dsh output does not name this check's one consistent native session. No model was started and no verdict was written.")
  })

  it.each(UNFINISHED_TURNS.filter(([, turn]) => turn !== 'stopped' && turn !== 'key-reason'))('judges %s %s directly', (_id, turn, saw) => {
    const read = inspectorReader('theLastDshTurnIn', {})
    expect(read(turnText(turn))).toEqual({ finished: false, saw })
  })

  it.each(['12f', '12i', '12j'])('%s reads the resumed tool-only turn instead of the earlier completion', () => {
    const read = inspectorReader('theLastDshTurnIn', {})
    expect(read(turnText('completed'))).toEqual({ finished: true })
    expect(read(turnText('completed') + turnText('tools-interrupted'))).toEqual({
      finished: false, saw: 'turn/start with no turn/end: the turn was interrupted.',
    })
  })
})

it('masks the model key in the transcript reader before returning any text', () => {
  const view = inspectorViewStandIn({ secrets: { DEEPSEEK_API_KEY: KEY } })
  try {
    const folder = join(view.sandbox.home, '.dsh', 'sessions', projectKey('/work'), SESSION)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'session.v3.jsonl'), JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: KEY } } } }) + '\n')
    const read = inspectorReader('theDshChecksTranscript', {
      SANDBOX: view.sandbox, THE_MODEL_SESSION: SESSION, DSH: { provider: ROUTE.provider },
      join, dirname, relative, lstatSync, realpathSync, readdirSync, projectKey, theTranscriptOfTheSession,
      theFileThatWasChecked, theTextOfTheTranscript, maskedOfWhatTheViewIsHanded, theSecretNamesOf,
      theMaskSays: unexpectedReaderCall,
    })
    const transcript = read({ sayMask: false })
    expect(transcript.text).not.toContain(KEY)
    expect(JSON.parse(transcript.text).data.message.source.model).toBe(THE_KEY_MASKED)
    expect(transcript.from).toBe(THE_TRANSCRIPT_SEEN)
  } finally {
    view.close()
  }
})
