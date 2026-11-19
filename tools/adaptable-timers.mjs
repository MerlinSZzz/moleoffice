#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADAPTABLE TIMERS: A COPY OF THE OFFICE'S COUNTERS THAT ANYBODY MAY CHANGE FOR THEIR OWN USE.
 *
 * The office keeps its own timers and triggers, the counters at /api/counters, and they change only through their
 * tests. This file is the toolset's copy of them (slug adaptable-timers). Change it as you like: nothing of the office
 * imports it, and it imports nothing but Node's own modules, so a change here never changes the office's counters.
 * tests/the-adaptable-timers-copy-keeps-the-counters-rules.test.ts proves both, and the rules below.
 *
 * THE RULES IT KEEPS, as src/server/lib/counters.ts keeps them:
 *   - A count is added to by hand, and every addition says why. A timer is a counter nobody adds to.
 *   - The spell is everything since the last firing, or since the timer was made when it never fired. The count and
 *     the amount are added up from the spell's rows and stored nowhere else.
 *   - Four triggers: count (the count reached n), amount (the amount reached m, which needs what is measured), quiet,
 *     and every (the first `from + k × hours` after the spell began, or `hours` after it when there is no `from`).
 *     Every waits for a count of 1 unless the counter is a timer.
 *   - When a trigger holds, one action runs and the next spell starts from zero. Count and amount are checked when
 *     somebody adds; all four are checked at each tick.
 *
 * WHERE IT IS NOT THE OFFICE'S, AND WHY. This version holds timers and hand-added counts only. A shell script holds
 * no key, so it cannot read the office and cannot write to it. So:
 *   - office events (a landing, a run that finished, a group message) are not followed yet;
 *   - quiet means nobody added for so many minutes; the office's quiet means the merge lane was idle, which this
 *     copy cannot read;
 *   - a message or a task is printed and kept in the state file, never sent or filed, and the printed line says so;
 *     a command the caller writes runs here;
 *   - a use writes a row in the state file and no line on the calling run;
 *   - there is no pause and no "at most once every" limit.
 *
 * ITS STATE is one JSON file, adaptable-timers.json, in the folder the caller names, and never the office's database.
 * One process writes it at a time, under adaptable-timers.json.lock beside it. It fires only while a process of it
 * runs: `watch` checks until it is stopped, `tick` checks once, and `add` checks count and amount.
 *
 * Exit codes: 0 done; 1 a command a timer ran failed; 2 refused, with the reason; 75 another process held the state.
 */

import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const STATE = 'adaptable-timers.json'
const LOCK = `${STATE}.lock`
/** How long a call waits for another process to let go of the state before it gives up. */
const LOCK_WAIT_MS = 3000
const TRIGGER_KINDS = ['count', 'amount', 'quiet', 'every']
const ACTIONS = { message: 'words', task: 'title', command: 'command' }

export const NOT_FOLLOWED =
  'Office events are not followed yet: a landing, a run that finished, a group message. ' +
  'A shell script holds no key, so this tool cannot read the office or write to it. A later version is planned to read them with the caller\'s own key.'

const HELP = `node tools/adaptable-timers.mjs <command> --folder <folder> ...

The toolset's copy of the office's timers and triggers. Change this file as you like: the office's own counters
are not changed by it. Its state is one file, ${STATE}, in the folder you name.

  make <name> --folder <folder> <triggers> <action>
      Triggers, at least one:
        --count <n>                      fires when the count reaches n.
        --amount <m> --amount-is <what>  fires when the amount reaches m; --amount-is says what is measured.
        --quiet <minutes>                fires once nobody added for that many minutes, with a count of at least 1.
        --every <hours> [--from <YYYY-MM-DD HH:MM>]
                                         fires every so many hours after its last firing, or at from + k x hours.
                                         It waits for a count of 1, unless the counter is a timer.
        --timer                          a timer: nobody adds to it, and its only trigger is --every.
      The action, one:
        --action message --words <text>  prints the words. NOT SENT: the tool holds no key.
        --action task --title <title>    prints the title. NOT FILED: the tool holds no key.
        --action command --command <sh>  runs the command with sh, with ADAPTABLE_TIMER_NAME and
                                         ADAPTABLE_TIMER_COUNT set.
  add <name> --folder <folder> --reason <why> [--count <n>] [--amount <x>]
      Adds n (1 when not given), and checks the count and amount triggers.
  tick --folder <folder>
      Checks every trigger once.
  watch --folder <folder> [--seconds <s>]
      Checks every trigger every s seconds (60 when not given) until it is stopped.
  list --folder <folder>
      Says each counter's count, since when, its triggers and its action.
  help
      This.

When a trigger holds, the action runs once and the count starts again from zero.
It fires only while its process runs: nothing fires between calls unless watch is running.

Where it differs from the office's counters:
  ${NOT_FOLLOWED}
  Quiet here means nobody added for so many minutes; the office's quiet means the merge lane was idle.
  Each use writes one row in ${STATE} and no line on the calling run.
  There is no pause and no "at most once every" limit.

Exit codes: 0 done; 1 a command a timer ran failed; 2 refused; 75 another process held the state.
`

