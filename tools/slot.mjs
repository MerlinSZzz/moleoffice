#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASK THE OFFICE FOR ONE OF THIS MACHINE'S SHARED TEST SEATS, AND GIVE IT BACK.
 *
 * The office keeps three pools (lib/slots.ts): `full-suite`, one whole test suite at a time,
 * `browser-tests`, a few browser test files at a time, and `test-batches`, a few batches of named test
 * files at a time (tools/run-named-tests.mjs asks for its own). A seat is held by a PROCESS GROUP and ends when
 * that group ends, so a run that dies gives its seat back without anybody tidying up. This replaces
 * `~/.cache/mole-office/suite.lock`, `test-slots/slot-N` and `run-suite.sh`, which were directories
 * agents took by hand and which were lost in September 2026.
 *
 * THE COMMANDS
 *
 *   node tools/slot.mjs run <pool> [options] -- <command...>
 *       The safe way. Starts <command> as the leader of its own process group, holds it at the door,
 *       asks for a seat for that group, waits in line, lets the command run once the seat is granted,
 *       gives the seat back when it ends, and exits with the command's own exit code. The command's
 *       standard input is closed. Ctrl-C stops the command's whole group.
 *
 *   node tools/slot.mjs acquire <pool> [--wait] [--pid <pid> | --resource <process row id>] [options]
 *       For a script that holds the seat itself. The holder is the process group of --pid, which
 *       defaults to the process that ran this tool (your script). A script that is not the leader of
 *       its own group ties the seat to whatever group it is in, which may be your whole agent
 *       session, and the seat is then held until it is released or that group ends; the answer
 *       names the group, and `run` never has this problem. Prints the slot id alone on
 *       stdout, so `SLOT=$(node tools/slot.mjs acquire full-suite --wait)` works. Exit 0 granted;
 *       without --wait, exit 3 when queued (the place in line is kept while the group runs).
 *       Inside a sandbox's container, name the holder with --resource: a pid there is numbered in the
 *       container and means another process on this machine, which the office refuses.
 *
 *   node tools/slot.mjs release <slot id> [--force] [--note "..."]
 *       Give the seat back, or leave the line. The next in line is seated.
 *
 *   node tools/slot.mjs list [--json]
 *       Every pool, who holds each seat and who is waiting. Changes nothing.
 *
 * OPTIONS FOR EVERY WRITE
 *   --session <id>     the session record asking. Default: MOLE_OFFICE_SESSION from the environment.
 *   --as <handle>      the agent asking. Default: MOLE_OFFICE_AGENT. This tool never writes in the
 *                      person's name, so with neither it refuses.
 *   --workspace <w>    the project. Default: the one this checkout is set to.
 *   --api <url>        which office. Default: the one this checkout is set to.
 *   --detail "..."     what the seat is for, in a few words (acquire and run; run defaults to the
 *                      command itself).
 *   --every <s>        how often a waiter asks again, in seconds. Default 10, or a test's
 *                      SLOT_ASK_EVERY_S_FOR_A_TEST (theDefaultAskInterval, below).
 *   --for <s>          the longest a waiter waits before it leaves the line and exits 4. Default: no
 *                      limit, because a suite queue is measured in tens of minutes.
 *
 * WAITING SURVIVES A RESTART OF THE OFFICE. An office restarts when it is upgraded or started
 * again, and an office run from the main checkout also restarts at every landing. A waiter that
 * finds nobody answering says so and asks again at the next interval, and its place is in the
 * ledger, not in the server's memory.
 */

import { spawn } from 'node:child_process'
import { constants } from 'node:os'
import { settings, settingValue, transientToolContext } from '../src/config/settings.mjs'
import { startTimeOf } from '../src/config/session-process.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { officeHeaders } from './sandbox-common.mjs'

/** How long one request may take. A slot request is small; a server this slow is not answering. */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * How often a waiter asks again when no --every is given: 10 s. A SHORTER INTERVAL, FOR A TEST ONLY:
 * SLOT_ASK_EVERY_S_FOR_A_TEST in this process's own environment, in seconds, never below 1 s. tools/sandbox-start.mjs
 * asks for its seat without --every, and tools/sandbox.mjs passes the variable into the container only when its own
 * environment has it; a test of the launcher sets it (tests/sandbox-launcher.test.ts), and nothing else does. Unset, or
 * not a number above 0, the interval is 10 s.
 */
