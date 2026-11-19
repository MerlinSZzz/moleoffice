// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR DSH'S ACP DRIVER (`dsh --profile acp`), for tests/the-inspector-dsh-acp-client.test.ts.
 *
 * It speaks the same line protocol as dsh 0.1.5-rc.2: JSON-RPC 2.0, one JSON object per line, on stdin
 * and stdout, and the end of stdin means shut down. Its answers copy the shapes dsh's driver gives
 * (/opt/dsh/node_modules/@deepseek-ai/dsh-acp/lib/index.js): the `model` option's currentValue is
 * `JSON.stringify([provider, model])`, the effort's option has id `reasoning_effort`, a refused value is
 * error -32602 "Invalid params: …", and a failed turn is error -32603 "Internal error: turn failed: …".
 *
 * A test puts it on PATH as an executable named `dsh`, a small sh file that does `exec node <this file> "$@"`.
 * It starts no model and holds no key: it reads only the scenario file and the patch file it is given, and
 * of its environment it logs only what `theProviderItWasHanded` says, which holds no key's value.
 *
 * THE SCENARIO is the JSON file named by DSH_ACP_STAND_IN_SCENARIO. Every field but `log` may be left out.
 *   log               the file every line of the log is appended to, one JSON object per line
 *   sessionId         the id session/new answers
 *   routeOnNew        [provider, model] reported on session/new, or null for no `model` option
 *   routeOnResume     the same, on session/resume
 *   effort            the reasoning_effort currentValue reported before any set, or null for no such option
 *   refuseEffort      words: session/set_config_option is refused with -32602 "Invalid params: <words>"
 *   effortBack        the effort reported back after a set, in place of the one that was asked for
 *   prompt            { updates: [...], stopReason } or { error: "turn failed: …" }; an update with
 *                     `forSession` is sent for that session id instead of this one
 *   askPermission     true: during the prompt, ask session/request_permission, then wait for session/cancel
 *                     and end the turn with `cancelled`, as dsh does
 *   otherRequest      a method name: during the prompt, send the client that request and wait for its answer
 *   exitBefore        a method name: exit with `exitCode` (3 by default) when it arrives, before answering
 *   ignoreEndOfStdin  true: keep running after stdin ends, until a signal stops it
 *   ignoreSigterm     true: log a SIGTERM and keep running, so that only SIGKILL ends it
 *   startAChild       true: start one child in this process's own group; the child logs its pid and group, and
 *                     at the end of its input the stand-in exits only when the child has logged
 *   childIgnoresSigterm  true: the child, too, logs a SIGTERM and keeps running
 *
 * THE LOG. `start` (argv, cwd, pid, process group, the patch file's path, content and mode, and `handed`, what
 * theProviderItWasHanded says), `frame` (every frame the client sent, in order), `answer` (the client's answer to a
 * request this stand-in sent), `child`, `stdin-end`, `signal` and `exit`.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, readFileSync, statSync } from 'node:fs'

const scenario = JSON.parse(readFileSync(process.env.DSH_ACP_STAND_IN_SCENARIO ?? '', 'utf8'))
const log = (entry) => appendFileSync(scenario.log, JSON.stringify(entry) + '\n')

/** This process's group, read from /proc, so a test can tell it was started as its own group's leader. */
function groupOf(pid) {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
  return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
}

const argv = process.argv.slice(2)
const patchPath = argv[argv.indexOf('--patch') + 1]
let patch = null
if (argv.includes('--patch') && patchPath !== undefined) {
  patch = { path: patchPath, content: readFileSync(patchPath, 'utf8'), mode: statSync(patchPath).mode & 0o777 }
}
/**
 * WHAT DSH WAS HANDED TO REACH ITS PROVIDER, without a key's value: the base address DEEPSEEK_BASE_URL names, a sha256 of
 * the key in DEEPSEEK_API_KEY, so a test can compare it with the key it wrote and never print it, and the names of every
 * variable whose name says key, token, secret or password, as dsh's own scrub reads a name. Null where a variable is unset.
 */
function theProviderItWasHanded() {
  const key = process.env.DEEPSEEK_API_KEY
  return {
    baseAddress: process.env.DEEPSEEK_BASE_URL ?? null,
    keySha256: key === undefined ? null : createHash('sha256').update(key).digest('hex'),
    keyLikeNames: Object.keys(process.env).filter((name) => /KEY|TOKEN|SECRET|PASSWORD/i.test(name)).sort(),
  }
}

log({ at: 'start', argv, cwd: process.cwd(), pid: process.pid, group: groupOf(process.pid), patch, handed: theProviderItWasHanded() })
process.stderr.write('a-dsh-acp-stand-in: started\n')

process.on('SIGTERM', () => {
  log({ at: 'signal', signal: 'SIGTERM' })
  if (scenario.ignoreSigterm !== true) process.exit(143)
})

if (scenario.startAChild === true) {
  const child = `
const fs = require('node:fs')
const stat = fs.readFileSync('/proc/self/stat', 'utf8')
const group = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
const log = (entry) => fs.appendFileSync(${JSON.stringify(scenario.log)}, JSON.stringify(entry) + '\\n')
log({ at: 'child', pid: process.pid, group })
process.on('SIGTERM', () => { log({ at: 'child-signal', signal: 'SIGTERM' }); ${scenario.childIgnoresSigterm === true ? '' : 'process.exit(143)'} })
setInterval(() => {}, 1000)
`
  spawn(process.execPath, ['-e', child], { stdio: 'ignore' })
}