class Refused extends Error {}
class Busy extends Error {}

// ============================================================================ local wall-clock stamps

function pad(n) {
  return String(n).padStart(2, '0')
}

/** A moment as this machine's wall clock writes it: YYYY-MM-DD HH:MM:SS. */
function theStampOf(ms) {
  const at = new Date(ms)
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/** The moment a local stamp names, or null when it is not one. Seconds may be left off. */
function theMomentOf(stamp) {
  const found = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(stamp).trim())
  if (found === null) return null
  const [, y, mo, d, h, mi, s] = found.map(Number)
  const at = new Date(y, mo - 1, d, h, mi, s || 0)
  return Number.isNaN(at.getTime()) ? null : at.getTime()
}

// ============================================================================ the state file, one writer at a time

function theFolder(values) {
  if (values.folder === undefined || values.folder.trim() === '') throw new Refused('Name the folder that holds the state, with --folder <folder>.')
  return resolve(values.folder)
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * READS THE STATE, LETS `change` CHANGE IT, AND WRITES IT BACK WHOLE, holding the lock throughout. The file is written
 * beside itself and renamed, so a reader never sees half of it. It is written only when `change` says it changed.
 * Only `make` may start a state where there is none.
 */
function withTheState(folder, change, { mayStart = false } = {}) {
  const path = join(folder, STATE)
  if (!existsSync(path) && !mayStart) throw new Refused(`Nothing has been made in ${folder}: there is no ${STATE} there. Make a counter first, or name the folder that holds one.`)
  mkdirSync(folder, { recursive: true })
  const lock = join(folder, LOCK)
  const until = Date.now() + LOCK_WAIT_MS
  let held = -1
  while (held === -1) {
    try {
      held = openSync(lock, 'wx')
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() >= until) {
        throw new Busy(`Another process holds ${lock}, so nothing was changed. If no adaptable-timers process is running, a stopped one left that file: remove it and call again.`)
      }
      sleep(50)
    }
  }
  try {
    writeSync(held, String(process.pid))
    closeSync(held)
    const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { timers: {} }
    const { changed, ...answer } = change(state)
    if (changed) {
      writeFileSync(`${path}.writing`, `${JSON.stringify(state, null, 2)}\n`)
      renameSync(`${path}.writing`, path)
    }
    return answer
  } finally {
    rmSync(lock, { force: true })
  }
}

// ============================================================================ the counters' rules

/** The spell now in progress: since when, its additions, and the count and amount added up from them. */
function theSpell(timer) {
  let last = -1
  timer.rows.forEach((row, i) => {
    if (row.kind === 'firing') last = i
  })
  const additions = timer.rows.slice(last + 1).filter((row) => row.kind === 'addition')
  const since = last === -1 ? timer.made : timer.rows[last].at
  let count = 0
  let amount = 0
  for (const row of additions) {
    count += row.count
    amount += row.amount ?? 0
  }
  return { since, additions, count, amount: timer.amountIs === null ? null : amount }
}