function theDefaultAskInterval() {
  const asked = Number(process.env['SLOT_ASK_EVERY_S_FOR_A_TEST'])
  return Number.isFinite(asked) && asked > 0 ? Math.max(asked, 1) : 10
}

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/slot.mjs run <pool> [--detail "..."] [--every <s>] [--for <s>] -- <command...>',
      'node tools/slot.mjs acquire <pool> [--wait] [--pid <pid> | --resource <row id>] [--detail "..."]',
      'node tools/slot.mjs release <slot id> [--force] [--note "..."]',
      'node tools/slot.mjs list [--json]',
      '',
      'Every write also takes --session <id> (default MOLE_OFFICE_SESSION), --as <handle> (default',
      'MOLE_OFFICE_AGENT), --workspace <w> and --api <url>. The pools are full-suite, browser-tests and',
      'test-batches; node tools/slot.mjs list shows them. The header of this file says what each command',
      'does.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function refused(problem, code = 2) {
  process.stderr.write(`${problem}\n`)
  process.exit(code)
}

/** One line of what happened, on stderr, so stdout carries nothing but the id a script captures. */
function say(line) {
  process.stderr.write(`slot: ${line}\n`)
}

function readArguments(argv) {
  const chosen = { verb: argv[0] ?? null, target: null, wait: false, json: false, force: false, command: [] }
  const flags = ['pid', 'resource', 'session', 'as', 'workspace', 'api', 'detail', 'every', 'for', 'note']
  for (let i = 1; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--') {
      chosen.command = argv.slice(i + 1)
      break
    }
    if (word === '--help' || word === '-h') usage('')
    else if (word === '--wait') chosen.wait = true
    else if (word === '--json') chosen.json = true
    else if (word === '--force') chosen.force = true
    else if (word.startsWith('--') && flags.includes(word.slice(2))) {
      const value = argv[(i += 1)]
      if (value === undefined || value === '') usage(`${word} takes a value.`)
      chosen[word.slice(2)] = value
    } else if (word.startsWith('--')) usage(`I do not know the option ${word}.`)
    else if (chosen.target === null) chosen.target = word
    else usage(`I do not know what "${word}" is for. A command to run goes after --.`)
  }
  return chosen
}

function seconds(value, what, fallback) {
  if (value === undefined) return fallback
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) usage(`${what} must be a number of seconds above 0, and it was "${value}".`)
  return n
}

const chosen = readArguments(process.argv.slice(2))
if (chosen.verb === null || chosen.verb === '--help' || chosen.verb === '-h') usage('Say what to do: run, acquire, release or list.')
const config = settings()
const api = whereIsTheApi(chosen.api)
const workspace = chosen.workspace ?? config.workspace

/**
 * The headers of a write: which project, who, which session, and the asker's key when it holds one. Refuses when it cannot
 * say who. Built by officeHeaders, the tools' one builder of an agent's headers, which sends MOLE_AGENT_KEY as the key.
 * This tool used to build its own and sent no key, so every seat was taken on the agent's name alone. The office still
 * takes an agent's name with no key as that agent: the key window covers only a claim to be the person (acceptance
 * finding 79), and P83's agent half will refuse a name alone, so every tool sends its key first, in
 * recover/work/keywindow, as the owner's go for the key window on 25 September 2026
 * says.
 */
function writeHeaders() {
  const session = chosen.session ?? transientToolContext().session ?? null
  const handle = chosen.as ?? settingValue('MOLE_OFFICE_AGENT')
  if (session === null || session.trim() === '') {
    refused(
      'Say which session is asking: --session <session record id>, or run where MOLE_OFFICE_SESSION is set. A slot ' +
        'row belongs to the session that asked, so without one there is nothing to write. Nothing was written.',
    )
  }
  if (handle === null || handle.trim() === '') {
    refused(
      'Say who is asking: --as <your agent handle>, or run where MOLE_OFFICE_AGENT is set. This tool never writes in ' +
        "the person's name. Nothing was written.",
    )
  }
  return officeHeaders({ workspace, agent: handle, session })
}

/**
 * One request. Answers {status, body} or {status: null, why} when nothing answered at all, so a
 * waiter can tell "the office refused" from "the office is restarting".
 */
async function ask(path, { method = 'GET', headers = {}, body } = {}) {
  try {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: { 'x-mole-office-workspace': workspace, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const text = await res.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = { error: text.slice(0, 500) }
    }
    return { status: res.status, body: parsed }
  } catch (why) {
    return { status: null, why: why instanceof Error ? why.message : String(why) }
  }
}