const SESSION = scenario.sessionId ?? '9b2c4e1a-7d3f-4a5b-8c6d-0e1f2a3b4c5d'
const has = (name) => Object.hasOwn(scenario, name)
let session = null
let route = null
let effort = has('effort') ? scenario.effort : 'high'

function configOptions() {
  const options = []
  if (route !== null) {
    const value = JSON.stringify(route)
    options.push({ id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: value, options: [{ group: route[0], name: route[0], options: [{ value, name: route[1] }] }] })
  }
  if (effort !== null) {
    options.push({ id: 'reasoning_effort', name: 'Reasoning effort', category: 'thought_level', type: 'select', currentValue: effort,
      options: ['off', 'low', 'high', 'max'].map((one) => ({ value: one, name: one })) })
  }
  return options
}

const send = (frame) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...frame }) + '\n')
const answer = (id, result) => send({ id, result })
const refuse = (id, code, message) => send({ id, error: { code, message } })

let nextId = 1
const waitingForTheClient = new Map()
/** Send the client a request and wait for its answer, which is logged. */
function ask(method, params) {
  const id = nextId++
  send({ id, method, params })
  return new Promise((done) => waitingForTheClient.set(id, (frame) => { log({ at: 'answer', method, frame }); done(frame) }))
}

let cancelled = null
const cancelArrived = new Promise((done) => { cancelled = done })

async function prompt(id) {
  if (has('otherRequest')) await ask(scenario.otherRequest, { sessionId: session, path: `${process.cwd()}/a-file-the-stand-in-asks-for` })
  if (scenario.askPermission === true) {
    await ask('session/request_permission', {
      sessionId: session,
      toolCall: { toolCallId: 'a-stand-in-call' },
      options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' }],
    })
    await cancelArrived
    answer(id, { stopReason: 'cancelled' })
    return
  }
  const turn = scenario.prompt ?? { updates: [], stopReason: 'end_turn' }
  for (const update of turn.updates ?? []) {
    const { forSession, ...rest } = update
    send({ method: 'session/update', params: { sessionId: forSession ?? session, update: rest } })
  }
  if (turn.error !== undefined) refuse(id, -32603, `Internal error: ${turn.error}`)
  else answer(id, { stopReason: turn.stopReason })
}

function onRequest(frame) {
  const { id, method, params } = frame
  if (scenario.exitBefore === method) {
    log({ at: 'exit', code: scenario.exitCode ?? 3, before: method })
    process.exit(scenario.exitCode ?? 3)
  }
  if (method === 'initialize') {
    answer(id, { protocolVersion: 1, agentInfo: { name: 'a-dsh-acp-stand-in', version: '0.0.0' },
      agentCapabilities: { sessionCapabilities: { close: {}, list: {}, resume: {} } }, authMethods: [] })
  } else if (method === 'session/new') {
    session = SESSION
    route = has('routeOnNew') ? scenario.routeOnNew : null
    answer(id, { sessionId: session, configOptions: configOptions() })
  } else if (method === 'session/resume') {
    session = params.sessionId
    route = has('routeOnResume') ? scenario.routeOnResume : null
    answer(id, { configOptions: configOptions() })
  } else if (method === 'session/set_config_option') {
    if (has('refuseEffort')) refuse(id, -32602, `Invalid params: ${scenario.refuseEffort}`)
    else {
      effort = has('effortBack') ? scenario.effortBack : params.value
      answer(id, { configOptions: configOptions() })
    }
  } else if (method === 'session/prompt') {
    void prompt(id)
  } else if (method === 'session/close') {
    answer(id, {})
  } else {
    refuse(id, -32601, `"Method not found": ${method}`)
  }
}

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let at
  while ((at = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, at)
    buffer = buffer.slice(at + 1)
    if (line.trim() === '') continue
    const frame = JSON.parse(line)
    log({ at: 'frame', frame })
    if (frame.method === undefined) {
      waitingForTheClient.get(frame.id)?.(frame)
      waitingForTheClient.delete(frame.id)
    } else if (frame.id === undefined) {
      if (frame.method === 'session/cancel') cancelled()
    } else onRequest(frame)
  }
})
/** Whether the child this stand-in started has written its line in the log. */
const theChildHasLogged = () =>
  readFileSync(scenario.log, 'utf8').split('\n').some((line) => line !== '' && JSON.parse(line).at === 'child')

process.stdin.on('end', () => {
  log({ at: 'stdin-end' })
  if (scenario.ignoreEndOfStdin === true) setInterval(() => {}, 1000)
  else {
    const exit = () => {
      log({ at: 'exit', code: 0 })
      process.exit(0)
    }
    // The child is in the log before the stand-in exits by itself, so a case can find the child it left.
    if (scenario.startAChild !== true || theChildHasLogged()) exit()
    else {
      const waiting = setInterval(() => {
        if (!theChildHasLogged()) return
        clearInterval(waiting)
        exit()
      }, 20)
    }
  }
})
