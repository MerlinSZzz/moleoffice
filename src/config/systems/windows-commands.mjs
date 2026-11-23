// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WINDOWS RUNNER: ONE POWERSHELL SCRIPT, RUN ENCODED, AFTER A LINE THAT MAKES ITS OUTPUT UTF-8.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * Everything Mole Office asks of Windows goes through PowerShell. This file is the one place a
 * script is handed to `powershell.exe`, and the one place the shape of its answer is decided. The
 * reader of processes (./windows-processes.mjs) and the signal to a group (./windows-groups.mjs)
 * both take a runner, so a test can hand them a stand-in and read what they would run.
 *
 * The script travels encoded rather than on the command line. `-EncodedCommand` takes UTF-16LE
 * base64, which carries the script's spaces, quotes and non-ASCII characters without the shell
 * rewriting them. The first line of every script this runner runs sets PowerShell's output
 * encoding to UTF-8, so a name or a command line with characters outside ASCII comes back as the
 * same characters.
 *
 * The starter that puts a program in its own Job Object (./windows-starts.mjs) is encoded the same
 * way, without that line. It runs with no console, and setting the console's encoding throws there.
 *
 * EVERY CALL RUNS THE SYSTEM'S OWN `powershell.exe`, named by its whole path (`thePowerShellProgram`
 * below). IT RAN ON A WINDOWS 11 MACHINE in wave 13t, rounds W9 and W10: the servers' readings of
 * processes and of Job Objects went through it. It is read on Linux, with stand-ins for PowerShell in
 * tests/the-windows-side-of-the-system-layer.test.ts.
 *
 * ONE POWERSHELL STAYS OPEN FOR THE READING OF WHO SENT A REQUEST (`askThePowerShellThatStays` below). On
 * a Windows 11 machine on 12 November 2026 that reading took 10.6 to 14.1 seconds, with a new PowerShell
 * for each request. A new PowerShell loads .NET, its own modules and the modules the script uses, and
 * starting a program on Windows is done on the thread that asks for it. The PowerShell that stays pays
 * for that once, and each script after it runs in a PowerShell that is already running. Its loop has not
 * been run on Windows. Its Node side is read on Linux, with a stand-in program in PowerShell's place.
 * A script may be given as a function that makes it at its turn, from the number of the PowerShell it will run in.
 * The reading of who holds a connection uses that to read together the readings that waited, and to read this
 * server's own process once in each PowerShell (./windows-processes.mjs).
 */

import { spawn, spawnSync } from 'node:child_process'
import { win32 } from 'node:path'

/**
 * @typedef {import('../process-reader.mjs').WhatACommandDid} WhatACommandDid
 */

/**
 * THE SYSTEM'S OWN POWERSHELL, BY ITS WHOLE PATH, in the system folder Windows names in `SystemRoot`.
 * On Windows Node looks for a bare program name in the start's own folder before it looks along PATH,
 * so a `powershell.exe` left in a checkout would run in its place, with the caller's environment.
 * Windows always sets `SystemRoot`; where it is not set, as on Linux, the usual folder `C:\Windows`
 * is named, and a PowerShell that is not there fails to start in the system's own words.
 * @returns {string}
 */
export function thePowerShellProgram() {
  return win32.join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

/**
 * The first line of every script. It is set before the script runs, so every later write to the
 * output stream is UTF-8.
 */
export const THE_UTF8_LINE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8'

/**
 * The arguments that run one script, with the script encoded after the UTF-8 line.
 * @param {string} script the PowerShell the caller wants to run
 * @returns {string[]}
 */
export function thePowerShellArguments(script) {
  return theEncodedArguments(`${THE_UTF8_LINE}\n${script}`)
}

/**
 * The arguments that run one script exactly as it is, encoded.
 * @param {string} script
 * @returns {string[]}
 */
export function theEncodedArguments(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]
}