function theOfficeSaid(reply) {
  return reply.body?.error ?? reply.body?.message ?? JSON.stringify(reply.body).slice(0, 500)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * ASK, AND WHEN ASKED TO, ASK AGAIN UNTIL GRANTED. Returns the slot the office answered with.
 *
 * `holder` is {pid, startedAt} or {resource}. Exits the process on a refusal: a refusal is the
 * office's sentence, printed as it came.
 */
async function acquire(pool, holder, { wait, every, limit, onQueued, detail = chosen.detail }) {
  const headers = writeHeaders()
  const body = { pool, ...holder, ...(detail === undefined ? {} : { detail }) }
  const started = Date.now()
  let lastPosition = null
  for (;;) {
    const reply = await ask('/api/slots/acquire', { method: 'POST', headers, body })
    if (reply.status === 200) {
      const slot = reply.body.slot
      if (slot.state === 'granted') {
        say(reply.body.says)
        return slot
      }
      if (lastPosition !== slot.position) {
        say(reply.body.says)
        lastPosition = slot.position
      }
      onQueued?.(slot)
      if (!wait) return slot
    } else if (reply.status === null) {
      if (!wait) refused(`The office at ${api} did not answer: ${reply.why}. Nothing was written.`, 1)
      say(`the office at ${api} did not answer (${reply.why}); asking again in ${every} s. The place in line is kept in the ledger.`)
    } else {
      refused(`The office refused the slot (${reply.status}): ${theOfficeSaid(reply)}`, 1)
    }
    if (limit !== null && Date.now() - started >= limit * 1000) return null
    await sleep(every * 1000)
  }
}

async function release(id, { force = false, note } = {}) {
  const reply = await ask(`/api/slots/${encodeURIComponent(id)}/release`, {
    method: 'POST',
    headers: writeHeaders(),
    body: { ...(force ? { force: true } : {}), ...(note === undefined ? {} : { note }) },
  })
  return reply
}

// ============================================================================ the commands

async function commandList() {
  const reply = await ask('/api/slots')
  if (reply.status !== 200) {
    refused(
      reply.status === null
        ? `The office at ${api} did not answer: ${reply.why}.`
        : `The office answered ${reply.status}: ${theOfficeSaid(reply)}`,
      1,
    )
  }
  if (chosen.json) {
    process.stdout.write(`${JSON.stringify(reply.body, null, 2)}\n`)
    return
  }
  for (const pool of reply.body.pools) {
    process.stdout.write(`${pool.says}\n`)
    const line = (s, where) => {
      const alive = s.holder.liveness.state === 'alive' ? 'running' : s.holder.liveness.state === 'gone' ? 'ENDED' : 'cannot be checked'
      const who = s.session?.title ?? s.sessionRecordId
      return `  ${where}  ${s.id}  group ${s.holder.pgid ?? '?'} (${alive})  ${who} — ${s.detail}\n`
    }
    for (const s of pool.held) process.stdout.write(line(s, `seat ${s.seat}`))
    for (const s of pool.waiting) process.stdout.write(line(s, `line ${s.position}`))
  }
}

async function commandAcquire() {
  const pool = chosen.target ?? usage('Say which pool: node tools/slot.mjs acquire <pool>.')
  if (chosen.pid !== undefined && chosen.resource !== undefined) usage('Name the holder once: --pid or --resource, not both.')
  let holder
  if (chosen.resource !== undefined) {
    holder = { resource: chosen.resource }
  } else {
    const pid = chosen.pid === undefined ? process.ppid : Number(chosen.pid)
    if (!Number.isInteger(pid) || pid < 1) usage(`--pid must be a process id, and it was "${chosen.pid}".`)
    const at = startTimeOf(pid)
    if (at === null) refused(`Nothing readable is running as pid ${pid} here, so it cannot hold a slot. Nothing was written.`)
    // THE START TIME THE OFFICE CHECKS THIS PID AGAINST is the local time with its offset stated: the office reads it with
    // parseAnyStamp and compares it with the real start, and the two need not share a zone (acceptance finding 63;
    // message _iMt4wd4EzGo).
    holder = { pid, startedAt: clockStamp(() => at).instant }
  }
  const every = seconds(chosen.every, '--every', theDefaultAskInterval())
  const limit = chosen.for === undefined ? null : seconds(chosen.for, '--for', null)
  let mine = null
  const leaveTheLine = async (code) => {
    if (mine !== null) {
      const left = await release(mine)
      say(left.status === 200 ? left.body.says : `could not leave the line for ${mine}; the office said ${left.status ?? left.why}`)
    }
    process.exit(code)
  }
  if (chosen.wait) {
    process.on('SIGINT', () => void leaveTheLine(130))
    process.on('SIGTERM', () => void leaveTheLine(143))
  }
  const slot = await acquire(pool, holder, {
    wait: chosen.wait,
    every,
    limit,
    onQueued: (s) => {
      mine = s.id
    },
  })
  if (slot === null) {
    say(`waited ${limit} s without a seat, so this request leaves the line.`)
    await leaveTheLine(4)
  }
  process.stdout.write(`${slot.id}\n`)
  process.exit(slot.state === 'granted' ? 0 : 3)
}

async function commandRelease() {
  const id = chosen.target ?? usage('Say which slot: node tools/slot.mjs release <slot id>.')
  const reply = await release(id, { force: chosen.force, note: chosen.note })
  if (reply.status !== 200) {
    refused(
      reply.status === null
        ? `The office at ${api} did not answer: ${reply.why}. The slot was not given back.`
        : `The office refused to give the slot back (${reply.status}): ${theOfficeSaid(reply)}`,
      1,
    )
  }
  say(reply.body.says)
}

/**
 * RUN A COMMAND IN A SEAT. The command is started first, as the leader of its own process group, and
 * held at a gate on its standard input: the seat has to be asked for BY that group, and a group
 * that does not exist yet cannot ask. It is let through only on the word "go", so if this tool dies
 * while waiting, the gate reads end-of-file and the command never runs.
 */
async function commandRun() {
  const pool = chosen.target ?? usage('Say which pool: node tools/slot.mjs run <pool> -- <command...>.')
  if (chosen.command.length === 0) usage('Say what to run, after --: node tools/slot.mjs run <pool> -- <command...>.')
  writeHeaders()
  const every = seconds(chosen.every, '--every', theDefaultAskInterval())
  const limit = chosen.for === undefined ? null : seconds(chosen.for, '--for', null)

  const gate = 'IFS= read -r word; [ "$word" = go ] || exit 111; exec "$@"'
  const child = spawn('sh', ['-c', gate, 'slot-gate', ...chosen.command], {
    detached: true,
    stdio: ['pipe', 'inherit', 'inherit'],
  })
  const group = child.pid
  const ended = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })))
  // A gate that died before its "go" makes the write fail with EPIPE. Its exit is what is read, above,
  // so the write's own error says nothing more and must not end this tool before the seat is given back.
  child.stdin.on('error', () => {})
  let slotId = null

  const giveBack = async () => {
    if (slotId === null) return
    const left = await release(slotId)
    say(left.status === 200 ? left.body.says : `could not give ${slotId} back (${left.status ?? left.why}); it gives itself back now that group ${group} has ended.`)
    slotId = null
  }
  const stop = (signal) => {
    try {
      process.kill(-group, signal)
    } catch {
      // The group has already gone, which is what was asked for.
    }
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))

  const at = startTimeOf(group)
  if (at === null) refused(`The command's process group ${group} ended before it could ask for a seat. Nothing was written.`, 1)
  const waiting = acquire(pool, { pid: group, startedAt: clockStamp(() => at).instant }, {
    // The group is led by the gate while it waits, so the row would otherwise name the gate's shell
    // line; the command it will become is what a reader of the line wants.
    detail: chosen.detail ?? chosen.command.join(' '),
    wait: true,
    every,
    limit,
    onQueued: (s) => {
      slotId = s.id
    },
  })
  const first = await Promise.race([waiting.then((slot) => ({ slot })), ended.then((end) => ({ end }))])
  if ('end' in first) {
    say(`the command ended before it was given a seat (exit ${first.end.code ?? first.end.signal}).`)
    await giveBack()
    process.exit(1)
  }
  if (first.slot === null) {
    say(`waited ${limit} s without a seat, so the command was not run and this request leaves the line.`)
    stop('SIGTERM')
    await giveBack()
    process.exit(4)
  }
  slotId = first.slot.id
  say(`running in ${first.slot.pool} seat ${first.slot.seat} as process group ${group}: ${chosen.command.join(' ')}`)
  child.stdin.end('go\n')
  const end = await ended
  await giveBack()
  // A command ended by a signal exits the way a shell reports it: 128 plus the signal's number.
  process.exit(end.code ?? 128 + (constants.signals[end.signal] ?? 0))
}

if (chosen.verb === 'list') await commandList()
else if (chosen.verb === 'acquire') await commandAcquire()
else if (chosen.verb === 'release') await commandRelease()
else if (chosen.verb === 'run') await commandRun()
else usage(`I do not know the command "${chosen.verb}". The commands are run, acquire, release and list.`)
