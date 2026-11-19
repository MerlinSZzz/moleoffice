// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE OF A STANDARD CHANGE'S CHECKS, RUN, WITH ITS WHOLE OUTPUT KEPT BESIDE THE CHECK'S OWN LOG (wave 13n round AU).
 *
 * The standard step runs on the sealed tree, in the inspector's sandbox or on the host. Whatever it writes has to outlive
 * the private worktree, which is removed after the verdict: on 28 October a failing related run's four parts were lost
 * with it, and only the last twelve lines of each part survived in the check's own log. So both paths here write the
 * complete standard output and the complete error output to a file in the folder of the check's own log, before the
 * worktree can go. The bounded end that the check's log and the door already keep stays a summary beside it.
 *
 * Nothing secret is handed over. The host child gets the model's environment with the office's variables and every
 * secret a check's runtime may be handed taken out; the sandbox view already gets no secret and no login for a standard
 * check (tools/inspector-sandbox.mjs, runInside). The host child runs in its own process group, so the clock and a stop
 * of the check end everything it started, and only that.
 *
 * `keepTheFullOutputAt` takes the two streams runInside already read whole from the launcher's files. `runInside` does
 * not cut them; the twelve-line `theEndOf` in the inspector is only the summary, never the kept copy.
 */

import { spawn } from 'node:child_process'
import { closeSync, cpSync, mkdirSync, openSync, readdirSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'
import { basename, dirname, join } from 'node:path'
import { A_STANDARD_CHECK, EVERY_SECRET_A_CHECK_IS_HANDED, theModelsEnvironmentOnTheHost } from './inspector-sandbox.mjs'

const THE_SUMMARY_CHARACTERS = 8000
const theEndOf = (text) => String(text).trim().split('\n').slice(-12).join('\n')
const theSecondsSince = (started) => (Date.now() - started) / 1000
const howLong = (limitMs) => (limitMs % 60_000 === 0 ? `${String(limitMs / 60_000)} minutes` : `${String(limitMs)} milliseconds`)

/** What is left of one check's whole limit after `spentMs`; never a negative time. */
export function theTimeLeft(limitMs, spentMs) {
  return Math.max(0, limitMs - Math.max(0, spentMs))
}

/** The preparation's share of one check's whole limit: its own cap, never more than what is left. */
export function thePreparationLimit({ limitMs, prepareLimitMs, spentMs }) {
  return Math.min(Math.max(0, prepareLimitMs), theTimeLeft(limitMs, spentMs))
}

/**
 * KEEP THE COMPLETE OUTPUT OF ONE CHECK AT `keepAt`, which is beside the check's own log. Answers the path it wrote and
 * null with the reason when it could not write one, so the caller can say either truth rather than claim a copy.
 */
export function keepTheFullOutputAt(keepAt, { name, argv, limitMs, code, out = '', err = '', why = '' }) {
  if (keepAt === null) return { keptAt: null, keptWhy: 'the office named no log for this check', complete: false }
  try {
    const lines = [
      `# A standard check: ${name}`,
      `# The command: ${argv.join(' ')}`,
      `# Its time limit: ${howLong(limitMs)}`,
      '# Its complete standard output follows.',
      out,
      '# Its complete error output follows.',
      err,
    ]
    if (why !== '') lines.push('# Why it did not run to an end:', why)
    lines.push(code === null ? '# It did not run to an end.' : `# It exited ${String(code)}.`)
    writeFileSync(keepAt, `${lines.join('\n')}\n`, { mode: 0o600 })
    return { keptAt: keepAt, keptWhy: null, complete: true }
  } catch (error) {
    return { keptAt: null, keptWhy: error instanceof Error ? error.message : String(error), complete: false }
  }
}

/** Every file under a folder, by its path relative to it, and the size and moment that tell a new write from an old one. */
function whatIsUnder(folder) {
  const found = new Map()
  const walk = (at, prefix) => {
    let entries
    try {
      entries = readdirSync(at, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(join(at, entry.name), relative)
      else if (entry.isFile()) {
        try {
          const held = statSync(join(at, entry.name))
          found.set(relative, `${String(held.size)}:${String(held.mtimeMs)}`)
        } catch {
          /* A file gone between the listing and the read is not one this check wrote. */
        }
      }
    }
  }
  walk(folder, '')
  return found
}

/**
 * THE FULL LOGS THE STANDARD CHECK'S OWN RUNNER KEPT UNDER ITS .logs, COPIED BESIDE THE CHECK'S LOG. tools/run-named-tests
 * runs vitest through tools/q.mjs, and q prints only a digest and a tail; the lines it leaves out are in a .log under the
 * private worktree and go with it. This copies every file that appeared or changed under <cwd>/.logs while this one
 * check ran, and nothing older or outside it, before the worktree can be removed.
 */
export function keepTheChecksOwnLogs({ cwd, keepAt, before }) {
  if (keepAt === null) return { keptAt: null, keptWhy: 'the office named no log for this check', copied: 0 }
  const logs = join(cwd, '.logs')
  const keepLogsAt = join(dirname(keepAt), `${basename(keepAt, '.txt')}-logs`)
  const now = whatIsUnder(logs)
  const changed = [...now].filter(([relative, stamp]) => before.get(relative) !== stamp).map(([relative]) => relative)
  if (changed.length === 0) return { keptAt: null, keptWhy: null, copied: 0 }
  try {
    for (const relative of changed) {
      const to = join(keepLogsAt, relative)
      mkdirSync(dirname(to), { recursive: true, mode: 0o700 })
      cpSync(join(logs, relative), to)
    }
    return { keptAt: keepLogsAt, keptWhy: null, copied: changed.length }
  } catch (error) {
    return { keptAt: null, keptWhy: error instanceof Error ? error.message : String(error), copied: 0 }
  }
}

/**
 * THE SENTENCE A CHECK'S ANSWER ADDS FOR THE OUTPUT IT KEPT, so the check's own log names where it went. A path may be
 * named for an incomplete copy, because a write can fail after the file is opened; only `complete` says the copy holds
 * every byte. A null path is a copy that was never made.
 * @param {{ keptAt: string | null, keptWhy: string | null, complete: boolean }} kept
 */
export function theKeptOutputSays(kept) {
  if (kept.keptAt === null) return ` Its full output could not be kept${kept.keptWhy === null ? '.' : `: ${kept.keptWhy}.`}`
  if (kept.complete) return ` Its full output is kept at ${kept.keptAt}.`
  return ` Its full output is incomplete at ${kept.keptAt}${kept.keptWhy === null ? '.' : `: ${kept.keptWhy}.`}`
}

/** The sentence a check's answer adds for the logs it kept, so the check's own log names where they went. */
export function theKeptLogsSay(kept) {
  if (kept.keptAt !== null) return ` Its full run logs are kept at ${kept.keptAt}.`
  if (kept.keptWhy !== null && kept.keptWhy !== 'the office named no log for this check') return ` Its full run logs could not be kept: ${kept.keptWhy}.`
  return ''
}

/**
 * ONE CHECK AS A CHILD ON THE HOST. `keepAt` gets every byte as it arrives; the answer's `said` is the same bounded end
 * the inspector's log keeps. `code` is null when it did not run to an end, the clock's stop and a start failure among
 * them, and then `said` says why.
 *
 * A CHECK THAT TAKES A SEAT gives `seat`, which is asked with the child's pid and answers once the seat is granted, or
 * once it is known there is none. The child is started first in a process group of its own, waiting at a gate (a shell
 * that reads one line and then becomes the command), so the seat is held by that group. The command and its clock
 * start when `seat` has answered, and the seat is given back when the child has ended. When asking throws, the command
 * is never started: the waiting group is stopped, and `code` is null with `said` saying why.
 * @param {{ name: string, argv: string[], limitMs: number, cwd: string, keepAt?: string | null, env?: NodeJS.ProcessEnv, seat?: ((pid: number) => Promise<{ giveBack: () => void }>) | null }} options
 */
export async function runAStandardCheckAsAChild({ name, argv, limitMs, cwd, keepAt = null, env = process.env, seat = null }) {
  const started = Date.now()
  const seconds = () => theSecondsSince(started)
  const logsBefore = whatIsUnder(join(cwd, '.logs'))
  let fd = null
  let openedAt = keepAt
  let keptWhy = keepAt === null ? 'the office named no log for this check' : null
  let complete = keepAt !== null
  if (keepAt !== null) {
    try {
      fd = openSync(keepAt, 'w', 0o600)
    } catch (error) {
      openedAt = null
      keptWhy = error instanceof Error ? error.message : String(error)
      complete = false
    }
  }
  const write = (data) => {
    if (fd === null) return
    try {
      writeSync(fd, data)
    } catch (error) {
      keptWhy = error instanceof Error ? error.message : String(error)
      complete = false
      close()
    }
  }
  const close = () => {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        /* Nothing more can be written. */
      }
      fd = null
    }
  }
  write(`# A standard check: ${name}\n# The command: ${argv.join(' ')}\n# Its time limit: ${howLong(limitMs)}\n`)
  const childEnv = theModelsEnvironmentOnTheHost(env)
  for (const secret of EVERY_SECRET_A_CHECK_IS_HANDED) delete childEnv[secret]
  return await new Promise((done) => {
    let said = ''
    let stoppedByTheClock = false
    let child = null
    let timer = null
    let killTimer = null
    /** The seat, once `seat` has answered, and whether the child had ended by then. */
    let held = null
    let hasEnded = false
    /** Why the command was not started, once asking for its seat has thrown. */
    let noSeat = null
    const outDecoder = new StringDecoder('utf8')
    const errDecoder = new StringDecoder('utf8')
    const stopTheGroup = (signal = 'SIGTERM') => {
      if (child === null) return
      try {
        process.kill(-child.pid, signal)
      } catch {
        /* already gone */
      }
    }
    const ended = (answer) => {
      hasEnded = true
      if (timer !== null) clearTimeout(timer)
      if (killTimer !== null) clearTimeout(killTimer)
      for (const [signal, handler] of onAStop) process.off(signal, handler)
      held?.giveBack()
      close()
      done({ ...answer, keptAt: openedAt, keptWhy, complete, keptLogs: keepTheChecksOwnLogs({ cwd, keepAt, before: logsBefore }) })
    }
    const onAStop = [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]].map(([signal, code]) => {
      const handler = () => {
        const line = `This check was stopped (${signal}), so it ends the standard check it started, ${name}.`
        write(`\n${line}\n`)
        process.stderr.write(`${line}\n`)
        stopTheGroup()
        close()
        process.exit(code)
      }
      process.on(signal, handler)
      return [signal, handler]
    })
    try {
      child = seat === null
        ? spawn(argv[0], argv.slice(1), { cwd, env: childEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
        : spawn('sh', ['-c', 'read -r go && exec "$@"', 'sh', ...argv], { cwd, env: childEnv, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (error) {
      const why = `It could not be started: ${error instanceof Error ? error.message : String(error)}`
      write(`\n${why}\n`)
      ended({ code: null, seconds: seconds(), said: why })
      return
    }
    const theClockStarts = () => {
      timer = setTimeout(() => {
        stoppedByTheClock = true
        write(`\nIt was still running after ${howLong(limitMs)} and was stopped.\n`)
        stopTheGroup('SIGTERM')
        killTimer = setTimeout(() => stopTheGroup('SIGKILL'), 5_000)
      }, limitMs)
    }
    if (seat === null) {
      theClockStarts()
    } else {
      // A gate that can no longer be written to has ended, and 'close' below says how.
      child.stdin.on('error', (error) => write(`\nThe gate before the command could not be opened: ${error.message}\n`))
      void seat(child.pid).then((answer) => {
        held = answer
        if (hasEnded) {
          answer.giveBack()
          return
        }
        child.stdin.end('go\n')
        theClockStarts()
      }, (error) => {
        // AN ASK THAT THREW LEAVES THE GATE SHUT. Its group is stopped, and 'close' below ends the check with this.
        noSeat = `Its seat could not be asked for, so the command was not started: ${error instanceof Error ? error.message : String(error)}`
        write(`\n${noSeat}\n`)
        stopTheGroup('SIGTERM')
      })
    }
    child.stdout.on('data', (part) => {
      write(part)
      said = (said + outDecoder.write(part)).slice(-THE_SUMMARY_CHARACTERS)
    })
    child.stderr.on('data', (part) => {
      write(part)
      said = (said + errDecoder.write(part)).slice(-THE_SUMMARY_CHARACTERS)
    })
    child.on('error', (error) => {
      const why = `It could not be started: ${error.message}`
      write(`\n${why}\n`)
      ended({ code: null, seconds: seconds(), said: why })
    })
    child.on('close', (code, signal) => {
      said = (said + outDecoder.end() + errDecoder.end()).slice(-THE_SUMMARY_CHARACTERS)
      if (noSeat !== null) {
        ended({ code: null, seconds: seconds(), said: noSeat })
        return
      }
      if (stoppedByTheClock) {
        const why = `It was still running after ${howLong(limitMs)} and was stopped.`
        write(`\n${why}\n`)
        ended({ code: null, seconds: seconds(), said: `${why} ${theEndOf(said)}`.trim() })
        return
      }
      if (code === null) {
        const why = `It did not run to an end (${signal ?? 'no exit code'}).`
        write(`\n${why}\n`)
        ended({ code: null, seconds: seconds(), said: `${why} ${theEndOf(said)}`.trim() })
        return
      }
      write(`\n# It exited ${String(code)}.\n`)
      ended({ code, seconds: seconds(), said: theEndOf(said) })
    })
  })
}

/**
 * ONE CHECK IN THE INSPECTOR'S SANDBOX. `runInside` hands over the launcher's whole standard and error output; this keeps
 * both beside the check's own log, and answers the same shape as the host child. A clock stop or a check that could not
 * start is written down too, not only a check that ended.
 * @template Sandbox
 * @param {{ name: string, argv: string[], limitMs: number, cwd: string, sandbox: Sandbox, keepAt?: string | null, runInside: (sandbox: Sandbox, options: { label: string, cwd: string, argv: string[], limitMs: number }) => Promise<{ code: number | null, stoppedByTheClock?: boolean, out?: string, err?: string, why?: string }> }} options
 */
export async function runASandboxStandardCheck({ name, argv, limitMs, cwd, sandbox, keepAt = null, runInside }) {
  const started = Date.now()
  const logsBefore = whatIsUnder(join(cwd, '.logs'))
  const ran = await runInside(sandbox, { label: `${A_STANDARD_CHECK}${name}`, cwd, argv, limitMs })
  const why = ran.code === null ? String(ran.why ?? '') : ran.stoppedByTheClock ? `It was still running after ${howLong(limitMs)} and was stopped.` : ''
  const kept = keepTheFullOutputAt(keepAt, { name, argv, limitMs, code: ran.stoppedByTheClock ? null : ran.code, out: ran.out ?? '', err: ran.err ?? '', why })
  const keptLogs = keepTheChecksOwnLogs({ cwd, keepAt, before: logsBefore })
  const tail = theEndOf(`${ran.out ?? ''}\n${ran.err ?? ''}`)
  const said = ran.code === null ? why : ran.stoppedByTheClock ? `${why} ${tail}`.trim() : tail
  return { code: ran.stoppedByTheClock ? null : ran.code, seconds: theSecondsSince(started), said, keptAt: kept.keptAt, keptWhy: kept.keptWhy, complete: kept.complete, keptLogs }
}