/**
 * The runner both Windows pieces take. The real one starts `powershell.exe`; a test hands in its
 * own and records the scripts instead.
 *
 * It has two ways to run a script. `powershell` holds the thread until PowerShell has answered. The
 * server answers no other request in that time, and one script takes about a second on Windows 11.
 * `startPowerShell` starts the same program with the same arguments and gives the same answer when
 * PowerShell has finished, so the server's thread is free while it runs. A server reading Windows
 * processes for a request uses `startPowerShell`, and so does the entry press when it asks Windows's
 * list of installed apps (./the-installer-of-a-folder.mjs). The commands and the start of a program
 * use `powershell`, where nothing else is waiting on the thread.
 * `askThePowerShellThatStays` is a third way, which also waits. It runs the script in the one
 * PowerShell this process keeps open (`aPowerShellThatStays`), and it takes a script that is made at its
 * turn as well. The reading of who holds a connection uses it. A runner without it, as a test may hand
 * in, runs that reading by `startPowerShell`.
 * @typedef {{
 *   powershell: (script: string) => WhatACommandDid,
 *   startPowerShell: (script: string) => Promise<WhatACommandDid>,
 *   askThePowerShellThatStays?: (script: AScriptForTheOneThatStays) => Promise<WhatTheOneThatStaysDid>,
 * }} WindowsCommands
 */

/**
 * A script for the PowerShell that stays: the script itself, or a function that makes it at its turn. The
 * function is given the number of the PowerShell the script will run in. Each PowerShell this process
 * starts has a number one higher than the one before it, so a new number means a new PowerShell.
 * @typedef {string | ((program: number) => string)} AScriptForTheOneThatStays
 */

/** How long a script may run, and how much it may print, before it is a command that did not finish. */
const THE_LONGEST_A_SCRIPT_RUNS = 20_000
const THE_MOST_A_SCRIPT_PRINTS = 32 * 1024 * 1024

/**
 * The words a program that could not be run is said in, with the reason the command gave.
 * @param {string} program
 * @param {string} why
 * @returns {string}
 */
export function theProgramCouldNotBeRunWords(program, why) {
  return `${program} could not be run: ${why}`
}

/**
 * How long one script given to the PowerShell that stays took, and where the time went, in
 * milliseconds: waiting behind the scripts given before it, waiting for that PowerShell to start,
 * and from then until its answer. `scriptMs` is how long the script ran, as PowerShell measured it,
 * and null when no answer came.
 * @typedef {{ queuedMs: number, startingMs: number, ranMs: number, scriptMs: number | null }} TheTimeAScriptTook
 */

/**
 * What the PowerShell that stays did with one script: what `startPowerShell` answers, with the time.
 * @typedef {WhatACommandDid & { took: TheTimeAScriptTook }} WhatTheOneThatStaysDid
 */

/**
 * THE LOOP THE POWERSHELL THAT STAYS RUNS, after the UTF-8 line.
 *
 * It says `ready` on a line of its own once it is running. Then it reads one line at a time: a number,
 * a space and a script in UTF-8 base64. It runs the script in a scope of its own, so nothing the
 * script defines is left for the next one, except a type compiled with Add-Type, which stays loaded in
 * the program. The reading of who holds a connection compiles its calls once that way. It writes one
 * line back: JSON with the number, a status of 0, or 1 when the script threw, what the script wrote
 * and the text of what it threw. Each thing the script writes is a line of its own. When the input
 * closes, the loop ends and PowerShell exits. What the script writes to the error stream without
 * throwing goes to PowerShell's own error stream and is not in the answer. A script that calls `exit`,
 * or breaks out of a loop it is not in, would end this loop too. The one script it runs does neither.
 */
const THE_LOOP_THAT_STAYS = [
  "$ProgressPreference = 'SilentlyContinue'",
  '$utf8 = New-Object System.Text.UTF8Encoding $false',
  "[Console]::Out.WriteLine('ready')",
  '[Console]::Out.Flush()',
  'while ($true) {',
  '  $line = [Console]::In.ReadLine()',
  '  if ($null -eq $line) { break }',
  '  $clock = [System.Diagnostics.Stopwatch]::StartNew()',
  '  $n = $null',
  '  $status = 0',
  "  $out = ''",
  "  $err = ''",
  '  try {',
  "    $space = $line.IndexOf(' ')",
  '    $n = [int64]$line.Substring(0, $space)',
  '    $script = $utf8.GetString([Convert]::FromBase64String($line.Substring($space + 1)))',
  '    $out = @(& ([scriptblock]::Create($script)) | ForEach-Object { [string]$_ }) -join "`n"',
  '  } catch {',
  '    $status = 1',
  '    $err = [string]($_ | Out-String)',
  '  }',
  '  $answer = [ordered]@{ n = $n; status = $status; stdout = $out; stderr = $err; ms = $clock.ElapsedMilliseconds }',
  '  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $answer -Compress))',
  '  [Console]::Out.Flush()',
  '}',
].join('\n')