/** When an every trigger is next due: the first `from + k × hours` after the spell began, or `hours` after it. */
function nextDueOfEvery(trigger, sinceMs) {
  const step = trigger.hours * 60 * 60 * 1000
  if (trigger.from === undefined) return sinceMs + step
  const fromMs = theMomentOf(trigger.from)
  if (fromMs > sinceMs) return fromMs
  return fromMs + (Math.floor((sinceMs - fromMs) / step) + 1) * step
}

/** Why each trigger of the kinds asked about holds now. Empty when none does. */
function whatHolds(timer, kinds, nowMs) {
  const spell = theSpell(timer)
  const atLeastOne = timer.timer || spell.count >= 1
  const because = []
  for (const trigger of timer.triggers) {
    if (!kinds.includes(trigger.kind)) continue
    if (trigger.kind === 'count' && spell.count >= trigger.n) because.push(`the count reached ${String(spell.count)}, and it fires at ${String(trigger.n)}`)
    if (trigger.kind === 'amount' && spell.amount !== null && spell.amount >= trigger.m) {
      because.push(`the amount reached ${String(spell.amount)} ${timer.amountIs}, and it fires at ${String(trigger.m)}`)
    }
    if (trigger.kind === 'quiet' && spell.count >= 1) {
      const last = spell.additions[spell.additions.length - 1]
      if (nowMs - theMomentOf(last.at) >= trigger.minutes * 60_000) because.push(`nobody added for ${String(trigger.minutes)} minutes`)
    }
    if (trigger.kind === 'every' && atLeastOne) {
      const due = nextDueOfEvery(trigger, theMomentOf(spell.since))
      if (nowMs >= due) because.push(`it was due at ${theStampOf(due)}`)
    }
  }
  return because
}

/** Writes a firing row when a trigger of the kinds asked about holds. The firing ends the spell. */
function fireIfOneHolds(name, timer, kinds, nowMs) {
  const because = whatHolds(timer, kinds, nowMs)
  if (because.length === 0) return null
  const count = theSpell(timer).count
  const row = { seq: timer.rows.length + 1, kind: 'firing', at: theStampOf(nowMs), because, action: timer.action.kind }
  if (timer.action.kind === 'command') row.exit = null
  timer.rows.push(row)
  return { name, timer, row, count }
}

/** Runs the action of one firing, outside the lock, and says what happened. False when a command failed. */
function act(folder, fired) {
  const { name, timer, row, count } = fired
  const head = `"${name}" fired: ${row.because.join('; ')}.`
  const { action } = timer
  if (action.kind === 'message') console.log(`${head} Its message was NOT SENT: this tool holds no key, so nothing went to the office. The message: ${action.words}`)
  if (action.kind === 'task') console.log(`${head} Its task was NOT FILED: this tool holds no key, so nothing went to the office. The task: ${action.title}`)
  let ok = true
  if (action.kind === 'command') {
    console.log(`${head} Its command runs now: ${action.command}`)
    const done = spawnSync('sh', ['-c', action.command], {
      stdio: 'inherit',
      env: { ...process.env, ADAPTABLE_TIMER_NAME: name, ADAPTABLE_TIMER_COUNT: String(count) },
    })
    const exit = done.status
    ok = exit === 0
    if (done.error !== undefined) console.log(`The command could not be started: ${done.error.message}.`)
    else if (exit === null) console.log(`The command was stopped by ${String(done.signal)}.`)
    else console.log(`The command ended with exit code ${String(exit)}.`)
    withTheState(folder, (state) => {
      const same = state.timers[name]?.rows.find((one) => one.seq === row.seq && one.kind === 'firing')
      if (same !== undefined) same.exit = exit
      return { changed: same !== undefined }
    })
  }
  console.log(`The count of "${name}" starts again from zero.`)
  return ok
}

// ============================================================================ the commands

function aNumber(flag, text, { whole = false, positive = true } = {}) {
  const n = Number(text)
  const fits = text !== undefined && text.trim() !== '' && Number.isFinite(n) && (!whole || Number.isInteger(n)) && (!positive || n > 0)
  if (!fits) throw new Refused(`${flag} takes ${whole ? 'a whole number' : 'a number'}${positive ? ' above 0' : ''}, not ${JSON.stringify(text ?? '')}.`)
  return n
}

function theName(positionals) {
  const name = positionals[1]
  if (name === undefined || name.trim() === '') throw new Refused('Name the counter, as the word after the command.')
  return name
}

function make(positionals, values) {
  const name = theName(positionals)
  const folder = theFolder(values)
  const triggers = []
  if (values.count !== undefined) triggers.push({ kind: 'count', n: aNumber('--count', values.count, { whole: true }) })
  if (values.amount !== undefined) triggers.push({ kind: 'amount', m: aNumber('--amount', values.amount) })
  if (values.quiet !== undefined) triggers.push({ kind: 'quiet', minutes: aNumber('--quiet', values.quiet) })
  if (values.every !== undefined) {
    const every = { kind: 'every', hours: aNumber('--every', values.every) }
    if (values.from !== undefined) {
      if (theMomentOf(values.from) === null) throw new Refused(`--from takes a local time written YYYY-MM-DD HH:MM, not ${JSON.stringify(values.from)}.`)
      every.from = values.from.trim()
    }
    triggers.push(every)
  } else if (values.from !== undefined) throw new Refused('--from belongs to --every.')
  if (triggers.length === 0) throw new Refused(`Give at least one trigger: ${TRIGGER_KINDS.map((kind) => `--${kind}`).join(', ')}.`)
  if (values.amount !== undefined && (values['amount-is'] === undefined || values['amount-is'].trim() === '')) {
    throw new Refused('An amount trigger needs --amount-is <what>, which says what is measured.')
  }
  if (values.timer && triggers.some((trigger) => trigger.kind !== 'every')) {
    throw new Refused('A timer takes only --every: nobody adds to a timer, so a count, an amount or a quiet trigger could never hold.')
  }
  if (values.timer && values.every === undefined) throw new Refused('A timer needs --every <hours>.')
  const kind = values.action
  if (kind === undefined || !(kind in ACTIONS)) throw new Refused(`Give one action: --action ${Object.keys(ACTIONS).join(', --action ')}.`)
  for (const [other, flag] of Object.entries(ACTIONS)) {
    if (other !== kind && values[flag] !== undefined) throw new Refused(`--${flag} belongs to --action ${other}, not to --action ${kind}.`)
  }
  const words = values[ACTIONS[kind]]
  if (words === undefined || words.trim() === '') throw new Refused(`--action ${kind} needs --${ACTIONS[kind]}.`)
  const action = { kind, [ACTIONS[kind]]: words }
  withTheState(
    folder,
    (state) => {
      if (state.timers[name] !== undefined) throw new Refused(`"${name}" is made already in ${folder}. Choose another name.`)
      state.timers[name] = { made: theStampOf(Date.now()), triggers, timer: values.timer === true, amountIs: values['amount-is']?.trim() ?? null, action, rows: [] }
      return { changed: true }
    },
    { mayStart: true },
  )
  console.log(`Made "${name}" in ${join(folder, STATE)}. It fires only while watch or tick runs, or when add makes a count or an amount hold.`)
  return 0
}

function add(positionals, values) {
  const name = theName(positionals)
  const folder = theFolder(values)
  if (values.reason === undefined || values.reason.trim() === '') throw new Refused('Every addition says why: give --reason <why>.')
  const count = values.count === undefined ? 1 : aNumber('--count', values.count, { whole: true })
  const amount = values.amount === undefined ? undefined : aNumber('--amount', values.amount, { positive: false })
  const { fired, said } = withTheState(folder, (state) => {
    const timer = state.timers[name]
    if (timer === undefined) throw new Refused(`No counter named "${name}" is made in ${folder}.`)
    if (timer.timer) throw new Refused(`"${name}" is a timer: nobody adds to it.`)
    if (amount !== undefined && timer.amountIs === null) throw new Refused(`"${name}" measures no amount, so --amount cannot be added to it.`)
    const nowMs = Date.now()
    timer.rows.push({ seq: timer.rows.length + 1, kind: 'addition', at: theStampOf(nowMs), count, ...(amount === undefined ? {} : { amount }), reason: values.reason.trim() })
    const spell = theSpell(timer)
    const said = `Added ${String(count)} to "${name}" because: ${values.reason.trim()}. Its count is now ${String(spell.count)}${spell.amount === null ? '' : `, and its amount ${String(spell.amount)} ${timer.amountIs}`}.`
    return { changed: true, said, fired: fireIfOneHolds(name, timer, ['count', 'amount'], nowMs) }
  })
  console.log(said)
  return fired === null || act(folder, fired) ? 0 : 1
}