/**
 * A line as it is quoted in a reason: at most 200 characters.
 * @param {string} line
 * @returns {string}
 */
function quoted(line) {
  return JSON.stringify(line.length > 200 ? `${line.slice(0, 200)}…` : line)
}

/**
 * THE POWERSHELL THAT STAYS: one program, started at the first script and kept running, that runs
 * each script it is given in turn and answers each on a line of its own (`THE_LOOP_THAT_STAYS`).
 *
 * One script runs at a time, and a script given while another runs waits for its turn. A script given
 * as a function is made at its turn, after the program is started, so it is made knowing which program
 * runs it. A function that throws is answered as a script that did not run, with what it threw, and
 * the next script takes its turn. A script may run for `longest` milliseconds from its turn, and the
 * program may take as long to say it is ready.
 * A line that is not the answer to the script now running, numbered as that script was, is not taken
 * as any script's answer. Running longer, that line, printing more than `THE_MOST_A_SCRIPT_PRINTS`
 * bytes in one line, and the program ending all stop the program. Each is answered, to the script that
 * ran and to every script still waiting, as a command that did not run, with the reason. The next
 * script starts a new program.
 *
 * The program is not waited for when this process ends, and it is ended with this process. The
 * real one is `powershell.exe` with the loop; a test hands in a stand-in that answers the same way.
 * @param {string} program
 * @param {string[]} args
 * @param {number} [longest]
 * @returns {{ ask: (script: AScriptForTheOneThatStays) => Promise<WhatTheOneThatStaysDid>, stop: () => void }}
 */