/** Checks every trigger of every counter once. */
function tick(folder) {
  const { fired } = withTheState(folder, (state) => {
    const nowMs = Date.now()
    const fired = Object.entries(state.timers)
      .map(([name, timer]) => fireIfOneHolds(name, timer, TRIGGER_KINDS, nowMs))
      .filter((one) => one !== null)
    return { changed: fired.length > 0, fired }
  })
  let ok = true
  for (const one of fired) ok = act(folder, one) && ok
  return ok ? 0 : 1
}

async function watch(values) {
  const folder = theFolder(values)
  const seconds = values.seconds === undefined ? 60 : aNumber('--seconds', values.seconds)
  const stop = () => {
    console.log('Stopped: nothing fires until watch or tick runs again.')
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  console.log(`Watching ${join(folder, STATE)} every ${String(seconds)} seconds until stopped.`)
  for (;;) {
    try {
      tick(folder)
    } catch (error) {
      // ONE CHECK IS SKIPPED, NOT THE WATCH: the process that held the state lets go, and the next check reads it.
      if (!(error instanceof Busy)) throw error
      console.log(`This check was skipped: ${error.message}`)
    }
    await new Promise((done) => setTimeout(done, seconds * 1000))
  }
}

function list(folder) {
  const { lines } = withTheState(folder, (state) => {
    const lines = Object.entries(state.timers).map(([name, timer]) => {
      const spell = theSpell(timer)
      const triggers = timer.triggers
        .map((trigger) => {
          if (trigger.kind === 'count') return `a count of ${String(trigger.n)}`
          if (trigger.kind === 'amount') return `an amount of ${String(trigger.m)} ${timer.amountIs}`
          if (trigger.kind === 'quiet') return `nobody adding for ${String(trigger.minutes)} minutes`
          return `every ${String(trigger.hours)} hours${trigger.from === undefined ? '' : ` from ${trigger.from}`}`
        })
        .join(', or ')
      const amount = spell.amount === null ? '' : `, amount ${String(spell.amount)} ${timer.amountIs}`
      return `${name}: count ${String(spell.count)}${amount}, since ${spell.since}. ${timer.timer ? 'A timer. ' : ''}Fires on ${triggers}. Then: a ${timer.action.kind}.`
    })
    return { changed: false, lines }
  })
  console.log(lines.length === 0 ? `No counter is made in ${folder}.` : lines.join('\n'))
  return 0
}

export async function main(args = process.argv.slice(2)) {
  try {
    const { positionals, values } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        folder: { type: 'string' },
        count: { type: 'string' },
        amount: { type: 'string' },
        'amount-is': { type: 'string' },
        quiet: { type: 'string' },
        every: { type: 'string' },
        from: { type: 'string' },
        timer: { type: 'boolean' },
        action: { type: 'string' },
        words: { type: 'string' },
        title: { type: 'string' },
        command: { type: 'string' },
        reason: { type: 'string' },
        seconds: { type: 'string' },
      },
    })
    const command = positionals[0]
    if (command === undefined || command === 'help') {
      process.stdout.write(HELP)
      return command === undefined ? 2 : 0
    }
    if (command === 'make') return make(positionals, values)
    if (command === 'add') return add(positionals, values)
    if (command === 'tick') return tick(theFolder(values))
    if (command === 'list') return list(theFolder(values))
    if (command === 'watch') return await watch(values)
    throw new Refused(`There is no command ${JSON.stringify(command)}. The commands: make, add, tick, watch, list, help.`)
  } catch (error) {
    if (error instanceof Busy) {
      console.error(error.message)
      return 75
    }
    if (error instanceof Refused || error?.code?.startsWith?.('ERR_PARSE_ARGS')) {
      console.error(`Refused: ${error.message}`)
      return 2
    }
    throw error
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = await main()