export function aPowerShellThatStays(program, args, longest = THE_LONGEST_A_SCRIPT_RUNS) {
  /**
   * @typedef {{ script: AScriptForTheOneThatStays, askedAt: number, answer: (did: WhatTheOneThatStaysDid) => void }} AScript
   * @typedef {AScript & { n: number, sentAt: number, timer: ReturnType<typeof setTimeout> | null }} TheScriptThatRuns
   * @typedef {{ child: import('node:child_process').ChildProcessWithoutNullStreams, number: number, readyAt: number | null,
   *   heard: string, timer: ReturnType<typeof setTimeout> | null, onExit: () => void }} TheProgram
   */
  /** @type {AScript[]} */
  const waiting = []
  /** @type {TheScriptThatRuns | null} */
  let running = null
  /** @type {TheProgram | null} */
  let shell = null
  let given = 0
  /** How many programs have been started, so the next one's number is one more. */
  let started = 0

  /**
   * @param {AScript} one
   * @param {number | null} sentAt
   * @param {number | null} readyAt
   * @param {number | null} scriptMs
   * @returns {TheTimeAScriptTook}
   */
  const theTime = (one, sentAt, readyAt, scriptMs) => {
    const now = performance.now()
    const sent = sentAt ?? now
    const began = readyAt === null ? now : Math.max(sent, readyAt)
    return { queuedMs: sent - one.askedAt, startingMs: began - sent, ranMs: now - began, scriptMs }
  }

  /** @param {string} why */
  const end = (why) => {
    const ended = shell
    shell = null
    if (ended !== null) {
      if (ended.timer !== null) clearTimeout(ended.timer)
      process.off('exit', ended.onExit)
      if (ended.child.exitCode === null && ended.child.signalCode === null) ended.child.kill('SIGKILL')
    }
    const ran = running
    running = null
    if (ran !== null) {
      if (ran.timer !== null) clearTimeout(ran.timer)
      ran.answer({ command: program, ran: false, reason: why, took: theTime(ran, ran.sentAt, ended?.readyAt ?? null, null) })
    }
    for (const one of waiting.splice(0)) {
      one.answer({
        command: program,
        ran: false,
        reason: `${program} did not run this script, because it was stopped before its turn: ${why}`,
        took: theTime(one, null, null, null),
      })
    }
  }

  /** @param {TheScriptThatRuns} one */
  const timeTheScript = (one) => {
    one.timer = setTimeout(() => end(`${program} did not finish (stopped, because it ran longer than ${String(longest)} ms)`), longest)
  }

  /** @param {TheProgram} me @param {string} line */
  const said = (me, line) => {
    if (me.readyAt === null) {
      if (line !== 'ready') return end(`${program} did not start: it printed ${quoted(line)} where it says it is ready`)
      me.readyAt = performance.now()
      if (me.timer !== null) clearTimeout(me.timer)
      me.timer = null
      if (running !== null) timeTheScript(running)
      return
    }
    const one = running
    /** @type {unknown} */
    let answer = null
    try {
      answer = JSON.parse(line)
    } catch {
      // Not JSON, and so not an answer: refused below.
    }
    const a = /** @type {{ n?: unknown, status?: unknown, stdout?: unknown, stderr?: unknown, ms?: unknown } | null} */ (
      typeof answer === 'object' ? answer : null
    )
    if (
      one === null ||
      a === null ||
      a.n !== one.n ||
      typeof a.status !== 'number' ||
      typeof a.stdout !== 'string' ||
      typeof a.stderr !== 'string'
    ) {
      return end(`${program} did not finish (stopped, because it printed ${quoted(line)}, which is not the answer to the script it was running)`)
    }
    running = null
    if (one.timer !== null) clearTimeout(one.timer)
    const scriptMs = typeof a.ms === 'number' ? a.ms : null
    one.answer({ command: program, ran: true, status: a.status, stdout: a.stdout, stderr: a.stderr, took: theTime(one, one.sentAt, me.readyAt, scriptMs) })
    next()
  }

  /** @returns {TheProgram} */
  const start = () => {
    const child = spawn(program, args, { windowsHide: true })
    started += 1
    /** @type {TheProgram} */
    const me = { child, number: started, readyAt: null, heard: '', timer: null, onExit: () => child.kill('SIGKILL') }
    me.timer = setTimeout(() => {
      if (shell === me) end(`${program} did not finish (stopped, because it did not say it was ready within ${String(longest)} ms)`)
    }, longest)
    process.on('exit', me.onExit)
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (/** @type {string} */ chunk) => {
      if (shell !== me) return
      me.heard += chunk
      for (let at = me.heard.indexOf('\n'); at >= 0 && shell === me; at = me.heard.indexOf('\n')) {
        const line = me.heard.slice(0, at).replace(/\r$/u, '')
        me.heard = me.heard.slice(at + 1)
        said(me, line)
      }
      if (shell === me && me.heard.length > THE_MOST_A_SCRIPT_PRINTS) {
        end(`${program} did not finish (stopped, because it printed more than ${String(THE_MOST_A_SCRIPT_PRINTS)} bytes in one line)`)
      }
    })
    // Its own error stream is read and not kept, so that it never fills and stops the program.
    child.stderr.on('data', () => undefined)
    // A write to a program that has ended fails. Its close answers the script.
    child.stdin.on('error', () => undefined)
    child.once('error', (e) => {
      if (shell === me) end(theProgramCouldNotBeRunWords(program, e.message))
    })
    child.once('close', (status, signal) => {
      if (shell === me) end(`${program} ended (${status === null ? `killed by ${String(signal)}` : `exit code ${String(status)}`}) before it answered`)
    })
    // It never keeps this process running. A script that runs keeps it running by its own timer.
    child.unref()
    for (const pipe of [child.stdin, child.stdout, child.stderr]) /** @type {{ unref?: () => void }} */ (pipe).unref?.()
    return me
  }

  const next = () => {
    while (running === null) {
      const one = waiting.shift()
      if (one === undefined) return
      if (shell === null) shell = start()
      const me = shell
      /** @type {string} */
      let script
      try {
        script = typeof one.script === 'string' ? one.script : one.script(me.number)
      } catch (failed) {
        const why = failed instanceof Error ? failed.message : String(failed)
        one.answer({ command: program, ran: false, reason: `${program} did not run this script, because it could not be made: ${why}`, took: theTime(one, null, null, null) })
        continue
      }
      given += 1
      running = { ...one, n: given, sentAt: performance.now(), timer: null }
      if (me.readyAt !== null) timeTheScript(running)
      me.child.stdin.write(`${String(given)} ${Buffer.from(script, 'utf8').toString('base64')}\n`)
    }
  }

  return {
    ask(script) {
      return new Promise((answer) => {
        waiting.push({ script, askedAt: performance.now(), answer })
        next()
      })
    },
    stop() {
      end(`${program} was stopped`)
    },
  }
}

/**
 * The one PowerShell that stays in this process, started at the first script given to it.
 * @type {ReturnType<typeof aPowerShellThatStays> | null}
 */
let theOneThatStays = null

/**
 * The real `powershell.exe`. A missing program, a timeout and a killed process are all answered as
 * a command that did not run, so the caller can say why it could not look.
 * @returns {WindowsCommands}
 */
export function theRealWindowsCommands() {
  return {
    askThePowerShellThatStays(script) {
      if (theOneThatStays === null) theOneThatStays = aPowerShellThatStays(thePowerShellProgram(), thePowerShellArguments(THE_LOOP_THAT_STAYS))
      return theOneThatStays.ask(script)
    },
    powershell(script) {
      const program = thePowerShellProgram()
      const r = spawnSync(program, thePowerShellArguments(script), {
        encoding: 'utf8',
        timeout: THE_LONGEST_A_SCRIPT_RUNS,
        maxBuffer: THE_MOST_A_SCRIPT_PRINTS,
        windowsHide: true,
      })
      if (r.error) {
        return { command: program, ran: false, reason: theProgramCouldNotBeRunWords(program, r.error.message) }
      }
      if (r.status === null) {
        return { command: program, ran: false, reason: `${program} did not finish (killed by ${String(r.signal)})` }
      }
      return { command: program, ran: true, status: r.status, stdout: r.stdout, stderr: r.stderr }
    },
    startPowerShell(script) {
      const program = thePowerShellProgram()
      return new Promise((answer) => {
        const child = spawn(program, thePowerShellArguments(script), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
        /** @type {Buffer[]} */
        const out = []
        /** @type {Buffer[]} */
        const err = []
        let printed = 0
        /** @type {string | null} */
        let stopped = null
        const stop = (/** @type {string} */ why) => {
          if (stopped !== null) return
          stopped = why
          child.kill('SIGKILL')
        }
        const keep = (/** @type {Buffer[]} */ into) => (/** @type {Buffer} */ chunk) => {
          printed += chunk.length
          if (printed > THE_MOST_A_SCRIPT_PRINTS) stop(`printed more than ${String(THE_MOST_A_SCRIPT_PRINTS)} bytes`)
          else into.push(chunk)
        }
        child.stdout.on('data', keep(out))
        child.stderr.on('data', keep(err))
        const timer = setTimeout(() => stop(`ran longer than ${String(THE_LONGEST_A_SCRIPT_RUNS)} ms`), THE_LONGEST_A_SCRIPT_RUNS)
        // A program that cannot be started gives 'error' and may give 'close' after it; only the first is answered.
        let answered = false
        child.once('error', (e) => {
          if (answered) return
          answered = true
          clearTimeout(timer)
          answer({ command: program, ran: false, reason: theProgramCouldNotBeRunWords(program, e.message) })
        })
        child.once('close', (status, signal) => {
          if (answered) return
          answered = true
          clearTimeout(timer)
          if (stopped !== null) {
            answer({ command: program, ran: false, reason: `${program} did not finish (stopped, because it ${stopped})` })
          } else if (status === null) {
            answer({ command: program, ran: false, reason: `${program} did not finish (killed by ${String(signal)})` })
          } else {
            const stdout = Buffer.concat(out).toString('utf8')
            const stderr = Buffer.concat(err).toString('utf8')
            answer({ command: program, ran: true, status, stdout, stderr })
          }
        })
      })
    },
  }
}
